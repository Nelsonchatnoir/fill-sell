// Autotest : RETRAIT LEBONCOIN EN VUE ACHETEUR = ATTENTE DE CONNEXION (26/10, Ritthik 2003).
//
//     npm run selftest:lbc-vue-visiteur
//
// Lecteur DVD LG 3264507731 : trois essais « Contrôle « Supprimer l'annonce » introuvable », annonce en ligne. La
// page montrait la vue VISITEUR (« Acheter / Faire une offre / Contacter », vendeur « RiseFit ») : l'ordinateur n'était
// pas connecté au compte qui l'a publiée. Ce qu'il prouve, sans réseau ni base :
//   A. le diagnostic réel de Ritthik est reconnu, le vendeur affiché est lu ; la vue propriétaire ne l'est jamais ;
//   B. la phrase garde l'ancre « En attente de ta connexion à » et dit le geste ; délais = échelle de l'extension ;
//   C. update-job-status : pending, aucune tentative consommée, attente_session, Leboncoin retrait/republication ;
//   D. l'extension 0.6.147 le dit elle-même (« Connexion Leboncoin requise », reconnu comme session morte).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let ko = 0;
const ok = (c, m, detail) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); } };
const V = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/lbc-vue-visiteur.js")).href);

const RITTHIK = "contrôle Supprimer introuvable sur la page de l'annonce 3264507731 — 1 <aside>, actions relevées: [\"RiseFit\",\"5(12)\",\"38 annonces\",\"Réactif\",\"Acheter\",\"Faire une offre\",\"Contacter\"] ; largeur 0px, vendeur private, « Gérer » absent";
const PROPRIO = "contrôle Supprimer introuvable sur la page de l'annonce 3264507731 — 1 <aside>, actions relevées: [\"Modifier l'annonce\",\"Mettre en pause\"] ; largeur 900px, vendeur private, « Gérer » absent";
const VIDE = "contrôle Supprimer introuvable sur la page de l'annonce 3264507731 — 0 <aside>, actions relevées: [] ; largeur 0px, vendeur ?, « Gérer » absent";

console.log("A. Reconnaissance");
const r = V.vueVisiteurLbc(RITTHIK);
ok(r && r.vendeur === "RiseFit", "diagnostic réel de Ritthik : vue acheteur, vendeur « RiseFit »", r);
ok(V.vueVisiteurLbc(PROPRIO) === null, "vue propriétaire (Modifier / Mettre en pause) : jamais une attente de connexion");
ok(V.vueVisiteurLbc(VIDE) === null, "panneau non monté (aucune action) : rien n'est conclu");
ok(V.vueVisiteurLbc(RITTHIK.replace("« Gérer » absent", "« Gérer » présent")) === null, "« Gérer » présent : pas une vue acheteur");
ok(V.vueVisiteurLbc("Annonce introuvable") === null && V.vueVisiteurLbc(null) === null, "autre diagnostic : rien");
ok(V.vueVisiteurLbc("vue acheteur sur la page de l'annonce 1 — actions relevées: [\"Bob\",\"Acheter\"] ; vendeur pro")?.vendeur === "Bob", "diagnostic de la 0.6.147 reconnu aussi");

console.log("B. Phrase et délais");
const msg = V.messageVueVisiteurLbc("RiseFit");
ok(msg.startsWith("En attente de ta connexion à Leboncoin"), "ancre « En attente de ta connexion à » (lue par handler-watch et get-pending-jobs)");
ok(/RiseFit/.test(msg) && /connecte-toi au compte Leboncoin qui l'a publiée/.test(msg) && /risque de double vente/.test(msg), "dit le vendeur affiché, le geste et le risque");
ok(!/RiseFit/.test(V.messageVueVisiteurLbc(null)), "sans vendeur lu : la phrase reste juste");
ok([1, 2, 3, 4, 7, 10].map(V.delaiVueVisiteurMin).join(",") === "3,6,10,60,180,360", "délais = delaiAttenteSessionMin de l'extension");
const bg = lire("chrome-extension/background.js");
ok(/if \(n <= 1\) return 3;\n  if \(n === 2\) return 6;\n  if \(n === 3\) return 10;\n  return n >= 10 \? 360 : n >= 7 \? 180 : ATTENTE_SESSION_MIN;/.test(bg) && /const ATTENTE_SESSION_MIN = 60;/.test(bg), "l'échelle de l'extension n'a pas bougé");

console.log("C. update-job-status");
const ujs = lire("supabase/functions/update-job-status/index.ts");
const i = ujs.indexOf("RETRAIT LEBONCOIN EN VUE ACHETEUR = ATTENTE DE CONNEXION");
const bloc = ujs.slice(i, i + 3500);
ok(i > 0 && /import \{ vueVisiteurLbc, messageVueVisiteurLbc, delaiVueVisiteurMin \} from "\.\.\/_shared\/lbc-vue-visiteur\.js";/.test(ujs), "bloc et import présents");
ok(/jrowVV\?\.platform === "leboncoin" && \(jrowVV\.action === "delete" \|\| jrowVV\.action === "republish"\)/.test(bloc), "Leboncoin, retrait ou republication seulement (lu en base, pas sur le corps)");
ok(/needsUserAttempts: Number\(pfBaseVV\.needsUserAttempts \?\? 0\) \|\| 0/.test(bloc), "aucune tentative consommée (compteur de la base)");
ok(/statutEffectif = "pending";/.test(bloc) && /attente_session: \{/.test(bloc) && /next_action_after:/.test(bloc), "pending + attente_session + sonde espacée");
ok(/!pfRetraitVerif && !pfCanalCoupe/.test(bloc), "ne prend jamais la place d'une autre requalification");

console.log("D. Extension 0.6.147");
const lbc = lire("chrome-extension/content-scripts/leboncoin.js");
ok(/error: `Connexion Leboncoin requise : Leboncoin montre cette annonce comme à un acheteur/.test(lbc), "le handler le dit : « Connexion Leboncoin requise »");
const motif = bg.match(/function motifSessionMorte\(platform, error\) \{[\s\S]*?\n\}/)?.[0];
const f = motif ? new Function(`function estUrlDeConnexionPlateforme(){return false;} ${motif}; return motifSessionMorte;`)() : () => false;
ok(f("leboncoin", "Connexion Leboncoin requise : Leboncoin montre cette annonce comme à un acheteur — x"), "le background le traite en session morte (attente, jamais une tentative)");
const iVis = lbc.indexOf("const vueVisiteur = visible.some(");
const iRet = lbc.indexOf('error: "Contrôle « Supprimer l\'annonce » introuvable sur la page de l\'annonce"');
ok(iVis > 0 && iRet > iVis, "la vue acheteur est reconnue avant le message « contrôle introuvable »");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout est vert");
process.exit(ko ? 1 : 0);
