// ═══════════════════════════════════════════════════════════════════════════
// FACTURE SUPABASE DU 02/11 — SELFTEST (ce qui reste du lot B après la consigne « zéro régression »)
// ═══════════════════════════════════════════════════════════════════════════
// Rapport : docs/enquetes/facture-supabase-0211/RAPPORT.md. Le 02/11 après-midi, Nico : « zéro régression, sans
// exception — tout point non prouvable revient à l'ancien comportement ». Ce test fige :
//   1. les retours à l'identique : empreintes calculées sur la version réduite (les empreintes sur l'originale
//      différaient de 1 à 4 bits sur un échantillon de 60 photos), IA, vignettes sans miniature, cache d'origine,
//      lectures directes de coin_config (le cache de 60 s n'était pas exact après un changement de réglage) ;
//   2. ce qui reste de get-pending-jobs, chaque point prouvé identique (rapport) : lecture de présence avant les
//      balayages « arrêtés », demandes en file lues une fois (relues après une remise en file), palier et
//      beta_flags lus une fois, profil de première synchro seulement pour un compte récent, journal d'un poll vide ;
//   3. l'app : comportement d'avant + la vue complète du Stock relancée tout de suite sur un changement réel.
//
//   npm run selftest:facture-supabase-0211
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
const git = (ref, f) => execFileSync('git', ['show', `${ref}:${f}`], { cwd: racine, encoding: 'utf8' }).replace(/\r\n/g, '\n');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

// ── 1. Retours à l'identique ───────────────────────────────────────────────
console.log("1. Photos, empreintes, coin_config : le comportement d'avant le lot B");
for (const f of [
  'supabase/functions/_shared/empreinte-telechargement.ts',
  'supabase/functions/photo-empreinte/index.ts',
  'supabase/functions/rapprochement-ia/index.ts',
  'src/components/GalleryPhoto.jsx',
  'src/utils/photosUpload.js',
]) {
  ok(lire(f) === git('9135d4d', f), `${f} : identique à l'avant-lot-B`);
}
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');

// ── 1 bis. Le signal du compte (migration 20261102160000) ─────────────────
console.log('1 bis. Le signal « rien n\'a changé pour ce compte » : exact, sinon tout se lit comme avant');
const migration = lire('supabase/migrations/20261102160000_signal_compte.sql');
ok(migration.includes('LOCK TABLE public.cross_post_jobs IN SHARE ROW EXCLUSIVE MODE;') && migration.indexOf('CREATE TRIGGER cross_post_jobs_compte_signal') > migration.indexOf('LOCK TABLE'),
  'compteurs exacts : déclencheur posé et compteurs comptés sous verrou, dans la même transaction');
ok(migration.includes("UPDATE public.compte_signal SET jobs = NULL"), "un déclencheur qui échoue ne bloque jamais l'écriture du job : compteurs mis à inconnu");
ok(fs.existsSync(path.join(racine, 'supabase/rollbacks/20261102160000_signal_compte_INVERSE.sql')), 'inverse présent');
const cc = await import(pathToFileURL(path.join(racine, 'supabase/functions/_shared/coin-config-cache.js')).href);
let lectures = 0;
const table = [{ key: 'keepalive_actif', value: 0 }, { key: 'vinted_pays_be', value: 1 }, { key: 'vintedXpaysYfr', value: 1 }, { key: 'lecture_fond_mode', value: 1 }];
const requetes = [];
const client = { from: () => {
  const q = { cols: null, filtres: [] };
  const fini = () => { lectures++; requetes.push(q); return Promise.resolve({ data: table, error: null }); };
  const b = { select: (c) => { q.cols = c; return b; }, eq: (...a) => { q.filtres.push(['eq', ...a]); return b; }, in: (...a) => { q.filtres.push(['in', ...a]); return fini(); },
    like: (...a) => { q.filtres.push(['like', ...a]); return fini(); }, maybeSingle: () => { lectures++; requetes.push(q); return Promise.resolve({ data: { value: 0 }, error: null }); },
    then: (r, j) => fini().then(r, j) };
  return b;
} };
cc.viderCoinConfig();
await cc.configUne(client, 'keepalive_actif', null);
ok(lectures === 1 && requetes[0].cols === 'value' && JSON.stringify(requetes[0].filtres) === '[["eq","key","keepalive_actif"]]', 'version inconnue : la requête d\'origine, telle quelle');
lectures = 0;
const [u1, u2] = await Promise.all([cc.configUne(client, 'keepalive_actif', 7), cc.configUne(client, 'lecture_fond_mode', 7)]);
await cc.configUne(client, 'absente', 7);
ok(u1.data?.value === 0 && u2.data?.value === 1 && lectures <= 2, `version connue : la table lue une fois, servie ensuite (${lectures} lecture(s))`);
const avant = lectures;
await cc.configPlusieurs(client, ['lecture_fond_mode', 'keepalive_actif'], 7);
ok(lectures === avant, 'même version : aucune lecture');
await cc.configUne(client, 'keepalive_actif', 8);
ok(lectures === avant + 1, 'version changée : relue');
const pref = await cc.configPrefixe(client, 'vinted_pays_', 8);
ok(pref.data.map((r) => r.key).sort().join(',') === 'vintedXpaysYfr,vinted_pays_be', 'configPrefixe : la sémantique exacte de LIKE (« _ » = un caractère)');
ok((gpj.match(/from\("coin_config"\)/g) ?? []).length === 0 && (gpj.match(/, versionCoinConfig\)/g) ?? []).length === 14,
  'get-pending-jobs : les 14 lectures de coin_config passent par la version du signal');
ok(gpj.includes('await userClient.rpc("signal_poll", { p_user: user.id });') && gpj.includes('return !eSig && sig && typeof sig === "object" ? sig as SignalCompte : null;'),
  'le signal lu une fois en tête de poll ; illisible → null → tout se lit comme avant');
ok(gpj.includes('if (!j || typeof j !== "object") return true;'), 'sans compteurs, une lecture n\'est jamais sautée');
ok(gpj.includes('!jobsPeutExister(["pending"]) ? { data: [] as Array<{ id: string }> } : await userClient.from("cross_post_jobs")')
  && gpj.includes('!jobsPeutExister(["pending"]) ? Promise.resolve({ data: [] as Array<{ id: string }>, error: null }) :')
  && gpj.includes('!jobsPeutExister(["pending"], ["republish"]) ? { data: [] as Array<Record<string, unknown>> } : await adminR.from("cross_post_jobs")'),
  'anti-robot Vinted / Beebs et retenues hors ligne : sautés seulement si aucun job en attente (marqueurs jamais posés sur un job neuf)');
ok(gpj.includes('aDesArretes = jobsPeutExister(["needs_user", "failed"]);'), 'présence des arrêtés par les compteurs (même instant que la lecture de présence)');
ok(gpj.includes('if (c && c.v === versionProfil && c.beta_flags !== undefined) return c.beta_flags ?? null;') && gpj.includes('if (c && c.v === versionProfil && c.palier !== undefined)'),
  'beta_flags et palier du compte : gardés tant que profil_version ne change pas');

// ── 2. get-pending-jobs ────────────────────────────────────────────────────
console.log('2. get-pending-jobs : ce qui reste, prouvé identique');
const iGarde = gpj.indexOf('let aDesArretes = true;');
ok(iGarde > 0 && gpj.slice(iGarde, iGarde + 600).includes('.in("status", ["needs_user", "failed"]).limit(1);'), 'une lecture de présence needs_user / failed');
ok(gpj.includes('if (!eArrete && Array.isArray(unArrete)) aDesArretes = unArrete.length > 0;'), 'illisible : aDesArretes reste vrai (balayage comme avant)');
const gardes = [...gpj.matchAll(/^ {4}if \(!includeProcessing && !includeNeedsUser(?: && correctifsPortes\.length)? && aDesArretes\) \{$/gm)];
ok(gardes.length === 9, `neuf balayages gardés (${gardes.length})`);
let lisentArretes = true;
for (const g of gardes) {
  const suite = gpj.slice(g.index, g.index + 900);
  if (!/\.eq\("status", "needs_user"\)|\.in\("status", \["needs_user", "failed"\]\)/.test(suite)) lisentArretes = false;
}
ok(lisentArretes, 'chaque bloc gardé ne lit d\'abord que des jobs needs_user / failed');
ok(gardes.every((g) => g.index > iGarde), 'la garde est posée avant les neuf blocs');
ok(gpj.includes('const { data: bloques } = !aDesArretes ? { data: [] as Array<Record<string, unknown>> } : await userClient'), 'les republications Leboncoin bloquées : lues seulement s\'il y a des arrêtés');
ok((gpj.match(/await lireCommandesEnFile\(ttl\)\)\.filter\(\(c\) => c\.kind === "(dressing|annonces|connexion)"/g) ?? []).length === 3,
  'les demandes en file (dressing, annonces, connexion) : une lecture, trois lecteurs');
const iRepris = gpj.indexOf('await admin.rpc("reprendre_releves_absents"');
ok(iRepris > 0 && gpj.slice(iRepris, iRepris + 700).includes('commandesEnFile = null;'), 'une remise en file par reprendre_releves_absents est relue dans le même poll');
ok((gpj.match(/lirePalierDuPoll\(\),/g) ?? []).length === 2, 'le palier du compte lu une fois pour les deux lectures de fond');
ok(gpj.includes('betaFlagsDuPoll = flagsP;') && gpj.includes('betaFlagsDuPoll !== undefined'), 'beta_flags du compte repris de la délégation (keepalive)');
ok(gpj.includes('if (reglageP.actif && !horsFenetre) {') && gpj.includes('Date.now() - inscritAuth > (joursP + 1) * 86_400_000'),
  'première synchro : le profil n\'est relu que pour un compte inscrit dans la fenêtre (+1 jour de marge)');
ok(gpj.includes('if (out.length > 0 || ligneDistribution.includes(", ")) console.log(ligneDistribution);'), 'un poll qui ne distribue ni ne retient rien ne s\'écrit plus au journal');

// ── 3. L'app ───────────────────────────────────────────────────────────────
console.log("3. L'app : le comportement d'avant, plus la vue complète du Stock relancée sur un changement réel");
const app = lire('src/App.jsx');
const iSonde = app.indexOf('const empreinteJobsRef=useRef(null);');
const sonde = app.slice(iSonde, iSonde + 2600);
ok(sonde.includes(".select('id,status,last_checked_at,sale_signal:"), 'la sonde lit last_checked_at comme avant (même déclencheur du fetchAll)');
ok(/if\(empreinte!==empreinteJobsRef\.current\)\{\s*empreinteJobsRef\.current=empreinte;\s*fetchAll\(user\.id,\{silencieux:true\}\);\s*\}/.test(sonde), "fetchAll sur toute différence de l'empreinte, comme avant");
ok(sonde.includes('last_checked_at:_vu,...reste') && sonde.includes("window.dispatchEvent(new Event('fillsell:jobs-changes'))"), "l'événement du Stock : seulement sur un changement réel (sans last_checked_at)");
ok(app.includes('if(maintenant-derniereVisibiliteRef.current<30_000) return;'), "retour d'onglet : 30 s, comme avant");
const stock = lire('src/tabs/StockTab.jsx');
ok(stock.includes('const COMPLETE_MS = 5 * 60_000;') && stock.includes('const COMPLETE_RETOUR_MS = 2 * 60_000;'), "Stock : vue complète toutes les 5 min (2 min au retour d'onglet), comme avant");
ok(stock.includes('window.addEventListener("fillsell:jobs-changes", onJobsChanges);') && stock.includes('window.removeEventListener("fillsell:jobs-changes", onJobsChanges);'), 'Stock : relancé tout de suite sur un changement réel');

console.log(ko ? `\n✗ ${ko} échec(s)` : '\n✓ tout est vert');
process.exit(ko ? 1 : 0);
