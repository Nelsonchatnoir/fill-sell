// Auto-test « un DVD n'est pas un livre » (07/09/2026) — deux garanties :
//
//   1. Les DEUX copies du prédicat (src/utils/shared.js côté app, commit
//      9958a8f ; supabase/functions/_shared/support-non-livre.ts côté serveur)
//      portent les MÊMES regex, caractère pour caractère : SUPPORT_NON_LIVRE_RE
//      et LIVRE_EXPLICITE_RE. Une copie qui dérive fait échouer ce test — Deno
//      ne peut pas importer src/, la copie est inévitable, la dérive ne l'est pas.
//   2. Le prédicat serveur, exécuté tel quel, rend :
//        · true  sur le lot de 24 DVD d'Ornella (le cas fondateur) ;
//        · false sur « La Méthode Delavier de Musculation » (leçon Delavier :
//          un sujet n'est pas un support) ;
//        · false sur un livre vendu avec un CD (désarmement « livre ») ;
//        · true  sur un jeu vidéo, un vinyle, une console.
//
//   node scripts/support-non-livre-selftest.mjs
//
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.log(`  ✗ ${nom} ${extra}`); }
};

// ── 1. Identité des deux copies ──────────────────────────────────────────
function regexDe(source, nom) {
  const m = source.match(new RegExp(`export const ${nom} =\\s*\\n?\\s*(\\/.*\\/[a-z]*);`));
  return m ? m[1] : null;
}
const app = lire("src/utils/shared.js");
const srv = lire("supabase/functions/_shared/support-non-livre.ts");
console.log("1. Copies app / serveur :");
for (const nom of ["SUPPORT_NON_LIVRE_RE", "LIVRE_EXPLICITE_RE"]) {
  const a = regexDe(app, nom), s = regexDe(srv, nom);
  check(`${nom} trouvée dans les deux fichiers`, Boolean(a && s), `(app: ${Boolean(a)}, serveur: ${Boolean(s)})`);
  check(`${nom} identique octet pour octet`, Boolean(a && s) && a === s, a && s ? `\n      app     : ${a}\n      serveur : ${s}` : "");
}

// ── 2. Comportement du prédicat SERVEUR (transpilé à la volée : le fichier
//      .ts n'a qu'une annotation de type, retirée ici) ───────────────────────
const tsSansTypes = srv.replace("(...textes: unknown[]): boolean", "(...textes)");
const tmp = join(ROOT, "scripts", ".support-non-livre-selftest.tmp.mjs");
fs.writeFileSync(tmp, tsSansTypes);
const mod = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);
const { estSupportNonLivre } = mod;
console.log("2. Prédicat serveur :");
const cas = [
  ["Lot de 24 DVD animation Disney et jeunesse", true, "DVD (cas fondateur Ornella)"],
  ["La Méthode Delavier de Musculation pour la Femme", false, "sujet ≠ support (leçon Delavier)"],
  ["Livre méthode de piano débutant avec CD inclus", false, "livre + CD = livre (désarmement)"],
  ["Roman policier édition collector + DVD du film", false, "roman + DVD = livre (désarmement)"],
  ["Jeu vidéo Mario Kart Nintendo Switch", true, "jeu vidéo"],
  ["Vinyle 33 tours Pink Floyd", true, "vinyle"],
  ["Console PlayStation 4 avec 2 manettes", true, "console"],
  ["Coffret 3 Blu-ray Le Seigneur des Anneaux", true, "blu-ray"],
  ["Film d'aventure – édition spéciale", false, "« film » seul = sujet, pas un support"],
  ["", false, "texte vide"],
];
for (const [texte, attendu, libelle] of cas) {
  const obtenu = estSupportNonLivre(texte);
  check(`${libelle} → ${attendu}`, obtenu === attendu, `(obtenu ${obtenu} sur « ${texte} »)`);
}
// Cas « Méthode de piano avec CD » : SANS le mot livre, la règle rend true
// (c'est un choix assumé et documenté dans shared.js : le désarmement ne
// connaît que les mots livre/roman/manga/tome/BD). On le vérifie tel quel
// pour que toute évolution soit VUE, pas subie.
check("« Méthode de piano débutant avec CD inclus » (sans « livre ») → true, comportement documenté", estSupportNonLivre("Méthode de piano débutant avec CD inclus") === true);

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ tout passe");
process.exit(echecs ? 1 : 0);
