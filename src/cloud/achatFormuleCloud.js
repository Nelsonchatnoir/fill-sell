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
import { prixPret, essaiBoutiqueOffert } from '../lib/prixBoutique.js';
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
  if (d?.error === 'abonnement_autre_canal') return { etat: 'refuse', message: message ?? T.boutique(nomBoutique(d?.canal) ?? 'App Store') };
  if (d?.error === 'conditions_a_accepter') return { etat: 'refuse', message: message ?? T.achatEchec };
  if (d?.error) return { etat: 'erreur', message: message ?? T.achatEchec };
  // Un serveur qui ne connaît pas les formules ne renvoie pas `formule` : jamais une redirection sur sa réponse.
  if (d?.formule !== formule) return { etat: 'refuse', message: T.serveurPasPret };
  if (d?.upgraded === true || d?.change === true) return { etat: 'change', message: message ?? null };
  if (typeof d?.url === 'string' && d.url) return { etat: 'redirige', url: d.url };
  return { etat: 'erreur', message: T.achatEchec };
}

/** Montée ou descente d'un abonnement Play vers une formule : 2 = prorata tout de suite, 6 = au renouvellement (pur). */
export function modeRemplacement(produitActuel, formuleCible) {
  const actuel = formuleDuProduitBoutique(produitActuel)
    ?? (/\.business\./.test(String(produitActuel)) ? 'business' : /\.pro2?\./.test(String(produitActuel)) ? 'pro' : 'premium');
  return (RANG_PRIX[formuleCible] ?? 0) > (RANG_PRIX[actuel] ?? 0) ? 2 : 6;
}

/**
 * dejaCloud : le compte a déjà le Cloud (pas de préparation) ; descente : la fin d'essai, vers une formule plus basse
 * (pas de conditions, pas de préparation, rien n'est attendu : elle prend effet au renouvellement).
 */
export function creerAchatFormuleCloud({
  supabase, supabaseUrl, supabaseAnonKey, user, lang, platform, purchasePremium, trouverAbonnementPlay,
  confirmer, notifier, paiementsAndroidCoupes, demanderConditions, idsAbonnementsPlay = [],
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

  async function stripe(formule, origine) {
    const tk = await jeton();
    if (!tk) return { etat: 'erreur', message: T.achatEchec };
    const appel = () => fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}`, apikey: supabaseAnonKey },
      body: JSON.stringify({ product: formule, email: user.email, lang }),
    }).then((r) => r.json().catch(() => ({})));
    let lu = lireReponseFormule(await appel(), formule, lang);
    if (lu.etat === 'preparation') {
      const p = lirePreparation(await preparer(), lang);
      if (!p.continuer) return { etat: 'refuse', raison: p.raison, message: p.message };
      lu = lireReponseFormule(await appel(), formule, lang);
    }
    if (lu.etat === 'redirige') {
      try { localStorage.setItem('fs_checkout_ctx', JSON.stringify({ canal: 'stripe', tier: formule, origine, at: Date.now() })); } catch { /* mode privé */ }
      window.location.href = lu.url;
      return { etat: 'redirige' };
    }
    if (lu.etat === 'change') return { etat: 'change', message: lu.message ?? T.achatAttente(NOMS_FORMULES[formule]) };
    return lu.etat === 'preparation' ? { etat: 'erreur', message: T.achatEchec } : lu;
  }

  /**
   * (12/11, point 4d de Nico) LA DESCENTE SUR LE WEB passe par changer-formule (« programmer »), jamais par
   * create-checkout-session (qui la refuse : « descente_par_changer_formule ») — avant, « Passer à Premium + Cloud » de la
   * feuille de la veille finissait sur un refus. Pendant l'essai, le serveur change la formule tout de suite, sans prorata
   * (l'essai continue, le 1er débit au prix choisi) : 'change' ; sinon la descente est programmée à l'échéance : 'programme'.
   */
  async function stripeDescente(formule) {
    const tk = await jeton();
    if (!tk) return { etat: 'erreur', message: T.finChangeEchec };
    const res = await fetch(`${supabaseUrl}/functions/v1/changer-formule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}`, apikey: supabaseAnonKey },
      body: JSON.stringify({ action: 'programmer', vers: formule }),
    });
    const d = await res.json().catch(() => null);
    if (res.ok && d && !d.error) return { etat: d.change_pendant_essai === true ? 'change' : 'programme' };
    return { etat: 'erreur', message: T.finChangeEchec };
  }

  async function boutique(formule, { descente = false } = {}) {
    if (platform === 'android' && paiementsAndroidCoupes && await paiementsAndroidCoupes()) return { etat: 'erreur', message: T.achatEchec };
    const productId = produitBoutiqueDe(formule, platform);
    if (!productId) return { etat: 'erreur', message: T.achatEchec };
    // Android : un abonnement Play en cours (formule seule ou avec Cloud) est REMPLACÉ, jamais doublé.
    let ancien = null;
    if (platform === 'android' && typeof trouverAbonnementPlay === 'function') {
      try { ancien = await trouverAbonnementPlay(idsAbonnementsPlay.filter((id) => id !== productId)); } catch { ancien = null; }
    }
    const r = await purchasePremium(productId, user.id, ancien
      ? { oldPurchaseToken: ancien.purchaseToken, replacementMode: modeRemplacement(ancien.productIdentifier, formule) } : {});
    if (r?.cancelled) return { etat: 'annule' };
    if (r?.enAttente) return { etat: 'attente', message: T.achatAttente(NOMS_FORMULES[formule]) };
    if (platform === 'android') {
      if (!r?.purchaseToken) return { etat: 'erreur', message: T.achatEchec };
      const { error } = await supabase.functions.invoke('validate-google-purchase', { body: { productId, purchaseToken: r.purchaseToken, userId: user.id } });
      if (error) return { etat: 'erreur', message: T.achatEchec };
    }
    if (descente) return { etat: 'programme' };
    const ok = await attendreServeur(formule);
    return ok ? { etat: 'actif', message: T.achatOk(NOMS_FORMULES[formule]) } : { etat: 'attente', message: T.achatAttente(NOMS_FORMULES[formule]) };
  }

  /** Prendre une formule avec Cloud. essaiAffiche : la carte a annoncé l'essai ; dejaCloud / descente : voir plus haut ;
   *  abonneBoutique : (13/11) le compte est DÉJÀ abonné par la boutique de ce téléphone (même groupe d'abonnements). */
  async function acheter(formule, { origine = 'non_precisee', essaiAffiche = false, dejaCloud = false, descente = false, abonneBoutique = false } = {}) {
    if (!FORMULES_CLOUD.includes(formule)) return { etat: 'refuse', message: T.achatEchec };
    if (platform !== 'web' && !prixPret(formule)) return { etat: 'refuse', raison: 'prix_boutique_absent', message: TC.prixBoutiqueAbsent };
    // (12/11, 4d) La boutique offrira SA semaine gratuite (iPhone : le Cloud seul et les formules sont dans deux groupes
    // d'abonnements) alors que l'essai FillSell est déjà pris : le serveur n'ouvrira rien avant le premier paiement
    // (décision 8) — on le dit AVANT la feuille de la boutique, jamais 7 jours sans rien en silence.
    // (13/11) Un abonné de CETTE boutique (Premium, Pro ou Business par l'App Store / Google Play) n'a jamais la semaine
    // gratuite d'une formule du même groupe (Apple : une offre d'introduction par groupe ; Google : « n'ont jamais eu
    // d'abonnement ») : pas de question pour lui.
    const nomF = NOMS_FORMULES[formule];
    const boutiqueOffreEssai = platform !== 'web' && abonneBoutique !== true && essaiPossiblePourFormule(formule) && essaiBoutiqueOffert(formule) === true;
    const texteEssaiPris = boutiqueOffreEssai ? T.essaiDejaPrisBoutique(nomF, nomBoutique(platform === 'ios' ? 'apple' : 'google')) : T.sansEssaiConfirmer(nomF);
    try {
      if (descente && platform === 'web') return await stripeDescente(formule);
      if (!descente && !essaiAffiche && boutiqueOffreEssai && !(await confirmer?.(texteEssaiPris))) return { etat: 'annule' };
      if (!descente) {
        if (typeof demanderConditions !== 'function' || !(await demanderConditions())) return { etat: 'annule' };
        if (!dejaCloud) {
          notifier?.(TC.preparation);
          const p = lirePreparation(await preparer(), lang);
          if (!p.continuer) return { etat: 'refuse', raison: p.raison, attente: p.attente === true, message: p.message };
          // L'essai annoncé, refusé par un verrou : la formule n'est payée tout de suite que si la personne le confirme.
          if (essaiAffiche && essaiPossiblePourFormule(formule) && p.essai === false
            && !(await confirmer?.(texteEssaiPris))) return { etat: 'annule' };
        }
      }
      return platform === 'web' ? await stripe(formule, origine) : await boutique(formule, { descente });
    } catch (e) {
      console.warn('[formules cloud] achat :', e?.message ?? e);
      return { etat: 'erreur', message: T.achatEchec };
    }
  }

  return { acheter };
}
