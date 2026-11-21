import json, urllib.request
from datetime import datetime, timedelta, timezone
B="https://ddapi20-waterwebservices.rijkswaterstaat.nl/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen"
now=datetime.now(timezone.utc)
def iso(t): return t.strftime("%Y-%m-%dT%H:%M:%S.000+00:00")
def get(g,u):
    body={"Locatie":{"Code":"ijmuiden.munitiestort.2"},"AquoPlusWaarnemingMetadata":{"AquoMetadata":{"Compartiment":{"Code":"OW"},"Grootheid":{"Code":g},"Eenheid":{"Code":u}}},"Periode":{"Begindatumtijd":iso(now-timedelta(hours=6)),"Einddatumtijd":iso(now)}}
    r=urllib.request.Request(B,data=json.dumps(body).encode(),headers={"Content-Type":"application/json"},method="POST")
    with urllib.request.urlopen(r,timeout=60) as f:
        if f.status==204: return {}
        j=json.loads(f.read().decode())
    out={}
    for w in j.get("WaarnemingenLijst",[]):
        for m in w["MetingenLijst"]:
            v=m["Meetwaarde"].get("Waarde_Numeriek")
            if v is not None and v<9000: out[m["Tijdstip"][11:16]]=v
    return out
S={k:get(*k.split("|")) for k in ["Hm0|cm","Hmax|cm","H1/3|cm","Tm-10|s","Tm02|s","Tmax|s"]}
ts=sorted(set().union(*[set(v) for v in S.values()]))
print("ROW tijd Hm0 H1/3 Hmax Tm-10 Tm02 Tmax")
for t in ts: print("ROW",t," ".join(str(S[k].get(t,"-")) for k in ["Hm0|cm","H1/3|cm","Hmax|cm","Tm-10|s","Tm02|s","Tmax|s"]))
