import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "../lib/supabase";
import LandingPage from "../pages/LandingPage";
import Success from "../pages/Success";
import Cancel from "../pages/Cancel";
import Legal from "../pages/Legal";
import ResetPassword from "../pages/ResetPassword";
import AuthCallback from "../pages/AuthCallback";
import BlogList from "../pages/BlogList";
import BlogPost from "../pages/BlogPost";
import ExtensionPage from "../pages/ExtensionPage";
import App from "../App";

// Bloque /login et / si déjà connecté
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

// Protège /app : redirige vers / si non connecté, sinon reste sur place
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
  // App NATIVE (Capacitor iOS/Android) : pas de landing marketing — la racine
  // ouvre directement l'auth/création de compte (décision 2026-07-18). Le WEB
  // garde la landing sur « / » : c'est la page publique de fillsell.app
  // (campagnes TikTok, badges stores, SEO) — ne pas la retirer du routing web.
  const isNative = Capacitor.isNativePlatform();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isNative
          ? <Navigate to="/login" replace />
          : <RedirectIfLoggedIn><LandingPage /></RedirectIfLoggedIn>} />
        <Route path="/login" element={<RedirectIfLoggedIn><App loginOnly /></RedirectIfLoggedIn>} />
        <Route path="/app" element={<RequireAuth><App /></RequireAuth>} />
        <Route path="/success" element={<Success />} />
        <Route path="/cancel" element={<Cancel />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Atterrissage OAuth web (Apple/Google) — pas de garde : la page gère
            elle-même session présente / code à échanger / erreur provider. */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/blog" element={<BlogList />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/extension" element={<RequireAuth><ExtensionPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
