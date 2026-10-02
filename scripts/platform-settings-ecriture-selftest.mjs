// Selftest — profiles.platform_settings ne s'écrit JAMAIS en entier (02/10).
//
//     node scripts/platform-settings-ecriture-selftest.mjs
//
// Incident du 02/10 : neuf écrivains réécrivaient l'objet entier après une
// lecture (`{ ...base, cle }`, `PATCH { platform_settings: next }`) — une
// lecture ratée ou deux écritures croisées, et l'adresse Leboncoin partait.
// Toute écriture passe désormais par platform_settings_fusionner (app :
// src/utils/reglagesPlateformes.js ; extension : fusionnerReglagesExt ;
// fonctions : .rpc("platform_settings_fusionner")). Ce contrôle échoue sur
// toute réapparition du geste, y compris dans un fichier neuf.
import fs from 'node:fs';
import path from 'node:path';

const RACINES = ['src', 'chrome-extension', 'supabase/functions'];
const EXT = /\.(jsx?|tsx?|mjs)$/;
const MOTIFS = [
  /update\(\s*\{\s*platform_settings\s*:/,          // supabase-js .update({ platform_settings: … })
  /upsert\(\s*\{[^}]*platform_settings\s*:/,        // upsert du profil entier
  /JSON\.stringify\(\s*\{\s*platform_settings\s*:/, // PATCH REST de l'extension
];

const fichiers = [];
const parcourir = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) parcourir(p);
    else if (EXT.test(e.name)) fichiers.push(p);
  }
};
for (const r of RACINES) if (fs.existsSync(r)) parcourir(r);

const fautes = [];
for (const f of fichiers) {
  const lignes = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lignes.forEach((l, i) => {
    if (/^\s*(\/\/|\*)/.test(l)) return; // commentaires
    if (MOTIFS.some(m => m.test(l))) fautes.push(`${f}:${i + 1}  ${l.trim().slice(0, 120)}`);
  });
}

if (fautes.length) {
  console.error('platform_settings écrit EN ENTIER (passer par platform_settings_fusionner) :');
  for (const x of fautes) console.error('  ' + x);
  process.exit(1);
}
console.log(`platform-settings-ecriture : ${fichiers.length} fichiers lus, aucune écriture de l'objet entier`);
