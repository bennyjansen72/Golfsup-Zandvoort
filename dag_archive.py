"""Alertdagen bewaren voor de dagoverzichten (dag/index.html).

Gebruik: python3 dag_archive.py <rws.json> <uitmap>

Leest de metingen van de laatste 8 dagen uit rws.json en zoekt dagen die volgens de
metingen een alertdag waren: minstens 2 uren tussen zonsopkomst en zonsondergang met
golf (H1/3 bij Munitiestort 2) vanaf 0,8 m en een score van 7 of hoger, met dezelfde
scoreregel en standaardgrenzen als de app. Voor zo'n dag komt <uitmap>/JJJJ-MM-DD.json,
en <uitmap>/index.json houdt de lijst bij. Bestaande dagen in <uitmap> blijven staan;
een dag die nog in het meetvenster valt wordt bijgewerkt. Startbestanden uit dag/seed/
(in main) worden overgenomen als de dag nog niet in het archief staat.
"""
import json, math, os, sys, glob
from datetime import datetime, timedelta, timezone, date

LAT, LON = 52.37, 4.53
LIM = {"wave": 0.8, "per": 5.5, "off": 16, "oth": 6}
MIN_HOURS = 2


def tz_offset(d):
    """Uren t.o.v. UTC in Amsterdam (zomertijd laatste zondag maart t/m laatste zondag oktober)."""
    def last_sunday(y, m):
        x = date(y, m + 1, 1) - timedelta(days=1) if m < 12 else date(y, 12, 31)
        return x - timedelta(days=(x.weekday() + 1) % 7)
    return 2 if last_sunday(d.year, 3) <= d < last_sunday(d.year, 10) else 1


def sun_times(d):
    """Zonsopkomst en -ondergang (minuten na middernacht, lokale tijd), NOAA-benadering."""
    n = d.timetuple().tm_yday
    g = 2 * math.pi / 365 * (n - 1)
    eq = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    dec = 0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g) + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g)
    lat = math.radians(LAT)
    ha = math.degrees(math.acos(math.cos(math.radians(90.833)) / (math.cos(lat) * math.cos(dec)) - math.tan(lat) * math.tan(dec)))
    off = tz_offset(d) * 60
    rise = 720 - 4 * (LON + ha) - eq + off
    sett = 720 - 4 * (LON - ha) - eq + off
    return round(rise), round(sett)


def kind(deg):
    if 55 <= deg <= 165:
        return "af"
    if 245 <= deg <= 335:
        return "aan"
    return "zij"


def score(deg, kn, h, p):
    """Zelfde regel als score() in index.html."""
    lim = LIM["off"] if kind(deg) == "af" else LIM["oth"]
    base = min(10, math.floor(h * 10 + 1e-6))
    if kn <= lim:
        w = 1 - 0.1 * max(0, (kn - 6) / 5)
    elif kn <= lim + 5:
        w = 0.35
    elif kn <= lim + 10:
        w = 0.12
    else:
        w = 0
    pf = 1 if p is None or p >= LIM["per"] else max(0, (p - (LIM["per"] - 1.5)) / 1.5) * 0.6
    return round(base * w * pf)


def r(v, n=2):
    return None if v is None else round(v, n)


def main(src, outdir):
    d = json.load(open(src))
    s, start = d["s"], d["start"]
    os.makedirs(outdir, exist_ok=True)

    def g(k, i):
        a = s.get(k)
        return a[i] if a and i < len(a) else None

    # uurwaarden per lokale dag
    days = {}
    for i in range(d["hours"]):
        ts = (start + i) * 3600
        utc = datetime.fromtimestamp(ts, timezone.utc)
        loc = utc + timedelta(hours=tz_offset(utc.date()))
        h13 = g("ms2_h13", i)
        hm0 = g("ms2", i)
        if h13 is None and hm0 is None:
            continue
        ws, wd = g("ijm_ws", i), g("ijm_wd", i)
        if ws is None or wd is None:
            ws, wd = g("ijb_ws", i), g("ijb_wd", i)
        if ws is None or wd is None:
            ws, wd = g("hkn_ws", i), g("hkn_wd", i)
        fp = g("ms2_fp", i)
        tp = None
        if fp:
            tp = round(1000 / fp if fp > 1 else 1 / fp, 1)
        row = {
            "t": loc.hour * 60,
            "h13": r(h13 / 100 if h13 is not None else None),
            "hm0": r(hm0 / 100 if hm0 is not None else None),
            "hmax": r(g("ms2_hmax", i) / 100 if g("ms2_hmax", i) is not None else None),
            "h110": r(g("ms2_h110", i) / 100 if g("ms2_h110", i) is not None else None),
            "sw": r(g("ms2_hte3", i) / 100 if g("ms2_hte3", i) is not None else None),
            "tm02": g("ms2_tm02", i), "t13": g("ms2_t13", i), "tp": tp,
            "ws": ws, "wd": wd,
        }
        days.setdefault(loc.date(), []).append(row)

    index_path = os.path.join(outdir, "index.json")
    try:
        index = {e["date"]: e for e in json.load(open(index_path))["days"]}
    except Exception:
        index = {}

    # startbestanden uit main (bijv. dagen van voor het archief)
    for f in glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), "dag", "seed", "*.json")):
        name = os.path.basename(f)
        dst = os.path.join(outdir, name)
        if not os.path.exists(dst):
            rec = json.load(open(f))
            json.dump(rec, open(dst, "w"), separators=(",", ":"))
            index[rec["date"]] = summary(rec)

    for day, rows in sorted(days.items()):
        rise, sett = sun_times(day)
        alert = []
        for x in rows:
            h = x["h13"] if x["h13"] is not None else x["hm0"]
            if h is None or x["ws"] is None or x["wd"] is None:
                continue
            if not (rise - 30 <= x["t"] <= sett - 30):  # uur dat (grotendeels) in het daglicht valt
                continue
            p = x["t13"] if x["t13"] is not None else x["tp"]
            if h >= LIM["wave"] and score(x["wd"], x["ws"], h, p) >= 7:
                alert.append(x["t"])
        ds = day.isoformat()
        path = os.path.join(outdir, ds + ".json")
        old = None
        if os.path.exists(path):
            try:
                old = json.load(open(path))
            except Exception:
                old = None
        if len(alert) < MIN_HOURS:
            continue  # (een eerder bewaarde dag blijft staan)
        # getij: hoog- en laagwater van ruim de hele dag; eerder bewaarde behouden
        d0 = datetime(day.year, day.month, day.day, tzinfo=timezone.utc) - timedelta(hours=tz_offset(day))
        lo, hi = d0.timestamp() - 14 * 3600, d0.timestamp() + 38 * 3600
        tides = {t[0]: t for t in (old or {}).get("tides", [])}
        for t in d.get("tides", []):
            if lo <= t[0] <= hi:
                tides[t[0]] = t
        # eerder bewaarde uren behouden als ze nu uit het venster zijn
        hours = {x["t"]: x for x in (old or {}).get("hours", [])}
        hours.update({x["t"]: x for x in rows})
        rec = {
            "date": ds, "sunrise": rise, "sunset": sett,
            "hours": [hours[k] for k in sorted(hours)],
            "tides": [tides[k] for k in sorted(tides)],
            "alert": sorted(set(alert) | set((old or {}).get("alert", []))),
            "updated": d.get("generated"),
        }
        json.dump(rec, open(path, "w"), separators=(",", ":"))
        index[ds] = summary(rec)

    out = {"updated": d.get("generated"), "days": sorted(index.values(), key=lambda e: e["date"], reverse=True)}
    json.dump(out, open(index_path, "w"), separators=(",", ":"))
    print("alertdagen:", ", ".join(e["date"] for e in out["days"]) or "geen")


def summary(rec):
    al = [x for x in rec["hours"] if x["t"] in rec["alert"]]
    hs = [x["h13"] if x["h13"] is not None else x["hm0"] for x in al]
    ws = [x["ws"] for x in al if x["ws"] is not None]
    return {
        "date": rec["date"],
        "from": min(rec["alert"]), "to": max(rec["alert"]) + 60,
        "h13": max(hs) if hs else None,
        "hmax": max([x["hmax"] for x in al if x["hmax"] is not None], default=None),
        "wind": [min(ws), max(ws)] if ws else None,
        "wd": al[len(al) // 2]["wd"] if al else None,
    }


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
