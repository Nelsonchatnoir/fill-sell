// Verrou des points 5 et 7 du lot « problèmes » du 20/11 (copie Cloud de l'extension, scripts/cloud/build-extension-cloud.mjs).
//
// Point 5 (compte 2f8b09d2) : la visite de renouvellement du jeton Beebs tombait sur une PAGE D'ERREUR de Chrome
// (ERR_TUNNEL_CONNECTION_FAILED) — 10 essais entre 04:37 et 08:59, tous « jeton_non_renouvele » ; l'orchestrateur a passé
// Beebs « à reconnecter », ce qui fait PURGER la session au redémarrage suivant (postes.js, purgerSessions). Règle : une
// page qui ne s'est pas chargée ne prouve rien sur la session → « site_injoignable », jamais une reconnexion demandée.
//
// Point 7 (compte faf5021a) : l'alarme quotidienne naissait à « installation + 25 min » ; la mise à jour de la copie le 19/11
// à 13:02 l'a posée à 13:27, refusée par la cadence → aucune nuit relevée. Règle (Cloud) : les deux alarmes quotidiennes
// la nuit (03:00 à 04:05, Paris), une alarme hors de la nuit y est ramenée. Et (extension, tous les postes) seuls les
// relevés automatiques comptent dans les 20 h de la cadence des relevés d'annonces.
//
// Ce test échoue si une de ces règles disparaît, ou si le renouvellement réussi / la vraie session fermée changent.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_CONNEXION_CLOUD, SOURCE_VERROU_CLOUD, RENOUVELLEMENT_CLOUD, SOURCE_RELEVES_NUIT_CLOUD, RELEVES_NUIT_CLOUD, patcherBackground }
  from './cloud/build-extension-cloud.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ko = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) ko++; };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (o) => `e30.${b64(o)}.sig`;

// ── Point 5 : le renouvellement contre un faux Chrome ─────────────────────────────────────────────────────────────────
const banc = ({ siteRenouvelle = false, pageErreur = false, jetonLong = true } = {}) => {
  const cookies = jetonLong ? [{ domain: 'www.beebs.app', name: 'refresh_token', value: 'opaque' }] : [];
  const parti = [], ouverts = [];
  const chrome = {
    cookies: {
      getAll: async ({ domain }) => cookies.filter((c) => c.domain === domain),
      get: async ({ url, name }) => cookies.find((c) => url.includes(c.domain) && c.name === name) ?? null,
    },
    tabs: {
      create: async (p) => {
        ouverts.push(p.url);
        if (siteRenouvelle) setTimeout(() => cookies.push({ domain: 'www.beebs.app', name: 'access_token', value: jwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 }) }), 30);
        return { id: ouverts.length };
      },
      update: async (id) => ({ id }), remove: async () => {},
    },
    windows: { create: async () => ({ id: 9 }) },
    scripting: { executeScript: async () => { if (pageErreur) throw new Error('Frame with ID 0 is showing error page'); return [{ result: 1 }]; } },
  };
  const globalFaux = { fetch: async (u) => { parti.push(String(u)); return { ok: true, status: 200 }; } };
  const source = SOURCE_VERROU_CLOUD.replace(JSON.stringify(RENOUVELLEMENT_CLOUD), JSON.stringify({ attenteMs: 300, pasMs: 20, reessaiMs: 60_000 }));
  const v = new Function('chrome', 'atob', 'globalThis', `${SOURCE_CONNEXION_CLOUD}\n${source}\nreturn { v: globalThis.__fillsellVerrouCloud, job: reconnexionCloudPourJob };`)(
    chrome, (s) => Buffer.from(s, 'base64').toString('binary'), globalFaux);
  return { ...v, globalFaux, parti, ouverts };
};
const essayer = (p) => p.then(() => 'passe', (e) => `refuse:${e.message}`);

console.log('1. Point 5 — une page qui ne s’est pas chargée n’est jamais « à reconnecter »');
{
  const b = banc({ pageErreur: true });
  const r = await essayer(b.globalFaux.fetch('https://www.beebs.app/fr/account/sales'));
  ok(r.startsWith('refuse:FillSell Cloud : beebs injoignable pour le moment') && !b.parti.length, `requête refusée, motif « injoignable » (${r.slice(7, 70)}…)`);
  const rec = await b.v.reconnexions();
  ok(!Object.keys(rec).length, `aucune reconnexion lue par l’orchestrateur (${JSON.stringify(rec)}) : le coffre n’est pas touché, rien n’est purgé`);
  const e = b.v.etat();
  ok(e.injoignable?.beebs?.cause === 'site_injoignable' && e.renouvellements.at(-1)?.issue === 'site_injoignable', 'issue notée « site_injoignable »');
  const conv = b.job('failed', { error: r.slice(7) });
  ok(conv.status === 'failed' && !/Connexion Beebs requise/.test(conv.extra.error), 'la tâche n’est PAS changée en « Connexion Beebs requise » (refus passager, repris)');
  ok((await essayer(b.globalFaux.fetch('https://api.beebs.app/x'))).startsWith('refuse:') && b.ouverts.length === 1, 'pas de nouvelle visite avant reessaiMs');
}
{
  const b = banc({ pageErreur: false });
  await essayer(b.globalFaux.fetch('https://api.beebs.app/users/v3/me'));
  ok((await b.v.reconnexions()).beebs?.cause === 'jeton_non_renouvele', 'page chargée, jeton pas revenu : « jeton_non_renouvele » comme avant (reconnexion demandée)');
}
{
  const b = banc({ siteRenouvelle: true, pageErreur: true });
  ok(await essayer(b.globalFaux.fetch('https://api.beebs.app/x')) === 'passe', 'jeton revenu : la requête passe (la page n’est même pas examinée)');
}
{
  const b = banc({ jetonLong: false });
  await essayer(b.globalFaux.fetch('https://api.beebs.app/x'));
  ok((await b.v.reconnexions()).beebs?.cause === 'session_fermee' && !b.ouverts.length, 'aucun jeton long : « session_fermee » comme avant, aucune visite');
}

console.log('\n2. Point 7 — les relevés quotidiens du Cloud la nuit, à heure fixe');
const minutesParis = (ms) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms));
  const v = (t) => Number(p.find((x) => x.type === t)?.value);
  return (v('hour') % 24) * 60 + v('minute');
};
const fauxAlarmes = (existantes = {}) => {
  const creees = [];
  return { creees, chrome: { alarms: { get: async (n) => existantes[n] ?? null, create: (n, o) => creees.push({ n, ...o }) } } };
};
const charger = (chrome) => new Function('chrome', `${SOURCE_RELEVES_NUIT_CLOUD}\nreturn { prochainCreneauNuitCloud, creerAlarmeNuitCloud };`)(chrome);
{
  const f = fauxAlarmes();
  const R = charger(f.chrome);
  const midi = Date.parse('2026-11-20T12:02:00Z');
  for (const [d, quoi] of [[0, 'dressing'], [25, 'annonces']]) {
    const t = R.prochainCreneauNuitCloud(d, midi);
    const m = minutesParis(t);
    ok(t > midi && t - midi < 24 * 3600_000 && m >= RELEVES_NUIT_CLOUD.debutMin && m < RELEVES_NUIT_CLOUD.finMin, `${quoi} : prochain créneau ${new Date(t).toISOString()} (${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')} Paris)`);
  }
  const nuit = Date.parse('2026-11-20T02:59:00Z'); // 03:59 Paris
  const t2 = R.prochainCreneauNuitCloud(0, nuit);
  ok(minutesParis(t2) >= RELEVES_NUIT_CLOUD.debutMin && t2 > nuit, 'calculé en pleine nuit : jamais dans le passé');
}
{
  const treizeH27 = Date.parse('2026-11-20T12:27:37Z');
  const f = fauxAlarmes({ 'fillsell-sync-annonces': { name: 'fillsell-sync-annonces', scheduledTime: treizeH27, periodInMinutes: 1440 } });
  const R = charger(f.chrome);
  const fait = await R.creerAlarmeNuitCloud('fillsell-sync-annonces', 25, { periodInMinutes: 1440, delayInMinutes: 25 });
  ok(fait && f.creees.length === 1 && f.creees[0].periodInMinutes === 1440 && minutesParis(f.creees[0].when) >= RELEVES_NUIT_CLOUD.debutMin
    && minutesParis(f.creees[0].when) < RELEVES_NUIT_CLOUD.finMin && !('delayInMinutes' in f.creees[0]),
    'l’alarme de Louis (13:27, posée par la mise à jour du 19/11) est ramenée la nuit');
  const f2 = fauxAlarmes({ 'fillsell-sync-annonces': { name: 'fillsell-sync-annonces', scheduledTime: Date.parse('2026-11-21T02:20:00Z'), periodInMinutes: 1440 } });
  ok(await charger(f2.chrome).creerAlarmeNuitCloud('fillsell-sync-annonces', 25, { periodInMinutes: 1440 }) === false && !f2.creees.length,
    'une alarme déjà la nuit (03:20 Paris) n’est pas touchée');
}
{
  const bg = readFileSync(path.join(racine, 'chrome-extension/background.js'), 'utf8');
  const { bg: cloud, appliques } = patcherBackground(bg);
  ok(appliques.includes('relevé quotidien du dressing : la nuit, à heure fixe (20/11)') && appliques.includes('relevé quotidien des annonces : la nuit, à heure fixe (20/11)')
    && cloud.includes('await creerAlarmeNuitCloud(SYNC_DRESSING_ALARM, 0, {') && cloud.includes('await creerAlarmeNuitCloud(SYNC_ANNONCES_ALARM, 25, {')
    && !cloud.includes('await creerAlarmeSiBesoin(SYNC_ANNONCES_ALARM, {'), 'copie Cloud : les deux alarmes quotidiennes passent par creerAlarmeNuitCloud');
  ok(bg.includes('await creerAlarmeSiBesoin(SYNC_ANNONCES_ALARM, {') && bg.includes('delayInMinutes: 25,'), 'paquet du Chrome Web Store : inchangé (l’ordinateur garde « installation + 25 min »)');
  ok(/kind=eq\.annonces&platform=eq\.\$\{platform\}&status=in\.\(done,incomplete\)&declencheur=eq\.cron&select=finished_at/.test(bg),
    'cadence des relevés d’annonces : seuls les relevés AUTOMATIQUES comptent dans les 20 h (tous les postes)');
}

if (ko) { console.log(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log('\n✓ Cloud : site injoignable jamais « à reconnecter » ; relevés quotidiens la nuit, cadence sur les seuls relevés automatiques');
