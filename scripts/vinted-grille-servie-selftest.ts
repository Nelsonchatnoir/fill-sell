// `deno run --allow-read scripts/vinted-grille-servie-selftest.ts`
//
// « LA GRILLE NE CORRESPOND PAS » EST PARFOIS FAUX (2026-09-20).
//
// Ce test EXÉCUTE la règle que update-job-status applique pour choisir entre
// deux messages qui disent des choses opposées :
//   · « le formulaire n'a pas accepté Taille « S » … écris-nous et on regarde
//     la catégorie de l'annonce » — on envoie quelqu'un enquêter ;
//   · « le formulaire proposait bien Taille « S », mais notre saisie n'est pas
//     arrivée jusqu'à lui — ça vient de chez nous » — on n'envoie personne.
// Se tromper de message, c'est faire perdre du temps à quelqu'un sur un défaut
// qui est chez nous. Les valeurs ci-dessous sont celles du job e8e1cd5a,
// relevées en base.
import { valeurFigureDansListeServie, comparableLibelle } from "../supabase/functions/_shared/vinted-grille-servie.ts";

const LIBELLES: Record<string, string> = { taille: "Taille", etat: "État", marque: "Marque", couleur: "Couleur" };
let ko = 0;
const ok = (nom: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "  ok  " : "  ⚠ KO"} ${nom}${detail ? " — " + detail : ""}`);
  if (!cond) ko++;
};

// La liste EXACTE servie par Vinted sur le job e8e1cd5a.
const GRILLE_LETTRES = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL"];
const GRILLE_AGES = ["0-1 mois", "1-3 mois", "3-6 mois", "6-9 mois", "2 ans", "5 ans", "10 ans"];

console.log("=== LE CAS RÉEL : job e8e1cd5a, Blouse Caroll ===");
{
  const r = valeurFigureDansListeServie({
    champDemande: "taille", valeurs: { taille: "S", etat: "Très bon état" },
    listeServie: GRILLE_LETTRES, libelles: LIBELLES,
  });
  ok("« S » figure dans la liste servie ⇒ ce n'est PAS la grille", r.offerte === true, `champ ${r.champ}, valeur « ${r.valeur} »`);
}
{
  // Le libellé, pas la clé — c'est ce que porte `needsUserField.field_label`.
  const r = valeurFigureDansListeServie({
    champDemande: "Taille", valeurs: { taille: "S" }, listeServie: GRILLE_LETTRES, libelles: LIBELLES,
  });
  ok("le champ se reconnaît aussi par son LIBELLÉ", r.offerte === true);
}
{
  const r = valeurFigureDansListeServie({
    champDemande: "État", valeurs: { etat: "Très bon état" },
    listeServie: ["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"],
    libelles: LIBELLES,
  });
  ok("« Très bon état » figure aussi dans SA liste", r.offerte === true);
}

console.log("\n=== LA VRAIE INCOHÉRENCE DE GRILLE RESTE RECONNUE ===");
{
  // Le cas pour lequel le message d'origine a été écrit : taille enfant, grille adulte.
  const r = valeurFigureDansListeServie({
    champDemande: "taille", valeurs: { taille: "5 ans" }, listeServie: GRILLE_LETTRES, libelles: LIBELLES,
  });
  ok("« 5 ans » contre une grille de lettres ⇒ grille incohérente, message d'origine", r.offerte === false);
}
{
  const r = valeurFigureDansListeServie({
    champDemande: "taille", valeurs: { taille: "M" }, listeServie: GRILLE_AGES, libelles: LIBELLES,
  });
  ok("« M » contre une grille d'âges ⇒ grille incohérente", r.offerte === false);
}

console.log("\n=== ON NE CONCLUT JAMAIS SANS PREUVE ===");
ok("liste vide ⇒ on ne sait pas (false)",
  valeurFigureDansListeServie({ champDemande: "taille", valeurs: { taille: "S" }, listeServie: [], libelles: LIBELLES }).offerte === false);
ok("valeur vide ⇒ on ne sait pas (false)",
  valeurFigureDansListeServie({ champDemande: "taille", valeurs: { taille: "" }, listeServie: GRILLE_LETTRES, libelles: LIBELLES }).offerte === false);
ok("champ inconnu ⇒ on ne sait pas (false)",
  valeurFigureDansListeServie({ champDemande: "Pointure", valeurs: { taille: "S" }, listeServie: GRILLE_LETTRES, libelles: LIBELLES }).offerte === false);
ok("liste absente (non-tableau) ⇒ on ne sait pas (false)",
  valeurFigureDansListeServie({ champDemande: "taille", valeurs: { taille: "S" }, listeServie: null as unknown as unknown[], libelles: LIBELLES }).offerte === false);

console.log("\n=== LA COMPARAISON PARDONNE LA CASSE ET LES ACCENTS, RIEN D'AUTRE ===");
ok("« tres bon etat » retrouve « Très bon état »",
  valeurFigureDansListeServie({ champDemande: "etat", valeurs: { etat: "tres bon etat" }, listeServie: ["Très bon état"], libelles: LIBELLES }).offerte === true);
ok("« XS » ne passe pas pour « S »",
  valeurFigureDansListeServie({ champDemande: "taille", valeurs: { taille: "XS" }, listeServie: ["S", "M"], libelles: LIBELLES }).offerte === false);
ok("comparableLibelle réduit les espaces", comparableLibelle("  Très   Bon   État ") === "tres bon etat");

console.log(ko ? `\n⚠ ${ko} CAS EN ECHEC` : "\n✓ TOUS LES CAS PASSENT");
if (ko) Deno.exit(1);
