// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LA VILLE DE L'ANNONCE : LECTURE ET ÉCRITURE DU RÉGLAGE (30/10/2026, lot E)
// ═══════════════════════════════════════════════════════════════════════════
// Jusqu'ici l'annonce Leboncoin était TOUJOURS localisée à l'adresse de remise
// (Réglages › Expédition). Désormais une ville par défaut (Réglages), changeable
// à la publication (carte Leboncoin). La règle : publication/villeLbc.js.
// L'extension localise l'annonce à cette COMMUNE (« ville code_postal ») ; sans
// choix, rien ne change. Une republication garde la localisation de l'annonce
// d'origine (règle du 25/09) : c'est déjà la ville choisie.
// Écriture : platform_settings_fusionner seulement (fusionnerReglages).
import { supabase } from '../lib/supabase';
import { fusionnerReglages } from './reglagesPlateformes';
import { villeValide, villesDesReglages, CLE_VILLE_PUBLICATION_LBC } from '../publication/villeLbc';

export { villeValide, libelleVille, villePourLeJob, CHOIX_ADRESSE, CLE_VILLE_PUBLICATION_LBC } from '../publication/villeLbc';

// Une lecture par compte et par session de l'app, aucune relecture en boucle.
const memoire = new Map();
export async function lireVillesLbc(userId) {
  if (!userId) return { lue: false, reglage: null, adresse: null };
  if (memoire.has(userId)) return memoire.get(userId);
  try {
    const { data, error } = await supabase.from('profiles').select('platform_settings').eq('id', userId).maybeSingle();
    if (error) return { lue: false, reglage: null, adresse: null };
    const r = { lue: true, ...villesDesReglages(data?.platform_settings) };
    memoire.set(userId, r);
    return r;
  } catch {
    return { lue: false, reglage: null, adresse: null };
  }
}

/** Retient la ville par défaut (null = revenir à l'adresse de remise). Rend { ok }. */
export async function enregistrerVilleLbc(userId, v) {
  const x = villeValide(v);
  const { error } = x
    ? await fusionnerReglages(['leboncoin'], { [CLE_VILLE_PUBLICATION_LBC]: x })
    : await fusionnerReglages(['leboncoin'], null, [CLE_VILLE_PUBLICATION_LBC]);
  if (!error && userId) memoire.set(userId, { ...(memoire.get(userId) ?? { lue: true, adresse: null }), reglage: x });
  return { ok: !error };
}
