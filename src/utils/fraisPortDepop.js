// ═══════════════════════════════════════════════════════════════════════════
// DEPOP — LES FRAIS DE PORT (09/10/2026 soir, Nico : « zéro friction »)
// ═══════════════════════════════════════════════════════════════════════════
// En France, Depop ne fournit AUCUNE étiquette : le vendeur fixe lui-même le
// prix de livraison que paie l'acheteur (obligatoire, strictement moins de
// 100 € — MAX_MANUAL_SHIPPING_PRICE du formulaire, relevé le 08/10) et
// expédie avec un envoi suivi.
//
// LE PRIX PAR DÉFAUT : saisi UNE fois dans les Réglages (ou au premier dépôt),
// gardé dans profiles.platform_settings.depop.frais_port_defaut — écrit par
// platform_settings_fusionner SEULEMENT (jamais l'objet entier : réglages
// écrasés du 02/10). Il pré-remplit le stepper et le lot ; get-pending-jobs
// le pose sur tout job Depop qui n'a pas de port (annonces importées
// comprises) — jamais par-dessus un port déjà dit.
//
// Le port accepté va de 0 à 99,99 € (le connecteur refuse 100 et plus ;
// que Depop accepte 0 € reste À VÉRIFIER — on ne le suppose pas, on ne
// l'interdit pas non plus).
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fusionnerReglages } from './reglagesPlateformes';
// UNE lecture du port, la même que le serveur (get-pending-jobs).
import { lirePortSaisi, portDepopValide, DEPOP_PORT_MAX } from '../../supabase/functions/_shared/port-depop.js';

export { lirePortSaisi, DEPOP_PORT_MAX };
export const CLE_REGLAGE_PORT_DEPOP = 'frais_port_defaut';

/** Le port valide d'une valeur quelconque (nombre ou saisie), ou null. */
export const portValide = portDepopValide;

/** 4.9 → « 4,90 » (fr) / « 4.90 » (en). */
export function formaterPort(v, lang = 'fr') {
  const n = portValide(v);
  if (n == null) return '';
  const s = n.toFixed(2);
  return lang === 'en' ? s : s.replace('.', ',');
}

/** Le message d'erreur d'une saisie, en clair (null = rien à dire). */
export function messageErreurPort(erreur, lang = 'fr') {
  const en = lang === 'en';
  if (erreur === 'vide') return en ? 'Enter the shipping price the buyer pays.' : 'Indique le prix de livraison que paie l’acheteur.';
  if (erreur === 'invalide') return en ? 'A price in euros, e.g. 4.90.' : 'Un prix en euros, par exemple 4,90.';
  if (erreur === 'trop_haut') return en ? 'Depop accepts less than €100.' : 'Depop accepte moins de 100 €.';
  return null;
}

/** Le port par défaut d'un objet platform_settings (ou null). */
export function portParDefautDesReglages(ps) {
  const d = ps && typeof ps === 'object' ? ps.depop : null;
  if (!d || typeof d !== 'object') return null;
  return portValide(d[CLE_REGLAGE_PORT_DEPOP]);
}

// ── LECTURE PARTAGÉE (une lecture par compte et par session de l'app) ──────
// Le stepper, le lot, les Réglages et la question « Compléter » lisent la même
// valeur ; une écriture prévient tous les écrans ouverts. Aucune relecture en
// boucle (règle du 04/10) : une lecture au premier besoin, puis la mémoire.
const memoire = new Map(); // userId → { valeur, lue, promesse }
const abonnes = new Set();
const prevenir = () => { for (const f of abonnes) { try { f(); } catch { /* écran démonté */ } } };

async function lireDepuisBase(userId) {
  try {
    const { data, error } = await supabase.from('profiles').select('platform_settings').eq('id', userId).maybeSingle();
    if (error) return { valeur: null, lue: false };
    return { valeur: portParDefautDesReglages(data?.platform_settings), lue: true };
  } catch {
    return { valeur: null, lue: false };
  }
}

export function lirePortParDefaut(userId) {
  if (!userId) return Promise.resolve({ valeur: null, lue: false });
  const e = memoire.get(userId);
  if (e?.lue) return Promise.resolve({ valeur: e.valeur, lue: true });
  if (e?.promesse) return e.promesse;
  const promesse = lireDepuisBase(userId).then((r) => {
    memoire.set(userId, { valeur: r.valeur, lue: r.lue, promesse: null });
    prevenir();
    return r;
  });
  memoire.set(userId, { valeur: null, lue: false, promesse });
  return promesse;
}

/** Garde (ou retire, avec null) le port par défaut. Rend { ok, valeur }. */
export async function enregistrerPortParDefaut(userId, v) {
  if (!userId) return { ok: false, valeur: null };
  const valeur = v == null || v === '' ? null : portValide(v);
  if (v != null && v !== '' && valeur == null) return { ok: false, valeur: null };
  const { data, error } = valeur == null
    ? await fusionnerReglages(['depop'], null, [CLE_REGLAGE_PORT_DEPOP])
    : await fusionnerReglages(['depop'], { [CLE_REGLAGE_PORT_DEPOP]: valeur });
  if (error || !data) return { ok: false, valeur: null };
  const relue = portParDefautDesReglages(data);
  memoire.set(userId, { valeur: relue, lue: true, promesse: null });
  prevenir();
  return { ok: true, valeur: relue };
}

/** Le port par défaut du compte : { valeur, lue, enregistrer }. */
export function usePortDepopParDefaut(userId) {
  const [, setTic] = useState(0);
  useEffect(() => {
    const f = () => setTic((n) => n + 1);
    abonnes.add(f);
    if (userId) lirePortParDefaut(userId);
    return () => { abonnes.delete(f); };
  }, [userId]);
  const e = userId ? memoire.get(userId) : null;
  return {
    valeur: e?.valeur ?? null,
    lue: Boolean(e?.lue),
    enregistrer: (v) => enregistrerPortParDefaut(userId, v),
  };
}
