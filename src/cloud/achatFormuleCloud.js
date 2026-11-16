// ═══════════════════════════════════════════════════════════════════════════
// L'ACHAT D'UNE FORMULE AVEC CLOUD (11/11/2026) — côté app ; le serveur est codé en parallèle sur le même contrat
// ═══════════════════════════════════════════════════════════════════════════
// Même ordre que l'achat du Cloud d'aujourd'hui (cloud/achatCloud.js), quel que soit le canal :
//   0. iPhone / Android : jamais d'achat tant que le prix de la BOUTIQUE n'est pas affiché ;
//   1. les CONDITIONS du Cloud (case obligatoire, enregistrée en base) ;
//   2. la PRÉPARATION (cloud_essai_preparer_moi) : une place serveur, et les verrous de l'essai (appareil, comptes de
//      plateforme) qui répondent AVANT toute carte ; serveur plein → liste d'attente, rien ne s'ouvre. Un compte qui a
//      DÉJÀ le Cloud (Cloud seul, ou une formule avec Cloud) n'en a pas besoin : sa place existe ;
//   3. l'essai annoncé mais refusé par un verrou : on le DIT, et la formule ne se prend sans essai que confirmée ;
//      ⛔ Business + Cloud n'a JAMAIS d'essai (rien à confirmer : il est annoncé payé dès la souscription) ;
//   4. le canal : web → create-checkout-session { product: 'premium_cloud' | 'pro_cloud' | 'business_cloud', email,
//      lang } (les champs de l'achat du Cloud d'aujourd'hui) ; iPhone → app.fillsell.<formule>.cloud (groupe « FillSell
//      Plan ») ; Android → même identifiant, remplacement de l'abonnement Play en cours s'il y en a un (jamais deux) ;
//   5. on ne croit que le SERVEUR (drapeaux du palier + cloud_etat_moi relus), jamais la boutique.
// ⛔ Une réponse de create-checkout-session qui ne porte pas `formule` égale à la formule demandée vient d'un serveur
//    qui ne connaît pas les formules (il retomberait sur Premium standard) : on n'ouvre RIEN, on le dit.
import { textesConnexion } from './textesConnexion';
import { textesFormules, NOMS_FORMULES } from './textesFormules';
import { identifiantAppareil, lirePreparation } from './achatCloud';
import { nomBoutique, RANG_PRIX } from './formulesCloud';
import { prixPret, etatEssaiBoutique } from '../lib/prixBoutique.js';
import { gardeAchatBoutique } from '../lib/gardeAchat.js';
import { offreEssaiAbonne } from '../lib/essaiAbonneBoutique.js';
import { texteRienNeChange, texteChangementProgramme } from '../lib/changementFormuleBoutique.js';
import {
  FORMULES_CLOUD, PALIER_DE_FORMULE, PRODUITS_BOUTIQUES, essaiPossiblePourFormule, formuleDuProduitBoutique,
} from '../../supabase/functions/_shared/formules-cloud.js';

/** Le produit de boutique d'une formule (pur). */
export const produitBoutiqueDe = (formule, platform) => PRODUITS_BOUTIQUES[formule]?.[platform === 'ios' ? 'apple' : 'google'] ?? null;

/**
 * Ce que veut dire la réponse de create-checkout-session pour une formule (pur, testé).
 * Rend { etat: 'redirige'|'change'|'refuse'|'erreur'|'preparation', url?, message? }.
 */
export function lireReponseFormule(d, formule, lang = 'fr') {
  const T = textesFormules(lang);
  const message = (lang === 'en' ? d?.message_en : d?.message_fr) || null;
  if (d?.error === 'preparation_requise') return { etat: 'preparation' };
  // (12/11, 4c) Le serveur dit où se fait le changement — et « bientôt » quand la boutique qui facture n'a pas encore les
  // formules ; son texte d'abord, le nôtre en repli.
  if (d?.error === 'abonnement_autre_canal') return { etat: 'refuse', raison: 'abonnement_autre_canal', message: message ?? T.boutique(nomBoutique(d?.canal) ?? 'App Store') };
  // (13/11/2026, point a de Nico) Un second abonnement refusé par le serveur : sa phrase (où faire le changement).
  if (d?.error === 'un_seul_abonnement') return { etat: 'refuse', raison: 'un_seul_abonnement', message: message ?? T.achatEchec };
  if (d?.error === 'conditions_a_accepter') return { etat: 'refuse', raison: 'conditions_a_accepter', message: message ?? T.achatEchec };
  if (d?.error) return { etat: 'erreur', raison: `serveur_${String(d.error).slice(0, 40)}`, message: message ?? T.achatEchec };
  // (14/11/2026, bloc F) Pendant un essai, ou en perdant le Cloud : RIEN n'a changé, le serveur rend le devis exact —
  // l'app ouvre la fenêtre de confirmation (components/FenetreChangementFormule.jsx), jamais un changement en silence.
  if (d?.confirmation_requise === true && d?.devis) return { etat: 'confirmation', devis: d.devis };
  // Un serveur qui ne connaît pas les formules ne renvoie pas `formule` : jamais une redirection sur sa réponse.
  if (d?.formule !== formule) return { etat: 'refuse', raison: 'serveur_sans_formules', message: T.serveurPasPret };
  if (d?.upgraded === true || d?.change === true) return { etat: 'change', message: message ?? null };
  if (typeof d?.url === 'string' && d.url) return { etat: 'redirige', url: d.url };
  return { etat: 'erreur', raison: 'reponse_sans_url', message: T.achatEchec };
}

/** (16/11/2026, point 1c) La raison d'une réponse de create-checkout-session sans `raison` (pur) : jamais null. */
export function raisonReponseServeur(etat) {
  return etat === 'refuse' ? 'serveur_refuse' : etat === 'erreur' ? 'checkout_erreur' : null;
}

/** Montée ou descente d'un abonnement Play vers une formule : 5 = prix entier tout de suite (CHARGE_FULL_PRICE, décision 5
 *  de Nico du 14/11 : le montant affiché toujours exact — avant : 2, prorata), 6 = au renouvellement (pur). */
export function modeRemplacement(produitActuel, formuleCible) {
  const actuel = formuleDuProduitBoutique(produitActuel)
    ?? (/\.business\./.test(String(produitActuel)) ? 'business' : /\.pro2?\./.test(String(produitActuel)) ? 'pro' : 'premium');
  return (RANG_PRIX[formuleCible] ?? 0) > (RANG_PRIX[actuel] ?? 0) ? 5 : 6;
}

/**
 * dejaCloud : le compte a déjà le Cloud (pas de préparation) ; descente : la fin d'essai, vers une formule plus basse
 * (pas de conditions, pas de préparation, rien n'est attendu : elle prend effet au renouvellement).
 */
export function creerAchatFormuleCloud({
  supabase, supabaseUrl, supabaseAnonKey, user, lang, platform, purchasePremium, trouverAbonnementPlay,
  confirmer, notifier, paiementsAndroidCoupes, demanderConditions, idsAbonnementsPlay = [],
  // (13/11/2026, point f de Nico) La version du binaire natif (essai d'abonné de la boutique, INACTIF : lib/essaiAbonneBoutique.js).
  binaireNatif = null,
  // (14/11/2026, règle de Nico) iPhone / Android : (formule) => preparerChangementBoutique(…) — la fenêtre « Changer de
  // formule » (essai qui s'arrête, montant exact lu chez la boutique) AVANT la feuille, et sur Android le jeton + le mode
  // de remplacement qui font ce que la fenêtre a dit. Absente : l'achat d'avant.
  preparerChangement = null,
  // (16/11/2026, point 2f) La trace de l'ouverture de la page Stripe (usage_logs checkout_open), fournie par l'hôte.
  journalOuverture = null,
}) {
  const T = new Proxy({}, { get: (_, k) => textesFormules(lang)[k] });
  const TC = new Proxy({}, { get: (_, k) => textesConnexion(lang)[k] });

  async function jeton() {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) ({ data: { session } } = await supabase.auth.refreshSession());
    return session?.access_token ?? null;
  }
  async function preparer() {
    const { data, error } = await supabase.rpc('cloud_essai_preparer_moi', { p_appareil: identifiantAppareil() });
    if (error) return { ok: false, raison: 'erreur' };
    return data;
  }
  /** Le serveur porte-t-il la formule ? Le palier (drapeaux) ET le Cloud (cloud_etat_moi) — jamais la boutique. */
  async function attendreServeur(formule, essais = 11, delaiMs = 2000) {
    const palier = PALIER_DE_FORMULE[formule];
    for (let i = 0; i < essais; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, delaiMs));
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from('profiles').select('is_premium,is_pro,is_business').eq('id', user.id).maybeSingle(),
        supabase.rpc('cloud_etat_moi'),
      ]);
      const palierOk = palier === 'business' ? p?.is_business === true : palier === 'pro' ? p?.is_pro === true : p?.is_premium === true;
      if (palierOk && c?.actif === true) return true;
    }
    return false;
  }

  async function stripe(formule, origine, confirme = false) {
    const tk = await jeton();
    if (!tk) return { etat: 'erreur', raison: 'session_absente', etape: 'stripe', message: T.achatEchec };
    const appel = () => fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}`, apikey: supabaseAnonKey },
      body: JSON.stringify({ product: formule, email: user.email, lang, ...(confirme ? { confirme_changement: true } : {}) }),
    }).then((r) => r.json().catch(() => ({})));
    let lu = lireReponseFormule(await appel(), formule, lang);
    if (lu.etat === 'preparation') {
      const p = lirePreparation(await preparer(), lang);
      if (!p.continuer) return { etat: 'refuse', raison: p.raison ?? 'preparation_refusee', etape: 'preparation', message: p.message };
      lu = lireReponseFormule(await appel(), formule, lang);
    }
    if (lu.etat === 'redirige') {
      try { localStorage.setItem('fs_checkout_ctx', JSON.stringify({ canal: 'stripe', tier: formule, origine, at: Date.now() })); } catch { /* mode privé */ }
      // (16/11/2026, point 2f de Nico) L'OUVERTURE de la page Stripe d'une formule se journalise (checkout_open), AVANT de
      // quitter l'app ; la trace n'est jamais attendue plus de 600 ms.
      if (typeof journalOuverture === 'function') {
        try { await Promise.race([Promise.resolve(journalOuverture({ canal: 'stripe', tier: formule, origine })), new Promise((r) => setTimeout(r, 600))]); } catch { /* une trace ne bloque jamais */ }
      }
      window.location.href = lu.url;
      return { etat: 'redirige' };
    }
    if (lu.etat === 'change') return { etat: 'change', message: lu.message ?? T.achatAttente(NOMS_FORMULES[formule]) };
    if (lu.etat === 'confirmation') return lu;
    if (lu.etat === 'preparation') return { etat: 'erreur', raison: 'preparation_redemandee', etape: 'stripe', message: T.achatEchec };
    return { ...lu, raison: lu.raison ?? raisonReponseServeur(lu.etat), etape: 'stripe' };
  }

  /**
   * (12/11, point 4d de Nico) LA DESCENTE SUR LE WEB passe par changer-formule (« programmer »), jamais par
   * create-checkout-session (qui la refuse : « descente_par_changer_formule ») — avant, « Passer à Premium + Cloud » de la
   * feuille de la veille finissait sur un refus. (14/11/2026, bloc F) Pendant l'essai : la fenêtre du montant exact
   * ('confirmation'), puis, confirmé, l'essai s'arrête et la formule est payée tout de suite : 'change' ; hors essai, la
   * descente est programmée à l'échéance : 'programme'.
   */
  async function stripeDescente(formule, confirme = false) {
    const tk = await jeton();
    if (!tk) return { etat: 'erreur', raison: 'session_absente', etape: 'descente', message: T.finChangeEchec };
    const res = await fetch(`${supabaseUrl}/functions/v1/changer-formule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}`, apikey: supabaseAnonKey },
      body: JSON.stringify({ action: 'programmer', vers: formule, ...(confirme ? { confirme_changement: true } : {}) }),
    });
    const d = await res.json().catch(() => null);
    // (14/11/2026, bloc F) Pendant l'essai : la fenêtre d'abord (devis exact) ; confirmé mais paiement à valider (Klarna,
    // 3-D Secure, refus) : la page de la facture — rien ne change tant qu'elle n'est pas payée.
    if (d?.confirmation_requise === true && d?.devis) return { etat: 'confirmation', devis: d.devis, descente: true };
    if (res.ok && d?.paiement_a_valider === true && typeof d.url === 'string' && d.url) { window.location.href = d.url; return { etat: 'redirige' }; }
    if (res.ok && d && !d.error) return { etat: d.change_pendant_essai === true ? 'change' : 'programme' };
    return { etat: 'erreur', raison: d?.error ? `descente_${String(d.error).slice(0, 40)}` : `descente_http_${res.status}`, etape: 'descente', message: T.finChangeEchec };
  }

  async function boutique(formule, { descente = false, essai = false, abonneBoutique = false, changement = null } = {}) {
    if (platform === 'android' && paiementsAndroidCoupes && await paiementsAndroidCoupes()) return { etat: 'erreur', raison: 'paiements_android_coupes', etape: 'boutique', message: T.achatEchec };
    const productId = produitBoutiqueDe(formule, platform);
    if (!productId) return { etat: 'erreur', raison: 'produit_boutique_inconnu', etape: 'boutique', message: T.achatEchec };
    // Android : un abonnement Play en cours (formule seule ou avec Cloud) est REMPLACÉ, jamais doublé.
    // (14/11/2026) Le changement confirmé dans la fenêtre porte SON jeton et SON mode (pendant l'essai : CHARGE_FULL_PRICE,
    // le prix entier maintenant, comme la fenêtre l'a dit) ; sinon le relevé d'avant.
    let ancien = null;
    if (platform === 'android' && changement?.oldPurchaseToken) {
      ancien = { purchaseToken: changement.oldPurchaseToken, mode: changement.replacementMode };
    } else if (platform === 'android' && typeof trouverAbonnementPlay === 'function') {
      try { ancien = await trouverAbonnementPlay(idsAbonnementsPlay.filter((id) => id !== productId)); } catch { ancien = null; }
    }
    // (13/11/2026, point f de Nico) L'essai du Cloud d'un ABONNÉ de cette boutique : fermé tant que le binaire qui sait passer
    // l'offre n'existe pas (offreEssaiAbonne rend null) — l'achat part alors exactement comme avant.
    const offreEssai = abonneBoutique && !descente ? await offreEssaiAbonne({ supabase, platform, binaire: typeof binaireNatif === 'function' ? await binaireNatif() : binaireNatif, formule }) : null;
    // (16/11/2026, point 1c de Nico) LA FEUILLE DE LA BOUTIQUE, MESURÉE : sa durée, et le code et le message rendus par
    // StoreKit / Google Play. Avant, le chemin des formules ne gardait ni le code, ni la durée, ni l'étape : une annulation
    // et une erreur finissaient en « annule » sans raison (rachidafarhi54, 16/11 : 5 essais illisibles).
    const debutFeuille = Date.now();
    let r;
    try {
      r = await purchasePremium(productId, user.id, {
        ...(ancien ? { oldPurchaseToken: ancien.purchaseToken, replacementMode: ancien.mode ?? modeRemplacement(ancien.productIdentifier, formule) } : {}),
        ...(offreEssai ? { offreEssai } : {}),
      });
    } catch (e) {
      const issue = e?.issueAchat ?? null;
      return { etat: 'erreur', raison: 'boutique_erreur', etape: 'boutique', produit: productId, duree_feuille_ms: Date.now() - debutFeuille,
        code: issue?.code ?? (typeof e?.code === 'string' ? e.code.slice(0, 60) : null), message_boutique: String(issue?.message ?? e?.message ?? e ?? '').slice(0, 200),
        message: T.achatEchec };
    }
    const feuille = { etape: 'boutique', produit: productId, duree_feuille_ms: Date.now() - debutFeuille, code: r?.issue?.code ?? null,
      ...(r?.issue?.message ? { message_boutique: String(r.issue.message).slice(0, 200) } : {}) };
    if (r?.cancelled) return { etat: 'annule', raison: 'boutique_annulee', ...feuille };
    if (r?.enAttente) return { etat: 'attente', raison: 'boutique_en_attente', ...feuille, message: T.achatApprobation(NOMS_FORMULES[formule]) };
    if (platform === 'android') {
      if (!r?.purchaseToken) return { etat: 'erreur', raison: 'jeton_google_absent', ...feuille, message: T.achatEchec };
      const { error } = await supabase.functions.invoke('validate-google-purchase', { body: { productId, purchaseToken: r.purchaseToken, userId: user.id } });
      if (error) return { etat: 'erreur', raison: 'validation_google_echec', ...feuille, message: T.achatEchec };
    }
    if (descente) return { etat: 'programme', ...feuille };
    // (14/11/2026) Un changement que la boutique n'appliquera qu'à l'échéance (Apple : descente) : la phrase dit quand.
    if (changement?.programme === true) return { etat: 'programme', ...feuille, message: texteChangementProgramme(lang, formule, changement.date ?? null) };
    const ok = await attendreServeur(formule);
    return ok ? { etat: 'actif', ...feuille, message: T.achatOk(NOMS_FORMULES[formule]) }
      : { etat: 'attente', raison: 'serveur_pas_encore_confirme', ...feuille, message: essai ? T.essaiAttente(NOMS_FORMULES[formule]) : T.achatAttente(NOMS_FORMULES[formule]) };
  }

  /** Prendre une formule avec Cloud. essaiAffiche : la carte a annoncé l'essai ; dejaCloud / descente : voir plus haut ;
   *  abonneBoutique : (13/11) le compte est DÉJÀ abonné par la boutique de ce téléphone (même groupe d'abonnements). */
  async function acheter(formule, { origine = 'non_precisee', essaiAffiche = false, dejaCloud = false, descente = false, abonneBoutique = false, confirmeChangement = false, changement: changementDonne = null, ecranVivant = null } = {}) {
    if (!FORMULES_CLOUD.includes(formule)) return { etat: 'refuse', raison: 'formule_inconnue', message: T.achatEchec };
    if (platform !== 'web' && !prixPret(formule)) return { etat: 'refuse', raison: 'prix_boutique_absent', message: TC.prixBoutiqueAbsent };
    // (16/11/2026, point 1a de Nico) L'ÉCRAN QUI A DEMANDÉ L'ACHAT EST-IL ENCORE LÀ ? Un achat lancé par le parcours d'entrée
    // ne part JAMAIS d'un écran démonté (d4929a4e le 15/11, rachidafarhi54 le 16/11 : la case des conditions acceptée après
    // la fin du parcours, la feuille de paiement ouverte sur le Tableau). Absent : toujours vivant.
    const ecranParti = () => typeof ecranVivant === 'function' && ecranVivant() !== true;
    // (16/11/2026, DÉCISION DE NICO — remplace le 4d du 12/11 et la « décision 8 ») LA SEMAINE GRATUITE DE LA BOUTIQUE =
    // LE SERVICE ACTIF TOUT DE SUITE. Sur iPhone / Android, l'essai EST la semaine de la boutique : quand elle est offerte,
    // le serveur ouvre la formule dès l'achat, quels que soient les verrous de l'essai FillSell (appareil, compte de
    // plateforme, essai déjà pris — verdictEssaiStore). Plus jamais « Ton essai gratuit FillSell a déjà été utilisé. App
    // Store va t'afficher 1 semaine gratuite : cette semaine-là, … n'est pas encore activé » (vu par Nico sur un compte NEUF,
    // test5, le 16/11 : appareil_deja_vu). Une question ne reste que là où l'argent part AUJOURD'HUI, en une phrase :
    //   · mobile, semaine 'non' alors que la carte annonçait l'essai → « … ne t'offre pas de semaine gratuite, donc … est
    //     payé dès aujourd'hui » ; 'inconnu' (historique Apple illisible) → les deux issues, vraies, en une phrase ;
    //   · web (pas de semaine de boutique : Stripe suit le serveur) : l'essai FillSell refusé → la vraie raison, une phrase.
    // (13/11) Un abonné de CETTE boutique n'a jamais la semaine gratuite d'une formule du même groupe : pas de question.
    const nomF = NOMS_FORMULES[formule];
    const etatSemaine = platform !== 'web' && abonneBoutique !== true && essaiPossiblePourFormule(formule) ? etatEssaiBoutique(formule) : 'non';
    const nomB = nomBoutique(platform === 'ios' ? 'apple' : 'google');
    const essaiAttendu = essaiAffiche === true && etatSemaine === 'oui';
    try {
      if (descente && platform === 'web') return await stripeDescente(formule, confirmeChangement);
      // (13/11/2026, 3e réponse de Nico, point a) UN SEUL ABONNEMENT PAR COMPTE, TOUS CANAUX — avant la feuille de la boutique :
      // un abonné par carte, de l'autre boutique ou du Cloud seul de cette boutique lit OÙ changer. Le même groupe passe.
      if (!descente && (platform === 'ios' || platform === 'android')) {
        const garde = await gardeAchatBoutique({ supabase, userId: user.id, canal: platform === 'ios' ? 'apple' : 'google', achat: 'formule', lang });
        if (!garde.permis) return { etat: 'refuse', raison: 'un_seul_abonnement', message: garde.message ?? T.achatEchec };
      }
      // (14/11/2026, règle de Nico) UN ABONNÉ DE CETTE BOUTIQUE QUI CHANGE DE FORMULE PENDANT SON ESSAI (ou qui a le Cloud) :
      // la fenêtre « Changer de formule » d'abord — « Ton essai gratuit s'arrête : tu seras débité maintenant de {prix} »,
      // le prix lu chez la boutique. Fermée = rien ne part. Un changement déjà confirmé (venu de la fenêtre d'une formule
      // sans Cloud, App.jsx) n'est pas redemandé.
      let changement = changementDonne;
      if (!descente && (platform === 'ios' || platform === 'android') && !changement && typeof preparerChangement === 'function') {
        changement = await preparerChangement(formule);
        if (!changement || changement.etat === 'erreur') return { etat: 'erreur', raison: changement?.raison ?? 'changement_illisible', etape: 'changement', message: T.achatEchec };
        if (changement.etat === 'annule' || changement.etat === 'garder') return { etat: 'annule', raison: 'changement_non_confirme', message: texteRienNeChange(lang) };
        if (changement?.etat === 'continuer' && changement.cle && changement.cle !== formule) return { etat: 'erreur', raison: 'changement_autre_formule', etape: 'changement', message: T.achatEchec };
      }
      if (!descente) {
        if (ecranParti()) return { etat: 'annule', raison: 'ecran_ferme', etape: 'conditions' };
        // (16/11/2026, point 2b de Nico) Quand l'essai est annoncé ET sûr sur ce canal, la case dit « 0 € aujourd'hui. Rien
        // n'est prélevé avant le JJ/MM… » : c'est le dernier écran avant la page Stripe et la feuille d'Apple / Google.
        const essaiSur = essaiAffiche === true && essaiPossiblePourFormule(formule) && (platform === 'web' || etatSemaine === 'oui');
        const conditions = typeof demanderConditions === 'function' ? await demanderConditions({ essai: essaiSur, formule }) : false;
        if (conditions !== true) return { etat: 'annule', raison: conditions === 'remplacee' ? 'conditions_remplacees' : 'conditions_refusees', etape: 'conditions' };
        if (ecranParti()) return { etat: 'annule', raison: 'ecran_ferme', etape: 'conditions' };
        if (!dejaCloud) {
          notifier?.(TC.preparation);
          const p = lirePreparation(await preparer(), lang);
          if (!p.continuer) return { etat: 'refuse', raison: p.raison ?? 'preparation_refusee', etape: 'preparation', attente: p.attente === true, message: p.message };
          // WEB : l'essai annoncé, refusé par un verrou FillSell → payé tout de suite, seulement si la personne le confirme
          // (une phrase, la vraie raison). Mobile : le verdict FillSell ne change rien (la semaine de la boutique ouvre tout).
          if (platform === 'web' && essaiAffiche && essaiPossiblePourFormule(formule) && p.essai === false
            && !(await confirmer?.(T.sansEssaiConfirmer(nomF, p.raison)))) return { etat: 'annule', raison: 'essai_refuse_non_confirme', etape: 'confirmation', essai_refus: p.raison ?? null };
        }
        // MOBILE : l'essai annoncé, mais la boutique ne l'offre pas (ou on ne sait pas lire son historique) : l'argent peut
        // partir aujourd'hui — une phrase avant la feuille.
        if (platform !== 'web' && essaiAffiche && essaiPossiblePourFormule(formule) && etatSemaine !== 'oui') {
          const question = etatSemaine === 'inconnu' ? T.semaineBoutiqueIncertaine(nomF, nomB) : T.sansSemaineBoutique(nomF, nomB);
          if (!(await confirmer?.(question))) return { etat: 'annule', raison: 'semaine_boutique_non_confirmee', etape: 'confirmation' };
        }
      }
      if (ecranParti()) return { etat: 'annule', raison: 'ecran_ferme', etape: 'preparation' };
      const r = platform === 'web' ? await stripe(formule, origine, confirmeChangement) : await boutique(formule, { descente, essai: essaiAttendu, abonneBoutique, changement });
      // La semaine de la boutique telle que l'app l'a lue (oui / non / inconnu) part avec l'issue : une feuille d'Apple sans
      // la semaine gratuite se voit dans la trace.
      return platform === 'web' || !r || typeof r !== 'object' ? r : { ...r, semaine_boutique: etatSemaine };
    } catch (e) {
      console.warn('[formules cloud] achat :', e?.message ?? e);
      return { etat: 'erreur', raison: 'exception', message_boutique: String(e?.message ?? e ?? '').slice(0, 200), message: T.achatEchec };
    }
  }

  return { acheter };
}
