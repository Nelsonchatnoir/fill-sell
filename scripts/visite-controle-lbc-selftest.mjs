// Autotest — la visite de contrôle d'une pause Leboncoin rend TOUJOURS un verdict (05/11, point 19 — 25caeedd) —
// `npm run selftest:visite-controle-lbc` (_shared/blocage-leboncoin.js verdictVisiteControleLbc, get-pending-jobs).
import fs from "node:fs";
import { verdictVisiteControleLbc, messageBlocageLbc, blocageEssaiRefuse } from "../supabase/functions/_shared/blocage-leboncoin.js";

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

// Le texte réel de la visite f052c5b0 de 25caeedd (05/11 09:49).
const REEL = "[incomplet] « Mes annonces » n'a pas rendu sa liste (redirection du compte, challenge ou page non peinte) · [page] complete, 0 lien(s) d'annonce — « » · jeton non renouvelé (jeton_non_rendu)";
ok(verdictVisiteControleLbc("failed", REEL).verdict === "refuse" && verdictVisiteControleLbc("failed", REEL).signe === "session_fermee", "25caeedd : visite finie sans liste, jeton non renouvelé → refusée, session fermée", JSON.stringify(verdictVisiteControleLbc("failed", REEL)));
ok(verdictVisiteControleLbc("done", "[défilement] 5 pages : 294 annonce(s)").verdict === "passe", "lue en entier → passée (la pause se lève)");
ok(verdictVisiteControleLbc("done", "[incomplet] page 3").verdict === "refuse", "« done » mais incomplète → jamais passée");
ok(verdictVisiteControleLbc("failed", "Accès temporairement restreint").signe === "acces_temporairement_restreint", "un signe connu garde son nom");
ok(verdictVisiteControleLbc("expired", "[watchdog] aucune progression").signe === "visite_sans_liste", "finie autrement → refusée, liste non rendue");
ok(verdictVisiteControleLbc("absente", "page de connexion (Mes annonces renvoie vers la connexion)").signe === "session_fermee", "page de connexion → session fermée");
ok(verdictVisiteControleLbc("queued", "").verdict === null && verdictVisiteControleLbc("running", "").verdict === null, "en file ou en cours → on attend");
const msg = messageBlocageLbc("Chrome", "2026-11-04T03:01:20Z", "session_fermee");
ok(/ta session Leboncoin semble fermée/.test(msg) && /connecte-toi à ton compte Leboncoin/.test(msg), "le message dit de se reconnecter", msg.slice(0, 200));
ok(!/connecte-toi/.test(messageBlocageLbc("Chrome", null, "http_403")), "une restriction ordinaire garde son message");
const b = blocageEssaiRefuse({ depuis: "2026-11-04T03:01:20Z", essai: { releve_id: "f052c5b0", controle: true, le: "2026-11-05T08:49:27Z" }, essais: 1 }, { signe: "session_fermee", maintenant: "2026-11-05T12:00:00Z" });
ok(b.essai.issue === "refuse" && b.signe === "session_fermee" && Number.isFinite(Date.parse(b.essai_apres)), "l'essai est clos (issue), le signe gardé, la prochaine visite datée");
const gpj = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
ok(/const vV = verdictVisiteControleLbc\(st, texteE\);/.test(gpj) && /blocageEssaiRefuse\(bEnCours, \{ signe: signeVisite \}\)/.test(gpj), "get-pending-jobs juge la visite par la règle et garde le signe");
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — visite de contrôle Leboncoin`);
process.exit(ko ? 1 : 0);
