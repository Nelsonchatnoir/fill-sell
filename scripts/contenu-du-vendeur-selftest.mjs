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
  texteDuVendeurSurFiche, copieReprendLeTexte, origineLue,
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
  // (23/10, Thierry) eBay n'est plus « lu en entier » par la liste : son détail se lit par lots — on attend comme ailleurs.
  {
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
  } else {
    ok(lectureOrigineEnAttente(ficheVide(origine), [annonceOrigine(plateforme, true)]) === null, `${origine} : annonce lue mais vide chez le vendeur → l'IA peut compléter (on n'attend plus)`);
    ok(lectureOrigineEnAttente(ficheVide(origine), [{ ...annonceOrigine(plateforme, false), disparu_le: LECTURE }]) === null, `${origine} : annonce d'origine disparue → rien à lire`);
  }
}
// (23/10, point 1 — Thierry, pièces de monnaie eBay : avers ET revers) TOUTES les photos d'origine avant de partir.
{
  const VIGNETTE = "https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg";
  const STOCK = (p) => `https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/c2175e91/${p}`;
  const fiche = { id: 1792745533806, origine: "releve_ebay", titre: "Monnaie romaine, Constantin 1er, follis",
    description: "", photos: [VIGNETTE], attributs: {} };
  const maintenant = Date.parse("2026-10-23T10:00:00.000Z");
  const jamaisLue = { platform: "ebay", capture_le: null, detail_le: null, photos_origine: null, disparu_le: null };
  const lue = (n, le = "2026-10-23T09:30:00.000Z") => ({ ...jamaisLue, detail_le: le, photos_origine: n });
  const a1 = lectureOrigineEnAttente(fiche, [jamaisLue], { maintenant });
  ok(a1?.plateforme === "ebay" && a1.manque.includes("photos"), "eBay : détail jamais lu (liste seule, vignette 140 px) → on ATTEND", JSON.stringify(a1));
  const m1 = messageLectureOrigine(a1);
  ok(/En cours de lecture de ton annonce d'origine eBay/.test(m1) && /Rien à faire/.test(m1) && !/erreur|échec|ordinateur/i.test(m1),
    "eBay : « en cours de lecture », rien à faire (lu par l'API, sans l'ordinateur), jamais une erreur", m1);
  ok(!/error|fail|computer/i.test(messageLectureOrigine(a1, "en")), "eBay : la phrase anglaise non plus");
  const a2 = lectureOrigineEnAttente(fiche, [lue(2)], { maintenant });
  ok(a2?.manque?.length === 1 && a2.manque[0] === "photos", "eBay : détail lu (2 photos), la fiche n'a encore que la vignette → on attend ses photos", JSON.stringify(a2));
  ok(lectureOrigineEnAttente({ ...fiche, photos: [STOCK("rehosted/1792745533806/1792747072642_0.jpg")] }, [lue(2)], { maintenant })?.manque?.[0] === "photos",
    "eBay : la vignette recopiée chez nous pour CETTE fiche (rehosted/<fiche>/) attend aussi");
  ok(lectureOrigineEnAttente({ ...fiche, photos: [STOCK("rapatrie-fiche/1792745533806/1_0.jpg")] }, [lue(2)], { maintenant })?.manque?.[0] === "photos",
    "eBay : la vignette rapatriée (rapatrie-fiche/<fiche>/) attend aussi");
  ok(lectureOrigineEnAttente({ ...fiche, photos: [VIGNETTE, "https://i.ebayimg.com/images/g/NwkAAeSwAvhqonZd/s-l1600.jpg"] }, [lue(2)], { maintenant }) === null,
    "eBay : la fiche a reçu ses 2 photos → elle part");
  ok(lectureOrigineEnAttente(fiche, [lue(1)], { maintenant }) === null, "eBay : l'annonce n'a qu'une photo → rien à attendre");
  ok(lectureOrigineEnAttente({ ...fiche, photos: [STOCK("enhanced/1792746017692_0.png")] }, [lue(2)], { maintenant }) === null,
    "⛔ une photo retouchée (choix de la personne) n'attend jamais");
  ok(lectureOrigineEnAttente({ ...fiche, photos: [STOCK("1792746017692_photo.jpg")] }, [lue(2)], { maintenant }) === null,
    "⛔ une photo ajoutée par la personne n'attend jamais");
  ok(lectureOrigineEnAttente(fiche, [lue(2, "2026-10-22T09:00:00.000Z")], { maintenant }) === null,
    "jamais une attente sans fin : 24 h après la lecture, la fiche part (le circuit a eu sa journée pour la compléter)");
  ok(lectureOrigineEnAttente({ ...fiche, origine: "releve_beebs" }, [{ platform: "beebs", capture_le: "2026-10-23T09:30:00.000Z", photos_origine: 4, disparu_le: null }], { maintenant })?.manque?.[0] === "photos",
    "la même règle pour Beebs (et Leboncoin, Depop) : page lue avec 4 photos, fiche à la vignette → on attend ses photos");
  ok(lectureOrigineEnAttente({ ...fiche, origine: "releve_leboncoin" }, [{ platform: "leboncoin", capture_le: null, disparu_le: null }, { platform: "ebay", detail_le: "2026-10-23T09:30:00.000Z", photos_origine: 2 }], { maintenant })?.plateforme === "leboncoin",
    "le détail eBay d'une AUTRE annonce ne vaut pas lecture d'une fiche née sur Leboncoin");
  ok(origineLue({ platform: "ebay", detail_le: "x" }) && !origineLue({ platform: "beebs", detail_le: "x" }) && origineLue({ platform: "beebs", capture_le: "x" }),
    "origineLue : la page capturée partout, le détail par l'API pour eBay seulement");
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
  // (25/10, Jocabroc ; méthode de Nico) La règle tient (rien ne s'ouvre avec un texte rédigé à la place du vendeur),
  // mais plus jamais une impasse : en dernier recours, un écran lit tout de suite, relit seul, ouvre le stepper dès
  // que c'est lu, n'écrit jamais à la place du vendeur (le stepper le dit si l'annonce n'a aucun texte), prévient le serveur.
  const attenteEcran = lire("src/publication/AttenteLectureOrigine.jsx");
  ok(/attenteLectureOrigine\(supabase, user\.id, item\.id\)/.test(pad) && /demanderLectureOrigine\(supabase, item\.id\)/.test(pad)
      && /setAttenteStepper\(\{ item: r\?\.item \?\? item, attente: attenteOrigine \}\)/.test(pad) && /signalerActionRatee\(\{ action: 'publier', motif: 'lecture_origine_en_attente'/.test(pad)
      && /messageLectureOrigine\(attente \?\? \{ plateforme: "vinted" \}, en \? "en" : "fr", "preparation"\)/.test(attenteEcran)
      && /demarrerRelecture\(/.test(attenteEcran) && /immediat: true/.test(attenteEcran) && /await pret\(\)/.test(attenteEcran) && !/Write my description/.test(attenteEcran)
      && /onPret=\{\(relu, info\) => \{/.test(stock) && /info\?\.note === 'sans_description'/.test(stock),
    "Stock (Publier à l'unité) : la fiche importée pas encore lue ne s'ouvre pas avec un texte rédigé — l'écran lit tout de suite, relit seul, ouvre le stepper dès que c'est lu, n'écrit jamais à la place du vendeur, prévient le serveur");
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
  // (25/10, 0.6.144) La lecture d'origine lit la PAGE PUBLIQUE (lirePagePubliqueVintedSousVerrou) et écrit par
  // ecrireLecturePagePublique : mêmes invariants — jamais la lecture qui reprend le verrou, jamais un texte écrasé.
  const sousVerrou = bg.slice(bg.indexOf("async function lirePagePubliqueVintedSousVerrou"), bg.indexOf("async function ecrireLecturePagePublique"));
  ok(lecteur.length > 500 && !/fetchVintedItemDetail\(/.test(lecteur) && /lirePagePubliqueVintedSousVerrou\(/.test(lecteur)
      && sousVerrou.length > 200 && !/withJobFlowLock\(/.test(sousVerrou),
    "extension : la lecture d'origine (dans le poll, verrou tenu) n'appelle jamais la lecture qui reprend le verrou (interblocage)");
  const ecrire = bg.slice(bg.indexOf("async function ecrireLecturePagePublique"), bg.indexOf("const LECTURE_FOND_PAUSE_KEY"));
  ok(/or=\(description\.is\.null,description\.eq\.\)/.test(ecrire) && /ecrireLecturePagePublique\(token, l, r\)/.test(lecteur),
    "extension : la description n'est écrite que sur une fiche VIDE (jamais un texte écrasé)");
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
  // (25/10, A5 strict — paugues 110c27ae / 5ad5bbb1) La capture ne change de rayon QUE si la grille de colis du
  // rayon d'arrivée est connue ET offre le format capturé (package_size_id) ; sinon l'annonce garde son rayon.
  const toile = { categoryPath: ["Loisirs et collections", "Loisirs créatifs", "Peinture", "Toiles et panneaux"], catalog_id_depot: 5267, etat: "Bon état" };
  ok(correctionCaptureVinted(ficheArt, toile, { catalog_id: 5267, status_id: 3, package_size_id: 3 }, "Bon état") === null,
    "A5 : « Grand » (3) face à la grille au poids de « Peintures » (11-14) → l'annonce garde « Toiles et panneaux » (110c27ae)");
  const ficheArt2 = { origine: null, titre: "Huile sur panneau de bois - Style école française du XIX°", description: "", attributs: { etat: { v: "Très bon état" } } };
  const encadr = { categoryPath: ["Maison", "Décoration", "Encadrements"], etat: "Très bon état" };
  ok(correctionCaptureVinted(ficheArt2, encadr, { catalog_id: 1937, status_id: 2, package_size_id: 2 }, "Très bon état") === null,
    "A5 : « Moyen » (2) → l'annonce garde « Encadrements » (5ad5bbb1)");
  const c4 = correctionCaptureVinted(ficheArt, toile, { catalog_id: 5267, status_id: 3, package_size_id: 12 }, "Bon état");
  ok(c4?.libelles.catalog_id_depot === 3847 && c4.raisons.join() === "categorie_oeuvre",
    "A5 : format capturé OFFERT par la grille du rayon des œuvres (12, 10 kg) → déplacée", JSON.stringify(c4));
  const inconnue = correctionCaptureVinted(ficheArt, toile, { catalog_id: 5267, status_id: 3, package_size_id: 12 }, "Bon état", { grilleDuRayon: () => null });
  ok(inconnue === null, "A5 strict : grille du rayon d'arrivée INCONNUE → jamais déplacée (elle passait avant le 25/10)");
  const inconnueEtat = correctionCaptureVinted(ficheArt, { ...toile, etat: "Satisfaisant" }, { catalog_id: 5267, status_id: 4, package_size_id: 3 }, "Bon état", { grilleDuRayon: () => [] });
  ok(inconnueEtat?.raisons.join() === "etat_de_la_fiche" && inconnueEtat.libelles.catalog_id_depot === 5267 && inconnueEtat.libelles.categoryPath.at(-1) === "Toiles et panneaux",
    "A5 strict : rayon gardé, l'état du vendeur se corrige quand même (les deux règles sont indépendantes)", JSON.stringify(inconnueEtat));
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
  // (23/10, point 1 — Thierry) Les photos d'origine que le dépôt n'a pas eues repartent à la recréation.
  const { photosDeLaFicheALaRecreation } = await import("../supabase/functions/_shared/capture-corrigee.js");
  const NOUS = (p) => `https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/c2175e91/rapatrie-fiche/1792745534007/${p}`;
  const ficheP = { origine: "releve_ebay", photos: [NOUS("1_0.jpg"), NOUS("1_1.jpg")] };
  const depot1 = { photos: [{ url: NOUS("../rehosted/0.jpg"), type: "original" }], photo_option: "original", created_at: "2026-10-23T09:23:00.000Z" };
  const p1 = photosDeLaFicheALaRecreation(ficheP, depot1, "2026-10-23T09:55:00.000Z");
  ok(JSON.stringify(p1?.photos) === JSON.stringify(ficheP.photos), "Thierry : dépôt Vinted à 1 photo, la fiche a reçu avers ET revers ensuite → la recréation part avec les 2, dans l'ordre", JSON.stringify(p1));
  ok(photosDeLaFicheALaRecreation({ ...ficheP, photos: ["https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l1600.jpg", NOUS("1_1.jpg")] }, depot1, "2026-10-23T09:55:00.000Z")?.attendre === true,
    "photos de la fiche pas encore chez nous → on attend leur rapatriement (rien n'est retiré)");
  ok(photosDeLaFicheALaRecreation(ficheP, depot1, "2026-10-23T09:00:00.000Z") === null, "⛔ photos lues AVANT le dépôt : la personne les avait sous les yeux, jamais touchées");
  ok(photosDeLaFicheALaRecreation(ficheP, { ...depot1, photos: [NOUS("a.jpg"), NOUS("b.jpg")] }, "2026-10-23T09:55:00.000Z") === null, "dépôt qui portait déjà autant de photos : rien");
  ok(photosDeLaFicheALaRecreation(ficheP, { ...depot1, photo_option: "enhanced" }, "2026-10-23T09:55:00.000Z") === null, "⛔ copie retouchée (photo_option) : choix de la personne");
  ok(photosDeLaFicheALaRecreation({ ...ficheP, origine: "vinted_sync" }, depot1, "2026-10-23T09:55:00.000Z") === null, "⛔ annonce née sur Vinted : jamais");
  ok(photosDeLaFicheALaRecreation({ ...ficheP, origine: null }, depot1, "2026-10-23T09:55:00.000Z") === null, "fiche écrite dans FillSell : hors règle");
  ok(/photosDeLaFicheALaRecreation\(fiche, depot, luesLe, /.test(bloc) && /majCap\.photos_urls = photosFiche/.test(bloc) && /retenuesPhotos\.add/.test(bloc),
    "get-pending-jobs : les photos de la fiche remplacent celles de la capture à l'étape « captured », la recréation attend leur rapatriement");
  // (23/10, feu vert de Nico 12:05 : « en pleine taille ») Dépôt à 2 photos en 400 px, la fiche les a reçues en pleine taille APRÈS.
  const depot400 = { photos: [NOUS("../rehosted/400_0.jpg"), NOUS("../rehosted/400_1.jpg")], photo_option: "original", created_at: "2026-10-23T09:23:00.000Z" };
  const p2 = photosDeLaFicheALaRecreation(ficheP, depot400, "2026-10-23T08:50:00.000Z", "2026-10-23T10:12:00.000Z");
  ok(JSON.stringify(p2?.photos) === JSON.stringify(ficheP.photos), "dépôt à 2 photos de 400 px, la fiche les a reçues en pleine taille ensuite → la recréation part avec celles de la fiche", JSON.stringify(p2));
  ok(photosDeLaFicheALaRecreation(ficheP, depot400, "2026-10-23T08:50:00.000Z", "2026-10-23T09:00:00.000Z") === null,
    "⛔ photos remises sur la fiche AVANT le dépôt : celles que la personne a vues, jamais touchées");
  ok(photosDeLaFicheALaRecreation(ficheP, { ...depot400, photos: [...depot400.photos, NOUS("x.jpg")] }, null, "2026-10-23T10:12:00.000Z") === null,
    "⛔ jamais moins de photos que le dépôt");
  ok(photosDeLaFicheALaRecreation(ficheP, { ...depot400, photos: ficheP.photos }, null, "2026-10-23T10:12:00.000Z") === null, "déjà les mêmes photos : rien");
  // Au départ (contenuAImposer) : même règle pour une copie en file.
  const copie400 = { platform: "vinted", action: "publish", created_at: "2026-10-23T09:23:00.000Z", photo_option: "original",
    description: "x", photos: depot400.photos.map((url) => ({ url, type: "original" })), platform_fields: {} };
  const ficheV = { ...ficheP, titre: "Monnaie", description: "", attributs: {} };
  const i1 = contenuAImposer(copie400, ficheV, { contenuLe: copie400.created_at, photosLuesLe: "2026-10-23T10:12:00.000Z", photosRemplaceesLe: "2026-10-23T10:12:00.000Z" });
  ok(JSON.stringify(i1.photos) === JSON.stringify(ficheP.photos) && i1.raisons.includes("photos"), "au départ : copie à 400 px, la fiche a reçu ses photos en pleine taille après → toutes celles de la fiche", JSON.stringify(i1));
  const i2 = contenuAImposer(copie400, { ...ficheV, photos: ["https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l1600.jpg", NOUS("b.jpg")] },
    { contenuLe: copie400.created_at, photosLuesLe: "2026-10-23T10:12:00.000Z", photosRemplaceesLe: "2026-10-23T10:12:00.000Z" });
  ok(i2.photos_a_rapatrier === true && !i2.photos, "… photos encore sur le CDN : on attend le rapatriement, rien ne part", JSON.stringify(i2));
  const i3 = contenuAImposer(copie400, ficheV, { contenuLe: copie400.created_at, photosLuesLe: "2026-10-23T10:12:00.000Z", photosRemplaceesLe: null });
  ok(!i3.photos && !i3.photos_a_rapatrier, "⛔ sans photos remises par la base (même nombre, autres adresses) : rien n'est imposé", JSON.stringify(i3));
  // Les photos eBay en pleine taille (_shared/ebay-photos.js)
  const { cleImageEbay, photoEbayPleineTaille, photosEbayPleineTaille } = await import("../supabase/functions/_shared/ebay-photos.js");
  ok(cleImageEbay("https://i.ebayimg.com/00/s/NTEyWDUwOQ==/z/Jk8AAeSwJDpq2a78/$_1.JPG?set_id=8800005007") === "Jk8AAeSwJDpq2a78"
     && cleImageEbay("https://i.ebayimg.com/images/g/Jk8AAeSwJDpq2a78/s-l140.jpg") === "Jk8AAeSwJDpq2a78", "eBay : la même clé sous les trois tailles");
  ok(photoEbayPleineTaille("https://i.ebayimg.com/00/s/NTEyWDUwOQ==/z/Jk8AAeSwJDpq2a78/$_1.JPG?set_id=8800005007") === "https://i.ebayimg.com/images/g/Jk8AAeSwJDpq2a78/s-l1600.jpg",
    "eBay : la photo de 400 px (GetItem) devient l'original (s-l1600)");
  ok(photoEbayPleineTaille(NOUS("a.jpg")) === NOUS("a.jpg"), "une photo qui n'est pas eBay reste telle quelle");
  const lot = photosEbayPleineTaille(["https://i.ebayimg.com/00/s/A/z/AAAAAAAAAA/$_1.JPG", "https://i.ebayimg.com/00/s/B/z/BBBBBBBBBB/$_1.JPG", "https://i.ebayimg.com/images/g/AAAAAAAAAA/s-l500.jpg"]);
  ok(lot.length === 2 && lot[0].includes("/AAAAAAAAAA/s-l1600") && lot[1].includes("/BBBBBBBBBB/s-l1600"), "eBay : dans l'ordre (avers puis revers), sans doublon", JSON.stringify(lot));
  const trading = lire("supabase/functions/_shared/ebay-trading-releve.ts");
  const completer = lire("supabase/functions/releve-completer/index.ts");
  ok(/const photos = photosEbayPleineTaille\(blocs\(valeur\(it, "PictureDetails"\)/.test(trading) && /const photos = photosEbayPleineTaille\(\[b\.image/.test(completer),
    "les deux lectures du détail eBay (GetItem, Browse) prennent les photos en pleine taille");
}

console.log("");
if (echecs) { console.error(`✗ ${echecs} échec(s) sur ${n} contrôles`); process.exit(1); }
console.log(`✓ contenu du vendeur : ${n} contrôles — titre, description, état, photos partent tels quels (5 plateformes × 5 imports × publication, lot, republication)`);
