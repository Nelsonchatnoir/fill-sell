#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// LE STOCK ET LES VENTES SONT LUS EN ENTIER — ET LE BANDEAU « VENDUE » DIT
// VRAI (11/10/2026, cas Rémi)
// ═══════════════════════════════════════════════════════════════════════════
// Rémi (2189c4d8…) : « 17 articles sur 900 » sous @narema75 pour 187 fiches
// sur 1 218 en stock. Quatre défauts, quatre contrôles — chacun TOMBE si le
// défaut revient :
//   A. la coupure à 1 000 : PostgREST rend 1 000 lignes au plus, SANS erreur ;
//      le `.limit(3000)` de l'inventaire et des ventes n'était jamais tenu
//      (18 comptes, 9 267 fiches en stock et 1 390 vendues invisibles ;
//      3 comptes, 1 562 ventes). Faux serveur qui coupe comme le vrai :
//      1 349 lignes → 1 349 lues, ordre created_at desc, id desc gardé,
//      insertions et fusions pendant la lecture sans doublon ni trou ; puis
//      l'app : aucune lecture de liste sur inventaire/ventes sans pages ;
//   B. le prix pré-rempli du bandeau : sur une REPUBLICATION, detected_price
//      et price sont NULL — le prix vient de prix_recreation /
//      republish_snapshot.prix / la fiche, jamais 0 ;
//   C. « Non, je l'ai retirée » n'est jamais offert sous une preuve de vente
//      (sale_signal = 'sold') — 5 taps chez Rémi, 5 ventes perdues ;
//   D. la vue « Vendu » suit la boutique choisie (soldFiltre).
// Lancer : npm run selftest:stock-ventes-en-entier
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireToutesPagesRecentsDabord, filtreApresCle } from '../src/utils/lireToutesPages.js';
import { prixParDefautDuBandeau, prixLisible, retireeProposable, preuveDeVente } from '../src/utils/prixBandeauVente.js';
import { dansLaBoutique } from '../src/utils/filtreBoutique.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src/App.jsx');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// ─────────────────────────────────────────────────────────────────────────────
// A. FAUX POSTGREST : coupe à `plafond` lignes, comprend .or() (dates citées),
//    trie created_at desc NULL d'abord (comme Postgres), id desc.
// ─────────────────────────────────────────────────────────────────────────────
// Clé de temps exacte à la microseconde (Postgres rend « …:12.73446+00:00 »,
// zéros de fin retirés) ; une valeur illisible = l'erreur de conversion du vrai.
function cleTemps(s) {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(String(s));
  if (!m) throw Object.assign(new Error(`invalid input syntax for type timestamp with time zone: "${s}"`), { code: '22007' });
  return BigInt(Date.parse(m[1] + m[3])) * 1000n + BigInt((m[2] ?? '').padEnd(6, '0'));
}
const tsPostgres = (us) => { // us : microsecondes depuis l'époque (BigInt)
  const ms = Number(us / 1000n);
  const frac = String(us % 1000000n).padStart(6, '0').replace(/0+$/, '');
  return new Date(ms).toISOString().slice(0, 19) + (frac ? `.${frac}` : '') + '+00:00';
};
function decouper(s) { // virgules de premier niveau, hors guillemets
  const out = []; let prof = 0, cite = false, cur = '';
  for (const c of s) {
    if (c === '"') cite = !cite;
    if (!cite && c === '(') prof++;
    if (!cite && c === ')') prof--;
    if (!cite && prof === 0 && c === ',') { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
function predicat(terme) {
  const g = /^(and|or)\((.*)\)$/.exec(terme);
  if (g) {
    const ps = decouper(g[2]).map(predicat);
    return g[1] === 'and' ? (r) => ps.every((p) => p(r)) : (r) => ps.some((p) => p(r));
  }
  const m = /^([a-z_]+)\.(not\.)?(lt|gt|eq|is)\.(.*)$/.exec(terme);
  if (!m) throw new Error(`filtre illisible : ${terme}`);
  const [, col, non, op, brut] = m;
  const cite = /^"(.*)"$/.exec(brut);
  if (!cite && /[,()]/.test(brut)) throw new Error(`valeur réservée non citée : ${brut}`);
  const val = cite ? cite[1] : brut;
  const cmp = (a) => {
    if (op === 'is') return val === 'null' ? a == null : false;
    if (a == null) return false; // NULL < x, NULL = x : faux en SQL
    const [x, y] = col === 'created_at' ? [cleTemps(a), cleTemps(val)] : [Number(a), Number(val)];
    return op === 'lt' ? x < y : op === 'gt' ? x > y : x === y;
  };
  return non ? (r) => !cmp(r[col]) : (r) => cmp(r[col]);
}
function fauxServeur(lignesInitiales, { plafond = 1000, erreurA = -1, apresAppel = null } = {}) {
  const etat = { lignes: [...lignesInitiales], appels: 0, actifs: 0 };
  const client = {
    from() {
      const q = { filtres: [], ordre: [], lim: null };
      const b = {
        select() { return b; },
        eq(c, v) { q.filtres.push((r) => String(r[c]) === String(v)); return b; },
        is(c, v) { q.filtres.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; },
        or(s) { q.filtres.push(predicat(`or(${s})`)); return b; },
        order(c, { ascending = true } = {}) { q.ordre.push([c, ascending]); return b; },
        limit(k) { q.lim = k; return b; },
        then(resolve, reject) {
          (async () => {
            assert.equal(++etat.actifs, 1, 'une page à la fois');
            await Promise.resolve();
            etat.actifs--;
            const numero = ++etat.appels;
            if (numero === erreurA) return { data: null, error: new Error('lecture interrompue') };
            let rows = etat.lignes.filter((r) => q.filtres.every((f) => f(r)));
            rows.sort((a, b2) => {
              for (const [c, asc] of q.ordre) {
                const va = a[c], vb = b2[c];
                if (va == null || vb == null) { // Postgres : NULL d'abord en desc, en dernier en asc
                  if (va == null && vb == null) continue;
                  return (va == null ? -1 : 1) * (asc ? -1 : 1);
                }
                const [x, y] = c === 'created_at' ? [cleTemps(va), cleTemps(vb)] : [Number(va), Number(vb)];
                if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
              }
              return 0;
            });
            rows = rows.slice(0, Math.min(q.lim ?? Infinity, plafond)).map((r) => ({ ...r }));
            apresAppel?.(numero, etat);
            return { data: rows, error: null };
          })().then(resolve, reject);
        },
      };
      return b;
    },
  };
  return { client, etat };
}
// Lignes « comme en prod » : ids bigint ~1,79e15, created_at par tranches de 8
// identiques à la microseconde (la synchro insère par 8 — d'où le départage par id).
const T0 = 1788412392180007n;
function fabriquer(nb, { depuis = 1_757_000_000_000_000n, nuls = 0 } = {}) {
  return Array.from({ length: nb }, (_, k) => ({
    id: Number(T0 + BigInt(k) * 1009n),
    user_id: 'u1', fusionne_dans: null,
    // Rang k ≈ position dans l'ordre de l'app : les plus récentes d'abord.
    created_at: k < nuls ? null : tsPostgres(depuis - BigInt(Math.floor(k / 8)) * 123457n),
  }));
}
const ordreAttendu = (lignes) => [...lignes].sort((a, b) => {
  if (a.created_at == null || b.created_at == null) {
    if (a.created_at == null && b.created_at == null) return b.id - a.id;
    return a.created_at == null ? -1 : 1;
  }
  const d = cleTemps(b.created_at) - cleTemps(a.created_at);
  return d !== 0n ? (d > 0n ? 1 : -1) : b.id - a.id;
}).map((r) => r.id);
const lecture = (client) => () => client.from('inventaire').select('*').eq('user_id', 'u1').is('fusionne_dans', null);

// A1. Le faux serveur coupe comme le vrai : l'ANCIENNE lecture rend 1 000.
{
  const { client } = fauxServeur(fabriquer(1349));
  const { data } = await client.from('inventaire').select('*').eq('user_id', 'u1').is('fusionne_dans', null)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(3000);
  ok(data.length === 1000, `l'ancienne lecture .limit(3000) rend 1 000 lignes sur 1 349 (rendu : ${data.length}) — la coupure est bien simulée`);
}
// A2. 1 349 lignes (Rémi) → 1 349 lues, même ordre, 3 requêtes (1 000, 349, vide).
for (const [nb, appels] of [[1349, 3], [3434, 5], [0, 1], [1000, 2], [999, 2]]) {
  const lignes = fabriquer(nb);
  const { client, etat } = fauxServeur(lignes);
  const lu = await lireToutesPagesRecentsDabord(lecture(client));
  ok(lu.length === nb, `${nb} lignes → ${lu.length} lues`);
  ok(new Set(lu.map((r) => r.id)).size === nb, `${nb} lignes : aucun doublon`);
  assert.deepEqual(lu.map((r) => r.id), ordreAttendu(lignes), `${nb} lignes : ordre created_at desc, id desc gardé`); n++;
  ok(etat.appels === appels, `${nb} lignes : ${appels} requêtes (rendu : ${etat.appels})`);
}
// A3. Un plafond serveur plus bas que la page demandée ne coupe rien.
{
  const lignes = fabriquer(1349);
  const { client, etat } = fauxServeur(lignes, { plafond: 300 });
  const lu = await lireToutesPagesRecentsDabord(lecture(client));
  ok(lu.length === 1349 && etat.appels === 6, `plafond 300 : 1 349 lues en 6 requêtes (rendu : ${lu.length} en ${etat.appels})`);
}
// A4. Pendant la lecture, la synchro insère 5 fiches neuves et une fusion sort
//     une fiche DÉJÀ lue et une fiche PAS ENCORE lue : aucune autre ne saute
//     ni ne double (une lecture par décalage aurait sauté 1 ligne ici).
{
  const lignes = fabriquer(1349);
  const ordre = ordreAttendu(lignes);
  const sortieLue = ordre[10], sortieALire = ordre[1200];
  const { client } = fauxServeur(lignes, {
    apresAppel: (numero, etat) => {
      if (numero !== 1) return;
      const neuves = fabriquer(5, { depuis: 1_790_000_000_000_000n }).map((r, k) => ({ ...r, id: r.id + 9_000_000 + k }));
      etat.lignes.push(...neuves);
      for (const r of etat.lignes) if (r.id === sortieLue || r.id === sortieALire) r.fusionne_dans = 1;
    },
  });
  const lu = await lireToutesPagesRecentsDabord(lecture(client));
  const ids = new Set(lu.map((r) => r.id));
  ok(ids.size === lu.length, 'insertion + fusion pendant la lecture : aucun doublon');
  ok(ordre.every((id) => id === sortieALire || ids.has(id)), 'insertion + fusion pendant la lecture : aucune fiche vivante sautée');
  ok(!ids.has(sortieALire), 'la fiche fusionnée avant d\'être lue n\'est pas rendue');
}
// A5. Des created_at NULL (NULL d'abord en desc, comme Postgres) à cheval sur une page.
{
  const lignes = fabriquer(1349, { nuls: 1003 });
  const { client } = fauxServeur(lignes);
  const lu = await lireToutesPagesRecentsDabord(lecture(client));
  assert.deepEqual(lu.map((r) => r.id), ordreAttendu(lignes), 'created_at NULL à cheval sur une page : ordre et total gardés'); n++;
}
// A6. Une page en erreur annule TOUT (jamais une liste à moitié lue).
{
  const { client } = fauxServeur(fabriquer(2500), { erreurA: 2 });
  await assert.rejects(lireToutesPagesRecentsDabord(lecture(client)), /interrompue/); n++;
}
// A7. La clé de page est citée (« : » et « . » réservés par PostgREST).
ok(filtreApresCle({ created_at: '2026-09-03T05:13:12.734462+00:00', id: 1788412392180007 })
  === 'created_at.lt."2026-09-03T05:13:12.734462+00:00",and(created_at.eq."2026-09-03T05:13:12.734462+00:00",id.lt.1788412392180007)',
  'filtre de page : date citée, départage par id');
// A8. Le cas Rémi, rejoué : 1 349 fiches dont 1 218 en stock, 187 @narema75 en
//     stock dont 17 seulement parmi les 1 000 plus récentes.
{
  const lignes = fabriquer(1349).map((r, k) => {
    // Parmi les 1 000 plus récentes : 101 vendues, 899 en stock ; au-delà :
    // 319 en stock, 30 vendues (1 218 en stock, 131 vendues).
    const vendu = k < 1000 ? k < 101 : k >= 1000 + 319;
    return { ...r, statut: vendu ? 'vendu' : 'stock' };
  });
  let narema = 0, naremaHaut = 0;
  for (const [k, r] of lignes.entries()) {
    if (r.statut !== 'stock') continue;
    if (k < 1000 && naremaHaut < 17) { r.vinted_account_id = '295151754'; naremaHaut++; narema++; }
    else if (k >= 1000 && narema < 187) { r.vinted_account_id = '295151754'; narema++; }
    else r.vinted_account_id = '32977976';
  }
  const enStock = (l) => l.filter((r) => r.statut === 'stock');
  const sousNarema = (l) => enStock(l).filter((r) => dansLaBoutique(r, '295151754'));
  const { client: c1 } = fauxServeur(lignes);
  const avant = (await c1.from('inventaire').select('*').eq('user_id', 'u1').is('fusionne_dans', null)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(3000)).data;
  const { client: c2 } = fauxServeur(lignes);
  const apres = await lireToutesPagesRecentsDabord(lecture(c2));
  ok(sousNarema(avant).length === 17 && enStock(avant).length === 899,
    `avant : « ${sousNarema(avant).length} sur ${enStock(avant).length} » (la plainte de Rémi)`);
  ok(sousNarema(apres).length === 187 && enStock(apres).length === 1218,
    `après : « ${sousNarema(apres).length} sur ${enStock(apres).length} »`);
}

// A9. L'APP : les deux lectures de fetchAll passent par les pages…
{
  ok(/const enEntier=\(construire\)=>lireToutesPagesRecentsDabord\(construire\)/.test(APP), 'fetchAll : enEntier lit par lireToutesPagesRecentsDabord');
  ok(APP.includes("enEntier(()=>supabase.from('ventes').select('*').eq('user_id',uid))"), 'fetchAll : les ventes sont lues EN ENTIER (mêmes colonnes, même filtre)');
  ok(APP.includes("enEntier(()=>supabase.from('inventaire').select('*').eq('user_id',uid).is('fusionne_dans',null))"), 'fetchAll : l\'inventaire est lu EN ENTIER (mêmes colonnes, même filtre fusionne_dans)');
  ok(/import \{ lireToutesPagesRecentsDabord \} from '\.\/utils\/lireToutesPages'/.test(APP), 'App.jsx importe la lecture par pages');
}
// … et AUCUNE lecture de liste sur inventaire / ventes, dans tout src/, n'est
// plafonnée ou lue d'un coup : chaque lecture est bornée par identifiant,
// compte (head), ligne unique — ou passe par les pages.
{
  const fichiers = [];
  const parcourir = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) parcourir(p); else if (/\.(jsx?|mjs)$/.test(e.name)) fichiers.push(p);
  } };
  parcourir(path.join(RACINE, 'src'));
  // La chaîne EXACTE d'une requête : `.from(…)` puis chaque `.méthode(…)`
  // (parenthèses équilibrées, chaînes respectées), jusqu'au premier terme qui
  // n'est plus un appel chaîné.
  const chaine = (src, i) => {
    let j = i;
    for (;;) {
      let k = j;
      while (/\s/.test(src[k] ?? '')) k++;
      const id = /^\.\s*[A-Za-z_$][\w$]*\s*\(/.exec(src.slice(k, k + 80));
      if (!id) return src.slice(i, j);
      k += id[0].length;
      let prof = 1, q = null;
      while (k < src.length && prof > 0) {
        const c = src[k];
        if (q) { if (c === '\\') k++; else if (c === q) q = null; }
        else if (c === '"' || c === "'" || c === '`') q = c;
        else if (c === '(') prof++;
        else if (c === ')') prof--;
        k++;
      }
      j = k;
    }
  };
  const fautifs = [];
  let paginees = 0;
  for (const f of fichiers) {
    const src = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    const re = /\.from\(\s*['"](inventaire|ventes)['"]\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
      const suite = chaine(src, m.index);
      const ligne = src.slice(0, m.index).split('\n').length;
      const ou = `${path.relative(RACINE, f)}:${ligne}`;
      if (/^\.from\([^)]*\)\s*\.(insert|update|delete|upsert)\(/.test(suite)) continue;
      const lim = /\.limit\(\s*(\d+)/.exec(suite);
      if (lim && Number(lim[1]) >= 1000) { fautifs.push(`${ou} : .limit(${lim[1]}) — PostgREST coupe à 1 000 sans erreur`); continue; }
      if (/\.eq\(\s*['"]id['"]|\.in\(\s*['"]id['"]|head:\s*true|\.single\(\)|\.maybeSingle\(\)/.test(suite)) continue;
      if (/(enEntier\(|lireToutesPages\w*\()\s*\(\)\s*=>\s*(supabase)?\s*$/.test(src.slice(Math.max(0, m.index - 80), m.index).replace(/\s+$/, ''))) { paginees++; continue; }
      fautifs.push(`${ou} : lecture de liste « ${m[1]} » sans pages (coupée à 1 000 lignes)`);
    }
  }
  assert.deepEqual(fautifs, [], `lectures d'inventaire/ventes non paginées :\n  ${fautifs.join('\n  ')}`); n++;
  ok(paginees >= 2, `au moins les 2 lectures de fetchAll sont paginées (trouvées : ${paginees})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// B. LE PRIX DU BANDEAU
// ─────────────────────────────────────────────────────────────────────────────
// Formes réelles relevées le 11/10 (cross_post_jobs Vinted, 30 jours) :
// republish → price NULL, prix_recreation nombre, republish_snapshot.prix texte « 10.0 ».
const republication = { id: 'j1', action: 'republish', platform: 'vinted', price: null, inventaire_id: 7,
  platform_fields: { sale_signal: 'sold', unavailable_since: '2026-10-11', prix_recreation: 15, republish_snapshot: { prix: '15.0' } } };
ok(prixParDefautDuBandeau(republication) === 15, 'republication vendue : le prix vient de prix_recreation (15), plus jamais vide');
ok(prixParDefautDuBandeau({ ...republication, platform_fields: { republish_snapshot: { prix: '10.0' } } }) === 10, 'republication sans prix_recreation : republish_snapshot.prix (« 10.0 ») → 10');
ok(prixParDefautDuBandeau({ price: null, platform_fields: {} }, { sell: 12 }) === 12, 'rien sur le job : le prix de vente de la fiche (12)');
ok(prixParDefautDuBandeau({ price: null, platform_fields: {} }, { prix_vente: '8,50' }) === 8.5, 'fiche brute : prix_vente « 8,50 » → 8,5');
ok(prixParDefautDuBandeau({ price: null, platform_fields: {} }, null) === null, 'aucune source : null — le champ reste vide, jamais 0');
ok(prixParDefautDuBandeau({ price: 0, platform_fields: { detected_price: 0, prix_recreation: '0' } }, { sell: 0 }) === null, 'des zéros partout : null, jamais 0 inventé');
ok(prixParDefautDuBandeau({ price: 12, platform_fields: { detected_price: 9 } }) === 9, 'le prix lu sur la page passe devant le prix de mise en ligne');
ok(prixParDefautDuBandeau({ price: 12, platform_fields: { prix_recreation: 15 } }) === 12, 'le prix du job passe devant celui de la republication');
ok(prixParDefautDuBandeau({ price: 0, platform_fields: { prix_recreation: 15 } }) === 15, 'un prix du job à 0 cède la place');
ok(prixLisible(true) === null && prixLisible('abc') === null && prixLisible(-3) === null, 'prixLisible : booléen, texte, négatif → null');
// La revue en liste (RevueAutresPlateformes, non modifiée) calcule
// `Number(pf.detected_price ?? job.price) || ''` : avec le job enrichi par
// l'app, elle montre le MÊME prix que celui qui part.
{
  const enrichi = { ...republication, price: prixParDefautDuBandeau(republication) };
  const pf = enrichi.platform_fields;
  ok((Number(pf.detected_price ?? enrichi.price) || '') === 15, 'revue en liste : le prix montré (15) = le prix envoyé');
  ok(enrichi.platform_fields === republication.platform_fields, 'revue en liste : platform_fields intact (dismissUnavailable le réécrit tel quel)');
}
// L'app : le bandeau, l'envoi et la revue lisent la MÊME règle.
ok(APP.includes('const prixDefaut=prixParDefautDuBandeau(job,ficheDuJob(job));'), 'bandeau : prix pré-rempli = prixParDefautDuBandeau');
ok(APP.includes('const defaut=prixParDefautDuBandeau(job,ficheDuJob(job))??0;'), 'confirmSaleFromBanner : même règle que le champ');
ok(!/^(?!\s*\/\/).*detected_price\s*\?\?\s*job\.price/m.test(APP), 'App.jsx : plus aucun `detected_price ?? job.price` (prix vide sur une republication)');
ok(APP.includes('jobs={disparusAutresPfPrix}') && APP.includes('jobs={aVerifierPrix}'), 'revue en liste : les deux blocs reçoivent les jobs au prix du bandeau');
ok(APP.includes('const avecPrixDuBandeau=(j)=>({...j,price:prixParDefautDuBandeau(j,ficheDuJob(j))});'), 'revue en liste : seul `price` est enrichi');

// ─────────────────────────────────────────────────────────────────────────────
// C. « NON, JE L'AI RETIRÉE » JAMAIS SOUS UNE PREUVE DE VENTE
// ─────────────────────────────────────────────────────────────────────────────
ok(retireeProposable(republication) === false && preuveDeVente(republication) === true, 'preuve sold : « je l\'ai retirée » NON proposé');
ok(retireeProposable({ platform_fields: { unavailable_since: '2026-10-11' } }) === true, 'simple disparition : « je l\'ai retirée » proposé');
ok(retireeProposable({}) === true && retireeProposable(null) === true, 'job sans drapeau : proposé (comportement d\'avant)');
{
  // Le bouton du bandeau est conditionné…
  const i = APP.indexOf('{lang===\'fr\'?"Non, je l\'ai retirée":"No, I removed it"}');
  ok(i > 0, 'bandeau : le bouton « Non, je l\'ai retirée » est trouvé');
  const avant = APP.slice(Math.max(0, i - 600), i);
  ok(/\{retireeProposable\(job\)&&\(\s*<button disabled=\{busy\} onClick=\{\(\)=>dismissUnavailable\(job\)\}/.test(avant), 'bandeau : « Non, je l\'ai retirée » n\'existe que si retireeProposable(job)');
  // … et le chemin d'écriture refuse quand même.
  const d = APP.indexOf('async function dismissUnavailable(job){');
  const corps = APP.slice(d, d + 700);
  const garde = corps.indexOf('if(preuveDeVente(job))');
  const ecriture = corps.indexOf(".from('cross_post_jobs')");
  ok(garde > 0 && ecriture > garde && /if\(preuveDeVente\(job\)\)\{[^}]*return;\}/.test(corps), 'dismissUnavailable : refuse AVANT toute écriture sous une preuve de vente');
}

// ─────────────────────────────────────────────────────────────────────────────
// D. LA VUE « VENDU » SUIT LA BOUTIQUE (soldFiltre, exécuté tel qu'écrit)
// ─────────────────────────────────────────────────────────────────────────────
ok(dansLaBoutique({ vinted_account_id: '295151754' }, '295151754') && !dansLaBoutique({ vinted_account_id: '32977976' }, '295151754'), 'boutique : retenue / écartée');
ok(dansLaBoutique({ vinted_account_id: 295151754 }, '295151754'), 'boutique : id numérique ou texte, même boutique');
ok(dansLaBoutique({ vinted_account_id: null }, 'sans_origine') && !dansLaBoutique({ vinted_account_id: '1' }, 'sans_origine'), 'boutique : « sans origine »');
ok(dansLaBoutique({ vinted_account_id: '1' }, 'Toutes') && dansLaBoutique({}, undefined), 'boutique : « Toutes » inerte');
{
  const m = /const soldFiltre=useMemo\(\(\)=>([\s\S]*?),\[([^\]]*)\]\);/.exec(APP);
  ok(!!m, 'soldFiltre trouvé dans App.jsx');
  ok(m[2].split(',').map((s) => s.trim()).includes('filterBoutique'), 'soldFiltre se recalcule quand la boutique change (dépendance filterBoutique)');
  const soldFiltre = new Function('sold', 'filterType', 'filterBoutique', 'filterMarqueSold', 'search', 'marqueKey', 'searchMatch', 'dansLaBoutique', `return ${m[1]};`);
  const vendus = [
    { id: 1, type: 'Vêtements', marque: 'Zara', vinted_account_id: '295151754' },
    { id: 2, type: 'Vêtements', marque: 'Zara', vinted_account_id: '32977976' },
    { id: 3, type: 'Vêtements', marque: 'Zara', vinted_account_id: null },
  ];
  const mk = (s) => String(s ?? '').trim().toLowerCase();
  const tous = () => true;
  const sous = (b) => soldFiltre(vendus, 'Tous', b, 'Toutes', '', mk, tous, dansLaBoutique).map((i) => i.id);
  assert.deepEqual(sous('295151754'), [1], 'Vendu sous @narema75 : ses ventes seulement'); n++;
  assert.deepEqual(sous('sans_origine'), [3], 'Vendu sous « sans origine » : les fiches non estampillées'); n++;
  assert.deepEqual(sous('Toutes'), [1, 2, 3], 'Vendu sous « Toutes » : tout'); n++;
  const st = /const stockFiltre=useMemo\(\(\)=>\{([\s\S]*?)\},\[([^\]]*)\]\);/.exec(APP);
  ok(st && st[1].includes('.filter(i=>dansLaBoutique(i,filterBoutique))') && st[2].includes('filterBoutique'), 'stockFiltre : MÊME règle de boutique (dansLaBoutique)');
}

// ─────────────────────────────────────────────────────────────────────────────
// E. LE PRIX D'ANNONCE VINTED DU STOCK TIENT UN INVENTAIRE ENTIER
//    (utils/prixAnnoncesVinted.js — à brancher dans StockTab, autre chantier)
// ─────────────────────────────────────────────────────────────────────────────
// Passerelle simulée : au-delà de 1 100 identifiants dans un `.in()`, la
// requête tombe (mesuré le 11/10 : 1 150 → connexion coupée, 2 000 → 400).
{
  const ids = Array.from({ length: 3434 }, (_, k) => String(10200000000 + k * 7919));
  const releves = ids.flatMap((id, k) => [
    { vinted_item_id: id, price: 10 + (k % 7), captured_at: 3 }, // le plus récent
    { vinted_item_id: id, price: 99, captured_at: 2 },
    { vinted_item_id: id, price: 98, captured_at: 1 },
  ]);
  const passerelle = ({ erreurLot = -1 } = {}) => {
    const etat = { appels: 0, actifs: 0, maxIds: 0 };
    const client = { from() {
      let liste = [], lim = Infinity;
      const b = {
        select() { return b; }, eq() { return b; }, order() { return b; },
        in(_c, v) { liste = v; return b; }, limit(k) { lim = k; return b; },
        then(resolve, reject) {
          (async () => {
            assert.equal(++etat.actifs, 1, 'un lot à la fois'); await Promise.resolve(); etat.actifs--;
            const numero = ++etat.appels; etat.maxIds = Math.max(etat.maxIds, liste.length);
            if (liste.length > 1100) return { data: null, error: new Error('Bad Request') };
            if (numero === erreurLot) return { data: null, error: new Error('lot interrompu') };
            const s = new Set(liste);
            const rows = releves.filter((r) => s.has(r.vinted_item_id)).sort((a, b2) => b2.captured_at - a.captured_at);
            return { data: rows.slice(0, Math.min(lim, 1000)), error: null };
          })().then(resolve, reject);
        },
      };
      return b;
    } };
    return { client, etat };
  };
  const { lirePrixAnnoncesVinted } = await import('../src/utils/prixAnnoncesVinted.js');
  // L'ancienne requête unique (StockTab, `.in(tous les ids)`) : tout tombe.
  const { client: c0 } = passerelle();
  const ancien = await c0.from('vinted_listing_snapshots').select('vinted_item_id,price').eq('user_id', 'u1')
    .in('vinted_item_id', ids).order('captured_at', { ascending: false }).limit(1000);
  ok(ancien.error != null, 'ancienne lecture : un seul .in() de 3 434 identifiants tombe (aucun prix d\'annonce)');
  const { client, etat } = passerelle();
  const prix = await lirePrixAnnoncesVinted(client, 'u1', ids);
  ok(Object.keys(prix).length === 3434 && ids.every((id, k) => prix[id] === 10 + (k % 7)), '3 434 articles : chacun a le prix de son DERNIER relevé');
  ok(etat.maxIds <= 400 && etat.appels === 9, `lots de 400 au plus, 9 requêtes (rendu : ${etat.maxIds} ids, ${etat.appels} requêtes)`);
  const { client: c2 } = passerelle({ erreurLot: 2 });
  const partiel = await lirePrixAnnoncesVinted(c2, 'u1', ids);
  ok(ids.slice(400, 800).every((id) => partiel[id] === null) && partiel[ids[0]] === 10 && partiel[ids[3433]] != null,
    'un lot en erreur : ses articles sans prix (null, jamais 0), les autres lots servis');
}

// ── F. Le Stock branché sur les lots, et les écritures groupées par lots ────
{
  const STOCK = lire('src/tabs/StockTab.jsx');
  const effet = STOCK.slice(STOCK.indexOf('const [prixAnnonces, setPrixAnnonces]'), STOCK.indexOf('// Prix RÉELLEMENT demandé sur l\'annonce Vinted'));
  ok(/lirePrixAnnoncesVinted\(supabase, user\.id, ids\)/.test(effet) && !/\.in\('vinted_item_id', ids\)/.test(effet),
    'Stock : les prix d\'annonce passent par les lots de 400 (plus de .in() de tous les identifiants)');
  ok(/for \(const id of ids\) if \(n\[id\] == null\) n\[id\] = lus\[id\] \?\? null;/.test(effet), 'Stock : chaque identifiant noté (jamais une relecture en boucle)');
  const { parLots } = await import('../src/utils/parLots.js');
  const ids3048 = Array.from({ length: 3048 }, (_, k) => 1789889101726000 + k);
  const lots = parLots(ids3048);
  ok(lots.length === 8 && lots.every((l) => l.length <= 400) && lots.flat().length === 3048 && lots.flat().every((id, k) => id === ids3048[k]),
    'parLots : 3 048 identifiants → 8 lots de 400 au plus, aucun perdu, ordre gardé');
  ok(parLots([]).length === 0, 'parLots : rien → aucun lot');
  const pa = STOCK.slice(STOCK.indexOf('async function ecrirePrixAchatStock'), STOCK.indexOf('function validerPaStock'));
  ok((pa.match(/for\(const lot of parLots\(ids\)\)\{/g) ?? []).length === 2 && !/\.in\('id',ids\)/.test(pa),
    'prix d\'achat en lot (« tout sélectionner ») : écrit par lots, jamais un .in() de tout le stock');
  ok(/const nonEcrits=ids\.filter\(id=>!ecrits\.has\(id\)\);/.test(pa), 'un lot en erreur : seuls les articles non écrits reprennent leur affichage');
  const barre = lire('src/stock/BarreModifierLot.jsx');
  ok(/for \(const lot of parLots\(g\.ids\)\) \{/.test(barre) && /\.in\("id", lot\)/.test(barre) && !/\.in\("id", g\.ids\)/.test(barre),
    'prix / quantité en lot : écrits par lots de 400');
}

console.log(`stock-ventes-en-entier : ${n} contrôles verts — lecture complète par pages (1 349 → 1 349, ordre gardé), prix du bandeau jamais vide sur une republication, « je l'ai retirée » jamais sous une preuve de vente, « Vendu » suit la boutique.`);
