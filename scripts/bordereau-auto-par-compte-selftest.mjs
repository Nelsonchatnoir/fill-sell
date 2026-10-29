// selftest:bordereau-auto-par-compte — (29/10, point 6) Le réglage du compte « Bordereau automatique »
// (platform_settings.bordereaux.auto) : activé par défaut ; false = AUCUNE demande automatique, sur aucune plateforme
// (garde AVANT le test de plateforme), les demandes automatiques encore en attente closes sans rien faire, les clics
// du vendeur intacts, rien d'effacé. Écriture par platform_settings_fusionner seulement.
//   npm run selftest:bordereau-auto-par-compte
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const ok = (cond, nom) => { assert.ok(cond, nom); n++; console.log(`  ✓ ${nom}`); };
console.log("bordereau-auto-par-compte-selftest");

const MIG = lire("supabase/migrations/20261029151000_bordereau_auto_par_compte.sql");
const INV = lire("supabase/rollbacks/20261029151000_bordereau_auto_par_compte_INVERSE.sql");
ok(/CREATE OR REPLACE FUNCTION public\.bordereau_auto_actif\(p_user uuid\)/.test(MIG)
  && MIG.includes("IS DISTINCT FROM 'false'::jsonb") && MIG.includes("'{bordereaux,auto}'"),
  "base : UNE aide dit si l'automatique est coupé — seulement si false est écrit");
ok(/REVOKE ALL ON FUNCTION public\.bordereau_auto_actif\(uuid\) FROM PUBLIC, anon, authenticated;/.test(MIG),
  "base : l'aide n'est pas appelable par l'app (aucun réglage d'autrui lisible)");
const fAuto = MIG.slice(MIG.indexOf("FUNCTION public.bordereau_auto_pour_commande"), MIG.indexOf("FUNCTION public.bordereau_demande_a_traiter"));
const iGarde = fAuto.indexOf("IF NOT public.bordereau_auto_actif(c.user_id) THEN RETURN 'coupe_par_le_vendeur'");
ok(iGarde > 0 && iGarde < fAuto.indexOf("IF c.platform <> 'vinted'") && iGarde < fAuto.indexOf("INSERT INTO bordereaux_demandes"),
  "base : la garde passe AVANT la plateforme et avant toute demande (toutes les plateformes, d'office)");
const fPrise = MIG.slice(MIG.indexOf("FUNCTION public.bordereau_demande_a_traiter"));
ok(/IF NOT public\.bordereau_auto_actif\(v_user\) THEN\s+UPDATE bordereaux_demandes SET statut = 'expiree', motif = 'auto_desactive', fini_le = now\(\)\s+WHERE user_id = v_user AND statut = 'demandee' AND coalesce\(choix ->> 'auto', ''\) = 'true';/.test(fPrise)
  && fPrise.indexOf("auto_desactive") < fPrise.indexOf("FOR UPDATE OF d SKIP LOCKED"),
  "base : une demande AUTOMATIQUE en attente est close avant la prise ; celles du vendeur passent");
ok(!/DELETE FROM|efface_le\s*=|bordereaux_copies SET/.test(MIG), "base : rien n'est effacé (ni demande, ni copie, ni fichier)");
ok(/DROP FUNCTION IF EXISTS public\.bordereau_auto_actif\(uuid\);/.test(INV) && !INV.includes("bordereau_auto_actif(c.user_id)"),
  "inverse prêt : les fonctions d'avant, l'aide retirée");

const FMT = lire("src/utils/formatBordereau.js");
const src = FMT.slice(FMT.indexOf("export function bordereauAutoDesReglages"), FMT.indexOf("export function libelleFormatBordereau"));
const auto = new Function(`${src.replace("export ", "")}; return bordereauAutoDesReglages;`)();
ok(auto(null) === true && auto({}) === true && auto({ bordereaux: { format: "code" } }) === true
  && auto({ bordereaux: { auto: true } }) === true && auto({ bordereaux: { auto: "false" } }) === true
  && auto({ bordereaux: { auto: false } }) === false,
  "app : même règle que la base — activé par défaut, coupé seulement par false");
ok(FMT.includes("fusionnerReglages(['bordereaux'], { auto: on })") && !/\.update\(\{\s*platform_settings/.test(FMT),
  "app : écriture par platform_settings_fusionner seulement, à côté du format");

const PAGE = lire("src/reglages/SousPageBordereaux.jsx");
ok(PAGE.includes("<Toggle checked={f.auto} onChange={basculerAuto} />") && PAGE.includes('className="rg-ligne"'),
  "Réglages : l'interrupteur, au style des autres (Préférences)");
ok(PAGE.includes("T.bordereauAutoNoteActive") && PAGE.includes("T.bordereauAutoNoteDesactive"), "Réglages : une phrase dit ce qu'il fait, dans ses deux positions");
const TXT = lire("src/reglages/textes.js");
for (const k of ["bordereauAutoNoteActive", "bordereauAutoNoteDesactive", "bordereauAutoActive", "bordereauAutoDesactive"]) {
  ok((TXT.match(new RegExp(`\\b${k}:`, "g")) || []).length === 2, `textes : « ${k} » en français et en anglais`);
}
ok(lire("src/messagerie/vue.js").includes("d.statut === 'expiree' && d.motif === 'auto_desactive') return null;"),
  "À expédier : une demande close par la coupure ne dit rien (le bouton revient)");
console.log(`bordereau-auto-par-compte-selftest : ${n} contrôles OK`);
