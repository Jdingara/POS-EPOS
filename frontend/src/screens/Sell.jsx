import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { inr, toPaise } from "../money.js";
import { usePos } from "../pos-context.jsx";
import Modal from "../components/Modal.jsx";

export default function Sell() {
  const { till, refreshTill, toast } = usePos();
  const [styles, setStyles] = useState([]);
  const [promos, setPromos] = useState([]);
  const [cart, setCart] = useState([]); // [{variant, qty}]
  const [quote, setQuote] = useState(null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState(null);
  const [modal, setModal] = useState(null); // {type, ...}
  const searchRef = useRef();

  useEffect(() => {
    api.get("/catalog/styles").then(setStyles).catch((e) => toast(e.message, "bad"));
    api.get("/catalog/promotions").then(setPromos).catch(() => {});
  }, [toast]);

  // re-price the cart whenever it changes
  useEffect(() => {
    if (cart.length === 0) {
      setQuote(null);
      return;
    }
    const items = cart.map((c) => ({ variant_id: c.variant.id, qty: c.qty }));
    api.post("/sales/quote", { items }).then(setQuote).catch((e) => toast(e.message, "bad"));
  }, [cart, toast]);

  const line = (variantId) => quote?.lines.find((l) => l.variant_id === variantId);

  function addVariant(v, qty = 1) {
    if (!v.is_sellable || v.stock <= 0) return toast(`${v.label}: out of stock`, "warn");
    setCart((c) => {
      const found = c.find((x) => x.variant.id === v.id);
      const have = found ? found.qty : 0;
      if (have + qty > v.stock) {
        toast(`${v.label}: only ${v.stock} in stock`, "warn");
        return c;
      }
      return found
        ? c.map((x) => (x.variant.id === v.id ? { ...x, qty: x.qty + qty } : x))
        : [...c, { variant: v, qty }];
    });
    setResults(null);
    setTerm("");
  }

  function setQty(id, qty) {
    setCart((c) =>
      c
        .map((x) => (x.variant.id === id ? { ...x, qty: Math.max(0, qty) } : x))
        .filter((x) => x.qty > 0)
    );
  }

  async function doSearch(e) {
    e?.preventDefault();
    if (!term.trim()) return;
    try {
      const rows = await api.get("/catalog/variants?search=" + encodeURIComponent(term.trim()));
      if (rows.length === 0) return toast(`No match for "${term}"`, "bad");
      if (rows.length === 1) return addVariant(rows[0]);
      setResults(rows);
    } catch (ex) {
      toast(ex.message, "bad");
    }
  }

  const total = quote?.total_paise || 0;
  const canPay = till.open && cart.length > 0;

  async function pay(method, extra) {
    try {
      const payments = [
        {
          method,
          amount_paise: total,
          ...(method === "CASH" ? { cash_received_paise: extra.cash } : {}),
          ...(extra?.ref ? { ref: extra.ref } : {}),
        },
      ];
      const sale = await api.post("/sales/checkout", {
        items: cart.map((c) => ({ variant_id: c.variant.id, qty: c.qty })),
        payments,
      });
      setCart([]);
      setModal({ type: "receipt", sale });
      refreshTill();
      // refresh stock numbers in the grid
      api.get("/catalog/styles").then(setStyles);
      toast(`Sale ${sale.number} completed`, "ok");
    } catch (ex) {
      toast(ex.message, "bad");
    }
  }

  return (
    <div className="grid2">
      {/* ---------------- left: catalog ---------------- */}
      <section className="panel">
        <h2>Scan / search <span className="muted" style={{ fontWeight: 400 }}>barcode, style code or name</span></h2>
        <div className="body">
          <form className="row" onSubmit={doSearch}>
            <input
              ref={searchRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="8800000000011  /  SHRT-OXF-001  /  jeans"
            />
            <button className="btn-primary">Find</button>
          </form>

          {results && (
            <div className="banner info" style={{ marginTop: 10 }}>
              <b>{results.length} matches</b>
              <table className="grid" style={{ marginTop: 6 }}>
                <tbody>
                  {results.map((v) => (
                    <tr key={v.id}>
                      <td>{v.label}<div className="muted" style={{ fontSize: 11 }}>{v.barcode}</div></td>
                      <td className="num">{inr(v.unit_price_paise)}</td>
                      <td className="num">stock {v.stock}</td>
                      <td className="num">
                        <button disabled={v.stock <= 0} onClick={() => addVariant(v)}>Add</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {promos.length > 0 && (
            <p className="muted" style={{ fontSize: 12, margin: "12px 0 4px" }}>
              LIVE OFFERS: {promos.map((p) => `${p.name}`).join("  ·  ")}
            </p>
          )}

          <h3 style={{ margin: "12px 0 8px", fontSize: 12, letterSpacing: ".4px", color: "var(--muted)" }}>
            CATALOG — tap a style to pick size &amp; colour
          </h3>
          <div className="cat-grid">
            {styles.map((s) => {
              const inStock = s.variants.reduce((n, v) => n + Math.max(0, v.stock), 0);
              return (
                <button key={s.id} className="cat-card" onClick={() => setModal({ type: "pick", style: s })}>
                  <span className="nm">{s.name}</span>
                  <span className="pr">{inr(s.mrp_paise)}</span>
                  <span className="sub">{s.brand_name} · {s.category_name} · {s.season}</span>
                  <span className="sub">{s.variants.length} variants · {inStock} in stock</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- right: cart ---------------- */}
      <section className="panel">
        <h2>Current sale</h2>
        <div className="body">
          {!till.open && (
            <div className="banner warn">Open the till (Till / Cash tab) to take payment.</div>
          )}

          <table className="grid">
            <thead>
              <tr><th>Item</th><th className="num">Price</th><th className="num">Qty</th><th className="num">Amount</th><th /></tr>
            </thead>
            <tbody>
              {cart.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ padding: 18 }}>Cart is empty — scan or tap a style.</td></tr>
              )}
              {cart.map((c) => {
                const l = line(c.variant.id);
                return (
                  <tr key={c.variant.id}>
                    <td>
                      {c.variant.label}
                      {l?.promo_name && <span className="badge">{l.promo_name}</span>}
                      <div className="muted" style={{ fontSize: 11 }}>{c.variant.barcode} · {l ? l.tax_rate : "…"}% GST</div>
                    </td>
                    <td className="num">{inr(c.variant.unit_price_paise)}</td>
                    <td className="num">
                      <span className="qty">
                        <button onClick={() => setQty(c.variant.id, c.qty - 1)}>−</button>
                        {c.qty}
                        <button onClick={() => setQty(c.variant.id, c.qty + 1)}>+</button>
                      </span>
                    </td>
                    <td className="num">
                      {l ? inr(l.line_total_paise) : "…"}
                      {l?.discount_paise > 0 && (
                        <div className="muted" style={{ fontSize: 11 }}>was {inr(l.gross_paise)}</div>
                      )}
                    </td>
                    <td className="num"><button className="lnk" onClick={() => setQty(c.variant.id, 0)}>remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {quote && (
            <div className="totals">
              <div className="g">Subtotal (MRP)</div><div className="num">{inr(quote.subtotal_paise)}</div>
              {quote.discount_paise > 0 && (<><div className="g">Promotions</div><div className="num">− {inr(quote.discount_paise)}</div></>)}
              {Object.entries(quote.tax_breakup).map(([rate, b]) => (
                <div key={rate} style={{ display: "contents" }}>
                  <div className="g">incl. GST @ {rate}%</div><div className="num">{inr(b.tax_paise)}</div>
                </div>
              ))}
              <div className="tot">TOTAL</div><div className="tot num">{inr(quote.total_paise)}</div>
            </div>
          )}

          <div className="pay-row">
            <button disabled={!canPay} onClick={() => setModal({ type: "cash" })}>Cash</button>
            <button disabled={!canPay} onClick={() => setModal({ type: "card" })}>Card</button>
            <button disabled={!canPay} onClick={() => setModal({ type: "upi" })}>UPI</button>
          </div>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <button className="btn-ghost" disabled={!cart.length} onClick={() => setCart([])}>Void sale</button>
            <span className="muted" style={{ fontSize: 12 }}>{cart.length} line(s)</span>
          </div>
        </div>
      </section>

      {/* ---------------- modals ---------------- */}
      {modal?.type === "pick" && (
        <VariantPicker style={modal.style} onPick={(v) => { addVariant(v); setModal(null); }} onClose={() => setModal(null)} />
      )}
      {modal?.type === "cash" && (
        <CashModal total={total} onClose={() => setModal(null)} onConfirm={(cash) => { setModal(null); pay("CASH", { cash }); }} />
      )}
      {modal?.type === "card" && (
        <SimModal
          title={`Card payment · ${inr(total)}`} body="Insert / tap card on the terminal."
          okLabel="Approved" badLabel="Declined"
          onClose={() => setModal(null)}
          onOk={() => { setModal(null); pay("CARD", { ref: "AUTH" + Math.floor(Math.random() * 1e6) }); }}
          onBad={() => { setModal(null); toast("Card declined — try another method", "warn"); }}
        />
      )}
      {modal?.type === "upi" && (
        <SimModal
          title={`UPI payment · ${inr(total)}`} body="Customer scans the QR with any UPI app (threadline@upi)."
          okLabel="Payment received" badLabel="Failed / timeout"
          onClose={() => setModal(null)}
          onOk={() => { setModal(null); pay("UPI", { ref: String(Math.floor(Math.random() * 1e12)) }); }}
          onBad={() => { setModal(null); toast("UPI not confirmed — ask customer to retry", "warn"); }}
        />
      )}
      {modal?.type === "receipt" && (
        <ReceiptModal sale={modal.sale} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function VariantPicker({ style, onPick, onClose }) {
  const colors = [...new Set(style.variants.map((v) => v.color))];
  const sizes = [...new Set(style.variants.map((v) => v.size))];
  return (
    <Modal title={`${style.name} — ${style.style_code}`} wide onClose={onClose}
      foot={<button onClick={onClose}>Close</button>}>
      {colors.map((color) => (
        <div key={color} style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{color}</div>
          <div className="vgrid">
            {sizes.map((size) => {
              const v = style.variants.find((x) => x.color === color && x.size === size);
              if (!v) return <span key={size} />;
              return (
                <button key={size} className={"vbtn" + (v.stock <= 0 ? " out" : "")}
                  disabled={v.stock <= 0} onClick={() => onPick(v)}>
                  <div className="sz">{size}</div>
                  <div className="muted">stock {v.stock}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </Modal>
  );
}

function CashModal({ total, onClose, onConfirm }) {
  const [cash, setCash] = useState(Math.ceil(total / 100) * 100);
  const change = Math.max(0, cash - total);
  const k = Math.ceil(total / 1000) * 1000; // next whole ₹10
  const quick = [...new Set([total, Math.ceil(total / 100) * 100, k, k + 50000, k + 100000, k + 200000])];
  return (
    <Modal title={`Cash payment · ${inr(total)}`} onClose={onClose}
      foot={<>
        <button onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={cash < total} onClick={() => onConfirm(cash)}>Take payment</button>
      </>}>
      <div className="kv"><div>Amount due</div><div><b>{inr(total)}</b></div></div>
      <label style={{ display: "block", margin: "12px 0 4px" }}>Cash tendered (₹)</label>
      <input type="number" value={cash / 100} onChange={(e) => setCash(toPaise(e.target.value))} />
      <div className="chips" style={{ marginTop: 8 }}>
        {quick.map((q) => <span key={q} className="chip click" onClick={() => setCash(q)}>{inr(q)}</span>)}
      </div>
      <div className="kv" style={{ marginTop: 12 }}><div>Change due</div><div><b>{inr(change)}</b></div></div>
      {cash < total && <div className="banner bad" style={{ marginTop: 10 }}>Insufficient cash tendered</div>}
    </Modal>
  );
}

function SimModal({ title, body, okLabel, badLabel, onOk, onBad, onClose }) {
  return (
    <Modal title={title} onClose={onClose}
      foot={<>
        <button className="btn-danger" onClick={onBad}>{badLabel}</button>
        <button className="btn-primary" onClick={onOk}>{okLabel}</button>
      </>}>
      <div className="banner info">{body}</div>
      <p className="muted">Simulate the terminal / PSP response — payments are sandboxed.</p>
    </Modal>
  );
}

export function ReceiptModal({ sale, onClose }) {
  const p = sale.payments.find((x) => x.method !== "STORE_CREDIT") || sale.payments[0];
  return (
    <Modal title="Receipt" onClose={onClose}
      foot={<button className="btn-primary" onClick={onClose}>New sale</button>}>
      <div className="receipt">
        <div style={{ textAlign: "center" }}>
          <div className="r-big">THREADLINE</div>
          <div>Fashion &amp; Apparel · GSTIN 33ABCDE1234F1Z5</div>
          <div>{new Date(sale.created_at).toLocaleString()}</div>
        </div>
        <hr />
        <div className="r-row"><span>Receipt</span><span>{sale.number}</span></div>
        <div className="r-row"><span>Cashier</span><span>{sale.cashier_name}</span></div>
        <hr />
        {sale.lines.map((l) => (
          <div key={l.id}>
            <div className="r-row"><span>{l.description}</span><span>{inr(l.line_total_paise)}</span></div>
            <div className="r-row muted">
              <span>&nbsp;&nbsp;{l.qty} × {inr(l.unit_price_paise)}{l.discount_paise ? `  −${inr(l.discount_paise)} ${l.promo_name}` : ""}</span>
              <span>{l.tax_rate}%</span>
            </div>
          </div>
        ))}
        <hr />
        <div className="r-row"><span>Subtotal</span><span>{inr(sale.subtotal_paise)}</span></div>
        {sale.discount_paise > 0 && <div className="r-row"><span>Promotions</span><span>− {inr(sale.discount_paise)}</span></div>}
        <div className="r-row"><span>GST included</span><span>{inr(sale.tax_paise)}</span></div>
        <div className="r-row r-big"><span>TOTAL</span><span>{inr(sale.total_paise)}</span></div>
        <hr />
        <div className="r-row"><span>Paid — {p?.method}</span><span>{inr(p?.amount_paise || 0)}</span></div>
        {p?.change_paise != null && (
          <div className="r-row"><span>Cash / change</span><span>{inr(p.cash_received_paise)} / {inr(p.change_paise)}</span></div>
        )}
        <hr />
        <div style={{ textAlign: "center" }}>Exchange or return within 30 days with this receipt</div>
      </div>
    </Modal>
  );
}
