// selftest:cause-blocage — (24/10, lot « zéro blocage », C3) Chaque arrêt d'une publication, d'une republication ou
// d'un retrait est classé par ORIGINE (utilisateur / garde / plateforme / nous) et par CAUSE exacte ; un job arrêté
// chez nous puis abandonné par l'utilisateur reste un ÉCHEC de notre fait, jamais une annulation.
//   npm run selftest:cause-blocage
// Les textes sont ceux des jobs réels du 24/10 (check de 13:29), recopiés tels quels.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { causeDuTexte, blocagesDuJob, blocagesDeNotreFait, ORIGINE, sentinelleArrets } =
  await import(pathToFileURL(path.join(RACINE, "supabase/functions/_shared/cause-blocage.js")).href);
let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
const est = (a, origine, cause) => { assert.equal(a.origine, origine, JSON.stringify(a)); if (cause) assert.equal(a.cause, cause, JSON.stringify(a)); };
console.log("cause-blocage-selftest");

cas("1. ce que lui seul peut faire : connexion, compte vendeur à finir, compte restreint, plateforme qu'il a désactivée", () => {
  est(causeDuTexte({ texte: "Connexion Leboncoin requise : reconnecte-toi à Leboncoin dans Chrome, sur ton ordinateur. Ton annonce est intacte ; tout repartira tout seul ensuite.", source: "connexion" }), ORIGINE.UTILISATEUR, "connexion");
  est(causeDuTexte({ texte: "Republication en pause avant toute suppression : ton annonce est toujours en ligne sur Vinted. Motif : Connexion Vinted requise : se connecter sur vinted.fr dans Chrome", source: "relancer" }), ORIGINE.UTILISATEUR, "connexion");
  est(causeDuTexte({ texte: "Connecte-toi à eBay sur ton ordinateur avec le compte nelsonthecat.", source: "ebay_compte_chrome" }), ORIGINE.UTILISATEUR, "connexion");
  est(causeDuTexte({ texte: "Depop demande de terminer ta configuration de vendeur (ajouter un moyen de paiement) avant ta première mise en ligne", source: "depop_vendeur" }), ORIGINE.UTILISATEUR, "compte_a_finir");
  est(causeDuTexte({ texte: "Ton compte eBay n'est pas encore prêt pour vendre. Connecte-toi à eBay sur ton ordinateur", source: "ebay_compte_a_finir" }), ORIGINE.UTILISATEUR);
  est(causeDuTexte({ texte: "En pause : tu as indiqué ne pas vendre sur Vinted. Rien ne part sur cette plateforme.", source: "plateforme_ecartee" }), ORIGINE.UTILISATEUR, "plateforme_desactivee");
  est(causeDuTexte({ texte: "Vinted bloque tes actions depuis plusieurs heures : ouvre vinted.fr dans Chrome" }), ORIGINE.UTILISATEUR, "compte_restreint");
});

cas("2. les gardes voulues (doute → question) ne sont jamais comptées chez nous", () => {
  est(causeDuTexte({ texte: "Une annonce Leboncoin pourrait correspondre à cet article : https://www.leboncoin.fr/ad/3292326913. On ne redépose pas, pour ne jamais la mettre en double", source: "recreation_deja_partie" }), ORIGINE.GARDE, "doublon_possible");
  est(causeDuTexte({ texte: "Une annonce Beebs apparue depuis le dernier essai pourrait être cet article : https://www.beebs.app/fr/p/34202", source: "depot_deja_parti" }), ORIGINE.GARDE, "doublon_possible");
  est(causeDuTexte({ texte: "Cet article est signalé vendu sur Vinted : on ne le publie pas ailleurs, pour ne jamais le vendre deux fois.", source: "article_vendu" }), ORIGINE.GARDE, "vente_a_confirmer");
});

cas("3. ce qui vient de NOUS (le check du 24/10 à 13:29) : chaque cause est nommée, jamais « autre »", () => {
  const nous = [
    ["Republication Depop mise en pause AVANT tout retrait : la description, le rayon Depop et l'état manquent dans la copie de ton annonce.", "relancer", "capture_depop_incomplete"],
    ["Republication Depop en attente, AVANT tout retrait : indique les frais de port (le prix de livraison que paie l'acheteur).", "champ_a_choisir", "capture_depop_frais_de_port"],
    ["Depop n'accepte pas les objets électriques ou électroniques. Cet article ne partira pas sur Depop : rien n'a été envoyé.", "relancer", "article_refuse_entre_en_file"],
    ["Republication en pause AVANT tout retrait : la marque de ton annonce n'est plus proposée par le menu de Vinted.", null, "marque_hors_menu"],
    ["Republication en pause, rien n'a été retiré : Leboncoin n'a pas rendu cette annonce à la dernière lecture.", "introuvable_a_confirmer", "introuvable_a_confirmer"],
    ["Leboncoin refuse de rendre cette annonce à la lecture alors qu'un relevé la voit en ligne", "introuvable_persistant", "introuvable_persistant"],
    ["Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Le format du colis de ton annonce d'origine (« Grand ») n'est pas proposé par Vinted pour ce rayon", "prevol_negatif", "format_colis_refuse"],
    ["Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted exige des champs encore vides pour cette catégorie : Espace de stockage.", "prevol_negatif", "champ_demande"],
    ["Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted ne connaît pas la marque « pago » et ne permet plus d'en créer une nouvelle.", "prevol_negatif", "marque_inconnue"],
    ["Republication en pause AVANT toute suppression : la nouvelle capture de ton annonce est incomplète : photo non re-hébergée (upload : Too many connections issued to the database).", "capture_incomplete", "capture_incomplete"],
    ["La republication s'interrompt chaque fois au même moment sur ton ordinateur (4 essais de suite, l'onglet Vinted se ferme)", "relancer", "interruption_repetee"],
    ["Vinted refuse le titre de cette annonce : « Le titre contient trop de lettres majuscules. »", "relancer", "titre_refuse"],
    ["Republication en pause avant toute suppression : ton annonce est toujours en ligne sur Vinted. Motif : [selectors] vinted/publish.photo_input (criticité red) : aucun des 1 maillon(s) n'a résolu.", "relancer", "selecteur_casse"],
    ["Publication jamais vue en ligne sur Beebs : deux relevés complets de ton compte ne l'ont pas trouvée, et nous n'avons jamais eu son numéro.", null, "depot_non_confirme"],
  ];
  for (const [texte, source, cause] of nous) est(causeDuTexte({ texte, source }), ORIGINE.NOUS, cause);
});

cas("4. la plateforme qui refuse sans motif (modération) est à part ; Opla (quittée le 10/10) aussi", () => {
  est(causeDuTexte({ texte: "Beebs n'a jamais mis cette annonce en ligne : trois jours après le dépôt, elle n'est ni en ligne ni « en vérification »" }), ORIGINE.PLATEFORME, "moderation");
  est(causeDuTexte({ texte: "Leboncoin n'a pas mis cette annonce en ligne — refusée à la vérification (ou retirée depuis)" }), ORIGINE.PLATEFORME, "moderation");
  est(causeDuTexte({ texte: "Aucune catégorie Opla n'a été résolue pour cet article.", platform: "opla" }), ORIGINE.PLATEFORME, "plateforme_quittee");
});

cas("5. un échec de notre fait puis abandonné par l'utilisateur reste un ÉCHEC (mele.marta, 34f17de2 et adf0454e, 24/10)", () => {
  const job = {
    platform: "vinted", action: "publish", status: "cancelled",
    error: "Stopped at your request — Vinted was abandoned for this item. Nothing was published, nothing was charged.",
    platform_fields: {
      abandon_utilisateur: { le: "2026-10-24T11:00:00Z" },
      erreurs_archivees: [
        { le: "2026-10-24T10:59:17.291Z", par: "relance_manuelle (✋ Compléter)", statut: "needs_user",
          erreur: "Vinted ne connaît pas la marque « Powermiss » et ne permet plus d'en créer une nouvelle. Choisis-la dans la liste de Vinted si elle y est sous un autre nom, ou « Sans marque »." },
        { le: "2026-10-24T11:53:00.031Z", par: "update-job-status", statut: "needs_user",
          erreur: "La publication n'a pas abouti. Rien n'a été publié. On ne sait pas encore pourquoi : on refait un essai tout seuls." },
        { le: "2026-10-24T09:00:00Z", par: "x", statut: "pending", erreur: "En file : ta republication passera à son tour" },
      ],
    },
  };
  const b = blocagesDeNotreFait(job);
  assert.equal(b.length, 2, "deux arrêts de notre fait (la file n'est pas un arrêt)");
  assert.deepEqual(b.map((x) => x.cause), ["marque_inconnue", "echec_inexplique"]);
  assert.ok(b.every((x) => x.abandonne === true && x.courant === false));
});

cas("6. un job en cours : l'arrêt courant porte sa source ; un job publié sans historique n'a aucun arrêt", () => {
  const b = blocagesDuJob({ platform: "leboncoin", action: "republish", status: "needs_user",
    error: "Republication en pause, rien n'a été retiré : Leboncoin n'a pas rendu cette annonce à la dernière lecture.",
    platform_fields: { needs_user_source: "introuvable_a_confirmer" } });
  assert.equal(b.length, 1);
  assert.equal(b[0].courant, true);
  est(b[0], ORIGINE.NOUS, "introuvable_a_confirmer");
  assert.deepEqual(blocagesDuJob({ platform: "vinted", status: "published", error: null, platform_fields: {} }), []);
});

cas("7. la sentinelle : retenue de notre fait en file, abandon compté comme échec, série d'accidents avant retrait", () => {
  const r = sentinelleArrets([
    { id: "aaaaaaaa-1", user_id: "u1", platform: "vinted", action: "republish", status: "pending", created_at: "2026-10-24T08:00:00Z",
      error: "Republication en pause AVANT tout retrait : la marque de ton annonce n'est plus proposée par le menu de Vinted.", platform_fields: {} },
    { id: "bbbbbbbb-2", user_id: "u2", platform: "vinted", action: "publish", status: "cancelled", created_at: "2026-10-24T09:00:00Z",
      error: "Stopped at your request", platform_fields: { abandon_utilisateur: {}, erreurs_archivees: [{ le: "2026-10-24T10:59:17Z", statut: "needs_user", erreur: "Vinted ne connaît pas la marque « Powermiss »" }] } },
    { id: "cccccccc-3", user_id: "u3", platform: "vinted", action: "republish", status: "pending", created_at: "2026-10-20T09:00:00Z",
      error: "Republication en pause avant toute suppression", platform_fields: { reprise_avant_retrait: { n: 4, le: "2026-10-24T12:00:00Z" } } },
    { id: "dddddddd-4", user_id: "u4", platform: "leboncoin", action: "republish", status: "needs_user", created_at: "2026-10-24T10:00:00Z",
      error: "Connexion Leboncoin requise : reconnecte-toi", platform_fields: { needs_user_source: "connexion" } },
  ], { depuis: "2026-10-24T00:00:00Z" });
  const parCause = Object.fromEntries(r.map((g) => [g.cause, g]));
  assert.equal(parCause.marque_hors_menu?.en_cours, 1);
  assert.equal(parCause.marque_inconnue?.abandonnes, 1, "abandon après échec = échec");
  assert.equal(parCause.accidents_repetes_avant_retrait?.en_cours, 1);
  assert.ok(!parCause.connexion, "une connexion à refaire n'est jamais de notre fait");
});

cas("8. ops-digest lit la sentinelle et l'affiche en rouge (le digest part dès qu'un arrêt de notre fait existe)", () => {
  const od = fs.readFileSync(path.join(RACINE, "supabase/functions/ops-digest/index.ts"), "utf8");
  assert.ok(od.includes('import { sentinelleArrets } from "../_shared/cause-blocage.js";'));
  assert.ok(/sentinelle = sentinelleArrets\(jobsS, \{ depuis: iso24h \}\);/.test(od));
  assert.ok(/arrets_de_notre_fait: sentinelle\.length,/.test(od), "compté dans le total (silence = sain)");
});

cas("9. (25/10 nuit, audit N1) les vraies causes que la sentinelle rangeait mal", () => {
  assert.deepEqual(causeDuTexte({ texte: "Vinted ne répond plus à FillSell sur ton ordinateur : ouvre vinted.fr…", source: "verification_antirobot", platform: "vinted" }),
    { origine: ORIGINE.UTILISATEUR, cause: "compte_restreint" }, "vérification anti-robot sur le compte : la personne");
  assert.deepEqual(causeDuTexte({ texte: "Cette annonce appartient à une autre boutique Vinted que celle ouverte dans Chrome.", source: "boutique_etrangere", platform: "vinted" }),
    { origine: ORIGINE.UTILISATEUR, cause: "connexion" }, "autre boutique ouverte : la personne");
  assert.equal(causeDuTexte({ texte: "Vinted a restreint ton compte jusqu'au 05/11.", platform: "vinted" }).cause, "compte_restreint");
  assert.equal(causeDuTexte({ texte: "La republication s'interrompt au même moment sur ton ordinateur (3 essais).", platform: "vinted" }).cause, "interruption_repetee");
  assert.equal(causeDuTexte({ texte: "Arrêtée à ta demande.", platform: "vinted" }).cause, "arret_demande", "le féminin d'arretLot.js");
  const arrete = { status: "cancelled", error: "Arrêtée à ta demande.", platform: "vinted", action: "republish",
    platform_fields: { erreurs_archivees: [{ statut: "needs_user", erreur: "Vinted ne connaît pas la marque « pago »", le: "2026-10-20T10:00:00Z" }] } };
  assert.ok(blocagesDuJob(arrete).every((b) => b.abandonne), "arrêtée à sa demande APRÈS un arrêt de notre fait = un échec, jamais une annulation");
  const marque = { ...arrete, error: "Cette publication a été arrêtée.", platform_fields: { ...arrete.platform_fields, arret_utilisateur: { le: "2026-10-21T08:00:00Z" } } };
  assert.ok(blocagesDuJob(marque).every((b) => b.abandonne), "la marque arret_utilisateur compte aussi");
});

cas("10. (25/10, audit N9) couleur de republication, sous-catégorie, mention d'un site : des causes nommées, de notre fait", () => {
  // Les textes réels, recopiés tels quels (erreurs archivées des jobs 6ff45122, 9de4f193, 3e3074ef).
  const couleur = "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted exige une couleur à la création et ton annonce d'origine n'en porte pas — aucune couleur n'a pu être déduite (app, titre). Renseigne la couleur depuis l'app (carte de l'article), puis relance la republication. Rien n'a été supprimé, ton annonce est intacte. Le choix se fait dans l'app : fiche de l'article, bouton « ✋ Compléter ».";
  est(causeDuTexte({ texte: couleur, source: null, platform: "vinted" }), ORIGINE.NOUS, "couleur_absente");
  est(causeDuTexte({ texte: couleur, source: "prevol_negatif", platform: "vinted" }), ORIGINE.NOUS, "couleur_absente");
  const sousCat = "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Le catalogue Vinted demande une sous-catégorie plus précise sous « Cartes à collectionner ». Choisis-la parmi celles que Vinted propose — ton annonce partira ensuite toute seule. Relevé sur ton annonce — Catégorie Vinted : Loisirs et collections › Cartes à collectionner. Le choix se fait dans l'app : fiche de l'article, bouton « ✋ Compléter ».";
  est(causeDuTexte({ texte: sousCat, source: null, platform: "vinted" }), ORIGINE.NOUS, "sous_categorie_a_choisir");
  est(causeDuTexte({ texte: "Vinted ne propose pas « Figurines » à cet endroit de son catalogue. Choisis la bonne catégorie parmi celles que Vinted propose", source: "prevol_negatif" }), ORIGINE.NOUS, "sous_categorie_a_choisir");
  est(causeDuTexte({ texte: "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted n'accepte plus la catégorie de cette annonce, et FillSell n'a pas pu choisir seul la bonne sous-catégorie de « Enfants › Jeux et jouets ».", source: "champ_a_choisir" }),
    ORIGINE.NOUS, "sous_categorie_a_choisir");
  const insta = "Leboncoin refuse le dépôt : « Nous vous invitons à supprimer toute mention d'un site internet autre que leboncoin.fr dans le titre et/ou le texte de votre annonce. » · « Merci de modifier votre titre ou description. En effet, vous avez utilisé des mots qui ne respectent pas nos règles de contenu. » — corrige l'annonce dans FillSell, puis relance la publication.";
  est(causeDuTexte({ texte: insta, source: null, platform: "leboncoin" }), ORIGINE.NOUS, "texte_refuse_mention_site");
  const job = { platform: "leboncoin", action: "publish", status: "cancelled", error: "Arrêté à ta demande — tu as abandonné Leboncoin pour cet article.",
    platform_fields: { abandon_utilisateur: {}, erreurs_archivees: [{ le: "2026-10-18T08:01:55Z", statut: "processing", erreur: insta }, { le: "2026-10-18T08:26:02Z", statut: "needs_user", erreur: insta }] } };
  const b = blocagesDeNotreFait(job);
  assert.equal(b.length, 1, "seul l'arrêt (needs_user) compte, pas la reprise (processing)");
  assert.equal(b[0].cause, "texte_refuse_mention_site");
  assert.ok(b[0].abandonne, "abandonné après notre refus : un échec, jamais une annulation");
  // 3e3074ef tel qu'en base : les arrêts AFFICHÉS sous le message générique, le refus « instagram » dans error_technique.brut.
  const generique = "La publication n'a pas abouti après plusieurs essais automatiques. Rien n'a été publié. Tu peux la relancer d'un clic ci-dessous ; si ça bloque encore, écris-nous, on regarde avec toi.";
  const reel = { platform: "leboncoin", action: "publish", status: "cancelled", error: "Arrêté à ta demande — tu as abandonné Leboncoin pour cet article.",
    platform_fields: { abandon_utilisateur: {}, error_technique: { brut: insta, pose_par: "update-job-status (requalification affichage G1/G4)" },
      erreurs_archivees: [{ le: "2026-10-18T06:10:01Z", statut: "processing", erreur: insta }, { le: "2026-10-18T08:26:02Z", statut: "needs_user", erreur: generique },
        { le: "2026-10-18T11:06:10Z", statut: "needs_user", erreur: generique }] } };
  assert.deepEqual(blocagesDeNotreFait(reel).map((x) => x.cause), ["texte_refuse_mention_site", "texte_refuse_mention_site"],
    "message générique affiché, cause écrite dans error_technique.brut : elle est nommée (plus « inexpliqué »)");
  assert.deepEqual(blocagesDeNotreFait({ ...reel, platform_fields: { ...reel.platform_fields, error_technique: { brut: "Erreur inconnue" } } }).map((x) => x.cause),
    ["echec_inexplique", "echec_inexplique"], "un brut qui ne dit rien de plus : « inexpliqué » reste");
  // Le format du colis garde sa cause (la règle 9 le tranche désormais), la pause « sous-catégorie » n'est pas un arrêt.
  est(causeDuTexte({ texte: "Le format du colis de ton annonce d'origine (« Grand ») n'est pas proposé par Vinted pour ce rayon", source: "prevol_negatif" }), ORIGINE.NOUS, "format_colis_refuse");
  assert.deepEqual(blocagesDuJob({ platform: "vinted", action: "republish", status: "pending",
    error: "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted demande une catégorie plus précise : FillSell la choisit d'après ta fiche, rien à faire.",
    platform_fields: { rayon_moteur_attendu: { le: "2026-10-25T10:00:00Z" } } }), [], "la question mise de côté pour le moteur (pending) n'est pas un arrêt");
});

const R = await import(pathToFileURL(path.join(RACINE, "supabase/functions/_shared/ebay-brouillon-refus.js")).href);
const V = await import(pathToFileURL(path.join(RACINE, "supabase/functions/_shared/vendeur-ebay.js")).href);
cas("11. (25/10, N6, R2, R3) eBay par l'extension : les retours du compte, les photos non reçues, le compte pas ouvert à la vente", () => {
  // Textes réels : lemonde-glad 080e9d39 (20/10) et Fleur de Lotus c64e5596 (23/10), avant le 25/10 rangés « nous/autre ».
  const refus = (x) => "Publication eBay bloquée : le clic « Mettre en vente » n'a produit aucune requête, et la soumission directe du brouillon a été REFUSÉE par eBay — éléments manquants dans le brouillon : " + x + ". Aucune annonce n'a été créée.";
  est(causeDuTexte({ texte: refus("Conditions des retours nationaux"), source: "relancer", platform: "ebay" }), ORIGINE.UTILISATEUR, "reglage_du_compte");
  est(causeDuTexte({ texte: R.messageRetoursAChoisir("publish"), source: R.SOURCE_RETOURS_EBAY, platform: "ebay" }), ORIGINE.UTILISATEUR, "reglage_du_compte");
  est(causeDuTexte({ texte: R.messageRetoursNonPoses("publish"), source: null, platform: "ebay" }), ORIGINE.NOUS, "retours_non_poses");
  est(causeDuTexte({ texte: refus("Photos"), source: "relancer", platform: "ebay" }), ORIGINE.NOUS, "photos_non_recues");
  est(causeDuTexte({ texte: R.messagePhotosArret("publish"), source: null, platform: "ebay" }), ORIGINE.NOUS, "photos_non_recues");
  est(causeDuTexte({ texte: `${R.ANCRE_PHOTOS_NON_RECUES} : 0 sur 4 après 20 s.`, source: null, platform: "ebay" }), ORIGINE.NOUS, "photos_non_recues");
  est(causeDuTexte({ texte: V.MESSAGE_VENDEUR_EBAY, source: V.SOURCE_VENDEUR_EBAY, platform: "ebay" }), ORIGINE.UTILISATEUR, "compte_a_finir");
  est(causeDuTexte({ texte: V.MESSAGE_VENDEUR_EBAY, source: null, platform: "ebay" }), ORIGINE.UTILISATEUR, "compte_a_finir");
  // L'arrêt « photos » parqué en file (pending, defaut_fillsell) compte comme un arrêt de notre fait.
  const parque = { id: "c64e5596", user_id: "u", platform: "ebay", action: "publish", status: "pending", error: R.messagePhotosArret("publish"), platform_fields: {} };
  const s = sentinelleArrets([parque]);
  assert.equal(s.find((g) => g.cause === "photos_non_recues")?.en_cours, 1, "parqué en file = un arrêt en cours, de notre fait");
});

console.log(`cause-blocage-selftest : ${n} cas verts`);
