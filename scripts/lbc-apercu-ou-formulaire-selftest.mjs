// ═══════════════════════════════════════════════════════════════════════════
// Selftest : APERÇU ou FORMULAIRE ? (2026-09-10)
//   node scripts/lbc-apercu-ou-formulaire-selftest.mjs
//
// LE BUG QUI A COÛTÉ UNE JOURNÉE. Deux causes radicalement différentes se sont
// retrouvées sous le même message « l'aperçu Leboncoin est resté affiché » :
//   · Choupette (Pantalon) EST sur l'aperçu — description de 9 caractères,
//     minimum 10 chez Leboncoin, le Continuer est inerte ;
//   · Victor (costume) n'a JAMAIS atteint l'aperçu — son formulaire n'est pas
//     fini (« Vos conditions générales de vente », « Référence », « Prix neuf »).
// estEncoreApercu() répondait « oui » aux deux, parce que #price_cents et
// location existent AUSSI dans le formulaire.
//
// Les deux jeux de titres ci-dessous sont RECOPIÉS des relevés en base
// (platform_fields → error → « Observabilité: … titres [...] »).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(ROOT, "chrome-extension/content-scripts/leboncoin.js"), "utf8");

let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.log(`  ✗ ${nom} ${extra}`); }
};

// ── Extraction du code RÉELLEMENT embarqué ─────────────────────────────────
const bloc = SRC.slice(SRC.indexOf("const TITRE_APERCU_RE"), SRC.indexOf("const champsVidesApercu"));
if (!bloc.includes("estEncoreFormulaire")) throw new Error("bloc aperçu/formulaire introuvable");

/** Mini-DOM : uniquement ce que le bloc touche (h1/h2/h3, querySelector). */
const faireDocument = (titres, { avecChampsFormulaire = true } = {}) => ({
  querySelectorAll: (sel) =>
    /h1|h2|h3/.test(sel) ? titres.map((t) => ({ textContent: t })) : [],
  querySelector: (sel) =>
    (avecChampsFormulaire && /price_cents|location/.test(sel)) ? {} : null,
  body: { textContent: titres.join(" ") },
});

const construire = (doc) => new Function(
  "document", "estVisibleParStyles",
  `${bloc}\nreturn { estEncoreApercu, estEncoreFormulaire };`,
)(doc, () => true);

// Relevés RÉELS
const TITRES_CHOUPETTE = ["Déposer une annonce", "Un dernier aperçu avant de publier votre annonce !",
                          "Galerie", "Présentation", "Informations clés"];
const TITRES_VICTOR = ["Déposer une annonce", "Ajoutez des photos", "Décrivez votre bien !",
                       "Dites-nous en plus", "Quel est votre prix ?"];

console.log("\n▸ Choupette — elle EST sur l'aperçu");
{
  const f = construire(faireDocument(TITRES_CHOUPETTE));
  check("estEncoreApercu = true", f.estEncoreApercu() === true);
  check("estEncoreFormulaire = false", f.estEncoreFormulaire() === false);
}

console.log("\n▸ Victor — il n'a JAMAIS atteint l'aperçu (le bug)");
{
  const f = construire(faireDocument(TITRES_VICTOR));
  check("estEncoreApercu = FALSE — c'était `true` avant, et c'est là qu'était le bug",
    f.estEncoreApercu() === false,
    "— #price_cents et location existent aussi dans le formulaire");
  check("estEncoreFormulaire = true (l'étape est nommée)", f.estEncoreFormulaire() === true);
}

console.log("\n▸ La preuve positive l'emporte sur l'indice");
{
  // Titres d'aperçu ET d'étapes ensemble (SPA qui garde tout dans le DOM) :
  // l'aperçu gagne, sinon on refuserait de conclure sur une page valide.
  const f = construire(faireDocument([...TITRES_VICTOR, ...TITRES_CHOUPETTE]));
  check("aperçu + formulaire → APERÇU", f.estEncoreApercu() === true);
  check("… et donc pas « formulaire »", f.estEncoreFormulaire() === false);
}

console.log("\n▸ Aucun titre connu : comportement d'AVANT, inchangé");
{
  const avec = construire(faireDocument(["Une page inconnue"], { avecChampsFormulaire: true }));
  check("marqueurs de champs présents → aperçu (comme avant)", avec.estEncoreApercu() === true);
  const sans = construire(faireDocument(["Une page inconnue"], { avecChampsFormulaire: false }));
  check("aucun marqueur → pas l'aperçu (comme avant)", sans.estEncoreApercu() === false);
  check("et jamais « formulaire » sans titre d'étape", sans.estEncoreFormulaire() === false);
}

// ── LE FORMULAIRE N'EST PAS « VOS COORDONNÉES » (2026-09-15) ────────────────
// Ce que le 10/09 n'avait pas vu : le verdict ci-dessus vit dans la branche
// `if (!etape)` de la boucle post-aperçu, et `etape` n'est jamais nul quand
// attendreEcranSuivant trouve un téléphone VISIBLE et REMPLI — ce que porte
// justement le formulaire des comptes Leboncoin PRO (téléphone Pro exigé au
// dépôt). Les 10 jobs de Victor (11/09) et MeMiniandMove (15/09) sortaient
// donc sur « chemin gratuit toujours introuvable (écran Vos coordonnées
// recliqué trois fois) » — un écran /options jamais atteint, un écran
// coordonnées jamais vu — et le verdict nommé n'a JAMAIS été imprimé
// (0 job en 30 jours, mesuré en base).
console.log("\n▸ Le formulaire ne part PAS dans la branche « Vos coordonnées »");
{
  const attente = SRC.slice(SRC.indexOf("const attendreEcranSuivant"), SRC.indexOf("const refusApercu"));
  check("attendreEcranSuivant écarte le formulaire",
    /if \(estEncoreFormulaire\(\)\) return null;/.test(attente));
  check("… AVANT de chercher un téléphone (l'ordre est le correctif)",
    attente.indexOf("estEncoreFormulaire()") < attente.indexOf("findContactPhone()"),
    "— sinon le téléphone Pro du formulaire regagne la branche coordonnées");
  check("le premier tour laisse 15 s au formulaire, pas 600 ms",
    /ecran === 0 && !estEncoreFormulaire\(\) \? 600 : 15_000/.test(SRC),
    "— déclarer « pas passé » 600 ms après le clic serait malhonnête");
}

console.log("\n▸ Le message ne ment plus");
{
  check("un verdict « formulaire pas terminé » existe",
    /Le formulaire Leboncoin de ton compte n'a pas été accepté/.test(SRC));
  check("il relève ce qui bloque SANS la troncature à 8 du relevé d'écran",
    /const releveRefusFormulaire = \(\) => \{/.test(SRC)
    && /champs REQUIS vides \(\$\{requisVides\.length\}\)/.test(SRC)
    && /champs vides \(\$\{vides\.length\}\)/.test(SRC),
    "— dumpEcranVisible s'arrête à 8 champs, le champ qui refuse vit au-delà");
  check("une case à cocher requise se lit sur `checked`, jamais sur `value`",
    /el\.type === "checkbox" \|\| el\.type === "radio"\) return el\.checked !== true/.test(SRC),
    "— une case non cochée porte value=\"on\"");
  check("la liste des champs reste une ANNEXE, jamais l'écran (règle du 02/09)",
    /— Observabilité: \$\{annexe\}/.test(SRC));
  check("les validations natives sont lues (validationMessage / aria-invalid)",
    /validationMessage/.test(SRC) && /aria-invalid/.test(SRC));
  // On teste le CODE, pas les commentaires : le bandeau de la fonction cite
  // checkValidity() précisément pour dire qu'on ne l'appelle pas.
  const codeSeul = SRC.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  check("lecture PURE : checkValidity() n'est jamais APPELÉ (il émettrait un événement `invalid`)",
    !/\.checkValidity\s*\(/.test(codeSeul), "— on lit el.validity.valid");
  check("… et c'est bien validity.valid qui est lu", /validity\s*&&\s*el\.validity\.valid === false/.test(codeSeul));
}

console.log(
  echecs === 0
    ? "\n[selftest:lbc-apercu-ou-formulaire] OK — l'aperçu se prouve, il ne se devine plus.\n"
    : `\n[selftest:lbc-apercu-ou-formulaire] ÉCHEC — ${echecs} vérification(s) en défaut.\n`,
);
process.exit(echecs === 0 ? 0 : 1);
