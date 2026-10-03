// Autotest — changer le compte eBay relié à FillSell (03/10, point 21, Louis)
//   npm run selftest:ebay-changer-compte
//
// Louis : relié à @lamiral depuis le 19/09, il voulait son compte pro. Changer
// de session dans Chrome ne change rien (à raison : la voie API suit le
// consentement OAuth), et l'app n'offrait aucun moyen de relier un AUTRE
// compte — sinon un petit lien « Déconnecter » qu'il fallait deviner.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. L'APP : UN BOUTON, VISIBLE, À CÔTÉ DU COMPTE RELIÉ");
const sec = lire("src/components/EbayCompteSection.jsx");
ok(/changerCompte: 'Changer de compte eBay',/.test(sec) && /changerCompte: 'Switch eBay account',/.test(sec), "« Changer de compte eBay » (fr/en)");
const iPseudo = sec.indexOf("{etat.ebay_user_id ? <>@{etat.ebay_user_id}</> : null}");
const iBouton = sec.indexOf("{busy === 'connexion' ? '…' : t.changerCompte}");
ok(iPseudo > 0 && iBouton > iPseudo && iBouton - iPseudo < 2000, "juste sous « @compte · connecté le … »");
ok(/<button type="button" onClick=\{connecter\} disabled=\{busy != null \|\| chargement\}[^>]*>\s*\{busy === 'connexion' \? '…' : t\.changerCompte\}/.test(sec),
  "il relance le consentement eBay (le même parcours que « Connecter »)");
ok(/Changer de compte dans ton navigateur ne suffit pas : c'est ici que FillSell l'apprend\./.test(sec), "il dit pourquoi Chrome seul ne suffit pas");
const oauth = lire("supabase/functions/_shared/ebay-oauth.ts");
ok(/u\.searchParams\.set\("prompt", "login"\);/.test(oauth), "eBay redemande QUEL compte (prompt=login)");

console.log("\n2. LE SERVEUR : LE NOUVEAU COMPTE REPART DE ZÉRO");
const cb = lire("supabase/functions/ebay-oauth-callback/index.ts");
const iReset = cb.indexOf("if (memePseudo === false || memeEias === false) {");
const iUpsert = cb.indexOf('let { error } = await admin.from("ebay_accounts").upsert(ligne, { onConflict: "user_id" });');
ok(iReset > 0 && iReset < iUpsert, "l'identité d'avant est comparée AVANT d'écrire le nouveau compte");
ok(/fulfillment_policy_id: null, payment_policy_id: null, return_policy_id: null,\s+seller_state: null, seller_state_at: null, merchant_location_key: null,/.test(cb),
  "politiques, état vendeur et lieu d'expédition de l'ANCIEN compte remis à zéro");
ok(/a\?\.ebay_user_id && identite\.username\s+\? a\.ebay_user_id\.toLowerCase\(\) === identite\.username\.toLowerCase\(\) : null/.test(cb),
  "identité inconnue d'un côté : rien de prouvé, rien d'effacé");

console.log("\n3. LES ANNONCES DE L'ANCIEN COMPTE NE SONT JAMAIS OUBLIÉES");
const w = lire("supabase/functions/ebay-api-worker/index.ts");
const iGarde = w.indexOf("const autreCompte = await annonceDUnAutreCompte(admin, job.user_id, preuve.cible);");
const iAppel = w.indexOf("const controleOffre = await relireOffreExacte(env, token, preuve, { accepterDejaRetiree: true });");
ok(iGarde > 0 && iGarde < iAppel, "un retrait d'une annonce de l'ancien compte s'arrête AVANT tout appel à eBay");
ok(/status: "needs_user",\s+error: `Cette annonce eBay est sur ton compte @\$\{autreCompte\.vendeur\}, qui n'est plus celui relié à FillSell/.test(w),
  "… et dit le geste qui marche (la retirer depuis l'ancien compte) — jamais un report en boucle");
ok(/if \(!vendeur \|\| !relie \|\| vendeur\.toLowerCase\(\) === relie\.toLowerCase\(\)\) return null;/.test(w), "vendeur inconnu ou même compte : comportement d'avant");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ changer de compte eBay : un bouton, un nouveau départ propre, rien d'oublié");
