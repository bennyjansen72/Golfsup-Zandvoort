# Zandvoort Golfsup

Web-app met de golfsup-voorspelling voor Zandvoort: https://bennyjansen72.github.io/Golfsup-Zandvoort/

Voorspelling van Open-Meteo (ECMWF en GFS), metingen en getij van Rijkswaterstaat, en Claude: een eigen voorspelling die modellen, wind, getij en boeimetingen combineert.

## Bestanden

- `index.html`: de hele app (opmaak, rekenwerk en weergave in één bestand)
- `manifest.webmanifest`, `sw.js`, iconen: maken er een installeerbare app van
- `bg.jpg`, `alert2.jpg`: achtergrondfoto en foto van de SUP ALERT
- `rws_fetch.py`: haalt de metingen en het getij van Rijkswaterstaat op
- `.github/workflows/rws.yml`: draait dat script elk kwartier en zet het resultaat in `data/rws.json`
- `CLAUDE.md`: alle keuzes en grenzen op een rij, zodat een nieuw gesprek met Claude meteen verder kan

## Waarom een automatische taak?

Open-Meteo mag de app rechtstreeks aanroepen. Rijkswaterstaat staat dat vanaf een andere website niet toe, daarom haalt GitHub elk kwartier de metingen op en zet ze naast de app.

## Na een wijziging

Verhoog het versienummer in `sw.js` (`golfsup-vNN`), anders blijft een geïnstalleerde app de oude versie tonen.

## Bronnen

- Open-Meteo, gratis voor niet-commercieel gebruik: https://open-meteo.com/
- Rijkswaterstaat Waterwebservices (open data)
