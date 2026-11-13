// ═══════════════════════════════════════════════════════════════════════════
// LE FILET « UN SEUL ABONNEMENT » DES WEBHOOKS (13/11/2026, 3e réponse de Nico, point a)
// ═══════════════════════════════════════════════════════════════════════════
// Appelé quand un abonnement S'OUVRE (Apple SUBSCRIBED, Google SUBSCRIPTION_PURCHASED / validate-google-purchase,
// Stripe checkout.session.completed) : si le compte porte maintenant DEUX abonnements vivants (règle
// _shared/un-seul-abonnement.js : Stripe relu, boutiques sur le profil), une alerte part à support@ avec la liste.
// LIRE ET PRÉVENIR, RIEN D'AUTRE : aucune écriture, aucun geste chez un canal — la décision est à Nico.
// Jamais bloquant : tout est avalé et borné (lecture Stripe 5 s, alerte 2 s) ; le code HTTP rendu au canal ne dépend
// jamais de ce filet.
import { abonnementsVivants, lignesDeuxAbonnements } from "./un-seul-abonnement.js";
import { litAbonnementStripe } from "./cloud-option.js";
import { prixStripe } from "./prix-stripe.ts";
import { signalerDeuxAbonnements } from "./payment-notify.ts";

const COLONNES = "email, stripe_customer_id, google_purchase_token, google_product_id, apple_original_transaction_id, is_premium, is_pro, is_business, "
  + "subscription_period_end, cloud_canal, cloud_ref, is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete, cloud_periode_fin, cloud_formule";

async function abonnementsStripeLus(customerId: string | null): Promise<unknown[]> {
  if (!customerId) return [];
  const cle = Deno.env.get("STRIPE_SECRET_KEY");
  if (!cle) return [];
  const r = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=30`,
    { headers: { Authorization: `Bearer ${cle}` }, signal: AbortSignal.timeout(5_000) });
  if (!r.ok) throw new Error(`Stripe subscriptions.list → HTTP ${r.status}`);
  const j = await r.json();
  const prix = prixStripe();
  return (Array.isArray(j?.data) ? j.data : []).map((s: { status?: string }) => ({ ...litAbonnementStripe(s, prix), status: s?.status ?? null }));
}

/** Deux abonnements vivants ? → alerte support@. Rend le nombre d'abonnements vivants lus (ou null si illisible). */
export async function verifierDeuxAbonnements(
  // deno-lint-ignore no-explicit-any
  admin: { from: (t: string) => any },
  userId: string | null | undefined,
  o: { evenement: string; canal: "apple" | "google" | "stripe"; test?: boolean },
): Promise<number | null> {
  if (!userId) return null;
  try {
    const { data: p, error } = await admin.from("profiles").select(COLONNES).eq("id", userId).maybeSingle();
    if (error || !p) return null;
    let stripe: unknown[] = [];
    try { stripe = await abonnementsStripeLus(p.stripe_customer_id ?? null); } catch (e) {
      console.warn(`[deux-abonnements] ${userId} : Stripe illisible (${(e as Error)?.message ?? e}) — boutiques seules`);
    }
    const vivants = abonnementsVivants({ profil: p, stripe });
    if (vivants.length >= 2) {
      console.error(`[deux-abonnements] ${userId} : ${vivants.length} abonnements vivants après ${o.evenement} —`, JSON.stringify(vivants));
      await signalerDeuxAbonnements({ user_id: userId, email: p.email ?? null, evenement: o.evenement, canal: o.canal, lignes: lignesDeuxAbonnements(vivants), test: o.test === true });
    }
    return vivants.length;
  } catch (e) {
    console.warn(`[deux-abonnements] ${userId} : vérification impossible (${(e as Error)?.message ?? e})`);
    return null;
  }
}
