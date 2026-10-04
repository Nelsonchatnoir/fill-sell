// Autotest — un retrait Vinted bloqué par la vérification dit le vrai risque (04/10)
//   npm run selftest:retrait-vinted-verification
//
// Nico, 04/10 : « Le buste femme a été vendu, j'ai annulé la vente. » Statue
// buste femme (10223005469) : retrait demandé le 03/10 à 11:16, refusé 23 fois
// « en vérification » (delayed_publication), vendue le 04/10 au matin. Le texte
// « masquée aux acheteurs … rien à faire de ton côté » était faux.
// Et la règle du même jour « retrait Vinted introuvable » (get-pending-jobs) ne
// conclut que sur des relevés qui ont ÉCRIT ce qu'ils ont vu.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const ujs = lire("supabase/functions/update-job-status/index.ts");
const debut = ujs.indexOf("UNE ANNONCE EN VÉRIFICATION CHEZ VINTED PEUT ÊTRE ACHETÉE (04/10)");
const bloc = debut >= 0 ? ujs.slice(debut, ujs.indexOf("REPUBLICATION VINTED : REFUS ANTI-ROBOT AVANT TOUT RETRAIT", debut)) : "";

console.log("\n1. update-job-status : le texte et le rythme, toutes versions d'extension");
ok(bloc.length > 0, "le bloc existe, après les blocs « vérification » Vinted et Beebs");
ok(debut > ujs.indexOf("RETRAIT BEEBS D'UNE ANNONCE EN VÉRIFICATION = ATTENTE"), "il passe APRÈS le bloc Vinted d'origine (il en reprend le texte)");
ok(/const RETRAIT_VERIF_VINTED_MIN = 20;/.test(bloc), "un essai toutes les 20 minutes (au lieu d'une heure)");
ok(/statutEffectif === "pending" && !pfCanalCoupe/.test(bloc) && /\/\^Vinted vérifie encore cette annonce\/\.test\(texteV\)/.test(bloc),
  "seulement un retour « pending » portant le texte de la vérification Vinted (extension ou serveur)");
ok(/if \(baseV\) \{/.test(bloc) && /pfRetraitVerif = pfV;/.test(bloc), "platform_fields repris d'une base réelle, jamais fabriqués");
ok(/naaV > prochainV/.test(bloc), "l'échéance ne fait que se rapprocher, jamais s'éloigner");
ok(/Attention : elle peut être achetée dès la fin de la vérification\./.test(bloc), "le texte dit le risque");
ok(/essaie aussi de la supprimer toi-même dans l'appli Vinted/.test(bloc), "le texte dit le geste possible");
ok(!/rien à faire de ton côté|masquée aux acheteurs/.test(bloc.replace(/^\s*\/\/.*$/gm, "")), "plus de « masquée aux acheteurs » ni de « rien à faire »");

console.log("\n2. get-pending-jobs : « retrait Vinted introuvable » sur des relevés qui ont écrit");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const r0 = gpj.indexOf("VINTED : UN RETRAIT DONT L'ANNONCE N'EST PLUS DANS AUCUNE BOUTIQUE (04/10)");
const regle = r0 >= 0 ? gpj.slice(r0, gpj.indexOf("DÉPÔT BEEBS SANS NUMÉRO", r0)) : "";
ok(regle.length > 0, "la règle existe");
ok(/const releveAEcrit = async/.test(regle) && /await releveAEcrit\(deux\[0\], b\.id\)\) \|\| !\(await releveAEcrit\(deux\[1\], b\.id\)\)/.test(regle),
  "chacun des deux relevés de chaque boutique doit avoir écrit ses instantanés");
ok(/count >= attendu - Math\.max\(1, Math\.ceil\(attendu \* 0\.005\)\)/.test(regle), "à 0,5 % près (mesuré : 218 relevés complets sur 219)");
ok(/if \(bx === boutiqueId \|\| !complet\(x\)/.test(regle), "les lignes des autres boutiques du même jour sont comptées en plus");
ok(/eq\("vinted_item_id", numero\)/.test(regle) && !/\.ilike\("titre"|titre ===/.test(regle), "par le NUMÉRO, jamais par le titre");
ok(/if \(deux\.length < 2\) \{ tous = false; break; \}/.test(regle), "une boutique sans ses deux relevés : rien n'est conclu");
ok(/if \(sienne && !confirmees\.has\(sienne\)\) continue;/.test(regle), "la boutique de l'annonce est connue mais pas confirmée : rien n'est conclu");
ok(/if \(!sienne && !toutesConfirmees\) continue;/.test(regle) && /gte\("started_at", new Date\(Date\.now\(\) - 90 \* 86_400_000\)/.test(regle),
  "boutique inconnue : seulement si aucune boutique non confirmée n'a été relevée en 90 jours");
ok(/const aJugerB = sienne \? boutiques\.filter\(\(b\) => b\.id === sienne\) : boutiques;/.test(regle), "boutique connue : on ne juge qu'elle");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ un retrait Vinted en vérification dit le risque ; aucune conclusion sur un relevé qui n'a rien écrit");
