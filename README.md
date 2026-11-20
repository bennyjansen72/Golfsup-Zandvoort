# Zandvoort Golfsup

Web-app met de golfsup-voorspelling voor Zandvoort. Voorspelling van Open-Meteo (ECMWF en GFS), metingen en getij van Rijkswaterstaat, en Klodde: een eigen voorspelling die modellen, wind, getij en boeimetingen combineert.

## Bestanden

- `index.html`: de app
- `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`: maken er een installeerbare app van
- `scripts/rws_fetch.py`: haalt de metingen en het getij van Rijkswaterstaat op
- `.github/workflows/rws.yml`: draait dat script elk uur en zet het resultaat in `data/rws.json`

## Waarom een automatische taak?

Open-Meteo mag de app rechtstreeks aanroepen. Rijkswaterstaat staat dat vanaf een andere website niet toe, daarom haalt GitHub elk uur de metingen op en zet ze naast de app.

## Bronnen

- Open-Meteo, gratis voor niet-commercieel gebruik: https://open-meteo.com/
- Rijkswaterstaat Waterwebservices (open data)
