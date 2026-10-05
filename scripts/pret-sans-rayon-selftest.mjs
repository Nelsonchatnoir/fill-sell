// ═══════════════════════════════════════════════════════════════════════════
// UNE CARTE SANS RAYON N'EST JAMAIS « PRÊT » — SELFTEST (05/10, point 6)
// ═══════════════════════════════════════════════════════════════════════════
// Constat de Nico (état du 04/10 nuit) : un titre sans aucun mot reconnu —
// la carte du lot s'affichait « Prêt », la question du rayon n'était pas
// posée, et le clic finissait en « Pas publié — rien n'a été débité ».
// Cause : resoudrePublication rendait le refus « objet_non_reconnu » AVANT
// la fin de la résolution, SANS aucun champ par plateforme — donc sans la
// question « rayon à choisir » (règle du 03/10, fin de resolutionPublication) ;
// le pré-calcul se taisait, une résolution VIDE se lisait « rien à demander ».
//
// Ce qu'il garantit :
//   1. « Truc bidule 999 » : le refus porte la question « rayon à choisir »
//      pour Vinted, Leboncoin, Beebs et eBay (par l'API comprise), jamais
//      pour Opla ; aucun champ résolu, aucun job ne peut partir sans rayon ;
//   2. ces questions sont OUVERTES à l'écran (questionsRayonOuvertes, le même
//      calcul que le stepper) tant que la personne n'a pas choisi ; son choix
//      lève la question de SA plateforme ;
//   3. le lot ne dit jamais « Prêt » : bilanArticle compte ces questions ;
//      et sans question (plateforme dont l'app ne pose pas le rayon), le
//      bouton gris de la ceinture le retient aussi ;
//   4. l'écran : le pré-calcul AFFICHE la question (au lieu de se taire),
//      relance la résolution quand un rayon est choisi, le clic la montre
//      aussi ; un titre qui nomme l'objet ne passe pas par le refus.
//
//   node --import ./scripts/loader-ext.mjs scripts/pret-sans-rayon-selftest.mjs
import { readFileSync } from "node:fs";
import {
  resoudrePublication, questionsRayonSansObjet, PLATEFORMES_RAYON_A_DEMANDER,
} from "../src/utils/resolutionPublication.js";
import { questionsRayonOuvertes } from "../src/utils/rayonPublication.js";
import { plateformesSansChemin } from "../src/publication/moteur/regles.js";
import { bilanArticle } from "../src/publication/lot/regles.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Un client Supabase hors ligne : aucune IA, aucun catalogue — la résolution
// ne doit RIEN deviner pour autant.
const fauxSupabase = {
  functions: { invoke: async () => ({ data: null, error: { message: "hors ligne (selftest)" } }) },
  from: () => { const q = { select: () => q, eq: () => q, in: () => q, limit: () => q, order: () => q, maybeSingle: async () => ({ data: null }), then: (r) => r({ data: [] }) }; return q; },
};
const outils = {
  platformFieldsConfig: {}, isConditionKey: () => false, defaultConditionFor: () => null, GENERIC_ASPECTS_PF_KEY: {},
  normAspectVal: (s) => s, resolveArticleIcon: () => "📦", resolveArticleIconDetail: () => ({ icon: "📦" }), OPLA_ETAT_PAR_LIBELLE: {},
};
const TOUTES = ["vinted", "leboncoin", "beebs", "ebay", "opla"];
const copies = (titre, pfs = TOUTES) => Object.fromEntries(pfs.map((p) => [p, { title: titre, description: "Un article.", platform_fields: {} }]));
const resoudre = (titre, { pfs = TOUTES, ebayVoieApi = true } = {}) => resoudrePublication({
  plateformes: pfs, selected: new Set(pfs), edited: copies(titre, pfs), initialListing: { titre },
  sharedFields: {}, sharedOverrides: {}, activeAiIcon: null, activeAiObjet: null, origineCat: null,
  lang: "fr", supabase: fauxSupabase, ebayVoieApi, outils,
});
const logs = console.log; const warns = console.warn;
const silence = async (fn) => { console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = logs; console.warn = warns; } };

console.log("1. « Truc bidule 999 » : le refus porte la question du rayon");
const TITRE = "Truc bidule 999";
const r = await silence(() => resoudre(TITRE));
ok(r.refus?.code === "objet_non_reconnu", "aucun mot reconnu → refus « objet_non_reconnu » (inchangé)");
const pfp = r.pfParPlateforme ?? {};
ok(["vinted", "leboncoin", "beebs", "ebay"].every((p) => pfp[p]?.rayon_a_choisir?.motif === "objet_non_reconnu"),
  "Vinted, Leboncoin, Beebs et eBay (voie API comprise) reçoivent « rayon à choisir »");
ok(!pfp.opla, "Opla : pas de question d'ici (son rayon est posé par le serveur)");
ok(Object.values(pfp).every((pf) => Object.keys(pf).join() === "rayon_a_choisir"), "aucun champ résolu, aucun rayon deviné : la question seule");
ok(Object.values(pfp).every((pf) => !pf.rayon_a_choisir.chemin_propose && pf.rayon_a_choisir.candidats.length === 0), "aucun rayon proposé à partir de rien");
{
  const rows = Object.entries(pfp).map(([platform, platform_fields]) => ({ platform, platform_fields }));
  ok(plateformesSansChemin(rows).length === rows.length, "aucun job ne part sans rayon (écartés avant le débit)");
}
ok(JSON.stringify(Object.keys(questionsRayonSansObjet(TOUTES, "x"))) === JSON.stringify(PLATEFORMES_RAYON_A_DEMANDER.filter((p) => TOUTES.includes(p))),
  "questionsRayonSansObjet : exactement les plateformes dont l'app pose le rayon");
{
  const rEbaySeul = await silence(() => resoudre(TITRE, { pfs: ["ebay"], ebayVoieApi: true }));
  ok(rEbaySeul.pfParPlateforme?.ebay?.rayon_a_choisir, "eBay seul, par l'API : la question est posée aussi (sans mot, le clic refuserait l'article)");
}

console.log("2. Les questions sont ouvertes à l'écran, et le choix les lève");
const selected = new Set(["vinted", "leboncoin", "beebs"]);
const ouvertes = questionsRayonOuvertes(pfp, selected, copies(TITRE));
ok(JSON.stringify(Object.keys(ouvertes).sort()) === JSON.stringify(["beebs", "leboncoin", "vinted"]), "une question par plateforme cochée (eBay décoché : pas de question)");
{
  const ed = copies(TITRE);
  ed.vinted.rayon_choisi = { chemin: ["Maison", "Décoration", "Bougies et photophores"], id: "1" };
  const apres = questionsRayonOuvertes(pfp, selected, ed);
  ok(!apres.vinted && apres.leboncoin && apres.beebs, "le rayon choisi sur Vinted lève SA question, les autres restent posées");
}
ok(Object.keys(questionsRayonOuvertes(undefined, selected, {})).length === 0, "sans résolution : aucune question inventée");

console.log("3. Le lot ne dit jamais « Prêt »");
const moteur = (extra = {}) => ({
  preparationAuRepos: true, plateformesPubliables: new Set(["vinted"]), price: "12",
  texteVendeur: { titre: TITRE, description: "Un article." }, jumeaux: [], ctaDisabled: false, nbQuestions: 0, ...extra,
});
{
  const b = bilanArticle(moteur({ nbQuestions: Object.keys(ouvertes).length, ctaDisabled: true }), {}, "fr");
  ok(!b.pret && b.motifs.some((m) => m.cle === "questions"), "questions de rayon ouvertes → « À compléter », jamais « Prêt »");
}
{
  const b = bilanArticle(moteur({ nbQuestions: 0, ctaDisabled: true, motifsCtaGris: ["On n'a pas su ranger cet article tout seul."] }), {}, "fr");
  ok(!b.pret && b.motifs.some((m) => m.cle === "cta"), "ceinture : sans question mais bouton gris (refus sans question) → pas « Prêt »");
}
ok(bilanArticle(moteur(), {}, "fr").pret, "témoin : un article complet reste « Prêt »");

console.log("4. L'écran pose la question, et la relance quand un rayon est choisi");
const lps = src("src/components/ListingPreviewScreen.jsx");
{
  const i = lps.indexOf("const resolution = await resoudrePublication(contexte);");
  const bloc = lps.slice(i, i + 1600);
  ok(i > 0 && /if \(resolution\.refus\) \{[\s\S]*?setResolutionAffichee\(resolution\);\s*\n\s*return;/.test(bloc), "pré-calcul : le refus est AFFICHÉ (questions), plus jamais tu");
  ok(!/if \(resolution\.refus\) \{[\s\S]*?resolutionPrevolRef\.current = /.test(bloc.slice(0, bloc.indexOf("return;"))), "pré-calcul : un refus n'est jamais l'autorité du clic (ref non posé)");
}
ok(/const relanceApresRefus = refusVuPour && refusVuPour === platformListings\s*\n?\s*\? `\$\{objetDuRayonChoisi\(edited\) \?\? ""\}\|/.test(lps),
  "relance : clé = l'objet du rayon choisi (et le mot du titre), seulement pour une rédaction qui a connu le refus");
ok(/\}, \[platformListings, relanceApresRefus\]\);/.test(lps), "le pré-calcul repart quand cette clé change (jamais à la frappe)");
ok(/if \(refusAfficheRef\.current\?\.empreinte === empreinte\) \{\s*\n\s*setResolutionAffichee\(refusAfficheRef\.current\.resolution\);/.test(lps),
  "le même refus ne relance pas une seconde résolution : il se ré-affiche (un choix retiré fait revenir la question)");
ok(/if \(resolutionPrevolRef\.current\?\.empreinte === empreinte\) \{[\s\S]{0,400}setResolutionAffichee\(resolutionPrevolRef\.current\.resolution\);/.test(lps),
  "un rayon re-choisi remontre la résolution déjà faite (jamais une question périmée)");
ok(/questionsRayonOuvertes\(resolutionAffichee\?\.pfParPlateforme, selected, edited\)/.test(lps), "l'écran compte ses questions par le calcul éprouvé ici");
ok(/Object\.keys\(rayonsAChoisir\)\.length > 0 \|\|\s*\n\s*refusSansQuestion;/.test(lps), "bouton gris : question de rayon ouverte, ou refus sans question (ceinture)");
ok(/if \(resolution\.refus && !unRayonChoisi\) \{[\s\S]{0,900}setResolutionAffichee\(resolution\);[\s\S]{0,80}throw new Error\(resolution\.refus\.message\);/.test(lps), "au clic : la question s'affiche avec le refus");
{
  const rMot = await silence(() => resoudre("Veste en jean Levi's", { pfs: ["vinted", "leboncoin"] }));
  ok(!rMot.refus, "témoin : un titre qui nomme l'objet ne passe pas par le refus");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ prêt sans rayon : une carte sans rayon résolu n'est jamais « Prêt », la question est posée");
process.exit(ko ? 1 : 0);
