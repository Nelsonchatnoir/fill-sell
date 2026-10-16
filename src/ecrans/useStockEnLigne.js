// ═══════════════════════════════════════════════════════════════════════════
// LE STOCK EN LIGNE, PAR PLATEFORME (Tableau « En stock », Stats « Stock en ligne »)
// ═══════════════════════════════════════════════════════════════════════════
// « En ligne » se calcule EXACTEMENT comme les pastilles du Stock :
// utils/stockFiltres.etatPlateformes(jobs, lang, article).enLigne — les jobs de
// l'article (computeRemovalInfo) et, pour Vinted, l'article lui-même
// (vintedPresenceArticle). Aucun calcul parallèle qui pourrait le contredire.
//
// UNE lecture à l'ouverture de l'onglet (jamais de relecture périodique) :
// colonnes minimales (aucun platform_fields), statuts utiles seulement, par
// pages de 1 000 sur l'index (user_id, created_at desc, id desc) — PostgREST
// coupe à 1 000 lignes sans erreur. ⛔ Jamais « order by id » : mesuré le 16/10,
// Postgres parcourait alors la clé primaire de TOUS les comptes (16 893 lignes
// écartées pour une page de 500). Plus gros compte : 2 967 lignes. Lecture en
// échec → rien d'inventé : null, le bloc ne montre pas la répartition.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { lireToutesPagesRecentsDabord } from '../utils/lireToutesPages';
import { etatPlateformes } from '../utils/stockFiltres';

const COLONNES = 'id, inventaire_id, platform, status, action, created_at, published_at, listing_url, platform_listing_id';
const STATUTS = ['pending', 'processing', 'published', 'deleted', 'sold'];

/** Calcul pur (testable) : { enLigne, pasEncore, parPlateforme: { vinted: n, … }, total }. */
export function compterStockEnLigne(stock, jobsParArticle) {
  const parPlateforme = {};
  let enLigne = 0, total = 0;
  for (const it of stock ?? []) {
    total += 1;
    const e = etatPlateformes(jobsParArticle?.[it.id] ?? [], 'fr', it);
    if (e.enLigne.length) enLigne += 1;
    for (const p of e.enLigne) parPlateforme[p] = (parPlateforme[p] ?? 0) + 1;
  }
  return { enLigne, pasEncore: total - enLigne, parPlateforme, total };
}

export function useStockEnLigne(userId, stock) {
  const [jobs, setJobs] = useState(null);
  useEffect(() => {
    if (!userId) return undefined;
    let annule = false;
    lireToutesPagesRecentsDabord(() => supabase.from('cross_post_jobs').select(COLONNES).eq('user_id', userId).in('status', STATUTS))
      .then((lignes) => {
        if (annule) return;
        const parArticle = {};
        for (const j of lignes) {
          if (j.inventaire_id == null) continue;
          (parArticle[j.inventaire_id] ||= []).push(j);
        }
        setJobs(parArticle);
      })
      .catch((e) => { if (!annule) { console.warn('[stock en ligne] lecture impossible :', e?.message); setJobs(false); } });
    return () => { annule = true; };
  }, [userId]);
  if (!userId) return null;
  if (jobs === null || jobs === false) return null;
  return compterStockEnLigne(stock, jobs);
}
