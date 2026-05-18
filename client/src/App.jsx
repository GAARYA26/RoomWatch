import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./components/Home";
import Auth from "./components/Auth";
import Room from "./components/Room";

function App() {
  // Use state so when token changes, app re-renders and routes update
  const [token, setToken] = useState(localStorage.getItem("rw_token"));

  return (
    <BrowserRouter>
      <Navbar token={token} setToken={setToken} />
      <Routes>
        <Route
          path="/"
          element={token ? <Home /> : <Navigate to="/auth" replace />}
        />
        <Route
          path="/auth"
          element={!token ? <Auth setToken={setToken} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/room/:code"
          element={token ? <Room /> : <Navigate to="/auth" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;