// Autotest — « ordinateur coupé » seulement quand l'extension se tait (point 5,
// 02/10 soir). `npm run selftest:interruption-poste` (_shared/interruption-poste.js).
import { posteVivant, messageInterruption, POSTE_VIVANT_MS } from "../supabase/functions/_shared/interruption-poste.js";

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

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ interruption : poste muet ≠ onglet en échec");
