// LEBONCOIN — le choix « Laisser Leboncoin estimer » / « Saisir le poids »,
// lu et retenu pour le compte (11/10/2026 soir, Nico). La règle :
// utils/choixPoidsLeboncoin.js. Écriture par platform_settings_fusionner
// SEULEMENT (profiles.platform_settings.leboncoin.poids_choix).
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fusionnerReglages } from './reglagesPlateformes';
import { CLE_REGLAGE_POIDS_LBC, CHOIX_POIDS_LBC_DEFAUT, POIDS_LBC_SAISIR, choixPoidsValide, choixPoidsDesReglages, poidsExigeDesReglages } from './choixPoidsLeboncoin';

// ── LECTURE PARTAGÉE (une lecture par compte et par session de l'app) ──────
// Même forme que le port Depop par défaut (utils/fraisPortDepop.js) : le
// stepper et le lot lisent la même valeur ; une écriture prévient tous les
// écrans ouverts. Aucune relecture en boucle (règle du 04/10).
const memoire = new Map(); // userId → { choix, lue, promesse }
const abonnes = new Set();
const prevenir = () => { for (const f of abonnes) { try { f(); } catch { /* écran démonté */ } } };

async function lireDepuisBase(userId) {
  try {
    const { data, error } = await supabase.from('profiles').select('platform_settings').eq('id', userId).maybeSingle();
    if (error) return { choix: CHOIX_POIDS_LBC_DEFAUT, lue: false };
    return { choix: choixPoidsDesReglages(data?.platform_settings), lue: true, exige: poidsExigeDesReglages(data?.platform_settings) };
  } catch {
    return { choix: CHOIX_POIDS_LBC_DEFAUT, lue: false };
  }
}

// Un identifiant qui n'est pas un UUID ne peut désigner aucun compte : aucune
// lecture (la base répondrait 400), le défaut vaut.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lireChoixPoidsLbc(userId) {
  if (!userId || !UUID.test(String(userId))) return Promise.resolve({ choix: CHOIX_POIDS_LBC_DEFAUT, lue: false });
  const e = memoire.get(userId);
  if (e?.lue) return Promise.resolve({ choix: e.choix, lue: true });
  if (e?.promesse) return e.promesse;
  const promesse = lireDepuisBase(userId).then((r) => {
    // Un choix fait à l'écran pendant la lecture l'emporte (jamais écrasé).
    const deja = memoire.get(userId);
    if (deja?.lue) return { choix: deja.choix, lue: true };
    memoire.set(userId, { choix: r.choix, lue: r.lue, exige: Boolean(r.exige), promesse: null });
    prevenir();
    return r;
  });
  memoire.set(userId, { choix: CHOIX_POIDS_LBC_DEFAUT, lue: false, promesse });
  return promesse;
}

/**
 * Retient le choix : l'écran suit tout de suite, l'écriture part derrière.
 * Une écriture ratée garde le choix pour cette session (jamais un écran qui
 * revient en arrière sous le doigt). Rend { ok }.
 */
export async function enregistrerChoixPoidsLbc(userId, choix) {
  // (15/10 soir) Compte où Leboncoin exige le poids : « estimer » n'existe pas.
  const exige = Boolean(userId && memoire.get(userId)?.exige);
  const c = exige ? POIDS_LBC_SAISIR : choixPoidsValide(choix);
  if (userId) memoire.set(userId, { choix: c, lue: true, exige, promesse: null });
  prevenir();
  if (!userId || !UUID.test(String(userId))) return { ok: false };
  const { error } = await fusionnerReglages(['leboncoin'], { [CLE_REGLAGE_POIDS_LBC]: c });
  return { ok: !error };
}

/** Le choix du compte : { choix, lue, choisir }. */
export function useChoixPoidsLeboncoin(userId) {
  const [, setTic] = useState(0);
  useEffect(() => {
    const f = () => setTic((n) => n + 1);
    abonnes.add(f);
    if (userId) lireChoixPoidsLbc(userId);
    return () => { abonnes.delete(f); };
  }, [userId]);
  const e = userId ? memoire.get(userId) : null;
  return {
    choix: e?.choix ?? CHOIX_POIDS_LBC_DEFAUT,
    lue: Boolean(e?.lue),
    exige: Boolean(e?.exige),
    choisir: (c) => enregistrerChoixPoidsLbc(userId, c),
  };
}
