import { supabase } from "./supabaseClient";

// The app saves/loads its entire state ("core") as one JSON blob. This adapter
// mirrors the async get/set shape the app expects, but stores the blob in the
// `athlete_state` table, one row per user (row-level security keeps users to
// their own row). Writes are debounced so rapid edits don't hammer the database,
// and mirrored to localStorage for instant reloads / offline resilience.
const TABLE = "athlete_state";

export function makeStorage(user) {
  const cacheKey = `hybridcoach:${user.id}`;
  let timer = null;
  let pending = null;

  async function flush() {
    if (pending == null) return;
    const value = pending;
    pending = null;
    let payload;
    try { payload = JSON.parse(value); } catch { payload = value; }
    const { error } = await supabase
      .from(TABLE)
      .upsert({ user_id: user.id, data: payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) console.warn("[storage] save failed:", error.message);
  }

  return {
    async get() {
      // Try the database first; fall back to the local cache if offline.
      try {
        const { data, error } = await supabase
          .from(TABLE)
          .select("data")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (data && data.data != null) {
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
