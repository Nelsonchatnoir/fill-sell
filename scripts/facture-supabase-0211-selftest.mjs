// ═══════════════════════════════════════════════════════════════════════════
// FACTURE SUPABASE DU 02/11 — SELFTEST (transformations, egress de l'app, lectures en boucle, journaux)
// ═══════════════════════════════════════════════════════════════════════════
// Cycle 02/10 → 01/11 : 59 261 images transformées (100 incluses), 303,8 Go d'egress (250 inclus), lectures en
// boucle (cross_post_jobs ~708 000 par jour, profiles ~272 000, coin_config ~170 000, vinted_sync_runs ~163 000).
// Mesure et correctifs : docs/enquetes/facture-supabase-0211/RAPPORT.md. Ce test fige chaque règle :
//   1. aucune transformation du Storage (render/image) hors du repli borné de lens-analysis (photo > 6 000 px) ;
//   2. coin_config lu une fois par minute et par instance (_shared/coin-config-cache.js), mêmes formes de réponse ;
//   3. get-pending-jobs : neuf balayages « arrêtés » derrière une lecture de présence, trois demandes en file lues
//      en une fois, palier et beta_flags lus une fois par poll, plus de ligne de journal pour un poll vide ;
//   4. l'app : la sonde des jobs ignore last_checked_at et relance la vue complète du Stock (30 min sinon).
//
//   npm run selftest:facture-supabase-0211
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

// ── 1. Zéro transformation ─────────────────────────────────────────────────
console.log('1. Aucune transformation du Storage');
const fichiers = [];
const parcourir = (dir) => {
  for (const e of fs.readdirSync(path.join(racine, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== 'node_modules') parcourir(rel); }
    else if (/\.(ts|js|jsx|mjs)$/.test(e.name)) fichiers.push(rel);
  }
};
for (const d of ['supabase/functions', 'src', 'chrome-extension']) parcourir(d);
const avecRender = fichiers.filter((f) => /storage\/v1\/render\/image/.test(lire(f).split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')));
ok(avecRender.length === 1 && avecRender[0] === 'supabase/functions/lens-analysis/images.ts',
  `render/image n'est construit que par le repli de lens-analysis (trouvé : ${avecRender.join(', ') || 'aucun'})`);
const lens = lire('supabase/functions/lens-analysis/images.ts');
ok(/export const COTE_DECLENCHEMENT = 6000;/.test(lens), 'lens-analysis : repli réservé aux photos de plus de 6 000 px');
const emp = lire('supabase/functions/_shared/empreinte-telechargement.ts');
const corpsEmp = emp.slice(emp.indexOf('export async function empreinterUrl('));
ok(!/urlTransformee\(/.test(corpsEmp) && /const essais = \[urlAllegee\(url\), url\];/.test(corpsEmp), 'empreinterUrl : la photo originale, jamais urlTransformee');
const pe = lire('supabase/functions/photo-empreinte/index.ts');
ok(!/urlTransformee/.test(pe) && /decoderEmpreinte\(await telecharger\(url\)\)/.test(pe), 'photo-empreinte : second essai sur l\'originale décodée ici');
const ria = lire('supabase/functions/rapprochement-ia/index.ts');
ok(!/renduStorage|ia-miniatures\/\$\{|\.upload\(/.test(ria), 'rapprochement-ia : ni rendu du Storage ni copie dans ia-miniatures/');
ok(/return \{ type: "base64", media_type: type, data: enBase64\(octets\) \};/.test(ria), 'rapprochement-ia : photo hors Storage envoyée en base64 (bornée)');

// ── 2. coin_config en cache ────────────────────────────────────────────────
console.log('2. coin_config lu une fois par minute');
const cc = await import(pathToFileURL(path.join(racine, 'supabase/functions/_shared/coin-config-cache.js')).href);
let lectures = 0;
let panne = false;
const table = [{ key: 'keepalive_actif', value: 0 }, { key: 'vinted_pays_be', value: 1 }, { key: 'vinted_pays_es', value: 0 }, { key: 'lecture_fond_mode', value: 1 }];
const client = { from: (t) => ({ select: async (cols) => { lectures++; if (t !== 'coin_config' || cols !== 'key, value') throw new Error('requête inattendue'); return panne ? { data: null, error: { message: 'boom' } } : { data: table, error: null }; } }) };
cc.viderCoinConfig();
const [u1, u2, abs] = await Promise.all([cc.configUne(client, 'keepalive_actif'), cc.configUne(client, 'lecture_fond_mode'), cc.configUne(client, 'absente')]);
ok(lectures === 1, `trois lecteurs simultanés = une seule lecture (${lectures})`);
ok(u1.data?.value === 0 && u1.error === null && u2.data?.value === 1 && abs.data === null && abs.error === null, 'configUne : { data: {value} | null, error: null }, comme maybeSingle()');
const plus = await cc.configPlusieurs(client, ['lecture_fond_mode', 'absente', 'keepalive_actif']);
ok(JSON.stringify(plus.data) === JSON.stringify([{ key: 'lecture_fond_mode', value: 1 }, { key: 'keepalive_actif', value: 0 }]), 'configPlusieurs : les clés présentes, { key, value }');
const pref = await cc.configPrefixe(client, 'vinted_pays_');
ok(pref.data.length === 2 && pref.data.every((r) => r.key.startsWith('vinted_pays_')), 'configPrefixe : comme like("key", "vinted_pays_%")');
ok(lectures === 1, 'toujours une seule lecture dans la minute');
const t = await cc.tableCoinConfig(client, Date.now() + cc.COIN_CONFIG_TTL_MS + 1000);
ok(lectures === 2 && t.lignes.size === 4, 'au-delà de 60 s : relue');
panne = true;
const enPanne = await cc.tableCoinConfig(client, Date.now() + 3 * cc.COIN_CONFIG_TTL_MS);
ok(enPanne.lignes?.size === 4, 'lecture en erreur : la table connue est gardée');
cc.viderCoinConfig();
const sansTable = await cc.configUne(client, 'keepalive_actif');
ok(sansTable.data === null && sansTable.error?.message === 'boom', 'sans table connue : l\'erreur est rendue (le lecteur garde son repli)');
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
ok(!/from\("coin_config"\)/.test(gpj) && /from "\.\.\/_shared\/coin-config-cache\.js"/.test(gpj), 'get-pending-jobs : plus aucune lecture directe de coin_config');

// ── 3. get-pending-jobs ────────────────────────────────────────────────────
console.log('3. get-pending-jobs : ne relire que ce qui peut avoir changé');
const iGarde = gpj.indexOf('let aDesArretes = true;');
ok(iGarde > 0 && /\.in\("status", \["needs_user", "failed"\]\)\.limit\(1\);/.test(gpj.slice(iGarde, iGarde + 600)), 'une lecture de présence needs_user / failed');
ok(/if \(!eArrete && Array\.isArray\(unArrete\)\) aDesArretes = unArrete\.length > 0;/.test(gpj), 'illisible : aDesArretes reste vrai (balayage comme avant)');
const gardes = [...gpj.matchAll(/^    if \(!includeProcessing && !includeNeedsUser(?: && correctifsPortes\.length)? && aDesArretes\) \{$/gm)];
ok(gardes.length === 9, `neuf balayages gardés (${gardes.length})`);
for (const g of gardes) {
  const suite = gpj.slice(g.index, g.index + 900);
  if (!/\.eq\("status", "needs_user"\)|\.in\("status", \["needs_user", "failed"\]\)/.test(suite)) { ko++; console.log(`  ✗ un bloc gardé ne lit pas d'abord des arrêtés (${suite.slice(0, 80)})`); }
}
ok(gardes.every((g) => g.index > iGarde), 'la garde est posée avant les neuf blocs');
ok(gpj.includes("const { data: bloques } = !aDesArretes ? { data: [] as Array<Record<string, unknown>> } : await userClient"), "les republications Leboncoin bloquées : lues seulement s'il y a des arrêtés");
ok((gpj.match(/from\("vinted_sync_runs"\)\.select\("id, kind, platform, queued_at, declencheur"\)/g) ?? []).length === 1
  && (gpj.match(/await lireCommandesEnFile\(ttl\)\)\.filter\(\(c\) => c\.kind === "(dressing|annonces|connexion)"/g) ?? []).length === 3,
  'les demandes en file (dressing, annonces, connexion) : une lecture, trois lecteurs');
ok(!/\.eq\("kind", "connexion"\)\s*\n?\s*\.eq\("status", "queued"\)/.test(gpj) && !/\.eq\("kind", "dressing"\)\s*\n?\s*\.eq\("status", "queued"\)/.test(gpj), 'plus de lecture séparée des demandes en file');
ok((gpj.match(/lirePalierDuPoll\(\),/g) ?? []).length === 2 && !/userClient\.from\("profiles"\)\.select\("is_premium, is_pro, is_business, is_comped"\)\.eq\("id", user\.id\)\.maybeSingle\(\),/.test(gpj),
  'le palier du compte lu une fois pour les deux lectures de fond');
ok(/betaFlagsDuPoll = flagsP;/.test(gpj) && /betaFlagsDuPoll !== undefined/.test(gpj), 'beta_flags du compte repris de la délégation (keepalive)');
ok(/if \(out\.length > 0 \|\| ligneDistribution\.includes\(", "\)\) console\.log\(ligneDistribution\);/.test(gpj), 'un poll qui ne distribue ni ne retient rien ne s\'écrit plus au journal');
ok(!/keepalive_actif=0 → port de remplissage ÉTEINT pour ce poll/.test(gpj), 'plus de ligne « keepalive_actif=0 » à chaque poll');
ok(gpj.includes('if (reglageP.actif && !horsFenetre) {') && gpj.includes('Date.now() - inscritAuth > (joursP + 1) * 86_400_000'),
  'première synchro : le profil n\'est relu que pour un compte inscrit dans la fenêtre (+1 jour de marge)');

// ── 4. L'app ───────────────────────────────────────────────────────────────
console.log('4. L\'app : la sonde ne relit plus tout sur un horodatage');
const app = lire('src/App.jsx');
const iSonde = app.indexOf("const empreinteJobsRef=useRef(null);");
const sonde = app.slice(iSonde, iSonde + 2000);
ok(iSonde > 0 && !/last_checked_at/.test(sonde.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')), 'la sonde des jobs ne lit plus last_checked_at');
ok(/window\.dispatchEvent\(new Event\('fillsell:jobs-changes'\)\)/.test(sonde), 'un vrai changement relance la vue complète du Stock');
ok(/maintenant-derniereVisibiliteRef\.current<120_000/.test(app), 'retour d\'onglet : fetchAll au plus toutes les 2 min');
const stock = lire('src/tabs/StockTab.jsx');
ok(/const COMPLETE_MS = 30 \* 60_000;/.test(stock) && /const COMPLETE_RETOUR_MS = 10 \* 60_000;/.test(stock), 'Stock : vue complète toutes les 30 min (10 min au retour d\'onglet)');
ok(/window\.addEventListener\("fillsell:jobs-changes", onJobsChanges\);/.test(stock) && /window\.removeEventListener\("fillsell:jobs-changes", onJobsChanges\);/.test(stock), 'Stock : écoute (et lâche) l\'événement de la sonde');

console.log(ko ? `\n✗ ${ko} échec(s)` : '\n✓ tout est vert');
process.exit(ko ? 1 : 0);
