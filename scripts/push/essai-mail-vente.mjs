// ════════════════════════════════════════════════════════════════════════════
// ESSAI RÉEL — un mail de vente sur la boîte de Nico, sans vraie vente (06/10)
// ════════════════════════════════════════════════════════════════════════════
//   node scripts/push/essai-mail-vente.mjs                     (hoosslocal, compte d'essai de Nico)
//   node scripts/push/essai-mail-vente.mjs --email=qui@exemple.fr   (une adresse INTERNE seulement)
//
// 1. compte les mails reçus par le compte dans les 24 h (support compris) ;
// 2. pose UNE note d'essai (« Vendu sur Vinted · Article test (essai) · 999 € »)
//    et une note DÉCLARÉE (comme « Vendue ? » confirmée par la personne) ;
// 3. réveille push-ventes, attend les verdicts ;
// 4. relance push-ventes une seconde fois : rien ne doit repartir.
// Attendu : UN mail « Vendu sur Vinted 🎉 » (email_logs `vente:<id>`), même si
// le compte a déjà reçu des mails ce jour-là ; la note déclarée n'envoie rien.
// Rien n'est écrit ailleurs : pas de vente, pas de fiche, pas de retrait.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const email = process.argv.find((a) => a.startsWith('--email='))?.slice(8) || 'hoosslocal@gmail.com';
if (!/^[^\s'@]+@[^\s'@]+$/.test(email)) { console.log('adresse invalide'); process.exit(1); }

function sql(requete) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'mail-vente-essai-'));
  const f = path.join(dossier, 'q.sql');
  writeFileSync(f, requete);
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${f}"`, '-o', 'json'], { cwd: RACINE, encoding: 'utf8', shell: true });
  rmSync(dossier, { recursive: true, force: true });
  const s = `${r.stdout}`;
  try { return JSON.parse(s.slice(s.indexOf('{'))).rows ?? []; } catch { console.log(s.slice(0, 800), r.stderr); return null; }
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const reveiller = () => sql(`select net.http_post(url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
  headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
  body := '{"trigger":"essai_mail"}'::jsonb, timeout_milliseconds := 60000);`);

const avant = sql(`select count(*)::int n from email_logs l join auth.users u on u.id = l.user_id
  where u.email = '${email}' and l.sent_at > now() - interval '24 hours';`)?.[0]?.n;
console.log(`Mails reçus par ${email} dans les 24 h (support compris) : ${avant}`);

const notes = sql(`with u as (select id from auth.users where email = '${email}')
  insert into push_ventes (user_id, origine, plateforme, titre, prix, devise, cles, statut, cree_le)
  select u.id, 'essai', 'vinted', 'Article test (essai)', 999, 'EUR', array['essai:' || gen_random_uuid()::text], 'a_envoyer', now() - interval '20 seconds' from u
  union all
  select u.id, 'declaree', 'vinted', 'Article test déclaré (essai)', 999, 'EUR', array['essai:' || gen_random_uuid()::text], 'declaree', now() - interval '20 seconds' from u
  returning id, statut;`);
if (!notes?.length) { console.log('✗ notes d\'essai non posées'); process.exit(1); }
const part = notes.find((n) => n.statut === 'a_envoyer')?.id;
const declaree = notes.find((n) => n.statut === 'declaree')?.id;
reveiller();
console.log(`Note à annoncer n° ${part}, note déclarée n° ${declaree} — envoi demandé…`);

let verdict = null;
for (let i = 0; i < 20; i++) {
  await dormir(3000);
  verdict = sql(`select statut, mail_statut, mail_motif, mail_essais, part_le from push_ventes where id = ${Number(part)};`)?.[0];
  if (verdict && !['en_envoi', 'a_envoyer'].includes(verdict.mail_statut ?? 'a_envoyer') && verdict.part_le) break;
}
console.log(`Note ${part} : push « ${verdict?.statut} », mail « ${verdict?.mail_statut} »${verdict?.mail_motif ? ` (${verdict.mail_motif})` : ''}, essais ${verdict?.mail_essais}`);
reveiller();
await dormir(8000);
const logs = sql(`select email_type, email, sent_at from email_logs where email_type in ('vente:${Number(part)}', 'vente:${Number(declaree)}') order by sent_at;`) ?? [];
const decl = sql(`select statut, mail_statut, part_le from push_ventes where id = ${Number(declaree)};`)?.[0];
console.log(`email_logs : ${logs.map((l) => `${l.email_type} → ${l.email} (${l.sent_at})`).join(' ; ') || 'aucune ligne'}`);
console.log(`Note déclarée ${declaree} : statut « ${decl?.statut} », mail « ${decl?.mail_statut ?? '—'} », décidée : ${decl?.part_le ? 'oui' : 'non'}`);
const ok = verdict?.mail_statut === 'envoye' && logs.length === 1 && logs[0].email_type === `vente:${part}`
  && decl?.statut === 'declaree' && !decl?.mail_statut;
console.log(ok
  ? `\n✓ UN mail de vente parti (malgré ${avant} mail(s) reçu(s) dans les 24 h), aucun pour la vente déclarée, rien de reparti au second réveil.`
  : '\n✗ verdict inattendu : relire push_ventes / email_logs / journaux de push-ventes.');
process.exit(ok ? 0 : 1);
