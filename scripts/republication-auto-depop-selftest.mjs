// `npm run selftest:republication-auto-depop` — LA REPUBLICATION AUTOMATIQUE
// DEPOP PASSE PAR LE MÊME CIRCUIT QUE LES AUTRES (10/10/2026, Nico).
//
// Ce que ce test tient, sans base ni réseau :
//   1. l'app : Depop est dans la liste de la republication planifiée (la même
//      que le serveur), sa ligne n'existe que là où l'app PROPOSE Depop
//      (extension ≥ 0.6.106, même règle que la publication), une plateforme
//      active garde sa ligne, Opla fermée n'en a plus ;
//   2. le serveur : get-pending-jobs prend la liste des créneaux DU SERVEUR
//      (plus aucune liste écrite en dur) ; une republication AUTOMATIQUE d'un
//      article que Depop interdit est close sans question, annonce intacte ;
//   3. la base : la migration 20261010100000 retire des candidats tout article
//      qu'une plateforme interdit, part de la définition lue en prod (md5) et ne
//      touche pas la branche Vinted ; l'inverse rend la définition à l'octet.
//
//   node --import ./scripts/loader-ext.mjs scripts/republication-auto-depop-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");
const charger = (p) => import(pathToFileURL(path.join(RACINE, p)).href);
let ok = 0, ko = 0;
const dit = (nom, c, detail = "") => { if (c) ok++; else { ko++; console.log(`  ✗ ${nom}${detail ? `   ← ${detail}` : ""}`); } };
const meme = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 1. L'app ─────────────────────────────────────────────────────────────────
const H = await charger("src/hooks/useRepublicationPlanifiee.js");
const SF = await charger("src/utils/stockFiltres.js");
const B = await charger("src/utils/basculeOplaDepop.js");

const mig0923 = lire("supabase/migrations/20261009230000_bascule_opla_depop_minuit.sql");
const listeServeur = (mig0923.match(/SELECT ARRAY\[([^\]]*)\]::text\[\]/) ?? [])[1]?.match(/'([a-z]+)'/g)?.map((x) => x.slice(1, -1)) ?? [];
dit("app : Depop dans la republication planifiée", H.PLATEFORMES_PLANIFIEES.includes("depop"));
dit("app : la même liste que le serveur (republish_planifiee_plateformes)", meme([...H.PLATEFORMES_PLANIFIEES].sort(), [...listeServeur].sort()), `${H.PLATEFORMES_PLANIFIEES} / ${listeServeur}`);
dit("app : eBay n'y est jamais (voie API)", !H.PLATEFORMES_PLANIFIEES.includes("ebay"));

const ouvert = (pf, extra = {}) => ({ platform: pf, ouverte: true, actif: false, ...extra });
const tout = { vinted: ouvert("vinted"), leboncoin: ouvert("leboncoin"), beebs: ouvert("beebs"), opla: ouvert("opla", { ouverte: false }), depop: ouvert("depop") };
const APRES = Date.parse("2026-10-10T08:00:00Z");
const compteDe = (versions) => SF.plateformesDuCompte(B.etatBascule({ maintenant: APRES, interrupteur: 1791583200, depopAutoriseServeur: true, versionsExtension: versions }).plateformesOuvertes);

const v106 = H.plateformesPlanifieesVisibles(tout, compteDe(["0.6.106"]));
dit("extension 0.6.106 : Depop a sa ligne, Opla non", meme(v106, ["vinted", "leboncoin", "beebs", "depop"]), String(v106));
const v105 = H.plateformesPlanifieesVisibles(tout, compteDe(["0.6.105"]));
dit("extension 0.6.105 : pas de ligne Depop (même règle que la publication)", meme(v105, ["vinted", "leboncoin", "beebs"]), String(v105));
const inconnue = H.plateformesPlanifieesVisibles(tout, compteDe([null]));
dit("extension inconnue : pas de ligne Depop", !inconnue.includes("depop"));
const actifSans = H.plateformesPlanifieesVisibles({ ...tout, depop: ouvert("depop", { actif: true }) }, compteDe(["0.6.105"]));
dit("Depop ACTIVE garde sa ligne même sans extension lue (ce qui tourne se voit et s'arrête)", actifSans.includes("depop"));
const oplaActive = H.plateformesPlanifieesVisibles({ ...tout, opla: ouvert("opla", { ouverte: false, actif: true }) }, compteDe(["0.6.106"]));
dit("Opla fermée par le serveur : aucune ligne, même active", !oplaActive.includes("opla"));
const sansCompte = H.plateformesPlanifieesVisibles(tout);
dit("sans liste du compte : comportement d'avant (seule la fermeture serveur masque)", meme(sansCompte, ["vinted", "leboncoin", "beebs", "depop"]), String(sansCompte));
const depopFermee = H.plateformesPlanifieesVisibles({ ...tout, depop: ouvert("depop", { ouverte: false }) }, compteDe(["0.6.106"]));
dit("pf_depop à 0 côté serveur : la ligne s'efface", !depopFermee.includes("depop"));

const ecran = lire("src/components/RepublicationPlanifiee.jsx");
dit("écran : le nom de Depop", /const NOMS = \{[^}]*depop: 'Depop'/.test(ecran));
dit("écran : Depop « Retrait puis redépôt »", /depop:\s*\{ fr: 'Retrait puis redépôt', en: 'Remove then repost' \}/.test(ecran));
dit("écran : Depop fait remonter (annonce recréée)", /const REMONTE_LE_FIL = \{[^}]*depop: true/.test(ecran));
dit("écran : la liste filtrée par les plateformes du compte", ecran.includes("plateformesPlanifieesVisibles(parPlateforme, plateformesCompte)"));
dit("écran : le refus « depop_non_ouvert » se dit en français", ecran.includes("depop_non_ouvert: fr ?"));
const reglages = lire("src/reglages/ReglagesPage.jsx");
dit("Réglages : plateformesDuCompte(plateformesOuvertes) servie à l'écran", reglages.includes("plateformesDuCompte(plateformesOuvertes ?? [])") && reglages.includes("plateformesCompte={plateformesCompte}"));
dit("Réglages : le nom de Depop dans la ligne du hub", /NOMS_PF_REPUB = \{[^}]*depop: 'Depop'/.test(reglages));
dit("aucun chiffre de quota ajouté à la ligne Depop (même rendu que les autres)", !/depop[^\n]{0,80}quota/i.test(ecran));

// ── 2. Le serveur ────────────────────────────────────────────────────────────
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
dit("get-pending-jobs : plus de liste des créneaux écrite en dur", !gpj.includes("PF_CRENEAU"));
dit("get-pending-jobs : toutes les fenêtres rendues par le serveur sont lues", gpj.includes("for (const [pf, f] of Object.entries(m)) poser(pf, f ?? null);"));
dit("get-pending-jobs : la retenue de créneau vaut pour toute plateforme rendue", /const f = fenetres\[String\(\(j as \{ platform\?: string \}\)\.platform \?\? ""\)\];/.test(gpj));
const filet = gpj.slice(gpj.indexOf("LES CATÉGORIES QUE DEPOP INTERDIT"), gpj.indexOf("LES FRAIS DE PORT PAR DÉFAUT"));
dit("interdit + republication AUTOMATIQUE intacte → close (cancelled), aucune question", /const autoIntacte = j\.action === "republish" && pfI\["republish_source"\] === "auto" && !retraitEngage\(j\);/.test(filet)
  && /autoIntacte\s*\?\s*await userClient\.from\("cross_post_jobs"\)\s*\.update\(\{\s*status: "cancelled",/.test(filet));
dit("… avec la phrase de la règle et « annonce intacte »", filet.includes("Republication automatique Depop non lancée : ${messageDepopInterdit(verdict, \"fr\")} Ton annonce Depop est intacte, rien n'a été retiré."));
dit("… et le verdict posé sur le job (lu par les candidats)", (filet.match(/depop_interdit: depopInterdit/g) ?? []).length === 2);
dit("… jamais hors de pending", (filet.match(/\.eq\("id", j\.id\)\.eq\("status", "pending"\)/g) ?? []).length === 2);
dit("manuelle, ou retrait déjà engagé : la question d'avant (needs_user)", /:\s*await userClient\.from\("cross_post_jobs"\)\s*\.update\(\{\s*status: "needs_user",/.test(filet));
dit("le filet passe AVANT la retenue de créneau (une auto hors créneau est jugée aussi)", gpj.indexOf("LES CATÉGORIES QUE DEPOP INTERDIT") < gpj.indexOf("let heldCreneau = 0;"));

// ── 3. La base ───────────────────────────────────────────────────────────────
const mig = lire("supabase/migrations/20261010100000_republication_auto_jamais_un_interdit.sql");
const inv = lire("scripts/reparations/20261010_inverse_republication_auto_jamais_un_interdit.sql");
dit("migration : gardée par le md5 de la définition lue en prod", mig.includes("8c875235a90cc63eff0e716c9af497a2") && mig.includes("RAISE EXCEPTION"));
dit("migration : un article interdit par la plateforme n'est jamais candidat", /AND NOT EXISTS \(\s*SELECT 1 FROM cross_post_jobs x\s*WHERE x\.inventaire_id = i\.id AND x\.user_id = p_user AND x\.platform = v_pf\s*AND x\.platform_fields \? \(v_pf \|\| '_interdit'\)\)/.test(mig));
const corps = (s) => s.slice(s.indexOf("CREATE OR REPLACE FUNCTION public.republish_planifiee_candidats"), s.lastIndexOf("$function$") + 10);
const cMig = corps(mig), cInv = corps(inv);
const vintedDe = (c) => c.slice(c.indexOf("-- ── VINTED"));
dit("migration : branche Vinted identique à la prod, à l'octet", vintedDe(cMig) === vintedDe(cInv) && vintedDe(cMig).length > 500);
const sansAjout = cMig.replace(/\n        -- \(10\/10, Nico\) UNE PLATEFORME QUI INTERDIT[\s\S]*?AND x\.platform_fields \? \(v_pf \|\| '_interdit'\)\)/, "");
dit("migration : seule l'insertion diffère de la prod", sansAjout === cInv, `${sansAjout.length} / ${cInv.length}`);
dit("migration : transaction, délais bornés, inscrite par migration repair", /BEGIN;\s*SET LOCAL statement_timeout = '60s';\s*SET LOCAL lock_timeout = '5s';/.test(mig) && /COMMIT;\s*$/.test(mig) && mig.includes("migration repair --linked --status applied 20261010100000"));

console.log(`${ko ? "✗" : "✓"} republication-auto-depop : ${ok} vert(s), ${ko} rouge(s)`);
process.exit(ko ? 1 : 0);
