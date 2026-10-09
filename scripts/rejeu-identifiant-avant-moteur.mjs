// ═══════════════════════════════════════════════════════════════════════════
// REJEU — « l'identifiant d'un dépôt FillSell avant le moteur » (rapprochement
// v17, commit 70a1bfe) sur les VRAIES données de la prod (09/10).
// ═══════════════════════════════════════════════════════════════════════════
// Pour chaque compte : la lecture de la passe (rapprochement_v3_lire), lue en
// prod, et le moteur partagé (_shared/rapprochement/passe.js) qui tourne ICI,
// deux fois :
//   · AVANT : les données telles quelles (la passe v16) ;
//   · APRÈS : le rattachement par identifiant de la v17 rejoué mot pour mot
//     (même requête : annonce sans article, ni ignorée ni disparue, dont
//     l'identifiant est celui d'un dépôt publié du compte, même plateforme ;
//     compare-and-swap), DANS UNE TRANSACTION ANNULÉE, puis la même lecture.
// Attendu : les mêmes décisions, sauf pour les annonces rattachées à leur
// dépôt (plus aucune décision du moteur sur elles). Rien n'est écrit.
//   node scripts/rejeu-identifiant-avant-moteur.mjs <uuid> [<uuid>…] [--incident-depop-0910]
// --incident-depop-0910 : rejoue en plus le cas du 09/10 07:11 sur le compte de
// Nico (l'annonce Depop 946325187 remise orpheline dans la transaction, comme à
// l'instant du relevé), pour voir la décision de la v16 et celle de la v17.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { passe, urlsDe } from '../supabase/functions/_shared/rapprochement/passe.js';

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const args = process.argv.slice(2);
const comptes = args.filter((a) => /^[0-9a-f-]{36}$/.test(a));
const INCIDENT = args.includes('--incident-depop-0910');
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
if (INCIDENT && !comptes.includes(NICO)) comptes.push(NICO);
if (!comptes.length) { console.error('usage : node scripts/rejeu-identifiant-avant-moteur.mjs <uuid>… [--incident-depop-0910]'); process.exit(1); }

function q(sql) {
  const f = path.join(os.tmpdir(), `rejeu-id-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(f, sql);
  try {
    const out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
    const i = out.indexOf('{'); return i >= 0 ? JSON.parse(out.slice(i)).rows : [];
  } catch (e) { const t = String(e.stdout || '') + String(e.stderr || e.message); const i = t.indexOf('ERROR'); throw new Error(i >= 0 ? t.slice(i, i + 1500) : t.slice(0, 2000)); }
  finally { fs.rmSync(f, { force: true }); }
}

// L'annonce du 09/10 07:11, remise orpheline comme à l'instant du relevé.
const remiseIncident = (u) => (INCIDENT && u === NICO) ? `
  UPDATE annonces_plateforme SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL, proposition = NULL
   WHERE id = '851b11bc-6f06-4abf-aa54-f638d085901e' AND user_id = '${NICO}';` : '';

// Le rattachement de la v17, mot pour mot (rapprochement/index.ts, rattacherParIdentifiant).
const rattachementV17 = (u) => `
  CREATE TEMP TABLE _orph ON COMMIT DROP AS
    SELECT a.id, a.platform, a.listing_id FROM annonces_plateforme a
     WHERE a.user_id = '${u}' AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
       AND a.listing_id IS NOT NULL LIMIT 1000;
  CREATE TEMP TABLE _dep ON COMMIT DROP AS
    SELECT DISTINCT ON (j.platform, j.platform_listing_id) j.id, j.platform, j.platform_listing_id, j.inventaire_id
      FROM cross_post_jobs j
     WHERE j.user_id = '${u}' AND j.status = 'published' AND j.action IN ('publish', 'republish')
       AND j.inventaire_id IS NOT NULL AND j.platform_listing_id IN (SELECT DISTINCT listing_id FROM _orph)
     ORDER BY j.platform, j.platform_listing_id, j.published_at DESC NULLS LAST;
  CREATE TEMP TABLE _att ON COMMIT DROP AS
    WITH m AS (
      UPDATE annonces_plateforme a
         SET inventaire_id = d.inventaire_id, job_id = d.id, source_rapprochement = 'job', proposition = NULL, updated_at = now()
        FROM _orph o JOIN _dep d ON d.platform = o.platform AND d.platform_listing_id = o.listing_id
       WHERE a.id = o.id AND a.inventaire_id IS NULL
      RETURNING a.id, a.platform, a.listing_id, d.id AS job, d.inventaire_id AS fiche)
    SELECT * FROM m;`;

const lire = (u, avecV17) => q(`BEGIN;${remiseIncident(u)}${avecV17 ? rattachementV17(u) : 'CREATE TEMP TABLE _att ON COMMIT DROP AS SELECT NULL::uuid id, NULL::text platform, NULL::text listing_id, NULL::uuid job, NULL::bigint fiche WHERE false;'}
  SELECT public.rapprochement_v3_lire('${u}'::uuid) AS d,
         (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM _att t) AS rattachees;
  ROLLBACK;`)[0];

const empreintes = (urls) => {
  const emp = new Map();
  for (let i = 0; i < urls.length; i += 400) {
    const lot = urls.slice(i, i + 400);
    const r = q(`SELECT public.rapprochement_v3_empreintes((SELECT array_agg(x) FROM jsonb_array_elements_text('${JSON.stringify(lot).replace(/'/g, "''")}'::jsonb) x)) r;`)[0].r;
    for (const e of r.empreintes ?? []) if (e.variantes) emp.set(e.url, e);
  }
  return emp;
};

// Une décision, lisible et comparable (les champs de temps et d'ordre écartés).
const cle = (d) => JSON.stringify(d, (k, v) => (k === 'le' || k === 'depuis' ? undefined : v));
const annoncesDe = (d) => [d.annonce, ...(d.annonces ?? []), d.a?.id, d.b?.id].filter(Boolean).map(String);

const bilanGlobal = [];
for (const u of comptes) {
  const t0 = Date.now();
  const av = lire(u, false);
  const ap = lire(u, true);
  const urls = [...new Set([...urlsDe(av.d), ...urlsDe(ap.d)])];
  const emp = empreintes(urls);
  const decAv = passe(av.d, emp, { mode: 'normal' }).decisions;
  const decAv2 = passe(av.d, emp, { mode: 'normal' }).decisions; // le moteur est-il déterministe ?
  const decAp = passe(ap.d, emp, { mode: 'normal' }).decisions;
  const rattachees = new Set((ap.rattachees ?? []).map((r) => String(r.id)));
  const ksAv = decAv.map(cle), ksAp = decAp.map(cle);
  const multi = (ks) => ks.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map());
  const mAv = multi(ksAv), mAp = multi(ksAp);
  const seulementAvant = decAv.filter((d, i) => { const k = ksAv[i]; if ((mAp.get(k) ?? 0) > 0) { mAp.set(k, mAp.get(k) - 1); return false; } return true; });
  const mAv2 = multi(ksAv);
  const seulementApres = decAp.filter((d, i) => { const k = ksAp[i]; if ((mAv2.get(k) ?? 0) > 0) { mAv2.set(k, mAv2.get(k) - 1); return false; } return true; });
  // Une différence est attendue SEULEMENT si elle porte sur une annonce rattachée par identifiant.
  const inattendues = [...seulementAvant, ...seulementApres].filter((d) => !annoncesDe(d).some((a) => rattachees.has(a)));
  const r = {
    compte: u.slice(0, 8),
    fiches: (av.d.fiches ?? []).length, annonces: (av.d.annonces ?? []).length, photos: urls.length, sans_empreinte: urls.filter((x) => !emp.has(x)).length,
    decisions_avant: decAv.length, decisions_apres: decAp.length,
    deterministe: JSON.stringify(ksAv) === JSON.stringify(decAv2.map(cle)),
    rattachees_par_identifiant: [...(ap.rattachees ?? [])].map((r) => `${r.platform}/${r.listing_id} → fiche ${r.fiche} (job ${String(r.job).slice(0, 8)})`),
    seulement_avant: seulementAvant.map((d) => ({ type: d.type, annonces: annoncesDe(d), motif: d.motif })),
    seulement_apres: seulementApres.map((d) => ({ type: d.type, annonces: annoncesDe(d), motif: d.motif })),
    differences_inattendues: inattendues.length,
    ms: Date.now() - t0,
  };
  bilanGlobal.push(r);
  console.log(JSON.stringify(r));
}
const ko = bilanGlobal.filter((r) => r.differences_inattendues > 0 || !r.deterministe);
console.log(ko.length ? `❌ ${ko.length} compte(s) avec une différence inattendue` : `✅ ${bilanGlobal.length} compte(s) : mêmes décisions, sauf les annonces rattachées à leur dépôt`);
process.exit(ko.length ? 1 : 0);
