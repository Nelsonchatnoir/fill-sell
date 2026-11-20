// ═══════════════════════════════════════════════════════════════════════════
// LA LECTURE DE L'ANNONCE D'ORIGINE PASSE DEVANT LA FILE (25/10, Louis) — `npm run selftest:lecture-origine-devant`
// ═══════════════════════════════════════════════════════════════════════════
// louis-seller, 25/10 10:29-10:35 : lot « Publier 5 articles » arrêté sur « Lecture de ton annonce d'origine » ; les
// 5 lectures demandées n'étaient faites qu'APRÈS la boucle des tâches du cycle (et ratées sans trace). La règle :
//   · serveur (extensions ≥ 0.6.144 depuis le 25/10 après-midi — avant, le lecteur ne lisait rien) : une lecture Vinted demandée il y a < 15 min, pas faite, < 3 essais, passe
//     devant — le cycle ne porte que ce qui ne peut pas attendre (passeAvantLaSynchro), jamais pendant une pause
//     anti-robot, jamais vers une extension qui ne sait pas lire ;
//   · extension (0.6.143) : lecture AVANT la boucle des tâches quand elle est demandée récemment, pas deux séries
//     dans le même cycle, et une lecture ratée dit pourquoi (usage_logs « lecture_origine_echec », une fois par heure).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8");
let ok = 0, ko = 0;
const verifier = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { ko++; console.log(`  ✗ ${m}`); } };

console.log("1. Serveur — get-pending-jobs");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  const i = gpj.indexOf("LA LECTURE DE L'ANNONCE D'ORIGINE PASSE DEVANT LA FILE");
  const bloc = i >= 0 ? gpj.slice(i, i + 4000) : "";
  verifier(bloc.length > 0, "le bloc est là");
  // (25/10 après-midi) Seulement vers une extension qui lit VRAIMENT (≥ 0.6.144) : de la 0.6.130 à la 0.6.143, son
  // lecteur ne lisait rien (restRequest rendait null), et retenir la file pour elle la gelait jusqu'à 15 min.
  verifier(/!compteEnPauseAr && versionAuMoins\(version, LECTURE_FOND_VERSION_MIN\)/.test(bloc), "jamais pendant une pause anti-robot, seulement vers une extension qui lit vraiment (≥ 0.6.144)");
  verifier(/\.from\("lectures_origine_demandees"\)[\s\S]{0,200}\.is\("faite_le", null\)\.lt\("essais", 3\)/.test(bloc), "seulement une lecture pas faite, moins de 3 essais");
  verifier(/15 \* 60_000/.test(bloc), "seulement une demande de moins de 15 min");
  verifier(/out = out\.filter\(\(j\) => passeAvantLaSynchro\(j\)\)/.test(bloc), "retraits et republications retirées partent (passeAvantLaSynchro)");
  verifier(/catch \(_e\)/.test(bloc), "illisible : la file part comme avant");
  verifier(/lectures_origine_devant: heldLecturesOrigine/.test(gpj), "la réponse dit combien de tâches ont été retenues");
  const iRelecture = gpj.indexOf("LA LECTURE DE L'ANNONCE D'ORIGINE PASSE DEVANT LA FILE");
  const iRetenue = gpj.indexOf("RETENUE D'EXÉCUTION des republications");
  verifier(iRelecture > 0 && iRetenue > iRelecture, "placée après la synchro de la personne, avant la retenue d'exécution");
}

console.log("2. Extension — background.js");
{
  const bg = lire("chrome-extension/background.js");
  const poll = bg.slice(bg.indexOf("async function pollAndProcessJobsUnlocked"), bg.indexOf("await recoverMissingListingUrls(session)"));
  // (20/11/2026 soir, bloc A de Nico — 0.6.195) La règle du 25/10 (lire AVANT la boucle des tâches, sous le verrou) est
  // remplacée : une demande fraîche passe devant par l'ALARME de 30 s (sans le verrou des dépôts, ou en tête de sa file
  // entre deux tâches) ; le poll ne prend plus que les demandes de plus de 15 min — il tenait le verrou 8 à 20 s par page.
  const veille = bg.slice(bg.indexOf("async function veillerLecturesDemandees"), bg.indexOf("async function veillerLecturesDemandees") + 3000);
  verifier(!/lectureOrigineDemandeeRecente\(session\.access_token\)/.test(poll)
    && /await lireAnnoncesOrigineEnAttente\(session, \{ recentesSeulement: true, prioritaire: true \}\)/.test(veille),
    "la lecture demandée récemment passe devant par l'alarme (sans verrou), jamais sous le verrou du poll");
  verifier(/if \(!lectureOrigineDevant\) await lireAnnoncesOrigineEnAttente\(session, \{ anciennesSeulement: true \}\)/.test(poll),
    "le poll ne lit plus que les demandes de plus de 15 min (une seule série par cycle)");
  const lecteur = bg.slice(bg.indexOf("async function lireAnnoncesOrigineEnAttente"), bg.indexOf("// Nombre de jobs que le serveur a retenus"));
  verifier(/if \(vintedPauseAntirobotServeur\) return;/.test(lecteur) && /if \(await lectureFondEnPause\(\)\) return;/.test(lecteur), "jamais pendant une pause anti-robot");
  verifier(/derniereLectureOrigine \+ 8000 \+ Math\.floor\(Math\.random\(\) \* 12000\)/.test(lecteur) && /const LECTURES_SIGNAL_PAR_APPEL = 10;/.test(lecteur),
    "le rythme ne change pas (8 à 20 s entre deux pages), au plus 10 pages par appel de l'alarme");
  verifier(/tracerLectureOrigineRatee\(token, l, /.test(lecteur), "une lecture ratée est tracée");
  const trace = bg.slice(bg.indexOf("async function tracerLectureOrigineRatee"), bg.indexOf("async function lectureOrigineDemandeeRecente"));
  verifier(/3600_000/.test(trace) && /feature: "lecture_origine_echec"/.test(trace), "une fois par annonce et par heure, dans usage_logs");
  verifier(!/inventaire\?id=eq/.test(trace), "la trace n'écrit rien sur la fiche");
}

console.log(`\n${ko === 0 ? "✓" : "✗"} lecture-origine-devant : ${ok} contrôles verts, ${ko} rouges`);
process.exit(ko === 0 ? 0 : 1);
