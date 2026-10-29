// ═══════════════════════════════════════════════════════════════════════════
// LA QUESTION « SOUS-CATÉGORIE » ATTEND LE MOTEUR AVANT DE PARTIR — `npm run selftest:rayon-moteur-attendu`
// ═══════════════════════════════════════════════════════════════════════════
// 25/10 (audit N9) : cartes Pokémon du compte 40e1122e (328c17f2 « Jeton pikachu », 9de4f193 « Ferosinge
// 55/64 », 20-21/10). Vinted a fait de « Cartes à collectionner » (4874) un niveau intermédiaire ; la feuille
// « Cartes à collectionner à l'unité » (4875) est dans l'arbre relevé — le moteur l'aurait choisie, mais il ne
// lisait que les questions déjà posées et la personne avait répondu en 2 min. Règle
// (supabase/functions/_shared/rayon-moteur-attendu.js) :
//   1. update-job-status met la question de côté (pending, +6 min, rayon_moteur_attendu) — une fois par job ;
//   2. handler-watch voit la pause comme sa question : le moteur tranche (feuille posée, aucune question) ;
//   3. sinon la question part (feuilles du moteur, ou celle de l'extension), et la pause se ferme ;
//   4. jamais à l'étape « deleted », jamais après une réponse, jamais quand le moteur est déjà passé.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const A = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/rayon-moteur-attendu.js")).href);
const M = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/rayon-refuse-moteur.js")).href);
const lire = (f) => readFileSync(join(RACINE, f), "utf8").replace(/\r\n/g, "\n");
let ko = 0, ok = 0;
const verifier = (c, quoi, detail = "") => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ""}`); } };

const SOUS_NIVEAUX = ["Cartes à collectionner à l'unité", "Boosters", "Coffrets de boosters", "Jeux de cartes", "Lots de cartes à collectionner", "Cartes non découpées"];
const QUESTION = { field_key: "categoryLevelChoice", field_label: "Catégorie Vinted", allowed_values: SOUS_NIVEAUX, input_type: "selection_only", target: { root: null, key: "categoryLevelChoice" }, platform: "vinted" };
const MESSAGE = "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Le catalogue Vinted demande une sous-catégorie plus précise sous « Cartes à collectionner ». Choisis-la parmi celles que Vinted propose — ton annonce partira ensuite toute seule.";
const pfFerosinge = () => ({
  capture_id: 16530, republish_step: "captured", needs_user_source: "prevol_negatif", needsUserField: { ...QUESTION },
  champs_a_completer: ["Catégorie Vinted"], needsUserBoucle: { categoryLevelChoice: { n: 1, valeur: null } }, needsUserAttempts: 0,
  needs_user_tick_le: "2026-10-21T02:28:00Z", processing_since: "2026-10-21T02:26:30Z", vinted_item_id: "5037310088",
  republish_snapshot: { capture_id: 16530, catalog_id: 4874, categoryPath: ["Loisirs et collections", "Cartes à collectionner"], titre: "Ferosinge 55/64 première édition", marque: "Pokémon" },
});
const T0 = new Date("2026-10-21T02:27:56.000Z");

console.log("1. update-job-status : la question mise de côté pour le moteur");
const p = A.pauseRayonMoteur({ platform: "vinted", action: "republish", pfIn: pfFerosinge(), pfEnBase: { republish_step: "captured", needsUserAttempts: 0 }, message: MESSAGE, maintenant: T0 });
verifier(p?.pause === true && p.jusqu_a === "2026-10-21T02:33:56.000Z" && p.pf.next_action_after === p.jusqu_a, "9de4f193 : la question ne part pas — en file, échéance +6 min (aucun poste ne la reprend avant)");
verifier(!p.pf.needsUserField && !p.pf.needs_user_source && !p.pf.champs_a_completer && !p.pf.needs_user_tick_le && !p.pf.processing_since,
  "… la question, son motif et ses compteurs retirés du job (rien n'est demandé à la personne)");
const att = p.pf.rayon_moteur_attendu;
verifier(att?.question?.field_key === "categoryLevelChoice" && att.message === MESSAGE && att.needs_user_source === "prevol_negatif" && att.champs_a_completer?.[0] === "Catégorie Vinted",
  "… la question de l'extension gardée de côté (champ, message, motif)");
verifier(p.pf.republish_step === "captured" && p.pf.capture_id === 16530 && p.pf.needsUserAttempts === 0, "… même étape, même capture ; la pause n'est pas une tentative");
verifier(/AVANT toute suppression/.test(p.message) && /rien à faire/.test(p.message) && /intacte/.test(p.message), `message : « ${p.message} »`);
verifier(/Publication en attente/.test(A.pauseRayonMoteur({ platform: "vinted", action: "publish", pfIn: { needsUserField: { ...QUESTION }, categoryPath: ["Loisirs et collections", "Cartes à collectionner"] }, maintenant: T0 })?.message ?? ""),
  "une publication Vinted aussi (message de publication)");
verifier(A.pauseRayonMoteur({ platform: "vinted", action: "republish", pfIn: { ...pfFerosinge(), republish_step: "deleted", deleted_at: "x" }, maintenant: T0 }) === null, "⛔ étape « deleted » (annonce hors ligne) : la question part, comme avant");
verifier(A.pauseRayonMoteur({ platform: "vinted", action: "republish", pfIn: { ...pfFerosinge(), rayon_moteur: { chemin: ["x"] } }, maintenant: T0 }) === null, "⛔ le moteur est déjà passé sur ce job : la question part (le balayage la juge)");
verifier(A.pauseRayonMoteur({ platform: "vinted", action: "republish", pfIn: { ...pfFerosinge(), categoryLevelChoice: "Boosters" }, maintenant: T0 }) === null, "⛔ une réponse de la personne déjà donnée : jamais remise en pause");
// (29/10, lot B 4.1 — mele.marta 2fd83d73) Racines d'une autre langue : le rayon n'est pas refusé, le moteur n'a rien à choisir.
verifier(A.pauseRayonMoteur({ platform: "vinted", action: "publish", pfIn: { categoryPath: ["Électronique", "Jeux vidéo et consoles", "Jeux"], vinted_ids: { catalog_id: 3026 },
  needsUserField: { ...QUESTION, allowed_values: ["Accessori", "Donna", "Uomo", "Bambini", "Casa", "Elettronica", "Libri e media", "Hobby e collezionismo", "Sport"] } }, maintenant: T0 }) === null,
  "⛔ racines italiennes (page étrangère) : pas de pause moteur, ce n'est pas un rayon refusé");
verifier(A.pauseRayonMoteur({ platform: "vinted", action: "republish", pfIn: { ...pfFerosinge(), needsUserField: { ...QUESTION, field_key: "color" } }, maintenant: T0 }) === null
  && A.pauseRayonMoteur({ platform: "beebs", action: "republish", pfIn: pfFerosinge(), maintenant: T0 }) === null, "une autre question, une autre plateforme : rien");
verifier(A.pauseRayonMoteur({ platform: "vinted", action: "republish", pfIn: { ...pfFerosinge(), republish_snapshot: { capture_id: 16530, categoryPath: ["Rayon inventé"] } }, maintenant: T0 }) === null,
  "rayon inconnu de l'arbre relevé (le moteur ne sait pas juger) : la question part");
const deux = A.pauseRayonMoteur({ platform: "vinted", action: "republish", pfIn: { ...pfFerosinge(), needs_user_actif_ms: 10 }, pfEnBase: { rayon_moteur_attendu: att }, maintenant: new Date("2026-10-21T02:40:00Z") });
verifier(deux?.pause === false && deux.pf.rayon_moteur_attendu?.issue === "question_partie" && deux.pf.needsUserField?.field_key === "categoryLevelChoice" && !("needs_user_actif_ms" in deux.pf),
  "pause déjà prise (balayage arrêté) : la question part au second passage, la pause se ferme — jamais une boucle");

console.log("2. handler-watch : la pause vue comme sa question, le moteur tranche");
const enFile = { id: "9de4f193", user_id: "40e1122e", platform: "vinted", action: "republish", status: "pending", title: "Ferosinge 55/64 première édition", error: p.message, platform_fields: p.pf };
const v = A.jobDeLaPauseRayon(enFile, Date.parse("2026-10-21T02:30:00Z"));
verifier(v?.jq.status === "needs_user" && v.jq.platform_fields.needsUserField.field_key === "categoryLevelChoice" && v.echue === false, "la pause ouverte : le job vu comme sa question, échéance pas encore passée");
verifier(A.jobDeLaPauseRayon(enFile, Date.parse("2026-10-21T02:34:00Z"))?.echue === true, "… échéance passée au-delà de 6 min");
const plan = M.rayonRefuseDuJob(v.jq);
verifier(plan?.plateforme === "vinted" && plan.base.join(" › ") === "Loisirs et collections › Cartes à collectionner" && plan.enfantsVivants?.length === 6, "le moteur reconnaît le cas (niveau intermédiaire, sous-niveaux vivants)");
const entree = A.entreeMoteurDuJob(v.jq, plan, { titre: "Ferosinge", attributs: { marque: { v: "Pokémon" } } });
verifier(entree.titre === "Ferosinge 55/64 première édition" && entree.marque === "Pokémon" && entree.base.length === 2 && entree.user_id === "40e1122e", "l'entrée du moteur : titre, marque, rayon d'origine (même lecture que le balayage)");
const r = await M.resoudreRayonRefuse(entree, async (corps) => {
  const cands = corps.candidats.vinted.map((c) => c.chemin.at(-1));
  return { choix: { vinted: { chemin: ["Loisirs et collections", "Cartes à collectionner", cands.includes("Cartes à collectionner à l'unité") ? "Cartes à collectionner à l'unité" : cands[0]] } } };
});
verifier(r.chemin?.at(-1) === "Cartes à collectionner à l'unité" && r.id === "4875", "la feuille « Cartes à collectionner à l'unité » (4875) — celle que la personne avait choisie");
const pfR = M.pfApresRayon(v.jq, { chemin: r.chemin, id: r.id }, { plateforme: "vinted", base: plan.base, source: "ia", par: "test" });
verifier(pfR.republish_snapshot.catalog_id === 4875 && pfR.republish_snapshot.categoryPath.length === 3 && !pfR.needsUserField && !pfR.next_action_after && pfR.republish_step === "captured",
  "posée sur la copie, question et échéance retirées, même étape : le job repart aussitôt, le pré-vol refait son contrôle avant tout retrait");
verifier(A.jobDeLaPauseRayon({ ...enFile, platform_fields: { ...p.pf, next_action_after: "2026-10-21T03:00:00Z" } }) === null, "⛔ le job a vécu depuis (autre échéance) : rien à juger");
verifier(A.jobDeLaPauseRayon({ ...enFile, platform_fields: { ...p.pf, rayon_moteur_attendu: { ...att, issue: "choisi" } } }) === null
  && A.jobDeLaPauseRayon({ ...enFile, status: "processing" }) === null, "⛔ pause close, ou job repris par un poste : rien");

console.log("3. la question part (doute, échéance)");
const sans = A.pfQuestionApresPause(enFile, att, { maintenant: new Date("2026-10-21T02:34:00Z") });
verifier(sans.pf.needsUserField?.field_key === "categoryLevelChoice" && sans.pf.needs_user_source === "prevol_negatif" && sans.message === MESSAGE && !sans.pf.next_action_after,
  "sans feuille du moteur : la question de l'extension, telle quelle (champ, motif, message)");
verifier(sans.pf.rayon_moteur_attendu.issue === "question_partie", "… la pause se ferme");
const feuilles = M.feuillesCandidates({ plateforme: "vinted", base: plan.base, enfantsVivants: plan.enfantsVivants });
const qM = M.questionRayonRefuse({ plateforme: "vinted", base: plan.base, feuilles, cleChamp: M.CLE_REPONSE_RAYON });
const avec = A.pfQuestionApresPause(enFile, att, { question: qM, message: M.messageRayonAChoisir("vinted", plan.base), rayonMoteur: { doute: true, essais: 3 } });
verifier(avec.pf.needsUserField.field_key === "rayonChoisi" && avec.pf.needs_user_source === "champ_a_choisir" && avec.pf.rayon_moteur?.doute && avec.pf.rayon_moteur_attendu.issue === "question_du_moteur",
  "doute du moteur : sa question (des FEUILLES, une réponse suffit), tracée");

console.log("4. le câblage serveur");
const ujs = lire("supabase/functions/update-job-status/index.ts");
const hw = lire("supabase/functions/handler-watch/index.ts");
verifier(/import \{ pauseRayonMoteur \} from "\.\.\/_shared\/rayon-moteur-attendu\.js";/.test(ujs) && /pauseRayonMoteur\(\{/.test(ujs)
  && /if \(pfRayonMoteurAttendu\) patch\.platform_fields = pfRayonMoteurAttendu;/.test(ujs), "update-job-status : la pause est posée au point de passage de toutes les extensions");
const iU = ujs.indexOf("LA QUESTION « SOUS-CATÉGORIE » ATTEND LE MOTEUR AVANT DE PARTIR");
const iPatch = ujs.indexOf("const patch: Record<string, unknown> = { status: statutEffectif };");
verifier(iU > 0 && iPatch > iU && /statutEffectif = "pending";/.test(ujs.slice(iU, iPatch)), "… avant l'écriture : le statut écrit est « pending »");
const iH = hw.indexOf("LA QUESTION « SOUS-CATÉGORIE » MISE DE CÔTÉ ATTEND CE BALAYAGE");
const blocH = hw.slice(iH, hw.indexOf("UNE ANNONCE RETIRÉE QUI NE REVIENT PAS NE GÈLE PLUS LES AUTRES", iH));
verifier(iH > 0 && /\.eq\("status", "pending"\)/.test(blocH) && /\.is\("platform_fields->rayon_moteur_attendu->>issue", null\)/.test(blocH) && /\.limit\(8\)/.test(blocH),
  "handler-watch : lit les pauses ouvertes, 8 par passage");
verifier(/jobDeLaPauseRayon\(j, Date\.now\(\)\)/.test(blocH) && /resoudreRayonRefuse\(entreeMoteurDuJob\(jq, plan, fiche\)/.test(blocH) && /pfApresRayon\(jq, choix/.test(blocH)
  && /pfQuestionApresPause\(j, att/.test(blocH), "… le moteur tranche, sinon la question part");
verifier((blocH.match(/casPause\(/g) ?? []).length === 3 &&/q\.eq\("id", j\.id\)\.eq\("status", "pending"\)\.is\("platform_fields->rayon_moteur_attendu->>issue", null\)/.test(blocH),
  "… compare-and-swap : pending ET pause encore ouverte (jamais par-dessus une reprise)");
verifier(/r\?\.iaIndisponible && !echue/.test(blocH), "… IA injoignable : nouvel essai au passage suivant, jusqu'à l'échéance");

console.log(`\n${ko ? `✗ ${ko} échec(s)` : "✓ tout est vert"} — ${ok} contrôles`);
process.exit(ko ? 1 : 0);
