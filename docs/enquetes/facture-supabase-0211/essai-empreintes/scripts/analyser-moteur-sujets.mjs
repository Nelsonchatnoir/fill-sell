// Les vraies différences de décisions du moteur, par SUJET (l'annonce, ou le groupe d'annonces, ou la paire « en double ») :
//   même sujet des deux côtés → « même sujet, décision autre » (type A → type B, motif, candidat) ;
//   sujet d'un seul côté → décision qui disparaît (A seulement) ou apparaît (B seulement).
import fs from 'node:fs';
import path from 'node:path';
import { W } from './jeux.mjs';
const res = JSON.parse(fs.readFileSync(path.join(W, 'donnees', 'resultats', 'moteur-ecarts.json'), 'utf8'));
const sujet = (v) => { const x = v.decision;
  if (x.type === 'annonce_en_double') return v.compte + ':double:' + [JSON.stringify(x.a), JSON.stringify(x.b)].sort().join('|');
  if (x.annonces) return v.compte + ':' + [...x.annonces].sort().join(',');
  if (x.annonce) return v.compte + ':' + x.annonce;
  if (x.fiche) return v.compte + ':F' + x.fiche;
  if (x.id) return v.compte + ':Q' + x.id;
  return v.compte + ':' + JSON.stringify(x); };
const resume = (v) => { const x = v.decision; return `${x.type}${v.motif ? '/' + v.motif : ''}${x.candidat ? ' → ' + JSON.stringify(x.candidat) : ''}${x.garde ? ' → garde F' + x.garde : ''}`; };
const sortie = {};
for (const nom of ['normal', 'tout_le_stock']) {
  const parS = new Map();
  for (const v of res[nom].vraies) { const k = sujet(v); if (!parS.has(k)) parS.set(k, { A: [], B: [] }); parS.get(k)[v.sens.startsWith('A') ? 'A' : 'B'].push(v); }
  const cat = {}; const ex = [];
  for (const [k, { A, B }] of parS) {
    const c = A.length && B.length ? `même sujet : ${A.map((v) => v.type).join('+')} → ${B.map((v) => v.type).join('+')}` : A.length ? `disparaît : ${A.map((v) => v.type).join('+')}` : `apparaît : ${B.map((v) => v.type).join('+')}`;
    cat[c] = (cat[c] ?? 0) + 1;
    ex.push({ sujet: k, categorie: c, A: A.map(resume), B: B.map(resume), titres: [...new Set([...A, ...B].flatMap((v) => v.ids.map((id, i) => `${id.slice(0, 9)} ${v.titres[i]}`)))].slice(0, 4),
      aretes: [...A, ...B].flatMap((v) => v.aretes_changees).slice(0, 3) });
  }
  sortie[nom] = { sujets: parS.size, categories: cat, exemples: ex };
  console.log(nom, 'sujets', parS.size, JSON.stringify(cat, null, 1));
}
fs.writeFileSync(path.join(W, 'donnees', 'resultats', 'moteur-sujets.json'), JSON.stringify(sortie, null, 1));
