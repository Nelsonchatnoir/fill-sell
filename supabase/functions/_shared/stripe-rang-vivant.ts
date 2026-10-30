// (30/10, lot D point 2) Le rang Stripe VIVANT d'un client, relu chez Stripe en LECTURE seule (REST, aucun SDK) —
// pour qu'un arrêt Google ou Apple ne retire jamais un palier payé par Stripe. Mêmes règles que stripe-webhook
// (drapeauxDepuisStripe : payé = active | trialing, Cloud exclu, pro / business par métadonnée, prix en repli).
import { drapeauxDepuisStripe } from "./cloud-option.js";
import { rangDesDrapeaux } from "./droits-canaux.js";

export function prixStripeConnus() {
  return {
    standard: Deno.env.get("STRIPE_PRICE_STANDARD") ?? "",
    pro: Deno.env.get("STRIPE_PRICE_PRO") ?? "",
    business: Deno.env.get("STRIPE_PRICE_BUSINESS") ?? "",
    cloud: Deno.env.get("STRIPE_PRICE_CLOUD") ?? "",
  };
}

/** Le rang (0 à 3) des abonnements Stripe payés du client. Lance une erreur si Stripe ne répond pas : l'appelant
 *  décide (jamais un « 0 » inventé sur une panne, qui couperait un palier payé). */
export async function rangStripeDuClient(customerId: string | null | undefined): Promise<number> {
  if (!customerId) return 0;
  const cle = Deno.env.get("STRIPE_SECRET_KEY");
  if (!cle) throw new Error("STRIPE_SECRET_KEY absente");
  const r = await fetch(
    `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=20`,
    { headers: { Authorization: `Bearer ${cle}` }, signal: AbortSignal.timeout(15_000) },
  );
  if (!r.ok) throw new Error(`Stripe subscriptions.list → HTTP ${r.status}`);
  const j = await r.json();
  return rangDesDrapeaux(drapeauxDepuisStripe(j?.data ?? [], prixStripeConnus()));
}
