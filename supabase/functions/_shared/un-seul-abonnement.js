// ═══════════════════════════════════════════════════════════════════════════
// UN SEUL ABONNEMENT ACTIF PAR COMPTE, TOUS CANAUX CONFONDUS (13/11/2026, 3e réponse de Nico, point a)
// ═══════════════════════════════════════════════════════════════════════════
// « Une montée depuis un autre canal crée un 2e abonnement, donc un double prélèvement. Règle : un seul abonnement actif
// par compte, tous canaux confondus. Une montée qui ne peut pas se faire sur le même canal est empêchée, avec un message
// clair qui dit où faire le changement. »
// Cas RÉELS (prod lue le 13/11 en lecture seule — Stripe : 45 abonnements non résiliés ; journal des boutiques ; profils) :
//   · 785352fe — Premium App Store (app.fillsell.premium.standard, renouvelé le 30/10, renouvellement auto actif, fin le
//     30/11), puis Pro PAR CARTE sur le web le 10/11 à 18:03 (Réglages › Abonnement, 29,99 € payés) : create-checkout-session
//     « montée web … laissée passer » (abonnement boutique de rang inférieur) → deux abonnements, deux prélèvements ;
//   · c7c382b7 — Pro par carte (Stripe, depuis le 31/10), puis FillSell Cloud SEUL pris sur iPhone le 12/11 (App Store,
//     semaine gratuite jusqu'au 19/11 18:18, puis 24,99 € chez Apple) : aucun garde côté iPhone ;
//   · f0acd3af — Pro App Store (app.fillsell.pro2.sub), puis FillSell Cloud SEUL App Store le 09/11 (autre groupe
//     d'abonnements Apple, semaine gratuite jusqu'au 16/11 19:27) : deux abonnements Apple.
// Pur, sans réseau ni import : le serveur (create-checkout-session, garde-abonnement, alertes des webhooks) lui passe ce
// qu'il a LU (Stripe relu, Google relu, profil) ; l'app lui passe le profil quand le serveur ne répond pas (repli).
//
// Un abonnement « vivant » = un abonnement qui existe chez son canal et peut encore prélever : Stripe active | trialing |
// past_due (un impayé en relance prélèvera dès la carte mise à jour) ; Apple / Google : la période en cours n'est pas finie.
// N'en sont PAS : un compte offert (is_comped), le Cloud « offert » (aucun prélèvement), un abonnement terminé.

export const CANAUX_ABONNEMENT = Object.freeze(['stripe', 'apple', 'google']);
export const ACHATS = Object.freeze(['palier', 'formule', 'cloud_seul']);
const STATUTS_STRIPE_VIVANTS = Object.freeze(['active', 'trialing', 'past_due']);
const RANG_PRODUIT = Object.freeze({ premium: 1, standard: 1, founder: 1, pro: 2, business: 3 });

const instant = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
};
const rangDrapeaux = (p) => (p?.is_business ? 3 : p?.is_pro ? 2 : p?.is_premium ? 1 : 0);
const rangProduitBoutique = (id) => {
  const m = /^app\.fillsell\.(premium|pro|business|founder)(?:\.|$)/.exec(String(id ?? ''));
  return m ? RANG_PRODUIT[m[1]] : 0;
};

/**
 * Les abonnements Stripe VIVANTS, depuis les lectures de litAbonnementStripe (cloud-option.js) ou des objets Stripe
 * bruts (status, metadata.option). Rend [{ canal: 'stripe', type: 'palier' | 'cloud_seul', rang, id, statut }].
 * @param {Array<any>} [lus]
 * @returns {Array<any>}
 */
export function vivantsStripe(lus = []) {
  const out = [];
  for (const l of Array.isArray(lus) ? lus : []) {
    const statut = String(l?.status ?? '');
    if (!STATUTS_STRIPE_VIVANTS.includes(statut)) continue;
    const cloud = l?.cloud === true || l?.metadata?.option === 'cloud';
    out.push({ canal: 'stripe', type: cloud ? 'cloud_seul' : 'palier', rang: cloud ? 0 : Math.max(1, Number(l?.rang) || 1), id: l?.id ?? null, statut });
  }
  return out;
}

/**
 * Les abonnements des BOUTIQUES encore vivants, lus sur le profil (pur).
 *   · palier / formule Google : jeton + produit de palier + fin à venir ; l'état RELU chez Google (googleActif) tranche
 *     s'il est connu (faux = pas vivant) ; sans relecture, les drapeaux payants en plus (comme abonnementStoreVivant) ;
 *   · palier / formule Apple : transaction d'origine + drapeaux payants + fin à venir (Apple ne laisse pas son produit
 *     sur le profil) ; ignoré quand Google est déjà retenu (une seule colonne de fin pour les deux) ;
 *   · Cloud SEUL d'une boutique : cloud_canal apple | google, Cloud vivant (payé, ou essai en cours non arrêté), sans
 *     formule avec Cloud (le Cloud d'une formule EST l'abonnement de la formule).
 * @param {any} p   colonnes : google_purchase_token, google_product_id, apple_original_transaction_id, is_premium, is_pro,
 *                  is_business, subscription_period_end, cloud_canal, cloud_ref, is_cloud, cloud_essai_debut,
 *                  cloud_essai_fin, cloud_essai_arrete, cloud_periode_fin, cloud_formule
 * @param {{ googleActif?: boolean | null, maintenant?: number }} [o]
 * @returns {Array<any>}
 */
export function vivantsBoutiques(p, { googleActif = null, maintenant = Date.now() } = {}) {
  const out = [];
  if (!p) return out;
  const fin = instant(p.subscription_period_end);
  const finAVenir = fin != null && fin > maintenant;
  let google = false;
  if (p.google_purchase_token && googleActif !== false) {
    const rang = rangProduitBoutique(p.google_product_id);
    if (rang && finAVenir && (googleActif === true || rangDrapeaux(p) > 0)) {
      out.push({ canal: 'google', type: 'palier', rang, id: p.google_product_id ?? null });
      google = true;
    }
  }
  if (!google && p.apple_original_transaction_id && rangDrapeaux(p) > 0 && finAVenir) {
    out.push({ canal: 'apple', type: 'palier', rang: rangDrapeaux(p), id: p.apple_original_transaction_id ?? null });
  }
  if ((p.cloud_canal === 'apple' || p.cloud_canal === 'google') && !p.cloud_formule) {
    const finEssai = instant(p.cloud_essai_fin);
    const essaiEnCours = p.is_cloud !== true && p.cloud_essai_debut != null && finEssai != null && maintenant < finEssai && p.cloud_essai_arrete !== true;
    if (p.is_cloud === true || essaiEnCours) out.push({ canal: p.cloud_canal, type: 'cloud_seul', rang: 0, id: p.cloud_ref ?? null, essai: essaiEnCours });
  }
  return out;
}

/** Tous les abonnements vivants d'un compte : Stripe relu + boutiques (profil). Le Cloud Stripe d'une formule n'est pas
 *  compté deux fois (il vient de l'abonnement Stripe lui-même).
 * @param {{ profil?: any, stripe?: Array<any>, googleActif?: boolean | null, maintenant?: number }} [o]
 * @returns {Array<any>} */
export function abonnementsVivants({ profil = null, stripe = [], googleActif = null, maintenant = Date.now() } = {}) {
  return [...vivantsStripe(stripe), ...vivantsBoutiques(profil, { googleActif, maintenant })];
}

/**
 * Peut-on acheter CE produit sur CE canal sans créer un second abonnement ? (pur)
 *   canal : 'stripe' | 'apple' | 'google' — le canal de l'achat demandé ;
 *   achat : 'palier' (Premium, Pro, Business) | 'formule' (… + Cloud) | 'cloud_seul' ;
 *   vivants : abonnementsVivants(…).
 * Rend { permis: true, voie: 'nouveau' | 'meme_abonnement' } ou { permis: false, motif, canal, type } avec
 *   motif 'autre_canal'         — l'abonnement vit sur un AUTRE canal : le changement se fait là-bas ;
 *         'formule_en_cours'    — une formule vit sur ce canal et le Cloud seul serait un second abonnement : prendre la
 *                                 formule avec Cloud (le même abonnement change) ;
 *         'cloud_seul_en_cours' — le Cloud seul vit sur ce canal et une formule serait un second abonnement (boutiques :
 *                                 deux groupes / deux produits ; Stripe : un forfait classique à côté du Cloud seul) ;
 *         'deja'                — le même Cloud seul existe déjà ;
 *         'deux_abonnements'    — le compte a DÉJÀ deux abonnements : rien de plus, le support les réunit.
 * Sur le même canal, palier ↔ formule passe (montée / descente du MÊME abonnement : Stripe change le prix, Apple change
 * de produit dans le groupe « FillSell Plan », Google remplace l'abonnement) ; Stripe : Cloud seul → formule aussi
 * (voieFormuleStripe change le prix de l'abonnement Cloud).
 * @param {{ canal: string, achat: string, vivants?: Array<any> }} p
 * @returns {{ permis: boolean, voie?: string, motif?: string, canal?: string, type?: string }}
 */
export function decisionAchat({ canal, achat, vivants = [] }) {
  const liste = Array.isArray(vivants) ? vivants : [];
  if (!liste.length) return { permis: true, voie: 'nouveau' };
  if (liste.length >= 2) return { permis: false, motif: 'deux_abonnements', canal: liste[0].canal, type: liste[0].type };
  const v = liste[0];
  if (v.canal !== canal) return { permis: false, motif: 'autre_canal', canal: v.canal, type: v.type };
  // Un abonnement Stripe en impayé (past_due) : un second abonnement prélèverait deux fois dès la carte mise à jour.
  if (v.statut === 'past_due') return { permis: false, motif: 'impaye', canal, type: v.type };
  if (v.type === 'cloud_seul') {
    if (achat === 'cloud_seul') return { permis: false, motif: 'deja', canal, type: v.type };
    if (achat === 'formule' && canal === 'stripe') return { permis: true, voie: 'meme_abonnement' };
    return { permis: false, motif: 'cloud_seul_en_cours', canal, type: v.type };
  }
  if (achat === 'cloud_seul') return { permis: false, motif: 'formule_en_cours', canal, type: v.type };
  return { permis: true, voie: 'meme_abonnement' };
}

// ── LA PHRASE : où faire le changement (fr / en). ⛔ Jamais « ordinateur » ni « Chrome » : un client du Cloud la lit. ──
const OU = {
  fr: {
    stripe: "est payé par carte, sur le web : pour changer de formule ou ajouter le Cloud, va sur fillsell.app, Réglages › Abonnement",
    apple: "passe par l'App Store : pour changer de formule ou ajouter le Cloud, ouvre l'app FillSell sur ton iPhone, Réglages › Abonnement",
    google: "passe par Google Play : pour changer de formule ou ajouter le Cloud, ouvre l'app FillSell sur ton téléphone Android, Réglages › Abonnement",
  },
  en: {
    stripe: 'is paid by card, on the web: to change plans or add the Cloud, go to fillsell.app, Settings › Subscription',
    apple: 'goes through the App Store: to change plans or add the Cloud, open the FillSell app on your iPhone, Settings › Subscription',
    google: 'goes through Google Play: to change plans or add the Cloud, open the FillSell app on your Android phone, Settings › Subscription',
  },
};
const BOUTIQUE = { fr: { apple: "l'App Store", google: 'Google Play', stripe: 'carte, sur le web' }, en: { apple: 'the App Store', google: 'Google Play', stripe: 'card, on the web' } };

/** La phrase dite à la personne (fr / en) pour un refus de decisionAchat ; null si l'achat est permis.
 * @param {any} d @param {string} [lang] @returns {string | null} */
export function messageUnSeulAbonnement(d, lang = 'fr') {
  if (!d || d.permis) return null;
  const en = lang === 'en';
  const L = en ? 'en' : 'fr';
  const rien = en ? 'Nothing was charged.' : "Rien n'a été débité.";
  const second = en ? 'A purchase here would be a second subscription.' : 'Un achat ici serait un second abonnement.';
  const aide = en ? 'Write to us from Settings › Help: we help you switch without paying twice.' : "Écris-nous depuis Réglages › Aide : on t'aide à changer sans payer deux fois.";
  const c = CANAUX_ABONNEMENT.includes(d.canal) ? d.canal : null;
  switch (d.motif) {
    case 'autre_canal':
      if (d.type === 'cloud_seul') {
        return en ? `Your FillSell Cloud subscription goes through ${BOUTIQUE.en[c] ?? 'another channel'}. ${second} ${aide} ${rien}`
          : `Ton abonnement FillSell Cloud passe par ${BOUTIQUE.fr[c] ?? 'un autre canal'}. ${second} ${aide} ${rien}`;
      }
      if (!c) return en ? `${second} ${aide} ${rien}` : `${second} ${aide} ${rien}`;
      return en ? `Your FillSell subscription ${OU.en[c]}. ${second} ${rien}` : `Ton abonnement FillSell ${OU.fr[c]}. ${second} ${rien}`;
    case 'formule_en_cours':
      return en ? `You already have a FillSell plan: to add the Cloud, choose its version with Cloud in Settings › Subscription (your subscription changes, no second subscription). ${rien}`
        : `Tu as déjà une formule FillSell : pour ajouter le Cloud, choisis sa version avec Cloud dans Réglages › Abonnement (ton abonnement change, sans second abonnement). ${rien}`;
    case 'cloud_seul_en_cours':
      if (c === 'stripe') {
        return en ? `You already have FillSell Cloud: to add a plan, choose a plan with Cloud in Settings › Subscription (your subscription changes, no second subscription). ${rien}`
          : `Tu as déjà FillSell Cloud : pour ajouter une formule, choisis une formule avec Cloud dans Réglages › Abonnement (ton abonnement change, sans second abonnement). ${rien}`;
      }
      return en ? `You already have FillSell Cloud through ${BOUTIQUE.en[c] ?? 'your store'}. ${second} ${aide} ${rien}`
        : `Tu as déjà FillSell Cloud par ${BOUTIQUE.fr[c] ?? 'ta boutique'}. ${second} ${aide} ${rien}`;
    case 'deja':
      return en ? 'You already have FillSell Cloud.' : 'Tu as déjà FillSell Cloud.';
    case 'impaye':
      return en ? `A payment of your subscription is still due: pay the invoice first (the link is in the email you received, or Settings › Subscription › My invoices on fillsell.app), then change plans. ${rien}`
        : `Un paiement de ton abonnement est encore dû : règle d'abord la facture (le lien est dans le mail reçu, ou sur fillsell.app, Réglages › Abonnement › Mes factures), puis change de formule. ${rien}`;
    case 'deux_abonnements':
    default:
      return en ? `You already have two FillSell subscriptions: write to us from Settings › Help and we will merge them. ${rien}`
        : `Tu as déjà deux abonnements FillSell : écris-nous depuis Réglages › Aide, on les réunit. ${rien}`;
  }
}

/** Le résumé d'une alerte « deux abonnements » (support@) : une ligne par abonnement vivant.
 * @param {Array<any>} [vivants] @returns {string[]} */
export function lignesDeuxAbonnements(vivants = []) {
  return (Array.isArray(vivants) ? vivants : []).map((v) => `${v.canal} · ${v.type === 'cloud_seul' ? 'Cloud seul' : `palier rang ${v.rang}`}${v.statut ? ` · ${v.statut}` : ''}${v.essai ? ' · essai' : ''}${v.id ? ` · ${String(v.id).slice(0, 40)}` : ''}`);
}
