// ═══════════════════════════════════════════════════════════════════════════
// SELFTEST — les trois défauts révélés par le lot du 21/09 au soir
// ═══════════════════════════════════════════════════════════════════════════
//   1. UNE TAILLE QUE PERSONNE N'A DITE n'est pas une taille : la rédaction a
//      posé « Prématuré » sur deux lots de BARRETTES dont la fiche n'a aucune
//      taille. Mesuré sur tout le parc publié : 10 annonces en ligne portent
//      une taille que leur fiche ne dit pas.
//   2. LA DESCENTE DE RAYON PROPOSE, elle ne décide pas seule : sur les
//      derbies de philippaa elle rendait « Chaussures à talon (femme) » pour
//      une chaussure plate.
//   3. UN ÉCRAN LEBONCOIN QUI NE PROPOSE QUE LE PAIEMENT n'est pas une panne :
//      on ne retente pas, et on ne clique jamais « Valider et payer ».
//
//   node --import ./scripts/loader-ext.mjs scripts/taille-rayon-paiement-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { tailleAGarder, estTailleNeutre, estTailleEnfant, tailleDiteParLeTexte } from "../src/utils/tailleInventee.js";
import { rayonContreditLaFiche } from "../src/utils/rayonIncoherent.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs += 1;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};

console.log("\n1. UNE TAILLE QUE PERSONNE N'A DITE N'EST PAS UNE TAILLE");
{
  // Le cas fondateur, mot pour mot.
  const barrette = tailleAGarder("Prématuré", { tailleFiche: "", texte: "Lot de 2 barrettes Marie Les Aristochats Disney" });
  ok(!barrette.garder, "« Prématuré » sur un lot de barrettes est JETÉE", barrette.motif);

  // ⛔ « Lot de 2 barrettes » ne corrobore pas « 2 ans » avec son propre compte.
  ok(!tailleDiteParLeTexte("2 ans", "Lot de 2 barrettes Marie"),
    "un nombre nu ne corrobore JAMAIS une taille enfant");
  ok(tailleDiteParLeTexte("6 mois", "Body bébé 6 mois rayé"),
    "…mais l'expression entière, oui");

  // Ce qui reste, et pourquoi.
  ok(tailleAGarder("M", { tailleFiche: "", texte: "Chaussettes blanches rayées noires taille M" }).garder,
    "une taille ÉCRITE dans le titre est gardée");
  ok(tailleAGarder("S / 36 / 8", { tailleFiche: "", texte: "Jean droit troué bleu taille 36" }).garder,
    "une taille composée Vinted est gardée si UNE de ses notations est au titre");
  ok(tailleAGarder("XXL", { tailleFiche: "XXL", texte: "Blazer tweed noir" }).garder,
    "la FICHE fait foi, toujours");
  ok(tailleAGarder("Unique", { tailleFiche: "", texte: "Sac Longchamp Roseau en cuir bordeaux" }).garder,
    "la valeur NEUTRE est gardée : elle dit qu'il n'y a pas de taille");
  ok(estTailleNeutre("Taille unique") && estTailleNeutre("Unique") && !estTailleNeutre("XL"),
    "« Unique » et « Taille unique » sont neutres, « XL » ne l'est pas");
  ok(estTailleEnfant("Prématuré") && estTailleEnfant("6 mois") && estTailleEnfant("3 ans") && !estTailleEnfant("XL"),
    "le référentiel enfant est reconnu");
  ok(tailleAGarder("", { tailleFiche: "", texte: "n'importe quoi" }).garder,
    "pas de taille = rien à jeter");

  // Le câblage : la garde tourne AVANT la conversion enfant, et ne touche pas
  // ce que la personne a écrit elle-même.
  const res = readFileSync(new URL("../src/utils/resolutionPublication.js", import.meta.url), "utf8");
  const i = res.indexOf("const editeeIci = Boolean(sharedOverrides[platform]?.has(\"taille\"))");
  const bloc = i < 0 ? "" : res.slice(i, i + 1200);
  ok(i >= 0 && /!editeeIci && !partagee && !verdict\.garder/.test(bloc),
    "une taille éditée à la main ou partagée n'est JAMAIS jetée");
  ok(/pf\.taille_ecartee = \{/.test(bloc),
    "et ce qui est jeté laisse une trace sur le job (taille_ecartee)");
  ok(res.indexOf("tailleAGarder(pf.taille") < res.indexOf("toPlatformChildSize(pf.taille"),
    "la garde tourne AVANT la conversion vers le libellé de la plateforme");

  // La suite de la règle, côté Beebs : la valeur neutre au lieu d'une question.
  const beebs = readFileSync(new URL("../chrome-extension/content-scripts/beebs.js", import.meta.url), "utf8");
  const j = beebs.indexOf("UN OBJET SANS TAILLE PREND LA NEUTRE");
  const neutre = j < 0 ? "" : beebs.slice(j, j + 3000);
  ok(/\^\(taille\\s\+\)\?\(unique\|universelle\)\$/.test(neutre),
    "Beebs : la valeur neutre est prise dans SA liste, jamais écrite par nous");
  ok(/if \(dejaLa\) continue;/.test(neutre),
    "⛔ et jamais à la place d'une taille que la copie porte déjà");
  ok(/unfilledRequired\.splice\(i, 1\)/.test(neutre),
    "le champ sort des requis vides : plus de question à poser");
}

console.log("\n2. LA DESCENTE PROPOSE, ELLE NE DÉCIDE PAS SEULE");
{
  const res = readFileSync(new URL("../src/utils/resolutionPublication.js", import.meta.url), "utf8");
  const i = res.indexOf("LA DESCENTE PROPOSE, ELLE NE DÉCIDE PAS SEULE");
  const bloc = i < 0 ? "" : res.slice(i, i + 4200);
  ok(/const incoherence = rayonContreditLaFiche\(chemin, pf\);/.test(bloc),
    "l'alerte du 20/09 est réutilisée telle quelle, en amont");
  ok(/candidats: \{ \[r\.platform\]: \[\{ chemin, id: null \}\] \}/.test(bloc),
    "puis une dernière question, la feuille SEULE");
  ok(/confirme = false;/.test(bloc),
    "IA injoignable = pas de confirmation = on ne publie pas");
  ok(/chemin_propose: chemin/.test(bloc),
    "un refus garde la proposition : la personne voit ce qu'on avait trouvé");
  ok(res.indexOf("const incoherence = rayonContreditLaFiche") < res.indexOf('if (r.platform === "beebs") pf.beebsCategoryPath = chemin;'),
    "et rien n'est posé avant d'avoir été confirmé");

  // L'alerte elle-même, sur le cas qui l'a fait naître.
  ok(rayonContreditLaFiche(["Mode", "Garçon", "Vêtements (garçon)"], { genre: "Femme" })?.motif === "age",
    "un rayon garçon contredit une fiche femme");
  ok(rayonContreditLaFiche(["Mode", "Femme", "Chaussures (femme)"], { genre: "Femme" }) === null,
    "…et un rayon cohérent ne dit rien");
}

console.log("\n3. LEBONCOIN QUI DEMANDE À ÊTRE PAYÉ N'EST PAS UNE PANNE");
{
  const lbc = readFileSync(new URL("../chrome-extension/content-scripts/leboncoin.js", import.meta.url), "utf8");
  // Le CTA des comptes à forfait, lu dans leur dictionnaire (modify-ad-with-quota).
  ok(/publier \(mon \|l\['’\]\)annonce/.test(lbc),
    "« Publier mon annonce » est reconnu comme un chemin gratuit");
  const i = lbc.indexOf("LEBONCOIN DEMANDE À ÊTRE PAYÉ");
  const bloc = i < 0 ? "" : lbc.slice(i, i + 1600);
  ok(/attenteUtilisateur: true, attenteMotif: "lbc_options_payant_seulement"/.test(bloc),
    "l'écran payant pose une attente PERSISTÉE — aucune reprise");
  ok(/if \(surEcranOptions\(\) && trouverBoutonPayant\(\)\)/.test(bloc),
    "et seulement quand le bouton payant est là : une page pas finie de se rendre reste une reprise");
  // ⛔ Le bouton payant est RECONNU, jamais cliqué.
  const clics = [...lbc.matchAll(/(\w+)\.click\(\)/g)].map((m) => m[1]);
  ok(!clics.includes("payant") && !/trouverBoutonPayant\(\)[\s\S]{0,40}\.click\(\)/.test(lbc),
    "le bouton payant n'est JAMAIS cliqué", clics.join(", "));
  ok(/valider et payer\|payer et publier/i.test(lbc),
    "les deux libellés payants relevés sont reconnus");
}

console.log(echecs === 0
  ? "\n✅ selftest taille / rayon / paiement : tout passe\n"
  : `\n❌ ${echecs} échec(s)\n`);
process.exit(echecs === 0 ? 0 : 1);
