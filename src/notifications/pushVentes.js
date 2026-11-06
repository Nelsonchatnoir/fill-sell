// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS PUSH À CHAQUE VENTE — côté app (06/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Le serveur note chaque vente vue (push_ventes) et envoie aux téléphones
// enregistrés ici (appareils_push). Ce module : la disponibilité, la
// permission, le jeton, l'appui sur une notification.
//
// ⛔ CE CODE PART AUSSI PAR OTA SUR DES BINAIRES SANS LE MODULE NATIF
//    (@capacitor/push-notifications n'existe qu'à partir du binaire 2.9.62).
//    Règle absolue : TOUT passe d'abord par pushDisponible() — natif ET plugin
//    déclaré par le binaire (Capacitor.isPluginAvailable). Sinon : on ne fait
//    rien, aucune erreur, aucun écran, aucun interrupteur. Le module JS du
//    plugin n'est chargé (import dynamique) qu'APRÈS cette vérification ; rien
//    n'est importé au démarrage. Preuve : scripts/push-plugin-absent-selftest.mjs.
//
// Aucune relecture en boucle (règle du 04/10) : le jeton s'enregistre à la
// connexion et à l'ouverture de l'app, c'est tout.
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { langueDeLApp } from '../utils/langueApp';

const NOM_PLUGIN = 'PushNotifications';
const CLE_JETON = 'fillsell:push:jeton';
const CLE_COUPE = 'fillsell:push:coupe';        // '1' = coupé dans Réglages (cet appareil)
const CLE_PROPOSE = 'fillsell:push:propose_le'; // dernière proposition (ms)
// '1' = la personne a dit oui chez NOUS (proposition ou Réglages). Android ≤ 12
// accorde les notifications d'office : sans ce drapeau, on enregistrerait le
// téléphone dès le premier lancement, sans l'écran qui explique.
const CLE_ACCEPTE = 'fillsell:push:accepte';
export const RELANCE_PROPOSITION_MS = 3 * 24 * 3600 * 1000;

const lire = (cle) => { try { return globalThis.localStorage?.getItem(cle) ?? null; } catch { return null; } };
const ecrire = (cle, v) => {
  try { if (v == null || v === '') globalThis.localStorage?.removeItem(cle); else globalThis.localStorage?.setItem(cle, String(v)); } catch { /* stockage indisponible */ }
};

/** Natif ET module présent dans le binaire. Jamais d'exception. */
export function pushDisponible() {
  try {
    return Capacitor.isNativePlatform() === true && Capacitor.isPluginAvailable(NOM_PLUGIN) === true;
  } catch {
    return false;
  }
}

// ⛔ (06/11) Le module natif voyage dans une BOÎTE ({ p }), jamais nu à travers une promesse : un plugin Capacitor est
// un Proxy qui répond à TOUTE propriété, `then` compris (@capacitor/core, registerPlugin). Rendu par un `.then` ou un
// `async`, il est pris pour une promesse : `p.then(resolve, reject)` part vers le natif (« then() is not implemented »)
// et ni resolve ni reject n'est jamais appelé — `await plugin()` ne rendait JAMAIS la main sur un vrai téléphone, et
// aucun jeton n'aurait été enregistré (scripts/push-plugin-proxy-selftest.mjs le prouve avec le vrai @capacitor/core).
let promessePlugin = null;
function boitePlugin() {
  if (!pushDisponible()) return Promise.resolve(null);
  promessePlugin ??= import('@capacitor/push-notifications')
    .then((m) => (m.PushNotifications ? { p: m.PushNotifications } : null))
    .catch(() => null);
  return promessePlugin;
}
/** Le module natif, ou null. À lire tel quel (`const p = await plugin()`) : la boîte est ouverte ici, hors promesse. */
async function plugin() {
  const boite = await boitePlugin();
  return boite ? new PluginPush(boite.p) : null;
}
// Une façade NON « thenable » : elle ne transmet que les méthodes dont l'app se sert (aucune propriété `then`).
class PluginPush {
  constructor(p) { this.natif = p; }
  checkPermissions() { return this.natif.checkPermissions(); }
  requestPermissions() { return this.natif.requestPermissions(); }
  register() { return this.natif.register(); }
  unregister() { return this.natif.unregister(); }
  addListener(nom, fn) { return this.natif.addListener(nom, fn); }
  removeAllListeners() { return this.natif.removeAllListeners(); }
  createChannel(c) { return this.natif.createChannel(c); }
  deleteChannel(c) { return this.natif.deleteChannel(c); }
  listChannels() { return this.natif.listChannels(); }
  getDeliveredNotifications() { return this.natif.getDeliveredNotifications(); }
  removeAllDeliveredNotifications() { return this.natif.removeAllDeliveredNotifications(); }
}

/** 'granted' | 'denied' | 'prompt' | 'indisponible' */
export async function etatPermission() {
  const p = await plugin();
  if (!p) return 'indisponible';
  try {
    const r = await p.checkPermissions();
    const etat = r?.receive;
    if (etat === 'granted' || etat === 'denied') return etat;
    return 'prompt';
  } catch {
    return 'indisponible';
  }
}

export const estCoupe = () => lire(CLE_COUPE) === '1';
export const aAccepte = () => lire(CLE_ACCEPTE) === '1';

// ── L'appui sur une notification ────────────────────────────────────────────
// Le module garde l'appui jusqu'à ce que l'app sache l'ouvrir (démarrage à
// froid : la liste des articles n'est pas encore chargée).
let surOuvrir = null;
let ouvertureEnAttente = null;
export function surOuverturePush(fn) {
  surOuvrir = fn;
  if (fn && ouvertureEnAttente) { const d = ouvertureEnAttente; ouvertureEnAttente = null; fn(d); }
}
// (25/10) « Vente annulée — Remettre en vente ? » (type vente_annulee) : l'appui mène à l'écran « Ventes annulées ».
const TYPES_OUVERTS = new Set(['vente', 'vente_annulee']);
function ouvrir(donnees) {
  if (!donnees || !TYPES_OUVERTS.has(donnees.type)) return;
  if (surOuvrir) surOuvrir(donnees); else ouvertureEnAttente = donnees;
}

// ── Le canal Android « Ventes » ─────────────────────────────────────────────
// (06/11, lot « Ouverture du Cloud », phase 3 — décision de Nico) Le nom du canal (et sa description), que la
// personne lit dans les réglages de notifications d'Android, suit la langue de l'app : « Ventes » mot pour mot en
// français, « Sales » en anglais. Android garde le nom donné à la création, mais un nouvel appel createChannel avec
// le MÊME id le renomme. L'id ('ventes', visé par le serveur : android.notification.channel_id) et l'importance ne
// changent JAMAIS — seuls le nom et la description suivent la langue.
export const CANAL_VENTES_ID = 'ventes';
const NOMS_CANAL_VENTES = {
  fr: { name: 'Ventes', description: 'Une notification à chaque vente' },
  en: { name: 'Sales', description: 'A notification for each sale' },
};
/** Le canal tel qu'il est passé à createChannel (pur : lu par le selftest). */
export function canalVentes(lang = 'fr') {
  const n = NOMS_CANAL_VENTES[lang === 'en' ? 'en' : 'fr'];
  return {
    id: CANAL_VENTES_ID, name: n.name, description: n.description,
    importance: 4, visibility: 1, sound: 'default', vibration: true,
  };
}
let canalNommeEn = null; // la langue du dernier nom posé dans cette session
/**
 * Crée le canal, ou le renomme quand la langue de l'app change (Réglages › Préférences). Android seulement, module
 * natif présent seulement (pushDisponible) ; un même nom n'est pas reposé deux fois dans une session. Jamais
 * d'exception.
 */
export async function nommerCanalVentes(lang) {
  const l = lang === 'en' ? 'en' : 'fr';
  if (canalNommeEn === l) return true;
  let estAndroid = false;
  try { estAndroid = Capacitor.getPlatform() === 'android'; } catch { estAndroid = false; }
  if (!estAndroid) return false;
  const p = await plugin();
  if (!p) return false;
  try {
    await p.createChannel(canalVentes(l));
    canalNommeEn = l;
    return true;
  } catch {
    return false;
  }
}

// ── Le jeton ────────────────────────────────────────────────────────────────
let ecoutes = false;
let contexte = { versionApp: null };

async function enregistrerJeton(jeton) {
  if (!jeton || estCoupe()) return;
  const plateforme = Capacitor.getPlatform();
  if (plateforme !== 'ios' && plateforme !== 'android') return;
  const { error } = await supabase.rpc('push_enregistrer_appareil', {
    p_jeton: jeton, p_plateforme: plateforme, p_version: contexte.versionApp,
  });
  if (error) { console.warn('[push] enregistrement du jeton :', error.message); return; }
  ecrire(CLE_JETON, jeton);
}

async function brancherEcoutes(p) {
  if (ecoutes) return;
  ecoutes = true;
  try {
    await p.addListener('registration', (t) => { enregistrerJeton(t?.value).catch(() => {}); });
    await p.addListener('registrationError', (e) => { console.warn('[push] jeton refusé par le système :', e?.error ?? e); });
    await p.addListener('pushNotificationActionPerformed', (a) => { ouvrir(a?.notification?.data ?? null); });
    if (Capacitor.getPlatform() === 'android') {
      // Le canal que vise le serveur (android.notification.channel_id), nommé dans la langue de l'app.
      await nommerCanalVentes(langueDeLApp());
    }
  } catch (e) {
    ecoutes = false;
    console.warn('[push] écoutes :', e?.message ?? e);
  }
}

/**
 * À la connexion et à chaque ouverture : écoute l'appui, et — si la personne
 * a déjà dit oui et n'a pas coupé — (ré)enregistre le jeton. Ne demande
 * JAMAIS la permission (c'est proposerPush, au bon moment).
 */
export async function initialiserPush({ versionApp } = {}) {
  const p = await plugin();
  if (!p) return { etat: 'indisponible' };
  contexte = { versionApp: versionApp ?? null };
  await brancherEcoutes(p);
  const etat = await etatPermission();
  if (etat === 'granted' && !estCoupe() && aAccepte()) {
    try { await p.register(); } catch (e) { console.warn('[push] register :', e?.message ?? e); }
  }
  return { etat };
}

/** Le « Activer » de la proposition ou de Réglages : permission puis jeton. */
export async function activerPush({ versionApp } = {}) {
  const p = await plugin();
  if (!p) return 'indisponible';
  contexte = { versionApp: versionApp ?? contexte.versionApp };
  await brancherEcoutes(p);
  let etat;
  try {
    const r = await p.requestPermissions();
    etat = r?.receive === 'granted' ? 'granted' : r?.receive === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'indisponible';
  }
  if (etat !== 'granted') return etat;
  ecrire(CLE_COUPE, '');
  ecrire(CLE_ACCEPTE, '1');
  try { await p.register(); } catch (e) { console.warn('[push] register :', e?.message ?? e); }
  return 'granted';
}

/** L'interrupteur de Réglages, sur « couper » : plus rien sur CET appareil. */
export async function couperPush() {
  ecrire(CLE_COUPE, '1');
  const jeton = lire(CLE_JETON);
  if (jeton) {
    const { error } = await supabase.rpc('push_oublier_appareil', { p_jeton: jeton });
    if (!error) ecrire(CLE_JETON, '');
  }
  const p = await plugin();
  try { await p?.unregister(); } catch { /* le serveur a déjà oublié l'appareil */ }
}

/**
 * Avant la déconnexion : cet appareil ne reçoit plus les ventes de ce compte.
 * Borné (2,5 s) : une déconnexion ne doit jamais attendre le réseau.
 */
export async function oublierAvantDeconnexion() {
  const jeton = lire(CLE_JETON);
  if (!jeton || !pushDisponible()) return;
  try {
    await Promise.race([
      supabase.rpc('push_oublier_appareil', { p_jeton: jeton }),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* la suppression du compte ou le prochain compte reprendront le jeton */ }
  ecrire(CLE_JETON, '');
}

/** Après la suppression du compte (les jetons partent avec lui en base). */
export function oublierLocalement() { ecrire(CLE_JETON, ''); ecrire(CLE_PROPOSE, ''); ecrire(CLE_ACCEPTE, ''); }

// ── Le bon moment pour proposer ─────────────────────────────────────────────
/**
 * Vrai si l'on peut montrer « Sois prévenu dès qu'un article se vend » :
 * module présent, pas encore accepté chez nous (permission « prompt », ou
 * accordée d'office par Android ≤ 12), pas coupé, pas déjà proposé ces 3
 * derniers jours, ET la personne a déjà une synchro réussie ou une vente
 * (jamais au premier lancement). Refusée au système : on ne propose plus
 * (Réglages dit comment la rouvrir).
 */
export async function doitProposer({ aSynchroOuVente }, maintenant = Date.now()) {
  if (!aSynchroOuVente || !pushDisponible() || estCoupe()) return false;
  const derniere = Number(lire(CLE_PROPOSE) ?? 0);
  if (derniere && maintenant - derniere < RELANCE_PROPOSITION_MS) return false;
  const etat = await etatPermission();
  return etat === 'prompt' || (etat === 'granted' && !aAccepte());
}

/** L'état de l'interrupteur de Réglages : null = pas d'interrupteur du tout. */
export async function etatInterrupteur() {
  if (!pushDisponible()) return null;
  const etat = await etatPermission();
  if (etat === 'indisponible') return null;
  return { actif: etat === 'granted' && aAccepte() && !estCoupe(), refuseParLeSysteme: etat === 'denied' };
}
export function noterProposition(maintenant = Date.now()) { ecrire(CLE_PROPOSE, maintenant); }
