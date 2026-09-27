// ═══════════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR — LES GRILLES DE COLIS VINTED, PAR RAYON (2026-09-27)
//   node scripts/gen-vinted-colis-grilles.mjs
//
// Produit src/utils/arbres/vintedColisGrilles.js à partir du RELEVÉ
// docs/vinted-colis-grilles-releve.json. Rien n'est écrit à la main : un rayon
// dont la grille n'a pas été observée sur une vraie annonce n'est pas dans le
// fichier, et l'app ne propose alors AUCUN choix (Vinted garde la main).
//
// D'OÙ VIENT LE RELEVÉ — la requête, à relancer telle quelle pour le
// rafraîchir (npx supabase db query --linked -f …), puis écrire ses lignes
// dans le JSON (chemin, grille, observations) :
//
//   with obs as (
//     select array_to_string(array(select jsonb_array_elements_text(c.libelles->'categoryPath')), ' > ') chemin,
//            case when (c.payload->'natif'->>'package_size_id')::int in (1,2,3) then 'PMG'
//                 when (c.payload->'natif'->>'package_size_id')::int in (8,9,10) then 'KG3'
//                 when (c.payload->'natif'->>'package_size_id')::int between 11 and 14 then 'KG4' end grp,
//            c.captured_at quand
//       from vinted_republish_captures c
//      where c.payload->'natif'->>'package_size_id' ~ '^\d+$' and jsonb_typeof(c.libelles->'categoryPath')='array'
//     union all
//     select array_to_string(array(select jsonb_array_elements_text(i.attributs->'categorie_vinted'->'chemin')), ' > '),
//            'PMG', (i.attributs->'colis'->>'at')::timestamptz
//       from inventaire i
//      where i.attributs->'colis'->>'v' in ('Petit','Moyen','Grand') and jsonb_typeof(i.attributs->'categorie_vinted'->'chemin')='array'
//   ), par as (select chemin, grp, count(*) n, max(quand) dernier from obs where grp is not null and chemin <> '' group by 1,2),
//   rang as (select *, row_number() over (partition by chemin order by dernier desc nulls last) r from par)
//   select chemin, grp, n from rang where r = 1 order by chemin;
//
// POURQUOI « L'OBSERVATION LA PLUS RÉCENTE » : un seul rayon sur 567 a montré
// deux grilles (Plateaux, 16/08 en kilos puis 04/09 en Petit/Moyen/Grand) —
// Vinted a changé sa grille ; c'est la dernière vue qui vaut.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "docs/vinted-colis-grilles-releve.json");
const SORTIE = join(ROOT, "src/utils/arbres/vintedColisGrilles.js");
const GRILLES_CONNUES = new Set(["PMG", "KG3", "KG4"]);

const releve = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
const lignes = (releve.grilles ?? []).filter((g) => g && g.chemin && GRILLES_CONNUES.has(g.grille));
const dico = [];
const indice = new Map();
const seg = (s) => {
  if (!indice.has(s)) { indice.set(s, dico.length); dico.push(s); }
  return indice.get(s);
};
const entrees = lignes
  .sort((a, b) => a.chemin.localeCompare(b.chemin, "fr"))
  .map((g) => [g.chemin.split(" > ").map(seg), g.grille]);

const texte =
  "// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.\n" +
  "//   node scripts/gen-vinted-colis-grilles.mjs\n" +
  `// Source : docs/vinted-colis-grilles-releve.json (relevé du ${releve.releve_le}).\n` +
  `// ${entrees.length} rayons dont la grille de colis a été VUE sur une vraie annonce.\n` +
  "// D = dictionnaire des libellés ; G = [ [indices du chemin], grille ].\n" +
  `const D = ${JSON.stringify(dico)};\n` +
  `const G = ${JSON.stringify(entrees)};\n\n` +
  "/** Chemin « A > B > C » → code de grille ('PMG' | 'KG3' | 'KG4'). */\n" +
  "export const GRILLE_PAR_CHEMIN = new Map(G.map(([c, g]) => [c.map((i) => D[i]).join(\" > \"), g]));\n" +
  `export const RELEVE_LE = ${JSON.stringify(releve.releve_le)};\n`;
fs.writeFileSync(SORTIE, texte);
console.log(`${entrees.length} rayons → ${SORTIE}`);
