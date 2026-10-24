// Selftest — les écrans de la bêta « messages + bordereaux » (16/10/2026).
//   npm run selftest:messagerie-app
//
// Ce qu'il garantit :
//   a. rien pour le parc : la barre, l'espace « Messages · À expédier », la
//      section « À expédier » des Ventes et l'indicateur de la carte ne se
//      rendent QUE pour un compte bêta ; hors bêta, une seule lecture puis
//      plus rien (la relecture s'arrête) ; jamais de setInterval ;
//   b. (16/10 soir) « Récupérer le bordereau » n'est ACTIF que bordereau PRÊT
//      chez la plateforme ; il dépose une demande (bordereau_demander) et rien
//      d'autre. (16/10 nuit, mission de Nico) « Générer le bordereau » (Vinted,
//      Leboncoin, Beebs) n'existe que génération ouverte et options relevées
//      générables ; un appui ouvre l'ÉCRAN DE CONFIRMATION (phrase de ce que le
//      geste engage), seul son second appui appelle bordereau_generer ; eBay
//      (payant, conditions d'eBay) et Depop restent des liens ;
//   b'. les murs des relevés (Beebs sans téléphone vérifié, session absente,
//      pause) sont dits en clair ; un 401 seul n'en est pas un ;
//   c. une réponse verrouillée le dit, une réponse en échec dit que rien n'est
//      parti ; (16/10 nuit) mode 2 = envoi actif SANS liste blanche, texte exact
//      (aucun trim), une clé d'envoi par brouillon, empreinte passée à la base ;
//   d. non lus : même règle que messagerie_compteurs (systèmes exclus, vue
//      dans FillSell après le dernier message = lue) ; tri et « À expédier » ;
//   e. eBay : normaliseurs serveur (messages groupés par annonce ×
//      interlocuteur, commandes sans adresse) ;
//   f. aucun émoji, jamais « pépites » ;
//   g. (17/10, constat de Nico sur iPhone) l'écran est une PAGE dans le
//      conteneur qui défile (jamais une couche fixe, aucun conteneur à hauteur
//      fixe), avec la flèche ← et son titre ; ouvrir crée une entrée
//      d'historique, le retour la défait, un appui sur un onglet ferme ; les
//      entrées vivent sur le Stock seul, en style neutre (seul le compteur est
//      coloré) ; vignette : photo de l'annonce, puis la fiche, puis une icône ;
//      toute couche de la bêta passe par Couche (portail sur body, barre du bas
//      masquée).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourcesVignette, suiviCommande, expedieesRecentes, conversationNonLue, trierConversations, etatReponse, actionCommande, commandesAExpedier, libelleEtatCommande, nomPlateforme, lienCommande, lienConversation, murReleve, delaiEnvoi, etatZoneReponse, etatDemandeBordereau, refusDemandeBordereau, pseudoAffiche, libelleTransporteur, attendGeneration, phraseEngagement, libelleTypeEtiquette, extensionCommandeVinted, GENERATION_VINTED_BUILD_MIN } from "../src/messagerie/vue.js";
import { conversationsEbay, commandesEbay, texteMessageEbay, etatCommandeEbay, suiviEbay } from "../supabase/functions/_shared/messagerie-ebay.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const cas = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
console.log("messagerie-app-selftest");

const APP = lire("src/App.jsx");
const STOCK = lire("src/tabs/StockTab.jsx");
const VENTES = lire("src/tabs/VentesTab.jsx");
const CARTE = lire("src/stock/Carte.jsx");
const HOOK = lire("src/messagerie/useMessagerieBeta.js");
const FICHIERS_UI = ["src/messagerie/EspaceMessagerie.jsx", "src/messagerie/SectionAExpedier.jsx", "src/messagerie/BarreMessagerie.jsx", "src/messagerie/vue.js", "src/messagerie/useMessagerieBeta.js", "src/messagerie/ouvrir.js", "src/messagerie/empreinte.js", "src/messagerie/useEcranMessagerie.js", "src/messagerie/Vignette.jsx", "src/messagerie/Couche.jsx"];

// ── a. Rien pour le parc ─────────────────────────────────────────────────────
await cas("App : la barre et l'espace ne se rendent que pour un compte bêta", () => {
  assert.ok(/\{messagerie\.beta&&tab===1&&!espaceMessagerie&&\(\s*<BarreMessagerie/.test(APP), "barre sous messagerie.beta, sur le Stock seul (17/10)");
  assert.ok(/className=\{messagerie\.beta&&espaceMessagerie\?"wrap page-pad fs-espace-beta-ouvert":"wrap page-pad"\}/.test(APP), "la classe de page n'est posée que pour un compte bêta qui a ouvert l'écran");
  assert.ok(/\{messagerie\.beta&&espaceMessagerie&&\(/.test(APP), "espace sous messagerie.beta");
  assert.ok(/messagerie=\{messagerie\.beta\?\{parArticle:messagerie\.parArticle,ouvrir:\(id\)=>setEspaceMessagerie\(\{onglet:'messages',article:id\}\)\}:null\}/.test(APP), "Stock : null hors bêta");
  assert.ok(/messagerieBeta=\{messagerie\.beta\}/.test(APP), "Ventes : booléen bêta");
  assert.ok(/lazyMessagerie\(\(\) => import\('\.\/messagerie\/EspaceMessagerie'\)\)/.test(APP), "espace chargé à la demande");
});

await cas("Stock et Ventes : indicateur et section derrière le drapeau", () => {
  assert.ok(/messages=\{messagerie \? \(Number\(messagerie\.parArticle\?\.\[item\.id\]\) \|\| 0\) : null\}/.test(STOCK));
  assert.ok(/\{p\.messages > 0 && \(/.test(CARTE), "la carte n'affiche rien à 0 ni à null");
  assert.ok(/\(p\.marque \|\| p\.vues != null \|\| p\.favoris != null \|\| p\.boutique \|\| p\.messages > 0\)/.test(CARTE));
  assert.ok(/\{messagerieBeta&&<SectionAExpedier /.test(VENTES));
  assert.ok(/messagerieBeta=false,/.test(VENTES), "défaut fermé");
});

await cas("le drapeau : une lecture hors bêta puis la relecture s'arrête ; jamais de setInterval", () => {
  assert.ok(/data\.beta !== true\) \{\s*setEtat\(\{ \.\.\.VIDE, pret: true, user: userId \}\);\s*relecture\.current\?\.arreter\(\);/.test(HOOK));
  assert.ok(/demarrerRelecture\(lire, \{ intervalleMs: 120_000/.test(HOOK));
  for (const f of FICHIERS_UI) assert.ok(!/setInterval\s*\(/.test(lire(f)), f);
});

// ── b. Le bouton « Bordereau » et les gestes qui engagent ────────────────────
await cas("« Récupérer » ACTIF bordereau prêt (Vinted, Leboncoin, Beebs) ; « Générer » dans FillSell dès que la commande attend le geste ; (17/10) la plateforme seulement en dernier recours", () => {
  const actifs = [
    { platform: "vinted", etat: "a_expedier", bordereau: "pret", commande_ref: "9001", conversation_ref: "501" },
    { platform: "leboncoin", etat: "a_expedier", bordereau: "pret", commande_ref: "777" },
    { platform: "beebs", etat: "a_expedier", bordereau: "pret", commande_ref: "ord-1" },
  ];
  for (const c of actifs) assert.equal(actionCommande(c).type, "bordereau", JSON.stringify(c));
  const aGenerer = [
    { platform: "vinted", etat: "a_expedier", bordereau: "a_obtenir", conversation_ref: "501", options_bordereau: { generable: true, types_etiquette: [1, 3] } },
    { platform: "leboncoin", etat: "a_confirmer", bordereau: "a_generer", commande_ref: "777", options_bordereau: { generable: true, type_envoi: "shop2shop" } },
    { platform: "beebs", etat: "a_confirmer", bordereau: "a_generer", commande_ref: "ord-1", options_bordereau: { generable: true } },
  ];
  for (const c of aGenerer) {
    assert.equal(attendGeneration(c), true);
    // (17/10) Génération FERMÉE par le serveur : jamais le geste, jamais un renvoi — l'attente est dite.
    const ferme = actionCommande(c, "fr", false);
    assert.equal(ferme.type, "attente", "génération fermée : ni le geste, ni un renvoi vers la plateforme");
    // Réglages pas encore lus (null) : le bouton reste (la base refuse si c'est fermé).
    assert.equal(actionCommande(c, "fr", null).type, "generer", "réglages pas encore lus : le bouton reste (cause de « c'est toi qui le fais »)");
    const a = actionCommande(c, "fr", true);
    assert.equal(a.type, "generer", JSON.stringify(c));
    assert.equal(a.phrase, phraseEngagement(c.platform, "fr"));
    assert.ok(a.phrase.length >= 10 && a.phrase.length <= 400, "phrase gardée en base (10 à 400)");
  }
  assert.deepEqual(actionCommande(aGenerer[0], "fr", true).types, [1, 3], "Vinted : les types proposés, à choisir");
  // (17/10) Vinted, options pas encore relues : le bouton reste, papier ou QR au choix (l'extension vérifie juste avant).
  const sansOptions = actionCommande({ platform: "vinted", etat: "a_expedier", bordereau: "a_obtenir" }, "fr", true);
  assert.equal(sansOptions.type, "generer");
  assert.deepEqual(sansOptions.types, [1, 3]);
  assert.equal(sansOptions.typesSupposes, true);
  // (17/10) Leboncoin Colissimo / courrier suivi : dans FillSell, avec l'adresse de l'expéditeur.
  for (const t of ["colissimo", "courrier_suivi"]) {
    const a = actionCommande({ platform: "leboncoin", etat: "a_confirmer", bordereau: "a_generer", commande_ref: "8", options_bordereau: { generable: true, type_envoi: t, adresse_requise: true } }, "fr", true);
    assert.equal(a.type, "generer", t); assert.equal(a.adresse, true, t);
    assert.equal(a.phrase, phraseEngagement("leboncoin", "fr", "adresse"));
    assert.ok(a.phrase.includes("adresse de ton compte Leboncoin") && a.phrase.length <= 400);
  }
  assert.ok(phraseEngagement("beebs").includes("débite l’acheteur"), "Beebs : accepter = débiter l'acheteur (dit en une phrase)");
  assert.ok(phraseEngagement("vinted").includes("engage"));
  assert.ok(phraseEngagement("leboncoin").includes("valide la vente"));
  assert.equal(phraseEngagement("ebay"), null, "eBay : aucune génération");
  assert.equal(libelleTypeEtiquette(3), "Code QR à montrer au point relais (sans impression)");
  // Ce que FillSell ne fait PAS (et dit pourquoi) : le seul cas d'un lien.
  const nonGenerables = [
    [{ platform: "vinted", etat: "a_expedier", bordereau: "a_obtenir", options_bordereau: { generable: false, domicile_seul: true } }, "enlèvement à domicile"],
    [{ platform: "leboncoin", etat: "a_confirmer", bordereau: "a_generer", commande_ref: "8", options_bordereau: { generable: false, type_envoi: "custom_shipping" } }, "rien à générer"],
    [{ platform: "beebs", etat: "a_confirmer", bordereau: "a_generer", commande_ref: "o", options_bordereau: { generable: false } }, "Remise en main propre"],
  ];
  for (const [c, attendu] of nonGenerables) {
    const a = actionCommande(c, "fr", true);
    assert.equal(a.type, "lien", JSON.stringify(c));
    assert.ok(a.aide.includes(attendu), a.aide);
  }
  const liens = [
    { platform: "vinted", etat: "a_expedier", bordereau: "indisponible" },
    { platform: "ebay", etat: "a_expedier", bordereau: "a_obtenir", commande_ref: "12-345" },
    { platform: "depop", etat: "a_expedier", bordereau: "sans_objet", commande_ref: "77" },
  ];
  for (const c of liens) {
    const a = actionCommande(c, "fr", true);
    assert.equal(a.type, "lien", JSON.stringify(c));
    assert.ok(/^https:\/\//.test(a.url), a.url);
    assert.ok(a.aide.length > 10);
  }
  // (17/10) Ce qui se prépare chez la plateforme : FillSell le guette, rien à faire, aucun bouton qui renvoie.
  const attentes = [
    { platform: "leboncoin", etat: "a_expedier", bordereau: "a_obtenir", commande_ref: "777" },
    { platform: "beebs", etat: "a_expedier", bordereau: "a_obtenir", commande_ref: "o" },
    { platform: "vinted", etat: "inconnu", bordereau: "inconnu" },
  ];
  for (const c of attentes) {
    const a = actionCommande(c, "fr", true);
    assert.equal(a.type, "attente", JSON.stringify(c));
    assert.ok(/^https:\/\//.test(a.url) && a.aide.length > 10);
  }
  assert.equal(actionCommande(liens[1], "fr", true).libelle, "Acheter l’étiquette sur eBay", "eBay : le lien ne sert qu'à l'achat");
  assert.ok(actionCommande(liens[1], "fr", true).aide.includes("seul geste à faire sur eBay"));
  assert.ok(actionCommande(liens[1], "fr", true).aide.includes("n’en rachète pas une seconde"));
  assert.ok(actionCommande(liens[2], "fr", true).aide.includes("pas de bordereau"));
});

await cas("liens des plateformes (relevés le 16/10) ; l'app ne crée une demande QUE dans le geste de clic", () => {
  assert.equal(lienCommande({ platform: "vinted", conversation_ref: "501" }), "https://www.vinted.fr/inbox/501");
  assert.equal(lienCommande({ platform: "vinted" }), "https://www.vinted.fr/my_orders");
  assert.equal(lienCommande({ platform: "leboncoin", commande_ref: "777" }), "https://www.leboncoin.fr/compte/part/transaction/777");
  assert.equal(lienCommande({ platform: "beebs", commande_ref: "ord-1" }), "https://www.beebs.app/fr/account/orders/ord-1");
  assert.equal(lienCommande({ platform: "ebay", commande_ref: "12-345" }), "https://www.ebay.fr/sh/ord/details?orderid=12-345");
  assert.equal(lienCommande({ platform: "depop" }), "https://www.depop.com/sellinghub/sold-items/");
  assert.equal(lienConversation({ platform: "beebs", conversation_ref: "3HESx" }), "https://www.beebs.app/fr/account/chats/3HESx");
  const section = lire("src/messagerie/SectionAExpedier.jsx");
  const appels = [...section.matchAll(/rpc\('bordereau_demander'/g)];
  assert.equal(appels.length, 1, "un seul appel");
  const fn = section.slice(section.indexOf("const demanderBordereau = async (c) =>"));
  assert.ok(fn.indexOf("rpc('bordereau_demander'") > 0, "dans le geste « demanderBordereau »");
  assert.ok(/onClick=\{\(\) => demanderBordereau\(c\)\}/.test(section), "branché sur le clic seulement");
  for (const f of ["src/App.jsx", "src/messagerie/EspaceMessagerie.jsx", "src/messagerie/useMessagerieBeta.js"]) {
    assert.ok(!/bordereau_demander|bordereau_generer/.test(lire(f)), "aucune demande depuis " + f);
  }
  // (16/10 nuit) La génération : UN appel, dans confirmerGeneration, appelé SEULEMENT par le « Confirmer »
  // de l'écran de confirmation ; le bouton « Générer » ne fait qu'ouvrir cet écran.
  assert.equal([...section.matchAll(/rpc\('bordereau_generer'/g)].length, 1, "un seul appel à bordereau_generer");
  const conf = section.slice(section.indexOf("const confirmerGeneration = async (c, choix, phrase) =>"));
  assert.ok(conf.indexOf("rpc('bordereau_generer', { p_commande: c.id, p_choix: choix ?? {}, p_engagement: phrase })") > 0, "la phrase affichée part avec la demande");
  assert.equal([...section.matchAll(/confirmerGeneration\(/g)].length, 1, "appelée à un seul endroit");
  assert.equal([...section.matchAll(/const confirmerGeneration = /g)].length, 1, "définie une fois");
  assert.ok(/onConfirmer=\{\(choix, phrase\) => confirmerGeneration\(confirmation\.commande, choix, phrase\)\}/.test(section), "seul « Confirmer » de l'écran l'appelle");
  assert.ok(/onClick=\{\(\) => setConfirmation\(\{ commande: c, action \}\)\}/.test(section), "« Générer » ouvre l'écran, rien d'autre");
  assert.ok(/\{action\.phrase\}/.test(section), "la phrase est AFFICHÉE dans l'écran");
  assert.ok(/generationNee/.test(section), "une génération née : plus jamais le bouton");
  // La copie privée : adresse signée 10 min (module d'impression).
  // La copie privée : lue par la session (download), ouverte ailleurs par une adresse signée 10 min.
  assert.ok(/storage\.from\('bordereaux'\)\.download\(copie\.chemin\)/.test(lire("src/messagerie/impression/copies.js")), "copie privée lue par la session");
  assert.ok(/createSignedUrl\(cible, 600/.test(lire("src/messagerie/impression/partage.js")), "adresse signée 10 min");
});

await cas("demandes de bordereau : chaque état dit quoi faire ; refus en clair", () => {
  assert.equal(etatDemandeBordereau({ statut: "demandee" }).attente, true);
  assert.ok(etatDemandeBordereau({ statut: "demandee" }).texte.includes("ordinateur"));
  assert.ok(etatDemandeBordereau({ statut: "expiree" }).texte.includes("Réessaie ici") && etatDemandeBordereau({ statut: "expiree" }).texte.includes("rien n’a été fait"), "(17/10) on réessaie dans FillSell");
  assert.ok(etatDemandeBordereau({ statut: "echec", motif: "http_403" }).texte.includes("rien n’a été fait"));
  // (17/10, migration 20261017100000) la demande attend l'ordinateur 24 h ; le geste relit la commande juste avant.
  assert.ok(etatDemandeBordereau({ statut: "demandee" }).texte.includes("24 h au plus") && etatDemandeBordereau({ statut: "expiree" }).texte.includes("dans les 24 h"));
  assert.ok(etatDemandeBordereau({ action: "generer", statut: "demandee" }, "fr", "leboncoin").texte.includes("annulée ou déjà traitée entre-temps, rien n’est fait"));
  assert.ok(etatDemandeBordereau({ action: "generer", statut: "echec", motif: "commande_annulee" }, "fr", "vinted").texte.includes("annulée sur Vinted : rien n’a été fait"));
  assert.ok(!/à temps|30 min/.test(JSON.stringify(["demandee", "expiree"].flatMap((s) => [etatDemandeBordereau({ statut: s }), etatDemandeBordereau({ action: "generer", statut: s })]))), "plus aucun « à temps » ni « 30 min »");
  assert.equal(etatDemandeBordereau(null), null);
  assert.ok(refusDemandeBordereau("pas_pret").includes("prêt"));
  assert.ok(refusDemandeBordereau("plafond_jour").includes("20"));
  // (16/10 nuit) La génération : chaque état dit où on en est ; incertaine = vérifier, jamais refait.
  const gen = (statut, motif = null, extra = {}) => etatDemandeBordereau({ action: "generer", statut, motif, ...extra }, "fr", "vinted");
  assert.equal(gen("demandee").attente, true);
  assert.equal(gen("generee", "geste_fait").attente, true);
  // (18/10) Le geste est parti : la plateforme crée l'étiquette — jamais « généré » avant elle.
  assert.ok(gen("generee", "geste_fait").texte.includes("FillSell récupère le fichier") && !gen("generee", "geste_fait").texte.includes("généré"));
  // (18/10) Vinted a refusé (210) ; extension d'avant : la vraie raison et le seul geste, sur Vinted.
  assert.ok(gen("echec", "etiquette_echouee_chez_vinted").texte.includes("Redemande-la sur Vinted"));
  assert.ok(gen("echec", "extension_a_mettre_a_jour").texte.includes("rien n’a été commandé"));
  assert.equal(gen("generee", "fichier_pas_encore_pret", { essais_fichier: 15 }).attente, false);
  assert.ok(etatDemandeBordereau({ action: "generer", statut: "generee", motif: "fichier_sur_beebs" }, "fr", "beebs").texte.includes("FillSell le cherche à chaque passage"), "(17/10) le fichier Beebs : FillSell continue de le chercher");
  assert.ok(gen("incertaine").texte.includes("ne la refera jamais"));
  assert.ok(gen("echec", "adresse_vinted_incomplete").texte.includes("adresse"));
  assert.ok(gen("echec", "http_403").texte.includes("rien n’a été fait"));
  assert.ok(gen("echec", "inconnu_xyz").texte.includes("rien n’a été fait"));
  assert.ok(refusDemandeBordereau("pas_a_generer").length > 10);
});

await cas("murs des relevés : Beebs sans téléphone vérifié, session absente, pause ; un 401 seul n'en est pas un", () => {
  const beebs = murReleve({ platform: "beebs", dernier_motif: "telephone_non_verifie" });
  assert.equal(beebs.titre, "Vérifie ton numéro sur Beebs");
  assert.ok(beebs.action.url.includes("beebs.app"));
  assert.ok(murReleve({ platform: "leboncoin", dernier_motif: "jeton_absent" }).titre.includes("Connecte-toi à Leboncoin"));
  const p = murReleve({ platform: "vinted", dernier_motif: "http_429", pause_jusqu_au: new Date(Date.now() + 3600e3).toISOString() });
  assert.ok(p.titre.includes("pause de sécurité"));
  assert.equal(murReleve({ platform: "vinted", dernier_motif: "http_401" }), null, "jeton expiré, renouvelé par la page");
  assert.equal(murReleve({ platform: "vinted", dernier_motif: null }), null);
  assert.equal(murReleve({ platform: "depop", dernier_motif: "onglet_indisponible" }), null, "incident passager : rien à dire");
  assert.ok(murReleve({ platform: "ebay", dernier_motif: "jeton_revoque" }).titre.includes("eBay"));
});

await cas("zone de réponse : mode 2 actif SANS liste blanche ; mode 1 verrouillée hors liste blanche ; mode 0 coupée ; fermée pour un message de la plateforme", () => {
  const v = etatZoneReponse({ platform: "vinted" }, false);
  assert.equal(v.possible, true); assert.equal(v.verrouillee, true); assert.ok(v.texte.includes("liste blanche"), "mode absent = liste blanche (fonctionnement d'avant)");
  const a = etatZoneReponse({ platform: "beebs" }, true);
  assert.equal(a.verrouillee, false); assert.ok(a.texte.includes("une seule fois"));
  const ouvert = etatZoneReponse({ platform: "vinted" }, false, "fr", 2);
  assert.equal(ouvert.verrouillee, false); assert.ok(ouvert.texte.includes("telle que tu l’écris") && ouvert.texte.includes("une seule fois"));
  const coupe = etatZoneReponse({ platform: "vinted" }, true, "fr", 0);
  assert.equal(coupe.verrouillee, true);
  // L'écran : texte exact (aucun trim), une clé par brouillon gardée jusqu'à la confirmation, empreinte passée.
  const espace = lire("src/messagerie/EspaceMessagerie.jsx");
  const rep = espace.slice(espace.indexOf("const repondre = async () =>"), espace.indexOf("const tz = TONS[zone.ton]"));
  assert.ok(/const exact = texte;/.test(rep), "le texte part tel quel");
  assert.ok(!/texte\.trim\(\)/.test(rep), "aucun trim du texte envoyé");
  assert.ok(/p_texte: exact/.test(rep) && /p_cle: cleBrouillon\.current/.test(rep), "clé du brouillon");
  assert.ok(rep.indexOf("cleBrouillon.current = null;") > rep.indexOf("if (error)"), "la clé n'est oubliée qu'après la confirmation de la base");
  assert.ok(/p_empreinte: empreinte/.test(rep), "empreinte SHA-256 passée à la base");
  assert.equal(etatZoneReponse({ platform: "depop", systeme: true }, true).possible, false);
  assert.equal(etatZoneReponse({ platform: "leboncoin", reponse_possible: false }, true).possible, false);
});

await cas("pseudos (@ seulement là où la plateforme a des pseudos) et transporteurs en clair", () => {
  assert.equal(pseudoAffiche("vinted", "acheteuse_a"), "@acheteuse_a");
  assert.equal(pseudoAffiche("ebay", "acheteur_e"), "@acheteur_e");
  assert.equal(pseudoAffiche("leboncoin", "Marc"), "Marc");
  assert.equal(pseudoAffiche("beebs", "Julie D."), "Julie D.");
  assert.equal(pseudoAffiche("vinted", "  "), null);
  assert.equal(libelleTransporteur("mondial_relay"), "Mondial Relay");
  assert.equal(libelleTransporteur("shop2shop"), "Shop2Shop");
  assert.equal(libelleTransporteur("FR_ColiposteColissimo"), "Colissimo");
  assert.equal(libelleTransporteur("FR_ColiposteLettreSuivie"), "Coliposte lettre suivie");
  assert.equal(libelleTransporteur(null), null);
});

await cas("date limite : texte et urgence (< 48 h)", () => {
  const maintenant = Date.parse("2026-10-16T12:00:00Z");
  assert.equal(delaiEnvoi({ a_expedier_avant: "2026-10-17T10:00:00Z" }, "fr", maintenant).urgent, true);
  assert.equal(delaiEnvoi({ a_expedier_avant: "2026-10-22T10:00:00Z" }, "fr", maintenant).urgent, false);
  assert.ok(delaiEnvoi({ a_expedier_avant: "2026-10-22T10:00:00Z" }, "fr", maintenant).texte.startsWith("À déposer avant le 22/10"));
  assert.equal(delaiEnvoi({ a_expedier_avant: "2026-10-15T10:00:00Z" }, "fr", maintenant).depasse, true);
  assert.equal(delaiEnvoi({}, "fr", maintenant), null);
});

// ── c. Les réponses ──────────────────────────────────────────────────────────
await cas("réponses : verrouillée → « liste blanche », échec → « rien n'est parti »", () => {
  assert.ok(etatReponse({ statut: "verrouillee", motif: "liste_blanche" }).texte.includes("liste blanche"));
  assert.ok(etatReponse({ statut: "verrouillee", motif: "plafond_jour" }).texte.includes("20 réponses"));
  assert.ok(etatReponse({ statut: "echec" }).texte.includes("rien n’est parti"));
  assert.equal(etatReponse({ statut: "envoyee" }).ton, "ok");
  assert.ok(etatReponse({ statut: "echec", motif: "sans_confirmation" }).texte.includes("ne la renverra jamais"), "prise sans confirmation : jamais renvoyée");
  assert.ok(etatReponse({ statut: "echec", motif: "empreinte_differente" }).texte.includes("Rien n’est parti"));
  assert.ok(etatReponse({ statut: "verrouillee", motif: "envoi_ferme" }).texte.includes("Rien n’est parti"));
});

// ── d. Non lus, tri, À expédier ──────────────────────────────────────────────
await cas("non lus : systèmes exclus ; vue dans FillSell après le dernier message = lue", () => {
  assert.equal(conversationNonLue({ non_lus: 2, dernier_message_le: "2026-10-16T10:00:00Z" }), true);
  assert.equal(conversationNonLue({ non_lus: 2, systeme: true, dernier_message_le: "2026-10-16T10:00:00Z" }), false);
  assert.equal(conversationNonLue({ non_lus: 2, dernier_message_le: "2026-10-16T10:00:00Z", vu_dans_app_le: "2026-10-16T11:00:00Z" }), false);
  assert.equal(conversationNonLue({ non_lus: 2, dernier_message_le: "2026-10-16T12:00:00Z", vu_dans_app_le: "2026-10-16T11:00:00Z" }), true);
  assert.equal(conversationNonLue({ non_lus: 0 }), false);
  const t = trierConversations([
    { id: "a", non_lus: 0, dernier_message_le: "2026-10-16T12:00:00Z" },
    { id: "b", non_lus: 1, dernier_message_le: "2026-10-15T12:00:00Z" },
    { id: "c", systeme: true, non_lus: 3, dernier_message_le: "2026-10-16T13:00:00Z" },
  ]);
  assert.deepEqual(t.map((x) => x.id), ["b", "a", "c"]);
});

await cas("À expédier : à confirmer d'abord, puis la date limite la plus proche, puis les états à vérifier ; rien d'autre", () => {
  const l = commandesAExpedier([
    { id: 1, etat: "a_expedier", vendue_le: "2026-10-15T10:00:00Z" },
    { id: 2, etat: "livree" },
    { id: 3, etat: "a_confirmer", vendue_le: "2026-10-16T10:00:00Z" },
    { id: 4, etat: "a_expedier", vendue_le: "2026-10-14T10:00:00Z" },
    { id: 5, etat: "inconnu", vendue_le: "2026-10-13T10:00:00Z" },
    { id: 6, etat: "expediee" },
  ]);
  assert.deepEqual(l.map((c) => c.id), [3, 4, 1, 5]);
  assert.equal(libelleEtatCommande("a_confirmer", "fr", "leboncoin"), "Disponibilité à confirmer");
  assert.equal(libelleEtatCommande("a_confirmer", "fr", "beebs"), "Commande à accepter");
  assert.equal(libelleEtatCommande("inconnu"), "État à vérifier");
  assert.equal(nomPlateforme("leboncoin"), "Leboncoin");
});

// ── e. eBay (serveur) ────────────────────────────────────────────────────────
await cas("eBay : messages groupés par annonce × interlocuteur ; messages d'eBay = système ; 30 jours", () => {
  const maintenant = Date.parse("2026-10-16T12:00:00Z");
  const r = conversationsEbay([
    { message_id: "1", external_id: "x1", sender: "acheteur1", folder_id: "0", item_id: "123", item_title: "Montre", receive_date: "2026-10-15T10:00:00Z", read: false, message_type: "AskSellerQuestion", response_enabled: true, texte: "Dispo ?" },
    { message_id: "2", external_id: "x2", sender: null, recipient: "acheteur1", folder_id: "1", item_id: "123", receive_date: "2026-10-15T11:00:00Z", read: true, message_type: "ResponseToASQQuestion", texte: "Oui" },
    { message_id: "3", sender: "eBay", folder_id: "0", subject: "Avis", receive_date: "2026-10-14T10:00:00Z", read: false, message_type: "eBayMessage" },
    { message_id: "4", sender: "acheteur2", folder_id: "0", item_id: "9", receive_date: "2026-08-01T10:00:00Z", read: false },
  ], maintenant);
  assert.equal(r.conversations.length, 2);
  const c = r.conversations.find((x) => x.ref === "123:acheteur1");
  assert.equal(c.non_lus, 1);
  assert.equal(c.cote, "vendeur");
  assert.equal(c.reponse_possible, true);
  assert.equal(r.messages.find((m) => m.ref === "x2").sens, "envoye");
  assert.ok(r.conversations.find((x) => x.systeme), "message d'eBay = système");
  assert.ok(!r.messages.some((m) => m.ref === "4"), "plus de 30 jours");
  // (relevé réel du 16/10) Un passage SANS texte relu ne donne pas d'extrait (la
  // base garde le précédent) : jamais l'objet du mail, jamais une réécriture.
  const sansTexte = conversationsEbay([{ message_id: "9", sender: "a", folder_id: "0", item_id: "1", subject: "Objet du mail", receive_date: "2026-10-15T10:00:00Z", read: true }], maintenant);
  assert.equal(sansTexte.conversations[0].extrait, null);
});

await cas("eBay : commandes sans adresse, état et date limite", () => {
  const [c] = commandesEbay([{
    orderId: "12-345", orderFulfillmentStatus: "NOT_STARTED", orderPaymentStatus: "PAID", creationDate: "2026-10-15T10:00:00.000Z",
    buyer: { username: "acheteur_e", buyerRegistrationAddress: { fullName: "Jean Dupont", email: "j@d.fr" } },
    pricingSummary: { total: { value: "25.00", currency: "EUR" } },
    lineItems: [{ legacyItemId: "123", title: "Montre", lineItemFulfillmentInstructions: { shipByDate: "2026-10-18T22:59:59.000Z" } }],
    fulfillmentStartInstructions: [{ shippingStep: { shippingServiceCode: "FR_ColiposteColissimo", shipTo: { fullName: "Jean Dupont", contactAddress: { addressLine1: "1 rue" } } } }],
  }]);
  assert.equal(c.etat, "a_expedier");
  assert.equal(c.acheteur_pseudo, "acheteur_e");
  assert.equal(c.annonce_ref, "123");
  assert.equal(c.montant, 25);
  assert.equal(c.a_expedier_avant, "2026-10-18T22:59:59.000Z");
  assert.equal(c.transporteur, "FR_ColiposteColissimo");
  const s = JSON.stringify(c);
  for (const interdit of ["Jean", "Dupont", "j@d.fr", "1 rue"]) assert.ok(!s.includes(interdit), interdit);
  assert.equal(etatCommandeEbay("FULFILLED", null), "expediee");
  assert.equal(etatCommandeEbay("NOT_STARTED", "CANCELED"), "annulee");
});

await cas("(17/10) eBay : une étiquette achetée → son suivi (numéro, transporteur) s'affiche dans FillSell ; jamais une adresse", () => {
  assert.deepEqual(suiviEbay({ fulfillments: [{ fulfillmentId: "F1", shipmentTrackingNumber: "6A1234567890", shippingCarrierCode: "COLISSIMO", shipTo: { fullName: "Jean Dupont" } }] }), { numero: "6A1234567890", transporteur: "COLISSIMO" });
  assert.equal(suiviEbay({ fulfillments: [] }), null);
  assert.equal(suiviEbay(null), null);
  const [c] = commandesEbay([{ orderId: "12-345", orderFulfillmentStatus: "FULFILLED", lineItems: [{ title: "Montre" }], fulfillmentStartInstructions: [{ shippingStep: { shippingServiceCode: "FR_ColiposteColissimo" } }] }],
    { "12-345": { numero: "6A1234567890", transporteur: "COLISSIMO" } });
  assert.equal(c.etat, "expediee"); assert.equal(c.envoi_ref, "6A1234567890"); assert.equal(c.transporteur, "COLISSIMO");
  const [d] = commandesEbay([{ orderId: "12-346", orderFulfillmentStatus: "NOT_STARTED", lineItems: [{ title: "X" }] }]);
  assert.equal(d.envoi_ref, undefined, "sans envoi : aucun numéro inventé");
  const fn = lire("supabase/functions/ebay-messagerie/index.ts");
  assert.ok(fn.includes(".slice(0, 10);") && fn.includes("/shipping_fulfillment`"), "10 lectures de suivi au plus par passage");
});

await cas("eBay : le texte d'un message sort du gabarit HTML, borné", () => {
  assert.equal(texteMessageEbay('<html><div id="UserInputtedText">Bonjour,<br>toujours dispo ?</div><div>pied</div></html>'), "Bonjour, toujours dispo ?");
  assert.equal(texteMessageEbay(null, "Texte brut"), "Texte brut");
  assert.ok(texteMessageEbay("<p>" + "a".repeat(5000) + "</p>").length <= 4000);
});

await cas("eBay (relevé réel du 16/10) : `Content` est du HTML avec ~4 000 car. de style avant <body> → le texte du corps, jamais le style", () => {
  const style = "<style>" + ".c{color:#333;margin:0}".repeat(200) + "</style>";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${style}</head><body><table><tr><td>Nouveau message de acheteur1</td></tr><tr><td>Est-ce encore disponible ?</td></tr></table></body></html>`;
  const t = texteMessageEbay("", html);
  assert.ok(t.includes("Est-ce encore disponible ?"), t.slice(0, 80));
  assert.ok(!/color:|margin|<style|<html/.test(t), "aucun style ni balise");
  // Et le même HTML passé par `Text` seulement.
  assert.ok(texteMessageEbay(html, null).includes("Est-ce encore disponible ?"));
});

// ── g. (17/10) Une page, pas une couche ; retour ; vignettes ; couches ─────────
await cas("(17/10) l'écran est une PAGE : aucune couche fixe, aucun conteneur à hauteur fixe ; la flèche ← et le titre", () => {
  const espace = lire("src/messagerie/EspaceMessagerie.jsx");
  assert.ok(!/position:\s*'fixed'/.test(espace), "aucune couche fixe dans l'écran");
  assert.ok(!/height:\s*'100%'/.test(espace) && !/overflowY:\s*'auto'/.test(espace), "aucun conteneur à hauteur fixe qui défile à part");
  assert.ok(!/function Segments/.test(espace), "plus d'onglets dans l'écran : chaque entrée ouvre son écran");
  assert.ok(/className="fs-espace-beta" data-ecran-beta=\{onglet\}/.test(espace) && /className="fs-espace-beta" data-ecran-beta="conversation"/.test(espace));
  assert.equal((espace.match(/onClick=\{onRetour\} aria-label=\{fr \? 'Retour' : 'Back'\}/g) ?? []).length, 2, "la flèche ← sur la liste et sur la conversation");
  assert.ok(/fr \? 'À expédier' : 'To ship'\) : 'Messages'/.test(espace), "le titre de chaque écran");
  assert.ok(/import '\.\/espace\.css';/.test(espace));
  assert.ok(/\.fs-espace-beta-ouvert > :not\(\.fs-espace-beta\) \{ display: none !important; \}/.test(lire("src/messagerie/espace.css")), "le contenu de l'onglet est masqué (monté), pas démonté");
  assert.ok(/overflowX: 'auto', flex: 'none'/.test(espace), "les filtres défilent sur le côté, jamais écrasés");
  assert.ok(/scrollMarginBottom: 'var\(--nav-content-clearance, 140px\)'/.test(espace), "la fin d'une conversation se pose au-dessus de la barre du bas");
  assert.ok(/fallback=\{<div className="fs-espace-beta"\/>\}/.test(APP), "pendant le chargement, la page reste celle de l'écran");
});

await cas("(17/10) historique : ouvrir = une entrée ; ← = retour du navigateur ; un onglet ferme ; ouvrir ne change jamais d'onglet", () => {
  const h = lire("src/messagerie/useEcranMessagerie.js");
  assert.ok(h.includes("window.history.pushState({ ...(window.history.state ?? {}), [CLE]: suivant }, '')"), "une entrée par écran (l'adresse ne change pas, l'état du routeur est gardé)");
  assert.ok(h.includes("window.addEventListener('popstate', surRetour)") && h.includes("const surRetour = () => appliquer(etatHistorique());"), "retour du navigateur, geste iOS, retour Android : l'entrée d'arrivée dit l'écran");
  assert.ok(h.includes("if (etatHistorique()?.n === v.n) { window.history.back(); return; }"), "la flèche fait exactement le retour du navigateur");
  assert.ok(h.includes("const NAVIGATIONS = '.bnav, .desktop-nav';") && h.includes("document.addEventListener('click', surAppui, true)"), "un appui sur un onglet (barre du bas, bureau) ferme l'écran");
  assert.ok(h.includes("window.history.go(-h.n)"), "fermer retire les entrées poussées");
  assert.ok(!/setTab/.test(h) && !/setTab/.test(lire("src/messagerie/EspaceMessagerie.jsx")), "l'écran ne change jamais d'onglet");
  assert.ok(APP.includes("const ecranMessagerie=useEcranMessagerie(scrollRef,tab);"), "branché sur le conteneur qui défile");
  assert.ok(APP.indexOf("const scrollRef=useRef(null);") < APP.indexOf("useEcranMessagerie(scrollRef,tab)"), "déclaré APRÈS scrollRef (règle TDZ)");
  assert.ok(APP.indexOf("const [tab,setTab]=") < APP.indexOf("useEcranMessagerie(scrollRef,tab)"), "déclaré APRÈS tab (règle TDZ)");
});

await cas("(17/10) entrées du Stock : même style neutre, seul le compteur porte la couleur", () => {
  const b = lire("src/messagerie/BarreMessagerie.jsx");
  assert.ok(!/actif/.test(b) && !/S\.menthe/.test(b), "aucun état « sélectionné »");
  assert.ok(b.includes('style={pilule} data-entree-beta="messages"') && b.includes('style={pilule} data-entree-beta="expedier"'), "les deux pastilles : le même style");
  assert.ok(b.includes("background: S.tealDeep, color: '#FFFFFF'"), "le compteur de non-lus, coloré");
});

await cas("(17/10) vignette : la photo de l'annonce, puis la fiche du stock (liste lue par le normaliseur), puis une icône ; jamais la liste dans src", () => {
  assert.deepEqual(sourcesVignette("https://a/1.jpg", [{ url: "https://f/1.jpg" }, "https://f/2.jpg"]), ["https://a/1.jpg", "https://f/1.jpg", "https://f/2.jpg"]);
  assert.deepEqual(sourcesVignette(null, [{ url: "https://f/1.jpg", type: "original" }]), ["https://f/1.jpg"], "objets {url} de la fiche");
  assert.deepEqual(sourcesVignette(null, ["https://f/1.jpg", "https://f/1.jpg", "  "]), ["https://f/1.jpg"], "sans doublon, entrées vides écartées");
  assert.deepEqual(sourcesVignette("https://f/1.jpg", ["https://f/1.jpg"]), ["https://f/1.jpg"]);
  assert.deepEqual(sourcesVignette(null, null), [], "rien : l'icône neutre");
  assert.equal(sourcesVignette(null, ["a", "b", "c", "d", "e"]).length, 3, "trois photos de la fiche au plus");
  const v = lire("src/messagerie/Vignette.jsx");
  assert.ok(v.includes("onError={suivante}") && v.includes("if (!e.currentTarget.naturalWidth) suivante();"), "une image qui casse (ou 0 px) passe à la suivante");
  for (const f of ["src/messagerie/EspaceMessagerie.jsx", "src/messagerie/SectionAExpedier.jsx"]) {
    const t = lire(f);
    assert.ok(!/photosParInventaire\?\.\[[^\]]+\]\)\s*\|\|/.test(t), "plus jamais la liste de la fiche passée comme adresse : " + f);
    assert.ok(t.includes("sourcesVignette(") && t.includes("<Vignette "), f);
    assert.ok(!t.includes("<img src={photo}"), f);
  }
});

await cas("(17/10) toute couche de la bêta passe par Couche : portail sur body, barre du bas masquée, Échap et retour Android", () => {
  const c = lire("src/messagerie/Couche.jsx");
  assert.ok(c.includes("createPortal(") && c.includes("document.body"), "portail sur body");
  assert.ok(c.includes("useFondFige(true)") && c.includes("useEchap(onFermer)") && c.includes("useRetourAndroid(onFermer)"));
  const couches = ["src/messagerie/SectionAExpedier.jsx", "src/messagerie/impression/ApercuBordereau.jsx", "src/messagerie/impression/ToutImprimer.jsx", "src/messagerie/impression/CodeDepot.jsx"];
  for (const f of couches) {
    const t = lire(f);
    const fixes = (t.match(/position: 'fixed'/g) ?? []).length;
    const portees = (t.match(/<Couche[ >]/g) ?? []).length;
    assert.ok(fixes > 0 && portees === fixes, `${f} : ${fixes} couche(s) fixe(s), ${portees} dans Couche`);
  }
  assert.ok(lire("src/messagerie/impression/CodeDepot.jsx").includes("<Couche premierPlan={false}>"), "le plein écran du code, ouvert PAR l'aperçu : Échap et retour Android ne ferment pas les deux");
});

await cas("(17/10, règle de Nico) TOUTES les cartes : aucune ne dit « c'est toi qui le fais » ; la plateforme n'est un bouton que pour ce que FillSell ne fait pas", () => {
  const etats = ["a_confirmer", "a_expedier", "inconnu"];
  const bords = ["a_generer", "a_obtenir", "pret", "indisponible", "sans_objet", "inconnu"];
  const options = [null, { generable: true }, { generable: true, types_etiquette: [1] }, { generable: true, type_envoi: "colissimo", adresse_requise: true }, { generable: false, domicile_seul: true }];
  let vus = 0;
  for (const platform of ["vinted", "leboncoin", "beebs", "ebay", "depop"]) for (const etat of etats) for (const bordereau of bords) for (const o of options) for (const gen of [null, true]) {
    const c = { platform, etat, bordereau, commande_ref: "R1", options_bordereau: o };
    const a = actionCommande(c, "fr", gen);
    vus++;
    assert.ok(!/c’est toi qui le fais|C’est toi qui le fais/.test(a.aide ?? ""), `« c'est toi qui le fais » : ${JSON.stringify(c)}`);
    // Ce que FillSell sait faire est un geste FillSell.
    if (["vinted", "leboncoin", "beebs"].includes(platform) && etat === "a_expedier" && bordereau === "pret") assert.equal(a.type, "bordereau");
    if (attendGeneration(c) && o?.generable !== false) assert.equal(a.type, "generer", JSON.stringify(c));
    // Un lien n'existe que pour : eBay à expédier (achat), Depop à expédier, un « non générable » dit, une étiquette
    // que Vinted ou (18/10) Leboncoin n'a pas pu émettre (« indisponible ») — seule la plateforme peut la redemander.
    if (a.type === "lien") {
      const permis = (platform === "ebay" && etat === "a_expedier") || (platform === "depop" && etat === "a_expedier")
        || (attendGeneration(c) && o?.generable === false) || (["vinted", "leboncoin"].includes(platform) && bordereau === "indisponible" && etat === "a_expedier");
      assert.ok(permis, `lien non permis : ${JSON.stringify(c)}`);
    }
  }
  assert.ok(vus >= 900, String(vus));
});

await cas("(17/10, décision de Nico) Colissimo : l'expéditeur est l'adresse du COMPTE Leboncoin — aucune adresse saisie ni gardée dans FillSell", () => {
  const section = lire("src/messagerie/SectionAExpedier.jsx");
  assert.ok(/data-expediteur="compte-leboncoin"/.test(section) && /l’adresse enregistrée dans ton compte Leboncoin/.test(section), "l'écran le dit");
  assert.ok(!/<input type="text"|name=\{`expediteur-/.test(section) && !/fusionnerReglages|platform_settings/.test(section), "aucun champ d'adresse, rien écrit dans les réglages");
  const bg = lire("chrome-extension/background.js");
  const gen = bg.slice(bg.indexOf("async function genererBordereauBeta"), bg.indexOf("async function suiteGenerationBeta"));
  assert.ok(gen.length > 100 && !/expediteur|platform_settings/.test(gen), "le poste ne lit aucune adresse dans FillSell");
  assert.ok(etatDemandeBordereau({ action: "generer", statut: "echec", motif: "adresse_expediteur_a_completer" }, "fr", "leboncoin").texte.includes("compte Leboncoin est incomplète"));
});

await cas("(17/10) suivi lisible (eBay, Depop, Beebs) et expédiées depuis 3 jours ; jamais un numéro interne (Vinted, Leboncoin)", () => {
  assert.equal(suiviCommande({ platform: "ebay", envoi_ref: "6A123", transporteur: "FR_ColiposteColissimo" }).texte, "Suivi Colissimo : 6A123");
  assert.equal(suiviCommande({ platform: "depop", envoi_ref: "XY9" }).texte, "Suivi : XY9");
  assert.equal(suiviCommande({ platform: "vinted", envoi_ref: "123" }), null, "Vinted : numéro d'envoi interne");
  assert.equal(suiviCommande({ platform: "leboncoin", envoi_ref: "P9" }), null, "Leboncoin : numéro de colis interne");
  const maintenant = Date.parse("2026-10-17T12:00:00Z");
  const l = expedieesRecentes([
    { id: 1, etat: "expediee", maj_le: "2026-10-17T10:00:00Z" }, { id: 2, etat: "expediee", maj_le: "2026-10-13T10:00:00Z" },
    { id: 3, etat: "a_expedier", maj_le: "2026-10-17T10:00:00Z" }, { id: 4, etat: "expediee", maj_le: "2026-10-16T10:00:00Z" },
  ], maintenant);
  assert.deepEqual(l.map((c) => c.id), [1, 4]);
});

await cas("(17/10) les cartes : le geste FillSell en bouton ; la plateforme en lien discret (dernier recours) ; réglages à trois états", () => {
  const section = lire("src/messagerie/SectionAExpedier.jsx");
  assert.ok(/function LienSecours\(/.test(section) && /data-lien-secours/.test(section), "le lien de dernier recours");
  assert.ok(/\{action\.type !== 'lien' && action\.url && <LienSecours /.test(section));
  assert.ok(!/<Bouton onClick=\{\(\) => ouvrirLien\(action\.url\)\} ariaLabel=\{fr \? `Voir sur/.test(section), "plus de bouton « Voir sur … » à côté du geste FillSell");
  assert.ok(/actionCommande\(c, lang, reglages\.generation, extensionVinted\)/.test(section));
  // (18/10) L'extension sait-elle commander l'étiquette Vinted ? Lecture annexe : sa panne laisse « inconnu ».
  assert.ok(/setExtensionVinted\(p && !p\.error \? extensionCommandeVinted\(p\.data\?\.extension_build\) : null\)/.test(section));
  assert.equal(extensionCommandeVinted("2026-10-17T18:16:49Z+ced6cfd"), false, "0.6.124 : commanderait sans type");
  assert.equal(extensionCommandeVinted("2026-10-17T23:03:01Z+9d11d42"), false, "0.6.125 non plus");
  assert.equal(extensionCommandeVinted(`${GENERATION_VINTED_BUILD_MIN}+abc1234`), true);
  assert.equal(extensionCommandeVinted(null), null);
  const v = { platform: "vinted", etat: "a_expedier", bordereau: "a_obtenir", commande_ref: "1" };
  const vieille = actionCommande(v, "fr", true, false);
  assert.equal(vieille.type, "lien");
  assert.ok(vieille.aide.includes("commande l’étiquette sur Vinted"));
  assert.equal(actionCommande(v, "fr", true, true).type, "generer");
  assert.equal(actionCommande(v, "fr", true, null).type, "generer", "inconnu : le bouton reste (la base tient la règle)");
  assert.equal(actionCommande({ ...v, options_bordereau: { generable: true, types_etiquette: [3], types_vinted: ["digital", "locker_code"] } }, "fr", true, true).type, "lien", "type inconnu de FillSell : jamais deviné");
  const echec = actionCommande({ platform: "vinted", etat: "a_expedier", bordereau: "indisponible", commande_ref: "2" }, "fr", true, true);
  assert.equal(echec.libelle, "Redemander sur Vinted");
  assert.ok(echec.aide.includes("Échec du bordereau d’envoi"));
  const hook = lire("src/messagerie/useMessagerieBeta.js");
  assert.ok(/useState\(\{ pret: false, envoiMode: 1, generation: null \}\)/.test(hook), "pas encore lus : null, jamais « fermé »");
  assert.ok(/generation: data\.generation === true \? true : data\.generation === false \? false : null/.test(hook));
});

// ── f. Règles d'écran ────────────────────────────────────────────────────────
await cas("aucun émoji, jamais « pépites »", () => {
  for (const f of FICHIERS_UI) {
    const t = lire(f);
    assert.ok(!/pépite/i.test(t), f);
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t), `émoji dans ${f}`);
  }
});

// (24/10 soir, décision 1 de Nico) Le bordereau AUTOMATIQUE dès la vente : un état simple et court tant qu'il se
// prépare (jamais un paragraphe) ; un échec dit son motif réel et le bouton manuel revient.
await cas("bordereau automatique : « Bordereau en préparation », court ; échec = motif réel ; double vente dite", () => {
  for (const d of [{ action: 'generer', statut: 'demandee', choix: { auto: true } }, { action: 'generer', statut: 'en_cours', choix: { auto: true } },
    { action: 'generer', statut: 'generee', essais_fichier: 3, choix: { auto: true } }, { action: 'recuperer', statut: 'demandee', choix: { auto: true } }]) {
    const e = etatDemandeBordereau(d, 'fr', 'vinted');
    assert.equal(e.texte, 'Bordereau en préparation', JSON.stringify(d));
    assert.equal(e.attente, true);
  }
  assert.equal(etatDemandeBordereau({ action: 'generer', statut: 'demandee', choix: { auto: true } }, 'en', 'vinted').texte, 'Label being prepared');
  // Sans « auto », rien ne change (demande du vendeur) ; un échec automatique dit le vrai motif.
  assert.ok(etatDemandeBordereau({ action: 'generer', statut: 'demandee' }, 'fr', 'vinted').texte.startsWith('Génération demandée.'));
  assert.ok(etatDemandeBordereau({ action: 'generer', statut: 'echec', motif: 'commande_annulee', choix: { auto: true } }, 'fr', 'vinted').texte.includes('annulée sur Vinted'));
  assert.ok(etatDemandeBordereau({ action: 'generer', statut: 'echec', motif: 'deux_commandes_meme_fiche', choix: { auto: true } }, 'fr', 'vinted').texte.startsWith('Deux commandes en cours pour le même article'));
  // 15 essais sans fichier : plus « en préparation », la vraie situation est dite.
  assert.ok(etatDemandeBordereau({ action: 'generer', statut: 'generee', essais_fichier: 15, choix: { auto: true } }, 'fr', 'vinted').texte.includes('15 essais'));
});
console.log(`messagerie-app-selftest : ${n} cas verts`);
