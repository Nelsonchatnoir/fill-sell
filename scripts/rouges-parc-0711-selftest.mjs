// ═══════════════════════════════════════════════════════════════════════════
// LES ROUGES DU PARC DU 07/11 (balayage de 14:06) — CORRECTIFS SERVEUR — SELFTEST
// ═══════════════════════════════════════════════════════════════════════════
//   1. famille 5  — dépôt jamais vu en ligne, article vendu / fiche supprimée, aucune annonce vivante : « cancelled »,
//                   message vrai (get-pending-jobs aux deux bascules, handler-watch sur l'existant) ;
//   2. famille 6a — republication arrêtée sur « le prix manque » : prix de la fiche → elle repart seule ; sinon le
//                   message vrai, une fois ;
//   3. famille 6b — ISBN : cherché avant la question, lu sur les photos pour une republication, et la question ne dit
//                   que ce qui a été lu ;
//   4. famille 6c' — la copie d'une republication Depop reprend la taille de l'annonce en ligne ;
//   5. famille 2  — (a) la question « Taille (Depop) » repart seule (jamais le bloc des tours de taille) ;
//                   (b) R8 : des dimensions « A x B cm » dans une grille en dimensions ;
//   6. famille 1 C3 — les relevés d'une republication « cible absente » amorcés par le constat absence_releves.
// Chaque point prouve aussi que le cas d'avant ne change pas. Aucune donnée de client : les formes sont celles des jobs
// réels (numéros, titres et comptes remplacés), les messages sont les textes servis.
//   npm run selftest:rouges-parc-0711
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(path.join(RACINE, p)).href);
let ko = 0, n = 0;
const ok = (c, quoi, d = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.error(`  ✗ ${quoi}${d ? `\n      ${d}` : ""}`); } };
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const hw = lire("supabase/functions/handler-watch/index.ts");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n1. Famille 5 — dépôt jamais vu en ligne, article vendu : « cancelled », jamais « failed »");
const D = await charger("supabase/functions/_shared/depot-jamais-vu-sans-objet.js");
const ANCIEN_MSG = "Publication jamais vue en ligne sur Beebs : deux relevés complets de ton compte ne l'ont pas trouvée, et nous n'avons jamais eu son numéro. Cette publication ne compte pas dans tes limites.";
const DEPOT = { id: "c5debbca-0000-4000-8000-000000000001", user_id: "u-1", platform: "beebs", action: "publish", status: "failed",
  inventaire_id: 1788463954987007, listing_url: null, platform_listing_id: null, vu_en_ligne_le: null, error: ANCIEN_MSG,
  platform_fields: { listing_url_abandon: { at: "2026-11-05T03:05:36Z", motif: "deux_releves_complets", releves: ["r1", "r2"], refund: { raison: "sans_reservation", rembourse: 0 } } } };
ok(D.ficheSansObjet(DEPOT, { statut: "vendu", quantite: 0 }) === "vendue", "fiche « vendu » → vendue");
ok(D.ficheSansObjet(DEPOT, { statut: "vendu", quantite: 1 }) === "vendue", "fiche « vendu » quantité 1 (bcc3b32a) → vendue (public.article_vendu)");
ok(D.ficheSansObjet(DEPOT, { statut: "stock", quantite: 0 }) === "vendue", "quantité 0 → vendue (même définition que article_vendu)");
ok(D.ficheSansObjet({ ...DEPOT, inventaire_id: null }, null) === "supprimee", "inventaire_id NULL (ON DELETE SET NULL) → supprimée");
ok(D.ficheSansObjet(DEPOT, { statut: "stock", quantite: 1 }) === null, "fiche en stock → rien (l'échec reste)");
ok(D.ficheSansObjet(DEPOT, null) === null, "fiche non lue → rien (le doute ne conclut rien)");
ok(D.ficheSansObjet(DEPOT, { statut: "vendu", fusionne_dans: 42 }) === null, "fiche fusionnée → rien");
const L = (x) => ({ listing_id: "34100001", user_id: "u-1", platform: "beebs", inventaire_id: DEPOT.inventaire_id, job_id: null, statut_plateforme: "en_ligne", disparu_le: null, retiree_le: null, ...x });
ok(D.annoncesVivantesDuDepot(DEPOT, [L({})]).length === 1, "une annonce en ligne de la fiche → vivante");
ok(D.annoncesVivantesDuDepot(DEPOT, [L({ statut_plateforme: "inconnu" }), L({ statut_plateforme: "desactivee" })]).length === 2, "« inconnu », « désactivée » → vivantes (le doute garde l'échec)");
ok(D.annoncesVivantesDuDepot(DEPOT, [L({ disparu_le: "x" }), L({ retiree_le: "x" }), L({ statut_plateforme: "vendue" })]).length === 0, "disparue, retirée, vendue → pas vivantes");
ok(D.annoncesVivantesDuDepot(DEPOT, [L({ platform: "vinted" }), L({ user_id: "u-2" }), L({ inventaire_id: 7 })]).length === 0, "autre plateforme, autre compte, autre fiche → pas elle");
ok(D.annoncesVivantesDuDepot({ ...DEPOT, inventaire_id: null }, [L({ inventaire_id: null, job_id: DEPOT.id })]).length === 1, "fiche supprimée : l'annonce reliée au dépôt (job_id) compte");
ok(D.estDepotJamaisVuEnEchec(DEPOT), "le dépôt réel (failed, listing_url_abandon deux_releves_complets) relève du passage");
ok(!D.estDepotJamaisVuEnEchec({ ...DEPOT, listing_url: "https://www.beebs.app/fr/p/341" }) && !D.estDepotJamaisVuEnEchec({ ...DEPOT, platform_listing_id: "341" })
  && !D.estDepotJamaisVuEnEchec({ ...DEPOT, vu_en_ligne_le: "x" }) && !D.estDepotJamaisVuEnEchec({ ...DEPOT, status: "cancelled" })
  && !D.estDepotJamaisVuEnEchec({ ...DEPOT, action: "delete" })
  && !D.estDepotJamaisVuEnEchec({ ...DEPOT, platform_fields: { listing_url_abandon: { motif: "depot_lbc_jamais_en_ligne" } } }),
  "jamais : lien, numéro, vu en ligne, autre statut, retrait, autre preuve que deux relevés complets");
const d1 = D.decisionDepotJamaisVu(DEPOT, { fiche: { statut: "vendu", quantite: 0 }, annonces: [] });
ok(d1.clore === true && d1.raison === "vendue", "vendue, aucune annonce vivante → clore");
ok(D.decisionDepotJamaisVu(DEPOT, { fiche: { statut: "vendu" }, annonces: [L({})] }).clore === false, "une annonce vivante → l'échec reste (il dit vrai)");
ok(D.decisionDepotJamaisVu(DEPOT, { fiche: { statut: "stock", quantite: 1 }, annonces: [] }).clore === false, "fiche en stock → l'échec reste");
const mV = D.messageDepotJamaisVuSansObjet("beebs", "vendue", { refund: { raison: "sans_reservation", rembourse: 0 } });
ok(mV === "Publication jamais vue en ligne sur Beebs : deux relevés complets de ton compte ne l'ont pas trouvée, et nous n'avons jamais eu son numéro. L'article est vendu : il n'y a rien à faire. Cette publication ne compte pas dans tes limites.",
  "message vendue : le constat d'avant gardé, « rien à faire », non décomptée (aucune réservation : rien n'a été pris)", mV);
ok(/^Publication jamais vue en ligne sur Leboncoin : .* La fiche de l'article a été supprimée : il n'y a rien à faire\.$/.test(D.messageDepotJamaisVuSansObjet("leboncoin", "supprimee")),
  "message fiche supprimée ; « Leboncoin » écrit en entier ; sans preuve du remboursement, jamais « ne compte pas »");
ok(D.publicationNonDecomptee({ rembourse: 1 }) && D.publicationNonDecomptee({ raison: "deja_rembourse" }) && D.publicationNonDecomptee({ raison: "rien_a_rembourser" })
  && !D.publicationNonDecomptee({ raison: "reservation_absente" }) && !D.publicationNonDecomptee(null), "« non décomptée » seulement si le remboursement le prouve");
const pf1 = D.champsDepotJamaisVuSansObjet(DEPOT.platform_fields, { raison: "vendue", maintenant: "2026-11-07T15:00:00Z", par: "test" });
ok(pf1.depot_jamais_vu_sans_objet?.raison === "vendue" && JSON.stringify(pf1.listing_url_abandon) === JSON.stringify(DEPOT.platform_fields.listing_url_abandon),
  "la trace listing_url_abandon est GARDÉE telle quelle (un retrait sans lien se clôt toujours « dépôt jamais en ligne »)");
ok(D.champsDepotJamaisVuSansObjet({}, { raison: "supprimee", maintenant: "t", par: "p", releves: ["a"] }).listing_url_abandon?.motif === "deux_releves_complets", "posée si absente");
// get-pending-jobs : les deux bascules
const bascules = gpj.split("decisionDepotJamaisVu(").length - 1;
ok(bascules === 2, `get-pending-jobs : la règle aux DEUX bascules « rien à retirer » (${bascules})`);
const ancienTexte = "error: `Publication jamais vue en ligne sur ${plat === \"beebs\" ? \"Beebs\" : plat} : deux relevés complets de ton compte ne l'ont pas trouvée, ` +\n                \"et nous n'avons jamais eu son numéro. Cette publication ne compte pas dans tes limites.\"";
ok(gpj.includes(ancienTexte) && gpj.includes("error: `Publication jamais vue en ligne sur ${labelDe(d.platform)} : deux relevés complets de ton compte ne l'ont pas trouvée, ` +"),
  "sinon (fiche en stock, doute, lecture ratée) : l'échec d'avant, mot pour mot, aux deux endroits");
ok((gpj.match(/update\(sansObjet\.clore \? \{\n\s*status: "cancelled",/g) ?? []).length === 2 && (gpj.match(/\}\)\.eq\("id", dep\.id(?: as string)?\)\.eq\("status", "published"\);/g) ?? []).length >= 2,
  "« cancelled » seulement si la règle clôt ; compare-and-set sur « published » inchangé");
ok(gpj.includes('.select("id, status, inventaire_id, listing_url, platform_listing_id, platform_fields, published_at, created_at")\n              .eq("id", depotId)')
  && gpj.includes('.select("id, status, inventaire_id, listing_url, platform_listing_id, platform_fields").eq("id", depotProuve)'), "le dépôt est lu avec sa fiche (inventaire_id)");
// handler-watch : le passage borné sur l'existant
const iF5 = hw.indexOf("UN DÉPÔT JAMAIS VU EN LIGNE DONT L'ARTICLE EST VENDU N'EST PAS UN ÉCHEC");
const blocF5 = hw.slice(iF5, hw.indexOf("LA REPUBLICATION ARRÊTÉE SUR « LE PRIX MANQUE »", iF5));
ok(iF5 > 0 && /\(minuteF5 >= 27 && minuteF5 < 30\) \|\| minuteF5 >= 57/.test(blocF5) && !/% 15 >= 12/.test(hw) && /\.slice\(0, 25\)/.test(blocF5) && /\.limit\(500\)/.test(blocF5),
  "handler-watch : un passage par demi-heure (27-29, 57-59 ; 42-44 reste au juge Beebs), 25 dépôts au plus, candidats bornés");
ok(/\.eq\("platform_fields->listing_url_abandon->>motif", "deux_releves_complets"\)/.test(blocF5) && /estDepotJamaisVuEnEchec\(j\)/.test(blocF5)
  && /\.eq\("status", "failed"\)\.is\("listing_url", null\)\.is\("platform_listing_id", null\)\.is\("vu_en_ligne_le", null\)\.select\("id"\)/.test(blocF5),
  "handler-watch : seuls les « failed » jamais vus (deux relevés complets), compare-and-set à l'écriture");
ok(/archiverErreur\(pfN\.erreurs_archivees, j\.error as string, "failed"/.test(blocF5) && />= 1000\) throw/.test(blocF5) && /Fenêtre tournante/.test(blocF5),
  "handler-watch : l'erreur d'avant archivée ; une lecture au plafond ne conclut rien ; aucun dépôt bloqué ne fige les suivants");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n2. Famille 6a — « le prix manque » : prix de la fiche → elle repart ; sinon le message vrai, une fois");
const P = await charger("supabase/functions/_shared/prix-copie-republication.js");
const { causeDuTexte } = await charger("supabase/functions/_shared/cause-blocage.js");
const ANCIEN_PRIX = "Republication Leboncoin mise en pause AVANT tout retrait : le prix manque dans la copie de ton annonce. Ton annonce est TOUJOURS en ligne, rien n'a été touché. Relance la republication depuis la fiche de l'article.";
const JP = { id: "28c40e78", status: "needs_user", action: "republish", platform: "leboncoin", price: null, inventaire_id: 1, error: ANCIEN_PRIX,
  platform_fields: { republish_step: "captured", republish_prevol_manquants: ["le prix"], needs_user_source: "relancer", needs_user_tick_le: "x",
    gardes: { prevol_copie: { verdict: "bloque", manquants: ["le prix"] } }, republish_snapshot: { prix: null } } };
ok(P.estArretPrixCopie(JP), "la tâche réelle (Leboncoin, seul « le prix » manque, aucun prix) relève de la règle");
ok(!P.estArretPrixCopie({ ...JP, platform: "vinted" }), "Vinted : jamais (sa recréation lit la capture, pas le prix de la tâche)");
ok(!P.estArretPrixCopie({ ...JP, platform_fields: { ...JP.platform_fields, republish_prevol_manquants: ["le prix", "le titre"] } }), "autre chose manque aussi : jamais");
ok(!P.estArretPrixCopie({ ...JP, price: 12 }) && !P.estArretPrixCopie({ ...JP, status: "failed" }) && !P.estArretPrixCopie({ ...JP, action: "publish" }), "un prix déjà sur la tâche, un autre statut, une publication : jamais");
const r1 = P.decisionPrixCopie(JP, { prix_vente: "12,50", statut: "stock", quantite: 1 });
ok(r1?.action === "relancer" && r1.prix === 12.5, "la fiche a un prix → relancer avec lui (12,50 → 12.5)");
const r2 = P.decisionPrixCopie(JP, { prix_vente: null, statut: "stock", quantite: 1 });
ok(r2?.action === "message" && r2.message === P.messagePrixAbsent("leboncoin") && /repartira seule dès qu'il y est/.test(r2.message) && /TOUJOURS en ligne/.test(r2.message),
  "pas de prix sur la fiche → le message vrai (« repartira seule dès qu'un prix est sur la fiche »)");
ok(P.decisionPrixCopie({ ...JP, error: P.messagePrixAbsent("leboncoin") }, { prix_vente: null, statut: "stock" })?.action === "rien", "le message déjà écrit : aucune ligne inchangée réécrite");
ok(P.decisionPrixCopie(JP, { prix_vente: 10, statut: "vendu" }) === null && P.decisionPrixCopie(JP, null) === null && P.decisionPrixCopie(JP, { prix_vente: 10, fusionne_dans: 3 }) === null,
  "fiche vendue, illisible, fusionnée : rien (d'autres règles la tiennent)");
ok(P.decisionPrixCopie({ ...JP, platform: "depop" }, { prix_vente: 0.5, statut: "stock" })?.action === "message" && P.decisionPrixCopie({ ...JP, platform: "depop" }, { prix_vente: 1, statut: "stock" })?.action === "relancer",
  "Depop : 1 € au moins (son minimum, comme le pré-vol)");
const pfP = P.champsRelancePrixCopie(JP.platform_fields, 12.5, "2026-11-07T15:00:00Z");
ok(!("republish_prevol_manquants" in pfP) && !("needs_user_source" in pfP) && !("needs_user_tick_le" in pfP) && pfP.prix_repris_de_la_fiche?.apres === 12.5
  && pfP.republish_step === "captured" && pfP.gardes?.prevol_copie?.verdict === "bloque", "relance : l'arrêt effacé, la trace du prix posée, l'étape et l'historique gardés");
ok(causeDuTexte({ texte: P.messagePrixAbsent("leboncoin"), source: "relancer", platform: "leboncoin" }).origine === "utilisateur"
  && causeDuTexte({ texte: ANCIEN_PRIX, source: "relancer", platform: "leboncoin" }).cause === "copie_incomplete",
  "classement : le nouveau message = une information à donner (utilisateur) ; l'ancien reste « copie_incomplete » (nous)");
const iP = hw.indexOf("LA REPUBLICATION ARRÊTÉE SUR « LE PRIX MANQUE » REPART SEULE");
const blocP = hw.slice(iP, iP + 6000);
ok(iP > 0 && /\.contains\("platform_fields", \{ republish_prevol_manquants: \["le prix"\] \}\)/.test(blocP) && /update\(\{ status: "pending", error: null, price: d\.prix, platform_fields: pfR \}\)/.test(blocP)
  && /\.eq\("id", j\.id\)\.eq\("status", "needs_user"\)/.test(blocP) && /\.limit\(50\)/.test(blocP), "handler-watch : bornée (50), prix posé puis « pending », compare-and-set sur needs_user");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n3. Famille 6b — ISBN : cherché avant la question, lu sur les photos d'une republication, message vrai");
const I = await charger("supabase/functions/_shared/isbn-republication.js");
const VIEUX_REDEMANDE = "Ton annonce est TOUJOURS EN LIGNE : on ne l'a pas retirée. Pour la republier, Vinted réclame « ISBN » et on ne l'a trouvé ni sur ton annonce ni dans sa description. Complète ce champ et la republication repartira toute seule — tant que ce n'est pas fait, rien n'est touché.";
const VIEUX_ARRET = "Ton annonce est TOUJOURS EN LIGNE et elle y reste. On ne sait pas la republier sans « ISBN », que Vinted exige pour cette catégorie — on ne te le redemande plus. Rien n'a été retiré, rien n'est perdu.";
ok(I.messageRequisRepublication({ libelles: "ISBN", onRedemande: true, descriptionLue: true }) === VIEUX_REDEMANDE, "ISBN, description lue : le texte d'avant, mot pour mot");
ok(I.messageRequisRepublication({ libelles: "ISBN", onRedemande: false }) === VIEUX_ARRET, "4e tour : le texte d'avant, mot pour mot");
ok(/et on ne l'a pas trouvé sur ton annonce\./.test(I.messageRequisRepublication({ libelles: "Couleur", onRedemande: true })) && !/description/.test(I.messageRequisRepublication({ libelles: "Couleur", onRedemande: true })),
  "une couleur (description jamais lue pour elle) : plus jamais « ni dans sa description »");
ok(/ni sur ton annonce, ni dans sa description, ni sur tes photos\./.test(I.messageRequisRepublication({ libelles: "ISBN", onRedemande: true, descriptionLue: true, photosLues: true })), "photos lues : dit");
const SNAP = { description: "Vie de merde - neuf ", titre: "Livre vie de merde neuf" };
const a = I.isbnAvantQuestion({ va: {}, snap: SNAP, job: { description: null, title: "Livre vie de merde neuf " } });
ok(a.trouve === null && a.descriptionLue === true, "efec755b : la description de l'annonce est lue (pas d'ISBN) → la question dit vrai");
const b = I.isbnAvantQuestion({ va: {}, snap: { description: "Poche, très bon état. ISBN 978-2-253-08512-6" }, job: {} });
ok(b.trouve?.isbn13 === "9782253085126", "l'ISBN écrit dans la description est trouvé AVANT la question (aucune question posée)");
ok(I.isbnAvantQuestion({ va: { isbn: "Ce livre n'a pas d'ISBN" }, snap: { description: "ISBN 978-2-253-08512-6" }, job: {} }).trouve === null, "jamais par-dessus une réponse de la personne");
ok(I.isbnAvantQuestion({ va: {}, snap: null, job: { title: "Livre" } }).descriptionLue === false, "sans description : « ni dans sa description » ne sera pas écrit");
ok(I.isbnAvantQuestion({ va: {}, snap: { description: "ISBN 978-2-253-08512-6" }, job: { description: "ISBN 978-2-07-036024-6" } }).trouve === null, "deux ISBN différents : rien (la question)");
const JE = { platform: "vinted", action: "republish", status: "needs_user", platform_fields: { republish_step: "captured", needsUserField: { field_key: "isbn" } } };
ok(I.republicationIsbnALire(JE) && !I.republicationIsbnALire({ ...JE, platform_fields: { ...JE.platform_fields, republish_step: "deleted" } }) && !I.republicationIsbnALire({ ...JE, action: "publish" }),
  "le lecteur des photos prend la republication à l'étape captured (avant tout retrait), jamais après");
const iG = gpj.indexOf("let manquants = (requisParCle.get(cleCategorie(pf)!) ?? [])");
const blocG = gpj.slice(iG, iG + 5000);
ok(iG > 0 && blocG.indexOf("isbnAvantQuestion(") > 0 && blocG.indexOf("isbnAvantQuestion(") < blocG.indexOf("messageRequisRepublication(")
  && /descriptionLue: seulIsbn && descriptionLue, photosLues: seulIsbn && Boolean\(pf\.isbn_photos_lu\)/.test(blocG),
  "get-pending-jobs : resoudreIsbn AVANT la question ; « description » / « photos » seulement si lues et pour l'ISBN seul");
ok(!gpj.includes("et on ne l'a trouvé ni sur ton annonce ` +\n                  `ni dans sa description"), "get-pending-jobs : l'affirmation inconditionnelle a disparu");
const iH = hw.indexOf("L'ISBN D'UN LIVRE SE LIT SUR SES PHOTOS AVANT DE LE DEMANDER");
const blocH = hw.slice(iH, hw.indexOf("UN DÉPÔT JAMAIS VU EN LIGNE DONT L'ARTICLE EST VENDU", iH));
ok(/\.in\("action", \["publish", "republish"\]\)/.test(blocH) && /republicationIsbnALire\(j\)/.test(blocH) && /if \(estRepublication\) \{/.test(blocH)
  && /resoudreIsbn\(\{ description: descriptionsLues/.test(blocH), "handler-watch : les republications (étape captured) aussi — la description d'origine d'abord, puis les photos");
ok(/j\.action === "publish" && refuseSansIsbn\(/.test(blocH) && /allowed_values: dejaRefuseSansIsbn \? \[\] : \[ISBN_ABSENT\]/.test(blocH), "la publication : inchangée (« Ce livre n'a pas d'ISBN », refus sans ISBN)");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n4. Famille 6c' — la copie d'une republication Depop reprend la taille de l'annonce en ligne");
const C = await charger("supabase/functions/_shared/copie-republication-depop.js");
const J1F = { id: "1fbef555", user_id: "u-3", inventaire_id: 11, platform: "depop", action: "republish", status: "pending", description: null,
  title: "Kaporal straight leg blue jeans size 33", platform_listing_id: "tkand_733-kaporal-straight-leg-blue-jeans-a0ea",
  listing_url: "https://www.depop.com/products/tkand_733-kaporal-straight-leg-blue-jeans-a0ea/", platform_fields: { source: "releve", etat: "Très bon état" } };
const CAP = { source: "api", categorie: "bottoms/jeans", genre: "Homme", etat: "Très bon état", marque: "Kasper", taille: "33", depop_id: 961574695, description: "Kaporal straight leg blue jeans size 33" };
const rc = C.completerCopieDepop({ job: J1F, depots: [], capture: CAP, fiche: { etat: { v: "Très bon état" }, taille: { v: "33", source: "releve_depop" } }, le: "2026-11-01T22:02:17Z" });
ok(rc?.platform_fields?.depopTaille === "33" && rc.sources.depopTaille === "annonce_en_ligne", "1fbef555 : « 33 » de l'annonce en ligne (API Depop) posé sur la copie");
ok(rc?.platform_fields?.depopCategoryPath?.join("/") === "menswear/bottoms/jeans" && rc.sources.depopEtat === "fiche" && rc.sources.depopMarque === "annonce_en_ligne", "le reste de la copie : comme avant");
ok(!C.completerCopieDepop({ job: J1F, capture: { ...CAP, taille: "Other" } })?.platform_fields?.depopTaille, "« Other » : jamais");
ok(!C.completerCopieDepop({ job: J1F, capture: { ...CAP, source: "dom" } })?.platform_fields?.depopTaille, "une capture qui n'est pas l'API Depop, sans grille connue : rien");
const D387 = { id: "d1", user_id: "u-3", inventaire_id: 11, platform: "depop", action: "publish", status: "published", listing_url: J1F.listing_url,
  platform_fields: { depopTaille: "32", taille: "32", depopCategoryPath: ["menswear", "bottoms", "jeans"] } };
ok(C.completerCopieDepop({ job: J1F, depots: [D387], capture: CAP })?.platform_fields?.depopTaille === "32", "le dépôt FillSell garde la main (sa taille, jamais celle de l'annonce par-dessus)");
ok(C.completerCopieDepop({ job: { ...J1F, platform_fields: { ...J1F.platform_fields, taille: "M" } }, capture: CAP })?.platform_fields?.depopTaille === undefined, "une taille déjà sur la copie : jamais remplacée");
const grille = { field_key: "depopTaille", allowed_values: ["One size", "XS", "S", "M", "L", "Other"] };
ok(C.tailleDepopPourLaCopie({ capture: { ...CAP, taille: "33" }, grille: grille.allowed_values }) === null, "hors de la grille connue : rien");
ok(C.tailleDepopPourLaCopie({ capture: null, fiche: { taille: { v: "M" } }, grille: grille.allowed_values })?.source === "fiche"
  && C.tailleDepopPourLaCopie({ capture: null, titre: "Pull taille L", grille: grille.allowed_values })?.valeur === "L"
  && C.tailleDepopPourLaCopie({ capture: null, fiche: { taille: { v: "M" } } }) === null, "fiche / titre : seulement dans une grille CONNUE, à l'identique");
ok(C.tailleDuTitreDepop("jeans size 33 #denim") === "33" && C.tailleDuTitreDepop("taille M et size L") === "", "le titre : un seul jeton, sinon rien");
ok(C.completerCopieDepop({ job: { ...J1F, description: "x", platform_fields: { depopCategoryPath: ["menswear", "bottoms", "jeans"], depopEtat: "used_good", depopPort: 4 } }, capture: CAP }) === null,
  "une copie complète : rien n'est touché (l'étape ne s'ajoute qu'à une copie qu'on complète déjà)");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n5. Famille 2 — (a) la question « Taille (Depop) » repart seule ; (b) R8 : dimensions « A x B cm »");
const Q = await charger("supabase/functions/_shared/taille-question-auto.js");
const S = await charger("supabase/functions/_shared/taille-de-service.js");
const GRILLE_JEANS = ["One size", "XS", "S", "M", "L", "XL", "XXL", "3XL", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "42", "44", "46", "48", "50", "52", "54", "56", "Other"];
const qDepop = (x = {}) => ({ status: "needs_user", platform: "depop", action: "republish", error: "Republication Depop mise en pause AVANT tout retrait, ton annonce est toujours en ligne : Depop exige « Taille (Depop) » pour ce rayon et aucune valeur certaine n'a pu être posée.",
  platform_fields: { needsUserField: { field_key: "depopTaille", field_label: "Taille (Depop)", allowed_values: GRILLE_JEANS, options_completes: true, target: { root: null, key: "depopTaille" } } }, ...x });
const rq = Q.reponseTailleAuto(qDepop(), "33", ["Kaporal straight leg blue jeans size 33"]);
ok(rq?.valeur === "33" && rq.cible.key === "depopTaille" && rq.regle === "R0", "1fbef555 (republication) : « 33 » de la fiche, dans la grille → la question repart seule");
ok(Q.reponseTailleAuto(qDepop({ action: "publish" }), "38", []) === null, "une PUBLICATION, « 38 » nu dans la zone des W : jamais tranché par le serveur (FR 38 ≠ W38)");
ok(Q.reponseTailleAuto(qDepop({ action: "publish" }), "M", [])?.valeur === "M", "une publication, « M » : tranché");
ok(Q.reponseTailleAuto(qDepop({ error: "Depop exige une taille de SA grille pour ce rayon. Dans ce rayon, « 24 » à « 56 » sont des TOURS DE TAILLE en pouces (W) : …" }), "33", []) === null,
  "la question du bloc des tours de taille : jamais tranchée ici");
const GRILLE_AGE = ["One size", "0-3 months", "10 years", "11 years", "12 years", "13 years", "Other"];
ok(Q.reponseTailleAuto({ status: "needs_user", platform: "depop", action: "publish", platform_fields: { taille: "11-12 yrs", needsUserField: { field_key: "depopTaille", allowed_values: GRILLE_AGE, target: { key: "depopTaille" } } } },
  "10 ans (128-140 cm)", ["Veste 11-12 ans", "taille 11-12 ans"]) === null, "82888f35 « 11-12 yrs » : la tranche d'âge n'est PAS tranchée (décision de Nico)");
ok(/"clothing_st", "depopTaille"\]\)/.test(hw), "handler-watch : « depopTaille » dans le filtre de la reprise automatique");
const HOUSSE = ["Simple (135-150 cm x 200-220 cm)", "Double (155-190 cm x 200-220 cm)", "Queen Size (200 cm x 200-220 cm)", "King Size (220-240 cm x 220-260 cm)"];
ok(S.tailleDeService("260 x 240 cm", HOUSSE)?.valeur === "King Size (220-240 cm x 220-260 cm)" && S.tailleDeService("260 x 240 cm", HOUSSE).regle === "R8", "« 260 x 240 cm » → King (la seule option qui contient les deux mesures, dans un sens ou l'autre)");
ok(S.tailleDeService("200x200", HOUSSE)?.valeur === "Queen Size (200 cm x 200-220 cm)" && S.tailleDeService("140 x 200 cm", HOUSSE)?.valeur.startsWith("Simple")
  && S.tailleDeService("170 × 210 cm", HOUSSE)?.valeur.startsWith("Double"), "200 x 200 → Queen ; 140 x 200 → Simple ; 170 × 210 → Double");
ok(S.tailleDeService("63 x 63 cm", HOUSSE) === null && S.tailleDeService("300 x 300 cm", HOUSSE) === null, "aucune option ne les contient → null (la question)");
ok(S.tailleParDimensions("200 x 200 cm", ["200 x 200 cm", "240 x 260 cm", "Autre"])?.valeur === "200 x 200 cm", "l'option EXACTE");
ok(S.tailleParDimensions("150 x 200 cm", ["140-160 cm x 190-210 cm", "150 cm x 200-220 cm", "Autre"]) === null, "deux options possibles → null, jamais un choix");
ok(S.tailleParDimensions("200 x 200 cm", ["Autre", "Other"]) === null && S.tailleDeService("M", HOUSSE) === null && S.tailleDeService("260 x 240 cm", ["S", "M", "L"]) === null,
  "jamais « Autre » ; une lettre face à la grille en dimensions, des dimensions face à une grille en lettres : rien de neuf");
const qH = { status: "needs_user", platform: "vinted", action: "publish", platform_fields: { taille: "Taille unique", categoryPath: ["Maison", "Textiles", "Linge de lit", "Housses de couette"],
  needsUserField: { field_key: "size", field_label: "Taille", allowed_values: HOUSSE, target: { key: "taille", root: null } } } };
const rh = Q.reponseTailleAuto(qH, null, ["Parure de couette 260 x 240 cm Bleu", "housse de couette aux dimensions 260 x 240 cm et deux taies d'oreiller de 63 x 63 cm"]);
ok(rh?.valeur === "King Size (220-240 cm x 220-260 cm)" && rh.regle === "R8" && rh.cible.key === "taille", "ff009cba : les dimensions écrites (les taies 63 x 63 n'en désignent aucune) → King, la question repart seule");
ok(Q.reponseTailleAuto(qH, null, ["Lot : housse 140 x 200 cm et housse 240 x 260 cm"]) === null, "deux dimensions → deux options : la question reste");
const GRILLE_V = ["8 ans / 128 cm", "9 ans / 134 cm", "10 ans / 140 cm", "11 ans / 146 cm", "12 ans / 152 cm", "Taille unique"];
ok(Q.reponseTailleAuto({ status: "needs_user", platform: "vinted", action: "publish", platform_fields: { taille: "11-12 yrs", needsUserField: { field_key: "size", allowed_values: GRILLE_V, target: { key: "taille" } } } },
  "10 ans (128-140 cm)", ["Veste en denim 11-12 ans"]) === null, "f0f603bb « 11-12 yrs » (Vinted) : la tranche d'âge n'est PAS tranchée (décision de Nico)");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n6. Famille 1 C3 — relevés « cible absente » amorcés par le constat absence_releves de la même annonce");
const RC = await charger("supabase/functions/_shared/republication-cible.js");
const ABS = { premier: "c2e027f5", second: "ff2ebb52", listing_id: "3296483096", le: "2026-10-30T09:48:42Z" };
const MARQUE = { cible: "3296483096", releve: "fa6fd703" };
const v1 = RC.relevesCibleAbsente(MARQUE, "fa6fd703", "3296483096", { absence: ABS, cibleVuLe: "2026-10-28T10:42:20Z" });
ok(v1.length === 3 && v1.join() === "c2e027f5,ff2ebb52,fa6fd703", "84bd972d : le constat (2 relevés) + le dernier relevé → 3, la republication se clôt (≥ 2)");
ok(RC.relevesCibleAbsente(MARQUE, "fa6fd703", "3296483096").length === 1, "sans constat : la règle d'avant (1, retenue)");
ok(RC.relevesCibleAbsente(MARQUE, "fa6fd703", "3296483096", { absence: { ...ABS, listing_id: "999" } }).length === 1, "un constat sur une AUTRE annonce : rien");
ok(RC.relevesCibleAbsente(MARQUE, "fa6fd703", "3296483096", { absence: ABS, cibleVuLe: "2026-11-01T08:00:00Z" }).length === 1, "revue en ligne APRÈS le constat : il ne prouve plus rien");
ok(RC.relevesCibleAbsente(MARQUE, "fa6fd703", "3296483096", { absence: { ...ABS, le: null } }).length === 1 && RC.relevesCibleAbsente(MARQUE, "fa6fd703", "3296483096", { absence: { ...ABS, second: "c2e027f5" } }).length === 1,
  "constat sans date, ou deux fois le même relevé : rien");
ok(RC.relevesCibleAbsente(MARQUE, "fa6fd703", "3296483096", { absence: ABS, cibleVuLe: null }).length === 3, "cible jamais relevée (aucune ligne) : le constat compte");
ok(RC.relevesCibleAbsente(null, "r1", "X").length === 1 && RC.relevesCibleAbsente({ cible: "X", releves: ["r1"] }, "r2", "X").length === 2
  && RC.relevesCibleAbsente({ cible: "Y", releves: ["r1", "r2"] }, "r3", "X").length === 1, "les cas du 05/11 (point 18) : inchangés");
ok(/relevesCibleAbsente\(marque, releveV\?\.id \?\? null, cibleId,\n\s*\{ absence: \(pfV\["absence_releves"\] \?\? null\) as Record<string, unknown> \| null, cibleVuLe: \(cible\?\.vu_le \?\? null\) as string \| null \}\);/.test(gpj),
  "get-pending-jobs : le constat de la tâche et le vu_le de la cible sont passés");

console.log(ko ? `\n✗ rouges-parc-0711 : ${ko} rouge(s) sur ${n}` : `\n✓ rouges-parc-0711 : ${n} contrôles verts`);
process.exit(ko ? 1 : 0);
