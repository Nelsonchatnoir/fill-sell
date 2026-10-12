// ═══════════════════════════════════════════════════════════════════════════
// PREUVE SUR COMPTES RÉELS : LA PASSE EN TRANCHES = LA PASSE D'UN SEUL TENANT (12/10)
// ═══════════════════════════════════════════════════════════════════════════
// Rejoue, sur les données RÉELLES d'un compte (lecture seule, rapatriées hors
// dépôt), trois calculs et compare leurs décisions, ordre compris :
//   1. le moteur de RÉFÉRENCE (celui d'une révision git, par défaut c8b44ab =
//      rapprochement v19, d'un seul tenant) ;
//   2. le moteur actuel, d'un seul tenant (CALCUL_DIRECT) ;
//   3. le moteur actuel EN TRANCHES, comme la fonction edge : chaque invocation
//      repart de zéro (nœuds paresseux, empreintes compactes), le cache passe par
//      du JSON comme dans rapprochement_tranches, budget de calcul --budget ms.
// Variantes : --mode normal|reparation, --vierge (toute annonce rangée
// automatiquement redevient libre : un premier relevé), MAIN=toutes, REMISES=toutes.
//
// LES DONNÉES (deux fichiers par compte dans --dossier, jamais dans le dépôt) :
//   <nom>-lire.json : [{"d": <select public.rapprochement_v3_lire('<uuid>')>}]
//   <nom>-emp.json  : [{"emp": "<url>\t<dhash hexa>\t<phash hexa>\t<c70 d:p>,<p85 d:p>,…\t<jsonb_typeof(variantes)>\n…",
//                       "illisibles": "<url>\n…"}]
//     (photo_empreintes des photos de la lecture ; hexa = lpad(to_hex(x::bit(64)::bigint),16,'0') ; « - » : variante absente)
//
//   node scripts/preuves/preuve-rapprochement-tranches.mjs --dossier <dir> --compte <nom> [--mode normal] [--budget 550] [--vierge] [--ref c8b44ab]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const val = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const dossier = val('--dossier'), nom = val('--compte');
if (!dossier || !nom) { console.error('--dossier <dir> --compte <nom> obligatoires'); process.exit(2); }
const mode = val('--mode', 'normal'), budgetMs = Number(val('--budget', '550')), vierge = args.includes('--vierge'), ref = val('--ref', 'c8b44ab');

// le moteur de référence, tel qu'il était à la révision `ref`
const dirRef = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-ref-'));
for (const f of ['passe.js', 'moteur.js', 'photos.js', 'texte.js', 'idf.js', 'fiches-main.js', 'remises-en-ligne.js']) {
  fs.writeFileSync(path.join(dirRef, f), execSync(`git show ${ref}:supabase/functions/_shared/rapprochement/${f}`, { cwd: racine, encoding: 'utf8', maxBuffer: 1 << 26 }));
}
const REF = await import(path.join(dirRef, 'passe.js'));
const { passe, urlsDe, manquantesDe } = await import('../../supabase/functions/_shared/rapprochement/passe.js');
const { photoDepuisCompacte, compacteComplete, photoDepuisEmpreinte } = await import('../../supabase/functions/_shared/rapprochement/photos.js');
const { calculEnTranches, cacheDepuis, Suite } = await import('../../supabase/functions/_shared/rapprochement/tranches.js');

// les données
const hexBin = (h) => BigInt('0x' + h).toString(2).padStart(64, '0');
let donnees = JSON.parse(fs.readFileSync(path.join(dossier, `${nom}-lire.json`), 'utf8'))[0].d;
const e = JSON.parse(fs.readFileSync(path.join(dossier, `${nom}-emp.json`), 'utf8'))[0];
const map = new Map(), compactes = new Map();
const K = ['c70', 'p85', 'g45', 'g60', 'g35'];
for (const ligne of (e.emp ?? '').split('\n')) {
  if (!ligne) continue;
  const [url, dh, ph, va, vt] = ligne.split('\t');
  const variantes = vt === 'object' || vt === undefined ? {} : null;
  const c = [url, dh, ph, vt === 'object' || vt === 'array' || vt === undefined ? 1 : 0];
  va.split(',').forEach((x, i) => { if (x !== '-') { const [a, b] = x.split(':'); variantes[K[i]] = [hexBin(a), hexBin(b)]; c.push(a, b); } else c.push(null, null); });
  map.set(url, { url, dhash: hexBin(dh), phash: hexBin(ph), variantes });
  compactes.set(url, c);
}
const illisibles = new Set((e.illisibles ?? '').split('\n').filter(Boolean));
if (vierge) {
  donnees = structuredClone(donnees);
  const auto = (a) => a.inventaire_id && a.source !== 'manuel' && a.source !== 'job' && a.derniere_par !== 'utilisateur' && a.derniere_par !== 'job';
  for (const a of donnees.annonces) if (auto(a)) { a.inventaire_id = null; a.source = null; a.derniere_par = null; }
  donnees.fiches = donnees.fiches.filter((f) => !String(f.origine ?? '').startsWith('releve_') || donnees.annonces.some((a) => String(a.inventaire_id) === String(f.id)));
}
const opts = { mode, fichesMain: process.env.MAIN || 'nouvelles', remises: process.env.REMISES || 'nouvelles' };

// les empreintes compactes disent la même chose
const urls = urlsDe(donnees);
const m1 = manquantesDe(urls, map, illisibles), m2 = urls.filter((u) => !illisibles.has(u) && !compacteComplete(compactes.get(u)));
const photosEgales = urls.every((u) => JSON.stringify(photoDepuisEmpreinte(map.get(u))) === JSON.stringify(photoDepuisCompacte(compactes.get(u))));

let t = performance.now(); const r1 = REF.passe(donnees, map, opts); const tRef = performance.now() - t;
t = performance.now(); const r2 = passe(donnees, map, opts); const tDir = performance.now() - t;
const lignes = new Map(); let inv = 0, maxMs = 0, r3 = null;
const photosDe = (us) => us.map((u) => photoDepuisCompacte(compactes.get(u))).filter(Boolean);
while (!r3) {
  inv++;
  const t0 = performance.now();
  const cache = cacheDepuis([...lignes].map(([cle, contenu]) => ({ cle, contenu })));
  const nouveaux = []; const budget = { fin: performance.now() + budgetMs, unites: 0 };
  try { r3 = passe(donnees, null, { ...opts, calcul: calculEnTranches({ cache, budget, nouveaux }), photosDe, paresseux: true }); }
  catch (x) { if (!(x instanceof Suite)) throw x; }
  for (const n of nouveaux) { lignes.set(n.cle, JSON.stringify(n.contenu)); if (n.remplace) for (const k of [...lignes.keys()]) if (k.startsWith(n.remplace) && k !== n.cle) lignes.delete(k); }
  maxMs = Math.max(maxMs, performance.now() - t0);
  if (inv > 20000) throw new Error('la passe en tranches ne finit pas');
}
const s = (r) => JSON.stringify(r.decisions);
const ok = s(r1) === s(r2) && s(r1) === s(r3) && JSON.stringify(m1) === JSON.stringify(m2) && photosEgales;
console.log(`${ok ? 'IDENTIQUE' : 'DIFFÉRENT'} ${nom} ${mode}${vierge ? ' vierge' : ''}${opts.fichesMain === 'toutes' ? ' main=toutes' : ''}${opts.remises === 'toutes' ? ' remises=toutes' : ''} : `
  + `${r1.decisions.length} décisions ${JSON.stringify(r1.bilan.plan)} | réf ${ref} ${tRef.toFixed(0)} ms | tranches ${inv} invocation(s), calcul max ${maxMs.toFixed(0)} ms (budget ${budgetMs})`
  + ` | photos ${photosEgales ? '=' : '≠'}, manquantes ${JSON.stringify(m1) === JSON.stringify(m2) ? '=' : '≠'}`);
fs.rmSync(dirRef, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
