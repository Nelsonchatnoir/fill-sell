// Selftest de la langue Vinted d'un job (_shared/vinted-pays.ts, 25/09).
// deno run scripts/vinted-pays-selftest.ts
import {
  ETATS_VINTED, langueVintedDuJob, languesDeLaRacine, paysDeLaLangue, PAYS_VINTED_EURO, RACINES_CATALOGUE,
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

if (echecs) { console.error(`\n${echecs} échec(s)`); Deno.exit(1); }
console.log("\nTout est vert.");
