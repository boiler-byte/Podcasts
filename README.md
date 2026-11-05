# Podcasts v2 – Podcast HTML-App

Vanilla HTML, CSS und JavaScript. Favoriten, Episodencache und Wiedergabefortschritt werden lokal über IndexedDB gespeichert. Keine Anmeldung und kein API-Schlüssel.

## Starten

`index.html` im Browser öffnen. Alternativ (empfohlen, besonders für Browser mit Dateizugriffs-Einschränkungen) im App-Ordner einen lokalen Server starten:

```sh
python -m http.server 8000
```

Anschließend `http://localhost:8000` öffnen. Die Datei `podcasts-v2.html` (separater Download) enthält das Hero-Bild bereits eingebettet.

## Bedienung

- Pinker Kreis / Herz: **Favoriten**. Türkiser Kreis / Lupe+: **Entdecken**.
- In Entdecken nach Podcasts suchen und nach Thema, Land, Sortierung und Hörstatus filtern.
- Herz am Podcast: zu Favoriten hinzufügen / entfernen.
- Play am Podcast: zuletzt unterbrochene Folge fortsetzen, sonst eine neue Folge starten.
- Klick auf den Rest der Podcast-Kachel: Episodenliste öffnen. Dort Folgen gezielt abspielen.
- Player am unteren Rand: Pause/Play, ±15/30 Sek., Position und Tempo.
- Tastatur: `/` springt zur Suche, `Esc` schließt die Episodenliste.

## Technik / Grenzen

- Datenquellen: Apple Podcasts / iTunes Search API, Podcast-Charts und Podcast-Episodenabfrage. Für Suchen und Streams ist eine Internetverbindung erforderlich. Die öffentliche Schnittstelle stellt eine begrenzte Zahl aktueller Episoden bereit (bis zu 150 in dieser App).
- Audio-Streams werden direkt vom jeweiligen Herausgeber abgespielt. Einzelne Folgen können geografisch oder vom Browser geblockt werden; DRM/Bezahlepisoden sind nicht unterstützt.
- IndexedDB speichert **nur auf dem verwendeten Browser/Gerät und für den jeweiligen Ursprung**. Private/Inkognito-Sitzungen, Browserdatenlöschung, Dateipfadwechsel oder Domainwechsel können den Zugriff auf den lokalen Speicher beeinträchtigen.
- Es gibt keinen Server, kein Benutzerkonto, keine Synchronisierung und keinen Audio-Download.
- Podcast-Daten: Apple Podcasts. Podcasts steht in keiner Verbindung zu Apple.

## v2

- App-Name: **Podcasts**. Header und Abschnittsbeschreibungen entfallen.
- Die Hero-Navigation zeigt nur größere, transparente Neon-Icons mit Hover-Vergrößerung und pulsierendem Lichtschein.
- Der technische IndexedDB-Name bleibt absichtlich `podwave-library-v1`, um bereits gespeicherte Favoriten und Hörpositionen bei gleichem Browser-Ursprung nicht zu verlieren.
