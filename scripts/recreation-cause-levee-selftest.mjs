// Autotest — une remise en ligne bloquée repart seule dès que la cause est
// levée — `npm run selftest:recreation-cause-levee`
// (_shared/recreation-bloquee.js + get-pending-jobs + handler-watch).
// Cas réel du 15/10 : ana0115, Beebs, « Tee shirt femme » (6ce123e7) : annonce
// retirée à 15:02, 5 redépôts refusés « Ajouter au moins 5 caractères »
// (description vide dans la copie, 182 caractères sur la fiche), sortie de la
// file à 17:03 (needs_user « recreation_bloquee »).
import { causeLeveePourRelance, champsRelanceCauseLevee, messageRelanceCauseLevee, messageRecreationBloquee, essaisRates,
  decisionRecreationBloquee, SOURCE_RECREATION_BLOQUEE } from "../supabase/functions/_shared/recreation-bloquee.js";
import fs from "node:fs";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const ana = {
  id: "6ce123e7-f37a-47d0-8c2e-999151a3c51b", action: "republish", platform: "beebs", status: "needs_user",
  title: "Tee shirt femme", description: null,
  error: "Ton annonce « Tee shirt femme » a été retirée de Beebs le 15/10 et FillSell n'a pas réussi à la remettre en ligne (5 essais).",
  platform_fields: {
    needs_user_source: SOURCE_RECREATION_BLOQUEE, republish_step: "deleted", deleted_at: "2026-10-15T13:02:50.263Z",
    recreation_reprise: { n: 5, brut: "Dépôt Beebs non confirmé : … le formulaire affiche : Ajouter au moins 5 caractères | Titre de votre annonce15/100 …" },
    recreation_bloquee: { essais: 5, le: "2026-10-15T15:03:02.859Z", par: "handler-watch" },
    error_technique: { brut: "Ton annonce a été retirée de Beebs et n'a pas pu être redéposée automatiquement : Dépôt Beebs non confirmé : … Ajouter au moins 5 caractères …" },
  },
};

console.log("\n1. ANA0115 : LA CAUSE (DESCRIPTION VIDE) EST LEVÉE PAR LE SERVEUR");
const c = causeLeveePourRelance(ana);
ok(c?.code === "description_beebs_trop_courte", "cause reconnue sur la trace de l'échec", JSON.stringify(c));
const pf = champsRelanceCauseLevee(ana.platform_fields, c, "2026-10-15T19:30:00Z");
ok(!pf.needs_user_source && pf.republish_step === "deleted", "remise en file à l'étape « deleted » (l'annonce est hors ligne, rien n'est retiré de plus)");
ok(essaisRates(pf) === 0, "essais ratés mis de côté : la sortie de file ne la reprend pas avant un nouvel essai");
ok(decisionRecreationBloquee({ ...ana, status: "pending", platform_fields: pf }, Date.parse("2026-10-15T19:35:00Z")) === null,
  "juste après la relance, decisionRecreationBloquee ne la ressort pas");
ok(pf.recreation_essais_avant_relance?.recreation_reprise?.n === 5, "les essais d'avant restent tracés");
ok(pf.recreation_relancee?.description_beebs_trop_courte?.le === "2026-10-15T19:30:00Z", "relance tracée par cause");
const msg = messageRelanceCauseLevee(ana);
ok(/hors ligne sur Beebs/.test(msg) && /défaut de notre côté/.test(msg) && !/\d+ ?(min|h)\b|vers \d/.test(msg), "message vrai, sans durée promise", msg);

console.log("\n2. UNE FOIS PAR CAUSE, JAMAIS SUR LE COMPTE, JAMAIS HORS CAS");
ok(causeLeveePourRelance({ ...ana, platform_fields: { ...ana.platform_fields, recreation_relancee: { description_beebs_trop_courte: { le: "x" } } } }) === null,
  "déjà relancée pour cette cause : plus jamais d'office");
ok(causeLeveePourRelance({ ...ana, description: "Tee shirt femme collection Minnie" }) === null,
  "« Ajouter au moins 5 caractères » avec une description présente (titre trop court ?) : pas notre cause");
ok(causeLeveePourRelance({ ...ana, platform_fields: { ...ana.platform_fields, attente_session: { depuis: "x" } } }) === null,
  "session du compte en cause : jamais relancée d'office");
ok(causeLeveePourRelance({ ...ana, platform: "leboncoin" }) === null, "autre plateforme : pas cette cause");
const autre = { ...ana, platform_fields: { ...ana.platform_fields, recreation_reprise: { n: 5, brut: "Beebs refuse la taille « 8XL »" }, error_technique: { brut: "taille refusée" } }, error: "x" };
ok(causeLeveePourRelance(autre) === null, "autre motif d'échec : rien n'est relancé");
ok(causeLeveePourRelance({ ...ana, status: "pending" }) === null, "seulement un job sorti de la file (needs_user)");

console.log("\n3. LE SERVEUR SERT LA DESCRIPTION DE LA FICHE À TOUTE REMISE EN LIGNE BEEBS");
const gpj = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
ok(/j\.platform === "beebs" && \(j\.action === "publish" \|\| j\.action === "republish"\)/.test(gpj), "le bloc « description Beebs » couvre les republications");
ok(/select\("id, attributs, description"\)/.test(gpj) && /descFiche\.trim\(\)\.length >= BEEBS_DESCRIPTION_MIN/.test(gpj), "la description de la FICHE passe avant les faits du job");
ok(/if \(j\.action !== "publish"\) \{/.test(gpj), "couleur / matière ajoutées aux publications seulement (une republication recopie son annonce)");
const hw = fs.readFileSync(new URL("../supabase/functions/handler-watch/index.ts", import.meta.url), "utf8");
ok(/causeLeveePourRelance\(j, buildBloquee\.get\(String\(j\.user_id\)\) \?\? null\)/.test(hw) && /\.eq\("id", j\.id\)\.eq\("status", "needs_user"\)/.test(hw), "handler-watch relance (CAS sur needs_user)");

console.log("\n4. (28/10) MENUS « BLOOM » DE VINTED : LA REMISE EN LIGNE REPART QUAND LE POSTE A LA 0.6.150");
{
  const thibault = { id: "dca41766", action: "republish", status: "needs_user", platform: "vinted", title: "Samsung player start 2",
    error: "Ton annonce a été retirée de Vinted et FillSell n'a pas réussi à la remettre en ligne (3 essais).",
    platform_fields: { needs_user_source: SOURCE_RECREATION_BLOQUEE, republish_step: "deleted",
      error_technique: { brut: "COULEUR INTROUVABLE : la couleur [\"Noir\"] existe bien chez Vinted mais n'a pas pu être posée sur le formulaire" } } };
  // (06/11, Nico : version minimum abandonnée) La relance ne dépend plus du build : 0.6.149 et build inconnu relancés
  // tout de suite, tracés « sous le build » — UNE relance de plus quand le poste a le build, jamais une troisième.
  const cAncien = causeLeveePourRelance(thibault, "2026-10-28T09:52:53Z+9ca925f");
  ok(cAncien?.code === "vinted_menus_bloom", "(06/11) poste en 0.6.149 : relancée quand même (plus de retenue par build)");
  ok(causeLeveePourRelance(thibault, null)?.code === "vinted_menus_bloom", "(06/11) build du poste inconnu : relancée aussi");
  const pfAncien = champsRelanceCauseLevee(thibault.platform_fields, cAncien, "2026-10-29T07:00:00Z", { extensionBuild: "2026-10-28T09:52:53Z+9ca925f" });
  ok(pfAncien.recreation_relancee?.vinted_menus_bloom?.sous_build === true, "(06/11) relance tracée « sous le build »");
  const retombee = { ...thibault, platform_fields: { ...thibault.platform_fields, recreation_relancee: pfAncien.recreation_relancee } };
  ok(causeLeveePourRelance(retombee, "2026-10-28T09:52:53Z+9ca925f") === null, "(06/11) retombée, même poste ancien : rien (pas de boucle)");
  const cAuBuild = causeLeveePourRelance(retombee, "2026-10-28T21:51:44Z+f567f2e");
  ok(cAuBuild?.code === "vinted_menus_bloom", "(06/11) le poste passe en 0.6.152 : UNE relance de plus");
  const pfAuBuild = champsRelanceCauseLevee(retombee.platform_fields, cAuBuild, "2026-10-29T09:00:00Z", { extensionBuild: "2026-10-28T21:51:44Z+f567f2e" });
  ok(Boolean(pfAuBuild.recreation_relancee?.vinted_menus_bloom?.reprise_au_build)
    && causeLeveePourRelance({ ...thibault, platform_fields: { ...thibault.platform_fields, recreation_relancee: pfAuBuild.recreation_relancee } }, "2026-10-28T21:51:44Z+f567f2e") === null,
    "(06/11) tracée « reprise_au_build », jamais une troisième");
  ok(messageRecreationBloquee(retombee, { causeEnAttente: causeLeveePourRelance(retombee, null, { ignorerBuild: true }) }) !== null,
    "(06/11) retombée sous le build : le message de la remise en ligne bloquée se calcule (cause en attente du poste)");
  const c = causeLeveePourRelance(thibault, "2026-10-28T21:51:44Z+f567f2e");
  ok(c?.code === "vinted_menus_bloom", "poste en 0.6.152 : relancée");
  const pf = champsRelanceCauseLevee(thibault.platform_fields, c, "2026-10-29T08:00:00Z", { extensionBuild: "2026-10-28T21:51:44Z+f567f2e" });
  ok(pf.republish_step === "deleted" && !pf.needs_user_source && Boolean(pf.recreation_relancee?.vinted_menus_bloom),
    "étape gardée, attente levée, marquée « une fois par cause »");
  ok(causeLeveePourRelance({ ...thibault, platform_fields: { ...thibault.platform_fields, recreation_relancee: pf.recreation_relancee } },
    "2026-10-28T21:51:44Z+f567f2e") === null, "jamais une seconde fois pour cette cause");
  ok(causeLeveePourRelance({ ...thibault, platform: "beebs" }, "2026-10-28T21:51:44Z+f567f2e") === null, "Beebs : pas cette cause");
}

console.log("\n5. (29/10, lot A point 2) ATTRIBUTS DE L'ANNONCE D'ORIGINE : LA QUESTION « VINTED EXIGE » D'UNE RECRÉATION REPART AU BUILD QUI LES POSE");
{
  // Relevé en base le 29/10 (dca41766, poste en 0.6.152 depuis 09:02) : étape « deleted », question champ_a_choisir.
  const thibault = { id: "dca41766", action: "republish", status: "needs_user", platform: "vinted", title: "Samsung player start 2 # téléphone portable",
    error: "Ton annonce a été retirée de Vinted et n'a pas pu être recréée automatiquement : Vinted exige « Modèle », « Espace de stockage ». Rien n'est perdu.",
    platform_fields: { needs_user_source: "champ_a_choisir", republish_step: "deleted", recreation_relancee: { vinted_menus_bloom: { le: "2026-10-29T08:05:00Z" } } } };
  // (06/11, Nico : version minimum abandonnée) Plus « pas encore » : relancée tout de suite, sous le build.
  ok(causeLeveePourRelance(thibault, "2026-10-28T21:51:44Z+f567f2e")?.code === "vinted_attributs_origine",
    "(06/11) poste en 0.6.152 (sans la pose des identifiants) : la question repart quand même");
  const c = causeLeveePourRelance(thibault, "2026-10-29T14:10:00Z+abcdef0");
  ok(c?.code === "vinted_attributs_origine", "poste au build qui pose modèle et attributs d'origine : la question repart une fois");
  const pf = champsRelanceCauseLevee(thibault.platform_fields, c, "2026-10-29T15:00:00Z");
  ok(!pf.needs_user_source && pf.republish_step === "deleted" && Boolean(pf.recreation_relancee?.vinted_attributs_origine) && Boolean(pf.recreation_relancee?.vinted_menus_bloom),
    "question levée, étape gardée, marquée une fois (l'ancienne marque reste)");
  // (29/10 soir) Thibault a un second poste en 0.6.149 : le job relancé ne lui est jamais servi (garde de get-pending-jobs).
  ok(pf.build_min_requis === "2026-10-29T13:30:00Z", `relancée : servie seulement à un poste au build qui pose les identifiants (build_min_requis ${pf.build_min_requis})`);
  const pfPlusHaut = champsRelanceCauseLevee({ ...thibault.platform_fields, build_min_requis: "2026-10-30T08:00:00Z+abcdef0" }, c, "2026-10-29T15:00:00Z");
  ok(pfPlusHaut.build_min_requis === "2026-10-30T08:00:00Z+abcdef0", "un build_min_requis plus récent déjà posé : jamais abaissé");
  const sansBuild = champsRelanceCauseLevee({}, { code: "cause_serveur", correctif: "serveur" }, "2026-10-29T15:00:00Z");
  ok(!("build_min_requis" in sansBuild), "une cause corrigée par le SERVEUR (sans buildMin) n'exige aucun build");
  ok(causeLeveePourRelance({ ...thibault, platform_fields: { ...thibault.platform_fields, republish_step: "captured" } }, "2026-10-29T14:10:00Z+abcdef0") === null,
    "annonce encore en ligne (captured) : la question reste à la personne");
  const isbn = { ...thibault, error: "Ton annonce a été retirée de Vinted et n'a pas pu être recréée automatiquement : Vinted exige « ISBN »." };
  ok(causeLeveePourRelance(isbn, "2026-10-29T14:10:00Z+abcdef0") === null, "un autre champ exigé (ISBN) : jamais relancé par cette cause");
  const autreCause = { ...thibault, platform_fields: { ...thibault.platform_fields, needs_user_source: "champ_a_choisir" },
    error: "COULEUR INTROUVABLE : la couleur [\"Noir\"] existe bien chez Vinted mais n'a pas pu être posée" };
  ok(causeLeveePourRelance({ ...autreCause, platform_fields: { ...autreCause.platform_fields, recreation_relancee: {} } }, "2026-10-29T14:10:00Z+abcdef0") === null,
    "une cause sans `sources` ne vise jamais une question (vinted_menus_bloom : l'arrêt seul)");
  ok(/\.in\("platform_fields->>needs_user_source", \[SOURCE_RECREATION_BLOQUEE, "champ_a_choisir"\]\)\s*\n\s*\.eq\("platform_fields->>republish_step", "deleted"\)/.test(hw),
    "handler-watch lit aussi les questions des remises en ligne déjà retirées (étape deleted seulement)");
}

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
