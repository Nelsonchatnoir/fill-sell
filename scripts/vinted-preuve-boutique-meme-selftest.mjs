// ═══════════════════════════════════════════════════════════════════════════
// VINTED : « PREUVE DE BOUTIQUE » ABSENTE SUR LA BOUTIQUE OUVERTE — LE MESSAGE DIT VRAI (08/11 soir, point 5 de Nico)
// `npm run selftest:vinted-preuve-boutique-meme`
// ═══════════════════════════════════════════════════════════════════════════
// linda.sidhoum (Premium), 5 republications en attente « preuve de boutique » (21f4b46b, 88883823, 29cf2547, 756f3286,
// 201db720) : une seule boutique (657403), celle ouverte dans Chrome, la capture n'a pas lu la page exacte de l'annonce
// (item_lu null). La garde est juste (aucun retrait sans preuve) ; le message, lui, parlait d'« une autre de tes
// boutiques » et demandait de connecter Chrome ailleurs — faux pour elle. Règle : boutique de l'annonce = boutique
// ouverte → « la page de cette annonce n'a pas pu être lue », sans geste ; sinon le message d'avant.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ujs = fs.readFileSync(join(ROOT, "supabase/functions/update-job-status/index.ts"), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom) => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}`); ko++; } };

const i = ujs.indexOf("// (08/11 soir, point 5 de Nico — linda.sidhoum, 5 jobs)");
const zone = ujs.slice(i, i + 3200);
ok(i > 0, "la règle est dans update-job-status (boutique invérifiable)");
ok(/vinted_account_id/.test(zone) && /vinted_identite\?\.user_id/.test(zone) && /memeBoutique = !!ouverte && ouverte === compteAnnonce/.test(zone),
  "même boutique = boutique de l'annonce (job) égale à la boutique ouverte dans Chrome (extension_sessions)");
const msgMeme = zone.match(/\? \(jV\.action === "delete" \? "Retrait Vinted en attente : " : "Republication Vinted en attente : "\) \+\s*"([^"]+)" \+\s*"([^"]+)"/);
const texte = msgMeme ? msgMeme[1] + msgMeme[2] : "";
ok(/la page de cette annonce n'a pas pu être lue/.test(texte) && /rien à faire/.test(texte), "même boutique : la page illisible est dite, rien à faire");
ok(!/plusieurs boutiques|autre de tes boutiques|connecte Chrome/.test(texte), "même boutique : jamais « une autre de tes boutiques »");
ok(/ton compte a peut-être plusieurs boutiques/.test(zone), "boutique différente ou inconnue : le message d'avant, inchangé");
ok(/catch \(_e\) \{ memeBoutique = false; \}/.test(zone), "lecture ratée : le message d'avant (jamais une affirmation sans preuve)");
ok(!/\d+ ?(min|h)\b/.test(texte), "aucune durée annoncée");

if (ko) { console.error(`\n❌ ${ko} échec(s)`); process.exit(1); }
console.log("\n✅ VINTED — preuve de boutique, même boutique : le message dit vrai.");
