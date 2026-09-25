// ═══════════════════════════════════════════════════════════════════════════
// UNE PLATEFORME QUI FIGE NE CONFISQUE PLUS LE POSTE — CONTRÔLE (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le module LIVRÉ (supabase/functions/_shared/rotation-figes.js, celui
// qu'importe get-pending-jobs) sur la file réelle de MeMiniandMove au 25/09.
//
//   node scripts/rotation-figes-selftest.mjs

import { horodatageFige, plateformesFigees, rotationFiges, gelSansConstat, FIGE_FENETRE_MS } from "../supabase/functions/_shared/rotation-figes.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const NOW = Date.parse("2026-09-25T13:40:00.000Z");
// La file réelle (25/09) : les deux retraits qui figent, un troisième jamais tenté,
// la republication Vinted servie « au compte-gouttes ».
const lbc2cfa = {
  id: "2cfae2f2", platform: "leboncoin", action: "delete", status: "pending",
  error: "Reprise après interruption (bloqué 58 min en cours de traitement)",
  platform_fields: {
    pas_de_rouge: { at: "2026-09-25T10:36:05.179Z", motif: "canal_coupe", verdict: "reprise" },
    erreurs_archivees: [{ le: "2026-09-25T12:34:40.630Z", par: "update-job-status → pending" }],
  },
};
const beebs6f23 = {
  id: "6f2392c7", platform: "beebs", action: "delete", status: "pending",
  error: "Reprise après interruption (bloqué 50 min en cours de traitement)",
  platform_fields: { stale_recoveries: 1, work_window_state: { at_start: { at: "2026-09-25T10:47:46.509Z" } } },
};
const beebsAe28 = { id: "ae287de0", platform: "beebs", action: "delete", status: "pending", error: null, platform_fields: {} };
const vintedCc78 = { id: "cc78e0dc", platform: "vinted", action: "republish", status: "pending", error: null, platform_fields: { republish_step: "a_capturer" } };

console.log("1. Les preuves de gel");
ok(horodatageFige(lbc2cfa) === Date.parse("2026-09-25T12:34:40.630Z"), "retrait LBC : heure de la reprise (archive de l'erreur)");
ok(horodatageFige(beebs6f23) === Date.parse("2026-09-25T10:47:46.509Z"), "retrait Beebs sans archive : repli sur la fenêtre de travail");
ok(horodatageFige(beebsAe28) === null, "un job jamais tenté n'a pas figé");
ok(horodatageFige({ error: "Reprise après interruption : l'ordinateur qui portait ce traitement ne s'est plus manifesté", platform_fields: {} }) === null,
  "ordinateur éteint (handler-watch) ≠ gel du job");

console.log("2. La file réelle de MeMiniandMove");
{
  const figees = plateformesFigees([lbc2cfa, beebs6f23, beebsAe28, vintedCc78], NOW);
  ok(figees.has("leboncoin") && figees.has("beebs") && !figees.has("vinted"), "Leboncoin et Beebs figés, Vinted non");
  const { garde, retenus } = rotationFiges([beebsAe28, vintedCc78], figees);
  ok(garde.length === 1 && garde[0].id === "cc78e0dc", "la republication Vinted est servie");
  ok(retenus.length === 1 && retenus[0].id === "ae287de0", "le retrait Beebs attend son tour");
}

console.log("3. Jamais de famine, jamais une annonce hors ligne retenue");
{
  const figees = plateformesFigees([lbc2cfa, beebs6f23], NOW);
  const seul = rotationFiges([beebsAe28, lbc2cfa], figees);
  ok(seul.garde.length === 2 && seul.retenus.length === 0, "rien d'autre à faire : les jobs figés repartent");
  const horsLigne = { id: "r1", platform: "leboncoin", action: "republish", status: "pending", platform_fields: { republish_step: "deleted" } };
  const r = rotationFiges([horsLigne, vintedCc78], figees);
  ok(r.garde.some((j) => j.id === "r1"), "republication à l'étape 'deleted' : jamais retenue");
  const vide = rotationFiges([beebsAe28, vintedCc78], new Set());
  ok(vide.garde.length === 2 && vide.retenus.length === 0, "aucune plateforme figée : rien ne change");
}

console.log("4. Au-delà de 3 h sans nouveau gel, la plateforme reprend son rang");
{
  const tard = Date.parse("2026-09-25T12:34:40.630Z") + FIGE_FENETRE_MS + 1;
  const figees = plateformesFigees([lbc2cfa], tard);
  ok(!figees.has("leboncoin"), "fenêtre de 3 h écoulée : Leboncoin n'est plus figé");
}

console.log("5. Le constat daté fait foi (le début du traitement date d'une heure plus tôt)");
{
  ok(gelSansConstat(beebs6f23) === true, "retrait Beebs figé sans constat : à dater au prochain poll");
  const constate = { ...beebs6f23, platform_fields: { ...beebs6f23.platform_fields, fige_le: "2026-09-25T13:55:00.000Z" } };
  ok(gelSansConstat(constate) === false, "une fois daté, plus rien à poser");
  ok(horodatageFige(constate) === Date.parse("2026-09-25T13:55:00.000Z"), "l'horodatage du constat prime sur la fenêtre de travail");
  const t = Date.parse("2026-09-25T15:00:00.000Z");
  ok(plateformesFigees([constate], t).has("beebs"), "Beebs reste figé 3 h après le constat (et non 3 h après le début du traitement)");
  ok(gelSansConstat(beebsAe28) === false && gelSansConstat(vintedCc78) === false, "un job sans gel n'est jamais daté");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout passe");
process.exit(ko ? 1 : 0);
