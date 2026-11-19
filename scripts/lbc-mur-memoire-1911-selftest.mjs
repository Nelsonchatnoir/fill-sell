// VERROU (19/11/2026 soir, demande de Nico — compte Leboncoin PRO e95e8b9d, hors forfait) : AUCUNE ANNONCE D'UN COMPTE HORS
// FORFAIT N'EST RETIRÉE POUR ÊTRE REPUBLIÉE PARCE QUE LE MUR A ÉTÉ OUBLIÉ.
// Le cas : 20 republications créées à 17:45 ; la 1re (eed04b56, « Acrylique sur toile ») retirée à 17:51:40 puis bloquée
// sur « Valider et payer » (5 essais, recreation_bloquee) ; les 19 autres retenues à 17:59 seulement, une fois ce mur vu.
// Cause : get-pending-jobs ne lisait le mur que sur les tâches OUVERTES (needs_user, pending, processing) ; les 7 murs du
// compte sur 30 jours (dernier le 02/11 14:49, aucun dépôt sans paiement depuis) étaient tous ANNULÉS → mur oublié → la
// republication servie, retirée, puis payante. Maintenant le mur se souvient aussi des tâches closes sur la même fenêtre.
// Rejeu sur les données réelles du compte (lecture seule, 19/11 soir) : 7 murs, 0 ouvert, 0 dépôt libre après → retenue.
// Rouge sur 41eefce, vert après.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as F from "../supabase/functions/_shared/lbc-forfait.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let echecs = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };
const gpj = fs.readFileSync(path.join(ROOT, "supabase/functions/get-pending-jobs/index.ts"), "utf8").replace(/\r\n/g, "\n");

// Les murs du compte, tels qu'en base au 19/11 17:45 : tous clos.
const mur = (id, status, at, quoi = F.MOTIF_LBC_A_PAYER) => ({ id, platform: "leboncoin", status, action: "publish", created_at: at,
  platform_fields: { last_diagnostic: { quoi, at } } });
const clos = [mur("a", "cancelled", "2026-10-31T13:57:00Z"), mur("b", "cancelled", "2026-11-02T13:49:00Z", F.MOTIF_LBC_PAYANT)];
ok(F.dernierMurForfait([]) === 0, "AVANT : les tâches ouvertes seules → aucun mur (la republication partait)");
ok(F.dernierMurForfait(clos) === Date.parse("2026-11-02T13:49:00Z"), "les murs des tâches CLOSES comptent → dernier mur le 02/11 14:49 (Paris)");
ok(!F.publicationApresMur([{ status: "published", published_at: "2026-10-31T12:26:00Z" }], F.dernierMurForfait(clos)), "aucun dépôt sans paiement depuis ce mur");
ok(F.publicationApresMur([{ status: "published", published_at: "2026-11-05T10:00:00Z" }], F.dernierMurForfait(clos)), "un dépôt sans paiement après le mur lève la retenue (le forfait couvre de nouveau)");
ok(!F.publicationApresMur([{ status: "published", published_at: "2026-11-05T10:00:00Z", platform_fields: { lbc_depot: { preuve: "paiement_utilisateur" } } }], F.dernierMurForfait(clos)),
  "un dépôt PAYÉ par la personne ne prouve rien sur le forfait");
const rep = { platform: "leboncoin", action: "republish", platform_fields: { republish_step: "captured" } };
ok(F.candidatRetenueForfait(rep) && !F.candidatRetenueForfait({ ...rep, platform_fields: { republish_step: "deleted" } }),
  "une republication PAS ENCORE retirée est retenue ; une déjà retirée suit son circuit de recréation");

const bloc = gpj.slice(gpj.indexOf("const candidatsForfait = out.filter"), gpj.indexOf("if (motifMur === MOTIF_LBC_A_PAYER)"));
ok(/\.not\("status", "in", "\(needs_user,pending,processing\)"\)/.test(bloc) && /in\("platform_fields->last_diagnostic->>quoi", \[\.\.\.MOTIFS_LBC_PAIEMENT\]\)/.test(bloc),
  "get-pending-jobs lit aussi les murs des tâches closes (même motifs)");
ok(/gte\("created_at", new Date\(Date\.now\(\) - FENETRE_FORFAIT_MS\)/.test(bloc.slice(bloc.indexOf("mursClos"))), "… sur la même fenêtre de 30 jours");
ok(/const murForfait = dernierMurForfait\(mursMemoire as never\[\]\);/.test(bloc) && /const motifMur = dernierMotifMur\(mursMemoire as never\[\]\);/.test(bloc),
  "le mur ET son motif se lisent sur cette mémoire");

console.log(echecs ? `✗ lbc-mur-memoire-1911 : ${total - echecs}/${total}` : `✓ lbc-mur-memoire-1911 : ${total}/${total}`);
process.exit(echecs ? 1 : 0);
