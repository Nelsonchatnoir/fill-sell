// ═══════════════════════════════════════════════════════════════════════════
// LES PRIX AFFICHÉS — UNE SEULE SOURCE PAR CANAL (08/11/2026, refus Google Play de la vc36)
// ═══════════════════════════════════════════════════════════════════════════
// Google a refusé la version code 36 (« Subscriptions policy — Currency differences with prominent display price ») :
// l'app écrivait ses prix EN DUR en euros (Premium 12,99 €, Pro 29,99 €, Business 59,99 €, Cloud 24,99 €), alors que
// la feuille de paiement de Google affiche la monnaie du pays de l'acheteur. LA RÈGLE :
//   · WEB : les prix Stripe, en euros (PRIX_WEB) — inchangés ;
//   · iPHONE / ANDROID : le prix FORMATÉ PAR LA BOUTIQUE (App Store / Google Play Billing : `priceString`, monnaie et
//     format du téléphone), lu par lib/chargerPrixBoutique.js. Tant qu'il n'est pas lu : null → l'écran montre
//     TEXTE_CHARGEMENT et le bouton d'achat reste inactif (prixPret). JAMAIS un prix en euros écrit en dur sur mobile.
//   · l'essai gratuit du Cloud n'est annoncé sur mobile que si la boutique propose une offre gratuite à ce compte
//     (Android : une offre dont la première phase de prix est à 0 ; iPhone : un prix d'introduction à 0).
// Pur (aucun import natif) : testé en Node par scripts/prix-boutique-selftest.mjs. Le chargement natif vit ailleurs.

import { CLOUD_PRIX_AFFICHE, CLOUD_PRIX_AFFICHE_EN } from '../utils/palier.js';

export const PRODUITS_PRIX = Object.freeze(['premium', 'pro', 'business', 'cloud']);
// Les prix du WEB (Stripe, euros). ⛔ Lus sur le web SEULEMENT.
export const PRIX_WEB = Object.freeze({
  premium: Object.freeze({ fr: '12,99 €', en: '€12.99' }),
  pro: Object.freeze({ fr: '29,99 €', en: '€29.99' }),
  business: Object.freeze({ fr: '59,99 €', en: '€59.99' }),
  cloud: Object.freeze({ fr: CLOUD_PRIX_AFFICHE, en: CLOUD_PRIX_AFFICHE_EN }),
});
// Le jeton des textes (cloud/textes.js, entree/textes.js, cloud/textesConnexion.js…) : remplacé à la lecture par le
// prix du Cloud du canal (avecPrix). Un texte n'écrit plus jamais le prix lui-même.
export const JETON_PRIX_CLOUD = '⟦prix_cloud⟧';
export const TEXTE_CHARGEMENT = '…';
const NBSP = ' ';

const ETAT_WEB = Object.freeze({ canal: 'web', statut: 'web', prix: Object.freeze({}) });
let etat = ETAT_WEB;
let version = 0;
const abonnes = new Set();

/** Pose l'état (le chargeur natif seulement ; les selftests). canal : 'web' | 'apple' | 'google'. */
export function poserPrixBoutique(e) {
  etat = e ? Object.freeze({ canal: e.canal ?? 'web', statut: e.statut ?? (e.canal === 'web' ? 'web' : 'chargement'), prix: Object.freeze({ ...(e.prix ?? {}) }) }) : ETAT_WEB;
  version += 1;
  for (const f of abonnes) { try { f(); } catch { /* un abonné ne casse pas les autres */ } }
}
export const lirePrixBoutique = () => etat;
export function abonnerPrixBoutique(f) { abonnes.add(f); return () => { abonnes.delete(f); }; }
export const estCanalBoutique = (e = etat) => e.canal === 'apple' || e.canal === 'google';

/** Le prix mensuel À AFFICHER (« 12,99 € », « $24.99 »…), ou null tant que la boutique ne l'a pas donné. */
export function prixAffiche(produit, lang = 'fr', e = etat) {
  if (!estCanalBoutique(e)) return PRIX_WEB[produit]?.[lang === 'en' ? 'en' : 'fr'] ?? null;
  const t = e.prix?.[produit]?.texte;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}
/** Le bouton d'achat peut-il agir ? (le prix est affiché) */
export const prixPret = (produit, e = etat) => prixAffiche(produit, 'fr', e) != null;
/** Le prix, ou « … » tant qu'il charge (jamais un prix deviné). */
export const prixOuChargement = (produit, lang = 'fr', e = etat) => prixAffiche(produit, lang, e) ?? TEXTE_CHARGEMENT;
/** « 0 € » sur le web ; « Gratuit » / « Free » sur mobile (aucune monnaie devinée). */
export const prixGratuit = (lang = 'fr', e = etat) => (estCanalBoutique(e) ? (lang === 'en' ? 'Free' : 'Gratuit') : (lang === 'en' ? '€0' : '0 €'));

/**
 * L'essai gratuit du Cloud peut-il être ANNONCÉ ? Web : oui (le serveur décide). Mobile : seulement si la boutique
 * propose une offre gratuite à ce compte — inconnu (pas encore lu) : non annoncé.
 */
export function essaiBoutiqueOffert(produit = 'cloud', e = etat) {
  if (!estCanalBoutique(e)) return true;
  return e.prix?.[produit]?.essai === true;
}

// ── Les textes : le jeton remplacé à la lecture ──────────────────────────────────────────────────────────────────────
const memo = new WeakMap();
function remplacer(s, prix) { return s.includes(JETON_PRIX_CLOUD) ? s.split(JETON_PRIX_CLOUD).join(prix) : s; }
function profond(v, prix) {
  if (typeof v === 'string') return remplacer(v, prix);
  if (typeof v === 'function') return (...a) => profond(v(...a), prix);
  if (Array.isArray(v)) return v.map((x) => profond(x, prix));
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = profond(x, prix);
    return o;
  }
  return v;
}
/** Un objet de textes avec le prix du Cloud du canal à la place du jeton (insécable, comme avant). Mémoïsé. */
export function avecPrix(textes, lang = 'fr', e = etat) {
  if (!textes || typeof textes !== 'object') return textes;
  const prix = prixOuChargement('cloud', lang, e).replace(/ /g, NBSP);
  let parTexte = memo.get(textes);
  if (!parTexte) { parTexte = new Map(); memo.set(textes, parTexte); }
  const cle = `${lang}|${prix}`;
  if (!parTexte.has(cle)) parTexte.set(cle, profond(textes, prix));
  return parTexte.get(cle);
}

// ── La lecture des produits de la boutique (pure) ────────────────────────────────────────────────────────────────────
/**
 * products : la réponse de NativePurchases.getProducts (abonnements) ; ids : { premium, pro, business, cloud } → id du
 * produit dans CETTE boutique. Rend { premium: { texte, montant, devise, essai }, … } (produits absents : rien).
 *   · Google : une entrée PAR OFFRE (planIdentifier = produit, identifier = offre de base, offerId null = l'offre de
 *     base, au prix récurrent ; une offre dont la 1re phase est à 0 = essai gratuit proposé à ce compte) ;
 *   · Apple : une entrée par produit (identifier = produit ; introductoryPrice à 0 = essai gratuit).
 */
export function lireProduitsBoutique(products, { canal, ids }) {
  const sortie = {};
  const liste = Array.isArray(products) ? products : [];
  for (const [produit, id] of Object.entries(ids ?? {})) {
    if (!id) continue;
    if (canal === 'google') {
      const offres = liste.filter((p) => p && (p.planIdentifier === id || (!p.planIdentifier && p.identifier === id)));
      if (!offres.length) continue;
      const base = offres.find((p) => p.offerId == null && Number(p.price) > 0) ?? offres.filter((p) => Number(p.price) > 0).sort((a, b) => Number(b.price) - Number(a.price))[0];
      if (!base?.priceString) continue;
      sortie[produit] = {
        texte: String(base.priceString), montant: Number(base.price), devise: base.currencyCode ?? null,
        essai: offres.some((p) => p.offerId != null && Number(p.price) === 0),
      };
    } else if (canal === 'apple') {
      const p = liste.find((x) => x && x.identifier === id);
      if (!p?.priceString) continue;
      const intro = p.introductoryPrice;
      sortie[produit] = {
        texte: String(p.priceString), montant: Number(p.price), devise: p.currencyCode ?? null,
        essai: Boolean(intro && (Number(intro.price) === 0 || intro.paymentMode === 2)),
      };
    }
  }
  return sortie;
}

export const versionPrixBoutique = () => version;
