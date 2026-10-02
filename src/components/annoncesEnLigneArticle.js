// ── Les annonces encore en ligne d'UN article (lecture partagée) ─────────────
// Sorti de AvertissementAnnoncesEnLigne (02/10 soir, point 8) : la fenêtre
// « Vendre » en a besoin pour proposer les plateformes RÉELLES de l'article,
// et la carte vocale pour son avertissement. Une lecture, un calcul
// (utils/publicationState.js, annoncesEncoreEnLigne), deux affichages.
// Fichier .js sans composant : il n'exporte qu'un hook (fast refresh intact).
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { annoncesEncoreEnLigne } from '../utils/publicationState';

// null tant que la lecture n'a pas abouti, puis [{ platform, url }].
export function useAnnoncesEncoreEnLigne(item) {
  const invId = item?.id ?? null;
  // La lecture est mémorisée AVEC l'id qu'elle décrit : si l'article change
  // (carte vocale qui bascule d'un candidat à l'autre), l'ancienne réponse ne
  // vaut plus et le rendu repasse en « lecture en cours » sans setState de
  // remise à zéro — donc sans rendu en cascade.
  const [lu, setLu] = useState({ invId: null, jobs: [] });
  useEffect(() => {
    // Vente directe (article jamais entré en stock) : rien à lire, rien à dire.
    if (invId == null) return;
    let annule = false;
    (async () => {
      // ⛔ Colonnes vérifiées, identiques au poll du Stock : cross_post_jobs n'a
      // PAS d'updated_at, et un select PostgREST est tout ou rien — une colonne
      // inconnue ne dégrade pas, elle annule la requête entière.
      // Pas de filtre user_id : la RLS « Users manage own cross_post_jobs » le
      // fait déjà, et inventaire_id est propre à l'utilisateur.
      const { data, error } = await supabase
        .from('cross_post_jobs')
        .select('id, inventaire_id, platform, status, action, created_at, listing_url, platform_fields')
        .eq('inventaire_id', invId)
        .in('status', ['pending', 'processing', 'published', 'deleted']);
      if (annule) return;
      // Lecture en échec : on n'invente pas d'annonces en ligne. La vente n'est
      // jamais bloquée par un aléa réseau.
      if (error) console.error('[annoncesEncoreEnLigne]', error.message);
      setLu({ invId, jobs: error || !data ? [] : data });
    })();
    return () => { annule = true; };
  }, [invId]);
  if (invId == null) return [];
  if (lu.invId !== invId) return null; // lecture pas encore aboutie POUR CET article
  return annoncesEncoreEnLigne(item, lu.jobs);
}
