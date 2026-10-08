// ═══════════════════════════════════════════════════════════════════════════
// REMISE EN LIGNE VINTED — rejeu à blanc et rattrapage (08/10/2026 soir, Bebertdeals)
// ═══════════════════════════════════════════════════════════════════════════
// Le moteur (_shared/rapprochement/remises-en-ligne.js) sur les données de prod.
// Lecture seule par défaut : rien n'est écrit.
//   node scripts/reparations/20261008_remises_en_ligne_vinted.mjs --user <uuid>            (simulation, portée « toutes »)
//   node scripts/reparations/20261008_remises_en_ligne_vinted.mjs --user <uuid> --portee nouvelles
//   node scripts/reparations/20261008_remises_en_ligne_vinted.mjs --parc [--max 40]         (simulation, comptes candidats)
//   node scripts/reparations/20261008_remises_en_ligne_vinted.mjs --user <uuid> --appliquer (APRÈS la migration
//        20261008160000 ET le feu vert nommé de Nico : sauvegarde, puis rapprochement_v3_appliquer, gardes de la base)
// Le détail de chaque décision (titres, identifiants, preuves) part dans
// build/remises-en-ligne/<user>.json (ignoré par git : données personnelles).
// Avant la migration, la lecture complète les champs Vinted des fiches par une
// requête à part (même valeurs que rapprochement_v3_lire après la migration).
// Inverse d'un --appliquer : inventaire_defusionner(fusion) pour chaque fusion
// journalisée (par = 'utilisateur:photo_rapprochement_v3_remise'), puis
// 20261008_remises_en_ligne_vinted_INVERSE.sql (jobs Vinted rouverts).
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { urlsDe, passe } from '../../supabase/functions/_shared/rapprochement/passe.js';
import { etatVinted } from '../../supabase/functions/_shared/rapprochement/remises-en-ligne.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const USER = val('--user');
const PARC = args.includes('--parc');
const PORTEE = val('--portee') === 'nouvelles' ? 'nouvelles' : 'toutes';
const APPLIQUER = args.includes('--appliquer');
const MAX = Number(val('--max')) || 40;
if (!PARC && (!USER || !/^[0-9a-f-]{36}$/.test(USER))) { console.error('--user <uuid> ou --parc'); process.exit(1); }

function q(sql) {
  const f = path.join(os.tmpdir(), `rel-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(f, sql);
  try {
    const out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
    const i = out.indexOf('{'); return i >= 0 ? JSON.parse(out.slice(i)).rows : [];
  } catch (e) { const t = String(e.stdout || '') + String(e.stderr || e.message); const i = t.indexOf('ERROR'); throw new Error(i >= 0 ? t.slice(i, i + 1500) : t.slice(0, 2000)); }
  finally { fs.rmSync(f, { force: true }); }
}

/** La lecture de la passe, complétée des champs Vinted (identiques à la lecture d'après la migration). */
function lire(user) {
  const donnees = q(`SELECT public.rapprochement_v3_lire('${user}'::uuid) d;`)[0].d;
  const extra = q(`SELECT jsonb_build_object(
      'fiches', COALESCE((SELECT jsonb_object_agg(i.id::text, jsonb_build_object('vinted_status', i.vinted_status, 'disparu_le', i.disparu_le,
                  'last_synced_at', i.last_synced_at, 'first_seen_at', i.first_seen_at, 'vinted_account_id', i.vinted_account_id))
                FROM inventaire i WHERE i.user_id = '${user}' AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')), '{}'::jsonb),
      'releves', COALESCE((SELECT jsonb_object_agg(x.acc, x.le) FROM (
                  SELECT COALESCE(r.vinted_user_id, '') acc, max(r.started_at) le FROM vinted_sync_runs r
                   WHERE r.user_id = '${user}' AND r.kind = 'dressing' AND r.status = 'done' AND r.items_vus > 0
                     AND r.items_vus >= COALESCE(r.total_entries, r.items_vus) GROUP BY 1) x), '{}'::jsonb),
      'nouvelles', COALESCE((SELECT jsonb_agg(i.id::text) FROM inventaire i WHERE i.user_id = '${user}' AND i.origine = 'vinted_sync'
                  AND i.fusionne_dans IS NULL AND i.statut = 'stock' AND i.created_at > public.rapprochement_v3_vinted_depuis('${user}'::uuid)), '[]'::jsonb)) e;`)[0].e;
  for (const f of donnees.fiches) Object.assign(f, extra.fiches[f.id] ?? {});
  donnees.vinted_releves_complets ??= extra.releves;
  donnees.vinted_nouvelles ??= extra.nouvelles;
  return donnees;
}

function empreintesDe(donnees) {
  const urls = urlsDe(donnees);
  const emp = new Map(); const illisibles = new Set();
  for (let i = 0; i < urls.length; i += 400) {
    const lot = urls.slice(i, i + 400);
    const r = q(`SELECT public.rapprochement_v3_empreintes((SELECT array_agg(x) FROM jsonb_array_elements_text('${JSON.stringify(lot).replace(/'/g, "''")}'::jsonb) x)) r;`)[0].r;
    for (const e of r.empreintes ?? []) if (e.variantes) emp.set(e.url, e);
    for (const u of r.illisibles ?? []) illisibles.add(u);
  }
  return { emp, urls, manquantes: urls.filter((u) => !emp.has(u) && !illisibles.has(u)) };
}

function simuler(user) {
  const t0 = Date.now();
  const donnees = lire(user);
  const { emp, urls, manquantes } = empreintesDe(donnees);
  const avant = passe({ ...donnees, remise_en_ligne_actif: false }, emp, { mode: 'normal' });
  const apres = passe({ ...donnees, remise_en_ligne_actif: true }, emp, { mode: 'normal', remises: PORTEE });
  const regle = apres.decisions.filter((d) => d.type.startsWith('remise_en_ligne'));
  const autres = apres.decisions.filter((d) => !d.type.startsWith('remise_en_ligne'));
  const memeAutres = JSON.stringify(autres) === JSON.stringify(avant.decisions);
  const F = new Map(donnees.fiches.map((f) => [String(f.id), f]));
  const lisible = (d) => ({ ...d, titre_garde: F.get(String(d.garde))?.titre, titre_absorbe: F.get(String(d.absorbe))?.titre,
    vinted_garde: F.get(String(d.garde))?.vinted_item_id, vinted_absorbe: F.get(String(d.absorbe))?.vinted_item_id,
    chaine_titres: (d.chaine ?? []).map((id) => F.get(String(id))?.titre) });
  const dir = path.join(RACINE, 'build', 'remises-en-ligne'); fs.mkdirSync(dir, { recursive: true });
  const pris = new Set(regle.flatMap((d) => [String(d.garde), String(d.absorbe), ...(d.chaine ?? []).map(String)]));
  const nouv = new Set((donnees.vinted_nouvelles ?? []).map(String));
  const sansDecision = donnees.fiches.filter((f) => etatVinted(f, donnees.vinted_releves_complets) === 'en_ligne' && (PORTEE === 'toutes' || nouv.has(String(f.id))) && !pris.has(String(f.id)))
    .map((f) => ({ id: f.id, titre: f.titre, vu1: f.first_seen_at }));
  fs.writeFileSync(path.join(dir, `${user}.json`), JSON.stringify({ user, portee: PORTEE, bilan: apres.bilan.remises_en_ligne, decisions: regle.map(lisible), sans_decision: sansDecision }, null, 1));
  return { user, ms: Date.now() - t0, fiches: donnees.fiches.length, photos: urls.length, sans_empreinte: manquantes.length,
    bilan: apres.bilan.remises_en_ligne, plan: apres.bilan.plan, autres_decisions_identiques: memeAutres, decisions: regle, donnees };
}

if (PARC) {
  // les comptes où une fiche Vinted en stock a quitté le dressing pendant qu'une autre fiche Vinted y est apparue
  const comptes = q(`SELECT i.user_id::text u, count(*) n FROM inventaire i
     WHERE i.fusionne_dans IS NULL AND i.statut = 'stock' AND i.vinted_item_id IS NOT NULL AND i.disparu_le IS NOT NULL
       AND EXISTS (SELECT 1 FROM inventaire n WHERE n.user_id = i.user_id AND n.fusionne_dans IS NULL AND n.vinted_item_id IS NOT NULL
                    AND n.statut = 'stock' AND n.vinted_status = 'active' AND n.disparu_le IS NULL AND n.created_at > i.last_synced_at)
     GROUP BY 1 ORDER BY 2 DESC LIMIT ${MAX};`);
  const tot = { comptes: 0, fusions: 0, maillons: 0, a_verifier: 0, juges: 0, ecarts: 0 };
  for (const { u } of comptes) {
    try {
      const r = simuler(u);
      tot.comptes++; tot.fusions += r.bilan?.fusions ?? 0; tot.maillons += r.bilan?.maillons ?? 0; tot.a_verifier += r.bilan?.a_verifier ?? 0; tot.juges += r.bilan?.juges ?? 0;
      if (!r.autres_decisions_identiques) tot.ecarts++;
      console.log(`${u.slice(0, 8)} fiches=${r.fiches} sans_empreinte=${r.sans_empreinte} remises=${JSON.stringify(r.bilan)} autres_identiques=${r.autres_decisions_identiques} ${r.ms}ms`);
    } catch (e) { console.log(`${u.slice(0, 8)} ERREUR ${String(e.message).slice(0, 200)}`); }
  }
  console.log('TOTAL', JSON.stringify(tot));
  process.exit(0);
}

const r = simuler(USER);
console.log(`lecture+passe ${r.ms} ms : ${r.fiches} fiches, ${r.photos} photos, ${r.sans_empreinte} sans empreinte`);
console.log('règle :', JSON.stringify(r.bilan));
console.log('décisions des autres règles identiques avec et sans la règle :', r.autres_decisions_identiques);
if (!APPLIQUER) { console.log(`simulation seulement — détail : build/remises-en-ligne/${USER}.json`); process.exit(0); }

// ── --appliquer : seulement après la migration 20261008160000 ET le feu vert nommé de Nico ──
const pret = q(`SELECT to_regprocedure('public.rapprochement_v3_remise_possible(uuid,bigint,bigint)') IS NOT NULL ok;`)[0].ok;
if (!pret) { console.error('ARRÊT : migration 20261008160000 non appliquée (rapprochement_v3_remise_possible absente)'); process.exit(3); }
q(fs.readFileSync(path.join(RACINE, 'scripts', 'reparations', '20261008_remises_en_ligne_vinted_sauvegarde.sql'), 'utf8').replace(/__USER__/g, USER));
const faits = {}, sautes = {}; let erreurs = [];
for (let i = 0; i < r.decisions.length; i += 100) {
  const lot = r.decisions.slice(i, i + 100);
  const x = q(`SELECT public.rapprochement_v3_appliquer('${USER}'::uuid, '${JSON.stringify(lot).replace(/'/g, "''")}'::jsonb, 'normal', true) r;`)[0].r;
  if (x?.reason === 'occupe') { erreurs.push({ lot: i, erreur: 'occupe' }); break; }
  for (const [k, v] of Object.entries(x?.faits ?? {})) faits[k] = (faits[k] ?? 0) + v;
  for (const [k, v] of Object.entries(x?.sautes ?? {})) sautes[k] = (sautes[k] ?? 0) + v;
  erreurs = erreurs.concat(x?.erreurs ?? []);
}
console.log('faits', JSON.stringify(faits), 'sautés', JSON.stringify(sautes), 'erreurs', erreurs.length, JSON.stringify(erreurs.slice(0, 5)));
