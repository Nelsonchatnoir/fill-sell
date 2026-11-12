// (11/11/2026, offres Cloud) LES PRIX STRIPE, LUS À UN SEUL ENDROIT — les secrets STRIPE_PRICE_* (formules-serveur.js,
// SECRETS_PRIX_STRIPE), trois prix neufs compris : STRIPE_PRICE_PREMIUM_CLOUD, STRIPE_PRICE_PRO_CLOUD,
// STRIPE_PRICE_BUSINESS_CLOUD. Un secret absent = '' : le prix n'est jamais reconnu (rien d'inventé).
import { prixStripeDepuis } from "./formules-serveur.js";

export type PrixStripe = {
  standard: string; pro: string; business: string; cloud: string;
  premium_cloud: string; pro_cloud: string; business_cloud: string;
};

export function prixStripe(): PrixStripe {
  return prixStripeDepuis((k: string) => Deno.env.get(k)) as PrixStripe;
}
