// ── AUTOTEST : BEEBS RESTE SUR LE FORMULAIRE — CE QUE L'ESSAI A LAISSÉ ──────
// (2026-10-01, mariecreativedigital, chemise Hilfiger 0f457c57)
// Rejoue la forme RÉELLE de son job et verrouille :
//   1. l'adresse « validée » sur « 8XL » est lue comme telle, la taille aussi ;
//   2. une vraie suggestion d'adresse (22 dépôts du parc) ne l'est jamais ;
//   3. le classement : needs_user immédiat, jamais « on refait un essai » ;
//   4. la taille affichée ≠ fiche → la question de la taille ; « 38 / M »
//      pour M n'est pas un refus ;
//   5. le correctif d'extension réarme ce job sur un poste ≥ 0.6.83, une fois.
//   node scripts/beebs-refus-formulaire-selftest.mjs
import { lectureRefusBeebs, taillesCompatibles } from "../supabase/functions/_shared/beebs-refus-formulaire.js";
import { classerEchec } from "../supabase/functions/_shared/pas-de-rouge.js";
import { correctifPourJob, BUILD_BEEBS_ADRESSE_STRICTE } from "../supabase/functions/_shared/correctifs-extension.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const BRUT_MARIE = "Dépôt Beebs non confirmé : ni page de succès, ni message de confirmation affiché 45 s après le clic « Publier » — " +
  "le formulaire affiche : Titre de votre annonce73/100 caractères max | Supprimer la photo | CatégorieChemises (homme) | " +
  "Couleur(facultatif)Multicolore | Taille8XL. L'annonce n'est PAS considérée comme déposée. Vérifie « Mes annonces » sur Beebs avant de relancer : " +
  "si elle y est déjà, republier en créerait une deuxième. — observabilité: catégorie via FIBER";
const pfMarie = (surcharge = {}) => ({
  taille: "M",
  beebsAspects: { "Taille [#2]": "M", "Taille [attributes.size_men_shirt]": "M" },
  warnings: [
    { code: "generic", message: "Marque: \"Hilfiger Denim\" absent de la liste Beebs → repli sur l'option générique \"Autre\"" },
    { code: "generic", message: "adresse: \"9 Rue du 8 Mai 1945 08000 Villers-Semeuse\" → suggestion Beebs \"8XL\"" },
  ],
  ...surcharge,
});

console.log("\n── BEEBS : LE REFUS DU FORMULAIRE, LU ──");

console.log("\n1. Le job de Marie");
{
  const l = lectureRefusBeebs(pfMarie(), BRUT_MARIE);
  ok(l.adresseSurAutreChose === "8XL", `adresse validée sur « ${l.adresseSurAutreChose} »`);
  ok(l.tailleAffichee === "8XL" && l.tailleVoulue === "M", `taille affichée « ${l.tailleAffichee} », fiche « ${l.tailleVoulue} »`);
}

console.log("\n2. Les vraies suggestions du parc ne sont jamais « autre chose »");
for (const [saisie, choisie] of [
  ["4 Rue Du Hameau 26230 Chantemerle-lès-Grignan", "4 Rue Du Hameau26230 Chantemerle-lès-Grignan, France"],
  ["48bis Rue Guynemer 33200 Bordeaux", "48 Bis Rue Guynemer33200 Bordeaux, France"],
  ["Meaux 77100 Meaux", "Meaux 77Rue Frédéric Bartholdi, 77100 Meaux, France"],
  ["129bis Rue Gabriel Péri 93200 Saint-Denis", "Restaurant le 129129bis Rue Gabriel Péri, 93200 Saint-Denis, France"],
  ["310 rue du 8 mai 1945 59490 Somain", "310 Rue du 8 Mai 194559490 Somain, France"],
]) {
  const l = lectureRefusBeebs({ warnings: [`adresse: "${saisie}" → suggestion Beebs "${choisie}"`] }, "");
  ok(l.adresseSurAutreChose === null, `« ${saisie} » → vraie adresse`);
}

console.log("\n3. Classement : needs_user tout de suite, pas une reprise");
{
  const s = classerEchec({ platform: "beebs", action: "publish", brut: BRUT_MARIE, essais: 0, pf: pfMarie(), reprises: 0 });
  ok(s.statut === "needs_user" && s.motif === "beebs_adresse_mal_choisie", `${s.statut} / ${s.motif}`);
  ok(/8XL/.test(s.message) && /Rien n'a été publié/.test(s.message) && !/on refait un essai/.test(s.message), "le message nomme « 8XL » et dit que rien n'est publié");
}

console.log("\n4. La taille affichée n'est pas celle de la fiche");
{
  const pf = pfMarie({ warnings: [] });
  const s = classerEchec({ platform: "beebs", action: "publish", brut: BRUT_MARIE, essais: 0, pf, reprises: 0 });
  ok(s.statut === "needs_user" && s.motif === "beebs_taille_refusee" && s.champ?.target?.key === "taille", `${s.statut} / ${s.motif} → question « Taille »`);
  ok(/Beebs refuse la taille « 8XL »/.test(s.message), `« ${s.message.slice(0, 70)}… »`);
  const compatible = classerEchec({ platform: "beebs", action: "publish", brut: BRUT_MARIE.replace("Taille8XL", "Taille38 / M"), essais: 0, pf, reprises: 0 });
  ok(compatible.motif === "inconnu_reprise", `« 38 / M » pour M : pas un refus de taille (${compatible.motif})`);
  ok(taillesCompatibles("EU 42", "42") && taillesCompatibles("M", "m") && !taillesCompatibles("XXL", "XL"), "EU 42 ≈ 42, M ≈ m, XXL ≠ XL");
}

console.log("\n5. Le correctif réarme le job sur un poste ≥ 0.6.83, une fois");
{
  const job = (surcharge = {}, pf = {}) => ({
    id: "0f457c57-7913-4b0e-a689-d534246705f1", platform: "beebs", action: "publish", status: "needs_user",
    handler_build: "2026-09-30T20:16:41Z+73c4929 · v0.6.81",
    error: "Beebs n'a pas validé ton adresse d'envoi…",
    platform_fields: { ...pfMarie(), error_technique: { brut: BRUT_MARIE }, ...pf },
    ...surcharge,
  });
  ok(correctifPourJob(job())?.cle === "beebs_adresse_suggestion_stricte", "reconnu (0.6.81)");
  ok(correctifPourJob(job({ handler_build: `${BUILD_BEEBS_ADRESSE_STRICTE.replace("15:29:31", "16:00:00")}+abcdef0 · v0.6.83` })) === null, "échec SUR un build corrigé : jamais réarmé");
  ok(correctifPourJob(job({}, { warnings: [] })) === null, "sans l'adresse mal choisie : pas ce correctif");
  ok(correctifPourJob(job({}, { correctif_leve: { cle: "beebs_adresse_suggestion_stricte" } })) === null, "une seule fois");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✅ BEEBS REFUS DU FORMULAIRE : tout est vert.");
process.exit(ko ? 1 : 0);
