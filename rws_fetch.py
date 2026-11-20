#!/usr/bin/env python3
"""Haalt de laatste 8 dagen metingen van Rijkswaterstaat op en schrijft ze als uurgemiddelden naar een JSON-bestand.

Draait elk uur via GitHub Actions (.github/workflows/rws.yml). De app leest data/rws.json,
omdat de Rijkswaterstaat-API geen verzoeken van andere websites toestaat (geen CORS).
Gebruikt alleen de standaardbibliotheek van Python.
"""
import json
import math
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

URL = "https://ddapi20-waterwebservices.rijkswaterstaat.nl/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen"
HOURS = 192  # 8 dagen

# sleutel, locatie, grootheid, eenheid, compartiment
SERIES = [
    ("ms2", "ijmuiden.munitiestort.2", "Hm0", "cm", "OW"),
    ("hkw", "hollandsekust.west.alpha", "Hm0", "cm", "OW"),
    ("hkn", "hollandsekust.noord.alpha", "Hm0", "cm", "OW"),
    ("k14", "k14", "Hm0", "cm", "OW"),
    ("j6", "j6", "Hm0", "cm", "OW"),
    ("l9", "l9", "Hm0", "cm", "OW"),
    ("k13a", "k13a.1", "Hm0", "cm", "OW"),
    ("eg", "eierlandsegat", "Hm0", "cm", "OW"),
    ("ep", "europlatform", "Hm0", "cm", "OW"),
    ("ms2_tm10", "ijmuiden.munitiestort.2", "Tm-10", "s", "OW"),
    ("ms2_tm02", "ijmuiden.munitiestort.2", "Tm02", "s", "OW"),
    ("hkw_tm10", "hollandsekust.west.alpha", "Tm-10", "s", "OW"),
    ("hkw_tm02", "hollandsekust.west.alpha", "Tm02", "s", "OW"),
    ("k14_tm10", "k14", "Tm-10", "s", "OW"),
    ("k14_tm02", "k14", "Tm02", "s", "OW"),
    ("j6_tm10", "j6", "Tm-10", "s", "OW"),
    ("j6_tm02", "j6", "Tm02", "s", "OW"),
    ("l9_tm10", "l9", "Tm-10", "s", "OW"),
    ("l9_tm02", "l9", "Tm02", "s", "OW"),
    ("ep_tm10", "europlatform", "Tm-10", "s", "OW"),
    ("ep_tm02", "europlatform", "Tm02", "s", "OW"),
    ("eg_tm10", "eierlandsegat", "Tm-10", "s", "OW"),
    ("eg_tm02", "eierlandsegat", "Tm02", "s", "OW"),
    ("eg_dir", "eierlandsegat", "Th3", "graad", "OW"),
    ("k13a_dir", "k13a.1", "Th3", "graad", "OW"),
    ("hkn_ws", "hollandsekust.noord.alpha", "WINDSHD", "m/s", "LT"),
    ("hkn_wd", "hollandsekust.noord.alpha", "WINDRTG", "graad", "LT"),
    ("k14_ws", "k14", "WINDSHD", "m/s", "LT"),
    ("k14_wd", "k14", "WINDRTG", "graad", "LT"),
]


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%S.000+00:00")


def fetch(loc, grootheid, eenheid, comp, begin, end, procestype=None):
    meta = {"Compartiment": {"Code": comp}, "Grootheid": {"Code": grootheid}}
    if eenheid:
        meta["Eenheid"] = {"Code": eenheid}
    if procestype:
        meta["ProcesType"] = procestype
    body = {
        "Locatie": {"Code": loc},
        "AquoPlusWaarnemingMetadata": {"AquoMetadata": meta},
        "Periode": {"Begindatumtijd": iso(begin), "Einddatumtijd": iso(end)},
    }
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                if r.status == 204:
                    return []
                j = json.loads(r.read().decode())
            out = []
            for w in j.get("WaarnemingenLijst") or []:
                for m in w.get("MetingenLijst") or []:
                    v = (m.get("Meetwaarde") or {}).get("Waarde_Numeriek")
                    if v is None or v >= 9000:
                        continue
                    t = datetime.fromisoformat(m["Tijdstip"]).astimezone(timezone.utc)
                    out.append((t, float(v)))
            return out
        except Exception as e:  # netwerk of serverfout: even wachten en opnieuw
            print(f"  fout {loc} {grootheid} poging {attempt + 1}: {e}", file=sys.stderr)
            time.sleep(3)
    return None


def tide_events(now):
    """Hoog- en laagwater IJmuiden uit het astronomische getij (10-minutenwaarden) van Rijkswaterstaat."""
    pts = fetch("ijmuiden.buitenhaven", "WATHTE", None, "OW", now - timedelta(days=1), now + timedelta(days=8), "astronomisch")
    if not pts:
        return []
    pts = sorted(set(pts))
    v = [p[1] for p in pts]
    w = 9  # 90 minuten aan weerszijden
    raw = []
    for i in range(w, len(pts) - w):
        win = v[i - w:i + w + 1]
        if v[i] == max(win) and v[i] > v[i + 1]:
            raw.append([pts[i][0], "H", v[i]])
        elif v[i] == min(win) and v[i] < v[i + 1]:
            raw.append([pts[i][0], "L", v[i]])
    # afwisselend H en L; bij twee gelijke achter elkaar de uiterste houden
    ev = []
    for e in raw:
        if ev and ev[-1][1] == e[1]:
            if (e[1] == "H" and e[2] > ev[-1][2]) or (e[1] == "L" and e[2] < ev[-1][2]):
                ev[-1] = e
            continue
        ev.append(e)
    # kleine bultjes (dubbel laagwater) weghalen: verschil met de buren minder dan 30 cm
    changed = True
    while changed:
        changed = False
        for i in range(1, len(ev)):
            if abs(ev[i][2] - ev[i - 1][2]) < 30:
                del ev[i - 1:i + 1]
                changed = True
                break
    return [[int(e[0].timestamp()), e[1], round(e[2])] for e in ev]


def main(path):
    now = datetime.now(timezone.utc)
    end_hour = now.replace(minute=0, second=0, microsecond=0)
    start_hour = end_hour - timedelta(hours=HOURS - 1)
    begin, end = start_hour - timedelta(minutes=5), now
    start_u = int(start_hour.timestamp() // 3600)
    out = {"generated": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "start": start_u, "hours": HOURS, "s": {}}
    ok = 0
    for key, loc, g, u, comp in SERIES:
        pts = fetch(loc, g, u, comp, begin, end)
        arr = [None] * HOURS
        if pts:
            ok += 1
            buckets = {}
            for t, v in pts:
                i = int(t.timestamp() // 3600) - start_u
                if 0 <= i < HOURS:
                    buckets.setdefault(i, []).append(v)
            for i, vs in buckets.items():
                if u == "graad":
                    sx = sum(math.cos(math.radians(v)) for v in vs)
                    sy = sum(math.sin(math.radians(v)) for v in vs)
                    arr[i] = round((math.degrees(math.atan2(sy, sx)) + 360) % 360)
                elif u == "m/s":
                    arr[i] = round(sum(vs) / len(vs) * 1.94384, 1)  # knopen
                elif u == "cm":
                    arr[i] = round(sum(vs) / len(vs))
                else:
                    arr[i] = round(sum(vs) / len(vs), 1)
        print(f"{key}: {sum(1 for x in arr if x is not None)} uren", file=sys.stderr)
        out["s"][key] = arr
    try:
        out["tides"] = tide_events(now)
        print(f"getij: {len(out['tides'])} keer hoog- of laagwater", file=sys.stderr)
    except Exception as e:
        print(f"getij mislukt: {e}", file=sys.stderr)
        out["tides"] = []
    if ok == 0:
        print("Geen enkele reeks opgehaald; oud bestand blijft staan.", file=sys.stderr)
        sys.exit(1)
    import os
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data/rws.json")
