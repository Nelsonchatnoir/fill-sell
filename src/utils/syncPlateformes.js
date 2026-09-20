// ═════════════════════════════════════════════════════════════════════════════
// RELEVÉ DES ANNONCES PAR PLATEFORME — côté app (2026-09-17, sync lot 2)
// docs/SYNC_MULTIPLATEFORME_CONCEPTION.md
// ═════════════════════════════════════════════════════════════════════════════
// Le relevé n'est NI une publication NI une republication : aucun quota,
// aucun compteur. Une annonce relevée reste en LECTURE SEULE tant que FillSell
// ne l'a pas déposée (pas de republication depuis une annonce importée).
// FERMÉ PAR DÉFAUT : coin_config.sync_multi_ouverte = 1 (ou le drapeau du
// profil beta_flags.inventaire_multi_pf) — l'app ne PROPOSE rien de ce que le
// serveur refuserait, et n'annonce rien qui n'existe pas encore.
import { supabase } from '../lib/supabase';
import { PLATEFORMES_STOCK } from './stockFiltres';

// Dérivée de la table unique du stock (utils/stockFiltres) : toutes sauf
// Vinted, qui a son propre relevé (carte « Relever mes annonces Vinted »).
// L'AFFICHAGE par compte passe par la prop `plateformes` de CarteAnnoncesEnLigne
// (plateformesDuCompte, calculée par StockTab) — ceci est le plafond.
export const PLATEFORMES_RELEVE = PLATEFORMES_STOCK.filter((p) => p !== 'vinted');
export const LABEL_RELEVE = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla' };

// L'interrupteur, FAIL-CLOSED : clé absente, illisible, lecture ratée → fermé.
export async function lireSyncMultiOuverte(userId) {
  try {
    const { data, error } = await supabase.from('coin_config').select('value').eq('key', 'sync_multi_ouverte').maybeSingle();
    if (!error && Number(data?.value) === 1) return true;
  } catch { /* fermé */ }
  if (!userId) return false;
  try {
    const { data, error } = await supabase.from('profiles').select('beta_flags').eq('id', userId).maybeSingle();
    if (!error && data?.beta_flags?.inventaire_multi_pf === true) return true;
  } catch { /* colonne absente = fermé */ }
  return false;
}

// Mise en file d'un relevé. Le serveur tranche (ouverture, version, cadence).
// Réponses : queued | deja_en_attente | sync_en_cours | non_expose |
// extension_jamais_vue | extension_trop_ancienne | cadence | rpc_absente | erreur.
export async function demanderRelevePlateforme(platform) {
  const { data, error } = await supabase.rpc('demander_sync_plateforme', { p_platform: platform });
  if (error) {
    const absente = error.code === 'PGRST202' || /function .*demander_sync_plateforme/i.test(error.message ?? '');
    return { ok: false, reason: absente ? 'rpc_absente' : 'erreur', message: error.message };
  }
  return data ?? { ok: false, reason: 'erreur' };
}

// Le dernier run PAR plateforme (kind 'annonces').
export async function lireDerniersRunsReleve(userId) {
  if (!userId) return {};
  const { data, error } = await supabase
    .from('vinted_sync_runs')
    .select('id,platform,status,declencheur,items_vus,items_crees,items_maj,total_entries,erreur,queued_at,started_at,finished_at')
    .eq('user_id', userId).eq('kind', 'annonces')
    .order('queued_at', { ascending: false, nullsFirst: false })
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(60);
  if (error) return {};
  const par = {};
  for (const r of data ?? []) if (!par[r.platform]) par[r.platform] = r;
  return par;
}

// ── LE DERNIER RELEVÉ VINTED (2026-09-18) ────────────────────────────────────
// Le bloc « Mes annonces en ligne » ne montre plus qu'UNE ligne d'état, toutes
// plateformes confondues. Vinted y pèse le plus lourd — l'omettre donnerait un
// total faux. Or son relevé n'est PAS `kind='annonces'` : la synchro du
// dressing s'écrit dans la MÊME table sous `kind='dressing'` (vérifié en base
// le 18/09 : 1 469 runs 'dressing'/vinted contre 0 'annonces'/vinted).
// ⚠️ Lecture SEULE, et pour le seul total : l'état vivant de Vinted (relevé en
//    cours, délai de cadence, extension absente) reste calculé par
//    VintedDressingSync, qui le remonte au bloc. Deux sources de vérité sur le
//    même état, c'est la garantie que l'une mentira.
export async function lireDernierRunVinted(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('vinted_sync_runs')
    .select('id,platform,status,items_vus,erreur,queued_at,started_at,finished_at')
    .eq('user_id', userId).eq('kind', 'dressing').eq('status', 'done')
    .order('finished_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) return null;
  return (data ?? [])[0] ?? null;
}

// Les annonces relevées PAS ENCORE rattachées (ni ignorées, ni disparues).
export async function lireAnnoncesARattacher(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('annonces_plateforme')
    .select('id,platform,listing_id,url,titre,prix,photo_url,statut_plateforme,proposition,vu_le')
    .eq('user_id', userId).is('inventaire_id', null).is('ignoree_le', null).is('disparu_le', null)
    .order('vu_le', { ascending: false })
    .limit(300);
  if (error) return [];
  return data ?? [];
}

// Compte des annonces rattachées et à rattacher, par plateforme.
export async function compterAnnoncesParPlateforme(userId) {
  if (!userId) return {};
  const { data, error } = await supabase
    .from('annonces_plateforme')
    .select('platform,inventaire_id,ignoree_le,disparu_le')
    .eq('user_id', userId).is('disparu_le', null)
    .limit(2000);
  if (error) return {};
  const par = {};
  for (const a of data ?? []) {
    const p = par[a.platform] ?? (par[a.platform] = { total: 0, rattachees: 0, aRattacher: 0 });
    p.total += 1;
    if (a.inventaire_id != null) p.rattachees += 1;
    else if (!a.ignoree_le) p.aRattacher += 1;
  }
  return par;
}

// Les propositions du moteur qui visent un JOB « plus en ligne » (cas d'un
// remplacement d'annonce) : job_id → annonce. Sert au bandeau « vendue ? ».
export async function lirePropositionsParJob(userId) {
  if (!userId) return {};
  const { data, error } = await supabase
    .from('annonces_plateforme')
    .select('id,platform,listing_id,url,titre,prix,proposition')
    .eq('user_id', userId).is('inventaire_id', null).is('ignoree_le', null).is('disparu_le', null)
    .not('proposition', 'is', null)
    .limit(200);
  if (error) return {};
  const par = {};
  for (const a of data ?? []) {
    const jobId = a.proposition?.job_id;
    if (jobId && !par[jobId]) par[jobId] = a;
  }
  return par;
}

// La décision de l'utilisateur : attache | refus_proposition | ignore | import | detache.
export async function deciderRapprochement(annonceId, decision, inventaireId = null) {
  const { data, error } = await supabase.rpc('rapprochement_decider', {
    p_annonce_id: annonceId, p_decision: decision, p_inventaire_id: inventaireId ?? null,
  });
  if (error) return { ok: false, reason: 'erreur', message: error.message };
  return data ?? { ok: false, reason: 'erreur' };
}

export function texteRefusReleve(res, lang = 'fr', platform = null) {
  const fr = lang !== 'en';
  const nom = LABEL_RELEVE[platform] ?? platform ?? '';
  const M = {
    non_expose: fr ? `Le relevé ${nom} n'est pas encore ouvert sur ton compte.` : `The ${nom} listing scan is not open on your account yet.`,
    extension_jamais_vue: fr ? "Il faut l'extension Chrome FillSell sur un ordinateur pour relever tes annonces." : 'The FillSell Chrome extension on a computer is needed to scan your listings.',
    extension_trop_ancienne: fr ? "Ton extension doit passer en 0.6.42 ou plus récente : Chrome la met à jour tout seul, réessaie un peu plus tard." : 'Your extension needs version 0.6.42 or newer: Chrome updates it on its own, try again a bit later.',
    cadence: fr ? `Annonces ${nom} relevées il y a moins de 15 min — réessaie dans un instant.` : `${nom} listings were scanned less than 15 min ago — try again shortly.`,
    rpc_absente: fr ? "Le relevé n'est pas encore activé côté serveur." : 'The scan is not enabled server-side yet.',
    invalid_platform: fr ? 'Plateforme inconnue.' : 'Unknown platform.',
  };
  return M[res?.reason] ?? res?.message ?? (fr ? 'Relevé impossible.' : 'Scan failed.');
}

// Vues / favoris relevés par plateforme, par ARTICLE rattaché (colonnes posées
// par la migration 20260918001000). Base sans ces colonnes → {} : rien ne
// casse, la carte garde ses compteurs Vinted. NULL = la plateforme ne le
// montre pas — jamais compté comme 0.
export async function lireStatsAnnoncesParArticle(userId) {
  if (!userId) return {};
  const { data, error } = await supabase
    .from('annonces_plateforme')
    .select('platform,inventaire_id,vues,favoris,vu_le')
    .eq('user_id', userId).not('inventaire_id', 'is', null).is('disparu_le', null)
    .order('vu_le', { ascending: false })
    .limit(2000);
  if (error) return {};
  const par = {};
  for (const a of data ?? []) {
    if (a.vues == null && a.favoris == null) continue;
    const k = String(a.inventaire_id);
    (par[k] ??= []).push({ platform: a.platform, vues: a.vues, favoris: a.favoris, vu_le: a.vu_le });
  }
  return par;
}
