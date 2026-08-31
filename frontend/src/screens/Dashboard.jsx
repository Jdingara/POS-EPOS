import { useEffect, useState } from "react";
import { api } from "../api.js";
import { inr } from "../money.js";
import { usePos } from "../pos-context.jsx";

export default function Dashboard() {
  const { toast } = usePos();
  const [d, setD] = useState(null);

  useEffect(() => {
    api.get("/till/dashboard").then(setD).catch((e) => toast(e.message, "bad"));
  }, [toast]);

  if (!d) return <section className="panel"><div className="body muted">Loading…</div></section>;

  const t = d.tender_mix;
  return (
    <section className="panel">
      <h2>Sales dashboard <span className="muted" style={{ fontWeight: 400 }}>today · {d.date}</span></h2>
      <div className="body">
        <div className="cards">
          <div className="stat"><div className="lab">Transactions</div><div className="val">{d.transactions}</div></div>
          <div className="stat"><div className="lab">Units sold</div><div className="val">{d.units_sold}</div></div>
          <div className="stat"><div className="lab">Gross sales</div><div className="val">{inr(d.gross_sales_paise)}</div></div>
          <div className="stat"><div className="lab">Avg basket</div><div className="val">{inr(d.avg_basket_paise)}</div></div>
          <div className="stat"><div className="lab">Discounts given</div><div className="val">{inr(d.discounts_paise)}</div></div>
          <div className="stat"><div className="lab">Refunds</div><div className="val">{inr(d.refunds_paise)}</div></div>
          <div className="stat"><div className="lab">Exchanges</div><div className="val">{d.exchanges}</div></div>
          <div className="stat"><div className="lab">Returns</div><div className="val">{d.returns}</div></div>
        </div>

        <h3 style={{ margin: "18px 0 8px", fontSize: 12, letterSpacing: ".4px", color: "var(--muted)" }}>TENDER MIX (today)</h3>
        <div className="cards">
          <div className="stat"><div className="lab">Cash</div><div className="val">{inr(t.cash_paise)}</div></div>
          <div className="stat"><div className="lab">Card</div><div className="val">{inr(t.card_paise)}</div></div>
          <div className="stat"><div className="lab">UPI</div><div className="val">{inr(t.upi_paise)}</div></div>
        </div>

        <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>
          North-star metric per the product brief is <b>transactions per staffed hour</b>; this screen is the v1
          reporting surface HQ merchandising and finance consume.
        </p>
      </div>
    </section>
  );
}
