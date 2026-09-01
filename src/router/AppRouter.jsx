import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect, lazy, Suspense } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "../lib/supabase";
import { rememberPostLoginTarget } from "../lib/postLoginRedirect";
import LandingPage from "../pages/LandingPage";
import Success from "../pages/Success";
import Cancel from "../pages/Cancel";
import ResetPassword from "../pages/ResetPassword";
import AuthCallback from "../pages/AuthCallback";

// Code-splitting par route (2026-08-02, Lighthouse mobile : perf 56, LCP 12 s,
// 721 Ko de JS inutilisé au premier rendu). La landing — première page servie
// à tout visiteur — reste dans le chunk d'entrée ; l'app (de très loin le plus
// gros morceau), le blog (react-markdown) et les pages secondaires se chargent
// à la navigation. Fallback null : le canvas #EDEAE0 d'index.html couvre le
// chargement, comme au boot. Le natif embarque dist/ tel quel (Capacitor,
// bundles Capgo zippés complets) : les chunks voyagent avec l'entrée.
const App = lazy(() => import("../App"));
const Legal = lazy(() => import("../pages/Legal"));
const BlogList = lazy(() => import("../pages/BlogList"));
const BlogPost = lazy(() => import("../pages/BlogPost"));
const ExtensionPage = lazy(() => import("../pages/ExtensionPage"));

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
  // Cible protégée hors /app : mémorisée AVANT la redirection, consommée par
  // les chemins de login (handleLogin, AuthCallback) — sinon navigate('/app')
  // l'avale. (Depuis le 2026-09-01, /extension est PUBLIQUE et ne passe plus
  // par ici — le mécanisme reste pour toute future route protégée listée dans
  // postLoginRedirect.ALLOWED_TARGETS.)
  useEffect(() => {
    if (user === null) rememberPostLoginTarget(location.pathname);
  }, [user, location.pathname]);
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
      <Suspense fallback={null}>
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
        {/* PUBLIQUE depuis le 2026-09-01 (audit onboarding) : le mail
            send-extension-link atterrit ici sur un ordinateur où la session
            FillSell n'existe généralement pas encore — la garde d'auth
            renvoyait ces visiteurs vers la landing avant tout affichage.
            La page ne lit aucune donnée de session ni de profil. */}
        <Route path="/extension" element={<ExtensionPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
