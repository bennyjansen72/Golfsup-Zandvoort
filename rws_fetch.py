#!/usr/bin/env python3
"""Haalt de laatste 8 dagen metingen van Rijkswaterstaat op en schrijft ze als uurgemiddelden naar een JSON-bestand.

Draait elk kwartier via GitHub Actions (.github/workflows/rws.yml). De app leest data/rws.json,
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
    ("ms2_hmax", "ijmuiden.munitiestort.2", "Hmax", "cm", "OW"),
    ("ms2_tmax", "ijmuiden.munitiestort.2", "Tmax", "s", "OW"),
    # Opbouw van de golven bij Munitiestort 2 (tijdsdomein, deining, piekfrequentie, richting, watertemperatuur).
    ("ms2_h13", "ijmuiden.munitiestort.2", "H1/3", "cm", "OW"),
    ("ms2_h110", "ijmuiden.munitiestort.2", "H1/10", "cm", "OW"),
    ("ms2_h150", "ijmuiden.munitiestort.2", "H1/50", "cm", "OW"),
    ("ms2_hte3", "ijmuiden.munitiestort.2", "HTE3", "cm", "OW"),
    ("ms2_t13", "ijmuiden.munitiestort.2", "T1/3", "s", "OW"),
    ("ms2_fp", "ijmuiden.munitiestort.2", "Fp", "Hz", "OW"),
    ("ms2_th0", "ijmuiden.munitiestort.2", "Th0", "graad", "OW"),
    ("ms2_tw", "ijmuiden.munitiestort.2", "T", "oC", "OW"),
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
    # Piekperiode (uit Fp) en richting verder noordwest: een swell met lange periode is hier uren eerder te zien dan bij IJmuiden.
    ("k14_fp", "k14", "Fp", "Hz", "OW"),
    ("l9_fp", "l9", "Fp", "Hz", "OW"),
    ("eg_fp", "eierlandsegat", "Fp", "Hz", "OW"),
    ("k14_dir", "k14", "Th3", "graad", "OW"),
    ("l9_dir", "l9", "Th3", "graad", "OW"),
    ("hkn_ws", "hollandsekust.noord.alpha", "WINDSHD", "m/s", "LT"),
    ("hkn_wd", "hollandsekust.noord.alpha", "WINDRTG", "graad", "LT"),
    ("ijm_ws", "ijmuiden.havenhoofd.zuid", "WINDSHD", "m/s", "LT"),
    ("ijm_wd", "ijmuiden.havenhoofd.zuid", "WINDRTG", "graad", "LT"),
    ("ijb_ws", "ijmuiden.buitenhaven", "WINDSHD", "m/s", "LT"),
    ("ijb_wd", "ijmuiden.buitenhaven", "WINDRTG", "graad", "LT"),
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
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
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
            time.sleep(5)
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


def load_old(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


PRIORITY = ["ms2", "ms2_tm10", "ms2_tm02", "ms2_hmax", "ms2_tmax", "ms2_h13", "ms2_h110", "ms2_h150", "ms2_hte3", "ms2_t13", "ms2_fp", "ms2_th0", "ms2_tw", "ijm_ws", "ijm_wd", "hkn_ws", "hkn_wd"]


def main(path):
    started = time.time()
    now = datetime.now(timezone.utc)
    end_hour = now.replace(minute=0, second=0, microsecond=0)
    start_hour = end_hour - timedelta(hours=HOURS - 1)
    start_u = int(start_hour.timestamp() // 3600)
    old = load_old(path)
    out = {"generated": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "start": start_u, "hours": HOURS, "s": {}}
    # Elk kwartier alleen de laatste 6 uur ophalen en aanvullen; de volledige 8 dagen eens per dag (rond 04:00 UTC) of zonder oud bestand.
    full = not old or not old.get("s") or (now.hour == 4 and now.minute < 20)
    begin = (start_hour - timedelta(minutes=5)) if full else (now - timedelta(hours=6))
    end = now
    print(f"{'volledig (8 dagen)' if full else 'aanvullen (6 uur)'}", file=sys.stderr)

    # Getij: alleen opnieuw ophalen als de oude tijden minder dan 5 dagen vooruit reiken.
    tides = [t for t in (old or {}).get("tides", []) if t[0] >= now.timestamp() - 86400]
    if not tides or tides[-1][0] < now.timestamp() + 5 * 86400:
        try:
            new = tide_events(now)
            if new:
                tides = new
        except Exception as e:
            print(f"getij mislukt: {e}", file=sys.stderr)
    out["tides"] = tides
    print(f"getij: {len(tides)} keer hoog- of laagwater", file=sys.stderr)

    order = sorted(SERIES, key=lambda x: PRIORITY.index(x[0]) if x[0] in PRIORITY else 99)
    ok, fails = 0, 0
    raw = {}
    for key, loc, g, u, comp in order:
        # Oude waarden eerst overnemen (verschoven naar het nieuwe venster); nieuwe metingen overschrijven ze.
        arr = [None] * HOURS
        if old and key in old.get("s", {}):
            o0 = old["start"]
            for j, v in enumerate(old["s"][key]):
                i = o0 + j - start_u
                if v is not None and 0 <= i < HOURS:
                    arr[i] = v
        pts = None
        if time.time() - started < 480 and fails < 6:
            pts = fetch(loc, g, u, comp, begin, end)
            time.sleep(0.3)
        if pts:
            raw[key] = pts
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
        else:
            if pts is None:
                fails += 1
            print(f"{key}: niet opgehaald, oude waarden aangehouden", file=sys.stderr)
        print(f"{key}: {sum(1 for x in arr if x is not None)} uren", file=sys.stderr)
        out["s"][key] = arr
    out["s"] = {k: out["s"][k] for k, *_ in SERIES}

    def latest(key, deg=False, scale=1.0):
        pts = raw.get(key)
        if not pts:
            return None
        tmax = max(t for t, v in pts)
        vs = [v for t, v in pts if t == tmax]
        if deg:
            sx = sum(math.cos(math.radians(v)) for v in vs); sy = sum(math.sin(math.radians(v)) for v in vs)
            return int(tmax.timestamp()), round((math.degrees(math.atan2(sy, sx)) + 360) % 360)
        return int(tmax.timestamp()), sum(vs) / len(vs) * scale

    # Laatste 10-minutenmeting van de golven bij Munitiestort 2.
    out["wave_now"] = None
    wv = {k: latest("ms2" + k, deg=(k == "_th0")) for k in ("", "_hmax", "_tm10", "_tm02", "_tmax", "_h13", "_h110", "_h150", "_hte3", "_t13", "_fp", "_th0", "_tw")}
    if wv[""] and now.timestamp() - wv[""][0] < 3 * 3600:
        t0 = wv[""][0]
        def at(k, nd):
            x = wv[k]
            return round(x[1], nd) if x and abs(x[0] - t0) <= 1800 else None
        out["wave_now"] = {"t": t0, "hm0": at("", 0), "hmax": at("_hmax", 0), "tm10": at("_tm10", 1), "tm02": at("_tm02", 1), "tmax": at("_tmax", 1),
                           "h13": at("_h13", 0), "h110": at("_h110", 0), "h150": at("_h150", 0), "hte3": at("_hte3", 0), "t13": at("_t13", 1),
                           "fp": at("_fp", 3), "th0": at("_th0", 0), "tw": at("_tw", 1)}

    # Laatste 10-minutenmeting van de wind (pier IJmuiden, anders buitenhaven, anders Hollandse Kust Noord).
    out["wind_now"] = None
    for name, ws, wd in (("IJmuiden havenhoofd", "ijm_ws", "ijm_wd"), ("IJmuiden buitenhaven", "ijb_ws", "ijb_wd"), ("Hollandse Kust Noord", "hkn_ws", "hkn_wd")):
        a, b = latest(ws, scale=1.94384), latest(wd, True)
        if a and b and now.timestamp() - a[0] < 3 * 3600:
            out["wind_now"] = {"name": name, "t": a[0], "kn": round(a[1], 1), "deg": b[1]}
            break

    # Mislukt het nu, dan de vorige actuele meting houden zolang die minder dan 3 uur oud is.
    for k in ("wave_now", "wind_now"):
        if not out[k] and old and old.get(k) and now.timestamp() - old[k]["t"] < 3 * 3600:
            out[k] = old[k]
            print(f"{k}: vorige meting aangehouden", file=sys.stderr)

    if ok == 0 and not tides:
        print("Niets opgehaald; oud bestand blijft staan.", file=sys.stderr)
        sys.exit(0)
    import os
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data/rws.json")
