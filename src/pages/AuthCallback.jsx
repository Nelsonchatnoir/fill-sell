import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { UI, Loader } from "../components/ui";

// Atterrissage OAuth web (Apple, Google, tout provider Supabase) — flux PKCE.
// Le provider redirige ici avec ?code=… ; le client supabase (flowType pkce,
// detectSessionInUrl actif) échange AUTOMATIQUEMENT le code à son init — le
// getSession() ci-dessous attend la fin de cette init et suffit donc dans le
// cas nominal. L'échange manuel n'est qu'un filet si l'auto-détection n'a pas
// tourné (navigation SPA vers cette route avec un client déjà initialisé).
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session) { navigate("/app", { replace: true }); return; }
      const params = new URLSearchParams(window.location.search);
      // Refus/annulation côté provider : retour au login sans bruit.
      if (params.get("error")) { navigate("/login", { replace: true }); return; }
      const code = params.get("code");
      if (code) {
        const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (!exErr && data?.session) { navigate("/app", { replace: true }); return; }
      }
      setError("Connexion impossible. Réessaie depuis la page de connexion.");
    });
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
