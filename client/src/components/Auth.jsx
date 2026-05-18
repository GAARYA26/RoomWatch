import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function Auth({ setToken }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const payload = mode === "login"
        ? { email: form.email, password: form.password }
        : form;

      const res = await axios.post(`${API}${endpoint}`, payload);
      localStorage.setItem("rw_token", res.data.token);
      localStorage.setItem("rw_user", JSON.stringify(res.data.user));
      setToken(res.data.token);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "calc(100vh - 70px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
      background: "radial-gradient(ellipse at top, rgba(99,102,241,0.08) 0%, transparent 60%)",
    }}>
      <div className="fade-up" style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "22px",
        padding: "48px 44px",
        width: "100%",
        maxWidth: "440px",
      }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎬</div>
          <h2 style={{ fontSize: "26px", fontWeight: 700, marginBottom: "6px" }}>
            {mode === "login" ? "Welcome back" : "Create account"}
          </h2>
          <p style={{ color: "var(--text2)", fontSize: "15px" }}>
            {mode === "login"
              ? "Sign in to watch together"
              : "Join RoomWatch for free"}
          </p>
        </div>

        {/* Toggle */}
        <div style={{
          display: "flex",
          background: "var(--surface3)",
          border: "1px solid var(--border2)",
          borderRadius: "12px",
          padding: "4px",
          marginBottom: "28px",
        }}>
          {["login", "register"].map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              style={{
                flex: 1,
                background: mode === m ? "var(--accent)" : "transparent",
                color: mode === m ? "#fff" : "var(--text2)",
                border: "none",
                borderRadius: "9px",
                padding: "10px",
                fontSize: "15px",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "Inter, sans-serif",
                transition: "all 0.2s",
                textTransform: "capitalize",
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "#f87171",
            padding: "12px 16px",
            borderRadius: "10px",
            fontSize: "14px",
            marginBottom: "20px",
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handle}>
          {mode === "register" && (
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Full Name</label>
              <input
                className="rw-input"
                type="text"
                placeholder="Arjun Sharma"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
          )}
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Email</label>
            <input
              className="rw-input"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div style={{ marginBottom: "28px" }}>
            <label style={labelStyle}>Password</label>
            <input
              className="rw-input"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          <button
            type="submit"
            className="rw-btn rw-btn-primary"
            style={{ width: "100%", padding: "15px", fontSize: "16px" }}
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : mode === "login" ? "Sign In →" : "Create Account →"}
          </button>
        </form>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: "13px",
  color: "var(--text2)",
  marginBottom: "8px",
  fontWeight: 500,
};