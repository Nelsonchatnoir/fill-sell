// La sélection des ventes prouvées, lue DANS la migration 20261008233100 —
// jamais recopiée : le rattrapage à blanc, la mesure et les selftests jouent
// exactement le texte que la fonction `ventes_prouvees_a_enregistrer` portera
// en prod (corps entre `AS $candidates$` et `$candidates$;`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MIGRATION_VENTES_PROUVEES = path.join(RACINE, 'supabase', 'migrations', '20261008233100_ventes_prouvees_automatiques.sql');

export function corpsSelection(texte = fs.readFileSync(MIGRATION_VENTES_PROUVEES, 'utf8')) {
  const m = texte.match(/AS \$candidates\$\n([\s\S]*?)\n\$candidates\$;/);
  if (!m) throw new Error('corps de ventes_prouvees_a_enregistrer introuvable dans la migration');
  return m[1];
}

const litteral = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

/**
 * Le SELECT de la sélection, paramètres remplacés par des littéraux.
 * sansRefus : retire le filtre des refus mémorisés (table absente tant que la
 * migration n'est pas appliquée — le rattrapage à blanc tourne AVANT).
 */
export function requeteSelection({ depuis = '-infinity', limite = 1000, user = null, job = null, ignorerRefus = true, sansRefus = false } = {}, texte) {
  let sql = corpsSelection(texte);
  if (sansRefus) sql = sql.replace(/\/\*refus\*\/[\s\S]*?\/\*fin refus\*\//, '');
  sql = sql
    .replace(/\bp_depuis\b/g, `${litteral(depuis)}::timestamptz`)
    .replace(/\bp_limite\b/g, String(Number(limite)))
    .replace(/\bp_user\b/g, user ? `${litteral(user)}::uuid` : 'NULL::uuid')
    .replace(/\bp_job\b/g, job ? `${litteral(job)}::uuid` : 'NULL::uuid')
    .replace(/\bp_ignorer_refus\b/g, ignorerRefus ? 'true' : 'false')
    .replace(/;\s*$/, '');
  // Les colonnes portent les noms du RETURNS TABLE de la fonction.
  return `SELECT * FROM (${sql}) AS sel(${COLONNES_SELECTION.join(', ')})`;
}

export const COLONNES_SELECTION = ['job_id', 'user_id', 'inventaire_id', 'platform', 'listing_id', 'preuve', 'preuve_le', 'prix'];
