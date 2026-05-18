import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function Home() {
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const token = localStorage.getItem("rw_token");

  const createRoom = async () => {
    if (!roomName.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await axios.post(
        `${API}/room/create`,
        { name: roomName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      navigate(`/room/${res.data.code}`);
    } catch (err) {
      setError("Could not create room. Try again.");
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    if (!joinCode.trim()) return;
    try {
      await axios.get(`${API}/room/${joinCode.toUpperCase()}`);
      navigate(`/room/${joinCode.toUpperCase()}`);
    } catch {
      setError("Room not found. Check the code.");
    }
  };

  return (
    <div style={{
      minHeight: "calc(100vh - 58px)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "40px 24px",
      background: "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.08) 0%, transparent 60%)",
    }}>
      {/* Hero */}
      <div className="fade-up" style={{ textAlign: "center", maxWidth: "580px", marginBottom: "52px" }}>
        <div style={{ fontSize: "48px", marginBottom: "18px" }}>🎬</div>
        <h1 style={{
          fontSize: "clamp(32px, 6vw, 52px)",
          fontWeight: 700,
          lineHeight: 1.12,
          marginBottom: "16px",
          letterSpacing: "-1px",
          background: "linear-gradient(160deg, #ffffff 0%, #a5b4fc 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          Watch together.<br />Feel it together.
        </h1>
        <p style={{ color: "var(--text2)", fontSize: "16px", lineHeight: 1.65 }}>
          Create a room, share the code, and watch YouTube videos in perfect sync.
          Live voice chat and screen sharing included.
        </p>
      </div>

      {/* Action Cards */}
      <div className="fade-up" style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "16px",
        width: "100%",
        maxWidth: "640px",
        marginBottom: "48px",
      }}>
        {/* Create */}
        <div style={cardStyle}>
          <div style={{ fontSize: "22px", marginBottom: "10px" }}>✦</div>
          <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>Create a room</h3>
          <p style={{ color: "var(--text2)", fontSize: "12px", marginBottom: "18px", lineHeight: 1.5 }}>
            Start a watch party. Get a shareable 6-digit code.
          </p>
          <input
            className="rw-input"
            placeholder="Room name..."
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createRoom()}
            style={{ marginBottom: "10px" }}
          />
          <button
            className="rw-btn rw-btn-primary"
            style={{ width: "100%" }}
            onClick={createRoom}
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Room →"}
          </button>
        </div>

        {/* Join */}
        <div style={cardStyle}>
          <div style={{ fontSize: "22px", marginBottom: "10px" }}>⟶</div>
          <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>Join a room</h3>
          <p style={{ color: "var(--text2)", fontSize: "12px", marginBottom: "18px", lineHeight: 1.5 }}>
            Got a code from a friend? Jump right in.
          </p>
          <input
            className="rw-input"
            placeholder="ABC123"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            maxLength={6}
            style={{ marginBottom: "10px", letterSpacing: "4px", fontWeight: 600 }}
          />
          <button
            className="rw-btn rw-btn-ghost"
            style={{ width: "100%" }}
            onClick={joinRoom}
          >
            Join Room →
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          color: "#f87171", fontSize: "13px",
          background: "rgba(239,68,68,0.08)",
          padding: "10px 18px", borderRadius: "8px",
          border: "1px solid rgba(239,68,68,0.2)",
          marginBottom: "32px",
        }}>
          {error}
        </div>
      )}

      {/* Features */}
      <div style={{ display: "flex", gap: "36px", flexWrap: "wrap", justifyContent: "center" }}>
        {[
          ["⚡", "Sub-100ms sync", "Latency compensated"],
          ["💬", "Live reactions", "Timestamp locked"],
          ["🔒", "Private rooms", "Invite only"],
          ["📊", "Reaction heatmap", "See peak moments"],
          ["🎙", "Voice chat", "WebRTC powered"],
          ["🖥", "Screen share", "Any platform"],
        ].map(([icon, title, sub]) => (
          <div key={title} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "20px", marginBottom: "6px" }}>{icon}</div>
            <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "2px" }}>{title}</div>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const cardStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "16px",
  padding: "24px",
  transition: "border-color 0.2s",
};