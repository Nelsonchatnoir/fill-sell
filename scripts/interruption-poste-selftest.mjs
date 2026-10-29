// Autotest — « ordinateur coupé » seulement quand l'extension se tait (point 5,
// 02/10 soir). `npm run selftest:interruption-poste` (_shared/interruption-poste.js).
import { posteVivant, messageInterruption, POSTE_VIVANT_MS, posteTravailleSurLeJob } from "../supabase/functions/_shared/interruption-poste.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. NIVAKE03 — ceinture Beebs 8d487ebb (relevé en base)");
// prise 01:22:07Z, dernier signe 01:22Z, handler-watch passe à 01:51Z.
const t = Date.parse("2026-10-02T01:51:02Z");
const muet = posteVivant({ vuLe: "2026-10-02T01:22:00Z", priseLe: "2026-10-02T01:22:07Z", maintenant: t });
ok(muet === false, "aucun signe depuis la prise, 29 min de silence → extension MUETTE");
const m = messageInterruption({ etape: "deleted", vivant: false, platform: "beebs", vuLe: "2026-10-02T01:22:00Z" });
ok(/ordinateur ou Chrome s'est arrêté/.test(m) && /depuis 03:22/.test(m) && /tête de file/.test(m), "message : ordinateur/Chrome, l'heure du dernier signe, tête de file", m);

console.log("\n2. EXTENSION VIVANTE — onglet ou script en échec");
const vivant = posteVivant({ vuLe: "2026-10-02T01:49:30Z", priseLe: "2026-10-02T01:22:07Z", maintenant: t });
ok(vivant === true, "vue 27 min après la prise, il y a 1 min 30 → VIVANTE");
const mv = messageInterruption({ etape: "deleted", vivant: true, platform: "beebs", vuLe: "2026-10-02T01:49:30Z" });
ok(!/ordinateur/.test(mv) && /onglet de travail/.test(mv) && /tout de suite/.test(mv), "jamais « ordinateur » quand l'extension répond", mv);
ok(!posteVivant({ vuLe: new Date(t - POSTE_VIVANT_MS - 1000).toISOString(), priseLe: "2026-10-02T01:22:07Z", maintenant: t }), "vue il y a plus de 10 min : muette");
ok(!posteVivant({ vuLe: "2026-10-02T01:22:30Z", priseLe: "2026-10-02T01:22:07Z", maintenant: Date.parse("2026-10-02T01:25:00Z") }),
  "vue 23 s après la prise seulement : pas une preuve de vie après coup");
ok(!posteVivant({ vuLe: null, priseLe: "2026-10-02T01:22:07Z", maintenant: t }), "aucune lecture : muette (jamais de promesse sans preuve)");

console.log("\n3. ÉTAPE 'captured' (annonce encore en ligne)");
ok(/toujours en ligne sur Vinted/.test(messageInterruption({ etape: "captured", vivant: false, platform: "vinted", vuLe: null })), "muette : annonce intacte");
ok(!/ordinateur/.test(messageInterruption({ etape: "captured", vivant: true, platform: "vinted" })), "vivante : pas « ordinateur »");

console.log("\n4. (29/10, point 5) JOHAN, 098cab75 — recréation Leboncoin prise 11:37:39, publiée 12:13:17 (Paris)");
{
  const job = "098cab75-261f-416f-aac3-51f27999704f";
  const h1151 = Date.parse("2026-10-27T10:51:00Z");
  const postes = { s88: { le: "2026-10-27T10:47:40Z", battement_le: "2026-10-27T10:47:40Z", travail: { flux: "poll", job, plateforme: "leboncoin", le: "2026-10-27T10:47:40Z" } } };
  ok(posteTravailleSurLeJob({ postes, jobId: job, maintenant: h1151 }) === true, "11:51 : le poste a battu sur CE job il y a 3 min → en cours, on ne le reprend pas");
  ok(posteTravailleSurLeJob({ postes, jobId: "autre", maintenant: h1151 }) === false, "un autre job : pas protégé");
  ok(posteTravailleSurLeJob({ postes, jobId: job, maintenant: Date.parse("2026-10-27T11:05:00Z") }) === false, "battement de plus de 10 min : plus une preuve");
  ok(posteTravailleSurLeJob({ postes: null, jobId: job, maintenant: h1151 }) === false, "aucun poste lu : jamais de promesse sans preuve");
  // Sans battement (≤ 0.6.148), le dernier signe est le poll de 11:37 : muet, la phrase d'avant — d'où le correctif.
  ok(posteVivant({ vuLe: "2026-10-27T10:37:33Z", priseLe: "2026-10-27T10:37:39Z", maintenant: h1151 }) === false, "sans battement : « muette » (le faux d'avant, reproduit)");
  ok(posteVivant({ vuLe: "2026-10-27T10:47:40Z", priseLe: "2026-10-27T10:37:39Z", maintenant: h1151 }) === true, "avec battement : « vivante »");
}

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ interruption : poste muet ≠ onglet en échec");
