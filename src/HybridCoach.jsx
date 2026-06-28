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

import {
  ACCESSORY_START, B_RACE_RECOVERY, B_RACE_RECOVERY_DAYS, B_RACE_TAPER_DAYS, C, DAY_MS, DAY_SPLIT, DEFAULT_SESSION_KM, DOW_WD, EASY_KM,
  EXERCISE_ALTS, GOAL_DIST_M, HR_ZONE, HR_ZONE_COLOR, KG_LB, KM_MI, LONG_FRACTION, LOWER_CATS, MARATHON_BLOCK, MAX_DAILY_DEFICIT,
  METHODOLOGY_INFO, METHOD_QUALITY, MIN_LOSS_DEFICIT, PEAK_LONG, RACE_RECOVERY, REPLENISH, RUN_KCAL_PER_KG_KM, SCHEMA_VERSION, STATUS_COLOR, STRENGTH_LOAD,
  TAPER_LONG, THRESHOLD_VVO2_FRACTION, WD, WEEKDAY_MAX_KM, _d, _planCache, adaptForMissedKey, addDays, allDays, applyAdaptations,
  applyBRaces, applyOverrides, arrangeWeek, autoMethodology, buildAlerts, buildBlockMeta, buildCoachReview, buildProgress, buildVolumeProfile, buildWorkoutData,
  carbLoad, computeNutrition, computePaces, computeRecovery, computeTrainingLoad, danielsVO2, dayFor, deriveState, diffDays, distU,
  easyKmFor, effectiveBodyFat, emptyCore, estimateFitness, evaluateVariance, fmtDate, fmtShort, generatePlan, generatePlanMemo, generateStrengthSession,
  hrColor, hrZoneFor, isHard, iso, liftIncrement, measuredRecovery, migrateCore, mondayOf, navyBodyFat, numOr,
  pace, paceU, pacingStrategies, predictGoal, predictRaceWeight, raceFuelling, racePredictions, raceReadiness, recomputeWeeks, reducer,
  round2_5, runTests, sanitizeProfile, secsToHMS, seedCore, seedHistory, splitFor, splitForBase, stepIncrement, strengthLoad,
  strengthScheme, toKg, toKm, trainingCost, uDist, uPace, uWt, uid, uniquePerms, vo2ToThresholdPace,
  weekCompliance, weekFor, weekPenalty, weekSessions, weightTrendKgPerWeek, wtU,
} from "./engine";

const ICONS = { Rest: Bed, "Easy Run": Footprints, "Recovery Run": Footprints, "Long Run": Activity, Threshold: Zap, Intervals: Zap, Tempo: TrendingUp, Strength: Dumbbell, Race: Trophy, Travel: Plane };

/* ---- UI PRIMITIVES ---- */
const Card = ({ children, style, pad = 16 }) => (<div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: pad, ...style }}>{children}</div>);
const Eyebrow = ({ children, color = C.faint }) => (<div style={{ color, fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", fontWeight: 700 }}>{children}</div>);
const Pill = ({ children, color }) => (<span style={{ color, background: color + "1F", border: `1px solid ${color}55`, borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>);
function Ring({ value, size = 132, stroke = 11, color, label, sub }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, off = circ * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (<div role="img" aria-label={`${label || "Score"}: ${Math.round(value)} out of 100${sub ? ", " + sub : ""}`} style={{ position: "relative", width: size, height: size }}><svg width={size} height={size} aria-hidden="true"><circle cx={size / 2} cy={size / 2} r={r} stroke={C.line} strokeWidth={stroke} fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .6s ease" }} /></svg><div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}><div style={{ fontSize: 32, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{Math.round(value)}</div>{label && <div style={{ fontSize: 11, color, fontWeight: 700, marginTop: 4 }}>{label}</div>}{sub && <div style={{ fontSize: 10, color: C.faint, marginTop: 1 }}>{sub}</div>}</div></div>);
}
const Stat = ({ label, value, unit, color = C.text }) => (<div><div style={{ color: C.faint, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>{label}</div><div style={{ color, fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}<span style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}>{unit ? " " + unit : ""}</span></div></div>);
const Row = ({ left, right, sub, color = C.text }) => (<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: C.surface2, borderRadius: 8 }}><div><div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{left}</div>{sub && <div style={{ color: C.faint, fontSize: 11 }}>{sub}</div>}</div><div style={{ color, fontWeight: 800, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>{right}</div></div>);
const intensityColor = (i) => (i === "high" ? C.ember : i === "moderate" ? C.amber : C.teal);
function btn(color, ghost) { return { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", background: ghost ? "transparent" : color + "22", color, border: `1px solid ${color}66`, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 700 }; }
const navBtn = { cursor: "pointer", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center" };
const Header = ({ title, sub, onBack, right }) => (<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>{onBack && <button onClick={onBack} style={navBtn}><ChevronLeft size={18} color={C.dim} /></button>}<div style={{ flex: 1 }}><div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{title}</div>{sub && <div style={{ color: C.dim, fontSize: 13 }}>{sub}</div>}</div>{right}</div>);
function Field({ label, value, onChange, type = "number", step, options }) { return (<div style={{ marginBottom: 12 }}><div style={{ color: C.dim, fontSize: 12, marginBottom: 4 }}>{label}</div>{options ? (<select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>) : (<input type={type} step={step} value={value == null ? "" : value} onChange={(e) => { if (type !== "number") return onChange(e.target.value); const raw = e.target.value; if (raw === "") return onChange(""); const n = parseFloat(raw); onChange(Number.isFinite(n) ? n : value); }} style={inputStyle} />)}</div>); }
const inputStyle = { width: "100%", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, padding: "9px 10px", fontSize: 14, boxSizing: "border-box" };
function Tabs({ tabs, active, onChange }) { return (<div role="tablist" style={{ display: "flex", gap: 6, background: C.surface2, padding: 4, borderRadius: 10, marginBottom: 12 }}>{tabs.map((t) => (<button key={t} role="tab" aria-selected={active === t} onClick={() => onChange(t)} style={{ flex: 1, cursor: "pointer", border: "none", borderRadius: 7, padding: "7px 4px", fontSize: 12.5, fontWeight: 700, background: active === t ? C.ember + "26" : "transparent", color: active === t ? C.ember : C.dim }}>{t}</button>))}</div>); }
const hrText = (hz) => hz ? `${hz.zone} - ${hz.lo}-${hz.hi} bpm` : null;
const Macro = ({ label, g, color }) => (<div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: color }} /><span style={{ color: C.dim, fontSize: 12.5, width: 56 }}>{label}</span><span style={{ fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{g} g</span></div>);
function Slider({ icon: Icon, label, value, min, max, step, unit, color, onChange }) { return (<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}><span style={{ display: "flex", alignItems: "center", gap: 6, color: C.dim, fontSize: 12.5 }}><Icon size={13} color={color} /> {label}</span><span style={{ fontWeight: 700, fontSize: 13 }}>{value} {unit}</span></div><input type="range" aria-label={label} aria-valuetext={`${value} ${unit || ""}`.trim()} min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: "100%", accentColor: color }} /></div>); }
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
    ...ss.compound.map((c) => ({ group: "Compound", color: C.ember, name: c.name, sets: c.sets, reps: c.reps, weightKg: c.weightKg, presc: `${c.sets} x ${c.reps} @ ${uWt(c.weightKg, U)}${wtU(U)} - ${c.pctOneRM}% 1RM${c.rir != null ? ", " + c.rir + " RIR" : ""} (${c.pattern})`, alts: null })),
    ...ss.accessory.map((a) => ({ group: "Accessory", color: C.amber, name: a.name, sets: a.sets, reps: a.reps, weightKg: a.weightKg, presc: `${a.sets} x ${a.repRange || a.reps} @ ${uWt(a.weightKg, U)}${wtU(U)} - ${a.pattern}${a.note ? " - " + a.note : ""}`, alts: EXERCISE_ALTS[a.category] || null })),
  ].map((it) => ({ ...it, timed: typeof it.reps === "string" }));
  const repNum = (r) => (typeof r === "number" ? r : (parseInt(r) || 10));
  const [ex, setEx] = useState(items.map((it) => it.timed
    ? { name: it.name, timed: true, sets: Array.from({ length: it.sets }, () => ({ time: String(it.reps) })) }
    : { name: it.name, timed: false, sets: Array.from({ length: it.sets }, () => ({ weight: uWt(it.weightKg || 0, U), reps: repNum(it.reps) })) }));
  const [notes, setNotes] = useState(""); const [done, setDone] = useState(false);
  const [openGroups, setOpenGroups] = useState({ Prehab: false, Compound: true, Accessory: false });
  const updSet = (i, si, k, v) => setEx(ex.map((e, j) => (j === i ? { ...e, sets: e.sets.map((s, m) => (m === si ? { ...s, [k]: (k === "time" ? v : parseFloat(v)) } : s)) } : e)));
  const setName = (i, name) => setEx(ex.map((e, j) => (j === i ? { ...e, name } : e)));
  const submit = () => {
    const exercises = ex.map((e, i) => ({ name: e.name, timed: e.timed, sets: e.timed ? e.sets : e.sets.map((s) => ({ ...s, weight: toKg(s.weight, U) })), target: (e.timed || items[i].group === "Compound") ? null : { sets: items[i].sets, reps: repNum(items[i].reps), weightKg: items[i].weightKg } }));
    dispatch({ type: "StrengthLogged", date, exercises, notes }); setDone(true);
  };
  return (<Card>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Eyebrow>Strength session {ss.session ? "- " + ss.session : ""} - {ss.scheme}</Eyebrow></div>
    {ss.autoReg && (<div style={{ marginTop: 8, padding: "8px 10px", background: C.amber + "1A", border: `1px solid ${C.amber}55`, borderRadius: 8, fontSize: 11.5, color: C.amber, fontWeight: 600 }}>{ss.autoReg}</div>)}
    {(() => {
      const groups = []; items.forEach((it, i) => { const g = groups.find((x) => x.name === it.group); if (g) g.idx.push(i); else groups.push({ name: it.group, color: it.color, idx: [i] }); });
      return groups.map((g) => { const open = openGroups[g.name]; return (<div key={g.name}>
        <button onClick={() => setOpenGroups({ ...openGroups, [g.name]: !open })} style={{ cursor: "pointer", width: "100%", background: "transparent", border: "none", padding: 0, margin: "14px 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: g.color }} />
          <span style={{ color: g.color, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{g.name}</span>
          <span style={{ color: C.faint, fontSize: 11, fontWeight: 600 }}>{g.idx.length}</span>
          <ChevronRight size={16} color={C.faint} style={{ marginLeft: "auto", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
        </button>
        {open && g.idx.map((i) => { const it = items[i]; const e = ex[i]; return (
          <div key={i} style={{ background: C.surface2, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
            {it.alts ? (<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><select value={e.name} onChange={(ev) => setName(i, ev.target.value)} style={{ ...inputStyle, fontWeight: 700, padding: "6px 8px", flex: 1 }}>{it.alts.map((o) => <option key={o} value={o}>{o}</option>)}</select><span style={{ color: C.faint, fontSize: 10.5, whiteSpace: "nowrap" }}>swap</span></div>) : (<div style={{ fontSize: 13.5, fontWeight: 700 }}>{it.name}</div>)}
            <div style={{ color: C.faint, fontSize: 11.5, marginBottom: 8 }}>{it.presc}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{e.sets.map((s, si) => (<div key={si} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: C.faint, fontSize: 11.5, width: 42 }}>Set {si + 1}</span>
              {it.timed ? (<><Timer size={14} color={C.teal} /><input type="text" value={s.time} onChange={(ev) => updSet(i, si, "time", ev.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="e.g. 30s" /></>) : (<><input type="number" value={s.weight} step="2.5" onChange={(ev) => updSet(i, si, "weight", ev.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder={wtU(U)} /><input type="number" value={s.reps} onChange={(ev) => updSet(i, si, "reps", ev.target.value)} style={{ ...inputStyle, width: 80 }} placeholder="reps" /></>)}
            </div>))}</div>
          </div>); })}
      </div>); });
    })()}
    <div style={{ marginTop: 8 }}><Field label="Session notes" type="text" value={notes} onChange={setNotes} /></div>
    <button onClick={submit} style={btn(C.violet)}><Plus size={15} /> {done ? "Logged" : "Log strength session"}</button>
    <div style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Compounds are set from your 1RM and ramp each week, easing off when recovery is low. Accessories use double progression - work up to the top of the rep range across sessions, then the weight goes up (+2.5 kg upper / +5 kg lower). Timed moves log a duration.</div>
    {ss.pairingNote && <div style={{ color: C.faint, fontSize: 11, marginTop: 6 }}>{ss.pairingNote}</div>}
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
  const U = core.profile.units || "metric"; const pm = core.profile.measurements || {};
  const [draft, setDraft] = useState({ sleepHours: ri.sleepHours, sleepQuality: ri.sleepQuality, hrv: ri.hrv, restingHr: ri.restingHr, subjectiveFatigue: ri.subjectiveFatigue });
  const [wIn, setWIn] = useState({ weightKg: core.profile.weightKg || 0, neck: pm.neck || 0, waist: pm.waist || 0 });
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
        <Eyebrow color={C.teal}>Weigh-in</Eyebrow>
        <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8 }}>Recorded with your check-in to track your weight trend. Neck & waist are optional - add them to refine your body-fat estimate.</div>
        <div style={{ marginTop: 10 }}>
          <Field label={`Weight (${wtU(U)})`} value={uWt(wIn.weightKg, U)} step="0.1" onChange={(v) => { setWIn({ ...wIn, weightKg: toKg(v, U) }); setSaved(false); }} />
          <Field label="Neck - optional (cm)" value={wIn.neck || 0} step="0.5" onChange={(v) => { setWIn({ ...wIn, neck: v }); setSaved(false); }} />
          <Field label="Waist - optional (cm)" value={wIn.waist || 0} step="0.5" onChange={(v) => { setWIn({ ...wIn, waist: v }); setSaved(false); }} />
        </div>
      </Card>
      <Card style={{ borderColor: C.line }}>
        <Eyebrow color={C.rose}>Health status</Eyebrow>
        <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8 }}>Flag illness or injury and the plan eases off automatically for ~10 days. Turn it off once you have recovered.</div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>{[{ k: "illness", label: "Ill" }, { k: "injury", label: "Injured" }].map((x) => { const on = core.health && core.health[x.k]; return (<button key={x.k} onClick={() => dispatch({ type: "HealthUpdated", health: { [x.k]: !on } })} style={{ flex: 1, padding: "10px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, border: `1px solid ${on ? C.rose : C.line}`, background: on ? C.rose + "1A" : C.surface2, color: on ? C.rose : C.dim }}>{on ? x.label + ": ON" : x.label}</button>); })}</div>
      </Card>
      <button onClick={() => { dispatch({ type: "CheckinSaved", inputs: draft, date: T.currentDate }); if (wIn.weightKg > 0) { const meas = {}; if (wIn.neck > 0) meas.neck = wIn.neck; if (wIn.waist > 0) meas.waist = wIn.waist; dispatch({ type: "BodyLogged", date: T.currentDate, weightKg: wIn.weightKg, measurements: Object.keys(meas).length ? meas : undefined }); } setSaved(true); }} style={btn(C.teal)}><CheckCircle2 size={16} /> Save today's check-in</button>
      <div style={{ color: C.faint, fontSize: 11.5 }}>Metrics aren't logged until you save. Saving recalculates your recovery score, records your weigh-in, and refreshes the dashboard.</div>
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
  </div>);
}

/* =========================== PROGRESS =========================== */
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
      <Card><Eyebrow>Estimated 1RM progression</Eyebrow>{p.strengthLifts && p.strengthLifts.length && p.strengthSeries.length ? (<><div style={{ height: 220, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={p.strengthSeries.map((r) => { const o = { date: r.date }; p.strengthLifts.forEach((n) => { if (r[n] != null) o[n] = uWt(r[n], U); }); return o; })} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} />{p.strengthLifts.map((name, i) => (<Line key={name} type="monotone" dataKey={name} name={name} stroke={[C.ember, C.violet, C.sky, C.teal][i % 4]} dot={{ r: 2 }} strokeWidth={2} connectNulls />))}</LineChart></ResponsiveContainer></div><div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>{p.strengthLifts.map((name, i) => <span key={name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.dim }}><span style={{ width: 9, height: 3, background: [C.ember, C.violet, C.sky, C.teal][i % 4] }} />{name}</span>)}</div></>) : (<div style={{ color: C.faint, fontSize: 12.5, marginTop: 10 }}>Log your main barbell lifts (squat, deadlift, bench, overhead press) and your estimated 1RM trend will build here.</div>)}</Card>
      <Card><Eyebrow>Current 1RMs ({wtU(U)})</Eyebrow><div style={{ height: 180, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={rmBars.map((b) => ({ ...b, kg: uWt(b.kg, U) }))} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="lift" tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} /><Bar dataKey="kg" name={wtU(U)} fill={C.violet} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
      <Card><Eyebrow>Strength-to-bodyweight</Eyebrow><div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" }}>{rmBars.map((b) => <Stat key={b.lift} label={b.lift} value={b.x + "x"} color={b.x >= 1.5 ? C.teal : b.x >= 1 ? C.sky : C.amber} />)}</div><div style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Relative strength matters more than absolute load for a runner. Total {totalRel}x bodyweight - lower numbers preserve a lighter race weight.</div></Card>
    </>)}
    {tab === "Body" && (<><Card><Eyebrow>Body composition trend</Eyebrow><div style={{ height: 220, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={p.body.map((d) => ({ ...d, weight: uWt(d.weight, U) }))} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis yAxisId="w" domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis yAxisId="bf" orientation="right" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} /><Line yAxisId="w" dataKey="weight" name="Weight" stroke={C.teal} dot={false} strokeWidth={2} /><Line yAxisId="bf" dataKey="bf" name="Body fat" stroke={C.amber} dot={false} strokeWidth={2} strokeDasharray="4 3" /></LineChart></ResponsiveContainer></div></Card>
      <Card><Eyebrow>Lean mass trend</Eyebrow><div style={{ height: 180, marginTop: 12 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={leanSeries.map((d) => ({ ...d, lean: uWt(d.lean, U) }))} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}><defs><linearGradient id="lean" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.sky} stopOpacity={0.35} /><stop offset="100%" stopColor={C.sky} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="lean" name={`lean ${wtU(U)}`} stroke={C.sky} fill="url(#lean)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div><div style={{ color: C.faint, fontSize: 11.5, marginTop: 6 }}>Holding lean mass while losing weight means you're losing fat, not muscle - exactly what you want into race weight.</div></Card>
      <div style={{ color: C.faint, fontSize: 11.5, textAlign: "center", padding: "2px 4px" }}>Log your weight (and optional neck & waist) from the daily check-in to build these trends.</div></>)}
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
    <button onClick={() => { if (typeof window === "undefined") { dispatch({ type: "StartFresh" }); return; } if (!window.confirm("Reset all data?\n\nThis permanently clears your profile, training plan, recovery history, and every logged run and lift, then starts a fresh blank setup. Use this only to start over from scratch - it cannot be undone.")) return; if (!window.confirm("Are you sure? This wipes everything and cannot be undone.")) return; dispatch({ type: "StartFresh" }); }} style={btn(C.rose, true)}><RefreshCw size={15} /> Reset data</button>
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
  const saveAll = () => { dispatch({ type: "RaceUpdated", race }); dispatch({ type: "ProfileUpdated", profile: { ...sanitizeProfile(core.profile), setupComplete: true } }); onComplete && onComplete(); };
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
      <P>HyCo builds one joined-up plan for running <b>and</b> strength, then adapts it to what you actually do. You log runs, lifts and a daily check-in; the app recalculates your plan, paces, fuelling and race prediction from that real data. There is no rebuild button - every change you make flows through automatically.</P>
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

    <div style={{ color: C.faint, fontSize: 11.5, textAlign: "center", padding: "4px 0 8px" }}>HyCo gives training guidance, not medical advice. Check with a doctor before starting a new programme, and listen to your body.</div>
  </div>);
}

/* =========================== TESTS =========================== */

/* =========================== APP SHELL (Item 11: 5 tabs) =========================== */
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "training", label: "Training", icon: CalendarDays },
  { id: "race", label: "Race", icon: Trophy },
  { id: "progress", label: "Progress", icon: BarChart3 },
  { id: "profile", label: "Profile", icon: User },
];
const STORE_KEY = "hybridcoach-v2-core";
// Catches any render/derive crash so a single bad value can never leave the user on a
// blank screen. Offers reload, and (last resort) a clean reset.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { try { console.error("[HyCo] render error:", err, info); } catch (e) {} }
  render() {
    if (!this.state.err) return this.props.children;
    return (<div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 380, textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: C.rose + "22", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><AlertTriangle size={24} color={C.rose} /></div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Something went wrong</div>
        <div style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.5, marginBottom: 18 }}>The app hit an unexpected error. Your saved data is safe. Reloading usually fixes it.</div>
        <button onClick={() => { try { if (typeof window !== "undefined") window.location.reload(); } catch (e) {} }} style={{ ...btn(C.ember), width: "100%", justifyContent: "center", marginBottom: 10 }}><RefreshCw size={15} /> Reload</button>
        {this.props.onReset && (<button onClick={this.props.onReset} style={{ ...btn(C.rose, true), width: "100%", justifyContent: "center" }}>Reset this device's view</button>)}
      </div>
    </div>);
  }
}
function AppInner({ storage = null, user = null, onSignOut = null, onChangePassword = null, onDeleteAccount = null }) {
  const [core, dispatch] = useReducer(reducer, undefined, seedCore);
  const [tab, setTab] = useState("dashboard");
  const [screen, setScreen] = useState(null);
  const [hydrated, setHydrated] = useState(!storage);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  // Keep the app's notion of "today" fresh: a session left open across midnight (or
  // backgrounded for hours) refreshes the date when it regains focus, so the dashboard
  // never shows a stale day's workout.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tick = () => { try { if (iso(new Date()) !== iso(core.today)) dispatch({ type: "RefreshToday" }); } catch (e) {} };
    const onVis = () => { if (!document.hidden) tick(); };
    window.addEventListener("focus", tick); document.addEventListener("visibilitychange", onVis);
    const id = setInterval(tick, 60000);
    return () => { window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", onVis); clearInterval(id); };
  }, [core.today]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
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
    let cancelled = false; setSaveStatus("saving");
    (async () => { try { const { today, ...persist } = core; await storage.set(STORE_KEY, JSON.stringify(persist)); if (!cancelled) { setSaveStatus("saved"); setTimeout(() => { if (!cancelled) setSaveStatus("idle"); }, 1500); } } catch (e) { if (!cancelled) setSaveStatus("idle"); } })();
    return () => { cancelled = true; };
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
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}><svg width={30} height={30} viewBox="0 0 36 36" fill="none" style={{ flex: "0 0 auto" }}><rect width="36" height="36" rx="9" fill={C.ember} /><path d="M8 24.5 L15.5 15.5 L20.5 20 L28 10.5" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /><circle cx="28" cy="10.5" r="2.5" fill="#fff" /></svg><div><div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.4 }}>HyCo</div><div style={{ fontSize: 9.5, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Run. Lift. Perform.</div></div></div>
        {!needsSetup && hydrated && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(!online || saveStatus !== "idle") && <span aria-live="polite" style={{ fontSize: 10.5, fontWeight: 700, color: !online ? C.amber : C.teal, whiteSpace: "nowrap" }}>{!online ? "Offline - saved on device" : saveStatus === "saving" ? "Saving..." : "Saved"}</span>}
          {user && user.email && <span style={{ fontSize: 11, color: C.faint, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>}
          <button onClick={() => goTab("profile")} title="Profile" aria-label="Profile" style={{ cursor: "pointer", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 9, padding: 7, display: "flex" }}><User size={15} color={C.dim} /></button>
          {onSignOut && <button onClick={onSignOut} title="Sign out" aria-label="Sign out" style={{ cursor: "pointer", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 9, padding: 7, display: "flex" }}><LogOut size={15} color={C.dim} /></button>}
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
    {hydrated && !needsSetup && (<div role="tablist" aria-label="Main navigation" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface + "F2", borderTop: `1px solid ${C.line}`, backdropFilter: "blur(10px)" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", display: "flex", justifyContent: "space-around", padding: "8px 4px 10px" }}>{TABS.map((t) => { const Icon = t.icon; const active = tab === t.id && !screen; return (<button key={t.id} role="tab" aria-selected={active} aria-label={t.label} onClick={() => goTab(t.id)} style={{ cursor: "pointer", background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 8px", color: active ? C.ember : C.faint }}><Icon size={19} color={active ? C.ember : C.faint} /><span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{t.label}</span></button>); })}</div>
    </div>)}
  </div>);
}
// `storage` is injected per signed-in user (see src/storage.js): an async get/set backed
// by Supabase. The ErrorBoundary ensures a render/derive crash never leaves a blank screen.
export default function App(props) {
  return (<ErrorBoundary onReset={() => { try { if (props && props.storage) { /* keep cloud data; just reload UI */ } if (typeof window !== "undefined") window.location.reload(); } catch (e) {} }}>
    <AppInner {...props} />
  </ErrorBoundary>);
}

