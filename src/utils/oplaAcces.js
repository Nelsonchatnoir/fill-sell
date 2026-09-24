// ═══════════════════════════════════════════════════════════════════════════
// OPLA — L'AUTORISATION EST-ELLE ACCORDÉE ? UNE SEULE LECTURE (2026-09-24)
// ═══════════════════════════════════════════════════════════════════════════
// Ce module sert TOUS les écrans qui parlent de l'autorisation Opla : le
// stepper (étape 1 « Où publier ? » et étape 3, les deux peaux, brouillon
// repris compris), l'écran de suivi, les Réglages › Plateformes, le relevé
// « Mes annonces en ligne », la feuille de republication et les cartes du
// Stock. Une lecture, une réponse, partagée (cache commun de 15 s).
//
// ⛔ AVANT (jusqu'au 24/09) : chaque écran jugeait sur
//    `profiles.extension_sessions` — la sonde du DERNIER poste qui écrit.
//    Depuis la 0.6.65 un 401 de sonde rend `null` : la sonde ne dit plus rien
//    d'Opla, et le stepper lisait ce silence comme « pas autorisé ». Cas
//    Louis : « À autoriser dans l'extension » + « Autoriser Opla » à l'étape 1,
//    alors que ses deux postes avaient l'accès, que les Réglages disaient
//    « Connectée » et que sa publication Opla venait de partir.
// ✅ DEPUIS : la réponse vient des faits que le SERVEUR connaît — postes de
//    l'extension (profiles.extension_postes), relevés, dépôts, parcages — et
//    d'UNE règle, supabase/functions/_shared/acces-opla.js (verdictAccesOpla),
//    la même que le serveur. Rien n'est décidé sur ce que l'extension déclare
//    ou ne déclare pas dans sa sonde.
//
// ⛔ GARDE-FOU (Nico) : sans AUCUNE preuve d'accès, le bouton « Autoriser
//    Opla » RESTE affiché — `montrerAutoriser` n'est faux que sur un verdict
//    « autorise ». La modale au clic et le blocage du relevé, eux, ne se posent
//    que sur un refus CONNU (`refusConnu`) : « je ne sais pas » ne harcèle pas.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { verdictAccesOpla, parcageDepasse } from '../../supabase/functions/_shared/acces-opla.js';

export { parcageDepasse };

// ── LES FAITS, LUS EN BASE (lignes du compte, RLS) ──────────────────────────
// Sept lectures bornées (limit 1 / 20 / 50), en parallèle, indexées sur
// user_id. Une lecture qui échoue compte comme « rien » — jamais comme un
// refus.
export async function lireFaitsAccesOpla(userId) {
  if (!userId) return null;
  const premier = (r, col) => (r?.error ? null : (r?.data?.[0]?.[col] ?? null));
  const [prof, releveOk, releveNon, releve401, publie, parcages, octrois] = await Promise.all([
    supabase.from('profiles').select('extension_postes, extension_sessions').eq('id', userId).maybeSingle(),
    supabase.from('vinted_sync_runs').select('finished_at')
      .eq('user_id', userId).eq('platform', 'opla').eq('status', 'done').neq('kind', 'connexion')
      .not('finished_at', 'is', null).order('finished_at', { ascending: false }).limit(1),
    supabase.from('vinted_sync_runs').select('finished_at')
      .eq('user_id', userId).eq('platform', 'opla').ilike('erreur', '%accès Opla non accordé%')
      .not('finished_at', 'is', null).order('finished_at', { ascending: false }).limit(1),
    supabase.from('vinted_sync_runs').select('finished_at')
      .eq('user_id', userId).eq('platform', 'opla').ilike('erreur', '%session Opla refus%HTTP 401%')
      .not('finished_at', 'is', null).order('finished_at', { ascending: false }).limit(1),
    supabase.from('cross_post_jobs').select('published_at')
      .eq('user_id', userId).eq('platform', 'opla').eq('status', 'published')
      .not('published_at', 'is', null).or('handler_build.is.null,handler_build.neq.releve-annonces')
      .order('published_at', { ascending: false }).limit(1),
    supabase.from('cross_post_jobs').select('created_at, platform_fields')
      .eq('user_id', userId).eq('platform', 'opla').eq('status', 'needs_user')
      .eq('platform_fields->>needs_user_source', 'opla_acces').limit(50),
    supabase.from('cross_post_jobs').select('platform_fields')
      .eq('user_id', userId).eq('platform', 'opla')
      .not('platform_fields->>opla_acces_accorde_le', 'is', null)
      .is('platform_fields->>opla_acces_accorde_par', null)
      .order('created_at', { ascending: false }).limit(20),
  ]);
  const plusTardif = (valeurs) => {
    let best = null;
    for (const v of valeurs) {
      const n = Date.parse(String(v ?? ''));
      if (Number.isFinite(n) && (best == null || n > best)) best = n;
    }
    return best == null ? null : new Date(best).toISOString();
  };
  return {
    postes: prof?.error ? null : (prof?.data?.extension_postes ?? null),
    sessions: prof?.error ? null : (prof?.data?.extension_sessions ?? null),
    releveReussiLe: premier(releveOk, 'finished_at'),
    releveNonAccordeLe: premier(releveNon, 'finished_at'),
    releveSessionRefuseeLe: premier(releve401, 'finished_at'),
    publieLe: premier(publie, 'published_at'),
    parcageLe: parcages?.error ? null : plusTardif((parcages?.data ?? []).flatMap((j) => [
      j.platform_fields?.opla_acces_attendu_le, j.platform_fields?.opla_acces_reprise_le, j.created_at,
    ])),
    octroiLe: octrois?.error ? null : plusTardif((octrois?.data ?? []).map((j) => j.platform_fields?.opla_acces_accorde_le)),
  };
}

// ── UNE LECTURE PARTAGÉE ────────────────────────────────────────────────────
// Le Stock, le stepper ouvert par-dessus et le relevé montent chacun le hook :
// une seule série de requêtes sert tout le monde pendant 15 s, et une demande
// en vol est partagée (jamais deux séries simultanées).
const CACHE_MS = 15 * 1000;
let cache = { userId: null, le: 0, valeur: null, enVol: null };
const abonnes = new Set();

export async function lireVerdictAccesOpla(userId, { frais = false } = {}) {
  if (!userId) return null;
  const maintenant = Date.now();
  if (!frais && cache.userId === userId && cache.valeur && maintenant - cache.le < CACHE_MS) return cache.valeur;
  if (cache.userId === userId && cache.enVol) return cache.enVol;
  const enVol = (async () => {
    try {
      const faits = await lireFaitsAccesOpla(userId);
      // ⛔ Illisible n'est pas « refusé » : c'est « inconnu », et le bouton
      //    reste (garde-fou) — sans modale, sans blocage.
      const v = faits ? verdictAccesOpla(faits) : { verdict: 'inconnu', le: null, motif: 'illisible', preuve: null, refus: null, postes: { avec: 0, sans: 0 } };
      cache = { userId, le: Date.now(), valeur: v, enVol: null };
      for (const f of abonnes) f(userId, v);
      return v;
    } catch {
      cache = { ...cache, enVol: null };
      return cache.userId === userId ? cache.valeur : null;
    }
  })();
  cache = { ...cache, userId, enVol };
  return enVol;
}

/**
 * Le verdict d'accès Opla du compte, relu toutes les 60 s et au retour
 * d'onglet (la personne vient peut-être d'autoriser dans l'extension).
 * Rend :
 *   verdict           'autorise' | 'a_autoriser' | 'inconnu' | null (pas encore lu)
 *   montrerAutoriser  le bouton « Autoriser Opla » est-il à montrer ? (tout sauf « autorise »)
 *   refusConnu        un refus est-il PROUVÉ ? (modale au clic, relevé retenu)
 *   acces             true (autorisé) · false (refus connu) · null (inconnu / pas lu)
 *   detail            le verdict complet (preuve, refus, dates)
 *   relire()          relecture immédiate, hors cache
 */
export function useOplaAcces({ userId, actif = true }) {
  const [detail, setDetail] = useState(() => (cache.userId === userId ? cache.valeur : null));

  const relire = useCallback(async () => {
    if (!userId) return null;
    const v = await lireVerdictAccesOpla(userId, { frais: true });
    if (v) setDetail(v);
    return v;
  }, [userId]);

  useEffect(() => {
    if (!actif || !userId) return undefined;
    let mort = false;
    const surVerdict = (uid, v) => { if (!mort && uid === userId) setDetail(v); };
    abonnes.add(surVerdict);
    const tick = () => { if (!mort) lireVerdictAccesOpla(userId).then((v) => { if (!mort && v) setDetail(v); }).catch(() => {}); };
    tick();
    const timer = setInterval(tick, 60 * 1000);
    const surVisibilite = () => { if (document.visibilityState === 'visible') lireVerdictAccesOpla(userId, { frais: true }).catch(() => {}); };
    document.addEventListener('visibilitychange', surVisibilite);
    return () => {
      mort = true;
      abonnes.delete(surVerdict);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', surVisibilite);
    };
  }, [actif, userId]);

  const verdict = detail?.verdict ?? null;
  return {
    verdict,
    detail,
    montrerAutoriser: verdict !== null && verdict !== 'autorise',
    refusConnu: verdict === 'a_autoriser',
    acces: verdict === 'autorise' ? true : verdict === 'a_autoriser' ? false : null,
    relire,
  };
}

/** La phrase d'état d'Opla quand l'accès n'est pas prouvé (une ligne, sans diagnostic). */
export function phraseAccesOpla(verdict, lang = 'fr') {
  const en = lang === 'en';
  if (verdict === 'a_autoriser') return en ? 'To allow in the extension' : "À autoriser dans l'extension";
  if (verdict === 'inconnu') return en ? 'Permission to confirm in the extension' : "Autorisation à confirmer dans l'extension";
  return null;
}

/** La carte « avant de publier » quand Opla est cochée sans accès prouvé : titre + texte, ou null. */
export function carteAccesOpla(verdict, lang = 'fr') {
  const en = lang === 'en';
  if (verdict === 'a_autoriser') return {
    titre: en ? 'Opla is waiting for your permission' : 'Opla attend ton autorisation',
    texte: en
      ? 'You can publish now: the Opla listing waits for the permission, then goes out on its own. The other platforms go out right away.'
      : "Tu peux publier maintenant : l'annonce Opla attendra l'autorisation, puis partira toute seule. Les autres plateformes partent tout de suite.",
  };
  if (verdict === 'inconnu') return {
    titre: en ? 'Opla permission not seen yet' : 'Autorisation Opla pas encore vue',
    texte: en
      ? 'If you already allowed Opla in the extension, nothing to do. Otherwise tap “Autoriser Opla”: the listing waits for it, then goes out on its own.'
      : "Si tu as déjà autorisé Opla dans l'extension, rien à faire. Sinon, appuie sur « Autoriser Opla » : l'annonce attendra l'autorisation, puis partira toute seule.",
  };
  return null;
}
