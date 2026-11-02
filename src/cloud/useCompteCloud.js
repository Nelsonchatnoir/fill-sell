// ═══════════════════════════════════════════════════════════════════════════
// LE COMPTE CLOUD — ses tâches Vinted, Leboncoin, Beebs, Depop sont faites par FillSell Cloud (02/11 soir, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// profiles.cloud_voie (posé par script, jamais par le client) : vrai = le Cloud exécute ces tâches, l'ordinateur n'en
// reçoit aucune (supabase/functions/_shared/cloud-voie.js). Les écrans qui suivent une tâche le disent avec les mots du
// Cloud (« FillSell Cloud la prend à son tour »), jamais « ton ordinateur » ni « Chrome ». Une lecture par compte et par
// session (même forme que utils/usePublicationProgrammee.js) ; illisible = comme avant (textes de l'extension).
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const memoire = new Map(); // userId → { cloud, lue, promesse }
const abonnes = new Set();
const prevenir = () => { for (const f of abonnes) { try { f(); } catch { /* écran démonté */ } } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lire(userId) {
  if (!userId || !UUID.test(String(userId))) return;
  const e = memoire.get(userId);
  if (e?.lue || e?.promesse) return;
  const promesse = (async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('cloud_voie').eq('id', userId).maybeSingle();
      memoire.set(userId, { cloud: !error && data?.cloud_voie === true, lue: !error, promesse: null });
    } catch {
      memoire.set(userId, { cloud: false, lue: false, promesse: null });
    }
    prevenir();
  })();
  memoire.set(userId, { cloud: false, lue: false, promesse });
}

/** Vrai quand le compte est servi par FillSell Cloud (lu une fois ; faux tant que ce n'est pas lu). */
export function useCompteCloud(userId) {
  const [, setTic] = useState(0);
  useEffect(() => {
    const f = () => setTic((n) => n + 1);
    abonnes.add(f);
    lire(userId);
    return () => { abonnes.delete(f); };
  }, [userId]);
  return Boolean(userId && memoire.get(userId)?.cloud);
}

export { parLeCloud } from './voieCloud.js';
