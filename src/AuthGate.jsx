import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { makeStorage } from "./storage";
import HybridCoach from "./HybridCoach";

const ink = "#0b0f14", surface = "#141a21", line = "#20262e", text = "#e6edf3", dim = "#9aa4af", faint = "#5b6573", ember = "#ff6a3d";
const field = { width: "100%", padding: "11px 13px", borderRadius: 10, background: ink, border: `1px solid ${line}`, color: text, fontSize: 14, outline: "none", marginTop: 8 };
const primaryBtn = { width: "100%", padding: "12px", borderRadius: 10, background: ember, color: "#1a0d07", fontWeight: 800, fontSize: 14, border: "none", cursor: "pointer", marginTop: 14 };
const ghostBtn = { width: "100%", padding: "11px", borderRadius: 10, background: "transparent", color: text, fontWeight: 700, fontSize: 14, border: `1px solid ${line}`, cursor: "pointer", marginTop: 10 };
const linkBtn = { background: "none", border: "none", color: ember, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 12 };
const Shell = ({ children }) => (
  <div style={{ minHeight: "100vh", background: ink, color: text, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
    <div style={{ width: "100%", maxWidth: 380 }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <svg width={42} height={42} viewBox="0 0 36 36" fill="none" style={{ display: "block", margin: "0 auto 10px" }}><rect width="36" height="36" rx="9" fill={ember} /><path d="M8 24.5 L15.5 15.5 L20.5 20 L28 10.5" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /><circle cx="28" cy="10.5" r="2.5" fill="#fff" /></svg>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>HyCo</div>
        <div style={{ fontSize: 12, color: faint, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>Run. Lift. Perform.</div>
      </div>
      <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 16, padding: 20 }}>{children}</div>
    </div>
  </div>
);

function AuthScreen() {
  const [mode, setMode] = useState("signin"); // signin | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const reset = () => { setErr(null); setMsg(null); };

  const submit = async () => {
    reset(); setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Account created. If email confirmation is on, check your inbox, then sign in.");
        setMode("signin");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setMsg("If that email has an account, a password-reset link is on its way. Open it on this device.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      setErr(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    reset();
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) setErr(error.message);
  };

  if (mode === "forgot") {
    return (
      <Shell>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Reset your password</div>
        <div style={{ color: dim, fontSize: 12.5, marginBottom: 8 }}>We'll email you a link to set a new one.</div>
        <label style={{ fontSize: 12, color: dim }}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={field} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <div style={{ color: "#ff6b6b", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
        {msg && <div style={{ color: "#4fd1a5", fontSize: 12.5, marginTop: 10 }}>{msg}</div>}
        <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Sending…" : "Send reset link"}</button>
        <button onClick={() => { setMode("signin"); reset(); }} style={linkBtn}>Back to sign in</button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {["signin", "signup"].map((m) => (
          <button key={m} onClick={() => { setMode(m); reset(); }} style={{ flex: 1, padding: "8px", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700, border: `1px solid ${mode === m ? ember : line}`, background: mode === m ? ember + "1A" : "transparent", color: mode === m ? ember : dim }}>
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <label style={{ fontSize: 12, color: dim }}>Email</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={field} />
      <label style={{ fontSize: 12, color: dim, display: "block", marginTop: 12 }}>Password</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={field} onKeyDown={(e) => e.key === "Enter" && submit()} />
      {err && <div style={{ color: "#ff6b6b", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      {msg && <div style={{ color: "#4fd1a5", fontSize: 12.5, marginTop: 10 }}>{msg}</div>}
      <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
      {mode === "signin" && <button onClick={() => { setMode("forgot"); reset(); }} style={linkBtn}>Forgot password?</button>}
      <div style={{ textAlign: "center", color: faint, fontSize: 11, margin: "12px 0" }}>or</div>
      <button onClick={google} style={ghostBtn}>Continue with Google</button>
    </Shell>
  );
}

function SetNewPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setErr(null);
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setErr(error.message); else onDone();
  };
  return (
    <Shell>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Set a new password</div>
      <div style={{ color: dim, fontSize: 12.5, marginBottom: 8 }}>Enter a new password for your account.</div>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" style={field} onKeyDown={(e) => e.key === "Enter" && save()} />
      {err && <div style={{ color: "#ff6b6b", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save new password"}</button>
    </Shell>
  );
}

export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const user = session?.user ?? null;
  const storage = useMemo(() => (user ? makeStorage(user) : null), [user && user.id]);

  const signOut = async () => {
    try { if (storage) await storage.flush(); } catch {}
    await supabase.auth.signOut();
  };

  const changePassword = async () => {
    const pw = window.prompt("Enter a new password (at least 6 characters):");
    if (!pw) return;
    if (pw.length < 6) { window.alert("Password must be at least 6 characters."); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    window.alert(error ? "Could not change password: " + error.message : "Password updated.");
  };

  const deleteAccount = async () => {
    if (!window.confirm("Permanently delete your account and ALL your data? This cannot be undone.")) return;
    if (!window.confirm("Are you absolutely sure? This is irreversible.")) return;
    const { error } = await supabase.rpc("delete_user");
    if (error) { window.alert("Could not delete account: " + error.message + "\n\nMake sure you ran supabase/schema.sql (it creates the delete_user function)."); return; }
    await supabase.auth.signOut();
    window.alert("Your account and data have been deleted.");
  };

  if (session === undefined) {
    return <div style={{ minHeight: "100vh", background: ink, color: dim, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>Loading…</div>;
  }
  if (recovering) return <SetNewPassword onDone={() => setRecovering(false)} />;
  if (!user) return <AuthScreen />;
  return <HybridCoach storage={storage} user={user} onSignOut={signOut} onChangePassword={changePassword} onDeleteAccount={deleteAccount} />;
}
