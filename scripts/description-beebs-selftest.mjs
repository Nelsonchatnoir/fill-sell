// Auto-test du minimum de 5 caractères de la description Beebs (2026-09-13,
// dossier Joséphine) — supabase/functions/_shared/description-beebs.ts,
// exécuté TEL QUEL par Node (types retirés à la volée, Node ≥ 23).
//
// Chaque cas vient d'un job RÉEL du 13/09 (4 dépôts refusés « Ajouter au
// moins 5 caractères », description vide) ou du job qui est passé (135 car.).
// Le test verrouille :
//   · vide → titre + faits vrais du job, dans l'ordre titre/état/marque/taille ;
//   · une marque « vide » (aucune, sans, Sans marque) n'entre pas dans la phrase ;
//   · ≥ 5 caractères → INTACT (la description de la vendeuse part telle quelle) ;
//   · sans titre ni fait → original rendu, modifiee=false (jamais fabriqué) ;
//   · idempotence (compléter deux fois = une fois).
//
//   node scripts/description-beebs-selftest.mjs
//
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const mod = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/description-beebs.ts")).href);
const { completerDescriptionBeebs: c, BEEBS_DESCRIPTION_MIN } = mod;

let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.error(`  ✗ ${nom}${extra ? ` — ${extra}` : ""}`); }
};
const egal = (nom, a, b) => check(nom, a === b, `\n      obtenu : ${JSON.stringify(a)}\n      attendu: ${JSON.stringify(b)}`);

console.log("▸ constante");
egal("minimum Beebs = 5", BEEBS_DESCRIPTION_MIN, 5);

console.log("▸ Robe volants 36 (e763c307) : vide → titre + état + taille, marque « Sans marque » écartée");
{
  const r = c("", { titre: "Robe volants 36", etat: "Neuf, sans étiquette", marque: "Sans marque", taille: "S / 36" });
  check("modifiée", r.modifiee);
  egal("texte", r.texte, "Robe volants 36 — Neuf, sans étiquette — Taille S / 36");
  egal("ajouts", JSON.stringify(r.ajouts), JSON.stringify(["Robe volants 36", "Neuf, sans étiquette", "Taille S / 36"]));
}

console.log("▸ Mini jupe Cache Cache 36 (a82928d0) : marque réelle conservée");
{
  const r = c("", { titre: "Mini jupe Cache Cache 36", etat: "Très bon état", marque: "Cache Cache", taille: "S / 36" });
  egal("texte", r.texte, "Mini jupe Cache Cache 36 — Très bon état — Taille S / 36");
  check("la marque déjà dans le titre n'est pas répétée", !r.ajouts.includes("Cache Cache"));
}

console.log("▸ Robe été S (39a6e5ed) : marque « aucune » écartée");
{
  const r = c("   ", { titre: "Robe été S", etat: "Très bon état", marque: "aucune", taille: "S / 36" });
  egal("texte", r.texte, "Robe été S — Très bon état — Taille S / 36");
}

console.log("▸ Sac à main (a5b55b59) : sans taille, marque « Sans »");
{
  const r = c("", { titre: "Sac à main", etat: "Très bon état", marque: "Sans", taille: "" });
  egal("texte", r.texte, "Sac à main — Très bon état");
}

console.log("▸ Celio Jeans (d322affa, passé avec 135 car.) : INTACT");
{
  const t = "Jeans Celio taille 40 pour homme. Coupe classique, coloris bleu denim. Article en bon état, prêt à porter.\n\n#celio #jeans #homme #denim";
  const r = c(t, { titre: "Celio Jeans 40 Homme", etat: "Très bon état", marque: "Celio", taille: "40" });
  check("non modifiée", !r.modifiee);
  egal("texte identique", r.texte, t);
}

console.log("▸ bornes");
{
  const r = c("Super", { titre: "Robe", etat: "Bon état" });
  check("5 caractères exactement → intact", !r.modifiee && r.texte === "Super");
  const r2 = c("Top", { titre: "Robe fluide S", etat: "Bon état" });
  egal("3 caractères → complété à partir du texte, pas du titre", r2.texte, "Top — Bon état");
  const r3 = c("", {});
  check("rien de connu → original rendu, non modifiée", !r3.modifiee && r3.texte === "");
  const r4 = c("", { titre: "Sac" });
  check("titre trop court et rien d'autre → non modifiée (jamais fabriqué)", !r4.modifiee && r4.texte === "");
  const une = c("", { titre: "Pull Only S", etat: "Très bon état", marque: "ONLY", taille: "S / 36" });
  const deux = c(une.texte, { titre: "Pull Only S", etat: "Très bon état", marque: "ONLY", taille: "S / 36" });
  check("idempotent", !deux.modifiee && deux.texte === une.texte);
  check("null → vide, non modifiée", !c(null, {}).modifiee);
}

console.log(echecs ? `\n${echecs} échec(s)` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
