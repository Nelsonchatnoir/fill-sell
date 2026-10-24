// ════════════════════════════════════════════════════════════════════════════
// ESSAI « VENTE ANNULÉE » — compte de Nico SEULEMENT, simulation d'abord (25/10, point 3 de Nico)
// ════════════════════════════════════════════════════════════════════════════
//   npm run push:essai-annulation                 SIMULATION : rien n'est écrit, rien n'est envoyé.
//       Téléphones du compte (nombre, plateforme, version — jamais un jeton), armement, annulations qui partiraient
//       (push_annulations_apercu) et le TEXTE exact de chaque notification (_shared/push-annulation.js).
//   npm run push:essai-annulation -- --envoyer    UNE notification d'essai sur les téléphones de Nico :
//       « Vente annulée sur Vinted » / « Article test (essai) : remettre en vente ? ». Pose UNE note d'essai
//       (push_annulations, cle « essai:<uuid> », aucune vente, aucune fiche, aucune proposition), réveille push-ventes,
//       lit le verdict appareil par appareil. Refuse sans téléphone enregistré ou interrupteur coupé. Jamais un mail.
// Prérequis : migration 20261025040000 appliquée, push-ventes v14 ; pour un VRAI envoi : secrets APNs/FCM posés et
// un binaire avec le module push sur le téléphone de Nico (le 25/10 : 0 appareil, 0 secret — l'envoi est impossible).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NICO = "f44b5917-bccc-4431-ba41-f40571a2ed18";   // ⛔ jamais un autre compte
const envoyer = process.argv.includes("--envoyer");
const { messageAnnulation, langueNotif } = await import(pathToFileURL(path.join(RACINE, "supabase/functions/_shared/push-annulation.js")).href);

function sql(requete) {
  const dossier = mkdtempSync(path.join(tmpdir(), "push-annulation-essai-"));
  const f = path.join(dossier, "q.sql");
  writeFileSync(f, requete);
  const r = spawnSync("npx", ["supabase", "db", "query", "--linked", "-f", `"${f}"`, "-o", "json"], { cwd: RACINE, encoding: "utf8", shell: true });
  rmSync(dossier, { recursive: true, force: true });
  const s = `${r.stdout}`;
  try { return JSON.parse(s.slice(s.indexOf("{"))).rows ?? []; } catch { console.log(s.slice(0, 800), r.stderr); return null; }
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const appareils = sql(`select plateforme, version_app, apns_env, vu_le at time zone 'Europe/Paris' as vu, dernier_echec
  from appareils_push where user_id = '${NICO}' order by vu_le desc;`);
const etat = sql(`select (select value from coin_config where key = 'push_annulations_depuis') as depuis,
  to_regprocedure('public.push_annulations_a_envoyer(integer)') is not null as migration,
  (select coalesce(lang, 'fr') from profiles where id = '${NICO}') as lang;`)?.[0];
if (!appareils || !etat) process.exit(1);
if (!etat.migration) { console.log("✗ migration 20261025040000 non appliquée : rien à essayer."); process.exit(1); }
console.log(`Interrupteur : ${Number(etat.depuis) > 0 ? `armé depuis ${new Date(Number(etat.depuis) * 1000).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}` : "COUPÉ (0)"}`);
console.log(`Téléphones de Nico : ${appareils.length}`);
for (const a of appareils) console.log(`  · ${a.plateforme} ${a.version_app ?? ""} [${a.apns_env}] — vu le ${a.vu}${a.dernier_echec ? ` — dernier échec : ${a.dernier_echec}` : ""}`);

const apercu = sql(`select public.push_annulations_apercu('${NICO}') as a;`)?.[0]?.a ?? { candidates: [] };
const lang = langueNotif(etat.lang);
console.log(`\nSIMULATION — annulations de Nico qui partiraient au prochain passage : ${apercu.candidates.length}`);
for (const c of apercu.candidates) {
  const m = messageAnnulation(c, lang);
  console.log(`  · ${c.cle}${c.deja_notee ? " (déjà notée : ne repartira pas)" : ""}\n      « ${m.titre} » — « ${m.corps} »  ${JSON.stringify(m.donnees)}`);
}
const essai = messageAnnulation({ id: "essai", plateforme: "vinted", titre: "Article test (essai)" }, lang);
console.log(`\nNotification d'essai : « ${essai.titre} » — « ${essai.corps} »`);

if (!envoyer) { console.log("\n(simulation : rien n'a été écrit ni envoyé ; --envoyer pour l'envoi réel sur les téléphones de Nico)"); process.exit(0); }
if (!appareils.length) {
  console.log("\n✗ Aucun téléphone enregistré pour Nico : rien n'est posé.");
  console.log("  → FillSell (binaire avec le module push) sur le téléphone, connecté à ce compte, puis Réglages › Notifications de ventes.");
  process.exit(1);
}
if (!(Number(etat.depuis) > 0)) { console.log("\n✗ Interrupteur coupé (push_annulations_depuis = 0) : la note ne partirait pas."); process.exit(1); }

const note = sql(`insert into push_annulations (user_id, cle, plateforme, titre, annulee_le)
  values ('${NICO}', 'essai:' || gen_random_uuid()::text, 'vinted', 'Article test (essai)', now()) returning id;`)?.[0]?.id;
if (!note) { console.log("✗ la note d'essai n'a pas pu être posée"); process.exit(1); }
sql(`select net.http_post(url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
  headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
  body := '{"trigger":"essai_annulation"}'::jsonb, timeout_milliseconds := 60000);`);
console.log(`\nNote d'essai n° ${note} posée, envoi demandé…`);
for (let i = 0; i < 20; i++) {
  await dormir(3000);
  const r = sql(`select statut, motif, resultat from push_annulations where id = ${Number(note)};`)?.[0];
  if (r && !["a_envoyer", "en_envoi"].includes(r.statut)) {
    console.log(`\n${r.statut === "envoyee" ? "✓ ENVOYÉE" : `✗ ${r.statut.toUpperCase()}`}${r.motif ? ` — ${r.motif}` : ""}`);
    for (const d of r.resultat ?? []) console.log(`  · ${d.plateforme} : ${d.etat}${d.motif ? ` (${d.motif})` : ""}${d.env ? ` [${d.env}]` : ""}`);
    console.log(r.statut === "envoyee" ? "\n→ La notification est sur le téléphone. Appui : l'app d'avant s'ouvre ; après l'OTA, « Ventes annulées »." : "");
    process.exit(r.statut === "envoyee" ? 0 : 1);
  }
}
console.log("✗ pas de verdict en 60 s : relire push_annulations et les journaux de push-ventes.");
process.exit(1);
