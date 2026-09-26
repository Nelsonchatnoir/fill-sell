import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect, lazy, Suspense } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "../lib/supabase";
import { rememberPostLoginTarget } from "../lib/postLoginRedirect";
import { capterSource } from "../utils/acquisition";
import { capterOffre } from "../lib/offreMail";
import BandeauConsentement from "../components/BandeauConsentement";
import LandingPage from "../pages/LandingPage";
import Success from "../pages/Success";
import Cancel from "../pages/Cancel";
import ResetPassword from "../pages/ResetPassword";
import AuthCallback from "../pages/AuthCallback";
import AuthConfirm from "../pages/AuthConfirm";

// Code-splitting par route (2026-08-02, Lighthouse mobile : perf 56, LCP 12 s,
// 721 Ko de JS inutilisé au premier rendu). La landing — première page servie
// à tout visiteur — reste dans le chunk d'entrée ; l'app (de très loin le plus
// gros morceau), le blog (react-markdown) et les pages secondaires se chargent
// à la navigation. Fallback null : le canvas #EDEAE0 d'index.html couvre le
// chargement, comme au boot. Le natif embarque dist/ tel quel (Capacitor,
// bundles Capgo zippés complets) : les chunks voyagent avec l'entrée.
// Offre portée par un lien d'e-mail (?offre=CODE, 26/09) : relevée au
// CHARGEMENT DU MODULE, donc avant le premier rendu et avant la moindre
// redirection du routeur (RequireAuth, RedirectIfLoggedIn, route « * »), qui
// effacerait le paramètre. Cf. src/lib/offreMail.js.
capterOffre();

const App = lazy(() => import("../App"));
const Legal = lazy(() => import("../pages/Legal"));
const BlogList = lazy(() => import("../pages/BlogList"));
const BlogPost = lazy(() => import("../pages/BlogPost"));
const ExtensionPage = lazy(() => import("../pages/ExtensionPage"));
const EbayRetour = lazy(() => import("../pages/EbayRetour"));
const Desinscription = lazy(() => import("../pages/Desinscription"));

// ── Un jeton d'authentification n'atterrit JAMAIS sur la landing (16/09) ─────
// Le lien de confirmation d'inscription part avec redirect_to = SITE_URL, donc
// sur « / » : mesuré sur les 10 confirmations des 24 h, toutes portaient
// `redirect_to=https://fillsell.app`. Là, deux issues, toutes deux mauvaises :
// sans session la personne voyait la page marketing (et devait retrouver le
// formulaire pour retaper son mot de passe) ; AVEC une session d'un autre
// compte, RedirectIfLoggedIn l'envoyait sur /app — CONNECTÉE AU MAUVAIS COMPTE,
// sans un mot (reproduit le 16/09 à 19:28 sur l'iPhone de Nico).
// On dévie donc vers /auth/confirm, qui sait traiter les deux cas.
// Volontairement SYNCHRONE et avant toute lecture de session : le paramètre est
// dans l'URL au premier rendu, il n'y a rien à attendre.
// Ce filet couvre aussi le cas où l'URL de redirection n'est pas encore
// autorisée côté Supabase — GoTrue retombe alors sur SITE_URL, c'est-à-dire ici.
const PARAMS_CONFIRMATION = ["code", "token_hash"];
function cibleConfirmation() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (!PARAMS_CONFIRMATION.some((k) => params.get(k))) return null;
    return `/auth/confirm${window.location.search}`;
  } catch { return null; }
}

// Bloque /login et / si déjà connecté
function RedirectIfLoggedIn({ children }) {
  const [user, setUser] = useState(undefined);
  const versConfirmation = cibleConfirmation();
  useEffect(() => {
    if (versConfirmation) return;   // /auth/confirm relit la session lui-même
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, [versConfirmation]);
  if (versConfirmation) return <Navigate to={versConfirmation} replace />;
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

  // Source d'acquisition : relevée le plus tôt possible, avant toute
  // navigation interne qui effacerait les paramètres d'URL. Idempotent — seul
  // le PREMIER contact est retenu, les visites suivantes ne l'écrasent pas.
  // Ne lève jamais : une capture impossible n'empêche rien.
  useEffect(() => { capterSource(); }, []);

  return (
    <BrowserRouter>
      {/* Bandeau de consentement publicitaire — web uniquement. Tant qu'il n'a
          pas de réponse, aucun traceur publicitaire ne se charge. */}
      {!isNative && <BandeauConsentement />}
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
        {/* Désinscription : PUBLIQUE, hors RequireAuth. Se retirer de nos
            emails ne doit jamais exiger de se connecter. */}
        <Route path="/desinscription" element={<Desinscription />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Atterrissage OAuth web (Apple/Google) — pas de garde : la page gère
            elle-même session présente / code à échanger / erreur provider. */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* Confirmation d'INSCRIPTION par e-mail — page distincte de
            /auth/callback, et c'est le point : l'OAuth revient toujours dans le
            navigateur qui l'a lancé (son échange PKCE est légitime), alors
            qu'un lien d'e-mail s'ouvre où il veut. Mêler les deux, c'est ce qui
            faisait entrer un nouvel inscrit sur la session d'un autre compte. */}
        <Route path="/auth/confirm" element={<AuthConfirm />} />
        <Route path="/blog" element={<BlogList />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        {/* PUBLIQUE depuis le 2026-09-01 (audit onboarding) : le mail
            send-extension-link atterrit ici sur un ordinateur où la session
            FillSell n'existe généralement pas encore — la garde d'auth
            renvoyait ces visiteurs vers la landing avant tout affichage.
            La page ne lit aucune donnée de session ni de profil. */}
        <Route path="/extension" element={<ExtensionPage />} />
        {/* Atterrissage après le consentement eBay (lot 0, 05/09) : la fonction
            ebay-oauth-callback a déjà stocké les jetons et renvoie ici
            ?etat=ok|refus|erreur. PUBLIQUE : sur natif la page s'ouvre dans le
            navigateur système, sans session FillSell. */}
        <Route path="/ebay/retour" element={<EbayRetour />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
