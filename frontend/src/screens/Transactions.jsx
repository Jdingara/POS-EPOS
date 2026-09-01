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
const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localISO(d);
};

const STATUS_LABEL = {
  COMPLETED: "completed",
  PARTIALLY_RETURNED: "part. returned",
  RETURNED: "returned",
  VOIDED: "voided",
};

const rupee = (p) => ((p || 0) / 100).toFixed(2); // plain number for spreadsheets

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

const Field = ({ label, children }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11 }}>
    <span className="muted" style={{ letterSpacing: ".3px" }}>{label}</span>
    {children}
  </label>
);

export default function Transactions() {
  const { toast } = usePos();

  // date range (drives the server fetch)
  const [preset, setPreset] = useState("7d");
  const [from, setFrom] = useState(() => daysAgoISO(6));
  const [to, setTo] = useState(() => daysAgoISO(0));

  // attribute filters (client-side)
  const [cashier, setCashier] = useState("");
  const [tender, setTender] = useState("");
  const [gst, setGst] = useState("");
  const [unitsMin, setUnitsMin] = useState("");
  const [unitsMax, setUnitsMax] = useState("");
  const [discMin, setDiscMin] = useState("");
  const [discMax, setDiscMax] = useState("");
  const [query, setQuery] = useState("");

  const [sum, setSum] = useState(null);
  const [sales, setSales] = useState([]);
  const [returns, setReturns] = useState([]);
  const [staff, setStaff] = useState([]);
  const [tab, setTab] = useState("sales");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/auth/staff").then(setStaff).catch(() => {});
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const qs = p.toString() ? "?" + p.toString() : "";
    const salesQs = new URLSearchParams(p);
    salesQs.set("kind", "sale");

    setLoading(true);
    Promise.all([
      api.get("/reports/summary" + qs),
      api.get("/sales/sales?" + salesQs.toString()),
      api.get("/sales/returns" + qs),
    ])
      .then(([s, sl, rt]) => {
        setSum(s);
        setSales(sl);
        setReturns(rt);
      })
      .catch((e) => toast(e.message, "bad"))
      .finally(() => setLoading(false));
  }, [from, to, toast]);

  function applyPreset(p) {
    setPreset(p);
    if (p === "all") {
      setFrom("");
      setTo("");
      return;
    }
    const days = p === "7d" ? 6 : p === "30d" ? 29 : 0;
    setFrom(daysAgoISO(days));
    setTo(daysAgoISO(0));
  }

  function clearFilters() {
    setCashier(""); setTender(""); setGst("");
    setUnitsMin(""); setUnitsMax(""); setDiscMin(""); setDiscMax(""); setQuery("");
  }
  const filtersActive =
    cashier || tender || gst || unitsMin || unitsMax || discMin || discMax || query;

  const q = query.trim().toLowerCase();
  const numRange = (v, lo, hi) =>
    (lo === "" || v >= +lo) && (hi === "" || v <= +hi);

  const fSales = useMemo(() => sales.filter((s) => {
    if (cashier && s.cashier_name !== cashier) return false;
    if (tender && s.tender !== tender) return false;
    if (gst && !(s.tax_rates || []).includes(+gst)) return false;
    if (!numRange(s.units, unitsMin, unitsMax)) return false;
    if (!numRange(s.discount_paise / 100, discMin, discMax)) return false;
    if (q && ![s.number, s.cashier_name, s.tender, STATUS_LABEL[s.status] || s.status]
      .join(" ").toLowerCase().includes(q)) return false;
    return true;
  }), [sales, cashier, tender, gst, unitsMin, unitsMax, discMin, discMax, q]);

  const fReturns = useMemo(() => returns.filter((r) => {
    if (cashier && r.cashier_name !== cashier) return false;
    if (tender && r.refund_method !== tender) return false;
    if (!numRange(r.units, unitsMin, unitsMax)) return false;
    if (q && ![r.number, r.original_number, r.exchange_number, r.kind, r.cashier_name, r.approved_by_name]
      .join(" ").toLowerCase().includes(q)) return false;
    return true;
  }), [returns, cashier, tender, unitsMin, unitsMax, q]);

  const ft = fSales.reduce((a, s) => ({
    total: a.total + s.total_paise, disc: a.disc + s.discount_paise,
    gst: a.gst + s.tax_paise, units: a.units + s.units,
  }), { total: 0, disc: 0, gst: 0, units: 0 });
  const frt = fReturns.reduce((a, r) => ({
    value: a.value + r.returned_value_paise, refund: a.refund + r.refund_amount_paise,
    collect: a.collect + r.collect_amount_paise, units: a.units + r.units,
  }), { value: 0, refund: 0, collect: 0, units: 0 });

  const rangeLabel =
    preset === "all" ? "all time"
      : preset === "today" ? "today"
        : `${from || "…"} → ${to || "…"}`;

  function exportCSV() {
    const stamp = `${from || "all"}_${to || ""}`.replace(/_$/, "");
    if (tab === "sales") {
      downloadCSV(
        `transactions-sales-${stamp}.csv`,
        ["Receipt", "Time", "Cashier", "Units", "Subtotal", "Discount", "GST", "GST rates", "Total", "Paid", "Status", "Units returned"],
        fSales.map((s) => [
          s.number, new Date(s.created_at).toLocaleString(), s.cashier_name, s.units,
          rupee(s.subtotal_paise), rupee(s.discount_paise), rupee(s.tax_paise),
          (s.tax_rates || []).map((r) => r + "%").join(" "),
          rupee(s.total_paise), s.tender, STATUS_LABEL[s.status] || s.status, s.returned_units,
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

  async function openSale(number) {
    try {
      setDetail(await api.get("/sales/sales/" + encodeURIComponent(number)));
    } catch (e) {
      toast(e.message, "bad");
    }
  }

  return (
    <section className="panel">
      <h2>Transactions <span className="muted" style={{ fontWeight: 400 }}>sales &amp; returns · {rangeLabel}</span></h2>
      <div className="body">
        <div className="print-only" style={{ marginBottom: 10, fontSize: 12 }}>
          THREADLINE — transactions report · {rangeLabel} · generated {new Date().toLocaleString()}
        </div>

        {/* ---------- summary ---------- */}
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

        {/* ---------- filters ---------- */}
        <div className="banner info no-print" style={{ marginTop: 14 }}>
          <div className="row wrap" style={{ gap: 8, alignItems: "flex-end" }}>
            <div className="chips" style={{ alignSelf: "center" }}>
              {[["today", "Today"], ["7d", "7d"], ["30d", "30d"], ["all", "All"]].map(([v, t]) => (
                <span key={v} className="chip click"
                  style={preset === v ? { borderColor: "var(--brand)", color: "var(--brand)", fontWeight: 700 } : undefined}
                  onClick={() => applyPreset(v)}>{t}</span>
              ))}
            </div>
            <Field label="From">
              <input type="date" style={{ width: 140 }} value={from}
                onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} />
            </Field>
            <Field label="To">
              <input type="date" style={{ width: 140 }} value={to}
                onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} />
            </Field>
          </div>

          <div className="row wrap" style={{ gap: 8, alignItems: "flex-end", marginTop: 8 }}>
            <Field label="Cashier">
              <select style={{ width: 140 }} value={cashier} onChange={(e) => setCashier(e.target.value)}>
                <option value="">Any</option>
                {staff.map((m) => <option key={m.id} value={m.username || m.full_name}>{m.full_name}</option>)}
              </select>
            </Field>
            <Field label="Paid / refund mode">
              <select style={{ width: 120 }} value={tender} onChange={(e) => setTender(e.target.value)}>
                <option value="">Any</option>
                {["CASH", "CARD", "UPI"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="GST rate">
              <select style={{ width: 90 }} value={gst} onChange={(e) => setGst(e.target.value)}>
                <option value="">Any</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
              </select>
            </Field>
            <Field label="Units (min–max)">
              <span className="row" style={{ gap: 4 }}>
                <input type="number" min="0" style={{ width: 60 }} value={unitsMin} onChange={(e) => setUnitsMin(e.target.value)} />
                <input type="number" min="0" style={{ width: 60 }} value={unitsMax} onChange={(e) => setUnitsMax(e.target.value)} />
              </span>
            </Field>
            <Field label="Discount ₹ (min–max)">
              <span className="row" style={{ gap: 4 }}>
                <input type="number" min="0" style={{ width: 80 }} value={discMin} onChange={(e) => setDiscMin(e.target.value)} />
                <input type="number" min="0" style={{ width: 80 }} value={discMax} onChange={(e) => setDiscMax(e.target.value)} />
              </span>
            </Field>
            <Field label="Search (invoice / cashier / status)">
              <input style={{ width: 220 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="INV-…" />
            </Field>
            {filtersActive && <button className="btn-ghost" onClick={clearFilters}>Clear filters</button>}
          </div>
        </div>

        {/* ---------- toolbar ---------- */}
        <div className="row wrap no-print" style={{ gap: 8, margin: "12px 0 10px" }}>
          <button className={tab === "sales" ? "btn-primary" : ""} onClick={() => setTab("sales")}>
            Sales ({fSales.length}{fSales.length !== sales.length ? ` / ${sales.length}` : ""})
          </button>
          <button className={tab === "returns" ? "btn-primary" : ""} onClick={() => setTab("returns")}>
            Returns &amp; exchanges ({fReturns.length}{fReturns.length !== returns.length ? ` / ${returns.length}` : ""})
          </button>
          <span className="grow" />
          <button onClick={() => window.print()}>Print</button>
          <button onClick={exportCSV}>Excel (CSV)</button>
        </div>

        {loading && <p className="muted">Loading…</p>}

        {!loading && tab === "sales" && (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>Receipt</th><th>Time</th><th>Cashier</th><th className="num">Units</th>
                    <th className="num">Discount</th><th className="num">GST</th><th>GST %</th>
                    <th className="num">Total</th><th>Paid</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fSales.length === 0 && <tr><td colSpan={10} className="muted" style={{ padding: 16 }}>{sales.length ? "No sales match the filters." : "No sales in this period."}</td></tr>}
                  {fSales.map((s) => (
                    <tr key={s.number} style={{ cursor: "pointer" }} onClick={() => openSale(s.number)}>
                      <td><span className="lnk">{s.number}</span></td>
                      <td className="muted">{new Date(s.created_at).toLocaleString()}</td>
                      <td>{s.cashier_name}</td>
                      <td className="num">{s.units}</td>
                      <td className="num">{s.discount_paise ? "− " + inr(s.discount_paise) : "—"}</td>
                      <td className="num">{inr(s.tax_paise)}</td>
                      <td>{(s.tax_rates || []).map((r) => r + "%").join(", ") || "—"}</td>
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
            {fSales.length > 0 && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                <b>{fSales.length}</b> sale(s) · {ft.units} units · total {inr(ft.total)} · discount {inr(ft.disc)} · GST {inr(ft.gst)}
              </p>
            )}
          </>
        )}

        {!loading && tab === "returns" && (
          <>
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
                  {fReturns.length === 0 && <tr><td colSpan={10} className="muted" style={{ padding: 16 }}>{returns.length ? "No returns match the filters." : "No returns or exchanges in this period."}</td></tr>}
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
            {fReturns.length > 0 && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                <b>{fReturns.length}</b> return(s) · {frt.units} units · value {inr(frt.value)} · refunded {inr(frt.refund)} · collected {inr(frt.collect)}
              </p>
            )}
          </>
        )}
      </div>

      {detail && <ReceiptModal sale={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}
