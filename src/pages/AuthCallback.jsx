import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { consumePostLoginTarget } from "../lib/postLoginRedirect";
import { UI, Loader } from "../components/ui";
import useSeo from "../lib/seo";

// Atterrissage OAuth web (Apple, Google, tout provider Supabase) — flux PKCE.
// Le provider redirige ici avec ?code=… ; le client supabase (flowType pkce,
// detectSessionInUrl actif) échange AUTOMATIQUEMENT le code à son init — le
// getSession() ci-dessous attend la fin de cette init et suffit donc dans le
// cas nominal. L'échange manuel n'est qu'un filet si l'auto-détection n'a pas
// tourné (navigation SPA vers cette route avec un client déjà initialisé).
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  // Atterrissage OAuth : jamais à indexer.
  useSeo({ path: "/auth/callback", title: "Connexion — FillSell", robots: "noindex" });

  useEffect(() => {
    let cancelled = false;
    // Cible protégée mémorisée par RequireAuth (ex. /extension depuis le
    // lien e-mail de l'accroche) : le flux OAuth web repasse par ici, c'est
    // LE point où la destination était perdue.
    const arrivee = () => navigate(consumePostLoginTarget() ?? "/app", { replace: true });
    (async () => {
      const params = new URLSearchParams(window.location.search);
      // Refus/annulation côté provider : retour au login sans bruit.
      if (params.get("error")) { navigate("/login", { replace: true }); return; }
      const code = params.get("code");
      // ── Le code PRIME sur toute session déjà en storage (02/09 soir) ──────
      // L'ancien ordre testait getSession() D'ABORD : une session morte côté
      // serveur mais localement « valide » (exp < 1 h — cadavre d'un signOut
      // global) court-circuitait l'échange, le ?code= partait à la poubelle
      // et le cadavre restait en storage — le pont de l'extension relayait
      // alors un jeton mort (extension-session 401 en boucle). Un code frais
      // dans l'URL est TOUJOURS plus digne de confiance qu'un storage local :
      // on l'échange d'abord, l'échange REMPLACE la session locale. S'il
      // échoue parce que l'auto-détection PKCE l'a déjà consommé à l'init du
      // client, getSession() rend la session fraîche → même destination.
      if (code) {
        const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (!exErr && data?.session) { arrivee(); return; }
        const { data: { session: apres } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (apres) { arrivee(); return; }
        setError("Connexion impossible. Réessaie depuis la page de connexion.");
        return;
      }
      // Sans code (navigation SPA vers cette route) : la session en place
      // fait foi, comme avant.
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) { arrivee(); return; }
      setError("Connexion impossible. Réessaie depuis la page de connexion.");
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 24, background: UI.canvas, boxSizing: "border-box" }}>
      {!error ? (
        <>
          <Loader size={36} thickness={3} />
          <div style={{ fontSize: 15, fontWeight: 600, color: UI.ink }}>Connexion en cours…</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 600, color: UI.ink, textAlign: "center" }}>{error}</div>
          <span onClick={() => navigate("/login", { replace: true })} style={{ fontSize: 14, color: UI.teal, cursor: "pointer", textDecoration: "underline" }}>
            ← Retour à la connexion
          </span>
        </>
      )}
    </div>
  );
}
