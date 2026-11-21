// ═══════════════════════════════════════════════════════════════════════════
// LE TEXTE DU VENDEUR REMIS SUR UNE ANNONCE eBAY EN LIGNE, SUR PLACE (21/11/2026, ordre de Nico — point 3)
// ═══════════════════════════════════════════════════════════════════════════
// Une annonce eBay publiée par l'API avec une description RÉDIGÉE PAR L'IA parce que le texte du vendeur n'avait pas été
// lu (compte 8fd44622, lot du 19/11 : lecture d'origine échouée, garde du lot) reçoit, UNE FOIS le vrai texte lu sur la
// fiche, ce texte : même numéro, vues et favoris gardés, ni retrait, ni republication, ni quota, ni mail.
// Règles (même modèle que remise-ordre-photos-ebay, 06/11) :
//   · rien tant que la fiche n'a pas un VRAI texte lu APRÈS la copie (marqueur daté, jamais « à relire », jamais une
//     référence « $17b », deux mots au moins) — « texte_pas_encore_lu » ;
//   · l'annonce relue en ligne : elle reprend déjà ce texte → « deja_bon » ; elle n'est plus la copie de notre dépôt
//     (changée par la personne depuis FillSell) → on n'y touche JAMAIS (« different_du_depot ») ;
//   · seule la DESCRIPTION change (article et offre), rien d'autre.
// Appelant : un script de réparation avec la clé de service (jamais l'app) ; `executer: false` (défaut) = simulation, rien
// n'est écrit. Une annonce par appel. (21/11/2026 midi, point 4 de Nico) Le cœur vit dans _shared/remise-texte-vendeur-ebay.ts :
// l'entretien d'ebay-api-worker l'appelle TOUT SEUL sur les tâches marquées « texte_vendeur_a_remettre », dès que la fiche est lue.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { remettreTexteVendeurEbay } from "../_shared/remise-texte-vendeur-ebay.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function roleDuJeton(authHeader: string): string | null {
  try {
    const charge = authHeader.replace(/^Bearers+/i, "").split(".")[1] ?? "";
    const texte = atob(charge.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(charge.length / 4) * 4, "="));
    return String(JSON.parse(texte)?.role ?? "") || null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  // La passerelle a vérifié la signature (verify_jwt) ; seul le rôle de service passe.
  if (roleDuJeton(req.headers.get("Authorization") ?? "") !== "service_role") return json({ ok: false, motif: "reserve_au_service" }, 403);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const jobId = String(body.job_id ?? "");
  const executer = body.executer === true;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ ok: false, motif: "parametres" }, 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return json(await remettreTexteVendeurEbay(admin, jobId, { executer }));
});
