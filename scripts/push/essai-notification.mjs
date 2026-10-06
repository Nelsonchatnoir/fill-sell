// ════════════════════════════════════════════════════════════════════════════
// ENVOI D'ESSAI — une vraie notification sur le téléphone, sans vraie vente
// ════════════════════════════════════════════════════════════════════════════
//   npm run push:essai                       (compte de Nico)
//   npm run push:essai -- --email=qui@exemple.fr
//
// Pose UNE note d'essai (« 🎉 Vendu sur Vinted · Article test (essai) · 999 € »)
// sur le compte, réveille push-ventes, puis lit le verdict appareil par
// appareil. Rien n'est écrit ailleurs : pas de vente, pas de fiche, pas de
// retrait. L'appui sur la notification ouvre l'onglet Ventes (aucune fiche).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const email = process.argv.find((a) => a.startsWith('--email='))?.slice(8) || 'hoosslocal@gmail.com';
if (!/^[^\s'@]+@[^\s'@]+$/.test(email)) { console.log('adresse invalide'); process.exit(1); }

function sql(requete) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'push-essai-'));
  const f = path.join(dossier, 'q.sql');
  writeFileSync(f, requete);
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${f}"`, '-o', 'json'], { cwd: RACINE, encoding: 'utf8', shell: true });
  rmSync(dossier, { recursive: true, force: true });
  const s = `${r.stdout}`;
  try { return JSON.parse(s.slice(s.indexOf('{'))).rows ?? []; } catch { console.log(s.slice(0, 800), r.stderr); return null; }
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const appareils = sql(`select a.plateforme, a.version_app, a.vu_le, a.apns_env, a.dernier_envoi_le, a.dernier_echec
  from appareils_push a join auth.users u on u.id = a.user_id where u.email = '${email}' order by a.vu_le desc;`);
if (!appareils) process.exit(1);
if (!appareils.length) {
  console.log(`✗ Aucun téléphone enregistré pour ${email}.`);
  console.log('  → Ouvre FillSell 2.9.62 sur le téléphone, connecté à ce compte, puis « Activer » (ou Réglages › Préférences › Notifications de ventes).');
  process.exit(1);
}
console.log(`Téléphones enregistrés pour ${email} :`);
for (const a of appareils) console.log(`  · ${a.plateforme} ${a.version_app ?? ''} — vu le ${a.vu_le}${a.dernier_echec ? ` — dernier échec : ${a.dernier_echec}` : ''}`);

const note = sql(`insert into push_ventes (user_id, origine, plateforme, titre, prix, devise, cles, statut, cree_le)
  select u.id, 'essai', 'vinted', 'Article test (essai)', 999, 'EUR', array['essai:' || gen_random_uuid()::text], 'a_envoyer', now() - interval '20 seconds'
    from auth.users u where u.email = '${email}'
  returning id;`)?.[0]?.id;
if (!note) { console.log('✗ la note d\'essai n\'a pas pu être posée'); process.exit(1); }
sql(`select net.http_post(url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
  headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
  body := '{"trigger":"essai"}'::jsonb, timeout_milliseconds := 60000);`);
console.log(`\nNote d'essai n° ${note} posée, envoi demandé…`);

for (let i = 0; i < 20; i++) {
  await dormir(3000);
  const r = sql(`select statut, motif, resultat from push_ventes where id = ${Number(note)};`)?.[0];
  if (r && !['a_envoyer', 'en_envoi'].includes(r.statut)) {
    console.log(`\n${r.statut === 'envoyee' ? '✓ ENVOYÉE' : `✗ ${r.statut.toUpperCase()}`}${r.motif ? ` — ${r.motif}` : ''}`);
    for (const d of r.resultat ?? []) console.log(`  · ${d.plateforme} : ${d.etat}${d.motif ? ` (${d.motif})` : ''}${d.env ? ` [${d.env}]` : ''}`);
    console.log(r.statut === 'envoyee' ? '\n→ La notification doit être sur le téléphone (app fermée comprise). Appuie dessus : FillSell s\'ouvre.' : '');
    process.exit(r.statut === 'envoyee' ? 0 : 1);
  }
}
console.log('✗ pas de verdict en 60 s : relire la file (push_ventes) et les journaux de push-ventes.');
process.exit(1);
