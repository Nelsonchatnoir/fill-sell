// ============================================================================
// Désinscription publique — 13/09/2026
//
// SANS CONNEXION, délibérément : quelqu'un qui ne veut plus de nos mails ne
// doit pas avoir à retrouver son mot de passe pour partir. verify_jwt = false
// (config.toml) ; l'authentification, c'est la détention du jeton.
//
// GET  ?t=<jeton>   → état courant (adresse MASQUÉE, jamais rendue en clair)
// POST {t, action}  → 'desinscrire' | 'reinscrire'
//
// POURQUOI LE GET NE DÉSINSCRIT PAS
// Gmail, Outlook et les proxys de confidentialité PRÉ-CHARGENT les liens
// contenus dans un mail. Un GET qui désinscrirait désinscrirait donc des gens
// qui n'ont rien cliqué, sans qu'ils le sachent. Le geste passe par un POST,
// que les pré-chargeurs n'émettent pas.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { desinscrire } from "../_shared/desinscription.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/**
 * « ni***@gmail.com » — assez pour que la personne reconnaisse SON adresse,
 * pas assez pour qu'un jeton intercepté révèle une adresse complète.
 */
function masquer(email: string): string {
  const [local, domaine] = String(email ?? "").split("@");
  if (!domaine) return "";
  const debut = local.slice(0, Math.min(2, local.length));
  return `${debut}${"*".repeat(Math.max(1, local.length - debut.length))}@${domaine}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const url = new URL(req.url);
    let jeton = url.searchParams.get("t") ?? "";
    let action = "";

    if (req.method === "POST") {
      const corps = await req.json().catch(() => ({}));
      jeton = corps.t ?? corps.jeton ?? jeton;
      action = String(corps.action ?? "");
    }

    if (!jeton || jeton.length < 20) {
      return json({ error: "jeton_invalide" }, 400);
    }

    const db = admin();
    const { data: ligne, error } = await db
      .from("email_destinataires")
      .select("email, user_id, desinscrit, desinscrit_le, reinscrit_le")
      .eq("jeton", jeton)
      .maybeSingle();

    if (error) return json({ error: "erreur_base" }, 500);
    // Jeton inconnu : même réponse qu'un jeton mal formé, et aucun détail —
    // on ne confirme pas l'existence d'une adresse à qui essaie des jetons.
    if (!ligne) return json({ error: "jeton_invalide" }, 404);

    // --- Lecture seule ---
    if (req.method === "GET") {
      return json({
        email_masque: masquer(ligne.email),
        desinscrit: ligne.desinscrit === true,
      });
    }

    if (req.method !== "POST") return json({ error: "methode" }, 405);

    if (action !== "desinscrire" && action !== "reinscrire") {
      return json({ error: "action_inconnue" }, 400);
    }

    // ── FUSION DES DEUX REGISTRES (19/09/2026) ───────────────────────────────
    // Ce point d'entrée n'écrivait que email_destinataires — que le tunnel et
    // les blasts ne lisaient pas. Quelqu'un qui se désinscrivait ICI continuait
    // de recevoir le welcome et les campagnes. Il passe désormais par
    // desinscrire() (_shared/desinscription.ts), qui pose l'état dans le
    // registre canonique ET la ligne d'audit email_logs 'marketing_optout'
    // lue par les chemins historiques. Une désinscription, quel que soit le
    // canal, vaut pour tout.
    const veutPartir = action === "desinscrire";
    const r = await desinscrire({
      email: ligne.email as string,
      userId: (ligne.user_id as string | null) ?? null,
      origine: "lien_email",
      reinscrire: !veutPartir,
    });

    if (!r.ok) {
      console.error("desinscription_echec", r.erreur);
      return json({ error: "erreur_base" }, 500);
    }

    return json({
      email_masque: masquer(ligne.email),
      desinscrit: veutPartir,
    });
  } catch (_e) {
    return json({ error: "erreur" }, 500);
  }
});
