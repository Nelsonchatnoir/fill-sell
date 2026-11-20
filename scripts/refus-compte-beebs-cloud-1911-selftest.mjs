// VERROU (19-20/11/2026 nuit, URGENT de Nico — cliente Cloud 35ab6f0f) : QUAND LA PLATEFORME REFUSE LE COMPTE AU CLIC
// « METTRE EN VENTE », CE N'EST JAMAIS UN « REFUS PASSAGER… RIEN À FAIRE », TOUTE LA FILE DE LA PLATEFORME EST RETENUE, ET
// UN CLIENT DU CLOUD NE LIT JAMAIS « CHROME ».
// Preuve (lecture seule de son onglet Beebs sur cloud-2, comparée au Cloud de Nico qui a publié 34393573 à 00:00:32 avec la
// même session Google) : chez elle, au clic, Beebs refuse LUI-MÊME « Vous devez être connecté pour ajouter un produit » sans
// rien envoyer ; update-job-status, voyant la sonde « connecté », réécrivait « refus passager… rien à faire » — 0 publication
// sur 192, un essai toutes les 1 à 2 min. Maintenant : refusDeCompteParLaPlateforme → jamais la preuve de « bonne session »,
// l'attente de connexion avec `refus_compte` ; get-pending-jobs retient TOUTE la file de la plateforme (une tâche-sonde par
// heure) tant qu'aucun dépôt n'a réussi ; texte du Cloud (« Me connecter » dans l'app). Rouge sur eb71704, vert après.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let echecs = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };
const lire = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const S = await import("../supabase/functions/_shared/session-prouvee.js");
ok(typeof S.refusDeCompteParLaPlateforme === "function", "refusDeCompteParLaPlateforme existe");
if (typeof S.refusDeCompteParLaPlateforme === "function") {
  const brut = "Connexion Beebs requise : Beebs ne reconnaît pas ton compte au moment de mettre en vente (« Vous devez être connecté pour ajouter un produit ») pour « Veste » — rien n'a été publié.";
  ok(S.refusDeCompteParLaPlateforme(brut), "le message de l'extension est reconnu");
  ok(S.refusDeCompteParLaPlateforme("", [{ message: "observabilité : erreurs : root — Vous devez être connecté pour ajouter un produit" }]), "… et les mots de Beebs dans les avertissements de CE rapport");
  ok(!S.refusDeCompteParLaPlateforme("Beebs a refusé l'accès à la page (403)"), "un vrai refus de page reste un refus passager possible");
  ok(!S.refusDeCompteParLaPlateforme("Connexion Beebs requise : se connecter sur beebs.app (page observée : /login)"), "une vraie déconnexion garde son chemin");
}
const u = lire("supabase/functions/update-job-status/index.ts");
ok(u.includes("const refusCompteS = refusDeCompteParLaPlateforme(brutVerdict, (pfBodyS ?? {}).warnings);")
  && u.includes('if (jrow.platform !== "ebay" && !vueAcheteurS && !refusCompteS) {'),
  "update-job-status : un refus du compte par la plateforme n'est jamais une « bonne session » (aucun refus passager)");
ok(u.includes("const cloudS = estPosteCloud(body.handler_build);") && u.includes("texteAttenteSessionCloud({ platform: jrow.platform, action: jrow.action }, label)"),
  "poste Cloud : le texte de l'attente vient de texteAttenteSessionCloud (jamais « Chrome »)");
ok(u.includes("refuse ton compte au moment de mettre en vente") && u.includes("Réglages › Mes plateformes › « Me connecter »"), "refus du compte sur le Cloud : les mots de la plateforme et le geste dans l'app");
ok(u.includes("...(refusCompteS ? { refus_compte: { le: maintenant, plateforme: jrow.platform"), "update-job-status pose refus_compte sur la tâche refusée");
const g = lire("supabase/functions/get-pending-jobs/index.ts");
const iBloc = g.indexOf("LE COMPTE REFUSÉ PAR LA PLATEFORME RETIENT TOUTE SA FILE");
const iMortes = g.indexOf("if (mortes.size) {", iBloc);
const blocG = iBloc >= 0 ? g.slice(iBloc, iMortes) : "";
ok(blocG.includes('.not("platform_fields->refus_compte", "is", null)') && blocG.includes('.eq("status", "published").gt("published_at", new Date(t).toISOString())'),
  "get-pending-jobs : un refus de compte sans dépôt réussi depuis retient TOUTE la file de la plateforme");
ok(blocG.includes('mortes.set(pf, { observeeLe: t, fraiche: Date.now() - t < REFUS_COMPTE_PAUSE_MS, cloud: cloudVoie === true, actions: ["publish", "republish"] });'),
  "… une seule tâche-sonde par heure, texte du Cloud pour un client du Cloud, publications et republications seulement");
ok(g.includes('const files = out.filter((j) => j.platform === pf && (!m.actions || m.actions.includes(String(j.action ?? "publish"))));'),
  "… un retrait (article vendu ailleurs) n'est jamais retenu par un refus de compte");
ok(g.includes('import { REFUS_COMPTE_PAUSE_MS } from "../_shared/session-prouvee.js";'), "… la même pause que le démarrage (module partagé)");
ok(iBloc > 0 && iMortes > iBloc, "… lu AVANT la retenue (même marqueur, même message, rien d'annulé)");
// ── (20/11 00:43) LE DÉMARRAGE : une liste reçue AVANT le refus ne part plus (191 publications reçues d'un coup à 00:36) ──
ok(typeof S.refusCompteRetient === "function" && S.REFUS_COMPTE_PAUSE_MS === 3600_000, "refusCompteRetient et la pause d'une heure existent");
if (typeof S.refusCompteRetient === "function") {
  const T = Date.parse("2026-11-19T23:39:32.705Z");
  const refus = [{ le: "2026-11-19T23:39:32.705Z" }, { le: "2026-11-19T23:40:30Z" }, null, { le: "illisible" }];
  ok(S.refusCompteRetient({ refus, maintenant: T + 3 * 60_000 }).retient, "rejeu 35ab6f0f : la tâche suivante de la liste reçue à 00:36 ne démarre pas");
  ok(S.refusCompteRetient({ refus, maintenant: T + 3 * 60_000 }).dernier === Date.parse("2026-11-19T23:40:30Z"), "… le DERNIER refus fait foi");
  ok(!S.refusCompteRetient({ refus, maintenant: Date.parse("2026-11-19T23:40:30Z") + 3600_000 }).retient, "une heure après le dernier refus : UNE tâche part (la sonde)");
  ok(!S.refusCompteRetient({ refus, depotDepuis: true, maintenant: T + 60_000 }).retient, "un dépôt réussi depuis le refus lève la retenue");
  ok(!S.refusCompteRetient({ refus: [], maintenant: T }).retient && !S.refusCompteRetient({ refus: [{ le: "x" }], maintenant: T }).retient, "aucun refus lisible : rien n'est retenu");
}
const iGarde = u.indexOf("LE COMPTE REFUSÉ PAR LA PLATEFORME NE DÉMARRE RIEN");
const garde = iGarde > 0 ? u.slice(iGarde, u.indexOf("L'EXÉCUTANT CLOUD PREND SES JOBS PAR LA PRISE ATOMIQUE", iGarde)) : "";
ok(iGarde > 0 && iGarde < u.indexOf('adminReservation.rpc("prendre_job"'), "update-job-status : la garde de démarrage passe AVANT la prise du Cloud (et vaut pour tous les postes)");
ok(garde.includes('if (status === "processing" && reservation.statut === "pending") {') && garde.includes('(actionRC === "publish" || actionRC === "republish")')
  && garde.includes('jRC.platform !== "ebay"'), "… au démarrage seulement, publications et republications (jamais un retrait), hors eBay");
ok(garde.includes('.not("platform_fields->refus_compte", "is", null)') && garde.includes('.eq("status", "published").gt("published_at", new Date(avant.dernier).toISOString())')
  && garde.includes("return json({ error: `Démarrage retenu : ") && garde.includes("}, 409);"),
  "… dernier refus + aucun dépôt depuis → 409 (l'extension : « skipped » avant d'ouvrir l'onglet, rien d'écrit)");
ok(!garde.includes(".update(") && garde.includes("catch (_e) { /* jamais un point de panne"), "… la garde n'écrit rien et ne bloque jamais sur une lecture ratée");
const A = await import("../supabase/functions/_shared/attente-session.js");
const t = A.texteAttenteSessionCloud({ platform: "beebs", action: "publish" }, "Beebs");
ok(!/chrome|ordinateur|extension/i.test(t) && /FillSell Cloud/.test(t), "le texte Cloud ne parle ni de Chrome, ni d'ordinateur, ni d'extension");

console.log(echecs ? `✗ refus-compte-beebs-cloud-1911 : ${total - echecs}/${total}` : `✓ refus-compte-beebs-cloud-1911 : ${total}/${total}`);
process.exit(echecs ? 1 : 0);
