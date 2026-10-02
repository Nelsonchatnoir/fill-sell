// ── Sortie d'Opla côté app (02/10/2026, décision de Nico) ───────────────────
// UNE lecture de « ce compte a-t-il un dressing Opla synchronisé ? » (règle
// unique : _shared/opla-sortie.js, oplaRelie) et de « a-t-il déjà touché
// J'ai compris ? » (usage_logs, feature 'opla_bandeau' — côté serveur, par
// compte, donc valable sur tous ses appareils).
//   · relie === true  : la synchronisation Opla continue d'apparaître (relevé,
//     ventes, retraits) et le bandeau s'affiche tant qu'il n'est pas compris ;
//   · relie === false : Opla n'existe plus pour ce compte ;
//   · relie === null  : pas encore lu, ou lecture impossible — rien ne
//     s'affiche (ni bandeau, ni Opla) ; le serveur, lui, continue sa règle.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { OPLA_SORTIE, oplaRelie } from '../../supabase/functions/_shared/opla-sortie.js';

export function useSortieOpla(userId) {
  const [relie, setRelie] = useState(null);
  const [bandeauVu, setBandeauVu] = useState(null);

  useEffect(() => {
    if (!userId) { setRelie(null); setBandeauVu(null); return undefined; }
    let vivant = true;
    (async () => {
      try {
        const [rReleve, rAnnonce, rVu] = await Promise.all([
          supabase.from('vinted_sync_runs').select('id')
            .eq('user_id', userId).eq('platform', 'opla').eq('kind', 'annonces').eq('status', 'done').limit(1),
          supabase.from('cross_post_jobs').select('id')
            .eq('user_id', userId).eq('platform', 'opla').in('status', ['published', 'sold']).limit(1),
          supabase.from('usage_logs').select('id')
            .eq('user_id', userId).eq('feature', OPLA_SORTIE.FEATURE_BANDEAU).limit(1),
        ]);
        if (!vivant) return;
        if (rReleve.error || rAnnonce.error) { setRelie(null); } else {
          setRelie(oplaRelie({ releveOplaFait: (rReleve.data ?? []).length > 0, annonceOplaConnue: (rAnnonce.data ?? []).length > 0 }));
        }
        // Lecture du « compris » impossible → on ne montre pas le bandeau
        // (mieux vaut le rater une fois que le remontrer à qui l'a fermé).
        setBandeauVu(rVu.error ? null : (rVu.data ?? []).length > 0);
      } catch {
        if (vivant) { setRelie(null); setBandeauVu(null); }
      }
    })();
    return () => { vivant = false; };
  }, [userId]);

  const compris = useCallback(() => {
    setBandeauVu(true);
    if (!userId) return;
    supabase.from('usage_logs')
      .insert({ user_id: userId, feature: OPLA_SORTIE.FEATURE_BANDEAU, metadata: { evenement: 'compris', sortie_le: OPLA_SORTIE.LE } })
      .then(({ error }) => { if (error) console.warn('[sortie-opla] « J\'ai compris » non enregistré :', error.message); });
  }, [userId]);

  return { relie, bandeau: relie === true && bandeauVu === false, compris };
}
