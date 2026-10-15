// selftest:textes-republication-exacts — (15/10, lot E) Aucun texte public ne
// dit plus « republication automatique plafonnée à 45 par jour, quel que soit
// le plan » : c'était faux (coin_config republish_plafond_jour_pro = 170,
// _business = 100 000, soit sans maximum pratique). Le texte exact et sobre :
// une annonce à la fois, rythme espacé, jours et créneaux choisis, maximum
// quotidien PROPRE À CHAQUE PLAN, affiché dans l'app — aucun chiffre qui se
// périme, aucune nouvelle promesse chiffrée sur l'accueil.
// Lieux servis vérifiés le 15/10 : /legal (src/pages/Legal.jsx, FR + EN),
// l'ancienne page d'accueil de l'app (src/pages/LandingPage.jsx, FAQ affichée
// ET JSON-LD FAQPage construit depuis elle). Le site statique (site/) et les
// fiches des stores (docs/seo/hors-site/fiches-stores.md) ne le disaient pas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };

// Tout ce qui est servi au public : l'app (src/), le site statique (site/), public/.
const FAUX = /plafonnée? à 45|45 republications par jour|45 par jour|capped at 45|45 a day|45 repostings per day/i;
const fichiers = [];
const parcourir = (dir) => {
  for (const e of fs.readdirSync(path.join(racine, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|dist/.test(e.name)) parcourir(rel); continue; }
    if (/\.(jsx?|mjs|md|ya?ml|json|html|txt)$/.test(e.name)) fichiers.push(rel);
  }
};
for (const d of ['src', 'site', 'public']) if (fs.existsSync(path.join(racine, d))) parcourir(d);

console.log('1. Plus aucun « 45 par jour » servi');
const fautifs = fichiers.filter((f) => {
  // Les commentaires de code qui RACONTENT l'ancienne erreur sont permis.
  const t = lire(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l) && !/\(15\/10 : le « 45 par jour/.test(l)).join('\n');
  return FAUX.test(t);
});
ok(fautifs.length === 0, `aucun texte servi ne promet 45 par jour (${fichiers.length} fichiers lus${fautifs.length ? ` — fautifs : ${fautifs.join(', ')}` : ''})`);

console.log('2. Le texte exact, aux deux endroits, dans les deux langues');
const legal = lire('src/pages/Legal.jsx');
ok(/maximum quotidien propre à chaque plan<\/span>, affiché dans l'application au moment de l'utilisation/.test(legal), 'Legal FR : maximum quotidien propre à chaque plan, affiché dans l’app');
ok(/daily maximum specific to each plan<\/span>, shown in the app at the time of use/.test(legal), 'Legal EN : daily maximum specific to each plan, shown in the app');
ok(/protéger les comptes des utilisateurs sur les plateformes/.test(legal) && !/comptes Vinted des utilisateurs/.test(legal), 'Legal : la protection vaut pour toutes les plateformes, plus « les comptes Vinted » seuls');
const landing = lire('src/pages/LandingPage.jsx');
const fr = "FillSell agit au rythme d'une personne : des gestes espacés, une annonce à la fois, et la republication automatique ne part que les jours et dans les créneaux que tu choisis.";
ok(landing.split(fr).length - 1 === 2, 'accueil FR : la réponse affichée et la clé de traduction disent la même chose (aucun chiffre)');
ok(/automatic reposting only runs on the days and in the time slots you choose/.test(landing), 'accueil EN : même texte, sans chiffre');
ok(/JSON-LD FAQPage — construit depuis la FAQ réellement AFFICHÉE/.test(landing), 'données structurées : la FAQPage suit la FAQ affichée (SEO intact)');

console.log(`\n✓ textes-republication-exacts : ${n} contrôles verts`);
