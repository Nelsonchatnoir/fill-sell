// L'ACHAT ET L'ARRÊT DE L'OPTION « SANS ORDINATEUR » (05/10) — côté app.
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
import { textesConnexion } from './textesConnexion';

export const PRODUIT_CLOUD = 'app.fillsell.cloud.sub';   // même identifiant Apple et Google
const LIEN_APPLE = 'https://apps.apple.com/account/subscriptions';
const LIEN_GOOGLE = `https://play.google.com/store/account/subscriptions?sku=${PRODUIT_CLOUD}&package=app.fillsell.app`;
const CLE_APPAREIL = 'fs_appareil_cloud';

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
    return { continuer: false, raison, message: raison === 'pool_vide' ? T.poolVide : raison === 'deja_client' ? T.dejaClient : T.achatEchec };
  }
  if (r.essai === false) return { continuer: true, essai: false, raison: r.raison, confirmation: T.sansEssai(r.raison) };
  return { continuer: true, essai: true, raison: null };
}

export function creerAchatCloud({ supabase, supabaseUrl, supabaseAnonKey, user, lang, platform, purchasePremium, ouvrirLien, confirmer, notifier, paiementsAndroidCoupes }) {
  const T = textesConnexion(lang);

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
      if (!p.continuer) return { etat: 'refuse', message: p.message };
      d = await appel();
    }
    if (d?.already_cloud) return { etat: 'deja', message: T.dejaClient };
    if (!d?.url) return { etat: 'erreur', message: T.achatEchec };
    try { localStorage.setItem('fs_checkout_ctx', JSON.stringify({ canal: 'stripe', tier: 'cloud', origine, at: Date.now() })); } catch { /* mode privé */ }
    window.location.href = d.url;
    return { etat: 'redirige' };
  }

  async function boutique(essaiPermis) {
    if (platform === 'android' && paiementsAndroidCoupes && await paiementsAndroidCoupes()) {
      return { etat: 'erreur', message: T.achatEchec };
    }
    if (!essaiPermis) notifier?.(T.sansEssaiStore);
    const r = await purchasePremium(PRODUIT_CLOUD, user.id);
    if (r?.cancelled) return { etat: 'annule' };
    if (platform === 'android') {
      if (!r?.purchaseToken) return { etat: 'erreur', message: T.achatEchec };
      const { error } = await supabase.functions.invoke('validate-google-purchase', { body: { productId: PRODUIT_CLOUD, purchaseToken: r.purchaseToken, userId: user.id } });
      if (error) return { etat: 'erreur', message: T.achatEchec };
    }
    const ok = await attendreServeur();
    return ok ? { etat: 'actif', message: T.achatOk } : { etat: 'attente', message: T.achatAttente };
  }

  /** Prendre l'option (seule sur Free, ou en plus d'une formule). */
  async function acheter(origine = 'non_precisee') {
    notifier?.(T.preparation);
    const p = lirePreparation(await preparer(), lang);
    if (!p.continuer) return { etat: 'refuse', raison: p.raison, message: p.message };
    if (p.essai === false && !(await confirmer(p.confirmation))) return { etat: 'annule' };
    try {
      return platform === 'web' ? await stripe(origine) : await boutique(p.essai);
    } catch (e) {
      console.warn('[cloud] achat de l’option :', e?.message ?? e);
      return { etat: 'erreur', message: T.achatEchec };
    }
  }

  async function appelerArret(corps) {
    const tk = await jeton();
    if (!tk) return { etat: 'erreur', message: T.arretEchec };
    const r = await fetch(`${supabaseUrl}/functions/v1/cancel-subscription`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}`, apikey: supabaseAnonKey },
      body: JSON.stringify(corps),
    });
    const d = await r.json().catch(() => ({}));
    if (d?.error === 'resilier_dans_la_boutique') {
      await ouvrirLien(d.canal === 'google' ? LIEN_GOOGLE : LIEN_APPLE);
      return { etat: 'boutique', message: T.arretBoutique };
    }
    return d?.success ? { etat: 'ok', ...d } : { etat: 'erreur', message: T.arretEchec };
  }

  return {
    acheter,
    /** Arrêter : en essai tout de suite (rien facturé), payée à la fin de la période. */
    arreter: () => appelerArret({ option: 'cloud' }),
    /** Garder l'option alors qu'un arrêt était prévu (Stripe). */
    reprendre: () => appelerArret({ option: 'cloud', reprendre: true }),
  };
}
