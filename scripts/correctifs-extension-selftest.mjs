// ── AUTOTEST : UN JOB BLOQUÉ PAR UN DÉFAUT D'EXTENSION CORRIGÉ REPART SEUL ──
// (25/09/2026, LES PETITES FIOLES — supabase/functions/_shared/correctifs-extension.js)
// Rejoue la forme RÉELLE des 5 republications Leboncoin PRO de la cliente
// (40 essais par la 0.6.63, « contrôle Supprimer introuvable … actions
// relevées: [] ») et verrouille les bornes :
//   1. reconnu : bonne plateforme, bonne action, signature, build d'échec ancien ;
//   2. un poste à jour (≥ 0.6.66) porte le correctif, un poste 0.6.63 non ;
//   3. un échec SUR un build corrigé n'est jamais réarmé ;
//   4. un seul réarmement par job et par correctif ;
//   5. autre plateforme / autre action / autre signature / build illisible : rien.
//   node scripts/correctifs-extension-selftest.mjs
import { correctifPourJob, posteAJour, buildMsDe, CORRECTIFS_EXTENSION } from "../supabase/functions/_shared/correctifs-extension.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const B063 = "2026-09-23T22:48:50Z+d4e424c · v0.6.63";
const B066 = "2026-09-24T14:34:46Z+aa459a7";
const B067 = "2026-09-25T09:00:00Z+abcdef0";
const fiole = (surcharge = {}) => ({
  id: "f554a951-8397-457d-95bd-60dce5b2bd02", platform: "leboncoin", action: "republish", status: "needs_user",
  handler_build: B063,
  error: "La republication n'a pas abouti après plusieurs essais automatiques, et ton annonce n'a pas été touchée. Tu peux la relancer d'un clic ci-dessous ; si ça bloque encore, écris-nous, on regarde avec toi.",
  platform_fields: {
    republish_step: "captured", needs_user_source: "relancer", needsUserAttempts: 5,
    last_diagnostic: "contrôle Supprimer introuvable sur la page de l'annonce 3271176513 — 1 <aside>, actions relevées: []",
    error_technique: { at: "2026-09-24T14:06:00.545Z", brut: "Retrait Leboncoin non abouti (Contrôle « Supprimer l'annonce » introuvable sur la page de l'annonce). Ton annonce est TOUJOURS en ligne (vérifié)" },
  },
  ...surcharge,
});

console.log("\n── CORRECTIFS D'EXTENSION : LE JOB REPART QUAND LE POSTE EST À JOUR ──");

console.log("\n1. Les 5 republications des Petites Fioles sont reconnues");
{
  const c = correctifPourJob(fiole());
  ok(c?.cle === "lbc_retrait_pro_tiroir", `correctif reconnu : ${c?.cle}`);
  ok(correctifPourJob(fiole({ action: "delete" }))?.cle === "lbc_retrait_pro_tiroir", "un RETRAIT simple aussi");
  const sansDiag = fiole();
  delete sansDiag.platform_fields.last_diagnostic;
  ok(correctifPourJob(sansDiag)?.cle === "lbc_retrait_pro_tiroir", "reconnu par l'erreur technique seule (brut du retrait)");
}

console.log("\n2. Le poste qui polle porte-t-il le correctif ?");
{
  const c = CORRECTIFS_EXTENSION[0];
  ok(posteAJour(B066, c) && posteAJour(B067, c), "0.6.66 et au-delà : oui");
  ok(!posteAJour(B063, c) && !posteAJour("", c) && !posteAJour("0.6.66", c), "0.6.63, build vide, numéro sans horodatage : non");
}

console.log("\n3. Un échec SUR un build corrigé n'est jamais réarmé");
{
  ok(correctifPourJob(fiole({ handler_build: B066 })) === null, "échec en 0.6.66 → rien (le diagnostic 0.6.66 reste lisible)");
  ok(correctifPourJob(fiole({ handler_build: "releve-annonces" })) === null, "build illisible → rien (on ne devine pas)");
}

console.log("\n4. Un seul réarmement par job et par correctif");
{
  const deja = fiole();
  deja.platform_fields.correctif_leve = { cle: "lbc_retrait_pro_tiroir", le: "2026-09-25T09:00:00Z" };
  ok(correctifPourJob(deja) === null, "déjà réarmé une fois → plus jamais");
}

console.log("\n5. Hors périmètre : rien");
{
  ok(correctifPourJob(fiole({ platform: "vinted" })) === null, "autre plateforme");
  ok(correctifPourJob(fiole({ action: "publish" })) === null, "un dépôt (publish) n'est pas un retrait");
  ok(correctifPourJob(fiole({ status: "pending" })) === null, "un job qui n'attend rien");
  const autre = fiole({ error: "Leboncoin a refusé l'annonce (modération)" });
  autre.platform_fields = { republish_step: "captured", last_diagnostic: "refus de modération" };
  ok(correctifPourJob(autre) === null, "une autre cause d'échec");
  ok(Number.isFinite(buildMsDe(B063)) && Number.isNaN(buildMsDe("v0.6.63")), "buildMsDe lit le préfixe horodaté, jamais le numéro");
}

console.log(ko === 0 ? "\n✅ CORRECTIFS D'EXTENSION : tout est vert.\n" : `\n❌ ${ko} contrôle(s) en échec.\n`);
process.exit(ko === 0 ? 0 : 1);
