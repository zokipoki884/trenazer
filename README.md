# Trenažer

Enostavna spletna aplikacija za vadbo na pametnem trenažerju (Bluetooth FTMS, ERG način) s srčnim utripom (BLE prsni pas/ura).

## Zagon lokalno
```powershell
python -m http.server 8080
```
Odpri http://localhost:8080 v Chrome. Za test brez naprav klikni **Simulator**.

## Uporaba na iPadu
Safari in Chrome na iPadu ne podpirata Web Bluetooth, zato uporabi brezplačni brskalnik **Bluefy – Web BLE Browser** (App Store).
Web Bluetooth zahteva HTTPS, zato aplikacijo objavi, npr. na GitHub Pages:
1. Ustvari repozitorij na GitHubu in vanj naloži vsebino te mape.
2. Settings → Pages → Source: `main` / root.
3. Naslov `https://<uporabnik>.github.io/<repo>/` odpri v Bluefy.

## Izvoz v Garmin Connect
Aplikacija med vožnjo vsako sekundo beleži moč, srčni utrip in kadenco (shrani se tudi ob osvežitvi strani).
Ob pavzi ali koncu klikni **Shrani vožnjo (.fit)**:
- na iPadu se odpre meni za deljenje → *Shrani v Datoteke*,
- drugje se datoteka prenese.

Nato na https://connect.garmin.com → ikona oblaka / *Uvozi podatke* → izberi .fit datoteko.
Vsak interval vaje je v Garminu svoj krog (lap).

## Struktura
- `js/ble/ftms.js` – trenažer (FTMS: moč, kadenca, Set Target Power; rezerva Cycling Power samo za branje)
- `js/ble/heartrate.js` – srčni utrip
- `js/ble/simulator.js` – lažne naprave
- `js/workout/model.js` – format vaje in izračuni; `samples.js` – vgrajene vaje
- `js/ui/chart.js`, `js/ui/zones.js` – graf in cone
- `js/fit/fit-encoder.js` – zapis vožnje v .fit (Garmin)
- `js/app.js` – glavna logika in prikaz

## Format vaje
Moč je delež FTP; `powerEnd` naredi rampo.
```js
{ id: 'x', name: 'Ime', steps: [ { name: 'Ogrevanje', duration: 600, power: 0.5, powerEnd: 0.7 }, ... ] }
```
