// ═══════════════════════════════════════════════════════════════════════════
// ESSAI D, UN SEUL THREAD — mesures DANS la fonction de test essai-empreintes-d-test.
// Une série : 12 photos normales du test (6 au premier appel = démarrage à froid),
// puis les plus grosses photos du bucket (20 PNG, 20 JPEG, 5 WebP), 8 par appel.
// Vérifie : empreinte de la fonction == empreinte stockée (photos normales) ;
// sha256 de la fonction == sha256 de la version Supabase téléchargée (.r) ou du module local.
// Usage : node appeler-fonction.mjs <dossier de travail> <fichier du jeton> <dossier du module local>
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import crypto from 'node:crypto';

const [travail, fichierJeton] = process.argv.slice(2);
const JETON = fs.readFileSync(fichierJeton, 'utf8').trim();
const URL_FONCTION = 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/essai-empreintes-d-test';
const id = (u) => crypto.createHash('sha256').update(u).digest('hex').slice(0, 16);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const canon = (v) => v && typeof v === 'object' && !Array.isArray(v)
  ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v);

const test = JSON.parse(fs.readFileSync(`${travail}/donnees/test.json`, 'utf8')).slice(0, 12);
const gros = JSON.parse(fs.readFileSync(`${travail}/donnees/gros.json`, 'utf8'));
const lots = [
  ['normales', test.slice(0, 6).map((r) => r.url)],
  ['normales', test.slice(6, 12).map((r) => r.url)],
];
for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
  const l = gros.filter((g) => g.type === type).map((g) => g.url);
  for (let i = 0; i < l.length; i += 8) lots.push([type.slice(6), l.slice(i, i + 8)]);
}

const reponses = [];
for (const [nom, urls] of lots) {
  const t = Date.now();
  const r = await fetch(URL_FONCTION, { method: 'POST', headers: { 'content-type': 'application/json', 'x-essai-d': JETON }, body: JSON.stringify({ urls }) });
  const corps = r.ok ? await r.json() : { erreur_http: r.status, texte: (await r.text()).slice(0, 300) };
  reponses.push({ nom, ms_appel: Date.now() - t, http: r.status, ...corps });
  console.log(nom, 'HTTP', r.status, 'froid', corps.froid, Date.now() - t, 'ms');
}
fs.writeFileSync(`${travail}/donnees/fonction-reponses.json`, JSON.stringify(reponses, null, 1));

// Vérifications
const stockee = new Map(test.map((r) => [r.url, r]));
let normalesOk = 0, normalesN = 0, octetsSupabase = 0;
for (const rep of reponses.filter((x) => x.nom === 'normales')) {
  for (const p of rep.photos ?? []) {
    normalesN++;
    const s = stockee.get(p.url);
    const e = p.empreinte;
    if (e && canon({ dhash: e.dhash, phash: e.phash, couleur: e.couleur, variantes: canon(e.variantes) })
      === canon({ dhash: s.dhash, phash: s.phash, couleur: s.couleur, variantes: canon(s.variantes) })) normalesOk++;
    const ref = `${travail}/donnees/test/${id(p.url)}.r`;
    if (p.sha256 && fs.existsSync(ref) && sha(fs.readFileSync(ref)) === p.sha256) octetsSupabase++;
  }
}
const toutes = reponses.flatMap((x) => (x.photos ?? []).map((p) => ({ lot: x.nom, ...p })));
const parType = {};
for (const p of toutes) {
  const k = p.lot;
  parType[k] ??= { photos: 0, faites: 0, hors_perimetre: 0, erreurs: 0, ms: [], octets_max: 0, mpx_max: 0 };
  const a = parType[k];
  a.photos++;
  if (p.code === 0) { a.faites++; a.ms.push((p.reduction_ms ?? 0) + (p.empreinte_ms ?? 0)); }
  else if (p.code === 1) a.hors_perimetre++;
  else a.erreurs++;
  a.octets_max = Math.max(a.octets_max, p.octets_originale ?? 0);
  if (p.infos) a.mpx_max = Math.max(a.mpx_max, +((p.infos[0] * p.infos[1]) / 1e6).toFixed(1));
}
for (const a of Object.values(parType)) { a.ms.sort((x, y) => x - y); a.ms_mediane = a.ms[a.ms.length >> 1] ?? null; a.ms_max = a.ms.at(-1) ?? null; delete a.ms; }
const memoires = toutes.map((p) => p.memoire).filter(Boolean);
console.log(JSON.stringify({
  demarrage_froid: reponses[0].demarrage,
  empreintes_normales_identiques_a_la_base: `${normalesOk}/${normalesN}`,
  octets_normales_identiques_a_supabase: `${octetsSupabase}/${normalesN}`,
  par_type: parType,
  rss_max_mo: Math.max(...memoires.map((m) => m.rss_mo ?? 0)),
  tas_max_mo: Math.max(...memoires.map((m) => m.tas_mo ?? 0)),
  externe_max_mo: Math.max(...memoires.map((m) => m.externe_mo ?? 0)),
  wasm_max_mo: Math.max(...toutes.map((p) => p.wasm_mo ?? 0)),
  pointe_libvips_max_mo: Math.max(...reponses.map((x) => x.pointe_libvips_mo ?? 0)),
  appels_ms: reponses.map((x) => x.ms_appel),
  froids: reponses.map((x) => x.froid),
  erreurs: toutes.filter((p) => p.erreur && p.code !== 1).map((p) => p.erreur).slice(0, 5),
}, null, 1));
