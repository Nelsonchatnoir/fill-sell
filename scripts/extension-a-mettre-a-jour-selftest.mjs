// Autotest — un poste trop ancien : ce que la personne voit (03/10, point 25)
//   npm run selftest:extension-a-mettre-a-jour
//
// geronimo0550, extension 0.6.79, Chrome allumé jusqu'à 01:49 : ses 7
// publications du 02/10 au soir ne sont jamais parties — depuis le 02/10, le
// serveur ne sert RIEN à un poste plus ancien que la 0.6.81 (sauf une remise
// en ligne commencée). L'écran disait « Dans la file — Chrome la prend à son
// tour », la carte « En cours… ». Elles sont parties dès la 0.6.89.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { extensionAMettreAJour, phraseMiseAJourExtension } = await imp("src/utils/extensionAJour.js");
const { situationJob } = await imp("src/utils/fileDesJobs.js");
const { EXTENSION_MIN_BUILD } = await imp("supabase/functions/_shared/version-min-extension.js");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LA RÈGLE : CELLE DU SERVEUR ET DU BANDEAU");
const T = Date.parse("2026-10-02T23:30:00Z");
const B0679 = "2026-09-28T21:44:46Z+52b214b · v0.6.79";   // le build RÉEL de geronimo0550
const B0689 = "2026-10-02T21:10:00Z+1a49399 · v0.6.89";
ok(EXTENSION_MIN_BUILD === "2026-09-30T20:16:41Z", "minimum du serveur relu (0.6.81)");
ok(extensionAMettreAJour({ build: B0679, lastSeenAt: "2026-10-02T23:49:00Z", maintenant: T }) === true, "0.6.79 vue ce soir : trop ancienne");
ok(extensionAMettreAJour({ build: B0689, lastSeenAt: "2026-10-02T23:49:00Z", maintenant: T }) === false, "0.6.89 : à jour");
ok(extensionAMettreAJour({ build: B0679, lastSeenAt: "2026-08-01T10:00:00Z", maintenant: T }) === false, "vue il y a plus de 30 jours : c'est « ordinateur éteint », un autre message");
ok(extensionAMettreAJour({ build: null, lastSeenAt: "2026-10-02T23:49:00Z", maintenant: T }) === false, "build inconnu : on n'affirme rien");

console.log("\n2. LA FILE ET LES BARRES DISENT LA MISE À JOUR, JAMAIS « SON TOUR »");
const job = (x) => ({ id: "j", inventaire_id: 1, platform: "vinted", action: "publish", status: "pending", created_at: "2026-10-02T21:00:00Z", platform_fields: {}, voie: "extension", ...x });
const ctx = { maintenant: T, lang: "fr", extension: { etat: "vivante" }, extensionAMettreAJour: true };
const s = situationJob(job({}), ctx);
ok(s.groupe === "pause" && s.motif === "mise_a_jour" && s.raison === phraseMiseAJourExtension("fr"), "publication en file : « En attente de la mise à jour de l'extension : ferme Chrome… »", s.raison);
ok(/ferme Chrome complètement puis rouvre-le/.test(phraseMiseAJourExtension("fr")), "avec le geste le plus simple");
ok(situationJob(job({ platform: "ebay", voie: "api" }), ctx).motif !== "mise_a_jour", "eBay par nos serveurs : pas concerné");
ok(situationJob(job({ action: "republish", platform_fields: { republish_step: "deleted", deleted_at: "2026-10-02T23:20:00Z" } }), ctx).groupe === "en_cours",
  "une remise en ligne commencée reste servie (exception du serveur) : en cours");
ok(situationJob(job({}), { ...ctx, extensionAMettreAJour: false }).raison === "En attente de son tour", "poste à jour : comportement d'avant");

console.log("\n3. CHAQUE ÉCRAN");
const stock = lire("src/tabs/StockTab.jsx");
ok(/extensionAMettreAJour: extensionStatus\?\.outdated === true \};/.test(stock), "le Stock passe l'état aux barres et à la file");
// (03/10, refonte du Stock) La pastille de la carte vit dans src/stock/regles.js
// (pastilleCourte, genre « maj ») ; la CONDITION reste lue dans StockTab, au mot près.
const { pastilleCourte } = await imp("src/stock/regles.js");
ok(/const majRequise = extensionStatus\?\.outdated === true && d\.pendingJobs\.some\(\(j\) => j\.voie !== 'api'\);/.test(stock)
  && /if \(majRequise\) return \{ \.\.\.pastilleCourte\(\{ genre: 'maj' \}, lang\)/.test(stock)
  && pastilleCourte({ genre: "maj" }, "fr").texte === "Mise à jour",
  "la carte : « Mise à jour », plus « En cours… »");
const conf = lire("src/publication/EcranConfirmer.jsx");
ok(/\{m\.extensionAMettreAJour && voies\.extension\.some\(p => verdict\.partent\.includes\(p\)\) && \(/.test(conf) && /ne partira qu'après la mise à jour : ferme Chrome complètement sur ton ordinateur, puis rouvre-le\./.test(conf),
  "AVANT de publier : ce qui ne partira qu'après la mise à jour, et le geste");
const suivi = lire("src/publication/EcranSuivi.jsx");
ok(/if \(!parApi && m\.extensionAMettreAJour\) return \{ texte: phraseMiseAJourExtension\(m\.lang\) \+ "\.",/.test(suivi) && /extensionAMettreAJour: m\.extensionAMettreAJour === true \};/.test(suivi),
  "le suivi après publication : la ligne et la barre");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/extensionAMettreAJour: extensionAMettreAJour\(\{ build: extBuildRelu, lastSeenAt: extensionVueLe \}\),/.test(lps) && /\.select\("extension_last_seen_at, extension_build"\)/.test(lps),
  "le parcours relit le build du poste (même lecture que la fraîcheur)");
const fdj = lire("src/components/FileDesJobs.jsx");
ok(/majExtension = extensionAMettreAJour\(\{ build: prof\?\.extension_build \?\? null, lastSeenAt: prof\?\.extension_last_seen_at \?\? null \}\);/.test(fdj), "la file ouverte hors du Stock aussi");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ poste trop ancien : chaque écran dit la mise à jour et son geste");
