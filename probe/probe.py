import json, math, urllib.request
from datetime import datetime, timedelta, timezone
B="https://ddapi20-waterwebservices.rijkswaterstaat.nl"
def post(path, body):
    r=urllib.request.Request(B+path, data=json.dumps(body).encode(), headers={"Content-Type":"application/json"}, method="POST")
    with urllib.request.urlopen(r, timeout=60) as f:
        return f.status, (json.loads(f.read().decode()) if f.status!=204 else None)
st, cat = post("/METADATASERVICES/OphalenCatalogus", {"CatalogusFilter":{"Compartimenten":True,"Grootheden":True,"Eenheden":True}})
AM={a["AquoMetadata_MessageID"]:a for a in cat["AquoMetadataLijst"]}
LL={l["Locatie_MessageID"]:l for l in cat["LocatieLijst"]}
wind_ids={k for k,a in AM.items() if a["Grootheid"]["Code"] in ("WINDSHD","WINDRTG")}
locs={}
for x in cat["AquoMetadataLocatieLijst"]:
    if x["AquoMetaData_MessageID"] in wind_ids:
        l=LL[x["Locatie_MessageID"]]; locs[l["Code"]]=l
def dist(l):
    try:
        lat,lon=float(l.get("Lat") or l.get("Y")), float(l.get("Lon") or l.get("X"))
    except Exception: return 9999, None, None
    if lat>1000:  # RD/UTM, skip conversion: crude
        return 9999, lat, lon
    return math.hypot((lat-52.46)*111, (lon-4.58)*68), lat, lon
rows=[]
for c,l in locs.items():
    d,la,lo=dist(l); rows.append((d,c,l.get("Naam"),la,lo,l.get("Coordinatenstelsel")))
rows.sort()
print("SAMPLE KEYS", list(next(iter(locs.values())).keys()))
for r in rows[:25]: print("WINDLOC", r)
now=datetime.now(timezone.utc)
def iso(t): return t.strftime("%Y-%m-%dT%H:%M:%S.000+00:00")
for d,c,n,la,lo,cs in rows[:12]:
    try:
        st, j = post("/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen", {"Locatie":{"Code":c},"AquoPlusWaarnemingMetadata":{"AquoMetadata":{"Compartiment":{"Code":"LT"},"Grootheid":{"Code":"WINDSHD"},"Eenheid":{"Code":"m/s"}}},"Periode":{"Begindatumtijd":iso(now-timedelta(hours=3)),"Einddatumtijd":iso(now)}})
        pts=[(m["Tijdstip"], m["Meetwaarde"]["Waarde_Numeriek"]) for w in (j or {}).get("WaarnemingenLijst",[]) for m in w["MetingenLijst"]]
        pts.sort()
        print("LATEST", c, n, round(d,1), "km", st, len(pts), pts[-3:] if pts else None)
    except Exception as e:
        print("LATEST", c, "ERR", e)
