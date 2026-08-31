import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { inr } from "../money.js";
import { usePos } from "../pos-context.jsx";
import Modal from "../components/Modal.jsx";

const CONDITIONS = [
  ["RESALEABLE", "Resaleable — restock"],
  ["DAMAGED", "Damaged — write off"],
];
const REASONS = [
  ["SIZE", "Wrong size"], ["FIT", "Poor fit"], ["DEFECT", "Defective"],
  ["CHANGED_MIND", "Changed mind"], ["WRONG_ITEM", "Wrong item"],
];

export default function Returns() {
  const { user, till, refreshTill, toast } = usePos();
  const [number, setNumber] = useState("");
  const [sale, setSale] = useState(null);
  const [recent, setRecent] = useState([]);
  const [staff, setStaff] = useState([]);
  const [rows, setRows] = useState({});        // sale_line_id -> {qty, condition, reason}
  const [kind, setKind] = useState("EXCHANGE"); // exchange-first
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [collectMethod, setCollectMethod] = useState("UPI");
  const [exCart, setExCart] = useState([]);     // [{variant, qty}]
  const [exQuote, setExQuote] = useState(null);
  const [exTerm, setExTerm] = useState("");
  const [approver, setApprover] = useState("");
  const [override, setOverride] = useState(false);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    api.get("/sales/sales").then(setRecent).catch(() => {});
    api.get("/auth/staff").then((s) => setStaff(s.filter((x) => x.is_manager))).catch(() => {});
  }, []);

  useEffect(() => {
    if (exCart.length === 0) { setExQuote(null); return; }
    api.post("/sales/quote", { items: exCart.map((c) => ({ variant_id: c.variant.id, qty: c.qty })) })
      .then(setExQuote).catch((e) => toast(e.message, "bad"));
  }, [exCart, toast]);

  async function find(num) {
    const n = (num ?? number).trim();
    if (!n) return;
    try {
      const s = await api.get("/sales/sales/" + encodeURIComponent(n));
      setSale(s);
      setNumber(s.number);
      setRows({});
      setExCart([]);
      setOverride(false);
      setApprover("");
      const tender = s.payments.find((p) => p.method !== "STORE_CREDIT")?.method || "CASH";
      setRefundMethod(tender);
    } catch (ex) {
      toast(ex.message, "bad");
      setSale(null);
    }
  }

  function setRow(id, patch) {
    setRows((r) => ({ ...r, [id]: { qty: 0, condition: "RESALEABLE", reason: "SIZE", ...r[id], ...patch } }));
  }

  const returnedValue = useMemo(() => {
    if (!sale) return 0;
    let total = 0;
    for (const l of sale.lines) {
      const q = rows[l.id]?.qty || 0;
      if (q > 0) total += Math.round((l.line_total_paise * q) / l.qty);
    }
    return total;
  }, [sale, rows]);

  const ageDays = sale ? Math.floor((Date.now() - new Date(sale.created_at)) / 86400000) : 0;
  const outOfWindow = ageDays > 30;
  const needsApproval = returnedValue > 200000 && user.role !== "manager";
  const exTotal = exQuote?.total_paise || 0;
  const diff = kind === "EXCHANGE" ? exTotal - returnedValue : 0;

  async function exSearch(e) {
    e.preventDefault();
    if (!exTerm.trim()) return;
    try {
      const rowsFound = await api.get("/catalog/variants?search=" + encodeURIComponent(exTerm.trim()));
      if (!rowsFound.length) return toast("No match", "bad");
      const v = rowsFound[0];
      setExCart((c) => {
        const f = c.find((x) => x.variant.id === v.id);
        return f ? c.map((x) => x.variant.id === v.id ? { ...x, qty: x.qty + 1 } : x) : [...c, { variant: v, qty: 1 }];
      });
      setExTerm("");
    } catch (ex) { toast(ex.message, "bad"); }
  }

  const selectedLines = sale ? sale.lines.filter((l) => (rows[l.id]?.qty || 0) > 0) : [];
  const canProcess =
    till.open &&
    selectedLines.length > 0 &&
    (!outOfWindow || override) &&
    (!needsApproval || approver) &&
    (kind === "REFUND" || exCart.length > 0);

  async function process() {
    try {
      const payload = {
        original_number: sale.number,
        kind,
        return_items: selectedLines.map((l) => ({
          sale_line_id: l.id,
          qty: rows[l.id].qty,
          condition: rows[l.id].condition,
          reason: rows[l.id].reason,
        })),
        refund_method: refundMethod,
        collect_method: collectMethod,
        exchange_items: kind === "EXCHANGE" ? exCart.map((c) => ({ variant_id: c.variant.id, qty: c.qty })) : [],
        override_window: override,
        ...(approver ? { approved_by_id: Number(approver) } : {}),
      };
      const rt = await api.post("/sales/returns", payload);
      setModal({ type: "receipt", rt });
      setSale(null);
      setRows({});
      setExCart([]);
      refreshTill();
      api.get("/sales/sales").then(setRecent);
      toast(`${rt.kind} ${rt.number} processed`, "ok");
    } catch (ex) {
      toast(ex.message, "bad");
    }
  }

  return (
    <section className="panel">
      <h2>Returns &amp; Exchange <span className="muted" style={{ fontWeight: 400 }}>original receipt required</span></h2>
      <div className="body">
        {!till.open && <div className="banner warn">Open the till to process refunds or exchanges.</div>}

        <form className="row" onSubmit={(e) => { e.preventDefault(); find(); }}>
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Receipt number e.g. INV-20260101-0001" />
          <button className="btn-primary">Find</button>
        </form>
        <div className="chips" style={{ marginTop: 10 }}>
          <span className="muted" style={{ fontSize: 12 }}>Recent:</span>
          {recent.slice(0, 8).map((s) => (
            <span key={s.number} className="chip click" onClick={() => find(s.number)}>
              {s.number} · {inr(s.total_paise)}
            </span>
          ))}
        </div>

        {sale && (
          <>
            <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "14px 0" }} />
            <div className="kv" style={{ marginBottom: 10 }}>
              <div>Receipt</div><div><b>{sale.number}</b> · {sale.status}</div>
              <div>Sold</div><div>{new Date(sale.created_at).toLocaleString()} ({ageDays} day(s) ago)</div>
              <div>Original</div><div>{inr(sale.total_paise)} · paid {sale.payments.map((p) => p.method).join(", ")}</div>
            </div>

            {outOfWindow && (
              <div className="banner warn">
                Outside the 30-day window.
                <label className="row" style={{ marginTop: 6, gap: 6 }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={override} onChange={(e) => setOverride(e.target.checked)} />
                  Manager override — proceed
                </label>
              </div>
            )}

            <div className="row" style={{ gap: 6, marginBottom: 10 }}>
              <button className={kind === "EXCHANGE" ? "btn-primary" : ""} onClick={() => setKind("EXCHANGE")}>Exchange</button>
              <button className={kind === "REFUND" ? "btn-primary" : ""} onClick={() => setKind("REFUND")}>Refund</button>
            </div>

            <table className="grid">
              <thead>
                <tr><th>Item</th><th className="num">Paid</th><th className="num">Sold</th><th className="num">Back</th><th className="num">Return qty</th><th>Condition</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {sale.lines.map((l) => {
                  const r = rows[l.id] || {};
                  return (
                    <tr key={l.id}>
                      <td>{l.description}</td>
                      <td className="num">{inr(l.line_total_paise)}</td>
                      <td className="num">{l.qty}</td>
                      <td className="num">{l.returned_qty}</td>
                      <td className="num">
                        <input type="number" min={0} max={l.returnable_qty} style={{ width: 64 }}
                          value={r.qty || 0} disabled={l.returnable_qty === 0}
                          onChange={(e) => setRow(l.id, { qty: Math.max(0, Math.min(+e.target.value || 0, l.returnable_qty)) })} />
                      </td>
                      <td>
                        <select value={r.condition || "RESALEABLE"} disabled={!r.qty}
                          onChange={(e) => setRow(l.id, { condition: e.target.value })}>
                          {CONDITIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={r.reason || "SIZE"} disabled={!r.qty}
                          onChange={(e) => setRow(l.id, { reason: e.target.value })}>
                          {REASONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="kv" style={{ marginTop: 10 }}>
              <div>Value coming back</div><div><b>{inr(returnedValue)}</b></div>
            </div>

            {kind === "EXCHANGE" && (
              <div className="banner info" style={{ marginTop: 10 }}>
                <b>Replacement items</b>
                <form className="row" style={{ margin: "6px 0" }} onSubmit={exSearch}>
                  <input value={exTerm} onChange={(e) => setExTerm(e.target.value)} placeholder="scan / search a different size or colour" />
                  <button>Add</button>
                </form>
                {exCart.map((c) => (
                  <div key={c.variant.id} className="row" style={{ justifyContent: "space-between" }}>
                    <span>{c.variant.label} × {c.qty} <span className="muted">({inr(c.variant.unit_price_paise)})</span></span>
                    <button className="lnk" onClick={() => setExCart((x) => x.filter((y) => y.variant.id !== c.variant.id))}>remove</button>
                  </div>
                ))}
                {exQuote && (
                  <div className="kv" style={{ marginTop: 6 }}>
                    <div>New items total</div><div>{inr(exTotal)}</div>
                    <div>Difference</div>
                    <div>
                      {diff === 0 && <b>Even exchange — no money changes hands</b>}
                      {diff > 0 && <b>Collect {inr(diff)} from customer</b>}
                      {diff < 0 && <b>Refund {inr(-diff)} to customer</b>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(kind === "REFUND" || diff < 0) && (
              <label className="row" style={{ gap: 8, marginTop: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>Refund to</span>
                <select style={{ width: 160 }} value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                  {["CASH", "CARD", "UPI", "STORE_CREDIT"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
            )}
            {kind === "EXCHANGE" && diff > 0 && (
              <label className="row" style={{ gap: 8, marginTop: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>Collect via</span>
                <select style={{ width: 160 }} value={collectMethod} onChange={(e) => setCollectMethod(e.target.value)}>
                  {["CASH", "CARD", "UPI"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
            )}

            {needsApproval && (
              <div className="banner warn" style={{ marginTop: 10 }}>
                Return value over ₹2,000 — manager approval required.
                <select style={{ marginTop: 6 }} value={approver} onChange={(e) => setApprover(e.target.value)}>
                  <option value="">— select approving manager —</option>
                  {staff.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
            )}

            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setSale(null)}>Clear</button>
              <button className="btn-primary" disabled={!canProcess} onClick={process}>
                {kind === "EXCHANGE" ? "Process exchange" : "Process refund"}
              </button>
            </div>
          </>
        )}
      </div>

      {modal?.type === "receipt" && <ReturnReceipt rt={modal.rt} onClose={() => setModal(null)} />}
    </section>
  );
}

function ReturnReceipt({ rt, onClose }) {
  return (
    <Modal title={`${rt.kind === "EXCHANGE" ? "Exchange" : "Refund"} receipt`} onClose={onClose}
      foot={<button className="btn-primary" onClick={onClose}>Done</button>}>
      <div className="receipt">
        <div style={{ textAlign: "center" }}>
          <div className="r-big">THREADLINE — {rt.kind}</div>
          <div>{new Date(rt.created_at).toLocaleString()}</div>
        </div>
        <hr />
        <div className="r-row"><span>Ref</span><span>{rt.number}</span></div>
        <div className="r-row"><span>Against</span><span>{rt.original_number}</span></div>
        {rt.exchange_number && <div className="r-row"><span>New sale</span><span>{rt.exchange_number}</span></div>}
        <div className="r-row"><span>Cashier</span><span>{rt.cashier_name}</span></div>
        {rt.approved_by_name && <div className="r-row"><span>Approved by</span><span>{rt.approved_by_name}</span></div>}
        <hr />
        {rt.lines.map((l, i) => (
          <div className="r-row" key={i}><span>{l.description} × {l.qty} ({l.reason})</span><span>{inr(l.amount_paise)}</span></div>
        ))}
        <hr />
        <div className="r-row"><span>Value returned</span><span>{inr(rt.returned_value_paise)}</span></div>
        {rt.collect_amount_paise > 0 && <div className="r-row r-big"><span>COLLECTED</span><span>{inr(rt.collect_amount_paise)}</span></div>}
        {rt.refund_amount_paise > 0 && <div className="r-row r-big"><span>REFUNDED ({rt.refund_method})</span><span>{inr(rt.refund_amount_paise)}</span></div>}
        {rt.collect_amount_paise === 0 && rt.refund_amount_paise === 0 && (
          <div className="r-row r-big"><span>EVEN EXCHANGE</span><span>₹0.00</span></div>
        )}
      </div>
    </Modal>
  );
}
