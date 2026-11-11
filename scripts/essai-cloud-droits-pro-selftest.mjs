// VERROU (11/11/2026, offres Cloud, décision 1 de Nico) : « un essai du Cloud seul en cours sur un compte gratuit = droits
// Pro jusqu'à la fin de l'essai » — une RÈGLE (palier_de en SQL, palierDesDroits en JS), jamais un drapeau posé à la main.
// Rouge avant (ni la règle JS, ni la migration, ni l'inverse), vert après. Sans réseau ni base : le comportement SQL est
// prouvé sur une base JETABLE par scripts/essais/20261111230000_banc.mjs (56/56 le 11/11 vers 23:05).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.SELFTEST_RACINE ? resolve(process.env.SELFTEST_RACINE) : join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const existe = (p) => existsSync(join(ROOT, p));
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 400)}`}`); } };

const MIG = 'supabase/migrations/20261111230000_essai_cloud_seul_droits_pro.sql';
const INV = 'supabase/rollbacks/20261111230000_essai_cloud_seul_droits_pro_INVERSE.sql';
const FX = 'scripts/essais/fixtures/prod-1111-palier-essai-cloud/catalogue.json';
const QUATRE = ['palier_de', 'quotas_etat', 'spend_coins_for_generate', 'spend_coins_for_lens'];

console.log('1. La règle en JS (palierDesDroits, _shared/palier.js)');
const P = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/palier.js')).href);
ok(typeof P.palierDesDroits === 'function' && typeof P.essaiCloudSeulEnCours === 'function', 'palierDesDroits et essaiCloudSeulEnCours exportées');
if (typeof P.palierDesDroits === 'function') {
  const now = Date.parse('2026-11-12T10:00:00Z'), j = 86_400_000;
  const t = (ms) => new Date(now + ms).toISOString();
  const essai = { cloud_canal: 'stripe', cloud_essai_debut: t(-3 * j), cloud_essai_fin: t(4 * j) };
  const cas = [
    ['Free en essai du Cloud seul (Stripe)', essai, 'pro'],
    ['Free en essai Apple (is_cloud faux pendant l\'essai)', { ...essai, cloud_canal: 'apple', is_cloud: false }, 'pro'],
    ['essai fini', { ...essai, cloud_essai_fin: t(-1) }, 'gratuit'],
    ['essai arrêté', { ...essai, cloud_essai_arrete: true }, 'gratuit'],
    ['Cloud seul payé (quotas Free, décision 2)', { ...essai, is_cloud: true }, 'gratuit'],
    ['Premium en essai : garde Premium', { ...essai, is_premium: true }, 'premium'],
    ['Business en essai : garde Business', { ...essai, is_business: true, is_pro: true, is_premium: true }, 'business'],
    ['Cloud offert (7 jours offerts) : jamais la règle', { ...essai, cloud_canal: 'offert' }, 'gratuit'],
    ['essai pas encore commencé', { ...essai, cloud_essai_debut: t(j), cloud_essai_fin: t(8 * j) }, 'gratuit'],
    ['Free sans Cloud', {}, 'gratuit'],
    ['profil absent', null, 'gratuit'],
  ];
  for (const [quoi, p, attendu] of cas) ok(P.palierDesDroits(p, now) === attendu, `${quoi} → ${attendu}`, P.palierDesDroits(p, now));
  ok(P.palierDuProfil(essai) === 'gratuit', 'palierDuProfil (le palier PAYÉ, les drapeaux) ne change pas : gratuit pendant l\'essai');
  ok(P.palierDesDroits(essai, Date.parse(essai.cloud_essai_fin)) === 'gratuit', 'à l\'instant de la fin de l\'essai : gratuit (fin exclue, comme cloud_etat)');
}

console.log('2. La migration (palier_de + les trois fonctions qui recalculaient le palier en ligne)');
ok(existe(MIG), MIG);
ok(existe(INV), INV);
ok(existe(FX), FX);
if (existe(MIG) && existe(INV) && existe(FX)) {
  const mig = lire(MIG), inv = lire(INV), fx = JSON.parse(lire(FX));
  const blocs = (txt) => Object.fromEntries(txt.split(/(?=CREATE OR REPLACE FUNCTION public\.)/).filter((b) => b.startsWith('CREATE OR REPLACE'))
    .map((b) => [/FUNCTION public\.([a-z_]+)\(/.exec(b)[1], b.replace(/\$function\$;\n[\s\S]*$/, '$function$\n')]));
  const M = blocs(mig), I = blocs(inv);
  ok(JSON.stringify(Object.keys(M).sort()) === JSON.stringify([...QUATRE].sort()), 'la migration réécrit exactement les quatre fonctions', Object.keys(M));
  ok(JSON.stringify(Object.keys(I).sort()) === JSON.stringify([...QUATRE].sort()), 'l\'inverse remet exactement les quatre fonctions', Object.keys(I));
  // L'inverse = la prod à l'octet (md5 de pg_get_functiondef lu le 11/11 vers 22:53).
  for (const f of QUATRE) {
    const prod = fx.fonctions.find((x) => x.nom === f);
    const md5 = I[f] ? createHash('md5').update(I[f]).digest('hex') : null;
    ok(prod && md5 === prod.md5_prod, `inverse ${f} : md5 = prod (${prod?.md5_prod})`, md5);
    ok(prod && I[f] === prod.def, `inverse ${f} : texte = définition de prod de la fixture`);
  }
  // La migration ne change que les lignes marquées.
  const permises = new Set([
    "    WHEN p.is_cloud IS NOT TRUE AND p.cloud_essai_arrete IS NOT TRUE AND p.cloud_canal IS DISTINCT FROM 'offert'",
    '         AND p.cloud_essai_debut IS NOT NULL AND p.cloud_essai_fin IS NOT NULL',
    "         AND p.cloud_essai_debut <= now() AND now() < p.cloud_essai_fin THEN 'pro'",
    '  v_tier := palier_de(v_user);',
    '    v_quota := jauge_annonces_plafond(p_user_id, palier_de(p_user_id));',
    '  v_quota := jauge_annonces_plafond(p_user_id, palier_de(p_user_id));',
    '  v_ql := jauge_lens_plafond(palier_de(p_user_id));',
  ]);
  for (const f of QUATRE) {
    if (!M[f] || !I[f]) continue;
    const avant = new Set(I[f].split('\n'));
    const neuves = M[f].split('\n').filter((l) => !avant.has(l));
    const horsListe = neuves.filter((l) => !permises.has(l) && !/^\s*--/.test(l));
    ok(horsListe.length === 0, `${f} : seules les lignes de la règle changent (${neuves.length} ligne(s) neuve(s), commentaires compris)`, horsListe);
  }
  ok(/WHEN p\.is_premium IS TRUE OR p\.is_comped IS TRUE THEN 'premium'\n(?:\s*--[^\n]*\n)*\s*WHEN p\.is_cloud IS NOT TRUE/.test(M.palier_de ?? ''),
    'palier_de : la règle vient APRÈS Premium (un compte payant garde son palier ; seul un « free » devient « pro »)');
  ok(!/SELECT CASE\s+WHEN p\.is_business/.test(M.quotas_etat ?? 'SELECT CASE WHEN p.is_business') && /v_tier := palier_de\(v_user\);/.test(M.quotas_etat ?? ''),
    'quotas_etat : le palier des quotas = palier_de');
  for (const f of ['spend_coins_for_generate', 'spend_coins_for_lens']) {
    const d = M[f] ?? '';
    ok(/SELECT CASE\s+WHEN p\.is_business = true THEN 'business'/.test(d) && /upgrade_monthly_grant\(p_user_id, v_tier, null, 'lazy'\)/.test(d),
      `${f} : le crédit paresseux garde le palier des DRAPEAUX (aucun crédit pendant un essai)`);
    ok(!/jauge_annonces_plafond\(p_user_id, v_tier\)/.test(d) && !/jauge_lens_plafond\(v_tier\)/.test(d), `${f} : les quotas suivent palier_de`);
  }
  ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(mig + inv + JSON.stringify(fx)), 'aucune adresse e-mail dans la migration, l\'inverse ni la fixture');
}

console.log('3. Ce que la session principale joue (sauvegarde, preuve, banc)');
for (const p of ['scripts/reparations/20261111_essai_cloud_droits_pro_SAUVEGARDE.sql', 'scripts/reparations/20261111_essai_cloud_droits_pro_PREUVE.sql',
  'scripts/essais/20261111230000_banc.mjs']) ok(existe(p), p);
if (existe('scripts/reparations/20261111_essai_cloud_droits_pro_SAUVEGARDE.sql') && existe(FX)) {
  const s = lire('scripts/reparations/20261111_essai_cloud_droits_pro_SAUVEGARDE.sql'), fx = JSON.parse(lire(FX));
  ok(QUATRE.every((f) => s.includes(`${f}=${fx.fonctions.find((x) => x.nom === f).md5_prod}`)), 'la sauvegarde refuse d\'écrire si une des quatre fonctions a changé en prod (md5 de la fixture)');
  ok(/ENABLE ROW LEVEL SECURITY/.test(s) && /REVOKE ALL ON public\._backup_1111_essai_cloud_droits_pro_comptes FROM PUBLIC, anon, authenticated/.test(s), 'tables de sauvegarde fermées (RLS, droits retirés)');
}

console.log(`\n${n - ko}/${n} vérifications${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
process.exit(ko ? 1 : 0);
