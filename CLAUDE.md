# Golfsup Zandvoort: projectnotities voor Claude

Lees dit eerst. Hierin staat waarom de app is zoals hij is, zodat je verder kunt zonder het oude gesprek. Antwoord in het Nederlands.

## Wat de app moet doen

Laten zien wanneer de golven bij Zandvoort goed zijn om te golfsuppen, met een SUP ALERT bovenaan voor het beste moment overdag.

- Live: https://bennyjansen72.github.io/Golfsup-Zandvoort/
- Repo: https://github.com/bennyjansen72/Golfsup-Zandvoort (GitHub Pages vanaf main)
- Claude-Project: "zandvoort golfsup", met een kopie van dit bestand als `claude/golfsup-app-projectnotities.md`. Houd beide gelijk.
- De gebruiker wil volledige controle over de app houden en altijd de nieuwste voorspelling zien (de oude wens "elke ochtend" is vervangen).
- Rekenkern: alle voorspellingslogica (bouwen uit Open-Meteo, kalibratie, nowcast, getijfactor, score, alert-blokken) staat in `engine.js` en wordt gedeeld door de app en de GitHub-taak (`forecast_job.js`, Node). Pas de voorspelling alleen daar aan. In `index.html` staan alleen weergave en bediening.
- Klaargezette voorspelling (26 nov): de GitHub-taak rekent elk kwartier de voorspelling uit en zet `forecast.json` op de branch `data`. De app laadt die plus `rws.json` (2 bestanden in plaats van 6). Is `forecast.json` ouder dan 150 minuten (GitHub draait de geplande taak in de praktijk ongeveer elk uur, niet elk kwartier) of niet bereikbaar, dan haalt de app zelf alles bij Open-Meteo en rekent zelf (oude manier). In de kopregel staat dan "Voorspelling berekend om …" of "Voorspelling Open-Meteo opgehaald om …".
- Verversen: de app haalt de voorspelling op bij het openen, elke 10 minuten zolang hij open staat, en opnieuw bij terugkomen na meer dan 5 minuten. Op de achtergrond doet een dichte web-app niets. ECMWF en GFS worden ongeveer vier keer per dag nieuw berekend, dus vaker ophalen geeft meestal dezelfde modelwaarden. De boeimetingen komen elk kwartier binnen (GitHub Actions) en sturen de Claude-voorspelling voor de komende uren bij.
- Bovenaan staan links naar de live webcams, in deze volgorde: Reddingsbrigade Bloemendaal, Surfweer.nl Zandvoort, Surfweer.nl Alohacam Wijk aan Zee.
- Opbouw van de golven: blok onder "Nu gemeten" met de laatste 10-minutenmeting van Munitiestort 2: Hmax, H1/50, H1/10, H1/3, deining (HTE3) als balkjes, periodes (Tm02, T1/3, piek uit Fp, Tmax), aandeel windzee/deining (energie = hoogte²), en richting (Th0) en watertemperatuur (T) als die er zijn. Schatting met ≈: gemiddelde golf = 0,63 × H1/3. Het aantal golven staat er op verzoek niet meer in (21 nov). Rijkswaterstaat publiceert geen gemiddelde of laagste golf. Fp komt binnen als 140 bij eenheid Hz en is in werkelijkheid mHz (0,14 Hz).
- "Nu gemeten" toont Golf, Wind en Weer; de tegel "Grootste golf" is op verzoek weg (26 nov). Hmax staat nog wel in "Opbouw van de golven".
- Dagweergave (26 nov, telefoonvriendelijk): per dag dicht een kleurenbalk met de Claude-score per daglichtuur en een label "beste X om HH:00"; open een regel per uur met scorevak (grijs 0–3, geel 4–6, groen 7, donkergroen 8–10), golf + periode met balkje en streepje bij de alertgrens, windvakje (blauw/oranje/rood, af/zij/aan) en weer; getij als gekleurde rand links (blauw push, paars afgaand/laag), HW/LW en zon bij het uur. De oude modeltabel zit inklapbaar onder "Alle modellen vergelijken (tabel)". Die tabel is telefoonvriendelijk (26 nov): groepskoppen met uitleg (Zon, getij en stroming / Score en weer / Golf richting strand / Wind in knopen), korte rijlabels met gekleurde modelstip (ECMWF blauw, GFS oranje, Claude groen), smalle kolommen (44 px, ~4,5 uur in beeld), scorevakken in dezelfde kleuren als de dagweergave, golfvakken met een balkje tot 2 m, huidig uur omlijnd. Sinds 27 nov staat alle golfinformatie in één groep "Golven" met tussenkopjes: Hoogte richting strand (ECMWF, GFS, Claude), Deining (GFS-voorspelling, lichtblauw vanaf 9 s; meting: hoogte HTE3 Munitiestort 2, richting Th3 K13a/Eierlandse Gat, alleen voorbije uren), Richting (ECMWF, GFS), Energie (Claude). Volgorde groepen: Score en weer, Golven, Wind, Zon/getij/stroming. De tabel staat op een eigen effen vlak (leesbaar boven de foto). Tik op de SUP ALERT springt naar het uur.
- Golfrichting (27 nov, wens gebruiker: "niet verzonnen, de echte richting; als je het niet weet is dat ook goed"): Munitiestort 2 levert geen richting (Th0 komt leeg binnen). Nu gemeten toont de gemeten richting van de deining (RWS Th3 = gemiddelde richting tussen 30 en 100 mHz, dus golven van 10–33 s, waar ze vandaan komen) van boei K13a, anders Eierlandse Gat, met de boeinaam; anders "richting niet gemeten". In de alertbanner en bij elk uur de golfrichting van ECMWF (`wave_direction`) en bij deining die van GFS (`swell_wave_direction`), met de modelnaam erbij. Bron Th0/Th3: RWS Standaard hydrologische en meteorologische gegevens (Th0 30–500 mHz, Th3 30–100 mHz).
- Op verzoek van de gebruiker niet (meer) in de app: de tabel "Wind gemeten en voorspeld", "Hoe goed klopt het?" en "Bronnen en werkwijze" (21 nov). De kalibratie draait nog wel op de achtergrond voor Claude.
- Weer: "Nu gemeten" heeft een tegel Weer (icoon, temperatuur, gevoelstemperatuur) uit de actuele modelwaarde van Open-Meteo voor Zandvoort (`current`, geen meting). In de scoreregels van ECMWF, GFS en Claude staan per uur een weericoon en de temperatuur (Open-Meteo `temperature_2m`, `weather_code`, `is_day`). Claude: gemiddelde temperatuur van beide modellen; als het weer verschilt het nattere/slechtere weer (`wxRank`).

## Grenzen van de gebruiker (standaardwaarden in `index.html`, aanpasbaar in de app)

- Golfhoogte: goed vanaf 0,8 m (was eerst 0,5 m), mag tot 2 m of hoger.
- Wind in knopen, niet in Beaufort. Aflandig tot 16 kn, zij- of aanlandig tot 6 kn.
- Aflandig = wind uit 55° tot 165° (26 nov aangepast aan de kustlijn bij Zandvoort, normaal 290°; was 45°–155°), aanlandig = 245° tot 335°, de rest zijwaarts.
- Swellperiode vanaf 5,5 s.
- Score 0 tot 10: golfhoogte is de basis (0,7 m = 7 … vanaf 1 m = 10), wind boven de grens en een korte periode verlagen hem. Groen vanaf 7.
- SUP ALERT: Claude-score 7 of hoger, golf vanaf de alertgrens, tussen zonsopkomst en zonsondergang.

## Getij

- De push (2 uur voor hoogwater) geeft vaak betere golven: blauw in de tabel, +1 punt.
- Afgaand tij paars. De laatste 2 uur voor laagwater bij golven onder 1 m: -1 punt.
- Getij van Rijkswaterstaat voor IJmuiden; Zandvoort ligt ongeveer 10 minuten eerder.
- Rij "Stroming" in de dagtabellen (onder Getij): getijdestroom bij Zandvoort uit Open-Meteo `ocean_current_velocity`/`ocean_current_direction` (Météo-France SMOC, ~8 km, inclusief getij, wind en golven; richting = waarheen). Doorlopende curve van de stroom langs de kust (kust ≈ 20°): boven de lijn noordwaarts (vloed), onder zuidwaarts (eb); per uur een pijl en de snelheid in kn (`curAlong`, `curAt`, `curSvg`).

## Bronnen

- Open-Meteo: golven ECMWF WAM en GFS Wave, wind ECMWF IFS en GFS, zontijden. Windy en Windfinder zijn bewust geschrapt.
- Rijkswaterstaat (via `rws_fetch.py` en GitHub Actions, want geen CORS): boeien IJmuiden Munitiestort 2 (referentie, gebruiker kijkt hier zelf altijd naar), Hollandse Kust West/Noord, K14, K13a, J6, L9, Eierlandse Gat, Europlatform; wind pier IJmuiden, buitenhaven, Hollandse Kust Noord, K14; astronomisch getij.
- Piekperiode (uit Fp, in mHz of Hz) en richting (Th3) van K14, L9 en Eierlandse Gat (`k14_fp`, `l9_fp`, `eg_fp`, `k14_dir`, `l9_dir`), zodat swell met lange periode uren eerder zichtbaar is dan bij IJmuiden. In de stationstabel kolom "Piek", vet vanaf 9 s (21 nov).
- De gebruiker wil dat boeien verder noordwest worden gebruikt om de afname van golfhoogte richting IJmuiden te leren en de voorspelling daarop te baseren. Dat zit nu in de "nowcast" (`NOWC`) en de kalibratie.
- Bij swell vindt de gebruiker naast hoogte ook periode, richting en energie belangrijk.

## Claude (de eigen voorspelling)

In de code heet het model nog `Klodde` (oude naam); op het scherm staat "Claude" via `mname()`. Wens gebruiker (26 nov): "alleen voorspellingen met reële waarnemingen, geen fantasie, wetenschappelijk onderbouwd". Opbouw sinds 26 nov:
1. Alleen golven die naar het strand lopen (`shore`, `shoreFrac`): per golfdeel de energiefractie richting kust bij cos²-richtingsspreiding, F(a) = 1 - |a|/π + sin(2|a|)/(2π), a = hoek tussen herkomstrichting en kustnormaal 290°; hoogte × √F. ECMWF WAM: totaal met `wave_direction`. GFS Wave: windgolven en deining apart (`wind_wave_*`, `swell_wave_*`), opgeteld als energie. Aanleiding: bij harde oostenwind (24–26 nov) mat Munitiestort 2 tot 1,9 m terwijl die golven van de kust af lopen.
2. Kalibratie (`calibrate`): Munitiestort 2 gedeeld door het gemiddelde van de ruwe modellen, afgelopen 7 dagen, alleen uren waarin ECMWF de golven vanuit zee laat komen (`seaSide`, binnen 90° van 290°). Over 18–26 nov: zeekant 1,5×, aflandig 2,0×; vroeger werd alles gemengd (1,54). De windcorrectie `KC` is geschrapt (vaste coëfficiënten zonder meetbasis; de richting doet dit nu fysisch).
3. Periode: energiegewogen over de delen die naar het strand lopen (ECMWF piekperiode; GFS per deel). Vroeger het gemiddelde van ECMWF-piekperiode en GFS-deiningsperiode (appels en peren). Over 18–26 nov liep ECMWF-piekperiode het best mee met de gemeten Tm-1,0 (r = 0,91).
4. Kleine getijfactor (`TF`).
5. Tot 3 uur na de laatste meting uit de boeien (`NOWC`), daarna aflopend tot 0 bij 12 uur; de boeiwaarde ook × √F (ECMWF-richting).
- In de uurregel een extra regel met labels: "golven uit X" (ECMWF-richting, met "lopen van de kust af" als F < 0,5 terwijl er op zee golven staan) en "deining X m · Y s uit Z" (GFS-deining vanuit zee, vanaf 8 s). In de tooltip de ruwe golfhoogte op zee.
- `verif.json` versie 2: alleen uren met golven uit zee worden afgerekend (de boei meet ook golven die het strand niet bereiken); oudere statistiek is gewist.
- `tools/vergelijk.js` + workflow "Vergelijk oude en nieuwe rekenkern" (handmatig): eenmalige vergelijking met `tools/engine_old.js` (de kern van vóór 26 nov).

## Leren van eerdere voorspellingen (26 nov)

- `forecast_job.js` bewaart elk uur de Claude-voorspelling (en ECMWF/GFS) voor de termijnen 1, 3, 6, 12, 24, 36, 48, 72, 96 en 120 uur vooruit in `verif.json` (branch `data`) en rekent die af zodra Munitiestort 2 (Hm0) gemeten is: per termijn aantal, gemiddelde absolute fout en gemiddelde afwijking. Oude uren doven uit (halveringstijd ~30 dagen).
- Correctie per termijn (`applyLeadBias`): de gemiddelde afwijking, afgezwakt met n/(n+150) en hoogstens 10 cm, gaat van de Claude-golf af (`KL.lb`). Pas vanaf 20 afgerekende voorspellingen per termijn.
- In de app onder de kleurenbalk van een dag: "±X cm zit Claude er op deze afstand gemiddeld naast (ECMWF ±…, GFS ±…)", groen tot 12 cm, geel tot 22, oranje daarboven. Verschijnt na ongeveer een week.

## Pushmelding (26 nov)

- Via ntfy.sh, onderwerp `golfsup-zandvoort-c4e6121205` (in `melding.json`; een GitHub-secret `NTFY_TOPIC` gaat voor). In de app staat een blok "Melding bij een SUP ALERT" met uitleg en link.
- Wens gebruiker (26 nov): per alertdag alleen deze twee berichten, met het beste alert-blok van die dag (standaardgrenzen, overdag, score ≥ 7, golf ≥ 0,8 m): om 18:00 de avond ervoor ("Morgen SUP ALERT …") en een uur voor zonsopkomst op de dag zelf ("Vandaag SUP ALERT …", alleen als de alert dan nog staat). Geen berichten over verschuiven of vervallen.
- Omdat GitHub de taak niet op tijd draait: een run tot 2,5 uur vóór het moment plant het bericht in bij ntfy (`delay`, unix-tijd), zodat het precies op tijd komt. Geen run vooraf: dan bij de eerste run erna (avond tot 21:00, ochtend tot zonsopkomst). `meldingen.json` op `data` onthoudt per sleutel `avond:<dag>` / `ochtend:<dag>` wat verstuurd of ingepland is.

## Alertdagen (map `dag/`)

- Overzicht: https://bennyjansen72.github.io/Golfsup-Zandvoort/dag/ ; één dag: `dag/?d=JJJJ-MM-DD`. Zelfde grafiek als het eerste dagoverzicht (golven, periode, wind, temperatuur, getij, stroming), met de alert-uren als groene strook en een tabel per uur.
- Automatisch: `dag_archive.py` draait in de GitHub-taak na `rws_fetch.py` (met `continue-on-error`, zodat het de metingen nooit tegenhoudt). Een alertdag = minstens 2 uur tussen zonsopkomst en zonsondergang met golf (H1/3 Munitiestort 2, anders Hm0) vanaf 0,8 m en score 7 of hoger, met dezelfde `score()` en standaardgrenzen als de app; wind van havenhoofd IJmuiden. Per dag `dag/JJJJ-MM-DD.json` en `dag/index.json` op de branch `data` (wordt bij elke run meegenomen). Uren en getij blijven bewaard als ze uit het meetvenster van 8 dagen vallen.
- Getij zit maar ongeveer 1 dag terug in rws.json; dagen van vóór 22 nov (19, 20 nov) hebben daarom geen getij. `dag/seed/` in main bevat startbestanden (22 nov met getij).
- Temperatuur, zontijden, watertemperatuur en stroming haalt de pagina zelf bij Open-Meteo voor die datum (forecast, anders historical-forecast; marine). Ontbreekt iets, dan valt dat paneel weg.
- Notities (alleen als iemand echt gesupt heeft of het live gezien heeft) staan in `dag/notities.json`: per datum `type` (gesupt/gezien), `sessie` [begin, eind] en `opmerkingen` (tekst of {tekst, cijfer}). De gebruiker geeft ze door; Claude zet ze erin.
- `dag/2026-11-22.html` stuurt door naar `dag/?d=2026-11-22` (de eerste gedeelde link).

## Werkafspraken

- Na elke wijziging het versienummer in `sw.js` ophogen.
- Pas pushen naar GitHub als de gebruiker akkoord geeft: de site wordt dan meteen bijgewerkt.
- Foto's als WebP (`bg.webp`, `alert2.webp`; de jpg's blijven voor de deelplaatjes van `dag/`), lettertype Outfit zelf meegeleverd in `fonts/` (geen Google Fonts meer in de app).
- De automatische taak zet de metingen elk kwartier op de branch `data` (één commit, force-push); main blijft schoon. De app leest `raw.githubusercontent.com/bennyjansen72/Golfsup-Zandvoort/data/rws.json`, met `data/rws.json` in main als reserve.
- Haal voor het pushen toch even de laatste versie op (`git pull --rebase`).

## Geschiedenis

- 20 nov 2026: app gebouwd als eigen web-app op GitHub; Windy losgelaten, Open-Meteo en Rijkswaterstaat als bronnen; alertgrens naar 0,8 m.
- 21 nov 2026: het oorspronkelijke bouwgesprek was per ongeluk verwijderd; de app zelf stond nog volledig op GitHub. Dit bestand gemaakt. Service worker bewaart rws.json niet meer bij elke verversing opnieuw, windtabel-fix, `__pycache__` weg, metingen naar de branch `data` (één commit) in plaats van elk kwartier een commit op main. Webcams Zandvoort en Wijk aan Zee toegevoegd; temperatuur en weericonen toegevoegd. Piekperiode en richting van K14, L9 en Eierlandse Gat erbij; aantal golven weg uit de opbouw van de golven. Rij Stroming (getijdestroom) toegevoegd.
- 22 nov 2026: map `dag/` voor deelbare dagoverzichten van alertdagen (losse interactieve pagina met golven, periode, wind, temperatuur, getij en stroming, sessie gemarkeerd). Eerste: `dag/2026-11-22.html`.
- 24 nov 2026: dagoverzichten automatisch voor elke alertdag (zie "Alertdagen").
- 26 nov 2026: "Grootste golf" uit Nu gemeten; nieuwe kleurrijke dagweergave per uur. Rekenkern naar `engine.js`; GitHub-taak rekent de voorspelling uit (`forecast.json`), houdt bij hoe goed Claude voorspelt en leert daarvan, en stuurt pushmeldingen via ntfy. WebP-foto's en eigen lettertype. Daarna meldingen teruggebracht tot 18:00 de avond ervoor en een uur voor zonsopkomst. 's Avonds rekenkern realistischer: alleen golven richting strand, kalibratie alleen op golven uit zee, energiegewogen periode, deining apart. Aflandige sector naar 55°–165°. Wijk aan Zee als tweede spot bewust niet gedaan (te complex, wens gebruiker).
