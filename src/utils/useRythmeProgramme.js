// ═══════════════════════════════════════════════════════════════════════════
// LE RYTHME RÉEL DES PUBLICATIONS PROGRAMMÉES D'UN COMPTE — la lecture (12/11/2026, point 4 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Ce que lit l'écran pour dire la vérité (utils/rythmeProgramme.js) : les publications programmées SERVIES au compte
// sur les 14 derniers jours (programmee_servie_le) et celles qui ATTENDENT encore leur créneau. Une lecture quand
// l'écran s'ouvre (et au plus une toutes les 5 minutes par compte et par session) — jamais une relecture en boucle.
// Lecture par pages de 1 000 (PostgREST coupe sans erreur), 5 pages au plus. Rien n'est écrit.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { JOURS_MESURE } from './rythmeProgramme';

const FRAICHEUR_MS = 5 * 60_000;
const memoire = new Map(); // userId → { servies, dejaEnFile, lu_le, promesse }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function lire(userId) {
  const depuis = new Date(Date.now() - (JOURS_MESURE + 1) * 24 * 3600_000).toISOString();
  const servies = [];
  for (let page = 0; page < 5; page++) {
    const { data, error } = await supabase.from('cross_post_jobs')
      .select('servie:platform_fields->>programmee_servie_le')
      .eq('user_id', userId)
      .gte('platform_fields->>programmee_servie_le', depuis)
      .order('id', { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) return null;
    for (const r of data ?? []) if (r?.servie) servies.push(r.servie);
    if ((data ?? []).length < 1000) break;
  }
  const { count, error: eC } = await supabase.from('cross_post_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('status', 'pending').eq('action', 'publish')
    .eq('platform_fields->>programmee', 'true').is('platform_fields->>programmee_servie_le', null);
  return { servies, dejaEnFile: eC ? 0 : (count ?? 0) };
}

/** { servies, dejaEnFile, lu } — lu : false tant que la lecture n'a pas abouti (l'écran garde alors sa phrase sans chiffre). */
export function useRythmeProgramme(userId, actif) {
  const [, setTic] = useState(0);
  useEffect(() => {
    if (!actif || !userId || !UUID.test(String(userId))) return undefined;
    let vivant = true;
    const e = memoire.get(userId);
    if (e?.lu_le && Date.now() - e.lu_le < FRAICHEUR_MS) return undefined;
    if (!e?.promesse) {
      const promesse = lire(userId).then((r) => {
        memoire.set(userId, r ? { ...r, lu_le: Date.now(), promesse: null } : { ...(memoire.get(userId) ?? {}), promesse: null });
      }, () => { memoire.set(userId, { ...(memoire.get(userId) ?? {}), promesse: null }); });
      memoire.set(userId, { ...(e ?? {}), promesse });
    }
    memoire.get(userId)?.promesse?.then(() => { if (vivant) setTic((n) => n + 1); });
    return () => { vivant = false; };
  }, [userId, actif]);
  const e = userId ? memoire.get(userId) : null;
  return { servies: e?.servies ?? [], dejaEnFile: e?.dejaEnFile ?? 0, lu: Boolean(e?.lu_le) };
}
