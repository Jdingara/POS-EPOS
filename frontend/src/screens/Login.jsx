import { useState } from "react";
import { usePos } from "../pos-context.jsx";

export default function Login() {
  const { login } = usePos();
  const [u, setU] = useState("cashier");
  const [p, setP] = useState("cashier123");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(u, p);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login-wrap" onSubmit={submit}>
      <h1>THREADLINE POS</h1>
      <p className="muted">Fashion &amp; apparel · store terminal</p>
      {err && <div className="banner bad" style={{ marginTop: 12 }}>{err}</div>}
      <label>Username</label>
      <input value={u} onChange={(e) => setU(e.target.value)} autoFocus />
      <label>Password</label>
      <input type="password" value={p} onChange={(e) => setP(e.target.value)} />
      <button className="btn-primary" style={{ width: "100%", marginTop: 16 }} disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Demo: <b>cashier / cashier123</b> · <b>manager / manager123</b>
      </p>
    </form>
  );
}
