// `npm run selftest:grille-incoherente-jamais-impasse` — VERROU (13/11/2026, lot « zéro problème », étape 5, question 3
// de l'agent C). Une republication Vinted arrêtée au pré-vol sur une valeur que son annonce PORTE (deux reprises
// automatiques épuisées, update-job-status) ne finit plus jamais en impasse. Avant : la liste servie était retirée et le
// message disait « Relance depuis l'app ; si ça se reproduit, écris-nous » (État, plusieurs champs, grille adulte sur une
// taille enfant), ou promettait « on reprend au prochain passage » sans que rien ne reprenne (valeur pourtant dans la
// liste). Règle de Nico (12/11) : UNE vraie question avec la liste quand elle est connue ; sinon un message vrai qui dit
// quoi faire ; jamais « écris-nous » comme seule sortie. L'état passe par le juge unique (_shared/etat-correspondance.js).
//
// Cas réels (relus en base le 13/11, lecture seule) :
//   · 68e350f0 · 1551e403 (+ 242874e4, 72311c9d) — État « Très bon état », DANS la liste, arrêt écrit par la 0.6.149 :
//     la relance après mise à jour (0.6.150) le couvre → son message d'attente, jamais « écris-nous » ;
//   · 7d6e2c34 · 6afcb6e8 — État « Bon état », dans la liste, arrêt écrit par la 0.6.169 (après le correctif) → UNE
//     question, « Bon état » en tête ;
//   · ae593eaf · 39201deb — État « Neuf sans étiquette », dans la liste, 0.6.159 → question ;
//   · cdf7007c · e8e1cd5a — Taille « S » + État « Très bon état » (deux champs) : la question de la taille (liste servie),
//     l'autre champ nommé ;
//   · 48dd94f7 · ec5b7f25 — « Taille unique » (Accessoires de mode › Montres), 0.6.159 : la relance 0.6.161 le couvre ;
//   · f3407ada (12/09) — taille enfant « 12 ans / 152 cm », grille FEMME servie : aucune liste proposée (elle ferait
//     choisir faux), un message vrai qui dit quoi faire ;
//   · c48be67a (Medik8, Beauté) — État « Neuf sans étiquette » face à « Neuf avec étiquette » seul : question, le juge
//     d'état met en tête l'équivalent d'un rayon sans étiquette ;
//   · 8a7f95d5 · 82e114ad — État « Satisfaisant », variante SANS liste servie : message vrai (« Relancer »), jamais
//     « écris-nous ».
//   node --import ./scripts/loader-ext.mjs scripts/grille-incoherente-jamais-impasse-selftest.mjs [--racine <dossier>]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iR = process.argv.indexOf("--racine");
const RACINE = iR > 0 ? path.resolve(process.argv[iR + 1]) : ICI;
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
let ko = 0;
let n = 0;
const dit = (nom, c, detail) => { n++; if (!c) ko++; console.log(`  ${c ? "ok  " : "❌  "} ${nom}${c || detail === undefined ? "" : `  → ${detail}`}`); };
const importer = async (rel) => {
  try { return await import(pathToFileURL(path.join(RACINE, rel)).href); } catch (e) { return { __erreur: String(e?.message ?? e).slice(0, 200) }; }
};
const J = (x) => JSON.stringify(x);
const IMPASSE = /écris-nous|ecris-nous|écrivez-nous|contacte[- ]nous/i;
const PROMESSE_FAUSSE = /on reprend au prochain passage/i;

// ═══ A. update-job-status : le texte de l'arrêt « reprises épuisées » ══════════════════════════════════════════════
console.log("\nA. update-job-status : plus aucune impasse au bout des reprises (« écris-nous », promesse sans reprise)");
const UJS = lire("supabase/functions/update-job-status/index.ts");
const debut = UJS.indexOf("const GRILLE_MAX_REPRISES");
const fin = UJS.indexOf("REQUALIFICATION DES ERREURS TECHNIQUES BRUTES");
const zone = debut >= 0 && fin > debut ? UJS.slice(debut, fin) : "";
const code = zone.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"); // les commentaires racontent l'avant
dit("la zone des reprises existe", zone.length > 1000);
dit("aucun « écris-nous » dans les messages de la zone", !IMPASSE.test(code), (code.match(IMPASSE) ?? [])[0]);
dit("aucune promesse « on reprend au prochain passage » (rien ne reprenait)", !PROMESSE_FAUSSE.test(code));
dit("la question de la taille hors grille (point 1c) passe toujours en premier", code.indexOf("} else if (questionTaille) {") > 0
  && code.indexOf("} else if (questionTaille) {") < code.indexOf("issueGrilleIncoherente("), "ordre");
dit("la sortie des autres cas vient du module partagé (issueGrilleIncoherente)", /issueGrilleIncoherente\(/.test(code)
  && /from "\.\.\/_shared\/grille-incoherente-issue\.js"/.test(UJS));
dit("une relance après mise à jour qui couvre l'arrêt garde la main (relance-apres-maj.js)", /regleDeRelance\(/.test(code) && /messageAttenteMaj\(/.test(code));

// ═══ B. Le module : les cas réels ═══════════════════════════════════════════════════════════════════════════════════
console.log("\nB. Le module partagé _shared/grille-incoherente-issue.js — les cas réels");
const M = await importer("supabase/functions/_shared/grille-incoherente-issue.js");
const R = await importer("supabase/functions/_shared/relance-apres-maj.js");
dit("module présent (issueGrilleIncoherente)", typeof M.issueGrilleIncoherente === "function", M.__erreur ?? "absente");
const ETATS = ["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"];
const LIB = { taille: "Taille", etat: "État", marque: "Marque", couleur: "Couleur" };
const nufEtat = (liste = ETATS) => ({ platform: "vinted", field_key: "condition", field_label: "État", target: { root: "vintedAspects", key: "condition" }, input_type: "dropdown", ...(liste ? { allowed_values: liste } : {}) });
const verifQuestion = (nom, r, { champ, tete, longueur }) => {
  dit(`${nom} : UNE question (champ_a_choisir), la liste servie ENTIÈRE`, r?.type === "question" && r?.needs_user_source === "champ_a_choisir"
    && Array.isArray(r?.needsUserField?.allowed_values) && r.needsUserField.allowed_values.length === longueur, J({ t: r?.type, s: r?.needs_user_source, n: r?.needsUserField?.allowed_values?.length }));
  dit(`   « ${tete} » en tête, champ « ${champ} », la cible de la question gardée`, r?.needsUserField?.allowed_values?.[0] === tete && J(r?.champs_a_completer) === J([champ])
    && r?.needsUserField?.target?.key, J({ tete: r?.needsUserField?.allowed_values?.slice(0, 2), c: r?.champs_a_completer, cible: r?.needsUserField?.target }));
  dit("   message vrai : avant toute suppression, annonce intacte, aucune impasse", /AVANT toute suppression/.test(r?.message ?? "") && /intacte/.test(r?.message ?? "")
    && !IMPASSE.test(r?.message ?? "") && !PROMESSE_FAUSSE.test(r?.message ?? ""), r?.message);
};
if (typeof M.issueGrilleIncoherente === "function") {
  const issue = M.issueGrilleIncoherente;
  const relance = (handler_build, pf = {}) => {
    const job = { status: "needs_user", platform: "vinted", action: "republish", handler_build,
      platform_fields: { needs_user_source: "grille_incoherente", republish_step: "captured", ...pf } };
    const regle = R.regleDeRelance?.(job) ?? null;
    return regle ? R.messageAttenteMaj(job, regle) : null;
  };
  // 1. 68e350f0 · 1551e403 — arrêt écrit par la 0.6.149 : la relance après mise à jour le couvre.
  const att = relance("2026-10-28T09:52:53Z+9ca925f · v0.6.149");
  dit("68e350f0 · 1551e403 (0.6.149) : une relance après mise à jour couvre l'arrêt (vinted_menus_bloom_grille)", typeof att === "string" && att.length > 0, String(att));
  const r1 = issue({ cles: ["etat"], valeurs: { etat: "Très bon état" }, nuf: nufEtat(), listeServie: ETATS, champQuestion: "etat",
    valeurOfferte: true, grilleAdulteEnfant: false, libelles: LIB, attenteMaj: att });
  dit("   → son message d'attente (repart seul à la mise à jour), source grille_incoherente gardée pour la relance",
    r1?.type === "message" && r1?.needs_user_source === "grille_incoherente" && r1?.message === att && !IMPASSE.test(r1?.message ?? ""), J(r1));
  // 2. 7d6e2c34 · 6afcb6e8 — arrêt écrit par la 0.6.169 (le correctif 0.6.150 était là) : plus de relance → la question.
  const att2 = relance("2026-11-02T20:10:27Z+02b1390 · v0.6.169");
  dit("7d6e2c34 · 6afcb6e8 (0.6.169) : aucune relance ne couvre l'arrêt (build déjà corrigé)", att2 === null, String(att2));
  const r2 = issue({ cles: ["etat"], valeurs: { etat: "Bon état" }, nuf: nufEtat(), listeServie: ETATS, champQuestion: "etat",
    valeurOfferte: true, grilleAdulteEnfant: false, libelles: LIB, attenteMaj: att2 });
  verifQuestion("7d6e2c34 · 6afcb6e8 « Bon état » (dans la liste)", r2, { champ: "etat", tete: "Bon état", longueur: 5 });
  dit("   le message dit que Vinted propose bien la valeur et que la saisie n'a pas pris (chez nous)", /propose bien/.test(r2?.message ?? "") && /« Bon état »/.test(r2?.message ?? ""), r2?.message);
  // 3. ae593eaf · 39201deb — « Neuf sans étiquette » (0.6.159).
  const r3 = issue({ cles: ["etat"], valeurs: { etat: "Neuf sans étiquette" }, nuf: nufEtat(), listeServie: ETATS, champQuestion: "etat",
    valeurOfferte: true, grilleAdulteEnfant: false, libelles: LIB, attenteMaj: relance("2026-10-29T22:28:02Z+6e59937 · v0.6.159") });
  verifQuestion("ae593eaf · 39201deb « Neuf sans étiquette »", r3, { champ: "etat", tete: "Neuf sans étiquette", longueur: 5 });
  // 4. cdf7007c · e8e1cd5a — deux champs, la question de la taille.
  const TAILLES = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL"];
  const nufTaille = { platform: "vinted", field_key: "size", field_label: "Taille", target: { root: "vintedAspects", key: "size" }, input_type: "dropdown", allowed_values: TAILLES };
  const r4 = issue({ cles: ["taille", "etat"], valeurs: { taille: "S", etat: "Très bon état" }, nuf: nufTaille, listeServie: TAILLES, champQuestion: "taille",
    valeurOfferte: true, grilleAdulteEnfant: false, libelles: LIB, attenteMaj: null });
  verifQuestion("cdf7007c · e8e1cd5a (Taille + État)", r4, { champ: "taille", tete: "S", longueur: 8 });
  dit("   l'autre champ refusé est nommé (État « Très bon état »), une question à la fois", /État « Très bon état »/.test(r4?.message ?? ""), r4?.message);
  // 5. 48dd94f7 · ec5b7f25 — Accessoires de mode › Montres, 0.6.159 : la relance 0.6.161 le couvre.
  const att5 = relance("2026-10-29T22:28:02Z+6e59937 · v0.6.159", { republish_snapshot: { categoryPath: ["Accessoires de mode", "Montres"] } });
  dit("48dd94f7 · ec5b7f25 (« Taille unique », Montres, 0.6.159) : la relance « Pour qui ? » 0.6.161 couvre l'arrêt", typeof att5 === "string", String(att5));
  const MONTRES = ["Jusqu'à 30 mm", "30–38 mm", "39–42 mm", "43–46 mm", "47 mm et plus", "Taille unique"];
  const r5 = issue({ cles: ["taille"], valeurs: { taille: "Taille unique" }, nuf: { ...nufTaille, allowed_values: MONTRES }, listeServie: MONTRES, champQuestion: "taille",
    valeurOfferte: true, grilleAdulteEnfant: false, libelles: LIB, attenteMaj: att5 });
  dit("   → son message d'attente, jamais « écris-nous »", r5?.type === "message" && r5?.message === att5 && !IMPASSE.test(r5?.message ?? ""), J(r5));
  // 6. f3407ada — grille adulte sur une taille enfant : aucune liste (elle ferait choisir faux).
  const FEMME = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL"];
  const r6 = issue({ cles: ["taille", "etat"], valeurs: { taille: "12 ans / 152 cm", etat: "Très bon état" }, nuf: { ...nufTaille, allowed_values: FEMME }, listeServie: FEMME,
    champQuestion: "taille", valeurOfferte: false, grilleAdulteEnfant: true, libelles: LIB, attenteMaj: null,
    categorie: ["Enfants", "Vêtements pour filles", "Pantalons et shorts", "Jeans slim"] });
  dit("f3407ada (« 12 ans / 152 cm », grille femme servie) : un message, AUCUNE liste proposée", r6?.type === "message" && !r6?.needsUserField, J(r6)?.slice(0, 200));
  dit("   il dit ce qui s'est passé (grille adulte, taille enfant, le rayon de l'annonce) et quoi faire (« Relancer »)",
    /grille de tailles adulte/.test(r6?.message ?? "") && /« 12 ans \/ 152 cm »/.test(r6?.message ?? "") && /Enfants › Vêtements pour filles/.test(r6?.message ?? "")
    && /« Relancer »/.test(r6?.message ?? "") && !IMPASSE.test(r6?.message ?? ""), r6?.message);
  // 7. c48be67a — Beauté : seul « Neuf avec étiquette » servi.
  const r7 = issue({ cles: ["etat"], valeurs: { etat: "Neuf sans étiquette" }, nuf: nufEtat(["Neuf avec étiquette"]), listeServie: ["Neuf avec étiquette"],
    champQuestion: "etat", valeurOfferte: false, grilleAdulteEnfant: false, libelles: LIB, attenteMaj: null, rayonId: null });
  dit("c48be67a (Beauté, « Neuf sans étiquette » hors liste) : UNE question avec la liste servie, rien de deviné en tête",
    r7?.type === "question" && J(r7?.needsUserField?.allowed_values) === '["Neuf avec étiquette"]' && J(r7?.en_tete) === "[]" && /n'accepte pas/.test(r7?.message ?? ""), J({ v: r7?.needsUserField?.allowed_values, t: r7?.en_tete, m: r7?.message }));
  const r7b = issue({ cles: ["etat"], valeurs: { etat: "Neuf sans étiquette" }, nuf: nufEtat(["Bon état", "Neuf avec étiquette"]), listeServie: ["Bon état", "Neuf avec étiquette"],
    champQuestion: "etat", valeurOfferte: false, grilleAdulteEnfant: false, libelles: LIB, attenteMaj: null, rayonId: 964 });
  dit("   le juge unique d'état : dans un rayon où l'étiquette n'a pas de sens (964, Maquillage), l'équivalent en tête",
    r7b?.needsUserField?.allowed_values?.[0] === "Neuf avec étiquette" && J(r7b?.en_tete) === '["Neuf avec étiquette"]', J(r7b?.needsUserField?.allowed_values));
  // 8. 8a7f95d5 · 82e114ad, variante sans liste servie.
  const r8 = issue({ cles: ["etat"], valeurs: { etat: "Satisfaisant" }, nuf: nufEtat(null), listeServie: [], champQuestion: "etat",
    valeurOfferte: false, grilleAdulteEnfant: false, libelles: LIB, attenteMaj: null });
  dit("8a7f95d5 · 82e114ad (sans liste servie) : un message vrai qui dit quoi faire (« Relancer »), jamais « écris-nous »",
    r8?.type === "message" && r8?.needs_user_source === "grille_incoherente" && /« Relancer »/.test(r8?.message ?? "") && /État « Satisfaisant »/.test(r8?.message ?? "")
    && !IMPASSE.test(r8?.message ?? ""), r8?.message);
  // Aucun cas ne rend une impasse.
  const tous = [r1, r2, r3, r4, r5, r6, r7, r7b, r8];
  dit("aucune sortie ne contient « écris-nous » ni une promesse de reprise sans reprise", tous.every((r) => r && !IMPASSE.test(r.message ?? "") && !PROMESSE_FAUSSE.test(r.message ?? "")));
}

console.log(`\n${ko ? `❌ ${ko} échec(s) sur ${n}` : `✅ ${n} vérifications`} — selftest:grille-incoherente-jamais-impasse`);
process.exit(ko ? 1 : 0);
