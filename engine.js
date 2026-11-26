// Rekenkern van Golfsup Zandvoort: dezelfde code draait in de app (browser) en in de
// GitHub-taak (Node, forecast_job.js). Pas de voorspelling alleen hier aan.
(function (root) {
  "use strict";
  var TZ = "Europe/Amsterdam";
  var OM_WAVE = "https://marine-api.open-meteo.com/v1/marine?latitude=52.25,52.5&longitude=4.5,4.5&cell_selection=sea&timeformat=unixtime&timezone=Europe%2FAmsterdam&past_days=7&forecast_days=6";
  var URLS = {
    ec: OM_WAVE + "&models=ecmwf_wam&hourly=wave_height,wave_peak_period,wave_direction",
    gf: OM_WAVE + "&models=ncep_gfswave025&hourly=wave_height,wave_period,wave_direction,wind_wave_height,wind_wave_period,wind_wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction",
    wind: "https://api.open-meteo.com/v1/forecast?latitude=52.38&longitude=4.48&cell_selection=sea&timeformat=unixtime&timezone=Europe%2FAmsterdam&past_days=1&forecast_days=6&wind_speed_unit=kn&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,weather_code,is_day&models=ecmwf_ifs025,gfs_seamless&daily=sunrise,sunset",
    // Weer nu bij Zandvoort (Open-Meteo, beste model voor NL; dit is een modelwaarde, geen meting).
    // Getijdestroming (en stroming door wind en golven) bij Zandvoort: Météo-France SMOC via Open-Meteo, richting = waarheen.
    cur: "https://marine-api.open-meteo.com/v1/marine?latitude=52.37&longitude=4.48&cell_selection=sea&timeformat=unixtime&timezone=Europe%2FAmsterdam&past_days=1&forecast_days=6&wind_speed_unit=kn&hourly=ocean_current_velocity,ocean_current_direction",
    now: "https://api.open-meteo.com/v1/forecast?latitude=52.37&longitude=4.53&timeformat=unixtime&timezone=Europe%2FAmsterdam&current=temperature_2m,apparent_temperature,weather_code,is_day,cloud_cover,precipitation",
    // Metingen staan op de branch "data" (zie .github/workflows/rws.yml); als dat niet lukt, de oude kopie naast de app.
    rws: "https://raw.githubusercontent.com/bennyjansen72/Golfsup-Zandvoort/data/rws.json",
    rwsOld: "data/rws.json"
  };
  // Kust bij Zandvoort loopt ongeveer 20°-200°; de normaal naar zee wijst naar 290° (WNW).
  var SHORE = 290;
  var TF = { push: 1.00, pushhi: 1.02, rise: 1.0, ebb: 0.965, ebbhi: 1.00, low: 0.985, lowhi: 1.00 };
  // Boeivoorspelling MS2 over L uur: [1, MS2, K14, J6, L9 (m), aanlandig, aflandig, |langs| (kn, voorspeld uur), aanlandig, aflandig (kn, nu)].
  var NOWC = {"1":[-0.019,0.9318,0.0088,0.0898,-0.0624,0.0111,0.0078,0.0048,-0.0087,-0.0092],"2":[-0.0383,0.8272,0.0112,0.1641,-0.0777,0.0181,0.0109,0.0104,-0.0123,-0.0129],"3":[-0.0528,0.7206,-0.0012,0.232,-0.0703,0.0244,0.0132,0.0153,-0.015,-0.0154],"4":[-0.0606,0.6564,-0.0593,0.304,-0.0612,0.0296,0.0146,0.0193,-0.0168,-0.0164],"5":[-0.0628,0.6322,-0.1606,0.3808,-0.0506,0.0341,0.0156,0.0225,-0.0183,-0.0166],"6":[-0.06,0.6196,-0.2538,0.4382,-0.0368,0.038,0.0164,0.025,-0.0194,-0.0165],"7":[-0.0532,0.6064,-0.3126,0.458,-0.0177,0.041,0.0172,0.0271,-0.0195,-0.0159],"8":[-0.0449,0.5988,-0.3678,0.4695,0.0024,0.0441,0.0184,0.0289,-0.0197,-0.0157],"9":[-0.0333,0.5782,-0.3646,0.4495,0.0095,0.0464,0.0192,0.0305,-0.019,-0.0151]};

  var NAMES = ["N","NNO","NO","ONO","O","OZO","ZO","ZZO","Z","ZZW","ZW","WZW","W","WNW","NW","NNW"];

  function kind(deg) { return (deg >= 55 && deg <= 165) ? "af" : ((deg >= 245 && deg <= 335) ? "aan" : "zij"); }

  function compass(deg) { return NAMES[Math.round(deg / 22.5) % 16]; }

  // Lokale tijd in Amsterdam voor een uurindex (uren sinds 1970 UTC).
  var FMT = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
  var LC = {};
  function local(u) {
    var k = Math.round(u * 60);
    if (LC[k]) return LC[k];
    var o = {};
    FMT.formatToParts(new Date(u * 36e5)).forEach(function (p) { o[p.type] = p.value; });
    var wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday];
    return (LC[k] = { day: o.year + "-" + o.month + "-" + o.day, h: parseInt(o.hour, 10), m: parseInt(o.minute, 10), wd: wd, dm: parseInt(o.day, 10), mo: parseInt(o.month, 10) - 1 });
  }

  function score(deg, kn, h, L, p) {
    // Golfhoogte als basisscore: 0,7 m = 7, 0,8 m = 8, 0,9 m = 9, vanaf 1 m = 10. Wind en periode kunnen hem verlagen.
    var lim = kind(deg) === "af" ? L.off : L.oth, w;
    var base = Math.min(10, Math.floor(h * 10 + 1e-6));
    if (kn <= lim) w = 1 - 0.1 * Math.max(0, (kn - 6) / 5); else if (kn <= lim + 5) w = 0.35; else if (kn <= lim + 10) w = 0.12; else w = 0;
    var pf = (p === undefined || p === null || p >= L.per) ? 1 : Math.max(0, (p - (L.per - 1.5)) / 1.5) * 0.6;
    return Math.round(base * w * pf);
  }

  function omSeries(json, key, isDir) {
    var arr = (Array.isArray(json) ? json : [json]).filter(function (j) { return j.hourly && j.hourly[key] && j.hourly[key].some(function (v) { return v > 0; }); }), out = {};
    if (!arr.length) return out;
    var t = arr[0].hourly.time;
    t.forEach(function (ts, i) {
      var vs = arr.map(function (j) { return j.hourly[key][i]; }).filter(function (v) { return v !== null && v !== undefined && (isDir || v > 0); });
      if (!vs.length) return;
      var v;
      if (isDir) { var sx = 0, sy = 0; vs.forEach(function (d) { sx += Math.cos(d * Math.PI / 180); sy += Math.sin(d * Math.PI / 180); }); v = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360; }
      else v = vs.reduce(function (a, b) { return a + b; }, 0) / vs.length;
      out[Math.round(ts / 3600)] = v;
    });
    return out;
  }

  // Open-Meteo per uurindex zonder filter (temperatuur mag 0 of lager zijn, weercode 0 = helder).
  function omVals(json, key) {
    var j = Array.isArray(json) ? json[0] : json, out = {};
    if (!j || !j.hourly || !j.hourly[key]) return out;
    j.hourly.time.forEach(function (ts, i) { var v = j.hourly[key][i]; if (v !== null && v !== undefined) out[Math.round(ts / 3600)] = v; });
    return out;
  }

  // Zwaarte van het weer, om ECMWF en GFS te combineren tot het weer van Claude: bij twijfel het nattere/slechtere weer.

  function wxRank(c) { return c >= 95 ? 9 : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 8 : c >= 61 && c <= 67 ? 7 : c >= 80 ? 6 : c >= 51 ? 5 : c >= 45 ? 4 : c; }

  function build(R) {
    var d = { M: {}, rws: R.rws, tides: [] };
    d.M.ECMWF = { h: R.ec ? omSeries(R.ec, "wave_height") : {}, p: R.ec ? omSeries(R.ec, "wave_peak_period") : {}, dir: R.ec ? omSeries(R.ec, "wave_direction", true) : {} };
    // GFS Wave: totaal (gemiddelde periode) plus de twee delen apart: windgolven (ww) en deining (sw).
    d.M.GFS = { h: R.gf ? omSeries(R.gf, "wave_height") : {}, p: R.gf ? omSeries(R.gf, "wave_period") : {}, dir: R.gf ? omSeries(R.gf, "wave_direction", true) : {},
      ww: { h: R.gf ? omSeries(R.gf, "wind_wave_height") : {}, p: R.gf ? omSeries(R.gf, "wind_wave_period") : {}, dir: R.gf ? omSeries(R.gf, "wind_wave_direction", true) : {} },
      sw: { h: R.gf ? omSeries(R.gf, "swell_wave_height") : {}, p: R.gf ? omSeries(R.gf, "swell_wave_period") : {}, dir: R.gf ? omSeries(R.gf, "swell_wave_direction", true) : {} } };
    // Zon: opkomst en ondergang per dag (uurindex met fractie).
    d.sun = {};
    var dl = R.wind && R.wind.daily;
    if (dl) {
      // Bij meerdere modellen heten de velden sunrise_<model>; de zontijden zijn per model gelijk.
      var srk = Object.keys(dl).filter(function (k) { return k.indexOf("sunrise") === 0; })[0], ssk = srk && srk.replace("sunrise", "sunset");
      if (srk && dl[ssk]) dl[srk].forEach(function (sr, i) { var ss = dl[ssk][i]; if (sr && ss) d.sun[local(sr / 3600).day] = { rise: sr / 3600, set: ss / 3600 }; });
    }
    if (R.wind) {
      d.M.ECMWF.kn = omSeries(R.wind, "wind_speed_10m_ecmwf_ifs025"); d.M.ECMWF.g = omSeries(R.wind, "wind_gusts_10m_ecmwf_ifs025"); d.M.ECMWF.deg = omSeries(R.wind, "wind_direction_10m_ecmwf_ifs025", true);
      d.M.GFS.kn = omSeries(R.wind, "wind_speed_10m_gfs_seamless"); d.M.GFS.g = omSeries(R.wind, "wind_gusts_10m_gfs_seamless"); d.M.GFS.deg = omSeries(R.wind, "wind_direction_10m_gfs_seamless", true);
    } else { ["ECMWF", "GFS"].forEach(function (m) { d.M[m].kn = {}; d.M[m].g = {}; d.M[m].deg = {}; }); }
    // Temperatuur (°C), weercode en dag/nacht per model.
    [["ECMWF", "ecmwf_ifs025"], ["GFS", "gfs_seamless"]].forEach(function (x) {
      var M = d.M[x[0]];
      M.t = R.wind ? omVals(R.wind, "temperature_2m_" + x[1]) : {}; M.wc = R.wind ? omVals(R.wind, "weather_code_" + x[1]) : {}; M.day = R.wind ? omVals(R.wind, "is_day_" + x[1]) : {};
    });
    d.now = R.now && R.now.current ? R.now.current : null;
    d.cur = { v: R.cur ? omVals(R.cur, "ocean_current_velocity") : {}, dir: R.cur ? omVals(R.cur, "ocean_current_direction") : {} };
    // Getij: hoog- en laagwater IJmuiden uit het astronomische getij van Rijkswaterstaat (via data/rws.json).
    if (R.rws && R.rws.tides) d.tides = R.rws.tides.map(function (e) { return { u: e[0] / 3600, k: e[1], v: e[2] / 100 }; });
    // Rijkswaterstaat
    measFrom(R.rws, d);
    calibrate(d);
    buildKL(d);
    return d;
  }

  function phase(d, u) {
    var pv = null, nx = null;
    for (var i = 0; i < d.tides.length; i++) { if (d.tides[i].u <= u) pv = d.tides[i]; else { nx = d.tides[i]; break; } }
    if (!pv || !nx) return null;
    if (pv.k === "L") return (nx.u - u <= 2) ? "push" : "rise";
    return (nx.u - u <= 2) ? "low" : "ebb";
  }

  // ---------- Golven die het strand bereiken ----------
  // Een golfveld heeft een gemiddelde richting met spreiding. Met de gangbare cos²-spreiding (windgolven) is het deel
  // van de energie dat richting kust loopt F(a) = 1 - |a|/π + sin(2|a|)/(2π), met a de hoek tussen de richting waar de
  // golven vandaan komen en de normaal van de kust (290°). Golven recht uit zee: F = 1; evenwijdig aan de kust: 0,5;
  // recht van het land af (aflandige windgolven): 0. De hoogte schaalt met de wortel van de energie.
  function angDiff(a, b) { var x = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(x); }
  function shoreFrac(dir) {
    if (dir === undefined || dir === null) return 1;
    var a = angDiff(dir, SHORE) * Math.PI / 180;
    return Math.max(0, Math.min(1, 1 - a / Math.PI + Math.sin(2 * a) / (2 * Math.PI)));
  }
  function seaSide(dir) { return dir !== undefined && dir !== null && angDiff(dir, SHORE) < 90; }
  // Hoogte en periode van wat richting strand loopt, per model. Periode energiegewogen over de delen.
  function shore(d, m, u) {
    var M = d.M[m]; if (!M || M.h[u] === undefined) return null;
    var parts = [];
    if (m === "GFS" && M.ww && M.sw && (M.ww.h[u] !== undefined || M.sw.h[u] !== undefined)) {
      [["wind", M.ww], ["deining", M.sw]].forEach(function (x) {
        var h = x[1].h[u]; if (!h) return;
        parts.push({ k: x[0], h: h, p: x[1].p[u], dir: x[1].dir[u], F: shoreFrac(x[1].dir[u]) });
      });
    }
    if (!parts.length) parts.push({ k: "totaal", h: M.h[u], p: M.p[u], dir: M.dir[u], F: shoreFrac(M.dir[u]) });
    var E = 0, ET = 0, Ep = 0;
    parts.forEach(function (x) { var e = x.h * x.h * x.F; E += e; if (x.p) { ET += e * x.p; Ep += e; } });
    return { h: Math.sqrt(E), p: Ep > 0 ? ET / Ep : undefined, raw: M.h[u], parts: parts };
  }


  function comps(kn, deg) { var r = (deg - 280) * Math.PI / 180, c = kn * Math.cos(r); return { on: Math.max(0, c), off: Math.max(0, -c), al: Math.abs(kn * Math.sin(r)) }; }

  function lastMeas(d, k, maxAge) { var o = d.meas[k]; if (!o || d.end === null) return null; for (var u = d.end; u >= d.end - (maxAge || 2); u--) { if (o[u] !== undefined) return { u: u, v: o[u] }; } return null; }

  // Kalibratie: meting MS2 gedeeld door het gemiddelde van de twee golfmodellen, per golfklasse, naar 1 getrokken bij weinig uren.
  function calibrate(d) {
    d.cal = { lo: 1, hi: 1, nlo: 0, nhi: 0, rawlo: null, rawhi: null, err: {} };
    var ms = d.meas.ms2; if (!ms) return;
    var c = { lo: [0, 0, 0], hi: [0, 0, 0] }, er = { ECMWF: [0, 0, 0], GFS: [0, 0, 0] }, now = nowU();
    Object.keys(ms).map(Number).forEach(function (u) {
      if (u > now) return;
      var a = ms[u] / 100, e = d.M.ECMWF.h[u], g = d.M.GFS.h[u];
      // Alleen uren met golven uit zee: bij aflandige golven meet de boei golven die het strand niet bereiken.
      if (!seaSide(d.M.ECMWF.dir[u])) return;
      if (e !== undefined) { er.ECMWF[0] += Math.abs(a - e); er.ECMWF[1] += a - e; er.ECMWF[2]++; }
      if (g !== undefined) { er.GFS[0] += Math.abs(a - g); er.GFS[1] += a - g; er.GFS[2]++; }
      if (e === undefined || g === undefined) return;
      var m = (e + g) / 2, k = m < 1 ? "lo" : "hi";
      c[k][0] += a; c[k][1] += m; c[k][2]++;
    });
    ["lo", "hi"].forEach(function (k) {
      var x = c[k]; d.cal["n" + k] = x[2];
      if (x[2] && x[1] > 0) { var raw = x[0] / x[1]; d.cal["raw" + k] = raw; d.cal[k] = Math.min(1.6, Math.max(0.8, 1 + (raw - 1) * x[2] / (x[2] + 48))); }
    });
    d.cal.err = er;
  }

  function nowcast(d, u) {
    if (d.end === null || d.end === undefined) return null;
    var L = Math.round(u - d.end);
    if (L < 1 || L > 12) return null;
    var x = ["ms2", "k14", "j6", "l9"].map(function (k) { var m = lastMeas(d, k); return m ? m.v / 100 : null; });
    if (x.some(function (v) { return v === null; })) return null;
    var kn = d.M.ECMWF.kn[u], deg = d.M.ECMWF.deg[u];
    if (kn === undefined) { kn = d.M.GFS.kn[u]; deg = d.M.GFS.deg[u]; }
    var ws = lastMeas(d, "hkn_ws"), wd = lastMeas(d, "hkn_wd");
    if (kn === undefined || !ws || !wd) return null;
    var a = comps(kn, deg), b = comps(ws.v, wd.v), c = NOWC[String(Math.min(L, 9))];
    var f = [1, x[0], x[1], x[2], x[3], a.on, a.off, a.al, b.on, b.off], y = 0;
    f.forEach(function (v, i) { y += v * c[i]; });
    return { h: Math.max(0, y), L: L, w: L <= 3 ? 1 : Math.max(0, (12 - L) / 9) };
  }

  function energy(h, p) { return p ? 0.49 * h * h * p : undefined; }

  function buildKL(d) {
    d.KL = {};
    var us = Object.keys(d.M.ECMWF.h).concat(Object.keys(d.M.GFS.h)).map(Number);
    us.forEach(function (u) {
      if (d.KL[u]) return;
      var raw = [], sh = [], w0 = null;
      ["ECMWF", "GFS"].forEach(function (m) {
        var M = d.M[m], z = shore(d, m, u), kn = M.kn[u], deg = M.deg[u];
        if (!z || kn === undefined) return;
        raw.push(z.raw); sh.push(z); if (!w0) w0 = { kn: kn, deg: deg, g: M.g[u] };
      });
      if (!raw.length) return;
      // Kalibratie op Munitiestort 2 (uren met golven uit zee), per hoogteklasse van de ruwe modellen.
      var rm = raw.reduce(function (a, b) { return a + b; }, 0) / raw.length, cal = rm < 1 ? d.cal.lo : d.cal.hi;
      var base = cal * sh.reduce(function (a, z) { return a + z.h; }, 0) / sh.length;
      var E = 0, ET = 0;
      sh.forEach(function (z) { if (z.p) { E += z.h * z.h; ET += z.h * z.h * z.p; } });
      var pv = E > 0 ? ET / E : undefined;
      var ph = phase(d, u), hi = base >= 1;
      var f = ph === "push" ? (hi ? TF.pushhi : TF.push) : ph === "ebb" ? (hi ? TF.ebbhi : TF.ebb) : ph === "low" ? (hi ? TF.lowhi : TF.low) : TF.rise;
      var mod = base * f, nc = nowcast(d, u);
      // De boei meet ook golven die van de kust af lopen: alleen het deel richting strand telt (zelfde F als het model).
      var Fe = shoreFrac(d.M.ECMWF.dir[u]);
      if (nc) nc.h = nc.h * Math.sqrt(Fe);
      var hv = nc ? nc.w * nc.h + (1 - nc.w) * mod : mod;
      // Deining van GFS apart, alleen als die vanuit zee komt.
      var G = d.M.GFS, sw = null;
      if (G.sw && G.sw.h[u] && seaSide(G.sw.dir[u])) sw = { h: G.sw.h[u] * Math.sqrt(shoreFrac(G.sw.dir[u])), p: G.sw.p[u], dir: G.sw.dir[u] };
      // Weer van Claude: gemiddelde temperatuur van ECMWF en GFS; als ze verschillen het nattere/slechtere weer.
      var ts = [], wc, dy;
      ["ECMWF", "GFS"].forEach(function (m) {
        var M = d.M[m]; if (M.t[u] !== undefined) ts.push(M.t[u]);
        if (M.wc[u] !== undefined && (wc === undefined || wxRank(M.wc[u]) > wxRank(wc))) wc = M.wc[u];
        if (dy === undefined && M.day[u] !== undefined) dy = M.day[u];
      });
      var tv = ts.length ? ts.reduce(function (a, b) { return a + b; }, 0) / ts.length : undefined;
      d.KL[u] = { h: hv, mod: mod, nc: nc, p: pv, e: energy(hv, pv), w: w0, ph: ph, f: f, t: tv, wc: wc, day: dy, sea: seaSide(d.M.ECMWF.dir[u]), Fe: Fe, sw: sw, raw: rm };
    });
  }


  function nowU() { return Date.now() / 36e5; }
  var MODELS = ["ECMWF", "GFS", "Klodde"];
  var LIM0 = { wave: 0.8, per: 5.5, off: 16, oth: 6 };

  // Metingen uit rws.json als {sleutel: {uur: waarde}}, plus het laatste meetuur.
  function measFrom(rws, d) {
    d.meas = {}; d.end = null;
    if (rws && rws.s) {
      var s0 = rws.start;
      Object.keys(rws.s).forEach(function (k) { var o = {}; rws.s[k].forEach(function (v, i) { if (v !== null) o[s0 + i] = v; }); d.meas[k] = o; });
      var ms = Object.keys(d.meas.ms2 || {}).map(Number);
      d.end = ms.length ? Math.max.apply(null, ms) : null;
    }
    return d;
  }
  function cell(d, m, u) {
    if (m === "Klodde") { var k = d.KL[u]; return k ? { v: k.h, p: k.p, w: k.w, t: k.t, wc: k.wc, day: k.day } : null; }
    var M = d.M[m], z = shore(d, m, u);
    if (!z || M.kn[u] === undefined) return null;
    return { v: z.h, raw: z.raw, p: z.p, w: { kn: M.kn[u], deg: M.deg[u], g: M.g[u] }, t: M.t && M.t[u], wc: M.wc && M.wc[u], day: M.day && M.day[u] };
  }
  // Score van één model op één uur, met de getijregels (push +1, laatste 2 uur voor LW bij golf < 1 m -1).
  function hourCell(d, m, u, L) {
    var c = cell(d, m, u); if (!c) return null;
    var sc = score(c.w.deg, c.w.kn, c.v, L, c.p), ph = phase(d, u);
    if (ph === "push" && sc >= 5) sc = Math.min(10, sc + 1);
    if (ph === "low" && c.v < 1 && sc > 0) sc = sc - 1;
    c.s = sc; return c;
  }
  function darkU(d, u) {
    var s = d.sun && d.sun[local(u).day];
    if (!s) { var h = local(u).h; return h < 8 || h >= 17; }
    return u + 1 <= s.rise || u >= s.set;
  }
  // Alert-blokken: aaneengesloten uren overdag (nog niet voorbij) met Claude-score >= 7 en golf >= alertgrens.
  function alertRuns(d, L) {
    L = L || LIM0;
    var now = nowU(), runs = [], cur = null;
    Object.keys(d.KL).map(Number).sort(function (a, b) { return a - b; }).forEach(function (u) {
      if (u + 1 <= now || darkU(d, u)) { cur = null; return; }
      var c = hourCell(d, "Klodde", u, L);
      if (c && c.s >= 7 && c.v >= L.wave) {
        var en = d.KL[u].e || 0, day = local(u).day;
        if (cur && cur.day === day && u === cur.us[cur.us.length - 1] + 1) { cur.us.push(u); cur.cs.push(c); cur.sum += c.s; cur.en += en; }
        else { cur = { day: day, us: [u], cs: [c], sum: c.s, en: en }; runs.push(cur); }
      } else cur = null;
    });
    return runs;
  }

  // ---------- Leren van eerdere voorspellingen ----------
  // Vooruittermijnen (uren) waarvoor elke voorspelling wordt bewaard en later naast de meting gelegd.
  var LEADS = [1, 3, 6, 12, 24, 36, 48, 72, 96, 120];
  // Gemiddelde afwijking (Claude - meting) op een vooruittermijn, uit de bijgehouden statistiek; lineair tussen de termijnen.
  function leadStat(V, lead, key) {
    if (!V || !V.sum) return null;
    function at(Lx) { var x = V.sum[Lx]; return x && x.n >= 20 ? { n: x.n, mae: x.a / x.n, bias: x.b / x.n } : null; }
    var lo = null, hi = null;
    LEADS.forEach(function (Lx) { if (Lx <= lead) lo = Lx; if (Lx >= lead && hi === null) hi = Lx; });
    if (lo === null) lo = hi; if (hi === null) hi = lo;
    var a = at(lo), b = at(hi);
    if (!a || !b) return a || b;
    var f = hi === lo ? 0 : (lead - lo) / (hi - lo);
    return { n: Math.min(a.n, b.n), mae: a.mae + (b.mae - a.mae) * f, bias: a.bias + (b.bias - a.bias) * f };
  }
  // Correctie per vooruittermijn: de gemiddelde afwijking, afgezwakt bij weinig metingen en hoogstens 10 cm.
  function applyLeadBias(d, V, issued) {
    if (!V) return;
    Object.keys(d.KL).forEach(function (k) {
      var u = Number(k), lead = u - issued; if (lead < 1) return;
      var st = leadStat(V, lead); if (!st) return;
      var corr = Math.max(-0.1, Math.min(0.1, st.bias * st.n / (st.n + 150)));
      var K = d.KL[k]; K.lb = corr; K.h = Math.max(0, K.h - corr); K.e = energy(K.h, K.p);
    });
  }
  // Nieuwe voorspelling vastleggen en oude voorspellingen afrekenen tegen de meting bij Munitiestort 2.
  function verifyStep(d, V, issued) {
    // Versie 2 (26 nov): alleen golven richting strand; oudere statistiek is niet vergelijkbaar en begint opnieuw.
    if (!V || V.ver !== 2) V = { ver: 2 };
    V.pend = V.pend || {}; V.sum = V.sum || {}; V.mod = V.mod || {};
    var iu = Math.floor(issued);
    if (!V.last || V.last < iu) {
      V.last = iu;
      LEADS.forEach(function (Lx) {
        var u = iu + Lx, k = d.KL[u]; if (!k || !k.sea) return;   // alleen uren met golven uit zee zijn met de boei te vergelijken
        var ce = cell(d, "ECMWF", u), cg = cell(d, "GFS", u);
        (V.pend[u] = V.pend[u] || []).push([Lx, +(k.h).toFixed(3), ce ? +ce.v.toFixed(3) : null, cg ? +cg.v.toFixed(3) : null]);
      });
    }
    var ms = d.meas.ms2 || {};
    Object.keys(V.pend).forEach(function (k) {
      var u = Number(k);
      if (ms[u] !== undefined) {
        var a = ms[u] / 100;
        V.pend[k].forEach(function (r) {
          var s = V.sum[r[0]] = V.sum[r[0]] || { n: 0, a: 0, b: 0 };
          s.n++; s.a += Math.abs(r[1] - a); s.b += r[1] - a;
          [["ECMWF", r[2]], ["GFS", r[3]]].forEach(function (x) {
            if (x[1] === null) return;
            var mm = V.mod[x[0]] = V.mod[x[0]] || {}, t = mm[r[0]] = mm[r[0]] || { n: 0, a: 0, b: 0 };
            t.n++; t.a += Math.abs(x[1] - a); t.b += x[1] - a;
          });
        });
        delete V.pend[k];
      } else if (d.end !== null && u < d.end - 24) delete V.pend[k];   // meting ontbreekt
    });
    // Oude uren laten langzaam uitdoven (halveringstijd ongeveer 30 dagen), zodat de statistiek meegroeit met het seizoen.
    var dec = Math.pow(0.5, 1 / (30 * 24 * 4));
    [V.sum, V.mod.ECMWF || {}, V.mod.GFS || {}].forEach(function (o) { Object.keys(o).forEach(function (Lx) { var s = o[Lx]; s.n *= dec; s.a *= dec; s.b *= dec; }); });
    return V;
  }

  // ---------- Klaargezette voorspelling (forecast.json) ----------
  function rnd(o, dg) { var out = {}, f = Math.pow(10, dg); Object.keys(o || {}).forEach(function (k) { var v = o[k]; out[k] = typeof v === "number" ? Math.round(v * f) / f : v; }); return out; }
  function only(o, from, dg) { var out = {}; Object.keys(o || {}).forEach(function (k) { if (Number(k) >= from) out[k] = o[k]; }); return dg === undefined ? out : rnd(out, dg); }
  function pack(d, V) {
    var from = Math.floor(nowU()) - 36, M = {};
    ["ECMWF", "GFS"].forEach(function (m) {
      var x = d.M[m];
      M[m] = { h: only(x.h, from, 2), p: only(x.p, from, 1), dir: only(x.dir, from, 0),
        ww: x.ww ? { h: only(x.ww.h, from, 2), p: only(x.ww.p, from, 1), dir: only(x.ww.dir, from, 0) } : undefined,
        sw: x.sw ? { h: only(x.sw.h, from, 2), p: only(x.sw.p, from, 1), dir: only(x.sw.dir, from, 0) } : undefined, kn: only(x.kn, from, 1), g: only(x.g, from, 1), deg: only(x.deg, from, 0), t: only(x.t, from, 1), wc: only(x.wc, from), day: only(x.day, from) };
    });
    var KL = {};
    Object.keys(d.KL).forEach(function (k) {
      if (Number(k) < from) return;
      var K = d.KL[k];
      KL[k] = { h: +K.h.toFixed(3), p: K.p === undefined ? undefined : +K.p.toFixed(1), e: K.e === undefined ? undefined : +K.e.toFixed(2), w: K.w ? { kn: +K.w.kn.toFixed(1), deg: Math.round(K.w.deg), g: K.w.g === undefined ? undefined : +K.w.g.toFixed(1) } : null,
        t: K.t === undefined ? undefined : +K.t.toFixed(1), wc: K.wc, day: K.day, nc: K.nc ? { h: +K.nc.h.toFixed(3), w: +K.nc.w.toFixed(2), L: K.nc.L } : null, lb: K.lb === undefined ? undefined : +K.lb.toFixed(3),
        sea: K.sea, Fe: +K.Fe.toFixed(2), raw: +K.raw.toFixed(2), sw: K.sw ? { h: +K.sw.h.toFixed(2), p: K.sw.p === undefined ? undefined : +K.sw.p.toFixed(1), dir: Math.round(K.sw.dir) } : null };
    });
    var stats = null;
    if (V && V.sum) { stats = {}; LEADS.forEach(function (Lx) { var s = leadStat(V, Lx); if (s && V.sum[Lx] && V.sum[Lx].n >= 20) {
      var o = stats[Lx] = { n: Math.round(s.n), mae: +s.mae.toFixed(3), bias: +s.bias.toFixed(3) };
      [["ec", "ECMWF"], ["gf", "GFS"]].forEach(function (m) { var t = V.mod[m[1]] && V.mod[m[1]][Lx]; if (t && t.n >= 20) o[m[0]] = +(t.a / t.n).toFixed(3); });
    } }); }
    return { v: 1, made: Date.now(), end: d.end, M: M, KL: KL, sun: d.sun, tides: d.tides, cur: { v: only(d.cur.v, from, 2), dir: only(d.cur.dir, from, 0) }, now: d.now, cal: d.cal, stats: stats };
  }
  function unpack(F, rws) {
    var d = { M: F.M, KL: F.KL, sun: F.sun || {}, tides: F.tides || [], cur: F.cur || { v: {}, dir: {} }, now: F.now, cal: F.cal, stats: F.stats, rws: rws, made: F.made, packed: true };
    measFrom(rws, d);
    return d;
  }

  var E = { TZ: TZ, URLS: URLS, NAMES: NAMES, MODELS: MODELS, LIM0: LIM0, LEADS: LEADS, kind: kind, compass: compass, local: local, nowU: nowU, score: score, omSeries: omSeries, omVals: omVals, wxRank: wxRank,
    build: build, measFrom: measFrom, shore: shore, shoreFrac: shoreFrac, seaSide: seaSide, phase: phase, lastMeas: lastMeas, energy: energy, cell: cell, hourCell: hourCell, darkU: darkU, alertRuns: alertRuns,
    leadStat: leadStat, applyLeadBias: applyLeadBias, verifyStep: verifyStep, pack: pack, unpack: unpack };
  if (typeof module !== "undefined" && module.exports) module.exports = E; else root.GolfEngine = E;
})(typeof self !== "undefined" ? self : this);
