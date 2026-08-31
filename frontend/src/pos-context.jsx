import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setToken } from "./api";

const Ctx = createContext(null);
export const usePos = () => useContext(Ctx);

export function PosProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [till, setTill] = useState({ open: false });
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg, kind = "") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const refreshTill = useCallback(async () => {
    try {
      setTill(await api.get("/till/current"));
    } catch {
      setTill({ open: false });
    }
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.post("/auth/login", { username, password });
    setToken(data.token);
    setUser(data.user);
    await refreshTill();
  }, [refreshTill]);

  const logout = useCallback(() => {
    setToken("");
    setUser(null);
    setTill({ open: false });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get("/auth/me");
        setUser(me);
        await refreshTill();
      } catch {
        setToken("");
      } finally {
        setReady(true);
      }
    })();
  }, [refreshTill]);

  return (
    <Ctx.Provider value={{ user, ready, till, refreshTill, login, logout, toast }}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={"toast " + t.kind}>{t.msg}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
