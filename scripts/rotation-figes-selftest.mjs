// ═══════════════════════════════════════════════════════════════════════════
// UNE PLATEFORME QUI FIGE NE CONFISQUE PLUS LE POSTE — CONTRÔLE (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le module LIVRÉ (supabase/functions/_shared/rotation-figes.js, celui
// qu'importe get-pending-jobs) sur la file réelle de MeMiniandMove au 25/09.
//
//   node scripts/rotation-figes-selftest.mjs

import { horodatageFige, plateformesFigees, gelsParPlateforme, rotationFiges, gelSansConstat, FIGE_FENETRE_MS } from "../supabase/functions/_shared/rotation-figes.js";

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

console.log("2. La file réelle de Compte-63ad8597");
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

console.log("6. (02/11, client-229c7b07) Jamais affamée sur un poste actif : un essai par poll, une réussite lève le gel");
{
  // La file réelle du 02/11 : un Vinted figé à 13:00:57 (content script muet → canal coupé), 77 Vinted et 58
  // Leboncoin en file ; le poste sert un Leboncoin toutes les 2 min et ne repasse qu'au bout de son lot.
  const gel = "2026-11-02T12:00:57.674Z";
  const fige = { id: "3bd3cc17", platform: "vinted", action: "publish", status: "pending",
    error: "La publication a été interrompue : la page de Vinted ne finissait pas de se charger sur ton ordinateur.",
    platform_fields: { pas_de_rouge: { at: gel, motif: "canal_coupe", verdict: "reprise" }, next_action_after: "2026-11-02T12:05:57.628Z" } };
  const vinted = [fige, ...Array.from({ length: 76 }, (_, i) => ({ id: `v${i}`, platform: "vinted", action: "publish", status: "pending", platform_fields: {} }))];
  const lbc = Array.from({ length: 58 }, (_, i) => ({ id: `l${i}`, platform: "leboncoin", action: "publish", status: "pending", platform_fields: {} }));
  const file = [...lbc.slice(0, 1), ...vinted, ...lbc.slice(1)];
  const t0 = Date.parse(gel);

  const avant = gelsParPlateforme([fige], t0 + 5 * 60_000);
  ok(avant.get("vinted") === t0, "le dernier gel de Vinted est daté (Map plateforme → instant)");
  const r5 = rotationFiges(file, avant, t0 + 5 * 60_000);
  ok(r5.retenus.length === 77 && r5.essais.length === 0, "5 min après le gel : Vinted passe après les autres (repos)");

  const t = t0 + 98 * 60_000; // le poll réel de 14:39
  const r = rotationFiges(file, gelsParPlateforme([fige], t), t);
  ok(r.essais.length === 1 && r.essais[0].id === "3bd3cc17", "1 h 38 après : UNE tâche Vinted servie à l'essai (la première de la file)");
  ok(r.retenus.length === 76 && r.garde.filter((j) => j.platform === "leboncoin").length === 58, "les 76 autres attendent, les 58 Leboncoin partent");
  ok(r.garde.filter((j) => j.platform === "vinted").length === 1, "jamais plus d'une tâche de la plateforme figée par poll");

  const essaiReussi = { platform: "vinted", processing_since: "2026-11-02T13:40:00.000Z", published_at: "2026-11-02T13:42:00.000Z" };
  const leve = gelsParPlateforme([fige], t + 10 * 60_000, [essaiReussi]);
  ok(!leve.has("vinted"), "l'essai traité par le poste et publié après le gel lève le gel");
  ok(rotationFiges(file, leve, t + 10 * 60_000).retenus.length === 0, "au poll suivant, toute la file Vinted reprend son rang");
  const importe = { platform: "vinted", processing_since: null, published_at: "2026-11-02T13:42:00.000Z" };
  ok(gelsParPlateforme([fige], t, [importe]).has("vinted"), "une annonce importée (jamais traitée par un poste) ne lève pas le gel");
  const avantGel = { platform: "vinted", processing_since: "2026-11-02T11:00:00.000Z", published_at: "2026-11-02T11:02:00.000Z" };
  ok(gelsParPlateforme([fige], t, [avantGel]).has("vinted"), "une réussite d'AVANT le gel ne le lève pas");
  const autrePf = { platform: "leboncoin", processing_since: "2026-11-02T13:40:00.000Z", published_at: "2026-11-02T13:42:00.000Z" };
  ok(gelsParPlateforme([fige], t, [autrePf]).has("vinted"), "une réussite d'une AUTRE plateforme ne lève pas le gel");

  // Un nouveau gel (l'essai fige à son tour) remet le repos à zéro.
  const regel = { ...fige, id: "v0", platform_fields: { pas_de_rouge: { at: new Date(t + 4 * 60_000).toISOString(), motif: "canal_coupe" } } };
  const rr = rotationFiges(file, gelsParPlateforme([fige, regel], t + 6 * 60_000), t + 6 * 60_000);
  ok(rr.essais.length === 0 && rr.retenus.length === 77, "l'essai a figé à son tour : repos de nouveau, rien de servi pendant 10 min");

  // Ancienne forme (Set) : comportement d'avant, à l'identique.
  const ancien = rotationFiges(file, new Set(["vinted"]));
  ok(ancien.retenus.length === 77 && ancien.essais.length === 0, "appel avec un Set : comportement d'avant inchangé");
  ok(plateformesFigees([fige], t).has("vinted") && !plateformesFigees([fige], t, [essaiReussi]).has("vinted"), "plateformesFigees suit la même règle");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout passe");
process.exit(ko ? 1 : 0);
