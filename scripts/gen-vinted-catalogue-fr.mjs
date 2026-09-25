// Régénère supabase/functions/_shared/vinted-catalogue-fr.js depuis l'API
// PUBLIQUE de vinted.fr (anonyme, aucune session) — 25/09/2026.
//   node scripts/gen-vinted-catalogue-fr.mjs
// Le module sert à retrouver l'identifiant d'un chemin français (zone euro,
// cf. _shared/vinted-ids-publication.ts). Toute différence avec le fichier en
// place se lit au diff git : un rayon renommé ou déplacé par Vinted s'y voit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CIBLE = path.join(ROOT, "supabase", "functions", "_shared", "vinted-catalogue-fr.js");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

const r0 = await fetch("https://www.vinted.fr/", { headers: { "user-agent": UA } });
const cookies = (r0.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const r = await fetch("https://www.vinted.fr/api/v2/item_upload/catalogs", {
  headers: { "user-agent": UA, accept: "application/json", cookie: cookies },
});
if (!r.ok) throw new Error(`catalogues : HTTP ${r.status}`);
const j = await r.json();
const rows = [];
const walk = (arr, parent) => { for (const c of arr ?? []) { rows.push([c.id, parent, c.title]); walk(c.catalogs, c.id); } };
walk(j.catalogs, 0);
if (rows.length < 2000) throw new Error(`arbre suspect : ${rows.length} rayons seulement`);
const jour = new Date().toISOString().slice(0, 10);
const tete = `// ============================================================================
// ARBRE DES CATALOGUES VINTED — FRANÇAIS — FICHIER GÉNÉRÉ, NE PAS ÉDITER À LA MAIN
// Source : GET https://www.vinted.fr/api/v2/item_upload/catalogs (anonyme),
// relevé le ${jour} — ${rows.length} rayons. Lignes [id, id_parent (0 = racine), libellé].
// Sert à retrouver l'IDENTIFIANT d'un chemin français (celui que l'app pose
// dans platform_fields.categoryPath) pour les comptes Vinted qui ne sont pas en
// français : la 0.6.69 pose la catégorie par identifiant (zone euro).
// Mêmes identifiants et même hiérarchie dans les 18 pays euro (relevé du
// 25/09/2026 ; ES : 21 rayons en moins, NL/BE : 142 en plus, LT : 124 en plus).
// Régénérer : scripts/gen-vinted-catalogue-fr.mjs.
// ============================================================================
export const CATALOGUE_VINTED_FR = `;
fs.writeFileSync(CIBLE, tete + JSON.stringify(rows) + ";\n");
console.log(`${rows.length} rayons écrits dans ${path.relative(ROOT, CIBLE)}`);
