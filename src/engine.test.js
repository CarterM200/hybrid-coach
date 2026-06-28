// Engine tests. The original hand-written harness (205 assertions) is ported in as
// individual Vitest cases so a regression names the exact failing rule. A few extra
// targeted unit tests cover the robustness work (sanitisation, migration, derive shape).
import { describe, test, expect } from "vitest";
import {
  runTests,
  sanitizeProfile,
  migrateCore,
  deriveState,
  reducer,
  seedCore,
  emptyCore,
  generatePlanMemo,
  iso,
  addDays,
} from "./engine";

describe("engine self-tests (ported harness)", () => {
  const results = runTests();
  test("every engine assertion passes", () => {
    const failed = results.filter((r) => !r.pass);
    expect(failed.map((f) => f.name + (f.detail ? ` — ${f.detail}` : ""))).toEqual([]);
  });
  // Also surface each as its own case for granular reporting.
  for (const r of results) {
    test(r.name, () => expect(r.pass, r.detail || "").toBe(true));
  }
});

describe("robustness", () => {
  test("sanitizeProfile clamps NaN / blank / out-of-range numbers", () => {
    const p = sanitizeProfile({ age: NaN, weightKg: "", heightCm: 9999, maxHr: NaN, oneRM: {}, measurements: {} });
    expect(Number.isFinite(p.age)).toBe(true);
    expect(Number.isFinite(p.weightKg)).toBe(true);
    expect(p.heightCm).toBeLessThanOrEqual(230);
    expect(Number.isFinite(p.oneRM.backSquat)).toBe(true);
    expect(Number.isFinite(p.maxHr)).toBe(true);
  });

  test("engine is NaN-proof: bad profile numbers never produce NaN output", () => {
    const poison = { ...seedCore(), profile: { ...seedCore().profile, weightKg: NaN, age: NaN, heightCm: NaN } };
    const { todayState } = deriveState(poison);
    expect(Number.isFinite(todayState.nutritionTargets.calories)).toBe(true);
    expect(Number.isFinite(todayState.paces.paces[1].secPerKm)).toBe(true);
  });

  test("migrateCore stamps a schema version and backfills log arrays", () => {
    const m = migrateCore({ profile: { weightKg: 80 } });
    expect(typeof m.schemaVersion).toBe("number");
    expect(Array.isArray(m.runLogs)).toBe(true);
    expect(Array.isArray(m.recoveryLogs)).toBe(true);
  });

  test("RefreshToday advances the app's current date", () => {
    const stale = { ...seedCore(), today: addDays(new Date(), -3) };
    const fresh = reducer(stale, { type: "RefreshToday", today: new Date() });
    expect(iso(fresh.today)).toBe(iso(new Date()));
  });

  test("plan memo returns independent clones (mutation-safe)", () => {
    const core = seedCore();
    const a = generatePlanMemo({ ...core.profile, todayISO: iso(new Date()) }, core.races[0], [], []);
    const b = generatePlanMemo({ ...core.profile, todayISO: iso(new Date()) }, core.races[0], [], []);
    a.weeks[0].days[0]._mut = true;
    expect(b.weeks[0].days[0]._mut).toBeUndefined();
  });

  test("deriveState produces a complete TodayState for a blank athlete", () => {
    const { todayState } = deriveState(emptyCore());
    ["currentDate", "todaysWorkout", "recoveryScore", "nutritionTargets", "trainingLoad", "paces", "progress"].forEach((k) =>
      expect(todayState[k]).toBeDefined()
    );
  });
});
