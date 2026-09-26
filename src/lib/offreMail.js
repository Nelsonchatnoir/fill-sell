// ── Offre portée par un lien d'e-mail (2026-09-26, blast de rentrée) ─────────
// Le bouton « Profiter de -50 % » du mail mène à fillsell.app/login?offre=CODE.
// Le code doit survivre à tout ce qui sépare le clic du paiement : la page de
// connexion, le détour OAuth (Google/Apple QUITTENT le site et reviennent par
// /auth/callback — tout état React est perdu en route), le chargement de l'app.
// D'où localStorage, relevé À LA PREMIÈRE PEINTURE du routeur, avant la moindre
// redirection.
//
// Ce que le code fait ensuite :
//   · App.jsx ouvre la modale des offres une fois, à l'arrivée (compte gratuit,
//     web uniquement) ;
//   · triggerCheckout l'envoie à create-checkout-session, qui l'applique au
//     Checkout Stripe (`discounts`) au lieu du champ « code promo » à remplir.
//
// Garde-fous :
//  - liste FERMÉE de codes : jamais une valeur arbitraire venue de l'URL. Le
//    serveur revérifie de toute façon auprès de Stripe (code actif, conditions
//    du coupon) — ce n'est pas ici que se joue la sécurité du prix ;
//  - TTL 7 jours : le lien reste valable si la personne revient le surlendemain,
//    mais ne colle pas indéfiniment une remise à des visites sans rapport ;
//  - WEB UNIQUEMENT : le natif paie par l'App Store / Google Play, où un code
//    Stripe n'a aucun sens. L'appelant filtre (isNative), ce module ne sait pas.
const CLE = 'fs_offre_mail';
const CODES_AUTORISES = ['FILLSELL50'];
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function lire() {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const v = JSON.parse(brut);
    if (!v || !CODES_AUTORISES.includes(v.code)) return null;
    if (!Number.isFinite(v.ts) || Date.now() - v.ts > TTL_MS) {
      localStorage.removeItem(CLE);
      return null;
    }
    return v;
  } catch { return null; }
}

function ecrire(v) {
  try { localStorage.setItem(CLE, JSON.stringify(v)); } catch { /* mode privé : pas de remise automatique, le champ code promo reste au Checkout */ }
}

/**
 * Relève ?offre=CODE dans l'URL courante. À appeler le plus tôt possible (avant
 * toute redirection du routeur). Idempotent. Un NOUVEAU clic sur le lien réarme
 * l'ouverture automatique de la modale.
 */
export function capterOffre() {
  try {
    const code = String(new URLSearchParams(window.location.search).get('offre') ?? '').trim().toUpperCase();
    if (!CODES_AUTORISES.includes(code)) return;
    ecrire({ code, ts: Date.now(), ouverte: false });
  } catch { /* URL illisible : rien à relever */ }
}

/** Le code en cours de validité, ou null. */
export function offreEnCours() {
  return lire()?.code ?? null;
}

/**
 * TRUE une seule fois par clic sur le lien : l'app ouvre la modale des offres
 * à l'arrivée, puis plus jamais d'elle-même (le code, lui, reste appliqué au
 * paiement jusqu'à expiration).
 */
export function offreAOuvrir() {
  const v = lire();
  if (!v || v.ouverte) return false;
  ecrire({ ...v, ouverte: true });
  return true;
}

/** Après un paiement abouti : l'offre a rempli son office. */
export function oublierOffre() {
  try { localStorage.removeItem(CLE); } catch { /* mode privé */ }
}
