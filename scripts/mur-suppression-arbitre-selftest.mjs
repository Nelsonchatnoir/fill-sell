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
  "le texte réel du 24/10 (client-67a8b907) est bien un mur de connexion");
ok(!motifSessionMorte("vinted", "Suppression refusée par Vinted (HTTP 500)"), "une autre erreur de suppression garde son chemin");

// ── (21/11/2026 après-midi, décision de Nico) « CONNECTE-TOI » SEULEMENT SI LA PLATEFORME LE DIT, SUR LE MOMENT ──────────
ok(/if \(arbitrage\.verdict === "bonne" && await marquerRefusPassager\(accessToken, job, result, arbitrage, \{ sansBorne: true \}\)\) return arbitrage;/.test(fTraiter),
  "21/11 : session prouvée bonne → refus passager SANS borne (plus de « connecte-toi » après 3 refus)");
ok(/if \(arbitrage\.verdict === "inconnue"\) \{\n\s*await marquerSessionNonVerifiee\(accessToken, job, result, arbitrage\);\n\s*return arbitrage;/.test(fTraiter),
  "21/11 : ni bonne ni perdue → nouvel essai, JAMAIS « connecte-toi »");
const fNonVerif = BG.slice(BG.indexOf("async function marquerSessionNonVerifiee("), BG.indexOf("async function fermerOngletTravail("));
ok(/updateJobStatus\(accessToken, job\.id, "pending"/.test(fNonVerif) && !/connecte-toi|En attente de ta connexion/.test(fNonVerif.replace(/\/\/.*$/gm, "").replace(/aucun « connecte-toi »/g, ""))
  && /verdict_session = \{ verdict: "inconnue"/.test(fNonVerif), "21/11 : la session non vérifiée reste pending, sans « connecte-toi », verdict joint pour le serveur");
const fArb = BG.slice(BG.indexOf("async function arbitrerMurDeConnexion("), BG.indexOf("async function marquerRefusPassager("));
ok(/const lu = await lireCompteSurPlateforme\(platform\)/.test(fArb) && fArb.indexOf("lireCompteSurPlateforme") > fArb.indexOf("sessionPlateformeMorte(platform)"),
  "21/11 : la sonde ne conclut pas → le compte est lu sur la plateforme, sur le moment");
const fRefus = BG.slice(BG.indexOf("async function marquerRefusPassager("), BG.indexOf("async function traiterMurDeConnexion("));
ok(/if \(n >= 3 && !sansBorne\) return false;/.test(fRefus) && /\[3, 6, 10\]\[n\] \?\? \(n < 6 \? 60 : n < 9 \? 180 : 360\)/.test(fRefus),
  "21/11 : le refus passager garde sa borne pour les autres appelants, s'espace sans borne pour une session prouvée bonne");
// Le verdict pur de l'onglet de lecture, rejoué.
const iV = BG.indexOf("function verdictLectureCompteOnglet(");
const srcV = BG.slice(iV, BG.indexOf("\n}\n", iV) + 2);
const verdictLectureCompteOnglet = new Function("LECTURE_COMPTE_HORS_SITE_STABLE_MS", `${srcV}\nreturn verdictLectureCompteOnglet;`)(4000);
const t = 1_000_000;
ok(verdictLectureCompteOnglet({ http: 200, id: "42" }, { domaine: "leboncoin.fr" }).issue === "ok", "21/11 : compte lu → ok");
ok(verdictLectureCompteOnglet({ http: 0, motif: "sans_jeton" }, { domaine: "leboncoin.fr" }).issue === null
  && verdictLectureCompteOnglet({ http: 0, motif: "sans_jeton" }, { domaine: "leboncoin.fr", fin: true }).issue === "perdue",
  "21/11 : aucun jeton → on attend la fin (le jeton arrive après le chargement), puis « perdue »");
ok(verdictLectureCompteOnglet({ horsSite: true, hote: "auth.leboncoin.fr", pret: true }, { domaine: "leboncoin.fr", horsSiteDepuis: t - 4000, maintenant: t }).issue === "perdue",
  "21/11 : renvoyée sur la page de connexion de la plateforme (stable 4 s) → perdue");
ok(verdictLectureCompteOnglet({ antiRobot: true }, { domaine: "beebs.app" }).issue === "incertaine"
  && verdictLectureCompteOnglet({ http: 403, id: null }, { domaine: "vinted.fr", fin: true }).issue === "incertaine"
  && verdictLectureCompteOnglet(null, { domaine: "depop.com", fin: true }).issue === "incertaine",
  "21/11 : anti-robot, 403, page muette → incertaine (jamais « perdue »)");

console.log(`mur-suppression-arbitre-selftest : ${n} contrôles verts`);
