// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN RÉSERVÉ AUX ADRESSES EN FRANCE — ET LES DEUX RÈGLES SŒURS (25/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (25/10, cas Marta — « Via CANALE 24 C 16035 RAPALLO ») : pas
// de Leboncoin pour une adresse de remise hors de France ; ses dépôts en attente
// sont clos proprement, sans alarme. Audit de nuit N10 : eBay inscrit hors d'eBay
// France est CLOS (plus jamais en pause), et rien d'une plateforme écartée par la
// personne n'est servi. Ce test prouve, sans réseau :
//   1. le verdict d'adresse (16035, 06890, 91160, 26230, 97400, 20000, vide,
//      « rue du 8 mai 1945 », code illisible, adresse en une ligne) ;
//   2. ce qui se clôt et ce qui ne se clôt jamais, et la FORME de la clôture ;
//   3. l'état NEUTRE au suivi de lot (ni « à toi de jouer », ni rouge, jamais
//      « à ta demande ») et à l'état unique (« Arrêtée », ton neutre) ;
//   4. l'app : plateformesDuCompte, exclusions au clic, textes, message intact ;
//   5. eBay hors de France et plateformes écartées ;
//   6. le câblage serveur (get-pending-jobs, ebay-api-worker, ebay-oauth).
//
//   node --import ./scripts/loader-ext.mjs scripts/lbc-adresse-france-selftest.mjs
import fs from "node:fs";
import {
  adresseLbcHorsFrance, codePostalFrancais, codesPostauxFrancais, codePostalDeLAdresse, plateformesFermeesHorsFrance,
  lbcACloreHorsFrance, lbcServiMalgreHorsFrance, clotureLbcHorsFrance, estClotureLbcHorsFrance, estPublicationLbc,
  MESSAGE_LBC_HORS_FRANCE, messageLbcHorsFrance, STATUTS_LBC_HORS_FRANCE_A_CLORE, CLE_LBC_HORS_FRANCE,
} from "../supabase/functions/_shared/lbc-adresse-france.js";
import { CODES_POSTAUX_FR_NOMBRE, CODES_POSTAUX_FR_LE } from "../supabase/functions/_shared/codes-postaux-fr.js";
import {
  ebaySiteHorsFrance, messageClotureEbayHorsFrance, texteEbayHorsFrance, clotureEbayHorsFrance, estClotureEbayHorsFrance,
} from "../supabase/functions/_shared/ebay-hors-france.js";
import { plateformesEcartees, jobRetenuPlateformeEcartee } from "../supabase/functions/_shared/plateformes-ecartees.js";
import { archiverErreur } from "../supabase/functions/_shared/erreurs-archivees.js";
import { etatJob, tonEtat, ETATS } from "../supabase/functions/_shared/etat-job.js";
import { suiviDuLot, etatJobLot, groupeArticle } from "../src/publication/lot/regles.js";
import { calculerExclusions, motifAucunePlateforme } from "../src/publication/moteur/regles.js";
import { plateformesDuCompte, plateformesDeLArticle, plateformesDeReleve } from "../src/utils/stockFiltres.js";
import { plateformesRepubliables } from "../src/utils/republication.js";
import { humanizeJobError } from "../src/utils/shared.js";
import { txt } from "../src/reglages/textes.js";

let verts = 0;
const rouges = [];
function ok(nom, cond, detail = "") {
  if (cond) { verts++; console.log(`  ✓ ${nom}`); }
  else { rouges.push(nom); console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ""}`); }
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lire = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

console.log("\n[1] Le verdict d'adresse (code postal de la base officielle française)");
{
  ok(`la base est là : ${CODES_POSTAUX_FR_NOMBRE} codes, relevée le ${CODES_POSTAUX_FR_LE}`,
    codesPostauxFrancais().size === CODES_POSTAUX_FR_NOMBRE && CODES_POSTAUX_FR_NOMBRE > 6000 && /^\d{4}-\d{2}-\d{2}$/.test(CODES_POSTAUX_FR_LE));
  const marta = { rue: "Via CANALE 24 C", code_postal: "16035", ville: "RAPALLO", adresse: "Via CANALE 24 C 16035 RAPALLO" };
  const vm = adresseLbcHorsFrance(marta);
  ok("16035 RAPALLO (Marta, Italie) → hors de France, preuve 16035", vm.horsFrance === true && vm.code === "16035" && vm.motif === "hors_france", JSON.stringify(vm));
  ok("06890 Transinne (code belge complété d'un zéro) → hors de France",
    adresseLbcHorsFrance({ rue: "La Chavée 11", code_postal: "06890", ville: "Transinne" }).horsFrance === true);
  for (const [cp, ville] of [["91160", "Saulx-les-Chartreux"], ["26230", "Chantemerle-lès-Grignan"], ["97400", "Saint-Denis (La Réunion)"], ["20000", "Ajaccio"], ["75116", "Paris 16e"], ["98800", "Nouméa"]]) {
    const v = adresseLbcHorsFrance({ code_postal: cp, ville });
    ok(`${cp} ${ville} → France`, v.horsFrance === false && v.motif === "france", JSON.stringify(v));
  }
  ok("98000 Monaco n'est pas un code postal français", codePostalFrancais("98000") === false);
  ok("adresse vide → inconnu : Leboncoin reste proposé", egal(adresseLbcHorsFrance({ rue: "", code_postal: "", ville: "", adresse: "" }), { horsFrance: false, code: null, motif: "sans_adresse", source: null }));
  ok("aucun réglage → inconnu", adresseLbcHorsFrance(null).horsFrance === false && adresseLbcHorsFrance(undefined).motif === "sans_adresse");
  ok("« rue du 8 mai 1945 » sans code postal → inconnu (1945 n'a que 4 chiffres)", adresseLbcHorsFrance({ rue: "rue du 8 mai 1945", code_postal: "", ville: "" }).motif === "sans_adresse");
  ok("« 12 rue du 8 mai 1945 26230 Grignan » en une ligne → 26230, France",
    egal(codePostalDeLAdresse({ adresse: "12 rue du 8 mai 1945 26230 Grignan" }), { code: "26230", source: "adresse" })
    && adresseLbcHorsFrance({ adresse: "12 rue du 8 mai 1945 26230 Grignan" }).horsFrance === false);
  ok("forme d'avant le 18/09 (adresse seule, cas réel) : « … 91160 saulx les chartreux » → France",
    adresseLbcHorsFrance({ adresse: "7 allée du saut du loup 91160 saulx les chartreux" }).motif === "france");
  ok("une adresse en une ligne hors de la base → hors de France (« … 16035 RAPALLO »)", adresseLbcHorsFrance({ adresse: "Via CANALE 24 C 16035 RAPALLO" }).horsFrance === true);
  ok("le champ structuré prime sur l'adresse en une ligne", adresseLbcHorsFrance({ code_postal: "26230", adresse: "Via CANALE 24 C 16035 RAPALLO" }).horsFrance === false);
  ok("code illisible (« 1000 », 4 chiffres) → inconnu, jamais retiré sur un doute", adresseLbcHorsFrance({ code_postal: "1000" }).motif === "code_illisible" && adresseLbcHorsFrance({ code_postal: "1000" }).horsFrance === false);
  ok("espaces tolérés (« 16 035 »)", adresseLbcHorsFrance({ code_postal: "16 035" }).horsFrance === true);
  ok("l'objet de l'app ({ rue, cp, ville }) se lit aussi", adresseLbcHorsFrance({ rue: "x", cp: "16035", ville: "RAPALLO" }).horsFrance === true);
  ok("plateformes fermées : Leboncoin SEUL, et rien sans verdict", egal(plateformesFermeesHorsFrance(marta), ["leboncoin"]) && egal(plateformesFermeesHorsFrance({ code_postal: "91160" }), []) && egal(plateformesFermeesHorsFrance(null), []));
}

console.log("\n[2] Ce qui se clôt, ce qui ne se clôt jamais, et la forme de la clôture");
{
  const j = (o) => ({ id: "x", platform: "leboncoin", action: "publish", status: "pending", platform_fields: {}, ...o });
  ok("statuts clos : pending, needs_user, failed — jamais processing", egal(STATUTS_LBC_HORS_FRANCE_A_CLORE, ["pending", "needs_user", "failed"]));
  for (const st of ["pending", "needs_user", "failed"]) ok(`publication Leboncoin ${st} → close`, lbcACloreHorsFrance(j({ status: st })));
  ok("action nulle = publication", lbcACloreHorsFrance(j({ action: null })) && estPublicationLbc(j({ action: null })));
  ok("republication pas commencée → close", lbcACloreHorsFrance(j({ action: "republish", platform_fields: { republish_step: "captured" } })));
  ok("⛔ job en cours (processing) → jamais touché", !lbcACloreHorsFrance(j({ status: "processing" })));
  ok("⛔ retrait → jamais touché", !lbcACloreHorsFrance(j({ action: "delete" })));
  ok("⛔ republication dont le retrait a commencé (step deleted) → jamais touchée", !lbcACloreHorsFrance(j({ action: "republish", platform_fields: { republish_step: "deleted" } })));
  ok("⛔ republication dont la suppression est envoyée → jamais touchée", !lbcACloreHorsFrance(j({ action: "republish", error: "Suppression envoyée à Leboncoin, recréation en attente" })));
  ok("⛔ publication qui porte un lien → jamais touchée", !lbcACloreHorsFrance(j({ listing_url: "https://www.leboncoin.fr/ad/x/1" })) && !lbcACloreHorsFrance(j({ platform_listing_id: "2999" })));
  for (const st of ["published", "cancelled", "sold", "deleted"]) ok(`${st} → jamais touché`, !lbcACloreHorsFrance(j({ status: st })));
  for (const pf of ["vinted", "beebs", "ebay", "depop"]) ok(`${pf} → jamais touché (Leboncoin seul)`, !lbcACloreHorsFrance(j({ platform: pf })));
  // Servi malgré tout : seulement ce qui ne peut plus attendre.
  ok("non servie : publication Leboncoin en file", lbcServiMalgreHorsFrance(j()) === false);
  ok("servie : la tâche en cours (le poste la tient)", lbcServiMalgreHorsFrance(j({ status: "processing" })) === true);
  ok("servie : la republication dont l'annonce est déjà retirée (elle va au bout)", lbcServiMalgreHorsFrance(j({ action: "republish", platform_fields: { deleted_at: "2026-10-25T08:00:00Z" } })) === true);
  ok("servis : un retrait, et toute autre plateforme", lbcServiMalgreHorsFrance(j({ action: "delete" })) && lbcServiMalgreHorsFrance(j({ platform: "vinted" })));
  // La forme (modèle de la sortie d'Opla).
  const avant = j({
    status: "pending",
    error: "Adresse \"Via CANALE 24 C 16035 RAPALLO\" sans suggestion dans l'autocomplete Leboncoin.",
    platform_fields: { needs_user_source: "plateforme_ecartee", next_action_after: "2026-10-25T09:30:38Z", processing_since: "2026-10-25T08:29:13Z", needsUserAttempts: 4, lot_publication: { id: "L1" } },
  });
  const cl = clotureLbcHorsFrance(avant, { par: "get-pending-jobs", code: "16035", maintenant: Date.parse("2026-10-25T09:00:00Z"), archiver: archiverErreur });
  ok("statut cancelled (jamais failed : pas de rouge)", cl.status === "cancelled");
  ok("le message de Nico, mot pour mot", cl.error === "Leboncoin n'accepte que les adresses en France. Ton adresse de remise est hors de France : FillSell ne publie donc pas sur Leboncoin pour ton compte. Rien n'a été publié, et tes autres plateformes continuent normalement." && cl.error === MESSAGE_LBC_HORS_FRANCE);
  ok("la marque lbc_hors_france { le, par, statut_avant, preuve }", egal(cl.platform_fields[CLE_LBC_HORS_FRANCE], { le: "2026-10-25T09:00:00.000Z", par: "get-pending-jobs", statut_avant: "pending", source_avant: "plateforme_ecartee", preuve: "16035" }), JSON.stringify(cl.platform_fields[CLE_LBC_HORS_FRANCE]));
  ok("hors quota (ne compte dans aucune limite)", cl.platform_fields.hors_quota === true);
  ok("sans needs_user_source, next_action_after ni processing_since", !("needs_user_source" in cl.platform_fields) && !("next_action_after" in cl.platform_fields) && !("processing_since" in cl.platform_fields));
  ok("l'ancienne erreur est archivée", cl.platform_fields.erreurs_archivees?.at(-1)?.erreur === avant.error && cl.platform_fields.erreurs_archivees.at(-1).statut === "pending");
  ok("⛔ jamais arret_utilisateur (« à ta demande » serait faux)", !("arret_utilisateur" in cl.platform_fields));
  ok("le reste du job est gardé (lot, essais)", cl.platform_fields.lot_publication?.id === "L1" && cl.platform_fields.needsUserAttempts === 4);
  ok("l'objet lu n'est pas modifié", avant.platform_fields.needs_user_source === "plateforme_ecartee");
  ok("la clôture se reconnaît", estClotureLbcHorsFrance({ ...avant, ...cl }) && !estClotureLbcHorsFrance(avant) && !estClotureLbcHorsFrance({ status: "cancelled", platform_fields: {} }));
  ok("aucune promesse de reprise, aucune relance, aucun « écris-nous »", !/relanc|écris-nous|repartira|réessai/i.test(MESSAGE_LBC_HORS_FRANCE));
  ok("anglais pour l'app", /^Leboncoin only accepts addresses in France/.test(messageLbcHorsFrance("en")) && messageLbcHorsFrance("fr") === MESSAGE_LBC_HORS_FRANCE);
}

console.log("\n[3] L'état neutre : suivi de lot et état unique");
{
  const clos = { action: "publish", platform: "leboncoin", status: "cancelled", inventaire_id: 7, created_at: "2026-10-24T11:44:00Z", error: MESSAGE_LBC_HORS_FRANCE, platform_fields: { lbc_hors_france: { le: "x", par: "t", statut_avant: "pending", preuve: "16035" }, hors_quota: true, lot_publication: { id: "L1" } } };
  ok("etatJobLot → « hors_france » (plus jamais « pas_partie »)", etatJobLot(clos) === "hors_france");
  ok("un cancelled sans marque reste « pas_partie » (rien d'autre ne change)", etatJobLot({ ...clos, platform_fields: {} }) === "pas_partie");
  const vinted = { action: "publish", platform: "vinted", status: "published", inventaire_id: 7, created_at: "2026-10-24T11:44:00Z", platform_fields: {} };
  const s = suiviDuLot([clos, vinted]);
  ok("article avec Vinted en ligne + Leboncoin clos → « en ligne », 0 « à toi de jouer · pas parties »", s.lignes[0].groupe === "en_ligne" && s.compte.pas_parties === 0 && s.compte.geste === 0, JSON.stringify(s.compte));
  const seul = suiviDuLot([clos]);
  ok("article dont seul Leboncoin était prévu → groupe « hors_france », lot fini, rien d'arrêté « à ta demande »", seul.lignes[0].groupe === "hors_france" && seul.compte.hors_france === 1 && seul.compte.arretees === 0 && seul.fini === true, JSON.stringify(seul.compte));
  ok("groupeArticle : un échec réel passe toujours devant", groupeArticle(["hors_france", "pas_partie"]) === "pas_parties" && groupeArticle(["hors_france"]) === "hors_france");
  const ebayClos = { action: "publish", platform: "ebay", status: "cancelled", inventaire_id: 8, platform_fields: { ebay_hors_france: { le: "x", par: "ebay-api-worker", statut_avant: "pending", preuve: "UK" } } };
  ok("eBay clos hors de France : même état neutre au lot", etatJobLot(ebayClos) === "hors_france");
  const e = etatJob(clos);
  ok("état unique : « Arrêtée », ton neutre (jamais à toi de jouer, jamais rouge)", e.etat === ETATS.ARRETEE && tonEtat(e.etat, e.motif) === "neutre", JSON.stringify(e));
  ok("le message s'affiche tel quel (humanizeJobError)", humanizeJobError(clos, "fr") === MESSAGE_LBC_HORS_FRANCE, humanizeJobError(clos, "fr"));
  const msgEbay = messageClotureEbayHorsFrance("UK");
  ok("le message eBay s'affiche tel quel", humanizeJobError({ ...ebayClos, error: msgEbay }, "fr") === msgEbay, humanizeJobError({ ...ebayClos, error: msgEbay }, "fr"));
}

console.log("\n[4] L'app : rien ne propose Leboncoin à ces comptes");
{
  ok("plateformesDuCompte sans fermées : les quatre d'avant", egal(plateformesDuCompte([]), ["vinted", "leboncoin", "beebs", "ebay"]));
  ok("plateformesDuCompte avec Leboncoin fermé : Vinted, Beebs, eBay (+ Depop ouverte)", egal(plateformesDuCompte(["depop"], ["leboncoin"]), ["vinted", "beebs", "ebay", "depop"]));
  ok("relevé : sans Leboncoin", !plateformesDeReleve([], false, ["leboncoin"]).includes("leboncoin") && plateformesDeReleve([], false).includes("leboncoin"));
  const enLigne = [{ platform: "leboncoin", action: "publish", status: "published", listing_url: "https://www.leboncoin.fr/ad/x/1" }];
  ok("une annonce Leboncoin VIVANTE se voit et se retire toujours (plateformesDeLArticle)", plateformesDeLArticle(enLigne, [], ["leboncoin"]).includes("leboncoin") && !plateformesDeLArticle([], [], ["leboncoin"]).includes("leboncoin"));
  const article = { id: 1, statut: "en_stock" };
  const jobsLbc = [{ platform: "leboncoin", action: "publish", status: "published", listing_url: "https://www.leboncoin.fr/ad/x/1", created_at: "2026-10-01T10:00:00Z" }];
  ok("republication : Leboncoin fermé n'est plus republiable", !plateformesRepubliables(article, jobsLbc, { multiOuverte: true, plateformesFermees: ["leboncoin"] }).includes("leboncoin")
    && plateformesRepubliables(article, jobsLbc, { multiOuverte: true }).includes("leboncoin"));
  // La dernière garde, au clic : Leboncoin sort AVANT le débit, motif « hors_france ».
  const ex = calculerExclusions({
    selected: new Set(["vinted", "leboncoin"]), platformSupport: {}, platformListings: { platforms: { vinted: {}, leboncoin: {} } },
    plateformesSansAdresse: [], champsManquantsParPf: { leboncoin: ["Poids"] }, plateformesHorsFrance: ["leboncoin"],
  });
  ok("au clic : Vinted part, Leboncoin exclu « hors_france » (aucun champ ne lui est demandé)", egal(ex.aPublier, ["vinted"]) && egal(ex.exclues, [{ platform: "leboncoin", motif: "hors_france" }]) && egal(ex.champManquant, []), JSON.stringify(ex));
  const seul = calculerExclusions({ selected: ["leboncoin"], platformSupport: {}, platformListings: { platforms: { leboncoin: {} } }, plateformesSansAdresse: ["leboncoin"], plateformesHorsFrance: ["leboncoin"] });
  ok("Leboncoin seul : rien ne part, motif « hors_france » (jamais « renseigne ton adresse »)", seul.aPublier.length === 0 && motifAucunePlateforme(seul) === "hors_france" && egal(seul.sansAdresse, []));
  ok("sans le cinquième filtre, rien ne change (sans adresse = comme avant)", motifAucunePlateforme(calculerExclusions({ selected: ["leboncoin"], platformSupport: {}, platformListings: { platforms: { leboncoin: {} } }, plateformesSansAdresse: ["leboncoin"] })) === "sans_adresse");
  const T = txt("fr");
  ok("Réglages : la phrase de Nico, mot pour mot", T.lbcHorsFrance === "Leboncoin : réservé aux adresses en France. Une adresse en France ? Indique-la dans Réglages › Expédition.");
  ok("Réglages : l'avertissement à l'enregistrement existe (fr et en)", /pas un code postal français/.test(T.adresseHorsFrance) && /not a French one/.test(txt("en").adresseHorsFrance) && Boolean(txt("en").lbcHorsFrance));
  // Câblage app (lecture du source : la règle est bien appelée là où elle doit l'être).
  const app = lire("src/App.jsx");
  ok("App.jsx : plateformesFermees calculées depuis l'adresse déjà lue, APRÈS ses états (TDZ)", /plateformesFermeesHorsFrance\(\{rue:settingsLbcRue,code_postal:settingsLbcCp,ville:settingsLbcVille\}\)/.test(app)
    && app.indexOf("const [settingsLbcVille,setSettingsLbcVille]=useState('')") < app.indexOf("const plateformesFermees=useMemo("));
  ok("App.jsx : le scan Lens ne rédige plus Leboncoin pour ces comptes", /platforms:\['vinted','leboncoin','beebs','ebay'\]\.filter\(p=>!plateformesFermees\.includes\(p\)\)/.test(app));
  ok("App.jsx : Stock, Lens, Réglages reçoivent les plateformes fermées", (app.match(/plateformesFermees=\{plateformesFermees\}/g) ?? []).length >= 4);
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok("stepper : relecture de l'adresse au clic → plateformesHorsFrance → calculerExclusions", /horsFrance: adresseLbcHorsFrance\(prof\?\.platform_settings\?\.leboncoin\)\.horsFrance/.test(lps) && /plateformesSansAdresse, champsManquantsParPf, plateformesHorsFrance,/.test(lps) && /motifAucune === "hors_france"/.test(lps));
  ok("stepper : les cases et la présélection lisent la liste sans les fermées", /plateformesAffichees: \[\.\.\.plateformesDuStepper/.test(lps) && /\.filter\(p => !plateformesFermees\.includes\(p\)\)/.test(lps));
  const stock = lire("src/tabs/StockTab.jsx");
  ok("Stock : plateformesCompte sans les fermées, plus aucune relance, aucune alerte Leboncoin",
    /plateformesDuCompte\(plateformesOuvertes\)\.filter\(\(p\) => !plateformesFermees\.includes\(p\)\)/.test(stock) && (stock.match(/refusRelanceHorsFrance\(job\)/g) ?? []).length >= 3
    && /estClotureLbcHorsFrance\(job\) \|\| estClotureEbayHorsFrance\(job\)\) return null;/.test(stock)
    && /\[\.\.\.\(ecarteesLues \?\? \[\]\), \.\.\.plateformesFermees\]/.test(stock) && /ecartees: ecarteesCompte/.test(stock));
  const reglages = lire("src/reglages/ReglagesPage.jsx");
  // (25/10 après-midi, Nico : « Leboncoin DISPARAÎT de tous les choix … réglages, partout ») plus de ligne grisée :
  // « Mes plateformes » ne porte plus Leboncoin (plateformesSession sans les fermées), et la garde n'affiche rien.
  ok("Réglages : la republication ne propose plus Leboncoin, « Mes plateformes » ne le montre plus",
    /plateformesDuCompte\(plateformesOuvertes \?\? \[\]\)\.filter\(\(p\) => !\(plateformesFermees \?\? \[\]\)\.includes\(p\)\)/.test(reglages)
    && /lbcHorsFrance: \(plateformesFermees \?\? \[\]\)\.includes\('leboncoin'\)/.test(reglages)
    && /plateformesDeReleve\(plateformesOuvertes, oplaRelie\)\.filter\(\(p\) => !\(plateformesFermees \?\? \[\]\)\.includes\(p\)\)/.test(reglages)
    && /if \(pf === 'leboncoin' && c\.lbcHorsFrance\) return null;/.test(lire("src/reglages/SousPagePlateformes.jsx")));
}

console.log("\n[5] eBay hors de France, plateformes écartées");
{
  ok("site inconnu ou France → rien n'est décidé", !ebaySiteHorsFrance(null).horsFrance && !ebaySiteHorsFrance("").horsFrance && !ebaySiteHorsFrance("France").horsFrance);
  ok("UK, Italy, Belgium_French → hors de France, pays dit en mots", ebaySiteHorsFrance("UK").pays === "Royaume-Uni" && ebaySiteHorsFrance("Italy").horsFrance && ebaySiteHorsFrance("Belgium_French").pays === "Belgique");
  ok("le message de clôture validé (jamais « relance-la »)", messageClotureEbayHorsFrance("UK") === "FillSell publie seulement sur eBay France : ton compte eBay est sur eBay Royaume-Uni. Rien n'a été publié." && !/relanc/i.test(messageClotureEbayHorsFrance("Italy")));
  ok("la phrase de l'app sous la case grisée (fr, en)", texteEbayHorsFrance("Italy") === "eBay : FillSell publie seulement sur eBay France — ton compte eBay est sur eBay Italie." && /eBay Italy\.$/.test(texteEbayHorsFrance("Italy", "en")));
  const pris = { id: "e", platform: "ebay", action: "publish", status: "pending", voie: "api", error: null, platform_fields: { processing_since: "2026-10-25T08:00:00Z", next_action_after: "x" } };
  const cl = clotureEbayHorsFrance(pris, { par: "ebay-api-worker", site: "UK", maintenant: Date.parse("2026-10-25T09:00:00Z"), archiver: archiverErreur });
  ok("clôture eBay : cancelled, message vrai, marque ebay_hors_france, hors quota, rien à relancer",
    cl.status === "cancelled" && cl.error === messageClotureEbayHorsFrance("UK") && cl.platform_fields.hors_quota === true
    && egal(cl.platform_fields.ebay_hors_france, { le: "2026-10-25T09:00:00.000Z", par: "ebay-api-worker", statut_avant: "pending", source_avant: null, preuve: "UK", compte: null }) // (26/10 nuit, point 7) + le compte, inconnu ici
    && !("processing_since" in cl.platform_fields) && !("next_action_after" in cl.platform_fields) && !("needs_user_source" in cl.platform_fields));
  ok("la clôture eBay se reconnaît", estClotureEbayHorsFrance({ ...pris, ...cl }) && !estClotureEbayHorsFrance(pris));
  // Plateformes écartées (job 75344bf6 : republication Vinted pending, compte qui a écarté Vinted et eBay).
  const ecartees = plateformesEcartees(["vinted", "ebay"]);
  const r = (o) => ({ id: "75344bf6", platform: "vinted", action: "republish", status: "pending", platform_fields: {}, ...o });
  ok("75344bf6 (republication Vinted, Vinted écartée) → non servie, laissée en l'état", jobRetenuPlateformeEcartee(r(), ecartees));
  ok("une publication eBay d'un compte qui a écarté eBay → non servie", jobRetenuPlateformeEcartee(r({ platform: "ebay", action: "publish" }), ecartees));
  ok("⛔ un retrait part toujours", !jobRetenuPlateformeEcartee(r({ action: "delete" }), ecartees));
  ok("⛔ une tâche en cours va au bout", !jobRetenuPlateformeEcartee(r({ status: "processing" }), ecartees));
  ok("⛔ une republication dont l'annonce est retirée va au bout", !jobRetenuPlateformeEcartee(r({ platform_fields: { republish_step: "deleted" } }), ecartees));
  ok("une plateforme NON écartée est servie", !jobRetenuPlateformeEcartee(r({ platform: "leboncoin" }), ecartees));
  ok("aucune liste (profil illisible, rien d'écarté) → servi comme avant", !jobRetenuPlateformeEcartee(r(), plateformesEcartees(null)) && !jobRetenuPlateformeEcartee(r(), plateformesEcartees(undefined)));
  ok("la liste se lit aussi depuis platform_settings entier, casse gommée", plateformesEcartees({ plateformes_ecartees: ["Vinted"] }).has("vinted"));
}

console.log("\n[6] Le câblage serveur");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok("get-pending-jobs importe les deux règles", /from "\.\.\/_shared\/lbc-adresse-france\.js"/.test(gpj) && /from "\.\.\/_shared\/plateformes-ecartees\.js"/.test(gpj));
  ok("une lecture du profil (deux clés), seulement si la file porte une publication/republication",
    /\.select\("ecartees:platform_settings->plateformes_ecartees, lbc:platform_settings->leboncoin"\)/.test(gpj) && /if \(out\.some\(pubOuRepub\)\)/.test(gpj));
  ok("clôture : garde sur le statut lu (.eq('status', …)), archive, preuve = code postal",
    /clotureLbcHorsFrance\(j as unknown as Record<string, unknown>, \{ par: "get-pending-jobs", code: verdictLbc\.code, archiver: archiverErreur \}\)/.test(gpj)
    && /\.eq\("id", String\(j\.id\)\)\.eq\("status", String\(j\.status\)\)\.select\("id"\)/.test(gpj));
  ok("needs_user/failed lus au poll de fond, bornés (100)", /\.in\("status", \["needs_user", "failed"\]\)\.order\("created_at", \{ ascending: true \}\)\.limit\(100\)/.test(gpj) && /if \(pollDeFond\) \{/.test(gpj));
  ok("plateformes écartées : retenues au poll de fond seulement (le popup les voit, avec leur pause)", /const ecartees = pollDeFond \? plateformesEcartees\(psHf\.ecartees\) : new Set<string>\(\);/.test(gpj));
  ok("la dernière porte avant la réponse, et rien de tout ça ne tient le PC éveillé", /if \(gardeHorsService\) \{/.test(gpj) && /if \(idsHorsService\.has\(String\(j\.id\)\)\) return false;/.test(gpj));
  ok("le bloc est placé avant toute préparation des publications (juste après la mise de côté des plateformes en pause)",
    gpj.indexOf("const heldBack = (jobs?.length ?? 0) - out.length;") < gpj.indexOf("LEBONCOIN, RÉSERVÉ AUX ADRESSES EN FRANCE")
    && gpj.indexOf("LEBONCOIN, RÉSERVÉ AUX ADRESSES EN FRANCE") < gpj.indexOf("« REPUBLIER » VINTED : SEULEMENT À UN POSTE"));
  const worker = lire("supabase/functions/ebay-api-worker/index.ts");
  ok("ebay-api-worker CLÔT un compte étranger (plus jamais needs_user « ebay_site_etranger »)",
    /clotureEbayHorsFrance\(job, \{ par: "ebay-api-worker", site: s\.site, (compte: s\.pseudo, )?archiver: archiverErreur \}\)/.test(worker)
    && !/needs_user_source: SOURCE_EBAY_SITE_ETRANGER/.test(worker) && /issue: "cancelled", motif: "site_ebay_etranger"/.test(worker));
  const oauth = lire("supabase/functions/_shared/ebay-oauth.ts");
  ok("ebay-account expose le site du compte à l'app (etatPublic.ebay_site)", /ebay_site: compte\.ebay_site \?\? null,/.test(oauth) && /politiques: null, ebay_site: null,/.test(oauth));
}

console.log(`\nlbc-adresse-france : ${verts} contrôles verts, ${rouges.length} rouge(s)`);
if (rouges.length) {
  for (const r of rouges) console.log(`  ROUGE : ${r}`);
  process.exit(1);
}
