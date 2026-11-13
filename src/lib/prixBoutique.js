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
//   · l'essai gratuit n'est annoncé sur mobile que si la boutique l'offre à ce compte (Android : une offre dont la
//     première phase de prix est à 0 ; iPhone : 13/11, l'éligibilité lue dans l'historique Apple — etatEssaiBoutique).
// Pur (aucun import natif) : testé en Node par scripts/prix-boutique-selftest.mjs. Le chargement natif vit ailleurs.

import { CLOUD_PRIX_AFFICHE, CLOUD_PRIX_AFFICHE_EN } from '../utils/palier.js';
import { PALIER_DE_FORMULE, SUPPLEMENT_CLOUD_EUR, FORMULES_AVEC_ESSAI } from '../../supabase/functions/_shared/formules-cloud.js';
import { groupeAppleDuProduit } from './eligibiliteApple.js';

// (11/11/2026) + les trois formules avec Cloud (contrat _shared/formules-cloud.js) : même règle que les autres.
export const PRODUITS_PRIX = Object.freeze(['premium', 'pro', 'business', 'cloud', 'premium_cloud', 'pro_cloud', 'business_cloud']);
// Les prix du WEB (Stripe, euros). ⛔ Lus sur le web SEULEMENT.
// (11/11/2026) Les formules avec Cloud : les prix Stripe créés le 11/11 (price_1UahzR… 34,99 €, price_1Uai1K… 49,99 €,
// price_1Uai2n… 79,99 € par mois, relus par l'API) — scripts/formules-cloud-offres-selftest.mjs les compare au contrat.
export const PRIX_WEB = Object.freeze({
  premium: Object.freeze({ fr: '12,99 €', en: '€12.99' }),
  pro: Object.freeze({ fr: '29,99 €', en: '€29.99' }),
  business: Object.freeze({ fr: '59,99 €', en: '€59.99' }),
  cloud: Object.freeze({ fr: CLOUD_PRIX_AFFICHE, en: CLOUD_PRIX_AFFICHE_EN }),
  premium_cloud: Object.freeze({ fr: '34,99 €', en: '€34.99' }),
  pro_cloud: Object.freeze({ fr: '49,99 €', en: '€49.99' }),
  business_cloud: Object.freeze({ fr: '79,99 €', en: '€79.99' }),
});
// Le jeton des textes (cloud/textes.js, entree/textes.js, cloud/textesConnexion.js…) : remplacé à la lecture par le
// prix du Cloud du canal (avecPrix). Un texte n'écrit plus jamais le prix lui-même.
export const JETON_PRIX_CLOUD = '⟦prix_cloud⟧';
export const TEXTE_CHARGEMENT = '…';
const NBSP = ' ';

const ETAT_WEB = Object.freeze({ canal: 'web', statut: 'web', prix: Object.freeze({}), eligibilite: null });
let etat = ETAT_WEB;
let version = 0;
const abonnes = new Set();
const prevenir = () => { version += 1; for (const f of abonnes) { try { f(); } catch { /* un abonné ne casse pas les autres */ } } };

/** Pose l'état (le chargeur natif seulement ; les selftests). canal : 'web' | 'apple' | 'google'.
 *  (13/11) `eligibilite` (iPhone) : { plan, cloud } → true | false | null (lib/eligibiliteApple.js) ; absente = gardée si
 *  le canal ne change pas (les prix et l'historique Apple se lisent séparément). */
export function poserPrixBoutique(e) {
  const canal = e?.canal ?? 'web';
  const eligibilite = e && 'eligibilite' in e ? (e.eligibilite ?? null) : (e && etat.canal === canal ? etat.eligibilite : null);
  etat = e ? Object.freeze({ canal, statut: e.statut ?? (canal === 'web' ? 'web' : 'chargement'), prix: Object.freeze({ ...(e.prix ?? {}) }), eligibilite }) : ETAT_WEB;
  prevenir();
}
/** (13/11, point b de Nico) Pose l'éligibilité Apple lue dans l'historique de l'identifiant Apple du téléphone. */
export function poserEligibiliteApple(eligibilite) {
  etat = Object.freeze({ ...etat, eligibilite: eligibilite ?? null });
  prevenir();
}
export const lirePrixBoutique = () => etat;
export function abonnerPrixBoutique(f) { abonnes.add(f); return () => { abonnes.delete(f); }; }
export const estCanalBoutique = (e = etat) => e.canal === 'apple' || e.canal === 'google';

// (09/11/2026 nuit, condition de Nico avant l'OTA 2.9.168) LE REPLI DE L'iPHONE : si la lecture des prix chez Apple
// ÉCHOUE (erreur, réponse vide ou sans ce produit, plus de DELAI_LECTURE_MS — lib/chargerPrixBoutique.js), l'écran
// d'achat reste UTILISABLE : le prix affiché redevient celui qu'affichait l'app jusqu'à la 2.9.166 (euros, validé par
// Apple), le bouton d'achat agit, et l'essai suit la décision du serveur (comme avant le 08/11). La feuille de paiement
// d'Apple montre, elle, le montant réel avant toute confirmation. (13/11, point b) L'essai, lui, ne suit plus le repli :
// il suit l'éligibilité lue dans l'historique Apple (etatEssaiBoutique). ⛔ ANDROID JAMAIS : la règle de Google qui a refusé la
// vc36 interdit un prix d'une autre monnaie que sa feuille — sur Android, « … » et achat inactif tant que rien n'est lu.
export const repliApple = (produit, e = etat) => e.canal === 'apple'
  && (e.statut === 'echec' || (e.statut === 'pret' && !(typeof e.prix?.[produit]?.texte === 'string' && e.prix[produit].texte.trim())));

/** Le prix mensuel À AFFICHER (« 12,99 € », « $24.99 »…), ou null tant que la boutique ne l'a pas donné. */
export function prixAffiche(produit, lang = 'fr', e = etat) {
  if (!estCanalBoutique(e)) return PRIX_WEB[produit]?.[lang === 'en' ? 'en' : 'fr'] ?? null;
  const t = e.prix?.[produit]?.texte;
  if (typeof t === 'string' && t.trim()) return t.trim();
  if (repliApple(produit, e)) return PRIX_WEB[produit]?.[lang === 'en' ? 'en' : 'fr'] ?? null;
  return null;
}
/** Le bouton d'achat peut-il agir ? (le prix est affiché) */
export const prixPret = (produit, e = etat) => prixAffiche(produit, 'fr', e) != null;
/** Le prix, ou « … » tant qu'il charge (jamais un prix deviné). */
export const prixOuChargement = (produit, lang = 'fr', e = etat) => prixAffiche(produit, lang, e) ?? TEXTE_CHARGEMENT;
/** « 0 € » sur le web ; « Gratuit » / « Free » sur mobile (aucune monnaie devinée). */
export const prixGratuit = (lang = 'fr', e = etat) => (estCanalBoutique(e) ? (lang === 'en' ? 'Free' : 'Gratuit') : (lang === 'en' ? '€0' : '0 €'));

// (13/11/2026, ordre de Nico : « l'essai doit marcher pareil sur les 3 canaux ») LES PRODUITS APPLE QUI PORTENT UNE SEMAINE
// GRATUITE (offre d'introduction), d'après App Store Connect : app.fillsell.cloud.sub (« Gratuit la première semaine »,
// créée le 05/11), app.fillsell.premium.cloud et app.fillsell.pro.cloud (FREE_TRIAL 1 semaine, relus le 12/11) — JAMAIS
// app.fillsell.business.cloud (offre retirée le 11/11 à 22:09, décision de Nico). Le module d'achat iOS du binaire en vente
// (@capgo/native-purchases 8.3.3, iPhone 2.9.164) ne rend PAS `introductoryPrice` (Product.dictionary : identifier,
// description, title, price, priceString, currencyCode, isFamilyShareable) : sans cette table, l'essai n'était JAMAIS
// annoncé sur iPhone (« Ta boutique d'applications ne propose pas d'essai gratuit à ce compte ») alors qu'Apple offrait la
// semaine (8b457627, 7d22ae91, f0acd3af, c7c382b7 : SUBSCRIBED INITIAL_BUY, fin à J+7), et la question « Apple peut
// t'afficher 1 semaine gratuite » (4d) ne se posait jamais. Une offre ABSENTE de la réponse (clé introductoryPrice non
// rendue) n'est donc pas un « non » : l'essai suit la décision du serveur, comme sur le web et comme le repli du 09/11.
export const PRODUITS_ESSAI_APPLE = Object.freeze(['cloud', ...FORMULES_AVEC_ESSAI]);
/**
 * (13/11/2026, point b de Nico — remplace la règle du matin) LA SEMAINE GRATUITE DE LA BOUTIQUE, POUR CET IDENTIFIANT :
 *   'oui'     — elle sera offerte (web : le serveur décide, la boutique n'y est pour rien) ;
 *   'non'     — elle ne le sera pas : le texte dit le prix et « prélevé aujourd'hui », AVANT la feuille de la boutique ;
 *   'inconnu' — iPhone seulement, l'historique Apple n'a pas pu être lu : un texte vrai dans les deux cas, jamais
 *               « 7 jours gratuits » affirmé sans le savoir.
 * Google : la boutique ne rend QUE les offres auxquelles le compte Google a droit (« user eligible offers »,
 * developer.android.com/google/play/billing/integrate) — une offre à 0 rendue = 'oui', sinon 'non'.
 * Apple : le module du binaire en vente ne rend pas l'offre d'introduction ; la table PRODUITS_ESSAI_APPLE (offres
 * d'App Store Connect) PUIS l'éligibilité lue dans l'historique Apple du téléphone (lib/eligibiliteApple.js : un
 * abonnement en cours du groupe, ou une offre d'introduction déjà utilisée dans le groupe → 'non'). Un binaire qui
 * rendrait `introductoryPrice` (clé présente) l'emporte. Avant ce correctif, l'iPhone annonçait « 7 jours gratuits » à
 * tout compte sans essai FillSell, même à un identifiant Apple qui avait déjà eu la semaine (Apple prélève alors tout de
 * suite).
 */
export function etatEssaiBoutique(produit = 'cloud', e = etat) {
  if (!estCanalBoutique(e)) return 'oui';
  const v = e.prix?.[produit]?.essai;
  if (e.canal === 'google') return v === true ? 'oui' : 'non';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (!PRODUITS_ESSAI_APPLE.includes(produit)) return 'non';
  const el = e.eligibilite?.[groupeAppleDuProduit(produit)];
  return el === true ? 'oui' : el === false ? 'non' : 'inconnu';
}
/** L'essai gratuit peut-il être ANNONCÉ comme certain ? (web : oui, le serveur décide ; mobile : 'oui' seulement). */
export const essaiBoutiqueOffert = (produit = 'cloud', e = etat) => etatEssaiBoutique(produit, e) === 'oui';

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
      // (13/11) Clé ABSENTE (module iOS 8.3.3 : il ne la rend pas) = inconnu (null), jamais « pas d'essai ».
      sortie[produit] = {
        texte: String(p.priceString), montant: Number(p.price), devise: p.currencyCode ?? null,
        essai: !('introductoryPrice' in p) ? null : Boolean(intro && (Number(intro.price) === 0 || intro.paymentMode === 2)),
      };
    }
  }
  return sortie;
}

export const versionPrixBoutique = () => version;

// ── Les formules avec Cloud (11/11/2026) : le supplément du Cloud et le « 0 aujourd'hui », dans la monnaie du canal ──
const deuxDecimales = (n) => Math.round(n * 100) / 100;
/** Un montant en euros « à la FillSell » (web) : « 22 € », « 22,50 € » ; anglais « €22 », « €22.50 ». */
function eurosWeb(n, lang) {
  const v = deuxDecimales(n);
  const entier = Number.isInteger(v);
  if (lang === 'en') return `€${entier ? v : v.toFixed(2)}`;
  return `${entier ? v : v.toFixed(2).replace('.', ',')} €`;
}
/** Un montant dans la monnaie de la BOUTIQUE (Intl, langue de l'app) ; null si la monnaie est inconnue. */
function montantBoutique(n, devise, lang) {
  if (!devise) return null;
  try {
    const v = deuxDecimales(n);
    return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
      style: 'currency', currency: devise, currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2,
    }).format(v).replace(/[\u00A0\u202F]/g, ' ');
  } catch { return null; }
}
/**
 * « Le Cloud pour 22 € de plus » (décision 4 de Nico : un fait, jamais un rabais affiché) — le supplément d'une formule avec
 * Cloud sur la formule seule. WEB : le supplément du contrat (22 / 20 / 20 €, = les prix Stripe). iPHONE / ANDROID : la
 * différence des DEUX prix de la boutique, dans SA monnaie (règle de Google, refus de la vc36) ; prix pas lus, monnaies
 * différentes ou différence nulle : null (la ligne ne s'affiche pas). Repli de l'iPhone (Apple muet) : le montant du web,
 * comme les prix affichés. Pur.
 */
export function supplementAffiche(formule, lang = 'fr', e = etat) {
  const palier = PALIER_DE_FORMULE[formule];
  const contrat = SUPPLEMENT_CLOUD_EUR[formule];
  if (!palier || contrat == null) return null;
  if (!estCanalBoutique(e)) return eurosWeb(contrat, lang);
  const a = e.prix?.[formule], b = e.prix?.[palier];
  if (a && b && Number.isFinite(a.montant) && Number.isFinite(b.montant) && a.devise && a.devise === b.devise && a.montant > b.montant) {
    return montantBoutique(a.montant - b.montant, a.devise, lang);
  }
  if (repliApple(formule, e) && repliApple(palier, e)) return eurosWeb(contrat, lang);
  return null;
}
/** « 0 € » (« Carte demandée, 0 € aujourd'hui ») dans la monnaie du canal ; mobile : celle de la boutique pour ce produit,
 *  « … » tant qu'elle n'est pas connue (jamais une monnaie devinée). */
export function zeroAffiche(formule, lang = 'fr', e = etat) {
  if (!estCanalBoutique(e)) return lang === 'en' ? '€0' : '0 €';
  const devise = e.prix?.[formule]?.devise ?? null;
  if (devise) return montantBoutique(0, devise, lang) ?? TEXTE_CHARGEMENT;
  if (repliApple(formule, e)) return lang === 'en' ? '€0' : '0 €';
  return TEXTE_CHARGEMENT;
}

/** (09/11, repli de l'iPhone) Appelle `appel()` et rend sa promesse, bornée à `ms` : une réponse qui n'arrive pas, un
 *  rejet ou une exception levée d'un coup (module natif absent d'un vieux binaire) deviennent un REJET — jamais une
 *  exception qui s'échappe, jamais une attente sans fin. Pur, testé (selftest:prix-boutique). */
export function avecDelai(appel, ms) {
  let minuteur = null;
  const delai = new Promise((_, rejeter) => { minuteur = setTimeout(() => rejeter(new Error('delai_lecture_prix')), ms); });
  return Promise.race([Promise.resolve().then(() => appel()), delai]).finally(() => clearTimeout(minuteur));
}
