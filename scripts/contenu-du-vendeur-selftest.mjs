// ═══════════════════════════════════════════════════════════════════════════
// LE CONTENU DU VENDEUR PART TEL QUEL — SELFTEST PERMANENT (22/10 soir, point 8 — Louis, Zombicide)
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Nico (22/10) : le titre, la description, l'état et les photos d'une fiche IMPORTÉE (Vinted, Leboncoin,
// Beebs, eBay, Depop) ou ÉCRITE PAR LE VENDEUR partent TELS QUELS, sur chaque plateforme, en publication, en lot
// et en republication. L'IA ne complète que ce qui est vide CHEZ LE VENDEUR ; une case vide parce que l'annonce
// d'origine n'est pas encore lue n'est pas vide : on attend (« en cours de lecture de ton annonce d'origine »),
// jamais une erreur. L'état n'est jamais dégradé ; toutes les photos partent, dans l'ordre.
//
// Ce test ÉCHOUE si l'une de ces garanties casse, pour CHAQUE plateforme × CHAQUE chemin d'import :
//   A. la lecture d'origine attendue (et seulement quand il le faut — jamais une attente sans fin) ;
//   B. au départ (get-pending-jobs), une copie produite AVANT la lecture reçoit le texte, l'état, les photos du
//      vendeur — publication comme republication (le contenu d'une republication date du premier dépôt) ;
//   C. une copie produite APRÈS (choix de la personne, adaptation à la plateforme) n'est jamais touchée ;
//   D. les chemins qui portent la règle la portent toujours (lecture du code) : get-pending-jobs, le Stock, le lot,
//      generate-listing (texte du vendeur gardé, titre compris), l'extension (jamais un texte écrasé, jamais
//      d'interblocage du verrou de flux).
import fs from "node:fs";
import {
  PLATEFORMES_IMPORT, plateformeOrigine, lectureOrigineEnAttente, messageLectureOrigine, contenuAImposer,
  texteDuVendeurSurFiche, copieReprendLeTexte,
} from "../supabase/functions/_shared/contenu-fiche.js";
import { tierEtat, RANG_ETAT, etatPourPlateforme } from "../supabase/functions/_shared/etat-plateformes.js";

let echecs = 0, n = 0;
const ok = (cond, titre, detail = "") => {
  n++;
  if (cond) return;
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const CHEZ_NOUS = (k) => `https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/photos/zombicide-${k}.jpg`;
const PHOTOS_VENDEUR = [1, 2, 3, 4].map(CHEZ_NOUS);
const DESCRIPTION_VENDEUR = "🎯 Organisez vos figurines Zombicide : insert de rangement imprimé en 3D, couvercle aimanté, 12 cases.";
const ETAT_VENDEUR = "Neuf sans étiquette";
const AVANT_LECTURE = "2026-10-20T11:57:00.000Z";   // 13:57 à Paris : le dépôt Leboncoin de Louis
const LECTURE = "2026-10-20T20:20:00.000Z";         // 22:20 : la capture Beebs
const APRES_LECTURE = "2026-10-21T08:00:00.000Z";

const ORIGINES = [
  { origine: "vinted_sync", plateforme: "vinted" },
  { origine: "releve_leboncoin", plateforme: "leboncoin" },
  { origine: "releve_beebs", plateforme: "beebs" },
  { origine: "releve_ebay", plateforme: "ebay" },
  { origine: "releve_depop", plateforme: "depop" },
];
const CIBLES = ["vinted", "leboncoin", "beebs", "ebay", "depop"];

// La fiche AVANT la lecture de son annonce d'origine (ce qu'un relevé de liste apporte : titre, vignette).
const ficheVide = (origine) => ({
  id: 1792497207175, origine, titre: "Insert / Rangement Zombicide Rouge",
  description: "", photos: [CHEZ_NOUS("vignette")],
  attributs: origine === "vinted_sync" ? { etat: { v: ETAT_VENDEUR } } : {},
});
// La fiche APRÈS : le texte, l'état et les photos du vendeur.
const ficheLue = (origine) => ({
  id: 1792497207175, origine, titre: "Insert / Rangement Zombicide Rouge",
  description: DESCRIPTION_VENDEUR, photos: PHOTOS_VENDEUR,
  attributs: { etat: { v: ETAT_VENDEUR }, description_source: { v: origine === "vinted_sync" ? "vinted" : origine, at: LECTURE } },
});
const annonceOrigine = (plateforme, lue) => ({ platform: plateforme, capture_le: lue ? LECTURE : null, disparu_le: null });
// Une copie rédigée par le moteur faute de texte (ce qui est parti pour Louis).
const copieDuMoteur = (cible, action, origine) => ({
  id: "job", platform: cible, action, created_at: action === "republish" ? "2026-10-22T16:00:00.000Z" : AVANT_LECTURE,
  title: "Insert / Rangement Zombicide Rouge",
  description: "Superbe insert de rangement pour jeu de société, idéal pour organiser vos figurines. Très bon état.",
  photos: [{ url: CHEZ_NOUS("vignette"), type: "original" }], photo_option: "original",
  platform_fields: { etat: origine === "vinted_sync" ? etatPourPlateforme(ETAT_VENDEUR, cible === "depop" ? "vinted" : cible)?.valeur : "Très bon état" },
});

console.log("A. LA LECTURE D'ORIGINE — attendue quand il le faut, jamais sans fin");
ok(PLATEFORMES_IMPORT.join(",") === "vinted,leboncoin,beebs,ebay,depop", "les cinq chemins d'import connus", PLATEFORMES_IMPORT.join(","));
for (const { origine, plateforme } of ORIGINES) {
  ok(plateformeOrigine({ origine }) === plateforme, `${origine} → plateforme d'origine ${plateforme}`);
  const a = lectureOrigineEnAttente(ficheVide(origine), [annonceOrigine(plateforme, false)]);
  if (plateforme === "ebay") {
    ok(a === null, `${origine} : l'API eBay lit l'annonce entière → aucune attente`, JSON.stringify(a));
  } else {
    ok(a?.plateforme === plateforme && a.manque.includes("description"), `${origine} : annonce d'origine pas encore lue → on ATTEND (description)`, JSON.stringify(a));
    if (plateforme !== "vinted") ok(a?.manque.includes("etat") && a.manque.includes("photos"), `${origine} : l'état et les photos aussi`, JSON.stringify(a));
    const msg = messageLectureOrigine(a);
    ok(/En cours de lecture de ton annonce d'origine/.test(msg) && !/erreur|échec|impossible/i.test(msg), `${origine} : « en cours de lecture de ton annonce d'origine », jamais une erreur`, msg);
    ok(!/erreur|error|fail/i.test(messageLectureOrigine(a, "en")), `${origine} : la phrase anglaise non plus`);
  }
  // Lue → plus d'attente.
  ok(lectureOrigineEnAttente(ficheLue(origine), [annonceOrigine(plateforme, true)]) === null, `${origine} : lue → plus rien à attendre`);
  // Jamais une attente sans fin.
  if (plateforme === "vinted") {
    ok(lectureOrigineEnAttente(ficheVide(origine), [], { origineLueLe: LECTURE }) === null, "vinted_sync : détail déjà lu, sans description chez le vendeur → on n'attend plus");
    ok(lectureOrigineEnAttente({ ...ficheVide(origine), disparu_le: LECTURE }, []) === null, "vinted_sync : annonce disparue du dressing → rien à lire, on n'attend pas");
  } else if (plateforme !== "ebay") {
    ok(lectureOrigineEnAttente(ficheVide(origine), [annonceOrigine(plateforme, true)]) === null, `${origine} : annonce lue mais vide chez le vendeur → l'IA peut compléter (on n'attend plus)`);
    ok(lectureOrigineEnAttente(ficheVide(origine), [{ ...annonceOrigine(plateforme, false), disparu_le: LECTURE }]) === null, `${origine} : annonce d'origine disparue → rien à lire`);
  }
}
ok(lectureOrigineEnAttente({ origine: null, description: "", photos: [] }, []) === null, "fiche écrite dans FillSell (Lens, saisie) : jamais d'attente");
ok(lectureOrigineEnAttente({ origine: "releve_opla", description: "" }, [{ platform: "opla" }]) === null, "Opla (quittée le 10/10) : plus aucun import");

console.log("B. AU DÉPART : le contenu du vendeur remplace celui que le moteur a rédigé AVANT la lecture");
for (const { origine } of ORIGINES) {
  const f = ficheLue(origine);
  ok(texteDuVendeurSurFiche(f), `${origine} : la fiche porte le contenu du vendeur`);
  for (const cible of CIBLES) {
    for (const action of ["publish", "republish"]) {
      if (action === "republish" && cible === "vinted") continue;   // recréée depuis l'annonce en ligne (capture) : voir D
      const job = copieDuMoteur(cible, action, origine);
      const temps = {
        // Une republication recopie son dépôt : le contenu date du PREMIER dépôt (chaîne jobs_contenu_origine).
        contenuLe: AVANT_LECTURE,
        descriptionLueLe: LECTURE, etatLuLe: origine === "vinted_sync" ? "2026-10-19T10:00:00.000Z" : LECTURE, photosLuesLe: LECTURE,
      };
      const imp = contenuAImposer(job, f, temps);
      const cas = `${origine} → ${cible} (${action === "publish" ? "publication / lot" : "republication"})`;
      ok(imp.description === DESCRIPTION_VENDEUR, `${cas} : la description du vendeur, telle quelle`, String(imp.description).slice(0, 80));
      const attendu = etatPourPlateforme(ETAT_VENDEUR, cible === "depop" ? "vinted" : cible)?.valeur;
      if (origine === "vinted_sync") {
        ok(imp.etat === undefined, `${cas} : l'état venait déjà du dressing (lu avant le dépôt) → pas touché`, String(imp.etat));
      } else {
        ok(imp.etat === attendu, `${cas} : l'état du vendeur (« ${attendu} »)`, String(imp.etat));
        ok(imp.etat == null || RANG_ETAT[tierEtat(imp.etat)] >= RANG_ETAT[tierEtat(ETAT_VENDEUR)], `${cas} : jamais dégradé`, String(imp.etat));
      }
      ok(JSON.stringify(imp.photos) === JSON.stringify(PHOTOS_VENDEUR), `${cas} : TOUTES les photos, dans l'ordre`, JSON.stringify(imp.photos));
    }
  }
}
// Fiche écrite par le vendeur dans FillSell (marqueur manuel) : même règle.
{
  const f = { id: 1, origine: null, titre: "Veste en jean", description: "Veste portée deux fois, taille M, aucune tache.", photos: PHOTOS_VENDEUR,
    attributs: { description_source: { v: "manuel", at: LECTURE }, titre_source: { v: "manuel" }, etat: { v: "Bon état", at: LECTURE } } };
  ok(texteDuVendeurSurFiche(f), "fiche écrite par le vendeur (manuel) : son contenu fait foi");
  const imp = contenuAImposer({ ...copieDuMoteur("leboncoin", "publish", "x"), platform_fields: { etat: "Satisfaisant" } }, f,
    { contenuLe: AVANT_LECTURE, descriptionLueLe: LECTURE, etatLuLe: LECTURE, photosLuesLe: LECTURE });
  ok(imp.description === f.description && imp.etat === "Bon état", "fiche manuelle : texte et état du vendeur imposés à une copie antérieure", JSON.stringify(imp));
}
// Une fiche du Lens (brouillon d'analyse, aucun marqueur) : le moteur reste maître — rien n'est imposé.
ok(contenuAImposer(copieDuMoteur("leboncoin", "publish", "x"), { id: 2, origine: null, description: "Brouillon", attributs: {} },
  { contenuLe: AVANT_LECTURE, descriptionLueLe: LECTURE }).raisons.length === 0, "fiche du Lens (texte rédigé par nous) : rien d'imposé");

// (22/10 soir) Une copie rédigée AVANT la règle du 21/09 (le moteur réécrivait le texte du vendeur même quand la
// fiche le portait) : chaque republication la recopiait — elle reçoit le texte du vendeur, lu avant ou après.
{
  const f = ficheLue("releve_beebs");
  const vieille = { ...copieDuMoteur("leboncoin", "republish", "releve_beebs"), created_at: "2026-10-18T13:00:00.000Z" };
  const imp = contenuAImposer(vieille, f, { contenuLe: "2026-09-19T16:00:00.000Z", descriptionLueLe: "2026-09-18T10:00:00.000Z" });
  ok(imp.description === DESCRIPTION_VENDEUR, "republication d'un dépôt du 19/09 (avant la règle du 21/09) : le texte du vendeur, même lu avant", JSON.stringify(imp.raisons));
  const recente = contenuAImposer(vieille, f, { contenuLe: "2026-10-01T16:00:00.000Z", descriptionLueLe: "2026-09-18T10:00:00.000Z" });
  ok(recente.description === undefined, "dépôt du 01/10 rédigé APRÈS la lecture (la règle en place) : sa copie n'est pas touchée", JSON.stringify(recente.raisons));
}

console.log("C. JAMAIS AU-DESSUS D'UN CHOIX DE LA PERSONNE, NI D'UNE ADAPTATION");
{
  const f = ficheLue("releve_beebs");
  const temps = { contenuLe: APRES_LECTURE, descriptionLueLe: LECTURE, etatLuLe: LECTURE, photosLuesLe: LECTURE };
  const choix = { ...copieDuMoteur("leboncoin", "publish", "releve_beebs"), created_at: APRES_LECTURE, description: "Mon texte retouché pour Leboncoin." };
  ok(contenuAImposer(choix, f, temps).raisons.length === 0, "copie produite APRÈS la lecture (vue et validée) : jamais touchée");
  const adaptee = { ...copieDuMoteur("vinted", "publish", "releve_beebs"), description: DESCRIPTION_VENDEUR.slice(0, 70) };
  ok(copieReprendLeTexte(adaptee.description, DESCRIPTION_VENDEUR), "une coupe à la longueur de la plateforme garde le texte du vendeur");
  ok(contenuAImposer(adaptee, f, { ...temps, contenuLe: AVANT_LECTURE }).description === undefined, "copie qui reprend déjà le texte (adaptation) : description pas réimposée");
  const meilleur = { ...copieDuMoteur("leboncoin", "publish", "releve_beebs"), platform_fields: { etat: "Neuf avec étiquette" } };
  const im = contenuAImposer(meilleur, { ...f, attributs: { ...f.attributs, etat: { v: "Bon état", at: LECTURE } } }, { ...temps, contenuLe: AVANT_LECTURE });
  ok(im.etat === undefined, "état de la copie déjà au-dessus : jamais redescendu par ce chemin", String(im.etat));
  const retouchee = { ...copieDuMoteur("leboncoin", "publish", "releve_beebs"), photo_option: "retouche" };
  ok(contenuAImposer(retouchee, f, { ...temps, contenuLe: AVANT_LECTURE }).photos === undefined, "photos retouchées (choix de la personne) : pas remplacées");
  const cdn = contenuAImposer(copieDuMoteur("leboncoin", "publish", "releve_beebs"), { ...f, photos: ["https://images.beebs.app/a.jpg", "https://images.beebs.app/b.jpg"] },
    { ...temps, contenuLe: AVANT_LECTURE });
  ok(cdn.photos === undefined && cdn.photos_a_rapatrier === true, "photos encore chez la plateforme : on attend leur rapatriement (jamais une adresse de CDN)", JSON.stringify(cdn));
}

console.log("D. LES CHEMINS PORTENT LA RÈGLE (lecture du code)");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/import \{ lectureOrigineEnAttente, contenuAImposer, messageLectureOrigine \} from "\.\.\/_shared\/contenu-fiche\.js"/.test(gpj), "get-pending-jobs importe LA règle (pas une copie)");
  const bloc = gpj.slice(gpj.indexOf("LE CONTENU DU VENDEUR PART TEL QUEL"), gpj.indexOf("UNE REPUBLICATION RECRÉÉE EST FINIE"));
  ok(bloc.length > 1000, "get-pending-jobs : le bloc du contenu du vendeur est là");
  ok(/\["publish", "republish"\]\.includes/.test(bloc), "get-pending-jobs : publication ET republication (le lot crée des publications)");
  ok(/!\(String\(j\.action\) === "republish" && j\.platform === "vinted"\)/.test(bloc), "get-pending-jobs : une republication Vinted (recréée depuis l'annonce en ligne) n'est jamais retenue");
  ok(/origineLueLe: f\.origine_lue_le/.test(bloc), "get-pending-jobs : une lecture déjà faite lève l'attente");
  ok(/error: messageLectureOrigine\(attente\)/.test(bloc) && !/status: "(failed|needs_user)"/.test(bloc), "get-pending-jobs : l'attente reste « pending » avec sa phrase, jamais un échec");
  ok(/jobs_contenu_origine/.test(bloc) && /contenuLe\.get\(String\(j\.id\)\)/.test(bloc), "get-pending-jobs : le contenu d'une republication date de son dépôt d'origine");
  const stock = lire("src/tabs/StockTab.jsx");
  const pad = stock.slice(stock.indexOf("const publierAvecDetail = async"), stock.indexOf("ouvrirStepper(r?.item ?? item);"));
  ok(/attenteLectureOrigine\(supabase, user\.id, item\.id\)/.test(pad) && /demanderLectureOrigine\(supabase, item\.id\)/.test(pad) && /messageLectureOrigine\(/.test(pad),
    "Stock (Publier à l'unité) : la fiche importée pas encore lue ne s'ouvre pas, la lecture est demandée, la phrase est dite");
  const lot = lire("src/publication/lot/LotPublication.jsx");
  ok(/attenteLectureOrigine\(supabase, userId,/.test(lot) && /phase: "origine"/.test(lot) && /messageLectureOrigine\(attenteOrigine/.test(lot),
    "Lot : l'article importé pas encore lu ne se prépare pas, il attend « origine » avec sa phrase");
  ok(/n\[id\] = \{ \.\.\.n\[id\], phase: "attente", raison: null \}/.test(lot), "Lot : il repart tout seul dès que l'annonce d'origine est lue");
  const gl = lire("supabase/functions/generate-listing/index.ts");
  ok(/const venuDUnReleve = origineItem\.startsWith\("releve"\)/.test(gl) && /const venuDuDressing = origineItem === "vinted_sync"/.test(gl),
    "generate-listing : un texte relevé ou du dressing est celui du vendeur");
  ok((gl.match(/texteDuVendeur\("(description|titre)_source"\) \|\| venuDUnReleve \|\| venuDuDressing/g) ?? []).length === 2,
    "generate-listing : description ET titre gardés (jamais réécrits par l'IA)");
  const bg = lire("chrome-extension/background.js");
  const lecteur = bg.slice(bg.indexOf("async function lireAnnoncesOrigineEnAttente"), bg.indexOf("// Nombre de jobs que le serveur a retenus"));
  ok(lecteur.length > 500 && !/fetchVintedItemDetail\(/.test(lecteur) && /lireDetailVintedSousVerrou\(/.test(lecteur),
    "extension : la lecture d'origine (dans le poll, verrou tenu) n'appelle jamais la lecture qui reprend le verrou (interblocage)");
  ok(/or=\(description\.is\.null,description\.eq\.\)/.test(lecteur), "extension : la description n'est écrite que sur une fiche VIDE (jamais un texte écrasé)");
  ok(/rpc\/lecture_origine_faite/.test(lecteur), "extension : une lecture faite clôt la demande (jamais une attente sans fin)");
}

console.log("E. (22/10 nuit, décisions de Nico) L'ÉTAT JAMAIS DÉGRADÉ EN REPUBLICATION ; VINTED : LA CAPTURE CORRIGÉE PAR LA FICHE");
{
  // Une republication recopie un ancien dépôt : un état plus bas que la fiche remonte, même lu avant la copie.
  const f = { ...ficheLue("releve_leboncoin"), attributs: { etat: { v: "Neuf sans étiquette", at: "2026-09-01T10:00:00.000Z" }, description_source: { v: "releve_leboncoin", at: "2026-09-01T10:00:00.000Z" } } };
  const rep = { ...copieDuMoteur("leboncoin", "republish", "releve_leboncoin"), description: DESCRIPTION_VENDEUR, platform_fields: { etat: "Très bon état" } };
  const imp = contenuAImposer(rep, f, { contenuLe: "2026-10-01T10:00:00.000Z", descriptionLueLe: "2026-09-01T10:00:00.000Z", etatLuLe: "2026-09-01T10:00:00.000Z" });
  ok(imp.etat === "Neuf sans étiquette", "republication d'un état dégradé (lu avant la copie) : l'état de la fiche", JSON.stringify(imp));
  const pub = contenuAImposer({ ...rep, action: "publish" }, f, { contenuLe: "2026-10-01T10:00:00.000Z", etatLuLe: "2026-09-01T10:00:00.000Z" });
  ok(pub.etat === undefined, "publication rédigée après la lecture (vue par la personne) : son état n'est pas touché", JSON.stringify(pub));
  const haut = contenuAImposer({ ...rep, platform_fields: { etat: "Neuf avec étiquette" } }, f, { contenuLe: "2026-10-01T10:00:00.000Z" });
  ok(haut.etat === undefined, "état de copie plus HAUT que la fiche : jamais touché (louis-seller, décision de Nico)", JSON.stringify(haut));
  // Leboncoin : le critère du formulaire (lbcAspects.condition) part AVANT platform_fields.etat — c'est lui qui compte
  // (vu le 22/10 nuit sur Louis : état imposé « Neuf », critère « Très bon état » repris de l'ancienne annonce).
  const lbc = contenuAImposer({ ...rep, platform_fields: { etat: "Neuf sans étiquette", lbcAspects: { condition: "Très bon état", toy_type: "Jeux de société" } } }, f,
    { contenuLe: "2026-10-01T10:00:00.000Z" });
  ok(lbc.etat === "Neuf sans étiquette", "Leboncoin : critère « Très bon état » sous un état « Neuf » → l'état de la fiche est imposé", JSON.stringify(lbc));
  const lbcOk = contenuAImposer({ ...rep, platform_fields: { etat: "Neuf sans étiquette", lbcAspects: { condition: "État neuf" } } }, f, { contenuLe: "2026-10-01T10:00:00.000Z" });
  ok(lbcOk.etat === undefined, "Leboncoin : critère « État neuf » (grille sans étiquette) = la fiche → rien à imposer", JSON.stringify(lbcOk));
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/if \(\/\(_condition\$\|\^condition\$\)\/\.test\(cle\)\s*&& \(\(pf\["contenu_du_vendeur"\]/.test(gpj),
    "get-pending-jobs : l'état de l'ancienne annonce n'est jamais reposé sur une copie qui a reçu l'état du vendeur");
}
{
  const { correctionCaptureVinted } = await import("../supabase/functions/_shared/capture-corrigee.js");
  const ficheArt = { origine: null, titre: "Huile sur toile style post impressionisme - P.Vicent - 1977", description: "", attributs: { etat: { v: "Bon état" } } };
  const c1 = correctionCaptureVinted(ficheArt, { categoryPath: ["Loisirs créatifs", "Peinture", "Toiles et panneaux"], catalog_id_depot: 5267, etat: "Bon état" }, { catalog_id: 5267, status_id: 3 });
  ok(c1?.libelles.catalog_id_depot === 3847 && c1.libelles.categoryPath.at(-1) === "Peintures" && c1.raisons.join() === "categorie_oeuvre",
    "paugues : une œuvre rangée en « Toiles et panneaux » repart dans « Peintures » (3847)", JSON.stringify(c1));
  ok(c1?.libelles.etat === "Bon état" && c1.natif.status_id === 3, "… sans rien toucher d'autre (état, ids)");
  const c2 = correctionCaptureVinted(ficheArt, { categoryPath: ["Maison", "Décoration", "Décorations murales", "Peintures"], catalog_id_depot: 3847, etat: "Bon état" }, { catalog_id: 3847 });
  ok(c2 === null, "déjà dans « Peintures » : rien à corriger");
  ok(correctionCaptureVinted({ ...ficheArt, origine: "vinted_sync" }, { catalog_id_depot: 5267, etat: "Bon état" }, {}) === null,
    "annonce NÉE sur Vinted (vinted_sync) : celle du vendeur, jamais corrigée");
  const ficheEtat = { origine: "releve_leboncoin", titre: "Magnifique Pichet Vintage en Céramique Vernissée", description: "", attributs: { etat: { v: "Bon état" } } };
  const c3 = correctionCaptureVinted(ficheEtat, { categoryPath: ["Maison", "Cuisine"], etat: "Bon état" }, { status_id: 3 }, "Très bon état");
  ok(c3?.libelles.etat === "Très bon état" && c3.natif.status_id === 2 && c3.raisons.join() === "etat_de_la_fiche",
    "jocabroc8 : « Bon état » en ligne, « Très bon état » sur la fiche AVANT la capture (qui l'a réécrite) → « Très bon état » (2)", JSON.stringify(c3));
  ok(correctionCaptureVinted({ ...ficheEtat, attributs: { etat: { v: "Bon état" } } }, { etat: "Très bon état" }, { status_id: 2 }) === null,
    "état en ligne plus haut que la fiche : jamais redescendu");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  const bloc = gpj.slice(gpj.indexOf("VINTED : LA CAPTURE CORRIGÉE PAR LA FICHE"), gpj.indexOf("UNE REPUBLICATION RECRÉÉE EST FINIE"));
  ok(/String\(pfN\.republish_step \?\? "a_capturer"\) === "a_capturer"/.test(bloc) && /etat_fiche_avant_capture: \{ v,/.test(bloc),
    "get-pending-jobs : l'état de la fiche est noté AVANT la capture");
  ok(/pfC\.republish_step === "captured"/.test(bloc) && /!retraitEngage\(j\)/.test(bloc) && /\.from\("vinted_republish_captures"\)\s*\.update\(/.test(bloc),
    "get-pending-jobs : la capture est corrigée à l'étape « captured », AVANT tout retrait (le pré-vol remplit avec elle)");
}

console.log("");
if (echecs) { console.error(`✗ ${echecs} échec(s) sur ${n} contrôles`); process.exit(1); }
console.log(`✓ contenu du vendeur : ${n} contrôles — titre, description, état, photos partent tels quels (5 plateformes × 5 imports × publication, lot, republication)`);
