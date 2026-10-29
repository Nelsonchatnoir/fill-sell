// ═══════════════════════════════════════════════════════════════════════════
// PLUS JAMAIS D'ÉCHEC INVISIBLE CÔTÉ SERVEUR (25/10/2026, Nico — Jocabroc)
// ═══════════════════════════════════════════════════════════════════════════
// Nico, 25/10 : « l'app (web et mobile) doit signaler elle-même au serveur CHAQUE action ratée (bouton qui
// échoue, requête refusée, session expirée), avec la version de l'app et le motif. Plus jamais d'échec invisible
// côté serveur. » Cas fondateur : Jocabroc (app web, Chrome) cliquait « Publier » sur ses fiches importées de
// Vinted depuis le 24/10 : l'app demandait la lecture de l'annonce d'origine puis s'arrêtait sans rien ouvrir —
// aucune ligne en base ; seule la suite de ses requêtes (edge_logs) le montrait.
// UNE ligne `usage_logs` par échec : feature `action_app_ratee`, metadata { action, motif, build, plateforme,
// … détails courts }. Lue par ops-digest (« actions app en échec », « actions qui s'arrêtent net »).
// Bornée : la même action et le même motif une fois par 2 min et par onglet, 40 lignes par heure au plus. Sans
// session (session expirée), l'échec attend dans le navigateur et part à la prochaine session (`viderEnAttente`).
// Jamais bloquant : une écriture ratée ne lève rien, ne relance rien.
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { contexteLangue } from './domTraduit.js';

export const FEATURE_ACTION_RATEE = 'action_app_ratee';
const BUILD = typeof __FILLSELL_APP_BUILD__ !== 'undefined' ? __FILLSELL_APP_BUILD__ : null;
const ECART_MEME_MOTIF_MS = 2 * 60_000;
const PAR_HEURE_MAX = 40;
const CLE_ATTENTE = 'fs_actions_ratees_en_attente';
const ATTENTE_MAX = 20;

const derniers = new Map(); // `${action}|${motif}` → ms
let fenetre = { debut: 0, n: 0 };

/** La plateforme de l'app qui tourne : ios, android ou web. */
export function plateformeApp() {
  try {
    if (Capacitor.isNativePlatform()) return Capacitor.getPlatform();
  } catch { /* web */ }
  return 'web';
}

const court = (v, n = 300) => (v == null ? null : String(v).slice(0, n));

/**
 * La ligne à écrire (pure, testée) — null si la borne la refuse.
 * @param {{ action: string, motif?: string|null, details?: Record<string, unknown>|null }} e
 * @param {{ maintenant?: number, build?: string|null, plateforme?: string }} [o]
 */
export function ligneActionRatee({ action, motif = null, details = null }, { maintenant = Date.now(), build = BUILD, plateforme = plateformeApp() } = {}) {
  const a = court(action, 80);
  if (!a) return null;
  const m = court(motif, 120) ?? 'inconnu';
  const cle = `${a}|${m}`;
  const avant = derniers.get(cle) ?? 0;
  if (maintenant - avant < ECART_MEME_MOTIF_MS) return null;
  if (maintenant - fenetre.debut > 3_600_000) fenetre = { debut: maintenant, n: 0 };
  if (fenetre.n >= PAR_HEURE_MAX) return null;
  derniers.set(cle, maintenant);
  fenetre.n += 1;
  const d = {};
  for (const [k, v] of Object.entries(details && typeof details === 'object' ? details : {})) {
    if (v == null) continue;
    d[k] = typeof v === 'object' ? court(JSON.stringify(v), 300) : (typeof v === 'string' ? court(v) : v);
  }
  let page = null;
  try { page = typeof location !== 'undefined' ? location.pathname : null; } catch { page = null; }
  return { action: a, motif: m, build, plateforme, page, le: new Date(maintenant).toISOString(), ...d };
}

function mettreEnAttente(metadata) {
  try {
    const liste = JSON.parse(localStorage.getItem(CLE_ATTENTE) || '[]');
    liste.push(metadata);
    localStorage.setItem(CLE_ATTENTE, JSON.stringify(liste.slice(-ATTENTE_MAX)));
  } catch { /* stockage indisponible : rien de plus à faire */ }
}

/** Les échecs gardés sans session partent dès qu'une session existe (appelé au chargement des données). */
export async function viderEnAttente(userId) {
  if (!userId) return;
  let liste = [];
  try { liste = JSON.parse(localStorage.getItem(CLE_ATTENTE) || '[]'); } catch { liste = []; }
  if (!Array.isArray(liste) || !liste.length) return;
  try { localStorage.removeItem(CLE_ATTENTE); } catch { /* rien */ }
  try {
    await supabase.from('usage_logs').insert(liste.slice(-ATTENTE_MAX).map((metadata) => ({
      user_id: userId, feature: FEATURE_ACTION_RATEE, metadata: { ...metadata, differe: true },
    })));
  } catch { /* rien : un échec de journal n'en crée pas d'autre */ }
}

/**
 * Signale une action ratée. Ne lève jamais, ne bloque jamais (sans `await` chez l'appelant).
 * @param {{ action: string, motif?: string|null, details?: Record<string, unknown>|null, userId?: string|null }} e
 */
export async function signalerActionRatee({ action, motif = null, details = null, userId = null } = {}) {
  const metadata = ligneActionRatee({ action, motif, details });
  if (!metadata) return false;
  try {
    let uid = userId;
    if (!uid) {
      const { data } = await supabase.auth.getSession();
      uid = data?.session?.user?.id ?? null;
    }
    if (!uid) { mettreEnAttente({ ...metadata, sans_session: true }); return false; }
    const { error } = await supabase.from('usage_logs').insert({ user_id: uid, feature: FEATURE_ACTION_RATEE, metadata });
    if (error) { mettreEnAttente({ ...metadata, refus: court(error.message, 160) }); return false; }
    return true;
  } catch (e) {
    mettreEnAttente({ ...metadata, refus: court(e?.message ?? e, 160) });
    return false;
  }
}

/**
 * Les exceptions JS non rattrapées et les promesses rejetées : un échec qui ne se voyait nulle part. Une fois par
 * onglet ; bornées comme le reste (même message : une fois par 2 min).
 */
let ecouteInstallee = false;
let exceptionsSignalees = 0;
const EXCEPTIONS_PAR_ONGLET_MAX = 5;
export function ecouterEchecsNonRattrapes() {
  if (ecouteInstallee || typeof window === 'undefined') return;
  ecouteInstallee = true;
  const motifDe = (x) => court(x?.message ?? x?.reason?.message ?? x?.reason ?? x, 120);
  // Les scripts tiers (mesure d'audience) lèvent aussi : 5 lignes par onglet au plus, jamais un flot.
  const signaler = (action, motif, details = null) => {
    if (exceptionsSignalees >= EXCEPTIONS_PAR_ONGLET_MAX) return;
    exceptionsSignalees += 1;
    signalerActionRatee({ action, motif, details });
  };
  // (29/10, point 10 — mele.marta) Le motif seul (120 caractères) ne disait ni l'écran ni la cause : la pile JS, la
  // pile des COMPOSANTS (posée par main.jsx, onUncaughtError) et la langue (page traduite par le navigateur ?).
  const pileComposants = () => {
    try { const p = window.__fillsellPileComposants ?? null; window.__fillsellPileComposants = null; return p; } catch { return null; }
  };
  window.addEventListener('error', (ev) => {
    // Une ressource qui ne charge pas (image, script tiers) n'est pas une action ratée.
    if (!ev?.error && !ev?.message) return;
    signaler('exception_js', motifDe(ev.error ?? ev), {
      source: court(ev.filename, 160), ligne: ev.lineno ?? null, colonne: ev.colno ?? null,
      pile: court(ev.error?.stack, 300), composants: court(pileComposants(), 300), ...contexteLangue(),
    });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    signaler('promesse_rejetee', motifDe(ev?.reason), { pile: court(ev?.reason?.stack, 300), ...contexteLangue() });
  });
}

/** Pour les selftests : remet les bornes à zéro. */
export function _remettreBornes() { derniers.clear(); fenetre = { debut: 0, n: 0 }; }
