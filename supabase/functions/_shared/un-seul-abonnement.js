// ═══════════════════════════════════════════════════════════════════════════
// UNE SEULE FORMULE À LA FOIS, TOUS CANAUX CONFONDUS — LE CLOUD EN PLUS TOUJOURS PERMIS (13/11/2026, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Historique : la 3e réponse de Nico du 13/11 (point a) avait donné « un seul abonnement actif par compte, tous canaux
// confondus » (ca9308d). Sa dernière réponse du 13/11 la remplace, mot pour mot :
//   « Une formule (Premium, Pro ou Business) + le Cloud, c'est NORMAL et c'est ce qu'on veut vendre : par le pack
//     (Premium + Cloud, Pro + Cloud, Business + Cloud) ou par le Cloud seul en complément, sur n'importe quel canal.
//     f0acd3af et c7c382b7 sont des clients normaux. Le seul vrai double, ce sont DEUX FORMULES en même temps (785352fe :
//     Premium App Store + Pro Stripe). La garde devient : « une seule FORMULE à la fois (Premium, Pro ou Business), tous
//     canaux confondus ». Le Cloud ajouté à une formule (pack ou Cloud seul) est TOUJOURS autorisé, quel que soit le canal
//     de la formule et celui du Cloud. »
// La règle, telle qu'appliquée ici (pure, sans réseau ni import : serveur ET app) :
//   · on compte les FORMULES vivantes (un palier Premium / Pro / Business, avec ou sans Cloud), tous canaux ;
//   · DEUX formules = refus, avec où faire le changement : une montée / descente se fait sur le canal de SA formule (le même
//     abonnement change) — 785352fe (Premium App Store, puis Pro par carte le 10/11) est le seul vrai double ;
//   · le Cloud SEUL à côté d'une formule = TOUJOURS permis, sur tout canal (formule Apple + Cloud seul par carte, etc.) —
//     c7c382b7 (Pro par carte + Cloud seul App Store) et f0acd3af (Pro App Store + Cloud seul App Store) sont normaux ;
//   · une formule à côté d'un Cloud seul (le Cloud pris d'abord) = permis aussi : c'est la même paire ;
//   · le PACK sur le canal de la formule = la même formule qui change (permis) ; sur un AUTRE canal = une 2e formule →
//     refusé, avec la proposition juste (le Cloud seul sur ce canal, ou le pack sur le canal de la formule) ;
//   · jamais DEUX FOIS le Cloud (Cloud seul + pack, ou deux Cloud seuls) : pas un refus sec — la phrase dit ce qui existe
//     déjà et propose le geste juste (la formule SANS Cloud, qui s'ajoute au Cloud déjà là ; ou rien à ajouter).
// Un abonnement « vivant » = qui existe chez son canal et peut encore prélever : Stripe active | trialing | past_due ;
// Apple / Google : la période en cours n'est pas finie. N'en sont PAS : un compte offert (is_comped), le Cloud « offert »
// (aucun prélèvement), un abonnement terminé.

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
// Le produit d'une formule AVEC Cloud chez une boutique (app.fillsell.premium.cloud, app.fillsell.pro.cloud, …).
const produitAvecCloud = (id) => /^app\.fillsell\.(premium|pro|business)\.cloud$/.test(String(id ?? ''));

/**
 * Les abonnements Stripe VIVANTS, depuis les lectures de litAbonnementStripe (cloud-option.js) ou des objets Stripe
 * bruts (status, metadata.option). Rend [{ canal: 'stripe', type: 'palier' | 'cloud_seul', rang, avecCloud, id, statut }] :
 * `type: 'palier'` = une FORMULE (avec ou sans Cloud) ; `avecCloud` = le pack (formuleCloud) ou l'essai du Cloud d'un abonné.
 * @param {Array<any>} [lus]
 * @returns {Array<any>}
 */
export function vivantsStripe(lus = []) {
  const out = [];
  for (const l of Array.isArray(lus) ? lus : []) {
    const statut = String(l?.status ?? '');
    if (!STATUTS_STRIPE_VIVANTS.includes(statut)) continue;
    const cloud = l?.cloud === true || l?.metadata?.option === 'cloud';
    if (cloud) { out.push({ canal: 'stripe', type: 'cloud_seul', rang: 0, avecCloud: true, id: l?.id ?? null, statut }); continue; }
    const avecCloud = Boolean(l?.formuleCloud || l?.essaiCloudAbonne || l?.metadata?.formule);
    out.push({ canal: 'stripe', type: 'palier', rang: Math.max(1, Number(l?.rang) || 1), avecCloud, id: l?.id ?? null, statut });
  }
  return out;
}

/**
 * Les abonnements des BOUTIQUES encore vivants, lus sur le profil (pur).
 *   · formule Google : jeton + produit de palier + fin à venir ; l'état RELU chez Google (googleActif) tranche s'il est
 *     connu (faux = pas vivant) ; sans relecture, les drapeaux payants en plus (comme abonnementStoreVivant) ;
 *   · formule Apple : transaction d'origine + drapeaux payants + fin à venir (Apple ne laisse pas son produit sur le
 *     profil) ; ignorée quand Google est déjà retenu (une seule colonne de fin pour les deux) ;
 *   · `avecCloud` : le pack de CE canal (profiles.cloud_formule + cloud_canal de ce canal, ou produit Google « .cloud ») ;
 *   · Cloud SEUL d'une boutique : cloud_canal apple | google, Cloud vivant (payé, ou essai en cours non arrêté), sans
 *     formule avec Cloud (le Cloud d'une formule EST l'abonnement de la formule).
 * ⛔ L'appelant lit `cloud_formule` : sans elle, le Cloud d'un pack de boutique se compterait comme un Cloud seul.
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
  const packDe = (canal) => Boolean(p.cloud_formule) && p.cloud_canal === canal;
  let google = false;
  if (p.google_purchase_token && googleActif !== false) {
    const rang = rangProduitBoutique(p.google_product_id);
    if (rang && finAVenir && (googleActif === true || rangDrapeaux(p) > 0)) {
      out.push({ canal: 'google', type: 'palier', rang, avecCloud: packDe('google') || produitAvecCloud(p.google_product_id), id: p.google_product_id ?? null });
      google = true;
    }
  }
  if (!google && p.apple_original_transaction_id && rangDrapeaux(p) > 0 && finAVenir) {
    out.push({ canal: 'apple', type: 'palier', rang: rangDrapeaux(p), avecCloud: packDe('apple'), id: p.apple_original_transaction_id ?? null });
  }
  if ((p.cloud_canal === 'apple' || p.cloud_canal === 'google') && !p.cloud_formule) {
    const finEssai = instant(p.cloud_essai_fin);
    const essaiEnCours = p.is_cloud !== true && p.cloud_essai_debut != null && finEssai != null && maintenant < finEssai && p.cloud_essai_arrete !== true;
    if (p.is_cloud === true || essaiEnCours) out.push({ canal: p.cloud_canal, type: 'cloud_seul', rang: 0, avecCloud: true, id: p.cloud_ref ?? null, essai: essaiEnCours });
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

/** Les FORMULES vivantes (Premium, Pro, Business, avec ou sans Cloud) et les CLOUD vivants (Cloud seul, ou le Cloud d'un
 *  pack) d'une liste d'abonnements vivants (pur). `double` : deux formules, ou deux fois le Cloud — le seul vrai double.
 * @param {Array<any>} [vivants] @returns {{ formules: Array<any>, clouds: Array<any>, double: boolean }} */
export function compterFormules(vivants = []) {
  const liste = Array.isArray(vivants) ? vivants : [];
  const formules = liste.filter((v) => v?.type === 'palier');
  const clouds = liste.filter((v) => v?.type === 'cloud_seul' || (v?.type === 'palier' && v?.avecCloud === true));
  return { formules, clouds, double: formules.length >= 2 || clouds.length >= 2 };
}

/**
 * Peut-on acheter CE produit sur CE canal sans créer une SECONDE FORMULE ni payer deux fois le Cloud ? (pur)
 *   canal : 'stripe' | 'apple' | 'google' — le canal de l'achat demandé ;
 *   achat : 'palier' (Premium, Pro, Business) | 'formule' (… + Cloud, le pack) | 'cloud_seul' ;
 *   vivants : abonnementsVivants(…).
 * Rend { permis: true, voie } — voie 'nouveau' | 'meme_abonnement' (la formule de ce canal change) | 'cloud_en_plus' (le
 * Cloud seul s'ajoute à la formule) | 'formule_en_plus' (une formule s'ajoute au Cloud seul) —, ou { permis: false, motif,
 * canal, type } avec motif :
 *   'autre_canal'         — la formule vit sur un AUTRE canal : son changement se fait là-bas (une 2e formule sinon) ;
 *   'formule_autre_canal' — le pack demandé ici serait une 2e formule ; le compte n'a pas encore le Cloud : la phrase
 *                           propose le Cloud SEUL ici (il s'ajoute à la formule) ou le pack sur le canal de la formule ;
 *   'deux_formules'       — le compte a DÉJÀ deux formules : rien de plus, le support les réunit ;
 *   'impaye'              — la formule Stripe de ce canal est en impayé (past_due) : régler d'abord la facture ;
 *   'cloud_deja'          — un pack demandé alors qu'un Cloud SEUL vit déjà (le Cloud payé deux fois) : la phrase propose
 *                           la formule SANS Cloud, qui s'ajoute au Cloud déjà là ;
 *   'cloud_dans_formule'  — un Cloud seul demandé alors que la formule le comprend déjà (pack) : rien à ajouter ;
 *   'deja'                — un Cloud seul existe déjà : rien à ajouter.
 * ⛔ Verrou selftest:cloud-en-plus-de-formule : le Cloud (pack sur le canal de la formule, ou Cloud seul sur TOUT canal)
 * ajouté à une formule Premium, Pro ou Business payée par Stripe, Apple ou Google n'est JAMAIS refusé.
 * @param {{ canal: string, achat: string, vivants?: Array<any> }} p
 * @returns {{ permis: boolean, voie?: string, motif?: string, canal?: string, type?: string }}
 */
export function decisionAchat({ canal, achat, vivants = [] }) {
  const { formules, clouds } = compterFormules(vivants);
  const cloudsSeuls = clouds.filter((v) => v.type === 'cloud_seul');
  // ── Le Cloud SEUL : jugé sur le Cloud seulement (il n'ajoute jamais de formule) ──
  if (achat === 'cloud_seul') {
    if (cloudsSeuls.length) return { permis: false, motif: 'deja', canal: cloudsSeuls[0].canal, type: 'cloud_seul' };
    const pack = formules.find((v) => v.avecCloud === true);
    if (pack) return { permis: false, motif: 'cloud_dans_formule', canal: pack.canal, type: 'palier' };
    return { permis: true, voie: formules.length ? 'cloud_en_plus' : 'nouveau' };
  }
  // ── Une FORMULE (palier, ou pack) : une seule à la fois, tous canaux ──
  if (formules.length >= 2) return { permis: false, motif: 'deux_formules', canal: formules[0].canal, type: 'palier' };
  const f = formules[0] ?? null;
  if (f && f.canal !== canal) {
    // Le pack ailleurs, et le compte n'a pas encore le Cloud : deux voies justes (le Cloud seul ici, le pack là-bas).
    if (achat === 'formule' && clouds.length === 0) return { permis: false, motif: 'formule_autre_canal', canal: f.canal, type: 'palier' };
    return { permis: false, motif: 'autre_canal', canal: f.canal, type: 'palier' };
  }
  if (f && f.statut === 'past_due') return { permis: false, motif: 'impaye', canal, type: 'palier' };
  if (achat === 'formule') {
    // Jamais deux fois le Cloud : un Cloud seul vit déjà (hors le cas Stripe où le Cloud seul DEVIENT le pack).
    const seul = cloudsSeuls[0] ?? null;
    if (seul) {
      if (!f && seul.canal === 'stripe' && canal === 'stripe' && cloudsSeuls.length === 1) return { permis: true, voie: 'meme_abonnement' };
      return { permis: false, motif: 'cloud_deja', canal: seul.canal, type: 'cloud_seul' };
    }
  }
  if (f) return { permis: true, voie: 'meme_abonnement' };
  return { permis: true, voie: cloudsSeuls.length ? 'formule_en_plus' : 'nouveau' };
}

/** La décision d'un achat sur ce qu'un serveur a LU (profil, Stripe relu, Google relu) — garde-abonnement et
 *  create-checkout-session l'appellent tels quels (pur, testé par les verrous).
 * @param {{ canal: string, achat: string, profil?: any, stripe?: Array<any>, googleActif?: boolean | null, maintenant?: number }} p
 * @returns {{ permis: boolean, voie?: string, motif?: string, canal?: string, type?: string, vivants: Array<any> }} */
export function decisionSurLectures({ canal, achat, profil = null, stripe = [], googleActif = null, maintenant = Date.now() }) {
  const vivants = abonnementsVivants({ profil, stripe, googleActif, maintenant });
  return { ...decisionAchat({ canal, achat, vivants }), vivants };
}

// ── LA PHRASE : où faire le changement (fr / en). ⛔ Jamais « ordinateur » ni « Chrome » : un client du Cloud la lit. ──
const OU = {
  fr: {
    stripe: 'est payée par carte, sur le web : pour en changer, va sur fillsell.app, Réglages › Abonnement',
    apple: "passe par l'App Store : pour en changer, ouvre l'app FillSell sur ton iPhone, Réglages › Abonnement",
    google: "passe par Google Play : pour en changer, ouvre l'app FillSell sur ton téléphone Android, Réglages › Abonnement",
  },
  en: {
    stripe: 'is paid by card, on the web: to change it, go to fillsell.app, Settings › Subscription',
    apple: 'goes through the App Store: to change it, open the FillSell app on your iPhone, Settings › Subscription',
    google: 'goes through Google Play: to change it, open the FillSell app on your Android phone, Settings › Subscription',
  },
};
const LA_BAS = {
  fr: { stripe: 'sur fillsell.app, Réglages › Abonnement', apple: "dans l'app FillSell sur ton iPhone, Réglages › Abonnement", google: "dans l'app FillSell sur ton téléphone Android, Réglages › Abonnement" },
  en: { stripe: 'on fillsell.app, Settings › Subscription', apple: 'in the FillSell app on your iPhone, Settings › Subscription', google: 'in the FillSell app on your Android phone, Settings › Subscription' },
};
const PAR = { fr: { apple: "par l'App Store", google: 'par Google Play', stripe: 'par carte, sur le web' }, en: { apple: 'through the App Store', google: 'through Google Play', stripe: 'by card, on the web' } };

/** La phrase dite à la personne (fr / en) pour un refus de decisionAchat ; null si l'achat est permis.
 * @param {any} d @param {string} [lang] @returns {string | null} */
export function messageUnSeulAbonnement(d, lang = 'fr') {
  if (!d || d.permis) return null;
  const en = lang === 'en';
  const L = en ? 'en' : 'fr';
  const rien = en ? 'Nothing was charged.' : "Rien n'a été débité.";
  const c = CANAUX_ABONNEMENT.includes(d.canal) ? d.canal : null;
  switch (d.motif) {
    case 'autre_canal':
      if (!c) return en ? `A purchase here would be a second plan. Write to us from Settings › Help. ${rien}` : `Un achat ici ferait une seconde formule. Écris-nous depuis Réglages › Aide. ${rien}`;
      return en ? `Your FillSell plan ${OU.en[c]}. A plan bought here would be a second plan. ${rien}`
        : `Ta formule FillSell ${OU.fr[c]}. Une formule prise ici en ferait une seconde. ${rien}`;
    case 'formule_autre_canal':
      return en
        ? `Your FillSell plan goes ${PAR.en[c] ?? 'through another channel'}: a plan with Cloud here would be a second plan. To add the Cloud, take FillSell Cloud on its own, here: it comes on top of your plan. Or switch to the Cloud version of your plan ${LA_BAS.en[c] ?? 'where you pay'}. ${rien}`
        : `Ta formule FillSell passe ${PAR.fr[c] ?? 'par un autre canal'} : une formule avec Cloud prise ici en ferait une seconde. Pour ajouter le Cloud, prends FillSell Cloud seul, ici : il s'ajoute à ta formule. Ou passe à la version avec Cloud de ta formule ${LA_BAS.fr[c] ?? 'là où tu paies'}. ${rien}`;
    case 'cloud_deja':
      return en
        ? `You already have FillSell Cloud (${PAR.en[c] ?? 'on another channel'}): a plan with Cloud would make you pay for the Cloud twice. Choose the plan without Cloud (Premium, Pro or Business): it comes on top of your Cloud. ${rien}`
        : `Tu as déjà FillSell Cloud (${PAR.fr[c] ?? 'sur un autre canal'}) : une formule avec Cloud te le ferait payer deux fois. Choisis la formule sans Cloud (Premium, Pro ou Business) : elle s'ajoute à ton Cloud. ${rien}`;
    case 'cloud_dans_formule':
      return en ? `Your plan already includes FillSell Cloud: nothing to add. ${rien}` : `Ta formule comprend déjà FillSell Cloud : rien à ajouter. ${rien}`;
    case 'deja':
      return en ? 'You already have FillSell Cloud.' : 'Tu as déjà FillSell Cloud.';
    case 'impaye':
      return en ? `A payment of your subscription is still due: pay the invoice first (the link is in the email you received, or Settings › Subscription › My invoices on fillsell.app), then change plans. ${rien}`
        : `Un paiement de ton abonnement est encore dû : règle d'abord la facture (le lien est dans le mail reçu, ou sur fillsell.app, Réglages › Abonnement › Mes factures), puis change de formule. ${rien}`;
    case 'deux_formules':
    case 'deux_abonnements':
    default:
      return en ? `You already have two FillSell plans: write to us from Settings › Help and we will merge them. ${rien}`
        : `Tu as déjà deux formules FillSell : écris-nous depuis Réglages › Aide, on les réunit. ${rien}`;
  }
}

/** Le résumé d'une alerte « deux formules » (support@) : une ligne par abonnement vivant.
 * @param {Array<any>} [vivants] @returns {string[]} */
export function lignesDeuxAbonnements(vivants = []) {
  return (Array.isArray(vivants) ? vivants : []).map((v) => `${v.canal} · ${v.type === 'cloud_seul' ? 'Cloud seul' : `formule rang ${v.rang}${v.avecCloud ? ' + Cloud' : ''}`}${v.statut ? ` · ${v.statut}` : ''}${v.essai ? ' · essai' : ''}${v.id ? ` · ${String(v.id).slice(0, 40)}` : ''}`);
}
