import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { delegationLbcValide } from "../_shared/delegation-leboncoin.js";

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
    if (authErr || !user) {
      // ── Signal de panne pour l'app (incident bootstrap du 02/09 soir) ─────
      // Ce 401 précis = « l'extension tourne mais son jeton relayé est mort »
      // (session détruite par un signOut global, révocation…). Sans trace, il
      // était invisible : l'app affichait « ordinateur éteint » pendant que
      // l'extension bouclait. On stampe profiles.extension_session_rejetee_at
      // — l'app le lit (fraicheurExtension) et affiche le geste qui répare.
      // SÛRETÉ : verify_jwt=true sur cette fonction — la gateway a DÉJÀ validé
      // signature et expiration du JWT avant d'entrer ici (sinon la requête
      // n'arrive pas). Le `sub` du payload est donc authentique ; seul le lien
      // à une session vivante manque. Décodage sans re-vérification, assumé.
      // Best-effort : jamais bloquant, la réponse 401 part telle quelle.
      try {
        const payloadB64 = (authHeader.slice(7).split(".")[1] ?? "")
          .replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(payloadB64));
        const sub = typeof payload?.sub === "string" ? payload.sub : null;
        if (sub) {
          const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
          await admin.from("profiles")
            .update({ extension_session_rejetee_at: new Date().toISOString() })
            .eq("id", sub);
          console.warn(`[extension-session] bootstrap refusé (session morte côté serveur) user=${sub} — extension_session_rejetee_at stampé`);
        }
      } catch { /* colonne absente (migration pas encore appliquée) ou payload illisible : sans conséquence */ }
      return json({ error: "Token invalide ou expiré" }, 401);
    }
    // ══ (01/11, décision de Nico — Louis) LE COMPTE DE TRAVAIL D'UNE DÉLÉGATION LEBONCOIN ══════════════════════════
    // (_shared/delegation-leboncoin.js) L'extension de l'EXÉCUTANT (Amiral) demande une session du PROPRIÉTAIRE
    // (louis-seller) pour faire ses actions Leboncoin depuis son ordinateur, sur sa session Leboncoin. Rendue seulement
    // si la délégation est posée DES DEUX CÔTÉS dans profiles.beta_flags (colonne fermée en écriture au client), vers
    // CET appelant : toute autre demande est refusée (403), sans rien générer. Jamais de mot de passe, même voie que le
    // bootstrap ci-dessous (lien généré sans envoi, échangé par l'extension). Sans `delegation_pour` : rien ne change.
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* corps vide : bootstrap ordinaire */ }
    const delegationPour = typeof body?.delegation_pour === "string" ? body.delegation_pour.trim().toLowerCase() : "";
    let emailCible = user.email ?? null;
    if (delegationPour) {
      const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const flags = async (id: string): Promise<Record<string, unknown> | null> => {
        const { data } = await admin.from("profiles").select("beta_flags").eq("id", id).maybeSingle();
        return ((data as { beta_flags?: Record<string, unknown> } | null)?.beta_flags ?? null) as Record<string, unknown> | null;
      };
      const valide = delegationLbcValide({
        proprietaire: delegationPour, flagsProprietaire: await flags(delegationPour).catch(() => null),
        executant: user.id, flagsExecutant: await flags(user.id).catch(() => null),
      });
      if (!valide) {
        console.warn(`[extension-session] délégation Leboncoin REFUSÉE : ${user.id} → ${delegationPour.slice(0, 8)} (non posée des deux côtés)`);
        return json({ error: "Délégation non autorisée" }, 403);
      }
      const { data: cible, error: errCible } = await admin.auth.admin.getUserById(delegationPour);
      emailCible = cible?.user?.email ?? null;
      if (errCible || !emailCible) return json({ error: "Compte délégué introuvable" }, 404);
      console.log(`[extension-session] délégation Leboncoin : session du compte ${delegationPour.slice(0, 8)} pour l'extension de ${user.id.slice(0, 8)}`);
    }
    if (!emailCible) {
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
      body: JSON.stringify({ type: "magiclink", email: emailCible }),
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

    // (01/11) Session de délégation : le marqueur de panne de l'extension de l'appelant ne la concerne pas.
    if (delegationPour) return json({ hashed_token: hashedToken, email: emailCible, compte: delegationPour, delegation: ["leboncoin"] });

    // Bootstrap réussi : on efface le marqueur de panne (best-effort — la
    // reprise des polls ferait de toute façon repasser last_seen devant).
    try {
      const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await admin.from("profiles")
        .update({ extension_session_rejetee_at: null })
        .eq("id", user.id);
    } catch { /* colonne absente ou indisponible : sans conséquence */ }

    // On ne renvoie QUE le hashed_token : l'échange contre une session se fait
    // côté extension, pour que le refresh token n'existe jamais que là-bas.
    return json({ hashed_token: hashedToken, email: user.email });
  } catch (e) {
    console.error("[extension-session]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
