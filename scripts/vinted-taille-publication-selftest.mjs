// ═══════════════════════════════════════════════════════════════════════════
// Selftest de la CONVERSION DE TAILLE À LA PUBLICATION VINTED (2026-09-15)
//   node scripts/vinted-taille-publication-selftest.mjs
//
// CE QU'IL PROTÈGE — la règle du 10/09 : JAMAIS une taille approchée. Le champ
// vide et un needs_user valent mieux qu'une valeur fausse sur l'annonce de
// quelqu'un. La conversion nombre → lettre ne doit sortir QUE sur la branche
// Femmes, QUE pour un nombre de la grille femme, QUE si la grille est relevée
// et porte la lettre, et JAMAIS si la grille propose déjà le nombre nu.
//
// Le cas qui rend ce test nécessaire : « Femmes > Chaussures > Baskets » est
// une grille de POINTURES qui contient « 36 ». Une conversion 36 → S y serait
// une taille de vêtement posée sur une chaussure — exactement le genre de
// valeur fausse qu'on refuse. C'est le premier test ci-dessous.
//
// Il fait tourner LE CODE RÉELLEMENT DÉPLOYÉ : la fonction est importée de
// supabase/functions/_shared/vinted-taille-republication.ts, jamais recopiée.
// Les grilles sont des relevés PROD (platform_category_aspects, 15/09), pas
// des inventions — le premier segment de chacune est reproduit tel quel.
// ═══════════════════════════════════════════════════════════════════════════
import { tailleAServirPublication, TAILLE_FEMME_LETTRE_PAR_NOMBRE }
  from "../supabase/functions/_shared/vinted-taille-republication.ts";

// ── Grilles RELEVÉES en prod le 15/09 ──────────────────────────────────────
// « Femmes > Vêtements > Blazers et tailleurs > Blazers » : 103 options, dont
// l'onglet lettres (celui que le DOM rend) puis les onglets EU / UK / FR…
const GRILLE_FEMME_VETEMENTS = [
  "XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL",
  "4XL", "5XL", "6XL", "7XL", "8XL", "9XL", "Autre", "Taille unique",
  "EU 30", "EU 32", "EU 34", "EU 36", "EU 38", "EU 40", "EU 42", "EU 44",
  "EU 46", "EU 48", "EU 50", "EU 52", "EU 54", "EU 56", "EU 58",
  "UK 2", "UK 4", "UK 6", "UK 8", "UK 10", "UK 12",
];
// « Femmes > Chaussures > Baskets » : 27 options, pointures nues.
const GRILLE_FEMME_CHAUSSURES = [
  "34", "34.5", "35", "35.5", "36", "36.5", "37", "37.5", "38", "38.5",
  "39", "39.5", "40", "40.5", "41", "41.5", "42",
];
// « Hommes > Vêtements > Sweats et pulls > Pulls ras de cou » : 13 options.
const GRILLE_HOMME = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL", "Taille unique"];
// « Enfants > Vêtements pour filles > Chemises et t-shirts > T-shirts »
const GRILLE_ENFANT = [
  "Prématuré, jusqu'à 44cm", "Naissance / 44 cm", "1-3 mois / 56 cm",
  "3 ans / 98 cm", "4 ans / 104 cm", "8 ans / 128 cm",
];

let ko = 0;
const t = (nom, cond) => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}`); };
const sert = (taille, chemin, options) => tailleAServirPublication({ taille, cheminCategorie: chemin, options });

console.log("\n[1] CE QU'ON NE CONVERTIT JAMAIS");
{
  const r = sert("36", "Femmes > Chaussures > Baskets", GRILLE_FEMME_CHAUSSURES);
  t("pointure 36 (grille qui propose déjà « 36 ») → refusé", r.valeur === null);
  t("   motif nommé : la grille porte déjà le nombre", /déjà une option/.test(r.motif ?? ""));
}
t("36 sur la branche Hommes → refusé",
  sert("36", "Hommes > Vêtements > Sweats et pulls > Pulls ras de cou", GRILLE_HOMME).valeur === null);
t("36 sur la branche Enfants → refusé",
  sert("36", "Enfants > Vêtements pour filles > Chemises et t-shirts > T-shirts", GRILLE_ENFANT).valeur === null);
t("46 (hors grille femme 30→44) → refusé",
  sert("46", "Femmes > Vêtements > Jupes", GRILLE_FEMME_VETEMENTS).valeur === null);
t("grille NON relevée → refusé (on n'invente pas un libellé)",
  sert("36", "Femmes > Vêtements > Blazers et tailleurs > Blazers", null).valeur === null);
t("lettre cible absente de la grille relevée → refusé",
  sert("30", "Femmes > Vêtements > X", ["S", "M", "L", "Autre"]).valeur === null);
t("chemin de catégorie absent → refusé",
  sert("36", "", GRILLE_FEMME_VETEMENTS).valeur === null);

console.log("\n[2] LES DEUX CAS RÉELS D'ORNELLA (jobs 6aefaa2b et 55d99d75/dab128c6)");
{
  const blazer = sert("36", "Femmes > Vêtements > Blazers et tailleurs > Blazers", GRILLE_FEMME_VETEMENTS);
  t("blazer « 36 » → « S »", blazer.valeur === "S");
  const jupe = sert("42", "Femmes > Vêtements > Jupes", GRILLE_FEMME_VETEMENTS);
  t("jupe « 42 » → « XL »", jupe.valeur === "XL");
  t("la trace dit d'où vient la valeur", /grille femme Vinted/.test(blazer.detail ?? ""));
}

console.log("\n[3] LA TABLE, EN ENTIER, CONTRE LA GRILLE RELEVÉE");
for (const [nombre, lettre] of Object.entries(TAILLE_FEMME_LETTRE_PAR_NOMBRE)) {
  const r = sert(nombre, "Femmes > Vêtements > Jupes", GRILLE_FEMME_VETEMENTS);
  t(`${nombre} → ${lettre}`, r.valeur === lettre);
}

console.log("\n[4] FORMES HORS PÉRIMÈTRE — comportement inchangé");
t("une lettre (« M ») n'a rien à convertir",
  sert("M", "Femmes > Vêtements > Jupes", GRILLE_FEMME_VETEMENTS).valeur === null);
t("une forme préfixée (« EU 36 ») reste au chemin republication",
  sert("EU 36", "Femmes > Vêtements > Jupes", GRILLE_FEMME_VETEMENTS).valeur === null);
t("« Taille unique » n'est pas un nombre",
  sert("Taille unique", "Femmes > Vêtements > Jupes", GRILLE_FEMME_VETEMENTS).valeur === null);
t("un chemin en anglais (« Women > … ») est reconnu",
  sert("38", "Women > Clothing > Skirts", GRILLE_FEMME_VETEMENTS).valeur === "M");

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : "\nTOUS LES CONTRÔLES PASSENT");
process.exit(ko ? 1 : 0);
