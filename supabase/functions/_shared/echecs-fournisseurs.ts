// ═══════════════════════════════════════════════════════════════════════════
// ÉCHECS DES FOURNISSEURS D'IA — LE JOURNAL QUE LIT L'OPS-DIGEST (01/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Le crédit OpenAI s'est épuisé le 28/09 : 0 retouche livrée sur 25 pendant
// trois jours, et rien ne l'a dit — l'erreur (429 credit_balance_exhausted)
// ne vivait que dans les journaux des fonctions, qu'aucun humain ne lit chaque
// jour. Chaque refus d'un fournisseur d'IA sur un geste payant est désormais
// noté dans usage_logs (feature 'echec_fournisseur_ia' — table existante, aucun
// changement de schéma) ; ops-digest (8h50, support@) le met EN TÊTE du
// récapitulatif.
//
// ⛔ Jamais bloquant : une écriture ratée ne change rien au geste de la
//    personne (try/catch, aucune exception ne sort).
// ⛔ Jamais de contenu de la personne : le statut HTTP, le code d'erreur du
//    fournisseur et un extrait du message d'ERREUR du fournisseur, rien d'autre.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";

export type Fournisseur = "openai" | "anthropic";
export const FEATURE_ECHEC_FOURNISSEUR = "echec_fournisseur_ia";

let client: ReturnType<typeof createClient> | null = null;
function admin() {
  if (!client) {
    client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  }
  return client;
}

/** Le code d'erreur du fournisseur, lu dans son corps de réponse (JSON ou texte). */
export function codeErreurFournisseur(corps: string): string | null {
  try {
    const j = JSON.parse(corps);
    const e = j?.error ?? j;
    return String(e?.code ?? e?.type ?? "") || null;
  } catch {
    return null;
  }
}

/**
 * Crédit ÉPUISÉ chez le fournisseur (pas une simple limite de débit) :
 *   OpenAI    : 429 + insufficient_quota / credit_balance_exhausted ;
 *   Anthropic : 400 « credit balance is too low » (invalid_request_error),
 *               ou billing_error.
 */
export function estCreditEpuise(fournisseur: Fournisseur, http: number | null, corps: string): boolean {
  const t = (corps ?? "").toLowerCase();
  if (fournisseur === "openai") {
    return t.includes("insufficient_quota") || t.includes("credit_balance_exhausted") || t.includes("billing_hard_limit");
  }
  return t.includes("credit balance is too low") || t.includes("billing_error")
    || (http === 402);
}

/** Note un refus du fournisseur. Best-effort : ne lève jamais. */
export async function noterEchecFournisseur(e: {
  fournisseur: Fournisseur;
  fonction: string;
  http: number | null;
  corps: string;
  user_id?: string | null;
}): Promise<void> {
  try {
    const corps = String(e.corps ?? "");
    const { error } = await admin().from("usage_logs").insert({
      user_id: e.user_id ?? null,
      feature: FEATURE_ECHEC_FOURNISSEUR,
      metadata: {
        fournisseur: e.fournisseur,
        fonction: e.fonction,
        http: e.http,
        code: codeErreurFournisseur(corps),
        credit_epuise: estCreditEpuise(e.fournisseur, e.http, corps),
        detail: corps.replace(/\s+/g, " ").slice(0, 300),
      },
    });
    if (error) console.warn("[echecs-fournisseurs] non noté :", error.message);
  } catch (err) {
    console.warn("[echecs-fournisseurs] non noté :", (err as Error)?.message ?? err);
  }
}
