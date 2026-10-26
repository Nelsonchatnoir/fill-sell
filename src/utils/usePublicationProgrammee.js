// ═══════════════════════════════════════════════════════════════════════════
// LES NOUVELLES PUBLICATIONS PROGRAMMÉES — le réglage, lu et écrit dans l'app (26/10, D4)
// ═══════════════════════════════════════════════════════════════════════════
// La règle (créneau, jours, plafond, une à la fois) : supabase/functions/_shared/publication-programmee.js, la même
// que get-pending-jobs. Ici : la lecture partagée (une par compte et par session, même forme que
// utils/useChoixPoidsLeboncoin.js) et l'écriture par platform_settings_fusionner seulement.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fusionnerReglages } from './reglagesPlateformes';
import { CLE_PUBLICATION_PROGRAMMEE, reglageProgrammation } from '../../supabase/functions/_shared/publication-programmee.js';

const memoire = new Map(); // userId → { brut, lue, promesse }
const abonnes = new Set();
const prevenir = () => { for (const f of abonnes) { try { f(); } catch { /* écran démonté */ } } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lire(userId) {
  if (!userId || !UUID.test(String(userId))) return;
  const e = memoire.get(userId);
  if (e?.lue || e?.promesse) return;
  const promesse = (async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('platform_settings').eq('id', userId).maybeSingle();
      if (memoire.get(userId)?.lue) return;
      const ps = data?.platform_settings;
      const brut = ps && typeof ps === 'object' && ps[CLE_PUBLICATION_PROGRAMMEE] && typeof ps[CLE_PUBLICATION_PROGRAMMEE] === 'object'
        ? ps[CLE_PUBLICATION_PROGRAMMEE] : null;
      memoire.set(userId, { brut: error ? null : brut, lue: !error, promesse: null });
    } catch {
      memoire.set(userId, { brut: null, lue: false, promesse: null });
    }
    prevenir();
  })();
  memoire.set(userId, { brut: null, lue: false, promesse });
}

/** Le réglage normalisé DÉJÀ LU (null : éteint, ou pas encore lu). */
export function programmationConnue(userId) {
  return reglageProgrammation({ [CLE_PUBLICATION_PROGRAMMEE]: userId ? memoire.get(userId)?.brut : null });
}

/** Écrit le réglage (patch fusionné) ; l'écran suit tout de suite. Rend { ok }. */
export async function enregistrerProgrammation(userId, patch) {
  const avant = (userId && memoire.get(userId)?.brut) || {};
  const brut = { ...avant, ...patch };
  if (userId) memoire.set(userId, { brut, lue: true, promesse: null });
  prevenir();
  if (!userId || !UUID.test(String(userId))) return { ok: false };
  const { error } = await fusionnerReglages([CLE_PUBLICATION_PROGRAMMEE], patch);
  return { ok: !error };
}

/** { reglage (normalisé ou null), brut, lue, regler(patch) } */
export function usePublicationProgrammee(userId) {
  const [, setTic] = useState(0);
  useEffect(() => {
    const f = () => setTic((n) => n + 1);
    abonnes.add(f);
    lire(userId);
    return () => { abonnes.delete(f); };
  }, [userId]);
  const e = userId ? memoire.get(userId) : null;
  const brut = e?.brut ?? null;
  return {
    brut,
    reglage: reglageProgrammation({ [CLE_PUBLICATION_PROGRAMMEE]: brut }),
    lue: Boolean(e?.lue),
    regler: (patch) => enregistrerProgrammation(userId, patch),
  };
}
