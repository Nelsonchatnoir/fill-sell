// ═══════════════════════════════════════════════════════════════════════════
// CONTRÔLE : NOS LISTES FIGÉES FACE AUX VRAIES LISTES DES PLATEFORMES (21/11/2026, lot de Nico, point 1)
// ═══════════════════════════════════════════════════════════════════════════
// Lecture SEULE de la prod (--read-only), rien n'est écrit. Compare :
//   1. les grilles « Taille » Leboncoin par univers (_shared/lbc-grilles-univers.js) aux dernières lectures du même menu
//      (lbc_grilles_relevees, 30 jours) ;
//   2. les libellés enfant que nous écrivons pour Vinted, Leboncoin et Beebs (src/utils/childSizes.js) aux listes de
//      tailles relevées chez elles (platform_category_aspects ; Leboncoin : aussi lbc_grilles_relevees) ;
//   3. les champs Leboncoin dont la liste DÉPEND d'un autre champ (plusieurs grilles lues pour un même rayon, un même
//      champ, un même univers) alors que le catalogue n'en garde qu'une.
// Le contrôle quotidien (ops-digest, section « Listes figées ») refait 1 et 3 chaque jour.
//   node scripts/controle-listes-plateformes.mjs            → le rapport
//   node scripts/controle-listes-plateformes.mjs --strict   → code 1 au moindre écart sur 1 ou 2
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GRILLES_LBC_TAILLE_VETEMENTS, CLE_VETEMENTS_LBC, CHAMP_TAILLE_VETEMENTS_LBC } from '../supabase/functions/_shared/lbc-grilles-univers.js';
import { ecartsGrillesParUnivers, libellesAbsents, champsAListesDependantes } from '../supabase/functions/_shared/controle-listes-plateformes.js';
import { CHILD_MONTH_SIZES, CHILD_YEAR_SIZES } from '../src/utils/childSizes.js';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const STRICT = process.argv.includes('--strict');
const dossier = mkdtempSync(join(tmpdir(), 'fillsell-controle-listes-'));
function lireProd(nom, sql) {
  const f = join(dossier, `${nom}.sql`);
  writeFileSync(f, sql);
  const r = spawnSync(`npx supabase db query --linked --read-only -f "${f}" -o json`, { cwd: RACINE, encoding: 'utf8', shell: true, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`lecture ${nom} impossible : ${(r.stderr || '').slice(-400)}`);
  return JSON.parse(r.stdout).rows;
}

const grillesLbc = lireProd('lbc', `
  SELECT category_key AS categorie, field_key AS champ, COALESCE(contexte->>'clothing_type', '-') AS univers,
         count(*)::int AS n, max(releve_at) AS le, (array_agg(options ORDER BY releve_at DESC))[1] AS options
    FROM public.lbc_grilles_relevees
   WHERE releve_at > now() - interval '30 days'
   GROUP BY 1, 2, 3, md5(options::text);`);
const catalogue = lireProd('catalogue', `
  SELECT platform, field_key, allowed_values FROM public.platform_category_aspects
   WHERE platform IN ('vinted','beebs','leboncoin') AND field_key IN ('size','Taille','Pointure','baby_age','clothing_st','shoe_size')
     AND jsonb_typeof(allowed_values) = 'array';`);

let ecarts = 0;
// ── 1. Grilles Leboncoin par univers ─────────────────────────────────────────
const lectures = grillesLbc.filter((g) => g.categorie === CLE_VETEMENTS_LBC && g.champ === CHAMP_TAILLE_VETEMENTS_LBC)
  .map((g) => ({ univers: g.univers, options: g.options, le: g.le }));
const e1 = ecartsGrillesParUnivers({ figees: GRILLES_LBC_TAILLE_VETEMENTS, releves: lectures });
console.log(`1. Leboncoin « ${CLE_VETEMENTS_LBC} › Taille » par univers (${lectures.length} grilles lues en 30 j) :`);
if (!e1.length) console.log('   ✓ identiques aux dernières lectures (Femme, Homme, Enfant)');
for (const e of e1) {
  ecarts++;
  console.log(`   ✗ ${e.univers}${e.sansReleve ? ' : aucune lecture en 30 j' : ` (lu le ${e.releveLe})`}`
    + (e.manquantes.length ? ` — chez Leboncoin, pas chez nous : ${e.manquantes.join(' · ')}` : '')
    + (e.enTrop.length ? ` — chez nous, plus chez Leboncoin : ${e.enTrop.join(' · ')}` : '') + (e.ordre ? ' — ordre différent' : ''));
}

// ── 2. Libellés enfant (childSizes) ─────────────────────────────────────────
const relevees = { vinted: new Set(), beebs: new Set(), leboncoin: new Set() };
for (const l of catalogue) for (const v of l.allowed_values ?? []) relevees[l.platform]?.add(typeof v === 'string' ? v : (v?.label ?? v?.value ?? ''));
for (const g of grillesLbc) if (['baby_age', 'clothing_st', 'shoe_size'].includes(g.champ)) for (const v of g.options ?? []) relevees.leboncoin.add(typeof v === 'string' ? v : (v?.label ?? v?.value ?? ''));
console.log('2. Libellés enfant écrits par FillSell (src/utils/childSizes.js) :');
for (const [pf, colonne] of [['vinted', 'vinted'], ['leboncoin', 'lbc'], ['beebs', 'beebs']]) {
  const libelles = [...CHILD_MONTH_SIZES, ...CHILD_YEAR_SIZES].map((e) => e[colonne]).filter(Boolean);
  const absents = libellesAbsents({ libelles, valeursRelevees: relevees[pf] });
  if (!absents.length) { console.log(`   ✓ ${pf} : les ${libelles.length} libellés existent chez elle`); continue; }
  ecarts += absents.length;
  console.log(`   ✗ ${pf} : ${absents.length} libellé(s) qu'aucune liste relevée ne porte : ${absents.join(' · ')}`);
}

// ── 3. Listes Leboncoin dépendantes d'un autre champ ───────────────────────────
const dependantes = champsAListesDependantes(grillesLbc, { min: 2 });
console.log(`3. Champs Leboncoin à listes DÉPENDANTES (plusieurs grilles pour un même rayon, champ, univers) : ${dependantes.length}`);
for (const d of dependantes) console.log(`   · ${d.categorie} › ${d.champ}${d.univers !== '-' ? ` (${d.univers})` : ''} : ${d.grilles} grilles (${d.tailles.join(', ')} options)`);

console.log(ecarts ? `\n${ecarts} écart(s) sur nos listes figées.` : '\nAucun écart sur nos listes figées.');
if (STRICT && ecarts) process.exit(1);
