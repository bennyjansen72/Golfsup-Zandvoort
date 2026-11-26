// Eenmalige vergelijking oude en nieuwe rekenkern (draait in GitHub Actions, want Open-Meteo is vanaf de werkplek niet bereikbaar).
"use strict";
const N = require("../engine.js"), O = require("./engine_old.js");
async function j(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }
(async () => {
  const R = { rws: await j("https://raw.githubusercontent.com/bennyjansen72/Golfsup-Zandvoort/data/rws.json") };
  for (const k of ["ec", "gf", "wind", "cur", "now"]) R[k] = await j(N.URLS[k]);
  const dn = N.build(R), dold = O.build(R), L = N.LIM0, now = N.nowU();
  console.log("kalibratie oud", JSON.stringify({ lo: dold.cal.lo, hi: dold.cal.hi, n: dold.cal.nlo + dold.cal.nhi }), "nieuw", JSON.stringify({ lo: dn.cal.lo, hi: dn.cal.hi, nlo: dn.cal.nlo, nhi: dn.cal.nhi, rawlo: dn.cal.rawlo }));
  // Terugblik: alleen uren met golven uit zee (daar is de boei een maat voor het strand).
  const ms = dn.meas.ms2 || {}; let n = 0, eo = 0, en = 0, bo = 0, bn = 0;
  Object.keys(ms).map(Number).forEach((u) => {
    if (u > now || !dn.KL[u] || !dold.KL[u] || !N.seaSide(dn.M.ECMWF.dir[u])) return;
    const a = ms[u] / 100; n++; eo += Math.abs(dold.KL[u].mod - a); en += Math.abs(dn.KL[u].mod - a); bo += dold.KL[u].mod - a; bn += dn.KL[u].mod - a;
  });
  console.log(`terugblik ${n} uren met golven uit zee: oud MAE ${(eo / n).toFixed(2)} bias ${(bo / n).toFixed(2)} | nieuw MAE ${(en / n).toFixed(2)} bias ${(bn / n).toFixed(2)}`);
  const pm = dn.meas.ms2_tm10 || {}; let m = 0, po = 0, pn = 0;
  Object.keys(pm).map(Number).forEach((u) => { if (u > now || !dn.KL[u] || !dold.KL[u] || !dn.KL[u].p || !dold.KL[u].p) return; m++; po += Math.abs(dold.KL[u].p - pm[u]); pn += Math.abs(dn.KL[u].p - pm[u]); });
  console.log(`periode t.o.v. Tm-1,0 (${m} uren): oud MAE ${(po / m).toFixed(2)} s | nieuw MAE ${(pn / m).toFixed(2)} s`);
  console.log("dag uur | oud: golf periode score | nieuw: golf periode score | ECMWF ruw/richting/F | GFS deining | wind");
  Object.keys(dn.KL).map(Number).sort((a, b) => a - b).forEach((u) => {
    if (u < now || N.darkU(dn, u)) return;
    const l = N.local(u); if (l.h % 2) return;
    const co = O.hourCell(dold, "Klodde", u, L), cn = N.hourCell(dn, "Klodde", u, L), K = dn.KL[u];
    if (!co || !cn) return;
    const e = dn.M.ECMWF;
    console.log(`${l.day} ${String(l.h).padStart(2, "0")} | ${co.v.toFixed(2)} ${co.p ? co.p.toFixed(1) : "-"} ${co.s} | ${cn.v.toFixed(2)} ${cn.p ? cn.p.toFixed(1) : "-"} ${cn.s} | ${e.h[u]} ${Math.round(e.dir[u])}° F${K.Fe.toFixed(2)} | ${K.sw ? K.sw.h.toFixed(2) + "m " + (K.sw.p || 0).toFixed(0) + "s " + K.sw.dir + "°" : "-"} | ${Math.round(cn.w.kn)}kn ${Math.round(cn.w.deg)}°`);
  });
  const ro = O.alertRuns(dold, L), rn = N.alertRuns(dn, L);
  console.log("alerts oud:", ro.map((r) => r.day + " " + r.us.length + "u").join(", ") || "geen");
  console.log("alerts nieuw:", rn.map((r) => r.day + " " + r.us.length + "u").join(", ") || "geen");
})().catch((e) => { console.error(e); process.exit(1); });
