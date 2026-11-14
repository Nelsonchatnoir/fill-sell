// Le prix de FillSell Cloud lu À LA SOURCE (07/11/2026 soir) — le branchement Deno des règles pures de
// ./cloud-prix.js : la clé Stripe (STRIPE_SECRET_KEY), le jeton de l'App Store Server API (genererJWTApple, clé
// « Achat intégré ») et le jeton de l'API Google Play Developer (compte de service). Lecture SEULE, aucune
// écriture nulle part. Un lecteur par passage : les jetons sont demandés une fois, puis réutilisés ; un jeton
// refusé rend toutes les lectures de son canal muettes (le mail part alors sans montant, jamais avec un faux).
import { BUNDLE_APPLE, lirePrixCloud } from "./cloud-prix.js";
import { prixStripe } from "./prix-stripe.ts";
import { genererJWTApple } from "./apple-jwt.ts";
import { jetonGooglePlay } from "./google-play-token.ts";

export type PrixCloud = { montant: number; devise: string };
export type LecturePrixCloud = {
  canal: string | null;
  prix: PrixCloud | null;
  renouvelle: boolean | null;
  source: string;
  raison: string | null;
  environnement?: string | null;
};

/** Un lecteur pour un passage : (canal, ref) → la lecture (jamais d'exception). */
export function lecteurPrixCloud(): (canal: unknown, ref: unknown) => Promise<LecturePrixCloud> {
  let apple: Promise<string> | null = null;
  let google: Promise<string> | null = null;
  const deps = {
    fetch: (url: string, init?: RequestInit) => fetch(url, init),
    cleStripe: Deno.env.get("STRIPE_SECRET_KEY") ?? "",
    // (14/11/2026, bloc F) La table des prix : la formule se lit sur le prix ; un abonnement sans Cloud n'annonce rien.
    prixStripe: prixStripe() as unknown as Record<string, string>,
    jetonApple: () => (apple ??= genererJWTApple(BUNDLE_APPLE)),
    jetonGoogle: () => (google ??= jetonGooglePlay()),
  };
  return (canal, ref) =>
    lirePrixCloud({ canal: canal == null ? null : String(canal), ref: ref == null ? null : String(ref), deps }) as Promise<LecturePrixCloud>;
}
