import { useNavigate } from "react-router-dom";

export default function Navbar({ token, setToken }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("rw_user") || "null");

  const logout = () => {
    localStorage.removeItem("rw_token");
    localStorage.removeItem("rw_user");
    setToken(null);
    navigate("/auth", { replace: true });
  };

  return (
    <nav style={{
      position: "sticky",
      top: 0,
      zIndex: 1000,
      background: "rgba(9,9,15,0.92)",
      backdropFilter: "blur(20px)",
      borderBottom: "1px solid var(--border)",
      padding: "0 40px",
      height: "70px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>

      {/* Logo */}
      <div
        onClick={() => navigate(token ? "/" : "/auth")}
        style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}
      >
        <span style={{ fontSize: "26px" }}>🎬</span>
        <span style={{
          fontSize: "20px",
          fontWeight: 700,
          background: "linear-gradient(135deg, #818cf8, #c084fc)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: "-0.5px",
        }}>
          RoomWatch
        </span>
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {token && user ? (
          <>
            <img
              src={user.avatar}
              alt={user.name}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                border: "2px solid var(--border2)",
              }}
            />
            <span style={{ fontSize: "15px", color: "var(--text2)", fontWeight: 500 }}>
              {user.name}
            </span>
            <button
              onClick={logout}
              className="rw-btn rw-btn-ghost"
              style={{ padding: "9px 18px", fontSize: "14px" }}
            >
              Logout
            </button>
          </>
        ) : (
          <button
            onClick={() => navigate("/auth")}
            className="rw-btn rw-btn-primary"
            style={{ padding: "10px 22px", fontSize: "15px" }}
          >
            Get Started
          </button>
        )}
      </div>
    </nav>
  );
}