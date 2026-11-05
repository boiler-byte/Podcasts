# Podcasts v4 – installierbare Podcast-PWA

Die App besteht aus HTML, CSS und JavaScript (ohne Framework, Benutzerkonto oder eigenen Backendserver). Favoriten, Episodencache und Wiedergabefortschritt speichert sie lokal über IndexedDB.

## Lokal starten

Die PWA-Funktionen benötigen einen sicheren Ursprung (**HTTPS** oder **localhost**). Das direkte Öffnen von `index.html` über `file://` ist nur als einfache HTML-Seite möglich; dabei funktionieren Service Worker und Installation nicht.

Im entpackten App-Ordner einen lokalen Webserver starten:

```sh
python -m http.server 8000
```

Dann im Browser `http://localhost:8000/` öffnen. Für eine echte Installation auf anderen Geräten die **gesamten Dateien und Ordner** auf einer HTTPS-Webadresse bereitstellen, z. B. über ein statisches Webhosting. Die App funktioniert auch in Unterverzeichnissen, da Manifest, Service Worker und Assets relative URLs verwenden.

## Als App installieren

- **Chrome / Edge (Desktop/Android):** Die Seite öffnen und im Browsermenü **App installieren** / **Zum Startbildschirm hinzufügen** wählen (sofern angeboten).
- **Safari (iPhone/iPad):** Die HTTPS-Seite öffnen und über **Teilen → Zum Home-Bildschirm** hinzufügen.
- Die PWA startet dann im eigenen App-Fenster ohne normalen Browser-Tab. Das Manifest definiert den Namen **Podcasts**, die App-Icons und den dunklen Startbildschirm.

## Bedienung

- Pinkes Herz im Hero: **Favoriten**. Türkise Lupe: **Entdecken**.
- In Entdecken nach Podcasts suchen und nach Thema, Land, Sortierung und Hörstatus filtern.
- Herz an einer Podcast-Kachel: zu Favoriten hinzufügen oder entfernen.
- Play an einer Kachel: letzte Folge fortsetzen; Klick auf die übrige Kachel öffnet die Episodenliste.
- Player: Play-Symbol bei Pause, Pause-Symbol während der Wiedergabe; abgedunkeltes Podcast-Cover im Player und dezent im Seitenhintergrund, nur solange Audio läuft. Außerdem **15 Sekunden zurück**, **30 Sekunden vor**, Wiedergabeposition und Geschwindigkeit.
- Tastatur: `/` fokussiert die Suche, `Esc` schließt die Episodenliste.

## Offline-Verhalten und Datenspeicherung

- Der **Service Worker** legt beim ersten Online-Besuch die App-Oberfläche (HTML, CSS, JavaScript, Hero-Bild und Icons) in einem Version-4-Cache ab. Nach abgeschlossener Installation des Service Workers lässt sich die Oberfläche auch **offline erneut öffnen**.
- Bereits lokal gespeicherte **Favoriten, Hörpositionen und Episodenlisten** bleiben über IndexedDB verfügbar. Podcast-Cover von externen Servern werden nicht offline zwischengespeichert.
- **Suche, aktualisierte Podcastdaten und Audio-Streams benötigen weiterhin eine Internetverbindung.** Die PWA lädt weder Folgen automatisch herunter noch speichert sie Audiodateien offline.
- IndexedDB ist geräte- und ursprungsgebunden. Ein Browserwechsel, Domainwechsel oder das Löschen von Websitedaten kann den Zugriff auf gespeicherte Einträge verlieren lassen. Die Installation auf bestimmten Plattformen kann einen separaten App-Speicher verwenden.
- Der Datenbankname bleibt bewusst **`podwave-library-v1`**, damit v2-Favoriten und Wiedergabefortschritte bei gleichem Ursprung im Browser erhalten bleiben.

## Dateien

- `index.html`, `styles.css`, `app.js`: Oberfläche und Podcast-Player.
- `manifest.webmanifest`: Metadaten für PWA-Installation.
- `service-worker.js`: Versionierter Offline-Cache der lokalen App-Dateien.
- `icons/`: PWA-Icons (192/512 px), maskierbares Android-Icon, Apple-Touch-Icon, SVG-Favicon.
- `assets/hero.webp`: bestehendes Hero-Bild.

## Technik und Grenzen

Podcast-Katalog und Episoden kommen von Apple Podcasts / iTunes Search API und dem Apple-Podcast-Chart. Die App kann bis zu 150 verfügbare Episoden eines Podcasts abfragen. Streams werden direkt bei den jeweiligen Herausgebern geladen. Geografische Einschränkungen, Browserbeschränkungen und geschützte Inhalte können eine Wiedergabe verhindern. Es gibt keine Synchronisierung zwischen Geräten. **Podcasts** steht in keiner Verbindung zu Apple.

## Änderungen von v2 auf v3

1. Skip-Buttons: Pfeil und Sekundenangabe stehen nun **nebeneinander**, ohne Überlagerung.
2. Play/Pause: zentrierte SVG-Icons statt versetzter Textsymbole; Pause ist durch zwei breite, getrennte Balken deutlich erkennbar (auch in der Episodenliste).
3. Auf kleinen Displays besitzt der Player großzügige Touchflächen und eine eigenständige Zeile für die Transportsteuerung.
4. PWA: Manifest, Installations-Icons, Service Worker, Offline-App-Oberfläche und passende mobile Metadaten.

## Änderungen von v3 auf v4

1. Der Play/Pause-Button im Player verwendet eine **einheitliche Wiedergabestatus-Klasse**: Während der Wiedergabe ist nur das Pause-Symbol sichtbar, nach Pausieren nur das Play-Symbol. Die zugängliche Bezeichnung und der Button-Status werden ebenfalls aktualisiert.
2. Während eine Episode läuft, erscheint das **Podcast-Cover abgedunkelt als Hintergrund des Players** und als dezenter, weichgezeichneter Hintergrund der App. Wird pausiert, beendet oder der Player geschlossen, verschwindet das Hintergrundbild wieder.
3. Der Service Worker nutzt einen neuen **v4-Cache** und eine Online-zuerst-Strategie für lokale Ressourcen. Versionsparameter an JavaScript und CSS verhindern, dass die vorherige PWA-Version die alten Dateien weiterhin anzeigt.
4. IndexedDB-Name und Speicherformat bleiben unverändert. Favoriten und Wiedergabefortschritte werden bei gleichem Ursprung weiterverwendet.
