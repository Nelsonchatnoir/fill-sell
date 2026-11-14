// ═══════════════════════════════════════════════════════════════════════════
// CHANGER DE FORMULE DANS L'APP STORE / GOOGLE PLAY (14/11/2026, règle de Nico, iPhone et Android)
// ═══════════════════════════════════════════════════════════════════════════
// La règle (mot pour mot, 14/11) : « Un client en essai, Cloud ou non, qui choisit une autre formule voit d'abord une
// fenêtre claire : « Ton essai gratuit s'arrête : tu seras débité maintenant de X € », avec le montant exact. Un client
// qui a le Cloud (en essai ou payant) se voit proposer la version « + Cloud » de la formule choisie avec son vrai prix ;
// la formule seule reste proposée, marquée « sans Cloud : tu ne pourras plus publier sans ordinateur ». Sans
// confirmation, rien ne change. […] Plus jamais un changement de formule qui fait sauter le Cloud sans le dire, ni qui
// garde l'essai gratuit. »
//
// Ce que font les boutiques (documentation officielle relue le 14/11/2026) :
//   · APPLE — un seul groupe « FillSell Plan » ; le MOMENT est fixé par le NIVEAU du produit dans App Store Connect,
//     jamais par l'app (« Upgrades of any duration or cross-grades with same durations go into effect immediately.
//     Downgrades of any duration or cross-grades with different durations go into effect at the next renewal date. »,
//     developer.apple.com/documentation/storekit/handling-subscriptions-billing). Montée depuis une offre d'introduction :
//     « The introductory price ends immediately […] The new In-App Purchase is charged and goes into effect immediately
//     at the full price » (developer.apple.com/help/app-store-connect/reference/reporting/subscription-events) — l'essai
//     s'arrête, le prix ENTIER est débité ; aucun nouvel essai (« Existing subscribers are not eligible for an
//     introductory offer for any product within the same subscription group »). Descente : au prochain renouvellement
//     (« don't affect the currently active plan ») — pendant l'essai, à sa fin (déduction : le cas « free trial » n'est
//     pas écrit). L'app ne peut ni avancer une descente ni choisir le prorata : la fenêtre dit ce qu'Apple fera.
//   · GOOGLE — l'app CHOISIT le mode de remplacement (module patché : oldPurchaseToken + replacementMode). Pendant un
//     essai : CHARGE_FULL_PRICE (5) — « the user is charged full price for the new entitlement immediately »
//     (developer.android.com/google/play/billing/subscriptions) : le montant débité est le prix du produit choisi, connu
//     d'avance — la règle de Nico. Jamais WITHOUT_PRORATION (« Upgrading while in a free trial, keeping the trial ») ni
//     CHARGE_PRORATED_PRICE pendant l'essai (« the remaining value of the free trial is carried over […] based on base plan
//     pricing » : un montant que l'app ne connaît pas, et le 1er prix plein à l'ancienne date de fin d'essai). Hors essai :
//     montée CHARGE_PRORATED_PRICE (2), descente DEFERRED (6) — les recommandations de Google, inchangées.
// Les niveaux Apple (relus et ENREGISTRÉS dans App Store Connect le 11/11 à 22:22, docs/reprise/REPRISE-MEGA-LOT-1111.md) :
//   1 Business + Cloud · 2 Business · 3 Pro + Cloud · 4 Premium + Cloud · 5 Pro, Pro 2, Founder · 6 Premium Standard.
// ⛔ Aucun montant inventé : chaque prix vient de la boutique (lib/prixBoutique.js prixAffiche) ; une option dont le prix
//    n'est pas lu ne se choisit pas. Pur (aucun import natif) : testé par scripts/changement-formule-boutique-selftest.mjs.
import {
  FORMULES_CLOUD, FORMULE_CLOUD_DU_PALIER, PALIER_DE_FORMULE, PRODUITS_BOUTIQUES, formuleDuProduitBoutique,
} from '../../supabase/functions/_shared/formules-cloud.js';
import { RANG_PRIX, nomBoutique } from '../cloud/formulesCloud.js';
import { cloudDuProfil } from '../utils/palier.js';
import { translations } from '../i18n/translations.js';

/** BillingFlowParams.SubscriptionUpdateParams.ReplacementMode (Play Billing 8 ; DEFERRED = 6, docs/enquetes/c4-descente-0911). */
export const MODES_GOOGLE = Object.freeze({ WITH_TIME_PRORATION: 1, CHARGE_PRORATED_PRICE: 2, WITHOUT_PRORATION: 3, CHARGE_FULL_PRICE: 5, DEFERRED: 6 });

/** Les formules SANS Cloud de chaque boutique (= lib/iap.js PRODUCT_IDS, vérifié par le selftest). */
export const PRODUITS_PALIERS = Object.freeze({
  apple: Object.freeze({ premium: 'app.fillsell.premium.standard', pro: 'app.fillsell.pro2.sub', business: 'app.fillsell.business.sub' }),
  google: Object.freeze({ premium: 'app.fillsell.premium.standard', pro: 'app.fillsell.pro.sub', business: 'app.fillsell.business.sub' }),
});
export const PRODUIT_FOUNDER = 'app.fillsell.premium.sub';

/** Niveaux du groupe Apple « FillSell Plan » (1 = le plus haut). */
export const NIVEAUX_APPLE = Object.freeze({
  'app.fillsell.business.cloud': 1, 'app.fillsell.business.sub': 2, 'app.fillsell.pro.cloud': 3, 'app.fillsell.premium.cloud': 4,
  'app.fillsell.pro.sub': 5, 'app.fillsell.pro2.sub': 5, 'app.fillsell.premium.sub': 5, 'app.fillsell.premium.standard': 6,
});

export const CLES_FORMULES = Object.freeze(['premium', 'pro', 'business', ...FORMULES_CLOUD]);
const NOMS = Object.freeze({ premium: 'Premium', pro: 'Pro', business: 'Business', premium_cloud: 'Premium + Cloud', pro_cloud: 'Pro + Cloud', business_cloud: 'Business + Cloud' });
export const nomFormule = (cle) => NOMS[cle] ?? String(cle ?? '');
const avecCloud = (cle) => FORMULES_CLOUD.includes(cle);
const canalOk = (c) => c === 'apple' || c === 'google';

/** Le produit d'une formule dans une boutique (pur). */
export function idProduitBoutique(cle, canal) {
  if (!canalOk(canal)) return null;
  if (avecCloud(cle)) return PRODUITS_BOUTIQUES[cle]?.[canal] ?? null;
  return PRODUITS_PALIERS[canal]?.[cle] ?? null;
}
/** La formule d'un produit de boutique (Founder = Premium) ; null hors du groupe des formules. */
export function cleDuProduitBoutique(id) {
  const s = String(id ?? '').trim();
  if (!s) return null;
  const f = formuleDuProduitBoutique(s);
  if (f) return f;
  if (s === PRODUIT_FOUNDER || s === 'app.fillsell.premium.standard') return 'premium';
  if (s === 'app.fillsell.pro.sub' || s === 'app.fillsell.pro2.sub') return 'pro';
  if (s === 'app.fillsell.business.sub') return 'business';
  return null;
}
/** Tous les abonnements « formule » d'une boutique (sans le Cloud seul, qui est un autre abonnement) : ceux qu'un
 *  changement REMPLACE sur Google Play — jamais un second abonnement. */
export function idsGroupeFormules(canal) {
  if (!canalOk(canal)) return [];
  const ids = new Set([PRODUIT_FOUNDER, ...Object.values(PRODUITS_PALIERS[canal]), ...FORMULES_CLOUD.map((f) => PRODUITS_BOUTIQUES[f][canal])]);
  if (canal === 'apple') ids.add('app.fillsell.pro.sub');
  return [...ids];
}

/** Montée, descente, même niveau ('crossgrade') ou même produit ('meme') — Apple par ses NIVEAUX, Google par le prix. */
export function sensChangement(canal, idActuel, idCible) {
  if (!idActuel || !idCible) return null;
  if (idActuel === idCible) return 'meme';
  if (canal === 'apple') {
    const a = NIVEAUX_APPLE[idActuel], c = NIVEAUX_APPLE[idCible];
    if (a == null || c == null) return null;
    return c < a ? 'montee' : c > a ? 'descente' : 'crossgrade';
  }
  const a = RANG_PRIX[cleDuProduitBoutique(idActuel)], c = RANG_PRIX[cleDuProduitBoutique(idCible)];
  if (a == null || c == null) return null;
  return c > a ? 'montee' : c < a ? 'descente' : 'crossgrade';
}

/**
 * CE QUE FAIT LA BOUTIQUE pour ce changement (pur) :
 *   quand      : 'maintenant' | 'renouvellement'
 *   debit      : 'prix_plein' (le prix du produit choisi, maintenant) | 'prorata' (Google, hors essai : la différence,
 *                montant affiché par Google) | 'rien_maintenant'
 *   essaiArrete: la semaine gratuite en cours s'arrête maintenant
 *   modeGoogle : le mode de remplacement à passer (Android), null sur iPhone
 */
export function effetBoutique({ canal, sens, essaiEnCours = false }) {
  if (canal === 'apple') {
    if (sens === 'descente') return { quand: 'renouvellement', debit: 'rien_maintenant', essaiArrete: false, modeGoogle: null };
    return { quand: 'maintenant', debit: 'prix_plein', essaiArrete: essaiEnCours === true, modeGoogle: null };
  }
  if (essaiEnCours === true) return { quand: 'maintenant', debit: 'prix_plein', essaiArrete: true, modeGoogle: MODES_GOOGLE.CHARGE_FULL_PRICE };
  if (sens === 'montee') return { quand: 'maintenant', debit: 'prorata', essaiArrete: false, modeGoogle: MODES_GOOGLE.CHARGE_PRORATED_PRICE };
  return { quand: 'renouvellement', debit: 'rien_maintenant', essaiArrete: false, modeGoogle: MODES_GOOGLE.DEFERRED };
}

/**
 * L'ABONNEMENT EN COURS SUR CETTE BOUTIQUE, vu du profil (pur). p : la ligne de COLONNES_CHANGEMENT FUSIONNÉE avec celle de
 * COLONNES_CLOUD (cloud/useCloudProfil.js — les colonnes d'état du Cloud ne se nomment que là, règle de
 * selftest:cloud-ecrans ; deux lectures, l'une ou l'autre illisible = rien ne part).
 * → { idActuel, essaiEnCours, essaiFin, cloudDansFormule } ; idActuel null = aucune formule facturée par cette boutique.
 */
export const COLONNES_CHANGEMENT = 'is_premium, is_pro, is_business, is_founder, apple_original_transaction_id, google_purchase_token, google_product_id, '
  + 'subscription_period_end, cloud_formule, cloud_canal, cloud_ref';
export function compteBoutique(p, canal, maintenant = Date.now()) {
  const vide = { idActuel: null, essaiEnCours: false, essaiFin: null, cloudDansFormule: false, echeance: p?.subscription_period_end ?? null };
  if (!p || !canalOk(canal)) return vide;
  const pack = FORMULES_CLOUD.includes(p.cloud_formule) && p.cloud_canal === canal ? p.cloud_formule : null;
  let idActuel = null;
  if (pack) idActuel = PRODUITS_BOUTIQUES[pack][canal];
  else if (canal === 'google' && p.google_purchase_token && cleDuProduitBoutique(p.google_product_id)) idActuel = p.google_product_id;
  else if (canal === 'apple' && p.apple_original_transaction_id && (p.is_premium || p.is_pro || p.is_business)) {
    idActuel = p.is_business ? PRODUITS_PALIERS.apple.business : p.is_pro ? PRODUITS_PALIERS.apple.pro : p.is_founder ? PRODUIT_FOUNDER : PRODUITS_PALIERS.apple.premium;
  }
  if (!idActuel) return vide;
  const c = cloudDuProfil(p, maintenant);
  const essaiEnCours = Boolean(pack) && c.etat === 'essai';
  return { idActuel, essaiEnCours, essaiFin: essaiEnCours ? c.essaiFin : null, cloudDansFormule: Boolean(pack), echeance: p.subscription_period_end ?? null };
}

/**
 * LA FENÊTRE (pur). Rend { fenetre: false, raison } quand rien n'est à confirmer (l'achat d'avant), sinon
 * { fenetre: true, canal, actuelle, essaiEnCours, essaiFin, options: [...] }. Une option :
 *   { cle, id, nom, sansCloud, garder, sens, effet, prix, choisissable, principal }
 * prix : (cle) => texte formaté par la boutique (« 49,99 € ») ou null — jamais un montant deviné.
 * La fenêtre s'ouvre pour un abonné de CETTE boutique qui change de formule ET (est en essai OU a le Cloud dans sa
 * formule). Le Cloud SEUL (autre abonnement, groupe « FillSell Cloud » / app.fillsell.cloud.sub) n'est jamais touché par
 * un changement de formule : il n'ouvre pas la fenêtre.
 */
export function planChangementBoutique({ canal, compte, cible, prix = () => null, cloudPossible = true }) {
  if (!canalOk(canal)) return { fenetre: false, raison: 'web' };
  if (!CLES_FORMULES.includes(cible)) return { fenetre: false, raison: 'cible_inconnue' };
  const { idActuel = null, essaiEnCours = false, essaiFin = null, cloudDansFormule = false } = compte ?? {};
  if (!idActuel) return { fenetre: false, raison: 'pas_abonne_ici' };
  const idCible = idProduitBoutique(cible, canal);
  if (!idCible) return { fenetre: false, raison: 'cible_inconnue' };
  if (idCible === idActuel) return { fenetre: false, raison: 'meme_formule' };
  if (!essaiEnCours && !cloudDansFormule) return { fenetre: false, raison: 'rien_a_dire' };
  // La version « + Cloud » de la formule choisie, d'abord ; la formule seule ensuite, marquée « Sans Cloud ». cloudPossible
  // faux (formules avec Cloud pas vendues sur ce binaire / ce canal) : la formule seule, toujours marquée.
  const cles = cloudDansFormule && !avecCloud(cible) && cloudPossible ? [FORMULE_CLOUD_DU_PALIER[cible], cible] : [cible];
  const options = cles.map((cle, i) => {
    const id = idProduitBoutique(cle, canal);
    const garder = id === idActuel;
    const sens = garder ? 'meme' : sensChangement(canal, idActuel, id);
    const effet = garder ? null : effetBoutique({ canal, sens, essaiEnCours });
    const p = garder ? null : (prix(cle) ?? null);
    return {
      cle, id, nom: nomFormule(cle), sansCloud: cloudDansFormule && !avecCloud(cle), garder, sens, effet, prix: p,
      choisissable: garder || (p != null && sens != null), principal: i === 0,
    };
  });
  return { fenetre: true, canal, actuelle: cleDuProduitBoutique(idActuel), idActuel, essaiEnCours, essaiFin, cloudDansFormule, options };
}

// ── Les textes (src/i18n/translations.js, FR + EN, clés « chgFormule* ») ──────────────────────────────────────────────
const tpl = (lang, cle, vars = {}) => {
  const dict = translations[lang === 'en' ? 'en' : 'fr'];
  let s = dict[cle] ?? translations.fr[cle] ?? cle;
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v ?? ''));
  return s;
};
/** Une date ISO en « 21 novembre » / « 21 November », heure de Paris. */
export function dateCourte(iso, lang = 'fr') {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
}

/** Les phrases d'une option (pur) : ce que la boutique fera, avec le montant. */
export function textesOption(option, { canal, lang = 'fr', essaiFin = null, actuelle = null } = {}) {
  const b = nomBoutique(canal) ?? 'App Store';
  if (option.garder) return { titre: tpl(lang, 'chgFormuleGarder', { nom: option.nom }), lignes: [tpl(lang, 'chgFormuleGarderDetail')], bouton: tpl(lang, 'chgFormuleGarderBouton', { nom: option.nom }) };
  const prix = option.prix ?? '…';
  const fin = dateCourte(essaiFin, lang);
  const lignes = [];
  const e = option.effet ?? {};
  if (e.essaiArrete && e.debit === 'prix_plein') lignes.push(tpl(lang, 'chgFormuleEssaiArrete', { prix }));
  else if (e.debit === 'prix_plein') lignes.push(tpl(lang, canal === 'apple' ? 'chgFormuleDebitApple' : 'chgFormuleDebitMaintenant', { prix, boutique: b }));
  else if (e.debit === 'prorata') lignes.push(tpl(lang, 'chgFormuleProrataGoogle', { prix }));
  else if (e.quand === 'renouvellement') {
    lignes.push(fin
      ? tpl(lang, 'chgFormuleEssaiContinue', { fin, nom: option.nom, prix, boutique: b, actuelle: nomFormule(actuelle) })
      : tpl(lang, 'chgFormuleAuRenouvellement', { nom: option.nom, prix, boutique: b, actuelle: nomFormule(actuelle) }));
  }
  if (e.debit === 'prix_plein') lignes.push(tpl(lang, 'chgFormuleEnsuite', { prix, boutique: b }));
  if (option.sansCloud) lignes.push(tpl(lang, 'chgFormuleSansCloud'));
  return {
    titre: tpl(lang, 'chgFormuleOptionTitre', { nom: option.nom, prix }),
    lignes,
    bouton: tpl(lang, e.quand === 'maintenant' ? 'chgFormuleBoutonPayer' : 'chgFormuleBoutonProgrammer', { nom: option.nom, prix }),
    avertissement: option.sansCloud ? tpl(lang, 'chgFormuleSansCloudEtiquette') : null,
  };
}
/** Les textes de la fenêtre (pur). */
export function textesFenetre(plan, lang = 'fr') {
  return {
    titre: tpl(lang, 'chgFormuleTitre'),
    intro: plan.options.some((o) => o.sansCloud)
      ? tpl(lang, 'chgFormuleIntroCloud', { actuelle: nomFormule(plan.actuelle) })
      : tpl(lang, 'chgFormuleIntro', { actuelle: nomFormule(plan.actuelle) }),
    annuler: tpl(lang, 'chgFormuleAnnuler'),
    pied: tpl(lang, 'chgFormulePied', { boutique: nomBoutique(plan.canal) ?? 'App Store' }),
    options: plan.options.map((o) => ({ ...o, ...textesOption(o, { canal: plan.canal, lang, essaiFin: plan.essaiFin, actuelle: plan.actuelle }) })),
  };
}
/** Le message quand la personne garde sa formule ou ferme la fenêtre : rien n'a changé. */
export const texteRienNeChange = (lang = 'fr') => tpl(lang, 'chgFormuleRienNeChange');

/**
 * AVANT LA FEUILLE DE LA BOUTIQUE (iPhone / Android) — l'orchestration, dépendances injectées (testée sans appareil) :
 *   canal         : 'apple' | 'google'
 *   cible         : la formule demandée (CLES_FORMULES)
 *   lireProfil    : () => Promise<ligne COLONNES_CHANGEMENT | null> (lecture fraîche, jamais l'état d'un écran)
 *   trouverAbonnementPlay : (ids) => Promise<{ purchaseToken, productIdentifier } | null> (Android : l'abonnement Play
 *                   en cours du groupe des formules, sur CE téléphone)
 *   prix          : (cle) => texte | null (lib/prixBoutique.js prixAffiche)
 *   demander      : (fenetre) => Promise<cle | null> — la fenêtre ; null = fermée sans choix
 * Rend :
 *   { etat: 'continuer', cle, id, oldPurchaseToken, replacementMode, fenetreMontree }  — l'achat part (cle peut être
 *       la version « + Cloud » choisie dans la fenêtre) ;
 *   { etat: 'annule' }  — fenêtre fermée : RIEN ne part ;   { etat: 'garder' } — « Garder ma formule » : rien ne part.
 * Android : un abonnement Play du groupe trouvé (téléphone, sinon le jeton du profil) est TOUJOURS remplacé, jamais doublé.
 */
export async function preparerChangementBoutique({
  canal, cible, lireProfil, trouverAbonnementPlay = null, prix = () => null, demander, chargerPrix = null, cloudPossible = true, maintenant = Date.now(),
}) {
  // Le profil relu À L'INSTANT : illisible → rien ne part (jamais une fenêtre sautée sur un état deviné).
  let profil = null;
  try { profil = typeof lireProfil === 'function' ? await lireProfil() : null; } catch { return { etat: 'erreur', raison: 'profil_illisible' }; }
  let compte = compteBoutique(profil, canal, maintenant);
  // Android : le téléphone dit l'abonnement Play en cours (le produit ET son jeton) ; le profil en repli.
  let jeton = null;
  if (canal === 'google') {
    const idsGroupe = idsGroupeFormules('google');
    let trouve = null;
    if (typeof trouverAbonnementPlay === 'function') {
      try { trouve = await trouverAbonnementPlay(idsGroupe); } catch { trouve = null; }
    }
    if (trouve?.purchaseToken && idsGroupe.includes(trouve.productIdentifier)) {
      jeton = trouve.purchaseToken;
      if (!compte.idActuel || compte.idActuel !== trouve.productIdentifier) compte = { ...compte, idActuel: trouve.productIdentifier };
    } else if (profil?.google_purchase_token && idsGroupe.includes(profil?.google_product_id)) {
      jeton = profil.google_purchase_token;
    }
  }
  let plan = planChangementBoutique({ canal, compte, cible, prix, cloudPossible });
  // Un prix pas encore lu (les formules avec Cloud ne sont lues qu'à la demande) : la boutique est relue une fois.
  if (plan.fenetre && plan.options.some((o) => !o.garder && o.prix == null) && typeof chargerPrix === 'function') {
    try { await chargerPrix(); } catch { /* le prix reste absent : l'option ne se choisit pas */ }
    plan = planChangementBoutique({ canal, compte, cible, prix, cloudPossible });
  }
  let cle = cible;
  if (plan.fenetre) {
    let choix = null;
    try { choix = typeof demander === 'function' ? await demander(plan) : null; } catch { choix = null; }
    const option = plan.options.find((o) => o.cle === choix);
    if (!option || !option.choisissable) return { etat: 'annule', plan };
    if (option.garder) return { etat: 'garder', plan };
    cle = option.cle;
  }
  const id = idProduitBoutique(cle, canal);
  const idActuel = compte.idActuel;
  // `programme` : la boutique n'appliquera le changement qu'au renouvellement (Apple : descente ; Google : DEFERRED hors
  // essai) — l'app dit « C'est noté : {formule} commence le {date} » au lieu d'attendre un palier qui ne viendra pas
  // maintenant. `date` : la fin de l'essai, sinon l'échéance du profil.
  const sens = idActuel && idActuel !== id ? sensChangement(canal, idActuel, id) : null;
  const effet = sens ? effetBoutique({ canal, sens, essaiEnCours: compte.essaiEnCours }) : null;
  const commun = { etat: 'continuer', cle, id, fenetreMontree: plan.fenetre === true, plan,
    programme: effet?.quand === 'renouvellement', date: compte.essaiEnCours ? compte.essaiFin : (compte.echeance ?? null) };
  if (canal !== 'google' || !jeton || !effet) return { ...commun, programme: canal === 'google' && !jeton ? false : commun.programme, oldPurchaseToken: null, replacementMode: null };
  return { ...commun, oldPurchaseToken: jeton, replacementMode: effet.modeGoogle };
}

/** « C'est noté : {nom} commence le {date}. Rien n'a été prélevé aujourd'hui. » (changement programmé par la boutique). */
export const texteChangementProgramme = (lang = 'fr', cle, dateIso = null) => {
  const date = dateCourte(dateIso, lang);
  return date ? tpl(lang, 'chgFormuleProgramme', { nom: nomFormule(cle), date }) : tpl(lang, 'chgFormuleProgrammeSansDate', { nom: nomFormule(cle) });
};

/** La formule SANS Cloud d'une formule avec Cloud (pour les journaux). */
export const palierDeCle = (cle) => (avecCloud(cle) ? PALIER_DE_FORMULE[cle] : cle);
