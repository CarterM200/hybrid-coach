import { supabase } from "./supabaseClient";

// The app saves/loads its entire state ("core") as one JSON blob. This adapter
// mirrors the async get/set shape the app expects, but stores the blob in the
// `athlete_state` table, one row per user (row-level security keeps users to
// their own row). Writes are debounced so rapid edits don't hammer the database,
// and mirrored to localStorage for instant reloads / offline resilience.
//
// Conflict handling (#4): we remember the row's `updated_at` from the last read.
// Before each network write we re-check it; if another device or a background
// integration sync wrote a newer version, we MERGE rather than blindly overwrite.
// Append-only log arrays are unioned (deduped by id, falling back to date+type),
// so concurrently-added activities from two sources both survive. Scalar/profile
// fields are last-write-wins in favour of the local session.
const TABLE = "athlete_state";

// Arrays that grow over time and may be written by more than one source.
const LOG_KEYS = ["runLogs", "liftLogs", "bodyLogs", "sessionLogs", "vo2Logs", "recoveryLogs"];

function itemKey(k, item) {
  if (!item || typeof item !== "object") return JSON.stringify(item);
  if (item.id != null) return "id:" + item.id;
  // stable fallback when an entry has no id (older records / manual entries)
  return k + ":" + (item.date != null ? item.date : "") + ":" + (item.exercise || item.type || item.kind || "");
}

function mergeCores(remote, local) {
  if (!remote || typeof remote !== "object") return local;
  if (!local || typeof local !== "object") return remote;
  const out = { ...remote, ...local }; // local wins for scalars / keyed objects
  for (const k of LOG_KEYS) {
    const a = Array.isArray(local[k]) ? local[k] : [];
    const b = Array.isArray(remote[k]) ? remote[k] : [];
    const seen = new Set();
    const merged = [];
    for (const item of [...a, ...b]) {
      const key = itemKey(k, item);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    out[k] = merged;
  }
  return out;
}

export function makeStorage(user) {
  const cacheKey = `hybridcoach:${user.id}`;
  let timer = null;
  let pending = null;
  let baseUpdatedAt = null; // server timestamp of the version this client last saw

  async function flush() {
    if (pending == null) return;
    const value = pending;
    pending = null;
    let local;
    try { local = JSON.parse(value); } catch { local = value; }

    // Conflict check: has the row changed since we last read it?
    if (local && typeof local === "object") {
      try {
        const { data } = await supabase
          .from(TABLE)
          .select("data, updated_at")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data && data.updated_at && baseUpdatedAt && data.updated_at > baseUpdatedAt) {
          const remote = typeof data.data === "string" ? JSON.parse(data.data) : data.data;
          local = mergeCores(remote, local);
          console.warn("[storage] remote changed since load - merged log history");
        }
      } catch (e) { /* offline or no row yet - proceed with local */ }
    }

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from(TABLE)
      .upsert({ user_id: user.id, data: local, updated_at: nowIso }, { onConflict: "user_id" });
    if (error) { console.warn("[storage] save failed:", error.message); return; }
    baseUpdatedAt = nowIso;
    try { localStorage.setItem(cacheKey, typeof local === "string" ? local : JSON.stringify(local)); } catch {}
  }

  return {
    async get() {
      // Try the database first; fall back to the local cache if offline.
      try {
        const { data, error } = await supabase
          .from(TABLE)
          .select("data, updated_at")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (data && data.data != null) {
          baseUpdatedAt = data.updated_at || null;
          const value = typeof data.data === "string" ? data.data : JSON.stringify(data.data);
          try { localStorage.setItem(cacheKey, value); } catch {}
          return { value };
        }
      } catch (e) {
        const cached = (() => { try { return localStorage.getItem(cacheKey); } catch { return null; } })();
        if (cached) return { value: cached };
      }
      return null;
    },

    async set(_key, value) {
      // Write-through to local cache immediately, debounce the network write.
      try { localStorage.setItem(cacheKey, value); } catch {}
      pending = value;
      clearTimeout(timer);
      timer = setTimeout(flush, 800);
      return { value };
    },

    // Force any pending write to commit (call before sign-out).
    async flush() {
      clearTimeout(timer);
      await flush();
    },
  };
}
