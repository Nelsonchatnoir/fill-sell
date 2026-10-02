// Autotest — « plusieurs annonces identiques » tranché par les faits —
// `npm run selftest:recreation-impasse-vinted`
// (supabase/functions/_shared/recreation-impasse-vinted.js, get-pending-jobs).
// Heures RELEVÉES en base le 02/10 (cf. le module) :
//   · nivake03 0b54edbc « Gomme » : retirée 29/09 16:58 Paris (14:58Z),
//     tentative 30/09 22:40 Paris (20:40Z), impasse 02/10 02:32 Paris ; ses 5
//     Gommes postées à la main le 01/10 15:03-15:08 Paris (13:03-13:08Z) ;
//   · 9cdr9rm4rn 6afed5b9 « Pantalon 24 mois » : retrait une-passe 02/10
//     04:12:56 Paris (02:12:56Z), recréation 08:07 Paris (06:07Z), impasse
//     08:16 Paris (06:16Z) ; deux copies supposées vers 02:13Z et 06:08Z.
import { impasseRecreationVinted, decisionImpasseRecreation } from "../supabase/functions/_shared/recreation-impasse-vinted.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const MSG = "Republication en pause : plusieurs annonces identiques sont en ligne sur Vinted (une republication a abouti deux fois). Garde l'annonce que tu veux, supprime l'autre, puis relance depuis la fiche de l'article. Rien n'a été recréé.";
const gomme = {
  id: "0b54edbc", platform: "vinted", action: "republish", status: "needs_user", error: MSG,
  platform_fields: {
    republish_step: "deleted", vinted_item_id: "10138771005",
    deleted_at: "2026-09-29T14:58:00Z", deleted_at_serveur: "2026-09-29T14:58:00Z",
    recreation_tentee: { at: "2026-09-30T20:40:00Z", n: 1 },
    recreation_doublon: { at: "2026-10-02T00:32:00Z", raison: "5 annonces correspondent" },
  },
};
const pantalon = {
  id: "6afed5b9", platform: "vinted", action: "republish", status: "needs_user", error: MSG,
  platform_fields: {
    republish_step: "deleted", vinted_item_id: "7737483331",
    deleted_at: "2026-10-02T02:12:56Z", deleted_at_serveur: "2026-10-02T02:12:56Z",
    recreation_tentee: { at: "2026-10-02T06:07:21Z", n: 1 },
    recreation_doublon: { at: "2026-10-02T06:16:55Z", raison: "2 annonces correspondent" },
  },
};
const releveComplet = (at) => ({ kind: "dressing", status: "done", started_at: at, items_vus: 48, total_entries: 48 });
const MAINTENANT = Date.parse("2026-10-02T09:00:00Z");

console.log("\n1. L'IMPASSE EST RECONNUE");
ok(!!impasseRecreationVinted(gomme) && !!impasseRecreationVinted(pantalon), "les deux impasses du 02/10");
ok(!impasseRecreationVinted({ ...gomme, platform_fields: { ...gomme.platform_fields, republish_step: "captured" } }), "jamais avant le retrait");
ok(!impasseRecreationVinted({ ...gomme, status: "pending" }), "seulement en needs_user");

console.log("\n2. PAS DE CONCLUSION SANS RELEVÉ COMPLET APRÈS L'IMPASSE");
ok(decisionImpasseRecreation(gomme, { releves: [], fiches: [] }) === null, "aucun relevé → on attend");
ok(decisionImpasseRecreation(gomme, { releves: [releveComplet("2026-10-02T00:20:00Z")], fiches: [] }) === null, "relevé AVANT l'impasse → on attend");
ok(decisionImpasseRecreation(gomme, { releves: [{ ...releveComplet("2026-10-02T00:36:00Z"), items_vus: 30 }], fiches: [] }) === null, "relevé incomplet (30/48) → on attend");

console.log("\n3. NIVAKE03 : SES GOMMES À ELLE NE SONT PAS LES NÔTRES");
const fichesNivake = [0, 1, 2, 3, 5].map((m, i) => ({ vinted_item_id: `1020353361${i}`, listed_at_guess: `2026-10-01T13:0${m}:00Z` }));
const dg = decisionImpasseRecreation(gomme, { releves: [releveComplet("2026-10-02T00:36:00Z")], fiches: fichesNivake, maintenant: MAINTENANT });
ok(dg?.action === "relancer" && dg.status === "pending", "aucune annonce pendant nos envois → la recréation repart", JSON.stringify(dg?.apparues));
ok(!dg.platform_fields.recreation_doublon && dg.platform_fields.recreation_tentee?.at, "impasse levée, tentative conservée (le dressing sera relu avant de recréer)");
ok(/une seule fois/.test(dg.error) && /rien à faire/.test(dg.error), "message vrai, aucun geste");

console.log("\n4. 9CDR9RM4RN : NOS DEUX ENVOIS ONT CHACUN CRÉÉ UNE COPIE");
const fiches9 = [
  { vinted_item_id: "7742925895", listed_at_guess: "2025-12-11T10:00:00Z" },      // l'autre vraie annonce, ancienne
  { vinted_item_id: "10205000001", listed_at_guess: "2026-10-02T02:13:40Z" },     // copie A (une-passe orpheline)
  { vinted_item_id: "10205900002", listed_at_guess: "2026-10-02T06:08:30Z" },     // copie B (recréation)
];
const dp = decisionImpasseRecreation(pantalon, { releves: [releveComplet("2026-10-02T08:30:00Z")], fiches: fiches9, maintenant: MAINTENANT });
ok(dp?.action === "en_double" && dp.status === "needs_user", "copies nées de nos envois → rien de recréé", JSON.stringify(dp?.apparues));
ok(dp.apparues.length === 2 && !dp.apparues.some((a) => a.id === "7742925895"), "l'ancienne annonce homonyme n'est PAS comptée (un titre ne prouve rien)");
ok(/en ligne 2 fois/.test(dp.error) && /items\/10205000001/.test(dp.error) && !/Rien n'a été recréé\.$/.test(dp.error), "message vrai : en ligne deux fois, avec les liens");
ok(decisionImpasseRecreation({ ...pantalon, error: dp.error, platform_fields: dp.platform_fields }, { releves: [releveComplet("2026-10-02T08:30:00Z")], fiches: fiches9, maintenant: MAINTENANT })?.error === dp.error, "rejoué : même message (aucune réécriture inutile)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ « annonces identiques » : jugé sur numéros et heures, jamais sur un titre");
