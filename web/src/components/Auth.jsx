import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Auth({ session }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState("login"); // "login" | "forgot"

  async function signUp(e) {
    e.preventDefault();
    setStatus("Creating account...");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return setStatus(error.message);
    setStatus("Account created. You may need to confirm your email before signing in.");
  }

  async function signIn(e) {
    e.preventDefault();
    setStatus("Signing in...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setStatus(error.message);
    setStatus("");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function sendResetEmail(e) {
    e.preventDefault();
    setStatus("Sending...");
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return setStatus(error.message);
    setStatus("Password reset email sent. Check your inbox.");
  }

  if (session) {
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>Signed in as {session.user.email}</div>
        <button onClick={signOut}>Sign out</button>
      </div>
    );
  }

  if (view === "forgot") {
    return (
      <form onSubmit={sendResetEmail} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your email"
          autoComplete="email"
          type="email"
          required
        />
        <button type="submit">Send reset link</button>
        <button type="button" onClick={() => { setView("login"); setStatus(""); }}>
          Back to sign in
        </button>
        {status ? <div style={{ width: "100%" }}>{status}</div> : null}
      </form>
    );
  }

  return (
    <form onSubmit={signIn} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        autoComplete="email"
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password"
        type="password"
        autoComplete="current-password"
      />
      <button type="submit">Sign in</button>
      <button type="button" onClick={signUp}>Sign up</button>
      <button type="button" onClick={() => { setView("forgot"); setStatus(""); }}
        style={{ fontSize: "0.8em", color: "#6b7280", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        Forgot password?
      </button>
      {status ? <div style={{ width: "100%" }}>{status}</div> : null}
    </form>
  );
}
