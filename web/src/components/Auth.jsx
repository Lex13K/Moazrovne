import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Auth({ session }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

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

  if (session) {
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>Signed in as {session.user.email}</div>
        <button onClick={signOut}>Sign out</button>
      </div>
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
      {status ? <div style={{ width: "100%" }}>{status}</div> : null}
    </form>
  );
}
