import { useEffect, useState } from "react";
import { api } from "../api.js";
import { inr } from "../money.js";
import { usePos } from "../pos-context.jsx";
import { ReceiptModal } from "./Sell.jsx";

const localISO = (d) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};

function rangeParams(range) {
  const today = new Date();
  if (range === "all") return { label: "all time", qs: "" };
  const days = range === "7d" ? 6 : range === "30d" ? 29 : 0;
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  return {
    label: days ? `last ${days + 1} days` : "today",
    qs: `?from=${localISO(from)}&to=${localISO(today)}`,
  };
}

const STATUS_LABEL = {
  COMPLETED: "completed",
  PARTIALLY_RETURNED: "part. returned",
  RETURNED: "returned",
  VOIDED: "voided",
};

export default function Transactions() {
  const { toast } = usePos();
  const [range, setRange] = useState("7d");
  const [sum, setSum] = useState(null);
  const [sales, setSales] = useState([]);
  const [returns, setReturns] = useState([]);
  const [tab, setTab] = useState("sales");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { qs } = rangeParams(range);
    setLoading(true);
    Promise.all([
      api.get("/reports/summary" + qs),
      api.get("/sales/sales" + (qs ? qs + "&kind=sale" : "?kind=sale")),
      api.get("/sales/returns" + qs),
    ])
      .then(([s, sl, rt]) => {
        setSum(s);
        setSales(sl);
        setReturns(rt);
      })
      .catch((e) => toast(e.message, "bad"))
      .finally(() => setLoading(false));
  }, [range, toast]);

  async function openSale(number) {
    try {
      setDetail(await api.get("/sales/sales/" + encodeURIComponent(number)));
    } catch (e) {
      toast(e.message, "bad");
    }
  }

  const { label } = rangeParams(range);

  return (
    <section className="panel">
      <h2>Transactions <span className="muted" style={{ fontWeight: 400 }}>sales &amp; returns · {label}</span></h2>
      <div className="body">
        <div className="chips" style={{ marginBottom: 12 }}>
          {[["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["all", "All"]].map(([v, t]) => (
            <span key={v} className={"chip click" + (range === v ? " " : "")}
              style={range === v ? { borderColor: "var(--brand)", color: "var(--brand)", fontWeight: 700 } : undefined}
              onClick={() => setRange(v)}>{t}</span>
          ))}
        </div>

        {/* ---------- summary report ---------- */}
        {sum && (
          <>
            <div className="cards">
              <div className="stat"><div className="lab">Sales</div><div className="val">{sum.sales_count}</div></div>
              <div className="stat"><div className="lab">Units sold</div><div className="val">{sum.units}</div></div>
              <div className="stat"><div className="lab">Gross sales</div><div className="val">{inr(sum.gross_paise)}</div></div>
              <div className="stat"><div className="lab">Discounts</div><div className="val">− {inr(sum.discount_paise)}</div></div>
              <div className="stat"><div className="lab">GST</div><div className="val">{inr(sum.tax_paise)}</div></div>
              <div className="stat"><div className="lab">Refunds ({sum.refunds_count})</div><div className="val">− {inr(sum.refund_paise)}</div></div>
              <div className="stat"><div className="lab">Exchanges</div><div className="val">{sum.exchanges_count}</div></div>
              <div className="stat" style={{ borderColor: "var(--brand)" }}>
                <div className="lab">Net sales</div><div className="val">{inr(sum.net_sales_paise)}</div>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Tender (net of refunds): Cash {inr(sum.tender_mix.cash_paise)} · Card {inr(sum.tender_mix.card_paise)} · UPI {inr(sum.tender_mix.upi_paise)}
              {sum.collect_paise > 0 && <>  ·  Exchange top-ups collected {inr(sum.collect_paise)}</>}
            </p>
          </>
        )}

        {/* ---------- list ---------- */}
        <div className="row" style={{ gap: 6, margin: "16px 0 10px" }}>
          <button className={tab === "sales" ? "btn-primary" : ""} onClick={() => setTab("sales")}>
            Sales ({sales.length})
          </button>
          <button className={tab === "returns" ? "btn-primary" : ""} onClick={() => setTab("returns")}>
            Returns &amp; exchanges ({returns.length})
          </button>
        </div>

        {loading && <p className="muted">Loading…</p>}

        {!loading && tab === "sales" && (
          <div style={{ overflowX: "auto" }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Receipt</th><th>Time</th><th>Cashier</th><th className="num">Units</th>
                  <th className="num">Discount</th><th className="num">GST</th><th className="num">Total</th>
                  <th>Paid</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 && <tr><td colSpan={9} className="muted" style={{ padding: 16 }}>No sales in this period.</td></tr>}
                {sales.map((s) => (
                  <tr key={s.number} style={{ cursor: "pointer" }} onClick={() => openSale(s.number)}>
                    <td><span className="lnk">{s.number}</span></td>
                    <td className="muted">{new Date(s.created_at).toLocaleString()}</td>
                    <td>{s.cashier_name}</td>
                    <td className="num">{s.units}</td>
                    <td className="num">{s.discount_paise ? "− " + inr(s.discount_paise) : "—"}</td>
                    <td className="num">{inr(s.tax_paise)}</td>
                    <td className="num"><b>{inr(s.total_paise)}</b></td>
                    <td>{s.tender}</td>
                    <td>
                      {STATUS_LABEL[s.status] || s.status}
                      {s.returned_units > 0 && <span className="muted"> ({s.returned_units} back)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && tab === "returns" && (
          <div style={{ overflowX: "auto" }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Ref</th><th>Time</th><th>Type</th><th>Against</th><th>New sale</th>
                  <th className="num">Units</th><th className="num">Value back</th>
                  <th className="num">Refunded</th><th className="num">Collected</th><th>By</th>
                </tr>
              </thead>
              <tbody>
                {returns.length === 0 && <tr><td colSpan={10} className="muted" style={{ padding: 16 }}>No returns or exchanges in this period.</td></tr>}
                {returns.map((r) => (
                  <tr key={r.number}>
                    <td>{r.number}</td>
                    <td className="muted">{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.kind === "EXCHANGE" ? "Exchange" : "Refund"}</td>
                    <td><span className="lnk" style={{ cursor: "pointer" }} onClick={() => openSale(r.original_number)}>{r.original_number}</span></td>
                    <td>{r.exchange_number || "—"}</td>
                    <td className="num">{r.units}</td>
                    <td className="num">{inr(r.returned_value_paise)}</td>
                    <td className="num">{r.refund_amount_paise ? inr(r.refund_amount_paise) + " " + r.refund_method : "—"}</td>
                    <td className="num">{r.collect_amount_paise ? inr(r.collect_amount_paise) : "—"}</td>
                    <td>{r.cashier_name}{r.approved_by_name && <span className="muted"> / {r.approved_by_name}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && <ReceiptModal sale={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}
