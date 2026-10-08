// ═══════════════════════════════════════════════════════════════════════════
// Selftest « Vinted : la fiche et le signal suivent l'annonce en ligne » (08/10)
//   node scripts/vinted-annonce-en-ligne-selftest.mjs
//
// LE CAS (louis@ttfamily.fr) : la synchro du dressing collait la vente d'une
// ANCIENNE annonce (job déjà « sold ») au job publié de la fiche — l'annonce
// NEUVE, en ligne ; et réécrivait sur la fiche l'id et le statut « sold » de
// l'ancienne. 06/10 15:02 : 14 « Oui » sur ces bandeaux, 14 ventes, 14
// remises en vente ; 4 annonces « vendues » toujours en ligne le lendemain.
// Preuves en base (transactions annulées) : docs/reprise/terminal-cloture-multi-synchro-0810.md.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vintedRemplaceeParUneEnLigne } from "../src/utils/publicationState.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

const MAINTENANT = Date.parse("2026-10-08T10:00:00Z");
// « 12 adaptateurs Jaune » après réparation : la fiche suit 10254055978, en ligne au dressing du 07/10 22:03.
const JAUNE = { id: 1789898056278, vinted_item_id: "10254055978", vinted_status: "active", disparu_le: null, last_synced_at: "2026-10-07T22:03:18Z" };
// Le job de la remise du 06/10 (10269420655), disparue du dressing, signalée « plus en ligne ».
const JOB_DISPARU = { id: "448d8a6a", platform: "vinted", inventaire_id: 1789898056278, listing_url: "https://www.vinted.fr/items/10269420655",
  platform_fields: { sale_signal: "unavailable", unavailable_since: "2026-10-07T07:18:46.169Z" } };

console.log("\n[1] La question « Vendue ? » ne se pose pas pour une annonce remplacée par une annonce en ligne");
ok("Louis, Jaune : la copie disparue ne pose plus « Vendue ? »", vintedRemplaceeParUneEnLigne(JOB_DISPARU, JAUNE, MAINTENANT) === true);
ok("une preuve positive (« 🎉 Vendue ») n'est jamais masquée",
  vintedRemplaceeParUneEnLigne({ ...JOB_DISPARU, platform_fields: { sale_signal: "sold" } }, JAUNE, MAINTENANT) === false);
ok("la fiche sur CETTE annonce : la question reste",
  vintedRemplaceeParUneEnLigne(JOB_DISPARU, { ...JAUNE, vinted_item_id: "10269420655" }, MAINTENANT) === false);
ok("la fiche vendue (aucune annonce en ligne) : la question reste",
  vintedRemplaceeParUneEnLigne(JOB_DISPARU, { ...JAUNE, vinted_status: "sold" }, MAINTENANT) === false);
ok("la fiche disparue : la question reste",
  vintedRemplaceeParUneEnLigne(JOB_DISPARU, { ...JAUNE, disparu_le: "2026-10-07T23:00:00Z" }, MAINTENANT) === false);
ok("un dressing de plus de 48 h ne prouve plus rien : la question reste",
  vintedRemplaceeParUneEnLigne(JOB_DISPARU, { ...JAUNE, last_synced_at: "2026-10-05T22:03:18Z" }, MAINTENANT) === false);
ok("les autres plateformes ne changent pas",
  vintedRemplaceeParUneEnLigne({ ...JOB_DISPARU, platform: "leboncoin" }, JAUNE, MAINTENANT) === false);
ok("sans fiche : la question reste", vintedRemplaceeParUneEnLigne(JOB_DISPARU, null, MAINTENANT) === false);

console.log("\n[2] L'app s'en sert partout où la question s'affiche ou se compte");
const app = lire("src/App.jsx");
ok("le bandeau saute la copie remplacée", /if\(remplaceeEnLigne\(job\)\)return null;/.test(app));
ok("le compteur des questions aussi", /sale_signal!=='sold'&&!remplaceeEnLigne\(j\)\)/.test(app));
ok("« à vérifier » aussi", /estAVerifier\(j\)&&!remplaceeEnLigne\(j\)/.test(app));

console.log("\n[3] La base : migrations 20261008110000 et 20261008111000");
const m4 = lire("supabase/migrations/20261008110000_vinted_fiche_et_signal_suivent_l_annonce_en_ligne.sql");
const m5 = lire("supabase/migrations/20261008111000_vinted_fiche_recule_sur_preuve.sql");
ok("le dressing dément un signal posé AVANT un relevé « active »", /signale_le <= n\.captured_at/.test(m4) && /n\.status = 'active'/.test(m4));
ok("déclencheurs PAR INSTRUCTION (jamais ligne à ligne sur 2 647 relevés)", (m4.match(/FOR EACH STATEMENT EXECUTE FUNCTION public\.vinted_dressing_dement_signaux\(\)/g) ?? []).length === 2);
ok("la vente refusée sur une annonce revue en ligne", /Cette annonce est toujours en ligne sur Vinted/.test(m4));
ok("la vente refusée sur une annonce remplacée par une en ligne", /sous une autre annonce/.test(m4));
ok("la remise attend tant que l'annonce vendue est en ligne", /annonce_vendue_encore_en_ligne/.test(m4) && /interval '6 hours'/.test(m4));
ok("un signal retiré n'annonce rien (ni push ni mail)", /motif = 'signal_dementi'/.test(m4));
ok("Vinted attend 2 min que le dressing ait pu démentir", /r\.plateforme = 'vinted' and r\.cree_le > now\(\) - interval '2 minutes'/.test(m4));
ok("la fiche ne recule que sur PREUVE (jamais sur un silence du dressing)", /PREUVE à l'appui/.test(m5) && !/26 hours/.test(m5));
ok("preuve = vendue/fermée, disparue, job clos ou signalé", /IN \('sold', 'closed'\)/.test(m5) && /j\.status IN \('sold', 'cancelled', 'deleted'\) OR j\.platform_fields \? 'unavailable_since'/.test(m5));
ok("inverses prêts", ["20261008110000_vinted_fiche_et_signal_suivent_l_annonce_en_ligne_INVERSE.sql", "20261008111000_vinted_fiche_recule_sur_preuve_INVERSE.sql"]
  .every((f) => fs.existsSync(path.join(RACINE, "supabase/rollbacks", f))));

console.log(ko ? `\n❌ ${ko} contrôle(s) en échec.` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
