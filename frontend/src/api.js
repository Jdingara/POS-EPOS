const BASE = import.meta.env.VITE_API_BASE || "/api";

let token = localStorage.getItem("pos_token") || "";

export function setToken(t) {
  token = t || "";
  if (t) localStorage.setItem("pos_token", t);
  else localStorage.removeItem("pos_token");
}
export function getToken() {
  return token;
}

/** Flatten a DRF error body into a single readable string. */
export function errMsg(data, fallback = "Something went wrong") {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  if (Array.isArray(data)) return data.join(" ");
  if (data.non_field_errors) return data.non_field_errors.join(" ");
  const parts = [];
  for (const [k, v] of Object.entries(data)) {
    parts.push(`${k}: ${Array.isArray(v) ? v.join(" ") : v}`);
  }
  return parts.join(" · ") || fallback;
}

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(errMsg(data, `HTTP ${res.status}`));
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => req("GET", p),
  post: (p, b) => req("POST", p, b),
  patch: (p, b) => req("PATCH", p, b),
  put: (p, b) => req("PUT", p, b),
  del: (p) => req("DELETE", p),
};
