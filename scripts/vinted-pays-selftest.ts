// Selftest de la langue Vinted d'un job (_shared/vinted-pays.ts, 25/09).
// deno run scripts/vinted-pays-selftest.ts
import {
  ETATS_VINTED, langueVintedDuJob, languesDeLaRacine, languesOuvertesSansPays, paysDeLaLangue, PAYS_VINTED_EURO, RACINES_CATALOGUE,
  langueEtrangereDesRacines, languesEtrangeresDesRacines, RACINES_ETRANGERES_MIN,
} from "../supabase/functions/_shared/vinted-pays.ts";
import { VINTED_CONDITION_LIBELLES } from "../supabase/functions/_shared/vinted-etat.ts";

let echecs = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) echecs++; };
const IT = ["Nuovo con cartellino", "Nuovo senza cartellino", "Ottime", "Buone", "Discrete"];

// Le cas réel d'Alberto (jobs 80c3d14c et b81a3312) : racine « Uomo » + liste relevée.
ok(langueVintedDuJob({ racineCapturee: "Uomo", listeEtatsRelevee: IT }) === "it", "Alberto : Uomo + liste italienne → it");
ok(langueVintedDuJob({ racineCapturee: "Uomo" }) === "it", "Alberto après relance (racine seule) → it");
ok(ETATS_VINTED.it.libelles[6] === "Nuovo con cartellino", "status 6 en italien = « Nuovo con cartellino » (son formulaire)");

// Un compte français ne reçoit JAMAIS autre chose que fr (et fr = rien de posé).
ok(langueVintedDuJob({ racineCapturee: "Hommes" }) === "fr", "« Hommes » → fr");
ok(langueVintedDuJob({ racineCapturee: "Femmes", listeEtatsRelevee: Object.values(ETATS_VINTED.fr.libelles) }) === "fr", "« Femmes » + liste française → fr");
// Racines ambiguës : on ne devine pas.
ok(langueVintedDuJob({ racineCapturee: "Sport" }) === null, "« Sport » (fr, it, de, nl, et, hr) → rien");
ok(langueVintedDuJob({ racineCapturee: "Casa" }) === null, "« Casa » (it, pt) → rien");
ok(langueVintedDuJob({ racineCapturee: "Casa", listeEtatsRelevee: IT }) === "it", "« Casa » + liste italienne → it");
ok(langueVintedDuJob({ racineCapturee: "Home" }) === null, "« Home » (de, nl, en) → rien");
ok(langueVintedDuJob({ racineCapturee: "Men" }) === "en", "« Men » → en");
ok(langueVintedDuJob({ racineCapturee: "Divertissement" }) === null, "ancienne racine hors relevé → rien");
ok(langueVintedDuJob({}) === null, "aucun indice → rien");
// Indices contradictoires : rien.
ok(langueVintedDuJob({ racineCapturee: "Uomo", listeEtatsRelevee: Object.values(ETATS_VINTED.fr.libelles) }) === null, "Uomo + liste française → rien");
// Une liste incomplète (rayon « neuf seulement ») n'est pas un indice.
ok(langueVintedDuJob({ racineCapturee: "Sport", listeEtatsRelevee: ["Nuovo con cartellino"] }) === null, "liste d'un seul état → pas un indice");

// Cohérence avec la table française historique (3 116 captures).
ok(Object.entries(VINTED_CONDITION_LIBELLES).every(([id, l]) => ETATS_VINTED.fr.libelles[Number(id)] === l), "fr = table historique vinted-etat.ts");
// Toutes les langues ont les 5 identifiants et les 8 racines.
for (const [l, e] of Object.entries(ETATS_VINTED)) {
  ok([6, 1, 2, 3, 4].every((id) => String(e.libelles[id] ?? "").trim()), `${l} : 5 états`);
  ok(Object.keys(RACINES_CATALOGUE[l as keyof typeof RACINES_CATALOGUE]).length === 8, `${l} : 8 racines`);
}
// Seules les langues vues sur un vrai formulaire servent à poser un champ.
ok(Object.entries(ETATS_VINTED).filter(([, e]) => e.formulaire).map(([l]) => l).sort().join(",") === "en,fr,it", "formulaire vérifié : fr, it, en seulement");
// Pays.
ok(Object.keys(PAYS_VINTED_EURO).length === 18, "18 pays euro");
ok(paysDeLaLangue("it").join() === "IT" && paysDeLaLangue("de").sort().join() === "AT,DE" && paysDeLaLangue("en").join() === "IE", "langue → pays");
ok(languesDeLaRacine("Uomo").join() === "it", "racine Uomo → it seul");

// (28/10, mele.marta 2fd83d73) Pays du compte non lu : les langues de page qui suffisent.
ok(languesOuvertesSansPays(new Set(["IT"])).join() === "it", "IT ouvert seul → it");
ok(languesOuvertesSansPays(new Set()).length === 0, "aucun pays ouvert → rien");
ok(languesOuvertesSansPays(new Set(["DE"])).length === 0, "DE ouvert, AT fermé → pas « de » (une page allemande peut être autrichienne)");
ok(languesOuvertesSansPays(new Set(["DE", "AT"])).join() === "de", "DE et AT ouverts → de");
ok(languesOuvertesSansPays(new Set(["NL"])).length === 0, "NL ouvert, BE fermé → pas « nl »");
ok(!languesOuvertesSansPays(new Set(Object.keys(PAYS_VINTED_EURO))).includes("fr"), "jamais le français, même tout ouvert");
ok(!languesOuvertesSansPays(new Set(Object.keys(PAYS_VINTED_EURO))).includes("en"), "jamais l'anglais (compte français possible), même IE ouvert");

// (29/10, lot B 4.1 — mele.marta 2fd83d73) La langue d'une LISTE de racines : 3 racines ou plus d'une même langue autre
// que le français (hors racines françaises : « Sport »). La page italienne passait pour française par « Sport ».
const RACINES_IT = ["Accessori", "Donna", "Uomo", "Bambini", "Casa", "Elettronica", "Libri e media", "Hobby e collezionismo", "Sport"];
const RACINES_FR = ["Femmes", "Hommes", "Enfants", "Maison", "Électronique", "Livres et médias", "Loisirs et collections", "Sport", "Articles de créateurs"];
ok(langueEtrangereDesRacines(RACINES_IT) === "it", "2fd83d73 : racines italiennes (« Sport » commun) → it");
ok(langueEtrangereDesRacines(RACINES_FR) === null && languesEtrangeresDesRacines(RACINES_FR).length === 0, "page française : jamais étrangère (une seule racine commune au plus)");
for (const l of Object.keys(RACINES_CATALOGUE) as (keyof typeof RACINES_CATALOGUE)[]) {
  if (l === "fr") continue;
  ok(langueEtrangereDesRacines(Object.values(RACINES_CATALOGUE[l])) === l, `${l} : ses 8 racines → ${l}, sans ex æquo`);
}
ok(langueEtrangereDesRacines(["Donna", "Uomo"]) === null, "2 racines seulement : pas assez");
ok(langueEtrangereDesRacines(["Jeux", "Consoles", "Accessoires"]) === null, "un sous-niveau français : rien");
ok(langueEtrangereDesRacines(["Sport", "Casa", "Home"]) === null, "racines partagées entre langues (Sport, Casa, Home) : rien");
ok(langueEtrangereDesRacines(null) === null && langueEtrangereDesRacines("Donna") === null, "pas une liste : rien");
ok(RACINES_ETRANGERES_MIN === 3, "seuil : 3 racines");
// L'indice de la question entre dans langueVintedDuJob, en intersection avec les autres.
ok(langueVintedDuJob({ racinesQuestion: RACINES_IT }) === "it", "question de racine italienne seule → it (pays IT : vinted_ids_actifs si ouvert)");
ok(langueVintedDuJob({ racinesQuestion: RACINES_IT, racineCapturee: "Uomo" }) === "it", "question italienne + racine capturée Uomo → it");
ok(langueVintedDuJob({ racinesQuestion: RACINES_IT, listeEtatsRelevee: Object.values(ETATS_VINTED.fr.libelles) }) === null, "question italienne + liste d'états française : contradictoire → rien");
ok(langueVintedDuJob({ racinesQuestion: RACINES_FR }) === null, "question de racines françaises : jamais un indice (le français n'est jamais déduit ici)");
ok(langueVintedDuJob({ racinesQuestion: ["Jeux", "Consoles"] }) === null, "question de sous-niveau : pas un indice");

if (echecs) { console.error(`\n${echecs} échec(s)`); Deno.exit(1); }
console.log("\nTout est vert.");
