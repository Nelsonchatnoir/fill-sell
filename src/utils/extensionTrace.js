// ── « Ce compte n'a JAMAIS eu d'extension » — un fait SERVEUR (05/09) ────────
// L'étape 1 du Tableau vide (installer l'extension) ne doit se cocher que sur
// une preuve, et ne jamais réapparaître chez quelqu'un dont l'ordinateur est
// simplement éteint aujourd'hui. Trois traces, toutes écrites par l'extension
// elle-même, aucune par l'app :
//   1. profiles.extension_last_seen_at — stampé à chaque poll (get-pending-jobs) ;
//   2. cross_post_jobs.handler_build   — l'extension qui a traité un job ;
//   3. vinted_sync_runs.extension_build — l'extension qui a exécuté une sync.
// La 1 couvre la quasi-totalité des cas (tout job ou run passe par un poll) ;
// les 2 et 3 rattrapent un profil dont l'horodatage manquerait (colonne posée
// le 18/07, comptes antérieurs). Aucun drapeau local, jamais : un localStorage
// dit ce que CET appareil a vu, pas ce que le compte a.
// Appelée SEULEMENT quand extension_last_seen_at est NULL — deux lectures
// bornées à une ligne, sur des comptes neufs sans données.
import { supabase } from '../lib/supabase';

export async function extensionTraceeAilleurs(userId) {
  if (!userId) return false;
  try {
    const [jobs, runs] = await Promise.all([
      supabase.from('cross_post_jobs').select('id').eq('user_id', userId).not('handler_build', 'is', null).limit(1),
      supabase.from('vinted_sync_runs').select('id').eq('user_id', userId).not('extension_build', 'is', null).limit(1),
    ]);
    return (!jobs.error && (jobs.data?.length ?? 0) > 0)
      || (!runs.error && (runs.data?.length ?? 0) > 0);
  } catch {
    return false;
  }
}
