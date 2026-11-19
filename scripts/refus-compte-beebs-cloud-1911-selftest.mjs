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
ok(blocG.includes("mortes.set(pf, { observeeLe: t, fraiche: Date.now() - t < 3600_000, cloud: cloudVoie === true });"), "… une seule tâche-sonde par heure, texte du Cloud pour un client du Cloud");
ok(iBloc > 0 && iMortes > iBloc, "… lu AVANT la retenue (même marqueur, même message, rien d'annulé)");
const A = await import("../supabase/functions/_shared/attente-session.js");
const t = A.texteAttenteSessionCloud({ platform: "beebs", action: "publish" }, "Beebs");
ok(!/chrome|ordinateur|extension/i.test(t) && /FillSell Cloud/.test(t), "le texte Cloud ne parle ni de Chrome, ni d'ordinateur, ni d'extension");

console.log(echecs ? `✗ refus-compte-beebs-cloud-1911 : ${total - echecs}/${total}` : `✓ refus-compte-beebs-cloud-1911 : ${total}/${total}`);
process.exit(echecs ? 1 : 0);
