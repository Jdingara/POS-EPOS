import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { usePos } from "./pos-context.jsx";
import { inr } from "./money.js";
import Login from "./screens/Login.jsx";
import Sell from "./screens/Sell.jsx";
import Returns from "./screens/Returns.jsx";
import Till from "./screens/Till.jsx";
import Dashboard from "./screens/Dashboard.jsx";
import Transactions from "./screens/Transactions.jsx";
import BackOffice from "./screens/BackOffice.jsx";

export default function App() {
  const { user, ready, till, logout } = usePos();
  const isManager = user?.role === "manager";

  if (!ready) return <main style={{ padding: 40 }} className="muted">Loading…</main>;
  if (!user) return <Login />;

  return (
    <>
      <header className="appbar">
        <div className="appbar-in">
          <h1>THREADLINE</h1>
          <span className="tag">FASHION POS</span>
          <span className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>
            {user.full_name} · {user.role}
          </span>
          {till.open ? (
            <span className="pill ok">
              Till OPEN · float {inr(till.session.opening_float_paise)}
            </span>
          ) : (
            <span className="pill bad">Till CLOSED</span>
          )}
          <button onClick={logout}>Sign out</button>
        </div>
      </header>

      <nav className="tabs">
        <NavLink to="/sell">Sell</NavLink>
        <NavLink to="/returns">Returns &amp; Exchange</NavLink>
        <NavLink to="/till">Till / Cash</NavLink>
        <NavLink to="/transactions">Transactions</NavLink>
        <NavLink to="/dashboard">Dashboard</NavLink>
        {isManager && <NavLink to="/backoffice">Back Office</NavLink>}
      </nav>

      <main>
        <Routes>
          <Route path="/sell" element={<Sell />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/till" element={<Till />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/backoffice" element={isManager ? <BackOffice /> : <Navigate to="/sell" replace />} />
          <Route path="*" element={<Navigate to="/sell" replace />} />
        </Routes>
      </main>
    </>
  );
}
