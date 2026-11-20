// Autotest VERROU : « ME CONNECTER » OUVERT SUR UN REFUS DE COMPTE DIT QUELLE PLATEFORME A REFUSÉ (20/11/2026, ordre de
// Nico : « la phrase en tête de "Me connecter" qui dit quelle plateforme a refusé le compte — texte court et vrai, pas de
// "Chrome" sur le Cloud »).
//
//     node --import ./scripts/loader-ext.mjs scripts/me-connecter-dit-le-refus-2011-selftest.mjs
//
// Le cas (essai du 20/11, compte de Nico, 2.9.220) : l'écran s'ouvrait seul après le refus de Depop, mais montrait
// « 4 sur 4 connectées », chaque ligne « Connecté » : rien ne disait laquelle avait refusé, ni quoi faire.
// Ce qu'il prouve :
//   1. la phrase (pure) : « <Plateforme> a refusé ton compte au moment de mettre en vente. Ouvre <Plateforme> ci-dessous
//      et fais ce qu'elle demande : tes publications <Plateforme> attendent, rien n'est perdu. » — courte, jamais
//      « Chrome » ni « extension », anglais aussi ; une plateforme inconnue : rien (jamais une phrase fausse) ;
//   2. l'écran la montre EN TÊTE, seulement quand il s'est ouvert pour un refus (origine « refus_compte ») ;
//   3. l'app passe la plateforme du refus à l'écran (celle que refusCompteAOuvrir a choisie), et l'oublie à la fermeture.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.RACINE ? process.env.RACINE : join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n"); } catch { return ""; } };
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };
let ko = 0, n = 0;
const ok = (c, m, d = "") => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 240)}` : ""}`); } };
const essai = (f) => { try { return f(); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };

const C = await charger("src/cloud/connexionsCloud.js");
console.log("1. la phrase");
const beebs = essai(() => C.phraseRefusDeCompte("beebs", "fr"));
ok(beebs === "Beebs a refusé ton compte au moment de mettre en vente. Ouvre Beebs ci-dessous et fais ce qu'elle demande : tes publications Beebs attendent, rien n'est perdu.", "Beebs : la phrase exacte", beebs);
for (const [p, nom] of [["vinted", "Vinted"], ["leboncoin", "Leboncoin"], ["depop", "Depop"]]) {
  const t = essai(() => C.phraseRefusDeCompte(p, "fr"));
  ok(typeof t === "string" && t.startsWith(`${nom} a refusé ton compte`) && !/chrome|extension|ordinateur/i.test(t), `${nom} : nommée, jamais « Chrome »`, t);
}
const en = essai(() => C.phraseRefusDeCompte("depop", "en"));
ok(typeof en === "string" && /^Depop refused your account/.test(en) && !/chrome|extension|computer/i.test(en), "anglais", en);
ok(essai(() => C.phraseRefusDeCompte("inconnue", "fr")) === null && essai(() => C.phraseRefusDeCompte(null, "fr")) === null, "plateforme inconnue ou absente : rien");
ok(typeof beebs === "string" && beebs.length <= 170, `courte (${typeof beebs === "string" ? beebs.length : "?"} caractères)`);

console.log("\n2. l'écran la montre en tête, seulement pour un refus");
const me = lire("src/cloud/MeConnecterCloud.jsx");
ok(/export default function MeConnecterCloud\(\{[^}]*plateformeRefus = null[^}]*\}\)/.test(me), "prop plateformeRefus");
ok(/origine === 'refus_compte' && plateformeRefus && phraseRefusDeCompte\(plateformeRefus, lang\)/.test(me), "seulement quand l'écran s'est ouvert pour un refus (origine « refus_compte »)");
const iPhrase = me.indexOf("data-refus-compte"), iIntro = me.indexOf("{T.intro}");
ok(iPhrase > 0 && iIntro > 0 && iPhrase < iIntro, "EN TÊTE : avant le texte d'accueil et les plateformes");
ok(/data-refus-compte=""[^>]*role="alert"/.test(me), "annoncée (role=alert)");

console.log("\n3. l'app passe la plateforme du refus");
const app = lire("src/App.jsx");
ok(/setCxRefus\(r\.plateforme\);\s*setCxOrigine\('refus_compte'\);/.test(app), "la plateforme choisie par refusCompteAOuvrir est retenue");
ok(/plateformeRefus=\{cxOrigine==='refus_compte'\?cxRefus:null\}/.test(app), "passée à l'écran, seulement pour un refus");
ok(/onFermer=\{\(\)=>\{setMeConnecterOuvert\(false\);setCxOrigine\(null\);setCxRefus\(null\);/.test(app), "oubliée à la fermeture");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ tout est vert — ${n} vérifications`);
process.exit(ko ? 1 : 0);
