// ═══════════════════════════════════════════════════════════════════════════
// Selftest de la PALETTE VINTED (2026-09-07)
//   node scripts/vinted-couleurs-selftest.mjs
//
// `vintedColors.js` est la DERNIÈRE table de valeurs écrite en dur du produit :
// partout ailleurs, les listes fermées se lisent sur la page au remplissage.
// Elle survit pour une raison technique nommée : la couleur est normalisée par
// l'APP au clic Publier, bien avant que la page Vinted existe — l'app n'a donc
// aucune page à lire. Ce que ce test protège, c'est qu'elle ne vieillisse pas
// en silence.
//
// RELEVÉ DE RÉFÉRENCE — lu sur le VRAI formulaire le 07/09/2026 au soir
// (vinted.fr/items/new, session de Nico, panneau Couleur ouvert) :
//   · 29 libellés, identiques à la table et DANS LE MÊME ORDRE ;
//   · palette GLOBALE, pas par catégorie : rigoureusement la même sur
//     « Femmes > Vêtements > Robes > Robes longues » et sur
//     « Maison > Textiles > Linge de lit > Taies d'oreiller » ;
//   · ⚠️ l'API d'origine (GET /api/v2/colors, qui avait servi au relevé du
//     30/07) répond désormais 403 — la page reste la seule source lisible.
//
// Si ce test échoue, la table a été modifiée : RE-RELEVER SUR LA PAGE avant de
// changer la référence ci-dessous. Ne jamais aligner la référence sur la table
// « pour faire passer le test » — ce serait exactement le défaut qu'il surveille.
// ═══════════════════════════════════════════════════════════════════════════
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { VINTED_COLORS, normalizeVintedColors } = await import(
  pathToFileURL(join(ROOT, "src/utils/vintedColors.js")).href
);

let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.log(`  ✗ ${nom} ${extra}`); }
};

const RELEVE_07_09 = [
  "Noir", "Gris", "Blanc", "Crème", "Beige", "Abricot", "Orange", "Corail",
  "Rouge", "Bordeaux", "Fuchsia", "Rose", "Violet", "Lila", "Bleu clair",
  "Bleu", "Marine", "Turquoise", "Menthe", "Vert", "Vert foncé", "Kaki",
  "Marron", "Moutarde", "Jaune", "Argenté", "Doré", "Multicolore", "Transparence",
];

console.log("1. La table est celle du relevé du 07/09 :");
check(`${RELEVE_07_09.length} libellés`, VINTED_COLORS.length === RELEVE_07_09.length,
  `(${VINTED_COLORS.length})`);
const disparues = RELEVE_07_09.filter((c) => !VINTED_COLORS.includes(c));
const nouvelles = VINTED_COLORS.filter((c) => !RELEVE_07_09.includes(c));
check("aucun libellé du relevé absent de la table", disparues.length === 0, disparues.join(", "));
check("aucun libellé de la table absent du relevé", nouvelles.length === 0, nouvelles.join(", "));
check("même ordre que le panneau Vinted",
  VINTED_COLORS.every((c, i) => c === RELEVE_07_09[i]));

console.log("\n2. Jamais « au plus proche » :");
// Ces trois-là ne sont PAS des couleurs de la palette : elles doivent partir en
// color_unmapped, pas être rapprochées d'une voisine.
for (const brut of ["Bleu marine électrique", "Vert d'eau", "Taupe"]) {
  const r = normalizeVintedColors(brut);
  const exactes = (r.colors ?? []).every((c) => VINTED_COLORS.includes(c));
  check(`« ${brut} » → uniquement des libellés EXACTS de la palette`, exactes,
    `(${JSON.stringify(r.colors)})`);
}
// Les variantes documentées, elles, doivent tomber juste.
for (const [brut, attendu] of [["Argent", "Argenté"], ["bleu marine", "Marine"], ["or", "Doré"]]) {
  const r = normalizeVintedColors(brut);
  check(`« ${brut} » → ${attendu}`, (r.colors ?? [])[0] === attendu, `(${JSON.stringify(r.colors)})`);
}

console.log(echecs ? `\n${echecs} ÉCHEC(S)` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
