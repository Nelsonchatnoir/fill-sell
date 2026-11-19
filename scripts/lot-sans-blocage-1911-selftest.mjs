// Autotest VERROU : JAMAIS DE BLOCAGE, SAISIE PARFAITE (19/11/2026, exigence de Nico après son lot de 27 articles).
//
//     node --import ./scripts/loader-ext.mjs scripts/lot-sans-blocage-1911-selftest.mjs
//
// Ce que Nico a vécu (19/11, 13:25) : « Préparation… 26 sur 27 », « Vérification… » sans fin sur le robot aspirateur,
// rien n'a pu partir ; le champ eBay « Matière » d'une veste « bugge dès qu'on tape une lettre ».
// Ce qu'il prouve :
//   1. la garde du temps (regles.gardePreparation) : un article qui n'avance plus 30 s, ou qui prépare 90 s en tout,
//      sort de la préparation — rédigé, il est rangé (Prêt / À régler) ; sinon mis de côté ; une préparation suivante
//      (un rayon choisi) repart avec tout son temps ;
//   2. le pilote : la garde passe AVANT tout le reste (un article sans moteur ne bloque plus), le moteur revenu à
//      « Où publier ? » repart du montage, la lecture de la description a sa limite, un envoi ne reste jamais suspendu
//      à une réponse, « Quitter » répond pendant l'envoi ;
//   3. la saisie : un texte libre part au moteur à la sortie du champ (ChampTexteDiffere), jamais à chaque lettre —
//      eBay « Matière » (AspectValueInput), les champs partagés, la description Vinted.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

const R = await charger("src/publication/lot/regles.js");

console.log("1. la garde du temps");
{
  ok(typeof R.gardePreparation === "function" && R.GARDE_IMMOBILE_MS <= 30_000 && R.GARDE_TOTALE_MS <= 90_000 && R.GARDE_LECTURE_MS <= 40_000,
    "la garde existe : 30 s sans progrès, 90 s en tout, 40 s pour une lecture");
  const t0 = 1_000_000;
  const pil = {};
  const verif = { step: 3, platformListings: {}, generatingPlatforms: false };
  ok(R.gardePreparation(pil, { phase: "verification", m: verif, maintenant: t0 }).issue === "attendre", "à l'arrivée : on attend");
  ok(R.gardePreparation(pil, { phase: "verification", m: verif, maintenant: t0 + 29_000 }).issue === "attendre", "29 s sans progrès : on attend encore");
  const g = R.gardePreparation(pil, { phase: "verification", m: verif, maintenant: t0 + 30_000 });
  ok(g.issue === "bilan" && g.trace.etape === 3 && g.trace.copies === true, "« Vérification… » immobile 30 s, copies rédigées : l'article est rangé (Prêt ou À régler), sa fiche s'ouvre");
  const pil2 = {};
  R.gardePreparation(pil2, { phase: "montage", m: null, maintenant: t0 });
  ok(R.gardePreparation(pil2, { phase: "montage", m: null, maintenant: t0 + 30_000 }).issue === "de_cote", "un article sans moteur (le cas du robot) : mis de côté au bout de 30 s, les autres partent");
  const pil3 = {};
  let t = t0, step = 1, issue = "attendre";
  for (; issue === "attendre" && t <= t0 + 200_000; t += 5_000) {
    step = step === 3 ? 1 : step + 1; // un moteur qui tourne en rond : il « progresse » sans fin
    issue = R.gardePreparation(pil3, { phase: step === 3 ? "verification" : "redaction", m: { step, platformListings: null }, maintenant: t }).issue;
  }
  ok(issue === "de_cote" && t - t0 <= R.GARDE_TOTALE_MS + 5_000, "un moteur qui tourne en rond (étape 1 → 2 → 3 → 1…) : arrêté à 90 s, jamais sans fin");
  const pil4 = {};
  R.gardePreparation(pil4, { phase: "redaction", m: { step: 2, generatingPlatforms: true }, maintenant: t0 });
  ok(R.gardePreparation(pil4, { phase: "redaction", m: { step: 2, generatingPlatforms: false, platformListings: {} }, maintenant: t0 + 20_000 }).issue === "attendre"
    && R.gardePreparation(pil4, { phase: "verification", m: { step: 3, platformListings: {} }, maintenant: t0 + 45_000 }).issue === "attendre",
    "une préparation qui avance (rédaction finie, vérification) n'est jamais coupée avant 30 s sans progrès");
}

console.log("2. le pilote du lot");
{
  const lp = lire("src/publication/lot/LotPublication.jsx");
  const pilote = lp.slice(lp.indexOf("// ── LE PILOTE : faire avancer chaque moteur"), lp.indexOf("function raisonRien("));
  const iGarde = pilote.indexOf("gardePreparation(pilG");
  const iActifs = pilote.indexOf("if (!actifs.has(id)) continue;");
  ok(iGarde > 0 && iActifs > iGarde, "la garde passe AVANT « pas de moteur / pas monté » : un article sans moteur ne bloque plus le lot");
  ok(/issue === "bilan"[\s\S]{0,400}bilanArticle\(/.test(pilote) && /issue === "de_cote"[\s\S]{0,300}phase: "erreur", raison: en/.test(pilote), "rédigé : rangé par le bilan ; sinon « Préparation trop longue », il reste au stock");
  ok(/else if \(m\.step <= 1 && phase === "verification"\) patchs\[id\] = \{ phase: "montage" \}/.test(pilote), "le moteur revenu à « Où publier ? » repart du montage (avant : « Vérification… » sans fin)");
  ok(/st\.phase === "lecture"[\s\S]{0,300}GARDE_LECTURE_MS/.test(pilote) && /if \(garde\) planifierTick\(5000\)/.test(pilote), "la lecture a sa limite ; la garde se relit d'elle-même");
  ok(/Promise\.race\(\[m\.publier\(\), new Promise\(\(ok\) => setTimeout\(ok, 30_000\)\)\]\)/.test(lp), "l'envoi d'un article : 30 s au plus, puis le suivant");
  ok(/quitter=\{etape === "fin" \? null : \{ arme: quitterArme, desactive: false, onClick: quitter \}\}/.test(lp) && /if \(arretEnvoiRef\.current\) break;/.test(lp), "« Quitter » répond toujours, pendant l'envoi aussi (le reste ne part pas)");
}

console.log("3. la saisie");
{
  const c = lire("src/components/ChampTexteDiffere.jsx");
  ok(/onChange=\{\(e\) => taper\(e\.target\.value\)\}/.test(c) && /onBlur=\{\(e\) => \{ valider\(\);/.test(c) && /e\.key === "Enter"/.test(c), "ChampTexteDiffere : on tape dans un brouillon, la valeur part à la sortie du champ ou à « Entrée »");
  ok(/useEffect\(\(\) => \(\) => \{[\s\S]{0,200}f\?\.\(b\)/.test(c), "… et part aussi si le champ disparaît en pleine frappe (rien n'est perdu)");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  const avi = lps.slice(lps.indexOf("export function AspectValueInput("), lps.indexOf("function BoutonsRayon("));
  ok(!/<input type="text"[^>]*onChange=\{ev => onChange\(ev\.target\.value\)\}/.test(avi) && (avi.match(/<ChampTexteDiffere /g) ?? []).length === 2,
    "AspectValueInput (eBay « Matière », Leboncoin, Vinted…) : plus aucune écriture à chaque lettre");
  const bq = lire("src/publication/BlocQuestions.jsx");
  ok(/<ChampTexteDiffere className="fsn-input" value=\{val\}/.test(bq) && /<ZoneTexteDifferee className="fsn-textarea"/.test(bq)
    && !/type="text" value=\{val\} placeholder="—" onChange=\{ev =>/.test(bq), "questions : champs partagés (marque, matière…) et description Vinted, sans saut ni perte de lettre");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
