// ═══════════════════════════════════════════════════════════════════════════
// Selftest « LE MOTEUR DE PUBLICATION » (refonte du stepper, 24/09/2026)
//   node scripts/publication-moteur-selftest.mjs
//
// Les règles qui vivaient dans des closures de ListingPreviewScreen (qui part,
// qui est exclu, ce qui bloque, la forme d'un job, la garde eBay, les
// questions à poser) sont des fonctions pures dans src/publication/moteur/.
// Ce test fige leur comportement sur les cas CONNUS de l'ancien code — c'est
// la preuve que l'ancien stepper, qui les appelle désormais, se comporte
// exactement comme avant :
//   · plateformesPubliables : sélectionnée ET générée, moins adresse, moins interdite ;
//   · exclusions au clic : les 4 filtres, dans l'ordre, et le motif de refus quand
//     plus rien ne reste (interdites → champ → sans annonce → sans adresse) ;
//   · clé des requis : l'icône (ancien) vs le rayon résolu (nouveau, n°7 Louis) ;
//   · construireJobs : plafond photos Leboncoin, adresse, titre Vinted, eBay sans photo ;
//   · plateformesSansChemin : Beebs « à choisir » reste, Opla jamais écartée ;
//   · gardeAspectsEbay : manquant, rapprochement, FREE_TEXT passe, SELECTION_ONLY refuse ;
//   · questionsAPoser : déduplication par champ partagé SEULEMENT si la saisie
//     partagée atteint la plateforme (classe RoCotCot), sticky, restants ;
//   · etatsFournee / ordreDePassage : ce que l'écran de suivi affiche.
// ═══════════════════════════════════════════════════════════════════════════
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = await import(pathToFileURL(join(ROOT, "src/publication/moteur/regles.js")).href);
const C = await import(pathToFileURL(join(ROOT, "src/publication/moteur/champsPartages.js")).href);
const L = await import(pathToFileURL(join(ROOT, "src/publication/moteur/listes.js")).href);
const D = await import(pathToFileURL(join(ROOT, "src/utils/champsDuRayon.js")).href);
import { readFileSync } from "node:fs";

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("\n[1] aspectBloquant — la règle unique du 29/07 et du 02/09");
ok("missing bloque", R.aspectBloquant({ state: "missing" }) === true);
ok("missing FERMÉ sans liste (blocking:false) ne bloque pas", R.aspectBloquant({ state: "missing", blocking: false }) === false);
ok("invalid contre une liste qui fait foi bloque", R.aspectBloquant({ state: "invalid", blocking: true }) === true);
ok("invalid contre un relevé (blocking:false) ne bloque pas", R.aspectBloquant({ state: "invalid", blocking: false }) === false);
ok("ok / prefilled ne bloquent pas", !R.aspectBloquant({ state: "ok" }) && !R.aspectBloquant({ state: "prefilled" }));

console.log("\n[2] plateformesPubliables — sélectionnée ET générée, moins adresse, moins interdite");
{
  const s = R.plateformesPubliables({
    selected: new Set(["vinted", "leboncoin", "beebs", "ebay", "opla"]),
    platformListings: { platforms: { vinted: {}, leboncoin: {}, beebs: {}, ebay: {} } },
    lbcAdresseManquante: { plateformes: ["beebs"] },
    platformSupport: { leboncoin: "prohibited" },
  });
  ok("Vinted et eBay seulement", eq([...s].sort(), ["ebay", "vinted"]), [...s].join(","));
  ok("Opla sans copie n'est pas publiable", !s.has("opla"));
  ok("adresse null → rien de retiré", R.plateformesPubliables({ selected: new Set(["beebs"]), platformListings: { platforms: { beebs: {} } }, lbcAdresseManquante: null, platformSupport: {} }).has("beebs"));
}

console.log("\n[3] champs bloquants par plateforme");
{
  const st = {
    leboncoin: [{ key: "furniture_type", label: "Produit", state: "missing" }, { key: "x", label: "X", state: "ok" }],
    vinted: [{ key: "isbn", label: "ISBN", state: "missing", blocking: false }],
    beebs: [{ key: "Marque", label: "Marque", state: "invalid", blocking: false }],
  };
  ok("Leboncoin attend « Produit », Vinted et Beebs rien", eq(R.champsBloquantsParPlateforme(st), { leboncoin: ["Produit"] }), JSON.stringify(R.champsBloquantsParPlateforme(st)));
  ok("plateformesBloqueesChamps ne compte que les publiables", eq(R.plateformesBloqueesChamps(new Set(["vinted", "leboncoin"]), st), ["leboncoin"]));
  ok("null → {}", eq(R.champsBloquantsParPlateforme(null), {}));
}

console.log("\n[4] descriptionVintedVide — sur la liste qu'on lui donne");
ok("Vinted cochée, copie vide → bloque", R.descriptionVintedVide(new Set(["vinted"]), { vinted: { description: "  " } }) === true);
ok("Vinted absente de la liste → ne bloque pas", R.descriptionVintedVide(new Set(["beebs"]), { vinted: { description: "" } }) === false);
ok("description écrite → ne bloque pas", R.descriptionVintedVide(["vinted"], { vinted: { description: "Robe bleue" } }) === false);

console.log("\n[5] calculerExclusions — les quatre filtres, dans l'ordre, nommés");
{
  const ex = R.calculerExclusions({
    selected: new Set(["vinted", "leboncoin", "beebs", "ebay", "opla"]),
    platformSupport: { leboncoin: "prohibited" },
    platformListings: { platforms: { vinted: {}, leboncoin: {}, beebs: {}, ebay: {} } },
    plateformesSansAdresse: ["leboncoin", "beebs"],
    champsManquantsParPf: { ebay: ["Taille"] },
  });
  ok("partent : Vinted seule", eq(ex.aPublier, ["vinted"]), ex.aPublier.join(","));
  ok("Leboncoin : sans adresse prime sur interdite (ordre des filtres)", ex.exclues.find(e => e.platform === "leboncoin")?.motif === "sans_adresse");
  ok("Beebs : sans adresse", ex.exclues.find(e => e.platform === "beebs")?.motif === "sans_adresse");
  ok("Opla : sans annonce", ex.exclues.find(e => e.platform === "opla")?.motif === "sans_annonce");
  ok("eBay : champ manquant, avec le champ", eq(ex.exclues.find(e => e.platform === "ebay"), { platform: "ebay", motif: "champ_manquant", champs: ["Taille"] }));
  ok("interdites / sansAnnonce / sansAdresse / champManquant exposées comme avant", eq(ex.interdites, ["leboncoin"]) && eq(ex.sansAnnonce, ["opla"]) && eq(ex.sansAdresse, ["leboncoin", "beebs"]) && eq(ex.champManquant, ["ebay"]));
  ok("ordre de aPublier = ordre de la sélection", eq(R.calculerExclusions({ selected: ["beebs", "vinted"], platformSupport: {}, platformListings: { platforms: { vinted: {}, beebs: {} } } }).aPublier, ["beebs", "vinted"]));
}

console.log("\n[6] motifAucunePlateforme — le refus dans l'ordre exact de l'ancien code");
{
  const cas = (interdites, champ, sansAnnonce, sansAdresse) => R.motifAucunePlateforme({ aPublier: [], interdites, champManquant: champ, sansAnnonce, sansAdresse });
  ok("interdites d'abord", cas(["leboncoin"], ["ebay"], ["opla"], ["beebs"]) === "interdites");
  ok("puis champ manquant", cas([], ["ebay"], ["opla"], ["beebs"]) === "champ_manquant");
  ok("sans annonce seulement si aucune sans adresse", cas([], [], ["opla"], []) === "sans_annonce");
  ok("sans annonce ET sans adresse → adresse (comme avant)", cas([], [], ["opla"], ["beebs"]) === "sans_adresse");
  ok("sans adresse seule", cas([], [], [], ["beebs"]) === "sans_adresse");
  ok("il reste une plateforme → null", R.motifAucunePlateforme({ aPublier: ["vinted"], interdites: ["leboncoin"], champManquant: [], sansAnnonce: [], sansAdresse: [] }) === null);
}

console.log("\n[7] cleCategorieRequis — l'ISBN selon le rayon RÉSOLU (n°7 Louis)");
{
  const icone = ["Livres et médias", "Livres", "Fiction"];
  const resolu = ["Livres et médias", "Livres", "Livres de coloriage et d'activités"];
  ok("ancien stepper (résolu null) : la clé de l'icône", R.cleCategorieRequis({ cheminResolu: null, cheminIcone: icone }) === "Livres et médias > Livres > Fiction");
  ok("nouveau stepper : la clé du rayon publié", R.cleCategorieRequis({ cheminResolu: resolu, cheminIcone: icone }) === "Livres et médias > Livres > Livres de coloriage et d'activités");
  ok("résolu vide → icône", R.cleCategorieRequis({ cheminResolu: [], cheminIcone: icone }) === "Livres et médias > Livres > Fiction");
  ok("rien → null", R.cleCategorieRequis({ cheminResolu: null, cheminIcone: null }) === null);
}

console.log("\n[8] construireJobs — la forme exacte des lignes de l'ancien code");
{
  const outils = {
    entreesPhotos: (l) => (l ?? []).map((u, i) => ({ type: i === 0 ? "original" : "extra", url: typeof u === "string" ? u : u.url })),
    getLbcFreePhotoQuota: (chemin) => (Array.isArray(chemin) && chemin[0] === "Divers" ? 3 : null),
    normalizeVintedTitle: (t) => `N(${t})`,
  };
  const champsResolus = { vinted: { categoryPath: ["Femmes"] }, leboncoin: { lbcCategoryPath: ["Divers", "Autres"] }, beebs: { beebsCategoryPath: ["Mode"] } };
  const r = R.construireJobs({
    plateformes: ["vinted", "leboncoin", "beebs"], champsResolus,
    processedPhotos: ["a", "b", "c", "d", "e"], lbcAddress: "12 rue X", userId: "u", inventaireId: 42,
    photoOption: "original", edited: { vinted: { title: "ROBE", description: "d", price: 9 }, leboncoin: { title: "Robe" }, beebs: { title: "Robe B" } }, price: 12, outils,
  });
  ok("aucune erreur, trois lignes", r.erreur === null && r.rows.length === 3);
  const [v, l, b] = r.rows;
  ok("Vinted : titre normalisé, prix de la copie, 5 photos", v.title === "N(ROBE)" && v.price === 9 && v.photos.length === 5);
  ok("Leboncoin : plafond 3 photos, marqueurs posés, adresse posée", l.photos.length === 3 && l.platform_fields.lbcPhotosCapped === true && l.platform_fields.lbcPhotosOriginales === 5 && l.platform_fields.adresse === "12 rue X");
  ok("Beebs : adresse posée, titre tel quel, prix général (12), 5 photos", b.platform_fields.adresse === "12 rue X" && b.title === "Robe B" && b.price === 12 && b.photos.length === 5);
  ok("Vinted : pas d'adresse", champsResolus.vinted.adresse === undefined);
  ok("colonnes du job : user_id, inventaire_id, status pending, photo_option", v.user_id === "u" && v.inventaire_id === 42 && v.status === "pending" && v.photo_option === "original");
  ok("journal du plafond", r.journal.length === 1 && /Divers > Autres : 5 photos → 3/.test(r.journal[0]));
  const e = R.construireJobs({ plateformes: ["ebay"], champsResolus: { ebay: {} }, processedPhotos: [], userId: "u", photoOption: "original", edited: { ebay: {} }, price: 5, ebayVoieApiReelle: true, outils });
  ok("eBay par API sans photo → erreur nommée", e.erreur === "ebay_sans_photo" && e.rows === null);
  const e2 = R.construireJobs({ plateformes: ["ebay"], champsResolus: { ebay: {} }, processedPhotos: [], userId: "u", photoOption: "original", edited: { ebay: {} }, price: 5, ebayVoieApiReelle: false, outils });
  ok("eBay par extension sans photo → pas d'erreur (comme avant)", e2.erreur === null && e2.rows.length === 1);
}

console.log("\n[9] plateformesSansChemin — la contrepartie de la porte (19/09)");
{
  const rows = [
    { platform: "vinted", platform_fields: { categoryPath: [] } },
    { platform: "leboncoin", platform_fields: { lbcCategoryPath: ["Mode", "Vêtements"] } },
    { platform: "beebs", platform_fields: { categorie_a_choisir: { mot: "robe" } } },
    { platform: "ebay", platform_fields: { ebayCategoryId: null } },
    { platform: "opla", platform_fields: {} },
  ];
  ok("Vinted (chemin vide) et eBay (id null) écartées ; Beebs « à choisir » et Opla restent", eq(R.plateformesSansChemin(rows), ["vinted", "ebay"]), R.plateformesSansChemin(rows).join(","));
}

console.log("\n[10] gardeAspectsEbay — manquant, rapprochement, suggestion, refus");
{
  const norm = (s) => String(s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const nearest = (val, allowed) => allowed.find(a => norm(a).split(/\s+/).includes(norm(val))) ?? null;
  const listeFaitFoi = (platform, mode) => platform === "ebay" && mode === "SELECTION_ONLY";
  const pfE = { marque: "", taille: "EU 42", couleur: "Black", colors: ["Black", "Blanc"], matiere: "Unique", ebayAspects: { "Type": "Robe" } };
  const req = [
    { name: "Marque", allowedValues: ["Zara"], mode: "FREE_TEXT" },
    { name: "Taille", allowedValues: ["40", "42"], mode: "SELECTION_ONLY" },
    { name: "Couleur", allowedValues: ["Noir", "Blanc"], mode: "FREE_TEXT" },
    { name: "Matière", allowedValues: ["Taille unique", "Coton"], mode: "SELECTION_ONLY" },
    { name: "Type", allowedValues: ["Robe", "Jupe"], mode: "SELECTION_ONLY" },
    { name: "Longueur", allowedValues: ["Mini"], mode: "SELECTION_ONLY" },
  ];
  const v = R.gardeAspectsEbay({ pfE, ebayRequiredFull: req, outils: { nearestAllowedValue: nearest, listeFaitFoi } });
  ok("Marque vide → manquante", eq(v.missingEmpty, ["Marque"]), v.missingEmpty.join(","));
  ok("Taille « EU 42 » jugée sur « 42 » → acceptée telle quelle", !v.invalides.some(x => x.name === "Taille") && !v.rapproches.some(x => x.name === "Taille"));
  ok("Couleur « Black » hors liste FREE_TEXT → avertissement, pas un refus", v.horsListe.some(x => x.name === "Couleur") && !v.invalides.some(x => x.name === "Couleur"));
  ok("Matière « Unique » rapprochée en « Taille unique », valeur du job corrigée", v.rapproches.some(x => x.name === "Matière" && x.nearest === "Taille unique") && pfE.matiere === "Taille unique");
  ok("Type par le canal générique, présent dans la liste → rien à dire", !v.invalides.some(x => x.name === "Type") && !v.missingEmpty.includes("Type"));
  ok("Longueur sans aucune source → ignorée (canal unfilledRequired de l'extension)", !v.missingEmpty.includes("Longueur"));
  const pf2 = { taille: "24 mois", ebayAspects: {} };
  const v2 = R.gardeAspectsEbay({ pfE: pf2, ebayRequiredFull: [{ name: "Taille", allowedValues: ["2 ans", "3 ans", "XS", "S"], mode: "SELECTION_ONLY" }], outils: { nearestAllowedValue: () => null, listeFaitFoi } });
  ok("SELECTION_ONLY sans rapprochement → refus, cas âge avec les valeurs mois/ans en exemple", v2.invalides.length === 1 && v2.invalides[0].ageLike === true && v2.invalides[0].sample === "2 ans, 3 ans", JSON.stringify(v2.invalides));
  const pf3 = { couleur: "Rouge", colors: ["Rouge"] };
  R.gardeAspectsEbay({ pfE: pf3, ebayRequiredFull: [{ name: "Couleur", allowedValues: ["Rouge foncé"], mode: "FREE_TEXT" }], outils: { nearestAllowedValue: () => "Rouge foncé", listeFaitFoi } });
  ok("couleur rapprochée : couleur ET colors[0] réécrits (gates et handlers lisent colors[0])", pf3.couleur === "Rouge foncé" && pf3.colors[0] === "Rouge foncé");
}

console.log("\n[11] questionsAPoser — un seul endroit de saisie, déduplication par champ partagé");
{
  const cfg = { taille: { key: "taille" }, couleur: { key: "couleur" }, matiere: { key: "matiere" }, marque: { key: "marque" } };
  const generic = {
    vinted: [{ key: "size", label: "Taille", state: "missing" }],
    leboncoin: [{ key: "clothing_st", label: "Taille", state: "missing" }, { key: "furniture_type", label: "Produit", state: "missing" }, { key: "tint", label: "Couleur", state: "missing" }],
    beebs: [{ key: "Marque", label: "Marque", state: "ok", value: "Zara" }],
  };
  const ebay = [{ name: "Taille", state: "missing", sharedKey: "taille" }, { name: "Style", state: "missing" }, { name: "Marque", state: "ok", value: "Zara" }];
  const q = R.questionsAPoser({
    missingSharedFields: ["taille"], sharedFieldCfg: cfg, genericRequiredStatus: generic, ebayRequiredStatus: ebay,
    genericFieldToSharedKey: C.genericFieldToSharedKey, SHARED_PROPAGATION: C.SHARED_PROPAGATION,
  });
  ok("la taille partagée est posée une fois", eq(q.sharedFieldsToRender, ["taille"]));
  ok("Vinted size et Leboncoin clothing_st (taille, propagée aux deux) sont dédupliquées", !q.redGenericAspects.some(({ a }) => a.key === "size" || a.key === "clothing_st"));
  ok("Leboncoin « Produit » (pas de champ partagé) garde son input", q.redGenericAspects.some(({ gp, a }) => gp === "leboncoin" && a.key === "furniture_type"));
  ok("Leboncoin « tint » n'a pas de champ partagé LBC (couleur ne se propage pas à LBC) → garde son input", q.redGenericAspects.some(({ gp, a }) => gp === "leboncoin" && a.key === "tint"));
  ok("eBay Taille (sharedKey posée) dédupliquée, Style reste", !q.redEbayAspects.some(a => a.name === "Taille") && q.redEbayAspects.some(a => a.name === "Style"));
  ok("compte : 1 partagé + 2 génériques + 1 eBay = 4, tous restants", q.redTotal === 4 && q.redRestants === 4, `${q.redTotal}/${q.redRestants}`);
  const q2 = R.questionsAPoser({
    missingSharedFields: [], sharedFieldCfg: cfg, stickyShared: new Set(["taille"]),
    genericRequiredStatus: { leboncoin: [{ key: "furniture_type", label: "Produit", state: "ok", value: "Table" }] }, stickyGeneric: { leboncoin: new Set(["furniture_type"]) },
    ebayRequiredStatus: [], genericFieldToSharedKey: C.genericFieldToSharedKey, SHARED_PROPAGATION: C.SHARED_PROPAGATION,
  });
  ok("sticky : un champ où la personne a écrit reste affiché (rempli), mais ne compte plus", q2.redTotal === 2 && q2.redRestants === 0, `${q2.redTotal}/${q2.redRestants}`);
  ok("valeur unique → confirmation explicite, seulement si on peut décocher", q.genSeule({ a: { state: "missing", allowedValues: ["Neuf avec étiquette"] } }) === true
    && R.questionsAPoser({ genericFieldToSharedKey: C.genericFieldToSharedKey, SHARED_PROPAGATION: C.SHARED_PROPAGATION, peutDecocher: false }).genSeule({ a: { state: "missing", allowedValues: ["x"] } }) === false);
}

console.log("\n[12] etatsFournee / ordreDePassage — ce que l'écran de suivi dit");
{
  const depuis = "2026-09-24T02:00:00.000Z";
  const jobs = [
    { platform: "vinted", action: "publish", status: "published", created_at: "2026-09-24T02:00:05Z", listing_url: "https://www.vinted.fr/items/1" },
    { platform: "leboncoin", action: "publish", status: "processing", created_at: "2026-09-24T02:00:05Z" },
    { platform: "beebs", action: "publish", status: "pending", created_at: "2026-09-24T02:00:05Z" },
    { platform: "opla", action: "publish", status: "needs_user", created_at: "2026-09-24T02:00:05Z", platform_fields: { needs_user_source: "opla_acces" } },
    { platform: "ebay", action: "publish", status: "failed", created_at: "2026-09-24T02:00:05Z", error: "refus eBay" },
    { platform: "vinted", action: "publish", status: "failed", created_at: "2026-09-20T02:00:05Z", error: "vieux" },
  ];
  const e = R.etatsFournee(jobs, ["vinted", "leboncoin", "beebs", "opla", "ebay"], depuis);
  ok("Vinted en ligne avec le lien (le vieux job failed est ignoré)", e.vinted.kind === "publiee" && e.vinted.url === "https://www.vinted.fr/items/1");
  ok("Leboncoin en cours, Beebs en file", e.leboncoin.kind === "en_cours" && e.beebs.kind === "en_file");
  ok("Opla : attente d'autorisation", e.opla.kind === "attente_autorisation");
  ok("eBay refusée avec le motif", e.ebay.kind === "refusee" && e.ebay.erreur === "refus eBay");
  ok("plateforme pas encore relue → en file", R.etatsFournee([], ["vinted"], depuis).vinted.kind === "en_file");
  ok("pending SANS message → en file", R.etatsFournee([{ platform: "leboncoin", status: "pending", created_at: depuis, error: "" }], ["leboncoin"], depuis).leboncoin.kind === "en_file");
  ok("pending AVEC message (attente de connexion, reprise espacée) → attente", R.etatsFournee([{ platform: "leboncoin", status: "pending", created_at: depuis, error: "En attente de ta connexion à Leboncoin dans Chrome" }], ["leboncoin"], depuis).leboncoin.kind === "attente");
  ok("ordre de passage : Leboncoin 1er, Beebs 2e, les autres sans rang", eq(R.ordreDePassage(e, ["vinted", "leboncoin", "beebs", "opla", "ebay"]), { leboncoin: 1, beebs: 2 }));
}

console.log("\n[13] les tables déménagées sont celles de l'ancien fichier");
ok("SHARED_PROPAGATION : couleur ne se propage pas à Leboncoin", !C.SHARED_PROPAGATION.couleur.includes("leboncoin") && C.SHARED_PROPAGATION.taille.includes("leboncoin"));
ok("genericFieldToSharedKey : LBC shoe_size → taille, Beebs Pointure → taille, Vinted brand → marque", C.genericFieldToSharedKey("leboncoin", "shoe_size") === "taille" && C.genericFieldToSharedKey("beebs", "Pointure") === "taille" && C.genericFieldToSharedKey("vinted", "brand") === "marque");
ok("canalGeneriquePose : Vinted toujours, LBC saute _brand, Beebs saute « Couleur », eBay jamais", C.canalGeneriquePose("vinted", "x") && !C.canalGeneriquePose("leboncoin", "clothing_brand") && !C.canalGeneriquePose("beebs", "Couleur") && !C.canalGeneriquePose("ebay", "x"));
ok("NO_BRAND_VALUE = « Sans marque »", C.NO_BRAND_VALUE === "Sans marque");

console.log("\n[14] questionsParPlateforme — la ligne de chaque plateforme dit CE qui la retient");
{
  const sel = new Set(["vinted", "leboncoin", "beebs", "ebay", "opla"]);
  const q = R.questionsParPlateforme({
    selected: sel,
    missingSharedFieldsDetailed: [{ key: "taille", platforms: ["vinted", "beebs", "ebay"] }],
    genericRequiredStatus: {
      leboncoin: [{ key: "furniture_type", label: "Produit", state: "missing" }, { key: "shoe_size", label: "Pointure", state: "missing" }],
      vinted: [{ key: "size_id", label: "Taille", state: "ok" }],
    },
    ebayRequiredStatus: [{ name: "Size", sharedKey: "taille", state: "missing" }, { name: "Department", label: "Département", state: "missing" }, { name: "Brand", state: "ok" }],
    vintedGenreBlocked: true, beebsGenreBlocked: false, descriptionVideVinted: true,
    libellePartage: { taille: "Taille", couleur: "Couleur", matiere: "Matière", marque: "Marque" },
    libelleGenre: "Genre", libelleDescription: "Description",
    genericFieldToSharedKey: C.genericFieldToSharedKey,
  });
  ok("Vinted : Taille (partagée), Genre, Description — chacune une fois", eq(q.vinted, ["Taille", "Genre", "Description"]));
  ok("Beebs : Taille seulement", eq(q.beebs, ["Taille"]));
  ok("eBay : Taille (via sharedKey, libellé partagé) puis Département, Brand ok ignoré", eq(q.ebay, ["Taille", "Département"]));
  ok("Leboncoin : Produit (propre) et Pointure → libellé partagé « Taille »", eq(q.leboncoin, ["Produit", "Taille"]));
  ok("Opla : rien ne la retient → absente", !("opla" in q));
  ok("une plateforme non cochée n'a pas de ligne", !("ebay" in R.questionsParPlateforme({ selected: new Set(["vinted"]), ebayRequiredStatus: [{ name: "Department", state: "missing" }] })));
}

// ═══ CHANTIER DU 24/09 — AUCUNE PUBLICATION NE PART AVEC UN CHAMP REFUSÉ ═══
console.log("\n[15] listeFaitFoiRelevee — fermée, entière, pas un champ à recherche");
{
  const enfant = ["Prématuré (- de 45 cm)", "3 ans (94-102 cm)", "12 ans (140-152 cm)", "16 ans (164-176 cm)"];
  ok("Beebs Taille (dropdown, 20 valeurs) fait foi", L.listeFaitFoiRelevee({ platform: "beebs", key: "Taille", inputType: "dropdown", allowedValues: enfant }) === true);
  ok("Beebs Format du colis (dropdown, 4 paliers) fait foi", L.listeFaitFoiRelevee({ platform: "beebs", key: "Format du colis", inputType: "dropdown", allowedValues: ["a", "b", "c", "d"] }) === true);
  ok("Beebs Marque (200 valeurs = relevé tronqué) ne fait pas foi", L.listeFaitFoiRelevee({ platform: "beebs", key: "Marque", inputType: "dropdown", allowedValues: Array.from({ length: 200 }, (_, i) => `M${i}`) }) === false);
  ok("Beebs Marque à 60 valeurs (relevé paresseux du 29/07) ne fait pas foi non plus : champ à recherche", L.listeFaitFoiRelevee({ platform: "beebs", key: "Marque", inputType: "dropdown", allowedValues: Array.from({ length: 60 }, (_, i) => `M${i}`) }) === false);
  ok("Vinted brand / model : jamais", !L.listeFaitFoiRelevee({ platform: "vinted", key: "brand", inputType: "dropdown", allowedValues: ["Zara"] }) && !L.listeFaitFoiRelevee({ platform: "vinted", key: "model", inputType: "list", allowedValues: ["A", "B"] }));
  ok("Vinted size (grid) fait foi ; input_type null (appris d'un 400) ne fait pas foi", L.listeFaitFoiRelevee({ platform: "vinted", key: "size", inputType: "grid", allowedValues: ["XS", "S"] }) && !L.listeFaitFoiRelevee({ platform: "vinted", key: "color", inputType: null, allowedValues: ["Noir"] }));
  ok("Leboncoin combobox (Univers, 11 valeurs) fait foi ; *_brand jamais", L.listeFaitFoiRelevee({ platform: "leboncoin", key: "clothing_type", inputType: "combobox", allowedValues: ["Femme", "Homme"] }) && !L.listeFaitFoiRelevee({ platform: "leboncoin", key: "clothing_brand", inputType: "combobox", allowedValues: ["Zara"] }));
  ok("Opla select / selection_only font foi", L.listeFaitFoiRelevee({ platform: "opla", key: "size", inputType: "select", allowedValues: ["44", "45"] }) && L.listeFaitFoiRelevee({ platform: "opla", key: "size", inputType: "selection_only", allowedValues: ["44"] }));
  ok("liste vide : rien à juger", L.listeFaitFoiRelevee({ platform: "beebs", key: "Taille", inputType: "dropdown", allowedValues: [] }) === false);
}

console.log("\n[16] BEEBS_PACKAGE_BY_FORMAT — le miroir est celui de beebs.js, valeur par valeur");
{
  const beebs = readFileSync(join(ROOT, "chrome-extension/content-scripts/beebs.js"), "utf8");
  const m = beebs.match(/const BEEBS_PACKAGE_BY_FORMAT = \{([\s\S]*?)\};/);
  const table = {};
  for (const [, k, v] of (m?.[1] ?? "").matchAll(/"([^"]+)":\s*"([^"]+)"/g)) table[k] = v;
  ok("la table est lue dans beebs.js (5 formats)", Object.keys(table).length === 5, JSON.stringify(table));
  ok("app et extension traduisent chaque format vers le même palier", eq(table, L.BEEBS_PACKAGE_BY_FORMAT), JSON.stringify(L.BEEBS_PACKAGE_BY_FORMAT));
  ok("valeurPourListe : « Petit colis » → « Poids jusqu'à 1 kg max », un palier passe tel quel, une autre clé aussi",
    L.valeurPourListe("beebs", "Format du colis", "Petit colis") === "Poids jusqu'à 1 kg max"
    && L.valeurPourListe("beebs", "Format du colis", "Poids jusqu'à 2 kg max") === "Poids jusqu'à 2 kg max"
    && L.valeurPourListe("beebs", "Taille", "Petit colis") === "Petit colis");
}

console.log("\n[17] jugerValeurContreListe — traduire, rapprocher, jamais convertir");
{
  const enfant = ["Prématuré (- de 45 cm)", "Naissance - 0 mois (45-50 cm)", "3 ans (94-102 cm)", "10 ans (128-140 cm)", "12 ans (140-152 cm)", "16 ans (164-176 cm)"];
  const paliers = ["Poids jusqu'à 200g max", "Poids jusqu'à 500g max", "Poids jusqu'à 1 kg max", "Poids jusqu'à 2 kg max"];
  const v1 = L.jugerValeurContreListe({ platform: "beebs", key: "Taille", value: "XS / 34", allowedValues: enfant });
  ok("Primark : « XS / 34 » n'est pas dans la grille enfant, et rien ne s'en rapproche", v1.dans === false && v1.suggested === null, JSON.stringify(v1));
  const v2 = L.jugerValeurContreListe({ platform: "beebs", key: "Format du colis", value: "Petit colis", allowedValues: paliers });
  ok("Primark : « Petit colis » EST dans les paliers (traduit comme beebs.js le posera)", v2.dans === true && v2.valeurListe === "Poids jusqu'à 1 kg max", JSON.stringify(v2));
  const v3 = L.jugerValeurContreListe({ platform: "beebs", key: "Format du colis", value: "Grand colis", allowedValues: paliers });
  ok("« Grand colis » (5 kg) sur une catégorie plafonnée à 2 kg : hors liste, sans rapprochement", v3.dans === false && v3.suggested === null, JSON.stringify(v3));
  const sneakers = Array.from({ length: 37 }, (_, i) => String(14 + i));
  const v4 = L.jugerValeurContreListe({ platform: "opla", key: "size", value: "44.5", allowedValues: sneakers, cheminCategorie: ["Hommes", "Chaussures", "Baskets"] });
  ok("Opla : 44.5 sur une grille d'entiers → hors liste, JAMAIS arrondie", v4.dans === false && v4.suggested === null, JSON.stringify(v4));
  ok("Opla : « 44 » y est", L.jugerValeurContreListe({ platform: "opla", key: "size", value: "44", allowedValues: sneakers }).dans === true);
  const titresFilles = ["0 mois", "0-3 mois", "12 ans", "13 ans"];
  ok("Opla : « 12 ans / 152 cm » (composite Vinted) est « 12 ans » dans la grille enfant", L.jugerValeurContreListe({ platform: "opla", key: "size", value: "12 ans / 152 cm", allowedValues: titresFilles }).valeurListe === "12 ans");
  ok("Opla : « 12Y » (code) désigne « 12 ans » (titre)", L.jugerValeurContreListe({ platform: "opla", key: "size", value: "12Y", allowedValues: titresFilles }).valeurListe === "12 ans");
  const femmes = ["Taille unique", "XXS", "XS", "S", "M", "L", "XL"];
  ok("Opla branche Femmes : « 38 » sur une grille de lettres → M (table Vinted, autorisée là seulement)", L.jugerValeurContreListe({ platform: "opla", key: "size", value: "38", allowedValues: femmes, cheminCategorie: ["Femmes", "Vêtements", "Robes"] }).valeurListe === "M");
  ok("Opla branche Hommes : le même « 38 » n'est PAS converti", L.jugerValeurContreListe({ platform: "opla", key: "size", value: "38", allowedValues: femmes, cheminCategorie: ["Hommes", "Vêtements"] }).dans === false);
  const grilleVinted = ["XXS / 32 / 4", "XS / 34 / 6", "S / 36 / 8", "M / 38 / 10", "Taille unique", "Autre"];
  ok("Vinted : « XS » est dans « XS / 34 / 6 » (étiquette composite de la grille)", L.jugerValeurContreListe({ platform: "vinted", key: "size", value: "XS", allowedValues: grilleVinted }).valeurListe === "XS / 34 / 6");
  ok("Vinted : « 38,5 » = « 38.5 » et « EU 39 » = « 39 »", L.jugerValeurContreListe({ platform: "vinted", key: "size", value: "38,5", allowedValues: ["38", "38.5", "39"] }).valeurListe === "38.5"
    && L.jugerValeurContreListe({ platform: "vinted", key: "size", value: "EU 39", allowedValues: ["38", "38.5", "39"] }).valeurListe === "39");
  const v5 = L.jugerValeurContreListe({ platform: "leboncoin", key: "clothing_st", value: "XS", allowedValues: ["32 - XXS", "34 - XS", "36 - S"] });
  ok("Leboncoin : « XS » EST « 34 - XS » (composant exact de l'étiquette, comme leboncoin.js)", v5.dans === true && v5.valeurListe === "34 - XS", JSON.stringify(v5));
  ok("pointure 38.5 sur une grille d'entiers : hors liste, aucune suggestion (jamais 38)", (() => { const r = L.jugerValeurContreListe({ platform: "beebs", key: "Pointure", value: "38.5", allowedValues: ["37", "38", "39"] }); return r.dans === false && r.suggested === null; })());
  ok("une valeur qui n'est pas une taille garde le rapprochement par mots (« Unique » → « Taille unique »)", L.jugerValeurContreListe({ platform: "beebs", key: "Matière", value: "Coton 60% Polyester 40%", allowedValues: ["Coton", "Laine", "Autre"] }).suggested === "Coton");
  ok("Beebs État : « Neuf, sans étiquette » = « Neuf sans étiquette » (virgule du libellé)", L.jugerValeurContreListe({ platform: "beebs", key: "État", value: "Neuf sans étiquette", allowedValues: ["Neuf, avec étiquette", "Neuf, sans étiquette", "Très bon état"] }).valeurListe === "Neuf, sans étiquette");
  ok("valeur vide → pas dans la liste, rien suggéré ; liste vide → présence = ok", L.jugerValeurContreListe({ platform: "beebs", key: "Taille", value: "", allowedValues: enfant }).dans === false
    && L.jugerValeurContreListe({ platform: "beebs", key: "Taille", value: "XS", allowedValues: [] }).dans === true);
}

console.log("\n[18] horsListeBloque — la règle classique ne bouge pas, la nouvelle bloque sans rapprochement");
{
  const enfant = ["3 ans (94-102 cm)", "12 ans (140-152 cm)"];
  ok("classique : jamais bloquant, même liste qui fait foi", L.horsListeBloque({ regle: "classique", platform: "beebs", key: "Taille", inputType: "dropdown", allowedValues: enfant }) === false);
  ok("par défaut (sans règle) = classique", L.horsListeBloque({ platform: "beebs", key: "Taille", inputType: "dropdown", allowedValues: enfant }) === false);
  ok("nouvelle : bloquant sur une liste qui fait foi sans rapprochement", L.horsListeBloque({ regle: "nouvelle", platform: "beebs", key: "Taille", inputType: "dropdown", allowedValues: enfant }) === true);
  ok("nouvelle : un rapprochement sûr n'est pas bloquant (posé d'office à l'écran Confirmer)", L.horsListeBloque({ regle: "nouvelle", platform: "leboncoin", key: "clothing_st", inputType: "combobox", allowedValues: ["34 - XS"], suggested: "34 - XS" }) === false);
  ok("nouvelle : Marque Beebs (recherche) jamais bloquante", L.horsListeBloque({ regle: "nouvelle", platform: "beebs", key: "Marque", inputType: "dropdown", allowedValues: ["Zara", "Nike"] }) === false);
  ok("vintedExigeUneMarque : partout sauf « Livres et médias »", L.vintedExigeUneMarque(["Maison", "Décoration", "Encadrements"]) && L.vintedExigeUneMarque(["Femmes", "Vêtements"]) && !L.vintedExigeUneMarque(["Livres et médias", "Livres"]));
}

console.log("\n[19] le cas Primark, de bout en bout, dans le moteur");
{
  const enfant = ["Prématuré (- de 45 cm)", "3 ans (94-102 cm)", "12 ans (140-152 cm)", "16 ans (164-176 cm)"];
  const paliers = ["Poids jusqu'à 200g max", "Poids jusqu'à 500g max", "Poids jusqu'à 1 kg max", "Poids jusqu'à 2 kg max"];
  const marques200 = Array.from({ length: 200 }, (_, i) => `Marque ${i}`);
  // Ce que genericRequiredStatus (nouveau stepper) construit pour la copie Beebs
  // du jogging : taille « XS / 34 », format « Petit colis », marque « Primark ».
  const juger = (key, value, allowedValues, inputType = "dropdown") => {
    const v = L.jugerValeurContreListe({ platform: "beebs", key, value, allowedValues });
    if (v.dans) return { key, label: key, state: "ok", value, allowedValues };
    return { key, label: key, state: "invalid", value, allowedValues, suggested: v.suggested, dedicatedTarget: "x",
      blocking: L.horsListeBloque({ regle: "nouvelle", platform: "beebs", key, inputType, allowedValues, suggested: v.suggested }) };
  };
  const st = { beebs: [juger("Taille", "XS / 34", enfant), juger("Format du colis", "Petit colis", paliers), juger("Marque", "Primark", marques200)],
               vinted: [{ key: "size", label: "Taille", state: "ok", value: "XS" }] };
  ok("Taille bloque, Format du colis passe (traduit), Marque passe (liste tronquée : Beebs tranchera)", eq(R.champsBloquantsParPlateforme(st), { beebs: ["Taille"] }), JSON.stringify(R.champsBloquantsParPlateforme(st)));
  const sel = new Set(["beebs", "vinted"]);
  const ex = R.calculerExclusions({ selected: sel, platformSupport: {}, platformListings: { platforms: { beebs: {}, vinted: {} } }, champsManquantsParPf: R.champsBloquantsParPlateforme(st) });
  ok("« Publier » n'emmène que Vinted ; Beebs est nommée avec son champ", eq(ex.aPublier, ["vinted"]) && eq(ex.exclues, [{ platform: "beebs", motif: "champ_manquant", champs: ["Taille"] }]), JSON.stringify(ex.exclues));
  const q = R.questionsAPoser({ genericRequiredStatus: st, genericFieldToSharedKey: C.genericFieldToSharedKey, SHARED_PROPAGATION: C.SHARED_PROPAGATION });
  ok("le bloc de questions pose la Taille Beebs (et elle seule), avec la grille enfant", q.redGenericAspects.length === 1 && q.redGenericAspects[0].a.key === "Taille" && q.redRestants === 1 && eq(q.redGenericAspects[0].a.allowedValues, enfant));
  const lignes = R.questionsParPlateforme({ selected: sel, genericRequiredStatus: st, libellePartage: { taille: "Taille" }, genericFieldToSharedKey: C.genericFieldToSharedKey });
  ok("la ligne Beebs de l'écran Confirmer dit « Attend : Taille », Vinted n'a pas de ligne", eq(lignes, { beebs: ["Taille"] }), JSON.stringify(lignes));
  // Une fois la taille choisie dans la grille : plus rien ne retient Beebs.
  const st2 = { ...st, beebs: [juger("Taille", "12 ans (140-152 cm)", enfant), st.beebs[1], st.beebs[2]] };
  ok("réponse « 12 ans (140-152 cm) » → Beebs part", eq(R.champsBloquantsParPlateforme(st2), {}) && R.calculerExclusions({ selected: sel, platformSupport: {}, platformListings: { platforms: { beebs: {}, vinted: {} } }, champsManquantsParPf: R.champsBloquantsParPlateforme(st2) }).aPublier.length === 2);
  // La CARTE (champsDuRayon) dit la même chose que le moteur, dans les deux règles.
  const catalogue = [
    { field_key: "Taille", field_label: "Taille", required: true, input_type: "dropdown", allowed_values: enfant },
    { field_key: "Format du colis", field_label: "Format du colis", required: true, input_type: "dropdown", allowed_values: paliers },
    { field_key: "Marque", field_label: "Marque", required: true, input_type: "dropdown", allowed_values: marques200 },
  ];
  const pf = { taille: "XS / 34", format_colis: "Petit colis", marque: "Primark" };
  // La carte reçoit aussi la configuration locale (c'est elle qui sait que
  // « Format du colis » vit dans notre clé format_colis) — comme dans l'app.
  const locale = D.lignesDepuisConfigLocale([{ key: "format_colis", label: "Format du colis", options: ["Lettre", "Petit colis"] }]);
  const carteNouvelle = D.classerChamps([...catalogue, ...locale], pf, "beebs", { regle: "nouvelle" });
  ok("carte (règle nouvelle) : « À compléter » = Taille seule ; format et marque « déjà remplis »", eq(carteNouvelle.questions.map(x => x.cle), ["Taille"]) && eq(carteNouvelle.connus.map(x => x.cle).sort(), ["Format du colis", "Marque"]), JSON.stringify(carteNouvelle.questions.map(x => x.cle)));
  const carteClassique = D.classerChamps([...catalogue, ...locale], pf, "beebs");
  ok("carte (règle classique, ancien stepper) : les trois « hors grille » comme le 20/09, inchangé", eq(carteClassique.questions.map(x => x.cle).sort(), ["Format du colis", "Marque", "Taille"]), JSON.stringify(carteClassique.questions.map(x => x.cle)));
}

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
