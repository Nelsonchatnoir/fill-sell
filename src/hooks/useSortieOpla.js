// ── Sortie d'Opla côté app (décision de Nico, bascule le 10/10/2026) ────────
// TROIS lectures, une seule règle (_shared/opla-sortie.js) :
//   · active  — la sortie s'applique-t-elle MAINTENANT ? L'interrupteur
//     coin_config `opla_sortie_le` (défaut : le 10/10 à 00:00 Paris ; 0 =
//     désactivée), relu au montage et toutes les 10 min, l'heure recalculée
//     chaque minute : la bascule a lieu d'elle-même dans une app ouverte.
//     Avant la bascule, Opla fonctionne comme avant ;
//   · relie   — ce compte a-t-il un dressing Opla synchronisé (oplaRelie) ?
//     Après la bascule, seul ce cas garde la synchronisation (relevé, ventes,
//     retraits) ;
//   · bandeau — TOUT compte qui n'a pas encore touché « J'ai compris »
//     (usage_logs, feature 'opla_bandeau' : côté serveur, par compte), dès
//     maintenant ; variante 'relie' (dressing Opla synchronisé : ce qui
//     continue, ce qui s'arrête le 10/10) ou 'general' (tous les autres).
//     Décision de Nico du 02/10.
// Une lecture ratée : relie/bandeau inconnus → rien ne s'affiche ; active
// retombe sur la date par défaut (jamais une bascule déplacée par une panne).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { OPLA_SORTIE, oplaRelie, sortieOplaActive } from '../../supabase/functions/_shared/opla-sortie.js';
import { etatBascule } from '../utils/basculeOplaDepop.js';

export function useSortieOpla(userId) {
  const [relie, setRelie] = useState(null);
  const [bandeauVu, setBandeauVu] = useState(null);
  const [valeurInterrupteur, setValeurInterrupteur] = useState(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  // L'heure, chaque minute : la bascule de minuit se voit sans recharger.
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // L'interrupteur, au montage puis toutes les 10 min.
  useEffect(() => {
    let vivant = true;
    const lire = () => supabase.from('coin_config').select('value').eq('key', OPLA_SORTIE.CLE_CONFIG).maybeSingle()
      .then(({ data, error }) => { if (vivant && !error) setValeurInterrupteur(data?.value ?? null); })
      .catch(() => {});
    lire();
    const t = setInterval(lire, 10 * 60_000);
    return () => { vivant = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!userId) return undefined;
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

  // La bascule (désactivée par l'interrupteur à 0) : avant, et sans
  // interrupteur désactivé, le bandeau ANNONCE ; une fois Opla rouverte (0),
  // il n'a plus rien à annoncer. (09/10 soir, Nico) À la bascule il disparaît
  // aussi : Opla n'existe plus nulle part, le bandeau de prévention compris
  // (règle unique : utils/basculeOplaDepop.js).
  const active = sortieOplaActive(maintenant, valeurInterrupteur);
  const bandeau = etatBascule({ maintenant, interrupteur: valeurInterrupteur, oplaRelie: relie, bandeauVu }).bandeauOpla;
  return { active, relie, bandeau, variante: relie === true ? 'relie' : 'general', compris, maintenant, interrupteur: valeurInterrupteur };
}
