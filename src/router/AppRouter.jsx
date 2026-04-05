import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import ProtectedRoute from "../components/ProtectedRoute";
import LandingPage from "../pages/LandingPage";
import Success from "../pages/Success";
import Cancel from "../pages/Cancel";
import App from "../App";

function RedirectIfLoggedIn({ children }) {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);
  if (user === undefined) return null;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

function RequireAuth({ children }) {
  const [user, setUser] = useState(undefined);
  const location = useLocation();
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);
  if (user === undefined) return null;
  if (!user) return <Navigate to="/" replace state={{ from: location }} />;
  return children;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RedirectIfLoggedIn><LandingPage /></RedirectIfLoggedIn>} />
        <Route path="/login" element={<RedirectIfLoggedIn><App loginOnly /></RedirectIfLoggedIn>} />
        <Route path="/app" element={<RequireAuth><App /></RequireAuth>} />
        <Route path="/success" element={<Success />} />
        <Route path="/cancel" element={<Cancel />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}