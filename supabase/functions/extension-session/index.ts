import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Bootstrap d'une session PROPRE à l'extension Chrome (2026-07-20).
//
// POURQUOI CETTE FONCTION EXISTE
// Jusqu'ici l'extension recopiait le refresh token de l'app web (pont
// fillsell-auth.js → chrome.storage.local) et le faisait tourner de son côté,
// pendant que l'app le faisait tourner du sien. MÊME session, MÊME famille de
// refresh token, DEUX rotations concurrentes. Supabase fait tourner un refresh
// token à chaque usage : celui des deux qui présente un token déjà tourné
// déclenche la DÉTECTION DE RÉUTILISATION, et Supabase révoque toute la
// famille — l'app ET l'extension tombent ensemble, sans le moindre message.
// Constaté en base le 2026-07-20 : session Chrome Windows d40e449e, refreshs
// horaires toute la nuit, puis dernier refresh token créé à 11:29:30 et
// RÉVOQUÉ à 11:57:49 SANS successeur (signature d'une révocation de famille,
// pas d'une rotation). Dernier job traité par l'extension : 11:56.
//
// CE QU'ELLE FAIT
// On ne peut pas « détacher » une session existante : grant_type=refresh_token
// reste TOUJOURS dans la même famille, par construction. Il faut donc un
// nouvel événement de connexion. On en fabrique un côté serveur, sans jamais
// manipuler de mot de passe :
//   1. le JWT de l'app (envoyé par l'extension via le pont, UNE seule fois)
//      prouve l'identité ;
//   2. le service_role appelle l'admin GoTrue /admin/generate_link
//      (type magiclink) qui RETOURNE un hashed_token sans envoyer d'email —
//      c'est l'API « donne-moi le lien », distincte de /magiclink qui, elle,
//      envoie ;
//   3. l'extension échange ce hashed_token contre une session NEUVE via
//      /auth/v1/verify. Nouvelle session, nouvelle famille, indépendante.
// À partir de là l'extension ne relit plus jamais le token de l'app.
//
// ⚠️ À VÉRIFIER AU PREMIER APPEL RÉEL : que /admin/generate_link n'envoie pas
// d'email. C'est le comportement documenté (l'envoi est réservé aux endpoints
// non-admin), mais il dépend de la configuration SMTP du projet. Si un email
// part à chaque bootstrap, il faudra changer de voie — le bootstrap est un
// appel UNIQUE par installation, donc l'impact resterait très faible.
//
// Déploiement : supabase functions deploy extension-session
// verify_jwt reste à TRUE (défaut) — on VEUT que le JWT de l'app soit vérifié
// par la plateforme avant d'entrer ici. Ne PAS déployer avec --no-verify-jwt :
// cette fonction n'est pas un webhook, elle mint une session et doit exiger une
// preuve d'identité.

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || origin.startsWith("chrome-extension://");
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsOrigin = isAllowedOrigin(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Identité prouvée par le JWT de l'app — client scoped user, jamais admin ici.
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Token invalide ou expiré" }, 401);
    if (!user.email) {
      // generate_link s'appuie sur l'email. Un compte sans email (cas théorique)
      // ne peut pas être bootstrappé par cette voie : on le dit au lieu de
      // renvoyer une erreur opaque.
      return json({ error: "Compte sans adresse email : bootstrap extension impossible" }, 422);
    }

    // Admin GoTrue : génère le lien SANS l'envoyer, et renvoie le hashed_token.
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
      },
      body: JSON.stringify({ type: "magiclink", email: user.email }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[extension-session] generate_link:", res.status, detail.slice(0, 300));
      return json({ error: `Génération de session impossible (HTTP ${res.status})` }, 502);
    }

    const data = await res.json().catch(() => ({}));
    // Selon la version de GoTrue le token est à la racine ou sous properties.
    const hashedToken = data?.properties?.hashed_token ?? data?.hashed_token ?? null;
    if (!hashedToken) {
      console.error("[extension-session] hashed_token absent de la réponse admin");
      return json({ error: "Réponse d'auth inattendue (hashed_token absent)" }, 502);
    }

    // On ne renvoie QUE le hashed_token : l'échange contre une session se fait
    // côté extension, pour que le refresh token n'existe jamais que là-bas.
    return json({ hashed_token: hashedToken, email: user.email });
  } catch (e) {
    console.error("[extension-session]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
