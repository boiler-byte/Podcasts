/* Podcasts v4 – Vanilla JavaScript / IndexedDB / Progressive Web App. */
(() => {
  'use strict';

  const DB_NAME = 'podwave-library-v1';
  const DB_VERSION = 1;
  const CHART_BASE = 'https://rss.marketingtools.apple.com/api/v2';
  const ITUNES_BASE = 'https://itunes.apple.com';
  const GENRES = [
    {id:'all',label:'Alle',term:''},
    {id:'news',label:'Nachrichten',term:'Nachrichten'},
    {id:'knowledge',label:'Wissen',term:'Wissen'},
    {id:'crime',label:'True Crime',term:'True Crime'},
    {id:'comedy',label:'Comedy',term:'Comedy'},
    {id:'tech',label:'Technologie',term:'Technologie'},
    {id:'society',label:'Gesellschaft',term:'Gesellschaft'},
    {id:'business',label:'Wirtschaft',term:'Wirtschaft'},
    {id:'history',label:'Geschichte',term:'Geschichte'},
    {id:'sport',label:'Sport',term:'Sport'}
  ];
  const state = {
    db:null, favorites:new Map(), progress:new Map(), episodeCache:new Map(),
    discover:[], view:'discover', selected:null, filter:{query:'',genre:'all',country:'de',sort:'popular',status:'all'},
    requestId:0, loadingDiscover:false, discoverError:false, busyPodcast:null, current:null, pendingResume:0,
    durationFallback:0, speed:1, lastSave:0, lastCardUpdate:0, toastTimer:null,
    drawerReturnFocus:null, openingId:0, drawerHistoryKey:null
  };
  const $ = id => document.getElementById(id);
  const audio = $('audio');
  const safe = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL = raw => { try {const u = new URL(String(raw));return ['https:','http:'].includes(u.protocol) ? u.href : '';} catch {return '';} };
  const imageURL = raw => safeURL(raw) || '';
  const icon = (name) => {
    const base='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const paths={
      play:'<path d="M8.3 5.15a1 1 0 0 1 1.53-.85l9.4 6.85a1.05 1.05 0 0 1 0 1.7l-9.4 6.85a1 1 0 0 1-1.53-.85V5.15Z" fill="currentColor" stroke="none"/>',
      pause:'<rect x="6.25" y="5" width="4.5" height="14" rx="1.1" fill="currentColor" stroke="none"/><rect x="13.25" y="5" width="4.5" height="14" rx="1.1" fill="currentColor" stroke="none"/>',
      heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
      spinner:'<path d="M12 3a9 9 0 1 1-9 9"/>',
      check:'<path d="m5 12 4 4L19 6"/>'
    };
    return `<svg ${base}>${paths[name] || paths.play}</svg>`;
  };
  const fmtTime = s => {
    if(!Number.isFinite(+s)||+s<0) return '0:00';
    const n=Math.floor(+s), h=Math.floor(n/3600),m=Math.floor(n%3600/60),sec=String(n%60).padStart(2,'0');
    return h ? `${h}:${String(m).padStart(2,'0')}:${sec}` : `${m}:${sec}`;
  };
  const fmtDuration = s => !s ? 'Dauer unbekannt' : (s>=3600 ? `${Math.round(s/60)} Min.` : `${Math.ceil(s/60)} Min.`);
  const fmtDate = iso => { if(!iso) return ''; const d=new Date(iso);return Number.isNaN(d.valueOf())?'':new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'short',year:'numeric'}).format(d);};
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  const roundPercent = rec => rec ? (rec.completed ? 100 : rec.duration>0 ? clamp(Math.round(rec.currentTime/rec.duration*100),0,99) : 0) : 0;
  const recordKey = (podcastId, episodeId) => `${podcastId}:${episodeId}`;

  function openDB(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)) return reject(Error('IndexedDB nicht unterstützt'));
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('favorites'))db.createObjectStore('favorites',{keyPath:'id'});
        if(!db.objectStoreNames.contains('progress'))db.createObjectStore('progress',{keyPath:'key'});
        if(!db.objectStoreNames.contains('episodes'))db.createObjectStore('episodes',{keyPath:'podcastId'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error || Error('Datenbankfehler'));
      req.onblocked=()=>reject(Error('Datenbank wird von einer anderen Sitzung verwendet'));
    });
  }
  function dbGetAll(store){return new Promise((resolve,reject)=>{if(!state.db)return resolve([]);const req=state.db.transaction(store,'readonly').objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  function dbGet(store,key){return new Promise((resolve,reject)=>{if(!state.db)return resolve(null);const req=state.db.transaction(store,'readonly').objectStore(store).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});}
  function dbWrite(store,method,value){return new Promise((resolve,reject)=>{if(!state.db)return resolve();const tx=state.db.transaction(store,'readwrite');tx.objectStore(store)[method](value);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Datenbank abgebrochen'));});}

  function normalizePodcast(r){
    const id=String(r.collectionId||r.trackId||r.id||'');
    const genres=(r.genres||[]).map(g=>typeof g==='string'?g:g.name).filter(Boolean);
    return {
      id,title:String(r.collectionName||r.trackName||r.name||'Unbenannter Podcast'),
      artist:String(r.artistName||'Unbekannter Anbieter'),genre:String(r.primaryGenreName||genres[0]||'Podcast'),genres,
      art:imageURL(r.artworkUrl600||r.artworkUrl100||r.artworkUrl512),
      appleUrl:safeURL(r.collectionViewUrl||r.trackViewUrl||r.url),
      releaseDate:r.releaseDate||'',addedAt:r.addedAt||Date.now()
    };
  }
  function normalizeEpisode(row,podcast){
    const id=String(row.trackId||row.episodeGuid||`${row.trackName}-${row.releaseDate}`);
    return {
      id,podcastId:podcast.id,title:String(row.trackName||'Episode ohne Titel'),
      url:safeURL(row.episodeUrl),duration:Math.round(Number(row.trackTimeMillis||0)/1000),
      releaseDate:row.releaseDate||'',description:String(row.description||row.shortDescription||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(),
      appleUrl:safeURL(row.trackViewUrl||podcast.appleUrl),art:imageURL(row.artworkUrl600||podcast.art)
    };
  }
  function progressForPodcast(id){
    const rows=Array.from(state.progress.values()).filter(p=>String(p.podcastId)===String(id));
    rows.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    return rows.find(p=>!p.completed && p.currentTime>1) || rows[0] || null;
  }
  function episodeProgress(podcastId,episodeId){return state.progress.get(recordKey(podcastId,episodeId));}
  function hasStartedPodcast(id){return Array.from(state.progress.values()).some(r=>String(r.podcastId)===String(id) && r.currentTime>0);}
  function episodeForCard(podcast){
    const rec=progressForPodcast(podcast.id);
    if(rec)return {title:rec.episodeTitle,record:rec};
    const recent=state.episodeCache.get(podcast.id)?.items?.[0];
    return recent?{title:recent.title,record:null}:{title:'Noch keine Episode gestartet',record:null};
  }

  function toast(text){
    const el=$('toast');el.textContent=text;el.classList.add('visible');
    clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove('visible'),3900);
  }
  function setView(view,scroll=false){
    state.view=view==='favorites'?'favorites':'discover';
    $('favoritesPanel').hidden=state.view!=='favorites';
    $('discoverPanel').hidden=state.view!=='discover';
    $('heroFavorites').classList.toggle('selected',state.view==='favorites');
    $('heroDiscover').classList.toggle('selected',state.view==='discover');
    $('heroFavorites').setAttribute('aria-pressed',String(state.view==='favorites'));
    $('heroDiscover').setAttribute('aria-pressed',String(state.view==='discover'));
    if(view==='favorites')renderFavorites();else renderDiscoverResults();
    if(scroll){$('main').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
  }
  function cardHTML(p){
    const fav=state.favorites.has(p.id);
    const info=episodeForCard(p);const pct=roundPercent(info.record);
    const listened=info.record&&info.record.currentTime>0;
    const status=info.record?.completed?'Abgeschlossen':listened?`${pct} % gehört`:'0 % gehört';
    const isBusy=state.busyPodcast===p.id;
    const isCurrent=state.current?.podcast.id===p.id && !audio.paused;
    const playLabel=isBusy?'Lädt…':isCurrent?'Pause':listened&&!info.record.completed?'Weiterhören':'Abspielen';
    return `<article class="podcast-card" data-podcast-id="${safe(p.id)}" aria-label="${safe(p.title)}">
      <button class="card-open" type="button" data-action="open" data-id="${safe(p.id)}" aria-label="Episoden von ${safe(p.title)} anzeigen">
        <img class="podcast-cover" src="${safe(p.art)}" alt="Cover: ${safe(p.title)}" loading="lazy" referrerpolicy="no-referrer">
        <span class="card-info"><span class="card-genre">${safe(p.genre)}</span><span class="card-title">${safe(p.title)}</span><span class="card-artist">${safe(p.artist)}</span></span>
      </button>
      <div class="card-detail" data-action="open" data-id="${safe(p.id)}">
        <div class="card-episode-label">${listened?'Zuletzt gehört':'Episode'}</div>
        <div class="card-episode-title ${!info.record&&!state.episodeCache.has(p.id)?'is-muted':''}">${safe(info.title)}</div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="card-bottom"><span class="card-progress-text">${status}</span>
          <div class="card-actions">
            <button class="heart-button ${fav?'is-favorite':''}" type="button" data-action="favorite" data-id="${safe(p.id)}" aria-label="${fav?'Aus Favoriten entfernen':'Zu Favoriten hinzufügen'}" aria-pressed="${fav}">${icon('heart')}</button>
            <button class="card-play ${isBusy?'loading':''}" type="button" data-action="play" data-id="${safe(p.id)}" aria-label="${safe(p.title)} ${safe(playLabel)}" ${isBusy?'disabled':''}>${icon(isBusy?'spinner':isCurrent?'pause':'play')}<span>${playLabel}</span></button>
          </div>
        </div>
      </div>
    </article>`;
  }
  function emptyState(heading,description,buttonText,action){return `<div class="empty-state"><div class="empty-symbol">♫</div><h3>${safe(heading)}</h3><p>${safe(description)}</p>${buttonText?`<button type="button" data-action="${safe(action)}">${safe(buttonText)}</button>`:''}</div>`;}
  function renderFavorites(){
    const list=Array.from(state.favorites.values()).sort((a,b)=>(progressForPodcast(b.id)?.updatedAt||b.addedAt||0)-(progressForPodcast(a.id)?.updatedAt||a.addedAt||0));
    $('favoriteSummary').textContent=`${list.length} Podcast${list.length===1?'':'s'} gespeichert`;
    $('favoritesGrid').innerHTML=list.length?list.map(cardHTML).join(''):emptyState('Noch keine Favoriten','Wechsle zu Entdecken, finde einen Podcast und tippe auf das Herz. Danach kannst du hier jederzeit weiterhören.','Podcasts entdecken','goto-discover');
  }
  function filteredDiscover(){
    let list=state.discover.slice();
    if(state.filter.status==='started')list=list.filter(p=>hasStartedPodcast(p.id));
    if(state.filter.status==='unheard')list=list.filter(p=>!hasStartedPodcast(p.id));
    if(state.filter.sort==='az')list.sort((a,b)=>a.title.localeCompare(b.title,'de'));
    if(state.filter.sort==='za')list.sort((a,b)=>b.title.localeCompare(a.title,'de'));
    return list;
  }
  function renderDiscoverResults(){
    if(state.loadingDiscover){$('discoverGrid').innerHTML=Array(6).fill('<div class="loading-card"><span class="shimmer"></span><span class="shimmer"></span><span class="shimmer"></span><span class="shimmer"></span></div>').join('');$('resultsCount').textContent='Wird geladen …';return;}
    if(state.discoverError){$('discoverGrid').innerHTML=emptyState('Podcast-Katalog nicht erreichbar','Bitte überprüfe deine Internetverbindung. Die Suche und Episoden benötigen Internet; gespeicherte Favoriten bleiben erhalten.','Erneut versuchen','retry-discover');$('resultsCount').textContent='Offline';return;}
    const list=filteredDiscover();
    $('resultsTitle').textContent=state.filter.query.trim()?`Suchergebnisse für „${state.filter.query.trim()}“`:state.filter.genre!=='all' ? `${GENRES.find(g=>g.id===state.filter.genre)?.label||'Podcasts'} entdecken`:'Beliebte Podcasts';
    $('resultsCount').textContent=`${list.length} Ergebnisse`;
    if(!list.length){$('discoverGrid').innerHTML=emptyState('Keine passenden Podcasts', 'Versuche einen anderen Suchbegriff, ein anderes Land oder setze die Filter zurück.','Filter zurücksetzen','reset-filters');return;}
    $('discoverGrid').innerHTML=list.map(cardHTML).join('');
  }
  function renderGenreButtons(){
    $('genreButtons').innerHTML=GENRES.map(g=>`<button type="button" class="category-button ${g.id===state.filter.genre?'active':''}" data-genre="${safe(g.id)}" aria-pressed="${g.id===state.filter.genre}">${safe(g.label)}</button>`).join('');
  }
  async function fetchJSON(url){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),14500);
    try{
      const res=await fetch(url,{signal:controller.signal,cache:'no-store'});
      if(!res.ok)throw Error(`HTTP ${res.status}`);
      return await res.json();
    }finally{clearTimeout(timer);}
  }
  async function discover(){
    const req=++state.requestId;
    state.loadingDiscover=true;state.discoverError=false;renderDiscoverResults();
    const country=state.filter.country;
    const genre=GENRES.find(g=>g.id===state.filter.genre)||GENRES[0];
    const term=[state.filter.query.trim(),genre.term].filter(Boolean).join(' ');
    try{
      let rows;
      if(term){
        const params=new URLSearchParams({term,country,media:'podcast',entity:'podcast',limit:'70'});
        const data=await fetchJSON(`${ITUNES_BASE}/search?${params}`);
        rows=data.results||[];
      }else{
        try{
          const data=await fetchJSON(`${CHART_BASE}/${country}/podcasts/top/50/podcasts.json`);
          rows=data?.feed?.results||[];
          if(!rows.length)throw Error('Charts leer');
        }catch(_){
          const params=new URLSearchParams({term:'Podcast',country,media:'podcast',entity:'podcast',limit:'60'});
          const data=await fetchJSON(`${ITUNES_BASE}/search?${params}`);
          rows=data.results||[];
        }
      }
      if(req!==state.requestId)return;
      const unique=new Set();
      state.discover=rows.map(normalizePodcast).filter(x=>x.id&&!unique.has(x.id)&&unique.add(x.id));
    }catch(error){
      if(req!==state.requestId)return;
      state.discover=[];state.discoverError=true;state.loadingDiscover=false;renderDiscoverResults();return;
    }
    if(req!==state.requestId)return;
    state.loadingDiscover=false;renderDiscoverResults();
  }
  async function getEpisodes(podcast,force=false){
    const mem=state.episodeCache.get(podcast.id);
    if(!force&&mem&&Date.now()-mem.fetchedAt<6*60*60*1000)return mem.items;
    const saved=await dbGet('episodes',podcast.id);
    if(!force&&saved){
      state.episodeCache.set(podcast.id,saved);
      if(Date.now()-saved.fetchedAt<6*60*60*1000)return saved.items;
    }
    try{
      const params=new URLSearchParams({id:podcast.id,country:state.filter.country,entity:'podcastEpisode',limit:'150'});
      const payload=await fetchJSON(`${ITUNES_BASE}/lookup?${params}`);
      const items=(payload.results||[]).filter(r=>r.wrapperType==='podcastEpisode'||r.kind==='podcast-episode').map(r=>normalizeEpisode(r,podcast));
      items.sort((a,b)=>new Date(b.releaseDate||0)-new Date(a.releaseDate||0));
      const entry={podcastId:podcast.id,items,fetchedAt:Date.now()};
      state.episodeCache.set(podcast.id,entry);
      dbWrite('episodes','put',entry).catch(()=>{});
      return items;
    }catch(error){
      if(saved)return saved.items;
      if(mem)return mem.items;
      throw error;
    }
  }
  function getPodcast(id){return state.favorites.get(String(id))||state.discover.find(x=>x.id===String(id))||null;}
  async function toggleFavorite(podcast){
    if(!podcast)return;
    if(!state.db){toast('IndexedDB nicht verfügbar. Favoriten können nicht gespeichert werden.');return;}
    try{
      if(state.favorites.has(podcast.id)){
        await dbWrite('favorites','delete',podcast.id);
        state.favorites.delete(podcast.id);
        toast('Aus den Favoriten entfernt');
      }else{
        const value={...podcast,addedAt:Date.now()};
        await dbWrite('favorites','put',value);
        state.favorites.set(podcast.id,value);
        toast('Zu Favoriten hinzugefügt');
      }
      renderFavorites();renderDiscoverResults();
      if(state.selected?.id===podcast.id)renderDrawerHeader(podcast);
    }catch(error){toast('Favorit konnte nicht gespeichert werden. Browser-Speicher prüfen.');}
  }
  async function playFromCard(podcast){
    if(!podcast||state.busyPodcast)return;
    if(state.current?.podcast.id===podcast.id && !audio.paused){audio.pause();return;}
    if(state.current?.podcast.id===podcast.id && audio.paused && !audio.ended && state.current.episode.url){await resumeAudio();return;}
    state.busyPodcast=podcast.id;renderFavorites();renderDiscoverResults();
    try{
      const episodes=await getEpisodes(podcast);
      const last=progressForPodcast(podcast.id);
      let episode=null;
      if(last&&!last.completed){
        episode=episodes.find(x=>String(x.id)===String(last.episodeId));
        if(!episode && last.episodeUrl)episode={id:last.episodeId,podcastId:podcast.id,title:last.episodeTitle,url:safeURL(last.episodeUrl),duration:last.duration||0,releaseDate:last.releaseDate||'',description:'',art:podcast.art};
      }
      if(!episode)episode=episodes.find(x=>x.url&&!episodeProgress(podcast.id,x.id)?.completed)||episodes.find(x=>x.url);
      if(!episode)throw Error('Keine abspielbaren Folgen');
      await playEpisode(podcast,episode);
    }catch(error){toast('Keine abspielbare Episode verfügbar. Bitte Episodenliste prüfen.');}
    finally{state.busyPodcast=null;renderFavorites();renderDiscoverResults();}
  }
  function persistCurrent(force=false,finished=false){
    if(!state.current)return;
    const {podcast,episode}=state.current;
    const now=Date.now(),duration=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:episode.duration||0;
    const currentTime=finished?duration:audio.currentTime||0;
    const key=recordKey(podcast.id,episode.id);
    const existing=state.progress.get(key);
    const record={key,podcastId:podcast.id,podcastTitle:podcast.title,episodeId:episode.id,episodeTitle:episode.title,episodeUrl:episode.url,
      currentTime,duration,completed:finished || (!audio.ended && existing?.completed && currentTime===0 ? false : duration>1 && currentTime>=duration-3),
      releaseDate:episode.releaseDate,updatedAt:now};
    if(record.completed && currentTime<duration-3)record.completed=false;
    state.progress.set(key,record);
    if(force||now-state.lastSave>4000){state.lastSave=now;dbWrite('progress','put',record).catch(()=>{});}
    if(now-state.lastCardUpdate>7000){state.lastCardUpdate=now;updateCardProgress(podcast.id,record);}
  }
  function updateCardProgress(id,record){
    document.querySelectorAll('.podcast-card').forEach(card=>{
      if(card.dataset.podcastId!==String(id))return;
      const bar=card.querySelector('.progress-fill'),label=card.querySelector('.card-progress-text'),title=card.querySelector('.card-episode-title');
      if(bar)bar.style.width=`${roundPercent(record)}%`;
      if(label)label.textContent=record.completed?'Abgeschlossen':`${roundPercent(record)} % gehört`;
      if(title){title.textContent=record.episodeTitle;title.classList.remove('is-muted');}
    });
  }
  async function playEpisode(podcast,episode){
    if(!episode.url){toast('Für diese Episode ist kein Audio-Link verfügbar.');return;}
    if(state.current){persistCurrent(true);audio.pause();}
    const rec=episodeProgress(podcast.id,episode.id);
    state.current={podcast,episode};state.pendingResume=rec&&!rec.completed?Math.max(0,rec.currentTime||0):0;
    state.durationFallback=episode.duration;state.lastSave=0;
    $('player').hidden=false;$('playerArt').src=episode.art||podcast.art||'';
    $('playerArt').alt=`Cover: ${podcast.title}`;
    // Always use the podcast's own cover for the darkened playing backgrounds.
    const cover=podcast.art||episode.art||'';
    $('playerBackgroundArt').src=cover;
    $('nowPlayingBackgroundArt').src=cover;
    $('playerPodcast').textContent=podcast.title;$('playerEpisode').textContent=episode.title;
    audio.src=episode.url;audio.playbackRate=state.speed;
    audio.load();updatePlayerUI();
    if(state.selected?.id===podcast.id)renderEpisodeList(podcast);
    renderFavorites();renderDiscoverResults();
    await resumeAudio();
  }
  async function resumeAudio(){
    try{await audio.play();updatePlayerUI();}
    catch(error){updatePlayerUI();toast('Zum Starten bitte im Player auf Play tippen. Der Browser verhindert möglicherweise den Autostart.');}
  }
  function updatePlayerUI(){
    if(!state.current)return;
    const duration=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:state.durationFallback;
    const current=Number.isFinite(audio.currentTime)?audio.currentTime:0;
    const percent=duration>0?clamp(current/duration*100,0,100):0;
    $('currentTime').textContent=fmtTime(current);$('totalTime').textContent=fmtTime(duration);
    $('seekBar').value=String(Math.round(percent*10));$('seekBar').style.setProperty('--seek-percent',`${percent}%`);
    $('playerProgress').style.width=`${percent}%`;
    // A single is-playing state drives both icons and the cover backgrounds.
    const playing=!audio.paused&&!audio.ended;
    $('player').classList.toggle('is-playing',playing);
    document.body.classList.toggle('is-playing',playing);
    $('playerToggle').classList.toggle('playing',playing);
    $('playerToggle').setAttribute('aria-label',playing?'Pausieren':'Abspielen');
    $('playerToggle').setAttribute('title',playing?'Pausieren':'Abspielen');
    $('playerToggle').setAttribute('aria-pressed',String(playing));
    $('speedButton').textContent=`${String(state.speed).replace('.',',')}×`;
  }
  function renderDrawerHeader(podcast){
    const fav=state.favorites.has(podcast.id);
    $('drawerShow').innerHTML=`<img class="drawer-cover" src="${safe(podcast.art)}" alt="Cover: ${safe(podcast.title)}"><div class="drawer-show-copy"><span class="card-genre">${safe(podcast.genre)}</span><h2 id="drawerTitle">${safe(podcast.title)}</h2><p>${safe(podcast.artist)}</p><div class="drawer-show-actions"><button type="button" class="drawer-heart" data-action="favorite" data-id="${safe(podcast.id)}">${fav?'♥ In Favoriten':'♡ Zu Favoriten'}</button>${podcast.appleUrl?`<a href="${safe(podcast.appleUrl)}" target="_blank" rel="noopener noreferrer">Bei Apple Podcasts ↗</a>`:''}</div></div>`;
  }
  function renderEpisodeList(podcast){
    const episodes=state.episodeCache.get(podcast.id)?.items;
    if(!episodes){$('episodeList').innerHTML='<div class="drawer-loading">Episoden werden geladen …</div>';return;}
    if(!episodes.length){$('episodeList').innerHTML='<div class="drawer-no-episodes">Für diesen Podcast wurden keine Episoden gefunden. Eventuell sind sie derzeit nicht öffentlich abrufbar.</div>';return;}
    $('episodeList').innerHTML=episodes.map((e,i)=>{
      const progress=episodeProgress(podcast.id,e.id),pct=roundPercent(progress);
      const playing=state.current?.podcast.id===podcast.id&&state.current?.episode.id===e.id&&!audio.paused;
      const desc=e.description.length>180?`${e.description.slice(0,178)}…`:e.description;
      return `<div class="episode-item"><span class="episode-number">${String(i+1).padStart(2,'0')}</span><div class="episode-body"><h4 class="episode-title">${safe(e.title)}</h4><div class="episode-date"><span>${safe(fmtDate(e.releaseDate))}</span><span>${safe(fmtDuration(e.duration))}</span></div>${desc?`<p class="episode-desc">${safe(desc)}</p>`:''}${progress&&progress.currentTime>0?`<div class="episode-progress-row"><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><span>${progress.completed?'Gehört':`${pct} %`}</span></div>`:''}</div><button class="episode-play ${playing?'is-playing':''}" type="button" data-action="episode-play" data-episode="${safe(e.id)}" aria-label="${safe(e.title)} ${playing?'pausieren':'abspielen'}" ${e.url?'':'disabled'}>${icon(playing?'pause':'play')}</button></div>`;
    }).join('');
  }
  async function openDrawer(podcast){
    if(!podcast)return;
    const token=++state.openingId;
    // Each opened episode list gets one history entry, so browser Back closes it.
    // Replacing an already open list does not stack additional drawer entries.
    if(!state.drawerHistoryKey){
      state.drawerHistoryKey=`${Date.now()}-${++state.openingId}`;
      history.pushState({...history.state, podcastDrawerKey:state.drawerHistoryKey},'');
    }
    state.selected=podcast;state.drawerReturnFocus=document.activeElement;
    $('drawerBackdrop').hidden=false;$('detailDrawer').hidden=false;$('detailDrawer').setAttribute('aria-hidden','false');
    document.body.classList.add('no-scroll');renderDrawerHeader(podcast);
    $('episodeList').innerHTML='<div class="drawer-loading">Episoden werden geladen …</div>';
    $('drawerClose').focus();
    try{await getEpisodes(podcast);if(token!==state.openingId)return;renderEpisodeList(podcast);renderFavorites();renderDiscoverResults();}
    catch(error){if(token===state.openingId){$('episodeList').innerHTML='<div class="drawer-no-episodes">Episoden konnten nicht geladen werden. Prüfe deine Internetverbindung und versuche es über „Aktualisieren“ erneut.</div>';}}
  }
  function closeDrawer(fromHistory=false){
    if(!state.selected)return;
    const drawerKey=state.drawerHistoryKey;
    state.drawerHistoryKey=null;
    // Explicit close (X, backdrop, Escape) removes the same entry used by Back.
    if(!fromHistory && drawerKey && history.state?.podcastDrawerKey===drawerKey)history.back();
    state.openingId++;state.selected=null;$('drawerBackdrop').hidden=true;$('detailDrawer').hidden=true;
    $('detailDrawer').setAttribute('aria-hidden','true');document.body.classList.remove('no-scroll');
    if(state.drawerReturnFocus&&state.drawerReturnFocus.isConnected)state.drawerReturnFocus.focus();
  }
  function resetFilters(){
    state.filter={query:'',genre:'all',country:'de',sort:'popular',status:'all'};
    $('searchInput').value='';$('countryFilter').value='de';$('sortFilter').value='popular';$('statusFilter').value='all';
    renderGenreButtons();discover();
  }
  function handleCardClick(event){
    const button=event.target.closest('[data-action]');
    if(!button)return;
    const action=button.dataset.action;
    if(action==='goto-discover'){setView('discover',true);return;}
    if(action==='reset-filters'){resetFilters();return;}
    if(action==='retry-discover'){discover();return;}
    const podcast=getPodcast(button.dataset.id);
    if(action==='open')openDrawer(podcast);
    if(action==='favorite')toggleFavorite(podcast);
    if(action==='play')playFromCard(podcast);
    if(action==='episode-play'&&state.selected){
      const ep=state.episodeCache.get(state.selected.id)?.items.find(x=>x.id===button.dataset.episode);
      if(!ep)return;
      if(state.current?.podcast.id===state.selected.id&&state.current?.episode.id===ep.id&&!audio.paused){audio.pause();renderEpisodeList(state.selected);}
      else if(state.current?.podcast.id===state.selected.id&&state.current?.episode.id===ep.id){resumeAudio();}
      else playEpisode(state.selected,ep);
    }
  }
  function bindEvents(){
    document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view,true)));
    $('genreButtons').addEventListener('click',e=>{
      const btn=e.target.closest('[data-genre]');if(!btn)return;
      state.filter.genre=btn.dataset.genre;renderGenreButtons();discover();
    });
    let searchTimer;
    $('searchInput').addEventListener('input',e=>{
      state.filter.query=e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(discover,460);
    });
    $('countryFilter').addEventListener('change',e=>{state.filter.country=e.target.value;discover();});
    $('sortFilter').addEventListener('change',e=>{state.filter.sort=e.target.value;renderDiscoverResults();});
    $('statusFilter').addEventListener('change',e=>{state.filter.status=e.target.value;renderDiscoverResults();});
    $('resetFilters').addEventListener('click',resetFilters);
    $('favoritesGrid').addEventListener('click',handleCardClick);
    $('discoverGrid').addEventListener('click',handleCardClick);
    $('drawerShow').addEventListener('click',handleCardClick);
    $('episodeList').addEventListener('click',handleCardClick);
    $('drawerClose').addEventListener('click',()=>closeDrawer());
    $('drawerBackdrop').addEventListener('click',()=>closeDrawer());
    window.addEventListener('popstate',()=>{
      if(state.selected)closeDrawer(true);
    });
    $('refreshEpisodes').addEventListener('click',async()=>{
      if(!state.selected)return;
      const p=state.selected;
      $('episodeList').innerHTML='<div class="drawer-loading">Episoden werden aktualisiert …</div>';
      try{await getEpisodes(p,true);if(state.selected?.id===p.id)renderEpisodeList(p);}
      catch(e){$('episodeList').innerHTML='<div class="drawer-no-episodes">Aktualisierung nicht möglich. Bitte Internetverbindung prüfen.</div>';}
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&!$('detailDrawer').hidden)closeDrawer();
      if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&$('detailDrawer').hidden){e.preventDefault();setView('discover');$('searchInput').focus();}
    });
    $('playerToggle').addEventListener('click',()=>audio.paused?resumeAudio():audio.pause());
    $('skipBack').addEventListener('click',()=>{if(state.current)audio.currentTime=Math.max(0,audio.currentTime-15);});
    $('skipForward').addEventListener('click',()=>{if(state.current)audio.currentTime=Math.min(Number.isFinite(audio.duration)?audio.duration:1e12,audio.currentTime+30);});
    $('seekBar').addEventListener('input',e=>{if(!state.current)return;const d=Number.isFinite(audio.duration)?audio.duration:state.durationFallback;if(d>0){audio.currentTime=d*Number(e.target.value)/1000;updatePlayerUI();persistCurrent(true);}});
    $('speedButton').addEventListener('click',()=>{const speeds=[1,1.25,1.5,2];state.speed=speeds[(speeds.indexOf(state.speed)+1)%speeds.length];audio.playbackRate=state.speed;updatePlayerUI();});
    $('playerClose').addEventListener('click',()=>{persistCurrent(true);audio.pause();audio.removeAttribute('src');audio.load();state.current=null;$('player').hidden=true;$('player').classList.remove('is-playing');document.body.classList.remove('is-playing');renderFavorites();renderDiscoverResults();});
    audio.addEventListener('loadedmetadata',()=>{
      const d=audio.duration;
      if(state.pendingResume>1 && Number.isFinite(d) && d>0){audio.currentTime=Math.min(state.pendingResume,Math.max(0,d-2));}
      state.pendingResume=0;updatePlayerUI();
    });
    audio.addEventListener('timeupdate',()=>{if(!state.current)return;updatePlayerUI();persistCurrent();});
    audio.addEventListener('play',()=>{updatePlayerUI();renderFavorites();renderDiscoverResults();if(state.selected)renderEpisodeList(state.selected);});
    audio.addEventListener('playing',updatePlayerUI);
    audio.addEventListener('pause',()=>{if(state.current){persistCurrent(true);updatePlayerUI();renderFavorites();renderDiscoverResults();if(state.selected)renderEpisodeList(state.selected);}});
    audio.addEventListener('ended',()=>{if(state.current){persistCurrent(true,true);updatePlayerUI();renderFavorites();renderDiscoverResults();if(state.selected)renderEpisodeList(state.selected);}});
    audio.addEventListener('error',()=>{if(state.current){audio.pause();updatePlayerUI();if(audio.error?.code===4)toast('Audioformat oder Stream nicht unterstützt. Andere Episode versuchen.');}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)persistCurrent(true);});
    window.addEventListener('pagehide',()=>persistCurrent(true));
  }
  async function init(){
    $('year').textContent=String(new Date().getFullYear());renderGenreButtons();bindEvents();
    try{
      state.db=await openDB();
      const [favorites,progress]=await Promise.all([dbGetAll('favorites'),dbGetAll('progress')]);
      favorites.forEach(p=>state.favorites.set(String(p.id),p));progress.forEach(p=>state.progress.set(p.key,p));
    }catch(e){toast('IndexedDB ist nicht verfügbar. Favoriten und Fortschritt können nicht dauerhaft gespeichert werden.');}
    renderFavorites();setView(state.favorites.size?'favorites':'discover');discover();
  }
  // Service Worker only runs from HTTPS or localhost (never from file://).
  // It caches the application shell, not third-party podcasts or audio streams.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js', {scope:'./'})
        .catch(error => console.warn('PWA-Service-Worker konnte nicht registriert werden:', error));
    });
  }
  init();
})();
