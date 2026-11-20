// ═══════════════════════════════════════════════════════════════════════════
// LA LECTURE D'ORIGINE DU LOT PAR PETITE AVANCE BORNÉE — `npm run selftest:lot-lecture-fenetre`
// ═══════════════════════════════════════════════════════════════════════════
// (20/11/2026 soir, bloc A de Nico — bertaberry41, lot db6255ae, 396 articles, Cloud) Le lot posait toutes ses demandes
// d'un coup (355 en 15 min) : passé 15 min, le lecteur ne les servait plus que sous le verrou des dépôts (≈ 60 articles
// par heure, 51 min d'attente moyenne), et get-pending-jobs gelait les dépôts pendant les 15 premières. Verrous :
//   1. la fenêtre (src/publication/lot/fenetreLecture.js) : 6 demandes en vol au plus, dans l'ordre du lot ; un échec
//      ou une conclusion libère la place ; redemande après 15 min, jamais pendant un échec ;
//   2. le câblage de l'écran du lot : plus de demande pour tous ; relecture bornée d'une requête ; lecture impossible
//      dite tout de suite ; horloge de la garde remise à zéro ; au plus 3 lectures par l'extension d'ici en vol ;
//   3. le serveur : la file des dépôts n'attend plus les lectures pour un poste ≥ 0.6.159 ;
//   4. l'extension (0.6.195) : les demandes fraîches à l'alarme (sans verrou), le poll seulement les anciennes.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AVANCE_LECTURE_ORIGINE, aDemanderMaintenant, rangEnFile, demandeARearmer, occupePlace, mesureDuLot, REARMER_APRES_MS,
} from "../src/publication/lot/fenetreLecture.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8");
let verts = 0, rouges = 0;
const ok = (c, m) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}`); } };

console.log("1. La fenêtre (pure)");
{
  const ids = Array.from({ length: 396 }, (_, i) => String(1000 + i));
  const tous = Object.fromEntries(ids.map((id) => [id, { phase: "origine" }]));
  const a = aDemanderMaintenant(ids, tous);
  ok(AVANCE_LECTURE_ORIGINE === 6 && a.length === 6 && a.join() === ids.slice(0, 6).join(), "396 articles à lire : seuls les 6 premiers, dans l'ordre du lot");
  const e2 = { ...tous };
  for (const id of a) e2[id] = { phase: "origine", origineDemandee: true, origineEtat: "envoyee" };
  ok(aDemanderMaintenant(ids, e2).length === 0, "6 en vol : rien de plus (jamais une rafale de demandes)");
  e2[a[0]] = { phase: "attente" };                                                      // lue
  e2[a[1]] = { phase: "origine", origineDemandee: true, origineEtat: "echec", origineMotif: "onglet_indisponible" };
  e2[a[2]] = { phase: "origine", origineDemandee: true, origineConclusion: "masquee", origineEtat: "conclue" };
  e2[a[3]] = { phase: "origine", origineDemandee: true, origineEtat: "prise" };
  const b = aDemanderMaintenant(ids, e2);
  ok(b.length === 3 && b.join() === ids.slice(6, 9).join(), "lue, échouée, conclue : trois places libérées pour les trois suivants");
  ok(occupePlace(e2[a[3]]) && !occupePlace(e2[a[1]]) && !occupePlace(e2[a[2]]) && !occupePlace(e2[a[0]]), "seule une demande en vol (envoyée, prise) occupe une place");
  ok(rangEnFile(ids, e2, ids[6]) === 0 && rangEnFile(ids, e2, ids[10]) === 4 && rangEnFile(ids, e2, a[3]) === null,
    "le rang dit combien de lectures passent avant (null : déjà demandée)");
  const t0 = Date.parse("2026-11-20T16:00:00Z");
  const dm = { demandee_le: new Date(t0).toISOString(), faite_le: null, essai_le: null, motif: null };
  ok(!demandeARearmer(dm, "vinted", t0 + REARMER_APRES_MS - 1000) && demandeARearmer(dm, "vinted", t0 + REARMER_APRES_MS + 1000),
    "une demande restée 15 min sans lecteur est redemandée (l'alarme ne la voit plus)");
  ok(!demandeARearmer({ ...dm, essai_le: new Date(t0 + 60_000).toISOString(), motif: "onglet_indisponible" }, "vinted", t0 + 20 * 60_000),
    "jamais pendant un échec (son repos et « Réessayer » décident)");
  ok(!demandeARearmer({ ...dm, faite_le: new Date(t0).toISOString() }, "vinted", t0 + 20 * 60_000) && !demandeARearmer(dm, "leboncoin", t0 + 20 * 60_000),
    "jamais une demande faite, jamais hors Vinted (un relevé ne se relance pas ainsi)");
  const m = mesureDuLot({ debut: t0, fin: t0 + 600_000, ids: ["1", "2", "3"], etats: {
    1: { phase: "pret", origineDepuis: t0, origineDemandeeLe: t0 + 10_000, origineLueLe: t0 + 40_000 },
    2: { phase: "pret", origineDepuis: t0, origineDemandeeLe: t0 + 30_000, origineLueLe: t0 + 50_000 },
    3: { phase: "pret" } } });
  ok(m.articles === 3 && m.a_lire === 2 && m.lus === 2 && m.duree_s === 600 && m.file_moy_s === 20 && m.lecture_moy_s === 25,
    "la mesure du lot : durée, articles lus, attente moyenne de la file et de la lecture");
}

console.log("2. L'écran du lot");
{
  const lot = lire("src/publication/lot/LotPublication.jsx");
  ok(!/if \(attenteOrigine\) demanderLectureOrigine\(/.test(lot), "plus jamais une demande pour chaque article à son passage (toutes à la fois)");
  ok(/const ids = aDemanderMaintenant\(lot\.ids, etats\);/.test(lot) && /demanderLectureOrigine\(supabase, Number\(id\)\)\.then\(/.test(lot),
    "la fenêtre demande les suivants, la demande simple");
  ok(/intervalleMs: RELECTURE_FENETRE_MS/.test(lot) && /from\("lectures_origine_demandees"\)\.select\("inventaire_id, demandee_le, prise_le, essai_le, motif, faite_le"\)/.test(lot)
    && !/intervalleMs: 60_000, maxMs: 15 \* 60_000/.test(lot),
    "la relecture : une requête pour toute la fenêtre (plus 3 requêtes par article et par minute)");
  ok(/if \(!dm \|\| demandeARearmer\(dm, pf, maintenant\)\)/.test(lot), "la demande disparue ou endormie est redemandée");
  ok(/origineEtat: e\.etat, origineMotif: e\.etat === "echec" \? e\.motif : null/.test(lot) && /const impossible = st\.origineConclusion/.test(lot)
    && /phraseEtatDemande\(impossible,/.test(lot), "une lecture impossible (échec, conclusion) se dit tout de suite, avec son motif et ses issues");
  ok(/reessayer: \(id\) => \{/.test(lot) && /sansLecteur\.reessayer\(id\)/.test(lot), "« Réessayer » sur la ligne quand il a un sens");
  ok(/Attend son tour pour la lecture de ton annonce/.test(lot) && !/Attend son tour[^`]*min/.test(lot), "l'article qui attend son tour le dit, sans durée promise");
  ok(/const depuisDemande = st\.origineDemandee \? \(st\.origineDemandeeLe/.test(lot), "« en retard » se compte depuis la demande, jamais depuis l'entrée dans la file du lot");
  ok(/if \(st\.phase !== "lecture" && pilotage\.current\[id\]\?\.lectureDepuis != null\) pilotage\.current\[id\]\.lectureDepuis = null;/.test(lot),
    "l'horloge de la garde de lecture repart à chaque entrée (plus de garde immédiate, plus de total faux)");
  ok(/RAFALE_LECTURE_VINTED - parExtensionEnVol/.test(lot), "par l'extension d'ici, jamais plus de lectures en vol que la rafale permise (3)");
  ok(/journaliser\("lot_preparation_mesure"/.test(lot) && /en_lecture_origine: enLectureOrigine/.test(lot), "chaque lot laisse sa mesure (fin de préparation, sortie)");
}

console.log("3. Le serveur");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  const lf = lire("supabase/functions/_shared/lecture-fond.js");
  ok(/export const LECTURE_SIGNAL_VERSION_MIN = "0\.6\.159";/.test(lf), "la version du lecteur par alarme est nommée");
  ok(/versionAuMoins\(version, LECTURE_FOND_VERSION_MIN\)\s*&& !versionAuMoins\(version, LECTURE_SIGNAL_VERSION_MIN\)\) \{/.test(gpj),
    "la file des dépôts n'attend plus les lectures d'un poste ≥ 0.6.159 (seuls les postes 0.6.144 → 0.6.158)");
}

console.log("4. L'extension (0.6.195)");
{
  const bg = lire("chrome-extension/background.js");
  const poll = bg.slice(bg.indexOf("async function pollAndProcessJobsUnlocked"), bg.indexOf("await recoverMissingListingUrls(session)"));
  ok(/lireAnnoncesOrigineEnAttente\(session, \{ anciennesSeulement: true \}\)/.test(poll) && !/lectureOrigineDemandeeRecente\(session\.access_token\)/.test(poll),
    "le poll ne lit plus les demandes fraîches sous le verrou des dépôts");
  const lecteur = bg.slice(bg.indexOf("async function lireAnnoncesOrigineEnAttente"), bg.indexOf("// (29/10, lot C 1 — 0.6.159) Toutes les 30 s"));
  ok(/\.filter\(\(l\) => !anciennesSeulement \|\| age\(l\) >= 15 \* 60_000\)/.test(lecteur) && /if \(!prioritaire\) break;/.test(lecteur),
    "l'alarme relit la liste tant qu'il en reste ; le poll, une seule liste de demandes anciennes");
  ok(/derniereLectureOrigine \+ 8000 \+ Math\.floor\(Math\.random\(\) \* 12000\)/.test(lecteur), "le rythme humain ne change pas (8 à 20 s entre deux pages)");
}

console.log(`\n${rouges ? "✗" : "✓"} lot-lecture-fenetre : ${verts} contrôles verts, ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
