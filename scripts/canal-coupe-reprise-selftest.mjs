// Autotest : LE CANAL COUPÉ D'UNE PUBLICATION (26/10, Jocabroc — sculpture bouddhiste, Leboncoin ; La Fleur de Lotus).
//
//     npm run selftest:canal-coupe-reprise
//
// « A listener indicated an asynchronous response by returning true, but the message channel closed » : le job
// repartait 17 min plus tard en brûlant une tentative, l'exception Chrome affichée. Ce qu'il prouve, sans réseau :
//   A. Leboncoin : l'adsubmit tranche AVANT toute reprise — 2xx + numéro = publié (aucun second dépôt) ; parti sans
//      réponse lisible = needs_user « vérifie tes annonces », jamais un re-dépôt sur un doute ;
//   B. rien n'est parti : reprise à 2 min, sans tentative consommée, deux fois au plus, phrase vraie ;
//   C. la troisième fois et les autres erreurs transitoires suivent le recul ordinaire (rearmBounded) ;
//   D. Vinted (redirection de succès) et eBay (sonde) passent toujours AVANT.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const bg = fs.readFileSync(join(ROOT, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
let ko = 0;
const ok = (c, m, detail) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); } };

const i = bg.indexOf("(26/10, Jocabroc — sculpture bouddhiste, Leboncoin, 11:22");
const iRearm = bg.indexOf("console.warn(`[background] Job ${job.id} : incident transitoire (canal coupé ou page trop lente) — ${msg}`);");
const bloc = bg.slice(i, iRearm);
const iVinted = bg.indexOf("const publishedUrl = job.platform === \"vinted\" && tabId != null");
const iEbay = bg.indexOf("if (job.platform === \"ebay\" && tabId != null && CANAL_COUPE_RE.test(msg)) {");

console.log("A. Leboncoin : l'adsubmit tranche");
ok(i > 0 && iRearm > i, "le bloc est dans la branche transitoire, avant le ré-armement ordinaire");
ok(/if \(CANAL_COUPE_RE\.test\(msg\) && job\.action === "publish"\) \{/.test(bloc), "canal coupé d'une PUBLICATION seulement (retraits inchangés)");
ok(/const vu = await lbcDepotRequestSeen\(tabId, depuis\)/.test(bloc), "la sonde adsubmit est lue depuis la prise en charge du job");
ok(/if \(st >= 200 && st < 300 && \/\^\\d\{6,\}\$\/\.test\(idAd\)\) \{/.test(bloc) && /updateJobStatus\(accessToken, job\.id, "published"/.test(bloc), "2xx + numéro : publié");
ok(!/listing_url:/.test(bloc.slice(0, bloc.indexOf("depotParti = Boolean"))), "aucun lien fabriqué au dépôt (l'annonce est en vérification : doctrine du 10/09)");
ok(/depotParti = Boolean\(vu\?\.adsubmit\?\.envoye\);/.test(bloc) && /updateJobStatus\(accessToken, job\.id, "needs_user", \{ error: msgIncertainLbc/.test(bloc), "parti sans réponse lisible : needs_user, jamais un second dépôt");

console.log("B. Rien n'est parti : reprise rapide");
ok(/if \(!depotParti && reprisesCanal < 2\) \{/.test(bloc), "deux reprises rapides au plus");
ok(/canal_coupe_reprises: reprisesCanal \+ 1/.test(bloc) && /next_action_after: new Date\(Date\.now\(\) \+ 2 \* 60_000\)/.test(bloc), "compteur dédié, échéance à 2 min");
ok(!/needsUserAttempts/.test(bloc), "aucune tentative consommée (needsUserAttempts intact)");
ok(/rien n'a été publié\. ` \+\n\s+"FillSell recommence tout seul, rien à faire\."/.test(bloc) && !/"pending", \{\n\s+error: msg/.test(bloc), "phrase vraie, jamais l'exception Chrome brute");
ok(/const actuel = await jobStatusNow\(accessToken, job\.id\);\n\s+if \(!actuel \|\| actuel === "processing" \|\| actuel === "pending"\)/.test(bloc), "jamais par-dessus un job annulé entre-temps");

console.log("C. Le reste inchangé");
ok(/await rearmBounded\(\n\s+accessToken, job,/.test(bg.slice(iRearm, iRearm + 2500)), "au-delà : rearmBounded, comme avant");
ok(/const TRANSIENT_JOB_ERROR_RE =\n.*\n.*\n.*\n  \/message channel closed\|Receiving end does not exist\|No tab with id\|pas fini de charger\|pas fini de s'ouvrir\|Onglet de travail fermé pendant\|Failed to fetch\/i;/.test(bg), "la famille transitoire n'a pas bougé");

console.log("D. Vinted et eBay d'abord");
ok(iVinted > 0 && iVinted < i, "Vinted : la redirection de succès est lue avant");
ok(iEbay > 0 && iEbay < i, "eBay : la sonde de canal coupé passe avant");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout est vert");
process.exit(ko ? 1 : 0);
