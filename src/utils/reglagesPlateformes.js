// ═══════════════════════════════════════════════════════════════════════════
// profiles.platform_settings — LA SEULE FAÇON D'ÉCRIRE (02/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Incident du 02/10 : des adresses Leboncoin (et d'autres réglages) avaient
// disparu. Chaque écrivain lisait l'objet entier, changeait une clé et
// RÉÉCRIVAIT L'OBJET ENTIER : une lecture ratée (`cur?.platform_settings ||
// {}`) ou deux écritures simultanées, et tout le reste partait.
//
// Désormais on n'envoie que CE QUI CHANGE, à un emplacement précis ; le
// serveur relit la ligne sous verrou et fusionne (RPC platform_settings_
// fusionner, migration 20261002153000). Une garde en base refuse en plus toute
// écriture qui ferait disparaître une clé existante.
//
//   chemin    : ['leboncoin'], ['vinted', 'republish_auto'], ['extension_jours']…
//   patch     : objet → fusionné dans l'objet visé (viser le plus profond) ;
//               autre (tableau, booléen…) → remplace la valeur à cet endroit ;
//               null → aucun ajout (suppression seule).
//   supprimer : clés à retirer de l'objet visé, et elles seules.
// Rend { data: platform_settings complet après écriture, error }.
//
// ⛔ Jamais `.update({ platform_settings: … })` sur profiles : c'est ce geste
//    qui effaçait les réglages, et la garde le refuse désormais.
import { supabase } from '../lib/supabase';

export async function fusionnerReglages(chemin, patch, supprimer = []) {
  const { data, error } = await supabase.rpc('platform_settings_fusionner', {
    p_chemin: chemin,
    p_patch: patch ?? null,
    p_supprimer: supprimer,
  });
  return { data: data && typeof data === 'object' ? data : null, error };
}
