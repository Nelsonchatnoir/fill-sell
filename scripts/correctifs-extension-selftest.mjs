// ── AUTOTEST : UN JOB BLOQUÉ PAR UN DÉFAUT D'EXTENSION CORRIGÉ REPART SEUL ──
// (25/09/2026, LES PETITES FIOLES — supabase/functions/_shared/correctifs-extension.js)
// Rejoue la forme RÉELLE des 5 republications Leboncoin PRO de la cliente
// (40 essais par la 0.6.63, « contrôle Supprimer introuvable … actions
// relevées: [] ») et verrouille les bornes :
//   1. reconnu : bonne plateforme, bonne action, signature, build d'échec ancien ;
//   2. un poste à jour (≥ 0.6.66) porte le correctif, un poste 0.6.63 non ;
//   3. un échec SUR un build corrigé n'est jamais réarmé ;
//   4. un seul réarmement par job et par correctif ;
//   5. autre plateforme / autre action / autre signature / build illisible : rien.
//   node scripts/correctifs-extension-selftest.mjs
import { correctifPourJob, posteAJour, buildMsDe, CORRECTIFS_EXTENSION } from "../supabase/functions/_shared/correctifs-extension.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const B063 = "2026-09-23T22:48:50Z+d4e424c · v0.6.63";
const B066 = "2026-09-24T14:34:46Z+aa459a7";
const B067 = "2026-09-25T09:00:00Z+abcdef0";
const fiole = (surcharge = {}) => ({
  id: "f554a951-8397-457d-95bd-60dce5b2bd02", platform: "leboncoin", action: "republish", status: "needs_user",
  handler_build: B063,
  error: "La republication n'a pas abouti après plusieurs essais automatiques, et ton annonce n'a pas été touchée. Tu peux la relancer d'un clic ci-dessous ; si ça bloque encore, écris-nous, on regarde avec toi.",
  platform_fields: {
    republish_step: "captured", needs_user_source: "relancer", needsUserAttempts: 5,
    last_diagnostic: "contrôle Supprimer introuvable sur la page de l'annonce 3271176513 — 1 <aside>, actions relevées: []",
    error_technique: { at: "2026-09-24T14:06:00.545Z", brut: "Retrait Leboncoin non abouti (Contrôle « Supprimer l'annonce » introuvable sur la page de l'annonce). Ton annonce est TOUJOURS en ligne (vérifié)" },
  },
  ...surcharge,
});

console.log("\n── CORRECTIFS D'EXTENSION : LE JOB REPART QUAND LE POSTE EST À JOUR ──");

console.log("\n1. Les 5 republications des Petites Fioles sont reconnues");
{
  const c = correctifPourJob(fiole());
  ok(c?.cle === "lbc_retrait_pro_tiroir", `correctif reconnu : ${c?.cle}`);
  ok(correctifPourJob(fiole({ action: "delete" }))?.cle === "lbc_retrait_pro_tiroir", "un RETRAIT simple aussi");
  const sansDiag = fiole();
  delete sansDiag.platform_fields.last_diagnostic;
  ok(correctifPourJob(sansDiag)?.cle === "lbc_retrait_pro_tiroir", "reconnu par l'erreur technique seule (brut du retrait)");
}

console.log("\n1 bis. (25/10 nuit) thibault dca41766 — « Espace de stockage » redemandé sans liste");
{
  const thibault = (surcharge = {}) => ({
    id: "dca41766-e05d-4c37-8f0b-7c02d85c2dde", platform: "vinted", action: "republish", status: "needs_user",
    handler_build: "2026-10-18T16:26:21Z+492f753 · v0.6.128",
    error: "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted exige des champs encore vides pour cette catégorie : Espace de stockage. Compléter ces champs dans l'app (copie Vinted), puis relancer la publication. Le choix se fait dans l'app : fiche de l'article, bouton « ✋ Compléter ».",
    platform_fields: {
      republish_step: "captured", needs_user_source: "prevol_negatif", champs_a_completer: ["Espace de stockage"],
      needsUserField: { field_key: "internal_memory_capacity", field_label: "Espace de stockage", input_type: "dropdown", platform: "vinted", target: { key: "internal_memory_capacity", root: "vintedAspects" } },
      boucle_needs_user: { field_key: "internal_memory_capacity", cible: "vintedAspects.internal_memory_capacity", motif: "trop_de_tours", blocages: 5, valeur: null },
      error_technique: { brut: "« Espace de stockage » : ce champ a été redemandé 5 fois malgré tes réponses. — Observabilité: boucle needs_user (trop_de_tours) sur la cible vintedAspects.internal_memory_capacity, 5 blocage(s), valeur null, plateforme vinted, job dca41766." },
    },
    ...surcharge,
  });
  const c = correctifPourJob(thibault());
  ok(c?.cle === "vinted_stockage_simlock_capture", `reconnu : ${c?.cle}`);
  ok(posteAJour("2026-10-24T21:18:48Z+a07091c", c) && !posteAJour("2026-10-23T11:19:48Z+4098342", c), "0.6.141 porte le correctif, 0.6.131 non");
  ok(correctifPourJob(thibault({ handler_build: "2026-10-24T21:18:48Z+a07091c · v0.6.141" })) === null, "un arrêt SUR la 0.6.134+ n'est jamais réarmé");
  ok(correctifPourJob(thibault({ platform_fields: { ...thibault().platform_fields, republish_step: "deleted" } })) === null, "jamais après un retrait");
  ok(correctifPourJob(thibault({ error: "Vinted exige des champs encore vides pour cette catégorie : Taille.", platform_fields: { republish_step: "captured", champs_a_completer: ["Taille"], needsUserField: { field_key: "size", target: { key: "size", root: "vintedAspects" } } } })) === null,
    "un autre champ (Taille) n'est pas ce correctif");
}

console.log("\n1 ter. (25/10 nuit) patrick 3730ef49 — « Paris 2024 », déjà réarmé par la 0.6.123");
{
  const patrick = (pfPlus = {}) => ({
    id: "3730ef49-d394-4cdf-beaf-367c557a530c", platform: "vinted", action: "republish", status: "needs_user",
    handler_build: "2026-10-18T16:26:21Z+492f753 · v0.6.128",
    error: "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted ne connaît pas la marque « Paris 2024 » et ne permet plus d'en créer une nouvelle.",
    platform_fields: { republish_step: "captured", republish_snapshot: { brand_id: 305315, marque: "Paris 2024" },
      correctif_leve: { cle: "vinted_marque_par_identifiant", le: "2026-10-21T06:51:28.628Z" }, ...pfPlus },
  });
  const c = correctifPourJob(patrick());
  ok(c?.cle === "vinted_marque_chaine_de_repli", "reconnu : " + c?.cle);
  ok(posteAJour("2026-10-24T21:18:48Z+a07091c", c) && !posteAJour("2026-10-18T16:26:21Z+492f753", c), "0.6.141 porte la chaîne, 0.6.128 non");
  ok(correctifPourJob({ ...patrick({ correctif_leve: null }), handler_build: "2026-10-15T19:36:02Z+18cc681 · v0.6.114" })?.cle === "vinted_marque_par_identifiant",
    "arrêt d'avant la 0.6.123, jamais réarmé : l'entrée 0.6.123 d'abord (inchangé)");
  // (26/10 nuit) Ces trois règles valent pour les entrées d'AVANT la 0.6.146 ; la 0.6.146 (marque créée) reprend, une
  // fois, ce qu'elles laissaient en question (bloc 1 quater).
  const AVANT_0146 = CORRECTIFS_EXTENSION.filter((x) => x.cle !== "vinted_marque_creee");
  ok(correctifPourJob({ ...patrick(), handler_build: "2026-10-24T21:18:48Z+a07091c · v0.6.141" }, AVANT_0146) === null, "un arrêt SUR la 0.6.134+ n'est jamais réarmé (par la chaîne)");
  ok(correctifPourJob(patrick({ correctif_leve: { cle: "vinted_marque_chaine_de_repli" } }), AVANT_0146) === null, "un seul réarmement par correctif");
  ok(correctifPourJob(patrick({ republish_snapshot: { brand_id: 1 } }), AVANT_0146) === null, "sans marque à identifiant : la question reste (avant la 0.6.146)");
  ok(correctifPourJob({ ...patrick(), handler_build: "2026-10-24T21:18:48Z+a07091c · v0.6.141" })?.cle === "vinted_marque_creee", "… et la 0.6.146 la reprend, une fois (marque créée)");
}

console.log("\n1 quater. (26/10 nuit, point 4) la marque créée par la 0.6.146");
{
  const job = (o = {}, pfPlus = {}) => ({
    id: "62385e33", platform: "vinted", action: "republish", status: "needs_user",
    handler_build: "2026-10-24T21:18:48Z+a07091c · v0.6.141",
    error: "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted ne connaît pas la marque « uncle stubble » et ne permet plus d'en créer une nouvelle.",
    platform_fields: { republish_step: "captured", ...pfPlus }, ...o,
  });
  const c = correctifPourJob(job());
  ok(c?.cle === "vinted_marque_creee", "christophe « uncle stubble » (0.6.141) : reconnu", c?.cle);
  ok(posteAJour("2026-10-26T00:53:28Z+ebdc605", c) && !posteAJour("2026-10-25T15:28:19Z+7b08e45", c), "0.6.146 porte le correctif, 0.6.144 non");
  ok(correctifPourJob(job({ action: "publish", handler_build: "2026-10-23T11:19:48Z+4098342 · v0.6.131", error: "Vinted ne connaît pas la marque « The North Face » et ne permet plus d'en créer une nouvelle." }, { republish_step: undefined }))?.cle === "vinted_marque_creee",
    "Johan « The North Face » (publication, 0.6.131) : reconnu aussi");
  ok(correctifPourJob(job({ handler_build: "2026-10-26T00:53:28Z+ebdc605 · v0.6.146" })) === null, "un arrêt SUR la 0.6.146 n'est jamais réarmé (sa question au texte vrai reste)");
  ok(correctifPourJob(job({}, { correctif_leve: { cle: "vinted_marque_creee" } })) === null, "un seul réarmement");
  ok(correctifPourJob(job({}, { republish_step: "deleted" })) === null, "jamais après un retrait");
}

console.log("\n2. Le poste qui polle porte-t-il le correctif ?");
{
  const c = CORRECTIFS_EXTENSION.find(c => c.platform === 'leboncoin');
  ok(posteAJour(B066, c) && posteAJour(B067, c), "0.6.66 et au-delà : oui");
  ok(!posteAJour(B063, c) && !posteAJour("", c) && !posteAJour("0.6.66", c), "0.6.63, build vide, numéro sans horodatage : non");
}

console.log("\n3. Un échec SUR un build corrigé n'est jamais réarmé");
{
  ok(correctifPourJob(fiole({ handler_build: B066 })) === null, "échec en 0.6.66 → rien (le diagnostic 0.6.66 reste lisible)");
  ok(correctifPourJob(fiole({ handler_build: "releve-annonces" })) === null, "build illisible → rien (on ne devine pas)");
}

console.log("\n4. Un seul réarmement par job et par correctif");
{
  const deja = fiole();
  deja.platform_fields.correctif_leve = { cle: "lbc_retrait_pro_tiroir", le: "2026-09-25T09:00:00Z" };
  ok(correctifPourJob(deja) === null, "déjà réarmé une fois → plus jamais");
}

console.log("\n5. Hors périmètre : rien");
{
  ok(correctifPourJob(fiole({ platform: "vinted" })) === null, "autre plateforme");
  ok(correctifPourJob(fiole({ action: "publish" })) === null, "un dépôt (publish) n'est pas un retrait");
  ok(correctifPourJob(fiole({ status: "pending" })) === null, "un job qui n'attend rien");
  const autre = fiole({ error: "Leboncoin a refusé l'annonce (modération)" });
  autre.platform_fields = { republish_step: "captured", last_diagnostic: "refus de modération" };
  ok(correctifPourJob(autre) === null, "une autre cause d'échec");
  ok(Number.isFinite(buildMsDe(B063)) && Number.isNaN(buildMsDe("v0.6.63")), "buildMsDe lit le préfixe horodaté, jamais le numéro");
}

console.log(ko === 0 ? "\n✅ CORRECTIFS D'EXTENSION : tout est vert.\n" : `\n❌ ${ko} contrôle(s) en échec.\n`);
process.exit(ko === 0 ? 0 : 1);
