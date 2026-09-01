import { useEffect, useMemo, useState } from "react";
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

const rupee = (p) => ((p || 0) / 100).toFixed(2); // plain number for spreadsheets

/** Build a UTF-8-BOM CSV (opens straight in Excel) and trigger a download. */
function downloadCSV(filename, header, rows) {
  const esc = (c) => {
    const s = String(c ?? "");
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const body = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Transactions() {
  const { toast } = usePos();
  const [range, setRange] = useState("7d");
  const [sum, setSum] = useState(null);
  const [sales, setSales] = useState([]);
  const [returns, setReturns] = useState([]);
  const [tab, setTab] = useState("sales");
  const [query, setQuery] = useState("");
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

  const q = query.trim().toLowerCase();
  const fSales = useMemo(
    () => (!q ? sales : sales.filter((s) =>
      [s.number, s.cashier_name, s.tender, STATUS_LABEL[s.status] || s.status]
        .join(" ").toLowerCase().includes(q))),
    [sales, q]
  );
  const fReturns = useMemo(
    () => (!q ? returns : returns.filter((r) =>
      [r.number, r.original_number, r.exchange_number, r.kind, r.cashier_name, r.approved_by_name]
        .join(" ").toLowerCase().includes(q))),
    [returns, q]
  );

  const { label } = rangeParams(range);

  function exportCSV() {
    const stamp = localISO(new Date());
    if (tab === "sales") {
      downloadCSV(
        `transactions-sales-${stamp}.csv`,
        ["Receipt", "Time", "Cashier", "Units", "Subtotal", "Discount", "GST", "Total", "Paid", "Status", "Units returned"],
        fSales.map((s) => [
          s.number, new Date(s.created_at).toLocaleString(), s.cashier_name, s.units,
          rupee(s.subtotal_paise), rupee(s.discount_paise), rupee(s.tax_paise), rupee(s.total_paise),
          s.tender, STATUS_LABEL[s.status] || s.status, s.returned_units,
        ])
      );
    } else {
      downloadCSV(
        `transactions-returns-${stamp}.csv`,
        ["Ref", "Time", "Type", "Against", "New sale", "Units", "Value returned", "Refund", "Refund method", "Collected", "Cashier", "Approved by"],
        fReturns.map((r) => [
          r.number, new Date(r.created_at).toLocaleString(),
          r.kind === "EXCHANGE" ? "Exchange" : "Refund",
          r.original_number, r.exchange_number || "", r.units,
          rupee(r.returned_value_paise), rupee(r.refund_amount_paise), r.refund_method || "",
          rupee(r.collect_amount_paise), r.cashier_name, r.approved_by_name || "",
        ])
      );
    }
  }

  return (
    <section className="panel">
      <h2>Transactions <span className="muted" style={{ fontWeight: 400 }}>sales &amp; returns · {label}</span></h2>
      <div className="body">
        <div className="print-only" style={{ marginBottom: 10, fontSize: 12 }}>
          THREADLINE — transactions report · {label} · generated {new Date().toLocaleString()}
        </div>

        <div className="chips no-print" style={{ marginBottom: 12 }}>
          {[["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["all", "All"]].map(([v, t]) => (
            <span key={v} className="chip click"
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

        {/* ---------- toolbar ---------- */}
        <div className="row wrap no-print" style={{ gap: 8, margin: "16px 0 10px" }}>
          <button className={tab === "sales" ? "btn-primary" : ""} onClick={() => setTab("sales")}>
            Sales ({fSales.length})
          </button>
          <button className={tab === "returns" ? "btn-primary" : ""} onClick={() => setTab("returns")}>
            Returns &amp; exchanges ({fReturns.length})
          </button>
          <input style={{ maxWidth: 260 }} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search receipt / cashier / status…" />
          <span className="grow" />
          <button onClick={() => window.print()}>Print</button>
          <button onClick={exportCSV}>Excel (CSV)</button>
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
                {fSales.length === 0 && <tr><td colSpan={9} className="muted" style={{ padding: 16 }}>{sales.length ? "No sales match the search." : "No sales in this period."}</td></tr>}
                {fSales.map((s) => (
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
                {fReturns.length === 0 && <tr><td colSpan={10} className="muted" style={{ padding: 16 }}>{returns.length ? "No returns match the search." : "No returns or exchanges in this period."}</td></tr>}
                {fReturns.map((r) => (
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
