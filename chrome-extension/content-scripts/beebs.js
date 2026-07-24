// Empreinte de version (2026-07-12) : PREMIÈRE ligne de console à l'injection —
// dit quelle version du code tourne RÉELLEMENT dans l'onglet. À METTRE À JOUR à
// chaque modification de ce fichier.
const BEEBS_BUILD = "2026-07-22-listes-longues (relevé des options AVANT toute frappe dans la barre de recherche : les listes longues — Taille robe femme, Marque, tailles enfant/bébé — entrent enfin au catalogue, la garantie « jamais de liste partielle » passe d'un test fragile à l'ORDRE des opérations ; barre de recherche détectée par différentiel et non plus par querySelector global ; needsUserField porte input_type pour que l'app refuse d'en faire une saisie libre)";
console.log(`[beebs.js] build ${BEEBS_BUILD}`);

// Content script Beebs — remplit le formulaire de dépôt d'annonce.
//
// ⚠️ DRY_RUN passé à false le 2026-07-12 (session de rodage supervisée par
// Nico : 1 article test, T-shirt Patagonia à 30 €, piloté à la main) : TOUT
// job publish part désormais en LIVE, plus seulement ceux marqués
// platform_fields.live_run. Objectif secondaire du test : vérifier si le
// prix à 200 € expliquait la disparition des annonces (cf. commit 1fc671e).
// En dry-run, le formulaire était rempli mais le bouton "Mettre en vente"
// n'était JAMAIS cliqué — le résultat était loggé en console.
//
// Architecture relevée en session réelle (2026-07-08, connecté — cookie
// datadome présent, même protection anti-bot que Vinted, mêmes précautions
// onglet unique/pas de rafale que getOrCreateWorkTab côté background) :
//   - URL directe https://www.beebs.app/fr/listing (confirmée par clic réel
//     sur "Vendre des articles" — accessible sans redirection de login tant
//     qu'une session est active, comme pressenti dans beebsCategories.js).
//   - Formulaire STATIQUE en tête, ids stables : Titre (#title), Photos
//     (#input-pictures, multiple, accept jpg/jpeg/jfif/pjpeg/pjp/png/webp/gif),
//     Description (#description).
//   - Catégorie : sélecteur en cascade (bouton "Sélectionner une catégorie"
//     puis panneaux successifs réécrits en place, classe
//     CategoriesDropDown-module-scss-module__YKdtxa__category confirmée
//     identique à celle documentée dans beebsCategories.js — on cible par
//     `[class*="__category"]` plutôt que le hash exact, plus résistant à un
//     futur redéploiement front). Contrairement à Vinted, cliquer la FEUILLE
//     (bouton avec un input[type=checkbox]) sélectionne ET ferme le panneau
//     en un seul clic — pas de bouton "Fait" à chercher ensuite.
//   - Genre Mode (Femme/Homme/Fille/Garçon/Bébé) : PAS un champ de
//     formulaire séparé — c'est le 2e niveau de la cascade Catégorie
//     lui-même (Mode > Femme > Chaussures > Baskets). Le chemin complet
//     platform_fields.beebsCategoryPath encode déjà le genre ; aucune
//     sélection de genre indépendante à faire ici.
//   - Une fois la catégorie choisie, des champs DYNAMIQUES apparaissent —
//     ensemble variable PAR CATÉGORIE (confirmé sur 2 catégories réelles) :
//       * "Baskets (femme)" (Mode)              → Couleur (facultatif), Marque, Pointure, État
//       * "Figurines" (Jeux, jouets et loisirs)  → Marque, Âge, Matière, État
//     Chaque champ = un bouton (`[class*="__selectButton"]`) précédé d'un
//     libellé texte (`div[class*="__label"]`, ex. "Couleur (facultatif)" —
//     seul marqueur facultatif/obligatoire observé). Cliquer le bouton ouvre
//     soit une liste courte statique (État : pas de recherche), soit une
//     liste longue avec recherche live (`input[class*="__searchBarInput"]` ;
//     options = `button[class*="__valueButton"]`, libellé COURT dans un
//     `span[class*="__value"]` enfant — le texte complet du bouton inclut
//     aussi une description longue pour État, ne jamais matcher dessus).
//     Sélectionner une option ferme le panneau seule — pas de confirmation
//     supplémentaire, contrairement à Vinted. Un champ non affiché pour la
//     catégorie courante (ex: Pointure sur un jouet) est ignoré sans warning
//     — c'est attendu, pas une erreur.
//   - "Format du colis" (poids) a un DÉFAUT sensé pré-sélectionné ("Poids
//     jusqu'à 1 kg max") — laissé tel quel, aucune source de donnée côté
//     app (même choix que packageSize Vinted).
//   - Adresse (input[name="address"]) : autocomplete Google Places réelle,
//     PAS pré-remplie depuis le compte — même piège que Leboncoin. Taper du
//     texte (setNativeValue + event "input" suffit ici, contrairement à LBC
//     qui ignore cette méthode) affiche une liste de boutons suggestions ; il
//     FAUT cliquer une suggestion pour que la valeur soit retenue (vérifié :
//     le texte tapé seul reste dans le champ mais rien ne prouve qu'il soit
//     validé côté Beebs — même prudence que LBC, on ne prend pas le risque).
//     Pas de réglage d'adresse dédié à Beebs dans l'app : on réutilise
//     platform_settings.leboncoin.adresse (même adresse d'expédition, posée
//     côté app dans ListingPreviewScreen — cf. commentaire à l'insert).
//   - Le bouton "Mettre en vente" n'est JAMAIS désactivé par des champs vides
//     côté client (pas de `disabled`, vérifié) — obligatoire vs facultatif
//     déduit du seul marqueur "(facultatif)" affiché à côté du libellé.
const DRY_RUN = false;

// ── Communication avec le background ────────────────────────────────────────

// typeof guard : permet d'injecter ce fichier tel quel dans une page pour un
// dry-run piloté (hors extension), où chrome.runtime n'existe pas — même
// pattern que ebay.js.
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "DELETE_LISTING") {
      deleteListing(msg.job)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err) }));
      return true; // réponse asynchrone
    }
    if (msg?.type !== "FILL_LISTING") return;

    fillListingForm(msg.job)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err) }));

    return true; // réponse asynchrone
  });
}

// ── Remplissage du formulaire ────────────────────────────────────────────────

/**
 * @param {object} job — cross_post_jobs :
 *   { id, platform, title, description, price, photos, platform_fields }
 *   platform_fields (beebs, posés par l'app via beebsCategories.js) :
 *     { beebsCategoryPath, beebsGenreRequired?, genre?, etat?, marque?,
 *       taille?, couleur?, colors?, matiere?, age?, adresse? }
 *   matiere/couleur/age : produits depuis le 2026-07-09 seulement (prompt
 *   Beebs + stepper) — un job antérieur les aura vides, sans conséquence
 *   (chaque champ est sauté silencieusement s'il est absent).
 */
// ── Suppression d'annonce (Phase B, 2026-07-11) ─────────────────────────────
// Page "Mes annonces" : /fr/account/my-adverts — onglets "Actuellement en
// ligne" / "En cours de vérification" (/my-adverts/creating), champ Rechercher.
// ❌ AFFIRMATION ERRONÉE du 2026-07-11 (relevée sur une page VIDE, corrigée le
// 2026-07-12, cf. relevé réel plus bas) : « la suppression est GROUPÉE, pas par
// carte ; il n'y a pas de bouton Supprimer dans la carte elle-même ». C'est
// FAUX — chaque carte a le sien. La barre groupée existe aussi, et c'est
// précisément le piège : elle agit sur les annonces COCHÉES.
// ⚠️ Contexte historique — DEUX dépôts réels
// (2026-07-11, 21h et 23h23) ont été confirmés par Beebs ("Votre article a
// bien été ajouté à votre dressing"), sont apparus dans "En cours de
// vérification"… puis ont DISPARU des DEUX onglets ("Actuellement en ligne" et
// "En cours de vérification"), sans message ni notification. Le second a été
// re-vérifié 30 min après le dépôt : introuvable. Cause inconnue (rejet
// silencieux de modération ? dépôt web non finalisé sans l'app mobile ?) — à
// élucider AVANT de compter sur Beebs en production, car un job partirait en
// "published" pour une annonce qui n'existe pas.
// RELEVÉ RÉEL 2026-07-12 (1re suppression Beebs jamais exécutée, annonce
// 33607886) — l'ancien code, écrit sur une page VIDE, était faux sur les deux
// points essentiels :
//   1. Il n'y a PAS que la suppression groupée : chaque carte porte sa propre
//      barre « Modifier | Dupliquer | Supprimer » (button.text-coral-main).
//      C'est la voie retenue : scopée à l'annonce, sans dépendre d'un état de
//      sélection. ⚠️ Le « Supprimer » de la barre groupée (« Tout sélectionner
//      | Supprimer ») existe aussi au niveau document — l'ancien
//      findBeebsDelete le trouvait en premier : avec « Tout sélectionner »
//      coché, il aurait VIDÉ LE COMPTE.
//   2. Un MOTIF est obligatoire, et « Vendu via Beebs » est PRÉ-COCHÉ
//      (radio_reason-0). Le laisser = déclarer une vente réalisée sur Beebs.
//      Le code sélectionne explicitement « Vendu via une autre plateforme »
//      (radio_reason-1) — exact pour un job delete, qui n'est armé qu'après
//      une vente réelle ailleurs. Bouton final : « Supprimer l'annonce ».
//   3. La suppression est ASYNCHRONE : la liste reste obsolète quelques
//      secondes après la confirmation (une vérification immédiate conclut à
//      tort à un échec — vécu).
//   4. La propagation va jusqu'à la page PUBLIQUE, avec du retard : celle-ci a
//      continué de répondre 200 (avec bouton d'achat) plusieurs minutes après
//      la suppression — cache CDN — avant de basculer en 404. Ne jamais
//      conclure à un échec sur une lecture immédiate de la page publique.
// ⚠️ DELETE_DRY_RUN : passé à false le 2026-07-12 sur décision de Nico (session
// autonome). Gate Beebs : 1/3 — suppression CONFIRMÉE (disparue de « Mes
// annonces », page publique en 404).
const DELETE_DRY_RUN = false;

async function deleteListing(job) {
  const trace = [];
  const t = (line) => { trace.push(line); console.log(`[beebs][delete] ${line}`); };

  if (!/my-adverts/.test(location.pathname)) {
    return { success: false, error: `Page inattendue pour une suppression Beebs : ${location.href}`, trace };
  }
  t(`page Mes annonces ok : ${location.pathname}`);
  await humanPause(1000, 2200);

  // Repère l'annonce par son titre (le champ Rechercher observé filtrerait
  // aussi, mais un match direct suffit tant que la liste tient sur une page).
  let anchor = null;
  if (job.title) {
    anchor = Array.from(document.querySelectorAll("a, h2, h3, p, span"))
      .find((el) => el.textContent.trim() === job.title.trim()) ?? null;
    if (anchor) t(`annonce trouvée par titre exact : "${job.title}"`);
  }
  if (!anchor && job.listing_url) {
    const slug = String(job.listing_url).split("/").filter(Boolean).pop();
    if (slug) anchor = document.querySelector(`a[href*="${slug}"]`);
    if (anchor) t(`annonce trouvée par slug d'URL : ${slug}`);
  }
  if (!anchor) {
    t(`annonce INTROUVABLE dans Mes annonces (titre="${job.title ?? "?"}")`);
    if (DELETE_DRY_RUN) return { success: true, dryRun: true, found: false, trace };
    return { success: false, error: "Annonce introuvable dans Mes annonces Beebs", trace };
  }

  // Carte = ancêtre qui contient à la fois le titre et la barre d'actions
  // « Modifier | Dupliquer | Supprimer » de CETTE annonce.
  const card = findBeebsCard(anchor);
  if (!card) {
    t("carte englobante (avec sa barre Modifier/Dupliquer/Supprimer) INTROUVABLE");
    if (DELETE_DRY_RUN) return { success: true, dryRun: true, found: false, trace };
    return { success: false, error: "Carte de l'annonce introuvable", trace };
  }

  // Contrôle de suppression DE LA CARTE (button.text-coral-main, sans testid),
  // reconnu par le trio « Modifier / Dupliquer / Supprimer » de son parent.
  const cardDelete = findBeebsCardDelete(card);
  if (!cardDelete) {
    const visible = Array.from(card.querySelectorAll("button"))
      .map((b) => b.textContent.trim()).filter(Boolean).slice(0, 12);
    t(`« Supprimer » de la carte INTROUVABLE — boutons de la carte : ${visible.join(" | ") || "(aucun)"}`);
    if (DELETE_DRY_RUN) return { success: true, dryRun: true, found: false, trace };
    return { success: false, error: "Bouton Supprimer de la carte introuvable", trace };
  }
  t('contrôle localisé : « Supprimer » de la carte (voie par carte, PAS la barre groupée)');

  if (DELETE_DRY_RUN) {
    t("🧪 DELETE_DRY_RUN actif — contrôle localisé, AUCUN clic effectué.");
    return { success: true, dryRun: true, found: true, trace };
  }

  // ── LIVE ────────────────────────────────────────────────────────────────
  cardDelete.scrollIntoView({ block: "center" });
  await humanPause(1000, 1900);
  realClick(cardDelete);

  const dialog = await waitFor(() => {
    return Array.from(document.querySelectorAll('[role="dialog"], [class*="modal" i]'))
      .filter(estVisibleSansLayout)
      .find((d) => /supprimer mon annonce/i.test(texteDe(d))) ?? null;
  }, 10000);
  if (!dialog) return { success: false, error: "Dialogue « Supprimer mon annonce » introuvable", trace };

  // ⚠️ MOTIF OBLIGATOIRE, et « Vendu via Beebs » est PRÉ-COCHÉ par défaut
  // (radio_reason-0) : le laisser tel quel déclarerait à Beebs une vente
  // réalisée CHEZ EUX — faux, et potentiellement facturable. Un job delete
  // n'est armé qu'après une vente RÉELLE sur une AUTRE plateforme (bandeau
  // semi-auto de l'app) : le motif exact est donc radio_reason-1.
  const reasonLabel = "Vendu via une autre plateforme";
  const radio = Array.from(dialog.querySelectorAll('input[type="radio"]')).find((r) => {
    const lab = dialog.querySelector(`label[for="${r.id}"]`);
    return (lab?.textContent || "").trim() === reasonLabel;
  });
  if (!radio) {
    const dispo = Array.from(dialog.querySelectorAll("label")).map((l) => l.textContent.trim());
    return { success: false, error: `Motif « ${reasonLabel} » introuvable (motifs : ${dispo.join(" | ")})`, trace };
  }
  realClick(radio);
  radio.dispatchEvent(new Event("change", { bubbles: true }));
  await humanPause(800, 1500);
  if (!radio.checked) {
    return { success: false, error: "Motif de suppression non sélectionné (état non commité) — abandon", trace };
  }
  t(`motif sélectionné : « ${reasonLabel} » (défaut « Vendu via Beebs » écarté)`);

  const confirmBtn = Array.from(dialog.querySelectorAll("button"))
    .filter(estVisibleSansLayout)
    .find((b) => /^supprimer l['’]annonce$/i.test(texteDe(b)));
  if (!confirmBtn) return { success: false, error: "Bouton « Supprimer l'annonce » introuvable dans le dialogue", trace };

  await humanPause(800, 1600);
  realClick(confirmBtn);
  // La suppression Beebs est ASYNCHRONE : le dialogue se ferme, mais la liste
  // continue d'afficher l'annonce pendant plusieurs secondes (constaté en réel
  // — une première vérification trop rapide conclut à tort à un échec).
  await sleep(6000);
  t("confirmation envoyée — propagation Beebs asynchrone (la liste peut rester obsolète quelques secondes)");
  return { success: true, trace };
}

// ⚠️⚠️ AUCUNE MESURE DE LAYOUT DANS CE FICHIER (2026-07-13, règle produit).
// L'onglet de travail vit dans une fenêtre MINIMISÉE, donc JAMAIS rendue :
// getClientRects() vaut 0 partout, offsetParent est null partout, et innerText
// est VIDE (il dépend du rendu — textContent, non). Filtrer là-dessus ne teste
// pas « est-ce visible ? » mais « la fenêtre est-elle rendue ? » : la réponse est
// toujours non, et le code devient AVEUGLE. C'est très exactement l'échec
// « Carte de l'annonce introuvable » : findBeebsCard cherchait le trio
// Modifier/Dupliquer/Supprimer dans un innerText… toujours vide.
// Les CLICS, eux, fonctionnent parfaitement dans cette fenêtre (prouvé sur eBay :
// les deux annonces ont bien été supprimées). Seule la LECTURE était cassée.
// Le style calculé reste disponible sans layout : c'est le seul critère de
// visibilité utilisable ici.
function estVisibleSansLayout(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    // ⚠️ PAS DE TEST SUR L'ATTRIBUT hidden (2026-07-13, prouvé sur le dialogue
    // eBay « Mettre fin à l'annonce » OUVERT à l'écran — job d4fd6671) : une
    // plateforme peut LAISSER hidden sur un dialogue et l'écraser en CSS
    // (display:flex). Le seul effet réel de hidden est display:none via la
    // feuille UA : le test display ci-dessous couvre déjà les VRAIS hidden ;
    // tester l'attribut rend aveugle sur une modale bel et bien ouverte.
    if (n.getAttribute("aria-hidden") === "true") return false;
    const st = getComputedStyle(n);
    // ⚠️ PAS DE TEST SUR L'OPACITÉ (2026-07-13, prouvé sur la vraie page Beebs).
    // Les animations CSS NE TOURNENT PAS dans une fenêtre non rendue : un élément
    // qui s'ouvre avec une animation « fade-in » reste bloqué sur la 1re keyframe,
    // donc opacity: 0 — POUR TOUJOURS. Mesuré sur le dialogue « Supprimer mon
    // annonce » : data-state="open", display:grid, visibility:visible… et
    // opacity:"0". Le rejeter, c'est se rendre aveugle exactement comme avec
    // getClientRects — c'est ce qui donnait « Dialogue introuvable » alors que le
    // clic avait parfaitement ouvert la modale.
    // display:none / visibility:hidden / aria-hidden restent : ceux-là
    // sont posés explicitement et ne dépendent d'aucune animation.
    if (st.display === "none" || st.visibility === "hidden") return false;
  }
  return true;
}

function texteDe(el) {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

// ⚠️ MANQUAIT DEPUIS TOUJOURS (2026-07-13) : deleteListing appelait realClick —
// nom repris d'ebay.js — alors que ce fichier ne l'a JAMAIS défini. Le flux de
// remplissage, lui, clique avec el.click() : il n'a donc jamais rencontré le
// problème. Et la suppression échouait toujours AVANT (findBeebsCard lisait
// innerText, vide sans rendu), si bien que la ligne fautive n'était jamais
// atteinte : « realClick is not defined » n'est apparu qu'une fois ce premier
// bug corrigé. Un ReferenceError dormant, révélé par le fix qui le précédait.
// Même implémentation qu'ebay.js : la séquence pointer/souris complète, plus
// fidèle qu'un simple .click() sur les composants qui écoutent pointerdown.
function realClick(el) {
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    const Ctor = type.startsWith("pointer") ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, view: window }));
  }
}

// Carte de l'annonce : on remonte jusqu'à l'ancêtre qui porte la barre
// d'actions « Modifier / Dupliquer / Supprimer ». textContent, pas innerText.
function findBeebsCard(anchor) {
  let el = anchor;
  for (let i = 0; i < 10 && el; i++, el = el.parentElement) {
    const txt = texteDe(el);
    if (/Modifier/.test(txt) && /Dupliquer/.test(txt) && /Supprimer/.test(txt)) return el;
  }
  return null;
}

// ⚠️ DANGER MAXIMAL — NE JAMAIS chercher « Supprimer » au niveau document : la
// page porte AUSSI le bouton « Supprimer » de la barre groupée (« Tout
// sélectionner | Supprimer »), qui agit sur les annonces COCHÉES — avec « Tout
// sélectionner » actif, il VIDERAIT LE COMPTE. On ne prend que le bouton DE LA
// CARTE, reconnu par le trio Modifier/Dupliquer/Supprimer de son parent immédiat.
// Cette garde est conservée à l'identique — seule la lecture passe de innerText
// (vide sans rendu) à textContent. Le passage au style calculé ne l'affaiblit
// pas : elle repose sur la STRUCTURE (le parent porte les trois actions de la
// carte), pas sur une mesure d'écran.
function findBeebsCardDelete(card) {
  return Array.from(card.querySelectorAll("button"))
    .filter(estVisibleSansLayout)
    .find((b) => {
      if (texteDe(b) !== "Supprimer") return false;
      const parentTxt = texteDe(b.parentElement);
      return /Modifier/.test(parentTxt) && /Dupliquer/.test(parentTxt);
    }) ?? null;
}

async function fillListingForm(job) {
  console.log("[beebs] fillListingForm — job:", job.id, job.title, DRY_RUN ? "(DRY_RUN)" : "(LIVE)");

  // Session : si Beebs a redirigé vers une page de connexion ou affiche un
  // formulaire d'authentification, on s'arrête AVANT tout remplissage :
  // needsUser (ré-armement borné côté background), aucune interaction sur
  // une page de connexion. Même règle que Vinted/LBC/eBay.
  if (!location.pathname.startsWith("/fr/listing") || document.querySelector('input[type="password"]')) {
    return {
      success: false,
      needsUser: true,
      error:
        "Connexion Beebs requise : se connecter sur beebs.app dans Chrome " +
        "(l'onglet de travail est resté ouvert), le job repartira au prochain passage.",
    };
  }

  const fields = job.platform_fields || {};

  // Fallback explicite : sans chemin de catégorie, l'annonce ne peut pas être
  // publiée sur Beebs — on échoue AVANT de remplir quoi que ce soit, avec un
  // message actionnable. beebsGenreRequired (posé par l'app à la création du
  // job) permet de distinguer genre manquant/non résolu vs icône hors mapping.
  if (!fields.beebsCategoryPath?.length) {
    if (fields.beebsGenreRequired) {
      return {
        success: false,
        error:
          "Genre requis pour cet article : Beebs range la Mode en 5 rayons " +
          "(Femme/Homme/Fille/Garçon/Bébé) et n'a ni rayon « Enfant » générique " +
          "ni rayon « Mixte » (vérifié sur l'arbre complet). Choisir Fille, Garçon " +
          "ou Bébé dans le champ Genre des champs Beebs de l'app, puis régénérer " +
          "le job. Un article réellement unisexe n'est pas publiable sur Beebs.",
      };
    }
    return {
      success: false,
      error:
        "platform_fields.beebsCategoryPath absent — article non mappé vers le catalogue " +
        "Beebs (icône hors périmètre du mapping, ou job antérieur au mapping). " +
        "Régénérer l'annonce depuis l'app, ou compléter src/utils/beebsCategories.js.",
    };
  }

  if (job.photos?.length) await uploadPhotos(job.photos);
  if (job.title) await fillTextField("#title", job.title);
  if (job.description) await fillTextField("#description", job.description);

  await selectCategory(fields.beebsCategoryPath);

  // Dégradation propre : seule la CATÉGORIE (ci-dessus) reste bloquante —
  // sans elle rien n'est publiable. Les champs dynamiques qui suivent sautent
  // avec un warning en cas de libellé introuvable, et sont silencieusement
  // ignorés s'ils ne sont pas affichés pour la catégorie choisie.
  const warnings = [];
  // Champs OBLIGATOIRES (affichés sans "(facultatif)") qu'on n'a pas su
  // remplir : remontés au background, qui refuse de laisser passer un job
  // pour "réussi" sans le dire (cf. BUG 2 du 2026-07-09).
  const unfilledRequired = [];

  // Les champs dynamiques sont injectés APRÈS le choix de la catégorie : sans
  // cette attente, findField ne trouve aucun libellé et TOUS les champs sont
  // sautés en silence (cause probable du dry-run Figurines du 2026-07-09, où
  // le job est remonté dry_run_completed / error:null alors qu'Âge et Matière
  // étaient vides à l'écran). On attend qu'au moins un attribut apparaisse.
  await waitFor(() => document.querySelector('button[class*="__selectButton"]')
    && document.querySelectorAll('div[class*="__label"]').length > 2, 8000);

  // Couleur : même normalisation que Vinted/eBay (colors[] posé par l'app,
  // sinon split de couleur libre) — Beebs n'affiche qu'un choix simple, on
  // ne prend que la dominante.
  const colorValue = fields.colors?.[0] || fields.couleur;
  if (colorValue) await selectDropdownValue("Couleur", colorValue, warnings, unfilledRequired);

  if (fields.marque) await selectDropdownValue("Marque", fields.marque, warnings, unfilledRequired);

  // Pointure (chaussures) et Taille (autre Mode) sont deux libellés distincts
  // selon la catégorie — jamais les deux en même temps, on tente les deux et
  // le champ absent est ignoré silencieusement par selectDropdownValue.
  if (fields.taille) {
    await selectDropdownValue("Pointure", String(fields.taille).replace(/^EU\s*/i, ""), warnings, unfilledRequired, { sizeField: true });
    await selectDropdownValue("Taille", fields.taille, warnings, unfilledRequired, { sizeField: true });
  }

  if (fields.etat) await selectDropdownValue("État", fields.etat, warnings, unfilledRequired);
  if (fields.matiere) await selectDropdownValue("Matière", fields.matiere, warnings, unfilledRequired);

  // Âge : libellé RELEVÉ sur la vraie page (2026-07-09, catégorie Figurines) —
  // "Âge" avec accent, une seule orthographe (l'ancienne double tentative
  // "Âge"/"Age" est retirée). Options relevées, toutes des TRANCHES :
  //   0-6 mois | 6-12 mois | 12-24 mois | 2 ans - 3 ans | 3 ans - 4 ans |
  //   4 ans - 6 ans | 6 ans - 8 ans | 8 ans - 12 ans | 12 ans - 16 ans |
  //   16 ans et +
  // C'est pourquoi le prompt Beebs impose désormais cette liste fermée : la
  // valeur libre "10 ans et plus" produite le 2026-07-09 ne matchait aucun
  // étage de la cascade, et le champ (obligatoire ici) restait vide.
  if (fields.age) await selectDropdownValue("Âge", fields.age, warnings, unfilledRequired);

  // ── Format du colis (2026-07-19, cas réel Medik8) ──────────────────────────
  // PAS toujours pré-rempli par Beebs : vide sur « Hygiène et beauté » (relevé
  // live), l'hypothèse « prefilled » du 16/07 ne tenait que sur certaines
  // catégories. Options RELEVÉES live (7 paliers de poids) mappées depuis le
  // format canonique du job (format_colis, partagé avec LBC) ; défaut prudent
  // 1 kg si aucune donnée. On ne touche JAMAIS une valeur déjà posée par Beebs
  // (pré-remplissage conservé quand il existe).
  const BEEBS_PACKAGE_BY_FORMAT = {
    "Lettre":           "Poids jusqu'à 500g max",
    "Petit colis":      "Poids jusqu'à 1 kg max",
    "Moyen colis":      "Poids jusqu'à 2 kg max",
    "Grand colis":      "Poids jusqu'à 5 kg max",
    "Très grand colis": "Poids jusqu'à 10 kg max",
  };
  const packageField = findField("Format du colis");
  if (packageField) {
    const current = (packageField.trigger.textContent || "").trim();
    if (/poids/i.test(current)) {
      console.log(`[beebs] Format du colis: déjà posé par Beebs ("${current}"), conservé`);
    } else {
      const rawFormat = String(fields.format_colis ?? "").trim();
      // Un libellé palier Beebs DÉJÀ exact (« Poids jusqu'à … ») passe tel
      // quel : c'est ce que produit une sélection faite dans l'app contre une
      // liste relevée (allowed_values du catalogue) — le faire retomber sur le
      // défaut 1 kg trahirait le choix de l'utilisateur (un « 5 kg » choisi
      // partait en 1 kg).
      const mapped =
        BEEBS_PACKAGE_BY_FORMAT[rawFormat] ??
        (/^poids/i.test(rawFormat) ? rawFormat : "Poids jusqu'à 1 kg max");
      if (!BEEBS_PACKAGE_BY_FORMAT[rawFormat] && !/^poids/i.test(rawFormat)) {
        const note = `format du colis: aucune donnée de format exploitable (format_colis="${rawFormat}") — défaut prudent "${mapped}"`;
        console.warn(`[beebs] ⚠️ ${note}`);
        warnings.push(note);
      }
      await selectDropdownValue("Format du colis", mapped, warnings, unfilledRequired);
    }
  }

  // ── Canal GÉNÉRIQUE (chantier champs obligatoires, 1.A/1.B) ────────────────
  // platform_fields.beebsAspects = { "<libellé exact du champ>": "valeur" } —
  // posé par l'app (saisie manuelle du stepper) pour les champs SANS mapping
  // dédié ci-dessus. Les libellés déjà servis sont ignorés (jamais deux poses).
  const handledLabels = new Set(["Couleur", "Marque", "Pointure", "Taille", "État", "Matière", "Âge", "Format du colis"]);
  if (fields.beebsAspects && typeof fields.beebsAspects === "object") {
    for (const [label, value] of Object.entries(fields.beebsAspects)) {
      const val = String(value ?? "").trim();
      if (!val || handledLabels.has(label)) continue;
      await selectDropdownValue(label, val, warnings, unfilledRequired);
    }
  }

  // ── Énumération des requis AFFICHÉS (chantier 2026-07-16, 1.B/1.E) ─────────
  // L'accumulateur unfilledRequired ne voit que les champs qu'on a TENTÉ de
  // remplir : un champ obligatoire jamais tenté (aucune donnée côté app — cas
  // Âge/Matière du dry-run Figurines du 2026-07-09) restait invisible. On
  // énumère donc TOUS les dropdowns affichés : libellé sans « (facultatif) »
  // = obligatoire (seul marqueur Beebs, cf. findField) ; vide = le bouton
  // porte encore son placeholder « Sélectionner… » (relevé réel 2026-07-16,
  // formulaire Baskets femme).
  const enumerated = enumerateBeebsFields();
  for (const f of enumerated) {
    if (f.required && !f.filled && !unfilledRequired.includes(f.label)) {
      unfilledRequired.push(f.label);
    }
  }

  if (job.price != null) await fillPriceField("#price", job.price);

  // Adresse de remise (politique A+C, même contrat que Leboncoin) : absente
  // ou introuvable dans l'autocomplete → needsUser, jamais failed.
  const addressResult = await fillAddress(fields.adresse, warnings);
  if (!addressResult.ok) {
    return {
      success: false,
      needsUser: true,
      error: addressResult.error,
      warnings,
      unfilledRequired,
      discoveredRequired: enumerated,
    };
  }

  // Gate par job (2026-07-11) : DRY_RUN global reste true par défaut ; un job
  // marqué platform_fields.live_run === true (test supervisé) publie vraiment.
  const dryRun = DRY_RUN && job.platform_fields?.live_run !== true;
  if (dryRun) {
    console.log(
      "[beebs] 🧪 DRY_RUN actif — formulaire rempli, « Mettre en vente » NON cliqué.",
      "\nJob:", job.id,
      "\nTitre:", job.title,
      "\nPrix:", job.price,
      "\nChamps plateforme:", fields,
      warnings.length ? `\nWarnings (${warnings.length}): ${warnings.join(" | ")}` : "\nAucun warning.",
      unfilledRequired.length ? `\n⚠️ Champs OBLIGATOIRES non remplis: ${unfilledRequired.join(", ")}` : ""
    );
    return { success: true, dryRun: true, warnings, unfilledRequired, discoveredRequired: enumerated };
  }

  // ── Gate PRÉ-CLIC (règle produit du chantier) : un requis vide ne part
  // JAMAIS en silence — needsUser explicite avec les libellés exacts, l'app
  // les présente en saisie manuelle. Avant ce gate, le job partait en
  // « COMPLÉTÉ AVEC CHAMPS MANQUANTS » : publié quand Beebs tolérait, refus
  // opaque sinon.
  if (unfilledRequired.length) {
    // ── needsUserField (socle needs_user, 2026-07-19) : cas (a) — champ précis
    // identifié. Premier requis vide, un champ à la fois (le suivant re-passera
    // par ce gate). Options : celles relevées à l'ouverture du panneau pendant
    // CE remplissage (listes sans barre de recherche uniquement) — sinon le
    // background complète depuis le catalogue. Cible d'écriture : les libellés
    // couverts par un bloc dédié → champ racine de platform_fields (le canal
    // beebsAspects les SAUTE, cf. handledLabels l.483) ; sinon →
    // beebsAspects.<libellé exact>.
    const BEEBS_DEDICATED_TARGETS = {
      "Couleur": "couleur",
      "Marque": "marque",
      "Pointure": "taille",
      "Taille": "taille",
      "État": "etat",
      "Matière": "matiere",
      "Âge": "age",
      "Format du colis": "format_colis",
    };
    const firstLabel = unfilledRequired[0];
    const firstMeta = enumerated.find((e) => e.label === firstLabel);
    const dedicated = BEEBS_DEDICATED_TARGETS[firstLabel];
    return {
      success: false,
      needsUser: true,
      error:
        `Beebs exige des champs encore vides pour cette catégorie : ${unfilledRequired.join(", ")}. ` +
        "Compléter ces champs dans l'app (copie Beebs), puis relancer la publication.",
      warnings,
      unfilledRequired,
      discoveredRequired: enumerated,
      needsUserField: {
        field_key: firstLabel,
        field_label: firstLabel,
        target: dedicated ? { root: null, key: dedicated } : { root: "beebsAspects", key: firstLabel },
        // input_type (2026-07-22) : dit à l'app que ce champ est FERMÉ côté
        // Beebs. Sans lui, un champ dont on n'a pas pu relever les options
        // arrivait dans le mini-éditeur indistinguable d'un champ libre, et
        // s'affichait en saisie texte — violation directe du principe du 19/07
        // (cas réel : robe Camaïeu, « Taille » en texte libre alors que Beebs
        // n'accepte qu'une valeur de sa liste ; ce qu'on y tape ne peut que
        // repartir en échec). TOUS les champs dynamiques Beebs sont des
        // dropdowns (enumerateBeebsFields ne relève que des __selectButton) :
        // l'absence d'options est une lacune de NOTRE relevé, jamais la preuve
        // que le champ serait libre.
        input_type: firstMeta?.inputType ?? "dropdown",
        ...(Array.isArray(firstMeta?.options) && firstMeta.options.length
          ? { allowed_values: firstMeta.options }
          : {}),
      },
    };
  }

  // ── Garde-fou pré-submit (2026-07-18, garde systémique 4 plateformes) ──────
  // Un HTTP 200 ne garantit RIEN sur le contenu réellement envoyé. On relit le
  // DOM juste avant le clic pour confirmer que le prix (champ le plus sujet au
  // vidage silencieux, cf. bug prix Vinted du même soir) est présent et non nul
  // — sinon échec HONNÊTE plutôt qu'un dépôt sans prix. Titre et catégorie sont
  // garantis en amont (progression du wizard + gate requis ci-dessus).
  if (job.price != null) {
    const priceEl = document.querySelector("#price");
    const priceNum = Number(String(priceEl?.value ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
    if (!priceEl || !Number.isFinite(priceNum) || priceNum <= 0) {
      return {
        success: false, needsUser: true, warnings, unfilledRequired, discoveredRequired: enumerated,
        error: `Prix absent ou nul dans le formulaire Beebs au moment du dépôt (#price = "${priceEl?.value ?? "introuvable"}") — dépôt annulé pour éviter une annonce sans prix.`,
      };
    }
  }

  const publishBtn = document.querySelector('button[type="submit"]');
  publishBtn?.click();

  // ── PREUVE DE DÉPÔT (2026-07-13) ────────────────────────────────────────────
  // AVANT : on renvoyait success:true juste après le clic, sans RIEN vérifier —
  // le même « published sans preuve » que celui corrigé sur Vinted et eBay. Un
  // refus de validation serait passé pour une publication.
  // MAINTENANT : on attend la CONFIRMATION DE DÉPÔT de Beebs (« Votre article a
  // bien été ajouté à votre dressing Beebs, il sera mis en ligne dès qu'il aura
  // été vérifié par notre équipe », ou l'atterrissage sur /listing/success).
  //
  // ⚠️ Le dépôt confirmé est le SEUL succès qu'on puisse attendre ici, et c'est
  // suffisant (règle Nico, 2026-07-13) : l'annonce part en MODÉRATION, elle
  // n'est donc ni en ligne ni listée dans « Mes annonces » à cet instant.
  // listingUrl reste null — ce n'est PAS une erreur, la re-capture différée
  // côté background ira le chercher plus tard.
  const proof = await waitForBeebsDeposit();
  if (!proof.ok) return { success: false, error: proof.error, warnings, unfilledRequired, discoveredRequired: enumerated };

  console.log(`[beebs] dépôt CONFIRMÉ (${proof.preuve}) — annonce en modération, listing_url différé`);
  return { success: true, listingUrl: null, warnings, unfilledRequired, discoveredRequired: enumerated };
}

// Relevé de TOUS les champs dynamiques affichés pour la catégorie courante —
// nourrit unfilledRequired (requis jamais tentés) et le catalogue cumulatif
// platform_category_aspects côté background. Marqueurs relevés en réel le
// 2026-07-16 (formulaire Baskets femme) :
//   - libellé : div[class*="__label"], suffixe « (facultatif) » = optionnel ;
//   - vide : le bouton porte le placeholder « Sélectionner une valeur » ;
//   - pré-rempli par Beebs (Format du colis) : texte ≠ placeholder.
// La Catégorie elle-même est exclue (gérée en bloquant par selectCategory).
function enumerateBeebsFields() {
  const out = [];
  for (const l of document.querySelectorAll('div[class*="__label"]')) {
    const btn = l.parentElement?.querySelector('button[class*="__selectButton"]');
    if (!btn) continue;
    const text = l.textContent.trim();
    const label = text.replace(/\s*\(facultatif\)\s*/i, "").trim();
    if (!label || /^catégorie$/i.test(label)) continue;
    const value = (btn.textContent || "").trim();
    out.push({
      key: label,
      label,
      required: !/\(facultatif\)/i.test(text),
      inputType: "dropdown",
      filled: Boolean(value) && !/^sélectionner/i.test(value),
      // Options complètes relevées à l'ouverture du panneau pendant CE
      // remplissage (listes sans recherche uniquement, cf. selectDropdownValue)
      // → allowed_values du catalogue, comme la config attributes Vinted.
      options: beebsObservedOptions[label] ?? undefined,
      source: "dom",
    });
  }
  return out;
}

// Options complètes observées par champ pendant le remplissage courant
// (libellé → libellés d'options). Rempli par selectDropdownValue, consommé par
// enumerateBeebsFields → catalogue platform_category_aspects.allowed_values.
const beebsObservedOptions = {};

// Confirmation de dépôt Beebs : page de succès OU message de confirmation.
// ⚠️ Aucun filtre par getClientRects()/offsetParent : l'onglet de travail vit
// dans une fenêtre minimisée, donc SANS LAYOUT — tous les rects y valent 0, même
// pour du texte bel et bien affiché (leçon du 2026-07-13). textContent, lui,
// est fiable sans rendu.
async function waitForBeebsDeposit(timeoutMs = 30_000) {
  const CONFIRME = /bien été ajouté à (?:votre|ton) dressing|sera mis en ligne dès qu|en cours de vérification/i;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (/\/listing\/success/i.test(location.pathname)) {
      return { ok: true, preuve: `redirection vers ${location.pathname}` };
    }
    const txt = (document.body?.textContent || "").replace(/\s+/g, " ");
    const m = txt.match(CONFIRME);
    if (m) return { ok: true, preuve: `message « ${m[0]} »` };
    await sleep(1000);
  }

  return {
    ok: false,
    error:
      "Dépôt Beebs non confirmé : ni redirection vers /listing/success, ni message de confirmation " +
      `après ${timeoutMs / 1000} s. L'annonce n'a PAS été considérée comme déposée (jamais de ` +
      "« published » sans preuve) — le job repartira au prochain passage.",
  };
}

// ── Helpers génériques ───────────────────────────────────────────────────────

// ── Timers non throttlés (fix campagne de test 2026-07-08) ──────────────────
// L'onglet de travail est TOUJOURS en arrière-plan en production (créé
// active:false par le background) : Chrome clampe alors les setTimeout de la
// page à 1/s, puis 1/min après 5 min cachée (intensive throttling) — un
// remplissage passait à >10 min, au-delà des 120 s de sendMessageToTab côté
// background (échec systématique constaté). Les timers des dedicated workers
// ne subissent pas ce clamp : le délai court dans le worker, la page ne fait
// que recevoir le postMessage. Un setTimeout page reste armé en parallèle
// (premier arrivé gagne) : filet si le CSP de la plateforme bloque les blob
// workers — on retombe alors sur la lenteur d'origine, jamais sur un blocage.
const __timerWorker = (() => {
  try {
    const blob = new Blob(["onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)"], { type: "application/javascript" });
    const w = new Worker(URL.createObjectURL(blob));
    w.onerror = () => {};
    return w;
  } catch {
    return null;
  }
})();
const __timerCallbacks = new Map();
let __timerSeq = 0;
if (__timerWorker) {
  __timerWorker.onmessage = (e) => {
    const cb = __timerCallbacks.get(e.data);
    __timerCallbacks.delete(e.data);
    cb?.();
  };
}
function sleep(ms) {
  return new Promise((resolve) => {
    let done = false;
    const id = __timerWorker ? ++__timerSeq : null;
    const finish = () => {
      if (done) return;
      done = true;
      if (id != null) __timerCallbacks.delete(id);
      resolve();
    };
    if (id != null) {
      __timerCallbacks.set(id, finish);
      __timerWorker.postMessage({ id, ms });
    }
    setTimeout(finish, ms);
  });
}

// ── Timing humain (fix blocage anti-bot 2026-07-09) ─────────────────────────
// Un blocage "Accès temporairement restreint" ("vous surfez et cliquez à une
// vitesse surhumaine") a été déclenché sur Leboncoin par un remplissage
// instantané. Deux signaux de bot évidents, présents sur les 4 handlers :
//   - valeur posée en UNE fois (setter natif + event "input"), aucune séquence
//     clavier — un champ de 60 caractères se remplissait en 0 ms ;
//   - rythme mécanique : exactement CLICK_DELAY (250 ms) entre chaque action.
// On remplace donc les délais fixes par des tirages aléatoires (humanPause) et
// la pose de valeur en bloc par une frappe caractère par caractère (typeHuman)
// encadrée de keydown/keypress/keyup.
//
// ⚠️ Tous les délais passent par sleep() — donc par le timer Web Worker non
// clampé ci-dessus. Le timing humain reste ainsi valide dans un onglet caché,
// où setTimeout serait bridé à 1/s. Ne JAMAIS remplacer ces sleep() par des
// setTimeout (c'est aussi pourquoi les boucles de polling plus bas ont été
// converties de setTimeout à sleep).
const HUMAN_CHAR_MIN = 80, HUMAN_CHAR_MAX = 250;
const HUMAN_ACTION_MIN = 300, HUMAN_ACTION_MAX = 900;
// Au-delà de ce seuil (description générée : plusieurs centaines de
// caractères), la frappe caractère par caractère coûterait des minutes et
// ferait exploser le budget de sendMessageToTab. On insère alors par blocs
// espacés d'une pause humaine.
const HUMAN_TYPE_MAX_CHARS = 120;
const HUMAN_CHUNK_CHARS = 40;

const randInt = (min, max) => Math.round(min + Math.random() * (max - min));
const humanPause = (min = HUMAN_ACTION_MIN, max = HUMAN_ACTION_MAX) => sleep(randInt(min, max));

// Événements clavier synthétiques : ils n'insèrent aucun texte (c'est
// setNativeValue qui le fait) mais ils donnent aux écouteurs de la page la
// séquence qu'une vraie frappe produit.
function dispatchKey(el, type, char) {
  el.dispatchEvent(new KeyboardEvent(type, {
    key: char, bubbles: true, cancelable: true, composed: true,
  }));
}

async function typeHuman(el, text) {
  el.focus();
  setNativeValue(el, "");
  const str = String(text);

  if (str.length <= HUMAN_TYPE_MAX_CHARS) {
    for (const char of str) {
      dispatchKey(el, "keydown", char);
      dispatchKey(el, "keypress", char);
      setNativeValue(el, el.value + char);
      dispatchKey(el, "keyup", char);
      await sleep(randInt(HUMAN_CHAR_MIN, HUMAN_CHAR_MAX));
    }
    return;
  }
  for (let i = 0; i < str.length; i += HUMAN_CHUNK_CHARS) {
    const chunk = str.slice(i, i + HUMAN_CHUNK_CHARS);
    dispatchKey(el, "keydown", chunk[0]);
    setNativeValue(el, el.value + chunk);
    dispatchKey(el, "keyup", chunk[chunk.length - 1]);
    await humanPause();
  }
}

function waitForElement(selector, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Élément introuvable: ${selector}`));
    }, timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// Assigne une valeur à un input/textarea contrôlé par React en déclenchant le
// setter natif + les events "input"/"change" — confirmé suffisant sur Beebs
// (titre, prix, adresse : les suggestions d'autocomplete se déclenchent bien),
// contrairement à Leboncoin qui ignore cette méthode.
function setNativeValue(element, value) {
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function fillTextField(selector, value) {
  const el = await waitForElement(selector);
  await typeHuman(el, value);
  el.blur();
  await humanPause();
}

// ⚠️ EXCEPTION VOLONTAIRE au timing humain (2026-07-09) : typeHuman concatène
// sur el.value. Sur un champ à masque monétaire, relire une valeur déjà
// reformatée par la page produit une chaîne invalide (bug "NaN €" vécu sur le
// prix Vinted). Le comportement du champ prix Beebs n'a jamais été relevé : on
// garde la pose en un coup, qui n'est de toute façon pas le signal de vitesse
// à l'origine du blocage (2 à 4 caractères), encadrée de pauses humaines.
async function fillPriceField(selector, value) {
  const el = await waitForElement(selector);
  await humanPause();
  el.focus();
  setNativeValue(el, String(value));
  el.blur();
  await humanPause();
}

// ── Champs dynamiques (Marque/Couleur/Pointure/Taille/État/Matière) ─────────
// Tous partagent le même composant DropDown (bouton précédé d'un libellé
// texte) et la même liste de valeurs (AttributeDropDown). Un champ absent
// pour la catégorie couramment choisie n'est pas une erreur : on retourne
// simplement sans rien faire, aucun warning.

// Retourne { trigger, required } ou null si le champ n'est pas affiché pour la
// catégorie courante.
//
// `required` : Beebs ne pose AUCUN attribut aria/disabled — le seul marqueur
// est le suffixe "(facultatif)" dans le libellé (relevé, cf. en-tête). Un
// champ affiché SANS ce suffixe est donc obligatoire : c'est ce qui alimente
// unfilledRequired quand on n'arrive pas à le remplir.
function findField(labelText) {
  // Le suffixe "(facultatif)" vit dans un span[class*="__optionalAttribute"]
  // enfant (ex: Couleur) — ne PAS filtrer sur children.length === 0, ça
  // exclurait justement les champs facultatifs (bug réel trouvé en dry-run :
  // Couleur n'était jamais rempli). Le textContent complet ("Couleur
  // (facultatif)") reste un bon terrain de départ.
  const labels = document.querySelectorAll('div[class*="__label"]');
  for (const l of labels) {
    const text = l.textContent.trim();
    if (text === labelText || text.startsWith(`${labelText} `) || text.startsWith(`${labelText}(`)) {
      const btn = l.parentElement?.querySelector('button[class*="__selectButton"]');
      if (btn) return { trigger: btn, required: !/\(facultatif\)/i.test(text) };
    }
  }
  return null;
}

// Match en cascade, du plus sûr au plus permissif — mêmes règles que Vinted
// (l'IA génère du texte libre qui ne colle pas toujours aux options Beebs) :
//   1. exact (texte entier)
//   2. option ⊂ valeur, en mots entiers, la plus longue option gagne
//   2bis. valeur ⊂ option, en mots entiers, l'option la plus courte gagne
//   3. composants (texte éclaté sur "et"/","/"&"/"+"/"/")
// Ponctuation retirée en plus des accents : les états Beebs s'écrivent avec
// une virgule ("Neuf, sans étiquette") là où l'app dit "Neuf sans étiquette"
// — sans ça, aucun étage de la cascade ne matche (relevé campagne 2026-07-08).
const normalizeFuzzy = (s) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.,]/g, "");

function containsAsWords(hay, needle) {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(hay);
}

// Libellé court d'une option : span[class*="__value"] enfant si présent
// (toujours le cas pour AttributeDropDown), sinon le textContent complet du
// bouton — le fallback ne sert qu'en cas de changement de structure DOM.
function optionLabel(el) {
  const span = el.querySelector('span[class*="__value"]:not([class*="__values"])');
  return (span ?? el).textContent.trim();
}

// ⚠️ `els` est la liste des options DU PANNEAU OUVERT, pas un querySelectorAll
// global (cf. openPanelOptions) : les panneaux Beebs sont rendus dans un
// portail hors du wrapper du champ, et plusieurs peuvent rester ouverts en
// même temps — chercher globalement faisait matcher la valeur d'un champ sur
// les options d'un autre (relevé du 2026-07-09 : 16 boutons visibles à la
// fois, 10 d'Âge + 6 de Matière).
// ── Garde anti-nombre-nu (2026-07-15, chantier tailles enfant) ──────────────
// Sur un champ TAILLE/POINTURE uniquement (opts.sizeField) : les grilles
// enfant sont des chaînes combinées qui CONTIENNENT des nombres nus
// (« 3 ans (94-102 cm) » ⊃ « 3 ») et les tailles adultes/pointures sont des
// nombres nus CONTENUS dans ces chaînes (« 36 » ⊂ « 36 mois »). Sans garde,
// la cascade peut poser une taille FAUSSE en silence dans les deux sens.
// Règle : pour un nombre nu, seul l'EXACT fait foi — tout match par
// CONTENANCE dont le côté contenu est purement numérique est rejeté (le
// champ reste alors vide avec warning, jamais faux). « EU 31 » garde son
// chemin : exact après retrait du préfixe, borné à l'exact. Les champs non
// taille sont strictement inchangés.
const PURE_NUMBER_RE = /^\d+(?:[.,]\d+)?$/;

function findOptionCascade(els, text, { sizeField = false } = {}) {
  const options = Array.from(els)
    .map((el) => {
      const label = optionLabel(el);
      return { el, label, norm: normalizeFuzzy(label) };
    })
    .filter((o) => o.norm);
  if (!options.length) return null;
  const target = normalizeFuzzy(text);

  const exact = options.find((o) => o.norm === target);
  if (exact) return { ...exact, stage: "exact" };

  // Pointure « EU 31 » → option « 31 » : exact après préfixe, PAS du fuzzy.
  if (sizeField) {
    const stripped = target.replace(/^(?:eu|pointure)\s+/, "");
    if (stripped !== target) {
      const exactStripped = options.find((o) => o.norm === stripped);
      if (exactStripped) return { ...exactStripped, stage: "exact-pointure" };
    }
  }
  const sizeGuardOk = (contained) => !sizeField || !PURE_NUMBER_RE.test(contained);

  const optionInTarget = (t) =>
    options.filter((o) => containsAsWords(t, o.norm) && sizeGuardOk(o.norm)).sort((a, b) => b.norm.length - a.norm.length)[0];
  const fuzzy = optionInTarget(target);
  if (fuzzy) return { ...fuzzy, stage: "fuzzy" };

  const targetInOption = (t) =>
    options.filter((o) => containsAsWords(o.norm, t) && sizeGuardOk(t)).sort((a, b) => a.norm.length - b.norm.length)[0];
  const inverse = targetInOption(target);
  if (inverse) return { ...inverse, stage: "fuzzy-inverse" };

  const components = target.split(/\s+et\s+|[,&+/]/).map((c) => c.trim()).filter(Boolean);
  if (components.length > 1) {
    for (const comp of components) {
      if (sizeField && PURE_NUMBER_RE.test(comp)) continue; // fragment numérique nu : jamais fiable pour une taille
      const compExact = options.find((o) => o.norm === comp);
      if (compExact) return { ...compExact, stage: "composant" };
      const compFuzzy = optionInTarget(comp) || targetInOption(comp);
      if (compFuzzy) return { ...compFuzzy, stage: "composant" };
    }
  }
  return null;
}

// (waitForValueCascade supprimé le 2026-07-09 : il cherchait dans TOUS les
// panneaux ouverts. L'attente des options vit désormais dans openPanelOptions,
// qui n'expose que celles du panneau qu'il vient d'ouvrir. Polling toujours
// via sleep() — timer Web Worker non clampé dans l'onglet caché.)

// Polling générique d'une condition (retourne null au timeout, ne rejette
// pas) — même contrat que leboncoin.js.
async function waitFor(fn, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = fn();
    if (v) return v;
    await sleep(120);
  }
  return null;
}

const VALUE_OPTION_SELECTOR = 'button[class*="__valueButton"]';
const allValueOptions = () => Array.from(document.querySelectorAll(VALUE_OPTION_SELECTOR));
// ⚠️ Le panneau est un PORTAIL : il n'est pas descendant du bouton, aucun
// scope DOM n'est possible. Le seul « scope au panneau ouvert » qui ait un sens
// ici est DIFFÉRENTIEL — l'élément apparu APRÈS le clic est le nôtre. C'est
// déjà la technique employée pour les options ; on l'applique aussi à la barre
// de recherche, au lieu du document.querySelector global d'avant (2026-07-22)
// qu'un champ de recherche situé ailleurs dans la page aurait suffi à tromper.
const SEARCH_INPUT_SELECTOR = 'input[class*="__searchBarInput"]';

// Ouvre le panneau du champ et retourne UNIQUEMENT ses options.
//
// Le panneau n'est pas un descendant du bouton (portail) : impossible de le
// scoper par le DOM. On procède donc par DIFFÉRENTIEL — les options présentes
// avant le clic ne sont pas les nôtres, les nouvelles le sont.
async function openPanelOptions(trigger, rawText, timeoutMs = 4000, { label = null } = {}) {
  const before = new Set(allValueOptions());
  const searchBefore = new Set(document.querySelectorAll(SEARCH_INPUT_SELECTOR));
  await humanPause();
  trigger.click(); // ⚠️ BASCULE : re-cliquer ferme le panneau (cf. closePanel)
  await humanPause();

  const fraiches = () => allValueOptions().filter((el) => !before.has(el));
  const attendreFraiches = async (ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const f = fraiches();
      if (f.length) return f;
      await sleep(80);
    }
    return [];
  };

  // ── RELEVÉ NON FILTRÉ, AVANT TOUTE FRAPPE (2026-07-22) ────────────────────
  // À l'ouverture, le panneau affiche la liste COMPLÈTE. Dès qu'on tape dans la
  // barre de recherche, elle est filtrée — et c'est pour ça que les listes
  // longues n'étaient JAMAIS cataloguées : l'ancien code ne relevait les
  // options qu'après la frappe, puis refusait de les mémoriser en constatant la
  // présence d'une barre (à raison : une liste filtrée est partielle et
  // empoisonnerait le catalogue). Résultat mesuré en base : 64 des 81 champs
  // obligatoires Beebs sans la moindre valeur, dont « Taille » sur les robes
  // femme, les 4 catégories bébé, fille, garçon — donc saisie libre côté app,
  // en violation du principe du 19/07.
  // On relève donc MAINTENANT, avant de taper. Le catalogue ne reçoit ainsi que
  // des listes complètes : la garantie « jamais de liste partielle » n'est plus
  // portée par un test fragile mais par l'ORDRE des opérations.
  const searchNouveau = Array.from(document.querySelectorAll(SEARCH_INPUT_SELECTOR))
    .find((el) => !searchBefore.has(el)) ?? null;
  // Budget court quand il y a une barre : on ne veut pas retarder la frappe de
  // 4 s à chaque champ. Sans barre, l'attente EST celle du chemin nominal.
  const completes = await attendreFraiches(searchNouveau ? 2500 : timeoutMs);
  if (label && completes.length) {
    beebsObservedOptions[label] = completes.map(optionLabel).filter(Boolean).slice(0, 60);
  }

  // Pas de barre de recherche : la liste affichée EST la liste complète.
  if (!searchNouveau) return completes;

  await typeHuman(searchNouveau, String(rawText));
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const f = fraiches();
    if (f.length) return f;
    await sleep(80);
  }
  return [];
}

// document.body.click() NE FERME PAS le panneau (vérifié le 2026-07-09 : les
// options restaient dans le DOM et polluaient le champ suivant). Escape non
// plus. Le seul geste qui ferme est un second clic sur le déclencheur.
async function closePanel(trigger) {
  trigger.click();
  await humanPause();
}

// Re-recherche dans le panneau DÉJÀ OUVERT (2026-07-19) : quand la recherche
// initiale a filtré la liste à zéro, on vide la barre et on cherche `query`
// (le bac générique « Autre »). Options prises par VISIBILITÉ (offsetParent)
// et non par différentiel : React réutilise les mêmes éléments de bouton au
// re-filtrage, le différentiel d'openPanelOptions ne voit alors rien de neuf.
async function researchPanelFor(trigger, query) {
  // Ici le panneau est DÉJÀ ouvert : le différentiel n'a plus de sens (rien de
  // nouveau n'apparaît), le sélecteur global reste le seul moyen d'atteindre la
  // barre. Acceptable : on ne s'en sert que pour re-filtrer un panneau qu'on
  // vient soi-même d'ouvrir, et jamais pour décider ce qui entre au catalogue.
  const search = document.querySelector(SEARCH_INPUT_SELECTOR);
  if (!search) return [];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(search, "");
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(300);
  await typeHuman(search, query);
  const fresh = await waitFor(() => {
    const vis = allValueOptions().filter((el) => el.offsetParent !== null);
    return vis.length ? vis : null;
  }, 4000);
  return fresh ?? [];
}

/**
 * @param {string[]} unfilledRequired — accumulateur : reçoit le libellé du
 *   champ si celui-ci est OBLIGATOIRE (pas de "(facultatif)") et qu'on n'a pas
 *   réussi à lui donner une valeur. Un job ne doit jamais se déclarer réussi
 *   en laissant un champ obligatoire vide (cf. background.js).
 */
async function selectDropdownValue(labelText, rawText, warnings, unfilledRequired = [], { sizeField = false } = {}) {
  const field = findField(labelText);
  if (!field) return; // champ non affiché pour cette catégorie : rien à signaler
  const { trigger, required } = field;

  // Le relevé pour le catalogue se fait DANS openPanelOptions, à l'ouverture du
  // panneau et avant toute frappe (2026-07-19 pour le principe — cas Medik8 où
  // « État » bloquait sans que personne ne sache les valeurs acceptées ;
  // 2026-07-22 pour l'ordre des opérations, qui étend enfin le relevé aux
  // listes longues). Plus aucun test « y a-t-il une barre de recherche ? » ici :
  // il ne servait qu'à écarter les listes filtrées, ce que l'ordre garantit
  // désormais — et il le faisait sur un document.querySelector GLOBAL, donc
  // faux dès qu'une autre barre de recherche existait dans la page.
  let options = await openPanelOptions(trigger, rawText, 4000, { label: labelText });
  let researchedFallback = false;
  if (!options.length && !sizeField) {
    // Recherche sans AUCUN résultat (cas réel Medik8 2026-07-19 : la barre de
    // recherche Marque filtre le catalogue — orienté puériculture — à ZÉRO
    // option pour une marque beauté). L'ancien code sortait ici, AVANT le
    // repli « Autre » pourtant catalogué (vérifié live : chercher « Autre »
    // le fait apparaître). On re-cherche donc le bac générique pour
    // l'atteindre — jamais pour une taille (valeur fausse, pas un bac).
    options = await researchPanelFor(trigger, "Autre");
    researchedFallback = options.length > 0;
  }
  if (!options.length) {
    const note = `${labelText}: panneau d'options resté vide (recherche "${rawText}" sans résultat, repli "Autre" introuvable), champ laissé vide`;
    console.warn(`[beebs] ⚠️ ${note}`);
    warnings.push(note);
    if (required) unfilledRequired.push(labelText);
    await closePanel(trigger);
    return;
  }
  if (researchedFallback) {
    console.log(`[beebs] ${labelText}: "${rawText}" hors catalogue — repli sur le bac générique de la liste`);
  }

  let match = findOptionCascade(options, rawText, { sizeField });

  // Repli "Autre" : la liste des matières est PAR CATÉGORIE et ne contient pas
  // toutes les matières du monde (Figurines : Plastique | Bois | Caoutchouc |
  // Tissu | Carton | Autre — "Résine" n'y est pas, cas réel du 2026-07-09).
  // Quand Beebs offre lui-même un bac générique, l'utiliser vaut mieux que
  // laisser vide un champ obligatoire. On ne l'invente pas : on ne le prend
  // que s'il figure dans les options relevées à l'écran.
  let usedFallback = false;
  // Jamais de repli « Autre » pour une TAILLE : poser « Autre » à la place
  // d'une taille absente serait une valeur fausse, pas un bac générique.
  if (!match && !sizeField) {
    const autre = options.find((el) => normalizeFuzzy(optionLabel(el)) === "autre");
    if (autre) {
      match = { el: autre, label: optionLabel(autre), stage: "repli-autre" };
      usedFallback = true;
    }
  }

  if (!match) {
    // Le warning porte les options RÉELLEMENT affichées : c'est ce relevé qui
    // permet de corriger la valeur envoyée (même méthode que leboncoin.js et
    // vinted.js).
    const available = options.map(optionLabel).filter(Boolean).slice(0, 20);
    const note =
      `${labelText}: "${rawText}" sans correspondance (même approximative) dans la liste Beebs, ` +
      `champ laissé vide. Options affichées: ${JSON.stringify(available)}`;
    console.warn(`[beebs] ⚠️ ${note}`);
    warnings.push(note);
    if (required) unfilledRequired.push(labelText);
    await closePanel(trigger);
    return;
  }

  await humanPause(); // temps de "lecture" de la liste avant le clic
  match.el.click();
  await humanPause();

  // Sélectionner une option ferme le panneau (relevé) ; si ce n'était pas le
  // cas, la fermeture par bascule ci-dessous éviterait de polluer le champ
  // suivant. On ne la déclenche que si des options traînent encore.
  if (allValueOptions().length) await closePanel(trigger);

  if (match.stage !== "exact") {
    const note = usedFallback
      ? `${labelText}: "${rawText}" absent de la liste Beebs → repli sur l'option générique "Autre"`
      : `${labelText}: "${rawText}" → option Beebs "${match.label}" (match ${match.stage})`;
    console.warn(`[beebs] ≈ ${note}`);
    warnings.push(note);
  }
}

// ── Catégorie (cascade) ───────────────────────────────────────────────────────
// path = ["Mode", "Femme", "Chaussures (femme)", "Baskets (femme)"] par ex.
// Chaque niveau est un bouton dans le panneau ouvert ; une feuille terminale
// porte un input[type=checkbox] — la cliquer sélectionne ET ferme le panneau
// en un seul geste (pas de bouton "Fait" à chercher, contrairement à Vinted).
const CATEGORY_OPTION_SELECTOR = 'button[class*="__category"]';

// ⚠️ Fenêtre de travail jamais rendue (règle produit) : lecture d'état par
// textContent + getComputedStyle UNIQUEMENT — getClientRects/innerText
// dépendent du layout et renvoient vide/0 en onglet caché, ce qui fabrique
// des faux « introuvable ».
function visibleCategoryLabels(limit = 30) {
  return Array.from(document.querySelectorAll(CATEGORY_OPTION_SELECTOR))
    .map((o) => o.textContent.trim())
    .filter(Boolean)
    .slice(0, limit);
}

// Cascade du plus sûr au plus permissif : exact → normalisé (minuscules,
// accents et ponctuation retirés, trim) → contains. En cas de contains
// multiple, l'option la plus courte gagne (la plus proche du libellé cherché).
function matchCategoryOption(options, text) {
  const wanted = text.trim();
  const exact = options.find((o) => o.textContent.trim() === wanted);
  if (exact) return { el: exact, stage: "exact" };
  const target = normalizeFuzzy(wanted);
  const norm = options.find((o) => normalizeFuzzy(o.textContent) === target);
  if (norm) return { el: norm, stage: "normalisé" };
  const contains = options
    .filter((o) => normalizeFuzzy(o.textContent).includes(target))
    .sort((a, b) => a.textContent.trim().length - b.textContent.trim().length)[0];
  if (contains) return { el: contains, stage: "contains" };
  return null;
}

// On ne conclut JAMAIS sur une liste vide (2026-07-23/24, vécu sur casquette
// et articles enfant : « niveau "Mode" introuvable, options: [] » alors que le
// chemin est conforme au crawl complet du 09/07). Une liste vide veut dire
// qu'on n'a RIEN lu (panneau non rendu, clic avalé, re-render, sélecteur
// périmé) — pas que le mapping est faux. D'où le polling 250 ms / 10 s et
// DEUX échecs distincts :
//   - liste jamais non vide  → problème de LECTURE, beebsCategories.js sain ;
//   - liste lue, libellé absent → problème de MAPPING, liste brute à l'appui.
async function waitForCategoryOption(text, { path = [], level = 0, timeoutMs = 10000, pollMs = 250 } = {}) {
  const start = Date.now();
  let lastNonEmpty = null; // dernière liste NON VIDE lue pendant le polling
  while (Date.now() - start < timeoutMs) {
    const options = Array.from(document.querySelectorAll(CATEGORY_OPTION_SELECTOR));
    if (options.length) {
      lastNonEmpty = options.map((o) => o.textContent.trim()).filter(Boolean).slice(0, 30);
      const match = matchCategoryOption(options, text);
      if (match) return match;
    }
    await sleep(pollMs);
  }
  const contexte =
    `niveau ${level + 1}/${path.length} ("${text}"), chemin attendu ${JSON.stringify(path)}, ` +
    `sélecteur ${CATEGORY_OPTION_SELECTOR}`;
  if (!lastNonEmpty) {
    throw new Error(
      `Catégorie: aucune option lue en ${Math.round(timeoutMs / 1000)}s — ${contexte}. ` +
      "Problème de lecture/rendu (panneau non ouvert, clic avalé ou sélecteur périmé), " +
      "PAS un problème de catalogue : ne pas corriger beebsCategories.js. " +
      "Le job repartira au prochain passage."
    );
  }
  throw new Error(
    `Catégorie: libellé absent de la liste lue — ${contexte}. ` +
    `Options réellement affichées par Beebs: ${JSON.stringify(lastNonEmpty)}. ` +
    "Corriger le chemin dans beebsCategories.js."
  );
}

async function selectCategory(path) {
  const trigger = findField("Catégorie")?.trigger;
  if (!trigger) throw new Error("Catégorie: bouton de sélection introuvable sur la page.");

  // Ouverture avec DÉTECTION D'EFFET (2026-07-23) — même parade que le clic
  // eBay avalé (Medik8 R2) : un clic sur le trigger peut être perdu dans un
  // re-render React, le panneau ne s'ouvre jamais et le 1er niveau échouait en
  // « "Mode" introuvable, options: [] ». On ne considère le panneau ouvert que
  // si des options sont RENDUES ; sinon on re-clique (3 tentatives).
  let ouvert = false;
  for (let tentative = 0; tentative < 3 && !ouvert; tentative++) {
    await humanPause();
    trigger.click();
    await humanPause();
    const echeance = Date.now() + 2500;
    while (Date.now() < echeance) {
      if (document.querySelectorAll(CATEGORY_OPTION_SELECTOR).length) { ouvert = true; break; }
      await sleep(100);
    }
    if (!ouvert) console.warn(`[beebs] panneau catégorie non rendu après le clic ${tentative + 1}/3 — re-clic`);
  }
  if (!ouvert) {
    throw new Error(
      "Catégorie: le panneau Beebs ne s'est pas ouvert après 3 clics (aucune option rendue — " +
      "aucun problème de catalogue). Le job repartira au prochain passage."
    );
  }

  for (let i = 0; i < path.length; i++) {
    const levelLabel = path[i];
    const isLast = i === path.length - 1;
    const { el: option, stage } = await waitForCategoryOption(levelLabel, { path, level: i });
    if (stage !== "exact") {
      console.warn(
        `[beebs] ≈ Catégorie niveau ${i + 1}: "${levelLabel}" matché en ${stage} ` +
        `sur "${option.textContent.trim()}"`
      );
    }
    const isLeaf = !!option.querySelector('input[type="checkbox"]');

    if (!isLast && isLeaf) {
      throw new Error(
        `Catégorie: "${levelLabel}" est une feuille terminale mais le chemin continue avec ` +
        `${JSON.stringify(path.slice(i + 1))}. Retirer les niveaux excédentaires dans beebsCategories.js.`
      );
    }

    await humanPause(); // temps de "lecture" du niveau avant le clic
    option.click();

    if (isLast && !isLeaf) {
      await sleep(400);
      throw new Error(
        `Catégorie: le chemin ${JSON.stringify(path)} s'arrête sur un niveau intermédiaire. ` +
        `Sous-catégories proposées par Beebs: ${JSON.stringify(visibleCategoryLabels())}. ` +
        `Ajouter le niveau terminal manquant dans beebsCategories.js.`
      );
    }

    if (isLeaf) break; // le clic sur la feuille a déjà fermé le panneau
    await sleep(400); // laisser le niveau suivant se rendre
  }
}

// ── Adresse (autocomplete type Google Places) ────────────────────────────────
// Politique A+C, même contrat que Leboncoin : adresse absente ou introuvable
// dans l'autocomplete → { ok:false }, jamais de texte tapé laissé non validé.
async function fillAddress(adresse, warnings) {
  const input = document.querySelector('input[name="address"]');
  if (!input) {
    const note = "adresse: champ introuvable sur la page";
    console.warn(`[beebs] ⚠️ ${note}`);
    warnings.push(note);
    return { ok: true }; // champ absent : ne bloque pas le dry-run
  }
  if (input.value.trim()) {
    console.log(`[beebs] adresse: déjà remplie ("${input.value}"), conservée`);
    return { ok: true };
  }
  if (!adresse) {
    return {
      ok: false,
      error:
        "Adresse requise pour Beebs : renseigner « Adresse de remise Leboncoin » " +
        "dans les Réglages FillSell (réutilisée pour Beebs, même adresse d'expédition), " +
        "puis relancer.",
    };
  }

  await typeHuman(input, adresse);

  // Boutons suggestions rendus après un court debounce réseau (Google Places).
  const suggestion = await waitForAddressSuggestion(adresse);
  if (!suggestion) {
    return {
      ok: false,
      error:
        `Adresse "${adresse}" sans suggestion dans l'autocomplete Beebs — vérifier ` +
        "l'orthographe dans les Réglages FillSell (format : numéro rue, ville).",
    };
  }
  const chosen = suggestion.el.textContent.trim();
  await humanPause(); // temps de "lecture" des suggestions avant le clic
  suggestion.el.click();
  await humanPause();

  if (normalizeFuzzy(chosen) !== normalizeFuzzy(adresse)) {
    const note = `adresse: "${adresse}" → suggestion Beebs "${chosen}"`;
    console.log(`[beebs] ≈ ${note}`);
    warnings.push(note);
  }
  return { ok: true };
}

// Choix de la suggestion la plus PERTINENTE (partage de tokens avec l'adresse
// saisie) plutôt que la première venue — même logique que Leboncoin : Beebs
// mélange adresses et lieux commerciaux dans la même liste (cas réel observé :
// une boutique "Vapes Shop Paris" partageant l'adresse recherchée).
// 8s (et pas 4s comme les autres listes) : bug réel trouvé en dry-run — sur
// l'onglet de travail inactif (background.js crée toujours l'onglet
// `active:false`), Chrome throttle les timers et le debounce réseau de
// l'autocomplete Google Places peut dépasser 4s de temps réel avant que la
// suggestion n'apparaisse.
async function waitForAddressSuggestion(adresse, timeoutMs = 8000) {
  const tokens = normalizeFuzzy(adresse).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 || /^\d+$/.test(t));
  const relevance = (el) => {
    const n = normalizeFuzzy(el.textContent);
    return tokens.reduce((sum, t) => sum + (n.includes(t) ? 1 : 0), 0);
  };
  const start = Date.now();
  // Polling via sleep() (timer Web Worker) et non setTimeout : voir
  // waitForValueCascade. C'est aussi ce qui rend le timeout de 8 s réellement
  // égal à 8 s de temps réel dans un onglet caché.
  while (Date.now() - start < timeoutMs) {
    const candidates = Array.from(document.querySelectorAll('button'))
      .filter((b) => b.offsetParent !== null && tokens.some((t) => normalizeFuzzy(b.textContent).includes(t)));
    if (candidates.length) {
      const best = candidates.sort((a, b) => relevance(b) - relevance(a))[0];
      if (relevance(best) > 0) return { el: best };
    }
    await sleep(100);
  }
  return null;
}

// ── Photos ────────────────────────────────────────────────────────────────────
// job.photos: [{ url, type }] — pas des File prêts, on fetch chaque url puis
// on construit les File nous-mêmes avant de les déposer sur l'input.
async function urlToFile(url, index) {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  return new File([blob], `photo_${index}.${ext}`, { type: blob.type });
}

async function uploadPhotos(photos) {
  const files = await Promise.all(photos.map((p, i) => urlToFile(p.url, i)));
  const input = await waitForElement("#input-pictures");
  const dataTransfer = new DataTransfer();
  files.forEach((f) => dataTransfer.items.add(f));
  input.files = dataTransfer.files;
  await humanPause(); // temps de "sélection des fichiers" avant le dépôt
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(1500 * files.length); // laisser le temps à l'upload asynchrone Beebs
}

// Marqueur de version dans le log : permet de vérifier depuis la console
// qu'une version fraîche du script est bien injectée après un reload de
// l'extension.
console.log(`[beebs] prêt — build ${BEEBS_BUILD} | BUILD_ID __FILLSELL_BUILD_ID__ | DRY_RUN=${DRY_RUN} | DELETE_DRY_RUN=${DELETE_DRY_RUN}`);
