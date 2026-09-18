// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES — L'ÉTAT DES SESSIONS, TEL QUE L'EXTENSION LE RELÈVE (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// AUCUNE RÈGLE NEUVE : la lecture et le verdict sont ceux de
// utils/sessionsPlateformes (`etatSession`), déjà utilisés par l'écran de
// publication. Ce hook ne fait que les servir à la page Réglages, qui les
// affichait nulle part — il fallait aller les chercher dans le Stock.
//
// DEUX SOURCES, LE PLUS RÉCENT TRANCHE (doctrine du 15/09) :
//   1. le relevé de l'extension (profiles.extension_sessions), jugé PAR
//      PLATEFORME sur sa propre fraîcheur ;
//   2. une publication RÉUSSIE de moins de 72 h, qui PROUVE la session sans
//      aucune sonde — le seul signal utilisable sur Leboncoin (403 DataDome)
//      et sur Beebs (200 même déconnecté).
//
// TROIS ÉTATS, jamais quatre : 'ok', 'ko', null (jamais vérifié). On
// n'affirme rien qu'on n'ait mesuré.
//
// ⚠️ Opla est interrogé ICI par son nom, sans entrer dans
// PLATEFORMES_SESSION : cette constante pilote les puces de l'écran de
// publication, et y ajouter Opla changerait un écran qui ne fait pas partie
// de ce lot. `etatSession` est générique, elle prend la plateforme en
// paramètre — rien à modifier ailleurs.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etatSession, PUBLICATION_PROUVE_MS } from '../utils/sessionsPlateformes';

const PAR_DEFAUT = ['vinted', 'leboncoin', 'beebs', 'ebay'];

export function useSessionsPlateformes({ userId, plateformes = PAR_DEFAUT, actif = true }) {
  const [etats, setEtats] = useState(null);       // { [pf]: 'ok'|'ko'|null } | null
  const [chargement, setChargement] = useState(true);
  const liste = Array.isArray(plateformes) && plateformes.length ? plateformes : PAR_DEFAUT;
  const cle = liste.join(',');

  const lire = useCallback(async () => {
    if (!userId) return;
    const depuis = new Date(Date.now() - PUBLICATION_PROUVE_MS).toISOString();
    const [profil, publiees] = await Promise.all([
      supabase.from('profiles').select('extension_sessions').eq('id', userId).maybeSingle(),
      supabase.from('cross_post_jobs').select('platform, created_at')
        .eq('user_id', userId).eq('status', 'published')
        .gte('created_at', depuis)
        .order('created_at', { ascending: false }).limit(50),
    ]);
    const publicationsOk = {};
    for (const j of publiees?.data ?? []) {
      const t = Date.parse(j.created_at ?? '');
      if (!Number.isFinite(t)) continue;
      if (!publicationsOk[j.platform] || t > publicationsOk[j.platform]) publicationsOk[j.platform] = t;
    }
    const sessions = profil?.data?.extension_sessions ?? null;
    const out = {};
    for (const pf of cle.split(',')) out[pf] = etatSession(sessions, pf, publicationsOk[pf] ?? null);
    setEtats(out);
    setChargement(false);
  }, [userId, cle]);

  useEffect(() => {
    if (!actif || !userId) return undefined;
    let mort = false;
    const tick = () => { if (!mort) lire().catch(() => { if (!mort) setChargement(false); }); };
    tick();
    const timer = setInterval(tick, 60_000);
    const surVisibilite = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', surVisibilite);
    return () => {
      mort = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', surVisibilite);
    };
  }, [actif, userId, lire]);

  // Le compteur du hub : « 4 sur 5 ». Une plateforme jamais vérifiée n'est pas
  // comptée comme connectée — elle n'est pas comptée comme déconnectée non plus.
  const connectes = etats ? Object.values(etats).filter((e) => e === 'ok').length : 0;

  return { etats, chargement, connectes, total: liste.length, relire: lire };
}
