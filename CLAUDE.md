# Golfsup Zandvoort: projectnotities voor Claude

Lees dit eerst. Hierin staat waarom de app is zoals hij is, zodat je verder kunt zonder het oude gesprek. Antwoord in het Nederlands.

## Wat de app moet doen

Laten zien wanneer de golven bij Zandvoort goed zijn om te golfsuppen, met een SUP ALERT bovenaan voor het beste moment overdag.

- Live: https://bennyjansen72.github.io/Golfsup-Zandvoort/
- Repo: https://github.com/bennyjansen72/Golfsup-Zandvoort (GitHub Pages vanaf main)
- Claude-Project: "zandvoort golfsup", met een kopie van dit bestand als `claude/golfsup-app-projectnotities.md`. Houd beide gelijk.
- De gebruiker wil volledige controle over de app houden en altijd de nieuwste voorspelling zien (de oude wens "elke ochtend" is vervangen).
- Verversen: de app haalt de voorspelling van Open-Meteo zelf op bij het openen, elke 10 minuten zolang hij open staat, en opnieuw bij terugkomen na meer dan 5 minuten. Op de achtergrond doet een dichte web-app niets. ECMWF en GFS worden ongeveer vier keer per dag nieuw berekend, dus vaker ophalen geeft meestal dezelfde modelwaarden. De boeimetingen komen elk kwartier binnen (GitHub Actions) en sturen de Claude-voorspelling voor de komende uren bij.
- Bovenaan staat een link naar de live webcam van Reddingsbrigade Bloemendaal.

## Grenzen van de gebruiker (standaardwaarden in `index.html`, aanpasbaar in de app)

- Golfhoogte: goed vanaf 0,8 m (was eerst 0,5 m), mag tot 2 m of hoger.
- Wind in knopen, niet in Beaufort. Aflandig tot 16 kn, zij- of aanlandig tot 6 kn.
- Aflandig = wind uit 45° tot 155°, aanlandig = 245° tot 335°, de rest zijwaarts.
- Swellperiode vanaf 5,5 s.
- Score 0 tot 10: golfhoogte is de basis (0,7 m = 7 … vanaf 1 m = 10), wind boven de grens en een korte periode verlagen hem. Groen vanaf 7.
- SUP ALERT: Claude-score 7 of hoger, golf vanaf de alertgrens, tussen zonsopkomst en zonsondergang.

## Getij

- De push (2 uur voor hoogwater) geeft vaak betere golven: blauw in de tabel, +1 punt.
- Afgaand tij paars. De laatste 2 uur voor laagwater bij golven onder 1 m: -1 punt.
- Getij van Rijkswaterstaat voor IJmuiden; Zandvoort ligt ongeveer 10 minuten eerder.

## Bronnen

- Open-Meteo: golven ECMWF WAM en GFS Wave, wind ECMWF IFS en GFS, zontijden. Windy en Windfinder zijn bewust geschrapt.
- Rijkswaterstaat (via `rws_fetch.py` en GitHub Actions, want geen CORS): boeien IJmuiden Munitiestort 2 (referentie, gebruiker kijkt hier zelf altijd naar), Hollandse Kust West/Noord, K14, K13a, J6, L9, Eierlandse Gat, Europlatform; wind pier IJmuiden, buitenhaven, Hollandse Kust Noord, K14; astronomisch getij.
- De gebruiker wil dat boeien verder noordwest worden gebruikt om de afname van golfhoogte richting IJmuiden te leren en de voorspelling daarop te baseren. Dat zit nu in de "nowcast" (`NOWC`) en de kalibratie.
- Bij swell vindt de gebruiker naast hoogte ook periode, richting en energie belangrijk.

## Claude (de eigen voorspelling)

In de code heet het model nog `Klodde` (oude naam); op het scherm staat "Claude" via `mname()`. Drie lagen:
1. ECMWF en GFS gecorrigeerd voor wind (`KC`) en geschaald met de fout van de afgelopen 7 dagen bij Munitiestort 2 (`calibrate`).
2. Kleine getijfactor (`TF`).
3. Tot 3 uur na de laatste meting uit de boeien (`NOWC`), daarna aflopend tot 0 bij 12 uur.

## Werkafspraken

- Na elke wijziging het versienummer in `sw.js` ophogen.
- Pas pushen naar GitHub als de gebruiker akkoord geeft: de site wordt dan meteen bijgewerkt.
- De automatische taak zet de metingen elk kwartier op de branch `data` (één commit, force-push); main blijft schoon. De app leest `raw.githubusercontent.com/bennyjansen72/Golfsup-Zandvoort/data/rws.json`, met `data/rws.json` in main als reserve.
- Haal voor het pushen toch even de laatste versie op (`git pull --rebase`).

## Geschiedenis

- 20 nov 2026: app gebouwd als eigen web-app op GitHub; Windy losgelaten, Open-Meteo en Rijkswaterstaat als bronnen; alertgrens naar 0,8 m.
- 21 nov 2026: het oorspronkelijke bouwgesprek was per ongeluk verwijderd; de app zelf stond nog volledig op GitHub. Dit bestand gemaakt. Service worker bewaart rws.json niet meer bij elke verversing opnieuw, windtabel-fix, `__pycache__` weg, metingen naar de branch `data` (één commit) in plaats van elk kwartier een commit op main.
