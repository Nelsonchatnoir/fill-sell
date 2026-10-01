// ═══════════════════════════════════════════════════════════════════════════
// Selftest de la GARDE DE RECHARGEMENT (2026-09-10)
//   node scripts/maj-extension-garde-selftest.mjs
//
// chrome.runtime.reload() tue le service worker SUR-LE-CHAMP. Sur une
// republication Vinted, l'étape 'captured' fait le chemin critique en une
// passe — formulaire rempli → suppression par l'API → étape 'deleted' →
// soumission du MÊME formulaire. Un reload entre la suppression et la
// soumission, et l'annonce est PERDUE, sans recréation possible : c'est
// l'accident du 12/08 (2 annonces perdues).
//
// Ce test vérifie, sur le code RÉELLEMENT embarqué (extrait de background.js,
// jamais recopié), que chacune des conditions de refus est présente, que le
// doute vaut refus, et que le reload se fait sous le verrou de flux.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(ROOT, "chrome-extension/background.js"), "utf8");

let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.log(`  ✗ ${nom} ${extra}`); }
};

// Le corps des deux fonctions qui décident.
const raisons = SRC.slice(
  SRC.indexOf("async function raisonsDeNePasRecharger"),
  // (01/10) jusqu'aux aides de la mise à jour active, qui ne décident pas.
  SRC.indexOf("// ── LA MISE À JOUR NE DOIT PLUS ATTENDRE QUE CHROME Y PENSE"),
);
const appliquer = SRC.slice(
  SRC.indexOf("async function appliquerMajSiSansRisque"),
  SRC.indexOf("async function appliquerMajSiSansRisque") + 4000,
);
if (!raisons || !appliquer) throw new Error("fonctions de garde introuvables dans background.js");

console.log("\n▸ Le rechargement se fait SOUS LE VERROU DE FLUX");
{
  check("appliquerMajSiSansRisque prend withJobFlowLock",
    /withJobFlowLock\("maj-extension"/.test(appliquer),
    "— sans verrou, un job peut démarrer entre la vérification et le reload");
  check("le reload est DANS le verrou, après la vérification",
    appliquer.indexOf("withJobFlowLock") < appliquer.indexOf("chrome.runtime.reload()"));
  check("les raisons sont relues À L'INTÉRIEUR du verrou",
    appliquer.indexOf("withJobFlowLock") < appliquer.indexOf("raisonsDeNePasRecharger"));
  check("aucune raison ⇒ on recharge ; sinon on sort sans rien faire",
    /if \(raisons\.length\) \{[\s\S]{0,400}?return false;/.test(appliquer));
}

console.log("\n▸ Les quatre familles d'état qui INTERDISENT le rechargement");
{
  check("① une suppression actée non conclue (mémoire)",
    /republishSupprimes\.size/.test(raisons),
    "— entre suppression et recréation, un reload perd l'annonce");
  // (01/10, décision Nico) Une file chargée garde la fenêtre de travail
  // ouverte en permanence : elle ne bloque plus, elle est FERMÉE sous le
  // verrou juste avant le rechargement (aucun job n'y tourne).
  check("② la fenêtre de travail n'est plus un blocage, elle est fermée avant le reload",
    !/fenetresCreeesVivantes\(\)/.test(raisons)
      && appliquer.indexOf("fermerFenetresAvantMaj()") > -1
      && appliquer.indexOf("fermerFenetresAvantMaj()") < appliquer.indexOf("chrome.runtime.reload()"));
  check("⑤ un relevé EN COURS bloque (annonces ou dressing)",
    /vinted_sync_runs\?status=eq\.running/.test(raisons));
  check("③ un job 'processing' EN BASE (la mémoire ment après un redémarrage du worker)",
    /status=eq\.processing/.test(raisons));
  check("④ une republication à l'étape 'deleted' (annonce HORS LIGNE), EN BASE",
    /republish_step=eq\.deleted/.test(raisons),
    "— suppression faite, recréation non conclue : le seul état À L'ARRÊT où quelque chose est en jeu");
  // ⚠️ NE PAS élargir : mesuré le 10/09, sur les 381 republications pending du
  // parc, 234 sont à 'captured' et 139 à 'a_capturer' — 98 %. À ces deux
  // étapes l'annonce d'origine est INTACTE. Les bloquer reviendrait à ne
  // jamais recharger chez ceux qui republient, c'est-à-dire à ne pas corriger
  // le problème pour Joséphine et Ornella.
  check("④ ne bloque PAS sur 'captured' ni 'a_capturer' (annonce intacte, 98 % du parc)",
    !/republish_step[^&\n]*a_capturer/.test(raisons) && !/republish_step[^&\n]*captured,/.test(raisons),
    "— sinon un compte qui republie n'est jamais mis à jour");
}

console.log("\n▸ LE DOUTE VAUT REFUS — toute lecture ratée bloque");
{
  check("session absente → raison de refus",
    /raisons\.push\("session FillSell absente/.test(raisons));
  check("état des jobs illisible → raison de refus",
    /catch[\s\S]{0,120}?raisons\.push\(`état des jobs illisible/.test(raisons));
  // La forme qui compte : on AJOUTE une raison dans le catch. Un catch vide
  // (ou un `return []`) ferait passer une lecture ratée pour un feu vert.
  check("aucun catch ne rend silencieusement « tout va bien »",
    !/catch[^{]*\{\s*\}/.test(raisons),
    "— un catch vide transformerait un doute en autorisation");
}

console.log("\n▸ Un job 'pending' n'est PAS un obstacle");
{
  // Les pending ne peuvent pas démarrer tant qu'on tient le verrou, et la
  // nouvelle version les reprendra. Les bloquer reviendrait à ne jamais
  // recharger chez les comptes actifs — précisément ceux qu'on veut débloquer.
  const clause = (raisons.match(/status=eq\.processing[^"]*/) ?? [""])[0];
  check("la requête « job en vol » ne vise que 'processing'",
    clause.includes("processing") && !/status=in\.\(pending/.test(clause));
  check("les republications, elles, sont bloquées dès 'pending'",
    /action=eq\.republish&status=in\.\(pending,processing\)/.test(raisons),
    "— leur chemin critique est sans retour, on ne prend aucun risque");
}

console.log("\n▸ Le marqueur de version en attente");
{
  check("onUpdateAvailable est écouté", /chrome\.runtime\.onUpdateAvailable\.addListener/.test(SRC));
  check("la version attendue est rangée en storage.session (survit à la mort du worker)",
    /chrome\.storage\.session\.set\(\{ \[MAJ_ATTENTE_KEY\]/.test(SRC));
  check("elle est tentée immédiatement à la réception", /appliquerMajSiSansRisque\("onUpdateAvailable"\)/.test(SRC));
  check("et retentée à chaque fin de cycle de poll", /appliquerMajSiSansRisque\("fin de cycle"\)/.test(SRC));
  check("le marqueur est effacé une fois la mise à jour installée",
    /onInstalled[\s\S]{0,300}?storage\.session\.remove\(MAJ_ATTENTE_KEY\)/.test(SRC));
  check("la version en attente part au serveur (mesure)", /maj_en_attente: await lireMajEnAttente\(\)/.test(SRC));
  const n = (SRC.match(/maj_en_attente: await lireMajEnAttente\(\)/g) ?? []).length;
  check("dans LES DEUX corps de poll", n === 2, `→ ${n}`);
}

console.log("\n▸ (01/10) La mise à jour passe ENTRE DEUX JOBS, et Chrome est relancé");
{
  const i0 = SRC.indexOf("── LA MISE À JOUR PASSE ENTRE DEUX JOBS");
  const boucle = SRC.slice(i0, i0 + 2200);
  check("la boucle de jobs s'arrête quand une version attend ET que rien ne s'y oppose",
    /if \(!etapeDeleted && \(await majPrete\(\)\)\) \{[\s\S]{0,200}?majPlanifiee = true;[\s\S]{0,300}?break;/.test(boucle));
  check("une republication à l'étape 'deleted' passe toujours",
    /republish_step === "deleted"/.test(boucle));
  check("majPrete = version en attente ET aucune raison de refus",
    /async function majPrete\(\) \{[\s\S]{0,200}?lireMajEnAttente\(\)[\s\S]{0,200}?raisonsDeNePasRecharger\(\)\)\.length === 0/.test(SRC));
  check("aucun travail ne démarre après l'arrêt (re-captures, veilleur, republication auto)",
    /if \(majPlanifiee\) \{[\s\S]{0,120}?return;/.test(SRC));
  check("ni relevé ni sync après l'arrêt", /if \(planifiee\) return;/.test(SRC));
  check("chaque cycle repart sans rechargement prévu", /majPlanifiee = false;/.test(SRC));
  check("Chrome est interrogé (requestUpdateCheck), 2 h au plus",
    /chrome\.runtime\.requestUpdateCheck\(\)/.test(SRC) && /MAJ_VERIF_PERIODE_MS = 2 \* 3600_000/.test(SRC));
  check("trace usage_logs maj_extension (ancien build, nouveau build, jobs en attente)",
    /ancien_build: FILLSELL_BUILD_ID/.test(SRC) && /nouveau_build: FILLSELL_BUILD_ID/.test(SRC)
      && /jobs_en_attente: enAttente/.test(SRC) && /feature: "maj_extension"/.test(SRC));
}

console.log("\n▸ Rien de tout ça ne peut faire échouer un job");
{
  check("l'appel de fin de cycle est fire-and-forget",
    /appliquerMajSiSansRisque\("fin de cycle"\)\.catch\(\(\) => \{\}\)/.test(SRC));
  check("appliquerMajSiSansRisque ne remonte jamais d'exception",
    /\}\)\.catch\(\(e\) => \{[\s\S]{0,220}?return false;\s*\}\);/.test(appliquer));
  check("sans version en attente, la fonction sort tout de suite",
    /const version = await lireMajEnAttente\(\);\s*\n\s*if \(!version\) return false;/.test(appliquer));
}

console.log(
  echecs === 0
    ? "\n[selftest:maj-extension-garde] OK — on ne recharge que sous verrou, sans job en vol, et le doute vaut refus.\n"
    : `\n[selftest:maj-extension-garde] ÉCHEC — ${echecs} vérification(s) en défaut.\n`,
);
process.exit(echecs === 0 ? 0 : 1);
