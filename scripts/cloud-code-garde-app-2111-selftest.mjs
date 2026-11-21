// ═══════════════════════════════════════════════════════════════════════════
// LA PAGE DU CODE N'EST JAMAIS JETÉE PAR L'APP — `npm run selftest:cloud-code-garde-app-2111`
// ═══════════════════════════════════════════════════════════════════════════
// (21/11/2026 nuit, 2e message de Nico — alisonbertincourt, melinemaros)
//   · « Me connecter » ne se rouvre jamais tout seul au rechargement : une ouverture automatique par COMPTE (marque en base) ;
//   · la même page reprise sur un autre écran (`fermee: false`) : cet écran se met en PAUSE, jamais une fin qui pousse à
//     « fermer puis rouvrir » ;
//   · « Valider le code » dans le bandeau du code (replié ou non) : le serveur rejoue Entrée / le bouton de la page.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8");
let verts = 0, rouges = 0;
const ok = (c, m) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}`); } };

const { creerSuiviVue } = await import(pathToFileURL(join(RACINE, "src/cloud/connexion/suiviVue.js")).href);

console.log("1. La même page reprise ailleurs : pause, jamais une fin");
const faits = [];
const agir = { fin: (e, m) => faits.push(["fin", e, m]), pause: (p) => faits.push(["pause", p]), message: (m) => faits.push(["message", m]) };
const v = creerSuiviVue({ finales: ["remplacee", "expire"], agir, visible: true, maintenant: () => 10_000 });
v.etape("remplacee", "Ta page de connexion continue sur ton autre écran", { fermee: false });
v.etape("expire", "Ta page de connexion continue sur ton autre écran");
ok(v.enPause && !v.finale && faits.some((f) => f[0] === "pause") && !faits.some((f) => f[0] === "fin"), "regardée ou non : pause (« Continuer ici »), aucune fin");
const f2 = [];
const v2 = creerSuiviVue({ finales: ["remplacee", "expire"], agir: { fin: (e) => f2.push(["fin", e]), pause: () => f2.push(["pause"]) }, visible: true, maintenant: () => 10_000 });
v2.etape("remplacee", "Une autre plateforme a été ouverte", { fermee: true });
ok(v2.finale && f2.some((f) => f[0] === "fin"), "une page vraiment fermée (autre plateforme) finit, sous les yeux de la personne");

console.log("2. Les textes : jamais « ferme puis rouvre »");
const textes = lire("src/cloud/textesConnexion.js");
const serveur = lire("serveur-cloud/src/connexion.js");
const sansCommentaires = (t) => t.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
ok(!/ferme puis rouvre|close and open the platform again/.test(sansCommentaires(textes + "\n" + serveur)), "plus aucun « ferme puis rouvre » dit à la personne (app et serveur)");
ok(/signifierRemplacee\(ancien, txt, \{ fermee: false \}\)/.test(serveur) && /message: texte, fermee \}/.test(serveur), "le serveur dit `fermee: false` quand la même page est reprise ailleurs");
ok(/typeof m\.fermee === 'boolean' \? \{ fermee: m\.fermee \} : null/.test(lire("src/cloud/connexion/clientConnexion.js")), "l'app le lit");

console.log("3. « Me connecter » : une ouverture automatique par compte");
const app = lire("src/App.jsx");
ok(/select\('auto_le:platform_settings->cloud_connexion->>auto_le'\)/.test(app) && /if\(error\|\|data\?\.auto_le\)return;/.test(app),
  "la marque du COMPTE est lue avant d'ouvrir (illisible : rien d'ouvert)");
ok(/rpc\('platform_settings_fusionner',\{p_chemin:\['cloud_connexion'\],p_patch:\{auto_le:/.test(app), "elle est posée par platform_settings_fusionner (la seule voie)");

console.log("4. « Valider le code » dans le bandeau");
const mc = lire("src/cloud/MeConnecterCloud.jsx");
ok((mc.match(/data-cloud-bouton="code-valider" onClick=\{validerCode\}/g) ?? []).length === 2, "replié et déplié");
ok(/validerCode\(\) \{ envoyer\(\{ t: 'valider_code' \}\); \}/.test(lire("src/cloud/connexion/clientConnexion.js")) && /if \(m\.t === 'valider_code'\)/.test(serveur),
  "le message part, le serveur le prend (après les frappes en file)");

console.log(`\n${rouges ? "✗" : "✓"} cloud-code-garde-app-2111 : ${verts} contrôles verts, ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
