// Point B : une transaction Postgres enregistre le job, le stock et la vente.
// Le contrat HTTP des appelants existants reste identique. Une réponse perdue
// se rejoue avec le même identifiant de job, sans nouvelle consommation.
// deno-lint-ignore-file no-explicit-any
export interface SaleOrchestration {
  ok: boolean;
  reason?: string;
  venteCreated: boolean;
  inventaireUpdated: boolean;
  siblingsCancelled: number;
  pendingRemoval: number;
  retraitsArmes: number;
  emailSent: boolean;
  venteNotee?: boolean;
  rejouee?: boolean;
}

export const FEATURE_VENTE_A_ANNONCER = "vente_a_annoncer";
export const PLATEFORME_AILLEURS = "ailleurs";

export async function orchestrateSale(
  admin: any, userId: string, jobId: string, opts?: { priceOverride?: number; declaree?: boolean },
): Promise<SaleOrchestration> {
  const none: SaleOrchestration = {
    ok: false, venteCreated: false, inventaireUpdated: false,
    siblingsCancelled: 0, pendingRemoval: 0, retraitsArmes: 0, emailSent: false,
  };
  const prix = Number(opts?.priceOverride);
  // (06/10) declaree : la personne confirme elle-même la vente (bouton
  // « Vendue ? », check-listing-status). Même transaction, même résultat ; le
  // drapeau dit seulement aux notifications push de ne pas la lui annoncer
  // (enregistrer_vente_declaree, migration 20261006140000). La détection
  // automatique (API eBay) garde le chemin nu : elle, on la notifie.
  const { data, error } = opts?.declaree
    ? await admin.rpc("enregistrer_vente_declaree", {
      p_user: userId, p_job: jobId, p_prix: Number.isFinite(prix) && prix > 0 ? prix : null,
    })
    : await admin.rpc("enregistrer_vente_atomique", {
      p_user: userId, p_cle: null, p_job: jobId,
      p_prix: Number.isFinite(prix) && prix > 0 ? prix : null,
    });
  if (error) {
    console.error("[sale] transaction annulée :", error.message);
    return { ...none, reason: "La vente n'a pas pu être enregistrée. Réessaie : elle ne sera pas comptée deux fois." };
  }
  if (!data || typeof data.ok !== "boolean") return { ...none, reason: "Confirmation de vente indisponible. Réessaie." };
  return { ...none, ...data, emailSent: false };
}
