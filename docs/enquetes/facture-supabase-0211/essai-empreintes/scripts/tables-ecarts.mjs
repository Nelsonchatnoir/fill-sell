// Les tableaux Markdown des écarts (20 premiers par type) pour RESULTAT.md → donnees/tables-ecarts.md
import fs from 'node:fs';
import path from 'node:path';
import { W } from './jeux.mjs';
const J = (f) => JSON.parse(fs.readFileSync(path.join(W, 'donnees', ...f.split('/')), 'utf8'));
const out = [];
const c = (s, n = 60) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, n);
const d = (x) => (x === null || x === undefined ? '—' : Number(x).toFixed(1).replace(/\.0$/, ''));
// moteur
const ms = J('resultats/moteur-sujets.json');
const prio = (e) => (/fusionner/.test(e.categorie) ? 0 : /entrer_stock|groupe/.test(e.categorie) ? 1 : /annonce_en_double/.test(e.categorie) ? 2 : 3);
for (const nom of ['normal', 'tout_le_stock']) {
  out.push(`\n#### Moteur v3, passe « ${nom === 'normal' ? 'normale (comme le cron)' : 'tout le stock (réparation)'} » — ${ms[nom].sujets} sujet(s), ${Math.min(20, ms[nom].exemples.length)} premiers\n`);
  out.push('| compte | catégorie | décision A | décision B | éléments (titres) | arête en cause : niveau A → B, distance photo A → B |');
  out.push('|---|---|---|---|---|---|');
  for (const e of [...ms[nom].exemples].sort((a, b) => prio(a) - prio(b)).slice(0, 20)) {
    const ar = e.aretes[0];
    out.push(`| ${e.sujet.slice(0, 8)} | ${c(e.categorie, 40)} | ${c(e.A.join(' ; '), 70) || '—'} | ${c(e.B.join(' ; '), 70) || '—'} | ${e.titres.map((t) => c(t, 55)).join('<br>')} | ${ar ? `${c(ar.paire.replace(/-[0-9a-f-]{20,}/g, '…'), 40)} : ${ar.A} → ${ar.B}, ${d(ar.photoA)} → ${d(ar.photoB)}` : '—'} |`);
  }
}
// doublons
const dn = J('resultats/doublons-niveau.json');
const ch = dn.ecarts.filter((e) => e.A.split('/')[0] !== e.B.split('/')[0]);
out.push(`\n#### Doublons (inventaire_doublon_evaluer → meme_objet_niveau) — ${ch.length} paires changent de niveau, 20 premières\n`);
out.push('| compte | fiche a | fiche b | titres | photos_distance A (d/p → verdict) | B (d/p → verdict) | niveau A | niveau B |');
out.push('|---|---|---|---|---|---|---|---|');
for (const e of ch.slice(0, 20)) out.push(`| ${e.compte} | ${e.a} | ${e.b} | ${c(e.titreA, 45)}<br>${c(e.titreB, 45)} | ${e.photoA.d}/${e.photoA.p} → ${e.photoA.v} | ${e.photoB.d}/${e.photoB.p} → ${e.photoB.v} | ${e.A} | ${e.B} |`);
// JS réelles
const s = J('synthese.json');
const re = s.autres.S.ecarts.filter((x) => x.reelle);
out.push(`\n#### trancherParPhotos / niveauPhoto (paires réellement jugées) — ${re.length} changements, 20 premiers\n`);
out.push('| compte | type | élément a | élément b | plateforme | niveau A → B | meilleure distance A → B | photos (a ; b) |');
out.push('|---|---|---|---|---|---|---|---|');
for (const e of re.slice(0, 20)) out.push(`| ${e.compte} | ${e.type === 'J-A' ? 'dépôt ↔ annonce' : 'annonce ↔ fiche'} | ${c(e.a, 13)} | ${c(e.b, 13)} | ${e.pf} | ${e.A} → ${e.B} | ${d(e.bestA)} → ${d(e.bestB)} | ${c(e.urlsA[0], 200)} ; ${c(e.urlsB[0], 200)} |`);
// fmpq
const bf = J('resultats/beebs-fmpq.json');
const fr = bf.fmpq.filter((x) => !x.deja);
out.push(`\n#### fiches_meme_photo_questions (pHash ÉGAL des couvertures) — ${fr.length} paires sans question existante qui changent\n`);
out.push('| compte | paire (fiches) | A → B |'); out.push('|---|---|---|');
for (const e of fr.slice(0, 20)) out.push(`| ${e.compte} | ${e.paire} | ${e.sens === 'perdue' ? 'question → rien' : 'rien → question'} |`);
out.push(`\n#### beebs_numeros_par_sequence (dépôts Beebs publiés sans numéro) — ${bf.beebs.length} paires\n`);
out.push('| compte | fiche | annonce | photo de la fiche | photo de l\'annonce | « identique » A → B |'); out.push('|---|---|---|---|---|---|');
for (const e of bf.beebs) out.push(`| ${e.compte} | ${e.fiche} | ${c(e.annonce, 13)} | ${c(e.photo_fiche, 200)} | ${c(e.photo_annonce, 200)} | ${e.A} → ${e.B} |`);
fs.writeFileSync(path.join(W, 'donnees', 'tables-ecarts.md'), out.join('\n') + '\n');
console.log(out.length, 'lignes');
