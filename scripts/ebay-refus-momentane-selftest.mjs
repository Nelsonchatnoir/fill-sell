// ═══════════════════════════════════════════════════════════════════════════
// Selftest « eBay ne retrouve pas sa propre donnée (25604 « Availability introuvable », 25002 « lieu introuvable »,
// « Réessayez ») : un incident passager d'eBay — la publication repart seule, bornée, jamais « Erreur de saisie » »
// (19/11/2026, point 7 du lot de Nico)
//   npm run selftest:ebay-refus-momentane
//
// LE CAS (19/11 10:04, compte f83b773c) : 7 articles publiés par l'API Inventory, 6 en ligne, un refusé à publishOffer
// (HTTP 400, errorId 25604 « Erreur de saisie. Seller Inventory Service ne peut pas publier les données. Valeur
// Availability introuvable. Réessayez… »). Notre envoi était complet (availability.shipToLocationAvailability.quantity
// = 1, availableQuantity 1, merchantLocationKey — le même code pour les sept) ; deux refus de la même famille ont été
// publiés par une simple relance, corps identique (3f91c02e le 19/11, 48dd94f7 le 03/11). La tâche partait pourtant en
// needs_user avec le brut d'eBay : tout 4xx était lu comme une faute de contenu.
// CE QUE CE TEST VERROUILLE (règle pour tous les comptes, _shared/ebay-refus-momentane.js) :
//   A. la reconnaissance du refus passager (25604 disponibilité, 25002 lieu « Réessayez »), et de lui seul ;
//   B. l'écriture pendant la publication : en file au passage suivant tant que les essais ne sont pas épuisés, puis
//      needs_user avec un message vrai (rien à corriger), jamais « Erreur de saisie » ;
//   C. les tâches déjà arrêtées sur ce refus : reprises une fois par l'entretien, jamais deux (aucune boucle) ;
//   D. les câblages : ebay-api-worker reconnaît le refus à chaque étape de la publication AVANT le verdict générique,
//      l'entretien passe avant la file, et le corps envoyé porte toujours la disponibilité.
// Titres et numéros FICTIFS (selftest:donnees-clients).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => { try { return readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n"); } catch { return ""; } };
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };
const essai = (f, ...a) => { if (typeof f !== "function") return { __absent: true }; try { return f(...a); } catch (e) { return { __exception: String(e?.message ?? e) }; } };
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const R = await charger("supabase/functions/_shared/ebay-refus-momentane.js");

// Les refus réels (phrases exactes d'eBay, relevées en base), et leurs équivalents anglais.
const DISPO_FR = "Erreur de saisie. Seller Inventory Service ne peut pas publier les données. Valeur Availability introuvable. Réessayez ou contactez le Service clients..";
const DISPO_EN = "Input error. Seller Inventory Service is unable to publish the data. Availability not found. Please try again or contact customer support..";
const LIEU_FR = "Une erreur utilisateur est survenue. Informations sur le lieu introuvables. Réessayez ou contactez le Service clients.";
const LIEU_EN = "A user error has occurred. Location information not found. Please try again or contact customer support.";
const BRUT = JSON.stringify({ errors: [{ errorId: 25604, domain: "API_INVENTORY", subdomain: "Selling", category: "Request", message: DISPO_FR }] });

console.log("A. LE REFUS PASSAGER D'eBAY EST RECONNU, ET LUI SEUL");
ok(!R.__erreur, "module _shared/ebay-refus-momentane.js chargé", R.__erreur);
ok(essai(R.refusMomentaneEbay, { errorId: 25604, message: DISPO_FR }) === true, "25604 « Valeur Availability introuvable » (le refus du 19/11) : reconnu");
ok(essai(R.refusMomentaneEbay, { errorId: "25604", message: DISPO_EN }) === true, "la même phrase en anglais (code en texte) : reconnue");
ok(essai(R.refusMomentaneEbay, { errorId: 25002, message: LIEU_FR }) === true && essai(R.refusMomentaneEbay, { errorId: 25002, message: LIEU_EN }) === true,
  "25002 « Informations sur le lieu introuvables. Réessayez » (03/11, à createOffer) : reconnu, en français et en anglais");
ok(essai(R.refusMomentaneEbay, { errorId: 25604, message: "Erreur de saisie. La valeur du champ Taille n'est pas valide." }) === false, "un autre 25604 (« Erreur de saisie » sur un champ) : pas passager");
ok(essai(R.refusMomentaneEbay, { errorId: 25002, message: "Une erreur utilisateur est survenue. Cette annonce entraînerait le dépassement du montant total de votre limite de vente." }) === false
  && essai(R.refusMomentaneEbay, { errorId: 25002, message: "Une erreur utilisateur est survenue. Le champ EAN n'a pas été renseigné." }) === false
  && essai(R.refusMomentaneEbay, { errorId: 25002, message: "Une erreur utilisateur est survenue. Cette annonce semble concerner un objet que vous avez déjà mis en vente sur eBay : Manteau fictif (840100000001)." }) === false,
  "les autres 25002 (plafond de vente, EAN, annonce identique) : pas passagers");
ok(essai(R.refusMomentaneEbay, { errorId: 25002, message: "Une erreur utilisateur est survenue. Informations sur le lieu introuvables." }) === false, "25002 lieu SANS « Réessayez » : pas tranché comme passager");
ok(essai(R.refusMomentaneEbay, { errorId: 25007, message: DISPO_FR }) === false && essai(R.refusMomentaneEbay, null) === false && essai(R.refusMomentaneEbay, { errorId: null, message: DISPO_FR }) === false,
  "un autre code, ou rien : pas passager");

console.log("\nB. PENDANT LA PUBLICATION : EN FILE AU PASSAGE SUIVANT, BORNÉ, PUIS UN MESSAGE VRAI");
const N = R.ESSAIS_MAX_REFUS_MOMENTANE;
ok(N === 3, "3 essais en tout (le premier compris)", String(N));
ok(essai(R.verdictRefusMomentane, 1) === "pending" && essai(R.verdictRefusMomentane, 2) === "pending" && essai(R.verdictRefusMomentane, 3) === "needs_user"
  && essai(R.verdictRefusMomentane, 7) === "needs_user" && essai(R.verdictRefusMomentane, Number.NaN) === "needs_user", "essais 1 et 2 : en file ; 3 et au-delà (ou illisible) : la main à la personne");
const LE = "2026-11-19T09:04:13.735Z";
const JOB = { id: "job-fictif", status: "processing", platform: "ebay", action: "publish", error: null,
  platform_fields: { processing_since: LE, ebayCategoryId: "63862", needs_user_source: "relancer", ebay_api: { sku: "fs-1790000000000008", tentatives: 0 } } };
const E = { errorId: 25604, message: DISPO_FR };
const w1 = essai(R.ecritureRefusMomentane, JOB, E, { tentatives: 1, etape: "publish", maintenant: LE });
const M = R.CLE_REFUS_MOMENTANE;
ok(M === "ebay_refus_momentane", "la marque : ebay_refus_momentane", String(M));
ok(w1?.status === "pending" && w1?.error === null && !("needs_user_source" in (w1?.platform_fields ?? {})), "1er refus : en file, aucun message, aucune source « relancer »", JSON.stringify(w1).slice(0, 200));
ok(w1?.platform_fields?.[M]?.depuis === LE && w1?.platform_fields?.[M]?.essais === 1 && w1?.platform_fields?.[M]?.errorId === 25604 && w1?.platform_fields?.[M]?.etape === "publish"
  && !("epuise_le" in (w1?.platform_fields?.[M] ?? {})), "marque datée : depuis, essais, code, étape", JSON.stringify(w1?.platform_fields?.[M]));
ok(w1?.platform_fields?.ebayCategoryId === "63862" && w1?.platform_fields?.ebay_api?.sku === "fs-1790000000000008", "le reste de la tâche gardé");
ok(JOB.platform_fields.needs_user_source === "relancer" && !(M in JOB.platform_fields), "pure : la tâche d'entrée n'est pas modifiée");
const w2 = essai(R.ecritureRefusMomentane, { ...JOB, platform_fields: w1?.platform_fields }, E, { tentatives: 2, etape: "publish", maintenant: "2026-11-19T09:06:13.000Z" });
ok(w2?.status === "pending" && w2?.platform_fields?.[M]?.essais === 2 && w2?.platform_fields?.[M]?.depuis === LE, "2e refus : en file encore, essais comptés, depuis gardé");
const w3 = essai(R.ecritureRefusMomentane, { ...JOB, platform_fields: w2?.platform_fields }, E, { tentatives: 3, etape: "publish", maintenant: "2026-11-19T09:08:13.000Z" });
ok(w3?.status === "needs_user" && w3?.platform_fields?.needs_user_source === "relancer" && w3?.platform_fields?.[M]?.epuise_le === "2026-11-19T09:08:13.000Z",
  "3e refus : la main à la personne (« relancer »), épuisement daté", JSON.stringify(w3).slice(0, 220));
const msg = essai(R.messageRefusMomentaneEpuise);
ok(w3?.error === msg && typeof msg === "string" && msg.length <= 300, "le message, ≤ 300 caractères", String(msg));
ok(/eBay n'a pas réussi/.test(msg) && /incident passager chez eBay/.test(msg) && /Rien n'a été publié/.test(msg) && /rien n'est à corriger/.test(msg) && /relance-la un peu plus tard/.test(msg),
  "il dit vrai : l'incident est chez eBay, rien de publié, rien à corriger, relancer plus tard");
ok(typeof msg === "string" && !/Erreur de saisie|Availability|25604|25002|Seller Inventory|https?:/.test(msg), "jamais « Erreur de saisie », jamais le code ni le brut d'eBay");
const wOffre = essai(R.ecritureRefusMomentane, JOB, { errorId: 25002, message: LIEU_FR }, { tentatives: 1, etape: "offre", maintenant: LE });
ok(wOffre?.status === "pending" && wOffre?.platform_fields?.[M]?.etape === "offre" && wOffre?.platform_fields?.[M]?.errorId === 25002, "même règle à la création de l'offre (25002 lieu)");

console.log("\nC. LES TÂCHES DÉJÀ ARRÊTÉES SUR CE REFUS : REPRISES UNE FOIS, JAMAIS DEUX");
const diag = { at: LE, etape: "publish", http: 400, errorId: 25604, message: DISPO_FR, brut: BRUT, voie: "api" };
const posee = { id: "job-pose", status: "needs_user", platform: "ebay", action: "publish",
  error: `eBay a refusé la publication (400, 25604) : ${DISPO_FR}`,
  platform_fields: { needs_user_source: "relancer", needs_user_vu_le: "2026-11-19T09:06:01.364Z", needs_user_sans_motif: { source_posee: "relancer" }, needs_user_actif_ms: 5000,
    last_diagnostic: diag, ebay_api: { sku: "fs-1790000000000008", offer_id: "300000000011", tentatives: 1 } } };
ok(essai(R.refusMomentaneARearmer, posee) === true, "needs_user « relancer », diagnostic 25604 de publishOffer, sans marque : à reprendre");
ok(essai(R.refusMomentaneARearmer, { ...posee, platform_fields: { ...posee.platform_fields, needs_user_source: undefined } }) === true, "sans source encore posée : à reprendre");
ok(essai(R.refusMomentaneARearmer, { ...posee, status: "pending" }) === false && essai(R.refusMomentaneARearmer, { ...posee, status: "cancelled" }) === false,
  "pas en attente (en file, abandonnée par la personne) : jamais touchée");
ok(essai(R.refusMomentaneARearmer, { ...posee, platform: "vinted" }) === false && essai(R.refusMomentaneARearmer, { ...posee, action: "delete" }) === false, "autre plateforme, retrait : jamais");
ok(essai(R.refusMomentaneARearmer, { ...posee, platform_fields: { ...posee.platform_fields, needs_user_source: "ebay_annonce_identique" } }) === false, "une autre source (une vraie question) : jamais");
ok(essai(R.refusMomentaneARearmer, { ...posee, platform_fields: { ...posee.platform_fields, last_diagnostic: { ...diag, errorId: 25002, message: "Une erreur utilisateur est survenue. Cette annonce entraînerait le dépassement du montant total de votre limite de vente." } } }) === false,
  "un autre refus (plafond de vente) : jamais");
ok(essai(R.refusMomentaneARearmer, { ...posee, platform_fields: { ...posee.platform_fields, last_diagnostic: { ...diag, etape: "categorie" } } }) === false, "un diagnostic d'une autre étape : jamais");
const archiver = (a, e, s, p) => [...(Array.isArray(a) ? a : []), { erreur: e, statut: s, par: p }];
const r = essai(R.ecritureRearmementRefusMomentane, posee, { maintenant: "2026-11-19T12:00:00.000Z", archiver });
ok(r?.status === "pending" && r?.error === null && !("needs_user_source" in (r?.platform_fields ?? {})), "reprise : en file, message effacé, source levée", JSON.stringify(r).slice(0, 200));
ok(r?.status === "pending" && !["needs_user_vu_le", "needs_user_sans_motif", "needs_user_actif_ms"].some((k) => k in (r?.platform_fields ?? {})), "les marqueurs d'attente levés");
ok(r?.platform_fields?.erreurs_archivees?.[0]?.erreur === posee.error && /refus passager/.test(r?.platform_fields?.erreurs_archivees?.[0]?.par ?? ""), "le message d'avant archivé");
ok(r?.platform_fields?.[M]?.repris_le === "2026-11-19T12:00:00.000Z" && r?.platform_fields?.[M]?.depuis === LE && r?.platform_fields?.[M]?.essais === 1,
  "la marque posée, datée du refus d'origine", JSON.stringify(r?.platform_fields?.[M]));
ok(r?.platform_fields?.ebay_api?.offer_id === "300000000011" && r?.platform_fields?.ebay_api?.tentatives === 1, "l'offre et le compteur d'essais gardés (le chemin normal reprend l'offre non publiée)");
ok(posee.platform_fields.needs_user_source === "relancer" && !(M in posee.platform_fields), "pure : la tâche d'entrée n'est pas modifiée");
// Le cycle entier : reprise → refusée encore deux fois → épuisée → plus jamais reprise par l'entretien.
let pf = r?.platform_fields;
const a2 = essai(R.ecritureRefusMomentane, { platform_fields: pf }, E, { tentatives: 2, etape: "publish", maintenant: "2026-11-19T12:02:00.000Z" });
const a3 = essai(R.ecritureRefusMomentane, { platform_fields: a2?.platform_fields }, E, { tentatives: 3, etape: "publish", maintenant: "2026-11-19T12:04:00.000Z" });
ok(a2?.status === "pending" && a3?.status === "needs_user" && a3?.platform_fields?.[M]?.repris_le === "2026-11-19T12:00:00.000Z", "reprise puis deux refus : épuisée au 3e essai, la reprise gardée en trace");
const epuisee = { ...posee, error: a3?.error, platform_fields: { ...a3?.platform_fields, last_diagnostic: diag } };
ok(essai(R.refusMomentaneARearmer, epuisee) === false, "épuisée : l'entretien ne la reprend JAMAIS (aucune boucle)");

console.log("\nD. LES CÂBLAGES");
const wk = lire("supabase/functions/ebay-api-worker/index.ts");
ok(/import \{[^}]*refusMomentaneEbay[^}]*\} from "\.\.\/_shared\/ebay-refus-momentane\.js";/.test(wk), "worker : import de la règle");
// L'envoi porte toujours la disponibilité : rien ne manquait, rien ne doit manquer.
ok(/availability: \{ shipToLocationAvailability: \{ quantity: 1 \} \},/.test(wk) && /availableQuantity: 1, categoryId, merchantLocationKey: empl\.cle,/.test(wk),
  "worker : l'article porte availability.shipToLocationAvailability.quantity, l'offre availableQuantity et merchantLocationKey");
const iPubErr = wk.indexOf('const pub = await appelEbay(env, token, `/sell/inventory/v1/offer/${offerId}/publish`, { method: "POST" });');
const iIdentique = wk.indexOf("if (refusAnnonceIdentique(e)) {", iPubErr);
const iMomPub = wk.indexOf('return await reessayerRefusMomentane(admin, job, e, { etape: "publish"', iPubErr); // (20/11) branche en bloc : 25713 marque l'offre à recréer
const iGenerique = wk.indexOf('const refus = messageRefus("la publication", pub.http, e);', iPubErr);
ok(iPubErr > 0 && iMomPub > iIdentique && iIdentique > iPubErr && iGenerique > iMomPub, "worker, publishOffer : le refus passager a sa branche, avant le verdict générique (needs_user)");
const iItem = wk.indexOf("const e = lireErreurEbay(rItem.json, rItem.texte);");
ok(iItem > 0 && /^\s*if \(refusMomentaneEbay\(e\)\) return await reessayerRefusMomentane\(admin, job, e, \{ etape: "inventory_item"/.test(wk.slice(wk.indexOf("\n", iItem) + 1)),
  "worker, createOrReplaceInventoryItem : reconnu dès la lecture du refus");
const iCre = wk.indexOf("const e = lireErreurEbay(cre.json, cre.texte);");
ok(iCre > 0 && /^\s*if \(refusMomentaneEbay\(e\)\) return await reessayerRefusMomentane\(admin, job, e, \{ etape: "offre"/.test(wk.slice(wk.indexOf("\n", iCre) + 1)),
  "worker, createOffer : reconnu dès la lecture du refus");
const iMaj = wk.indexOf("const e = lireErreurEbay(maj.json, maj.texte);");
ok(iMaj > 0 && /^\s*if \(refusMomentaneEbay\(e\)\) return await reessayerRefusMomentane\(admin, job, e, \{ etape: "offre_maj"/.test(wk.slice(wk.indexOf("\n", iMaj) + 1)),
  "worker, mise à jour de l'offre non publiée : reconnu dès la lecture du refus");
const iAide = wk.indexOf("async function reessayerRefusMomentane(");
ok(iAide > 0 && /ecritureRefusMomentane\(job, e, \{ tentatives, etape, maintenant: new Date\(\)\.toISOString\(\) \}\)/.test(wk.slice(iAide, iAide + 1500)),
  "worker : l'écriture passe par la règle (ecritureRefusMomentane, compteur d'essais du worker)");
ok(/async function refusMomentanesEntretien\(admin: SupabaseClient\)/.test(wk) && /refusMomentanes = await refusMomentanesEntretien\(admin\);/.test(wk),
  "worker : l'entretien (tâches déjà arrêtées) passe à chaque tick");
const iEnt = wk.indexOf("async function refusMomentanesEntretien(");
const corpsEnt = wk.slice(iEnt, iEnt + 2500);
ok(/refusMomentaneARearmer/.test(corpsEnt) && /ecritureRearmementRefusMomentane/.test(corpsEnt) && /\.limit\(\d+\)/.test(corpsEnt)
  && /\.eq\("status", "needs_user"\)/.test(corpsEnt.slice(corpsEnt.indexOf(".update("))), "worker : l'entretien lit borné, écrit par la règle, gardé par le statut lu");
const iPasse = wk.indexOf("refusMomentanes = await refusMomentanesEntretien(admin);");
const iFile = wk.indexOf('let cible = admin.from("cross_post_jobs")');
ok(iPasse > 0 && iFile > iPasse, "worker : avant la file (une tâche reprise part dans le même passage)");

console.log("\nE. (20/11, point 4 de Nico — e343458f) 25713 « CETTE OFFRE N'EST PAS DISPONIBLE » : L'OFFRE RECRÉÉE, RELANCÉE SEULE");
const OFFRE_FR = "Cette offre n'est pas disponible.";
ok(essai(R.refusMomentaneEbay, { errorId: 25713, message: OFFRE_FR }) === true && essai(R.refusMomentaneEbay, { errorId: "25713", message: "This Offer is not available." }) === true,
  "25713 (le refus réel du 20/11, HTTP 404 à publishOffer) : passager, en français et en anglais");
ok(R.CLE_OFFRE_A_RECREER === "offre_a_recreer", "la marque de l'offre à recréer");
ok(essai(R.offreARecreer, { offre_a_recreer: "365945143011" }, "365945143011") === true, "l'offre marquée par le 25713 est celle trouvée pour le SKU : à recréer");
ok(essai(R.offreARecreer, { offre_a_recreer: "365945143011" }, "999") === false && essai(R.offreARecreer, {}, "365945143011") === false
  && essai(R.offreARecreer, null, "365945143011") === false, "une autre offre, ou aucune marque : reprise comme avant");
ok(essai(R.offreARecreer, { offre_a_recreer: "365945143011" }, "365945143011", { offerIdAttendu: "365945143011" }) === false,
  "jamais sur une republication qui exige son offre exacte");
const reEcrit = essai(R.ecritureRefusMomentane, { platform_fields: {} }, { errorId: 25713 }, { tentatives: 1, etape: "publish", maintenant: "2026-11-20T07:00:00Z" });
ok(reEcrit.status === "pending" && reEcrit.error === null, "1er 25713 : la tâche repart seule au passage suivant, sans message");
ok(essai(R.ecritureRefusMomentane, { platform_fields: {} }, { errorId: 25713 }, { tentatives: 3 }).status === "needs_user"
  && !/25713|Cette offre/.test(essai(R.ecritureRefusMomentane, { platform_fields: {} }, { errorId: 25713 }, { tentatives: 3 }).error),
  "3e essai : la main à la personne, message clair (jamais le brut d'eBay)");
ok(essai(R.refusMomentaneARearmer, { platform: "ebay", status: "needs_user", action: "publish",
  platform_fields: { needs_user_source: "relancer", last_diagnostic: { etape: "publish", errorId: 25713, message: OFFRE_FR } } }) === true,
  "une tâche déjà arrêtée sur 25713 (avant la règle) repart une fois");
ok(/\.in\("platform_fields->last_diagnostic->>errorId", \["25604", "25002", "25001", "25713"\]\)/.test(wk), "worker : l'entretien lit aussi les 25713 arrêtés");
ok(/if \(brouillon\?\.offerId && offreARecreer\(pfJob\.ebay_api as Record<string, unknown>, String\(brouillon\.offerId\), \{ offerIdAttendu \}\)\) \{\n\s*const sup = await appelEbay\(env, token, `\/sell\/inventory\/v1\/offer\/\$\{brouillon\.offerId\}`, \{ method: "DELETE" \}\);/.test(wk)
  && /if \(sup\.http === 200 \|\| sup\.http === 204 \|\| sup\.http === 404\) brouillon = undefined;/.test(wk),
  "worker : l'offre marquée est supprimée puis recréée (createOffer) ; sinon reprise comme avant");
ok(/\.\.\.\(Number\(e\.errorId\) === 25713 \? \{ \[CLE_OFFRE_A_RECREER\]: offerId \} : \{\}\)/.test(wk), "worker : un 25713 à publishOffer marque l'offre à recréer");
ok(/\[CLE_OFFRE_A_RECREER\]: null, \.\.\.\(offreRecreee \? \{ offre_recreee: offreRecreee \} : \{\}\)/.test(wk), "worker : la marque est levée à la publication, la recréation tracée");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ eBay, refus passager (« introuvable… Réessayez ») : la publication repart seule, bornée, jamais « Erreur de saisie »");
