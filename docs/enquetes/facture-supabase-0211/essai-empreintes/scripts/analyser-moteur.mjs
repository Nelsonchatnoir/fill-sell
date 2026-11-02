// Les écarts de DÉCISIONS du moteur v3 (A seulement / B seulement), rangés :
//   · « ordre seulement » : la même décision une fois les listes triées (annonces, republications, preuve.groupe) ;
//   · « vraies » : le reste — décrites avec les titres (données du moteur) et la distance photo A / B de la paire en cause.
// Sortie : donnees/resultats/moteur-ecarts.json + résumé à l'écran.
import fs from 'node:fs';
import path from 'node:path';
import { W } from './jeux.mjs';

const dirR = path.join(W, 'donnees', 'resultats', 'moteur'), dirM = path.join(W, 'donnees', 'moteur');
const canon = (x) => JSON.stringify(x, (k, v) => {
  if (Array.isArray(v) && ['annonces', 'republications', 'groupe'].includes(k)) return [...v].sort();
  if (k === 'photo' && typeof v === 'number') return undefined;
  return v;
});
const res = { normal: { ordre: 0, vraies: [] }, tout_le_stock: { ordre: 0, vraies: [] } };
for (const f of fs.readdirSync(dirR)) {
  const r = JSON.parse(fs.readFileSync(path.join(dirR, f), 'utf8'));
  for (const nom of ['normal', 'tout_le_stock']) {
    const d = r[nom].decisions; if (d.identiques || d.memesSansDistance) continue;
    const cA = new Map(); for (const x of d.perdues) { const k = canon(x); cA.set(k, (cA.get(k) ?? []).concat([x])); }
    const restantesB = [];
    for (const x of d.nouvelles) { const k = canon(x); const l = cA.get(k); if (l && l.length) { l.pop(); res[nom].ordre++; } else restantesB.push(x); }
    const restantesA = [...cA.values()].flat();
    if (!restantesA.length && !restantesB.length) continue;
    const lu = JSON.parse(fs.readFileSync(path.join(dirM, r.user + '.json'), 'utf8'));
    const titre = new Map([...lu.fiches.map((x) => ['F' + x.id, x.titre]), ...lu.annonces.map((x) => ['A' + x.id, `${x.platform}: ${x.titre}`])]);
    const aretes = new Map(r.tout_le_stock.graphe.aretesDiff.map((e) => [e.paire, e]));
    const decrire = (x, sens) => {
      const ids = [...(x.annonces ?? []).map((a) => 'A' + a), x.annonce ? 'A' + x.annonce : null, x.absorbe ? 'F' + x.absorbe : null, x.garde ? 'F' + x.garde : null,
        x.candidat?.annonce ? 'A' + x.candidat.annonce : null, x.candidat?.fiche ? 'F' + x.candidat.fiche : null,
        x.a?.annonce ? 'A' + x.a.annonce : null, x.a?.fiche ? 'F' + x.a.fiche : null, x.b?.annonce ? 'A' + x.b.annonce : null, x.b?.fiche ? 'F' + x.b.fiche : null].filter(Boolean);
      const paires = [];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const e = aretes.get([ids[i], ids[j]].sort().join('|')); if (e) paires.push(e); }
      return { compte: r.user.slice(0, 8), sens, type: x.type, motif: x.motif ?? x.preuves?.motif ?? null, ids, titres: ids.map((i) => (titre.get(i) ?? '').slice(0, 70)), aretes_changees: paires, decision: x };
    };
    for (const x of restantesA) res[nom].vraies.push(decrire(x, 'A seulement'));
    for (const x of restantesB) res[nom].vraies.push(decrire(x, 'B seulement'));
  }
}
fs.writeFileSync(path.join(W, 'donnees', 'resultats', 'moteur-ecarts.json'), JSON.stringify(res, null, 1));
for (const nom of ['normal', 'tout_le_stock']) {
  const t = {}; for (const v of res[nom].vraies) { const k = `${v.sens} ${v.type}${v.motif ? ':' + v.motif : ''}`; t[k] = (t[k] ?? 0) + 1; }
  console.log(nom, 'ordre seulement', res[nom].ordre, 'vraies', res[nom].vraies.length, 'comptes', new Set(res[nom].vraies.map((v) => v.compte)).size);
  console.log(Object.entries(t).sort((a, b) => b[1] - a[1]).map((x) => '   ' + x[1] + ' ' + x[0]).join('\n'));
}
