// Draait elk kwartier in de GitHub-taak (na rws_fetch.py), met dezelfde rekenkern als de app (engine.js).
//
// Gebruik: node forecast_job.js <rws.json> <uitmap>
//
// 1. Haalt de voorspelling bij Open-Meteo op en rekent de voorspelling van Claude uit -> <uitmap>/forecast.json.
//    De app leest dat ene bestand in plaats van zelf zes bestanden op te halen.
// 2. Houdt bij hoe goed Claude voorspelt (<uitmap>/verif.json): elke voorspelling wordt bewaard en later naast
//    de meting bij Munitiestort 2 gelegd. Daaruit volgt een kleine correctie per vooruittermijn.
// 3. Stuurt een pushmelding via ntfy bij een nieuwe SUP ALERT (<uitmap>/meldingen.json onthoudt wat al gemeld is).
//
// Bestaande verif.json en meldingen.json in <uitmap> worden ingelezen en bijgewerkt.
"use strict";
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");

const [rwsPath, outDir] = process.argv.slice(2);
const APP = "https://bennyjansen72.github.io/Golfsup-Zandvoort/";
const DAYL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MON = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function readJSON(p, dflt) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return dflt; } }
async function getJSON(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "golfsup-zandvoort (github actions)" } });
      if (!r.ok) throw new Error(url.split("?")[0] + " gaf " + r.status);
      return await r.json();
    } catch (e) { if (i >= tries) throw e; await new Promise((ok) => setTimeout(ok, 3000 * i)); }
  }
}
function nf(n, d = 1) { return n.toFixed(d).replace(".", ","); }
function hhmm(u) { const l = E.local(u); return (l.h < 10 ? "0" : "") + l.h + ":" + (l.m < 10 ? "0" : "") + l.m; }
function dayTxt(day) { const l = E.local(Date.parse(day + "T12:00:00Z") / 36e5); return DAYL[l.wd] + " " + l.dm + " " + MON[l.mo]; }

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const rws = readJSON(rwsPath, null);
  const R = { rws };
  for (const k of ["ec", "gf", "wind", "cur", "now"]) {
    try { R[k] = await getJSON(E.URLS[k]); } catch (e) { console.log("Niet gelukt:", k, e.message); R[k] = null; }
  }
  if (!R.ec && !R.gf) { console.log("Geen golfvoorspelling, forecast.json niet bijgewerkt."); return; }
  const d = E.build(R);
  const issued = E.nowU();

  // Bijhouden en leren
  const vPath = path.join(outDir, "verif.json");
  const V = E.verifyStep(d, readJSON(vPath, {}), issued);
  // Eerst de ruwe Claude-voorspelling vastleggen (in verifyStep), daarna pas de correctie per termijn toepassen.
  E.applyLeadBias(d, V, issued);
  fs.writeFileSync(vPath, JSON.stringify(V));

  const F = E.pack(d, V);
  fs.writeFileSync(path.join(outDir, "forecast.json"), JSON.stringify(F));
  console.log("forecast.json:", Object.keys(F.KL).length, "uren,", Math.round(JSON.stringify(F).length / 1024), "kB");

  await notify(d);
}

// ---------- Pushmelding (ntfy) ----------
async function notify(d) {
  const cfg = readJSON(path.join(__dirname, "melding.json"), {});
  const topic = process.env.NTFY_TOPIC || cfg.topic;
  if (!topic) { console.log("Geen ntfy-onderwerp, geen meldingen."); return; }
  const sPath = path.join(outDir, "meldingen.json");
  const S = readJSON(sPath, { days: {} });
  const runs = E.alertRuns(d, E.LIM0);
  // Per dag het beste blok (hoogste totaalscore, dan meeste energie).
  const best = {};
  runs.forEach((r) => { const b = best[r.day]; if (!b || r.sum > b.sum || (r.sum === b.sum && r.en > b.en)) best[r.day] = r; });
  const today = E.local(E.nowU()).day, msgs = [];
  Object.keys(best).sort().forEach((day) => {
    const r = best[day], u0 = r.us[0], u1 = r.us[r.us.length - 1] + 1, prev = S.days[day];
    const v = r.cs.map((c) => c.v), kn = r.cs.map((c) => Math.round(c.w.kn)), ps = r.cs.map((c) => c.p).filter(Boolean);
    const rg = (a, f, unit) => { const lo = f(Math.min(...a)), hi = f(Math.max(...a)); return lo + (hi !== lo ? "–" + hi : "") + unit; };
    const c0 = r.cs[0], kindW = { af: "aflandig", aan: "aanlandig", zij: "zijwaarts" }[E.kind(c0.w.deg)];
    const body = "Golf " + rg(v, (x) => nf(x), " m") + (ps.length ? ", periode " + rg(ps, (x) => String(Math.round(x)), " s") : "") +
      "\nWind " + E.compass(c0.w.deg) + " " + rg(kn, String, " kn") + " (" + kindW + ")\nBeste score " + Math.max(...r.cs.map((c) => c.s));
    const when = (day === today ? "vandaag " : "") + dayTxt(day) + " " + hhmm(u0) + "–" + hhmm(u1);
    if (!prev) msgs.push({ title: "SUP ALERT " + when, message: body, tags: ["ocean", "surfer"], priority: 4 });
    // Al begonnen: de verstreken uren vallen weg, dat is geen verschuiving.
    else if (prev.u0 > E.nowU() && (Math.abs(prev.u0 - u0) >= 2 || Math.abs(prev.u1 - u1) >= 2)) msgs.push({ title: "SUP ALERT verschoven: " + when, message: body, tags: ["ocean"], priority: 3 });
    else { prev.miss = 0; return; }
    S.days[day] = { u0, u1, t: Date.now(), miss: 0 };
  });
  // Gemelde dagen waar de alert verdwenen is (en die nog niet voorbij zijn).
  Object.keys(S.days).forEach((day) => {
    if (best[day]) return;
    const x = S.days[day];
    // Pas na 3 runs (ongeveer 45 minuten) zonder alert melden, zodat een score die rond de 7 schommelt niet steeds piept.
    if (day >= today && x.u1 > E.nowU() && (x.miss = (x.miss || 0) + 1) < 3) return;
    if (day >= today && x.u1 > E.nowU()) msgs.push({ title: "SUP ALERT vervallen: " + dayTxt(day), message: "Volgens de nieuwste voorspelling haalt " + dayTxt(day) + " de grens niet meer.", tags: ["ocean", "x"], priority: 2 });
    delete S.days[day];
  });
  for (const m of msgs) {
    try {
      const r = await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, click: APP, ...m }) });
      console.log("Melding:", m.title, r.status);
    } catch (e) { console.log("Melding mislukt:", m.title, e.message); }
  }
  fs.writeFileSync(sPath, JSON.stringify(S));
}

main().catch((e) => { console.error(e); process.exit(1); });
