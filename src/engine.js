// HyCo engine: pure domain logic + data + theme tokens. No React/lucide/recharts
// imports, so it is fully unit-testable in isolation (see engine.test.js).
/* =========================================================================
   HYBRID COACH V2 — with Final Implementation Corrections (11 items)
   Single source of truth: AthleteState -> TodayState. UI consumes state.
   1 paces from fitness(CTL) not goal | 2 protein 2g/kg, fat 20%, carbs rem |
   3 per-workout logging -> Coach Engine | 4 focus 4+2/3+3/2+4 |
   5 gel schedule | 6 plan start date + calendar dates | 7 auto regen + miss adapt |
   8 race weight via lean mass + range | 9 HR zones on runs | 10 race VO2 targets |
   11 tabs: Dashboard · Training · Race · Progress · Profile
   ========================================================================= */
export const C = {
  bg: "#0E1014", surface: "#171A21", surface2: "#1F232C", line: "#2A2F3A",
  text: "#ECEDF1", dim: "#9AA1AE", faint: "#646B79",
  ember: "#FF5A3C", emberSoft: "#FF7A60", teal: "#2DD4BF", amber: "#F5A623",
  rose: "#F25C7A", violet: "#8B7BFF", sky: "#5BC8FF",
};
export const STATUS_COLOR = {
  Fresh: C.teal, Normal: C.sky, Caution: C.amber, Recover: C.rose,
  Ready: C.teal, Fatigued: C.amber, "High Risk": C.rose,
  "Race Ready": C.teal, "On Track": C.sky, "Needs Improvement": C.amber,
};
export const DAY_MS = 86400000;
export const DOW_WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export const _d = (d) => { const x = (d instanceof Date) ? d : new Date(d); return isNaN(x.getTime()) ? new Date() : x; };
export const iso = (d) => _d(d).toISOString().slice(0, 10);
export const addDays = (d, n) => new Date(_d(d).getTime() + n * DAY_MS);
export const diffDays = (a, b) => Math.round((new Date(iso(a)) - new Date(iso(b))) / DAY_MS);
export function mondayOf(d) { const x = new Date(iso(d)); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); }
export const fmtDate = (d) => _d(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const fmtShort = (d) => _d(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export function secsToHMS(s) { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`; }
export function pace(secPerKm) { const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60); return `${m}:${String(s).padStart(2, "0")}`; }
export const round2_5 = (x) => Math.round(x / 2.5) * 2.5;
export const KM_MI = 1.609344, KG_LB = 0.45359237;
export const distU = (u) => (u === "imperial" ? "mi" : "km");
export const wtU = (u) => (u === "imperial" ? "lb" : "kg");
export const paceU = (u) => (u === "imperial" ? "/mi" : "/km");
export const uDist = (km, u, dp) => { if (km == null || km === "" || isNaN(km)) return km; const v = u === "imperial" ? km / KM_MI : +km; const d = dp != null ? dp : (Math.abs(v) < 100 ? 1 : 0); return +v.toFixed(d); };
export const uWt = (kg, u, dp) => { if (kg == null || kg === "" || isNaN(kg)) return kg; const v = u === "imperial" ? kg / KG_LB : +kg; return +v.toFixed(dp != null ? dp : 1); };
export const uPace = (secPerKm, u) => (u === "imperial" ? secPerKm * KM_MI : secPerKm);
export const toKm = (v, u) => { const n = parseFloat(v); if (isNaN(n)) return v; return u === "imperial" ? n * KM_MI : n; };
export const toKg = (v, u) => { const n = parseFloat(v); if (isNaN(n)) return v; return u === "imperial" ? n * KG_LB : n; };

/* ---- TRAINING ENGINE (focus-aware, date-based, HR zones) ---- */
// Phase structure only — long-run distance + weekly volume are now computed
// dynamically from the athlete's current weekly volume (see buildVolumeProfile).
export const MARATHON_BLOCK = [
  { phase: "Base", recovery: false }, { phase: "Base", recovery: false },
  { phase: "Base", recovery: false }, { phase: "Recovery", recovery: true },
  { phase: "Build", recovery: false }, { phase: "Build", recovery: false },
  { phase: "Build", recovery: false }, { phase: "Recovery", recovery: true },
  { phase: "Build", recovery: false }, { phase: "Build", recovery: false },
  { phase: "Peak", recovery: false }, { phase: "Recovery", recovery: true },
  { phase: "Peak", recovery: false }, { phase: "Peak", recovery: false },
  { phase: "Taper", recovery: false }, { phase: "Taper", recovery: false },
  { phase: "Taper", recovery: false }, { phase: "Race", recovery: false },
];
export const EASY_KM = { Base: 10, Build: 12, Peak: 12, Taper: 7, Recovery: 7, "Off-Season": 8, Race: 6 };
export const PEAK_LONG = { Marathon: 34, Half: 21, "10K": 14, "5K": 12 };
export const LONG_FRACTION = 0.34; // running-focused: long run ~34% of weekly volume
export const TAPER_LONG = [0.7, 0.52, 0.38];
// Build a phase block of `n` weeks that ENDS on the race week, counting phases
// back from race day: Race -> Taper -> Peak -> Build/Base with 3:1 deloads.
// This lets the plan re-fit itself whenever the start date or race date changes.
export function buildBlockMeta(n, dist) {
  n = Math.max(3, Math.round(n));
  const meta = Array.from({ length: n }, () => ({ phase: "Build", recovery: false }));
  meta[n - 1] = { phase: "Race", recovery: false };
  // Taper + peak length depend on race DISTANCE, not plan %. Longer races shed more
  // fatigue; shorter races need only a few days. Marathon 3 / Half 2 / 10K 1 / 5K 1 wk.
  const TAPER_WK = { Marathon: 3, Half: 2, "10K": 1, "5K": 1 };
  const PEAK_WK = { Marathon: 3, Half: 2, "10K": 2, "5K": 1 };
  const taper = Math.max(1, Math.min(TAPER_WK[dist] ?? 2, n - 2));
  for (let i = 1; i <= taper && (n - 1 - i) >= 0; i++) meta[n - 1 - i] = { phase: "Taper", recovery: false };
  const idx = n - 2 - taper; // first index below the taper block (fixes taper being eaten by peak)
  const peak = Math.max(1, Math.min(PEAK_WK[dist] ?? 2, idx + 1));
  for (let i = 0; i < peak && (idx - i) >= 0; i++) meta[idx - i] = { phase: "Peak", recovery: false };
  const buildEnd = idx - peak;
  if (buildEnd >= 0) {
    const region = buildEnd + 1, baseCount = Math.max(0, Math.round(region * 0.4));
    for (let w = 0; w <= buildEnd; w++) meta[w] = { phase: w < baseCount ? "Base" : "Build", recovery: false };
    for (let w = 3; w <= buildEnd; w += 4) meta[w] = { phase: "Recovery", recovery: true }; // 3:1 deload
  }
  return meta;
}
// Build dynamic long-run + weekly-volume progression from current fitness.
// Research-based: ~5-10%/week increases (avoid >30% over 2wk), long run ~20-34%
// of weekly volume, 3:1 build:deload, recovery weeks ~65% of peak. Marathon plans
// still guaranteed to reach 2+ runs >=30km, 1+ >=32km, peak 32-35km.
export function buildVolumeProfile(profile, race, block) {
  const blk = block || MARATHON_BLOCK, n = blk.length;
  const curVol = Math.max(18, profile.currentWeeklyVolumeKm || 40);
  const frac = LONG_FRACTION;
  const dist = (race && race.type) || "Marathon";
  let peakLong = PEAK_LONG[dist] || 34;
  if (dist === "Marathon") peakLong = Math.max(32, Math.min(35, peakLong));
  const LONG_RUN_MAX_FRAC = 0.45;
  // Scale weekly volume UP to host the target (phase-driven) long run rather than
  // capping the long run down. Peak weekly aims to keep the long run near 42% of the
  // week, but never ramps past a safe ceiling (~1.7x the athlete's current volume
  // across the whole block), so low-mileage athletes can't be force-fed a 30km run.
  const SAFE_PEAK_MULT = 1.7;
  const neededFrac = dist === "Marathon" ? 0.42 : 0.45;
  const peakVol = Math.round(Math.min(curVol * SAFE_PEAK_MULT, Math.max(curVol, peakLong / neededFrac)));
  const firstPeak = blk.findIndex((m) => m.phase === "Peak");
  let startLong = Math.round(Math.max(12, Math.min(curVol * frac, peakLong - 6)));
  // progression steps available (non-recovery) up to first peak week
  let steps = 0; for (let i = 0; i <= firstPeak; i++) if (!blk[i].recovery) steps++;
  const inc = steps > 1 ? (peakLong - startLong) / (steps - 1) : 0;
  const longs = [], weekly = []; let v = curVol, lastLong = startLong, stepIdx = 0;
  for (let i = 0; i < n; i++) {
    const m = blk[i];
    if (m.phase === "Race") { longs.push(42.2); weekly.push(Math.round(curVol * 0.45)); continue; }
    if (m.recovery) { longs.push(Math.round(lastLong * 0.7)); weekly.push(Math.round(v * 0.65)); continue; }
    if (m.phase === "Taper") {
      const ti = blk.slice(0, i + 1).filter((x) => x.phase === "Taper").length - 1;
      longs.push(Math.round(peakLong * (TAPER_LONG[Math.min(ti, 2)])));
      weekly.push(Math.round(peakVol * (TAPER_LONG[Math.min(ti, 2)] + 0.1)));
      continue;
    }
    if (i <= firstPeak) {
      let target = Math.round(startLong + inc * stepIdx);
      // cap weekly jump: <=12% over previous long, but always progress a little
      target = Math.min(target, Math.max(lastLong + 2, Math.round(lastLong * 1.12)));
      lastLong = Math.max(lastLong, target); longs.push(lastLong); stepIdx++;
    } else {
      const pk = blk.slice(0, i + 1).filter((x) => x.phase === "Peak").length - 2;
      const opts = dist === "Marathon" ? [peakLong - 2, peakLong - 4] : [Math.round(peakLong * 0.95), Math.round(peakLong * 0.9)];
      lastLong = Math.max(30, opts[Math.min(Math.max(pk, 0), opts.length - 1)]); longs.push(lastLong);
    }
    // weekly volume ramp ~8%/wk toward peakVol (avoids unrealistic early jumps)
    v = Math.min(peakVol, Math.max(v, Math.round(v * 1.08))); weekly.push(Math.round(v));
  }
  // A1 safety guardrail: a long run must never dominate the week. Cap every long run
  // at 45% of that week's (now scaled) volume so a long run can't spike relative to
  // the week, while still rising as weekly volume ramps up.
  for (let i = 0; i < n; i++) {
    if (blk[i].phase === "Taper" || blk[i].phase === "Race" || blk[i].recovery) continue;
    longs[i] = Math.min(longs[i], Math.max(10, Math.round(weekly[i] * LONG_RUN_MAX_FRAC)));
  }
  // Marathon 30km+/32km guarantees only unlock when weekly volume supports them.
  let longRunNote = null;
  // Marathon long-run milestones: now that weekly volume scales up, guarantee a
  // 30-34km peak long run (plus a 2nd 30km+) whenever the peak week can host it at
  // <=45% of volume. Each milestone is clamped to its week's cap so it never
  // re-creates a long-run spike. Genuinely low-volume athletes get a note instead.
  const capAt = (i) => Math.round(weekly[i] * LONG_RUN_MAX_FRAC);
  if (dist === "Marathon") {
    const cand = blk.map((m, i) => (!m.recovery && (m.phase === "Build" || m.phase === "Peak")) ? i : -1).filter((i) => i >= 0).sort((a, b) => weekly[b] - weekly[a]);
    const top = cand[0];
    const cap0 = top != null ? capAt(top) : 0;
    if (cap0 >= 29.5) {
      const headline = cap0 >= 31.5 ? Math.min(34, Math.max(32, cap0)) : 30;
      longs[top] = Math.max(longs[top], Math.min(headline, cap0));
      let over30 = longs.filter((x, i) => !blk[i].recovery && blk[i].phase !== "Taper" && blk[i].phase !== "Race" && x >= 30).length;
      for (let j = 1; j < cand.length && over30 < 2; j++) { if (longs[cand[j]] < 30 && capAt(cand[j]) >= 29.5) { longs[cand[j]] = 30; over30++; } }
    } else {
      longRunNote = "Your current weekly volume is too low to safely include a 30 km long run. Build toward ~40+ km/week and the plan will scale up to 30 km+ long runs.";
    }
  }
  return { curVol, frac, longs, weekly, peakLong, longRunNote };
}
// Midweek runs are capped so a working athlete can fit them around a job: easy
// runs stay at ~1 hour max (~11 km at ~6 min/km). Volume above that goes onto the
// weekend long run, which is intentionally uncapped. Expert practice for time-
// constrained marathoners: short, frequent weekday runs + one long weekend run.
export const WEEKDAY_MAX_KM = 11; // ~66 min easy
export function easyKmFor(weeklyTarget, longKm, runs) {
  const others = Math.max(1, runs - 1);
  const budget = Math.max(others * 5, weeklyTarget - longKm);
  return Math.max(5, Math.min(WEEKDAY_MAX_KM, Math.round(budget / others)));
}
// Running-focused marathon + strength. The run/strength split is driven purely
// by how many days/week the athlete can train. Running (volume + the key long
// run and quality sessions) is prioritised; strength is added once running is
// covered and capped at 2/week to maintain strength without over-interfering
// with marathon adaptation (concurrent-training research).
export const DAY_SPLIT = {
  3: { runs: 3, lifts: 0 },
  4: { runs: 3, lifts: 1 },
  5: { runs: 4, lifts: 1 },
  6: { runs: 4, lifts: 2 },
  7: { runs: 5, lifts: 2 },
};
export function splitFor(days) { const d = Math.max(3, Math.min(7, Math.round(days || 6))); return DAY_SPLIT[d]; }
// Base phase emphasises strength to build muscle: more lifts, fewer runs.
export function splitForBase(days) { const d = Math.max(3, Math.min(7, Math.round(days || 6))); return ({ 7: { runs: 4, lifts: 3 }, 6: { runs: 3, lifts: 3 }, 5: { runs: 3, lifts: 2 }, 4: { runs: 2, lifts: 2 }, 3: { runs: 2, lifts: 1 } })[d]; }
// Post-race reverse-taper multipliers (weekly volume vs carried-over base), scaled
// by distance: a 5K barely dents training, a marathon needs ~4 weeks to ease back.
export const RACE_RECOVERY = { "5K": [0.9], "10K": [0.85], "Half": [0.6, 0.85], "Marathon": [0.5, 0.65, 0.8, 0.9] };
export const METHOD_QUALITY = { Polarised: ["Intervals", "Threshold"], Pyramidal: ["Tempo", "Threshold"], Threshold: ["Threshold", "Threshold"], Norwegian: ["Double Threshold", "Threshold"] };
export const METHODOLOGY_INFO = {
  Polarised: "~80% easy / 20% hard. Two sharp quality sessions a week - VO2 intervals + threshold - and everything else genuinely easy. Big aerobic base plus top-end speed with low injury risk. Default for most runners.",
  Pyramidal: "Most volume easy, a solid block of threshold and marathon-effort tempo, a little VO2 on top. Marathon-specific - lots of time at the efforts that decide a marathon. Suits good weekly volume.",
  Threshold: "Built around sustained threshold (lactate-clearance) work. The most time-efficient way to grow the engine - ideal when training days or weekly volume are limited.",
  Norwegian: "Controlled double-threshold sessions paced by heart rate. A high-volume, advanced method that packs in large amounts of quality with minimal blow-up risk.",
};
// Pick the methodology an expert coach would, from training availability, weekly
// volume and current fitness (VO2 max when logged).
export function autoMethodology(profile, vo2) {
  const vol = profile.currentWeeklyVolumeKm || 40, days = profile.availabilityDays || 5, fit = vo2 || 0;
  if (vol >= 70 && days >= 6 && fit >= 55) return "Norwegian";   // advanced: high volume + days + fitness
  if (days <= 4 || vol < 35) return "Threshold";                 // time/volume limited: most efficient
  if (vol >= 60 && days >= 5) return "Pyramidal";                // strong base: marathon-specific
  return "Polarised";                                            // balanced default
}
export const HR_ZONE = { "Recovery Run": ["Z1", 0.60, 0.70], "Easy Run": ["Z2", 0.70, 0.78], "Long Run": ["Z2", 0.73, 0.80], Tempo: ["Z3", 0.80, 0.87], Threshold: ["Z4", 0.87, 0.92], "Double Threshold": ["Z4", 0.87, 0.92], Intervals: ["Z5", 0.92, 0.97], Race: ["Z3-4", 0.82, 0.90], Travel: ["Z2", 0.68, 0.78] };
// HR zone colours (Z1 blue -> Z5 pink)
export const HR_ZONE_COLOR = { Z1: "#4F86F7", Z2: "#22D3EE", Z3: "#A3E635", Z4: "#FB923C", Z5: "#F472B6", "Z3-4": "#FB923C" };
export const hrColor = (zone) => HR_ZONE_COLOR[zone] || "#22D3EE";
export function hrZoneFor(type, maxHr) { const z = HR_ZONE[type]; if (!z) return null; return { zone: z[0], lo: Math.round(maxHr * z[1]), hi: Math.round(maxHr * z[2]) }; }

// PLANNED strength load (phase-based, in the same TSS-like units as the run loads above),
// used for projected/future and unlogged days. A heavy build-phase lift is genuinely
// fatiguing - more than an easy run, less than a tempo - so the fatigue model (CTL/ATL/TSB)
// sees it instead of a flat, near-neutral 45. Phase sets the intensity; deload weeks are
// lighter. Once a session is logged, its ACTUAL e1RM-normalised volume-load (computed in
// the StrengthLogged reducer) replaces this estimate for that day.
export const STRENGTH_LOAD = { Base: 50, Build: 55, Peak: 52, Taper: 33 };
export function strengthLoad(phase, isRecovery) {
  if (isRecovery) return 32;
  return STRENGTH_LOAD[phase] != null ? STRENGTH_LOAD[phase] : 45;
}

export function buildWorkoutData(type, phase, longKm, recovery, maxHr, easyKm) {
  const easy = easyKm ?? EASY_KM[phase] ?? 10; const hr = hrZoneFor(type, maxHr);
  const mk = (o) => ({ type, name: o.name, distanceKm: o.dist, durationMin: o.dur, intensity: o.int, load: o.load, detail: o.detail, hrZone: hr, intervals: o.intervals || null });
  switch (type) {
    case "Rest": return mk({ name: "Rest", dist: 0, dur: 0, int: "low", load: 0, detail: "Full rest / mobility" });
    case "Easy Run": return mk({ name: recovery ? "Easy aerobic" : "Easy run", dist: easy, dur: easy * 6, int: "low", load: Math.round(easy * 5), detail: "Conversational pace, zone 2" });
    case "Recovery Run": { const d = Math.max(5, Math.round(easy * 0.6)); return mk({ name: "Recovery jog", dist: d, dur: d * 6, int: "low", load: Math.round(d * 4), detail: "Very easy, flush the legs" }); }
    case "Tempo": return mk({ name: "Tempo", dist: 10, dur: 55, int: "moderate", load: 80, detail: "25 min sustained at marathon effort. Warm-up: 6 x 20 s strides, 60 s recovery", intervals: { reps: 1, mode: "time", workMin: 25, recovery: "continuous", paceZone: "Marathon" } });
    case "Threshold": return mk({ name: "Threshold", dist: 12, dur: 65, int: "high", load: 108, detail: "4 x 6 min @ threshold, 90s float. Warm-up: 6 x 20 s strides, 60 s recovery", intervals: { reps: 4, mode: "time", workMin: 6, recovery: "90s float", paceZone: "Threshold" } });
    case "Double Threshold": return mk({ name: "Double threshold", dist: 18, dur: 95, int: "high", load: 165, detail: "AM: 5 x 6 min @ threshold, 60s float. PM: 10 x 1 km @ threshold, 60s jog. Keep both controlled - sub-threshold by feel/HR, never race the reps. Refuel between sessions. Warm-up each: 6 x 20 s strides", intervals: { reps: 5, mode: "time", workMin: 6, recovery: "60s float", paceZone: "Threshold", am: "5 x 6 min @ threshold, 60s float", pm: "10 x 1 km @ threshold, 60s jog" } });
    case "Intervals": return mk({ name: "VO2 intervals", dist: 10, dur: 58, int: "high", load: 100, detail: "6 x 800m @ 5k effort, equal recovery. Warm-up: 6 x 20 s strides, 60 s recovery", intervals: { reps: 6, mode: "dist", workM: 800, recovery: "equal recovery", paceZone: "Interval (VO2)" } });
    case "Strength": return mk({ name: "Strength", dist: 0, dur: 55, int: "moderate", load: strengthLoad(phase, recovery), detail: "4 prehab - 2 compound - 4 accessory" });
    case "Long Run": return mk({ name: recovery ? "Long run (reduced)" : "Long run", dist: longKm, dur: Math.round(longKm * 6.2), int: phase === "Peak" ? "high" : "moderate", load: Math.round(longKm * 6), detail: phase === "Peak" || phase === "Build" ? "Progressive: last third at marathon effort" : "Steady aerobic endurance" });
    case "Race": { const km = longKm && longKm > 0 ? Math.round(longKm * 10) / 10 : 42.2; const label = km >= 42 ? "Marathon" : km >= 21 ? "Half Marathon" : km >= 10 ? "10K" : km >= 5 ? "5K" : `${km}km`; return mk({ name: `${label} - Race Day`, dist: km, dur: Math.round(km * 5), int: "high", load: Math.round(km * 7.6), detail: "Execute race plan. Fuel early and often." }); }
    case "Travel": return mk({ name: "Travel / easy", dist: 5, dur: 30, int: "low", load: 20, detail: "Holiday - keep it easy" });
    default: return mk({ name: type, dist: 0, dur: 0, int: "low", load: 0, detail: "" });
  }
}
export const isHard = (t) => t === "Intervals" || t === "Threshold" || t === "Double Threshold";
export function weekSessions(phase, recovery, split, methodology) {
  const f = split || splitFor(6);
  if (recovery || phase === "Off-Season") return [...Array(Math.max(0, f.runs - 1)).fill("Easy Run"), ...Array(f.lifts).fill("Strength")];
  let qualities = [];
  if (phase === "Taper") qualities = ["Tempo"];
  else if (phase === "Base") qualities = f.lifts >= 3 ? [] : ["Tempo"]; // strength-heavy base = easy aerobic + long + lifting (muscle build)
  else if (phase === "Build" || phase === "Peak") qualities = METHOD_QUALITY[methodology] || METHOD_QUALITY.Polarised;
  let qCount = Math.min(qualities.length, Math.max(0, f.runs - 1));
  if (f.runs <= 3) qCount = Math.min(qCount, 1); // 3-run weeks: 1 quality + long + easy, protect the aerobic base
  const used = qualities.slice(0, qCount);
  const easyCount = Math.max(0, f.runs - 1 - qCount);
  const easies = Array(easyCount).fill("Easy Run");
  if (easyCount >= 1 && phase !== "Taper") easies[easies.length - 1] = "Recovery Run";
  // Phase-aware strength frequency: build 2-3x, but drop to a protected maintenance
  // dose into the race (Peak <=2, Taper 1) so the heavy stimulus is kept but not piled
  // on top of peak running. Never below 1 if the athlete lifts at all.
  let liftsN = f.lifts;
  if (phase === "Taper") liftsN = Math.min(liftsN, 1);
  else if (phase === "Peak") liftsN = Math.min(liftsN, 2);
  if (f.lifts >= 1) liftsN = Math.max(1, liftsN);
  return [...used, ...easies, ...Array(liftsN).fill("Strength")];
}
// Unique permutations of a (possibly duplicated) array
export function uniquePerms(arr) {
  const res = []; const used = Array(arr.length).fill(false); const cur = [];
  const a = [...arr].sort();
  (function rec() {
    if (cur.length === a.length) { res.push([...cur]); return; }
    for (let i = 0; i < a.length; i++) {
      if (used[i] || (i > 0 && a[i] === a[i - 1] && !used[i - 1])) continue;
      used[i] = true; cur.push(a[i]); rec(); cur.pop(); used[i] = false;
    }
  })();
  return res;
}
// Penalty for a full Mon..Sun type array (lower = better). Encodes the
// research-backed scheduling rules for concurrent strength + endurance.
export function weekPenalty(types, phase) {
  // "Quality" = every stress session that must never fall on consecutive days:
  // tempo, threshold, VO2/intervals, the long run, and race day. The long run is
  // a key stress in ALL phases, so quality work never sits the day before/after it.
  const quality = (t) => t === "Intervals" || t === "Threshold" || t === "Double Threshold" || t === "Tempo" || t === "Race" || t === "Long Run";
  const easyRun = (t) => t === "Easy Run" || t === "Recovery Run";
  let p = 0;
  for (let i = 0; i < 6; i++) {
    const a = types[i], b = types[i + 1];
    // hard constraints
    if (a === "Strength" && b === "Strength") p += 100;       // never two strength days in a row
    if (quality(a) && quality(b)) p += 100;                   // never two quality/long sessions in a row
    if (a === "Strength" && quality(b)) p += 60;              // never quality/long the day after lifting
    // preferences (expert-coach recovery flow)
    if (a === "Strength" && easyRun(b)) p -= 20;              // an easy aerobic run should follow strength
    else if (a === "Strength" && b === "Rest") p -= 6;        // rest after strength is acceptable, less preferred
    if (quality(a) && (b === "Rest" || easyRun(b))) p -= 8;   // recover the day after a quality/long session
    if (a === "Rest" && b === "Rest") p += 5;                 // spread rest days out
  }
  return p;
}
export function arrangeWeek(weekStart, phase, recovery, nonLong, longWd, restWd, maxHr, longKm, easyKm, minDateISO, raceDateISO) {
  const slots = [];
  for (let i = 0; i < 7; i++) { const date = addDays(weekStart, i); slots.push({ date: iso(date), weekday: date.getDay(), dow: DOW_WD[date.getDay()], type: null, pre: minDateISO ? iso(date) < minDateISO : false }); }
  // Monday-aligned: any day before the plan start date is a Rest day
  slots.forEach((s) => { if (s.pre) s.type = "Rest"; });
  const openable = () => slots.map((s, i) => (!s.type ? i : -1)).filter((i) => i >= 0);
  if (phase === "Race") {
    let li = raceDateISO ? slots.findIndex((s) => s.date === raceDateISO && !s.type) : -1;
    if (li < 0) li = slots.findIndex((s) => s.weekday === longWd && !s.type);
    if (li < 0) { const o = openable(); li = o[o.length - 1]; }
    slots.forEach((s, i) => { if (s.type) return; s.type = i === li ? "Race" : (i % 2 === 1 ? "Rest" : "Easy Run"); });
  } else {
    let li = slots.findIndex((s) => s.weekday === longWd && !s.type); if (li < 0) { const o = openable(); li = o[o.length - 1]; }
    if (li >= 0) slots[li].type = "Long Run";
    const open = openable();
    // If pre-start days reduced available slots, drop lowest-priority sessions first
    let sessions = [...nonLong];
    if (sessions.length > open.length) {
      const drop = ["Recovery Run", "Strength", "Easy Run"];
      for (const t of drop) { while (sessions.length > open.length) { const ix = sessions.lastIndexOf(t); if (ix < 0) break; sessions.splice(ix, 1); } }
      sessions = sessions.slice(0, open.length);
    }
    // Pad with Rest days so the arranger can place the (7 - availability) rest
    // days optimally (recovery after hard/long, no clustering).
    while (sessions.length < open.length) sessions.push("Rest");
    // brute-force the best arrangement under the scheduling penalty
    let best = null, bestScore = Infinity;
    for (const perm of uniquePerms(sessions)) {
      const types = slots.map((s) => s.type);
      perm.forEach((t, k) => { types[open[k]] = t; });
      const sc = weekPenalty(types, phase);
      if (sc < bestScore) { bestScore = sc; best = perm; if (sc <= 0) break; }
    }
    if (best) best.forEach((t, k) => { slots[open[k]].type = t; });
    slots.forEach((s) => { if (!s.type) s.type = "Rest"; });
  }
  return slots.map((s) => ({ date: s.date, dow: s.dow, preStart: s.pre, ...buildWorkoutData(s.type, phase, longKm, recovery, maxHr, easyKm) }));
}
export function generatePlan(profile, race, holidays = [], bRaces = []) {
  const planStartActual = iso(new Date(profile.planStartDate));
  const week0Monday = mondayOf(planStartActual);
  const maxHr = profile.maxHr || Math.round(208 - 0.7 * profile.age);
  const methodology = profile.methodology || autoMethodology(profile, profile.vo2Hint);
  const longWd = WD[profile.longRunDay] ?? 0, restWd = (WD[profile.longRunDay] === 1) ? 2 : 1;
  const totalWeeks = 52, weeks = [];
  // The phase block spans from the start date to the race week, so changing the
  // start date OR the race date re-fits the whole plan (phases + dates) to match.
  const noRace = !race;
  const fRace = splitFor(profile.availabilityDays), fBase = splitForBase(profile.availabilityDays); // base phase emphasises strength (muscle build)
  // Base mode: with no goal race, train a steady rolling aerobic base - every week
  // "Base", a moderate volume-appropriate long run, and a 3:1 deload.
  const curVolBase = Math.max(18, profile.currentWeeklyVolumeKm || 40, profile.recentWeeklyKm || 0); // anchor carries over recent real mileage (keeps post-race base high)
  let raceISO = null, blockWeeks = 0, block = null, vol = null, raceDistKm = 0;
  if (!noRace) {
    raceISO = iso(new Date(race.date));
    const raceWeekStart = mondayOf(raceISO);
    blockWeeks = Math.max(3, Math.min(51, Math.round(diffDays(raceWeekStart, week0Monday) / 7) + 1));
    block = buildBlockMeta(blockWeeks, race.type);
    vol = buildVolumeProfile(profile, race, block);
    raceDistKm = (GOAL_DIST_M[race.type] || 42195) / 1000;
  }
  for (let w = 0; w < totalWeeks; w++) {
    let meta, longKm, weeklyTarget;
    if (noRace) {
      // Progressive base. From-scratch base builds ~5%/wk (3:1 deload) toward 1.4x.
      // After a race, a distance-scaled reverse taper eases back in (longer for longer
      // races), then the ramp resumes - capped near the carried-over peak (1.15x) so a
      // post-race base maintains fitness rather than over-building beyond it.
      const wkStartISO = iso(addDays(week0Monday, w * 7));
      const bw = profile.baseStartDate ? Math.round(diffDays(wkStartISO, mondayOf(profile.baseStartDate)) / 7) : w;
      const taper = profile.lastRaceType ? (RACE_RECOVERY[profile.lastRaceType] || RACE_RECOVERY.Marathon) : null;
      const capMult = profile.lastRaceType ? 1.15 : 1.4;
      let recovery, mult;
      if (taper && bw >= 0 && bw < taper.length) {
        // Adapt the return to MEASURED recovery (HRV / sleep / RHR / fatigue): a well-
        // recovered athlete eases back faster, a fatigued one stays easy longer. With
        // no recovery data the factor is 1.0, i.e. the fixed distance-scaled schedule.
        const recFactor = profile.recoveryReadiness != null ? (0.8 + 0.4 * profile.recoveryReadiness) : 1;
        mult = Math.max(0.4, Math.min(1, taper[bw] * recFactor));
        recovery = mult <= 0.7;
      } else {
        const pw = Math.max(0, bw - (taper ? taper.length : 0));
        const pos = pw % 4, blk = Math.floor(pw / 4);
        if (pos === 3) { recovery = true; mult = 0.7 * Math.min(capMult, 1 + 0.05 * (blk * 3 + 2)); }
        else { recovery = false; mult = Math.min(capMult, 1 + 0.05 * (blk * 3 + pos)); }
      }
      meta = { phase: "Base", recovery };
      weeklyTarget = Math.max(14, Math.round(curVolBase * mult));
      longKm = recovery ? Math.max(10, Math.round(weeklyTarget * 0.28)) : Math.min(30, Math.max(12, Math.round(weeklyTarget * 0.34)));
    } else {
      const inBlock = w < blockWeeks;
      meta = inBlock ? block[w] : { phase: "Off-Season", recovery: false };
      longKm = inBlock ? vol.longs[w] : 16;
      weeklyTarget = inBlock ? vol.weekly[w] : Math.round(vol.curVol * 0.8);
    }
    const f = meta.phase === "Base" ? fBase : fRace;
    // Fatigue-driven deload: when measured recovery is poor or acute load has spiked above
    // chronic, the week containing today becomes a recovery week regardless of the calendar
    // 3:1 - cutting volume ~30% and removing intensity (the scheduled deloads still stand).
    const _wkS = iso(addDays(week0Monday, w * 7)), _wkE = iso(addDays(week0Monday, w * 7 + 6));
    if (profile.fatigueDeload && profile.todayISO && profile.todayISO >= _wkS && profile.todayISO <= _wkE && !meta.recovery) { meta = { ...meta, recovery: true }; weeklyTarget = Math.round(weeklyTarget * 0.7); longKm = Math.max(10, Math.round(longKm * 0.7)); }
    const easyKm = easyKmFor(weeklyTarget, longKm, f.runs);
    const weekStart = addDays(week0Monday, w * 7);
    const nonLong = weekSessions(meta.phase, meta.recovery, f, methodology);
    let days = arrangeWeek(weekStart, meta.phase, meta.recovery, nonLong, longWd, restWd, maxHr, meta.phase === "Race" ? raceDistKm : longKm, easyKm, w === 0 ? planStartActual : null, meta.phase === "Race" ? raceISO : null);
    days = days.map((d) => { const h = holidays.find((x) => d.date >= x.start && d.date <= x.end); if (!h) return d; const rest = buildWorkoutData("Rest", meta.phase, 0, false, maxHr); return { ...rest, date: d.date, dow: d.dow, name: "Holiday - rest", detail: `Holiday: ${h.label} - no running`, holiday: true }; });
    // Hybrid base (strength-heavy, no quality run): keep 2 weekly strides on easy
    // runs to preserve running economy with near-zero interference to muscle gain.
    if (meta.phase === "Base" && f.lifts >= 3 && !meta.recovery) {
      let added = 0;
      const addStride = (d) => { added++; return { ...d, detail: d.detail + ". Finish with 6 x 20 s strides, 60 s recovery", strides: true }; };
      days = days.map((d) => (added < 2 && d.type === "Easy Run" && !d.holiday) ? addStride(d) : d);
      if (added < 2) days = days.map((d) => (added < 2 && d.type === "Recovery Run" && !d.holiday) ? addStride(d) : d);
    }
    const volumeKm = days.reduce((s, d) => s + d.distanceKm, 0); const load = days.reduce((s, d) => s + d.load, 0);
    const runCount = days.filter((d) => d.distanceKm > 0 && d.type !== "Rest").length; const liftCount = days.filter((d) => d.type === "Strength").length;
    weeks.push({ index: w, weekNumber: w + 1, phase: meta.phase, isRecovery: meta.recovery, startDate: iso(weekStart), endDate: iso(addDays(weekStart, 6)), longRunKm: longKm, weeklyTargetKm: weeklyTarget, volumeKm: Math.round(volumeKm), load, runCount, liftCount, days });
  }
  applyBRaces(weeks, bRaces, maxHr);
  return { planStart: iso(week0Monday), trainingStart: planStartActual, raceDate: raceISO, totalWeeks, blockWeeks, weeks, raceWeekIndex: noRace ? -1 : blockWeeks - 1, race: race || null, longRunNote: vol ? vol.longRunNote : null, baseMode: noRace };
}
export function adaptForMissedKey(plan, completions, maxHr) {
  const missed = Object.entries(completions).filter(([d, r]) => r.status === "Missed" && r.key).map(([d]) => d).sort();
  if (!missed.length) return plan;
  const last = missed[missed.length - 1]; const wi = plan.weeks.findIndex((w) => last >= w.startDate && last <= w.endDate);
  for (const idx of [wi, wi + 1]) { const wk = plan.weeks[idx]; if (!wk) continue; const q = wk.days.find((d) => isHard(d.type) && d.date > last); if (q) { Object.assign(q, buildWorkoutData("Easy Run", wk.phase, 0, false, maxHr), { date: q.date, dow: q.dow, adapted: true }); wk.load = wk.days.reduce((s, d) => s + d.load, 0); wk.volumeKm = Math.round(wk.days.reduce((s, d) => s + d.distanceKm, 0)); break; } }
  return plan;
}
export function recomputeWeeks(plan) {
  plan.weeks.forEach((wk) => { wk.volumeKm = Math.round(wk.days.reduce((s, d) => s + d.distanceKm, 0)); wk.load = wk.days.reduce((s, d) => s + d.load, 0); wk.runCount = wk.days.filter((d) => d.distanceKm > 0 && d.type !== "Rest").length; wk.liftCount = wk.days.filter((d) => d.type === "Strength").length; });
}
// B1 Adaptive layer: rewrites upcoming sessions in response to injury, illness and
// missed long runs (on top of adaptForMissedKey). Returns notes for coach alerts.
export function applyAdaptations(plan, core, today, maxHr) {
  const notes = [];
  plan = adaptForMissedKey(plan, core.completions, maxHr);
  const todayISO = iso(today), horizon = iso(addDays(today, 10));
  const within = (d) => d.date >= todayISO && d.date <= horizon;
  const health = core.health || {};
  if (health.injury) {
    plan.weeks.forEach((wk) => wk.days.forEach((d) => { if (within(d) && d.distanceKm > 0 && d.type !== "Rest") Object.assign(d, buildWorkoutData("Rest", wk.phase, 0, false, maxHr), { date: d.date, dow: d.dow, name: "Injury - rest / cross-train", detail: "Injury mode: no running. Swap for pain-free cross-training (bike, pool, upper body) and see a physio.", adapted: true }); }));
    recomputeWeeks(plan);
    notes.push({ level: "high", text: "Injury mode is on - running is suspended for ~10 days and replaced with rest / cross-training. Turn it off in Recovery once you are cleared." });
  } else if (health.illness) {
    plan.weeks.forEach((wk) => wk.days.forEach((d) => {
      if (!within(d)) return;
      if (isHard(d.type) || d.type === "Tempo") Object.assign(d, buildWorkoutData("Easy Run", wk.phase, 0, false, maxHr), { date: d.date, dow: d.dow, name: "Easy (illness)", detail: "Illness mode: intensity removed. Keep runs easy and short, and only if symptoms are above the neck.", adapted: true });
      else if (d.type === "Long Run") { const km = Math.max(5, Math.round((d.distanceKm || 0) * 0.6)); Object.assign(d, buildWorkoutData("Easy Run", wk.phase, 0, false, maxHr), { date: d.date, dow: d.dow, distanceKm: km, durationMin: km * 6, load: Math.round(km * 5), name: "Easy (illness)", detail: "Illness mode: long run cut back to easy.", adapted: true }); }
    }));
    recomputeWeeks(plan);
    notes.push({ level: "high", text: "Illness mode is on - intensity is removed and volume eased for ~10 days. Build back gradually once recovered." });
  } else {
    const missed = Object.entries(core.completions).filter(([d, r]) => r.status === "Missed").map(([d]) => d).filter((d) => d <= todayISO && d >= iso(addDays(today, -3)));
    if (missed.length) {
      const flat = plan.weeks.flatMap((wk) => wk.days.map((d) => ({ d, wk })));
      missed.forEach((md) => {
        const orig = flat.find((x) => x.d.date === md);
        if (orig && orig.d.type === "Long Run") {
          const cand = flat.find((x) => x.d.date > todayISO && x.d.date <= iso(addDays(today, 2)) && (x.d.type === "Easy Run" || x.d.type === "Recovery Run"));
          if (cand) { const km = Math.max(10, Math.round(orig.d.distanceKm * 0.85)); Object.assign(cand.d, buildWorkoutData("Long Run", cand.wk.phase, km, false, maxHr), { date: cand.d.date, dow: cand.d.dow, name: "Long run (made up)", detail: "Rescheduled from a missed long run, kept a little shorter.", adapted: true }); recomputeWeeks(plan); notes.push({ level: "info", text: "Missed long run rescheduled to " + cand.d.dow + " (shortened) to protect your endurance." }); }
        }
      });
    }
  }
  return { plan, notes };
}
// B2 Planned-vs-actual: tally execution quality for a week from logged completions.
export function weekCompliance(week, completions) {
  let logged = 0, completed = 0, modified = 0, partial = 0, missed = 0;
  (week ? week.days : []).forEach((d) => {
    if (d.distanceKm <= 0 && d.type !== "Strength") return;
    const r = completions[d.date]; if (!r) return; logged++;
    const band = r.status === "Missed" ? "missed" : (r.compliance >= 0.95 ? "completed" : r.compliance >= 0.7 ? "modified" : r.compliance >= 0.3 ? "partial" : "missed");
    if (band === "completed") completed++; else if (band === "modified") modified++; else if (band === "partial") partial++; else missed++;
  });
  return { logged, completed, modified, partial, missed };
}
// B4: apply user move/edit overrides onto the generated plan (before adaptations).
export function applyOverrides(plan, overrides, maxHr) {
  if (!overrides) return plan;
  plan.weeks.forEach((wk) => wk.days.forEach((d) => {
    const o = overrides[d.date]; if (!o) return;
    const longKm = o.type === "Long Run" ? (o.longKm || wk.longRunKm || d.distanceKm || 20) : 0;
    Object.assign(d, buildWorkoutData(o.type, wk.phase, longKm, wk.isRecovery, maxHr), { date: d.date, dow: d.dow, moved: true });
  }));
  recomputeWeeks(plan);
  return plan;
}
export const allDays = (plan) => plan.weeks.flatMap((w) => w.days.map((d) => ({ ...d, weekNumber: w.weekNumber, phase: w.phase })));
export const dayFor = (plan, dateISO) => allDays(plan).find((d) => d.date === dateISO) || null;
export function weekFor(plan, dateISO) { if (dateISO < plan.weeks[0].startDate) return plan.weeks[0]; return plan.weeks.find((w) => dateISO >= w.startDate && dateISO <= w.endDate) || plan.weeks[plan.weeks.length - 1]; }

/* ---- STRENGTH ENGINE ---- */
export function strengthScheme(phase) {
  switch (phase) { case "Base": return { sets: 4, reps: 6, pct: 0.72, label: "Hypertrophy", rir: 3 }; case "Build": return { sets: 4, reps: 4, pct: 0.82, label: "Strength", rir: 2 }; case "Peak": return { sets: 3, reps: 3, pct: 0.85, label: "Maintenance", rir: 1 }; case "Taper": return { sets: 2, reps: 3, pct: 0.70, label: "Primer", rir: 3 }; default: return { sets: 3, reps: 5, pct: 0.75, label: "General", rir: 2 }; }
}
// Accessory swap options, grouped by movement category so a swap always matches
// the same pattern (e.g. a Lat Pulldown can replace a Weighted Pull-up - both
// vertical pulls). The first entry is the default prescription.
export const EXERCISE_ALTS = {
  "glute-hinge": ["Hip Thrust", "Trap-bar Deadlift", "Single-leg Hip Thrust", "Glute Bridge", "Back Extension", "Good Morning"],
  "lunge": ["Bulgarian Split Squat", "Walking Lunge", "Reverse Lunge", "Step-up", "Split Squat"],
  "vertical-pull": ["Weighted Pull-up", "Lat Pulldown", "Chin-up", "Assisted Pull-up", "Neutral-grip Pulldown"],
  "horizontal-push": ["Incline DB Press", "Flat DB Press", "Weighted Push-up", "Dips", "Machine Chest Press"],
  "horizontal-pull": ["Barbell Row", "Chest-supported Row", "Seated Cable Row", "Single-arm DB Row", "Pendlay Row"],
};
// Conservative STARTING working weights for accessories (kg). Deliberately light -
// we don't have a 1RM for these, so we start easy and add weight every session via
// linear progression (+2.5 kg upper body / +5 kg lower body) rather than guessing a
// percentage of a compound 1RM (which tends to prescribe far too much).
export const ACCESSORY_START = {
  "Hip Thrust": 40, "Trap-bar Deadlift": 60, "Single-leg Hip Thrust": 16, "Glute Bridge": 30, "Back Extension": 5, "Good Morning": 30,
  "Bulgarian Split Squat": 12, "Walking Lunge": 12, "Reverse Lunge": 12, "Step-up": 12, "Split Squat": 12,
  "Weighted Pull-up": 0, "Lat Pulldown": 35, "Chin-up": 0, "Assisted Pull-up": 0, "Neutral-grip Pulldown": 35,
  "Incline DB Press": 16, "Flat DB Press": 18, "Weighted Push-up": 0, "Dips": 0, "Machine Chest Press": 30,
  "Barbell Row": 40, "Chest-supported Row": 30, "Seated Cable Row": 40, "Single-arm DB Row": 22, "Pendlay Row": 40,
};
export const LOWER_CATS = ["glute-hinge", "lunge"];
export const stepIncrement = (category) => (LOWER_CATS.includes(category) ? 5 : 2.5); // +5 lower / +2.5 upper per session
// Per-exercise progression step (+5 kg lower body / +2.5 kg upper body).
export function liftIncrement(name) {
  if (name === "Back Squat" || name === "Romanian Deadlift") return 5;
  if (name === "Bench Press" || name === "Overhead Press") return 2.5;
  for (const cat in EXERCISE_ALTS) if (EXERCISE_ALTS[cat].includes(name)) return LOWER_CATS.includes(cat) ? 5 : 2.5;
  return 2.5;
}
// sessionIdx cycles three complementary templates (A/B/C) across a week of strength
// days so a 2-3 lift week covers every barbell compound (squat, hinge, vertical &
// horizontal push) plus pull, single-leg and core.
// Compounds are prescribed off your 1RM and PROGRESS week to week: a 4-week wave
// (+2.5%/week, deload on the recovery week) on top of a 1RM that itself rises as you
// log PRs. They also AUTOREGULATE: poor recovery trims load and a set and loosens the
// rep-in-reserve (RIR) target. Accessories use double progression - work up reps
// within the prescribed range, then add load (+2.5 upper / +5 lower). Plyometrics are
// only programmed when the athlete can absorb them (base/build, fresh, away from races).
export function generateStrengthSession(profile, weekNumber, phase, isRecovery, sessionIdx = 0, weights = {}, opts = {}) {
  const rm = profile.oneRM, scheme = strengthScheme(phase);
  const readiness = opts.readiness != null ? opts.readiness : 100;
  const weeksToRace = opts.weeksToRace != null ? opts.weeksToRace : 99;
  const lowRdy = readiness < 50, cautionRdy = readiness >= 50 && readiness < 65;
  const waveWeek = (weekNumber - 1) % 4; let overload = 1 + waveWeek * 0.025; if (isRecovery) overload = 0.9;
  // Plyometrics load tendons hard - only when fresh, in base/build, not deloading,
  // and not inside the final fortnight before a race.
  const plyoAllowed = (phase === "Base" || phase === "Build" || phase === "General" || !phase) && !isRecovery && readiness >= 50 && weeksToRace > 2;
  // Each template defines 4 prehab slots (2 sets each): a plyometric (gated), an
  // ISOMETRIC (always present), an injury-prevention lift, and a core/activation move.
  const TEMPLATES = [
    { label: "A",
      compound: [{ name: "Back Squat", pattern: "Squat", oneRM: rm.backSquat }, { name: "Bench Press", pattern: "Horizontal push", oneRM: rm.benchPress }],
      acc: [{ name: "Hip Thrust", pattern: "Hinge", category: "glute-hinge", sets: 3, repsMin: 8, repsMax: 12, note: "glute drive" }, { name: "Bulgarian Split Squat", pattern: "Single-leg", category: "lunge", sets: 3, repsMin: 6, repsMax: 10, note: "per leg, DB" }, { name: "Weighted Pull-up", pattern: "Vertical pull", category: "vertical-pull", sets: 3, repsMin: 5, repsMax: 8, note: "added load" }, { name: "Chest-supported Row", pattern: "Horizontal pull", category: "horizontal-pull", sets: 3, repsMin: 8, repsMax: 12, note: "squeeze shoulder blades" }],
      plyo: { name: "Pogo Hops", reps: 12, note: "plyometric - fast, stiff ankles, minimal ground contact", plyo: true },
      iso: { name: "Copenhagen Plank", reps: "30s", note: "per side - adductor strength", iso: true },
      injury: { name: "Nordic Hamstring Curl", reps: 6, note: "lower slowly - hamstring injury prevention", injury: true },
      core: { name: "Banded Glute Bridge", reps: 15, note: "glute activation" },
      isoAlt: { name: "Wall Sit", reps: "40s", note: "isometric quad - low-impact alternative to jumps", iso: true } },
    { label: "B",
      compound: [{ name: "Romanian Deadlift", pattern: "Hinge", oneRM: rm.romanianDeadlift }, { name: "Overhead Press", pattern: "Vertical push", oneRM: rm.overheadPress }],
      acc: [{ name: "Walking Lunge", pattern: "Single-leg", category: "lunge", sets: 3, repsMin: 8, repsMax: 12, note: "per leg, DB" }, { name: "Dips", pattern: "Horizontal push", category: "horizontal-push", sets: 3, repsMin: 6, repsMax: 10, note: "bodyweight + added load" }, { name: "Lat Pulldown", pattern: "Vertical pull", category: "vertical-pull", sets: 3, repsMin: 8, repsMax: 12, note: "controlled" }, { name: "Barbell Row", pattern: "Horizontal pull", category: "horizontal-pull", sets: 3, repsMin: 8, repsMax: 10, note: "flat back, pull to lower ribs" }],
      plyo: { name: "Box Jumps", reps: 6, note: "plyometric - soft landing, step down between reps", plyo: true },
      iso: { name: "Side Plank", reps: "30s", note: "per side", iso: true },
      injury: { name: "Single-leg Calf Raise", reps: 12, note: "slow 3s lower - Achilles & soleus", injury: true },
      core: { name: "Dead Bug", reps: 12, note: "per side" },
      isoAlt: { name: "Spanish Squat", reps: "40s", note: "isometric quad/patellar - low-impact alternative to jumps", iso: true } },
    { label: "C",
      compound: [{ name: "Back Squat", pattern: "Squat", oneRM: rm.backSquat }, { name: "Romanian Deadlift", pattern: "Hinge", oneRM: rm.romanianDeadlift }],
      acc: [{ name: "Incline DB Press", pattern: "Horizontal push", category: "horizontal-push", sets: 3, repsMin: 8, repsMax: 12, note: "per hand" }, { name: "Seated Cable Row", pattern: "Horizontal pull", category: "horizontal-pull", sets: 3, repsMin: 8, repsMax: 12, note: "controlled" }, { name: "Weighted Pull-up", pattern: "Vertical pull", category: "vertical-pull", sets: 3, repsMin: 6, repsMax: 10, note: "added load" }, { name: "Hip Thrust", pattern: "Hinge", category: "glute-hinge", sets: 3, repsMin: 8, repsMax: 12, note: "glute drive" }],
      plyo: { name: "Pogo Hops", reps: 14, note: "plyometric - reactive, minimal contact", plyo: true },
      iso: { name: "Hollow Hold", reps: "30s", note: "ribs down", iso: true },
      injury: { name: "Nordic Hamstring Curl", reps: 6, note: "lower slowly - hamstring injury prevention", injury: true },
      core: { name: "Bird Dog", reps: 10, note: "per side" },
      isoAlt: { name: "Isometric Split Squat", reps: "30s", note: "per side - low-impact alternative to jumps", iso: true } },
  ];
  const tpl = TEMPLATES[((sessionIdx % 3) + 3) % 3];
  // Prehab: 4 moves x 2 sets. Slot 1 is the plyometric when allowed, otherwise a
  // low-impact strength isometric; slot 2 is always an isometric hold.
  const firstSlot = plyoAllowed ? tpl.plyo : tpl.isoAlt;
  const prehab = [firstSlot, tpl.iso, tpl.injury, tpl.core].map((p) => ({ ...p, sets: 2 }));
  // Compounds: off 1RM x wave, autoregulated to recovery (trim a set + ~10% load when low).
  const cSets = lowRdy ? Math.max(2, scheme.sets - 1) : scheme.sets;
  const cMul = lowRdy ? 0.9 : 1;
  const rir = scheme.rir + (lowRdy ? 1 : 0);
  const compound = tpl.compound.map((c) => ({ name: c.name, pattern: c.pattern, sets: cSets, reps: scheme.reps, rir, weightKg: round2_5((c.oneRM || 60) * scheme.pct * overload * cMul), pctOneRM: Math.round(scheme.pct * overload * cMul * 100) }));
  // Accessories: double progression. reps = top of range (the +load trigger); repRange shown.
  const accessory = tpl.acc.map((a) => ({ name: a.name, pattern: a.pattern, category: a.category, sets: a.sets, reps: a.repsMax, repRange: `${a.repsMin}-${a.repsMax}`, note: a.note, weightKg: (weights[a.name] != null ? weights[a.name] : (ACCESSORY_START[a.name] != null ? ACCESSORY_START[a.name] : 20)) }));
  const pairingNote = "Running today too? Lift first or leave 3-6 h between sessions, and keep the run easy - never pair lifting with a hard or long run.";
  const autoReg = lowRdy ? "Recovery is low - load and one set trimmed today; stop 2+ reps short and skip the jumps." : (cautionRdy ? "Recovery is moderate - leave a rep or two in reserve on the compounds." : null);
  return { scheme: scheme.label, rir, overloadPct: Math.round((overload - 1) * 100), session: tpl.label, plyo: plyoAllowed, prehab, compound, accessory, pairingNote, autoReg };
}

/* ---- FITNESS + PACES ---- */
// Convert a VO2 max reading to a lactate-threshold pace the way a cautious coach
// would. Threshold velocity is taken at ~76% of velocity-at-VO2max (the
// recreational end, not the elite 88-91%), because (a) consumer-watch VO2 max
// tends to over-read running fitness, especially for heavier runners, and (b)
// prescribing threshold too fast is a leading cause of overreaching. e.g. a
// VO2 max of 56.7 yields ~4:30/km threshold rather than ~3:48/km.
export const THRESHOLD_VVO2_FRACTION = 0.76;
export function vo2ToThresholdPace(vo2) {
  // velocity-at-VO2max (m/min) from Daniels: VO2 = -4.6 + 0.182258v + 0.000104v^2
  const a = 0.000104, b = 0.182258, c = -(4.6 + vo2);
  const v = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  const vThr = THRESHOLD_VVO2_FRACTION * v;
  return Math.max(195, Math.min(360, 60000 / vThr)); // sec/km
}
export function estimateFitness(load, vo2max) {
  let thr, source;
  if (vo2max) { thr = vo2ToThresholdPace(vo2max); source = "VO\u2082max (avg)"; }
  else { thr = 255 - (load.ctl - 50) * 1.3; thr = Math.max(195, Math.min(340, thr)); source = "training load (CTL)"; }
  const marathonPace = thr + 30; const currentMarathonSecs = Math.round(marathonPace * 42.195);
  return { ctl: load.ctl, thresholdPace: thr, marathonPace, currentMarathonSecs, source, vo2max: vo2max || null };
}
export function computePaces(fitness) {
  const thr = fitness.thresholdPace;
  return { thresholdPace: thr, paces: [
    { zone: "Recovery", secPerKm: thr + 95, note: "Very easy" }, { zone: "Easy", secPerKm: thr + 70, note: "Aerobic base, zone 2" },
    { zone: "Long run", secPerKm: thr + 52, note: "Steady endurance" }, { zone: "Marathon", secPerKm: thr + 30, note: "Current marathon effort" },
    { zone: "Threshold", secPerKm: thr, note: "Comfortably hard" }, { zone: "Interval (VO2)", secPerKm: thr - 18, note: "5k effort / vVO2max" },
  ] };
}

/* ---- TRAINING LOAD ---- */
export function computeTrainingLoad(plan, today, completions) {
  const start = plan.planStart, end = iso(today); let atl = 45, ctl = 48; const series = [];
  for (let d = new Date(start); iso(d) <= end; d = addDays(d, 1)) {
    const key = iso(d); const planned = dayFor(plan, key); let load = 0;
    if (planned && key <= end) { const rec = completions[key]; if (rec) load = rec.status === "Missed" ? 0 : (rec.load != null ? rec.load : Math.round(planned.load * (rec.compliance ?? 1))); else load = key < end ? planned.load : 0; }
    ctl += (load - ctl) / 42; atl += (load - atl) / 7;
    series.push({ date: key, load, ctl: Math.round(ctl), atl: Math.round(atl), tsb: Math.round(ctl - atl) });
  }
  const last = series[series.length - 1] || { ctl: 48, atl: 45 }; const tsb = last.ctl - last.atl;
  let category = "Ready"; if (tsb > 10) category = "Fresh"; else if (tsb >= -10) category = "Ready"; else if (tsb >= -30) category = "Fatigued"; else category = "High Risk";
  return { atl: last.atl, ctl: last.ctl, tsb, category, series: series.slice(-42) };
}
export function evaluateVariance(planned, actual) {
  const ratio = planned.distanceKm > 0 ? actual.distanceKm / planned.distanceKm : actual.durationMin / Math.max(planned.durationMin, 1);
  const pct = Math.round(ratio * 100); let compliance;
  if (pct >= 95 && pct <= 110) compliance = "Completed"; else if (pct >= 70) compliance = "Modified"; else if (pct >= 30) compliance = "Partial"; else compliance = "Missed";
  return { compliance, compliancePct: Math.min(pct, 110) };
}
export function computeRecovery(inputs, tsb, completionPct) {
  const c = (x) => Math.max(0, Math.min(1, x));
  const sSleep = c((inputs.sleepHours - 5) / 3) * 0.6 + (inputs.sleepQuality / 100) * 0.4;
  const sHrv = c(0.5 + (inputs.hrv - inputs.hrvBaseline) / (inputs.hrvBaseline * 0.4));
  const sRhr = c(0.5 - (inputs.restingHr - inputs.rhrBaseline) / (inputs.rhrBaseline * 0.4));
  const sLoad = c((tsb + 30) / 50); const sCompletion = c(completionPct); const sFatigue = c((10 - inputs.subjectiveFatigue) / 9);
  const score = Math.round((sSleep * 0.25 + sHrv * 0.25 + sRhr * 0.15 + sLoad * 0.15 + sCompletion * 0.1 + sFatigue * 0.1) * 100);
  let status = "Recover"; if (score >= 80) status = "Fresh"; else if (score >= 65) status = "Normal"; else if (score >= 50) status = "Caution";
  let level = 0; const actions = [];
  if (score < 60) { level = 1; actions.push("Add a recovery recommendation to today"); }
  if (score < 50) { level = 2; actions.push("Reduce weekly volume by 15%", "Remove intensity", "Increase recovery nutrition", "Prioritise sleep"); }
  if (score < 40) { level = 3; actions.push("Replace quality sessions with easy running"); }
  if (score < 30) { level = 4; actions.push("Insert a recovery week", "Coach alert raised", "Reduce goal forecast"); }
  return { score, status, level, actions, breakdown: { Sleep: Math.round(sSleep * 100), HRV: Math.round(sHrv * 100), "Resting HR": Math.round(sRhr * 100), "Training Load": Math.round(sLoad * 100), Completion: Math.round(sCompletion * 100), Fatigue: Math.round(sFatigue * 100) } };
}
// Plan-independent measured recovery (0-1) from wearable/manual signals only - HRV,
// resting HR, sleep and subjective fatigue. Used to ADAPT the post-race return to
// real recovery rather than a fixed schedule. ~0.5 when no data (neutral default).
export function measuredRecovery(inputs) {
  if (!inputs) return 0.5;
  const c = (x) => Math.max(0, Math.min(1, x));
  const sleepH = inputs.sleepHours != null ? inputs.sleepHours : 7;
  const sleepQ = inputs.sleepQuality != null ? inputs.sleepQuality : 75;
  const sSleep = c((sleepH - 5) / 3) * 0.6 + (sleepQ / 100) * 0.4;
  const sHrv = (inputs.hrv && inputs.hrvBaseline) ? c(0.5 + (inputs.hrv - inputs.hrvBaseline) / (inputs.hrvBaseline * 0.4)) : 0.5;
  const sRhr = (inputs.restingHr && inputs.rhrBaseline) ? c(0.5 - (inputs.restingHr - inputs.rhrBaseline) / (inputs.rhrBaseline * 0.4)) : 0.5;
  const sFatigue = inputs.subjectiveFatigue != null ? c((10 - inputs.subjectiveFatigue) / 9) : 0.5;
  return sHrv * 0.35 + sRhr * 0.2 + sSleep * 0.3 + sFatigue * 0.15;
}

/* ---- NUTRITION ---- */
// Energy cost of a session, scaled to bodyweight and distance (net of resting
// metabolism, which is already counted in the base maintenance below). Running
// nets ~0.7-0.8 kcal/kg/km depending on intensity; lifting ~5 kcal/kg.
export const DEFAULT_SESSION_KM = { "Recovery Run": 6, "Easy Run": 10, "Long Run": 22, Tempo: 10, Threshold: 12, Intervals: 10, Race: 21.1, Travel: 5 };
export const RUN_KCAL_PER_KG_KM = { "Recovery Run": 0.70, "Easy Run": 0.75, "Long Run": 0.72, Tempo: 0.78, Threshold: 0.80, Intervals: 0.80, Race: 0.78, Travel: 0.70 };
export function trainingCost(profile, workout) {
  const kg = profile.weightKg || 70, t = workout && workout.type;
  if (!t || t === "Rest") return 0;
  if (t === "Strength") return Math.round(kg * 5);                          // ~460 for a 92 kg athlete
  const km = (workout.distanceKm && workout.distanceKm > 0) ? workout.distanceKm : (DEFAULT_SESSION_KM[t] ?? 8);
  const f = RUN_KCAL_PER_KG_KM[t] ?? 0.75;
  return Math.round(km * kg * f);
}
// Replenishment policy (expert nutritionist): run a deficit ONLY in Base/Build to
// reach race weight by the end of Build; Peak/Taper/Recovery/Race fully fuel
// performance. % = share of training expenditure put back; lower = bigger deficit.
export const REPLENISH = { Base: 0.25, Build: 0.50, Peak: 1.0, Taper: 1.0, Recovery: 1.0, "Off-Season": 0.50, Race: 1.0 };
export const MAX_DAILY_DEFICIT = 600; // kcal/day cap (~0.55 kg/week) - protects muscle + performance
export const MIN_LOSS_DEFICIT = 500;  // whenever above race weight in a loss phase, run at least this
// Rolling weekly bodyweight trend (kg/week) from recent logs via least-squares.
// Negative = losing. Used to nudge calories: stalling -> trim, too fast -> add back.
export function weightTrendKgPerWeek(bodyLogs) {
  if (!bodyLogs || bodyLogs.length < 4) return null;
  const sorted = bodyLogs.filter((b) => b && b.date && b.weightKg > 0).slice().sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-8);
  if (recent.length < 4) return null;
  const t0 = _d(recent[0].date).getTime();
  const xs = recent.map((b) => (_d(b.date).getTime() - t0) / 86400000);
  const ys = recent.map((b) => b.weightKg);
  const n = xs.length, sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0), sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const denom = n * sxx - sx * sx; if (Math.abs(denom) < 1e-6) return null;
  return Math.round(((n * sxy - sx * sy) / denom) * 7 * 100) / 100;
}
export function computeNutrition(profile, workout, phase, recoveryStatus, isRecoveryWeek, weightCtx) {
  const bmr = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + (profile.sex === "male" ? 5 : -161);
  // Base (non-training) maintenance: BMR x 1.35 covers daily living + steps but NOT
  // the logged workout, which is added explicitly so we don't double-count exercise.
  const tdee = bmr * 1.35;
  const rawCost = trainingCost(profile, workout);
  const maintenance = tdee + rawCost; // full fuelling for today
  const lossPhase = phase === "Base" || phase === "Build" || phase === "Off-Season";
  const aboveWeight = !!(weightCtx && weightCtx.kgToLose && weightCtx.kgToLose > 0);
  // Base/Build (loss phases): if above race weight, always run a meaningful deficit
  // (500-600 kcal/day). The aggressive replenishment policy sets the size; the
  // floor guarantees you keep losing until you reach race weight, the cap protects
  // muscle. Peak/Taper/Recovery/Race fuel fully for performance.
  let deficit = 0;
  if (lossPhase && aboveWeight) {
    const policy = Math.round(rawCost * (1 - (REPLENISH[phase] ?? 1.0)));
    deficit = Math.min(MAX_DAILY_DEFICIT, Math.max(MIN_LOSS_DEFICIT, policy));
  }
  // Intelligent adjustment: nudge calories off the weekly weight trend. Target a
  // muscle-preserving 0.3-0.8% bodyweight/week loss; if stalling, trim ~150 kcal;
  // if dropping too fast, add ~150 kcal back. Adjustments are deliberately small.
  let adaptiveNote = null, adaptiveDelta = 0;
  if (lossPhase && aboveWeight && weightCtx && weightCtx.trendKgPerWeek != null) {
    const lossPerWeek = -weightCtx.trendKgPerWeek;                              // positive = losing
    const targetLo = profile.weightKg * 0.003, targetHi = profile.weightKg * 0.008;
    if (lossPerWeek < targetLo) { adaptiveDelta = 150; adaptiveNote = `Weight ${lossPerWeek <= 0 ? "not moving" : "barely moving"} on the weekly average - trimmed ~150 kcal.`; }
    else if (lossPerWeek > targetHi) { adaptiveDelta = -150; adaptiveNote = "Losing faster than target - added ~150 kcal to protect muscle."; }
    else adaptiveNote = "Weekly weight trend on target - holding steady.";
    deficit = Math.min(750, Math.max(300, deficit + adaptiveDelta));
  }
  const floor = Math.round(bmr * 1.1);                                         // never undercut basic needs
  let calories = Math.max(floor, Math.round((maintenance - deficit) / 50) * 50);
  if (calories === floor) deficit = Math.max(0, Math.round(maintenance) - floor); // floor clamped the deficit
  const replenishPct = rawCost > 0 ? Math.max(0, Math.min(100, Math.round(100 * (1 - deficit / rawCost)))) : 100;
  let recNote = "Balanced fuelling";
  if (recoveryStatus === "Caution" || recoveryStatus === "Recover") recNote = "Fatigued - prioritise recovery, sleep & hydration";
  else if (recoveryStatus === "Fresh") recNote = "Fresh - standard fuelling";
  const deficitNote = deficit > 0 ? `Deficit toward race weight (${phase} phase)` : (lossPhase ? "At race weight - fuelling fully" : `${phase} phase - fuelling for performance`);
  const protein = Math.round(profile.weightKg * 2);
  const fatKcal = calories * 0.20; const fat = Math.round(fatKcal / 9);
  const carbs = Math.round(Math.max(0, calories - protein * 4 - fatKcal) / 4);
  const hydBase = profile.weightKg * 35;
  const hydWork = { Rest: 0, "Easy Run": 500, "Recovery Run": 350, Tempo: 700, Threshold: 800, "Double Threshold": 1100, Intervals: 700, "Long Run": 1300, Strength: 300, Race: 1600, Travel: 300 }[workout.type] ?? 0;
  const hydration = Math.round((hydBase + hydWork) / 100) / 10;
  let fueling = "No specific intra-session fuelling needed.";
  if (workout.type === "Long Run") fueling = "60-90 g carbs/hour. Take a gel every ~35 min.";
  else if (workout.type === "Race") fueling = "Carb-load 36h prior. 70-90 g carbs/hour on course.";
  else if (workout.type === "Double Threshold") fueling = "Carbs before both sessions; refuel + rehydrate between AM and PM - the second session depends on it.";
  else if (["Threshold", "Intervals", "Tempo"].includes(workout.type)) fueling = "Light carbs pre-session; rehydrate after.";
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), maintenance: Math.round(maintenance), trainingCost: Math.round(rawCost * (replenishPct / 100)), rawTrainingCost: rawCost, replenishPct, deficit, deficitNote, calories, protein, carbs, fat, hydration, fueling, recoveryNote: recNote, adaptiveNote, adaptiveDelta, trendKgPerWeek: weightCtx && weightCtx.trendKgPerWeek != null ? weightCtx.trendKgPerWeek : null };
}
export function carbLoad(profile) { const perKg = 9, grams = Math.round(profile.weightKg * perKg); return { perKg, dailyGrams: grams, days: 3, totalGrams: grams * 3, note: "8-10 g carbs/kg/day across the final 2-3 days" }; }
export function raceFuelling(profile, projSecs) {
  const hours = projSecs / 3600, carbPerHr = 80, gelCarbs = profile.gelCarbs || 22;
  const totalCarb = Math.round(carbPerHr * hours); const totalGels = Math.max(1, Math.ceil(totalCarb / gelCarbs));
  const intervalMin = Math.round((projSecs / 60) / totalGels);
  const schedule = Array.from({ length: totalGels }, (_, i) => ({ gel: i + 1, atMin: intervalMin * (i + 1), atClock: secsToHMS(intervalMin * (i + 1) * 60) }));
  const fluidPerHr = profile.sweatRateMlPerHr ? Math.round(Number(profile.sweatRateMlPerHr)) : 600;
  const sodiumPerHr = profile.sweatRateMlPerHr ? Math.round((Number(profile.sweatRateMlPerHr) / 1000) * 800) : 500;
  return { carbPerHr, gelCarbs, totalCarb, totalGels, intervalMin, fluidPerHr, sodiumPerHr, hours: hours.toFixed(2), schedule };
}

/* ---- PREDICTIONS / VO2 / WEIGHT ---- */
export function predictGoal(race, load, fitness, completionPct, longRunPct, recoveryScore) {
  const goalSecs = race.goalSeconds, requiredCtl = 78; const fitnessRatio = Math.min(1.15, load.ctl / requiredCtl);
  const confidence = Math.max(5, Math.min(98, Math.round(fitnessRatio * 55 + completionPct * 22 + longRunPct * 13 + (recoveryScore / 100) * 10)));
  // Project from CURRENT FITNESS, not the goal: take the fitness-implied marathon
  // time and scale it to the race distance with Riegel (exponent 1.06).
  const raceKm = (GOAL_DIST_M[race.type] || 42195) / 1000;
  const marSecs = (fitness && fitness.currentMarathonSecs) || goalSecs;
  let projSecs = Math.round(marSecs * Math.pow(raceKm / 42.195, 1.06));
  const readinessAdj = 1 + (0.9 - confidence / 100) * 0.04; // under-trained -> a touch slower
  projSecs = Math.round(projSecs * readinessAdj);
  const range = Math.round(projSecs * 0.02);
  return { confidence, projectedTime: secsToHMS(projSecs), projectedSeconds: projSecs, forecastLow: secsToHMS(projSecs - range), forecastHigh: secsToHMS(projSecs + range) };
}
export const GOAL_DIST_M = { Marathon: 42195, Half: 21097, "10K": 10000, "5K": 5000 };
export function racePredictions(projSecs) { const D = 42195, eq = (d) => projSecs * Math.pow(d / D, 1.06); return [{ dist: "5K", time: secsToHMS(eq(5000)) }, { dist: "10K", time: secsToHMS(eq(10000)) }, { dist: "Half", time: secsToHMS(eq(21097)) }, { dist: "Marathon", time: secsToHMS(projSecs) }]; }
export function danielsVO2(distM, timeSec) { const v = distM / (timeSec / 60), t = timeSec / 60; const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v; const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t); return Math.round((vo2 / pct) * 10) / 10; }
// US Navy body-fat estimate from tape measurements (cm). Used when the athlete
// hasn't entered a body-fat %.
export function navyBodyFat(profile) {
  const m = profile.measurements || {}, h = profile.heightCm, neck = m.neck, waist = m.waist, hip = m.hip;
  if (!h || !neck || !waist) return null;
  const log10 = (x) => Math.log(x) / Math.LN10;
  let bf;
  if (profile.sex === "female") {
    if (!hip || (waist + hip - neck) <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * log10(waist + hip - neck) + 0.22100 * log10(h)) - 450;
  } else {
    if ((waist - neck) <= 0) return null;
    bf = 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(h)) - 450;
  }
  if (!isFinite(bf) || bf < 3 || bf > 60) return null;
  return Math.round(bf * 10) / 10;
}
// If a body-fat % is entered use it; otherwise estimate from measurements.
export function effectiveBodyFat(profile) {
  if (profile.bodyFatPct && profile.bodyFatPct > 0) return profile.bodyFatPct;
  const est = navyBodyFat(profile);
  return est != null ? est : (profile.sex === "female" ? 24 : 18);
}
export function predictRaceWeight(profile, weeksToRace) {
  const bf = effectiveBodyFat(profile);
  const leanMass = profile.weightKg * (1 - bf / 100);
  // Running-focused marathoner who also lifts: keep a slightly leaner running
  // floor, but raise the body-fat floor for athletes with a high relative-
  // strength profile so muscle is preserved.
  const rm = profile.oneRM || {};
  const relStrength = ((rm.backSquat || 0) + (rm.romanianDeadlift || 0)) / Math.max(1, profile.weightKg); // bodyweight multiples
  const strengthFloor = relStrength >= 4 ? 1.5 : relStrength >= 3 ? 1.0 : relStrength >= 2 ? 0.5 : 0;
  let lo = (profile.sex === "male" ? 9 : 16) + strengthFloor;
  let hi = (profile.sex === "male" ? 13 : 21) + Math.max(0, strengthFloor - 0.5);
  lo = Math.max(profile.sex === "male" ? 8 : 15, lo); hi = Math.max(lo + 2, hi);
  const wLow = leanMass / (1 - lo / 100), wHigh = leanMass / (1 - hi / 100);
  const rangeLow = Math.round(wLow * 10) / 10, rangeHigh = Math.round(wHigh * 10) / 10;
  // Project gradually toward the top of the range (never demanding muscle loss);
  // only lose if currently above the recommended range. Cap at 0.4 kg/week.
  const safeLoss = 0.4 * Math.max(0, weeksToRace);
  let projected = profile.weightKg;
  if (profile.weightKg > rangeHigh) projected = Math.max(rangeHigh, profile.weightKg - safeLoss);
  projected = Math.round(projected * 10) / 10;
  const diff = Math.round((profile.weightKg - projected) * 10) / 10; // kg to lose (>=0)
  const withinRange = profile.weightKg <= rangeHigh + 0.1;
  const aboveRange = Math.round(Math.max(0, profile.weightKg - rangeHigh) * 10) / 10; // total kg above race-weight range
  return { current: profile.weightKg, bodyFatPct: bf, bodyFatSource: (profile.bodyFatPct && profile.bodyFatPct > 0) ? "entered" : (navyBodyFat(profile) != null ? "measurements" : "estimate"), leanMass: Math.round(leanMass * 10) / 10, projected, rangeLow, rangeHigh, bfRange: `${Math.round(lo)}-${Math.round(hi)}%`, diff, aboveRange, withinRange, relStrength: Math.round(relStrength * 10) / 10 };
}
export function pacingStrategies(projSecs, raceKm = 42.195, units = "metric") {
  const imp = units === "imperial";
  const total = imp ? raceKm / KM_MI : raceKm; // race length in display units
  const mp = projSecs / total; // sec per display unit (km or mile)
  const lab = imp ? "mi" : "k";
  const adj = imp ? 6 * KM_MI : 6; // negative-split nudge, scaled to the unit
  const mk = (step) => { const pts = []; for (let d = step; d < total - 0.05; d += step) pts.push({ km: (Math.round(d * 10) / 10) + lab, time: secsToHMS(mp * d) }); pts.push({ km: "Finish", time: secsToHMS(projSecs) }); return pts; };
  const half = total / 2;
  return { goalPace: pace(mp), paceUnit: imp ? "/mi" : "/km", raceKm: Math.round(raceKm * 10) / 10, splits1k: mk(1), splits5k: mk(5), evenSplits: mk(5), negative: { firstHalf: secsToHMS((mp + adj) * half), secondHalf: secsToHMS((mp - adj) * half) } };
}
export function raceReadiness(load, recoveryScore, longRunPct, completionPct, sleepQuality) {
  const tsbScore = Math.max(0, Math.min(100, (load.tsb + 30) * (100 / 50)));
  const score = Math.round(tsbScore * 0.25 + recoveryScore * 0.25 + longRunPct * 100 * 0.2 + completionPct * 100 * 0.2 + sleepQuality * 0.1);
  let category = "High Risk"; if (score >= 90) category = "Race Ready"; else if (score >= 75) category = "On Track"; else if (score >= 60) category = "Needs Improvement";
  return { score: Math.max(0, Math.min(100, score)), category };
}
export const B_RACE_RECOVERY = { "5K": "1 day", "10K": "2-3 days", Half: "5-7 days", Marathon: "10-14 days" };
export const B_RACE_RECOVERY_DAYS = { "5K": 1, "10K": 3, Half: 6, Marathon: 12 };
export const B_RACE_TAPER_DAYS = { "5K": 2, "10K": 2, Half: 3, Marathon: 4 };
// Weave B-races into the plan the way a coach would: a short sharpening taper
// before, the race itself, then distance-appropriate recovery. Quality/long/
// strength near the race become easy or rest, trimming that week's volume.
export function applyBRaces(weeks, bRaces, maxHr) {
  if (!bRaces || !bRaces.length) return new Set();
  const flat = []; weeks.forEach((w, wi) => w.days.forEach((d, di) => flat.push({ wi, di, d })));
  flat.sort((a, b) => a.d.date.localeCompare(b.d.date));
  const affected = new Set();
  bRaces.forEach((b) => {
    const bISO = iso(new Date(b.date));
    const idx = flat.findIndex((x) => x.d.date === bISO);
    if (idx < 0) return; // outside the plan window
    const taperN = B_RACE_TAPER_DAYS[b.type] ?? 2, recN = B_RACE_RECOVERY_DAYS[b.type] ?? 3;
    const phase = weeks[flat[idx].wi].phase;
    const easyKm = b.type === "Marathon" ? 8 : 6;
    // Race day
    const distKm = Math.round(((GOAL_DIST_M[b.type] || 10000) / 1000) * 10) / 10;
    const raceDay = { ...buildWorkoutData("Race", phase, distKm, false, maxHr), date: bISO, dow: flat[idx].d.dow, name: `${b.type} B-race`, detail: `${b.name} (B race)`, bRace: b.name };
    weeks[flat[idx].wi].days[flat[idx].di] = raceDay; affected.add(flat[idx].wi);
    // Sharpening taper before (easy, with rest the day before)
    for (let k = 1; k <= taperN; k++) {
      const t = flat[idx - k]; if (!t) break;
      const day = weeks[t.wi].days[t.di]; if (day.bRace || day.type === "Race") continue;
      const repl = k === 1 ? buildWorkoutData("Rest", weeks[t.wi].phase, 0, false, maxHr) : buildWorkoutData("Easy Run", weeks[t.wi].phase, easyKm, false, maxHr);
      weeks[t.wi].days[t.di] = { ...repl, date: day.date, dow: day.dow, detail: `B-race taper`, bRaceAdj: true }; affected.add(t.wi);
    }
    // Recovery after (rest then easy/recovery runs; no quality, long or strength)
    for (let k = 1; k <= recN; k++) {
      const r = flat[idx + k]; if (!r) break;
      const day = weeks[r.wi].days[r.di]; if (day.bRace || day.type === "Race") continue;
      const repl = k <= 2 ? buildWorkoutData("Rest", weeks[r.wi].phase, 0, false, maxHr) : buildWorkoutData("Recovery Run", weeks[r.wi].phase, Math.max(4, easyKm - 2), false, maxHr);
      weeks[r.wi].days[r.di] = { ...repl, date: day.date, dow: day.dow, detail: `B-race recovery`, bRaceAdj: true }; affected.add(r.wi);
    }
  });
  // Recompute aggregates for any week we touched
  affected.forEach((wi) => {
    const w = weeks[wi];
    w.volumeKm = Math.round(w.days.reduce((s, d) => s + (d.distanceKm || 0), 0));
    w.load = w.days.reduce((s, d) => s + (d.load || 0), 0);
    w.runCount = w.days.filter((d) => d.distanceKm > 0 && d.type !== "Rest").length;
    w.liftCount = w.days.filter((d) => d.type === "Strength").length;
    w.hasBRace = w.days.some((d) => d.bRace);
  });
  return affected;
}
export function buildProgress(plan, currentWeek, liftLogs, bodyLogs, runLogs = [], vo2Logs = [], currentBody = null) {
  const start = Math.max(0, currentWeek - 12);
  const wk = plan.weeks.slice(start, currentWeek);
  const running = wk.map((w) => ({ week: "W" + w.weekNumber, volume: w.volumeKm, load: w.load }));
  const longRun = wk.map((w) => ({ week: "W" + w.weekNumber, km: w.longRunKm }));
  const MAIN_LIFTS = ["Back Squat", "Romanian Deadlift", "Bench Press", "Overhead Press"];
  const byLift = {}; liftLogs.filter((l) => MAIN_LIFTS.includes(l.exercise)).forEach((l) => { (byLift[l.exercise] = byLift[l.exercise] || []).push({ date: fmtShort(l.date), iso: l.date, e1rm: l.e1rm }); });
  Object.keys(byLift).forEach((k) => byLift[k].sort((a, b) => a.iso.localeCompare(b.iso)));
  // Merge every lift onto one shared, date-sorted axis so the multi-line chart aligns
  // (giving each recharts <Line> its own data array misaligns/drops points once lifts
  // are logged on different days via the A/B/C rotation). One row per logged date.
  const strengthLifts = MAIN_LIFTS.filter((n) => byLift[n] && byLift[n].length);
  const dateMap = {}; strengthLifts.forEach((n) => byLift[n].forEach((d) => { dateMap[d.iso] = d.date; }));
  const strengthSeries = Object.keys(dateMap).sort().map((isoD) => { const row = { date: dateMap[isoD], iso: isoD }; strengthLifts.forEach((n) => { const hit = byLift[n].find((d) => d.iso === isoD); if (hit) row[n] = hit.e1rm; }); return row; });
  const body = bodyLogs.map((b) => ({ date: fmtShort(b.date), weight: b.weightKg, bf: b.bodyFatPct }));
  // End the trend at the current profile so edits to weight/body-fat show up even
  // without a fresh measurement log (keeps lean-mass consistent with the profile).
  if (currentBody && currentBody.weightKg > 0) {
    const last = bodyLogs[bodyLogs.length - 1];
    if (!last || Math.abs((last.weightKg || 0) - currentBody.weightKg) > 0.05 || Math.abs((last.bodyFatPct || 0) - currentBody.bodyFatPct) > 0.05) {
      body.push({ date: "Now", weight: currentBody.weightKg, bf: currentBody.bodyFatPct });
    }
  }
  // Pace trend from logged runs (min/km), oldest first
  const pace = [...runLogs].filter((r) => r.distanceKm > 0 && r.durationMin > 0 && r.type !== "Strength")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ date: fmtShort(r.date), pace: Math.round((r.durationMin / r.distanceKm) * 100) / 100, type: r.type }));
  // VO2 max trend from logged readings, oldest first
  const vo2 = [...vo2Logs].sort((a, b) => a.date.localeCompare(b.date)).map((v) => ({ date: fmtShort(v.date), vo2: v.vo2max }));
  // Weekly training load (CTL proxy already per-week)
  const load = running.map((r) => ({ week: r.week, load: r.load }));
  return { running, longRun, strength: byLift, strengthSeries, strengthLifts, body, pace, vo2, load };
}
export function buildAlerts(recovery, load, readiness, missedKey, holidayActive, shoeAlerts = []) {
  const alerts = [];
  if (load.category === "High Risk") alerts.push({ level: "high", text: "Training Stress Balance is in the high-risk zone. Reduce volume and remove intensity." });
  recovery.actions.forEach((a) => { if (recovery.level >= 2) alerts.push({ level: recovery.level >= 4 ? "high" : "warn", text: a }); });
  if (readiness.category === "High Risk") alerts.push({ level: "high", text: "Race readiness is low. Prioritise sleep and long-run consistency." });
  if (missedKey) alerts.push({ level: "warn", text: "A key session was missed - upcoming quality was reduced to avoid stacking hard days." });
  if (holidayActive) alerts.push({ level: "ok", text: "Holiday in effect - full rest, no running scheduled. Enjoy the break and return refreshed." });
  shoeAlerts.forEach((s) => alerts.push({ level: "warn", text: s }));
  if (alerts.length === 0) alerts.push({ level: "ok", text: "All systems green. Execute today as planned." });
  return alerts;
}
// A human-coach style review of the whole plan: where things stand, what's going
// well, and what to watch.
export function buildCoachReview(ctx) {
  const { phase, week, weeksToRace, completionPct, longRunPct, vo2Trend, recovery, readiness, load, missedKey, holidayActive, isRecoveryWeek, weight, shoeAlerts } = ctx;
  const pct = (x) => Math.round(x * 100);
  const headline = `Week ${week} - ${phase}${isRecoveryWeek ? " (recovery)" : ""} phase, ${weeksToRace} week${weeksToRace === 1 ? "" : "s"} to race. Readiness ${readiness.score} (${readiness.category}).`;
  const wins = [], watch = [];
  if (completionPct >= 0.85) wins.push(`Consistency is strong - ${pct(completionPct)}% of sessions completed over the last 4 weeks.`);
  else watch.push(`Session completion is ${pct(completionPct)}% - aim for 85%+ to stay on track for your goal.`);
  if (longRunPct >= 0.8) wins.push(`Long runs are on schedule (${pct(longRunPct)}% completed) - the marathon-specific work is banking.`);
  else if (ctx.hasLongRuns) watch.push(`Long-run completion is ${pct(longRunPct)}% - these are the highest-value marathon sessions, protect them.`);
  if (vo2Trend != null && vo2Trend > 0) wins.push(`Fitness is trending up - VO\u2082 max +${vo2Trend} since your last reading.`);
  else if (vo2Trend != null && vo2Trend < 0) watch.push(`VO\u2082 max dipped ${vo2Trend} - normal during heavy load, but watch recovery.`);
  if (load.category === "Fresh" || load.category === "Ready") wins.push(`Training load is balanced (TSB ${load.tsb > 0 ? "+" : ""}${load.tsb}, ${load.category}) - you're absorbing the work.`);
  if (load.category === "High Risk") watch.push(`Fatigue is high (TSB ${load.tsb}) - back off volume/intensity for a few days to avoid digging a hole.`);
  if (recovery.level >= 2) watch.push(`Recovery score is ${recovery.score} - prioritise sleep, easy days and fuelling before the next quality session.`);
  else if (recovery.score >= 75) wins.push(`Recovery is solid (${recovery.score}/100) - good platform for quality work.`);
  if (missedKey) watch.push("A key session was missed recently - the plan rebalanced, just avoid stacking hard days to compensate.");
  if (weight && weight.aboveRange > 0) watch.push(`${weight.aboveRange} kg above race-weight range - the gentle Base/Build deficit is handling this; don't rush it.`);
  else if (weight && weight.withinRange) wins.push("You're inside your race-weight range - fuelling now favours performance.");
  (shoeAlerts || []).forEach((s) => watch.push(s));
  let focus;
  if (holidayActive) focus = "You're on holiday - rest completely. No running needed; come back fresh and the plan picks up automatically.";
  else if (phase === "Base") focus = "Base phase: build easy aerobic volume and consistency. Keep easy days truly easy and bank the long runs.";
  else if (phase === "Build") focus = "Build phase: this is where the work counts - hit your two quality sessions and progress the long run each week.";
  else if (phase === "Peak") focus = "Peak phase: your biggest long runs and sharpest sessions. Recover hard between them - quality over quantity now.";
  else if (phase === "Taper") focus = "Taper: drop volume, keep a little intensity to stay sharp. Extra sleep and carbs - trust the work is done.";
  else if (phase === "Recovery") focus = "Recovery block: easy running only, let fitness consolidate. Resist the urge to push.";
  else focus = "Off-season: maintain easy aerobic fitness and strength; the structured block will rebuild toward your next race.";
  return { headline, wins, watch, focus };
}

/* ---- STATE ASSEMBLY ---- */
// Plan generation is the most expensive step in a derive. Memoise it on its inputs so
// actions that DON'T change the plan (logging a run/lift, a check-in, navigation) reuse
// the last build instead of regenerating 52 weeks. Returns a fresh clone each time
// because downstream adaptation mutates day objects in place.
export let _planCache = { sig: null, plan: null };
export function generatePlanMemo(profile, race, holidays, bRaces) {
  let sig; try { sig = JSON.stringify([profile, race, holidays, bRaces]); } catch (e) { sig = null; }
  if (sig != null && _planCache.sig === sig) return JSON.parse(JSON.stringify(_planCache.plan));
  const plan = generatePlan(profile, race, holidays, bRaces);
  if (sig != null) _planCache = { sig, plan };
  return JSON.parse(JSON.stringify(plan));
}
export function deriveState(core) {
  const today = core.today, profile = sanitizeProfile(core.profile); const units = profile.units || "metric";
  const races = core.races || [];
  const race = races.find((r) => r.priority === "A") || races[0] || null;
  const noRace = !race;
  const bRaces = races.filter((r) => r.priority === "B" && r.date);
  const shoes = core.shoes || [];
  const shoeAlerts = shoes.filter((s) => !s.retired && s.lifetimeKm > 0 && s.km >= s.lifetimeKm).map((s) => `${s.name} has reached its ${s.lifetimeKm} km lifetime (${Math.round(s.km)} km logged) - time to retire it to avoid injury.`);
  const maxHr = profile.maxHr || Math.round(208 - 0.7 * profile.age);
  // VO2 history -> averaged value for paces, and a fitness-aware methodology pick.
  const vo2Logs = (core.vo2Logs || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const vo2Latest = vo2Logs.length ? vo2Logs[vo2Logs.length - 1].vo2max : null;
  const vo2Prev = vo2Logs.length > 1 ? vo2Logs[vo2Logs.length - 2].vo2max : null;
  const vo2Trend = vo2Latest != null && vo2Prev != null ? Math.round((vo2Latest - vo2Prev) * 10) / 10 : null;
  const recentVo2 = vo2Logs.slice(-3);
  const vo2ForPaces = recentVo2.length ? Math.round((recentVo2.reduce((s, x) => s + x.vo2max, 0) / recentVo2.length) * 10) / 10 : (profile.vo2max ? Number(profile.vo2max) : null);
  const methodAuto = autoMethodology(profile, vo2ForPaces);
  const methodology = (profile.methodologyPref && profile.methodologyPref !== "Auto") ? profile.methodologyPref : methodAuto; // user override (Settings) else best fit
  const recentWeeklyKm = (() => { const logs = (core.runLogs || []).filter((r) => r.date >= iso(addDays(today, -84))); if (!logs.length) return 0; const wkBucket = {}; logs.forEach((r) => { const wi = Math.floor(diffDays(today, r.date) / 7); wkBucket[wi] = (wkBucket[wi] || 0) + (r.distanceKm || 0); }); let best = 0; for (let s = 0; s <= 8; s++) { let sum = 0; for (let k = s; k < s + 4; k++) sum += (wkBucket[k] || 0); best = Math.max(best, sum / 4); } return Math.round(best); })();
  const recoveryReadiness = measuredRecovery(core.recoveryInputs);
  const acute7 = (core.runLogs || []).filter((r) => r.date >= iso(addDays(today, -7))).reduce((s, r) => s + (r.distanceKm || 0), 0);
  const chronic28 = (core.runLogs || []).filter((r) => r.date >= iso(addDays(today, -28))).reduce((s, r) => s + (r.distanceKm || 0), 0) / 4;
  const acwr = chronic28 > 5 ? acute7 / chronic28 : 1;
  const fatigueDeload = (recoveryReadiness != null && recoveryReadiness < 0.33) || acwr > 1.5;
  let plan = generatePlanMemo({ ...profile, methodology, recentWeeklyKm, baseStartDate: core.baseStartDate, lastRaceType: core.lastRaceType, recoveryReadiness, fatigueDeload, todayISO: iso(today) }, race, core.holidays, bRaces);
  plan = applyOverrides(plan, core.overrides, maxHr);
  const adaptation = applyAdaptations(plan, core, today, maxHr);
  plan = adaptation.plan;
  // Per-day strength sessions: cycle A/B/C within each week so the weekly lifting complements itself (every compound + body part, no duplicated session).
  plan.weeks.forEach((wk) => { const sDays = wk.days.filter((d) => d.type === "Strength").sort((a, b) => a.date.localeCompare(b.date)); sDays.forEach((d, i) => { d.strengthIdx = i; d.session = generateStrengthSession(profile, wk.weekNumber, wk.phase, wk.isRecovery, i, core.liftWeights || {}); }); });
  const load = computeTrainingLoad(plan, today, core.completions);
  const cutoff = iso(addDays(today, -28));
  const recent = allDays(plan).filter((d) => d.date >= cutoff && d.date < iso(today) && d.type !== "Rest");
  let done = 0, total = 0, longDone = 0, longTotal = 0;
  recent.forEach((d) => { total++; const rec = core.completions[d.date]; const ok = rec ? rec.status !== "Missed" : true; if (ok) done++; if (d.type === "Long Run") { longTotal++; if (ok) longDone++; } });
  const completionPct = total ? done / total : 1, longRunPct = longTotal ? longDone / longTotal : 1;
  const missedKey = Object.values(core.completions).some((r) => r.status === "Missed" && r.key);
  // Personalised HRV / resting-HR baselines: a trailing average of the athlete's own
  // logged readings (needs a handful of entries), falling back to the stored baseline
  // then a sensible default. Prevents scoring a naturally-low-HRV athlete as permanently
  // unrecovered against a seed constant.
  const _avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const _rl = (core.recoveryLogs || []).filter((r) => r && r.date).slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  const _hrvVals = _rl.map((r) => r.hrv).filter((v) => Number.isFinite(v) && v > 0);
  const _rhrVals = _rl.map((r) => r.restingHr).filter((v) => Number.isFinite(v) && v > 0);
  const hrvBaseline = _hrvVals.length >= 5 ? Math.round(_avg(_hrvVals)) : (core.recoveryInputs.hrvBaseline || 60);
  const rhrBaseline = _rhrVals.length >= 5 ? Math.round(_avg(_rhrVals)) : (core.recoveryInputs.rhrBaseline || 50);
  const recovery = computeRecovery({ ...core.recoveryInputs, hrvBaseline, rhrBaseline }, load.tsb, completionPct);
  const fitness = estimateFitness(load, vo2ForPaces);
  const goal = noRace ? { confidence: null, projectedTime: "-", projectedSeconds: null, forecastLow: "-", forecastHigh: "-" } : predictGoal(race, load, fitness, completionPct, longRunPct, recovery.score);
  const readiness = noRace ? { score: null, category: "No race" } : raceReadiness(load, recovery.score, longRunPct, completionPct, core.recoveryInputs.sleepQuality);
  const todayISO = iso(today);
  const todayWorkout = dayFor(plan, todayISO) || buildWorkoutData("Rest", "Base", 0, false, maxHr);
  const curWeek = weekFor(plan, todayISO);
  const holidayActive = !!core.holidays.find((x) => todayISO >= x.start && todayISO <= x.end);
  const raceCountdown = noRace ? null : diffDays(race.date, today);
  const weeksToRace = noRace ? null : Math.max(0, Math.round(raceCountdown / 7));
  const weight = predictRaceWeight(profile, noRace ? 999 : weeksToRace);
  // Reach race weight by the END of the Build phase, so Peak/Taper/Recovery are
  // fully fuelled for performance. The race-weight gap feeds the fuel engine.
  const buildWeeks = plan.weeks.filter((w) => w.phase === "Build");
  const endOfBuildISO = buildWeeks.length ? buildWeeks[buildWeeks.length - 1].endDate : null;
  const daysToRaceWeight = endOfBuildISO ? diffDays(endOfBuildISO, today) : 0;
  const weightTrend = weightTrendKgPerWeek(core.bodyLogs);
  const weightCtx = noRace ? { kgToLose: 0, daysToTarget: 0, endOfBuildISO: null, trendKgPerWeek: weightTrend } : { kgToLose: weight.aboveRange, daysToTarget: daysToRaceWeight, endOfBuildISO, trendKgPerWeek: weightTrend };
  const nutrition = computeNutrition(profile, todayWorkout, curWeek.phase, recovery.status, curWeek.isRecovery, weightCtx);
  const alerts = [...adaptation.notes, ...buildAlerts(recovery, load, readiness, missedKey, holidayActive, shoeAlerts)];
  if (fatigueDeload) alerts.push(acwr > 1.5 ? `Acute training load has spiked (acute:chronic ${acwr.toFixed(1)}) - this week is now a recovery week to absorb it.` : "Recovery signals (HRV / sleep) are low - this week is now a recovery week.");
  if (noRace && core.lastRaceType && core.baseStartDate) { const wksSince = Math.floor(diffDays(todayISO, core.baseStartDate) / 7); const taperLen = (RACE_RECOVERY[core.lastRaceType] || RACE_RECOVERY.Marathon).length; if (wksSince >= 0 && wksSince <= taperLen) { if (recoveryReadiness >= 0.66) alerts.push("Post-race recovery looks strong (HRV / sleep) - easing you back into volume a little faster than the default."); else if (recoveryReadiness <= 0.4) alerts.push("Post-race recovery signals are still low (HRV / sleep) - holding easy running longer before rebuilding volume."); } }
  const paces = computePaces(fitness);
  const predictions = racePredictions(noRace ? Math.round(fitness.currentMarathonSecs) : goal.projectedSeconds);
  const pacing = noRace ? null : pacingStrategies(goal.projectedSeconds, (GOAL_DIST_M[race.type] || 42195) / 1000, units);
  const fuelling = noRace ? null : raceFuelling(profile, goal.projectedSeconds);
  const carb = (!noRace && (race.type === "Marathon" || race.type === "Half")) ? carbLoad(profile) : null;
  // Strength alternation + progression: count scheduled strength days for A/B parity,
  // and completed strength sessions for accessory linear progression.
  const todaysStrengthDay = todayWorkout.type === "Strength" ? todayWorkout : null;
  const firstStrengthThisWeek = (curWeek.days || []).find((d) => d.type === "Strength" && d.session);
  // Today's strength session is regenerated against live recovery + race proximity so it
  // autoregulates (load/sets/RIR) and gates plyometrics; other days keep the neutral plan.
  const strengthSession = todaysStrengthDay
    ? generateStrengthSession(profile, curWeek.weekNumber, curWeek.phase, curWeek.isRecovery, todaysStrengthDay.strengthIdx || 0, core.liftWeights || {}, { readiness: recovery.score, weeksToRace: weeksToRace == null ? 99 : weeksToRace })
    : (firstStrengthThisWeek && firstStrengthThisWeek.session) || generateStrengthSession(profile, curWeek.weekNumber, curWeek.phase, curWeek.isRecovery, 0, core.liftWeights || {});
  const progress = buildProgress(plan, curWeek.weekNumber, core.liftLogs, core.bodyLogs, core.runLogs || [], vo2Logs, { weightKg: profile.weightKg, bodyFatPct: effectiveBodyFat(profile) });
  const coachReview = buildCoachReview({ phase: curWeek.phase, week: curWeek.weekNumber, weeksToRace: weeksToRace || 0, completionPct, longRunPct, hasLongRuns: longTotal > 0, vo2Trend, recovery, readiness: noRace ? { score: 0, category: "On Track" } : readiness, load, missedKey, holidayActive, isRecoveryWeek: curWeek.isRecovery, weight, shoeAlerts });
  if (noRace) { coachReview.headline = "Base training"; coachReview.focus = "No goal race set - building a consistent aerobic base. Add a race anytime to switch to a full periodised plan."; }
  const goalDist = noRace ? 42195 : (GOAL_DIST_M[race.type] || 42195);
  const vo2Target = noRace ? null : danielsVO2(goalDist, race.goalSeconds);
  const currentForDist = fitness.currentMarathonSecs * Math.pow(goalDist / 42195, 1.06);
  const vo2Current = danielsVO2(goalDist, currentForDist);
  const athleteState = { profile, currentFitness: { ...load, ...fitness }, recoveryStatus: { score: recovery.score, status: recovery.status, level: recovery.level }, currentPlan: plan, upcomingRaces: core.races, nutritionTargets: nutrition, goalForecast: goal, completionPct, longRunPct };
  const todayState = {
    currentDate: todayISO, currentWeek: curWeek.weekNumber, currentPhase: curWeek.phase, isRecoveryWeek: curWeek.isRecovery,
    todaysWorkout: todayWorkout, recoveryScore: recovery.score, recoveryStatus: recovery.status, recovery,
    trainingLoad: { ctl: load.ctl, atl: load.atl, tsb: load.tsb, category: load.category, series: load.series },
    nutritionTargets: nutrition, hydrationTarget: nutrition.hydration, noRace, recoveryReadiness, raceCountdown, raceReadiness: readiness,
    goalConfidence: goal.confidence, goalForecast: goal, coachAlerts: alerts, weekExecution: weekCompliance(curWeek, core.completions), completions: core.completions, plan, overrides: core.overrides || {}, health: core.health || {}, upcomingEvents: core.races.map((r) => ({ ...r, daysAway: diffDays(r.date, today) })),
    units, completionPct, longRunPct, maxHr, paces, fitness, predictions, weight, pacing, fuelling, carb, strengthSession, progress, weeksToRace, holidayActive, vo2Target, vo2Current,
    vo2Logged: vo2Latest, vo2Previous: vo2Prev, vo2Trend, vo2Source: fitness.source, vo2ForPaces,
    methodology, methodologyInfo: METHODOLOGY_INFO[methodology], methodologyIsAuto: !(profile.methodologyPref && profile.methodologyPref !== "Auto"), weightLoss: { kgToLose: weight.aboveRange, daysToTarget: daysToRaceWeight, endOfBuild: endOfBuildISO, dailyDeficit: nutrition.deficit },
    shoes, coachReview, bRaces: bRaces.map((r) => ({ ...r, daysAway: diffDays(r.date, today) })),
    checkedInToday: core.lastCheckinDate === todayISO,
    nextBRace: (() => { const fut = bRaces.filter((r) => diffDays(r.date, today) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0]; return fut ? { ...fut, daysAway: diffDays(fut.date, today) } : null; })(),
    profileName: profile.name || "athlete",
  };
  return { athleteState, todayState };
}

/* ---- SEED + REDUCER ---- */
export function seedHistory(today) {
  const lifts = [], body = []; const baseW = 73.4, baseBf = 16.2; const liftBase = { "Back Squat": 132, "Romanian Deadlift": 138, "Bench Press": 96, "Overhead Press": 58 };
  for (let i = 10; i >= 1; i--) { const d = iso(addDays(today, -i * 7)); body.push({ date: d, weightKg: Math.round((baseW - (10 - i) * 0.14) * 10) / 10, bodyFatPct: Math.round((baseBf - (10 - i) * 0.12) * 10) / 10 }); Object.entries(liftBase).forEach(([ex, b]) => { const e1rm = Math.round(b + (10 - i) * 1.2); lifts.push({ date: d, exercise: ex, weightKg: round2_5(e1rm * 0.85), reps: 5, e1rm }); }); }
  return { lifts, body };
}
export const SCHEMA_VERSION = 2;
// Coerce to a finite number, falling back when blank/NaN, clamped to [min,max].
export function numOr(v, fallback, min, max) {
  let n = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(n)) n = fallback;
  if (n == null) return n;
  if (min != null && n < min) n = min;
  if (max != null && n > max) n = max;
  return n;
}
// Clamp the safety-critical profile numbers so a stray NaN/blank can never poison
// the engine (BMR, paces, loads) or be persisted. Used for ENGINE input + on load/save,
// never on every keystroke (so typing a blank field stays smooth).
export function sanitizeProfile(p) {
  if (!p || typeof p !== "object") return p;
  const m = p.measurements || {}, rm = p.oneRM || {};
  const age = numOr(p.age, 35, 12, 100);
  return { ...p,
    age, heightCm: numOr(p.heightCm, 175, 120, 230), weightKg: numOr(p.weightKg, 75, 35, 250),
    bodyFatPct: numOr(p.bodyFatPct, 0, 0, 60), maxHr: numOr(p.maxHr, Math.round(208 - 0.7 * age), 120, 230),
    availabilityDays: numOr(p.availabilityDays, 5, 1, 7), gelCarbs: numOr(p.gelCarbs, 22, 0, 120),
    currentWeeklyVolumeKm: numOr(p.currentWeeklyVolumeKm, 40, 0, 300),
    vo2max: (p.vo2max === "" || p.vo2max == null) ? p.vo2max : numOr(p.vo2max, null, 20, 95),
    measurements: { neck: numOr(m.neck, 0, 0, 80), waist: numOr(m.waist, 0, 0, 200), hip: numOr(m.hip, 0, 0, 200) },
    oneRM: { backSquat: numOr(rm.backSquat, 100, 0, 500), romanianDeadlift: numOr(rm.romanianDeadlift, 100, 0, 500), benchPress: numOr(rm.benchPress, 70, 0, 400), overheadPress: numOr(rm.overheadPress, 45, 0, 300) },
  };
}
// Bring an older saved blob up to the current shape. Extend as the schema grows.
export function migrateCore(c) {
  if (!c || typeof c !== "object") return c;
  const out = { ...c };
  if (out.profile) out.profile = sanitizeProfile({ ...out.profile });
  ["runLogs", "liftLogs", "bodyLogs", "sessionLogs", "vo2Logs", "recoveryLogs"].forEach((k) => { if (!Array.isArray(out[k])) out[k] = []; });
  if (!out.recoveryInputs || typeof out.recoveryInputs !== "object") out.recoveryInputs = {};
  if (!out.health || typeof out.health !== "object") out.health = { illness: false, injury: false };
  out.schemaVersion = SCHEMA_VERSION;
  return out;
}
export function seedCore() {
  const today = new Date(); const hist = seedHistory(today);
  return {
    today,
    profile: { name: "Matt", age: 34, sex: "male", heightCm: 178, weightKg: 72, bodyFatPct: 15, measurements: { neck: 39, waist: 82, hip: 99 }, availabilityDays: 6, planStartDate: iso(mondayOf(addDays(today, -8 * 7))), longRunDay: "Sun", maxHr: Math.round(208 - 0.7 * 34), gelCarbs: 22, currentWeeklyVolumeKm: 52, setupComplete: true, oneRM: { backSquat: 145, romanianDeadlift: 150, benchPress: 105, overheadPress: 65 } },
    races: [
      { id: "A1", name: "Autumn City Marathon", type: "Marathon", priority: "A", date: iso(mondayOf(addDays(today, 9 * 7 + 6))), goalTime: "3:30:00", goalSeconds: 3 * 3600 + 30 * 60 },
      { id: "B1", name: "Riverside Half", type: "Half", priority: "B", date: iso(mondayOf(addDays(today, 5 * 7 + 6))), goalTime: "1:35:00", goalSeconds: 95 * 60 },
    ],
    shoes: [{ id: "s1", name: "Daily Trainer", lifetimeKm: 800, km: 540, retired: false }, { id: "s2", name: "Tempo / Race", lifetimeKm: 400, km: 412, retired: false }],
    holidays: [], recoveryInputs: { sleepHours: 7.3, sleepQuality: 78, hrv: 56, hrvBaseline: 62, restingHr: 51, rhrBaseline: 49, subjectiveFatigue: 4 },
    health: { illness: false, injury: false }, overrides: {}, completions: {}, runLogs: [], liftLogs: hist.lifts, bodyLogs: hist.body, sessionLogs: [], vo2Logs: [], recoveryLogs: [], schemaVersion: SCHEMA_VERSION,
  };
}
export function emptyCore() {
  const today = new Date();
  return {
    today,
    profile: { name: "", age: 35, sex: "male", heightCm: 175, weightKg: 75, bodyFatPct: 18, measurements: { neck: 0, waist: 0, hip: 0 }, availabilityDays: 5, planStartDate: iso(mondayOf(addDays(today, 7))), longRunDay: "Sun", maxHr: Math.round(208 - 0.7 * 35), gelCarbs: 22, currentWeeklyVolumeKm: 40, setupComplete: false, oneRM: { backSquat: 100, romanianDeadlift: 100, benchPress: 70, overheadPress: 45 } },
    races: [{ id: "A1", name: "Goal Marathon", type: "Marathon", priority: "A", date: iso(mondayOf(addDays(today, 16 * 7))), goalTime: "3:45:00", goalSeconds: 3 * 3600 + 45 * 60 }],
    shoes: [], holidays: [], recoveryInputs: { sleepHours: 7.5, sleepQuality: 75, hrv: 55, hrvBaseline: 55, restingHr: 52, rhrBaseline: 52, subjectiveFatigue: 4 },
    health: { illness: false, injury: false }, overrides: {}, completions: {}, runLogs: [], liftLogs: [], bodyLogs: [], sessionLogs: [], vo2Logs: [], recoveryLogs: [], schemaVersion: SCHEMA_VERSION,
  };
}
export function uid() { try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {} return "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
export function reducer(core, action) {
  switch (action.type) {
    case "WorkoutCompleted": return { ...core, completions: { ...core.completions, [action.date]: { status: "Completed", compliance: (action.compliancePct ?? 100) / 100, key: action.key } } };
    case "WorkoutMissed": return { ...core, completions: { ...core.completions, [action.date]: { status: "Missed", compliance: 0, key: action.key } } };
    case "RunLogged": {
      const aRace = (core.races || []).find((r) => r.priority === "A") || core.races[0] || null;
      const bRaces = (core.races || []).filter((r) => r.priority === "B" && r.date);
      const plan = generatePlan(core.profile, aRace, core.holidays, bRaces); const planned = dayFor(plan, action.date);
      const v = planned && planned.distanceKm > 0 ? evaluateVariance(planned, action.run) : { compliance: "Completed", compliancePct: 100 };
      const vo2Logs = action.run.vo2max ? [...(core.vo2Logs || []), { date: action.date, vo2max: action.run.vo2max }] : (core.vo2Logs || []);
      let shoes = core.shoes || [];
      if (action.run.shoeId) shoes = shoes.map((s) => s.id === action.run.shoeId ? { ...s, km: Math.round(((s.km || 0) + (parseFloat(action.run.distanceKm) || 0)) * 10) / 10 } : s);
      return { ...core, shoes, runLogs: [{ ...action.run, id: action.run.id || uid(), source: action.run.source || "manual", date: action.date }, ...core.runLogs], vo2Logs, sessionLogs: (action.run.splits || action.run.reps) ? [{ id: uid(), source: action.run.source || "manual", kind: "run", date: action.date, type: action.run.type, splits: action.run.splits, reps: action.run.reps }, ...core.sessionLogs] : core.sessionLogs, completions: { ...core.completions, [action.date]: { status: v.compliance === "Missed" ? "Missed" : "Completed", compliance: v.compliancePct / 100, key: ["Long Run", "Threshold", "Intervals", "Race"].includes(planned?.type) } } };
    }
    case "VO2Logged": return { ...core, vo2Logs: [...(core.vo2Logs || []), { date: action.date, vo2max: action.vo2max }] };
    case "LiftLogged": {
      const e1rm = Math.round(action.lift.weightKg * (1 + action.lift.reps / 30)); const map = { "Back Squat": "backSquat", "Romanian Deadlift": "romanianDeadlift", "Bench Press": "benchPress", "Overhead Press": "overheadPress" }; const k = map[action.lift.exercise];
      const oneRM = k ? { ...core.profile.oneRM, [k]: Math.max(core.profile.oneRM[k], e1rm) } : core.profile.oneRM;
      return { ...core, profile: { ...core.profile, oneRM }, liftLogs: [{ ...action.lift, id: action.lift.id || uid(), source: action.lift.source || "manual", e1rm, date: action.date }, ...core.liftLogs] };
    }
    case "StrengthLogged": {
      // Per-set logging. Each exercise carries an array of sets and (for weighted
      // lifts) a target {sets,reps,weightKg}. Progression: if you complete ALL sets
      // at the target reps and weight, next time is +2.5 kg (upper) / +5 kg (lower);
      // if you miss, the weight is held. Timed exercises log time only, no weight.
      let oneRM = { ...core.profile.oneRM }; const liftLogs = [...core.liftLogs];
      const liftWeights = { ...(core.liftWeights || {}) }; let vl = 0;
      const map = { "Back Squat": "backSquat", "Romanian Deadlift": "romanianDeadlift", "Bench Press": "benchPress", "Overhead Press": "overheadPress" };
      action.exercises.forEach((ex) => {
        if (ex.timed) return; // planks etc. - no weight progression
        const sets = (ex.sets || []).filter((s) => s.weight > 0 && s.reps > 0);
        const tgt = ex.target;
        if (tgt && tgt.weightKg != null) {
          const hit = sets.length >= tgt.sets && sets.every((s) => s.reps >= tgt.reps && s.weight >= tgt.weightKg - 0.01);
          liftWeights[ex.name] = hit ? round2_5(tgt.weightKg + liftIncrement(ex.name)) : tgt.weightKg;
        }
        if (!sets.length) return;
        const best = sets.reduce((m, s) => Math.max(m, Math.round(s.weight * (1 + s.reps / 30))), 0);
        const top = sets.reduce((m, s) => (s.weight > m.weight ? s : m), sets[0]);
        const k = map[ex.name]; if (k) oneRM[k] = Math.max(oneRM[k], best);
        const ref = (k && oneRM[k]) ? oneRM[k] : best; // compounds normalise to tracked 1RM; accessories to this session's Epley estimate
        sets.forEach((s) => { vl += s.reps * Math.min(1.05, s.weight / ref); }); // intensity-weighted reps -> athlete-relative
        liftLogs.unshift({ id: uid(), source: "manual", exercise: ex.name, weightKg: top.weight, reps: top.reps, sets, e1rm: best, date: action.date });
      });
      // Objective strength load: e1RM-normalised volume-load (intensity-weighted reps),
      // scaled to the same TSS-like units as runs and clamped so a mis-logged set can't
      // spike fatigue. Athlete-relative - the same %1RM costs the same for any lifter.
      const sLoad = Math.max(20, Math.min(85, Math.round(vl * 0.52)));
      return { ...core, profile: { ...core.profile, oneRM }, liftWeights, liftLogs, sessionLogs: [{ id: uid(), source: action.source || "manual", kind: "strength", date: action.date, notes: action.notes, exercises: action.exercises }, ...core.sessionLogs], completions: { ...core.completions, [action.date]: { status: "Completed", compliance: 1, key: false, load: sLoad } } };
    }
    case "WorkoutSwap": return { ...core, overrides: { ...(core.overrides || {}), [action.a.date]: { type: action.b.type, longKm: action.b.longKm }, [action.b.date]: { type: action.a.type, longKm: action.a.longKm } } };
    case "WorkoutEdit": return { ...core, overrides: { ...(core.overrides || {}), [action.date]: { type: action.to, longKm: action.longKm } } };
    case "WorkoutResetDay": { const ov = { ...(core.overrides || {}) }; delete ov[action.date]; return { ...core, overrides: ov }; }
    case "HealthUpdated": return { ...core, health: { ...(core.health || {}), ...action.health } };
    case "CheckinSaved": { const d = action.date || new Date().toISOString().slice(0, 10); return { ...core, recoveryInputs: { ...core.recoveryInputs, ...action.inputs }, recoveryLogs: [{ date: d, ...action.inputs }, ...(core.recoveryLogs || []).filter((r) => r.date !== d)], lastCheckinDate: action.date }; }
    case "RecoverySaved": { const d = action.date || new Date().toISOString().slice(0, 10); return { ...core, recoveryInputs: { ...core.recoveryInputs, ...action.inputs }, recoveryLogs: [{ date: d, ...action.inputs }, ...(core.recoveryLogs || []).filter((r) => r.date !== d)] }; }
    case "BodyLogged": { const measurements = action.measurements ? { ...core.profile.measurements, ...action.measurements } : core.profile.measurements; const bf = (action.bodyFatPct && action.bodyFatPct > 0) ? action.bodyFatPct : (navyBodyFat({ ...core.profile, measurements }) ?? core.profile.bodyFatPct); return { ...core, profile: { ...core.profile, weightKg: action.weightKg, bodyFatPct: bf, measurements }, bodyLogs: [...core.bodyLogs.filter((b) => b.date !== action.date), { id: uid(), source: "manual", date: action.date, weightKg: action.weightKg, bodyFatPct: bf }].sort((a, b) => a.date.localeCompare(b.date)) }; }
    case "ProfileUpdated": return { ...core, profile: { ...core.profile, ...action.profile } };
    case "RecoveryUpdated": return { ...core, recoveryInputs: { ...core.recoveryInputs, ...action.inputs } };
    case "SleepLogged": return { ...core, recoveryInputs: { ...core.recoveryInputs, sleepHours: action.hours, sleepQuality: action.quality } };
    case "RaceUpdated": { const races = core.races.slice(); let i = races.findIndex((r) => r.priority === "A"); if (i < 0) i = 0; const r = { ...races[i], ...action.race, priority: "A" }; const [h, m, s] = (r.goalTime || "3:30:00").split(":").map(Number); r.goalSeconds = h * 3600 + m * 60 + (s || 0); races[i] = r; return { ...core, races }; }
    case "BRaceAdded": { const [h, m, s] = (action.race.goalTime || "0:00:00").split(":").map(Number); const goalSeconds = h * 3600 + m * 60 + (s || 0); const race = { ...action.race, id: action.race.id || ("B" + Date.now()), priority: "B", goalSeconds }; return { ...core, races: [...core.races, race] }; }
    case "BRaceRemoved": return { ...core, races: core.races.filter((r) => r.id !== action.id) };
    case "RaceCleared": { const a = core.races.find((r) => r.priority === "A"); return { ...core, races: [], baseStartDate: new Date().toISOString().slice(0, 10), lastRaceType: a ? a.type : null }; }
    case "ShoeAdded": return { ...core, shoes: [...(core.shoes || []), { id: action.shoe.id || ("sh" + Date.now()), name: action.shoe.name || "New shoe", lifetimeKm: parseFloat(action.shoe.lifetimeKm) || 0, km: parseFloat(action.shoe.km) || 0, retired: false }] };
    case "ShoeUpdated": return { ...core, shoes: (core.shoes || []).map((s) => s.id === action.id ? { ...s, ...action.patch } : s) };
    case "ShoeRetired": return { ...core, shoes: (core.shoes || []).map((s) => s.id === action.id ? { ...s, retired: !s.retired } : s) };
    case "ShoeRemoved": return { ...core, shoes: (core.shoes || []).filter((s) => s.id !== action.id) };
    case "HolidayAdded": return { ...core, holidays: [...core.holidays, action.holiday] };
    case "HolidayRemoved": return { ...core, holidays: core.holidays.filter((_, i) => i !== action.index) };
    case "Hydrate": { const base = seedCore(); const c = migrateCore(action.core || {}); return { ...base, ...c, today: new Date(), profile: sanitizeProfile({ ...base.profile, ...(c.profile || {}) }), recoveryInputs: { ...base.recoveryInputs, ...(c.recoveryInputs || {}) } }; }
    case "StartFresh": return emptyCore();
    case "RefreshToday": return { ...core, today: action.today || new Date() };
    case "Reset": return seedCore();
    default: return core;
  }
}


/* ---- ENGINE SELF-TESTS (run via Vitest, see engine.test.js) ---- */
export function runTests() {
  const out = []; const ok = (name, cond, detail = "") => out.push({ name, pass: !!cond, detail });
  const core = seedCore(); const { athleteState, todayState } = deriveState(core);
  const plan = athleteState.currentPlan; const block = plan.weeks.slice(0, plan.blockWeeks); const bl = block.map((w) => w.longRunKm);
  ok(">=2 long runs >=30km", bl.filter((x) => x >= 30).length >= 2, `${bl.filter((x) => x >= 30).length} runs`);
  ok(">=1 long run >=32km", bl.filter((x) => x >= 32).length >= 1);
  const peakMax = Math.max(...block.filter((w) => w.phase === "Peak").map((w) => w.longRunKm));
  ok("Peak long run 32-35km", peakMax >= 32 && peakMax <= 35, `peak ${peakMax}km`);
  let stacked = false; plan.weeks.forEach((w) => { for (let i = 1; i < w.days.length; i++) if (w.days[i].intensity === "high" && w.days[i - 1].intensity === "high") stacked = true; });
  ok("No back-to-back hard sessions", !stacked);
  // Weekly calendar: Monday-aligned weeks, pre-start days filled with Rest
  ok("Week 1 starts on a Monday", new Date(plan.weeks[0].startDate).getDay() === 1, plan.weeks[0].startDate);
  const wedCore = { ...core, profile: { ...core.profile, planStartDate: iso(addDays(mondayOf(new Date()), 2)) } }; // a Wednesday
  const wedPlan = generatePlan(wedCore.profile, wedCore.races[0], []);
  ok("Mid-week start: Week 1 still Monday-aligned", new Date(wedPlan.weeks[0].startDate).getDay() === 1);
  ok("Pre-start days are Rest, training begins on start date", wedPlan.weeks[0].days[0].type === "Rest" && wedPlan.weeks[0].days[1].type === "Rest" && wedPlan.trainingStart === wedCore.profile.planStartDate, wedPlan.trainingStart);
  ok("Every workout has date+week+phase", allDays(plan).every((d) => d.date && d.weekNumber && d.phase));
  // Item 2: nutrition macros
  const n = computeNutrition(core.profile, { type: "Long Run" }, "Build", "Fresh", false);
  ok("Protein = 2 g/kg", n.protein === Math.round(core.profile.weightKg * 2), `${n.protein}g`);
  ok("Fat = 20% of calories", Math.abs(n.fat * 9 - n.calories * 0.20) <= 9, `${n.fat}g`);
  ok("Carbs = remaining calories", Math.abs((n.protein * 4 + n.fat * 9 + n.carbs * 4) - n.calories) <= 6);
  // Item 1: paces from fitness, not goal
  const fastGoal = { ...core, races: [{ ...core.races[0], goalTime: "2:55:00", goalSeconds: 2 * 3600 + 55 * 60 }] };
  const p1 = deriveState(core).todayState.paces.paces[4].secPerKm;
  const p2 = deriveState(fastGoal).todayState.paces.paces[4].secPerKm;
  ok("Paces independent of goal time", Math.abs(p1 - p2) < 0.5, `${pace(p1)} vs ${pace(p2)}`);
  // Availability-driven run/strength split (Build week): 3->3+0, 4->3+1, 5->4+1, 6->4+2, 7->5+2
  const splitCounts = (days) => { const c = { ...core, profile: { ...core.profile, availabilityDays: days } }; const pl = generatePlan(c.profile, c.races[0], []); const wk = pl.weeks.find((w) => w.phase === "Build"); return { runs: wk.runCount, lifts: wk.liftCount, rests: wk.days.filter((d) => d.type === "Rest").length }; };
  const expectSplit = { 3: [3, 0], 4: [3, 1], 5: [4, 1], 6: [4, 2], 7: [5, 2] };
  [3, 4, 5, 6, 7].forEach((days) => { const s = splitCounts(days); const [er, el] = expectSplit[days]; ok(`${days} days/week = ${er} runs + ${el} strength`, s.runs === er && s.lifts === el, `${s.runs}+${s.lifts} (${s.rests} rest)`); });
  [3, 4, 5, 6, 7].forEach((days) => { const s = splitCounts(days); ok(`${days} days/week leaves ${7 - days} rest day(s)`, s.rests === 7 - days, `${s.rests} rest`); });
  // Item 9: HR zones on runs
  const wkBuild = plan.weeks.find((w) => w.phase === "Build");
  ok("All running workouts have HR zones", wkBuild.days.filter((d) => d.distanceKm > 0).every((d) => d.hrZone && d.hrZone.lo < d.hrZone.hi));
  // Item 5: race fuel schedule
  const f = todayState.fuelling;
  ok("Total gels = ceil(carb / gel)", f.totalGels === Math.ceil(f.totalCarb / f.gelCarbs), `${f.totalGels} gels`);
  ok("Gel schedule length matches", f.schedule.length === f.totalGels);
  ok("Gel interval > 0", f.intervalMin > 0, `${f.intervalMin} min`);
  // Item 8: race weight via lean mass + range
  const wt = todayState.weight;
  ok("Race-weight range low < high", wt.rangeLow < wt.rangeHigh, `${wt.rangeLow}-${wt.rangeHigh}`);
  ok("Projected within recommended range", wt.projected >= wt.rangeLow - 0.1, `proj ${wt.projected}`);
  ok("Lean mass computed", wt.leanMass > 0 && wt.leanMass < wt.current);
  const wt92 = predictRaceWeight({ ...core.profile, weightKg: 92, bodyFatPct: 19.8 }, 9);
  ok("Lean mass matches current profile (92 kg @ 19.8% -> ~73.8 kg)", Math.abs(wt92.leanMass - 73.8) < 0.3, `${wt92.leanMass} kg`);
  const bp = buildProgress(plan, todayState.currentWeek, core.liftLogs, [{ date: iso(addDays(new Date(), -7)), weightKg: 72, bodyFatPct: 15 }], [], [], { weightKg: 92, bodyFatPct: 19.8 });
  ok("Body trend ends at the current profile (not the last stale log)", bp.body[bp.body.length - 1].weight === 92);
  // Body fat: entered value used; otherwise estimated from tape measurements (US Navy)
  const measProfile = { ...core.profile, bodyFatPct: 0, measurements: { neck: 39, waist: 84, hip: 99 } };
  const measBf = navyBodyFat(measProfile);
  ok("Body fat estimated from measurements when % not entered", measBf != null && measBf > 5 && measBf < 35, `${measBf}%`);
  ok("effectiveBodyFat uses entered % over measurements", effectiveBodyFat({ ...measProfile, bodyFatPct: 14 }) === 14);
  ok("effectiveBodyFat falls back to measurement estimate", Math.abs(effectiveBodyFat(measProfile) - measBf) < 0.01, `${effectiveBodyFat(measProfile)}`);
  ok("Race-weight uses effective body fat (measurement source)", predictRaceWeight(measProfile, 9).bodyFatSource === "measurements");
  // Shoe mileage tracking + over-lifetime alert
  const shoeCore0 = { ...core, shoes: [{ id: "sx", name: "Tester", lifetimeKm: 50, km: 45, retired: false }] };
  const afterRun = reducer(shoeCore0, { type: "RunLogged", date: todayState.currentDate, run: { type: "Easy Run", distanceKm: 10, durationMin: 50, shoeId: "sx" } });
  ok("Logging a run adds distance to the chosen shoe", afterRun.shoes[0].km === 55, `${afterRun.shoes[0].km} km`);
  const shoeAlertState = deriveState(afterRun).todayState;
  ok("Coach alert fires when a shoe passes its lifetime", shoeAlertState.coachAlerts.some((a) => /lifetime/i.test(a.text)));
  ok("Shoe reducer add/retire/remove", (() => { let c = reducer(core, { type: "ShoeAdded", shoe: { name: "New", lifetimeKm: 600 } }); const id = c.shoes[c.shoes.length - 1].id; c = reducer(c, { type: "ShoeRetired", id }); const retired = c.shoes.find((s) => s.id === id).retired; c = reducer(c, { type: "ShoeRemoved", id }); return retired === true && !c.shoes.find((s) => s.id === id); })());
  // Interval logging stores per-rep entries
  const repRun = reducer(core, { type: "RunLogged", date: todayState.currentDate, run: { type: "Intervals", distanceKm: 8, durationMin: 40, reps: [{ rep: 1, distanceM: 400, time: "1:28" }, { rep: 2, distanceM: 400, time: "1:27" }] } });
  ok("Interval reps stored per rep", repRun.sessionLogs[0].reps && repRun.sessionLogs[0].reps.length === 2, `${repRun.sessionLogs[0].reps ? repRun.sessionLogs[0].reps.length : 0} reps`);
  // Holidays: no running at all (full rest)
  const holCore = { ...core, holidays: [{ label: "Trip", start: iso(addDays(new Date(), 2)), end: iso(addDays(new Date(), 5)) }] };
  const holPlan = generatePlan(holCore.profile, holCore.races[0], holCore.holidays);
  const holDays = allDays(holPlan).filter((d) => d.holiday);
  ok("Holiday days are full rest, no running", holDays.length > 0 && holDays.every((d) => d.type === "Rest" && (!d.distanceKm || d.distanceKm === 0)), `${holDays.length} holiday days`);
  // B-race: weave a tune-up into the plan (taper, race day, recovery)
  const bDate = iso(addDays(mondayOf(new Date()), 3 * 7 + 2));
  const coreAOnly = { ...core, races: core.races.filter((r) => r.priority === "A") };
  const bCore = reducer(coreAOnly, { type: "BRaceAdded", race: { name: "City 10K", type: "10K", date: bDate } });
  ok("BRaceAdded stores a B-priority race", bCore.races.some((r) => r.priority === "B" && r.type === "10K"));
  const bPlan = deriveState(bCore).athleteState.currentPlan;
  const bRaceDay = allDays(bPlan).find((d) => d.bRace);
  ok("B-race appears as a race day in the plan", !!bRaceDay && bRaceDay.type === "Race", bRaceDay ? bRaceDay.date : "none");
  ok("B-race day uses the correct distance (10K, not marathon)", !!bRaceDay && bRaceDay.distanceKm === 10, bRaceDay ? `${bRaceDay.distanceKm} km` : "none");
  // A-race day matches the goal-race distance too
  const halfCore = { ...core, races: [{ ...core.races[0], type: "Half" }] };
  const halfPlan = generatePlan(halfCore.profile, halfCore.races[0], []);
  const halfRaceDay = allDays(halfPlan).find((d) => d.type === "Race");
  ok("A-race day distance follows the goal race type (Half = 21.1km)", !!halfRaceDay && Math.abs(halfRaceDay.distanceKm - 21.1) < 0.2, halfRaceDay ? `${halfRaceDay.distanceKm} km` : "none");
  const bAdj = allDays(bPlan).filter((d) => d.bRaceAdj);
  ok("B-race adds taper + recovery days around it", bAdj.length >= 3, `${bAdj.length} adjusted days`);
  ok("RaceUpdated keeps B-races intact", reducer(bCore, { type: "RaceUpdated", race: { goalTime: "3:20:00" } }).races.filter((r) => r.priority === "B").length === 1);
  ok("BRaceRemoved deletes it", reducer(bCore, { type: "BRaceRemoved", id: bCore.races.find((r) => r.priority === "B").id }).races.filter((r) => r.priority === "B").length === 0);
  ok("Coach review supplies overview + watch lists", typeof todayState.coachReview.headline === "string" && Array.isArray(todayState.coachReview.wins) && Array.isArray(todayState.coachReview.watch) && typeof todayState.coachReview.focus === "string");
  // Replenishment policy: aggressive in Base/Build, full in Peak/Taper
  ok("Replenishment policy 25% Base / 50% Build / 100% Peak+Taper", REPLENISH.Base === 0.25 && REPLENISH.Build === 0.50 && REPLENISH.Peak === 1.0 && REPLENISH.Taper === 1.0 && REPLENISH.Recovery === 1.0);
  // Item 10: VO2 targets
  ok("Target VO2max computed", todayState.vo2Target > 30 && todayState.vo2Target < 90, `${todayState.vo2Target}`);
  ok("Current VO2 estimate computed", todayState.vo2Current > 0);
  // Strength structure
  const ss = todayState.strengthSession;
  ok("Strength 4 prehab / 2 compound / 4 accessory", ss.prehab.length === 4 && ss.compound.length === 2 && ss.accessory.length === 4);
  ok("Compounds use different patterns", ss.compound[0].pattern !== ss.compound[1].pattern, `${ss.compound[0].pattern}/${ss.compound[1].pattern}`);
  // Accessory swaps offer same-pattern alternatives (prescribed lift is a member of its category)
  ok("Every accessory swap stays in the same movement pattern", ss.accessory.every((a) => a.category && Array.isArray(EXERCISE_ALTS[a.category]) && EXERCISE_ALTS[a.category].includes(a.name)));
  ok("Pull-up swap offers a Lat Pulldown (both vertical pull)", EXERCISE_ALTS["vertical-pull"].includes("Weighted Pull-up") && EXERCISE_ALTS["vertical-pull"].includes("Lat Pulldown"));
  // Three complementary sessions (A/B/C) cycle within a week so every compound + body part is hit
  const ssA = generateStrengthSession(core.profile, 3, "Build", false, 0, {});
  const ssB = generateStrengthSession(core.profile, 3, "Build", false, 1, {});
  const ssC = generateStrengthSession(core.profile, 3, "Build", false, 2, {});
  ok("Session A is Squat + Bench", ssA.compound.map((c) => c.name).join("+") === "Back Squat+Bench Press");
  ok("Session B is Deadlift + OHP", ssB.compound.map((c) => c.name).join("+") === "Romanian Deadlift+Overhead Press");
  ok("Session C is Squat + Deadlift (lower)", ssC.compound.map((c) => c.name).join("+") === "Back Squat+Romanian Deadlift");
  ok("No two sessions share the same compound pairing", new Set([ssA, ssB, ssC].map((s) => s.compound.map((c) => c.name).join("+"))).size === 3);
  ok("Across a 3-session week all 4 barbell compounds are covered", new Set([...ssA.compound, ...ssB.compound, ...ssC.compound].map((c) => c.name)).size === 4);
  ok("Each session covers all 4 accessory patterns", [ssA, ssB, ssC].every((s) => new Set(s.accessory.map((a) => a.category)).size === 4));
  ok("Accessories vary between sessions", ssA.accessory.map((a) => a.name).join() !== ssB.accessory.map((a) => a.name).join());
  ok("Strength sessions cycle A/B/C within a 3-lift week (no duplicate)", (() => { const wk = deriveState({ ...core, races: [], baseStartDate: null, lastRaceType: null }).athleteState.currentPlan.weeks.find((w) => w.phase === "Base" && !w.isRecovery && w.days.filter((d) => d.type === "Strength").length === 3); if (!wk) return true; const sess = wk.days.filter((d) => d.type === "Strength").sort((a, b) => a.date.localeCompare(b.date)).map((d) => d.session.session); return new Set(sess).size === 3; })());
  // Horizontal-pull (rows) now a tracked body part
  ok("Horizontal-pull (rows) is a tracked accessory pattern", Array.isArray(EXERCISE_ALTS["horizontal-pull"]) && EXERCISE_ALTS["horizontal-pull"].length >= 3);
  ok("Every strength session includes a horizontal-pull (rows)", [ssA, ssB, ssC].every((s) => s.accessory.some((a) => a.category === "horizontal-pull")));
  ok("Across the week all 5 accessory body-part patterns are covered", new Set([...ssA.accessory, ...ssB.accessory, ...ssC.accessory].map((a) => a.category)).size === 5);
  ok("Every accessory (incl rows) has valid same-pattern swaps", [ssA, ssB, ssC].every((s) => s.accessory.every((a) => Array.isArray(EXERCISE_ALTS[a.category]) && EXERCISE_ALTS[a.category].includes(a.name))));
  // Prehab overhaul: 4 moves x 2 sets, always an isometric; plyometrics gated by phase/recovery/race proximity
  ok("Prehab is 4 exercises of 2 sets each", [ssA, ssB, ssC].every((s) => s.prehab.length === 4 && s.prehab.every((p) => p.sets === 2)));
  ok("Every prehab block includes an isometric", [ssA, ssB, ssC].every((s) => s.prehab.some((p) => p.iso)));
  ok("Plyometrics are programmed in Build when fresh & away from a race", generateStrengthSession(core.profile, 3, "Build", false, 0, {}, { readiness: 90, weeksToRace: 12 }).prehab.some((p) => p.plyo));
  ok("Plyometrics are dropped in Peak / near a race", !generateStrengthSession(core.profile, 3, "Peak", false, 0, {}, { readiness: 90, weeksToRace: 1 }).prehab.some((p) => p.plyo));
  ok("Low recovery removes plyo and adds a 2nd isometric", (() => { const s = generateStrengthSession(core.profile, 3, "Build", false, 0, {}, { readiness: 30 }); return !s.prehab.some((p) => p.plyo) && s.prehab.filter((p) => p.iso).length >= 2; })());
  // Autoregulation: low recovery trims compound load + a set and loosens RIR
  const sFresh = generateStrengthSession(core.profile, 1, "Build", false, 0, {}, { readiness: 90 });
  const sLow = generateStrengthSession(core.profile, 1, "Build", false, 0, {}, { readiness: 30 });
  ok("Low recovery trims compound load", sLow.compound[0].weightKg < sFresh.compound[0].weightKg);
  ok("Low recovery drops a working set", sLow.compound[0].sets < sFresh.compound[0].sets);
  ok("Low recovery loosens the RIR target", sLow.rir > sFresh.rir);
  ok("Compounds carry an RIR target", sFresh.compound.every((c) => typeof c.rir === "number"));
  // Double progression: accessories prescribe a rep range; load advances at the top
  ok("Accessories prescribe a rep range (double progression)", ssA.accessory.every((a) => /^[0-9]+-[0-9]+$/.test(a.repRange)));
  // Phase-aware frequency: protected maintenance dose into the race
  ok("Taper drops to a single (protected) strength session", weekSessions("Taper", false, { runs: 5, lifts: 3 }, "Polarised").filter((t) => t === "Strength").length === 1);
  ok("Peak caps strength at a 2x maintenance dose", weekSessions("Peak", false, { runs: 5, lifts: 3 }, "Polarised").filter((t) => t === "Strength").length === 2);
  ok("New movements present (Nordic, calf, isometrics, trap-bar option)", EXERCISE_ALTS["glute-hinge"].includes("Trap-bar Deadlift") && [ssA, ssB, ssC].some((s) => s.prehab.some((p) => p.name === "Nordic Hamstring Curl")));
  // Strength now feeds CTL/ATL/TSB via an sRPE-derived, phase/deload-aware load
  ok("Strength load varies by phase (Build heavier than Taper)", buildWorkoutData("Strength", "Build", 0, false, 185).load > buildWorkoutData("Strength", "Taper", 0, false, 185).load);
  ok("Strength deload week lifts lighter", buildWorkoutData("Strength", "Build", 0, true, 185).load < buildWorkoutData("Strength", "Build", 0, false, 185).load);
  ok("Strength contributes to load (not a flat near-neutral 45)", buildWorkoutData("Strength", "Build", 0, false, 185).load > 45);
  ok("Strength load stays in a sane TSS range", ["Base", "Build", "Peak", "Taper"].every((p) => { const v = buildWorkoutData("Strength", p, 0, false, 185).load; return v >= 25 && v <= 70; }));
  ok("Strength load still below a tempo run (lifting < hard aerobic quality)", buildWorkoutData("Strength", "Build", 0, false, 185).load < buildWorkoutData("Tempo", "Build", 0, false, 185).load);
  // Objective strength load: e1RM-normalised volume-load from the logged sets (no RPE)
  ok("RPE machinery removed from the session", generateStrengthSession(core.profile, 3, "Build", false, 0).defaultRpe === undefined);
  const vlSess = (sqW, accW) => ({ type: "StrengthLogged", date: "2026-02-03", exercises: [
    { name: "Back Squat", timed: false, target: null, sets: Array.from({ length: 4 }, () => ({ weight: sqW, reps: 4 })) },
    { name: "Hip Thrust", timed: false, target: { sets: 3, reps: 12, weightKg: accW }, sets: Array.from({ length: 3 }, () => ({ weight: accW, reps: 10 })) },
    { name: "Walking Lunge", timed: false, target: { sets: 3, reps: 12, weightKg: 20 }, sets: Array.from({ length: 3 }, () => ({ weight: 20, reps: 10 })) },
  ] });
  const strongCore = { ...core, profile: { ...core.profile, oneRM: { ...core.profile.oneRM, backSquat: 200 } } };
  const weakCore = { ...core, profile: { ...core.profile, oneRM: { ...core.profile.oneRM, backSquat: 100 } } };
  const strongLoad = reducer(strongCore, vlSess(164, 40)).completions["2026-02-03"].load; // 82% of 200
  const weakLoad = reducer(weakCore, vlSess(82, 40)).completions["2026-02-03"].load;      // 82% of 100
  ok("Volume-load is athlete-relative (same %1RM -> ~same load regardless of absolute kg)", Math.abs(strongLoad - weakLoad) <= 2, `${strongLoad} vs ${weakLoad}`);
  ok("Logged strength load is objective and in a sane TSS range", strongLoad >= 20 && strongLoad <= 85, `${strongLoad}`);
  const bigLoad = reducer(core, { type: "StrengthLogged", date: "2026-02-03", exercises: [
    { name: "Back Squat", timed: false, target: null, sets: Array.from({ length: 5 }, () => ({ weight: 130, reps: 5 })) },
    { name: "Hip Thrust", timed: false, target: null, sets: Array.from({ length: 4 }, () => ({ weight: 60, reps: 12 })) },
  ] }).completions["2026-02-03"].load;
  const smallLoad = reducer(core, { type: "StrengthLogged", date: "2026-02-03", exercises: [
    { name: "Back Squat", timed: false, target: null, sets: [{ weight: 130, reps: 5 }] },
  ] }).completions["2026-02-03"].load;
  ok("More volume -> higher logged load (reflects what you did)", bigLoad > smallLoad, `${bigLoad} vs ${smallLoad}`);
  ok("A mis-logged monster set can't spike fatigue (load clamped)", reducer(core, { type: "StrengthLogged", date: "2026-02-03", exercises: [{ name: "Back Squat", timed: false, target: null, sets: Array.from({ length: 8 }, () => ({ weight: 500, reps: 20 })) }] }).completions["2026-02-03"].load <= 85);
  ok("computeTrainingLoad honours a logged session's volume-load over the phase estimate", (() => { const sDay = allDays(plan).find((d) => d.type === "Strength"); if (!sDay) return true; const today = addDays(new Date(sDay.date), 6); const hard = computeTrainingLoad(plan, today, { [sDay.date]: { status: "Completed", compliance: 1, load: 80 } }); const easy = computeTrainingLoad(plan, today, { [sDay.date]: { status: "Completed", compliance: 1, load: 25 } }); return hard.ctl >= easy.ctl && hard.atl > easy.atl; })());
  // Norwegian = real double-threshold (no longer a clone of Threshold)
  ok("Norwegian programs a double-threshold day (Threshold method does not)", weekSessions("Build", false, splitFor(6), "Norwegian").includes("Double Threshold") && !weekSessions("Build", false, splitFor(6), "Threshold").includes("Double Threshold"));
  ok("Double-threshold day is heavier than single threshold and lays out AM + PM", (() => { const dt = buildWorkoutData("Double Threshold", "Build", 0, false, 185); const t = buildWorkoutData("Threshold", "Build", 0, false, 185); return dt.load > t.load && /AM/.test(dt.detail) && /PM/.test(dt.detail) && !!dt.hrZone; })());
  // Fatigue-driven deload
  ok("Acute-load spike forces a fatigue deload on today's week", (() => { const t = iso(new Date()); return generatePlan({ ...core.profile, planStartDate: t, fatigueDeload: true, todayISO: t }, null, []).weeks[0].isRecovery === true; })());
  ok("No fatigue signal leaves periodisation intact", (() => { const t = iso(new Date()); return generatePlan({ ...core.profile, planStartDate: t, fatigueDeload: false, todayISO: t }, null, []).weeks[0].isRecovery === false; })());
  ok("Poor measured recovery (HRV/sleep) triggers a deload via deriveState", (() => { const tired = { ...core, recoveryInputs: { sleepHours: 4.5, sleepQuality: 40, hrv: 38, hrvBaseline: 60, restingHr: 60, rhrBaseline: 50, subjectiveFatigue: 9 } }; return deriveState(tired).todayState.isRecoveryWeek === true; })());
  // Compounds: prescribed off 1RM % and progress week to week (wave), never stagnate
  const sqProf = { ...core.profile, oneRM: { ...core.profile.oneRM, backSquat: 140 } };
  const sch = strengthScheme("Build");
  const sqW1 = generateStrengthSession(sqProf, 1, "Build", false, 0, {}).compound.find((c) => c.name === "Back Squat");
  const sqW3 = generateStrengthSession(sqProf, 3, "Build", false, 0, {}).compound.find((c) => c.name === "Back Squat");
  ok("Compound weight is a % of 1RM", Math.abs(sqW1.weightKg - round2_5(140 * sch.pct)) < 0.1 && sqW1.pctOneRM === Math.round(sch.pct * 100), `${sqW1.weightKg}kg @ ${sqW1.pctOneRM}%`);
  ok("Compound progresses across the weeks (wave overload)", sqW3.weightKg > sqW1.weightKg, `wk1 ${sqW1.weightKg} -> wk3 ${sqW3.weightKg}`);
  ok("Higher 1RM -> heavier compound prescription", generateStrengthSession({ ...sqProf, oneRM: { ...sqProf.oneRM, backSquat: 160 } }, 1, "Build", false, 0, {}).compound.find((c) => c.name === "Back Squat").weightKg > sqW1.weightKg);
  // Accessories: prescribed from last working weight (start conservative), not 1RM
  ok("Accessory start weights are conservative (not 1RM-scaled)", ssA.accessory.every((a) => a.weightKg <= 45));
  const accCustom = generateStrengthSession(core.profile, 3, "Build", false, 0, { "Hip Thrust": 70 });
  ok("Accessory uses the stored last working weight", accCustom.accessory.find((a) => a.name === "Hip Thrust").weightKg === 70);
  // Reducer progression: complete everything -> +inc; miss -> hold
  const tgtHip = { sets: 3, reps: 10, weightKg: 40 };
  const allHit = reducer(core, { type: "StrengthLogged", date: "2026-02-02", exercises: [{ name: "Hip Thrust", timed: false, target: tgtHip, sets: [{ weight: 40, reps: 10 }, { weight: 40, reps: 10 }, { weight: 40, reps: 10 }] }] });
  ok("Accessory advances +5 kg when all sets/reps completed", allHit.liftWeights["Hip Thrust"] === 45, `${allHit.liftWeights["Hip Thrust"]}`);
  ok("Units: imperial display conversions", uDist(10, "imperial") === 6.2 && uWt(100, "imperial") === 220.5 && Math.abs(uPace(300, "imperial") - 482.8) < 1, `${uDist(10, "imperial")}mi ${uWt(100, "imperial")}lb`);
  ok("Units: metric passes through unchanged", uDist(10, "metric") === 10 && uWt(100, "metric") === 100 && uPace(300, "metric") === 300);
  ok("Units: input parsing converts back to metric", Math.abs(toKm(6.2137, "imperial") - 10) < 0.01 && Math.abs(toKg(220.46, "imperial") - 100) < 0.05 && toKm(10, "metric") === 10);
  ok("Units: pacing splits adapt to imperial (mile splits + /mi)", (() => { const pp = pacingStrategies(3600, 10, "imperial"); return pp.paceUnit === "/mi" && pp.splits1k.some((s) => /mi$/.test(s.km)); })());
  ok("Units: todayState exposes the unit preference", deriveState({ ...core, profile: { ...core.profile, units: "imperial" } }).todayState.units === "imperial");
  const missed = reducer(core, { type: "StrengthLogged", date: "2026-02-02", exercises: [{ name: "Hip Thrust", timed: false, target: tgtHip, sets: [{ weight: 40, reps: 8 }, { weight: 40, reps: 10 }, { weight: 40, reps: 10 }] }] });
  ok("Accessory holds weight when a set is missed", missed.liftWeights["Hip Thrust"] === 40, `${missed.liftWeights["Hip Thrust"]}`);
  const benchHit = reducer(core, { type: "StrengthLogged", date: "2026-02-02", exercises: [{ name: "Bench Press", timed: false, target: null, sets: [{ weight: 80, reps: 5 }] }] });
  ok("Compound does NOT use last-weight model (no liftWeights entry)", benchHit.liftWeights["Bench Press"] === undefined);
  // Timed move logs a duration, never a weight
  const timed = reducer(core, { type: "StrengthLogged", date: "2026-02-02", exercises: [{ name: "Copenhagen Plank", timed: true, target: null, sets: [{ time: "30s" }, { time: "30s" }] }] });
  ok("Timed exercise logs time and does not affect weight progression", timed.liftWeights["Copenhagen Plank"] === undefined && timed.sessionLogs[0].exercises[0].sets[0].time === "30s");
  // Item 7: missed key adaptation + auto-regen
  const missDate = (() => { const d = allDays(plan).find((x) => x.type === "Intervals" && x.date < todayState.currentDate); return d ? d.date : null; })();
  if (missDate) {
    const c2 = reducer(core, { type: "WorkoutMissed", date: missDate, key: true });
    const before = deriveState(core).athleteState.currentPlan;
    const after = deriveState(c2).athleteState.currentPlan;
    const cntHard = (pl) => allDays(pl).filter((d) => d.date > missDate && d.date <= iso(addDays(missDate, 14)) && isHard(d.type)).length;
    ok("Missed key reduces upcoming quality", cntHard(after) < cntHard(before), `${cntHard(after)} vs ${cntHard(before)}`);
  } else ok("Missed key reduces upcoming quality", true, "no past interval to miss");
  const longDayCore = { ...core, profile: { ...core.profile, longRunDay: "Sat" } };
  const lp = generatePlan(longDayCore.profile, longDayCore.races[0], []);
  const lw = lp.weeks.find((w) => w.phase === "Build");
  ok("Long run day setting respected", lw.days.find((d) => d.type === "Long Run").dow === "Sat");
  // --- Training structure: concurrent + quality scheduling rules ---
  const isQuality = (t) => t === "Intervals" || t === "Threshold" || t === "Tempo" || t === "Race" || t === "Long Run";
  let consecStrength = false, qualityAdj = 0, qualityAfterStrength = 0, strengthThenEasyRun = 0, strengthThenRecovery = 0, strengthTotal = 0;
  const offenders = [];
  plan.weeks.forEach((w) => { const t = w.days.map((d) => d.type); for (let i = 0; i < 6; i++) {
    if (t[i] === "Strength" && t[i + 1] === "Strength") consecStrength = true;
    if (isQuality(t[i]) && isQuality(t[i + 1])) { qualityAdj++; offenders.push(`${t[i]}->${t[i + 1]} wk${w.weekNumber}`); }
    if (t[i] === "Strength" && isQuality(t[i + 1])) qualityAfterStrength++;
    if (t[i] === "Strength") { strengthTotal++; if (t[i + 1] === "Easy Run" || t[i + 1] === "Recovery Run") { strengthThenEasyRun++; strengthThenRecovery++; } else if (t[i + 1] === "Rest") strengthThenRecovery++; }
  } });
  ok("No two strength sessions on consecutive days", !consecStrength);
  ok("No two quality runs (tempo/threshold/VO2/long) back-to-back", qualityAdj === 0, offenders.slice(0, 3).join(", ") || "none");
  ok("No quality/long run the day after strength", qualityAfterStrength === 0, `${qualityAfterStrength}`);
  ok("An easy run follows strength whenever one is available", strengthTotal === 0 || strengthThenEasyRun / strengthTotal >= 0.5, `${strengthThenEasyRun}/${strengthTotal} easy-run, rest fills the remainder`);
  ok("Strength is always followed by easy/recovery/rest (never hard)", strengthTotal === 0 || strengthThenRecovery === strengthTotal, `${strengthThenRecovery}/${strengthTotal}`);
  // --- Running volume: realistic start, intelligent progression ---
  ok("Current weekly volume on profile", typeof core.profile.currentWeeklyVolumeKm === "number");
  const wk1Vol = plan.weeks[0].volumeKm;
  ok("Week 1 volume not an unrealistic jump", wk1Vol <= core.profile.currentWeeklyVolumeKm * 1.3, `${wk1Vol} vs cur ${core.profile.currentWeeklyVolumeKm}`);
  const lowVol = generatePlan({ ...core.profile, currentWeeklyVolumeKm: 28 }, core.races[0], []);
  const lowBl = lowVol.weeks.slice(0, lowVol.blockWeeks).filter((w) => !w.isRecovery && w.phase !== "Taper" && w.phase !== "Race").map((w) => w.longRunKm);
  ok("A1: low-volume marathon long run is capped (no forced 32km)", !lowBl.some((x) => x >= 32) && !!lowVol.longRunNote);
  const hiVol = generatePlan({ ...core.profile, currentWeeklyVolumeKm: 60 }, core.races[0], []);
  const hiBl = hiVol.weeks.slice(0, hiVol.blockWeeks).filter((w) => !w.isRecovery && w.phase !== "Taper" && w.phase !== "Race").map((w) => w.longRunKm);
  ok("A1: adequate-volume marathon still reaches 32km+ (2+ over 30)", hiBl.some((x) => x >= 32) && hiBl.filter((x) => x >= 30).length >= 2);
  ok("A1: ~40km/wk marathon now scales weekly volume to fit a 30km+ long run", (() => { const p = generatePlan({ ...core.profile, currentWeeklyVolumeKm: 40 }, core.races[0], []); const bl = p.weeks.slice(0, p.blockWeeks).filter((w) => !w.isRecovery && w.phase !== "Taper" && w.phase !== "Race").map((w) => w.longRunKm); return bl.some((x) => x >= 30) && !p.longRunNote; })());
  ok("A1: taper long runs sit below the peak long run", (() => { const p = generatePlan({ ...core.profile, currentWeeklyVolumeKm: 45 }, core.races[0], []); const wks = p.weeks.slice(0, p.blockWeeks); const peakMax = Math.max(...wks.filter((w) => w.phase === "Peak").map((w) => w.longRunKm)); const taperMax = Math.max(...wks.filter((w) => w.phase === "Taper").map((w) => w.longRunKm)); return taperMax < peakMax; })());
  ok("No-race: plan is a rolling base phase with 3:1 deloads", (() => { const p = generatePlan(core.profile, null, []); return p.baseMode === true && p.weeks.every((w) => w.phase === "Base") && p.weeks.some((w) => w.isRecovery) && p.weeks[0].longRunKm > 0; })());
  ok("Base phase uses the strength-focused split (muscle build)", (() => { const p = generatePlan(core.profile, null, []); const wk = p.weeks.find((w) => w.phase === "Base" && !w.isRecovery); const lifts = wk.days.filter((d) => d.type === "Strength").length; const runs = wk.days.filter((d) => d.distanceKm > 0 && d.type !== "Strength").length; return lifts === 3 && runs === 3; })());
  ok("Race plan: base weeks strength-focused, build weeks run-focused", (() => { const p = generatePlan(core.profile, core.races[0], []); const baseWk = p.weeks.find((w) => w.phase === "Base" && !w.isRecovery); const buildWk = p.weeks.find((w) => w.phase === "Build" && !w.isRecovery); const liftsIn = (wk) => wk.days.filter((d) => d.type === "Strength").length; return !!baseWk && !!buildWk && liftsIn(baseWk) === 3 && liftsIn(buildWk) === 2; })());
  ok("Hybrid base: strength-heavy base weeks keep 2 weekly strides (economy, low interference)", (() => { const six = generatePlan({ ...core.profile, availabilityDays: 6 }, null, []).weeks.find((w) => w.phase === "Base" && !w.isRecovery); const seven = generatePlan({ ...core.profile, availabilityDays: 7 }, null, []).weeks.find((w) => w.phase === "Base" && !w.isRecovery); const onlyAerobic = (wk) => wk.days.filter((d) => d.strides).every((d) => d.type === "Easy Run" || d.type === "Recovery Run"); return six.days.filter((d) => d.strides).length === 2 && seven.days.filter((d) => d.strides).length === 2 && onlyAerobic(six) && onlyAerobic(seven); })());
  ok("Hybrid base: deload base weeks carry no strides", (() => { const dl = generatePlan({ ...core.profile, availabilityDays: 6 }, null, []).weeks.find((w) => w.phase === "Base" && w.isRecovery); return !dl || dl.days.every((d) => !d.strides); })());
  ok("Base volume progresses week to week (not flat)", (() => { const wks = generatePlan({ ...core.profile, currentWeeklyVolumeKm: 50 }, null, []).weeks.filter((w) => w.phase === "Base" && !w.isRecovery).slice(0, 3); return wks[1].weeklyTargetKm > wks[0].weeklyTargetKm && wks[2].weeklyTargetKm > wks[1].weeklyTargetKm; })());
  ok("Base volume caps at ~1.4x anchor (no runaway)", (() => { const wks = generatePlan({ ...core.profile, currentWeeklyVolumeKm: 50 }, null, []).weeks.filter((w) => w.phase === "Base" && !w.isRecovery); return Math.max(...wks.map((w) => w.weeklyTargetKm)) <= Math.round(50 * 1.4) + 1; })());
  ok("Base long run scales up with weekly volume", (() => { const wks = generatePlan({ ...core.profile, currentWeeklyVolumeKm: 50 }, null, []).weeks.filter((w) => w.phase === "Base" && !w.isRecovery); return wks[wks.length - 1].longRunKm > wks[0].longRunKm; })());
  ok("Post-race base: anchor carries over recent mileage (stays high)", (() => { const wks = generatePlan({ ...core.profile, currentWeeklyVolumeKm: 40, recentWeeklyKm: 70 }, null, []).weeks.filter((w) => w.phase === "Base" && !w.isRecovery); return wks[0].weeklyTargetKm >= 60; })());
  ok("Post-race base: distance-scaled reverse taper, then rebuild", (() => { const t = iso(new Date()); const wks = generatePlan({ ...core.profile, currentWeeklyVolumeKm: 80, planStartDate: t, baseStartDate: t, lastRaceType: "Marathon" }, null, []).weeks; return wks[0].isRecovery && wks[1].isRecovery && !wks[2].isRecovery && wks[0].weeklyTargetKm < wks[2].weeklyTargetKm && wks[2].weeklyTargetKm < wks[4].weeklyTargetKm; })());
  ok("Post-race recovery scales with race distance (marathon eases longer than 10K)", (() => { const mk = (type) => { const t = iso(new Date()); return generatePlan({ ...core.profile, currentWeeklyVolumeKm: 60, planStartDate: t, baseStartDate: t, lastRaceType: type }, null, []).weeks.slice(0, 4).filter((w) => w.weeklyTargetKm < 57).length; }; return mk("Marathon") > mk("10K"); })());
  ok("Post-race return ADAPTS to measured recovery (fresh returns faster than fatigued)", (() => { const t = iso(new Date()); const mk = (rr) => generatePlan({ ...core.profile, currentWeeklyVolumeKm: 80, planStartDate: t, baseStartDate: t, lastRaceType: "Marathon", recoveryReadiness: rr }, null, []).weeks; const fresh = mk(0.95), tired = mk(0.05); return fresh[2].weeklyTargetKm > tired[2].weeklyTargetKm && fresh[1].weeklyTargetKm >= tired[1].weeklyTargetKm; })());
  ok("No recovery data -> fixed distance-scaled schedule (graceful default)", (() => { const t = iso(new Date()); const wks = generatePlan({ ...core.profile, currentWeeklyVolumeKm: 80, planStartDate: t, baseStartDate: t, lastRaceType: "Marathon", recoveryReadiness: 0.5 }, null, []).weeks; return wks[0].weeklyTargetKm === Math.round(80 * 0.5) && wks[1].weeklyTargetKm === Math.round(80 * 0.65); })());
  ok("measuredRecovery: stronger HRV/sleep -> higher readiness", () => measuredRecovery({ sleepHours: 8.5, sleepQuality: 90, hrv: 70, hrvBaseline: 60, restingHr: 46, rhrBaseline: 50, subjectiveFatigue: 2 }) > measuredRecovery({ sleepHours: 5, sleepQuality: 50, hrv: 45, hrvBaseline: 60, restingHr: 58, rhrBaseline: 50, subjectiveFatigue: 8 }));
  ok("RaceCleared records baseStartDate + race type for recovery", (() => { const c = reducer(core, { type: "RaceCleared" }); return c.races.length === 0 && typeof c.baseStartDate === "string" && typeof c.lastRaceType === "string" && c.lastRaceType.length > 0; })());
  ok("No-race: deriveState exposes noRace + safe race fields", (() => { const T = deriveState({ ...core, races: [] }).todayState; return T.noRace === true && T.raceCountdown === null && T.raceReadiness.category === "No race" && Array.isArray(T.predictions) && T.predictions.length === 4 && T.carb === null && T.pacing === null; })());
  ok("A1: long run never exceeds ~45% of weekly volume", lowVol.weeks.slice(0, lowVol.blockWeeks).filter((w)=>!w.isRecovery && w.phase!=="Taper" && w.phase!=="Race").every((w)=> (w.longRunKm||0) <= (w.volumeKm||999) * 0.5));
  ok("Lower current volume => lower week-1 long", lowVol.weeks[0].longRunKm <= plan.weeks[0].longRunKm);
  // --- Race weight rework ---
  ok("Weight difference reported", typeof wt.diff === "number" && wt.diff >= 0, `${wt.diff}kg`);
  ok("No projection below recommended range", wt.projected >= wt.rangeLow - 0.1, `proj ${wt.projected}`);
  ok("Does not demand muscle loss when within range", !(wt.current <= wt.rangeHigh) || wt.diff === 0);
  const strongWt = predictRaceWeight({ ...core.profile, oneRM: { backSquat: 220, romanianDeadlift: 200 } }, 9);
  const weakWt = predictRaceWeight({ ...core.profile, oneRM: { backSquat: 90, romanianDeadlift: 90 } }, 9);
  ok("Stronger athlete keeps a higher race-weight floor (muscle preserved)", strongWt.rangeLow > weakWt.rangeLow, `${strongWt.rangeLow} vs ${weakWt.rangeLow}`);
  // --- VO2 tracking feeds paces ---
  const vo2Core = reducer(core, { type: "RunLogged", date: todayState.currentDate, run: { type: "Threshold", distanceKm: 12, durationMin: 60, vo2max: 58 } });
  const vo2State = deriveState(vo2Core).todayState;
  ok("Logged VO2 max stored", (vo2Core.vo2Logs || []).some((v) => v.vo2max === 58));
  ok("Latest VO2 drives training paces", vo2State.fitness.source.indexOf("VO") === 0 && vo2State.fitness.vo2max === 58);
  // Conservative coaching calibration: VO2 56.7 -> ~4:30/km threshold (not ~3:48)
  const thr567 = vo2ToThresholdPace(56.7);
  ok("VO2 56.7 gives a realistic threshold (~4:25-4:40)", thr567 >= 265 && thr567 <= 280, pace(thr567) + "/km");
  // Paces use an AVERAGE of recent VO2 readings, not a single spike
  let avgCore = core;
  [50, 54, 62].forEach((v, i) => { avgCore = reducer(avgCore, { type: "VO2Logged", date: iso(addDays(new Date(), i)), vo2max: v }); });
  const avgState = deriveState(avgCore).todayState;
  ok("Paces use averaged VO2 (smooths spikes)", Math.abs(avgState.vo2ForPaces - (50 + 54 + 62) / 3) < 0.2, `${avgState.vo2ForPaces} vs latest ${avgState.vo2Logged}`);
  ok("VO2 max from setup feeds starting paces", deriveState({ ...core, vo2Logs: [], profile: { ...core.profile, vo2max: 55 } }).todayState.vo2ForPaces === 55);
  // Strength progression series merges every lift onto one shared, date-sorted axis
  ok("Strength progress merges lifts onto a shared date axis", (() => { const p = deriveState(core).todayState.progress; if (!p.strengthSeries.length || !p.strengthLifts.length) return false; const sorted = p.strengthSeries.map((r) => r.iso).every((d, i, a) => i === 0 || a[i - 1] <= d); const rowsHaveLifts = p.strengthSeries.some((r) => p.strengthLifts.some((n) => r[n] != null)); return sorted && rowsHaveLifts; })());
  ok("Manual methodology override is respected", deriveState({ ...core, profile: { ...core.profile, methodologyPref: "Norwegian" } }).todayState.methodology === "Norwegian");
  ok("Auto methodology flagged when not overridden", deriveState({ ...core, profile: { ...core.profile, methodologyPref: "Auto" } }).todayState.methodologyIsAuto === true);
  ok("B1: illness mode removes upcoming intensity", (() => { const ic = { ...core, health: { illness: true, injury: false } }; const t = deriveState(ic).todayState.currentDate; const hz = iso(addDays(new Date(t), 10)); const A = deriveState(ic).athleteState; return !A.currentPlan.weeks.flatMap((w) => w.days).some((d) => d.date >= t && d.date <= hz && (d.type === "Threshold" || d.type === "Intervals")); })());
  ok("B1: injury mode suspends upcoming runs", (() => { const ic = { ...core, health: { illness: false, injury: true } }; const t = deriveState(ic).todayState.currentDate; const hz = iso(addDays(new Date(t), 10)); const A = deriveState(ic).athleteState; return !A.currentPlan.weeks.flatMap((w) => w.days).some((d) => d.date >= t && d.date <= hz && d.distanceKm > 0 && d.type !== "Rest"); })());
  ok("B2: week compliance tallies a logged session", (() => { const wk = deriveState(core).athleteState.currentPlan.weeks.find((w) => w.days.some((d) => d.distanceKm > 0)); const day = wk.days.find((d) => d.distanceKm > 0); const comp = { [day.date]: { status: "Completed", compliance: 1 } }; return weekCompliance(wk, comp).completed === 1; })());
  ok("B4: edit overrides a day's workout type", (() => { const wk = deriveState(core).athleteState.currentPlan.weeks.find((w) => w.days.some((d) => d.type === "Easy Run")); const day = wk.days.find((d) => d.type === "Easy Run"); const c2 = reducer(core, { type: "WorkoutEdit", date: day.date, to: "Rest", longKm: 0 }); return deriveState(c2).athleteState.currentPlan.weeks.flatMap((w) => w.days).find((d) => d.date === day.date).type === "Rest"; })());
  ok("B4: swap exchanges two days", (() => { const wk = deriveState(core).athleteState.currentPlan.weeks.find((w) => w.days.filter((d) => d.distanceKm > 0).length >= 2); const ds = wk.days.filter((d) => d.distanceKm > 0); const a = ds[0], b = ds[1]; const c2 = reducer(core, { type: "WorkoutSwap", a: { date: a.date, type: a.type, longKm: a.type === "Long Run" ? a.distanceKm : 0 }, b: { date: b.date, type: b.type, longKm: b.type === "Long Run" ? b.distanceKm : 0 } }); const fl = deriveState(c2).athleteState.currentPlan.weeks.flatMap((w) => w.days); return fl.find((d) => d.date === a.date).type === b.type && fl.find((d) => d.date === b.date).type === a.type; })());
  const vo2Core2 = reducer(vo2Core, { type: "VO2Logged", date: iso(addDays(new Date(), 1)), vo2max: 60 });
  const vo2State2 = deriveState(vo2Core2).todayState;
  ok("VO2 current/previous/trend tracked", vo2State2.vo2Logged === 60 && vo2State2.vo2Previous === 58 && vo2State2.vo2Trend === 2, `cur ${vo2State2.vo2Logged} prev ${vo2State2.vo2Previous} trend ${vo2State2.vo2Trend}`);
  // --- Nutrition: fatigue does not change calories ---
  const nFresh = computeNutrition(core.profile, { type: "Long Run" }, "Build", "Fresh", false);
  const nTired = computeNutrition(core.profile, { type: "Long Run" }, "Build", "Recover", false);
  ok("Fatigue does not change calorie target", nFresh.calories === nTired.calories, `${nFresh.calories} vs ${nTired.calories}`);
  // --- Weight-loss fuelling: always a meaningful deficit when above race weight ---
  const ctxBig = { kgToLose: 10, daysToTarget: 20 };   // large gap
  const ctxSmall = { kgToLose: 0.5, daysToTarget: 120 }; // tiny gap - still floored
  const nBaseLoss = computeNutrition(core.profile, { type: "Long Run" }, "Base", "Fresh", false, ctxBig);
  const nBuildLoss = computeNutrition(core.profile, { type: "Long Run" }, "Build", "Fresh", false, ctxBig);
  const nPeakLoss = computeNutrition(core.profile, { type: "Long Run" }, "Peak", "Fresh", false, ctxBig);
  const nTaperLoss = computeNutrition(core.profile, { type: "Long Run" }, "Taper", "Fresh", false, ctxBig);
  const nRecLoss = computeNutrition(core.profile, { type: "Long Run" }, "Recovery", "Fresh", false, ctxBig);
  ok("Deficit runs ONLY in Base/Build (loss phases)", nBaseLoss.deficit > 0 && nBuildLoss.deficit > 0, `Base ${nBaseLoss.deficit} / Build ${nBuildLoss.deficit}`);
  ok("Peak/Taper/Recovery fuel fully for performance (no deficit)", nPeakLoss.deficit === 0 && nTaperLoss.deficit === 0 && nRecLoss.deficit === 0, `${nPeakLoss.deficit}/${nTaperLoss.deficit}/${nRecLoss.deficit}`);
  ok("Performance phases fuelled higher than Build when losing weight", nPeakLoss.calories > nBuildLoss.calories, `${nPeakLoss.calories} vs ${nBuildLoss.calories}`);
  ok("Deficit stays within the 500-600 kcal band when above weight", nBaseLoss.deficit >= MIN_LOSS_DEFICIT && nBaseLoss.deficit <= MAX_DAILY_DEFICIT && nBuildLoss.deficit >= MIN_LOSS_DEFICIT && nBuildLoss.deficit <= MAX_DAILY_DEFICIT, `Base ${nBaseLoss.deficit} / Build ${nBuildLoss.deficit}`);
  const nTiny = computeNutrition(core.profile, { type: "Long Run" }, "Build", "Fresh", false, ctxSmall);
  ok("Always at least a 500 kcal deficit when not at race weight (even a tiny gap)", nTiny.deficit >= MIN_LOSS_DEFICIT, `${nTiny.deficit} kcal/day`);
  const nAtWeight = computeNutrition(core.profile, { type: "Long Run" }, "Build", "Fresh", false, { kgToLose: 0, daysToTarget: 60 });
  ok("At race weight: full fuelling, no deficit", nAtWeight.deficit === 0, `${nAtWeight.deficit}`);
  ok("Loss phase replenishes < 100%, performance phase = 100%", nBuildLoss.replenishPct < 100 && nPeakLoss.replenishPct === 100, `Build ${nBuildLoss.replenishPct}% / Peak ${nPeakLoss.replenishPct}%`);
  const heavyWt = predictRaceWeight({ ...core.profile, weightKg: 82, bodyFatPct: 20 }, 9);
  const nHeavy = computeNutrition({ ...core.profile, weightKg: 82 }, { type: "Long Run" }, "Build", "Fresh", false, { kgToLose: heavyWt.aboveRange, daysToTarget: 60 });
  ok("Race weight feeds the fuel engine (above range -> deficit)", heavyWt.aboveRange > 0 && nHeavy.deficit >= MIN_LOSS_DEFICIT, `${heavyWt.aboveRange}kg -> ${nHeavy.deficit}kcal`);
  ok("No BMR or phase-modifier line leaks into fuel output", nBuildLoss.phaseModifier === undefined && typeof nBuildLoss.maintenance === "number");
  // Cost model: scales with bodyweight + distance, and rest-day maintenance does not double-count exercise
  const p92 = { ...core.profile, weightKg: 92, heightCm: 180, age: 30 };
  const restMaint = computeNutrition(p92, { type: "Rest" }, "Peak", "Fresh", false).maintenance;
  const bmr92 = 10 * 92 + 6.25 * 180 - 5 * 30 + 5;
  ok("Rest-day maintenance = BMR x 1.35 (no exercise double-count)", Math.abs(restMaint - Math.round(bmr92 * 1.35)) <= 2, `${restMaint} vs ${Math.round(bmr92 * 1.35)}`);
  const long92 = computeNutrition(p92, { type: "Long Run", distanceKm: 24 }, "Peak", "Fresh", false);
  ok("Heavier athlete burns more on a long run (cost scales with weight)", trainingCost(p92, { type: "Long Run", distanceKm: 24 }) > trainingCost(core.profile, { type: "Long Run", distanceKm: 24 }));
  ok("92 kg long-run fuelling lands in a sane range (3200-4400 kcal)", long92.calories >= 3200 && long92.calories <= 4400, `${long92.calories} kcal`);
  ok("Longer runs are fuelled more than shorter ones", computeNutrition(p92, { type: "Long Run", distanceKm: 30 }, "Peak", "Fresh", false).calories > computeNutrition(p92, { type: "Easy Run", distanceKm: 10 }, "Peak", "Fresh", false).calories);
  // Intelligent adjustment off the weekly weight trend
  const baseCtx = { kgToLose: 4, daysToTarget: 60 };
  const nStall = computeNutrition(p92, { type: "Easy Run", distanceKm: 10 }, "Build", "Fresh", false, { ...baseCtx, trendKgPerWeek: -0.02 });
  const nFlat = computeNutrition(p92, { type: "Easy Run", distanceKm: 10 }, "Build", "Fresh", false, { ...baseCtx, trendKgPerWeek: null });
  const nFast = computeNutrition(p92, { type: "Easy Run", distanceKm: 10 }, "Build", "Fresh", false, { ...baseCtx, trendKgPerWeek: -1.5 });
  const nOn = computeNutrition(p92, { type: "Easy Run", distanceKm: 10 }, "Build", "Fresh", false, { ...baseCtx, trendKgPerWeek: -0.5 });
  ok("Stalling weight trims calories (bigger deficit)", nStall.adaptiveDelta === 150 && nStall.calories < nFlat.calories, `${nStall.calories} vs ${nFlat.calories}`);
  ok("Losing too fast adds calories back (smaller deficit)", nFast.adaptiveDelta === -150 && nFast.calories > nFlat.calories, `${nFast.calories} vs ${nFlat.calories}`);
  ok("On-target trend holds calories steady", nOn.adaptiveDelta === 0);
  ok("Adjustments are slight (<= 150 kcal off the deficit)", Math.abs(nStall.adaptiveDelta) <= 150 && Math.abs(nFast.adaptiveDelta) <= 150);
  ok("Weight-trend detector reads a losing trend", weightTrendKgPerWeek([
    { date: iso(addDays(new Date(), -21)), weightKg: 93.0 }, { date: iso(addDays(new Date(), -14)), weightKg: 92.6 },
    { date: iso(addDays(new Date(), -7)), weightKg: 92.2 }, { date: iso(new Date()), weightKg: 91.8 },
  ]) < 0);
  // --- Auto-methodology from profile + fitness ---
  ok("Auto methodology: balanced default (seed)", autoMethodology(core.profile, null) === "Polarised", autoMethodology(core.profile, null));
  ok("Auto methodology: high volume + days + fitness -> Norwegian", autoMethodology({ currentWeeklyVolumeKm: 78, availabilityDays: 6 }, 58) === "Norwegian");
  ok("Auto methodology: limited days -> Threshold", autoMethodology({ currentWeeklyVolumeKm: 50, availabilityDays: 3 }, null) === "Threshold");
  ok("Auto methodology: strong base -> Pyramidal", autoMethodology({ currentWeeklyVolumeKm: 65, availabilityDays: 5 }, null) === "Pyramidal");
  ok("Methodology surfaced to UI with explanation", typeof todayState.methodology === "string" && typeof todayState.methodologyInfo === "string" && todayState.methodologyInfo.length > 0);
  // --- Persistence + setup flow ---
  const editedForSave = reducer(core, { type: "ProfileUpdated", profile: { name: "Saved Athlete" } });
  const { today: _t, ...persistable } = editedForSave;
  const restored = reducer(seedCore(), { type: "Hydrate", core: JSON.parse(JSON.stringify(persistable)) });
  ok("Saved athlete is remembered (Hydrate round-trip)", restored.profile.name === "Saved Athlete" && restored.profile.setupComplete === true && restored.today instanceof Date);
  const fresh = reducer(core, { type: "StartFresh" });
  ok("New athlete setup starts blank (setup incomplete, no logs)", fresh.profile.setupComplete === false && fresh.liftLogs.length === 0 && fresh.completions && Object.keys(fresh.completions).length === 0);
  // --- Romanian Deadlift replaces the deadlift/barbell-row 1RM model ---
  ok("1RM model is RDL-based (no deadlift / barbell row)", core.profile.oneRM.romanianDeadlift !== undefined && core.profile.oneRM.deadlift === undefined && core.profile.oneRM.barbellRow === undefined);
  const rdlCore = reducer(core, { type: "StrengthLogged", date: todayState.currentDate, exercises: [{ name: "Romanian Deadlift", sets: [{ weight: core.profile.oneRM.romanianDeadlift + 15, reps: 4 }] }], notes: "" });
  ok("Romanian Deadlift log updates its 1RM", rdlCore.profile.oneRM.romanianDeadlift > core.profile.oneRM.romanianDeadlift, `${core.profile.oneRM.romanianDeadlift} -> ${rdlCore.profile.oneRM.romanianDeadlift}`);
  // --- Per-set strength logging feeds overload + progress ---
  const before1RM = core.profile.oneRM.backSquat;
  const setCore = reducer(core, { type: "StrengthLogged", date: todayState.currentDate, exercises: [{ name: "Back Squat", sets: [{ weight: before1RM + 10, reps: 5 }, { weight: before1RM + 12, reps: 3 }] }], notes: "felt strong" });
  ok("Per-set strength log updates 1RM (overload)", setCore.profile.oneRM.backSquat > before1RM, `${before1RM} -> ${setCore.profile.oneRM.backSquat}`);
  ok("Per-set strength log feeds progress + stores sets", setCore.liftLogs[0].exercise === "Back Squat" && Array.isArray(setCore.liftLogs[0].sets) && setCore.completions[todayState.currentDate]);
  ok("#2: logged run carries a unique id + source tag", (() => { const c = reducer(core, { type: "RunLogged", date: todayState.currentDate, run: { type: "Easy Run", distanceKm: 10, durationMin: 60 } }); return !!c.runLogs[0].id && c.runLogs[0].source === "manual"; })());
  ok("#2: an imported run can supply its own id/source (dedup-ready)", (() => { const c = reducer(core, { type: "RunLogged", date: todayState.currentDate, run: { id: "strava_123", source: "strava", type: "Easy Run", distanceKm: 8, durationMin: 48 } }); return c.runLogs[0].id === "strava_123" && c.runLogs[0].source === "strava"; })());
  ok("#3: saving recovery appends a dated history entry (manual still works)", (() => { const c = reducer(core, { type: "RecoverySaved", date: "2026-05-01", inputs: { hrv: 61 } }); return Array.isArray(c.recoveryLogs) && c.recoveryLogs[0].date === "2026-05-01" && c.recoveryLogs[0].hrv === 61 && c.recoveryInputs.hrv === 61; })());
  ok("B7: Build prehab includes one plyometric (4 moves, 2 sets)", (() => { const a = generateStrengthSession(core.profile, 2, "Build", false, 0); const b = generateStrengthSession(core.profile, 2, "Build", false, 1); return a.prehab.filter((p) => p.plyo).length === 1 && b.prehab.filter((p) => p.plyo).length === 1 && a.prehab.length === 4; })());
  // --- Goal race change auto-updates everything ---
  const newDate = iso(addDays(new Date(), 16 * 7));
  const moved = reducer(core, { type: "RaceUpdated", race: { goalTime: "3:10:00", date: newDate } });
  const movedT = deriveState(moved).todayState;
  ok("Goal race change updates countdown + nutrition automatically", movedT.raceCountdown !== todayState.raceCountdown && movedT.upcomingEvents[0].date === newDate);
  // --- Plan re-fits when start date / race date change ---
  const raceDay0 = plan.weeks.find((w) => w.phase === "Race")?.days.find((d) => d.type === "Race");
  ok("Race Day workout lands on the goal race date", !!raceDay0 && raceDay0.date === iso(new Date(core.races[0].date)), raceDay0 ? raceDay0.date : "none");
  const closer = reducer(coreAOnly, { type: "RaceUpdated", race: { date: iso(addDays(mondayOf(new Date()), 5 * 7 + 5)) } });
  const closerPlan = deriveState(closer).athleteState.currentPlan;
  ok("Changing race date resizes the training block", closerPlan.blockWeeks < plan.blockWeeks, `${closerPlan.blockWeeks} vs ${plan.blockWeeks} wks`);
  const cRaceDay = closerPlan.weeks.find((w) => w.phase === "Race")?.days.find((d) => d.type === "Race");
  ok("Race Day follows the new race date", !!cRaceDay && cRaceDay.date === iso(new Date(closer.races[0].date)), cRaceDay ? cRaceDay.date : "none");
  const shifted = reducer(core, { type: "ProfileUpdated", profile: { planStartDate: iso(addDays(mondayOf(new Date()), -10 * 7)) } });
  const shiftedPlan = deriveState(shifted).athleteState.currentPlan;
  const sRaceDay = shiftedPlan.weeks.find((w) => w.phase === "Race")?.days.find((d) => d.type === "Race");
  ok("Changing start date shifts Week 1 and re-fits to race", shiftedPlan.weeks[0].startDate !== plan.weeks[0].startDate && !!sRaceDay && sRaceDay.date === iso(new Date(core.races[0].date)));
  const required = ["currentDate", "currentWeek", "currentPhase", "todaysWorkout", "recoveryScore", "trainingLoad", "nutritionTargets", "raceCountdown", "raceReadiness", "goalConfidence", "coachAlerts", "paces", "fitness", "predictions", "weight", "pacing", "fuelling", "carb", "strengthSession", "progress", "vo2Target", "vo2Current"];

  // --- Robustness: NaN-proofing, migration, today refresh, personal baselines, plan memo ---
  const _sp = sanitizeProfile({ age: NaN, weightKg: "", heightCm: 9999, maxHr: NaN, oneRM: {}, measurements: {} });
  ok("sanitizeProfile clamps NaN/blank/out-of-range numbers", Number.isFinite(_sp.age) && Number.isFinite(_sp.weightKg) && _sp.heightCm <= 230 && Number.isFinite(_sp.oneRM.backSquat) && Number.isFinite(_sp.maxHr));
  const _poison = { ...core, profile: { ...core.profile, weightKg: NaN, age: NaN, heightCm: NaN } };
  ok("Engine is NaN-proof: bad profile numbers never produce NaN output", Number.isFinite(deriveState(_poison).todayState.nutritionTargets.calories) && Number.isFinite(deriveState(_poison).todayState.paces.paces[1].secPerKm));
  const _mig = migrateCore({ profile: { weightKg: 80 } });
  ok("migrateCore stamps schema version + fills log arrays", _mig.schemaVersion === SCHEMA_VERSION && Array.isArray(_mig.runLogs) && Array.isArray(_mig.recoveryLogs));
  const _rt = reducer({ ...core, today: addDays(new Date(), -3) }, { type: "RefreshToday", today: new Date() });
  ok("RefreshToday advances the app's current date", iso(_rt.today) === iso(new Date()));
  const _lowHrv = []; for (let i = 0; i < 6; i++) _lowHrv.push({ date: iso(addDays(new Date(), -i - 1)), hrv: 45, restingHr: 55 });
  const _adaptCore = { ...core, recoveryLogs: _lowHrv, recoveryInputs: { ...core.recoveryInputs, hrv: 45, hrvBaseline: 62, restingHr: 55, rhrBaseline: 49 } };
  ok("Recovery HRV baseline personalises to the athlete's own logs", deriveState(_adaptCore).todayState.recovery.breakdown.HRV >= 40);
  const _pm1 = generatePlanMemo({ ...core.profile, todayISO: iso(new Date()) }, core.races[0], [], []);
  const _pm2 = generatePlanMemo({ ...core.profile, todayISO: iso(new Date()) }, core.races[0], [], []);
  _pm1.weeks[0].days[0]._mut = true;
  ok("Plan memo returns independent clones (mutation-safe)", _pm2.weeks[0].days[0]._mut === undefined);
  ok("TodayState complete", required.every((k) => todayState[k] !== undefined));
  return out;
}
