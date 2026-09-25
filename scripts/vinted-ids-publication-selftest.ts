// Selftest des identifiants Vinted d'une publication (zone euro, 25/09).
// deno run scripts/vinted-ids-publication-selftest.ts
import {
  idCatalogueDuCheminFr, idEtatDuLibelleFr, idsCouleursDesLibellesFr, vintedIdsPourPublication, COULEURS_VINTED_FR,
} from "../supabase/functions/_shared/vinted-ids-publication.ts";
import { VINTED_COLORS } from "../src/utils/vintedColors.js";

let echecs = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) echecs++; };

// Chemins relevés sur le vrai formulaire le 25/09 (ids lus sur #catalog-<id>).
ok(idCatalogueDuCheminFr(["Hommes", "Vêtements", "Sweats et pulls", "Pulls ras de cou"]) === 1813, "Hommes > … > Pulls ras de cou = 1813 (relevé DOM)");
ok(idCatalogueDuCheminFr(["Femmes", "Vêtements", "Sweats et sweats à capuche", "Sweats & sweats à capuche"]) === 196, "… Sweats & sweats à capuche = 196");
ok(idCatalogueDuCheminFr(["Divertissement", "Magazines"]) === idCatalogueDuCheminFr(["Livres et médias", "Magazines"]), "racine renommée Divertissement → Livres et médias");
ok(idCatalogueDuCheminFr(["Hommes", "Rayon inventé"]) === null, "chemin inconnu → null (jamais d'approximation)");
ok(idCatalogueDuCheminFr([]) === null && idCatalogueDuCheminFr(null) === null, "chemin vide → null");

// Chemins RÉELS des publications Vinted des 30 derniers jours (relevé en base le 25/09).
const reels: string[][] = [["Livres et médias","Magazines"],["Loisirs et collections","Jeux de société"],["Électronique","Jeux vidéo et consoles","Consoles"],["Électronique","Jeux vidéo et consoles","Jeux"],["Électronique","Objets connectés","Montres connectées"],["Électronique","Téléphones portables et équipements de communication","Téléphones fixes"],["Électronique","TV et home cinema","Téléviseurs"],["Enfants","Jeux et jouets","Peluches"],["Enfants","Vêtements pour filles","Jupes"],["Femmes","Beauté","Parfums"],["Femmes","Beauté","Soins du corps"],["Femmes","Beauté","Soins du visage"],["Femmes","Chaussures","Chaussures à lacets"],["Femmes","Vêtements","Jupes"],["Hommes","Accessoires","Montres"],["Hommes","Chaussures","Baskets"],["Livres et médias","Livres","Fiction"],["Livres et médias","Vidéo","DVD"],["Maison","Décoration","Encadrements"],["Maison","Décoration","Vases"],["Sport","Cyclisme","Casques de vélo"],["Enfants","Jeux et jouets","Voitures, trains et autres véhicules","Voitures"],["Femmes","Vêtements","Jeans","Jeans skinny"],["Femmes","Vêtements","Robes","Midi"],["Hommes","Vêtements","Pantalons","Jogging"],["Maison","Textiles","Linge de lit","Taies d'oreiller"],["Enfants","Vêtements pour filles","Chaussures","Baskets","Baskets à lacets"],["Femmes","Vêtements","Manteaux et vestes","Vestes","Doudounes"],["Hommes","Vêtements","Hauts et t-shirts","T-shirts","T-shirts à manches longues"],["Maison","Animaux","Chiens","Vêtements & accessoires","Pulls"]];
const nonResolus = reels.filter((c) => idCatalogueDuCheminFr(c) === null);
ok(nonResolus.length === 0, `${reels.length - nonResolus.length}/${reels.length} chemins réels traduits en identifiant${nonResolus.length ? ` — non résolus : ${JSON.stringify(nonResolus)}` : ""}`);

// États : table historique.
ok(idEtatDuLibelleFr("Neuf avec étiquette") === 6 && idEtatDuLibelleFr("Très bon état") === 2 && idEtatDuLibelleFr("Satisfaisant") === 4, "états français → 6, 2, 4");
ok(idEtatDuLibelleFr("Comme neuf") === null, "état inconnu → null");
// Couleurs : la palette de l'app est ENTIÈREMENT traduisible.
ok(VINTED_COLORS.every((c: string) => idsCouleursDesLibellesFr([c]).length === 1), `les ${VINTED_COLORS.length} couleurs de l'app (vintedColors.js) ont un identifiant`);
ok(Object.keys(COULEURS_VINTED_FR).length === 29, "29 couleurs relevées");
ok(JSON.stringify(idsCouleursDesLibellesFr(["Rouge", "Bordeaux", "Noir"])) === "[7,23]", "2 couleurs au plus, ordre gardé");
ok(idsCouleursDesLibellesFr(["Argent"]).length === 0, "couleur hors palette → rien");

// Un job complet (88fe1e3f, 25/09).
const ids = vintedIdsPourPublication({ categoryPath: ["Hommes", "Vêtements", "Hauts et t-shirts", "T-shirts", "T-shirts à manches longues"], etat: "Très bon état", colors: ["Gris"] });
ok(!!ids && Number(ids.catalog_id) > 0 && ids.status_id === 2 && JSON.stringify(ids.color_ids) === "[3]", `job réel 88fe1e3f → ${JSON.stringify(ids)}`);
ok(vintedIdsPourPublication({}) === null, "rien à traduire → null");

if (echecs) { console.error(`\n${echecs} échec(s)`); Deno.exit(1); }
console.log("\nTout est vert.");
