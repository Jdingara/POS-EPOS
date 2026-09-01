import { useEffect, useState } from "react";
import { api } from "../api.js";
import { inr, toPaise } from "../money.js";
import { usePos } from "../pos-context.jsx";

const SCOPES = [
  ["ALL", "Whole store"],
  ["CATEGORY", "Category"],
  ["BRAND", "Brand"],
  ["STYLES", "Specific styles"],
];

const F = ({ label, children }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, marginBottom: 8 }}>
    <span className="muted">{label}</span>
    {children}
  </label>
);

export default function BackOffice() {
  const { toast } = usePos();
  const [section, setSection] = useState("catalog");

  return (
    <section className="panel">
      <h2>Back Office <span className="muted" style={{ fontWeight: 400 }}>catalog, pricing &amp; promotions · manager only</span></h2>
      <div className="body">
        <div className="chips" style={{ marginBottom: 14 }}>
          {[["catalog", "Catalog & pricing"], ["promotions", "Promotions"], ["setup", "Categories & brands"]].map(([v, t]) => (
            <span key={v} className="chip click"
              style={section === v ? { borderColor: "var(--brand)", color: "var(--brand)", fontWeight: 700 } : undefined}
              onClick={() => setSection(v)}>{t}</span>
          ))}
        </div>
        {section === "catalog" && <Catalog toast={toast} />}
        {section === "promotions" && <Promotions toast={toast} />}
        {section === "setup" && <Setup toast={toast} />}
      </div>
    </section>
  );
}

/* ============================ CATALOG ============================ */
function blankStyle() {
  return { style_code: "", name: "", brand: "", category: "", season: "Core", hsn: "6109", mrp: "", tax_rate_override: "", is_active: true };
}
function blankVariant() {
  return { id: null, size: "", color: "", barcode: "", price: "", stock: 0, is_sellable: true };
}

function Catalog({ toast }) {
  const [styles, setStyles] = useState([]);
  const [cats, setCats] = useState([]);
  const [brands, setBrands] = useState([]);
  const [sel, setSel] = useState(null);      // style id being edited, or "new"
  const [sd, setSd] = useState(blankStyle()); // style draft
  const [vd, setVd] = useState(blankVariant()); // variant draft
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([
    api.get("/catalog/styles?all=1"),
    api.get("/catalog/categories"),
    api.get("/catalog/brands"),
  ]).then(([s, c, b]) => { setStyles(s); setCats(c); setBrands(b); }).catch((e) => toast(e.message, "bad"));

  useEffect(() => { load(); }, []); // eslint-disable-line

  const current = sel && sel !== "new" ? styles.find((s) => s.id === sel) : null;

  function pick(s) {
    setSel(s.id);
    setSd({
      style_code: s.style_code, name: s.name, brand: s.brand, category: s.category,
      season: s.season, hsn: s.hsn, mrp: (s.mrp_paise / 100).toString(),
      tax_rate_override: s.tax_rate_override ?? "", is_active: s.is_active,
    });
    setVd(blankVariant());
  }
  function newStyle() {
    setSel("new");
    setSd(blankStyle());
    setVd(blankVariant());
  }

  async function saveStyle() {
    if (!sd.style_code || !sd.name || !sd.brand || !sd.category || !sd.mrp)
      return toast("Style code, name, brand, category and MRP are required", "warn");
    setBusy(true);
    const body = {
      style_code: sd.style_code, name: sd.name, brand: sd.brand, category: sd.category,
      season: sd.season, hsn: sd.hsn, mrp_paise: toPaise(sd.mrp),
      tax_rate_override: sd.tax_rate_override === "" ? null : Number(sd.tax_rate_override),
      is_active: sd.is_active,
    };
    try {
      const saved = sel === "new"
        ? await api.post("/catalog/styles", body)
        : await api.patch(`/catalog/styles/${sel}`, body);
      await load();
      setSel(saved.id);
      toast("Style saved", "ok");
    } catch (e) { toast(e.message, "bad"); }
    finally { setBusy(false); }
  }

  async function saveVariant() {
    if (!current) return;
    if (!vd.size || !vd.color) return toast("Size and colour are required", "warn");
    const body = {
      style: current.id, size: vd.size, color: vd.color,
      barcode: vd.barcode || "",
      price_paise: vd.price === "" ? null : toPaise(vd.price),
      stock: Number(vd.stock) || 0, is_sellable: vd.is_sellable,
    };
    try {
      if (vd.id) await api.patch(`/catalog/variants/${vd.id}`, body);
      else await api.post("/catalog/variants", body);
      await load();
      setVd(blankVariant());
      toast("Variant saved", "ok");
    } catch (e) { toast(e.message, "bad"); }
  }

  async function toggleStyleActive(s) {
    try {
      await api.patch(`/catalog/styles/${s.id}`, { is_active: !s.is_active });
      await load();
    } catch (e) { toast(e.message, "bad"); }
  }

  return (
    <div className="grid2">
      {/* list */}
      <div>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <b>Styles ({styles.length})</b>
          <button className="btn-primary" onClick={newStyle}>+ New style</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="grid">
            <thead><tr><th>Code</th><th>Name</th><th>Brand</th><th className="num">MRP</th><th className="num">Var.</th><th></th></tr></thead>
            <tbody>
              {styles.map((s) => (
                <tr key={s.id} style={{ cursor: "pointer", opacity: s.is_active ? 1 : 0.5 }}>
                  <td onClick={() => pick(s)}><span className="lnk">{s.style_code}</span></td>
                  <td onClick={() => pick(s)}>{s.name}</td>
                  <td onClick={() => pick(s)}>{s.brand_name}</td>
                  <td className="num" onClick={() => pick(s)}>{inr(s.mrp_paise)}</td>
                  <td className="num" onClick={() => pick(s)}>{s.variants.length}</td>
                  <td><button onClick={() => toggleStyleActive(s)}>{s.is_active ? "Deactivate" : "Activate"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* editor */}
      <div>
        {!sel && <p className="muted">Pick a style to edit, or add a new one.</p>}
        {sel && (
          <>
            <b>{sel === "new" ? "New style" : `Edit ${sd.style_code}`}</b>
            <div style={{ marginTop: 8 }}>
              <F label="Style code"><input value={sd.style_code} disabled={sel !== "new"} onChange={(e) => setSd({ ...sd, style_code: e.target.value })} /></F>
              <F label="Name"><input value={sd.name} onChange={(e) => setSd({ ...sd, name: e.target.value })} /></F>
              <div className="row" style={{ gap: 8 }}>
                <F label="Brand">
                  <select value={sd.brand} onChange={(e) => setSd({ ...sd, brand: e.target.value })}>
                    <option value="">—</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </F>
                <F label="Category">
                  <select value={sd.category} onChange={(e) => setSd({ ...sd, category: e.target.value })}>
                    <option value="">—</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </F>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <F label="Season"><input value={sd.season} onChange={(e) => setSd({ ...sd, season: e.target.value })} /></F>
                <F label="HSN"><input value={sd.hsn} onChange={(e) => setSd({ ...sd, hsn: e.target.value })} /></F>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <F label="MRP ₹ (tax-incl.)"><input type="number" value={sd.mrp} onChange={(e) => setSd({ ...sd, mrp: e.target.value })} /></F>
                <F label="GST % override (blank = auto 5/12)"><input type="number" value={sd.tax_rate_override} onChange={(e) => setSd({ ...sd, tax_rate_override: e.target.value })} /></F>
              </div>
              <label className="row" style={{ gap: 6, fontSize: 13 }}>
                <input type="checkbox" style={{ width: "auto" }} checked={sd.is_active} onChange={(e) => setSd({ ...sd, is_active: e.target.checked })} /> Active (sellable)
              </label>
              <button className="btn-primary" style={{ marginTop: 10 }} disabled={busy} onClick={saveStyle}>Save style</button>
            </div>

            {current && (
              <div style={{ marginTop: 18 }}>
                <b>Variants — {current.name}</b>
                <table className="grid" style={{ marginTop: 6 }}>
                  <thead><tr><th>Size</th><th>Colour</th><th>Barcode</th><th className="num">Price</th><th className="num">Stock</th><th>Sellable</th><th></th></tr></thead>
                  <tbody>
                    {current.variants.map((v) => (
                      <tr key={v.id}>
                        <td>{v.size}</td><td>{v.color}</td><td>{v.barcode}</td>
                        <td className="num">{inr(v.unit_price_paise)}</td>
                        <td className="num">{v.stock}</td>
                        <td>{v.is_sellable ? "yes" : "no"}</td>
                        <td><button onClick={() => setVd({ id: v.id, size: v.size, color: v.color, barcode: v.barcode, price: v.price_paise != null ? (v.price_paise / 100).toString() : "", stock: v.stock, is_sellable: v.is_sellable })}>edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="banner info" style={{ marginTop: 10 }}>
                  <b>{vd.id ? "Edit variant" : "Add variant"}</b>
                  <div className="row wrap" style={{ gap: 8, alignItems: "flex-end", marginTop: 6 }}>
                    <F label="Size"><input style={{ width: 70 }} value={vd.size} onChange={(e) => setVd({ ...vd, size: e.target.value })} /></F>
                    <F label="Colour"><input style={{ width: 110 }} value={vd.color} onChange={(e) => setVd({ ...vd, color: e.target.value })} /></F>
                    <F label="Barcode (blank = auto)"><input style={{ width: 150 }} value={vd.barcode} onChange={(e) => setVd({ ...vd, barcode: e.target.value })} /></F>
                    <F label="Price ₹ (blank = MRP)"><input type="number" style={{ width: 100 }} value={vd.price} onChange={(e) => setVd({ ...vd, price: e.target.value })} /></F>
                    <F label={vd.id ? "Stock" : "Opening stock"}><input type="number" style={{ width: 80 }} value={vd.stock} onChange={(e) => setVd({ ...vd, stock: e.target.value })} /></F>
                    <label className="row" style={{ gap: 4, fontSize: 12, marginBottom: 8 }}>
                      <input type="checkbox" style={{ width: "auto" }} checked={vd.is_sellable} onChange={(e) => setVd({ ...vd, is_sellable: e.target.checked })} /> sellable
                    </label>
                    <button className="btn-primary" style={{ marginBottom: 8 }} onClick={saveVariant}>{vd.id ? "Update" : "Add"}</button>
                    {vd.id && <button style={{ marginBottom: 8 }} onClick={() => setVd(blankVariant())}>Cancel</button>}
                  </div>
                </div>
              </div>
            )}
            {sel === "new" && <p className="muted" style={{ marginTop: 10 }}>Save the style first, then add its size/colour variants.</p>}
          </>
        )}
      </div>
    </div>
  );
}

/* ============================ PROMOTIONS ============================ */
function blankPromo() {
  const t = new Date().toISOString().slice(0, 10);
  return { name: "", scope: "CATEGORY", category: "", brand: "", styles: [], percent: 10, starts_on: t, ends_on: t, min_qty: 1, max_discount: "", active: true };
}

function Promotions({ toast }) {
  const [promos, setPromos] = useState([]);
  const [styles, setStyles] = useState([]);
  const [cats, setCats] = useState([]);
  const [brands, setBrands] = useState([]);
  const [sel, setSel] = useState(null);
  const [pd, setPd] = useState(blankPromo());

  const load = () => Promise.all([
    api.get("/catalog/promotions?all=1"),
    api.get("/catalog/styles?all=1"),
    api.get("/catalog/categories"),
    api.get("/catalog/brands"),
  ]).then(([p, s, c, b]) => { setPromos(p); setStyles(s); setCats(c); setBrands(b); }).catch((e) => toast(e.message, "bad"));

  useEffect(() => { load(); }, []); // eslint-disable-line

  function pick(p) {
    setSel(p.id);
    setPd({
      name: p.name, scope: p.scope, category: p.category ?? "", brand: p.brand ?? "",
      styles: p.styles || [], percent: p.percent, starts_on: p.starts_on, ends_on: p.ends_on,
      min_qty: p.min_qty, max_discount: p.max_discount_paise != null ? (p.max_discount_paise / 100).toString() : "",
      active: p.active,
    });
  }

  async function save() {
    if (!pd.name || !pd.percent) return toast("Name and percent are required", "warn");
    const body = {
      name: pd.name, scope: pd.scope,
      category: pd.scope === "CATEGORY" ? pd.category || null : null,
      brand: pd.scope === "BRAND" ? pd.brand || null : null,
      styles: pd.scope === "STYLES" ? pd.styles : [],
      percent: Number(pd.percent), starts_on: pd.starts_on, ends_on: pd.ends_on,
      min_qty: Number(pd.min_qty) || 1,
      max_discount_paise: pd.max_discount === "" ? null : toPaise(pd.max_discount),
      active: pd.active,
    };
    try {
      if (sel) await api.patch(`/catalog/promotions/${sel}`, body);
      else await api.post("/catalog/promotions", body);
      await load();
      setSel(null); setPd(blankPromo());
      toast("Promotion saved", "ok");
    } catch (e) { toast(e.message, "bad"); }
  }
  async function remove(id) {
    if (!confirm("Delete this promotion?")) return;
    try { await api.del(`/catalog/promotions/${id}`); await load(); if (sel === id) { setSel(null); setPd(blankPromo()); } }
    catch (e) { toast(e.message, "bad"); }
  }

  return (
    <div className="grid2">
      <div>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <b>Promotions ({promos.length})</b>
          <button className="btn-primary" onClick={() => { setSel(null); setPd(blankPromo()); }}>+ New</button>
        </div>
        <table className="grid">
          <thead><tr><th>Name</th><th className="num">%</th><th>Window</th><th>Live</th><th></th></tr></thead>
          <tbody>
            {promos.map((p) => (
              <tr key={p.id} style={{ cursor: "pointer" }}>
                <td onClick={() => pick(p)}><span className="lnk">{p.name}</span><div className="muted" style={{ fontSize: 11 }}>{p.scope_label}</div></td>
                <td className="num" onClick={() => pick(p)}>{p.percent}%</td>
                <td onClick={() => pick(p)} className="muted" style={{ fontSize: 11 }}>{p.starts_on} → {p.ends_on}</td>
                <td onClick={() => pick(p)}>{p.active ? "yes" : "no"}</td>
                <td><button className="btn-danger" onClick={() => remove(p.id)}>del</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <b>{sel ? "Edit promotion" : "New promotion"}</b>
        <div style={{ marginTop: 8 }}>
          <F label="Name"><input value={pd.name} onChange={(e) => setPd({ ...pd, name: e.target.value })} /></F>
          <F label="Scope">
            <select value={pd.scope} onChange={(e) => setPd({ ...pd, scope: e.target.value })}>
              {SCOPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </F>
          {pd.scope === "CATEGORY" && (
            <F label="Category">
              <select value={pd.category} onChange={(e) => setPd({ ...pd, category: e.target.value })}>
                <option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </F>
          )}
          {pd.scope === "BRAND" && (
            <F label="Brand">
              <select value={pd.brand} onChange={(e) => setPd({ ...pd, brand: e.target.value })}>
                <option value="">—</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </F>
          )}
          {pd.scope === "STYLES" && (
            <F label="Styles">
              <div style={{ maxHeight: 140, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
                {styles.map((s) => (
                  <label key={s.id} className="row" style={{ gap: 6, fontSize: 12 }}>
                    <input type="checkbox" style={{ width: "auto" }}
                      checked={pd.styles.includes(s.id)}
                      onChange={(e) => setPd({ ...pd, styles: e.target.checked ? [...pd.styles, s.id] : pd.styles.filter((x) => x !== s.id) })} />
                    {s.style_code} · {s.name}
                  </label>
                ))}
              </div>
            </F>
          )}
          <div className="row" style={{ gap: 8 }}>
            <F label="Percent %"><input type="number" style={{ width: 80 }} value={pd.percent} onChange={(e) => setPd({ ...pd, percent: e.target.value })} /></F>
            <F label="Min qty"><input type="number" style={{ width: 80 }} value={pd.min_qty} onChange={(e) => setPd({ ...pd, min_qty: e.target.value })} /></F>
            <F label="Max discount ₹ (cap)"><input type="number" style={{ width: 120 }} value={pd.max_discount} onChange={(e) => setPd({ ...pd, max_discount: e.target.value })} /></F>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <F label="Starts"><input type="date" value={pd.starts_on} onChange={(e) => setPd({ ...pd, starts_on: e.target.value })} /></F>
            <F label="Ends"><input type="date" value={pd.ends_on} onChange={(e) => setPd({ ...pd, ends_on: e.target.value })} /></F>
          </div>
          <label className="row" style={{ gap: 6, fontSize: 13 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={pd.active} onChange={(e) => setPd({ ...pd, active: e.target.checked })} /> Active
          </label>
          <button className="btn-primary" style={{ marginTop: 10 }} onClick={save}>Save promotion</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ SETUP ============================ */
function Setup({ toast }) {
  const [cats, setCats] = useState([]);
  const [brands, setBrands] = useState([]);
  const [cName, setCName] = useState("");
  const [bName, setBName] = useState("");

  const load = () => Promise.all([api.get("/catalog/categories"), api.get("/catalog/brands")])
    .then(([c, b]) => { setCats(c); setBrands(b); }).catch((e) => toast(e.message, "bad"));
  useEffect(() => { load(); }, []); // eslint-disable-line

  async function addCat() {
    if (!cName.trim()) return;
    try { await api.post("/catalog/categories", { name: cName.trim() }); setCName(""); load(); toast("Category added", "ok"); }
    catch (e) { toast(e.message, "bad"); }
  }
  async function addBrand() {
    if (!bName.trim()) return;
    try { await api.post("/catalog/brands", { name: bName.trim() }); setBName(""); load(); toast("Brand added", "ok"); }
    catch (e) { toast(e.message, "bad"); }
  }

  return (
    <div className="grid2">
      <div>
        <b>Categories ({cats.length})</b>
        <ul>{cats.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
        <div className="row" style={{ gap: 8 }}>
          <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="New category" />
          <button className="btn-primary" onClick={addCat}>Add</button>
        </div>
      </div>
      <div>
        <b>Brands ({brands.length})</b>
        <ul>{brands.map((b) => <li key={b.id}>{b.name}</li>)}</ul>
        <div className="row" style={{ gap: 8 }}>
          <input value={bName} onChange={(e) => setBName(e.target.value)} placeholder="New brand" />
          <button className="btn-primary" onClick={addBrand}>Add</button>
        </div>
      </div>
    </div>
  );
}
