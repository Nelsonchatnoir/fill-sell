// VERROU (13/11/2026, lot « zéro problème », étape 5 — décision de Nico) : L'ÉTAT INCONNU EST UNE QUESTION.
//
//     npm run selftest:etat-inconnu-question
//
// « État jamais embelli, état inconnu = question. » L'écran posait « Très bon état » en silence quand personne n'avait
// dit l'état (ListingPreviewScreen.defaultConditionFor, dans mergeFieldsWithLens et dans le dernier filet de
// resolutionPublication). Mesuré le 13/11 (lecture seule) : 960 rédactions en 30 jours sur un état inconnu (61 comptes),
// 848 suivies d'une publication du même article — autant de « Très bon état » que personne n'avait dits.
// Ce verrou :
//   A. la règle pure (src/publication/moteur/etatAChoisir.js) : qui n'a pas d'état, ce que la réponse écrit sur chaque
//      plateforme (jamais au-dessus), le refus au clic ;
//   B. l'écran : plus aucune valeur par défaut, la question comptée, grise le bouton, se répond une fois pour toutes
//      les plateformes, au stepper (ancien et nouveau) comme au lot ; le clic refuse un job sans état ;
//   C. un état CONNU reste comme avant.
// FILLSELL_RACINE=<dossier> : le code mis à l'épreuve est celui de ce dossier (mesure « rouge avant »).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = process.env.FILLSELL_RACINE ? path.resolve(process.env.FILLSELL_RACINE) : path.resolve(ICI, "..");
const imp = async (p) => { try { return await import(pathToFileURL(path.join(RACINE, p)).href); } catch { return null; } };
const lire = (p) => { try { return fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n"); } catch { return ""; } };
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 300)}`}`); } };

const Q = await imp("src/publication/moteur/etatAChoisir.js");
const S = await imp("src/publication/lot/sujetsDuLot.js");

console.log("A. La règle (moteur/etatAChoisir.js)");
{
  const edited = {
    vinted: { platform_fields: { etat: "" } },
    leboncoin: { platform_fields: { lbcAspects: { condition: "Bon état" } } },
    beebs: { platform_fields: {} },
    ebay: { platform_fields: { etat: "Très bon état" } },
  };
  ok(JSON.stringify(Q?.plateformesSansEtat?.({ plateformes: ["vinted", "leboncoin", "beebs", "ebay"], edited })) === JSON.stringify(["vinted", "beebs"]),
    "sans état : Vinted et Beebs (Leboncoin porte son critère, eBay son état)", Q?.plateformesSansEtat?.({ plateformes: ["vinted", "leboncoin", "beebs", "ebay"], edited }));
  ok(Array.isArray(Q?.ETATS_AU_CHOIX) && Q.ETATS_AU_CHOIX.map((e) => e.tier).join(",") === "neuf_etiquette,neuf_sans,tres_bon,bon,satisfaisant",
    "les réponses : les cinq niveaux communs, dans l'ordre");
  const e = Q?.ecrituresDeLEtatChoisi?.("Satisfaisant", ["vinted", "beebs", "leboncoin", "depop"]);
  ok(JSON.stringify(e) === JSON.stringify([{ plateforme: "vinted", valeur: "Satisfaisant" }, { plateforme: "beebs", valeur: "État moyen" },
    { plateforme: "leboncoin", valeur: "État satisfaisant" }, { plateforme: "depop", valeur: "Satisfaisant" }]),
    "la réponse dans les mots de chaque plateforme (Beebs « État moyen », Leboncoin « État satisfaisant »)", e);
  const r = Q?.refusEtatInconnu?.({ plateformes: ["vinted", "ebay"], pfParPlateforme: { vinted: {}, ebay: { etat: "Bon état" } }, nom: (p) => p === "vinted" ? "Vinted" : p });
  ok(typeof r === "string" && /État à choisir \(Vinted\)/.test(r), "au clic, un job sans état ne part pas (message)", r);
  ok(Q?.refusEtatInconnu?.({ plateformes: ["ebay"], pfParPlateforme: { ebay: { etat: "Bon état" } } }) === null, "tous les états connus : rien n'est refusé");
}

console.log("B. L'écran");
{
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(!/const DEFAULT_CONDITION = "Très bon état";/.test(lps), "plus de « Très bon état » par défaut (DEFAULT_CONDITION retiré)");
  const merge = /function mergeFieldsWithLens\([\s\S]*?\n\}/.exec(lps)?.[0] ?? "";
  ok(merge && !/defaultConditionFor\(field\)/.test(merge), "mergeFieldsWithLens : un état inconnu reste vide");
  ok(/const etatAChoisir = useMemo\(/.test(lps) && /plateformesSansEtat\(\{/.test(lps), "les plateformes sans état, calculées par la règle");
  const blocage = /const requiredBlocking =[\s\S]*?;\n/.exec(lps)?.[0] ?? "";
  ok(/etatAChoisir\.length > 0/.test(blocage), "la question grise le bouton (requiredBlocking)");
  ok(/État à choisir/.test(lps) && /Condition to choose/.test(lps), "le bouton gris dit pourquoi (« État à choisir (…) »)");
  ok(/\.\.\.\(etatAChoisir\.length \? \["etat"\] : \[\]\)/.test(lps) && /const nbQuestions = clesQuestions\.size/.test(lps),
    "une question, comptée une fois (la clé « etat » de clesQuestions, donc de nbQuestions)");
  ok(/for \(const p of etatAChoisir\) ajoute\(p\);/.test(lps) && /etatAChoisir, libelleEtat: t\("fieldConditionLabel"\)/.test(lps),
    "chaque plateforme qui l'attend le dit sur sa ligne (« 1 question », « Attend une réponse : État »)");
  ok(/etatAChoisir, choisirEtat, etatsAuChoix: ETATS_AU_CHOIX/.test(lps), "le moteur la sert (stepper nouveau, lot)");
  ok(/refusEtatInconnu\(\{/.test(lps), "au clic, le dernier filet refuse un job sans état");
  ok(/etatAChoisir=\{etatAChoisir\}/.test(lps) && /onChoisirEtat=\{choisirEtat\}/.test(lps), "l'ancien stepper la pose aussi (StepPublish)");
  const res = lire("src/utils/resolutionPublication.js");
  ok(!/pf\[field\.key\] = defaultConditionFor\(field\);/.test(res), "resolutionPublication : plus de « Très bon état » posé au dernier moment");
  const bq = lire("src/publication/BlocQuestions.jsx");
  ok(/voir\("etat"\)/.test(bq) && /m\.choisirEtat\(/.test(bq), "BlocQuestions pose la question « État » (un geste, toutes les plateformes)");
  const genReq = /const genericRequiredStatus = useMemo\([\s\S]*?\n {2}\}, \[/.exec(lps)?.[0] ?? "";
  ok(/attendEtat: true/.test(genReq), "la ligne « état » d'un rayon se tait le temps de la question (jamais deux fois la même question)");
}

console.log("C. Le lot");
{
  const m = { clesQuestions: ["etat"], etatAChoisir: ["vinted", "beebs"], plateformesPubliables: new Set(["vinted", "beebs"]) };
  const q = S?.questionsDeLArticle?.(m, [{ cle: "questions" }], { lang: "fr" }) ?? [];
  const e = q.find((x) => x.cle === "etat");
  ok(e && e.libelle === "État" && JSON.stringify(e.plateformes) === JSON.stringify(["vinted", "beebs"]) && e.type === "moteur",
    "le lot range la question « État » (ses plateformes), répondue par le même bloc", q);
}

console.log(`\n${n - ko}/${n} verts${ko ? `, ${ko} rouge(s)` : ""}`);
if (ko) process.exit(1);
