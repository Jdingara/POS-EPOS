import { useEffect, useState } from "react";
import { api } from "../api.js";
import { inr } from "../money.js";
import { usePos } from "../pos-context.jsx";

/* ------------------------------------------------------------------ *
 *  small inline-SVG charts (no chart library; palette per dataviz skill:
 *  sequential blue #2a78d6, categorical blue/orange/aqua for tender)
 * ------------------------------------------------------------------ */
const S1 = "#2a78d6", S2 = "#eb6834", S3 = "#1baf7a";
const GRID = "var(--viz-grid)", SURFACE = "var(--viz-surface)";
const niceTop = (v) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / p) * p;
};
const roundTopRect = (x, y, w, h, r) => {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
};

function TrendChart({ data }) {
  const W = 520, H = 168, L = 46, R = 14, T = 12, B = 24;
  const iw = W - L - R, ih = H - T - B;
  const max = niceTop(Math.max(1, ...data.map((d) => d.gross_paise)));
  const x = (i) => L + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => T + ih - (v / max) * ih;
  const pts = data.map((d, i) => [x(i), y(d.gross_paise)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0] + "," + p[1]).join(" ");
  const area = `M${pts[0][0]},${T + ih} ` + pts.map((p) => `L${p[0]},${p[1]}`).join(" ") + ` L${pts.at(-1)[0]},${T + ih} Z`;
  const ticks = [0, max / 2, max];
  const last = data.at(-1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="7-day sales trend">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} />
          <text x={L - 6} y={y(t) + 3} textAnchor="end" style={{ fontVariantNumeric: "tabular-nums" }}>
            {t >= 100000 ? "₹" + Math.round(t / 100000) + "L" : "₹" + Math.round(t / 100).toLocaleString("en-IN")}
          </text>
        </g>
      ))}
      <path d={area} fill="var(--viz-s1-wash)" />
      <path d={line} fill="none" stroke={S1} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={S1} stroke={SURFACE} strokeWidth="2">
          <title>{data[i].date}: {inr(data[i].gross_paise)} · {data[i].txns} txns</title>
        </circle>
      ))}
      <text x={pts.at(-1)[0] - 4} y={pts.at(-1)[1] - 9} textAnchor="end" fill="var(--viz-ink)" fontWeight="700">
        {inr(last.gross_paise)}
      </text>
      {data.map((d, i) => (
        <text key={i} x={x(i)} y={H - 7} textAnchor="middle">{d.date.slice(5)}</text>
      ))}
    </svg>
  );
}

function HourColumns({ data }) {
  const W = 520, H = 168, L = 40, R = 12, T = 12, B = 22;
  const iw = W - L - R, ih = H - T - B;
  const max = niceTop(Math.max(1, ...data.map((d) => d.sales_paise)));
  const band = iw / data.length;
  const bw = Math.min(24, band - 2);
  const y = (v) => T + ih - (v / max) * ih;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Sales by hour today">
      {[0, max / 2, max].map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} />
          <text x={L - 6} y={y(t) + 3} textAnchor="end" style={{ fontVariantNumeric: "tabular-nums" }}>
            {"₹" + Math.round(t / 100).toLocaleString("en-IN")}
          </text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={T + ih} y2={T + ih} stroke="var(--viz-axis)" />
      {data.map((d, i) => {
        const bx = L + i * band + (band - bw) / 2;
        const h = d.sales_paise > 0 ? Math.max(2, (d.sales_paise / max) * ih) : 0;
        return (
          <g key={i}>
            {h > 0 && <path d={roundTopRect(bx, T + ih - h, bw, h, 4)} fill={S1}>
              <title>{String(d.hour).padStart(2, "0")}:00 — {inr(d.sales_paise)} · {d.txns} txn(s)</title>
            </path>}
            {i % 2 === 0 && <text x={bx + bw / 2} y={H - 6} textAnchor="middle">{d.hour}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function TenderBar({ mix }) {
  const parts = [
    { k: "Cash", v: mix.cash_paise, c: S1 },
    { k: "Card", v: mix.card_paise, c: S2 },
    { k: "UPI", v: mix.upi_paise, c: S3 },
  ];
  const total = parts.reduce((a, p) => a + Math.max(0, p.v), 0);
  const W = 520, H = 34, r = 4, gap = 2;
  let cx = 0;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Tender mix today">
        {total === 0 && <text x={W / 2} y={H / 2 + 4} textAnchor="middle">No sales yet today</text>}
        {total > 0 && parts.map((p, i) => {
          const w = Math.max(0, (Math.max(0, p.v) / total) * (W - gap * (parts.filter((x) => x.v > 0).length - 1)));
          if (w <= 0) return null;
          const x = cx; cx += w + gap;
          const pct = Math.round((p.v / total) * 100);
          return (
            <g key={i}>
              <rect x={x} y={0} width={w} height={H} rx={r} fill={p.c}>
                <title>{p.k}: {inr(p.v)} ({pct}%)</title>
              </rect>
              {w > 44 && <text x={x + w / 2} y={H / 2 + 4} textAnchor="middle" fill="#fff" fontWeight="700">{pct}%</text>}
            </g>
          );
        })}
      </svg>
      <div className="dash-legend">
        {parts.map((p) => (
          <span key={p.k}><i className="dot" style={{ background: p.c }} />{p.k} {inr(p.v)}</span>
        ))}
      </div>
    </>
  );
}

function RankBars({ rows, label, value, fmt }) {
  if (!rows.length) return <p className="muted" style={{ fontSize: 13 }}>No data yet today.</p>;
  const W = 520, rowH = 26, gap = 6, labelW = 130, valW = 112;
  const barMax = W - labelW - valW;
  const max = Math.max(1, ...rows.map((r) => r[value]));
  const H = rows.length * (rowH + gap);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
      {rows.map((r, i) => {
        const yy = i * (rowH + gap);
        const w = Math.max(2, (r[value] / max) * barMax);
        return (
          <g key={i}>
            <text x={0} y={yy + rowH / 2 + 4} fill="var(--viz-ink)">
              {String(r[label]).length > 20 ? String(r[label]).slice(0, 19) + "…" : r[label]}
            </text>
            <rect x={labelW} y={yy + 3} width={w} height={rowH - 6} rx="4" fill={S1}>
              <title>{r[label]}: {fmt(r)}</title>
            </rect>
            <text x={labelW + w + 6} y={yy + rowH / 2 + 4} fill="var(--viz-ink-2)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmt(r)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
export default function Dashboard() {
  const { toast } = usePos();
  const [d, setD] = useState(null);

  useEffect(() => {
    api.get("/till/dashboard").then(setD).catch((e) => toast(e.message, "bad"));
  }, [toast]);

  if (!d) return <section className="panel"><div className="body muted">Loading…</div></section>;

  const prior = d.last_7_days.slice(0, 6);
  const avg7 = prior.length ? prior.reduce((a, x) => a + x.gross_paise, 0) / prior.length : 0;
  const deltaPct = avg7 > 0 ? Math.round(((d.gross_sales_paise - avg7) / avg7) * 100) : null;
  const discRate = d.gross_sales_paise + d.discounts_paise > 0
    ? Math.round((d.discounts_paise / (d.gross_sales_paise + d.discounts_paise)) * 100) : 0;

  const tiles = [
    ["Transactions", d.transactions],
    ["Units sold", d.units_sold],
    ["Avg basket", inr(d.avg_basket_paise)],
    ["Discount rate", discRate + "%"],
    ["GST collected", inr(d.tax_paise)],
    ["Refunds", inr(d.refunds_paise)],
    ["Exchanges", d.exchanges],
    ["Returns", d.returns],
  ];

  return (
    <section className="panel">
      <h2>Sales dashboard <span className="muted" style={{ fontWeight: 400 }}>today · {d.date}</span></h2>
      <div className="body dash">
        {/* hero */}
        <div className="dash-hero">
          <div>
            <div className="dash-hero-lab">Net sales today</div>
            <div className="dash-hero-big">{inr(d.net_sales_paise)}</div>
          </div>
          {deltaPct !== null && (
            <div className={"dash-delta " + (deltaPct >= 0 ? "up" : "down")}>
              {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct)}% <span className="muted" style={{ fontWeight: 400 }}>vs 7-day avg</span>
            </div>
          )}
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div className="dash-hero-lab">Gross</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{inr(d.gross_sales_paise)}</div>
          </div>
        </div>

        {/* stat tiles */}
        <div className="dash-tiles">
          {tiles.map(([k, v]) => (
            <div className="dash-tile" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>
          ))}
        </div>

        {/* charts */}
        <div className="dash-charts">
          <div className="dash-card">
            <h3>7-day sales trend</h3>
            <TrendChart data={d.last_7_days} />
          </div>
          <div className="dash-card">
            <h3>Sales by hour · today</h3>
            <HourColumns data={d.by_hour} />
          </div>
          <div className="dash-card">
            <h3>Tender mix · today</h3>
            <TenderBar mix={d.tender_mix} />
          </div>
          <div className="dash-card">
            <h3>Top styles · today (by units)</h3>
            <RankBars rows={d.top_styles} label="style" value="units"
              fmt={(r) => `${r.units}u · ${inr(r.revenue_paise)}`} />
          </div>
          <div className="dash-card" style={{ gridColumn: "1 / -1" }}>
            <h3>Category mix · today (by revenue)</h3>
            <RankBars rows={d.category_mix} label="category" value="revenue_paise"
              fmt={(r) => inr(r.revenue_paise)} />
          </div>
        </div>

        <p className="muted" style={{ fontSize: 12 }}>
          North-star metric per the product brief is <b>transactions per staffed hour</b>. This screen is today only —
          use <b>Transactions</b> for date ranges, filters and export.
        </p>
      </div>
    </section>
  );
}
