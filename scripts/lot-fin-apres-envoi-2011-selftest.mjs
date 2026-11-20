// Autotest VERROU : UN LOT ENVOYÉ FINIT SUR L'ÉCRAN DE FIN, JAMAIS SUR UN BOUTON GRIS SANS QUESTION (20/11/2026, URGENT
// de Nico — Louis, lot de 16 « Présentoir … » vers Leboncoin).
//
//     node --import ./scripts/loader-ext.mjs scripts/lot-fin-apres-envoi-2011-selftest.mjs
//     RACINE=<copie de HEAD> node --import ./scripts/loader-ext.mjs scripts/lot-fin-apres-envoi-2011-selftest.mjs  (rouge avant)
//
// Le cas : Louis envoie ses 16 articles à 09:43:33 (16 prêts, 16 tâches en base). À 09:44:42 il écrit « Il n'y a pas de
// questions », capture à l'appui : les 16 lignes « En file », l'étape 2/3, le bouton gris « Réponds aux questions pour
// envoyer ». La cause : la fin de la boucle d'envoi jugeait « reste-t-il quelque chose ? » sur l'état de l'ÉCRAN, en
// retard d'un rendu sur le dernier article envoyé (encore « envoi ») — tout lot envoyé en entier revenait sur l'étape 2.
// Règle de Nico : « le bouton n'est JAMAIS bloqué par une question que l'écran ne montre pas. Toute question qui bloque
// l'envoi apparaît dans la liste, groupée par champ, avec une ligne par article. Une valeur probable valide n'est pas une
// question bloquante. »
// Ce qu'il prouve :
//   1. resteApresEnvoi : la phase que la boucle vient de poser prime sur l'écran en retard (le cas de Louis : faux) ;
//   2. lotTermineApresEnvoi : tout fini, au moins un parti → écran de fin ;
//   3. boutonSansPret : « Réponds aux questions » seulement avec une question à l'écran ; sinon jamais un bouton gris ;
//   4. un article à régler sans moteur a SA ligne (« À vérifier ») ;
//   5. une valeur probable (blocking:false) ne bloque ni le bouton, ni la plateforme ;
//   6. la carte du lot dit d'où vient une valeur posée : « choisi par FillSell », jamais « ta dernière réponse » ;
//   7. l'écran câble ces règles (LotPublication.jsx, corrections.js).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RACINE = process.env.RACINE ? path.resolve(process.env.RACINE) : path.resolve(".");
const lire = (p) => { try { return fs.readFileSync(path.join(RACINE, p), "utf8"); } catch { return ""; } };
const importer = async (p) => { try { return await import(pathToFileURL(path.join(RACINE, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };
let ko = 0, n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ok   ${quoi}`); else { ko++; console.log(`  ✗    ${quoi}${detail ? `   ← ${String(detail).slice(0, 240)}` : ""}`); } };
const essai = (f) => { try { return f(); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };

const R = await importer("src/publication/lot/regles.js");
const S = await importer("src/publication/lot/sujetsDuLot.js");
const M = await importer("src/publication/moteur/regles.js");

console.log("1. La fin d'un envoi se juge sur la phase que la boucle vient de poser");
const ids = Array.from({ length: 16 }, (_, i) => `p${i}`);
const ecranEnRetard = (id) => (id === "p15" ? "envoi" : "envoye"); // l'écran n'a pas encore redessiné le dernier
ok(typeof R.resteApresEnvoi === "function", "resteApresEnvoi existe", R.__erreur);
ok(essai(() => R.resteApresEnvoi(ids, { posees: { p15: "envoye" }, phaseEcran: ecranEnRetard })) === false, "les 16 partis (le dernier encore « envoi » à l'écran) : rien ne reste — écran de fin");
ok(essai(() => R.resteApresEnvoi(ids, { posees: {}, phaseEcran: ecranEnRetard })) === true, "sans la phase posée, l'écran en retard dit « il reste » (le défaut, gardé pour mémoire)");
ok(essai(() => R.resteApresEnvoi(["a", "b"], { posees: { a: "envoye" }, phaseEcran: (id) => (id === "b" ? "questions" : null) })) === true, "un article à régler reste : retour sur l'étape 2 (« Publier les prêts » du 19/11)");
ok(essai(() => R.resteApresEnvoi(["a", "b"], { posees: { a: "envoye" }, phaseEcran: () => "verification" })) === true, "un article encore en préparation reste");
ok(essai(() => R.resteApresEnvoi(ids, { posees: {}, phaseEcran: () => "pret", arrete: true })) === false, "« Quitter » pendant l'envoi : rien à montrer de plus");
for (const ph of ["refuse", "quota", "erreur", "retire", "rien"]) {
  ok(essai(() => R.resteApresEnvoi(["a", "b"], { posees: { a: "envoye", b: ph }, phaseEcran: () => "envoi" })) === false, `« ${ph} » est une fin`);
}

console.log("\n2. Le lot terminé montre l'écran de fin");
ok(essai(() => R.lotTermineApresEnvoi(ids, () => "envoye")) === true, "16 « En file » : écran de fin");
ok(essai(() => R.lotTermineApresEnvoi(["a", "b"], (id) => (id === "a" ? "envoye" : "refuse"))) === true, "un parti, un refusé : écran de fin (il dit le refus)");
ok(essai(() => R.lotTermineApresEnvoi(["a", "b"], (id) => (id === "a" ? "envoye" : "questions"))) === false, "un article à régler : pas la fin");
ok(essai(() => R.lotTermineApresEnvoi(["a"], () => "rien")) === false, "rien de parti (rien à publier) : pas « C'est parti »");
ok(essai(() => R.lotTermineApresEnvoi([], () => "envoye")) === false, "lot vide : rien");

console.log("\n3. Le bouton sans prêt : « Réponds aux questions » seulement avec une question à l'écran");
const b0 = essai(() => R.boutonSansPret({ nQuestions: 0, enOrigine: 0 }));
ok(b0?.cle === "rien" && b0?.texte === "Retour au stock", "aucune question, rien à lire : « Retour au stock » (jamais « Réponds aux questions »)", JSON.stringify(b0));
const b1 = essai(() => R.boutonSansPret({ nQuestions: 3 }));
ok(b1?.cle === "questions" && /Réponds aux questions/.test(b1?.texte), "3 articles à régler : « Réponds aux questions pour envoyer »", JSON.stringify(b1));
ok(essai(() => R.boutonSansPret({ nQuestions: 0, enOrigine: 2 }))?.cle === "origine", "des annonces d'origine en lecture : on le dit");
ok(essai(() => R.boutonSansPret({ nQuestions: 0, enOrigine: 2, sansLecteur: true }))?.cle === "sans_lecteur", "sans lecteur : « Choisis pour chaque article »");
ok(essai(() => R.boutonSansPret({ nQuestions: 0, lang: "en" }))?.texte === "Back to stock", "anglais");

console.log("\n4. Un article à régler a TOUJOURS sa ligne, moteur compris ou pas");
const sm = essai(() => S.questionsDeLArticle(null, [{ cle: "questions" }]));
ok(Array.isArray(sm) && sm.length === 1 && sm[0].type === "cta", "sans moteur : une ligne « À vérifier »", JSON.stringify(sm));
const avecM = essai(() => S.questionsDeLArticle({ clesQuestions: [] }, [{ cle: "cta" }]));
ok(Array.isArray(avecM) && avecM.length === 1 && avecM[0]?.sujet === sm?.[0]?.sujet, "même groupe que le motif du bouton gris (une seule rubrique « À vérifier »)", JSON.stringify(avecM));
const grp = essai(() => S.sujetsDuLot([{ id: "x", questions: sm }, { id: "y", questions: avecM }]));
ok(Array.isArray(grp) && grp.length === 1 && grp[0].lignes.length === 2, "groupées par champ, une ligne par article", JSON.stringify(grp));

console.log("\n5. Une valeur probable (posée, modifiable) n'est pas une question bloquante");
const probable = { key: "creative_activities_product", label: "Produit", state: "missing", blocking: false, suggested: "Autre", deduit: { valeur: "Autre", probable: true } };
ok(M.aspectBloquant?.(probable) === false, "« Produit » Leboncoin pré-rempli « Autre » (Loisirs créatifs) : ne bloque pas");
ok(Array.isArray(M.plateformesBloqueesChamps?.(new Set(["leboncoin"]), { leboncoin: [probable] })) && M.plateformesBloqueesChamps(new Set(["leboncoin"]), { leboncoin: [probable] }).length === 0, "Leboncoin n'est pas retenue au clic");
const qProb = essai(() => S.questionsDeLArticle({ clesQuestions: [], genericRequiredStatus: { leboncoin: [probable] }, plateformesPubliables: new Set(["leboncoin"]) }, []));
ok(Array.isArray(qProb) && !qProb.some((q) => String(q.cle).startsWith("leboncoin:")), "aucune question « Produit · Leboncoin » posée pour elle", JSON.stringify(qProb));

console.log("\n6. La carte du lot dit d'où vient la valeur posée");
const pp = essai(() => R.phrasePoseDuLot({ valeur: "Autre", n: 6, categorie: "Loisirs > Loisirs créatifs", sorte: "probable", motif: "aucune option de la liste n'est nommée par l'annonce : « Autre »" }));
ok(typeof pp === "string" && /choisi par FillSell/.test(pp) && !/derni[eè]re r[ée]ponse/.test(pp) && /sur 6 articles/.test(pp), "valeur probable : « choisi par FillSell », jamais « ta dernière réponse »", pp);
const pm = essai(() => R.phrasePoseDuLot({ valeur: "Femme", n: 2, categorie: "Mode > Vêtements" }));
ok(typeof pm === "string" && /repris de ta dernière réponse pour « Mode > Vêtements »/.test(pm), "mémoire du compte : « repris de ta dernière réponse » (inchangé)", pm);

console.log("\n7. L'écran câble ces règles");
const lp = lire("src/publication/lot/LotPublication.jsx");
const envoi = lp.slice(lp.indexOf("async function envoyerUnParUn"), lp.indexOf("if (parti) onEnvoye?.", lp.indexOf("async function envoyerUnParUn")));
ok(/resteApresEnvoi\(lot\.ids, \{ posees/.test(envoi), "la fin de l'envoi lit les phases POSÉES par la boucle");
ok(!/PHASES_FINIES_DU_LOT\.has\(etatsRef\.current/.test(lp), "plus jamais l'écran en retard pour juger la fin");
ok((envoi.match(/majEtat\(id, /g) ?? []).length === 1 && /const poser = \(id, patch\) => \{ if \(patch\?\.phase\) posees\[id\] = patch\.phase; majEtat\(id, patch\); \}/.test(envoi), "chaque phase posée par la boucle est notée");
ok(/boutonSansPret\(\{ nQuestions: aCompleter\.length/.test(lp) && !/"Réponds aux questions pour envoyer"/.test(lp), "le bouton sans prêt passe par la règle (aucun « Réponds aux questions » en dur)");
ok(/sansPret\.cle === "rien"\) \{ disabled = false;/.test(lp), "rien à régler : le bouton n'est pas gris");
ok(/lotTermineApresEnvoi\(lot\.ids, \(id\) => etats\[id\]\?\.phase\)/.test(lp) && /if \(termine\) setEtape\("fin"\)/.test(lp), "filet : un lot terminé passe à l'écran de fin");
ok((lp.match(/phrasePoseDuLot\(\{/g) ?? []).length === 2 && !/repris de ta dernière réponse pour « \$\{g\.pose\.categorie\}/.test(lp), "les deux cartes « valeur posée » disent leur source");
ok(/pose\.sorte === "probable"/.test(lire("src/publication/lot/corrections.js")), "la liste des corrections d'un article aussi");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ tout est vert — ${n} vérifications`);
process.exit(ko ? 1 : 0);
