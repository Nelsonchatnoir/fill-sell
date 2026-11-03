// ═══════════════════════════════════════════════════════════════════════════
// LE COMPTE CLOUD — ses tâches Vinted, Leboncoin, Beebs, Depop sont faites par FillSell Cloud (02/11 soir, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// profiles.cloud_voie (posé et retiré par la BASE seule depuis le 03/11 : vrai si et seulement si le Cloud du compte est
// actif — migration 20261103203000 ; jamais par le client) : vrai = le Cloud exécute ces tâches, l'ordinateur n'en
// reçoit aucune (supabase/functions/_shared/cloud-voie.js). Les écrans qui suivent une tâche le disent avec les mots du
// Cloud (« FillSell Cloud la prend à son tour »), jamais « ton ordinateur » ni « Chrome ». Cloud arrêté : drapeau faux,
// les écrans redisent l'extension. Une lecture par compte, relue au retour au premier plan (au plus toutes les 2 min) ;
// illisible = comme avant (textes de l'extension).
// ⛔ Un compte ordinaire ne fait AUCUNE requête : la lecture ne part que derrière la porte du Cloud
//    (cloudConnexionVisible : drapeau de l'offre ou compte témoin) — preuve d'identité des OTA.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cloudConnexionVisible } from '../config/cloudOffer';
import { noterCompteCourantCloud } from './voieCloud.js';

const memoire = new Map(); // userId → { cloud, lue, luLe, promesse }
const abonnes = new Set();
const prevenir = () => { for (const f of abonnes) { try { f(); } catch { /* écran démonté */ } } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// (03/11, point 3 de Nico) Le drapeau suit maintenant l'état Cloud tout seul (fin d'essai, arrêt, impayé) : il n'est
// plus figé pour la session. Relu au RETOUR AU PREMIER PLAN de l'app, au plus une fois toutes les 2 min (borné).
export const RELECTURE_MIN_MS = 2 * 60_000;
/** Faut-il relire ? (pur) Seulement une lecture déjà faite, plus vieille que l'intervalle, sans lecture en cours. */
export function aRelire(e, maintenant = Date.now()) {
  return Boolean(e && e.lue && !e.promesse && Number.isFinite(e.luLe) && maintenant - e.luLe >= RELECTURE_MIN_MS);
}
let ecouteInstallee = false;
function installerRelecture() {
  if (ecouteInstallee || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  ecouteInstallee = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    for (const [userId, e] of memoire) {
      if (!aRelire(e)) continue;
      memoire.set(userId, { ...e, lue: false });
      lire(userId);
    }
  });
}

function lire(userId) {
  if (!userId || !UUID.test(String(userId)) || !cloudConnexionVisible(userId)) return;
  const e = memoire.get(userId);
  if (e?.lue || e?.promesse) return;
  const promesse = (async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('cloud_voie').eq('id', userId).maybeSingle();
      memoire.set(userId, { cloud: !error && data?.cloud_voie === true, lue: !error, luLe: Date.now(), promesse: null });
      // (02/11 soir) Le compte de la session : les textes de tâche (humanizeJobError) parlent du Cloud.
      noterCompteCourantCloud(!error && data?.cloud_voie === true);
    } catch {
      memoire.set(userId, { cloud: false, lue: false, luLe: Date.now(), promesse: null });
    }
    prevenir();
  })();
  // Pendant une relecture, l'état d'avant reste affiché (jamais un « faux » d'attente qui ferait clignoter les écrans).
  memoire.set(userId, { cloud: e?.cloud === true, lue: false, luLe: e?.luLe ?? null, promesse });
}

/** Vrai quand le compte est servi par FillSell Cloud (lu une fois ; faux tant que ce n'est pas lu, ou hors de la porte). */
export function useCompteCloud(userId) {
  const [, setTic] = useState(0);
  // La porte peut s'ouvrir après le premier rendu (témoin lu en base) : la lecture part alors.
  const porte = Boolean(userId && cloudConnexionVisible(userId));
  useEffect(() => {
    const f = () => setTic((n) => n + 1);
    abonnes.add(f);
    if (porte) { lire(userId); installerRelecture(); }
    return () => { abonnes.delete(f); };
  }, [userId, porte]);
  return Boolean(porte && memoire.get(userId)?.cloud);
}

export { parLeCloud } from './voieCloud.js';
