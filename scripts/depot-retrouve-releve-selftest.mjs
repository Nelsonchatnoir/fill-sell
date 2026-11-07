// ═══════════════════════════════════════════════════════════════════════════
// Selftest « un dépôt Vinted dont l'annonce est retrouvée par le relevé n'est jamais failed » (07/11, Nico)
//   node scripts/depot-retrouve-releve-selftest.mjs
// Les cas réels du 05/11 (lus en prod le 07/11) : la veste ONLY de doriane-henri (remise réussie puis VENDUE, sur une
// fiche neuve de la synchro), le pull zippé d'Anne-Hélène (remise réussie, en ligne, fiche neuve, question déjà posée),
// le Dragon Ball Z de XEWER (remise arrêtée par la personne) ; puis le dépôt recollé après le « Oui », et la fiche neuve
// née APRÈS le dépôt et intacte (rattachement).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  numeroLuAuDepot, boutiqueDuDepot, photosCommunes, estDepotAJuger, estJobDeSuivi, jugerDepotRetrouve, raisonsPasIntacte,
  patchDepotEnQuestion, patchDepotVendu, patchRecollage, patchJumeauClos, preuvesQuestion, messageQuestion, messageVendue,
  REGLE_DEPOT_RETROUVE, MOTIF_QUESTION_DEPOT_RETROUVE,
} from "../supabase/functions/_shared/depot-retrouve-releve.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const maintenant = Date.parse("2026-11-07T18:00:00Z");
const PH = (t) => `https://images1.vinted.net/tc/${t}.jpeg?s=abc`;
const ABANDON = { at: "2026-11-06T03:30:00.599491+00:00", refund: { raison: "sans_reservation", rembourse: 0 }, repere: "2026-11-05T18:51:10.472+00:00" };
const ERREUR_CRON = "Publication non confirmée : ton annonce n'a pas pu être retrouvée en ligne sur Vinted — on n'a jamais réussi à récupérer son lien, donc on ne peut ni suivre sa vente ni la retirer pour toi. Cette publication ne compte pas dans tes limites. ⚠️ AVANT DE REPUBLIER, va vérifier tes annonces sur Vinted : si elle y est déjà, republier en créerait une deuxième.";

// ── doriane-henri, « Veste gilet ONLY beige » (187d5102, 05/11 19:50) ──
const veste = (o = {}) => ({
  id: "187d5102-cb75-41e9-87d6-3a89fb5d6d89", user_id: "af37fa49", platform: "vinted", action: "publish", status: "failed",
  inventaire_id: 1793130879982022, created_at: "2026-11-05T18:50:00.486176Z", published_at: "2026-11-05T18:51:10.472Z",
  listing_url: null, platform_listing_id: null, error: ERREUR_CRON, handler_build: "2026-11-04T22:07:23Z+f153ea3 · v0.6.172",
  photos: [PH("02_00759_YspY2F2uteKKCHGJV6Fs8U1A/a50eef3a"), PH("02_00aaa_Autre/11111111")],
  ...o,
  platform_fields: {
    republier: { le: "2026-11-05T18:51:09.791Z", avant: { statut: 520, actions: [] }, nouvel_item: { id: "10677685596", titre: "Veste gilet ONLY beige", source: "geste_du_vendeur" }, rattache_le: "2026-11-05T18:51:09.791Z" },
    lien_refuse: { le: "2026-11-05T18:51:10.730996+00:00", motif: "annonce_portee_par_un_autre_article", id_propose: "10677685596" },
    vinted_item_id: "10677685596", vinted_account_id: "6947482",
    vinted_account_proof: { login: "dorianehenri", user_id: "6947482", source: "users/current_apres_depot" },
    remise_par_republier: { vente: "460230", item_id: "10281020199", transaction_id: "23929370487" },
    listing_url_abandon: ABANDON, hors_quota: true,
    ...(o.pf ?? {}),
  },
});
const ficheVeste = { id: 1793130879982022, statut: "stock", quantite: 1, fusionne_dans: null, vinted_item_id: "10281020199", vinted_status: "sold", vinted_account_id: "6947482", prix_achat: 1 };
const neuveVeste = (o = {}) => ({ id: 1793904435710000, origine: "vinted_sync", statut: "vendu", quantite: 0, fusionne_dans: null, vinted_item_id: "10677685596",
  vinted_status: "sold", vinted_account_id: "6947482", created_at: "2026-11-05T18:47:16.304713Z", first_seen_at: "2026-11-05T18:47:15.512Z",
  prix_achat: 1, photos: [PH("02_00759_YspY2F2uteKKCHGJV6Fs8U1A/a50eef3a")], ...o });
const suiviVeste = { id: "9ab7e738-fb04-4ca4-93e8-beac0dc98f64", platform: "vinted", action: "publish", status: "sold", platform_listing_id: "10677685596",
  listing_url: "https://www.vinted.fr/items/10677685596-veste-gilet-only-beige-en-matiere-peluche-taille-xs", handler_build: "2026-11-04T22:07:23Z+f153ea3 · sync-dressing" };
const venteVeste = { id: 476042, inventaire_id: 1793904435710000, annonce_id: "10677685596", vendu_le: "2026-11-06T18:17:48+00:00" };

console.log("1. Le numéro lu au dépôt (jamais un titre)");
ok("veste : republier.nouvel_item ET lien_refuse concordants → 10677685596", numeroLuAuDepot(veste()).numero === "10677685596");
ok("veste : deux sources nommées", numeroLuAuDepot(veste()).sources.map((s) => s.source).join(",") === "republier,lien_refuse");
ok("discordants → aucun numéro", numeroLuAuDepot(veste({ pf: { lien_refuse: { motif: "annonce_portee_par_un_autre_article", id_propose: "10600000000" } } })).raison === "numeros_discordants");
ok("brouillon → pas une annonce en vente", numeroLuAuDepot(veste({ pf: { republier: { nouvel_item: { id: "10677685596", brouillon: true }, rattache_le: "x" }, lien_refuse: null } })).numero === null);
ok("republier non rattaché (pas de rattache_le) → rien", numeroLuAuDepot(veste({ pf: { republier: { nouvel_item: { id: "10677685596" } }, lien_refuse: null } })).numero === null);
ok("lien refusé pour un autre motif (identifiant certain différent) → rien", numeroLuAuDepot(veste({ pf: { republier: null, lien_refuse: { motif: "identifiant_certain_different", id_propose: "10677685596" } } })).numero === null);
ok("lien refusé seul (dépôt ordinaire) → son numéro", numeroLuAuDepot(veste({ pf: { republier: null } })).numero === "10677685596");
ok("la boutique du dépôt : celle lue après le dépôt", boutiqueDuDepot(veste()) === "6947482");
ok("photos communes par jeton Vinted (signature ignorée)", photosCommunes(veste().photos, neuveVeste().photos) === 1);

console.log("2. Doriane — la veste VENDUE sur la fiche neuve : la vente reste une, le dépôt se clôt");
const vV = jugerDepotRetrouve({ job: veste(), ficheDepot: ficheVeste, porteuse: neuveVeste(), jobsPorteuse: [suiviVeste], ventesAnnonce: [venteVeste], maintenant });
ok("décision « vendue »", vV.decision === "vendue", JSON.stringify(vV));
const pV = patchDepotVendu(veste(), vV, maintenant);
ok("« cancelled », jamais « sold » ni « published » (aucune 2e note de vente, aucun retrait armé)", pV.status === "cancelled");
ok("aucun lien posé sur le dépôt (une annonce = un porteur : le job vendu de la fiche neuve)", !("listing_url" in pV) && !("platform_listing_id" in pV));
ok("message vrai : numéro, vendu le 06/11 (heure de Paris), rien à republier", /10677685596/.test(pV.error) && /VENDU le 06\/11/.test(pV.error) && /Rien à republier/.test(pV.error) && !/AVANT DE REPUBLIER/.test(pV.error));
ok("le constat faux du cron quitte les champs, gardé dans la marque", !pV.platform_fields.listing_url_abandon && pV.platform_fields.depot_retrouve.listing_url_abandon?.at === ABANDON.at);
ok("marque : règle, étape, vente 476042, statut et erreur d'avant", pV.platform_fields.depot_retrouve.regle === REGLE_DEPOT_RETROUVE && pV.platform_fields.depot_retrouve.etape === "vendue"
  && pV.platform_fields.depot_retrouve.vente === 476042 && pV.platform_fields.depot_retrouve.statut_avant === "failed" && /Publication non confirmée/.test(pV.platform_fields.depot_retrouve.erreur_avant));
ok("second passage : rien à réécrire", patchDepotVendu({ ...veste(), status: "cancelled", platform_fields: pV.platform_fields }, vV, maintenant) === null);
ok("vendue mais vente pas encore enregistrée → attendre (jamais perdue)",
  jugerDepotRetrouve({ job: veste(), ficheDepot: ficheVeste, porteuse: neuveVeste(), jobsPorteuse: [suiviVeste], ventesAnnonce: [], maintenant }).raison === "vente_pas_encore_enregistree");
ok("jamais de question sur une paire dont l'annonce est vendue", vV.decision !== "question");

// ── Anne-Hélène, « Pull zippé chaud bleu 12 ans » (7e7f0769, 05/11 10:25) ──
const pull = (o = {}) => ({
  id: "7e7f0769-4703-4838-8c2f-6f950cd148a7", user_id: "d71db658", platform: "vinted", action: "publish", status: "failed",
  inventaire_id: 1792149156607020, created_at: "2026-11-05T09:25:00.327741Z", published_at: "2026-11-05T09:25:55.456Z",
  listing_url: null, platform_listing_id: null, error: ERREUR_CRON, handler_build: "2026-11-04T22:07:23Z+f153ea3 · v0.6.172",
  photos: [PH("02_013ff_HfcAoo7PGw1B9NMdEQDLtXnE/e4c5852b")], ...o,
  platform_fields: {
    republier: { nouvel_item: { id: "10667288621", titre: "Pull zippé chaud bleu 12 ans", source: "geste_du_vendeur" }, rattache_le: "2026-11-05T09:25:55.206Z" },
    lien_refuse: { motif: "annonce_portee_par_un_autre_article", id_propose: "10667288621" },
    vinted_item_id: "10667288621", vinted_account_id: "24934271", vinted_account_proof: { user_id: "24934271", login: "echinaster" },
    remise_par_republier: { item_id: "10631712126" }, listing_url_abandon: ABANDON, ...(o.pf ?? {}),
  },
});
const fichePull = (o = {}) => ({ id: 1792149156607020, statut: "stock", quantite: 1, fusionne_dans: null, vinted_item_id: "10631712126", vinted_status: "closed", vinted_account_id: "24934271", prix_achat: null, prix_achat_inconnu: true, ...o });
const neuvePull = (o = {}) => ({ id: 1793870557184002, origine: "vinted_sync", statut: "stock", quantite: 1, fusionne_dans: null, vinted_item_id: "10667288621",
  vinted_status: "active", vinted_account_id: "24934271", created_at: "2026-11-05T09:22:37.210979Z", first_seen_at: "2026-11-05T09:22:36.972Z",
  prix_achat: 0, prix_achat_inconnu: false, photos: [PH("02_013ff_HfcAoo7PGw1B9NMdEQDLtXnE/e4c5852b")], ...o });
const suiviPull = (o = {}) => ({ id: "c3d14b37-9fa4-4266-8761-78cc45ff64f7", platform: "vinted", action: "publish", status: "published", platform_listing_id: "10667288621",
  listing_url: "https://www.vinted.fr/items/10667288621-pull-zippe-chaud-bleu-12-ans", handler_build: "2026-11-04T22:07:23Z+f153ea3 · sync-dressing", platform_fields: { x: 1 }, ...o });

console.log("3. Anne-Hélène — en ligne sur une fiche neuve née AVANT la remise : la question, le dépôt quitte « failed »");
const vP = jugerDepotRetrouve({ job: pull(), ficheDepot: fichePull(), porteuse: neuvePull(), jobsPorteuse: [suiviPull()], ventesAnnonce: [],
  question: { statut: "proposee" }, unionPossible: true, maintenant });
ok("née avant le dépôt (10:22:37 < 10:25:00) → jamais de rattachement automatique", vP.nee_apres_le_depot === false && vP.decision !== "rattacher");
ok("question déjà posée par la règle du 07/11 → « question_deja_posee » (jamais une 2e)", vP.decision === "question_deja_posee", JSON.stringify(vP));
const pP = patchDepotEnQuestion(pull(), vP, maintenant);
ok("« cancelled » + message vrai (en ligne, annonce 10667288621, « Est-ce le même article ? », rien à republier)", pP.status === "cancelled"
  && /10667288621/.test(pP.error) && /Est-ce le même article/.test(pP.error) && /Rien à republier/.test(pP.error) && !/AVANT DE REPUBLIER/.test(pP.error));
ok("second passage : rien à réécrire (aucune ligne inchangée réécrite)", patchDepotEnQuestion({ ...pull(), status: "cancelled", platform_fields: pP.platform_fields }, vP, maintenant) === null);
const vP2 = jugerDepotRetrouve({ job: pull(), ficheDepot: fichePull(), porteuse: neuvePull(), jobsPorteuse: [suiviPull()], question: null, unionPossible: true, maintenant });
ok("sans question existante, « Oui » possible → la question (motif nommé)", vP2.decision === "question" && vP2.raison === "fiche_neuve_nee_avant_le_depot" && MOTIF_QUESTION_DEPOT_RETROUVE === "depot_retrouve_par_le_releve");
ok("preuves de la question : numéro, sources, boutique, photos, dates", (() => { const p = preuvesQuestion(pull(), vP2); return p.numero === "10667288621" && p.photos_communes === 1 && p.boutique === "24934271" && p.nee_apres_le_depot === false; })());
ok("« Oui » impossible (la fiche du dépôt porte une autre annonce vivante) → jamais posée", jugerDepotRetrouve({ job: pull(), ficheDepot: fichePull(), porteuse: neuvePull(), jobsPorteuse: [suiviPull()], unionPossible: false, maintenant }).raison === "oui_impossible_question_jamais_posee");
ok("« Non, deux exemplaires » déjà dit → rien", jugerDepotRetrouve({ job: pull(), ficheDepot: fichePull(), porteuse: neuvePull(), question: { statut: "refusee" }, unionPossible: true, maintenant }).decision === "rien");
ok("published sans lien (avant le cron de 03:30) : jugé de même", jugerDepotRetrouve({ job: pull({ status: "published" }), ficheDepot: fichePull(), porteuse: neuvePull(), jobsPorteuse: [suiviPull()], question: { statut: "proposee" }, unionPossible: true, maintenant }).decision === "question_deja_posee");

console.log("4. Après le « Oui » : la fiche du dépôt porte l'annonce → le dépôt est RECOLLÉ (published, lien, numéro)");
const apresOui = { ...pull(), status: "cancelled", platform_fields: pP.platform_fields };
const ficheReunie = fichePull({ vinted_item_id: "10667288621", vinted_status: "active" });
const porteuseReunie = { ...ficheReunie, origine: null };
const vR = jugerDepotRetrouve({ job: apresOui, ficheDepot: ficheReunie, porteuse: porteuseReunie, jobsPorteuse: [suiviPull()], maintenant });
ok("décision « recoller », le job de suivi de la même annonce à clore", vR.decision === "recoller" && vR.jumeaux.join() === "c3d14b37-9fa4-4266-8761-78cc45ff64f7", JSON.stringify(vR));
ok("le lien : celui lu par la synchro pour CE numéro", vR.lien === "https://www.vinted.fr/items/10667288621-pull-zippe-chaud-bleu-12-ans");
const pR = patchRecollage(apresOui, vR, maintenant);
ok("« published », listing_url, platform_listing_id 10667288621, erreur effacée", pR.status === "published" && pR.platform_listing_id === "10667288621" && pR.listing_url === vR.lien && pR.error === null);
ok("la marque garde l'histoire (question puis recollé) et l'état d'avant la règle", pR.platform_fields.depot_retrouve.etapes.map((e) => e.etape).join(">") === "question>recolle"
  && pR.platform_fields.depot_retrouve.statut_avant === "failed" && !pR.platform_fields.listing_url_abandon);
const pJ = patchJumeauClos(suiviPull(), vR, apresOui.id, maintenant);
ok("le job de suivi : « cancelled », détaché, nommant le dépôt", pJ.status === "cancelled" && pJ.platform_fields.detache_le && pJ.platform_fields.doublon_identifiant.depot === apresOui.id);
ok("un AUTRE dépôt FillSell porte déjà l'annonce sur la fiche → rien (le doute)",
  jugerDepotRetrouve({ job: apresOui, ficheDepot: ficheReunie, porteuse: porteuseReunie, jobsPorteuse: [suiviPull({ handler_build: "x · v0.6.170" })], maintenant }).raison === "un_autre_depot_porte_l_annonce");
ok("annonce plus en ligne (closed) → attendre", jugerDepotRetrouve({ job: apresOui, ficheDepot: ficheReunie, porteuse: { ...porteuseReunie, vinted_status: "closed" }, jobsPorteuse: [], maintenant }).raison === "annonce_pas_en_ligne");
ok("sans job de suivi : recoller sur le lien canonique", (() => { const v = jugerDepotRetrouve({ job: apresOui, ficheDepot: ficheReunie, porteuse: porteuseReunie, jobsPorteuse: [], maintenant }); return v.decision === "recoller" && v.lien === "https://www.vinted.fr/items/10667288621" && v.jumeaux.length === 0; })());

// ── XEWER, « Dragon Ball Z: Kakarot – PS4 » (a705b36c) : la personne a arrêté le dépôt ──
const dbz = (o = {}) => ({ ...pull(), id: "a705b36c-4d79-4135-896f-881cffcb17f8", inventaire_id: 1793011584104, status: "cancelled",
  error: "Arrêté à ta demande — tu as abandonné Vinted pour cet article.", created_at: "2026-11-05T12:25:00.384849Z", photos: [], ...o,
  platform_fields: { republier: { nouvel_item: { id: "10666779284", source: "geste_du_vendeur" }, rattache_le: "2026-11-05T12:27:10.476Z" },
    lien_refuse: { motif: "annonce_portee_par_un_autre_article", id_propose: "10666779284" }, vinted_account_id: "3137271285",
    vinted_account_proof: { user_id: "3137271285" }, abandon_utilisateur: { le: "2026-11-06T06:04:17Z" } } });
const ficheDbz = { id: 1793011584104, statut: "stock", quantite: 1, fusionne_dans: null, vinted_item_id: "10651652373", vinted_status: "sold", vinted_account_id: "3137271285", prix_achat: 1 };
const neuveDbz = { id: 1793869235444004, origine: "vinted_sync", statut: "stock", quantite: 1, fusionne_dans: null, vinted_item_id: "10666779284", vinted_status: "active",
  vinted_account_id: "3137271285", created_at: "2026-11-05T09:00:35.756518Z", first_seen_at: "2026-11-05T09:00:35Z", prix_achat: 1, photos: [] };
console.log("5. XEWER — dépôt ARRÊTÉ par la personne : jamais réécrit, la question seule");
const vX = jugerDepotRetrouve({ job: dbz(), ficheDepot: ficheDbz, porteuse: neuveDbz, jobsPorteuse: [], unionPossible: true, maintenant });
ok("la question (questionSeule)", vX.decision === "question" && vX.questionSeule === true, JSON.stringify(vX));
ok("annonce vendue → rien (jamais réécrit)", jugerDepotRetrouve({ job: dbz(), ficheDepot: ficheDbz, porteuse: { ...neuveDbz, vinted_status: "sold" }, ventesAnnonce: [{ id: 1 }], maintenant }).decision === "rien");
ok("même fiche après un « Oui » → rien (le geste de la personne reste)", jugerDepotRetrouve({ job: dbz(), ficheDepot: { ...ficheDbz, vinted_item_id: "10666779284", vinted_status: "active" }, porteuse: { ...ficheDbz, vinted_item_id: "10666779284", vinted_status: "active" }, maintenant }).decision === "rien");

console.log("6. Fiche neuve née APRÈS le dépôt et intacte → rattacher l'annonce à la fiche du dépôt");
const depotOrdinaire = (o = {}) => ({ id: "d0000000-0000", user_id: "u1", platform: "vinted", action: "publish", status: "failed", inventaire_id: 11,
  created_at: "2026-11-07T10:00:00Z", published_at: "2026-11-07T10:01:30Z", listing_url: null, platform_listing_id: null, error: ERREUR_CRON,
  handler_build: "b · v0.6.178", photos: [], ...o,
  platform_fields: { lien_refuse: { motif: "annonce_portee_par_un_autre_article", id_propose: "10700000001" }, vinted_account_id: "777", listing_url_abandon: ABANDON, ...(o.pf ?? {}) } });
const ficheDepot = { id: 11, statut: "stock", quantite: 1, fusionne_dans: null, vinted_item_id: null, vinted_status: null, prix_achat: 4 };
const neuve = (o = {}) => ({ id: 22, origine: "vinted_sync", statut: "stock", quantite: 1, fusionne_dans: null, vinted_item_id: "10700000001", vinted_status: "active",
  vinted_account_id: "777", created_at: "2026-11-07T10:01:05Z", first_seen_at: "2026-11-07T10:01:04Z", prix_achat: null, attributs: { taille: { v: "M", source: "vinted_liste" } }, ...o });
const suivi = { id: "s1", platform: "vinted", action: "publish", status: "published", platform_listing_id: "10700000001", handler_build: "b · sync-dressing" };
const vA = jugerDepotRetrouve({ job: depotOrdinaire(), ficheDepot, porteuse: neuve(), jobsPorteuse: [suivi], unionPossible: true, maintenant });
ok("née 10:01:05 ≥ dépôt 10:00:00, rien d'autre que l'annonce → « rattacher »", vA.decision === "rattacher" && vA.suivis.join() === "s1", JSON.stringify(vA));
ok("prix d'achat différent saisi sur la fiche neuve → pas intacte → la question", (() => { const v = jugerDepotRetrouve({ job: depotOrdinaire(), ficheDepot, porteuse: neuve({ prix_achat: 9 }), jobsPorteuse: [suivi], unionPossible: true, maintenant }); return v.decision === "question" && v.pas_intacte.includes("prix_achat"); })());
ok("prix d'achat identique à celui du dépôt → intacte", raisonsPasIntacte(neuve({ prix_achat: 4 }), ficheDepot).length === 0);
ok("saisie manuelle → pas intacte", raisonsPasIntacte(neuve({ attributs: { taille: { v: "L", source: "manuel" } } }), ficheDepot).includes("saisie_manuelle"));
ok("un autre job (Leboncoin) sur la fiche neuve → la question", jugerDepotRetrouve({ job: depotOrdinaire(), ficheDepot, porteuse: neuve(), jobsPorteuse: [suivi, { id: "l1", platform: "leboncoin", action: "publish", status: "published" }], unionPossible: true, maintenant }).decision === "question");
ok("une notification de vente / une remise en vente sur la fiche neuve → pas intacte",
  raisonsPasIntacte(neuve(), ficheDepot, { pushVentes: 1 }).includes("notification_de_vente") && raisonsPasIntacte(neuve(), ficheDepot, { remisesEnVente: 1 }).includes("remise_en_vente"));
ok("« Oui » impossible → ni rattachement ni question", jugerDepotRetrouve({ job: depotOrdinaire(), ficheDepot, porteuse: neuve(), jobsPorteuse: [suivi], unionPossible: false, maintenant }).decision === "rien");
ok("née 1 s AVANT le dépôt → jamais automatique", jugerDepotRetrouve({ job: depotOrdinaire(), ficheDepot, porteuse: neuve({ created_at: "2026-11-07T09:59:59Z" }), jobsPorteuse: [suivi], unionPossible: true, maintenant }).decision === "question");
ok("vue la première fois avant le dépôt (first_seen_at) → jamais automatique", jugerDepotRetrouve({ job: depotOrdinaire(), ficheDepot, porteuse: neuve({ first_seen_at: "2026-11-07T09:00:00Z" }), jobsPorteuse: [suivi], unionPossible: true, maintenant }).decision === "question");

console.log("7. Hors règle, attente, jamais");
ok("autre boutique → rien, jamais", jugerDepotRetrouve({ job: depotOrdinaire(), ficheDepot, porteuse: neuve({ vinted_account_id: "888" }), unionPossible: true, maintenant }).raison === "autre_boutique");
ok("boutique du dépôt inconnue → rien", jugerDepotRetrouve({ job: depotOrdinaire({ pf: { vinted_account_id: null } }), ficheDepot, porteuse: neuve(), unionPossible: true, maintenant }).raison === "boutique_du_depot_inconnue");
ok("aucune fiche ne porte le numéro (pas encore relevé) → attendre", jugerDepotRetrouve({ job: depotOrdinaire(), ficheDepot, porteuse: null, maintenant }).raison === "annonce_pas_encore_relevee");
ok("republication / dépôt en cours sur l'une des fiches → attendre", jugerDepotRetrouve({ job: depotOrdinaire(), ficheDepot, porteuse: neuve(), jobsEngages: [{ id: "r" }], unionPossible: true, maintenant }).raison === "republication_ou_depot_en_cours");
ok("fiche du dépôt fondue → attendre", jugerDepotRetrouve({ job: depotOrdinaire(), ficheDepot: { ...ficheDepot, fusionne_dans: 5 }, porteuse: neuve(), maintenant }).raison === "fiche_du_depot_fondue");
ok("job de suivi de la synchro → jamais un dépôt", !estDepotAJuger(suiviPull({ status: "failed", created_at: "2026-11-05T09:22:37Z" }), maintenant) && estJobDeSuivi(suiviPull()));
ok("publié AVEC son lien → hors règle", !estDepotAJuger(pull({ status: "published", listing_url: "https://www.vinted.fr/items/1" }), maintenant));
ok("plus de 30 jours → hors règle", !estDepotAJuger(pull({ created_at: "2026-10-01T00:00:00Z" }), maintenant));
ok("autre plateforme / retrait / republication → hors règle", !estDepotAJuger(pull({ platform: "leboncoin" }), maintenant) && !estDepotAJuger(pull({ action: "delete" }), maintenant) && !estDepotAJuger(pull({ action: "republish" }), maintenant));
ok("sans numéro lu au dépôt → sans_numero (jamais par le titre)", jugerDepotRetrouve({ job: depotOrdinaire({ pf: { lien_refuse: null } }), ficheDepot, porteuse: neuve(), maintenant }).decision === "sans_numero");
ok("messages : jamais « AVANT DE REPUBLIER », toujours le numéro", !/AVANT/.test(messageQuestion(depotOrdinaire(), "10700000001")) && /10700000001/.test(messageQuestion(depotOrdinaire(), "10700000001"))
  && /Ta publication a bien été faite/.test(messageQuestion(depotOrdinaire(), "1")) && /remis en ligne/.test(messageVendue(veste(), "1", null)));

console.log("8. Branchement (handler-watch) : borné, coupé par défaut, compare-and-set, question par releve_poser_question");
const hw = readFileSync(join(ROOT, "supabase/functions/handler-watch/index.ts"), "utf8").replace(/\r\n/g, "\n"); // fins de ligne neutres (CRLF après un checkout Windows, core.autocrlf)
ok("import du module", /from "\.\.\/_shared\/depot-retrouve-releve\.js"/.test(hw));
ok("interrupteur JUGER_DEPOTS_RETROUVES allumé (feu vert nommé de Nico du 07/11 après la simulation)", /const JUGER_DEPOTS_RETROUVES = true;/.test(hw));
ok("RPC de rattachement derrière son propre interrupteur (migration non appliquée)", /const DEPOT_RETROUVE_RATTACHER_RPC = false;/.test(hw) && /rpc\("depot_retrouve_rattacher"/.test(hw));
ok("appel dans le créneau libre de chaque heure (minutes 12 à 14 UTC)", /JUGER_DEPOTS_RETROUVES && new Date\(\)\.getUTCMinutes\(\) >= 12 && new Date\(\)\.getUTCMinutes\(\) < 15/.test(hw));
const debutCorps = hw.indexOf("async function jugerDepotsRetrouvesParReleve");
const corps = hw.slice(debutCorps, hw.indexOf("\n}\n", debutCorps) + 3);
ok("placé AVANT le juge Beebs (son selftest compte ses écritures jusqu'à la fin du fichier)",
  debutCorps > 0 && debutCorps < hw.indexOf("async function jugerBeebsDepotsSansNumero("));
ok("la fonction du passage existe", corps.length > 100 && /async function jugerDepotsRetrouvesParReleve/.test(hw));
ok("fenêtre de 30 jours, page bornée", /FENETRE_DEPOT_RETROUVE_MS/.test(corps) && /DEPOTS_RETROUVES_PAGE/.test(corps));
ok("écritures compare-and-set sur le statut lu (dépôt et suivi)", /\.eq\("id", j\.id\)\.eq\("status", j\.status\)/.test(corps) && /\.eq\("status", "published"\)\.eq\("platform_listing_id", n\)/.test(corps));
ok("la question par releve_poser_question, motif nommé", /rpc\("releve_poser_question"/.test(corps) && /MOTIF_QUESTION_DEPOT_RETROUVE/.test(corps));
ok("un dépôt arrêté par la personne n'est jamais réécrit (questionSeule)", /questionSeule/.test(corps));
ok("les lectures de masse par lots (in() par 150)", /parLots\(/.test(corps));

console.log(ko ? `\n${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
