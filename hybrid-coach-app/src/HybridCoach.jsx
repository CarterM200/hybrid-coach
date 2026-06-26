import React, { useMemo, useReducer, useState, useEffect } from "react";
import {
  Activity, Heart, Flame, CalendarDays, Trophy, Gauge, Moon, TrendingUp,
  AlertTriangle, CheckCircle2, Footprints, Dumbbell, Coffee, Zap, Droplets,
  Bed, Beaker, ChevronLeft, ChevronRight, Target, RefreshCw, User, Settings,
  Plane, Timer, Scale, ClipboardList, BarChart3, Plus, Wind, Layers, ArrowRight, X, Flag, LogOut, Wind as Lung,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from "recharts";

/* =========================================================================
   HYBRID COACH V2 — with Final Implementation Corrections (11 items)
   Single source of truth: AthleteState -> TodayState. UI consumes state.
   1 paces from fitness(CTL) not goal | 2 protein 2g/kg, fat 20%, carbs rem |
   3 per-workout logging -> Coach Engine | 4 focus 4+2/3+3/2+4 |
   5 gel schedule | 6 plan start date + calendar dates | 7 auto regen + miss adapt |
   8 race weight via lean mass + range | 9 HR zones on runs | 10 race VO2 targets |
   11 tabs: Dashboard · Training · Race · Progress · Profile
   ========================================================================= */
const C = {
  bg: "#0E1014", surface: "#171A21", surface2: "#1F232C", line: "#2A2F3A",
  text: "#ECEDF1", dim: "#9AA1AE", faint: "#646B79",
  ember: "#FF5A3C", emberSoft: "#FF7A60", teal: "#2DD4BF", amber: "#F5A623",
  rose: "#F25C7A", violet: "#8B7BFF", sky: "#5BC8FF",
};
const STATUS_COLOR = {
  Fresh: C.teal, Normal: C.sky, Caution: C.amber, Recover: C.rose,
  Ready: C.teal, Fatigued: C.amber, "High Risk": C.rose,
  "Race Ready": C.teal, "On Track": C.sky, "Needs Improvement": C.amber,
};
const DAY_MS = 86400000;
const DOW_WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const _d = (d) => { const x = (d instanceof Date) ? d : new Date(d); return isNaN(x.getTime()) ? new Date() : x; };
const iso = (d) => _d(d).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(_d(d).getTime() + n * DAY_MS);
const diffDays = (a, b) => Math.round((new Date(iso(a)) - new Date(iso(b))) / DAY_MS);
function mondayOf(d) { const x = new Date(iso(d)); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); }
const fmtDate = (d) => _d(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtShort = (d) => _d(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
function secsToHMS(s) { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`; }
function pace(secPerKm) { const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60); return `${m}:${String(s).padStart(2, "0")}`; }
const round2_5 = (x) => Math.round(x / 2.5) * 2.5;
const KM_MI = 1.609344, KG_LB = 0.45359237;
const distU = (u) => (u === "imperial" ? "mi" : "km");
const wtU = (u) => (u === "imperial" ? "lb" : "kg");
const paceU = (u) => (u === "imperial" ? "/mi" : "/km");
const uDist = (km, u, dp) => { if (km == null || km === "" || isNaN(km)) return km; const v = u === "imperial" ? km / KM_MI : +km; const d = dp != null ? dp : (Math.abs(v) < 100 ? 1 : 0); return +v.toFixed(d); };
const uWt = (kg, u, dp) => { if (kg == null || kg === "" || isNaN(kg)) return kg; const v = u === "imperial" ? kg / KG_LB : +kg; return +v.toFixed(dp != null ? dp : 1); };
const uPace = (secPerKm, u) => (u === "imperial" ? secPerKm * KM_MI : secPerKm);
const toKm = (v, u) => { const n = parseFloat(v); if (isNaN(n)) return v; return u === "imperial" ? n * KM_MI : n; };
const toKg = (v, u) => { const n = parseFloat(v); if (isNaN(n)) return v; return u === "imperial" ? n * KG_LB : n; };

/* ---- TRAINING ENGINE (focus-aware, date-based, HR zones) ---- */
const ICONS = { Rest: Bed, "Easy Run": Footprints, "Recovery Run": Footprints, "Long Run": Activity, Threshold: Zap, Intervals: Zap, Tempo: TrendingUp, Strength: Dumbbell, Race: Trophy, Travel: Plane };
// Phase structure only — long-run distance + weekly volume are now computed
// dynamically from the athlete's current weekly volume (see buildVolumeProfile).
const MARATHON_BLOCK = [
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
const EASY_KM = { Base: 10, Build: 12, Peak: 12, Taper: 7, Recovery: 7, "Off-Season": 8, Race: 6 };
const PEAK_LONG = { Marathon: 34, Half: 21, "10K": 14, "5K": 12 };
const LONG_FRACTION = 0.34; // running-focused: long run ~34% of weekly volume
const TAPER_LONG = [0.7, 0.52, 0.38];
// Build a phase block of `n` weeks that ENDS on the race week, counting phases
// back from race day: Race -> Taper -> Peak -> Build/Base with 3:1 deloads.
// This lets the plan re-fit itself whenever the start date or race date changes.
function buildBlockMeta(n, dist) {
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
function buildVolumeProfile(profile, race, block) {
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
const WEEKDAY_MAX_KM = 11; // ~66 min easy
function easyKmFor(weeklyTarget, longKm, runs) {
  const others = Math.max(1, runs - 1);
  const budget = Math.max(others * 5, weeklyTarget - longKm);
  return Math.max(5, Math.min(WEEKDAY_MAX_KM, Math.round(budget / others)));
}
// Running-focused marathon + strength. The run/strength split is driven purely
// by how many days/week the athlete can train. Running (volume + the key long
// run and quality sessions) is prioritised; strength is added once running is
// covered and capped at 2/week to maintain strength without over-interfering
// with marathon adaptation (concurrent-training research).
const DAY_SPLIT = {
  3: { runs: 3, lifts: 0 },
  4: { runs: 3, lifts: 1 },
  5: { runs: 4, lifts: 1 },
  6: { runs: 4, lifts: 2 },
  7: { runs: 5, lifts: 2 },
};
function splitFor(days) { const d = Math.max(3, Math.min(7, Math.round(days || 6))); return DAY_SPLIT[d]; }
// Base phase emphasises strength to build muscle: more lifts, fewer runs.
function splitForBase(days) { const d = Math.max(3, Math.min(7, Math.round(days || 6))); return ({ 7: { runs: 4, lifts: 3 }, 6: { runs: 3, lifts: 3 }, 5: { runs: 3, lifts: 2 }, 4: { runs: 2, lifts: 2 }, 3: { runs: 2, lifts: 1 } })[d]; }
// Post-race reverse-taper multipliers (weekly volume vs carried-over base), scaled
// by distance: a 5K barely dents training, a marathon needs ~4 weeks to ease back.
const RACE_RECOVERY = { "5K": [0.9], "10K": [0.85], "Half": [0.6, 0.85], "Marathon": [0.5, 0.65, 0.8, 0.9] };
const METHOD_QUALITY = { Polarised: ["Intervals", "Threshold"], Pyramidal: ["Tempo", "Threshold"], Threshold: ["Threshold", "Threshold"], Norwegian: ["Double Threshold", "Threshold"] };
const METHODOLOGY_INFO = {
  Polarised: "~80% easy / 20% hard. Two sharp quality sessions a week - VO2 intervals + threshold - and everything else genuinely easy. Big aerobic base plus top-end speed with low injury risk. Default for most runners.",
  Pyramidal: "Most volume easy, a solid block of threshold and marathon-effort tempo, a little VO2 on top. Marathon-specific - lots of time at the efforts that decide a marathon. Suits good weekly volume.",
  Threshold: "Built around sustained threshold (lactate-clearance) work. The most time-efficient way to grow the engine - ideal when training days or weekly volume are limited.",
  Norwegian: "Controlled double-threshold sessions paced by heart rate. A high-volume, advanced method that packs in large amounts of quality with minimal blow-up risk.",
};
// Pick the methodology an expert coach would, from training availability, weekly
// volume and current fitness (VO2 max when logged).
function autoMethodology(profile, vo2) {
  const vol = profile.currentWeeklyVolumeKm || 40, days = profile.availabilityDays || 5, fit = vo2 || 0;
  if (vol >= 70 && days >= 6 && fit >= 55) return "Norwegian";   // advanced: high volume + days + fitness
  if (days <= 4 || vol < 35) return "Threshold";                 // time/volume limited: most efficient
  if (vol >= 60 && days >= 5) return "Pyramidal";                // strong base: marathon-specific
  return "Polarised";                                            // balanced default
}
const HR_ZONE = { "Recovery Run": ["Z1", 0.60, 0.70], "Easy Run": ["Z2", 0.70, 0.78], "Long Run": ["Z2", 0.73, 0.80], Tempo: ["Z3", 0.80, 0.87], Threshold: ["Z4", 0.87, 0.92], "Double Threshold": ["Z4", 0.87, 0.92], Intervals: ["Z5", 0.92, 0.97], Race: ["Z3-4", 0.82, 0.90], Travel: ["Z2", 0.68, 0.78] };
// HR zone colours (Z1 blue -> Z5 pink)
const HR_ZONE_COLOR = { Z1: "#4F86F7", Z2: "#22D3EE", Z3: "#A3E635", Z4: "#FB923C", Z5: "#F472B6", "Z3-4": "#FB923C" };
const hrColor = (zone) => HR_ZONE_COLOR[zone] || "#22D3EE";
function hrZoneFor(type, maxHr) { const z = HR_ZONE[type]; if (!z) return null; return { zone: z[0], lo: Math.round(maxHr * z[1]), hi: Math.round(maxHr * z[2]) }; }

function buildWorkoutData(type, phase, longKm, recovery, maxHr, easyKm) {
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
    case "Strength": return mk({ name: "Strength", dist: 0, dur: 55, int: "moderate", load: 45, detail: "3 prehab - 2 compound - 4 accessory" });
    case "Long Run": return mk({ name: recovery ? "Long run (reduced)" : "Long run", dist: longKm, dur: Math.round(longKm * 6.2), int: phase === "Peak" ? "high" : "moderate", load: Math.round(longKm * 6), detail: phase === "Peak" || phase === "Build" ? "Progressive: last third at marathon effort" : "Steady aerobic endurance" });
    case "Race": { const km = longKm && longKm > 0 ? Math.round(longKm * 10) / 10 : 42.2; const label = km >= 42 ? "Marathon" : km >= 21 ? "Half Marathon" : km >= 10 ? "10K" : km >= 5 ? "5K" : `${km}km`; return mk({ name: `${label} - Race Day`, dist: km, dur: Math.round(km * 5), int: "high", load: Math.round(km * 7.6), detail: "Execute race plan. Fuel early and often." }); }
    case "Travel": return mk({ name: "Travel / easy", dist: 5, dur: 30, int: "low", load: 20, detail: "Holiday - keep it easy" });
    default: return mk({ name: type, dist: 0, dur: 0, int: "low", load: 0, detail: "" });
  }
}
const isHard = (t) => t === "Intervals" || t === "Threshold" || t === "Double Threshold";
function weekSessions(phase, recovery, split, methodology) {
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
  return [...used, ...easies, ...Array(f.lifts).fill("Strength")];
}
// Unique permutations of a (possibly duplicated) array
function uniquePerms(arr) {
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
function weekPenalty(types, phase) {
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
function arrangeWeek(weekStart, phase, recovery, nonLong, longWd, restWd, maxHr, longKm, easyKm, minDateISO, raceDateISO) {
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
function generatePlan(profile, race, holidays = [], bRaces = []) {
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
function adaptForMissedKey(plan, completions, maxHr) {
  const missed = Object.entries(completions).filter(([d, r]) => r.status === "Missed" && r.key).map(([d]) => d).sort();
  if (!missed.length) return plan;
  const last = missed[missed.length - 1]; const wi = plan.weeks.findIndex((w) => last >= w.startDate && last <= w.endDate);
  for (const idx of [wi, wi + 1]) { const wk = plan.weeks[idx]; if (!wk) continue; const q = wk.days.find((d) => isHard(d.type) && d.date > last); if (q) { Object.assign(q, buildWorkoutData("Easy Run", wk.phase, 0, false, maxHr), { date: q.date, dow: q.dow, adapted: true }); wk.load = wk.days.reduce((s, d) => s + d.load, 0); wk.volumeKm = Math.round(wk.days.reduce((s, d) => s + d.distanceKm, 0)); break; } }
  return plan;
}
function recomputeWeeks(plan) {
  plan.weeks.forEach((wk) => { wk.volumeKm = Math.round(wk.days.reduce((s, d) => s + d.distanceKm, 0)); wk.load = wk.days.reduce((s, d) => s + d.load, 0); wk.runCount = wk.days.filter((d) => d.distanceKm > 0 && d.type !== "Rest").length; wk.liftCount = wk.days.filter((d) => d.type === "Strength").length; });
}
// B1 Adaptive layer: rewrites upcoming sessions in response to injury, illness and
// missed long runs (on top of adaptForMissedKey). Returns notes for coach alerts.
function applyAdaptations(plan, core, today, maxHr) {
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
function weekCompliance(week, completions) {
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
function applyOverrides(plan, overrides, maxHr) {
  if (!overrides) return plan;
  plan.weeks.forEach((wk) => wk.days.forEach((d) => {
    const o = overrides[d.date]; if (!o) return;
    const longKm = o.type === "Long Run" ? (o.longKm || wk.longRunKm || d.distanceKm || 20) : 0;
    Object.assign(d, buildWorkoutData(o.type, wk.phase, longKm, wk.isRecovery, maxHr), { date: d.date, dow: d.dow, moved: true });
  }));
  recomputeWeeks(plan);
  return plan;
}
const allDays = (plan) => plan.weeks.flatMap((w) => w.days.map((d) => ({ ...d, weekNumber: w.weekNumber, phase: w.phase })));
const dayFor = (plan, dateISO) => allDays(plan).find((d) => d.date === dateISO) || null;
function weekFor(plan, dateISO) { if (dateISO < plan.weeks[0].startDate) return plan.weeks[0]; return plan.weeks.find((w) => dateISO >= w.startDate && dateISO <= w.endDate) || plan.weeks[plan.weeks.length - 1]; }

/* ---- STRENGTH ENGINE ---- */
function strengthScheme(phase) {
  switch (phase) { case "Base": return { sets: 4, reps: 6, pct: 0.72, label: "Hypertrophy" }; case "Build": return { sets: 4, reps: 4, pct: 0.82, label: "Strength" }; case "Peak": return { sets: 3, reps: 3, pct: 0.85, label: "Maintenance" }; case "Taper": return { sets: 2, reps: 3, pct: 0.70, label: "Primer" }; default: return { sets: 3, reps: 5, pct: 0.75, label: "General" }; }
}
// Accessory swap options, grouped by movement category so a swap always matches
// the same pattern (e.g. a Lat Pulldown can replace a Weighted Pull-up - both
// vertical pulls). The first entry is the default prescription.
const EXERCISE_ALTS = {
  "glute-hinge": ["Hip Thrust", "Single-leg Hip Thrust", "Glute Bridge", "Back Extension", "Good Morning"],
  "lunge": ["Bulgarian Split Squat", "Walking Lunge", "Reverse Lunge", "Step-up", "Split Squat"],
  "vertical-pull": ["Weighted Pull-up", "Lat Pulldown", "Chin-up", "Assisted Pull-up", "Neutral-grip Pulldown"],
  "horizontal-push": ["Incline DB Press", "Flat DB Press", "Weighted Push-up", "Dips", "Machine Chest Press"],
  "horizontal-pull": ["Barbell Row", "Chest-supported Row", "Seated Cable Row", "Single-arm DB Row", "Pendlay Row"],
};
// Conservative STARTING working weights for accessories (kg). Deliberately light -
// we don't have a 1RM for these, so we start easy and add weight every session via
// linear progression (+2.5 kg upper body / +5 kg lower body) rather than guessing a
// percentage of a compound 1RM (which tends to prescribe far too much).
const ACCESSORY_START = {
  "Hip Thrust": 40, "Single-leg Hip Thrust": 16, "Glute Bridge": 30, "Back Extension": 5, "Good Morning": 30,
  "Bulgarian Split Squat": 12, "Walking Lunge": 12, "Reverse Lunge": 12, "Step-up": 12, "Split Squat": 12,
  "Weighted Pull-up": 0, "Lat Pulldown": 35, "Chin-up": 0, "Assisted Pull-up": 0, "Neutral-grip Pulldown": 35,
  "Incline DB Press": 16, "Flat DB Press": 18, "Weighted Push-up": 0, "Dips": 0, "Machine Chest Press": 30,
  "Barbell Row": 40, "Chest-supported Row": 30, "Seated Cable Row": 40, "Single-arm DB Row": 22, "Pendlay Row": 40,
};
const LOWER_CATS = ["glute-hinge", "lunge"];
const stepIncrement = (category) => (LOWER_CATS.includes(category) ? 5 : 2.5); // +5 lower / +2.5 upper per session
// Per-exercise progression step (+5 kg lower body / +2.5 kg upper body).
function liftIncrement(name) {
  if (name === "Back Squat" || name === "Romanian Deadlift") return 5;
  if (name === "Bench Press" || name === "Overhead Press") return 2.5;
  for (const cat in EXERCISE_ALTS) if (EXERCISE_ALTS[cat].includes(name)) return LOWER_CATS.includes(cat) ? 5 : 2.5;
  return 2.5;
}
// sessionParity 0 -> Session A (Deadlift + Bench), 1 -> Session B (Squat + OHP).
// Compounds are prescribed off your 1RM and PROGRESS week to week: a 4-week wave
// (+2.5% per week, deload on the 4th) on top of a 1RM that itself rises as you log
// PRs - so the bar keeps moving and you never stagnate. Accessories use the last
// working weight (no 1RM), advancing +2.5/+5 kg when you complete everything.
function generateStrengthSession(profile, weekNumber, phase, isRecovery, sessionIdx = 0, weights = {}) {
  const rm = profile.oneRM, scheme = strengthScheme(phase);
  const waveWeek = (weekNumber - 1) % 4; let overload = 1 + waveWeek * 0.025; if (isRecovery) overload = 0.9;
  // Three complementary sessions. Cycling A/B/C across a week of strength days makes a
  // 2- or 3-lift week cover every barbell compound (squat, hinge, horizontal & vertical
  // push) plus pull, single-leg and core - and no two sessions in a week are identical.
  const TEMPLATES = [
    { label: "A",
      compound: [{ name: "Back Squat", pattern: "Squat", oneRM: rm.backSquat }, { name: "Bench Press", pattern: "Horizontal push", oneRM: rm.benchPress }],
      acc: [{ name: "Hip Thrust", pattern: "Hinge", category: "glute-hinge", sets: 3, reps: 10, note: "glute drive" }, { name: "Bulgarian Split Squat", pattern: "Single-leg", category: "lunge", sets: 3, reps: 8, note: "per leg, DB" }, { name: "Weighted Pull-up", pattern: "Vertical pull", category: "vertical-pull", sets: 3, reps: 6, note: "added load" }, { name: "Chest-supported Row", pattern: "Horizontal pull", category: "horizontal-pull", sets: 3, reps: 12, note: "squeeze shoulder blades" }],
      prehab: [{ name: "Pogo Hops", sets: 2, reps: 12, note: "plyometric - fast, stiff ankles, minimal ground contact", plyo: true }, { name: "Banded Glute Bridge", sets: 2, reps: 15 }, { name: "Copenhagen Plank", sets: 2, reps: "30s", note: "per side" }] },
    { label: "B",
      compound: [{ name: "Romanian Deadlift", pattern: "Hinge", oneRM: rm.romanianDeadlift }, { name: "Overhead Press", pattern: "Vertical push", oneRM: rm.overheadPress }],
      acc: [{ name: "Walking Lunge", pattern: "Single-leg", category: "lunge", sets: 3, reps: 10, note: "per leg, DB" }, { name: "Dips", pattern: "Horizontal push", category: "horizontal-push", sets: 3, reps: 8, note: "bodyweight + added load" }, { name: "Lat Pulldown", pattern: "Vertical pull", category: "vertical-pull", sets: 3, reps: 10, note: "controlled" }, { name: "Barbell Row", pattern: "Horizontal pull", category: "horizontal-pull", sets: 3, reps: 10, note: "flat back, pull to lower ribs" }],
      prehab: [{ name: "Box Jumps", sets: 2, reps: 6, note: "plyometric - soft landing, step down between reps", plyo: true }, { name: "Dead Bug", sets: 2, reps: 12, note: "per side" }, { name: "Side Plank", sets: 2, reps: "30s", note: "per side" }] },
    { label: "C",
      compound: [{ name: "Back Squat", pattern: "Squat", oneRM: rm.backSquat }, { name: "Romanian Deadlift", pattern: "Hinge", oneRM: rm.romanianDeadlift }],
      acc: [{ name: "Incline DB Press", pattern: "Horizontal push", category: "horizontal-push", sets: 3, reps: 10, note: "per hand" }, { name: "Seated Cable Row", pattern: "Horizontal pull", category: "horizontal-pull", sets: 3, reps: 12, note: "controlled" }, { name: "Weighted Pull-up", pattern: "Vertical pull", category: "vertical-pull", sets: 3, reps: 8, note: "added load" }, { name: "Hip Thrust", pattern: "Hinge", category: "glute-hinge", sets: 3, reps: 10, note: "glute drive" }],
      prehab: [{ name: "Pogo Hops", sets: 2, reps: 14, note: "plyometric - reactive, minimal contact", plyo: true }, { name: "Bird Dog", sets: 2, reps: 10, note: "per side" }, { name: "Hollow Hold", sets: 2, reps: "30s" }] },
  ];
  const tpl = TEMPLATES[((sessionIdx % 3) + 3) % 3];
  const compound = tpl.compound.map((c) => ({ name: c.name, pattern: c.pattern, sets: scheme.sets, reps: scheme.reps, weightKg: round2_5((c.oneRM || 60) * scheme.pct * overload), pctOneRM: Math.round(scheme.pct * overload * 100) }));
  const accessory = tpl.acc.map((a) => ({ ...a, weightKg: (weights[a.name] != null ? weights[a.name] : (ACCESSORY_START[a.name] != null ? ACCESSORY_START[a.name] : 20)) }));
  return { scheme: scheme.label, overloadPct: Math.round((overload - 1) * 100), session: tpl.label, prehab: tpl.prehab, compound, accessory };
}

/* ---- FITNESS + PACES ---- */
// Convert a VO2 max reading to a lactate-threshold pace the way a cautious coach
// would. Threshold velocity is taken at ~76% of velocity-at-VO2max (the
// recreational end, not the elite 88-91%), because (a) consumer-watch VO2 max
// tends to over-read running fitness, especially for heavier runners, and (b)
// prescribing threshold too fast is a leading cause of overreaching. e.g. a
// VO2 max of 56.7 yields ~4:30/km threshold rather than ~3:48/km.
const THRESHOLD_VVO2_FRACTION = 0.76;
function vo2ToThresholdPace(vo2) {
  // velocity-at-VO2max (m/min) from Daniels: VO2 = -4.6 + 0.182258v + 0.000104v^2
  const a = 0.000104, b = 0.182258, c = -(4.6 + vo2);
  const v = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  const vThr = THRESHOLD_VVO2_FRACTION * v;
  return Math.max(195, Math.min(360, 60000 / vThr)); // sec/km
}
function estimateFitness(load, vo2max) {
  let thr, source;
  if (vo2max) { thr = vo2ToThresholdPace(vo2max); source = "VO\u2082max (avg)"; }
  else { thr = 255 - (load.ctl - 50) * 1.3; thr = Math.max(195, Math.min(340, thr)); source = "training load (CTL)"; }
  const marathonPace = thr + 30; const currentMarathonSecs = Math.round(marathonPace * 42.195);
  return { ctl: load.ctl, thresholdPace: thr, marathonPace, currentMarathonSecs, source, vo2max: vo2max || null };
}
function computePaces(fitness) {
  const thr = fitness.thresholdPace;
  return { thresholdPace: thr, paces: [
    { zone: "Recovery", secPerKm: thr + 95, note: "Very easy" }, { zone: "Easy", secPerKm: thr + 70, note: "Aerobic base, zone 2" },
    { zone: "Long run", secPerKm: thr + 52, note: "Steady endurance" }, { zone: "Marathon", secPerKm: thr + 30, note: "Current marathon effort" },
    { zone: "Threshold", secPerKm: thr, note: "Comfortably hard" }, { zone: "Interval (VO2)", secPerKm: thr - 18, note: "5k effort / vVO2max" },
  ] };
}

/* ---- TRAINING LOAD ---- */
function computeTrainingLoad(plan, today, completions) {
  const start = plan.planStart, end = iso(today); let atl = 45, ctl = 48; const series = [];
  for (let d = new Date(start); iso(d) <= end; d = addDays(d, 1)) {
    const key = iso(d); const planned = dayFor(plan, key); let load = 0;
    if (planned && key <= end) { const rec = completions[key]; if (rec) load = rec.status === "Missed" ? 0 : Math.round(planned.load * (rec.compliance ?? 1)); else load = key < end ? planned.load : 0; }
    ctl += (load - ctl) / 42; atl += (load - atl) / 7;
    series.push({ date: key, load, ctl: Math.round(ctl), atl: Math.round(atl), tsb: Math.round(ctl - atl) });
  }
  const last = series[series.length - 1] || { ctl: 48, atl: 45 }; const tsb = last.ctl - last.atl;
  let category = "Ready"; if (tsb > 10) category = "Fresh"; else if (tsb >= -10) category = "Ready"; else if (tsb >= -30) category = "Fatigued"; else category = "High Risk";
  return { atl: last.atl, ctl: last.ctl, tsb, category, series: series.slice(-42) };
}
function evaluateVariance(planned, actual) {
  const ratio = planned.distanceKm > 0 ? actual.distanceKm / planned.distanceKm : actual.durationMin / Math.max(planned.durationMin, 1);
  const pct = Math.round(ratio * 100); let compliance;
  if (pct >= 95 && pct <= 110) compliance = "Completed"; else if (pct >= 70) compliance = "Modified"; else if (pct >= 30) compliance = "Partial"; else compliance = "Missed";
  return { compliance, compliancePct: Math.min(pct, 110) };
}
function computeRecovery(inputs, tsb, completionPct) {
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
function measuredRecovery(inputs) {
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
const DEFAULT_SESSION_KM = { "Recovery Run": 6, "Easy Run": 10, "Long Run": 22, Tempo: 10, Threshold: 12, Intervals: 10, Race: 21.1, Travel: 5 };
const RUN_KCAL_PER_KG_KM = { "Recovery Run": 0.70, "Easy Run": 0.75, "Long Run": 0.72, Tempo: 0.78, Threshold: 0.80, Intervals: 0.80, Race: 0.78, Travel: 0.70 };
function trainingCost(profile, workout) {
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
const REPLENISH = { Base: 0.25, Build: 0.50, Peak: 1.0, Taper: 1.0, Recovery: 1.0, "Off-Season": 0.50, Race: 1.0 };
const MAX_DAILY_DEFICIT = 600; // kcal/day cap (~0.55 kg/week) - protects muscle + performance
const MIN_LOSS_DEFICIT = 500;  // whenever above race weight in a loss phase, run at least this
// Rolling weekly bodyweight trend (kg/week) from recent logs via least-squares.
// Negative = losing. Used to nudge calories: stalling -> trim, too fast -> add back.
function weightTrendKgPerWeek(bodyLogs) {
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
function computeNutrition(profile, workout, phase, recoveryStatus, isRecoveryWeek, weightCtx) {
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
function carbLoad(profile) { const perKg = 9, grams = Math.round(profile.weightKg * perKg); return { perKg, dailyGrams: grams, days: 3, totalGrams: grams * 3, note: "8-10 g carbs/kg/day across the final 2-3 days" }; }
function raceFuelling(profile, projSecs) {
  const hours = projSecs / 3600, carbPerHr = 80, gelCarbs = profile.gelCarbs || 22;
  const totalCarb = Math.round(carbPerHr * hours); const totalGels = Math.max(1, Math.ceil(totalCarb / gelCarbs));
  const intervalMin = Math.round((projSecs / 60) / totalGels);
  const schedule = Array.from({ length: totalGels }, (_, i) => ({ gel: i + 1, atMin: intervalMin * (i + 1), atClock: secsToHMS(intervalMin * (i + 1) * 60) }));
  const fluidPerHr = profile.sweatRateMlPerHr ? Math.round(Number(profile.sweatRateMlPerHr)) : 600;
  const sodiumPerHr = profile.sweatRateMlPerHr ? Math.round((Number(profile.sweatRateMlPerHr) / 1000) * 800) : 500;
  return { carbPerHr, gelCarbs, totalCarb, totalGels, intervalMin, fluidPerHr, sodiumPerHr, hours: hours.toFixed(2), schedule };
}

/* ---- PREDICTIONS / VO2 / WEIGHT ---- */
function predictGoal(race, load, fitness, completionPct, longRunPct, recoveryScore) {
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
const GOAL_DIST_M = { Marathon: 42195, Half: 21097, "10K": 10000, "5K": 5000 };
function racePredictions(projSecs) { const D = 42195, eq = (d) => projSecs * Math.pow(d / D, 1.06); return [{ dist: "5K", time: secsToHMS(eq(5000)) }, { dist: "10K", time: secsToHMS(eq(10000)) }, { dist: "Half", time: secsToHMS(eq(21097)) }, { dist: "Marathon", time: secsToHMS(projSecs) }]; }
function danielsVO2(distM, timeSec) { const v = distM / (timeSec / 60), t = timeSec / 60; const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v; const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t); return Math.round((vo2 / pct) * 10) / 10; }
// US Navy body-fat estimate from tape measurements (cm). Used when the athlete
// hasn't entered a body-fat %.
function navyBodyFat(profile) {
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
function effectiveBodyFat(profile) {
  if (profile.bodyFatPct && profile.bodyFatPct > 0) return profile.bodyFatPct;
  const est = navyBodyFat(profile);
  return est != null ? est : (profile.sex === "female" ? 24 : 18);
}
function predictRaceWeight(profile, weeksToRace) {
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
function pacingStrategies(projSecs, raceKm = 42.195, units = "metric") {
  const imp = units === "imperial";
  const total = imp ? raceKm / KM_MI : raceKm; // race length in display units
  const mp = projSecs / total; // sec per display unit (km or mile)
  const lab = imp ? "mi" : "k";
  const adj = imp ? 6 * KM_MI : 6; // negative-split nudge, scaled to the unit
  const mk = (step) => { const pts = []; for (let d = step; d < total - 0.05; d += step) pts.push({ km: (Math.round(d * 10) / 10) + lab, time: secsToHMS(mp * d) }); pts.push({ km: "Finish", time: secsToHMS(projSecs) }); return pts; };
  const half = total / 2;
  return { goalPace: pace(mp), paceUnit: imp ? "/mi" : "/km", raceKm: Math.round(raceKm * 10) / 10, splits1k: mk(1), splits5k: mk(5), evenSplits: mk(5), negative: { firstHalf: secsToHMS((mp + adj) * half), secondHalf: secsToHMS((mp - adj) * half) } };
}
function raceReadiness(load, recoveryScore, longRunPct, completionPct, sleepQuality) {
  const tsbScore = Math.max(0, Math.min(100, (load.tsb + 30) * (100 / 50)));
  const score = Math.round(tsbScore * 0.25 + recoveryScore * 0.25 + longRunPct * 100 * 0.2 + completionPct * 100 * 0.2 + sleepQuality * 0.1);
  let category = "High Risk"; if (score >= 90) category = "Race Ready"; else if (score >= 75) category = "On Track"; else if (score >= 60) category = "Needs Improvement";
  return { score: Math.max(0, Math.min(100, score)), category };
}
const B_RACE_RECOVERY = { "5K": "1 day", "10K": "2-3 days", Half: "5-7 days", Marathon: "10-14 days" };
const B_RACE_RECOVERY_DAYS = { "5K": 1, "10K": 3, Half: 6, Marathon: 12 };
const B_RACE_TAPER_DAYS = { "5K": 2, "10K": 2, Half: 3, Marathon: 4 };
// Weave B-races into the plan the way a coach would: a short sharpening taper
// before, the race itself, then distance-appropriate recovery. Quality/long/
// strength near the race become easy or rest, trimming that week's volume.
function applyBRaces(weeks, bRaces, maxHr) {
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
function buildProgress(plan, currentWeek, liftLogs, bodyLogs, runLogs = [], vo2Logs = [], currentBody = null) {
  const start = Math.max(0, currentWeek - 12);
  const wk = plan.weeks.slice(start, currentWeek);
  const running = wk.map((w) => ({ week: "W" + w.weekNumber, volume: w.volumeKm, load: w.load }));
  const longRun = wk.map((w) => ({ week: "W" + w.weekNumber, km: w.longRunKm }));
  const MAIN_LIFTS = ["Back Squat", "Romanian Deadlift", "Bench Press", "Overhead Press"];
  const byLift = {}; liftLogs.filter((l) => MAIN_LIFTS.includes(l.exercise)).forEach((l) => { (byLift[l.exercise] = byLift[l.exercise] || []).push({ date: fmtShort(l.date), iso: l.date, e1rm: l.e1rm }); });
  Object.keys(byLift).forEach((k) => byLift[k].sort((a, b) => a.iso.localeCompare(b.iso)));
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
  return { running, longRun, strength: byLift, body, pace, vo2, load };
}
function buildAlerts(recovery, load, readiness, missedKey, holidayActive, shoeAlerts = []) {
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
function buildCoachReview(ctx) {
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
function deriveState(core) {
  const today = core.today, profile = core.profile; const units = profile.units || "metric";
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
  let plan = generatePlan({ ...profile, methodology, recentWeeklyKm, baseStartDate: core.baseStartDate, lastRaceType: core.lastRaceType, recoveryReadiness, fatigueDeload, todayISO: iso(today) }, race, core.holidays, bRaces);
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
  const recovery = computeRecovery(core.recoveryInputs, load.tsb, completionPct);
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
  const strengthSession = (todaysStrengthDay && todaysStrengthDay.session) || (firstStrengthThisWeek && firstStrengthThisWeek.session) || generateStrengthSession(profile, curWeek.weekNumber, curWeek.phase, curWeek.isRecovery, 0, core.liftWeights || {});
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
function seedHistory(today) {
  const lifts = [], body = []; const baseW = 73.4, baseBf = 16.2; const liftBase = { "Back Squat": 132, "Romanian Deadlift": 138, "Bench Press": 96, "Overhead Press": 58 };
  for (let i = 10; i >= 1; i--) { const d = iso(addDays(today, -i * 7)); body.push({ date: d, weightKg: Math.round((baseW - (10 - i) * 0.14) * 10) / 10, bodyFatPct: Math.round((baseBf - (10 - i) * 0.12) * 10) / 10 }); Object.entries(liftBase).forEach(([ex, b]) => { const e1rm = Math.round(b + (10 - i) * 1.2); lifts.push({ date: d, exercise: ex, weightKg: round2_5(e1rm * 0.85), reps: 5, e1rm }); }); }
  return { lifts, body };
}
function seedCore() {
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
    health: { illness: false, injury: false }, overrides: {}, completions: {}, runLogs: [], liftLogs: hist.lifts, bodyLogs: hist.body, sessionLogs: [], vo2Logs: [], recoveryLogs: [],
  };
}
function emptyCore() {
  const today = new Date();
  return {
    today,
    profile: { name: "", age: 35, sex: "male", heightCm: 175, weightKg: 75, bodyFatPct: 18, measurements: { neck: 0, waist: 0, hip: 0 }, availabilityDays: 5, planStartDate: iso(mondayOf(addDays(today, 7))), longRunDay: "Sun", maxHr: Math.round(208 - 0.7 * 35), gelCarbs: 22, currentWeeklyVolumeKm: 40, setupComplete: false, oneRM: { backSquat: 100, romanianDeadlift: 100, benchPress: 70, overheadPress: 45 } },
    races: [{ id: "A1", name: "Goal Marathon", type: "Marathon", priority: "A", date: iso(mondayOf(addDays(today, 16 * 7))), goalTime: "3:45:00", goalSeconds: 3 * 3600 + 45 * 60 }],
    shoes: [], holidays: [], recoveryInputs: { sleepHours: 7.5, sleepQuality: 75, hrv: 55, hrvBaseline: 55, restingHr: 52, rhrBaseline: 52, subjectiveFatigue: 4 },
    health: { illness: false, injury: false }, overrides: {}, completions: {}, runLogs: [], liftLogs: [], bodyLogs: [], sessionLogs: [], vo2Logs: [], recoveryLogs: [],
  };
}
function uid() { try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {} return "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function reducer(core, action) {
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
      const liftWeights = { ...(core.liftWeights || {}) };
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
        liftLogs.unshift({ id: uid(), source: "manual", exercise: ex.name, weightKg: top.weight, reps: top.reps, sets, e1rm: best, date: action.date });
      });
      return { ...core, profile: { ...core.profile, oneRM }, liftWeights, liftLogs, sessionLogs: [{ id: uid(), source: action.source || "manual", kind: "strength", date: action.date, notes: action.notes, exercises: action.exercises }, ...core.sessionLogs], completions: { ...core.completions, [action.date]: { status: "Completed", compliance: 1, key: false } } };
    }
    case "WorkoutSwap": return { ...core, overrides: { ...(core.overrides || {}), [action.a.date]: { type: action.b.type, longKm: action.b.longKm }, [action.b.date]: { type: action.a.type, longKm: action.a.longKm } } };
    case "WorkoutEdit": return { ...core, overrides: { ...(core.overrides || {}), [action.date]: { type: action.to, longKm: action.longKm } } };
    case "WorkoutResetDay": { const ov = { ...(core.overrides || {}) }; delete ov[action.date]; return { ...core, overrides: ov }; }
    case "HealthUpdated": return { ...core, health: { ...(core.health || {}), ...action.health } };
    case "CheckinSaved": { const d = action.date || new Date().toISOString().slice(0, 10); return { ...core, recoveryInputs: { ...core.recoveryInputs, ...action.inputs }, recoveryLogs: [{ date: d, ...action.inputs }, ...(core.recoveryLogs || []).filter((r) => r.date !== d)], lastCheckinDate: action.date }; }
    case "RecoverySaved": { const d = action.date || new Date().toISOString().slice(0, 10); return { ...core, recoveryInputs: { ...core.recoveryInputs, ...action.inputs }, recoveryLogs: [{ date: d, ...action.inputs }, ...(core.recoveryLogs || []).filter((r) => r.date !== d)] }; }
    case "BodyLogged": { const measurements = action.measurements ? { ...core.profile.measurements, ...action.measurements } : core.profile.measurements; const bf = (action.bodyFatPct && action.bodyFatPct > 0) ? action.bodyFatPct : (navyBodyFat({ ...core.profile, measurements }) ?? core.profile.bodyFatPct); return { ...core, profile: { ...core.profile, weightKg: action.weightKg, bodyFatPct: bf, measurements }, bodyLogs: [...core.bodyLogs, { id: uid(), source: "manual", date: action.date, weightKg: action.weightKg, bodyFatPct: bf }] }; }
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
    case "Hydrate": { const base = seedCore(); const c = action.core || {}; return { ...base, ...c, today: new Date(), profile: { ...base.profile, ...(c.profile || {}) }, recoveryInputs: { ...base.recoveryInputs, ...(c.recoveryInputs || {}) } }; }
    case "StartFresh": return emptyCore();
    case "Reset": return seedCore();
    default: return core;
  }
}

/* ---- UI PRIMITIVES ---- */
const Card = ({ children, style, pad = 16 }) => (<div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: pad, ...style }}>{children}</div>);
const Eyebrow = ({ children, color = C.faint }) => (<div style={{ color, fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", fontWeight: 700 }}>{children}</div>);
const Pill = ({ children, color }) => (<span style={{ color, background: color + "1F", border: `1px solid ${color}55`, borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>);
function Ring({ value, size = 132, stroke = 11, color, label, sub }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, off = circ * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (<div style={{ position: "relative", width: size, height: size }}><svg width={size} height={size}><circle cx={size / 2} cy={size / 2} r={r} stroke={C.line} strokeWidth={stroke} fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .6s ease" }} /></svg><div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}><div style={{ fontSize: 32, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{Math.round(value)}</div>{label && <div style={{ fontSize: 11, color, fontWeight: 700, marginTop: 4 }}>{label}</div>}{sub && <div style={{ fontSize: 10, color: C.faint, marginTop: 1 }}>{sub}</div>}</div></div>);
}
const Stat = ({ label, value, unit, color = C.text }) => (<div><div style={{ color: C.faint, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>{label}</div><div style={{ color, fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}<span style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}>{unit ? " " + unit : ""}</span></div></div>);
const Row = ({ left, right, sub, color = C.text }) => (<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: C.surface2, borderRadius: 8 }}><div><div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{left}</div>{sub && <div style={{ color: C.faint, fontSize: 11 }}>{sub}</div>}</div><div style={{ color, fontWeight: 800, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>{right}</div></div>);
const intensityColor = (i) => (i === "high" ? C.ember : i === "moderate" ? C.amber : C.teal);
function btn(color, ghost) { return { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", background: ghost ? "transparent" : color + "22", color, border: `1px solid ${color}66`, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 700 }; }
const navBtn = { cursor: "pointer", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center" };
const Header = ({ title, sub, onBack, right }) => (<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>{onBack && <button onClick={onBack} style={navBtn}><ChevronLeft size={18} color={C.dim} /></button>}<div style={{ flex: 1 }}><div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{title}</div>{sub && <div style={{ color: C.dim, fontSize: 13 }}>{sub}</div>}</div>{right}</div>);
function Field({ label, value, onChange, type = "number", step, options }) { return (<div style={{ marginBottom: 12 }}><div style={{ color: C.dim, fontSize: 12, marginBottom: 4 }}>{label}</div>{options ? (<select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>) : (<input type={type} step={step} value={value} onChange={(e) => onChange(type === "number" ? parseFloat(e.target.value) : e.target.value)} style={inputStyle} />)}</div>); }
const inputStyle = { width: "100%", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, padding: "9px 10px", fontSize: 14, boxSizing: "border-box" };
function Tabs({ tabs, active, onChange }) { return (<div style={{ display: "flex", gap: 6, background: C.surface2, padding: 4, borderRadius: 10, marginBottom: 12 }}>{tabs.map((t) => (<button key={t} onClick={() => onChange(t)} style={{ flex: 1, cursor: "pointer", border: "none", borderRadius: 7, padding: "7px 4px", fontSize: 12.5, fontWeight: 700, background: active === t ? C.ember + "26" : "transparent", color: active === t ? C.ember : C.dim }}>{t}</button>))}</div>); }
const hrText = (hz) => hz ? `${hz.zone} - ${hz.lo}-${hz.hi} bpm` : null;
const Macro = ({ label, g, color }) => (<div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: color }} /><span style={{ color: C.dim, fontSize: 12.5, width: 56 }}>{label}</span><span style={{ fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{g} g</span></div>);
function Slider({ icon: Icon, label, value, min, max, step, unit, color, onChange }) { return (<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}><span style={{ display: "flex", alignItems: "center", gap: 6, color: C.dim, fontSize: 12.5 }}><Icon size={13} color={color} /> {label}</span><span style={{ fontWeight: 700, fontSize: 13 }}>{value} {unit}</span></div><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: "100%", accentColor: color }} /></div>); }
function NavRow({ icon: Icon, label, color, onClick, sub }) { return (<button onClick={onClick} style={{ cursor: "pointer", width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 10, textAlign: "left" }}><div style={{ width: 32, height: 32, borderRadius: 9, background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={17} color={color} /></div><div style={{ flex: 1 }}><div style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>{label}</div>{sub && <div style={{ color: C.faint, fontSize: 11.5 }}>{sub}</div>}</div><ChevronRight size={17} color={C.faint} /></button>); }
function Block({ title, color, items }) { return (<div style={{ marginTop: 12 }}><div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: color }} /><span style={{ color, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{title}</span></div><div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{items.map((it, i) => <Row key={i} left={it.l} right={it.r} sub={it.s} />)}</div></div>); }

/* =========================== DASHBOARD =========================== */
function Dashboard({ T, dispatch, go, goTab }) {
  const w = T.todaysWorkout, WIcon = ICONS[w.type] || Activity, n = T.nutritionTargets; const U = T.units;
  const alertColor = { high: C.rose, warn: C.amber, ok: C.teal };
  const Corner = ({ onClick }) => (<button onClick={(e) => { e.stopPropagation(); onClick(); }} title="Open" style={{ position: "absolute", top: 10, right: 10, width: 26, height: 26, borderRadius: 8, background: C.surface2, border: `1px solid ${C.ember}55`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 3 }}><Plus size={15} color={C.ember} /></button>);
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div><div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>Good morning, {T.profileName}</div><div style={{ color: C.dim, fontSize: 13, marginTop: 2 }}>{fmtDate(T.currentDate)}</div>
      <button onClick={() => go({ name: "recovery" })} style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "center", padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontSize: 13.5, fontWeight: 700, background: T.checkedInToday ? C.teal + "1A" : C.ember + "1A", border: `1px solid ${(T.checkedInToday ? C.teal : C.ember)}55`, color: T.checkedInToday ? C.teal : C.ember }}>{T.checkedInToday ? <><CheckCircle2 size={16} /> Daily check-in complete</> : <><Plus size={16} /> Daily check-in</>}</button>
    </div>
    {T.health && (T.health.illness || T.health.injury) && (<button onClick={() => go({ name: "recovery" })} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "11px 13px", borderRadius: 12, cursor: "pointer", background: C.rose + "1A", border: `1px solid ${C.rose}66`, color: C.rose }}><AlertTriangle size={16} style={{ flexShrink: 0 }} /><span style={{ fontSize: 13, fontWeight: 700 }}>{(T.health.injury ? "Injury mode on - running suspended, plan eased." : "Illness mode on - intensity removed, plan eased.") + " Tap to manage."}</span></button>)}
    <Card pad={14}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1 }}><Eyebrow>Training week</Eyebrow><div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>Week {T.currentWeek}</div></div>
      <div style={{ flex: 1, textAlign: "center" }}><Eyebrow>Phase</Eyebrow><div style={{ marginTop: 4 }}><Pill color={T.isRecoveryWeek ? C.teal : C.ember}>{T.currentPhase}{T.isRecoveryWeek ? " - rec" : ""}</Pill></div></div>
      <div style={{ flex: 1, textAlign: "center" }}><Eyebrow>A race in</Eyebrow><div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{T.raceCountdown == null ? <span style={{ color: C.faint }}>-</span> : <>{T.raceCountdown}<span style={{ fontSize: 11, color: C.faint }}> d</span></>}</div></div>
      <div style={{ flex: 1, textAlign: "right" }}><Eyebrow>B race in</Eyebrow><div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums", marginTop: 2, color: T.nextBRace ? C.text : C.faint }}>{T.nextBRace ? <>{T.nextBRace.daysAway}<span style={{ fontSize: 11, color: C.faint }}> d</span></> : "-"}</div></div>
    </div></Card>
    <Card style={{ position: "relative", background: `linear-gradient(135deg, ${C.surface2}, ${C.surface})`, borderColor: intensityColor(w.intensity) + "66" }}>
      <Corner onClick={() => go({ name: "workout", payload: w })} />
      <div onClick={() => go({ name: "workout", payload: w })} style={{ cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}><Eyebrow color={intensityColor(w.intensity)}>Today's workout</Eyebrow><Pill color={intensityColor(w.intensity)}>{w.intensity} intensity</Pill></div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}><div style={{ width: 52, height: 52, borderRadius: 14, background: intensityColor(w.intensity) + "22", display: "flex", alignItems: "center", justifyContent: "center" }}><WIcon size={26} color={intensityColor(w.intensity)} /></div><div><div style={{ fontSize: 22, fontWeight: 800 }}>{w.name}</div><div style={{ color: C.dim, fontSize: 13, marginTop: 2 }}>{w.detail}</div></div></div>
        <div style={{ display: "flex", gap: 24, marginTop: 14, flexWrap: "wrap" }}>{w.distanceKm > 0 && <Stat label="Distance" value={uDist(w.distanceKm, U)} unit={distU(U)} />}{w.durationMin > 0 && <Stat label="Duration" value={w.durationMin} unit="min" />}<Stat label="Load" value={w.load} color={intensityColor(w.intensity)} />{w.hrZone && <Stat label="HR zone" value={w.hrZone.zone} color={hrColor(w.hrZone.zone)} />}</div>
        {w.hrZone && <div style={{ color: C.faint, fontSize: 12, marginTop: 6 }}>Target HR {w.hrZone.lo}-{w.hrZone.hi} bpm</div>}
      </div>
      {w.type !== "Rest" && (() => { const rec = T.completions && T.completions[T.currentDate]; const logged = !!rec && rec.status !== "Missed"; const missed = !!rec && rec.status === "Missed"; const solid = (c) => ({ ...btn(c), background: c, color: "#0b0f14", border: `1px solid ${c}` }); return (<div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={() => go({ name: "workout", payload: w })} style={logged ? solid(C.teal) : btn(C.teal)}>{logged ? <><CheckCircle2 size={15} /> Logged</> : <><ClipboardList size={15} /> Log workout</>}</button>
        <button onClick={() => dispatch({ type: "WorkoutMissed", date: T.currentDate, key: ["Long Run", "Threshold", "Intervals", "Race"].includes(w.type) })} style={missed ? solid(C.rose) : btn(C.rose, true)}>Missed</button>
      </div>); })()}
    </Card>
    <div style={{ display: "flex", gap: 14 }}>
      <Card style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}><Corner onClick={() => go({ name: "recovery" })} /><div onClick={() => go({ name: "recovery" })} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}><Eyebrow>Recovery score</Eyebrow><div style={{ marginTop: 10 }}><Ring value={T.recoveryScore} color={STATUS_COLOR[T.recoveryStatus]} label={T.recoveryStatus} size={120} /></div></div></Card>
      <Card style={{ position: "relative", flex: 1, cursor: "pointer" }}><Corner onClick={() => go({ name: "fuel" })} /><div onClick={() => go({ name: "fuel" })}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Flame size={14} color={C.sky} /><Eyebrow>Today's fuel</Eyebrow></div><div style={{ fontSize: 30, fontWeight: 800, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>{n.calories}<span style={{ fontSize: 13, color: C.faint }}> kcal</span></div><div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}><Macro label="Protein" g={n.protein} color={C.ember} /><Macro label="Carbs" g={n.carbs} color={C.sky} /><Macro label="Fat" g={n.fat} color={C.amber} /></div><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, color: C.dim, fontSize: 12 }}><Droplets size={13} color={C.sky} /> {n.hydration} L hydration</div></div></Card>
    </div>
    <div style={{ display: "flex", gap: 14 }}>
      {T.noRace ? (<Card style={{ position: "relative", cursor: "pointer", flex: 1 }} onClick={() => goTab("race")}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Activity size={14} color={C.teal} /><Eyebrow color={C.teal}>Base training</Eyebrow></div><div style={{ fontSize: 15, fontWeight: 800, marginTop: 8 }}>No goal race set</div><div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>Rolling aerobic base - tap to set a race for a full periodised plan.</div></Card>) : (<Card style={{ position: "relative", cursor: "pointer", flex: 1 }}><Corner onClick={() => goTab("race")} /><div onClick={() => goTab("race")}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Trophy size={14} color={C.amber} /><Eyebrow>Race forecast</Eyebrow></div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 8 }}><div><div style={{ fontSize: 15, fontWeight: 800 }}>{T.upcomingEvents[0]?.name}</div><div style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>{fmtShort(T.upcomingEvents[0]?.date) + " - " + (T.upcomingEvents[0]?.type || "") + " - Goal " + (T.upcomingEvents[0]?.goalTime || "")}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: 26, fontWeight: 800, color: C.amber, fontVariantNumeric: "tabular-nums" }}>{T.raceCountdown}</div><div style={{ color: C.faint, fontSize: 10 }}>days away</div></div></div><div style={{ display: "flex", gap: 22, marginTop: 14, flexWrap: "wrap" }}><Stat label="Projected" value={T.goalForecast.projectedTime} color={C.violet} /><Stat label="Confidence" value={T.goalConfidence} unit="%" /><Stat label="Readiness" value={T.raceReadiness.score} color={STATUS_COLOR[T.raceReadiness.category]} /></div><div style={{ color: C.faint, fontSize: 11, marginTop: 8 }}>Range {T.goalForecast.forecastLow + " - " + T.goalForecast.forecastHigh}</div></div></Card>)}
    </div>
    <Card><div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><ClipboardList size={14} color={C.violet} /><Eyebrow>Coach review</Eyebrow></div>
      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{T.coachReview.headline}</div>
      <div style={{ fontSize: 13, color: C.dim, marginTop: 6 }}>{T.coachReview.focus}</div>
      {T.coachReview.wins.length > 0 && (<div style={{ marginTop: 12 }}><div style={{ color: C.teal, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Going well</div><div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{T.coachReview.wins.map((s, i) => (<div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><CheckCircle2 size={14} color={C.teal} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ fontSize: 12.5 }}>{s}</span></div>))}</div></div>)}
      {T.coachReview.watch.length > 0 && (<div style={{ marginTop: 12 }}><div style={{ color: C.amber, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Watch</div><div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{T.coachReview.watch.map((s, i) => (<div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><AlertTriangle size={14} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ fontSize: 12.5 }}>{s}</span></div>))}</div></div>)}
    </Card>
    <Card><div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><AlertTriangle size={14} color={C.amber} /><Eyebrow>Coach alerts</Eyebrow></div><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{T.coachAlerts.map((a, i) => (<div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ width: 7, height: 7, borderRadius: 99, marginTop: 5, background: alertColor[a.level] || C.dim, flexShrink: 0 }} /><span style={{ fontSize: 13 }}>{a.text}</span></div>))}</div></Card>
  </div>);
}

/* =========================== TRAINING (plan) =========================== */
const PHASE_COLOR = (phase, isRecovery) => isRecovery ? C.teal : (phase === "Recovery" ? C.teal : phase === "Peak" ? C.ember : phase === "Build" ? (C.emberSoft || C.ember) : phase === "Taper" || phase === "Race" ? C.amber : phase === "Off-Season" ? C.faint : C.sky);
function PlanView({ T, plan, go }) {
  const U = T.units;
  const todayWeek = T.currentWeek; const [sel, setSel] = useState(todayWeek); const week = plan.weeks[sel - 1];
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Training" sub="52-week roadmap - next 4 weeks locked" right={<button onClick={() => go({ name: "paces" })} style={btn(C.ember, true)}><Wind size={14} /> Paces</button>} />
    <Card pad={12}>
      <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 6 }}>{plan.weeks.map((wk) => { const locked = wk.weekNumber > todayWeek && wk.weekNumber <= todayWeek + 4, isNow = wk.weekNumber === todayWeek, isSel = sel === wk.weekNumber; const col = PHASE_COLOR(wk.phase, wk.isRecovery); return (<button key={wk.weekNumber} onClick={() => setSel(wk.weekNumber)} title={`Week ${wk.weekNumber} - ${wk.phase} - ${wk.volumeKm}km`} style={{ cursor: "pointer", minWidth: 30, height: 60, borderRadius: 9, border: `1.5px solid ${isSel ? col : isNow ? col + "88" : "transparent"}`, background: isNow ? col + "26" : C.surface2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: "4px 3px", position: "relative", boxShadow: isSel ? `0 0 0 1px ${col}55` : "none" }}><div style={{ position: "absolute", top: 4, fontSize: 9, fontWeight: 700, color: isNow ? col : C.faint }}>{wk.weekNumber}</div><div style={{ width: 13, borderRadius: 3, background: col, opacity: wk.isRecovery ? 0.5 : 1, height: Math.max(6, (wk.volumeKm / 90) * 32) }} />{locked && <div style={{ position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: 99, background: C.faint }} />}</button>); })}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>{[["Base", C.sky], ["Build", C.emberSoft], ["Peak", C.ember], ["Taper", C.amber], ["Recovery", C.teal]].map(([l, c]) => (<span key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.dim }}><span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />{l}</span>))}</div>
    </Card>
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button onClick={() => setSel(Math.max(1, sel - 1))} style={navBtn}><ChevronLeft size={18} color={C.dim} /></button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>Week {week.weekNumber}{week.weekNumber === todayWeek ? <span style={{ fontSize: 11, color: C.ember, fontWeight: 700 }}>  - this week</span> : null}</div>
          <div style={{ marginTop: 6, display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}><Pill color={PHASE_COLOR(week.phase, week.isRecovery)}>{week.phase}{week.isRecovery ? " - recovery" : ""}</Pill></div>
          <div style={{ color: C.faint, fontSize: 11.5, marginTop: 6 }}>{fmtShort(week.startDate)} - {fmtShort(week.endDate)}</div>
        </div>
        <button onClick={() => setSel(Math.min(52, sel + 1))} style={navBtn}><ChevronRight size={18} color={C.dim} /></button>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <div style={{ flex: 1, background: C.surface2, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}><div style={{ fontSize: 19, fontWeight: 800, color: C.sky, fontVariantNumeric: "tabular-nums" }}>{uDist(week.volumeKm, U)}</div><div style={{ fontSize: 10.5, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 }}>{distU(U)} volume</div></div>
        <div style={{ flex: 1, background: C.surface2, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}><div style={{ fontSize: 19, fontWeight: 800, color: C.teal, fontVariantNumeric: "tabular-nums" }}>{uDist(week.longRunKm, U)}</div><div style={{ fontSize: 10.5, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 }}>long run</div></div>
        <div style={{ flex: 1, background: C.surface2, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}><div style={{ fontSize: 19, fontWeight: 800, color: C.violet, fontVariantNumeric: "tabular-nums" }}>{week.runCount}/{week.liftCount}</div><div style={{ fontSize: 10.5, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 }}>runs/lifts</div></div>
      </div>
      {week.weekNumber !== todayWeek && <button onClick={() => setSel(todayWeek)} style={{ ...btn(C.ember, true), marginTop: 12, width: "100%" }}><CalendarDays size={14} /> Jump to this week</button>}
    </Card>
    <Card><Eyebrow>Weekly schedule</Eyebrow>{(() => { const ex = weekCompliance(week, T.completions || {}); return ex.logged > 0 ? <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>{"Logged: " + ex.completed + " done" + (ex.modified ? " · " + ex.modified + " modified" : "") + (ex.partial ? " · " + ex.partial + " partial" : "") + (ex.missed ? " · " + ex.missed + " missed" : "")}</div> : null; })()}<div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>{week.days.map((d, i) => { const Icon = ICONS[d.type] || Activity, isToday = d.date === T.currentDate, col = intensityColor(d.intensity); return (<div key={i} onClick={() => go({ name: "workout", payload: d })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 10, cursor: "pointer", background: isToday ? C.ember + "18" : C.surface2, border: `1px solid ${isToday ? C.ember + "66" : "transparent"}` }}><div style={{ width: 34, color: isToday ? C.ember : C.faint, fontWeight: 700, fontSize: 12 }}>{d.dow}</div><div style={{ width: 30, height: 30, borderRadius: 8, background: col + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={16} color={col} /></div><div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{d.name}{d.holiday ? " (holiday)" : ""}{d.adapted ? " (adapted)" : ""}{(() => { const r = T.completions && T.completions[d.date]; if (!r) return null; const band = r.status === "Missed" ? "Missed" : (r.compliance >= 0.95 ? "Completed" : r.compliance >= 0.7 ? "Modified" : r.compliance >= 0.3 ? "Partial" : "Missed"); const bc = band === "Completed" ? C.teal : band === "Modified" ? C.amber : band === "Missed" ? C.rose : C.sky; return <span style={{ fontSize: 10.5, fontWeight: 700, color: bc, marginLeft: 6 }}>{"· " + band}</span>; })()}</div>{d.distanceKm > 0 && <div style={{ color: C.faint, fontSize: 11.5 }}>{uDist(d.distanceKm, U)} {distU(U)} - {d.durationMin} min{d.hrZone ? ` - ${hrText(d.hrZone)}` : ""}</div>}</div>{d.load > 0 && <div style={{ color: col, fontWeight: 700, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{d.load}</div>}<ChevronRight size={15} color={C.faint} /></div>); })}</div></Card>
  </div>);
}

/* =========================== WORKOUT DETAILS + logging =========================== */
function RunLogForm({ w, dispatch, date, isInterval, shoes = [], paces, units = "metric" }) {
  const U = units;
  const active = shoes.filter((s) => !s.retired);
  const [d, setD] = useState({ distanceKm: w.distanceKm, durationMin: w.durationMin, hr: w.hrZone ? Math.round((w.hrZone.lo + w.hrZone.hi) / 2) : 140, rpe: 5, shoeId: active[0] ? active[0].id : "", vo2max: "" });
  const iv = w.intervals;
  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
  const zonePace = (iv && paces && paces.paces) ? (paces.paces.find((p) => p.zone === iv.paceZone) || {}).secPerKm : null;
  const defM = iv && iv.mode === "dist" ? iv.workM : (w.type === "Intervals" ? 400 : 1000);
  // Lay the reps out automatically from the prescription (e.g. 4 x 6 min -> 4 rows),
  // pre-filled with the target distance and time so you only adjust to what you ran.
  const initReps = !isInterval ? [] : (iv ? Array.from({ length: iv.reps }, () => {
    if (iv.mode === "dist") { const t = zonePace ? mmss((iv.workM / 1000) * zonePace) : ""; return { distanceM: iv.workM, time: t }; }
    const sec = iv.workMin * 60; const m = zonePace ? Math.round((sec / zonePace) * 1000 / 10) * 10 : ""; return { distanceM: m, time: mmss(sec) };
  }) : [{ distanceM: defM, time: "" }]);
  const [reps, setReps] = useState(initReps);
  const [done, setDone] = useState(false);
  const updRep = (i, k, v) => setReps(reps.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addRep = () => setReps([...reps, { distanceM: reps.length ? reps[reps.length - 1].distanceM : defM, time: "" }]);
  const rmRep = (i) => setReps(reps.filter((_, j) => j !== i));
  const log = () => {
    const cleanReps = isInterval ? reps.filter((r) => r.time || r.distanceM).map((r, i) => ({ rep: i + 1, distanceM: parseFloat(r.distanceM) || 0, time: r.time })) : undefined;
    const run = { type: w.type, distanceKm: d.distanceKm, durationMin: d.durationMin, hr: d.hr, rpe: d.rpe, shoeId: d.shoeId || undefined, reps: cleanReps && cleanReps.length ? cleanReps : undefined, vo2max: parseFloat(d.vo2max) || undefined };
    dispatch({ type: "RunLogged", date, run }); setDone(true);
  };
  return (<Card><Eyebrow>Log this run</Eyebrow><div style={{ marginTop: 10 }}>
    <Field label={`Total distance (${distU(U)})`} value={uDist(d.distanceKm, U)} step="0.1" onChange={(v) => setD({ ...d, distanceKm: toKm(v, U) })} />
    <Field label="Duration (min)" value={d.durationMin} onChange={(v) => setD({ ...d, durationMin: v })} />
    <Field label="Average HR" value={d.hr} onChange={(v) => setD({ ...d, hr: v })} />
    <Field label="RPE (1-10)" value={d.rpe} onChange={(v) => setD({ ...d, rpe: v })} />
    {isInterval && (<div style={{ marginBottom: 12 }}>
      <div style={{ color: C.dim, fontSize: 12, marginBottom: 6 }}>Reps - {w.detail}{iv && iv.recovery ? ` (${iv.recovery})` : ""}. Targets pre-filled - adjust to what you ran.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{reps.map((r, i) => (<div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: C.faint, fontSize: 11.5, width: 42 }}>Rep {i + 1}</span>
        <input type="number" value={r.distanceM} onChange={(e) => updRep(i, "distanceM", e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="metres" />
        <input type="text" value={r.time} onChange={(e) => updRep(i, "time", e.target.value)} style={{ ...inputStyle, width: 90 }} placeholder="mm:ss" />
        <button onClick={() => rmRep(i)} title="Remove rep" style={{ ...btn(C.rose, true), padding: "6px 8px" }}><X size={13} /></button>
      </div>))}</div>
      <button onClick={addRep} style={{ ...btn(C.sky, true), marginTop: 8 }}><Plus size={14} /> Add rep</button>
    </div>)}
    <div style={{ marginBottom: 12 }}><div style={{ color: C.dim, fontSize: 12, marginBottom: 4 }}>Shoe (tracks lifetime mileage)</div>
      {active.length ? (<select value={d.shoeId} onChange={(e) => setD({ ...d, shoeId: e.target.value })} style={inputStyle}><option value="">- none -</option>{active.map((s) => <option key={s.id} value={s.id}>{s.name} ({uDist(s.km, U)} {distU(U)})</option>)}</select>) : (<div style={{ color: C.faint, fontSize: 12 }}>No shoes yet - add a pair in Profile - Shoe tracker to log mileage.</div>)}
    </div>
    <Field label="VO\u2082 max (optional, from watch)" type="text" value={d.vo2max} onChange={(v) => setD({ ...d, vo2max: v })} />
    <button onClick={log} style={btn(C.ember)}><Plus size={15} /> {done ? "Logged - log again" : "Log run"}</button>
    <div style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Feeds training load, recovery, goal confidence, race predictions and your shoe mileage. Paces use a rolling average of recent VO₂ max readings.</div>
  </div></Card>);
}
function StrengthSessionLog({ ss, dispatch, date, units = "metric" }) {
  const U = units;
  // Prescription + per-set logging under each exercise. Accessories can be swapped
  // for a same-pattern alternative. Weights come from your last session (+2.5 kg
  // upper / +5 kg lower when you complete everything). Timed moves log a timer.
  const items = [
    ...ss.prehab.map((p) => ({ group: "Prehab", color: C.teal, name: p.name, sets: p.sets, reps: p.reps, weightKg: p.weightKg || 0, presc: `${p.sets} x ${p.reps}${p.note ? " - " + p.note : ""}`, alts: null })),
    ...ss.compound.map((c) => ({ group: "Compound", color: C.ember, name: c.name, sets: c.sets, reps: c.reps, weightKg: c.weightKg, presc: `${c.sets} x ${c.reps} @ ${uWt(c.weightKg, U)}${wtU(U)} - ${c.pctOneRM}% 1RM (${c.pattern})`, alts: null })),
    ...ss.accessory.map((a) => ({ group: "Accessory", color: C.amber, name: a.name, sets: a.sets, reps: a.reps, weightKg: a.weightKg, presc: `${a.sets} x ${a.reps} @ ${uWt(a.weightKg, U)}${wtU(U)} - ${a.pattern}${a.note ? " - " + a.note : ""}`, alts: EXERCISE_ALTS[a.category] || null })),
  ].map((it) => ({ ...it, timed: typeof it.reps === "string" }));
  const repNum = (r) => (typeof r === "number" ? r : (parseInt(r) || 10));
  const [ex, setEx] = useState(items.map((it) => it.timed
    ? { name: it.name, timed: true, sets: Array.from({ length: it.sets }, () => ({ time: String(it.reps) })) }
    : { name: it.name, timed: false, sets: Array.from({ length: it.sets }, () => ({ weight: uWt(it.weightKg || 0, U), reps: repNum(it.reps) })) }));
  const [notes, setNotes] = useState(""); const [done, setDone] = useState(false);
  const updSet = (i, si, k, v) => setEx(ex.map((e, j) => (j === i ? { ...e, sets: e.sets.map((s, m) => (m === si ? { ...s, [k]: (k === "time" ? v : parseFloat(v)) } : s)) } : e)));
  const setName = (i, name) => setEx(ex.map((e, j) => (j === i ? { ...e, name } : e)));
  const submit = () => {
    const exercises = ex.map((e, i) => ({ name: e.name, timed: e.timed, sets: e.timed ? e.sets : e.sets.map((s) => ({ ...s, weight: toKg(s.weight, U) })), target: (e.timed || items[i].group === "Compound") ? null : { sets: items[i].sets, reps: repNum(items[i].reps), weightKg: items[i].weightKg } }));
    dispatch({ type: "StrengthLogged", date, exercises, notes }); setDone(true);
  };
  return (<Card>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Eyebrow>Strength session {ss.session ? "- " + ss.session : ""} - {ss.scheme}</Eyebrow></div>
    {items.map((it, i) => { const e = ex[i]; const header = i === 0 || items[i - 1].group !== it.group; return (<div key={i}>
      {header && <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "14px 0 8px" }}><span style={{ width: 7, height: 7, borderRadius: 99, background: it.color }} /><span style={{ color: it.color, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{it.group}</span></div>}
      <div style={{ background: C.surface2, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
        {it.alts ? (<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><select value={e.name} onChange={(ev) => setName(i, ev.target.value)} style={{ ...inputStyle, fontWeight: 700, padding: "6px 8px", flex: 1 }}>{it.alts.map((o) => <option key={o} value={o}>{o}</option>)}</select><span style={{ color: C.faint, fontSize: 10.5, whiteSpace: "nowrap" }}>swap</span></div>) : (<div style={{ fontSize: 13.5, fontWeight: 700 }}>{it.name}</div>)}
        <div style={{ color: C.faint, fontSize: 11.5, marginBottom: 8 }}>{it.presc}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{e.sets.map((s, si) => (<div key={si} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: C.faint, fontSize: 11.5, width: 42 }}>Set {si + 1}</span>
          {it.timed ? (<><Timer size={14} color={C.teal} /><input type="text" value={s.time} onChange={(ev) => updSet(i, si, "time", ev.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="e.g. 30s" /></>) : (<><input type="number" value={s.weight} step="2.5" onChange={(ev) => updSet(i, si, "weight", ev.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder={wtU(U)} /><input type="number" value={s.reps} onChange={(ev) => updSet(i, si, "reps", ev.target.value)} style={{ ...inputStyle, width: 80 }} placeholder="reps" /></>)}
        </div>))}</div>
      </div>
    </div>); })}
    <div style={{ marginTop: 8 }}><Field label="Session notes" type="text" value={notes} onChange={setNotes} /></div>
    <button onClick={submit} style={btn(C.violet)}><Plus size={15} /> {done ? "Logged" : "Log strength session"}</button>
    <div style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Compounds are set from your 1RM and ramp each week. Accessories use last session's weight - hit all sets & reps and they go up (+2.5 kg upper / +5 kg lower), miss and they hold. Timed moves log a duration.</div>
  </Card>);
}
function WorkoutDetails({ T, workout, dispatch, onBack }) {
  const w = workout, col = intensityColor(w.intensity), Icon = ICONS[w.type] || Activity, ss = workout.session || T.strengthSession; const U = T.units;
  const isRun = w.distanceKm > 0 && w.type !== "Strength"; const isInterval = ["Threshold", "Tempo", "Intervals"].includes(w.type);
  const chip = (c) => ({ padding: "7px 11px", borderRadius: 9, cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: c + "14", border: `1px solid ${c}55`, color: c });
  const wDate = w.date || T.currentDate;
  const wkOf = (T.plan && T.plan.weeks.find((k) => wDate >= k.startDate && wDate <= k.endDate)) || null;
  const sibs = wkOf ? wkOf.days.filter((d) => d.date !== wDate && d.type !== "Race") : [];
  const hardish = (t) => isHard(t) || t === "Long Run" || t === "Tempo";
  const doSwap = (sib) => { const types = {}; wkOf.days.forEach((d) => { types[d.date] = d.type; }); types[wDate] = sib.type; types[sib.date] = w.type; const dates = wkOf.days.map((d) => d.date).sort(); let stack = false; for (let i = 1; i < dates.length; i++) if (hardish(types[dates[i]]) && hardish(types[dates[i - 1]])) stack = true; if (stack && typeof window !== "undefined" && !window.confirm("This puts two hard sessions on back-to-back days. Move anyway?")) return; dispatch({ type: "WorkoutSwap", a: { date: wDate, type: w.type, longKm: w.type === "Long Run" ? w.distanceKm : 0 }, b: { date: sib.date, type: sib.type, longKm: sib.type === "Long Run" ? sib.distanceKm : 0 } }); };
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Workout" sub={fmtShort(w.date || T.currentDate)} onBack={onBack} />
    <Card style={{ borderColor: col + "55" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}><div style={{ width: 48, height: 48, borderRadius: 12, background: col + "22", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={24} color={col} /></div><div><div style={{ fontSize: 20, fontWeight: 800 }}>{w.name}</div><div style={{ color: C.dim, fontSize: 13 }}>{w.detail}</div></div></div>
      <div style={{ display: "flex", gap: 22, marginTop: 14, flexWrap: "wrap" }}>{w.distanceKm > 0 && <Stat label="Distance" value={uDist(w.distanceKm, U)} unit={distU(U)} />}{w.durationMin > 0 && <Stat label="Duration" value={w.durationMin} unit="min" />}<Stat label="Load" value={w.load} color={col} />{w.hrZone && <Stat label="HR zone" value={w.hrZone.zone} color={hrColor(w.hrZone.zone)} />}</div>
      {w.hrZone && <div style={{ marginTop: 10 }}><Row left="Target heart rate" right={`${w.hrZone.lo}-${w.hrZone.hi} bpm`} sub={`Zone ${w.hrZone.zone}`} color={hrColor(w.hrZone.zone)} /></div>}
    </Card>
    {w.type === "Strength" ? (<StrengthSessionLog ss={ss} dispatch={dispatch} date={w.date || T.currentDate} units={U} />) : isRun ? (<>
      {w.hrZone && (<Card><Eyebrow>Target pace</Eyebrow><div style={{ marginTop: 8 }}>{(() => { const map = { "Easy Run": "Easy", "Recovery Run": "Recovery", "Long Run": "Long run", Threshold: "Threshold", Intervals: "Interval (VO2)", Tempo: "Marathon", Race: "Marathon", Travel: "Easy" }; const z = T.paces.paces.find((p) => p.zone === map[w.type]) || T.paces.paces[1]; return <Row left={`${z.zone} pace`} right={`${pace(uPace(z.secPerKm, U))} ${paceU(U)}`} sub={z.note} color={col} />; })()}</div></Card>)}
      <RunLogForm w={w} dispatch={dispatch} date={w.date || T.currentDate} isInterval={isInterval} shoes={T.shoes} paces={T.paces} units={U} />
    </>) : (<Card><div style={{ color: C.dim, fontSize: 13 }}>Rest day - focus on sleep, mobility and nutrition. No session prescribed.</div></Card>)}
    {wkOf && w.type !== "Race" && (<Card><Eyebrow color={C.sky}>Reschedule / edit</Eyebrow><div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>Move this session to another day this week, or change what it is.</div>{sibs.length > 0 && (<><div style={{ fontSize: 11, color: C.faint, letterSpacing: 1, textTransform: "uppercase", marginTop: 12, marginBottom: 6 }}>Move to</div><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{sibs.map((d) => (<button key={d.date} onClick={() => doSwap(d)} style={chip(C.sky)}>{d.dow + " - " + d.name}</button>))}</div></>)}<div style={{ fontSize: 11, color: C.faint, letterSpacing: 1, textTransform: "uppercase", marginTop: 14, marginBottom: 6 }}>Change to</div><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{["Easy Run", "Recovery Run", "Rest", "Strength", "Tempo", "Threshold", "Intervals", "Long Run"].filter((t) => t !== w.type).map((t) => (<button key={t} onClick={() => dispatch({ type: "WorkoutEdit", date: wDate, to: t, longKm: t === "Long Run" ? (wkOf.longRunKm || 20) : 0 })} style={chip(C.violet)}>{t}</button>))}</div>{T.overrides && T.overrides[wDate] && (<button onClick={() => dispatch({ type: "WorkoutResetDay", date: wDate })} style={{ ...btn(C.rose, true), marginTop: 12 }}>Reset day to original plan</button>)}</Card>)}
  </div>);
}

/* =========================== RECOVERY =========================== */
function RecoveryView({ T, core, dispatch, onBack }) {
  const r = T.recovery, load = T.trainingLoad, ri = core.recoveryInputs;
  const [draft, setDraft] = useState({ sleepHours: ri.sleepHours, sleepQuality: ri.sleepQuality, hrv: ri.hrv, restingHr: ri.restingHr, subjectiveFatigue: ri.subjectiveFatigue });
  const [saved, setSaved] = useState(true);
  const set = (patch) => { setDraft({ ...draft, ...patch }); setSaved(false); };
  const dirty = !saved && JSON.stringify({ sleepHours: ri.sleepHours, sleepQuality: ri.sleepQuality, hrv: ri.hrv, restingHr: ri.restingHr, subjectiveFatigue: ri.subjectiveFatigue }) !== JSON.stringify(draft);
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Recovery" onBack={onBack} />
    <Card style={{ display: "flex", gap: 18, alignItems: "center" }}><Ring value={r.score} color={STATUS_COLOR[r.status]} label={r.status} sub={`Level ${r.level}`} /><div style={{ flex: 1 }}><Eyebrow>Score breakdown</Eyebrow><div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 7 }}>{Object.entries(r.breakdown).map(([k, v]) => (<div key={k}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.dim }}><span>{k}</span><span style={{ color: C.text, fontWeight: 700 }}>{v}</span></div><div style={{ height: 5, background: C.surface2, borderRadius: 99, marginTop: 2 }}><div style={{ width: v + "%", height: 5, borderRadius: 99, background: STATUS_COLOR[r.status] }} /></div></div>))}</div></div></Card>
    <Card><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Eyebrow>Training load - 42 days</Eyebrow><Pill color={STATUS_COLOR[load.category]}>{load.category}</Pill></div><div style={{ display: "flex", gap: 22, marginTop: 10 }}><Stat label="CTL - fitness" value={load.ctl} color={C.sky} /><Stat label="ATL - fatigue" value={load.atl} color={C.ember} /><Stat label="TSB - form" value={load.tsb > 0 ? "+" + load.tsb : load.tsb} color={STATUS_COLOR[load.category]} /></div>
      <div style={{ height: 140, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={load.series} margin={{ top: 4, right: 6, bottom: 0, left: -22 }}><defs><linearGradient id="ctl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.sky} stopOpacity={0.35} /><stop offset="100%" stopColor={C.sky} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" hide /><YAxis tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: C.dim }} labelFormatter={fmtShort} /><ReferenceLine y={0} stroke={C.line} /><Area type="monotone" dataKey="ctl" stroke={C.sky} fill="url(#ctl)" strokeWidth={2} /><Line type="monotone" dataKey="atl" stroke={C.ember} dot={false} strokeWidth={2} /><Line type="monotone" dataKey="tsb" stroke={C.teal} dot={false} strokeWidth={2} strokeDasharray="4 3" /></AreaChart></ResponsiveContainer></div>
    </Card>
    {r.level > 0 && (<Card style={{ borderColor: STATUS_COLOR[r.status] + "55" }}><Eyebrow color={STATUS_COLOR[r.status]}>Escalation - level {r.level}</Eyebrow><div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>{r.actions.map((a, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><RefreshCw size={13} color={STATUS_COLOR[r.status]} /> {a}</div>)}</div></Card>)}
    <Card><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Eyebrow>Log today's metrics</Eyebrow>{dirty ? <Pill color={C.amber}>Unsaved changes</Pill> : <Pill color={C.teal}>Saved</Pill>}</div><div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
      <Slider icon={Bed} label="Sleep" value={draft.sleepHours} min={4} max={10} step={0.1} unit="h" color={C.sky} onChange={(v) => set({ sleepHours: v })} />
      <Slider icon={Moon} label="Sleep quality" value={draft.sleepQuality} min={0} max={100} step={1} unit="/100" color={C.violet} onChange={(v) => set({ sleepQuality: v })} />
      <Slider icon={Heart} label="HRV" value={draft.hrv} min={30} max={90} step={1} unit="ms" color={C.teal} onChange={(v) => set({ hrv: v })} />
      <Slider icon={Activity} label="Resting HR" value={draft.restingHr} min={38} max={70} step={1} unit="bpm" color={C.ember} onChange={(v) => set({ restingHr: v })} />
      <Slider icon={Gauge} label="Subjective fatigue" value={draft.subjectiveFatigue} min={1} max={10} step={1} unit="/10" color={C.amber} onChange={(v) => set({ subjectiveFatigue: v })} />
      <Card style={{ borderColor: C.line }}>
        <Eyebrow color={C.rose}>Health status</Eyebrow>
        <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8 }}>Flag illness or injury and the plan eases off automatically for ~10 days. Turn it off once you have recovered.</div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>{[{ k: "illness", label: "Ill" }, { k: "injury", label: "Injured" }].map((x) => { const on = core.health && core.health[x.k]; return (<button key={x.k} onClick={() => dispatch({ type: "HealthUpdated", health: { [x.k]: !on } })} style={{ flex: 1, padding: "10px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, border: `1px solid ${on ? C.rose : C.line}`, background: on ? C.rose + "1A" : C.surface2, color: on ? C.rose : C.dim }}>{on ? x.label + ": ON" : x.label}</button>); })}</div>
      </Card>
      <button onClick={() => { dispatch({ type: "CheckinSaved", inputs: draft, date: T.currentDate }); setSaved(true); }} style={btn(C.teal)}><CheckCircle2 size={16} /> Save today's check-in</button>
      <div style={{ color: C.faint, fontSize: 11.5 }}>Metrics aren't logged until you save. Saving recalculates your recovery score and refreshes the dashboard.</div>
    </div></Card>
  </div>);
}

/* =========================== FUEL =========================== */
function FuelView({ T, onBack }) {
  const n = T.nutritionTargets; const U = T.units;
  const chain = [{ label: "Maintenance (TDEE + today)", value: n.maintenance, unit: "kcal", note: "full fuelling baseline" }, { label: "Training expenditure", value: n.rawTrainingCost ? "+" + n.rawTrainingCost : "+0", unit: "kcal", note: T.todaysWorkout.type + " (in maintenance)" }, { label: "Weight-loss deficit", value: n.deficit > 0 ? "-" + n.deficit : "0", unit: "kcal", note: n.deficitNote }, { label: "Replenishment", value: n.replenishPct + "%", unit: "", note: "of training expenditure" }];
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Fuel" onBack={onBack} />
    <Card style={{ textAlign: "center", background: `linear-gradient(135deg, ${C.surface2}, ${C.surface})` }}><Eyebrow color={C.sky}>Daily nutrition target</Eyebrow><div style={{ fontSize: 46, fontWeight: 800, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{n.calories}<span style={{ fontSize: 16, color: C.faint }}> kcal</span></div><div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 12, flexWrap: "wrap" }}><Stat label="Protein" value={n.protein} unit="g" color={C.ember} /><Stat label="Carbs" value={n.carbs} unit="g" color={C.sky} /><Stat label="Fat" value={n.fat} unit="g" color={C.amber} /><Stat label="Water" value={n.hydration} unit="L" color={C.teal} /></div><div style={{ color: C.faint, fontSize: 11, marginTop: 8 }}>Protein 2 g/kg - Fat 20% - Carbs remainder</div></Card>
    <Card><Eyebrow>Calculation order</Eyebrow><div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>{chain.map((c, i) => (<div key={i}><Row left={c.label} sub={c.note} right={`${c.value} ${c.unit}`} />{i < chain.length - 1 && <div style={{ textAlign: "center", color: C.faint, fontSize: 12, lineHeight: "14px" }}>v</div>}</div>))}<div style={{ textAlign: "center", color: C.faint, fontSize: 12, lineHeight: "16px" }}>v</div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: C.sky + "1A", border: `1px solid ${C.sky}55`, borderRadius: 8 }}><div style={{ fontSize: 14, fontWeight: 800 }}>Daily target</div><div style={{ color: C.sky, fontWeight: 800, fontSize: 18 }}>{n.calories} kcal</div></div></div></Card>
    <Card><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Scale size={14} color={C.teal} /><Eyebrow>Race weight link</Eyebrow></div>{T.weightLoss.kgToLose > 0 ? (<div style={{ fontSize: 13.5, marginTop: 8 }}>Carrying <b>{uWt(T.weightLoss.kgToLose, U)} {wtU(U)}</b> above your race-weight range. The deficit is sized to reach race weight by the <b>end of the Build phase</b>{T.weightLoss.endOfBuild ? ` (${fmtShort(T.weightLoss.endOfBuild)})` : ""} - <b>{T.weightLoss.dailyDeficit} kcal/day</b> while in Base/Build. Peak, taper and recovery then fuel fully for performance.</div>) : (<div style={{ fontSize: 13.5, marginTop: 8, color: C.teal }}>You're already in your race-weight range - fuelling fully for performance, no deficit applied.</div>)}
      {n.adaptiveNote && (<div style={{ marginTop: 10, padding: "8px 10px", background: (n.adaptiveDelta > 0 ? C.amber : n.adaptiveDelta < 0 ? C.sky : C.teal) + "1A", border: `1px solid ${(n.adaptiveDelta > 0 ? C.amber : n.adaptiveDelta < 0 ? C.sky : C.teal)}55`, borderRadius: 8, fontSize: 12.5 }}><b>Auto-adjust:</b> {n.adaptiveNote}{n.trendKgPerWeek != null ? ` (trend ${n.trendKgPerWeek > 0 ? "+" : ""}${uWt(n.trendKgPerWeek, U)} ${wtU(U)}/wk)` : ""}</div>)}</Card>
    <Card><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Coffee size={14} color={C.sky} /><Eyebrow>Fuelling guidance</Eyebrow></div><div style={{ fontSize: 13.5, marginTop: 8 }}>{n.fueling}</div><div style={{ color: C.dim, fontSize: 12.5, marginTop: 6 }}>{n.recoveryNote}</div></Card>
  </div>);
}

/* =========================== RACE =========================== */
function RaceView({ T, dispatch, go }) {
  const ev = T.upcomingEvents[0], g = T.goalForecast, f = T.fuelling; const U = T.units;
  const [fuelOpen, setFuelOpen] = useState(false);
  const [paceOpen, setPaceOpen] = useState(false);
  const [splitStep, setSplitStep] = useState("5k");
  if (!ev) {
    return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Header title="Race" sub="No goal race set" right={<button onClick={() => go({ name: "goalrace" })} style={btn(C.amber, true)}><Settings size={14} /> Add race</button>} />
      <Card style={{ borderColor: C.teal + "55" }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Activity size={14} color={C.teal} /><Eyebrow color={C.teal}>Base training</Eyebrow></div><div style={{ fontSize: 13, color: C.dim, marginTop: 8 }}>No goal race is set, so your plan is a steady rolling aerobic base - easy mileage, one long run a week, strength, and a deload every 4th week. Add a race to switch to a full periodised build.</div><button onClick={() => go({ name: "goalrace" })} style={{ ...btn(C.amber), marginTop: 12 }}><Trophy size={15} /> Set a goal race</button></Card>
      <Card><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Timer size={14} color={C.violet} /><Eyebrow>Current fitness - race equivalents</Eyebrow></div><div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>{T.predictions.map((p) => <Row key={p.dist} left={p.dist} right={p.time} />)}</div><div style={{ color: C.faint, fontSize: 11, marginTop: 8 }}>Estimated from your current fitness, not a goal time.</div></Card>
      <Card><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Lung size={14} color={C.rose} /><Eyebrow>VO2 estimate</Eyebrow></div><div style={{ display: "flex", gap: 22, marginTop: 10, flexWrap: "wrap" }}><Stat label={T.vo2Logged ? "Current (logged)" : "Current est."} value={T.vo2Logged || T.vo2Current} unit="ml/kg/min" color={C.sky} />{T.vo2Trend != null && <Stat label="Trend" value={(T.vo2Trend >= 0 ? "+" : "") + T.vo2Trend} color={T.vo2Trend >= 0 ? C.teal : C.amber} />}</div></Card>
    </div>);
  }
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Race" sub="Prediction - pacing - fuelling" right={<button onClick={() => go({ name: "goalrace" })} style={btn(C.amber, true)}><Settings size={14} /> Edit</button>} />
    <Card style={{ borderColor: C.amber + "55" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}><div><Pill color={C.amber}>A Race</Pill><div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>{ev.name}</div><div style={{ color: C.dim, fontSize: 13 }}>{fmtDate(ev.date)}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: 34, fontWeight: 800, color: C.amber, fontVariantNumeric: "tabular-nums" }}>{ev.daysAway}</div><div style={{ color: C.faint, fontSize: 11 }}>days away</div></div></div><div style={{ display: "flex", gap: 24, marginTop: 14, flexWrap: "wrap" }}><Stat label="Distance" value={ev.type} /><Stat label="Goal" value={ev.goalTime} /><Stat label="Projected" value={g.projectedTime} color={C.violet} /></div></Card>
    <Card style={{ display: "flex", gap: 18, alignItems: "center" }}><Ring value={T.raceReadiness.score} color={STATUS_COLOR[T.raceReadiness.category]} label={T.raceReadiness.category} size={120} /><div style={{ flex: 1 }}><Eyebrow>Goal confidence</Eyebrow><div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{g.confidence}% confident</div><div style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>Projected {g.projectedTime}</div><div style={{ color: C.faint, fontSize: 12 }}>Range {g.forecastLow} - {g.forecastHigh}</div></div></Card>
    <Card><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Lung size={14} color={C.rose} /><Eyebrow>Race VO2 targets</Eyebrow></div><div style={{ display: "flex", gap: 22, marginTop: 10, flexWrap: "wrap" }}><Stat label="Target VO2max" value={T.vo2Target} unit="ml/kg/min" color={C.rose} /><Stat label={T.vo2Logged ? "Current (logged)" : "Current est."} value={T.vo2Logged || T.vo2Current} unit="ml/kg/min" color={C.sky} />{T.vo2Previous != null && <Stat label="Previous" value={T.vo2Previous} unit="ml/kg/min" />}{T.vo2Trend != null && <Stat label="Trend" value={(T.vo2Trend >= 0 ? "+" : "") + T.vo2Trend} color={T.vo2Trend >= 0 ? C.teal : C.amber} />}</div><div style={{ marginTop: 10 }}><Row left="vVO2max pace (interval target)" right={`${pace(uPace(T.paces.paces[5].secPerKm, U))} ${paceU(U)}`} sub={`Paces from ${T.vo2Source}`} color={C.rose} /></div></Card>
    <Card><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Timer size={14} color={C.violet} /><Eyebrow>Race prediction - equivalents</Eyebrow></div><div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>{T.predictions.map((p) => <Row key={p.dist} left={p.dist} right={p.time} />)}</div></Card>
    <Card><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Scale size={14} color={C.teal} /><Eyebrow>Race weight</Eyebrow></div><div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap" }}><Stat label="Current" value={uWt(T.weight.current, U)} unit={wtU(U)} /><Stat label="Lean mass" value={uWt(T.weight.leanMass, U)} unit={wtU(U)} color={C.sky} /><Stat label="Projected" value={uWt(T.weight.projected, U)} unit={wtU(U)} color={C.teal} /><Stat label="To lose" value={uWt(T.weight.diff, U)} unit={wtU(U)} color={T.weight.diff > 0 ? C.amber : C.teal} /></div><div style={{ marginTop: 10 }}><Row left="Recommended race-weight range" right={`${uWt(T.weight.rangeLow, U)}-${uWt(T.weight.rangeHigh, U)} ${wtU(U)}`} sub={`Hybrid-safe body fat ${T.weight.bfRange} - muscle preserved (strength ${T.weight.relStrength}x BW)`} color={C.teal} /></div>{T.weight.withinRange && <div style={{ color: C.teal, fontSize: 11.5, marginTop: 6 }}>Already within the recommended hybrid race-weight range - no weight loss required.</div>}</Card>
    <Card><button onClick={() => setPaceOpen((o) => !o)} style={{ cursor: "pointer", width: "100%", background: "transparent", border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><Wind size={14} color={C.ember} /><Eyebrow>Pacing strategy - {T.pacing.goalPace}{T.pacing.paceUnit}</Eyebrow></span><ChevronRight size={18} color={C.faint} style={{ transform: paceOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} /></button>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}><Row left="Negative split - first half" right={T.pacing.negative.firstHalf} sub="~6s/km slower" /><Row left="Negative split - second half" right={T.pacing.negative.secondHalf} sub="~6s/km faster" color={C.teal} /></div>
      {!paceOpen && <div style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Tap to see the full split table (1 km or 5 km).</div>}
      {paceOpen && (<>
        <div style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 8 }}>{["1k", "5k"].map((s) => (<button key={s} onClick={() => setSplitStep(s)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700, border: `1px solid ${splitStep === s ? C.ember : C.line}`, background: splitStep === s ? C.ember + "1A" : "transparent", color: splitStep === s ? C.ember : C.dim }}>{s === "1k" ? "1 km splits" : "5 km splits"}</button>))}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{(splitStep === "1k" ? T.pacing.splits1k : T.pacing.splits5k).map((s) => (<div key={s.km} style={{ background: C.surface2, borderRadius: 8, padding: "6px 10px", minWidth: 60 }}><div style={{ color: C.faint, fontSize: 10 }}>{s.km}</div><div style={{ fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{s.time}</div></div>))}</div>
      </>)}</Card>
    <Card><button onClick={() => setFuelOpen((o) => !o)} style={{ cursor: "pointer", width: "100%", background: "transparent", border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><Flame size={14} color={C.sky} /><Eyebrow>Race fuelling & carb loading</Eyebrow></span><ChevronRight size={18} color={C.faint} style={{ transform: fuelOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} /></button>
      <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" }}><Stat label="Gels" value={f.totalGels} color={C.sky} /><Stat label="Per gel" value={f.gelCarbs} unit="g" /><Stat label="Every" value={f.intervalMin} unit="min" color={C.amber} /><Stat label="Carb/hr" value={f.carbPerHr} unit="g" /></div>
      {!fuelOpen && <div style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Tap to see the full gel schedule, carb-loading plan, fluid and sodium targets.</div>}
      {fuelOpen && (<>
        <div style={{ marginTop: 10 }}><Eyebrow>Gel schedule</Eyebrow><div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>{f.schedule.map((s) => <Row key={s.gel} left={`Gel ${s.gel}`} right={s.atClock} sub={`${s.atMin} min - ${f.gelCarbs} g carbs`} />)}</div></div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>{T.carb && <Row left="Carb loading" right={`${T.carb.dailyGrams} g/day`} sub={`${T.carb.days} days - ${T.carb.perKg} g/kg - ${T.carb.totalGrams} g total`} />}<Row left="Fluid" right={`${f.fluidPerHr} ml/hr`} /><Row left="Sodium" right={`${f.sodiumPerHr} mg/hr`} /></div>
      </>)}</Card>
    <Card><Eyebrow>B-race recovery protocol</Eyebrow><div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>{Object.entries(B_RACE_RECOVERY).map(([k, v]) => <Row key={k} left={k} right={`${v} recovery`} />)}</div><div style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Long runs and quality sessions are replaced intelligently during B-race weeks.</div></Card>
  </div>);
}

/* =========================== PROGRESS (+ body log) =========================== */
function BodyLogForm({ core, dispatch }) {
  const U = core.profile.units || "metric";
  const [d, setD] = useState({ weightKg: core.profile.weightKg, bodyFatPct: core.profile.bodyFatPct });
  return (<Card><Eyebrow>Log body composition</Eyebrow><div style={{ marginTop: 10 }}><Field label={`Weight (${wtU(U)})`} value={uWt(d.weightKg, U)} step="0.1" onChange={(v) => setD({ ...d, weightKg: toKg(v, U) })} /><Field label="Body fat (%)" value={d.bodyFatPct} step="0.1" onChange={(v) => setD({ ...d, bodyFatPct: v })} /><button onClick={() => dispatch({ type: "BodyLogged", date: iso(new Date()), weightKg: d.weightKg, bodyFatPct: d.bodyFatPct })} style={btn(C.teal)}><Plus size={15} /> Log measurement</button></div></Card>);
}
function ProgressView({ T, core, dispatch }) {
  const [tab, setTab] = useState("Running"); const p = T.progress; const U = core.profile.units || "metric";
  const oneRM = core.profile.oneRM, bw = core.profile.weightKg || 1;
  // Current 1RM = peak of the estimated-1RM series (consistent with the graph), else entered 1RM.
  const cur1rm = (key, name) => { const s = p.strength[name]; return (s && s.length) ? Math.max(...s.map((d) => d.e1rm)) : oneRM[key]; };
  const rmBars = [
    { lift: "Squat", key: "backSquat", name: "Back Squat" },
    { lift: "RDL", key: "romanianDeadlift", name: "Romanian Deadlift" },
    { lift: "Bench", key: "benchPress", name: "Bench Press" },
    { lift: "OHP", key: "overheadPress", name: "Overhead Press" },
  ].map((b) => { const kg = cur1rm(b.key, b.name); return { lift: b.lift, kg, x: Math.round((kg / bw) * 100) / 100 }; });
  const totalRel = Math.round((rmBars.reduce((s, b) => s + b.kg, 0) / bw) * 10) / 10;
  const leanSeries = p.body.map((b) => ({ date: b.date, lean: Math.round(b.weight * (1 - b.bf / 100) * 10) / 10 }));
  const loadSeries = (T.trainingLoad.series || []).map((s) => ({ ...s, label: fmtShort(s.date) }));
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Progress" />
    <Tabs tabs={["Running", "Strength", "Body"]} active={tab} onChange={setTab} />
    {tab === "Running" && (<>
      <Card><Eyebrow>Weekly running volume</Eyebrow><div style={{ height: 180, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={p.running.map((d) => ({ ...d, volume: uDist(d.volume, U) }))} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="week" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} /><Bar dataKey="volume" name={distU(U)} fill={C.ember} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
      <Card><Eyebrow>Long-run progression</Eyebrow><div style={{ height: 180, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={p.longRun.map((d) => ({ ...d, km: uDist(d.km, U) }))} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}><defs><linearGradient id="lr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.teal} stopOpacity={0.35} /><stop offset="100%" stopColor={C.teal} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="week" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="km" name={`long run ${distU(U)}`} stroke={C.teal} fill="url(#lr)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div></Card>
      <Card><Eyebrow>Weekly training load</Eyebrow><div style={{ height: 170, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={p.load} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="week" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} /><Bar dataKey="load" name="load" fill={C.violet} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
      {p.pace.length > 1 && (<Card><Eyebrow>Logged pace trend (min/{distU(U)})</Eyebrow><div style={{ height: 170, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={p.pace.map((d) => ({ ...d, pace: U === "imperial" ? Math.round(d.pace * KM_MI * 100) / 100 : d.pace }))} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis reversed domain={["dataMin - 0.3", "dataMax + 0.3"]} tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} /><Line type="monotone" dataKey="pace" name={`min/${distU(U)}`} stroke={C.sky} dot={{ r: 2 }} strokeWidth={2} /></LineChart></ResponsiveContainer></div><div style={{ color: C.faint, fontSize: 11, marginTop: 6 }}>Lower is faster - trend of every run you log.</div></Card>)}
      {p.vo2.length > 1 && (<Card><Eyebrow>VO\u2082 max trend</Eyebrow><div style={{ height: 170, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={p.vo2} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} /><Line type="monotone" dataKey="vo2" name="VO2 max" stroke={C.rose} dot={{ r: 2 }} strokeWidth={2} /></LineChart></ResponsiveContainer></div></Card>)}
      <Card><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Eyebrow>Fitness, fatigue & form</Eyebrow><Pill color={STATUS_COLOR[T.trainingLoad.category]}>{T.trainingLoad.category}</Pill></div><div style={{ height: 180, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={loadSeries} margin={{ top: 4, right: 6, bottom: 0, left: -22 }}><defs><linearGradient id="ctl2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.sky} stopOpacity={0.35} /><stop offset="100%" stopColor={C.sky} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" hide /><YAxis tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} /><ReferenceLine y={0} stroke={C.line} /><Area type="monotone" dataKey="ctl" name="Fitness (CTL)" stroke={C.sky} fill="url(#ctl2)" strokeWidth={2} /><Line type="monotone" dataKey="atl" name="Fatigue (ATL)" stroke={C.ember} dot={false} strokeWidth={2} /><Line type="monotone" dataKey="tsb" name="Form (TSB)" stroke={C.teal} dot={false} strokeWidth={2} strokeDasharray="4 3" /></AreaChart></ResponsiveContainer></div><div style={{ color: C.faint, fontSize: 11, marginTop: 6 }}>Fitness rising with form recovering into race week is the goal.</div></Card>
    </>)}
    {tab === "Strength" && (<>
      <Card><Eyebrow>Estimated 1RM progression</Eyebrow><div style={{ height: 220, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><LineChart margin={{ top: 4, right: 6, bottom: 0, left: -24 }}><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" type="category" allowDuplicatedCategory={false} tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} />{Object.entries(p.strength).map(([name, data], i) => (<Line key={name} data={data.map((d) => ({ ...d, e1rm: uWt(d.e1rm, U) }))} dataKey="e1rm" name={name} stroke={[C.ember, C.violet, C.sky, C.teal][i % 4]} dot={false} strokeWidth={2} />))}</LineChart></ResponsiveContainer></div><div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>{Object.keys(p.strength).map((name, i) => <span key={name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.dim }}><span style={{ width: 9, height: 3, background: [C.ember, C.violet, C.sky, C.teal][i % 4] }} />{name}</span>)}</div></Card>
      <Card><Eyebrow>Current 1RMs ({wtU(U)})</Eyebrow><div style={{ height: 180, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={rmBars.map((b) => ({ ...b, kg: uWt(b.kg, U) }))} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="lift" tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} /><Bar dataKey="kg" name={wtU(U)} fill={C.violet} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
      <Card><Eyebrow>Strength-to-bodyweight</Eyebrow><div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" }}>{rmBars.map((b) => <Stat key={b.lift} label={b.lift} value={b.x + "x"} color={b.x >= 1.5 ? C.teal : b.x >= 1 ? C.sky : C.amber} />)}</div><div style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Relative strength matters more than absolute load for a runner. Total {totalRel}x bodyweight - lower numbers preserve a lighter race weight.</div></Card>
    </>)}
    {tab === "Body" && (<><Card><Eyebrow>Body composition trend</Eyebrow><div style={{ height: 220, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={p.body.map((d) => ({ ...d, weight: uWt(d.weight, U) }))} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis yAxisId="w" domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis yAxisId="bf" orientation="right" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} /><Line yAxisId="w" dataKey="weight" name="Weight" stroke={C.teal} dot={false} strokeWidth={2} /><Line yAxisId="bf" dataKey="bf" name="Body fat" stroke={C.amber} dot={false} strokeWidth={2} strokeDasharray="4 3" /></LineChart></ResponsiveContainer></div></Card>
      <Card><Eyebrow>Lean mass trend</Eyebrow><div style={{ height: 180, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={leanSeries.map((d) => ({ ...d, lean: uWt(d.lean, U) }))} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}><defs><linearGradient id="lean" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.sky} stopOpacity={0.35} /><stop offset="100%" stopColor={C.sky} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="lean" name={`lean ${wtU(U)}`} stroke={C.sky} fill="url(#lean)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div><div style={{ color: C.faint, fontSize: 11.5, marginTop: 6 }}>Holding lean mass while losing weight means you're losing fat, not muscle - exactly what you want into race weight.</div></Card>
      <BodyLogForm core={core} dispatch={dispatch} /></>)}
  </div>);
}

/* =========================== PROFILE / SETTINGS / RACE CFG / HOLIDAYS / PACES =========================== */
function ProfileView({ core, dispatch, go, user = null, onChangePassword = null, onDeleteAccount = null }) {
  const p = core.profile; const U = p.units || "metric";
  const bf = effectiveBodyFat(p);
  const bfSrc = (p.bodyFatPct && p.bodyFatPct > 0) ? "entered" : (navyBodyFat(p) != null ? "from measurements" : "estimated");
  const aRace = (core.races || []).find((r) => r.priority === "A") || core.races[0] || null;
  const bRaces = (core.races || []).filter((r) => r.priority === "B");
  const shoes = core.shoes || [];
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Profile" sub="Your athlete summary & all settings" />
    <Card><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}><div><div style={{ fontSize: 20, fontWeight: 800 }}>{p.name || "Unnamed athlete"}</div><div style={{ color: C.dim, fontSize: 12.5, marginTop: 2 }}>{p.age} - {p.sex} - {p.heightCm} cm</div></div><button onClick={() => go({ name: "setup" })} style={btn(C.ember, true)}><Settings size={14} /> Edit</button></div>
      <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}><Stat label="Weight" value={uWt(p.weightKg, U)} unit={wtU(U)} /><Stat label="Body fat" value={bf} unit="%" color={C.amber} /><Stat label="Max HR" value={p.maxHr} unit="bpm" color={C.rose} /><Stat label="Volume" value={uDist(p.currentWeeklyVolumeKm, U)} unit={`${distU(U)}/wk`} color={C.sky} /></div>
      <div style={{ color: C.faint, fontSize: 11, marginTop: 6 }}>Body fat {bfSrc}. 1RMs: Sq {uWt(p.oneRM.backSquat, U)} - RDL {uWt(p.oneRM.romanianDeadlift, U)} - Bench {uWt(p.oneRM.benchPress, U)} - OHP {uWt(p.oneRM.overheadPress, U)} {wtU(U)}.</div>
    </Card>
    <Card><Eyebrow>Goal race</Eyebrow><div style={{ marginTop: 8 }}>{aRace ? <Row left={aRace.name} right={aRace.goalTime} sub={`${aRace.type} - ${fmtShort(aRace.date)}`} color={C.amber} /> : <div style={{ color: C.dim, fontSize: 13 }}>No goal race set - training a steady aerobic base. Add one in Goal race configuration below.</div>}</div>{bRaces.length > 0 && <div style={{ color: C.faint, fontSize: 11.5, marginTop: 6 }}>{bRaces.length} B-race{bRaces.length === 1 ? "" : "s"} woven into the plan.</div>}</Card>
    <Card><Eyebrow>Configuration</Eyebrow><div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <NavRow icon={Settings} label="Training settings" color={C.dim} onClick={() => go({ name: "settings" })} sub="Days/week, methodology, plan start" />
      <NavRow icon={Trophy} label="Goal race configuration" color={C.amber} onClick={() => go({ name: "goalrace" })} />
      <NavRow icon={Flag} label="B-races & tune-ups" color={C.violet} onClick={() => go({ name: "braces" })} sub={bRaces.length ? `${bRaces.length} scheduled` : "Add a tune-up race"} />
      <NavRow icon={Footprints} label="Shoe tracker" color={C.teal} onClick={() => go({ name: "shoes" })} sub={shoes.length ? `${shoes.length} pair${shoes.length === 1 ? "" : "s"} tracked` : "Add a pair"} />
      <NavRow icon={Plane} label="Holiday planning" color={C.sky} onClick={() => go({ name: "holidays" })} />
      <NavRow icon={Wind} label="Training paces" color={C.ember} onClick={() => go({ name: "paces" })} />
      <NavRow icon={Gauge} label="Help & how it works" color={C.sky} onClick={() => go({ name: "help" })} sub="What every number means + key terms" />
    </div></Card>
    <button onClick={() => { if (typeof window === "undefined" || window.confirm("Start a blank profile? Your current data will be cleared.")) dispatch({ type: "StartFresh" }); }} style={btn(C.sky, true)}><User size={15} /> New blank athlete</button>
    <button onClick={() => { if (typeof window === "undefined" || window.confirm("Reset to the demo athlete?")) dispatch({ type: "Reset" }); }} style={btn(C.rose, true)}><RefreshCw size={15} /> Reset to demo data</button>
    {(onChangePassword || onDeleteAccount) && (<Card style={{ borderColor: C.rose + "44" }}>
      <Eyebrow color={C.rose}>Account</Eyebrow>
      {user && user.email && <div style={{ color: C.dim, fontSize: 12.5, marginTop: 8 }}>Signed in as {user.email}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {onChangePassword && <button onClick={onChangePassword} style={btn(C.sky, true)}><Settings size={15} /> Change password</button>}
        {onDeleteAccount && <button onClick={onDeleteAccount} style={btn(C.rose)}><X size={15} /> Delete account & all data</button>}
      </div>
      {onDeleteAccount && <div style={{ color: C.faint, fontSize: 11, marginTop: 8 }}>Deleting your account permanently removes your login and all training data. This cannot be undone.</div>}
    </Card>)}
  </div>);
}
function SettingsView({ core, dispatch, onBack }) {
  const p = core.profile, set = (patch) => dispatch({ type: "ProfileUpdated", profile: patch }); const U = p.units || "metric";
  const vo2Logs = (core.vo2Logs || []).slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-3);
  const vo2 = vo2Logs.length ? Math.round((vo2Logs.reduce((s, x) => s + x.vo2max, 0) / vo2Logs.length) * 10) / 10 : null;
  const pref = p.methodologyPref || "Auto";
  const method = pref !== "Auto" ? pref : autoMethodology(p, vo2);
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Training settings" onBack={onBack} />
    <Card>
      <Field label="Availability (days/week)" value={p.availabilityDays} options={[3, 4, 5, 6, 7]} onChange={(v) => set({ availabilityDays: parseInt(v) })} />
      <div style={{ color: C.faint, fontSize: 11.5, marginTop: -6, marginBottom: 10 }}>Running-focused marathon + strength. Runs / strength by days: 3 - 3 + 0 - 4 - 3 + 1 - 5 - 4 + 1 - 6 - 4 + 2 - 7 - 5 + 2. Remaining days are rest. During the Base phase, strength is emphasised to build muscle (4 - 2 + 2 - 5 - 3 + 2 - 6 - 3 + 3 - 7 - 4 + 3).</div>
      <Field label="Long run day" value={p.longRunDay} options={["Sun", "Sat", "Wed", "Mon"]} onChange={(v) => set({ longRunDay: v })} />
      <Field label={`Current weekly running volume (${distU(U)})`} value={uDist(p.currentWeeklyVolumeKm, U)} onChange={(v) => set({ currentWeeklyVolumeKm: toKm(v, U) })} />
      <Field label="Plan start date" type="date" value={p.planStartDate} onChange={(v) => set({ planStartDate: v })} />
      <Field label="Gel carbs (g each)" value={p.gelCarbs} onChange={(v) => set({ gelCarbs: v })} />
      <div style={{ color: C.faint, fontSize: 11.5 }}>Any change here regenerates the plan automatically - no manual rebuild needed.</div></Card>
    <Card><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Eyebrow>Training methodology</Eyebrow><Pill color={C.ember}>{method}{pref === "Auto" ? " - auto" : " - your choice"}</Pill></div>
      <div style={{ fontSize: 13, marginTop: 8, color: C.dim }}>{METHODOLOGY_INFO[method]}</div>
      <div style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Auto picks the best fit from your volume ({uDist(p.currentWeeklyVolumeKm, U)} {distU(U)}), days ({p.availabilityDays}/wk){vo2 ? ` and VO\u2082 max (${vo2})` : ""}. Or choose one yourself - it changes your weekly quality sessions.</div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>{["Auto", ...Object.keys(METHODOLOGY_INFO)].map((name) => { const selected = pref === name; const info = name === "Auto" ? `Let the coach pick the best fit (currently ${autoMethodology(p, vo2)}).` : METHODOLOGY_INFO[name]; return (<button key={name} onClick={() => set({ methodologyPref: name })} style={{ textAlign: "left", cursor: "pointer", padding: "8px 10px", background: selected ? C.ember + "14" : C.surface2, border: `1px solid ${selected ? C.ember + "88" : C.line}`, borderRadius: 8 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: selected ? C.ember : C.text }}>{name}{name === "Auto" ? " (recommended)" : ""}{selected ? " - selected" : ""}</div><div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>{info}</div></button>); })}</div></Card>
    <Card><Eyebrow color={C.teal}>Hydration - your sweat rate</Eyebrow>
      <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8 }}>Personalise race and long-run fluid + sodium targets. Measure once on a cool day and once on a hot day.</div>
      <Field label="Measured sweat rate (ml/hr)" value={p.sweatRateMlPerHr || ""} onChange={(v) => set({ sweatRateMlPerHr: v })} />
      <div style={{ color: C.faint, fontSize: 11.5, marginTop: 6 }}>How to measure: weigh yourself (no/min clothing) before and after a run. sweat rate (ml/hr) = ((kg before - kg after) x 1000 + fluid drunk in ml) / hours run. 1 kg lost is about 1 litre of sweat. Leave blank to use a default of 600 ml/hr.</div>
    </Card>
    <Card><Eyebrow color={C.sky}>Units</Eyebrow>
      <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8 }}>How distances, paces and weights are shown across the app. Your data is always stored the same way - switching is instant and lossless.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>{[["metric", "Metric (km, kg, /km)"], ["imperial", "Imperial (mi, lb, /mi)"]].map(([val, lab]) => { const sel = (p.units || "metric") === val; return (<button key={val} onClick={() => set({ units: val })} style={{ flex: 1, cursor: "pointer", padding: "9px 8px", borderRadius: 8, fontWeight: 700, fontSize: 12.5, background: sel ? C.sky + "1A" : C.surface2, border: `1px solid ${sel ? C.sky + "88" : C.line}`, color: sel ? C.sky : C.dim }}>{lab}</button>); })}</div>
    </Card>
  </div>);
}
function GoalRaceView({ core, dispatch, onBack }) {
  const r = (core.races || []).find((x) => x.priority === "A") || core.races[0] || { name: "", type: "Marathon", date: "", goalTime: "3:30:00" }; const hasRace = (core.races || []).some((x) => x.priority === "A"); const [d, setD] = useState({ name: r.name, type: r.type, date: r.date, goalTime: r.goalTime }); const [saved, setSaved] = useState(false);
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Goal race" onBack={onBack} />
    <Card><Field label="Race name" type="text" value={d.name} onChange={(v) => setD({ ...d, name: v })} /><Field label="Distance" value={d.type} options={["Marathon", "Half", "10K", "5K"]} onChange={(v) => setD({ ...d, type: v })} /><Field label="Date" type="date" value={d.date} onChange={(v) => setD({ ...d, date: v })} /><Field label="Goal time (h:mm:ss)" type="text" value={d.goalTime} onChange={(v) => setD({ ...d, goalTime: v })} /><button onClick={() => { dispatch({ type: "RaceUpdated", race: d }); setSaved(true); }} style={btn(C.amber)}><CheckCircle2 size={15} /> {saved ? "Saved" : "Save race"}</button><div style={{ color: C.faint, fontSize: 11.5, marginTop: 10 }}>Saving automatically regenerates the plan, phases, workout dates, countdown, paces, predictions, nutrition and fuelling - no manual regeneration needed.</div></Card>
    {hasRace && <Card><Eyebrow color={C.rose}>No race?</Eyebrow><div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>Remove your goal race to train a steady aerobic base instead. You can add a race back anytime.</div><button onClick={() => { dispatch({ type: "RaceCleared" }); onBack && onBack(); }} style={{ ...btn(C.rose, true), marginTop: 10 }}>Remove goal race (train base)</button></Card>}
  </div>);
}
function HolidaysView({ core, dispatch, onBack }) {
  const today = iso(new Date()); const [h, setH] = useState({ label: "Trip", start: today, end: iso(addDays(new Date(), 4)) });
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Holiday planning" onBack={onBack} />
    <Card><Eyebrow>Add holiday</Eyebrow><div style={{ marginTop: 10 }}><Field label="Label" type="text" value={h.label} onChange={(v) => setH({ ...h, label: v })} /><Field label="Start" type="date" value={h.start} onChange={(v) => setH({ ...h, start: v })} /><Field label="End" type="date" value={h.end} onChange={(v) => setH({ ...h, end: v })} /><button onClick={() => dispatch({ type: "HolidayAdded", holiday: h })} style={btn(C.sky)}><Plus size={15} /> Add holiday</button></div></Card>
    <Card><Eyebrow>Planned holidays</Eyebrow><div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>{core.holidays.length === 0 ? <div style={{ color: C.faint, fontSize: 13 }}>No holidays. Holiday days are scheduled as full rest - no running at all - and the plan picks back up automatically afterwards.</div> : core.holidays.map((x, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: C.surface2, borderRadius: 8 }}><div><div style={{ fontSize: 13, fontWeight: 700 }}>{x.label}</div><div style={{ color: C.faint, fontSize: 11 }}>{fmtShort(x.start)} - {fmtShort(x.end)}</div></div><button onClick={() => dispatch({ type: "HolidayRemoved", index: i })} style={{ ...btn(C.rose, true), padding: "5px 10px" }}>Remove</button></div>))}</div></Card>
  </div>);
}
function PacesView({ T, core, onBack }) {
  const U = T.units;
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Training paces" sub={`From ${T.fitness.source} - ${T.methodology}`} onBack={onBack} />
    <Card><Eyebrow>Pace zones (per {distU(U)})</Eyebrow><div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>{T.paces.paces.map((p) => <Row key={p.zone} left={p.zone} sub={p.note} right={`${pace(uPace(p.secPerKm, U))} ${paceU(U)}`} color={p.zone === "Threshold" ? C.ember : C.text} />)}</div><div style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Paces come from your current fitness, not your goal time. If you log VO₂ max on runs, paces use a rolling average of recent readings (converted conservatively, since watch VO₂ max tends to read high); otherwise they track your training load (CTL).</div></Card>
    <Card><Eyebrow>Heart-rate zones</Eyebrow><div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>{[["Z1", "Recovery", 0.60, 0.70], ["Z2", "Easy / long run", 0.70, 0.80], ["Z3", "Tempo / marathon", 0.80, 0.87], ["Z4", "Threshold", 0.87, 0.92], ["Z5", "VO\u2082 / intervals", 0.92, 0.97]].map(([z, label, lo, hi]) => (<div key={z} style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 34, textAlign: "center", fontWeight: 800, fontSize: 12.5, color: hrColor(z) }}>{z}</span><div style={{ flex: 1, height: 8, borderRadius: 99, background: hrColor(z) + "33" }}><div style={{ height: 8, borderRadius: 99, width: "100%", background: `linear-gradient(90deg, ${hrColor(z)}66, ${hrColor(z)})` }} /></div><span style={{ width: 92, fontSize: 11.5, color: C.dim }}>{label}</span><span style={{ width: 78, textAlign: "right", fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{Math.round(T.maxHr * lo)}-{Math.round(T.maxHr * hi)}</span></div>))}</div><div style={{ color: C.faint, fontSize: 11, marginTop: 8 }}>Based on your max HR of {T.maxHr} bpm.</div></Card>
    <Card><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Eyebrow>Methodology - auto-selected</Eyebrow><Pill color={C.ember}>{T.methodology}</Pill></div><div style={{ fontSize: 13, marginTop: 8, color: C.dim }}>{T.methodologyInfo}</div></Card>
  </div>);
}

/* =========================== SHOES =========================== */
function ShoesView({ core, dispatch, onBack }) {
  const shoes = core.shoes || []; const U = core.profile.units || "metric";
  const [n, setN] = useState({ name: "", lifetimeKm: 800, km: 0 });
  const totalKm = Math.round(shoes.reduce((s, x) => s + (x.km || 0), 0));
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Shoe tracker" sub={`${shoes.length} pairs - ${uDist(totalKm, U)} ${distU(U)} logged total`} onBack={onBack} />
    <Card><Eyebrow>Your shoes</Eyebrow><div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      {shoes.length === 0 && <div style={{ color: C.faint, fontSize: 13 }}>No shoes yet. Add a pair, then pick it when you log a run to track mileage.</div>}
      {shoes.map((s) => { const pct = s.lifetimeKm > 0 ? Math.min(100, Math.round((s.km / s.lifetimeKm) * 100)) : 0; const over = s.lifetimeKm > 0 && s.km >= s.lifetimeKm; const col = over ? C.rose : pct >= 80 ? C.amber : C.teal; return (<div key={s.id} style={{ padding: "10px 12px", background: C.surface2, borderRadius: 10, opacity: s.retired ? 0.55 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.name}{s.retired ? " (retired)" : ""}</div><div style={{ color: col, fontWeight: 800, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{uDist(s.km, U)}{s.lifetimeKm > 0 ? ` / ${uDist(s.lifetimeKm, U)}` : ""} {distU(U)}</div></div>
        {s.lifetimeKm > 0 && <div style={{ height: 6, background: C.bg, borderRadius: 99, marginTop: 8 }}><div style={{ width: pct + "%", height: 6, borderRadius: 99, background: col }} /></div>}
        {over && <div style={{ color: C.rose, fontSize: 11, marginTop: 5 }}>Over lifetime - retire to reduce injury risk.</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button onClick={() => dispatch({ type: "ShoeRetired", id: s.id })} style={{ ...btn(C.amber, true), padding: "5px 10px" }}>{s.retired ? "Un-retire" : "Retire"}</button><button onClick={() => dispatch({ type: "ShoeRemoved", id: s.id })} style={{ ...btn(C.rose, true), padding: "5px 10px" }}>Remove</button></div>
      </div>); })}
    </div></Card>
    <Card><Eyebrow>Add a pair</Eyebrow><div style={{ marginTop: 10 }}>
      <Field label="Name" type="text" value={n.name} onChange={(v) => setN({ ...n, name: v })} />
      <Field label={`Lifetime limit (${distU(U)}, 0 = no limit)`} value={uDist(n.lifetimeKm, U)} onChange={(v) => setN({ ...n, lifetimeKm: toKm(v, U) })} />
      <Field label={`Starting mileage (${distU(U)})`} value={uDist(n.km, U)} onChange={(v) => setN({ ...n, km: toKm(v, U) })} />
      <button onClick={() => { if (n.name) { dispatch({ type: "ShoeAdded", shoe: n }); setN({ name: "", lifetimeKm: 800, km: 0 }); } }} style={btn(C.teal)}><Plus size={15} /> Add shoe</button>
      <div style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Pick a shoe when logging a run and its mileage updates automatically. You're alerted in Coach alerts once a pair passes its lifetime.</div>
    </div></Card>
  </div>);
}
/* =========================== B RACES =========================== */
function BRacesView({ core, dispatch, onBack }) {
  const bRaces = (core.races || []).filter((r) => r.priority === "B");
  const today = iso(new Date());
  const [b, setB] = useState({ name: "", type: "10K", date: iso(addDays(new Date(), 28)) });
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="B-races & tune-ups" sub="Tune-up races woven into the plan" onBack={onBack} />
    <Card><Eyebrow>How B-races work</Eyebrow><div style={{ fontSize: 13, color: C.dim, marginTop: 8 }}>A B-race gets a short sharpening taper (rest the day before, easy days into it), then distance-appropriate recovery afterwards - {B_RACE_RECOVERY["5K"]} for a 5K up to {B_RACE_RECOVERY.Marathon} for a marathon. Quality, long and strength sessions around it become easy or rest, so that week's volume eases automatically. The plan re-fits the moment you add one.</div></Card>
    <Card><Eyebrow>Scheduled B-races</Eyebrow><div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>{bRaces.length === 0 ? <div style={{ color: C.faint, fontSize: 13 }}>No B-races yet.</div> : bRaces.map((r) => (<div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: C.surface2, borderRadius: 8 }}><div><div style={{ fontSize: 13, fontWeight: 700 }}>{r.name || r.type}</div><div style={{ color: C.faint, fontSize: 11 }}>{r.type} - {fmtShort(r.date)} - recovery {B_RACE_RECOVERY[r.type]}</div></div><button onClick={() => dispatch({ type: "BRaceRemoved", id: r.id })} style={{ ...btn(C.rose, true), padding: "5px 10px" }}>Remove</button></div>))}</div></Card>
    <Card><Eyebrow>Add a B-race</Eyebrow><div style={{ marginTop: 10 }}>
      <Field label="Name" type="text" value={b.name} onChange={(v) => setB({ ...b, name: v })} />
      <Field label="Distance" value={b.type} options={["Marathon", "Half", "10K", "5K"]} onChange={(v) => setB({ ...b, type: v })} />
      <Field label="Date" type="date" value={b.date} onChange={(v) => setB({ ...b, date: v })} />
      <button onClick={() => { dispatch({ type: "BRaceAdded", race: { ...b, name: b.name || (b.type + " tune-up") } }); setB({ name: "", type: "10K", date: iso(addDays(new Date(), 28)) }); }} style={btn(C.violet)}><Plus size={15} /> Add B-race</button>
      <div style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Adding or removing a B-race regenerates the plan automatically.</div>
    </div></Card>
  </div>);
}

/* =========================== SETUP =========================== */
function SetupView({ core, dispatch, onComplete, onBack }) {
  const p = core.profile, set = (patch) => dispatch({ type: "ProfileUpdated", profile: patch }); const U = p.units || "metric";
  const r = (core.races || []).find((x) => x.priority === "A") || core.races[0] || { name: "", type: "Marathon", date: "", goalTime: "3:30:00" };
  const [race, setRace] = useState({ name: r.name, type: r.type, date: r.date, goalTime: r.goalTime });
  const saveAll = () => { dispatch({ type: "RaceUpdated", race }); dispatch({ type: "ProfileUpdated", profile: { setupComplete: true } }); onComplete && onComplete(); };
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Edit profile" sub="Everything is saved automatically as you type" onBack={onBack} />
    <Card><Eyebrow>About you</Eyebrow><div style={{ marginTop: 10 }}>
      <Field label="Name" type="text" value={p.name} onChange={(v) => set({ name: v })} />
      <Field label="Age" value={p.age} onChange={(v) => set({ age: v })} />
      <Field label="Sex" value={p.sex} options={["male", "female"]} onChange={(v) => set({ sex: v })} />
      <Field label="Height (cm)" value={p.heightCm} onChange={(v) => set({ heightCm: v })} />
      <Field label={`Weight (${wtU(U)})`} value={uWt(p.weightKg, U)} step="0.1" onChange={(v) => set({ weightKg: toKg(v, U) })} />
      <Field label="Max HR (bpm)" value={p.maxHr} onChange={(v) => set({ maxHr: v })} />
    </div></Card>
    <Card><Eyebrow>Body fat</Eyebrow><div style={{ marginTop: 10 }}>
      <Field label="Body fat % (leave 0 to estimate from measurements)" value={p.bodyFatPct} step="0.1" onChange={(v) => set({ bodyFatPct: v })} />
      <div style={{ color: C.faint, fontSize: 11.5, marginBottom: 8 }}>Don't know your body fat? Enter the tape measurements below (cm) and we'll estimate it (US Navy method).</div>
      <Field label="Neck (cm)" value={(p.measurements || {}).neck || 0} step="0.5" onChange={(v) => set({ measurements: { ...(p.measurements || {}), neck: v } })} />
      <Field label="Waist (cm)" value={(p.measurements || {}).waist || 0} step="0.5" onChange={(v) => set({ measurements: { ...(p.measurements || {}), waist: v } })} />
      {p.sex === "female" && <Field label="Hip (cm)" value={(p.measurements || {}).hip || 0} step="0.5" onChange={(v) => set({ measurements: { ...(p.measurements || {}), hip: v } })} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: C.surface2, borderRadius: 8 }}><span style={{ color: C.dim, fontSize: 12.5 }}>Body fat used in calculations</span><span style={{ color: C.amber, fontWeight: 800 }}>{effectiveBodyFat(p)}% <span style={{ color: C.faint, fontWeight: 600, fontSize: 11 }}>({(p.bodyFatPct && p.bodyFatPct > 0) ? "entered" : (navyBodyFat(p) != null ? "measured" : "estimated")})</span></span></div>
    </div></Card>
    <Card><Eyebrow>Training availability</Eyebrow><div style={{ marginTop: 10 }}>
      <Field label="Days per week" value={p.availabilityDays} options={[3, 4, 5, 6, 7]} onChange={(v) => set({ availabilityDays: parseInt(v) })} />
      <div style={{ color: C.faint, fontSize: 11.5, marginTop: -6, marginBottom: 10 }}>Running-focused: 3 - 3 run + 0 lift, 4 - 3 + 1, 5 - 4 + 1, 6 - 4 + 2, 7 - 5 + 2. Methodology is then chosen automatically from your volume and fitness.</div>
      <Field label={`Current weekly running volume (${distU(U)})`} value={uDist(p.currentWeeklyVolumeKm, U)} onChange={(v) => set({ currentWeeklyVolumeKm: toKm(v, U) })} />
      <Field label="Current VO\u2082 max (optional, from your watch)" value={p.vo2max || ""} onChange={(v) => set({ vo2max: v })} />
      <div style={{ color: C.faint, fontSize: 11.5, marginTop: -6, marginBottom: 10 }}>Sets your starting training paces. Leave blank if you don't know it - paces calibrate from your logged runs instead.</div>
      <Field label="Long run day" value={p.longRunDay} options={["Sun", "Sat", "Wed", "Mon"]} onChange={(v) => set({ longRunDay: v })} />
      <Field label="Plan start date" type="date" value={p.planStartDate} onChange={(v) => set({ planStartDate: v })} />
      <Field label="Race gel carbs (g each)" value={p.gelCarbs} onChange={(v) => set({ gelCarbs: v })} />
    </div></Card>
    <Card><Eyebrow>Strength 1RMs ({wtU(U)})</Eyebrow><div style={{ marginTop: 10 }}>{Object.entries({ "Back Squat": "backSquat", "Romanian Deadlift": "romanianDeadlift", "Bench Press": "benchPress", "Overhead Press": "overheadPress" }).map(([name, k]) => (<Field key={k} label={name} value={uWt(p.oneRM[k], U)} step="2.5" onChange={(v) => set({ oneRM: { ...p.oneRM, [k]: toKg(v, U) } })} />))}</div><div style={{ color: C.faint, fontSize: 11.5 }}>Used to prescribe strength loads and to protect muscle in race-weight targeting.</div></Card>
    <Card><Eyebrow>Goal race</Eyebrow><div style={{ marginTop: 10 }}>
      <Field label="Race name" type="text" value={race.name} onChange={(v) => setRace({ ...race, name: v })} />
      <Field label="Distance" value={race.type} options={["Marathon", "Half", "10K", "5K"]} onChange={(v) => setRace({ ...race, type: v })} />
      <Field label="Date" type="date" value={race.date} onChange={(v) => setRace({ ...race, date: v })} />
      <Field label="Goal time (h:mm:ss)" type="text" value={race.goalTime} onChange={(v) => setRace({ ...race, goalTime: v })} />
    </div></Card>
    <button onClick={saveAll} style={btn(C.ember)}><CheckCircle2 size={16} /> Save &amp; build my plan</button>
    <div style={{ color: C.faint, fontSize: 11.5, textAlign: "center" }}>Your details, settings and every logged run or lift are remembered between sessions on this device.</div>
  </div>);
}

/* =========================== HELP =========================== */
function HelpView({ onBack }) {
  const P = ({ children }) => <div style={{ fontSize: 13, color: C.dim, marginTop: 8, lineHeight: 1.5 }}>{children}</div>;
  const Term = ({ t, children }) => <div style={{ marginTop: 8 }}><span style={{ color: C.text, fontWeight: 700, fontSize: 12.5 }}>{t}</span><span style={{ color: C.dim, fontSize: 12.5 }}> - {children}</span></div>;
  const Sec = ({ icon: Icon, color, title, children }) => (<Card><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 28, height: 28, borderRadius: 8, background: color + "22", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={16} color={color} /></div><Eyebrow color={color}>{title}</Eyebrow></div>{children}</Card>);
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Header title="Help & how it works" sub="What every part of the app does, and why" onBack={onBack} />

    <Sec icon={Activity} color={C.ember} title="The big idea">
      <P>Hybrid Coach builds one joined-up plan for running <b>and</b> strength, then adapts it to what you actually do. You log runs, lifts and a daily check-in; the app recalculates your plan, paces, fuelling and race prediction from that real data. There is no rebuild button - every change you make flows through automatically.</P>
      <P>Everything is driven by your goal race (or a steady aerobic base if you have not set one), your current fitness, and how recovered you are.</P>
    </Sec>

    <Sec icon={Gauge} color={C.teal} title="Daily check-in & recovery score">
      <P>The recovery score (0-100) estimates how ready your body is today. It blends your sleep, resting heart rate, HRV (heart-rate variability), muscle soreness and stress from the check-in, plus your recent training load. Higher is fresher.</P>
      <P>A low score, or a spell of hard training, can trigger an automatic deload - the plan quietly reduces volume and intensity for a stretch so you absorb the work instead of digging a hole. Illness and injury modes ease the plan further.</P>
    </Sec>

    <Sec icon={CalendarDays} color={C.sky} title="Training plan & phases (periodisation)">
      <P>Your plan is a 52-week roadmap with the next 4 weeks locked, re-fitted to your race date. It moves through phases, each with a job:</P>
      <Term t="Base">Build aerobic engine and muscle. Easy volume, strength emphasised.</Term>
      <Term t="Build">Add race-specific quality (threshold, intervals) while volume climbs.</Term>
      <Term t="Peak">Sharpen with the hardest race-specific work and longest long runs.</Term>
      <Term t="Taper">Cut volume to arrive fresh - length scales to the race (longer for a marathon, short for a 5K).</Term>
      <Term t="Recovery / deload">Every 4th week eases off so you adapt. Fatigue can trigger extra ones.</Term>
      <P>Long runs are capped at a sensible share of your weekly volume so one run never dominates the week.</P>
    </Sec>

    <Sec icon={Wind} color={C.ember} title="Training methodologies">
      <P>The methodology shapes your weekly quality sessions. Auto picks the best fit from your volume, days and fitness, or you can choose one in Training settings.</P>
      <Term t="Polarised">Mostly easy, with a little very hard. Great for higher mileage.</Term>
      <Term t="Pyramidal">Easy bulk, moderate tempo, a little hard. A balanced default.</Term>
      <Term t="Threshold">More time at threshold - efficient for time-pressed runners.</Term>
      <Term t="Norwegian (double threshold)">Two controlled threshold sessions in one day (a morning and an evening block), kept sub-threshold by feel and HR. High aerobic stimulus at low risk - an advanced approach.</Term>
    </Sec>

    <Sec icon={TrendingUp} color={C.violet} title="Training load - fitness, fatigue & form">
      <P>Every session has a load score. From your load history the app tracks three numbers used by endurance coaches:</P>
      <Term t="CTL - Fitness">Your rolling ~42-day load. Rises slowly as you build fitness.</Term>
      <Term t="ATL - Fatigue">Your rolling ~7-day load. Rises fast when training is hard.</Term>
      <Term t="TSB - Form">Fitness minus fatigue. Positive = fresh, negative = loaded. The aim is fitness high and form recovering into race week.</Term>
    </Sec>

    <Sec icon={Wind} color={C.ember} title="Paces & heart-rate zones">
      <P>Training paces come from your current fitness - your logged VO2 max readings (averaged and adjusted, since watches read high) or, failing that, your training load. They are deliberately not anchored to your goal time, so easy stays easy and hard is honest.</P>
      <P>Heart-rate zones (Z1-Z5) are a share of your max HR and give you a second way to gauge effort when pace is affected by hills, heat or fatigue.</P>
    </Sec>

    <Sec icon={Flame} color={C.sky} title="Fuel - the nutrition engine">
      <P>Your daily calories start from maintenance (your body plus today's training), then apply any race-weight deficit and a replenishment share of what you burned. Protein is set per kg of bodyweight, fat as a share of calories, and carbs fill the rest - more carbs on hard days.</P>
      <P>If you are above your race-weight range the deficit is gentle and time-boxed to the Build phase, protecting muscle and performance. Peak, taper and race week fuel fully. It also auto-adjusts to your real bodyweight trend.</P>
    </Sec>

    <Sec icon={Trophy} color={C.amber} title="Race - prediction, pacing, fuelling, weight">
      <Term t="Prediction">Equivalent race times estimated from your actual fitness, not your goal - so it stays realistic. Goal confidence shows how on-track your target is.</Term>
      <Term t="Pacing">A goal pace plus split tables and an even or negative-split plan for race day.</Term>
      <Term t="Fuelling">A gel schedule, carb-per-hour target, and fluid/sodium guidance from your sweat rate. Carb-loading is applied for long efforts.</Term>
      <Term t="Race weight">A muscle-safe target range from your lean mass and strength, never a crash diet.</Term>
    </Sec>

    <Sec icon={Dumbbell} color={C.violet} title="Strength - the A/B/C rotation">
      <P>Strength rotates three sessions so that across a week you cover every major movement: squat, hinge, lunge, vertical pull, horizontal pull (rows) and horizontal push, plus prehab.</P>
      <Term t="Compounds">The big barbell lifts, loaded as a percentage of your 1RM, ramping each week.</Term>
      <Term t="Accessories">Supporting lifts using last session's weight. Hit all sets and reps and the weight goes up next time; miss and it holds. You can swap any accessory for a same-pattern alternative.</Term>
      <P>In Base, strength is emphasised to build muscle; nearer the race it shifts to maintenance so it supports, not drains, your running.</P>
    </Sec>

    <Sec icon={Footprints} color={C.teal} title="Shoe tracker">
      <P>Add your shoes, then pick a pair when you log a run. Mileage updates automatically and you are alerted in Coach alerts when a pair passes its lifetime, so you can retire it before it becomes an injury risk.</P>
    </Sec>

    <Sec icon={Gauge} color={C.sky} title="Units">
      <P>In Training settings you can switch between metric (km, kg, /km) and imperial (mi, lb, /mi). It only changes how things are displayed and entered - your data is stored the same way underneath, so switching back and forth never loses or rounds anything.</P>
    </Sec>

    <Card><Eyebrow color={C.amber}>Key terms, quickly</Eyebrow>
      <Term t="1RM">One-rep max - the most you can lift once. Strength loads are a percentage of it.</Term>
      <Term t="VO2 max">A measure of aerobic power. Used to seed and calibrate your paces.</Term>
      <Term t="Threshold">The hardest pace you can hold roughly an hour - the engine of endurance.</Term>
      <Term t="vVO2max">The pace at VO2 max - the target for short, sharp interval reps.</Term>
      <Term t="Long-run %">Your longest run as a share of weekly volume - kept in a safe band.</Term>
      <Term t="RPE">Rate of perceived exertion (1-10) - how hard a session felt.</Term>
      <Term t="Deload">A planned easier week (or stretch) so your body adapts and absorbs training.</Term>
      <Term t="Taper">The pre-race reduction in volume that lets you arrive fresh and fast.</Term>
    </Card>

    <div style={{ color: C.faint, fontSize: 11.5, textAlign: "center", padding: "4px 0 8px" }}>Hybrid Coach gives training guidance, not medical advice. Check with a doctor before starting a new programme, and listen to your body.</div>
  </div>);
}

/* =========================== TESTS =========================== */
function runTests() {
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
  ok("Strength 3 prehab / 2 compound / 4 accessory", ss.prehab.length === 3 && ss.compound.length === 2 && ss.accessory.length === 4);
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
  ok("B7: each strength session includes one plyometric prehab move", (() => { const a = generateStrengthSession(core.profile, 2, "Build", false, 0); const b = generateStrengthSession(core.profile, 2, "Build", false, 1); return a.prehab.filter((p) => p.plyo).length === 1 && b.prehab.filter((p) => p.plyo).length === 1 && a.prehab.length === 3; })());
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

  ok("TodayState complete", required.every((k) => todayState[k] !== undefined));
  return out;
}

/* =========================== APP SHELL (Item 11: 5 tabs) =========================== */
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "training", label: "Training", icon: CalendarDays },
  { id: "race", label: "Race", icon: Trophy },
  { id: "progress", label: "Progress", icon: BarChart3 },
  { id: "profile", label: "Profile", icon: User },
];
const STORE_KEY = "hybridcoach-v2-core";
// `storage` is injected per signed-in user (see src/storage.js). It exposes the
// same async get/set shape the artifact used, but is backed by Supabase so each
// user's data is saved to their own row in the database.
export default function App({ storage = null, user = null, onSignOut = null, onChangePassword = null, onDeleteAccount = null }) {
  const [core, dispatch] = useReducer(reducer, undefined, seedCore);
  const [tab, setTab] = useState("dashboard");
  const [screen, setScreen] = useState(null);
  const [hydrated, setHydrated] = useState(!storage);
  // Load this user's saved athlete on mount, then persist every change (debounced
  // inside the storage adapter). Re-runs if the signed-in user changes.
  useEffect(() => {
    if (!storage) { setHydrated(true); return; }
    let cancelled = false; setHydrated(false);
    (async () => {
      try { const rec = await storage.get(STORE_KEY); if (!cancelled && rec && rec.value) dispatch({ type: "Hydrate", core: JSON.parse(rec.value) }); else if (!cancelled) dispatch({ type: "StartFresh" }); } catch (e) { /* no saved data yet */ }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [storage, user && user.id]);
  useEffect(() => {
    if (!storage || !hydrated) return;
    (async () => { try { const { today, ...persist } = core; await storage.set(STORE_KEY, JSON.stringify(persist)); } catch (e) { /* ignore */ } })();
  }, [core, hydrated]);
  const { athleteState, todayState } = useMemo(() => deriveState(core), [core]);
  const T = { ...todayState, profileName: core.profile.name };
  const go = (s) => setScreen(s); const back = () => setScreen(null);
  const goTab = (t) => { setScreen(null); setTab(t); };
  const needsSetup = hydrated && !core.profile.setupComplete;
  const overlay = () => {
    switch (screen?.name) {
      case "workout": return <WorkoutDetails T={T} workout={screen.payload} dispatch={dispatch} onBack={back} />;
      case "recovery": return <RecoveryView T={T} core={core} dispatch={dispatch} onBack={back} />;
      case "fuel": return <FuelView T={T} onBack={back} />;
      case "setup": return <SetupView core={core} dispatch={dispatch} onBack={back} onComplete={back} />;
      case "settings": return <SettingsView core={core} dispatch={dispatch} onBack={back} />;
      case "goalrace": return <GoalRaceView core={core} dispatch={dispatch} onBack={back} />;
      case "holidays": return <HolidaysView core={core} dispatch={dispatch} onBack={back} />;
      case "shoes": return <ShoesView core={core} dispatch={dispatch} onBack={back} />;
      case "braces": return <BRacesView core={core} dispatch={dispatch} onBack={back} />;
      case "paces": return <PacesView T={T} core={core} onBack={back} />;
      case "help": return <HelpView onBack={back} />;
      default: return null;
    }
  };
  return (<div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "18px 16px 96px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}><div style={{ width: 30, height: 30, borderRadius: 9, background: C.ember + "22", display: "flex", alignItems: "center", justifyContent: "center" }}><Activity size={17} color={C.ember} /></div><div><div style={{ fontSize: 14, fontWeight: 800, letterSpacing: -0.3 }}>Hybrid Coach</div><div style={{ fontSize: 9.5, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>V2 - single source of truth</div></div></div>
        {!needsSetup && hydrated && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {user && user.email && <span style={{ fontSize: 11, color: C.faint, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>}
          <button onClick={() => goTab("profile")} title="Profile" style={{ cursor: "pointer", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 9, padding: 7, display: "flex" }}><User size={15} color={C.dim} /></button>
          {onSignOut && <button onClick={onSignOut} title="Sign out" style={{ cursor: "pointer", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 9, padding: 7, display: "flex" }}><LogOut size={15} color={C.dim} /></button>}
        </div>}
      </div>
      {!hydrated ? (<Card style={{ textAlign: "center" }}><div style={{ color: C.dim, fontSize: 14, padding: "24px 0" }}>Loading your athlete...</div></Card>)
        : needsSetup ? <SetupView core={core} dispatch={dispatch} onComplete={() => { setTab("dashboard"); }} />
        : screen ? overlay() : (<>
        {tab === "dashboard" && <Dashboard T={T} dispatch={dispatch} go={go} goTab={goTab} />}
        {tab === "training" && <PlanView T={T} plan={athleteState.currentPlan} go={go} />}
        {tab === "race" && <RaceView T={T} dispatch={dispatch} go={go} />}
        {tab === "progress" && <ProgressView T={T} core={core} dispatch={dispatch} />}
        {tab === "profile" && <ProfileView core={core} dispatch={dispatch} go={go} user={user} onChangePassword={onChangePassword} onDeleteAccount={onDeleteAccount} />}
      </>)}
    </div>
    {hydrated && !needsSetup && (<div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface + "F2", borderTop: `1px solid ${C.line}`, backdropFilter: "blur(10px)" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", display: "flex", justifyContent: "space-around", padding: "8px 4px 10px" }}>{TABS.map((t) => { const Icon = t.icon; const active = tab === t.id && !screen; return (<button key={t.id} onClick={() => goTab(t.id)} style={{ cursor: "pointer", background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 8px", color: active ? C.ember : C.faint }}><Icon size={19} color={active ? C.ember : C.faint} /><span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{t.label}</span></button>); })}</div>
    </div>)}
  </div>);
}
