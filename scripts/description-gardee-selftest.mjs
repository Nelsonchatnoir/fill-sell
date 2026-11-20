// Autotest : LA DESCRIPTION TAPÉE À LA PUBLICATION EST GARDÉE ET PART TELLE QUELLE (20/11/2026 soir, bloc B1 de Nico —
// ornellaracano).
//
//     node --import ./scripts/loader-ext.mjs scripts/description-gardee-selftest.mjs
//
// Le cas : Ornella (iPhone, app 2.9.222, 20/11). Scan Lens 69792dbf lancé à 16:45:20 ; l'app passe en arrière-plan,
// iOS coupe la requête ; l'analyse finit côté serveur à 16:46:18 et CRÉE l'article 1795189583215 et sa fiche. Le
// résultat revient par le SUIVI de la ligne (suivreScanLens), qui posait le résultat SANS l'article : les trois
// ouvertures de l'écran de publication (16:48, 16:50, 16:53) se font sans article — ni la fiche, ni la description
// tapée, ni la correction « taille » ne sont gardées ; Publier crée un doublon sans photo (1795190028203, supprimé par
// elle à 16:54:03) et c'est le texte de l'IA qui part.
//
// Ce qu'il prouve, sans réseau ni base :
//   1. un résultat de scan pose son article par les QUATRE voies (réponse directe, reprise, suivi, historique) — et le
//      rejeu du cas : l'ancienne règle ouvrait l'écran sans article, la nouvelle sur 1795189583215 ;
//   2. le filet : l'écran et le parcours Lens reprennent l'article du résultat quand l'identifiant vivant manque ;
//   3. l'ajout au stock au clic Publier rend l'article du scan AVANT de créer quoi que ce soit (plus de doublon) ;
//   4. fermer ne perd rien : ce qui attendait son minuteur (fiche, texte de l'article, traces) part à la fermeture, et
//      le champ de texte transmet sa saisie pendant la frappe et à son démontage, sans être recréé ;
//   5. chaque modification de description (ou de titre) est tracée — publication_correction, champ et portée — une fois,
//      et gardée sur la fiche : « toutes ses plateformes » (texte de l'article, « manuel ») ou la copie d'UNE plateforme ;
//   6. une description retouchée est le texte de la personne : ses hashtags restent (affichage et envoi) ;
//   7. le câblage, lu dans le source (App, LensTab, écran de publication, fiche de l'article, corrections).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
let verts = 0;
const ok = (cond, msg, detail = "") => {
  if (cond) { verts++; console.log(`  ✓ ${msg}`); }
  else { ko++; console.log(`  ✗ ${msg}${detail ? ` — ${detail}` : ""}`); }
};

const PL = await charger("src/utils/parcoursLens.js");
const C = await charger("src/publication/lot/corrections.js");
const CF = await charger("src/publication/lot/correctionsFiche.js");
const DF = await charger("src/publication/moteur/descriptionFidele.js");
const TF = await charger("src/publication/texteDeLaFiche.js");

const ARTICLE = 1795189583215;
const resultatScan = (extra = {}) => ({
  titre: "Robe longue fleurie Zara", description: "Robe longue à fleurs, très bon état. #robe #zara #boheme",
  categorie: "Mode", inventaire_id: ARTICLE, annonce: { platforms: { vinted: { title: "Robe", description: "…" } } }, ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("1. Un résultat de scan pose son article, par les quatre voies");
for (const voie of ["directe", "reprise", "suivi"]) {
  const p = PL.poseDuResultatScan(resultatScan(), { voie });
  ok(p.lensInventaireId === ARTICLE && p.lensAdded === true && p.lireLaLigne === true && p.resultat.inventaire_id === ARTICLE,
    `voie « ${voie} » : l'article du scan est posé (et sa ligne lue pour le Stock)`);
}
{
  const p = PL.poseDuResultatScan(resultatScan(), { voie: "historique", idAuStock: ARTICLE });
  ok(p.lensInventaireId === ARTICLE && p.lensAdded === true && p.lireLaLigne === false, "voie « historique », article encore au Stock : il est posé (aucune lecture de plus)");
  const mort = PL.poseDuResultatScan(resultatScan(), { voie: "historique", idAuStock: null });
  ok(mort.lensInventaireId === null && mort.lensAdded === false && !("inventaire_id" in mort.resultat) && mort.resultat.titre === resultatScan().titre,
    "voie « historique », article supprimé depuis : rien n'est désigné, le résultat perd son identifiant (le filet ne le ressuscite pas)");
}
for (const voie of PL.VOIES_DU_SCAN) {
  const p = PL.poseDuResultatScan(resultatScan({ inventaire_id: null }), { voie, idAuStock: null });
  ok(p.lensInventaireId === null && p.lensAdded === false, `voie « ${voie} », serveur sans article (best-effort) : création au clic Publier, comme avant`);
}
ok(PL.articleDuScan({ error: "❌ …", inventaire_id: 5 }) === null, "un résultat en erreur ne désigne aucun article");

console.log("\n   Rejeu du cas Ornella (20/11) : lancement → requête coupée → suivi → « Créer l'annonce »");
function rejouer(poser) {
  const etat = { lensResult: null, lensInventaireId: null };
  etat.lensResult = null; etat.lensInventaireId = null;         // analyzeLens : remise à zéro au lancement (~l.9014)
  /* fetch tué par iOS (« Load failed ») → envoyerAnalyseLens bascule sur suivreScanLens */
  poser(etat, resultatScan());                                  // suivreScanLens : statut « termine »
  // LensTab : l'écran s'ouvre sur l'article du parcours (sans le filet, pour juger la voie seule).
  return etat.lensInventaireId ?? null;
}
const ancienSuivi = (e, r) => { e.lensResult = r; };            // App.jsx avant : setLensResult(data.resultat) seul
const nouveauSuivi = (e, r) => { const p = PL.poseDuResultatScan(r, { voie: "suivi" }); e.lensResult = p.resultat; e.lensInventaireId = p.lensInventaireId; };
ok(rejouer(ancienSuivi) === null, "ancienne règle : l'écran s'ouvrait SANS article (le défaut d'Ornella se reproduit)");
ok(rejouer(nouveauSuivi) === ARTICLE, `nouvelle règle : l'écran s'ouvre sur l'article ${ARTICLE}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n2. Le filet : l'article du scan quand l'identifiant vivant manque");
ok(PL.articleDeLEcran({ inventaireId: null, initialListing: resultatScan() }) === ARTICLE, "écran sans article de l'hôte, résultat de scan : l'article du scan");
ok(PL.articleDeLEcran({ inventaireId: 42, initialListing: resultatScan() }) === 42, "l'article de l'hôte prime toujours");
ok(PL.articleDeLEcran({ inventaireId: null, initialListing: { titre: "x", origine: null, inventaire_id: 9 } }) === null, "une ligne du Stock (clé « origine ») n'est jamais lue comme un scan");
ok(PL.articleDeLEcran({ inventaireId: null, initialListing: { titre: "identifié", marque: "Zara" } }) === null, "parcours gratuit (identify, aucun article créé) : rien, création au clic Publier");
ok(PL.articleDuParcours({ lensInventaireId: null, restoredInvId: null, resultat: resultatScan() }) === ARTICLE, "LensTab : le parcours reprend l'article du résultat affiché");
ok(PL.articleDuParcours({ lensInventaireId: 7, restoredInvId: 8, resultat: resultatScan() }) === 7 && PL.articleDuParcours({ restoredInvId: 8 }) === 8,
  "l'identifiant vivant, puis celui du remontage, priment (règles 1 à 3 inchangées)");

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n3. Publier sans identifiant vivant ne crée plus de doublon");
ok(PL.articleAvantCreation({ lensInventaireId: null, resultat: resultatScan(), ligneDuScanExiste: true }) === ARTICLE, "l'article du scan est rendu AVANT toute création");
ok(PL.articleAvantCreation({ lensInventaireId: null, resultat: resultatScan(), ligneDuScanExiste: false }) === null, "ligne supprimée depuis (la base l'a dit) : la création d'avant reprend");
ok(PL.articleAvantCreation({ lensInventaireId: 3, resultat: resultatScan() }) === 3, "un identifiant vivant est rendu tel quel");
ok(PL.articleAvantCreation({ lensInventaireId: null, resultat: { titre: "identifié" } }) === null, "parcours gratuit : création (aucun article n'existe)");
ok(PL.signaturePhotos([{ preview: "data:image/jpeg;base64,AAAA" }]) === PL.signaturePhotos([{ preview: "data:image/jpeg;base64,AAAA" }])
  && PL.signaturePhotos([{ preview: "data:image/jpeg;base64,AAAA" }]) !== PL.signaturePhotos([{ preview: "data:image/jpeg;base64,AAAB" }])
  && PL.signaturePhotos([]) !== PL.signaturePhotos([{ preview: "x" }]),
  "brouillon gardé sans article : « les mêmes photos » se reconnaissent par leur signature, d'autres photos non");

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n4. Une modification validée = une trace (champ, portée), jamais une par frappe");
{
  const IA = "Robe longue à fleurs, très bon état. #robe #zara";
  const SIEN = "Robe portée deux fois, petite tache au col (voir photo 4). #robe #boheme #madeinfrance";
  const enAttente = [
    { champ: "description", portee: C.PORTEE_TOUTES, avant: IA },
    { champ: "titre", portee: C.PORTEE_TOUTES, avant: "Robe longue Zara" },
    { champ: "description", portee: "vinted", avant: "copie vinted" },
    { champ: "etat", portee: C.PORTEE_TOUTES, avant: "Bon état" },
  ];
  const t = C.tracesDeTextes(enAttente, {
    generales: { description: SIEN, titre: "Robe longue Zara" },
    edited: { vinted: { title: "x", description: "ma copie Vinted" } },
  });
  ok(t.length === 2, "deux modifications réelles → deux traces (le titre revenu à l'identique n'en fait pas, l'état n'est pas un texte)", JSON.stringify(t));
  const d = t.find((x) => x.champ === "description" && x.portee === C.PORTEE_TOUTES);
  ok(d && d.valeur === SIEN && d.avaitValeur === true, "description de toutes ses plateformes : tracée, avec le texte qui part");
  const v = t.find((x) => x.portee === "vinted");
  ok(v && v.champ === "description" && v.valeur === "ma copie Vinted", "description de la carte Vinted : tracée pour Vinted seule");
  ok(C.tracesDeTextes([{ champ: "description", portee: "toutes", avant: "a\r\nb " }], { generales: { description: "a\nb" } }).length === 0,
    "tapé puis remis à l'identique (aux fins de ligne près) : aucune trace");
}

console.log("\n   Ce que la fiche reçoit");
{
  const SIEN = "Robe portée deux fois. #robe #boheme";
  const r = TF.retoucheAEcrire({ titre: "Robe", description: "texte de l'IA" }, { description: SIEN }, new Set(["description"]), "2026-11-20T15:53:00Z");
  ok(r?.description === SIEN && r?.attributs?.description_source?.v === "manuel" && !("titre" in r),
    "toutes ses plateformes : la description de l'article + description_source « manuel » (retoucheAEcrire)");
  const p = C.patchFicheCorrection({ cle: "description", valeur: "Ma copie Vinted\n#robe", portee: "vinted", base: SIEN, attributs: {}, maintenant: new Date("2026-11-20T15:53:00Z") });
  const vp = p.attributs?.valeurs_plateformes?.v?.vinted?.description;
  ok(vp?.v === "Ma copie Vinted\n#robe" && vp?.base === SIEN && p.attributs.valeurs_plateformes.source === "manuel" && !Object.keys(p.colonnes).length,
    "une seule plateforme : sa copie gardée sur la fiche pour elle (texte entier, avec la description de l'article du moment)");
}

console.log("\n   Les gestes du lot et de la fiche (moteur factice) : une trace, pas deux");
function moteurFactice({ tracees = true } = {}) {
  const journal = [];
  const ecrits = [];
  const appels = { generale: [], carte: [], carteSansTrace: [] };
  const sb = {
    from: (table) => ({
      insert: (row) => { journal.push({ table, row }); return Promise.resolve({ error: null }); },
      update: (maj) => ({ eq: () => ({ eq: () => ({ select: () => { ecrits.push({ table, maj }); return Promise.resolve({ error: null }); } }) }) }),
    }),
  };
  const m = {
    invId: ARTICLE, userId: "u-ornella", supabase: sb, pilote: null,
    generales: { titre: "Robe", description: "texte de l'IA" },
    edited: { vinted: { title: "Robe", description: "copie vinted" }, leboncoin: { title: "Robe", description: "copie lbc" } },
    propsStepGeneration: { dissociees: null, attributsFiche: {} },
    poserValeurGenerale: (c, v) => appels.generale.push([c, v]),
    modifierCarte: (p, c, v) => appels.carte.push([p, c, v]),
    ...(tracees ? { modifierCarteSansTrace: (p, c, v) => appels.carteSansTrace.push([p, c, v]), retouchesTracees: true } : {}),
  };
  return { m, journal, ecrits, appels };
}
{
  const { m, journal, appels } = moteurFactice();
  CF.corriger(m, { cle: "description", valeur: "Mon texte", portee: C.PORTEE_TOUTES, plateformes: ["vinted", "leboncoin"] });
  ok(appels.generale.length === 1 && appels.generale[0][1] === "Mon texte", "« toutes ses plateformes » : le texte général du moteur (sa retouche : fiche « manuel » + trace)");
  ok(journal.length === 0, "… et corriger ne trace pas une seconde fois (le moteur le fait, une fois la modification validée)");
  ok(appels.carte.length === 0, "… aucune écriture « saisie » sur une carte (pas de trace en double)");
}
{
  const { m, journal, ecrits, appels } = moteurFactice();
  CF.corriger(m, { cle: "description", valeur: "Copie pour Vinted", portee: "vinted", plateformes: ["vinted", "leboncoin"] });
  ok(appels.carteSansTrace.length === 1 && appels.carte.length === 0, "« Seulement sur Vinted » : la copie par l'écriture BRUTE (corriger trace lui-même)");
  ok(journal.length === 1 && journal[0].row.feature === "publication_correction" && journal[0].row.metadata.champ === "description"
    && journal[0].row.metadata.portee === "plateforme" && journal[0].row.metadata.plateforme === "vinted" && !("valeur" in journal[0].row.metadata),
    "une trace publication_correction { champ: description, portée: plateforme, vinted } — jamais la valeur");
  ok(ecrits.length === 1 && ecrits[0].maj.attributs?.valeurs_plateformes?.v?.vinted?.description?.v === "Copie pour Vinted",
    "la copie Vinted gardée sur la fiche (valeurs_plateformes)");
}
{
  const { m, journal } = moteurFactice({ tracees: false });
  CF.corriger(m, { cle: "description", valeur: "Mon texte", portee: C.PORTEE_TOUTES, plateformes: ["vinted"] });
  ok(journal.length === 1 && journal[0].row.metadata.champ === "description", "un moteur qui ne trace pas lui-même : corriger garde sa trace (rien de perdu)");
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n5. Une description retouchée garde ses hashtags");
{
  const fiche = { titre: "Robe longue fleurie", marque: "Zara" };
  const SIEN = "Robe d'été légère, portée deux fois.\n\n#robe #ete #boheme #madeinfrance #vintage";
  const avant = DF.descriptionFidele(SIEN, "vinted", { fiche });
  ok(!/#vintage/.test(avant), "ancienne règle : lue comme un texte de FillSell, descriptionFidele retirait ses hashtags « non fondés »", JSON.stringify(avant));
  const tv = C.texteVendeurAvecRetouche({ titre: "", description: "" }, { generales: { description: SIEN }, retouches: new Set(["description"]), generes: {} });
  ok(tv.description === SIEN, "nouvelle règle : la retouche est le texte du vendeur (moteur.texteVendeur)");
  const ecritParFillSell = !String(tv.description ?? "").trim(); // FicheArticle
  const montre = ecritParFillSell ? DF.descriptionFidele(SIEN, "vinted", { fiche }) : SIEN;
  ok(montre === SIEN && /#vintage/.test(montre), "la fiche de l'article la montre telle quelle, hashtags compris (« Ton texte »)");
  ok(C.texteVendeurAvecRetouche({ titre: "T", description: "D" }, { generales: { description: "proposé par l'IA" }, retouches: ["description"], generes: { description: true } }).description === "D",
    "un champ écrit par « Générer » reste celui de FillSell");
  ok(C.texteVendeurAvecRetouche({ titre: "T du vendeur", description: "D du vendeur" }, { generales: { description: "x" }, retouches: [] }).description === "D du vendeur",
    "sans retouche : le texte de la fiche, règle d'avant (sourceDuTexte inchangé)");
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n6. Le câblage, lu dans le source");
const app = lire("src/App.jsx");
const lens = lire("src/tabs/LensTab.jsx");
const lps = lire("src/components/ListingPreviewScreen.jsx");
const fa = lire("src/publication/lot/FicheArticle.jsx");
const corr = lire("src/publication/lot/corrections.js");
const cf = lire("src/publication/lot/correctionsFiche.js");

// Les quatre voies passent par la porte unique, plus aucune ne pose le résultat à la main.
ok(/poserResultatScanLens\(data\.resultat,'suivi'\)/.test(app), "App : le SUIVI de la ligne pose le résultat ET son article");
ok(/poserResultatScanLens\(scan\.resultat,'reprise'\)/.test(app), "App : la reprise d'un scan terminé, par la même porte");
ok(/poserResultatScanLens\(result,'directe'\)/.test(app), "App : la réponse directe, par la même porte");
ok(/poserResultatScanLens\(resultat,'historique',\{idAuStock:/.test(app), "App : l'historique, par la même porte (article encore au Stock)");
ok(!/setLensResult\((data\.resultat|scan\.resultat|result|resultat)\)/.test(app), "App : plus aucun setLensResult(<résultat>) à la main");
ok((app.match(/setLensResult\(pose\.resultat\);\s*setLensInventaireId\(pose\.lensInventaireId\);/g) ?? []).length === 1, "App : la porte unique pose le résultat et l'article ensemble");
{
  const debut = app.indexOf("async function saveLensItemForListing(");
  const corps = app.slice(debut, app.indexOf("\n  }\n", debut));
  const iReprise = corps.indexOf("articleAvantCreation(");
  const iCree = corps.indexOf("vaActions.addItem(");
  ok(debut > 0 && iReprise > 0 && iCree > iReprise, "App : saveLensItemForListing rend l'article du scan AVANT addItem (plus de doublon)");
}
ok(/const effectiveInvId=articleDuParcours\(\{lensInventaireId,restoredInvId,resultat:listingSource\}\);/.test(lens), "LensTab : le parcours reprend l'article du résultat (filet)");
ok(/onRouvrir=\{\(r\)=>\{const pose=onRouvrirScan\?\.\(r\);setResultatHistorique\(pose\?\?r\.resultat\);\}\}/.test(lens), "LensTab : l'historique reconnaît le résultat tel qu'App l'a posé");
ok(/sortie\?\.brouillonSansArticle===true/.test(lens) && /enPause:true,sansArticle:true,photosSig:signaturePhotos\(lensPhotos\)/.test(lens)
  && /if\(reprendreBrouillonSansArticle\(\)\)return undefined;/.test(lens) && /if\(h\.enPause&&h\.sansArticle\)return;/.test(lens),
  "LensTab : fermé SANS article, le brouillon de session est gardé (en pause) et rouvert sur les mêmes photos");
ok(/const inventaireId = articleDeLEcran\(\{ inventaireId: inventaireIdProp, initialListing: initialListingProp \}\);/.test(lps), "écran : l'article de l'hôte, sinon celui du scan (filet)");
ok(/onClose\(false, \{ brouillonSansArticle: !invId && Boolean\(platformListings\) && !done \}\)/.test(lps), "écran : « Quitter » dit à l'hôte qu'un travail n'a pas d'article");

// Fermer ne perd rien.
{
  const i = lps.indexOf("fermetureRef.current = () => {");
  const corps = lps.slice(i, lps.indexOf("\n  };\n", i));
  ok(i > 0 && /ecrireTextesRef\.current\?\.\(\)/.test(corps) && /if \(ficheEnAttenteRef\.current\) enregistrerFicheMaintenant\(\)/.test(corps)
    && /sessionStorage\.getItem\(STEPPER_DRAFT_KEY\) != null/.test(corps),
    "écran : la fermeture écrit le texte tapé (article, copies, traces), la fiche en attente, et le brouillon gardé par l'hôte");
  ok(/const aLaFermeture = fermetureRef;[^\n]*\n\s*return \(\) => aLaFermeture\.current\?\.\(\);\n\s*\}, \[\]\);/.test(lps), "écran : … au démontage (effet sans dépendance)");
  ok(/ficheEnAttenteRef\.current = true;\n\s*const minuteur = setTimeout\(\(\) => \{ ficheEnAttenteRef\.current = false; enregistrerEnBase\(\); \}, 1500\);/.test(lps),
    "écran : la fiche qui attend son minuteur est marquée « en attente » (plus annulée en silence)");
  const poser = lps.slice(lps.indexOf("const poserValeurGenerale = (champ, valeur) => {"), lps.indexOf("const noterTexteATracer"));
  ok(/generalesRef\.current = genReflet;/.test(poser) && /ficheEnAttenteRef\.current = true;/.test(poser) && /etatFicheRef\.current = \{/.test(poser),
    "écran : le texte posé rejoint le reflet sans attendre le rendu (une saisie transmise au démontage est écrite)");
}
ok(/const retoucherCarte = \(plateforme, champ, valeur\) => \{/.test(lps) && /dissociees, onModifierCarte: retoucherCarte,/.test(lps)
  && /onModifierCarte=\{retoucherCarte\}/.test(lps) && /modifierCarte: retoucherCarte, modifierCarteSansTrace: modifierCarte, retouchesTracees: true,/.test(lps),
  "écran : la saisie dans une carte (nouvelle et ancienne peau, question « Description ») est gardée et tracée");
{
  const i = lps.indexOf("const ecrireTextesTapes = () => {");
  const corps = lps.slice(i, lps.indexOf("\n  };\n", i));
  ok(/retoucheAEcrire\(base, gen, retouchesMainRef\.current\)/.test(corps) && /tracesDeTextes\(enAttente,/.test(corps)
    && /patchFicheCorrection\(\{/.test(corps) && /journaliserCorrection\(mFiche, \{\s*champ: t\.champ, portee: toutes \? "toutes" : "plateforme"/.test(corps),
    "écran : une modification validée → la fiche (article ou copie) et UNE trace publication_correction (champ, portée)");
}
ok(/const texteDuVendeurFiche = \(\) => texteVendeurAvecRetouche\(texteDeLaFicheSeule\(\), \{/.test(lps), "écran : moteur.texteVendeur compte la retouche (ses hashtags restent)");
{
  const i = fa.indexOf("function TexteQuiGrandit(");
  const corps = fa.slice(i, fa.indexOf("\n}\n", i));
  ok(i > 0 && /minuteurRef\.current = setTimeout\(\(\) => transmettreRef\.current\?\.\(\), delai\);/.test(corps), "fiche de l'article : la saisie part pendant la frappe (après un court délai)");
  ok(/useLayoutEffect\(\(\) => \{\n\s*ajusterHauteur\(ref\.current\);\n\s*const transmettre = transmettreRef;\n\s*return \(\) => transmettre\.current\?\.\(\);\n\s*\}, \[\]\);/.test(corps),
    "fiche de l'article : … et au démontage, AVANT les effets passifs du moteur qui écrivent la fiche");
  ok(/onBlur=\{\(e\) => \{[\s\S]*transmettreRef\.current\?\.\(\);/.test(corps), "fiche de l'article : … et à la sortie du champ");
}
ok(!/key=\{`desc-\$\{montre/.test(fa) && /<TexteQuiGrandit key=\{`desc-\$\{m\.invId \?\? ""\}`\}/.test(fa) && /<TexteQuiGrandit key=\{`titre-\$\{m\.invId \?\? ""\}`\}/.test(fa),
  "fiche de l'article : le champ n'est plus recréé quand l'aperçu change (seulement pour un autre article)");
ok(!/\bm\.modifierCarte\?\.\(/.test(corr) && (corr.match(/modifierCarteDe\(m\)\?\.\(/g) ?? []).length === 2, "corrections : une correction écrit la copie par l'écriture brute (aucune trace en double)");
ok(/if \(m\?\.retouchesTracees && portee === PORTEE_TOUTES && \(cle === "titre" \|\| cle === "description"\)\) return true;/.test(cf), "correctionsFiche : le texte de toutes ses plateformes est tracé par le moteur, une fois");

{
  const i = fa.indexOf("function EditeurCorrection(");
  const corps = fa.slice(i, fa.indexOf("\n}\n", i));
  ok(/const seFerme = useRef\(false\);\n\s*useLayoutEffect\(\(\) => \(\) => \{ seFerme\.current = true; \}, \[\]\);/.test(fa) && /<FermetureCtx\.Provider value=\{seFerme\}>/.test(fa)
    && /if \(saisieRef\.current === departRef\.current\) return;\n\s*garder\(saisieRef\.current\);/.test(corps) && /if \(laFiche\?\.current\) aLaFermeture\.current\?\.\(\);/.test(corps),
    "fiche de l'article : un titre ou une description tapés dans l'éditeur d'une ligne, pas encore « Gardés », le sont quand la fiche se ferme");
}

// Garde-fous : rien d'autre ne bouge.
const sdt = lire("src/utils/sourceDuTexte.js");
ok(/export function champDuVendeur\(ligne, champ, \{ ligneDuStock \} = \{\}\)/.test(sdt) && /if \(marqueurDuVendeur\(v\)\) return true;/.test(sdt), "sourceDuTexte.js : la reprise du texte vendeur à l'import est inchangée");
ok(!/description-gardee|poserResultatScanLens/.test(lire("supabase/functions/lens-analysis/index.ts")), "lens-analysis (rédaction du scan) : ne dépend pas de ce correctif");

console.log(`\n${ko ? `✗ ${ko} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(ko ? 1 : 0);
