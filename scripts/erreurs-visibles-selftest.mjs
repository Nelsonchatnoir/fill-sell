// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LA PERSONNE VOIT COMME UNE ERREUR — RIEN DE NOTRE FAIT (25/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Nico (25/10) : « L'utilisateur ne doit voir AUCUNE erreur qui vient de nous ou
// qui est déjà réglée. Il ne voit que ce qui demande vraiment un geste de sa
// part (connexion, choix qui lui appartient). Tout le reste se clôt ou se
// rattrape seul, avec un état vrai. » Et pour Leboncoin hors de France : « Je
// veux que Leboncoin DISPARAISSE de tous les choix […] Les lignes déjà annulées
// ne doivent plus lui apparaître comme des erreurs. »
// Le balayage du 25/10 (lecture seule, 263 comptes actifs) a nommé cinq règles
// d'affichage qui fabriquaient des lignes « de notre fait » (classes B1, B2,
// B3, B6, B7, N1) et le cas Marta (deux lots « Leboncoin seul » clos hors de
// France). Ce test prouve, sans réseau, sur des jobs construits d'après ces cas :
//   1. l'emplacement de republication de la carte (attente automatique « En
//      pause » ; « Arrêtée » / « Plus en ligne » libérés sur preuve) et « Régler » ;
//   2. la pastille de l'onglet (même règle que « À régler ») ;
//   3. le suivi du lot et sa ligne (etatJob, clôtures de nos règles, Marta) ;
//   4. la bannière de la modale de statut (le dernier job de chaque ligne) ;
//   5. le « dernier job » de la carte (une republication réussie dépasse un échec) ;
//   6. ⛔ ce qui demande VRAIMENT un geste reste visible (classe A) ;
//   7. Réglages › Plateformes sans Leboncoin hors de France ; le câblage des écrans.
//
//   node --import ./scripts/loader-ext.mjs scripts/erreurs-visibles-selftest.mjs
import fs from "node:fs";
import {
  causeARegler, jobSupplante, estLeDernierDeSaLigne, derniersParLigne, articlesARegler, plateformesHorsJeu,
  pastilleRepublicationEnPause, republicationLibereeApresArret, revueEnLigneApres, jobReussi, indexSelonARegler,
} from "../src/utils/erreursVisibles.js";
import { republishAReprendre } from "../src/utils/republication.js";
import {
  suiviDuLot, etatJobLot, jobsDuSuivi, lotLePlusRecent, clotureDeNosRegles, arreteeParLaPersonne,
} from "../src/publication/lot/regles.js";
import { pisteJob } from "../src/utils/barresJobs.js";
import { etatJob, attenteAutomatique, ETATS } from "../supabase/functions/_shared/etat-job.js";
import { clotureLbcHorsFrance, MESSAGE_LBC_HORS_FRANCE } from "../supabase/functions/_shared/lbc-adresse-france.js";
import { archiverErreur } from "../supabase/functions/_shared/erreurs-archivees.js";
import { plateformesDeReleve, indexEtatStock, compteursStock, pastillesEtat } from "../src/utils/stockFiltres.js";
import { messageAbandon } from "../src/utils/abandonPlateforme.js";

let verts = 0;
const rouges = [];
function ok(nom, cond, detail = "") {
  if (cond) { verts++; console.log(`  ✓ ${nom}`); }
  else { rouges.push(nom); console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ""}`); }
}
const lire = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const J = (o) => ({ id: o.id ?? "j", inventaire_id: 1, action: "publish", platform: "vinted", status: "published", error: null, created_at: "2026-10-20T10:00:00Z", platform_fields: {}, ...o });

// ── Les jobs des cas réels (formes relevées le 25/10, identifiants raccourcis) ─────────────────────────────
// B1 — 22585563 : republication Vinted, « introuvable à confirmer » (relevé attendu).
const b1Releve = J({ id: "22585563", action: "republish", status: "needs_user", error: "Republication en pause, rien n'a été retiré : FillSell attend le prochain relevé de Vinted pour savoir si l'annonce est toujours en ligne.", platform_fields: { needs_user_source: "introuvable_a_confirmer", republish_step: "a_capturer", introuvable_a_confirmer: { le: "2026-10-24T08:00:00Z" } } });
// B1 — e9e514e2 : publication Depop retenue, Depop écartée par la personne.
const b1Ecartee = J({ id: "e9e514e2", platform: "depop", status: "needs_user", error: "En pause : tu as indiqué ne pas vendre sur Depop, rien n'est envoyé", platform_fields: { needs_user_source: "plateforme_ecartee" } });
// B2 — 8970eacf : « Connexion Vinted requise » en motif d'une pause AVANT tout retrait (session prouvée vivante).
const b2FauxMur = J({ id: "8970eacf", action: "republish", status: "needs_user", error: "Republication en pause avant toute suppression : ton annonce est toujours en ligne sur Vinted. Motif : Connexion Vinted requise. Relance depuis l'app quand tu veux.", platform_fields: { needs_user_source: "relancer", republish_step: "captured", reprises_apres_connexion_n: 3 } });
// A — 6b8be705 : le VRAI mur de connexion (session absente, posé par l'extension : session_vinted).
const aConnexionVinted = J({ id: "6b8be705", action: "republish", status: "needs_user", error: "Connexion Vinted requise : connecte-toi sur vinted.fr dans Chrome, sur ton ordinateur. Ton annonce est intacte, rien n'a été touché ; la republication repartira toute seule dès que tu seras connecté.", platform_fields: { needs_user_source: "session_vinted", republish_step: "a_capturer" } });
// A — bf28f0c5 : Depop demande la configuration de vendeur.
const aVendeurDepop = J({ id: "bf28f0c5", inventaire_id: 2, platform: "depop", status: "needs_user", error: "Depop demande de terminer ta configuration de vendeur avant ta première annonce.", platform_fields: { needs_user_source: "depop_vendeur" } });
// A — 0d53f533 : connexion Beebs requise sur une publication.
const aConnexionBeebs = J({ id: "0d53f533", inventaire_id: 3, platform: "beebs", status: "needs_user", error: "Connexion Beebs requise : connecte-toi à Beebs dans Chrome, sur ton ordinateur.", platform_fields: { needs_user_source: "connexion" } });

console.log("\n[1] L'emplacement de republication de la carte et « Régler »");
{
  ok("B1 relevé attendu : l'état unique dit « En pause » (précondition)", attenteAutomatique(b1Releve) === "releve" && etatJob(b1Releve).etat === ETATS.EN_PAUSE);
  const p = pastilleRepublicationEnPause(b1Releve, "fr");
  ok("B1 : l'emplacement dit « En pause », la phrase de la file — jamais « À toi de jouer »",
    p?.cle === "en_pause" && p.court === "En pause" && /^En pause, rien n'a été retiré/.test(p.titre) && !/toi de jouer/i.test(`${p.court} ${p.titre} ${p.detail}`), JSON.stringify(p));
  ok("B2 faux mur (motif technique avant tout retrait) : attente automatique « technique » (précondition)", attenteAutomatique(b2FauxMur) === "technique");
  ok("B2 : « En pause », ton annonce est intacte", pastilleRepublicationEnPause(b2FauxMur, "fr")?.court === "En pause" && /intacte/.test(pastilleRepublicationEnPause(b2FauxMur, "fr").titre));
  ok("B1/B2 : « Régler » ne les vise jamais (republishAReprendre → null)", republishAReprendre([b1Releve]) === null && republishAReprendre([b2FauxMur]) === null);
  ok("⛔ A : le vrai mur de connexion reste « à toi de jouer » (aucune pause, « Régler » le vise)",
    pastilleRepublicationEnPause(aConnexionVinted, "fr") === null && etatJob(aConnexionVinted).etat === ETATS.A_TOI && republishAReprendre([b1Releve, aConnexionVinted])?.id === "6b8be705");
  ok("un arrêt demandé n'est jamais à reprendre", republishAReprendre([{ ...aConnexionVinted, platform_fields: { ...aConnexionVinted.platform_fields, arret_utilisateur: "2026-10-24T09:00:00Z" } }]) === null);
  ok("en anglais aussi", pastilleRepublicationEnPause(b1Releve, "en")?.court === "Paused");
  ok("étape deleted en pause automatique : « Hors ligne · en pause », rien n'est perdu",
    pastilleRepublicationEnPause({ ...b1Releve, platform_fields: { ...b1Releve.platform_fields, republish_step: "deleted" } }, "fr")?.court === "Hors ligne · en pause");

  // B6 — 8c53f1b4 : remise à zéro du 15/08, copie faite, fiche revue en ligne le 24/10.
  const fiche = { id: 1, statut: "stock", vinted_item_id: "5812", vinted_status: "active", disparu_le: null, last_synced_at: "2026-10-24T18:00:00Z" };
  const b6 = J({ id: "af9a0890", action: "republish", status: "cancelled", created_at: "2026-08-10T09:00:00Z", error: "File remise à zéro par FillSell : cette republication n'a rien retiré, ton annonce est toujours en ligne.", platform_fields: { republish_step: "captured", processing_since: "2026-08-10T09:05:00Z" } });
  ok("B6 copie faite + fiche revue active APRÈS le job : l'emplacement se libère (« ● En ligne »)", republicationLibereeApresArret(b6, fiche) && revueEnLigneApres(fiche, b6));
  ok("B6 copie faite SANS relevé postérieur : « Arrêtée » reste (jamais « en ligne » sur un doute)", !republicationLibereeApresArret(b6, { ...fiche, last_synced_at: "2026-08-09T10:00:00Z" }));
  ok("B6 copie faite, fiche masquée ou disparue : jamais libérée", !republicationLibereeApresArret(b6, { ...fiche, vinted_status: "hidden" }) && !republicationLibereeApresArret(b6, { ...fiche, disparu_le: "2026-10-01T00:00:00Z" }));
  // (17/10, DeadRoz) Une fiche qui porte une AUTRE annonce ne prouve rien de celle du job (identifiantAnnonceJob).
  ok("B6 : le job nomme SON annonce, la fiche porte la même → libérée", republicationLibereeApresArret({ ...b6, platform_fields: { ...b6.platform_fields, vinted_item_id: "5812" } }, fiche));
  ok("⛔ B6 : la fiche porte une AUTRE annonce que celle du job → pas de preuve, « Arrêtée » reste",
    !republicationLibereeApresArret({ ...b6, platform_fields: { ...b6.platform_fields, vinted_item_id: "9362353208" } }, fiche));
  const veilleur = J({ id: "42806ebc", action: "republish", status: "cancelled", error: "Cette republication attendait une réponse depuis plusieurs jours : nous l'avons arrêtée. Elle n'a rien retiré sur Vinted. Relance-la depuis la fiche de l'article quand tu veux.", platform_fields: { republish_step: "a_capturer", needs_user_tick_le: "2026-10-22T10:00:00Z" } });
  ok("B6 veilleur de 72 h, rien touché (a_capturer) : libérée, comme un arrêt demandé", republicationLibereeApresArret(veilleur, null));
  ok("⛔ arrêtée APRÈS le retrait (étape deleted) : jamais libérée (« Hors ligne — arrêtée » reste)", !republicationLibereeApresArret({ ...b6, platform_fields: { republish_step: "deleted", deleted_at: "2026-08-10T09:06:00Z" } }, fiche));
  ok("⛔ étape inconnue, suppression envoyée : jamais libérée", !republicationLibereeApresArret({ ...b6, platform_fields: { republish_step: "bizarre" } }, fiche)
    && !republicationLibereeApresArret({ ...veilleur, error: "Suppression envoyée à Vinted, recréation en attente" }, fiche));
  // N1 — 7373c96c : 404 à la capture le 17/10, les relevés ne revoient pas la fiche ; 38e12adb : revue en ligne après.
  const n1 = J({ id: "7373c96c", action: "republish", status: "cancelled", created_at: "2026-10-17T07:00:00Z", platform_fields: { republish_step: "a_capturer", introuvable_404: { at: "2026-10-17T07:02:00Z", etape: "capture", verdict: "disparue" } } });
  ok("N1 « Plus en ligne » sans relevé postérieur au verdict : reste (la question « vendue ou retirée ? » est vraie)", !republicationLibereeApresArret(n1, { ...fiche, last_synced_at: "2026-10-16T20:00:00Z" }));
  ok("N1 38e12adb : fiche revue en ligne APRÈS le verdict → libérée", republicationLibereeApresArret(n1, { ...fiche, last_synced_at: "2026-10-24T18:00:00Z" }));
  ok("une publication n'est jamais concernée", !republicationLibereeApresArret({ ...b6, action: "publish" }, fiche));
}

console.log("\n[2] La pastille de l'onglet : la règle de « À régler »");
{
  const enStock = new Set(["1", "2", "3"]);
  const vendu = J({ id: "260e0730", inventaire_id: 99, platform: "ebay", status: "needs_user", error: "Ton compte eBay est bien relié, mais eBay ne le laisse pas encore vendre.", platform_fields: {} });
  const retraitDepop = J({ id: "a8a3e2ae", inventaire_id: 98, action: "delete", platform: "depop", status: "needs_user", error: "Depop attend ton autorisation dans l'extension pour retirer l'annonce.", platform_fields: { needs_user_source: "depop_acces" } });
  const ids = articlesARegler([b1Releve, b1Ecartee, b2FauxMur, vendu, aVendeurDepop, aConnexionBeebs, retraitDepop], { enStock });
  ok("B1 et B2 (attentes automatiques) ne comptent plus", !ids.has("1"), [...ids].join(","));
  ok("B4 : la publication d'un article VENDU ne compte plus", !ids.has("99"));
  ok("⛔ A : vendeur Depop, connexion Beebs comptent toujours", ids.has("2") && ids.has("3"));
  ok("⛔ A : le retrait d'un article vendu qui attend la personne compte toujours (fiche hors stock)", ids.has("98"));
  ok("total : 3 articles (avant : 6, chaque needs_user)", ids.size === 3, String(ids.size));
  const lbc = J({ id: "lbc", inventaire_id: 1, platform: "leboncoin", status: "needs_user", error: "Leboncoin demande : Poids", platform_fields: {} });
  ok("Leboncoin fermé à ce compte (hors de France) : hors jeu, ne compte pas",
    !articlesARegler([lbc], { enStock, plateformesHorsJeu: plateformesHorsJeu({ plateformesFermees: ["leboncoin"] }) }).has("1")
    && articlesARegler([lbc], { enStock, plateformesHorsJeu: plateformesHorsJeu({}) }).has("1"));
  ok("Opla : hors jeu tant qu'elle n'est pas ouverte", plateformesHorsJeu({}).has("opla") && !plateformesHorsJeu({ plateformesOuvertes: ["opla"] }).has("opla"));
  ok("un dépôt « en cours de confirmation » chez la plateforme ne compte pas",
    causeARegler(J({ status: "needs_user", platform_fields: { last_diagnostic: { quoi: "vinted_depot_incertain" } } })) === null);
}

console.log("\n[2 bis] L'index du Stock : filtre « État », pastille « à traiter », vue « À régler »");
{
  const item = (id) => ({ id, statut: "stock", photos: [], vinted_item_id: null });
  const parArticle = {
    1: [{ ...b1Releve, inventaire_id: 1 }],
    2: [aVendeurDepop],
    4: [J({ id: "f4", inventaire_id: 4, platform: "beebs", status: "failed", created_at: "2026-10-01T10:00:00Z", error: "La publication n'a pas abouti." }),
      J({ id: "c4", inventaire_id: 4, platform: "beebs", status: "cancelled", created_at: "2026-10-02T10:00:00Z", error: messageAbandon("Beebs"), platform_fields: { abandon_utilisateur: { le: "x" } } })],
    5: [J({ id: "r5", inventaire_id: 5, action: "republish", status: "failed", platform_fields: { republish_step: "captured" } })],
    6: [J({ id: "f6", inventaire_id: 6, platform: "leboncoin", status: "failed", error: "Leboncoin a refusé cette annonce : refusée par sa modération." })],
  };
  const items = [1, 2, 4, 5, 6].map(item);
  const brut = indexEtatStock(items, parArticle, "fr");
  ok("précondition : l'index brut (stockFiltres) compte B1, l'échec annulé, la republication arrêtée avant retrait",
    brut.get("1").aCompleter.length === 1 && brut.get("4").enEchec.length === 1 && brut.get("5").enEchec.length === 1);
  const index = indexSelonARegler(indexEtatStock(items, parArticle, "fr"), parArticle, { plateformesHorsJeu: plateformesHorsJeu({}) });
  const c = compteursStock(items, index);
  ok("filtre « État » : « À compléter » 1 (vendeur Depop), « En échec » 1 (le refus de Leboncoin) — avant 2 et 3",
    c.aCompleter === 1 && c.enEchec === 1 && compteursStock(items, brut).aCompleter === 2 && compteursStock(items, brut).enEchec === 3, JSON.stringify(c));
  ok("la carte de B1 ne porte plus de pastille « à compléter »", pastillesEtat(index.get("1"), "fr").length === 0 && pastillesEtat(brut.get("1"), "fr").length === 1);
  ok("⛔ A : le vendeur Depop et le vrai refus gardent leur pastille", pastillesEtat(index.get("2"), "fr").length === 1 && pastillesEtat(index.get("6"), "fr").length === 1);
  ok("Leboncoin hors jeu (adresse hors de France) : son échec ne compte plus",
    compteursStock(items, indexSelonARegler(indexEtatStock(items, parArticle, "fr"), parArticle, { plateformesHorsJeu: plateformesHorsJeu({ plateformesFermees: ["leboncoin"] }) })).enEchec === 0);
}

console.log("\n[3] Le suivi du lot et sa ligne (Marta, B7)");
{
  // Marta (ac19c8c9…, Rapallo 16035) : lot 0f5a563f lancé à 12:08, 38 publications Leboncoin closes « hors de France ».
  const lot2 = { id: "0f5a563f-74e9-4fd2-a8f5-4c4e7e7a0e01", le: "2026-10-25T11:08:15Z" };
  const jobsParArticle = {};
  for (let k = 0; k < 38; k++) {
    const avant = J({ id: `m${k}`, inventaire_id: 1792826988751000 + k, platform: "leboncoin", status: "pending", created_at: "2026-10-25T11:09:00Z", platform_fields: { lot_publication: lot2 } });
    jobsParArticle[avant.inventaire_id] = [{ ...avant, ...clotureLbcHorsFrance(avant, { par: "get-pending-jobs", code: "16035", maintenant: Date.parse("2026-10-25T11:11:13Z"), archiver: archiverErreur }) }];
  }
  const clos = Object.values(jobsParArticle).flat();
  ok("précondition : 38 clôtures, message vrai, jamais « à ta demande »", clos.length === 38 && clos.every((j) => j.status === "cancelled" && j.error === MESSAGE_LBC_HORS_FRANCE && !arreteeParLaPersonne(j)));
  const midi = Date.parse("2026-10-25T13:00:00Z");
  ok("Marta : plus de ligne « Ton lot · 0 annonce en ligne sur 38 » (lot fait seulement de clôtures)", lotLePlusRecent(jobsParArticle, midi) === null);
  ok("les clôtures sortent du suivi de l'app (jobsDuSuivi)", jobsDuSuivi(clos).length === 0 && clos.every(clotureDeNosRegles));
  ok("suiviDuLot appelé seul garde le groupe neutre « réservé à la France » (contrat de lbc-adresse-france)", suiviDuLot([clos[0]]).lignes[0]?.groupe === "hors_france");
  // Un lot mixte : Vinted en ligne + Leboncoin clos → « 1 en ligne sur 1 », jamais « 1 sur 2 ».
  const vinted = J({ id: "v", inventaire_id: clos[0].inventaire_id, status: "published", listing_url: "https://www.vinted.fr/items/1", created_at: "2026-10-25T11:09:00Z", platform_fields: { lot_publication: lot2 } });
  const mixte = lotLePlusRecent({ [vinted.inventaire_id]: [vinted, clos[0]] }, midi);
  ok("lot mixte : Leboncoin ne compte plus (1 annonce en ligne sur 1)", mixte?.suivi.annonces === 1 && mixte.suivi.annoncesEnLigne === 1, JSON.stringify(mixte?.suivi?.compte));
  // Le lot d'avant, vrai, reprend la ligne quand le plus récent n'est fait que de clôtures.
  const lot1 = { id: "lot-matin", le: "2026-10-25T10:30:00Z" };
  const geste = J({ id: "g", inventaire_id: 7, platform: "beebs", status: "needs_user", error: "Connexion Beebs requise : connecte-toi à Beebs dans Chrome, sur ton ordinateur.", created_at: "2026-10-25T10:31:00Z", platform_fields: { needs_user_source: "connexion", lot_publication: lot1 } });
  const suite = lotLePlusRecent({ ...jobsParArticle, 7: [geste] }, midi);
  ok("le lot précédent (qui attend un vrai geste) reprend la ligne", suite?.id === "lot-matin" && suite.suivi.compte.geste === 1);

  // B7 — 2f9133ff : abandon de Beebs par la personne ; a3f3cb73 : veilleur de 72 h sur une publication Depop.
  const abandon = J({ id: "2f9133ff", inventaire_id: 11, platform: "beebs", status: "cancelled", error: messageAbandon("Beebs"), platform_fields: { abandon_utilisateur: { le: "2026-10-20T10:00:00Z", depuis_statut: "needs_user", plateforme: "beebs" } } });
  const abandonSansMarque = J({ id: "130088e7", inventaire_id: 12, platform: "ebay", status: "cancelled", error: messageAbandon("eBay"), platform_fields: {} });
  const veilleurDepop = J({ id: "a3f3cb73", inventaire_id: 13, platform: "depop", status: "cancelled", error: "Cette publication attendait une réponse depuis plusieurs jours : nous l'avons arrêtée. Relance-la depuis la fiche de l'article quand tu veux.", platform_fields: {} });
  ok("B7 abandon : « arrêtée à ta demande » (vrai), jamais « pas partie »", etatJobLot(abandon) === "arretee" && etatJobLot(abandonSansMarque) === "arretee");
  ok("B7 veilleur de 72 h : hors du suivi (clos par nous), jamais « pas partie »", etatJobLot(veilleurDepop) === "hors_suivi" && clotureDeNosRegles(veilleurDepop));
  const s7 = suiviDuLot([abandon, abandonSansMarque, veilleurDepop]);
  ok("B7 : 0 « À toi de jouer · pas parties » dans le suivi", s7.compte.pas_parties === 0 && s7.compte.arretees === 2 && s7.annonces === 2, JSON.stringify(s7.compte));
  ok("B1 au lot : plateforme écartée hors du suivi, jamais « geste »", etatJobLot(b1Ecartee) === "hors_suivi");
  ok("une attente automatique qui repart seule (mise à jour de l'extension) : « en file », jamais « geste »",
    etatJobLot(J({ status: "needs_user", platform_fields: { needs_user_source: "build_min_requis" } })) === "file");
  ok("un dépôt « en cours de confirmation » : « en cours », jamais « geste »",
    etatJobLot(J({ status: "needs_user", platform_fields: { last_diagnostic: { quoi: "lbc_depot_incertain" } } })) === "en_cours");
  ok("⛔ A : une connexion attendue reste « À toi de jouer » au lot (needs_user et pending sur session fermée)",
    etatJobLot(aConnexionBeebs) === "geste"
    && etatJobLot(J({ status: "pending", error: "En attente de ta connexion à Beebs sur ton ordinateur.", platform_fields: { attente_session: true } })) === "geste");
  ok("⛔ un vrai échec reste « pas partie » (refus de modération : à trancher par Nico)", etatJobLot(J({ status: "failed", error: "Beebs a refusé cette annonce à sa vérification." })) === "pas_partie");
  ok("un dernier job clos ne ressuscite jamais un vieil échec de la même plateforme",
    jobsDuSuivi([J({ id: "old", inventaire_id: 5, platform: "depop", status: "failed", created_at: "2026-10-20T09:00:00Z" }), { ...veilleurDepop, inventaire_id: 5, created_at: "2026-10-23T09:00:00Z" }]).length === 0);
  ok("pisteJob : une attente automatique est « pause », un vrai mur reste « echec »", pisteJob(b1Releve).etat === "pause" && pisteJob(b1Ecartee).etat === "pause" && pisteJob(aConnexionBeebs).etat === "echec");
}

console.log("\n[4] La bannière de la modale de statut : le dernier job de chaque ligne");
{
  // La bannière lit derniersParLigne + causeARegler (StockTab, JobStatusModal).
  const banniere = (jobs) => {
    const d = derniersParLigne(jobs);
    return { aCompleter: d.filter((j) => causeARegler(j, { jobsDeLArticle: jobs }) === "completer").length, enEchec: d.filter((j) => causeARegler(j, { jobsDeLArticle: jobs }) === "echec").length };
  };
  const vieilEchec = J({ id: "e1", platform: "beebs", status: "failed", created_at: "2026-09-01T10:00:00Z", error: "La publication n'a pas abouti." });
  const reussite = J({ id: "e2", platform: "beebs", status: "published", created_at: "2026-09-02T10:00:00Z", listing_url: "https://www.beebs.app/fr/p/1" });
  ok("un vieil échec dépassé par une publication réussie : plus de « 1 est arrêtée »", banniere([vieilEchec, reussite]).enEchec === 0);
  ok("une attente automatique (« En pause ») : plus de « attend une information de ta part »", banniere([b1Releve]).aCompleter === 0);
  ok("un échec suivi d'une annulation de sa ligne : plus compté", banniere([vieilEchec, J({ id: "e3", platform: "beebs", status: "cancelled", created_at: "2026-09-03T10:00:00Z", platform_fields: { arret_utilisateur: "x" } })]).enEchec === 0);
  ok("⛔ un échec toujours actuel reste compté, un vrai mur aussi", banniere([vieilEchec]).enEchec === 1 && banniere([aConnexionVinted]).aCompleter === 1);
  ok("derniersParLigne : une ligne par plateforme × action", derniersParLigne([vieilEchec, reussite, b1Releve]).length === 2);
}

console.log("\n[5] Le « dernier job » de la carte voit les republications (B3)");
{
  // c3e07ca8 : publication Leboncoin en échec, puis republication Leboncoin publiée (l'article est en ligne).
  const enLigne = J({ id: "p0", platform: "leboncoin", status: "published", created_at: "2026-10-01T10:00:00Z", listing_url: "https://www.leboncoin.fr/ad/x/1" });
  const echec = J({ id: "c3e07ca8", platform: "leboncoin", status: "failed", created_at: "2026-10-10T10:00:00Z", error: "Leboncoin a refusé cette annonce : refusée par sa modération." });
  const repub = J({ id: "f44b5917", action: "republish", platform: "leboncoin", status: "published", created_at: "2026-10-20T10:00:00Z", platform_fields: { republish_step: "recreated" } });
  ok("B3 : l'échec dépassé par une republication réussie s'éteint", jobSupplante(echec, [enLigne, echec, repub]) && causeARegler(echec, { jobsDeLArticle: [enLigne, echec, repub] }) === null);
  ok("⛔ sans réussite postérieure, l'échec reste (A?, à trancher par Nico)", !jobSupplante(echec, [enLigne, echec]) && causeARegler(echec, { jobsDeLArticle: [enLigne, echec] }) === "echec");
  ok("une réussite sur une AUTRE plateforme ne dépasse rien", !jobSupplante(echec, [echec, { ...repub, platform: "vinted" }]));
  ok("une réussite ANTÉRIEURE ne dépasse rien", !jobSupplante(echec, [echec, { ...repub, created_at: "2026-10-05T10:00:00Z" }]));
  ok("jobReussi : publiée, vendue, republication recréée", jobReussi(enLigne) && jobReussi(repub) && !jobReussi(echec));
  ok("estLeDernierDeSaLigne : le plus récent de sa ligne seulement", estLeDernierDeSaLigne(echec, [enLigne, echec, repub]) && !estLeDernierDeSaLigne(enLigne, [enLigne, echec]));
  ok("une republication arrêtée AVANT tout retrait ne demande rien ; APRÈS le retrait, si (annonce hors ligne)",
    causeARegler(J({ action: "republish", status: "failed", platform_fields: { republish_step: "captured" } })) === null
    && causeARegler(J({ action: "republish", status: "failed", platform_fields: { republish_step: "deleted", deleted_at: "x" } })) === "echec");
}

console.log("\n[6] Réglages › Plateformes et câblage des écrans");
{
  // La liste que ReglagesPage passe à « Mes plateformes » et au compteur (sessions.total = sa longueur).
  const sessionsMarta = plateformesDeReleve([], false).filter((p) => !["leboncoin"].includes(p));
  ok("Marta : « comptes connectés x sur 3 » (Vinted, Beebs, eBay), plus « sur 4 » avec Leboncoin",
    sessionsMarta.length === 3 && !sessionsMarta.includes("leboncoin") && plateformesDeReleve([], false).length === 4, sessionsMarta.join(","));
  const reglages = lire("src/reglages/ReglagesPage.jsx");
  ok("ReglagesPage : plateformesSession sans les plateformes fermées (ligne et compteur « x sur N »)",
    /plateformesDeReleve\(plateformesOuvertes, oplaRelie\)\.filter\(\(p\) => !\(plateformesFermees \?\? \[\]\)\.includes\(p\)\)/.test(reglages)
    && /useSessionsPlateformes\(\{ userId: user\?\.id, plateformes: plateformesSession \}\)/.test(reglages)
    && /useVeritePlateformes\(\{ userId: user\?\.id, plateformes: plateformesSession \}\)/.test(reglages));
  const sp = lire("src/reglages/SousPagePlateformes.jsx");
  ok("SousPagePlateformes : plus de ligne grisée « réservé à la France »", /if \(pf === 'leboncoin' && c\.lbcHorsFrance\) return null;/.test(sp) && !/lbcHorsFrancePastille/.test(sp));
  const st = lire("src/tabs/StockTab.jsx");
  ok("StockTab : l'emplacement passe par pastilleRepublicationEnPause et republicationLibereeApresArret",
    /pastilleRepublicationEnPause\(job, fr \? 'fr' : 'en'\)/.test(st) && /if \(republicationLibereeApresArret\(job, item\)\) return null;/.test(st));
  ok("StockTab : « À régler », l'index (filtre, pastille « à traiter ») et la modale lisent la règle",
    (st.match(/causeARegler\(/g) ?? []).length >= 5 && /const derniers = derniersParLigne\(jobs\);/.test(st)
    && /indexSelonARegler\(indexEtatStock\(stockFiltre, jobsByInventaire, lang\), jobsByInventaire, \{ plateformesHorsJeu: horsJeu \}\)/.test(st));
  ok("StockTab : « À régler » lit la règle du job (causeARegler(j)), puis dépassé et hors jeu avec les jobs de la fiche",
    /const cause = causeARegler\(j\);/.test(st) && /if \(!attenteActionLue\) return null;/.test(st)
    && /causeARegler\(l\.job, \{ jobsDeLArticle: jobsByInventaire\[l\.job\.inventaire_id\] \?\? null, plateformesHorsJeu: horsJeu \}\)/.test(st));
  ok("StockTab : la carte éteint un échec dépassé (jobSupplante)", /const depasse=j=>jobSupplante\(j,jobsAll\)\|\|horsJeu\.has\(j\.platform\);/.test(st) && /needsUserTous=Object\.values\(latestByPlatform\)\.filter\(j=>j\.status==="needs_user"&&!depasse\(j\)\)/.test(st));
  ok("StockTab : « Régler » ne vise qu'une republication qui attend la personne", /!!repubAttendLaPersonne && stRepub === 'needs_user'/.test(st));
  ok("StockTab : la ligne du lot et son suivi sans les clôtures de nos règles",
    /const lotRecent = useMemo\(\(\) => lotLePlusRecent\(jobsByInventaire\), \[jobsByInventaire\]\);/.test(st) && /jobs=\{jobsDuSuivi\(/.test(st));
  const app = lire("src/App.jsx");
  ok("App : la pastille de l'onglet compte avec articlesARegler, fiches en stock, plateformes hors jeu",
    /articlesARegler\(jobsAttenteOnglet,\{enStock:new Set\(stock\.map\(i=>String\(i\.id\)\)\),plateformesHorsJeu:plateformesHorsJeu\(\{plateformesOuvertes,plateformesFermees\}\)\}\)\.size/.test(app)
    && app.indexOf("const plateformesFermees=useMemo(") < app.indexOf("const nbAComplete=useMemo(")
    && app.indexOf("const stock=useMemo(") < app.indexOf("const nbAComplete=useMemo("));
}

console.log(`\nerreurs-visibles : ${verts} contrôles verts, ${rouges.length} rouge(s)`);
if (rouges.length) {
  for (const r of rouges) console.log(`  ROUGE : ${r}`);
  process.exit(1);
}
