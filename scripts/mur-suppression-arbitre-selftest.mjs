// selftest:mur-suppression-arbitre — (24/10 soir, vincent.armengol) Un refus de suppression Vinted lu « Connexion
// Vinted requise » (mur passager de l'API) mettait la republication en needs_user « Relance depuis l'app quand tu veux »
// — 4 jobs en pause depuis 14:09 alors que le compte publiait 172 annonces ensuite. Le mur est désormais ARBITRÉ comme
// partout : session bonne → refus passager (pending, 3 / 6 / 10 min) ; sinon attente de session (pending, reprise
// seule sur preuve de connexion). Jamais needs_user pour un mur ; annonce relue en ligne avant, rien soumis.
//   npm run selftest:mur-suppression-arbitre
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BG = fs.readFileSync(path.join(RACINE, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
console.log("mur-suppression-arbitre-selftest");

const debut = BG.indexOf("if (result?.deleteFailed) {");
ok(debut > 0, "la branche « suppression refusée » de la republication existe");
const branche = BG.slice(debut, BG.indexOf("if (result?.unfilledRequired?.length || result?.needsUserField) {", debut));
const iMur = branche.indexOf('if (state === "active" && !murBoutique && motifSessionMorte("vinted", result?.error)) {');
const iNeedsUser = branche.indexOf('await updateJobStatus(accessToken, job.id, "needs_user", {\n            platform_fields: pf,\n            error: state === "active" && murBoutique');
ok(iMur > 0, "un mur de connexion est reconnu dans la branche (motifSessionMorte, annonce relue en ligne)");
ok(iNeedsUser > iMur, "il est traité AVANT l'écriture « needs_user · relance quand tu veux »");
ok(/traiterMurDeConnexion\(accessToken, \{ \.\.\.job, platform_fields: pf \}, result, result\.error\);\s*\n\s*return \{ status: "needsUser"/.test(branche.slice(iMur, iMur + 400)),
  "il passe par l'arbitrage commun (traiterMurDeConnexion), puis rend la main sans rien écrire d'autre");
ok(branche.indexOf("checkListingState(job.listing_url") > 0 && branche.indexOf("checkListingState(job.listing_url") < iMur,
  "l'état réel de l'annonce est relu AVANT (absente → recréation, comme avant)");

// L'arbitrage commun n'écrit JAMAIS needs_user : refus passager (pending) ou attente de session (pending).
const fTraiter = BG.slice(BG.indexOf("async function traiterMurDeConnexion("), BG.indexOf("async function fermerOngletTravail("));
ok(/marquerRefusPassager\(/.test(fTraiter) && /marquerAttenteSession\(/.test(fTraiter) && !/"needs_user"/.test(fTraiter),
  "traiterMurDeConnexion : refus passager ou attente de session, jamais needs_user");
const fAttente = BG.slice(BG.indexOf("async function marquerAttenteSession("), BG.indexOf("async function marquerAttenteSession(") + 4000);
ok(/updateJobStatus\(accessToken, job\.id, "pending"/.test(fAttente) && /En attente de ta connexion à \$\{label\}/.test(fAttente),
  "l'attente de session reste pending, ancre « En attente de ta connexion à » (relancée seule par la base sur preuve)");
// motifSessionMorte reconnaît le texte réel du mur.
const fMotif = BG.slice(BG.indexOf("function motifSessionMorte("), BG.indexOf("function motifSessionMorte(") + 400);
const motifSessionMorte = new Function("estUrlDeConnexionPlateforme", `${fMotif.slice(0, fMotif.indexOf("\n}\n") + 2)}\nreturn motifSessionMorte;`)(() => false);
ok(motifSessionMorte("vinted", "Connexion Vinted requise : se connecter sur vinted.fr dans Chrome (l'onglet de travail est resté ouvert), le job repartira au prochain passage."),
  "le texte réel du 24/10 (vincent.armengol) est bien un mur de connexion");
ok(!motifSessionMorte("vinted", "Suppression refusée par Vinted (HTTP 500)"), "une autre erreur de suppression garde son chemin");

console.log(`mur-suppression-arbitre-selftest : ${n} contrôles verts`);
