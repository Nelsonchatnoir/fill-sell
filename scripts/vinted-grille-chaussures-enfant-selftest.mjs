// ═══════════════════════════════════════════════════════════════════════════
// Verrou « grille des chaussures enfant de Vinted » (12/11/2026, lot « zéro problème », point 1c de Nico)
//   npm run selftest:vinted-grille-chaussures-enfant
//
// LES CAS RÉELS (relus en prod, lecture seule, le 12/11) :
//   · compte 2bde8576, republication 479f51c0 (catalogue 1653, Chaussures bébé) : capture 28729 = libellé
//     « 15 et moins », identifiant de taille 657 (ancienne grille 31 « Tailles de chaussures pour enfants » :
//     657 = « 15 et moins », 585…609 = « 16 »…« 40 »). Vinted a remplacé la grille par des onglets EU / UK / US
//     (nouvelle grille relevée dans les captures : 2190 = « EU 15 », 2194 = « EU 17 », 2196 = « EU 18 »,
//     2208 = « EU 24 », 2238 = « EU 39 », 2258 = « UK 8 enfant »). get-pending-jobs a retiré l'id 657 de la
//     capture (règle du 10/09 « ids de la grille combinée absents du formulaire »), le pré-vol n'a rien
//     trouvé, update-job-status a retiré la liste (grille_incoherente) et dit « Relance depuis l'app ; si ça se
//     reproduit, écris-nous » : une impasse. relance-apres-maj l'a relancée « corrigé par la 0.6.150 » alors
//     que l'échec venait d'une 0.6.186 (handler_build du job).
//   · compte af37fa49, capture 23561 (catalogue 1661) : identifiant 2258, libellé « UK 8 child » le 31/10 puis
//     « UK 8 enfant » : la MÊME taille dans deux langues. L'id 2258 est dans le formulaire (onglet UK) ; il a été
//     retiré de la capture par get-pending-jobs, le libellé anglais seul n'a rien trouvé.
//   · compte 68e350f0 : 3 republications du 28/10 arrêtées sur l'État par une 0.6.149 (menus « bloom ») — la
//     relance au build qui corrige DOIT rester (non-régression).
//
// CE QUE LE VERROU EXIGE (rouge avant le correctif, vert après) :
//   [1] childSizes.js n'écrit plus « 15 et moins » : la pointure EU telle quelle (« EU 15 »).
//   [2] extension (le VRAI vinted.js, panneau à onglets EU / UK / US) : un id du rayon part tel quel (2258) ;
//       un id RETIRÉ par Vinted se traduit PAR IDENTIFIANT vers la même pointure EU quand c'est certain (585
//       « 16 » → 2192 « EU 16 ») ; « 15 et moins » (657) n'a pas d'équivalent certain : rien n'est posé.
//   [3] update-job-status : la valeur absente de la liste servie, liste connue → UNE question (liste fermée,
//       voisines en tête : « EU 15 », « Très petit bébé »), jamais « relance / écris-nous ».
//   [4] relance-apres-maj : jamais de relance quand l'échec vient d'un build qui a déjà le correctif.
//   [5] get-pending-jobs : l'id d'origine n'est plus retiré pour un poste qui le confronte au groupe du rayon
//       (capacité « taille_groupe_rayon_v1 ») ; la taille CHOISIE par la personne entre dans la capture.
//   [6] background.js : la capacité est déclarée ; une taille choisie part par son libellé (jamais l'id retiré).
// Les identifiants de groupe des onglets (1001, 1002, 1003) sont factices ; les ids de taille sont ceux relevés
// (2190…2240 pour EU 15…EU 40 par demi-pointures, 2241… pour l'onglet UK : 2258 = « UK 8 enfant »).
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chargerTailleVinted, panneau } from "./lib/vinted-taille-bac.mjs";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");
const VINTED = lire("chrome-extension/content-scripts/vinted.js");
const BG = lire("chrome-extension/background.js");
const UJS = lire("supabase/functions/update-job-status/index.ts");
const GPJ = lire("supabase/functions/get-pending-jobs/index.ts");
const HW = lire("supabase/functions/handler-watch/index.ts");

let ko = 0;
let vus = 0;
const ok = (nom, cond, detail = "") => {
  vus++;
  if (!cond) ko++;
  console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${String(detail).slice(0, 400)}`}`);
};
const importer = async (rel) => {
  try { return await import(pathToFileURL(path.join(RACINE, rel)).href); } catch (e) { return { __erreur: String(e?.message ?? e) }; }
};
const NBSP = " ";
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// ── Le panneau Taille du rayon « Chaussures bébé » (onglets EU / UK / US, relevé du 12/11 dans last_diagnostic) ──
const demi = (a, b, prefixe, suffixe = "") => {
  const out = [];
  for (let n = a; n <= b; n += 0.5) out.push(`${prefixe}${NBSP}${String(n).replace(".", ",")}${suffixe}`);
  return out;
};
const EU = demi(15, 40, "EU"); // 51 options : 2190 (EU 15) … 2240 (EU 40)
const UK = ["Très petit bébé", ...demi(0, 6.5, "UK", `${NBSP}bébé`), ...demi(7, 13.5, "UK", `${NBSP}enfant`), ...demi(1, 6, "UK")];
const US = [...demi(0, 0.5, "US", `${NBSP}bébé`), ...["1C", "1.5C", "2C", "2.5C", "3C", "3.5C", "4C", "4.5C", "5C"].map((t) => `US${NBSP}${t}`)];
const ONGLETS_BEBE = [
  { texte: "EU", groupe: 1001, idDepart: 2190, options: EU },
  { texte: "UK", groupe: 1002, idDepart: 2241, options: UK },
  { texte: "US", groupe: 1003, idDepart: 2300, options: US },
];
const idDe = (libelle) => {
  for (const o of ONGLETS_BEBE) {
    const i = o.options.findIndex((x) => norm(x) === norm(libelle));
    if (i >= 0) return o.idDepart + i;
  }
  return null;
};
const LISTE_SERVIE = [...EU, ...UK, ...US]; // la liste fermée que verdictTailleHorsGrille sert (tous onglets)

console.log("\n[0] Le banc reproduit les identifiants relevés en prod");
ok("EU 15 = 2190, EU 17 = 2194, EU 18 = 2196, EU 24 = 2208, EU 39 = 2238 (captures du 12/11)",
  idDe("EU 15") === 2190 && idDe("EU 17") === 2194 && idDe("EU 18") === 2196 && idDe("EU 24") === 2208 && idDe("EU 39") === 2238);
ok("UK 8 enfant = 2258 (capture 23561 du compte af37fa49)", idDe("UK 8 enfant") === 2258, String(idDe("UK 8 enfant")));

// ═══ [1] childSizes.js ═══════════════════════════════════════════════════════
console.log("\n[1] childSizes.js : plus jamais « 15 et moins » (publication neuve)");
{
  const C = await importer("src/utils/childSizes.js");
  const t = (v, pf, o) => (typeof C.toPlatformChildSize === "function" ? C.toPlatformChildSize(v, pf, o) : `ERREUR ${C.__erreur}`);
  ok("toPlatformChildSize(« EU 15 », vinted, enfant) = « EU 15 »", t("EU 15", "vinted", { isChildGenre: true }) === "EU 15", t("EU 15", "vinted", { isChildGenre: true }));
  ok("   jamais « 15 et moins »", t("EU 15", "vinted", { isChildGenre: true }) !== "15 et moins");
  ok("   « eu 15 » (casse) → « EU 15 »", t("eu 15", "vinted", { isChildGenre: true }) === "EU 15", t("eu 15", "vinted", { isChildGenre: true }));
  ok("non-régression : « EU 16 » → « 16 » (« 16 » → « EU 16 » au formulaire, compte 2bde8576 eaf18759 republiée)",
    t("EU 16", "vinted", { isChildGenre: true }) === "16");
  ok("non-régression : « EU 40 » → « 40 », « EU 41 » → null, demi-pointure → null (la canonique part telle quelle)",
    t("EU 40", "vinted", { isChildGenre: true }) === "40" && t("EU 41", "vinted", { isChildGenre: true }) === null
      && t("EU 30,5", "vinted", { isChildGenre: true }) === null);
  ok("non-régression : sans genre enfant → null ; Beebs « EU 15 » → « 15 »",
    t("EU 15", "vinted", {}) === null && t("EU 15", "beebs", { isChildGenre: true }) === "15");
  ok("le source ne porte plus le libellé « 15 et moins » comme valeur rendue",
    !/return[^;\n]*"15 et moins"/.test(lire("src/utils/childSizes.js")));
}

// ═══ [2] Extension : le VRAI vinted.js sur le panneau à onglets ═══════════════
console.log("\n[2] Extension (vinted.js réel) — identifiants d'abord, traduction certaine d'un id retiré, sinon rien");
const bac = (document) => chargerTailleVinted(VINTED, document);
{
  // Compte af37fa49, capture 23561 : l'id 2258 EST dans le rayon (onglet UK) → posé tel quel.
  const { document, clics } = panneau(ONGLETS_BEBE);
  const b = bac(document);
  const w = [];
  const pose = await b.selectTailleVinted({ taille: "UK 8 child", taille_ids: [2258] }, w);
  ok("af37fa49 « UK 8 child » + id 2258 : posée par identifiant → « UK 8 enfant »",
    pose === true && norm(clics.at(-1)) === "UK 8 enfant" && w.some((x) => /posée par id 2258/.test(String(x))), `${pose} ${JSON.stringify(clics)} ${w.join(" | ")}`);
}
{
  // Le même cas, id RETIRÉ (ce que faisait get-pending-jobs) : le libellé anglais seul ne trouve rien — d'où [5].
  const { document, clics } = panneau(ONGLETS_BEBE);
  const pose = await bac(document).selectTailleVinted({ taille: "UK 8 child" }, []);
  ok("af37fa49 sans l'id (retiré par le serveur) : « UK 8 child » seul ne pose rien (preuve : il faut garder l'id)",
    pose === false && clics.length === 0, `${pose} ${JSON.stringify(clics)}`);
}
{
  // Ancienne grille 31 : 585 = « 16 » (captures du 20/10 au 12/11). Retiré du rayon → même pointure EU, PAR IDENTIFIANT.
  const { document, clics } = panneau(ONGLETS_BEBE);
  const w = [];
  const pose = await bac(document).selectTailleVinted({ taille: "16", taille_ids: [585] }, w);
  ok("id 585 « 16 » (grille retirée) : posé « EU 16 »", pose === true && norm(clics.at(-1)) === "EU 16", `${pose} ${JSON.stringify(clics)}`);
  ok("   par l'identifiant du rayon (2192), motif « même pointure EU » écrit",
    w.some((x) => /585/.test(String(x)) && /2192/.test(String(x)) && /même pointure EU/i.test(String(x))), w.join(" | "));
}
{
  // Compte 2bde8576, capture 28729 : 657 « 15 et moins » — aucun équivalent certain, rien n'est posé.
  const { document, clics } = panneau(ONGLETS_BEBE);
  const b = bac(document);
  const w = [];
  const pose = await b.selectTailleVinted({ taille: "15 et moins", taille_ids: [657] }, w);
  ok("2bde8576 « 15 et moins » + id 657 : rien n'est posé (jamais une taille inventée)", pose === false && clics.length === 0, `${pose} ${JSON.stringify(clics)}`);
  ok("   le diagnostic nomme l'id absent de tous les onglets du rayon (657)",
    /657/.test(String(b.diag() ?? "")) && /absent/i.test(String(b.diag() ?? "")), String(b.diag()));
  const v = b.verdictTailleHorsGrille({ taille: "15 et moins", categoryPath: ["Enfants", "Vêtements pour garçons", "Chaussures", "Chaussures bébé"] }, [], { onePass: true });
  ok("   la liste fermée part (needsUserField, cible republish_user_fields.taille)",
    Array.isArray(v?.needsUserField?.allowed_values) && v.needsUserField.allowed_values.length > 50
      && v.needsUserField.target?.root === "republish_user_fields", JSON.stringify(v?.needsUserField ?? null).slice(0, 300));
  ok("   ENTIÈRE : les trois onglets, « EU 40 » (51e option de l'onglet EU) et « US 5C » compris (plus de coupe à 40 par onglet)",
    v?.needsUserField?.allowed_values?.length === LISTE_SERVIE.length
      && v.needsUserField.allowed_values.some((x) => norm(x) === "EU 40") && v.needsUserField.allowed_values.some((x) => norm(x) === "US 5C"),
    `${v?.needsUserField?.allowed_values?.length} / ${LISTE_SERVIE.length}`);
}
{
  const f = (() => { try { return new Function(`${extraireFonctionJs(VINTED, "tailleEquivalenteRetiree")}; return tailleEquivalenteRetiree;`)(); } catch (e) { return null; } })();
  ok("tailleEquivalenteRetiree existe dans vinted.js (traduction d'un id retiré, par identifiant)", typeof f === "function");
  if (typeof f === "function") {
    const options = ONGLETS_BEBE.flatMap((o) => o.options.map((l, i) => ({ id: o.idDepart + i, groupe: o.groupe, onglet: o.texte, libelle: l })));
    ok("   « 15 et moins » → aucun équivalent certain", f("15 et moins", options) === null, JSON.stringify(f("15 et moins", options)));
    ok("   « EU 17 » → 2194 ; « 18 » → 2196", f("EU 17", options)?.id === 2194 && f("18", options)?.id === 2196);
    ok("   « 15,5 » / « 15.5 » → 2191", f("15,5", options)?.id === 2191 && f("15.5", options)?.id === 2191);
    ok("   jamais un autre système : « UK 8 child » → null (le libellé n'est pas une pointure EU)", f("UK 8 child", options) === null);
    ok("   ambigu (« 16 » ET « EU 16 » sous deux ids) → null",
      f("16", [{ id: 1, libelle: "16" }, { id: 2, libelle: `EU${NBSP}16` }]) === null);
    ok("   grille sans onglet « 38.5 » nue → trouvée", f("38.5", [{ id: 7, libelle: "38" }, { id: 8, libelle: "38.5" }])?.id === 8);
  }
}

// ═══ [3] update-job-status : UNE question vraie ════════════════════════════════
console.log("\n[3] update-job-status — la valeur hors de la liste servie, liste connue : UNE question, voisines en tête");
{
  const H = await importer("supabase/functions/_shared/vinted-taille-hors-grille.js");
  const q = typeof H.questionTailleHorsGrille === "function" ? H.questionTailleHorsGrille : null;
  ok("module partagé _shared/vinted-taille-hors-grille.js (questionTailleHorsGrille)", !!q, H.__erreur ?? "");
  if (q) {
    const r = q({ champ: "size", valeur: "15 et moins", liste: LISTE_SERVIE, valeurOfferte: false, grilleAdulteEnfant: false });
    ok("2bde8576 479f51c0 : une question (liste fermée gardée, entière)", Array.isArray(r?.allowed_values) && r.allowed_values.length === LISTE_SERVIE.length,
      JSON.stringify(r).slice(0, 300));
    ok("   voisines en tête : « EU 15 » puis « Très petit bébé »",
      norm(r?.allowed_values?.[0]) === "EU 15" && norm(r?.allowed_values?.[1]) === "Très petit bébé", JSON.stringify(r?.allowed_values?.slice(0, 5)));
    ok("   la suite par pointure la plus proche (« EU 15,5 », « EU 16 »)",
      norm(r?.allowed_values?.[2]) === "EU 15,5" && norm(r?.allowed_values?.[3]) === "EU 16", JSON.stringify(r?.allowed_values?.slice(0, 5)));
    ok("   le texte nomme la valeur et les voisines", /« 15 et moins »/.test(r?.message ?? "") && /EU 15/.test(norm(r?.message)) && /Très petit bébé/.test(r?.message ?? ""), r?.message);
    ok("   jamais « relance » ni « écris-nous »", !/relanc|écris-nous|ecris-nous/i.test(r?.message ?? ""), r?.message);
    ok("   « AVANT toute suppression » et « intacte » (annonce en ligne)", /AVANT toute suppression/.test(r?.message ?? "") && /intacte/.test(r?.message ?? ""), r?.message);
    const uk = q({ champ: "size", valeur: "UK 8 child", liste: LISTE_SERVIE, valeurOfferte: false, grilleAdulteEnfant: false });
    ok("af37fa49 (poste ancien, id retiré) « UK 8 child » : « UK 8 enfant » en tête", norm(uk?.allowed_values?.[0]) === "UK 8 enfant", JSON.stringify(uk?.allowed_values?.slice(0, 4)));
    ok("   aucune voisine d'un autre système en tête (UK seulement)", (uk?.voisines ?? []).every((v) => /^UK/.test(norm(v))), JSON.stringify(uk?.voisines));
    ok("hors périmètre : valeur DANS la liste (saisie non commitée) → pas de question",
      q({ champ: "size", valeur: "EU 15", liste: LISTE_SERVIE, valeurOfferte: true, grilleAdulteEnfant: false }) === null);
    ok("hors périmètre : grille adulte servie sur une taille enfant → pas de question", q({ champ: "size", valeur: "3 ans", liste: ["S", "M"], valeurOfferte: false, grilleAdulteEnfant: true }) === null);
    ok("hors périmètre : liste vide / valeur vide / autre champ (État) → pas de question",
      q({ champ: "size", valeur: "15 et moins", liste: [], valeurOfferte: false }) === null
        && q({ champ: "size", valeur: "", liste: LISTE_SERVIE, valeurOfferte: false }) === null
        && q({ champ: "condition", valeur: "Très bon état", liste: ["Neuf avec étiquette"], valeurOfferte: false }) === null);
  }
  ok("update-job-status appelle questionTailleHorsGrille au bout des reprises", /questionTailleHorsGrille\(/.test(UJS));
  const iBranche = UJS.indexOf("} else if (questionTaille) {");
  const branche = iBranche >= 0 ? UJS.slice(iBranche, iBranche + 4000) : "";
  ok("   la question garde needsUserField et pose needs_user_source « champ_a_choisir »",
    /needsUserField:\s*\{/.test(branche) && /needs_user_source:\s*"champ_a_choisir"/.test(branche), branche.slice(0, 200));
}

// ═══ [4] relance-apres-maj ═════════════════════════════════════════════════════
console.log("\n[4] relance-apres-maj — relancer seulement si l'échec vient d'un build plus ancien que le correctif");
{
  const R = await importer("supabase/functions/_shared/relance-apres-maj.js");
  // Le job 479f51c0 du compte 2bde8576 tel qu'il était avant la fausse relance de 16:06 (Paris) le 12/11.
  const lea = {
    id: "479f51c0-a6a0-4e7d-bc3a-8a5875a2ad70", status: "needs_user", action: "republish", platform: "vinted",
    handler_build: "2026-11-10T14:10:14Z+ba13a51 · v0.6.186",
    platform_fields: { needs_user_source: "grille_incoherente", republish_step: "captured", capture_id: 28729,
      taille_grille_refus: { champs: ["taille"], valeurs: { taille: "15 et moins" }, valeur_offerte_par_vinted: false } },
  };
  const r = R.regleDeRelance(lea);
  ok("2bde8576 479f51c0 (échec produit par une 0.6.186) : AUCUNE relance « corrigé par la 0.6.150 »", r === null, JSON.stringify(r));
  for (const id8 of ["1551e403", "242874e4", "72311c9d"]) {
    const j = { id: id8, status: "needs_user", action: "republish", platform: "vinted", handler_build: "2026-10-28T09:52:53Z+9ca925f · v0.6.149",
      platform_fields: { needs_user_source: "grille_incoherente", republish_step: "captured", taille_grille_refus: { champs: ["etat"] } } };
    ok(`68e350f0 ${id8} (échec d'une 0.6.149) : la relance de la 0.6.150 reste`, R.regleDeRelance(j)?.cle === "vinted_menus_bloom_grille", JSON.stringify(R.regleDeRelance(j)));
  }
  const sansBuild = { ...lea, handler_build: null };
  ok("build de l'échec illisible : la règle d'avant (relance une fois)", R.regleDeRelance(sansBuild)?.cle === "vinted_menus_bloom_grille", JSON.stringify(R.regleDeRelance(sansBuild)));
  ok("handler-watch lit le build de l'échec (handler_build dans la sélection des tâches arrêtées)",
    /select\("id, user_id, inventaire_id, status, action, platform, error, platform_fields, handler_build"\)/.test(HW));
}

// ═══ [5] get-pending-jobs ══════════════════════════════════════════════════════
console.log("\n[5] get-pending-jobs — l'id d'origine gardé pour le poste qui le confronte au rayon ; la taille choisie entre dans la capture");
{
  const H = await importer("supabase/functions/_shared/vinted-taille-hors-grille.js");
  const retirer = typeof H.retirerIdsTaillePourCePoste === "function" ? H.retirerIdsTaillePourCePoste : null;
  ok("retirerIdsTaillePourCePoste (module partagé)", !!retirer, H.__erreur ?? "");
  if (retirer) {
    ok("poste 0.6.187 (« taille_groupe_rayon_v1 ») : l'id d'origine n'est PAS retiré",
      retirer({ capacites: ["taille_par_id", "taille_groupe_rayon_v1"] }) === false);
    ok("poste plus ancien (« taille_par_id » seul) : règle du 10/09 inchangée (retiré)", retirer({ capacites: ["taille_par_id"] }) === true);
    ok("interrupteur « tous postes » : retiré partout (retour arrière sans déploiement)",
      retirer({ capacites: ["taille_par_id", "taille_groupe_rayon_v1"], forcerTousPostes: true }) === true);
  }
  ok("get-pending-jobs applique la règle (retirerIdsTaillePourCePoste) dans le retrait du 10/09",
    /retirerIdsTaillePourCePoste\(/.test(GPJ));
  const choisie = typeof H.tailleChoisieVersCapture === "function" ? H.tailleChoisieVersCapture : null;
  ok("tailleChoisieVersCapture (module partagé)", !!choisie);
  if (choisie) {
    // Capture 28729 (compte 2bde8576) telle qu'en base avant le retrait du serveur, et la réponse de la personne.
    const capture = { id: 28729, libelles: { taille: "15 et moins", etat: "Très bon état" },
      payload: { natif: { size_id: null, catalog_id: 1653, item_attributes: [{ code: "size", ids: [657] }, { code: "condition", ids: [2] }] } } };
    const pf = { republish_step: "captured", capture_id: 28729, republish_user_fields: { taille: "EU 15" },
      needsUserResolved: { "republish_user_fields.taille": "EU 15" } };
    const r = choisie({ pf, capture, maintenant: "2026-11-13T09:00:00.000Z" });
    ok("2bde8576 a répondu « EU 15 » : la capture porte « EU 15 »", r?.libelles?.taille === "EU 15" && r?.libelles?.etat === "Très bon état", JSON.stringify(r?.libelles));
    ok("   l'id retiré (657) quitte la copie, gardé dans la trace (réversible)",
      !(r?.payload?.natif?.item_attributes ?? []).some((a) => a.code === "size")
        && (r?.payload?.natif?.item_attributes ?? []).some((a) => a.code === "condition")
        && JSON.stringify(r?.payload?.taille_choisie ?? {}).includes("657") && r?.payload?.taille_choisie?.de === "15 et moins", JSON.stringify(r?.payload ?? null).slice(0, 400));
    ok("   champs_utilisateur.taille posé (la capture dit d'où vient le libellé)", r?.payload?.champs_utilisateur?.taille === "EU 15");
    ok("valeur SERVIE par le serveur (aucune réponse de la personne) → rien", choisie({ pf: { ...pf, needsUserResolved: {} }, capture }) === null);
    ok("déjà dans la capture → rien (jamais réécrit)", choisie({ pf, capture: { ...capture, libelles: { taille: "EU 15" } } }) === null);
    ok("étape a_capturer (la recapture fusionne déjà) → rien", choisie({ pf: { ...pf, republish_step: "a_capturer" }, capture }) === null);
  }
  ok("get-pending-jobs écrit la taille choisie dans la capture (tailleChoisieVersCapture)", /tailleChoisieVersCapture\(/.test(GPJ));
}

// ═══ [6] background.js ═════════════════════════════════════════════════════════
console.log("\n[6] background.js — capacité déclarée ; une taille choisie part par son libellé");
{
  const caps = (() => { try { return extraireFonctionJs(BG, "capacitesDeclarees"); } catch { return ""; } })();
  ok("capacitesDeclarees annonce « taille_groupe_rayon_v1 »", /"taille_groupe_rayon_v1"/.test(caps));
  let construire = null;
  try { construire = new Function("sanitizeJob", `${extraireFonctionJs(BG, "construireJobRecreation")}; return construireJobRecreation;`)((j) => j); } catch { /* rien */ }
  ok("construireJobRecreation extraite", typeof construire === "function");
  if (construire) {
    const base = { payload: { titre: "Baskets bébé", description: "", natif: { item_attributes: [{ code: "size", ids: [657] }] } }, libelles: { taille: "15 et moins" }, photos_urls: ["https://x/1.jpg"] };
    const avant = construire({ id: "479f51c0", inventaire_id: 1 }, {}, base, 10);
    ok("non-régression : capture de Vinted → libellé ET ids (l'id fait foi au formulaire)",
      avant?.platform_fields?.taille === "15 et moins" && JSON.stringify(avant?.platform_fields?.taille_ids) === "[657]", JSON.stringify(avant?.platform_fields ?? {}).slice(0, 200));
    const repondue = { ...base, libelles: { taille: "EU 15" }, payload: { ...base.payload, champs_utilisateur: { taille: "EU 15" } } };
    const apres = construire({ id: "479f51c0", inventaire_id: 1 }, {}, repondue, 10);
    ok("taille choisie par la personne : « EU 15 » sans l'id retiré", apres?.platform_fields?.taille === "EU 15" && !("taille_ids" in (apres?.platform_fields ?? {})),
      JSON.stringify(apres?.platform_fields ?? {}).slice(0, 200));
  }
}

// ═══ [7] Non-régression : la règle du 10/09 (grilles adultes) ═════════════════
// Un poste 0.6.187 reçoit désormais l'id d'origine. Un id RETIRÉ par Vinted (ancienne grille combinée : 3 = « S / 36 / 8 »)
// ne doit jamais changer l'option posée : même résultat que le libellé seul (le chemin des postes plus anciens).
console.log("\n[7] Non-régression — un id absent du rayon ne change jamais l'option posée (grilles adultes, rejeu du parc)");
{
  const SML = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "Taille unique", "Autre"];
  const FEMMES = () => panneau([
    { texte: "S/M/L", groupe: 80, idDepart: 1735, options: SML },
    { texte: "EU", groupe: 82, idDepart: 1940, options: ["EU 32", "EU 34", "EU 36", "EU 38", "EU 40", "EU 42"].map((t) => t.replace(" ", NBSP)) },
    { texte: "UK", groupe: 81, idDepart: 1970, options: ["UK 6", "UK 8", "UK 10", "UK 12", "UK 14"] },
    { texte: "FR", groupe: 83, idDepart: 1955, options: ["FR 34", "FR 36", "FR 38", "FR 40", "FR 42"] },
  ]);
  for (const [taille, idRetire] of [["S / 36 / 8", 3], ["M / 38 / 10", 4], ["EU 38", 999001], ["FR 40", 999002], ["M", 999003], ["UK 12", 999004]]) {
    const a = FEMMES();
    const poseSans = await bac(a.document).selectTailleVinted({ taille }, []);
    const b = FEMMES();
    const poseAvec = await bac(b.document).selectTailleVinted({ taille, taille_ids: [idRetire] }, []);
    ok(`« ${taille} » + id retiré ${idRetire} : même option que le libellé seul`, poseSans === poseAvec && norm(a.clics.at(-1)) === norm(b.clics.at(-1)),
      `sans id : ${poseSans} ${JSON.stringify(a.clics)} / avec id : ${poseAvec} ${JSON.stringify(b.clics)}`);
  }
  const FIXTURE = JSON.parse(lire("scripts/fixtures/tailles-publiees-2026-09-18.json"));
  let n = 0;
  const differents = [];
  for (const c of FIXTURE.combos) {
    if (c.plateforme !== "vinted" || !("attendu_extension" in c)) continue;
    n++;
    const { document, clics } = panneau([{ texte: "", groupe: 1, idDepart: 1, options: c.options }]);
    const pose = await bac(document).selectTailleVinted({ taille: c.taille, taille_ids: [999999] }, []);
    const resultat = pose ? clics[clics.length - 1] : null;
    const permis = resultat === c.attendu_extension || (c.attendu_extension === null && /^\d/.test(c.taille) && norm(resultat) === `EU ${c.taille}`);
    if (!permis) differents.push(`« ${c.taille} » @ ${c.categorie} : attendu ${JSON.stringify(c.attendu_extension)}, obtenu ${JSON.stringify(resultat)}`);
  }
  ok(`rejeu du parc (fixture du 18-23/09, ${n} combinaisons Vinted) avec un id retiré : 0 option changée`, n > 0 && differents.length === 0, differents.slice(0, 5).join(" ; "));
}

console.log(`\n${ko ? `ROUGE — ${ko} échec(s) sur ${vus}` : `VERT — ${vus} vérifications`}\n`);
process.exit(ko ? 1 : 0);
