// Draait elk kwartier in de GitHub-taak (na rws_fetch.py), met dezelfde rekenkern als de app (engine.js).
//
// Gebruik: node forecast_job.js <rws.json> <uitmap>
//
// 1. Haalt de voorspelling bij Open-Meteo op en rekent de voorspelling van Claude uit -> <uitmap>/forecast.json.
//    De app leest dat ene bestand in plaats van zelf zes bestanden op te halen.
// 2. Houdt bij hoe goed Claude voorspelt (<uitmap>/verif.json): elke voorspelling wordt bewaard en later naast
//    de meting bij Munitiestort 2 gelegd. Daaruit volgt een kleine correctie per vooruittermijn.
// 3. Pushmelding via ntfy: om 18:00 de avond voor een alertdag en een uur voor zonsopkomst op de dag zelf
//    (<uitmap>/meldingen.json onthoudt wat al gemeld is).
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
// Per alertdag hooguit twee berichten (wens gebruiker 26 nov):
//  - avond: om 18:00 de dag ervoor, "morgen SUP ALERT …";
//  - ochtend: een uur voor zonsopkomst op de dag zelf, alleen als de alert dan nog staat.
// GitHub draait de taak niet op de minuut, dus: valt een run tot 2,5 uur vóór het moment, dan krijgt ntfy het
// bericht met "delay" en bezorgt het precies op tijd. Was er geen run vooraf, dan gaat het mee met de eerste
// run erna (avond tot 21:00, ochtend tot zonsopkomst). meldingen.json onthoudt wat al verstuurd of ingepland is.
const LEAD_MAX = 2.5;   // uren vooruit inplannen
function startOfDayU(day) { // uurindex van 00:00 lokale tijd op die dag
  let u = Math.floor(Date.parse(day + "T00:00:00Z") / 36e5) - 3;
  while (E.local(u).day !== day) u++;
  return u;
}
function nextDay(day) { return E.local(startOfDayU(day) + 30).day; }
function prevDay(day) { return E.local(startOfDayU(day) - 6).day; }

async function notify(d) {
  const cfg = readJSON(path.join(__dirname, "melding.json"), {});
  const topic = process.env.NTFY_TOPIC || cfg.topic;
  if (!topic) { console.log("Geen ntfy-onderwerp, geen meldingen."); return; }
  const sPath = path.join(outDir, "meldingen.json");
  const S = readJSON(sPath, {});
  if (!S.sent) S.sent = {};   // {"avond:JJJJ-MM-DD": tijd, "ochtend:JJJJ-MM-DD": tijd} (datum = alertdag)
  const now = E.nowU(), today = E.local(now).day;
  // Per dag het beste alert-blok (hoogste totaalscore, dan meeste energie).
  const best = {};
  E.alertRuns(d, E.LIM0).forEach((r) => { const b = best[r.day]; if (!b || r.sum > b.sum || (r.sum === b.sum && r.en > b.en)) best[r.day] = r; });

  function text(r) {
    const u0 = r.us[0], u1 = r.us[r.us.length - 1] + 1;
    const v = r.cs.map((c) => c.v), kn = r.cs.map((c) => Math.round(c.w.kn)), ps = r.cs.map((c) => c.p).filter(Boolean);
    const rg = (a, f, unit) => { const lo = f(Math.min(...a)), hi = f(Math.max(...a)); return lo + (hi !== lo ? "–" + hi : "") + unit; };
    const c0 = r.cs[0], kindW = { af: "aflandig", aan: "aanlandig", zij: "zijwaarts" }[E.kind(c0.w.deg)];
    return { when: hhmm(u0) + "–" + hhmm(u1),
      body: "Golf " + rg(v, (x) => nf(x), " m") + (ps.length ? ", periode " + rg(ps, (x) => String(Math.round(x)), " s") : "") +
        "\nWind " + E.compass(c0.w.deg) + " " + rg(kn, String, " kn") + " (" + kindW + ")\nBeste score " + Math.max(...r.cs.map((c) => c.s)) };
  }
  const msgs = [];
  // Avondbericht voor de alertdag van morgen (en eventueel overmorgen als we al ver vooruit inplannen).
  Object.keys(best).forEach((day) => {
    const key = "avond:" + day, at = startOfDayU(prevDay(day)) + 18;   // 18:00 de dag ervoor
    if (S.sent[key] || now < at - LEAD_MAX || now > at + 3) return;
    const t = text(best[day]);
    msgs.push({ key, at, title: "Morgen SUP ALERT: " + dayTxt(day) + " " + t.when, message: t.body, tags: ["ocean", "surfer"], priority: 4 });
  });
  // Ochtendbericht een uur voor zonsopkomst, alleen als de alert van vandaag (of morgen, bij vooruit inplannen) nog staat.
  Object.keys(best).forEach((day) => {
    const sun = d.sun && d.sun[day]; if (!sun) return;
    const key = "ochtend:" + day, at = sun.rise - 1;
    if (S.sent[key] || now < at - LEAD_MAX || now > sun.rise) return;
    const t = text(best[day]);
    msgs.push({ key, at, title: "Vandaag SUP ALERT " + t.when, message: t.body + "\nZon op " + hhmm(sun.rise) + ".", tags: ["ocean", "surfer", "sunrise"], priority: 4 });
  });
  for (const m of msgs) {
    const body = { topic, click: APP, title: m.title, message: m.message, tags: m.tags, priority: m.priority };
    const wait = (m.at - E.nowU()) * 3600;   // seconden
    if (wait > 15) body.delay = String(Math.round(m.at * 3600));   // ntfy bezorgt op dit tijdstip (unix-tijd)
    try {
      const r = await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      console.log("Melding:", m.title, body.delay ? "(ingepland " + hhmm(m.at) + ")" : "(nu)", r.status);
      if (r.ok) S.sent[m.key] = Date.now();
    } catch (e) { console.log("Melding mislukt:", m.title, e.message); }
  }
  // Oude sleutels opruimen.
  Object.keys(S.sent).forEach((k) => { if (k.split(":")[1] < prevDay(today)) delete S.sent[k]; });
  delete S.days;
  fs.writeFileSync(sPath, JSON.stringify(S));
}

main().catch((e) => { console.error(e); process.exit(1); });
