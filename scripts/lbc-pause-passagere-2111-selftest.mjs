// ═══════════════════════════════════════════════════════════════════════════
// UN REFUS PASSAGER DE LEBONCOIN N'EST PAS « TOUT EN PAUSE » — `npm run selftest:lbc-pause-passagere-2111`
// ═══════════════════════════════════════════════════════════════════════════
// (21/11/2026 nuit, rouge 2 de Nico — stefcarpro, Premium, extension) Un 403 de la veille des commandes à 21:28 a posé la
// pause du compte (réelle : rien de 21:30 à 23:30), levée à 23:32 par la visite de contrôle ; ses tâches disaient « FillSell
// a mis en pause TOUTES ses actions Leboncoin… » pendant la pause, et 15 encore une heure après la levée.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pauseLbcConfirmee, messageBlocageLbc, MESSAGE_PAUSE_LBC_RE, etatBlocageLbc } from "../supabase/functions/_shared/blocage-leboncoin.js";
import { pauseLeboncoin, textesPauseLbc } from "../src/utils/pauseLeboncoin.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8");
let verts = 0, rouges = 0;
const ok = (c, m) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}`); } };

const STEF = { depuis: "2026-11-20T20:28:42.552Z", derniere_preuve: "2026-11-20T20:29:18.958Z", signe: "http_403", preuves: 2,
  source: "extension (veille_commandes)", essai_apres: "2026-11-20T22:29:18.958Z" };

console.log("1. Passager ou confirmée");
ok(!pauseLbcConfirmee(STEF), "un 403 de l'API sans suite (stefcarpro) : passager");
ok(pauseLbcConfirmee({ ...STEF, signe: "acces_temporairement_restreint" }) && pauseLbcConfirmee({ ...STEF, signe: "datadome" })
  && pauseLbcConfirmee({ ...STEF, signe: "session_fermee" }), "un signe vu sur la page : confirmée");
ok(pauseLbcConfirmee({ ...STEF, essai: { issue: "refuse" } }) && pauseLbcConfirmee({ ...STEF, rechutes: 1 }), "une visite refusée, une rechute : confirmée");
const neutre = messageBlocageLbc("Chrome", STEF.depuis, "http_403", { confirmee: false });
ok(/courte pause sur Leboncoin/.test(neutre) && /Rien à faire de ton côté/.test(neutre) && !/TOUTES/.test(neutre) && !/fais-le toi-même/.test(neutre),
  "passager : une courte pause neutre, rien à faire");
ok(/mis en pause TOUTES ses actions Leboncoin/.test(messageBlocageLbc("Chrome", STEF.depuis, "http_403")), "confirmée (ou sans précision) : le message complet d'avant, inchangé");
ok(MESSAGE_PAUSE_LBC_RE.test(neutre) && MESSAGE_PAUSE_LBC_RE.test(messageBlocageLbc(null, STEF.depuis, "datadome")), "les deux messages se reconnaissent pour être retirés à la levée");

console.log("2. La protection ne faiblit pas");
const t = Date.parse("2026-11-20T21:00:00Z");
ok(etatBlocageLbc({ leboncoin: { blocage_acces: STEF } }, t).etat === "bloque", "pendant la pause passagère, rien ne part (même état « bloque » qu'avant)");
ok(etatBlocageLbc({ leboncoin: { blocage_acces: STEF } }, Date.parse("2026-11-20T22:30:00Z")).etat === "essai", "la visite de contrôle vient à son heure, comme avant");

console.log("3. Le bandeau de l'app");
const p = pauseLeboncoin({ leboncoin: { blocage_acces: STEF } });
const T = textesPauseLbc("fr", false);
ok(p?.passager === true && /Courte pause/.test(T.titrePassager) && !/restreint/.test(T.textePassager("20/11 à 21:28")), "passager : titre et texte neutres");
ok(pauseLeboncoin({ leboncoin: { blocage_acces: { ...STEF, signe: "datadome" } } })?.passager === false, "confirmée : le bandeau d'avant");
ok(pauseLeboncoin({ leboncoin: { blocage_acces: { ...STEF, leve_le: "2026-11-20T22:32:50Z" } } }) === null, "levée : plus de bandeau");
const bd = lire("src/components/BandeauLeboncoinPause.jsx");
ok(/pause\?\.passager \? T\.titrePassager : T\.titre/.test(bd) && /pause\?\.passager \? T\.textePassager : T\.texte/.test(bd), "le bandeau lit « passager »");

console.log("4. Le serveur");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok((gpj.match(/\{ confirmee: pauseLbcConfirmee\(ebA?\.blocage\) \}/g) ?? []).length === 4, "les 4 messages de la pause disent passager ou confirmée");
ok(/rendues \+= await retirerMessagePauseLbc\(adminB, user\.id, out,/.test(gpj) && /await retirerMessagePauseLbc\(adminB, user\.id, out, "pause Leboncoin rangée"\)/.test(gpj),
  "levée ou rangée : le message de la pause part de toutes les tâches qui le portent");
ok(/\.not\("platform_fields->attente_blocage_lbc", "is", null\)\.limit\(100\)/.test(gpj) && /MESSAGE_PAUSE_LBC_RE\.test\(String\(m\.error/.test(gpj),
  "seules les tâches marquées par la pause, et seul SON message (jamais un autre)");

console.log(`\n${rouges ? "✗" : "✓"} lbc-pause-passagere-2111 : ${verts} contrôles verts, ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
