#!/usr/bin/env node
// VERROU (19/11/2026 soir, ordre de Nico — cliente 0909a787, 17:00) : l'écran « Connecte tes plateformes » du Cloud passe
// TOUJOURS au premier plan. Ouvert tout seul pendant qu'une feuille Cloud animée (z-index 9990) était montrée, il restait
// derrière (z-index 1100) : trace cloud_me_connecter_cache, devant = div fs-cloud-anime. Règle : Z_CONNEXION_CLOUD est
// STRICTEMENT plus haut que tout autre z-index de src/ (JS, JSX, CSS) — une couche future plus haute rougit ce verrou.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
let n = 0, ko = 0;
const ok = (c, m, x = '') => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${x ? ` — ${x}` : ''}`); } };
const MC = 'src/cloud/MeConnecterCloud.jsx';
const src = readFileSync(join(RACINE, MC), 'utf8');
const m = src.match(/export const Z_CONNEXION_CLOUD = (\d+);/);
const Z = m ? Number(m[1]) : null;
console.log('1. L\'écran de connexion et sa vue portent le z-index du premier plan');
ok(Z != null, 'Z_CONNEXION_CLOUD défini', m ? '' : 'absent');
ok(/zIndex: Z_CONNEXION_CLOUD, background: C\.canvas, overflowY/.test(src), 'l\'écran « Me connecter » : zIndex = Z_CONNEXION_CLOUD');
ok(/zIndex: Z_CONNEXION_CLOUD \+ 1, background: C\.canvas, display: 'flex'/.test(src), 'la vue de connexion d\'une plateforme : Z_CONNEXION_CLOUD + 1');
ok(!/zIndex: 1[12]00, background: C\.canvas/.test(src), 'plus aucune couche à 1100 / 1200');
ok(/createPortal\(/.test(src) && /document\.body/.test(src), 'rendu dans un portail sur document.body (jamais dans .app-root)');

console.log('2. Aucune autre couche de l\'app ne passe au-dessus');
const fichiers = [];
const parcourir = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); const s = statSync(p); if (s.isDirectory()) parcourir(p); else if (/\.(jsx?|css)$/.test(e)) fichiers.push(p); } };
parcourir(join(RACINE, 'src'));
const plusHauts = [];
for (const f of fichiers) {
  const r = relative(RACINE, f).split(String.fromCharCode(92)).join('/');
  if (r === MC) continue;
  const t = readFileSync(f, 'utf8');
  for (const x of t.matchAll(/z-?[iI]ndex["']?\s*:\s*["']?(\d{2,})/g)) {
    // Seule exception voulue : la garde « tourne ton téléphone » (App.css, .rotate-guard, paysage tactile) couvre tout.
    if (r === 'src/App.css' && /\.rotate-guard[\s\S]{0,400}$/.test(t.slice(Math.max(0, x.index - 400), x.index))) continue;
    if (Number(x[1]) >= (Z ?? 0)) plusHauts.push(`${r} : ${x[1]}`);
  }
}
ok(Z != null && plusHauts.length === 0, `toutes les autres couches de src/ sous ${Z} (${fichiers.length} fichiers lus)`, plusHauts.slice(0, 5).join(' ; '));
ok(Z != null && Z > 20100, 'au-dessus des couches les plus hautes connues (Opla 20100, aperçu 20001, feuille Cloud 9990)');

console.log(ko ? `✗ cloud-connexion-premier-plan : ${ko} échec(s) sur ${n}` : `✓ cloud-connexion-premier-plan : ${n}/${n}`);
process.exit(ko ? 1 : 0);
