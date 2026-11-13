// L'ACHAT ET L'ARRÊT DE L'OPTION « FILLSELL CLOUD » (05/10) — côté app.
//
// L'ordre, toujours le même, quel que soit le canal :
//   1. PRÉPARER (cloud_essai_preparer_moi) AVANT d'ouvrir Stripe, l'App Store
//      ou Google Play : une place (une IP française dédiée) est réservée pour
//      ce compte — jamais un essai qui démarre sans place —, et les verrous de
//      l'essai « appareil » et « comptes de plateforme » répondent AVANT que
//      quiconque ne saisisse sa carte. Pool vide : on le dit, rien ne s'ouvre ;
//   2. essai refusé par un verrou : on le DIT, et l'option se prend sans essai
//      si la personne le confirme ;
//   3. le canal : web → Checkout Stripe (create-checkout-session, product
//      « cloud ») ; iOS / Android → l'abonnement app.fillsell.cloud.sub du
//      store, rattaché au compte (appAccountToken / validate-google-purchase) ;
//   4. on ne croit que le SERVEUR (colonnes Cloud relues), jamais le store.
// L'arrêt : cancel-subscription { option: 'cloud' } (Stripe) ; un abonnement
// pris dans une boutique s'arrête dans la boutique (on l'ouvre).
// (07/11 soir, essai TestFlight de Nico : « Arrêter » ne faisait RIEN sur un Cloud Apple) L'APP décide la voie d'après
// le CANAL qui facture (profiles.cloud_canal), AVANT tout appel : Apple → la feuille d'abonnements d'Apple, Google →
// la page d'abonnements de Google Play (produit Cloud), Stripe seul → cancel-subscription. Avant, l'app demandait
// toujours au serveur, et la fonction en prod (v53, 02/10, d'avant l'option) ignorait `option: 'cloud'` et répondait
// `{ success: true }` sans rien arrêter ; l'app le prenait pour un succès et ne disait rien. Une app n'annule jamais
// un abonnement Apple ou Google : notre état suit le retour de la boutique (apple-iap-webhook, google-play-webhook).
import { textesConnexion } from './textesConnexion';
import { textesCloud } from './textes';
import { dateLongue } from './regles';
import { prixPret, etatEssaiBoutique } from '../lib/prixBoutique.js';
import { gardeAchatBoutique } from '../lib/gardeAchat.js';

export const PRODUIT_CLOUD = 'app.fillsell.cloud.sub';   // même identifiant Apple et Google (cloud-option.js, PRODUIT_CLOUD_GOOGLE)
export const LIEN_APPLE = 'https://apps.apple.com/account/subscriptions';
export const LIEN_GOOGLE = `https://play.google.com/store/account/subscriptions?sku=${PRODUIT_CLOUD}&package=app.fillsell.app`;
const CLE_APPAREIL = 'fs_appareil_cloud';
const CANAUX = new Set(['apple', 'google', 'stripe']);

/**
 * Où s'arrête (ou se garde) le Cloud — décidé par le CANAL qui le facture, jamais par l'appareil seul (pur, testé) :
 *   'apple'          — pris sur l'App Store, vu sur iPhone / iPad : la feuille d'abonnements d'Apple s'ouvre ;
 *   'apple_ailleurs' — pris sur l'App Store, vu sur le web ou Android : rien à ouvrir ici, on dit où l'arrêter ;
 *   'google'         — pris sur Google Play : la page d'abonnements de Play (produit Cloud) s'ouvre ;
 *   'stripe'         — pris par carte sur le web : FillSell l'arrête (cancel-subscription) ;
 *   'serveur'        — canal inconnu (non lu, offert) : le serveur décide, comme avant.
 */
export function voieArretCloud(canal, platform) {
  if (canal === 'apple') return platform === 'ios' ? 'apple' : 'apple_ailleurs';
  if (canal === 'google') return 'google';
  if (canal === 'stripe') return 'stripe';
  return 'serveur';
}

/** Une voie où c'est la BOUTIQUE (Apple, Google) qui arrête — jamais FillSell (pur). */
export const voieBoutique = (voie) => voie === 'apple' || voie === 'google' || voie === 'apple_ailleurs';

/**
 * Ce que veut dire la réponse de cancel-subscription (pur, testé). Seule une réponse qui porte `option: 'cloud'` vient
 * d'un serveur qui a compris la demande : la v53 servie le 07/11 ignore l'option et répond `{ success: true }` — jamais
 * un arrêt réussi pour l'app (on le dit, sans « c'est fait »).
 */
export function lireReponseArret(d, { reprendre = false, platform = 'web' } = {}, lang = 'fr') {
  const T = textesConnexion(lang);
  if (d?.error === 'resilier_dans_la_boutique') {
    const voie = voieArretCloud(d.canal === 'google' ? 'google' : 'apple', platform);
    return { etat: 'boutique', voie, message: reprendre ? T.repriseBoutique(voie) : T.arretBoutique(voie) };
  }
  if (d?.success === true && d?.option === 'cloud') {
    if (d.deja === true && !reprendre) return { etat: 'rien', message: T.arretRien };
    // (13/11/2026, décision de Nico — plus aucun arrêt immédiat d'un essai) L'essai n'est plus arrêté : son renouvellement est
    // coupé (cancel_at_period_end), il continue jusqu'à sa fin — la phrase des boutiques, mot pour mot.
    if (!reprendre && d.essai_sans_suite === true) return { etat: 'ok', ...d, message: textesCloud(lang).essaiSansSuite(dateLongue(d.fin_essai, lang)) };
    // (08/11) Ce que Stripe a CONFIRMÉ, et rien de plus : « aucun prélèvement » seulement si la réponse le porte
    // (abonnement annulé avant la fin de l'essai, factures à 0, relu chez Stripe par cancel-subscription).
    if (!reprendre && d.essai_arrete === true) return { etat: 'ok', ...d, message: d.aucun_prelevement === true ? T.arretEssaiConfirme : T.arretEssaiFait };
    if (!reprendre && d.period_end) return { etat: 'ok', ...d, message: T.arretProgrammeConfirme(d.period_end) };
    return { etat: 'ok', ...d };
  }
  if (d?.success === true) return { etat: 'non_confirme', message: T.arretNonConfirme };
  return { etat: 'erreur', message: T.arretEchec };
}

/** Un identifiant d'installation, gardé sur l'appareil (jamais envoyé en clair à Stripe :
 *  la base le hache avec un sel du coffre-fort). */
export function identifiantAppareil(stockage = globalThis.localStorage) {
  try {
    let id = stockage?.getItem(CLE_APPAREIL);
    if (!id) {
      const brut = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      id = `app-${brut}`;
      stockage?.setItem(CLE_APPAREIL, id);
    }
    return id;
  } catch {
    return '';
  }
}

/** Ce que la préparation veut dire pour l'écran (pur : testé). */
export function lirePreparation(r, lang = 'fr') {
  const T = textesConnexion(lang);
  if (!r || r.ok !== true) {
    const raison = r?.raison ?? 'erreur';
    // (03/11, point 5) Sans place serveur (« complet ») ou sans IP (« pool_vide ») : jamais de vente ; la liste
    // d'attente est proposée (attente = vrai), sauf à qui y est déjà inscrit(e).
    const sansPlace = raison === 'complet' || raison === 'pool_vide';
    return {
      continuer: false, raison, attente: sansPlace && r?.inscrit !== true, inscrit: r?.inscrit === true,
      message: raison === 'complet' ? T.complet : raison === 'pool_vide' ? T.poolVide : raison === 'deja_client' ? T.dejaClient : T.achatEchec,
    };
  }
  if (r.essai === false) return { continuer: true, essai: false, raison: r.raison, confirmation: T.sansEssai(r.raison) };
  return { continuer: true, essai: true, raison: null };
}

// (30/10, lot D) `demanderConditions` : la case OBLIGATOIRE des conditions d'utilisation du Cloud (App, modale) — rend
// vrai une fois l'acceptation ENREGISTRÉE en base (version + date). Sans elle, rien ne s'ouvre, aucune carte.
// (07/11 soir) `gererAbonnements` : la feuille d'abonnements native (NativePurchases.manageSubscriptions — iOS :
// AppStore.showManageSubscriptions) ; `journal(evenement, metadata)` : la trace usage_logs du geste d'arrêt (le
// 07/11, « Arrêter » ne laissait aucune ligne nulle part).
export function creerAchatCloud({ supabase, supabaseUrl, supabaseAnonKey, user, lang, platform, purchasePremium, ouvrirLien, confirmer, notifier, paiementsAndroidCoupes, demanderConditions, gererAbonnements, journal }) {
  // (08/11, refus Google) Les textes relus à CHAQUE usage : le prix de la boutique arrive après la création.
  const T = new Proxy({}, { get: (_, k) => textesConnexion(lang)[k] });

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

  /** On attend que le SERVEUR porte l'option (essai ou payée) : cloud_etat_moi(),
   *  la même règle que cloudDuProfil — jamais une lecture de colonnes ici. */
  async function attendreServeur(essais = 11, delaiMs = 2000) {
    for (let i = 0; i < essais; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, delaiMs));
      const { data } = await supabase.rpc('cloud_etat_moi');
      if (data?.actif === true) return true;
    }
    return false;
  }

  async function stripe(origine) {
    const tk = await jeton();
    if (!tk) return { etat: 'erreur', message: T.achatEchec };
    const appel = () => fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}`, apikey: supabaseAnonKey },
      body: JSON.stringify({ product: 'cloud', email: user.email, lang }),
    }).then((r) => r.json().catch(() => ({})));
    let d = await appel();
    // La place a expiré entre-temps (plus d'une heure) : on la reprend, une fois.
    if (d?.error === 'preparation_requise') {
      const p = lirePreparation(await preparer(), lang);
      if (!p.continuer) return p.attente ? proposerAttente(p) : { etat: 'refuse', message: p.message };
      d = await appel();
    }
    if (d?.already_cloud) return { etat: 'deja', message: T.dejaClient };
    // (13/11/2026, point a de Nico) Le Cloud seul à côté d'une formule serait un second abonnement : la phrase du serveur
    // (où faire le changement), jamais « l'achat a échoué ».
    if (d?.error === 'un_seul_abonnement') return { etat: 'refuse', raison: 'un_seul_abonnement', message: (lang === 'en' ? d.message_en : d.message_fr) || T.achatEchec };
    if (d?.error === 'conditions_a_accepter') return { etat: 'refuse', message: T.achatEchec };
    if (!d?.url) return { etat: 'erreur', message: T.achatEchec };
    try { localStorage.setItem('fs_checkout_ctx', JSON.stringify({ canal: 'stripe', tier: 'cloud', origine, at: Date.now() })); } catch { /* mode privé */ }
    window.location.href = d.url;
    return { etat: 'redirige' };
  }

  async function boutique(essaiPermis, { boutiqueSansEssai = false } = {}) {
    if (platform === 'android' && paiementsAndroidCoupes && await paiementsAndroidCoupes()) {
      return { etat: 'erreur', message: T.achatEchec };
    }
    if (!essaiPermis && !boutiqueSansEssai) notifier?.(T.sansEssaiStore);
    const r = await purchasePremium(PRODUIT_CLOUD, user.id);
    if (r?.cancelled) return { etat: 'annule' };
    if (r?.enAttente) return { etat: 'attente', message: T.achatApprobation };
    if (platform === 'android') {
      if (!r?.purchaseToken) return { etat: 'erreur', message: T.achatEchec };
      const { error } = await supabase.functions.invoke('validate-google-purchase', { body: { productId: PRODUIT_CLOUD, purchaseToken: r.purchaseToken, userId: user.id } });
      if (error) return { etat: 'erreur', message: T.achatEchec };
    }
    const ok = await attendreServeur();
    return ok ? { etat: 'actif', message: T.achatOk } : { etat: 'attente', message: essaiPermis ? T.essaiAttente : T.achatAttente };
  }

  /** (03/11, point 5) L'inscription à la liste d'attente (« Être prévenu(e) »). Rend le message à montrer. */
  async function inscrireAttente() {
    const { data, error } = await supabase.rpc('cloud_attente_inscrire_moi');
    if (error || data?.ok !== true) {
      return data?.raison === 'deja_client' ? { etat: 'deja', message: T.dejaClient } : { etat: 'erreur', message: T.inscriptionEchec };
    }
    return { etat: 'attente', message: T.inscritAttente(data?.attente?.rang ?? null), attente: data?.attente ?? null };
  }

  /** Pas de place : la vente ne s'ouvre pas ; la personne choisit d'être prévenue (une notification, jamais un mail). */
  async function proposerAttente(p) {
    if (typeof confirmer !== 'function' || !(await confirmer(T.etrePrevenuQuestion))) {
      return { etat: 'refuse', raison: p.raison, message: p.message };
    }
    return inscrireAttente();
  }

  /** Prendre l'option (seule sur Free, ou en plus d'une formule). */
  async function acheter(origine = 'non_precisee') {
    // (08/11, refus Google Play de la vc36) iPhone / Android : jamais d'achat tant que le prix de la BOUTIQUE n'est pas
    // affiché (lib/prixBoutique.js) — la monnaie de l'écran est celle de la feuille de paiement.
    if (platform !== 'web' && !prixPret('cloud')) return { etat: 'refuse', raison: 'prix_boutique_absent', message: T.prixBoutiqueAbsent };
    // (13/11/2026) La garde AVANT les conditions et la feuille de la boutique. (Dernière réponse de Nico du 13/11) Elle ne
    // refuse le Cloud seul que s'il y a DÉJÀ le Cloud (Cloud seul, ou une formule avec Cloud) : à côté d'une formule, sur tout
    // canal, il passe (c7c382b7, f0acd3af : clients normaux). Verrou : selftest:cloud-en-plus-de-formule.
    if (platform === 'ios' || platform === 'android') {
      const garde = await gardeAchatBoutique({ supabase, userId: user.id, canal: platform === 'ios' ? 'apple' : 'google', achat: 'cloud_seul', lang });
      if (!garde.permis) return { etat: garde.motif === 'deja' ? 'deja' : 'refuse', raison: 'un_seul_abonnement', message: garde.message ?? T.achatEchec };
    }
    // 0. Les conditions d'utilisation : acceptées (case cochée, enregistrée) AVANT la place, avant toute carte.
    if (typeof demanderConditions !== 'function' || !(await demanderConditions())) return { etat: 'annule' };
    notifier?.(T.preparation);
    const p = lirePreparation(await preparer(), lang);
    // (03/11, point 5) Sans place serveur ni IP : ni Stripe, ni la feuille d'achat de l'App Store / Google Play.
    if (!p.continuer) {
      if (p.attente) return proposerAttente(p);
      if (p.inscrit) return { etat: 'attente', raison: p.raison, message: T.inscritAttente(null) };
      return { etat: 'refuse', raison: p.raison, message: p.message };
    }
    // (08/11) Mobile : l'essai n'est promis que si la boutique offre une semaine gratuite à CE compte — sinon la
    // personne le sait AVANT la feuille de paiement (prix de la boutique).
    let essai = p.essai;
    let confirmation = p.confirmation;
    let boutiqueSansEssai = false;
    // (13/11, point b de Nico) La semaine de la boutique est LUE : 'non' → « prélevés aujourd'hui » ; 'inconnu' (iPhone,
    // historique Apple illisible) → les deux issues ; essai FillSell refusé mais semaine offerte → la semaine sans Cloud
    // (décision 8 : il démarre au premier paiement) dite AVANT la feuille, plus après (sansEssaiStore).
    const semaine = platform !== 'web' ? etatEssaiBoutique('cloud') : 'oui';
    if (platform !== 'web' && essai !== false && semaine !== 'oui') {
      essai = false; boutiqueSansEssai = true;
      confirmation = semaine === 'inconnu' ? T.essaiIncertain : T.sansEssai('boutique_sans_essai');
    } else if (platform !== 'web' && essai === false && semaine !== 'non') {
      boutiqueSansEssai = true;
      confirmation = semaine === 'oui' ? T.semaineSansDroits(platform === 'ios' ? 'App Store' : 'Google Play') : T.semaineIncertaine;
    } else if (platform !== 'web' && essai === false) {
      boutiqueSansEssai = true;   // 'non' : la boutique ne montrera pas de semaine — le toast « si elle l'affiche » n'a plus lieu d'être
    }
    if (essai === false && !(await confirmer(confirmation))) return { etat: 'annule' };
    try {
      return platform === 'web' ? await stripe(origine) : await boutique(essai, { boutiqueSansEssai });
    } catch (e) {
      console.warn('[cloud] achat de l’option :', e?.message ?? e);
      return { etat: 'erreur', message: T.achatEchec };
    }
  }

  const tracer = (evenement, metadata) => { try { journal?.(evenement, metadata); } catch { /* trace seule */ } };

  /** Le canal qui facture le Cloud, relu en base au moment du geste (null = illisible). */
  async function canalDuCompte() {
    try {
      const { data, error } = await supabase.from('profiles').select('cloud_canal').eq('id', user.id).maybeSingle();
      return error ? null : (data?.cloud_canal ?? null);
    } catch {
      return null;
    }
  }

  /**
   * Ouvre les abonnements de la boutique. Rend vrai si quelque chose s'est ouvert (rien pour 'apple_ailleurs') ; LÈVE si
   * rien n'a pu s'ouvrir (l'écran dit alors le chemin exact et propose de réessayer — jamais muet).
   * (08/11, ordre de Nico) iPhone / iPad : la feuille « Abonnements » du SYSTÈME (StoreKit, AppStore.showManageSubscriptions),
   * la seule qui montre aussi un abonnement pris en TestFlight — plus de repli silencieux vers une page web. Android :
   * la page d'abonnements du Play Store pour l'app (intention native du module), puis le lien Play du produit Cloud.
   */
  async function ouvrirAbonnementsBoutique(voie) {
    if (voie === 'apple') {
      if (typeof gererAbonnements !== 'function') throw new Error('feuille_abonnements_absente');
      await gererAbonnements();
      return true;
    }
    if (voie === 'google') {
      if (platform === 'android' && typeof gererAbonnements === 'function') {
        try { await gererAbonnements(); return true; } catch (e) { console.warn('[cloud] abonnements Google Play (module) :', e?.message ?? e); }
      }
      await ouvrirLien(LIEN_GOOGLE);
      return true;
    }
    return false;
  }

  async function appelerArret(corps) {
    const tk = await jeton();
    if (!tk) return { etat: 'erreur', message: T.arretEchec };
    const r = await fetch(`${supabaseUrl}/functions/v1/cancel-subscription`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}`, apikey: supabaseAnonKey },
      body: JSON.stringify(corps),
    });
    const d = await r.json().catch(() => ({}));
    const lu = lireReponseArret(d, { reprendre: corps?.reprendre === true, platform }, lang);
    if (lu.etat === 'boutique') {
      try { await ouvrirAbonnementsBoutique(lu.voie); } catch { return { etat: 'erreur', voie: lu.voie, message: T.arretBoutiqueEchec(lu.voie) }; }
    }
    return lu;
  }

  /** Arrêter (reprendre = false) ou garder (reprendre = true) le Cloud, par la voie de son canal. */
  async function geste({ canal, reprendre = false } = {}) {
    const c = CANAUX.has(canal) ? canal : await canalDuCompte();
    const voie = voieArretCloud(c, platform);
    const nom = reprendre ? 'cloud_reprise' : 'cloud_arret';
    tracer(`${nom}_clic`, { canal: c ?? null, voie, platform });
    let r;
    try {
      if (voieBoutique(voie)) {
        try {
          const ouvert = await ouvrirAbonnementsBoutique(voie);
          r = { etat: 'boutique', voie, ouvert, message: reprendre ? T.repriseBoutique(voie) : T.arretBoutique(voie) };
        } catch (e) {
          console.warn('[cloud] abonnements de la boutique :', e?.message ?? e);
          r = { etat: 'erreur', voie, message: T.arretBoutiqueEchec(voie) };
        }
      } else {
        r = await appelerArret(reprendre ? { option: 'cloud', reprendre: true } : { option: 'cloud' });
      }
    } catch (e) {
      console.warn(`[cloud] ${reprendre ? 'reprise' : 'arrêt'} de l’option :`, e?.message ?? e);
      r = { etat: 'erreur', message: T.arretEchec };
    }
    tracer(`${nom}_issue`, { canal: c ?? null, voie: r?.voie ?? voie, etat: r?.etat ?? null });
    return r;
  }

  /**
   * (07/11, Nico) « Restaurer les achats » : l'option retrouvée dans la boutique (prise SEULE, Free + Cloud, ou avec
   * une formule) est revalidée par le SERVEUR, jamais crue sur parole — iOS : le reçu, avec `option: 'cloud'` (la
   * formule du profil n'est jamais touchée ; inutile quand la formule vient d'être validée par le même reçu, qui
   * porte l'option) ; Android : son jeton Google (validate-google-purchase ne touche que l'option pour ce produit).
   * Puis cloud_etat_moi fait foi. `cloud` : ce que lireRestauration (src/lib/restauration.js) a lu.
   */
  async function restaurer(cloud, { recuDejaValide = false } = {}) {
    if (!cloud?.actif) return { etat: 'aucun' };
    try {
      if (platform === 'ios') {
        if (!recuDejaValide) {
          if (!cloud.receipt) return { etat: 'erreur', message: T.restaureEchec };
          const { data, error } = await supabase.functions.invoke('validate-apple-receipt', {
            body: { receipt: cloud.receipt, userId: user.id, option: 'cloud' } });
          if (error || data?.success !== true) return { etat: 'erreur', message: T.restaureEchec };
        }
      } else if (platform === 'android') {
        if (!cloud.purchaseToken) return { etat: 'erreur', message: T.restaureEchec };
        const { error } = await supabase.functions.invoke('validate-google-purchase', {
          body: { productId: cloud.productId || PRODUIT_CLOUD, purchaseToken: cloud.purchaseToken, userId: user.id } });
        if (error) return { etat: 'erreur', message: T.restaureEchec };
      } else {
        return { etat: 'aucun' };
      }
      const ok = await attendreServeur(6, 1500);
      return ok ? { etat: 'actif', message: T.restaureOk } : { etat: 'attente', message: T.restaureAttente };
    } catch (e) {
      console.warn('[cloud] restauration de l’option :', e?.message ?? e);
      return { etat: 'erreur', message: T.restaureEchec };
    }
  }

  return {
    acheter,
    inscrireAttente,
    restaurer,
    /** Arrêter. Stripe : en essai tout de suite (rien facturé), payée à la fin de la période. Apple / Google : la
     *  boutique s'ouvre, et c'est elle qui arrête (notre état suit son webhook). `{ canal }` : profiles.cloud_canal lu
     *  par l'écran ; absent ou inconnu → relu en base au moment du geste. */
    arreter: ({ canal } = {}) => geste({ canal }),
    /** Garder l'option alors qu'un arrêt était prévu (Stripe : levé par le serveur ; boutique : chez elle). */
    reprendre: ({ canal } = {}) => geste({ canal, reprendre: true }),
  };
}
