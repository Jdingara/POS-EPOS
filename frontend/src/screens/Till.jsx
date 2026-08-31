import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { inr, toPaise } from "../money.js";
import { usePos } from "../pos-context.jsx";
import Modal from "../components/Modal.jsx";

const NOTES = [2000, 500, 200, 100, 50, 20, 10];
const TOLERANCE = 10000; // paise, mirrors backend

export default function Till() {
  const { user, till, refreshTill, toast } = usePos();
  const [float_, setFloat] = useState(2000);
  const [mode, setMode] = useState("dash"); // dash | count
  const [counts, setCounts] = useState({});
  const [coins, setCoins] = useState(0);
  const [note, setNote] = useState("");
  const [signoff, setSignoff] = useState("");
  const [staff, setStaff] = useState([]);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    api.get("/auth/staff").then((s) => setStaff(s.filter((x) => x.is_manager))).catch(() => {});
  }, []);

  async function openTill() {
    try {
      await api.post("/till/open", { opening_float_paise: toPaise(float_) });
      await refreshTill();
      toast("Till opened", "ok");
    } catch (ex) { toast(ex.message, "bad"); }
  }

  async function move(type) {
    const amt = prompt(type === "PAID_OUT" ? "Paid-out amount (₹)" : "Safe drop amount (₹)");
    if (!amt) return;
    const n = prompt("Note / reference") || "";
    try {
      await api.post("/till/movements", { type, amount_paise: toPaise(amt), note: n });
      await refreshTill();
      toast("Recorded", "ok");
    } catch (ex) { toast(ex.message, "bad"); }
  }

  const counted = useMemo(
    () => NOTES.reduce((s, d) => s + d * 100 * (parseInt(counts[d]) || 0), 0) + toPaise(coins),
    [counts, coins]
  );
  const expected = till.open ? till.summary.expected_paise : 0;
  const variance = counted - expected;
  const within = Math.abs(variance) <= TOLERANCE;

  async function close() {
    try {
      const report = await api.post("/till/close", {
        counted_paise: counted,
        note,
        ...(signoff ? { signed_off_by_id: Number(signoff) } : {}),
      });
      setModal({ type: "z", report });
      setMode("dash");
      setCounts({}); setCoins(0); setNote(""); setSignoff("");
      await refreshTill();
    } catch (ex) { toast(ex.message, "bad"); }
  }

  /* ---------------- till closed ---------------- */
  if (!till.open) {
    return (
      <section className="panel">
        <h2>Till opening</h2>
        <div className="body" style={{ maxWidth: 420 }}>
          <div className="kv"><div>Cashier</div><div><b>{user.full_name}</b></div></div>
          <label style={{ display: "block", margin: "12px 0 4px" }}>Starting float (₹)</label>
          <input type="number" value={float_} onChange={(e) => setFloat(e.target.value)} />
          <div className="chips" style={{ marginTop: 8 }}>
            {[1000, 1500, 2000, 2500, 3000].map((v) => (
              <span key={v} className="chip click" onClick={() => setFloat(v)}>{inr(v * 100)}</span>
            ))}
          </div>
          <button className="btn-primary" style={{ marginTop: 14 }} onClick={openTill}>Open till</button>
        </div>
        {modal?.type === "z" && <ZReport report={modal.report} onClose={() => setModal(null)} />}
      </section>
    );
  }

  /* ---------------- count & reconcile ---------------- */
  if (mode === "count") {
    return (
      <section className="panel">
        <h2>Close till — blind count &amp; reconcile</h2>
        <div className="body">
          <div className="banner info">Count the drawer, then compare with the system. Tolerance ± {inr(TOLERANCE)}.</div>
          <div className="denoms">
            <b>Denomination</b><b style={{ textAlign: "center" }}>Count</b><b className="d-tot">Value</b>
            {NOTES.map((d) => (
              <div style={{ display: "contents" }} key={d}>
                <div>₹{d} notes</div>
                <input type="number" min={0} value={counts[d] || 0}
                  onChange={(e) => setCounts((c) => ({ ...c, [d]: e.target.value }))} />
                <div className="d-tot">{inr(d * 100 * (parseInt(counts[d]) || 0))}</div>
              </div>
            ))}
            <div>Coins / loose (₹)</div>
            <input type="number" min={0} value={coins} onChange={(e) => setCoins(e.target.value)} />
            <div className="d-tot">{inr(toPaise(coins))}</div>
          </div>

          <div className="cards" style={{ marginTop: 14 }}>
            <div className="stat"><div className="lab">Expected (system)</div><div className="val">{inr(expected)}</div></div>
            <div className="stat"><div className="lab">Counted</div><div className="val">{inr(counted)}</div></div>
            <div className="stat"><div className="lab">Variance</div>
              <div className="val" style={{ color: within ? "var(--ok)" : "var(--bad)" }}>
                {variance >= 0 ? "+" : ""}{inr(variance)}
              </div>
            </div>
          </div>

          {!within ? (
            <div className="banner bad" style={{ marginTop: 12 }}>
              Variance beyond tolerance — reason and manager sign-off required.
              <textarea style={{ marginTop: 6 }} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Explanation / action taken" />
              <select style={{ marginTop: 6 }} value={signoff} onChange={(e) => setSignoff(e.target.value)}>
                <option value="">— manager sign-off —</option>
                {staff.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          ) : (
            <div className="banner info" style={{ marginTop: 12 }}>Within tolerance — no reconciliation needed.</div>
          )}

          <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn-ghost" onClick={() => setMode("dash")}>Back</button>
            <button className="btn-primary" disabled={!within && (!note.trim() || !signoff)} onClick={close}>
              Generate end-of-day report
            </button>
          </div>
        </div>
      </section>
    );
  }

  /* ---------------- open dashboard ---------------- */
  const s = till.summary;
  const sess = till.session;
  return (
    <section className="panel">
      <h2>Till — cash management
        <span className="muted" style={{ fontWeight: 400 }}> open since {new Date(sess.opened_at).toLocaleString()} · {sess.opened_by_name}</span>
      </h2>
      <div className="body">
        <div className="cards">
          <div className="stat"><div className="lab">Opening float</div><div className="val">{inr(s.opening_float_paise)}</div></div>
          <div className="stat"><div className="lab">Cash sales</div><div className="val">{inr(s.cash_sales_paise)}</div></div>
          <div className="stat"><div className="lab">Cash refunds</div><div className="val">{inr(s.cash_refunds_paise)}</div></div>
          <div className="stat"><div className="lab">Exchange top-ups</div><div className="val">{inr(s.exchange_collect_paise)}</div></div>
          <div className="stat"><div className="lab">Paid-outs</div><div className="val">{inr(s.paid_out_paise)}</div></div>
          <div className="stat"><div className="lab">Safe drops</div><div className="val">{inr(s.safe_drop_paise)}</div></div>
          <div className="stat" style={{ borderColor: "var(--brand)" }}>
            <div className="lab">Expected in drawer</div><div className="val">{inr(s.expected_paise)}</div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={() => move("PAID_OUT")}>Paid-out / petty cash</button>
          <button onClick={() => move("SAFE_DROP")}>Safe drop</button>
          <span className="grow" />
          <button className="btn-primary" onClick={() => setMode("count")}>Close till &amp; count</button>
        </div>

        <h3 style={{ margin: "16px 0 8px", fontSize: 12, letterSpacing: ".4px", color: "var(--muted)" }}>CASH MOVEMENTS</h3>
        <table className="grid">
          <thead><tr><th>Type</th><th className="num">Amount</th><th>Ref</th><th>Time</th><th>Note</th></tr></thead>
          <tbody>
            {sess.movements.length === 0 && <tr><td colSpan={5} className="muted">No cash movements yet.</td></tr>}
            {sess.movements.map((m) => (
              <tr key={m.id}>
                <td>{m.type.replaceAll("_", " ")}</td>
                <td className="num">{m.signed_paise >= 0 ? "+" : "−"} {inr(Math.abs(m.signed_paise))}</td>
                <td>{m.ref}</td>
                <td className="muted">{new Date(m.created_at).toLocaleTimeString()}</td>
                <td>{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.type === "z" && <ZReport report={modal.report} onClose={() => setModal(null)} />}
    </section>
  );
}

function ZReport({ report, onClose }) {
  const t = report.tender_mix;
  return (
    <Modal title="End-of-day report (Z-report)" wide onClose={onClose}
      foot={<button className="btn-primary" onClick={onClose}>Done</button>}>
      <div className="receipt">
        <div style={{ textAlign: "center" }}>
          <div className="r-big">Z-REPORT · END OF DAY</div>
          <div>THREADLINE · {new Date().toLocaleString()}</div>
          <div>Till #{report.till_id} · {report.opened_by}</div>
        </div>
        <hr />
        <div className="r-row"><span>Transactions</span><span>{report.transactions}</span></div>
        <div className="r-row"><span>Gross sales</span><span>{inr(report.gross_sales_paise)}</span></div>
        <div className="r-row"><span>Discounts given</span><span>− {inr(report.discounts_paise)}</span></div>
        <div className="r-row"><span>Refunds ({report.returns_count})</span><span>− {inr(report.refunds_paise)}</span></div>
        <div className="r-row"><span>Exchanges</span><span>{report.exchanges_count}</span></div>
        <div className="r-row"><span>GST collected</span><span>{inr(report.tax_paise)}</span></div>
        <hr />
        <div className="r-row"><span>Tender — Cash (net)</span><span>{inr(t.cash_paise)}</span></div>
        <div className="r-row"><span>Tender — Card (net)</span><span>{inr(t.card_paise)}</span></div>
        <div className="r-row"><span>Tender — UPI (net)</span><span>{inr(t.upi_paise)}</span></div>
        <hr />
        <div className="r-row"><span>Drawer expected</span><span>{inr(report.drawer_expected_paise)}</span></div>
        <div className="r-row"><span>Drawer counted</span><span>{inr(report.drawer_counted_paise)}</span></div>
        <div className="r-row r-big"><span>CASH VARIANCE</span><span>{report.variance_paise >= 0 ? "+" : ""}{inr(report.variance_paise)}</span></div>
      </div>
    </Modal>
  );
}
