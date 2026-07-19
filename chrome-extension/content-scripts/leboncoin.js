// Empreinte de version (2026-07-12) : PREMIÈRE ligne de console à l'injection —
// dit quelle version du code tourne RÉELLEMENT dans l'onglet. À METTRE À JOUR à
// chaque modification de ce fichier.
const LEBONCOIN_BUILD = "2026-07-19-ecran-coordonnees-post-apercu (nouvel ecran Vos coordonnees email+tel pre-remplis gere entre apercu et options + dump d'ecran joint aux erreurs post-apercu non reconnues)";
console.log(`[leboncoin.js] build ${LEBONCOIN_BUILD}`);

// Content script Leboncoin — pilote le WIZARD de dépôt d'annonce.
//
// ⚠️ DRY_RUN passé à false le 2026-07-12 (session de rodage supervisée par
// Nico : 1 article test, T-shirt Patagonia à 30 €, piloté à la main) : TOUT
// job publish part désormais en LIVE, plus seulement ceux marqués
// platform_fields.live_run. En dry-run, le wizard était rempli jusqu'à
// l'APERÇU FINAL inclus (description, prix, adresse), mais le "Continuer" de
// l'aperçu — qui porte la mention « je confirme l'exactitude des
// informations » — n'était JAMAIS cliqué.
const DRY_RUN = false;

// ── Communication avec le background ────────────────────────────────────────

// typeof guard : permet d'injecter ce fichier tel quel dans une page pour un
// dry-run piloté (hors extension), où chrome.runtime n'existe pas — même
// pattern que ebay.js/beebs.js.
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

// ── Suppression d'annonce (Phase B, 2026-07-11) ─────────────────────────────
// FLUX CONFIRMÉ en session réelle du 2026-07-11 (annonce /ad/vetements/
// 3231410109 réellement publiée puis supprimée) :
//   1. /compte/part/mes-annonces : la carte d'annonce porte une rangée
//      d'actions "Vendez plus vite | Mettre en pause | Modifier gratuitement |
//      [icône poubelle]" — la poubelle est un bouton ICÔNE (svg, sans texte
//      ni aria-label relevé) situé après "Modifier gratuitement" dans la
//      carte. Une barre d'actions bulk ("Supprimer") existe aussi en tête de
//      liste, activée par les checkboxes.
//   2. Le clic poubelle NAVIGUE vers /compte/mes-annonces/suppression (page
//      dédiée, pas de modale) : récap de l'annonce + boutons "Revenir à Mes
//      annonces" / "Valider la suppression". AUCUN motif demandé.
//   3. "Valider la suppression" → "Votre demande de suppression a bien été
//      prise en compte / Votre annonce sera supprimée dans quelques instants".
// MISE À JOUR 2026-07-12 (2e suppression réelle, annonce /ad/vetements/
// 3231526889) — le point 1 a CHANGÉ : le contrôle n'est plus une poubelle-icône
// mais un LIEN texte « Supprimer » (<a href="/compte/mes-annonces/suppression">)
// dans la carte. Le reste du flux est identique (page dédiée, aucun motif,
// « Valider la suppression » → « Votre demande de suppression a bien été prise
// en compte »). Le bouton final porte data-testid="button-delete-confirm", mais
// ce nœud est REMPLACÉ par un re-render juste après le chargement (le testid
// disparaît) : matcher aussi par texte exact, comme le fait findButtonByExactText.
// ⚠️ DELETE_DRY_RUN : passé à false le 2026-07-12 sur décision de Nico (session
// autonome). Gate Leboncoin : 2/3 suppressions réelles.
const DELETE_DRY_RUN = false;

async function deleteListing(job) {
  const trace = [];
  const t = (line) => { trace.push(line); console.log(`[leboncoin][delete] ${line}`); };

  if (!/mes-annonces/.test(location.pathname)) {
    return { success: false, error: `Page inattendue pour une suppression LBC : ${location.href}`, trace };
  }
  t(`page Mes annonces ok : ${location.pathname}`);
  await humanPause(1000, 2200);

  // Ciblage de l'annonce : id numérique extrait de listing_url
  // (…/ad/<categorie>/<id>), sinon repli par titre exact.
  const idMatch = String(job.listing_url ?? "").match(/\/(\d{6,})(?:[/?#]|$)/);
  const adId = idMatch?.[1] ?? null;
  let anchor = null;
  if (adId) {
    anchor = document.querySelector(`a[href*="${adId}"]`);
    t(adId ? `id annonce ${adId} → lien ${anchor ? "trouvé" : "introuvable"}` : "");
  }
  if (!anchor && job.title) {
    anchor = Array.from(document.querySelectorAll("a, h2, h3, p, span"))
      .find((el) => el.textContent.trim() === job.title.trim()) ?? null;
    if (anchor) t(`annonce trouvée par titre exact : "${job.title}"`);
  }
  if (!anchor) {
    t(`annonce INTROUVABLE dans Mes annonces (id=${adId ?? "?"}, titre="${job.title ?? "?"}")`);
    if (DELETE_DRY_RUN) return { success: true, dryRun: true, found: false, trace };
    return { success: false, error: "Annonce introuvable dans Mes annonces", trace };
  }

  // Carte englobante : ancêtre porteur des actions. LBC balise ses composants
  // en data-qa-id — on remonte jusqu'à un conteneur plausible.
  const card = anchor.closest('[data-qa-id*="ad"], article, li') ?? anchor.closest("div");
  t(`carte englobante : <${card?.tagName?.toLowerCase() ?? "?"}${card?.getAttribute?.("data-qa-id") ? ` data-qa-id="${card.getAttribute("data-qa-id")}"` : ""}>`);

  // Contrôle Supprimer (flux réel 2026-07-11) : la poubelle est le DERNIER
  // bouton à icône (svg sans texte) de la rangée d'actions de la carte, après
  // "Modifier gratuitement". Repli : bouton/qa-id explicite si LBC en ajoute
  // un jour un.
  let control = findLbcDelete(card);
  if (!control) {
    const iconButtons = Array.from(card?.querySelectorAll("button") ?? [])
      .filter((b) => !b.textContent.trim() && b.querySelector("svg"));
    if (iconButtons.length) {
      control = iconButtons[iconButtons.length - 1];
      t(`poubelle candidate : dernier bouton-icône de la carte (${iconButtons.length} icône(s))`);
    }
  }

  if (!control) {
    const visible = Array.from(card?.querySelectorAll("button, a") ?? [])
      .map((b) => b.textContent.trim()).filter(Boolean).slice(0, 20);
    t(`contrôle Supprimer INTROUVABLE — actions visibles sur la carte : ${visible.join(" | ") || "(aucune)"}`);
    if (DELETE_DRY_RUN) return { success: true, dryRun: true, found: false, trace };
    return { success: false, error: "Contrôle de suppression introuvable", trace };
  }
  t(`contrôle Supprimer localisé : "${control.textContent.trim() || "(icône poubelle)"}"${control.getAttribute("data-qa-id") ? ` (data-qa-id="${control.getAttribute("data-qa-id")}")` : ""}`);

  if (DELETE_DRY_RUN) {
    t("🧪 DELETE_DRY_RUN actif — contrôle localisé, AUCUN clic effectué.");
    return { success: true, dryRun: true, found: true, trace };
  }

  // ── LIVE (après validation manuelle) ───────────────────────────────────
  // Flux réel confirmé : la poubelle NAVIGUE vers /compte/mes-annonces/
  // suppression (page dédiée, aucun motif), puis "Valider la suppression".
  realClick(control);
  const confirmBtn = await waitFor(() => {
    if (!/suppression/.test(location.pathname)) return null;
    return findButtonByExactText("Valider la suppression");
  }, 10_000);
  if (!confirmBtn) return { success: false, error: "Page /suppression ou bouton « Valider la suppression » introuvable après le clic poubelle", trace };
  t(`page de confirmation atteinte : ${location.pathname} — "Valider la suppression"`);
  await humanPause(900, 1800);
  realClick(confirmBtn);
  // Attendu : "Votre demande de suppression a bien été prise en compte".
  await sleep(3000);
  // ⚠️ textContent, PAS innerText : l'onglet de travail vit dans une fenêtre
  // minimisée, jamais rendue — innerText y est TOUJOURS vide (il dépend du
  // layout). La confirmation ultime reste de toute façon celle du background,
  // qui interroge la plateforme.
  const corps = (document.body.textContent ?? "").replace(/\s+/g, " ");
  t(`résultat : ${corps.includes("suppression a bien été prise en compte") ? "confirmation reçue" : "confirmation non lue sur la page (déléguée au background)"}`);
  return { success: true, trace };
}

// Relevé réel 2026-07-12 : le contrôle de suppression n'est PAS (plus ?) un
// bouton-icône — c'est un LIEN vers la page dédiée,
// <a href="/compte/mes-annonces/suppression"> texte « Supprimer ». On le
// cherche d'abord par ce href (le plus stable et sans ambiguïté possible),
// puis on retombe sur les anciennes heuristiques.
function findLbcDelete(root) {
  if (!root) return null;
  // ⚠️ PAS de getClientRects ici : fenêtre minimisée = aucun layout = 0 partout,
  // le lien de suppression n'était donc JAMAIS retenu. La visibilité se lit sur
  // le style calculé, qui reste disponible sans rendu.
  const estVisible = (el) => {
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
  };
  const byHref = Array.from(root.querySelectorAll('a[href*="/suppression"]')).find(estVisible);
  if (byHref) return byHref;
  return (
    root.querySelector('[data-qa-id*="delete"], [data-qa-id*="supprimer"]') ??
    Array.from(root.querySelectorAll("button, a, [role='menuitem']"))
      .find((el) => /^supprimer/i.test(el.textContent.trim())) ??
    null
  );
}

// ── Remplissage du wizard ────────────────────────────────────────────────────
//
// Architecture relevée sur le vrai formulaire (docs/leboncoin-form-survey.md,
// côté app) :
//   1. titre (input[name=subject]) → suggestions de catégorie (radios) +
//      sélecteur manuel 2 panneaux (racine → feuille, arbre plat)
//   2. "Dites-nous en plus" : photos + critères dynamiques par catégorie
//      (combobox à IDs React instables — on passe par label[for] sémantique :
//      "condition", suffixes "_univers"/"_brand"/"_material")
//   3. interstitiel "On cherche le juste prix" (prix pré-suggéré)
//   4. aperçu final éditable : textarea#body, #price_cents, adresse
//      (autocomplete type Google Places, PAS pré-remplie depuis le compte
//      LBC — vérifié) — puis Continuer final = engagement de publication.
//
// platform_fields attendus : { etat, format_colis, univers (fourni depuis
//   2026-07 par l'app : IA + défaut "Mixte" sur le rayon Mode — LBC a un
//   rayon Mixte, cf. form-survey ; valeur FONCTIONNELLE — "Alimentation"… —
//   sur Famille>Équipement bébé, posée par getLbcBabyEquipment),
//   lbcCategoryPath ([racine, feuille], posé par l'app via lbcCategories.js),
//   lbcProduit? (critère Produit* d'Équipement bébé, même origine),
//   adresse? (Réglages FillSell), marque?, matiere? }
//
// Politique A+C : adresse absente ou introuvable dans l'autocomplete →
// { success:false, needsUser:true } : le background remet le job en PENDING
// avec un message explicite (jamais failed) — le brouillon LBC persiste
// (restauration automatique vérifiée), rien n'est perdu.
async function fillListingForm(job) {
  console.log("[leboncoin] fillListingForm — job:", job.id, job.title, DRY_RUN ? "(DRY_RUN)" : "(LIVE)");

  const fields = job.platform_fields || {};
  const warnings = [];
  // Champs OBLIGATOIRES (au sens du code existant, pas d'une liste inventée)
  // qu'on n'a pas su remplir. Deux seulement sont documentés comme bloquants
  // par des dry-runs réels : l'univers du rayon Mode ("Veuillez choisir un
  // univers de vêtement") et le Produit* d'Équipement bébé. Ils remontent au
  // background pour qu'un job ne se déclare jamais réussi en les laissant
  // vides (cf. BUG 2 du 2026-07-09). Les autres critères LBC sont
  // explicitement non bloquants (cf. commentaire de fillCriterionSafe).
  const unfilledRequired = [];

  // Session : le background vient de naviguer l'onglet de travail sur
  // /deposer-une-annonce (même règle que Vinted : un seul onglet persistant,
  // une navigation par job). Si Leboncoin a redirigé (auth.leboncoin.fr,
  // /connexion…) ou affiche un formulaire d'authentification, on s'arrête
  // AVANT tout remplissage : needsUser (ré-armement borné côté background,
  // jamais de retry immédiat), aucune interaction sur une page de connexion.
  const onDepositPage =
    /(^|\.)leboncoin\.fr$/.test(location.hostname) &&
    location.pathname.startsWith("/deposer-une-annonce");
  if (!onDepositPage || document.querySelector('input[type="password"]')) {
    return {
      success: false,
      needsUser: true,
      error:
        "Connexion Leboncoin requise : se connecter sur leboncoin.fr dans Chrome " +
        "(l'onglet de travail est resté ouvert), le job repartira au prochain passage.",
    };
  }

  if (!fields.lbcCategoryPath?.length) {
    return {
      success: false,
      error:
        "platform_fields.lbcCategoryPath absent — article non mappé vers une catégorie " +
        "Leboncoin (icône hors périmètre : véhicule immatriculé, Beauté... ou job antérieur " +
        "au mapping). Régénérer l'annonce depuis l'app, ou compléter src/utils/lbcCategories.js.",
    };
  }

  // État vierge requis. L'ancien test (présence du seul input titre) laissait
  // passer un brouillon restauré à l'APERÇU : #subject y existe aussi (relevé
  // form-survey), le job repartait alors en plein milieu du wizard et mourait
  // plus loin sur "Catégorie: ni suggestion ni sélecteur manuel trouvés"
  // (cas réel du 2026-07-06). Les marqueurs d'un stade avancé — #body,
  // #price_cents, critère condition — sont absents de l'étape titre : leur
  // présence signe un brouillon repris. On ne détruit JAMAIS un brouillon
  // (ce peut être un brouillon manuel de l'utilisateur) — needsUser.
  const draftMarker = () =>
    document.querySelector('textarea#body, #body, #price_cents, label[for="condition"]');
  let entryState = await waitFor(() => {
    if (draftMarker()) return "draft";
    if (document.querySelector('input[name="subject"]')) return "step1";
    return null;
  }, 8000);
  if (entryState === "step1") {
    // L'aperçu restauré peut rendre #subject avant #body : petit délai de
    // stabilisation puis re-vérification des marqueurs avant de taper quoi
    // que ce soit dans le titre.
    await sleep(800);
    if (draftMarker()) entryState = "draft";
  }
  if (entryState !== "step1") {
    // draftBlocked : le background tente UNE fois ce job dans un onglet
    // temporaire (si le brouillon vit dans l'état de l'onglet — sessionStorage
    // — un onglet neuf repart de zéro). S'il est resté bloquant même là
    // (brouillon de compte), on retombe sur le needsUser classique.
    return {
      success: false,
      needsUser: true,
      draftBlocked: true,
      error:
        "Un brouillon Leboncoin est déjà en cours sur ce compte (le wizard ne repart pas " +
        "de zéro). Le publier ou le supprimer sur leboncoin.fr, puis relancer.",
    };
  }
  const subjectInput = document.querySelector('input[name="subject"]');

  // ── Étape 1 : titre → catégorie ──────────────────────────────────────────
  await typeInto(subjectInput, job.title);

  const [root, leaf] = fields.lbcCategoryPath;
  await selectCategory(root, leaf);

  // ── Étape 2 : photos + critères ──────────────────────────────────────────
  // ⚠️ WIZARD PAGINÉ (relevé live 2026-07-19, cas réel Medik8 sur Divers >
  // Autres) : certaines catégories fragmentent le dépôt en PAGES au lieu de
  // tout révéler progressivement — étape 1 + « Type d'annonce » (Offre/Demande)
  // → « Ajoutez des photos » (page dédiée, l'input[type=file] y existe) →
  // « Décrivez votre bien » (titre + #body) → « Quel est votre prix ? »
  // (#price_cents) → « Remise du bien » (adresse + livraison). L'ancien
  // waitForElement direct expirait sur l'étape 1 (« Élément introuvable:
  // input[type=file] ») : il faut cliquer Continuer pour ATTEINDRE les photos.
  // advanceWizardTo couvre les deux mondes : trouve tout de suite sur les
  // catégories standard, avance de page en page sur les flux paginés.
  const photoInput = await advanceWizardTo('input[type="file"]', { probeMs: 6000 });
  if (!photoInput) throw new Error('Élément introuvable: input[type="file"] (même après avance du wizard paginé)');
  if (job.photos?.length) await uploadPhotos(photoInput, job.photos);

  // Critères : tous NON bloquants. On ne touche jamais un critère que
  // Leboncoin a déjà pré-rempli depuis le titre (il est souvent plus précis
  // que nos données — ex. Type="Montre quartz" déduit de "Casio A158").
  // Sonde courte préalable (flux paginé) : la page photos dédiée n'a AUCUN
  // critère combobox — sans cette sonde, chaque fillCriterionSafe empilait son
  // timeout de 5 s pour rien (~25 s perdues par job Divers).
  const hasCriteria = await waitFor(
    () => document.querySelector('label[for="condition"], label[for$="_condition"], label[for$="_brand"], label[for$="_size"], label[for$="_univers"], label[for$="_universe"], label[for$="_material"], label[for$="_type"], label[for="clothing_st"], label[for="baby_age"]'),
    4000
  );
  if (!hasCriteria) {
    console.log("[leboncoin] Aucun critère combobox sur cette étape (flux paginé ou catégorie sans critères) — remplissages de critères sautés.");
  }
  if (hasCriteria && fields.etat) {
    // Le critère état s'appelle "condition" sur certaines catégories (relevé
    // Montres & Bijoux) mais "clothing_condition" sur le rayon Vêtements
    // (relevé campagne 2026-07-08) — même pattern suffixe que _brand/_material.
    await fillCriterionSafe("état", 'label[for="condition"], label[for$="_condition"]', fields.etat, warnings);
  }
  if (hasCriteria && (fields.univers || fields.genre)) {
    const ok = await fillUnivers(fields.univers || fields.genre, warnings);
    if (!ok) unfilledRequired.push("univers");
  }
  if (hasCriteria && fields.lbcProduit) {
    // Produit* : critère OBLIGATOIRE dont les options dépendent de
    // l'univers — d'où le passage APRÈS fillUnivers. Le combobox peut
    // n'être (ré)injecté qu'une fois l'univers posé : attente courte, puis
    // saisie non bloquante (un échec remonte en warning et le Continuer
    // raté le transforme en relevé correctif listant les options réelles).
    // Critère introuvable → warning EXPLICITE, jamais silencieux (même
    // leçon que l'univers, 2026-07-06).
    // ⚠️ Le suffixe du label VARIE par catégorie (relevés réels) :
    //   - Équipement bébé  : for="baby_equipment_type"     → [for$="_type"]
    //   - Vêtements bébé   : for="baby_clothing_category"  → AUTRE suffixe !
    // Bug réel du 2026-07-15 (robe salopette, job publié « CHAMPS
    // MANQUANTS : produit ») : lbcProduit="Robes & Jupes" était bien posé
    // par l'app, mais [for$="_type"] ne matche pas baby_clothing_category
    // → timeout 5 s → champ jamais rempli. Relevé DOM du 2026-07-16.
    const PRODUIT_LABEL_SELECTOR = 'label[for$="_type"], label[for="baby_clothing_category"]';
    const produitLabel = await waitFor(() => document.querySelector(PRODUIT_LABEL_SELECTOR), 5000);
    if (produitLabel) {
      const ok = await fillCriterionSafe("produit", PRODUIT_LABEL_SELECTOR, fields.lbcProduit, warnings, { skipIfPrefilled: true });
      if (!ok) unfilledRequired.push("produit");
    } else {
      const note = `produit: critère introuvable sur cette catégorie — valeur "${fields.lbcProduit}" non appliquée`;
      console.warn(`[leboncoin] ⚠️ ${note}`);
      warnings.push(note);
      unfilledRequired.push("produit");
    }
  }
  if (hasCriteria && fields.taille) {
    // Pointure OBLIGATOIRE sur Mode>Chaussures ("Veuillez choisir une
    // pointure" bloque l'aperçu — relevé campagne 2026-07-08, for="shoe_size").
    // Sur Vêtements le critère taille s'appelle "clothing_st" (relevé) et
    // n'est pas obligatoire. Préfixe EU retiré comme sur Vinted/eBay.
    // Sur Famille > Vêtements bébé, la Taille s'appelle "baby_age" (relevé
    // DOM 2026-07-16, découvert avec le bug Produit* de la même feuille) —
    // sans cette entrée, la grille 0-36 mois n'était JAMAIS remplie quand
    // le titre ne portait pas la taille (l'auto-détection LBC ne se
    // déclenche que depuis le titre).
    await fillCriterionSafe(
      "taille",
      'label[for$="_size"], label[for="clothing_st"], label[for="baby_age"]',
      String(fields.taille).replace(/^EU\s*/i, ""),
      warnings,
      // Garde anti-nombre-nu : un « 3 » ne doit jamais matcher « 3 ans /
      // 98 cm » par contenance, ni « 36 » l'option « 36 mois / 98 cm ».
      { sizeField: true }
    );
  }
  if (hasCriteria && fields.marque) {
    await fillCriterionSafe("marque", 'label[for$="_brand"]', fields.marque, warnings, { skipIfPrefilled: true });
  }
  if (hasCriteria && fields.matiere) {
    await fillCriterionSafe("matière", 'label[for$="_material"]', fields.matiere, warnings, { skipIfPrefilled: true });
  }

  // ── Canal GÉNÉRIQUE (chantier champs obligatoires, 1.A/1.B) ────────────────
  // platform_fields.lbcAspects = { "<clé for= du label>": "valeur" } — posé par
  // l'app (saisie manuelle du stepper) pour les critères SANS mapping dédié
  // ci-dessus. La clé est le nom sémantique du label (ex. watches_jewels_type),
  // stable contrairement aux ids React — relevé form-survey du 05/07.
  const handledForKeys = /(_condition$|^condition$|_univers$|_universe$|_type$|^baby_clothing_category$|_size$|^clothing_st$|^baby_age$|_brand$|_material$)/;
  if (hasCriteria && fields.lbcAspects && typeof fields.lbcAspects === "object") {
    for (const [forKey, value] of Object.entries(fields.lbcAspects)) {
      const val = String(value ?? "").trim();
      if (!val || handledForKeys.test(forKey)) continue;
      await fillCriterionSafe(forKey, `label[for="${forKey}"]`, val, warnings, { skipIfPrefilled: true });
    }
  }

  // QUANTITÉ (2026-07-12) — critère OBLIGATOIRE sur certaines catégories
  // (constaté sur la chaise ce soir : « Ce champ est requis », le Continuer ne
  // passait jamais à l'aperçu et le job mourait là). Il n'était REMPLI NULLE
  // PART : le mot "quantité" n'existait pas dans ce fichier. Le champ n'apparaît
  // pas sur toutes les catégories (absent sur Mode) → remplissage best-effort,
  // jamais bloquant. Valeur : la quantité du job si elle existe, sinon 1 (une
  // annonce cross-post porte une pièce unique — cf. dette D6 de la Phase B).
  const quantiteInput = document.querySelector(
    'input#quantity, input[name="quantity"], input[id$="_quantity"]'
  );
  if (quantiteInput) {
    const qte = String(job.platform_fields?.quantite ?? job.quantite ?? 1);
    setFieldValue(quantiteInput, qte);
    await humanPause();
    if (!String(quantiteInput.value ?? "").trim()) {
      const note = 'quantité: le champ est resté vide après saisie — LBC bloquera sur "Ce champ est requis"';
      console.warn(`[leboncoin] ⚠️ ${note}`);
      warnings.push(note);
      unfilledRequired.push("quantite");
    } else {
      console.log(`[leboncoin] Quantité renseignée : ${quantiteInput.value}`);
    }
  }

  // ── Énumération des critères AFFICHÉS (chantier 2026-07-16, 1.B) ───────────
  // Relevé APRÈS tous les remplissages, AVANT le Continuer : chaque critère
  // combobox de l'étape 2, avec sa clé sémantique (for=), son libellé humain,
  // son marqueur requis (astérisque du libellé — motif « Produit* » relevé en
  // réel) et son état rempli/vide. Nourrit le catalogue cumulatif
  // platform_category_aspects côté background ; un requis vide ici sera
  // confirmé (ou infirmé) par la validation du Continuer ci-dessous — LBC
  // reste le juge, on n'invente aucun blocage en amont.
  const enumerated = enumerateLbcCriteria();

  // Continuer → interstitiel "juste prix" → aperçu final
  const continueBtn = findButtonByExactText("Continuer");
  if (!continueBtn) throw new Error('Bouton "Continuer" introuvable après les critères.');
  continueBtn.click();

  // L'interstitiel peut durer plusieurs secondes : on attend l'aperçu.
  let bodyArea;
  try {
    bodyArea = await waitForElement("textarea#body, #body", 25000);
  } catch {
    // Le wizard n'a pas avancé : un critère obligatoire a été refusé
    // ("Veuillez choisir un univers de vêtement" — cas réel du 2026-07-06).
    // ── Routage 1.D (chantier 2026-07-16) : plus JAMAIS un throw opaque —
    // les messages de validation sont CORRÉLÉS aux critères énumérés (le
    // message d'erreur d'un critère vit dans son wrapper, cf.
    // findVisibleFieldError) et le job part en needsUser STRUCTURÉ : libellé
    // exact + clé sémantique, que l'app présente en saisie manuelle. Les
    // requis ainsi PROUVÉS par la validation LBC (source de vérité) partent
    // aussi au catalogue (required=true), même si leur libellé n'avait pas
    // d'astérisque.
    const blockedFields = [];
    for (const f of enumerated) {
      const input = findCriterionInput(`label[for="${f.key}"]`);
      const msg = input ? findVisibleFieldError(input) : null;
      if (msg) blockedFields.push({ ...f, required: true, message: msg });
    }
    // Champs à message d'erreur hors énumération (input quantité, radios…) :
    // relevé générique en complément, jamais en remplacement.
    const validationMsgs = [...new Set(
      [...document.querySelectorAll('[role="alert"], [aria-live="assertive"], [aria-live="polite"], [class*="error" i]')]
        .filter(isHumanMessageNode)
        .map((el) => el.textContent.trim())
        .filter((t) => t.length <= 200)
    )].slice(0, 5);

    for (const f of blockedFields) {
      if (!unfilledRequired.includes(f.label)) unfilledRequired.push(f.label);
      const idx = enumerated.findIndex((e) => e.key === f.key);
      if (idx >= 0) enumerated[idx] = { ...enumerated[idx], required: true };
    }

    const details = blockedFields.length
      ? `Leboncoin exige : ${blockedFields.map((f) => `${f.label} (« ${f.message} »)`).join(", ")}. ` +
        "Compléter ces champs dans l'app (copie Leboncoin), puis relancer la publication."
      : "Le wizard n'est pas passé à l'aperçu après Continuer" +
        (validationMsgs.length
          ? ` — messages de validation LBC: ${JSON.stringify(validationMsgs)}`
          : " (aucun message de validation visible)") +
        `. Warnings du remplissage: ${warnings.join(" | ") || "aucun"}.`;

    return {
      success: false,
      needsUser: true,
      error: details,
      warnings,
      unfilledRequired,
      discoveredRequired: enumerated,
      serverRequired: blockedFields.map((f) => ({ key: f.key, label: f.label, message: f.message })),
    };
  }

  // ── Étape 4 : aperçu final ───────────────────────────────────────────────
  if (job.description) {
    // typeInto (et non setFieldValue) : la description est le plus long champ
    // du wizard, c'est celui dont l'apparition instantanée se voyait le plus.
    // Insérée par blocs à rythme humain (cf. HUMAN_TYPE_MAX_CHARS).
    await typeInto(bodyArea, job.description);
    bodyArea.blur();
    await humanPause();
  }

  // Trace « prix posé et relu » pour la garde pré-submit : sur les flux
  // paginés (Divers), #price_cents vit sur sa PROPRE page et n'existe plus au
  // moment du dépôt final — la vérification se fait ICI, à la pose.
  let pricePosedVerified = false;
  if (job.price != null) {
    // LBC pré-remplit un prix suggéré — on impose celui du job. Flux paginé :
    // #price_cents peut être sur la page SUIVANTE (« Quel est votre prix ? »),
    // advanceWizardTo clique Continuer pour l'atteindre si besoin.
    const priceInput = await advanceWizardTo("#price_cents", { probeMs: 5000 });
    if (priceInput) {
      // Pose en un coup (setFieldValue, pas typeInto) : champ à format
      // monétaire pré-rempli par LBC, la frappe caractère par caractère
      // risquerait un reformatage à la volée (bug "NaN €" vécu côté Vinted).
      // 2 à 4 caractères : ce n'est pas le signal de vitesse à l'origine du
      // blocage. Encadré de pauses humaines.
      await humanPause();
      setFieldValue(priceInput, String(Math.round(Number(job.price))));
      priceInput.dispatchEvent(new Event("blur", { bubbles: true }));
      await humanPause();
      const posed = Number(String(priceInput.value ?? "").replace(/[^\d]/g, ""));
      pricePosedVerified = Number.isFinite(posed) && posed > 0;
    } else {
      const note = "prix: champ #price_cents introuvable (même après avance du wizard), prix suggéré LBC conservé";
      console.warn(`[leboncoin] ⚠️ ${note}`);
      warnings.push(note);
    }
  }

  // Adresse de remise (politique A+C). Flux paginé : l'étape « Remise du
  // bien » (adresse + livraison) est une page à part APRÈS le prix — on
  // avance jusqu'à elle si le champ n'est pas déjà là. fillAddress garde son
  // comportement (champ introuvable → warning non bloquant : LBC pré-remplit
  // l'adresse du compte sur ce flux, relevé live 2026-07-19).
  await advanceWizardTo('label[for="location"]', { probeMs: 4000, maxSteps: 2 });
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
      "[leboncoin] 🧪 DRY_RUN actif — aperçu rempli, Continuer final (« je confirme " +
      "l'exactitude ») NON cliqué.",
      "\nJob:", job.id,
      "\nTitre:", job.title,
      "\nPrix:", job.price,
      "\nChamps plateforme:", fields,
      warnings.length ? `\nWarnings (${warnings.length}): ${warnings.join(" | ")}` : "\nAucun warning.",
      unfilledRequired.length ? `\n⚠️ Champs OBLIGATOIRES non remplis: ${unfilledRequired.join(", ")}` : ""
    );
    return { success: true, dryRun: true, warnings, unfilledRequired, discoveredRequired: enumerated };
  }

  // ── Publication LIVE (job live_run uniquement) ─────────────────────────────
  // Flux post-aperçu CONFIRMÉ en session réelle (2026-07-11) : Continuer final
  // → page /deposer-une-annonce/options (options de visibilité payantes) →
  // bouton "Déposer sans booster mon annonce" → /deposer-une-annonce/
  // confirmation ("Nous avons bien reçu votre annonce !"). Politique STRICTE :
  // on ne clique JAMAIS un CTA qui mentionne un paiement non nul ; le chemin
  // gratuit explicite ("Déposer sans booster…") est requis, sinon needsUser.
  const finalContinue = findButtonByExactText("Continuer");
  if (!finalContinue) {
    return { success: false, needsUser: true, error: "LIVE : Continuer final introuvable sur l'aperçu.", warnings, unfilledRequired, discoveredRequired: enumerated };
  }
  // ── Garde-fou pré-submit (2026-07-18, garde systémique 4 plateformes) ──────
  // Un HTTP 200 ne garantit RIEN sur le contenu envoyé. On relit le DOM juste
  // avant le dépôt final pour confirmer que le prix est réellement posé et non
  // nul (#price_cents) — sinon échec HONNÊTE plutôt qu'une annonce sans prix.
  // ⚠️ LBC pré-remplit un prix suggéré : ce contrôle garantit « présent et non
  // nul » (spec), pas l'égalité exacte à job.price (le prix imposé l.510 peut
  // théoriquement échouer en laissant la suggestion — non couvert ici, volontaire).
  // Titre/catégorie garantis par la progression du wizard + les gates requis.
  if (job.price != null) {
    const priceEl = document.querySelector("#price_cents");
    if (priceEl) {
      const priceNum = Number(String(priceEl.value ?? "").replace(/[^\d]/g, ""));
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        return {
          success: false, needsUser: true, warnings, unfilledRequired, discoveredRequired: enumerated,
          error: `Prix absent ou nul dans l'aperçu Leboncoin au moment du dépôt (#price_cents = "${priceEl.value ?? ""}") — dépôt annulé pour éviter une annonce sans prix.`,
        };
      }
    } else if (!pricePosedVerified) {
      // Flux paginé : #price_cents vit sur une page antérieure. S'il n'a PAS
      // été posé et relu non nul à son étape, on refuse le dépôt — même
      // garantie qu'avant, adaptée à la pagination (relevé live 2026-07-19).
      return {
        success: false, needsUser: true, warnings, unfilledRequired, discoveredRequired: enumerated,
        error: "Prix non vérifiable au moment du dépôt (champ prix sur une étape antérieure, jamais posé/relu non nul) — dépôt annulé pour éviter une annonce sans prix.",
      };
    }
  }

  console.log("[leboncoin] 🚀 LIVE — Continuer final (« je confirme l'exactitude »)");
  await humanPause(1200, 2400);
  realClick(finalContinue);

  // Écrans post-aperçu, avancés d'écran en écran (3 max) :
  //   · /options : chemin gratuit explicite ("Déposer sans booster mon
  //     annonce", libellé confirmé en réel 2026-07-11) ;
  //   · « Vos coordonnées » (NOUVEAU, relevé 2026-07-19 sur le job 7af7279a,
  //     republication Medik8 en Divers > Autres) : LBC intercale un écran
  //     email + téléphone PRÉ-REMPLIS depuis le compte, avec son propre
  //     Continuer, AVANT l'écran options — jamais vu sur les catégories
  //     standard ; le job mourait en « écran post-aperçu non reconnu ».
  // Politique : on ne SAISIT jamais un email/téléphone nous-mêmes (champ tél
  // vide → needsUser explicite) — on ne fait que confirmer des valeurs que
  // Leboncoin a déjà posées. Écran toujours inconnu → needsUser AVEC un
  // relevé d'écran joint (l'ancien message promettait « la trace servira de
  // relevé » sans jamais joindre de trace).
  const findFreeCta = () => {
    const btns = Array.from(document.querySelectorAll("button, a[role='button'], a"));
    return (
      btns.find((el) => /déposer sans booster/i.test(el.textContent)) ??
      btns.find((el) => /continuer sans|sans option|non merci|déposer sans/i.test(el.textContent)) ??
      btns.find((el) => /déposer (mon |l['’])annonce|publier l['’]annonce|valider et déposer/i.test(el.textContent)) ??
      null
    );
  };
  // Discriminant de l'écran coordonnées : un champ téléphone (les écrans
  // options/confirmation n'en portent pas). Le CTA gratuit est sondé AVANT :
  // s'il existe, il gagne toujours.
  const findContactPhone = () =>
    document.querySelector('input[type="tel"], input[name*="phone" i], input[id*="phone" i]');

  let freeCta = null;
  for (let ecran = 0; ecran < 3 && !freeCta; ecran++) {
    const etape = await waitFor(() => {
      const cta = findFreeCta();
      if (cta) return { cta };
      const phone = findContactPhone();
      if (phone) return { phone };
      return null;
    }, 15_000);
    if (!etape) {
      return {
        success: false, needsUser: true, warnings, unfilledRequired,
        error: `LIVE : écran post-aperçu non reconnu — terminer le dépôt à la main. Relevé de l'écran : ${dumpEcranVisible()}`,
      };
    }
    if (etape.cta) { freeCta = etape.cta; break; }

    // Écran « Vos coordonnées » : confirmation des valeurs pré-remplies, rien
    // d'autre. Téléphone vide = donnée personnelle qu'on ne devine JAMAIS.
    if (!String(etape.phone.value ?? "").trim()) {
      return {
        success: false, needsUser: true, warnings, unfilledRequired,
        error:
          "LIVE : écran « Vos coordonnées » avec numéro de téléphone VIDE — le renseigner sur " +
          "l'écran resté ouvert (ou dans le compte Leboncoin), puis relancer. Aucune saisie " +
          "automatique d'une coordonnée personnelle.",
      };
    }
    const continuerCoord = findButtonByExactText("Continuer");
    if (!continuerCoord) {
      return {
        success: false, needsUser: true, warnings, unfilledRequired,
        error: `LIVE : écran « Vos coordonnées » sans bouton Continuer reconnu — terminer le dépôt à la main. Relevé : ${dumpEcranVisible()}`,
      };
    }
    console.log("[leboncoin] 🚀 LIVE — écran « Vos coordonnées » (téléphone pré-rempli) : clic Continuer");
    await humanPause(900, 1800);
    realClick(continuerCoord);
    await sleep(2000); // laisse l'écran suivant arriver avant de re-sonder
  }
  if (!freeCta) {
    return {
      success: false, needsUser: true, warnings, unfilledRequired,
      error: `LIVE : chemin gratuit toujours introuvable après les écrans intermédiaires — terminer le dépôt à la main. Relevé : ${dumpEcranVisible()}`,
    };
  }
  const ctaText = freeCta.textContent.trim();
  if (/payer/i.test(ctaText) || (/\d+[,.]\d{2}\s*€/.test(ctaText) && !/0[,.]00\s*€/.test(ctaText))) {
    return {
      success: false, needsUser: true, warnings, unfilledRequired,
      error: `LIVE : le seul CTA trouvé mentionne un paiement (« ${ctaText} ») — jamais cliqué automatiquement.`,
    };
  }
  console.log(`[leboncoin] 🚀 LIVE — clic chemin gratuit : « ${ctaText} »`);
  await humanPause(1000, 2000);
  realClick(freeCta);
  await sleep(4000);
  return { success: true, listingUrl: null, warnings, unfilledRequired, discoveredRequired: enumerated };
}

// Relevé d'écran joint aux erreurs post-aperçu (2026-07-19) : titres, boutons
// et champs VISIBLES — c'est ce relevé qui a manqué pour diagnostiquer l'écran
// « Vos coordonnées » sans intervention manuelle. Visibilité par styles
// calculés uniquement (fenêtre minimisée : pas de layout, getClientRects nul).
function dumpEcranVisible() {
  const visible = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.getAttribute("aria-hidden") === "true") return false;
      const st = getComputedStyle(n);
      if (st.display === "none" || st.visibility === "hidden") return false;
    }
    return true;
  };
  const titres = [...document.querySelectorAll("h1, h2, h3, legend")]
    .filter(visible).map((e) => e.textContent.trim()).filter(Boolean).slice(0, 5);
  const boutons = [...document.querySelectorAll("button, a[role='button']")]
    .filter(visible).map((e) => e.textContent.trim()).filter(Boolean).slice(0, 12);
  const champs = [...document.querySelectorAll("input:not([type=hidden])")]
    .filter(visible)
    .map((e) => `${e.type}[${e.name || e.id || "?"}]${String(e.value ?? "").trim() ? "(rempli)" : "(vide)"}`)
    .slice(0, 8);
  return `${location.pathname} · titres ${JSON.stringify(titres)} · boutons ${JSON.stringify(boutons)} · champs ${JSON.stringify(champs)}`;
}

// ── Catégorie ────────────────────────────────────────────────────────────────

// Stratégie hybride : 1) une suggestion radio dont le libellé contient la
// feuille mappée → un seul clic ; 2) sinon sélecteur manuel 2 panneaux ;
// 3) sinon erreur listant ce que Leboncoin affiche (même philosophie que le
// selectCategory Vinted : l'erreur du job sert de relevé correctif).
async function selectCategory(root, leaf) {
  // Les suggestions arrivent en asynchrone après la frappe du titre.
  await sleep(1500);

  const suggestionRadio = findSuggestionRadio(root, leaf);
  if (suggestionRadio) {
    await humanPause(); // temps de "lecture" des suggestions avant le clic
    suggestionRadio.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await humanPause();
    console.log(`[leboncoin] catégorie via suggestion: ${root} > ${leaf}`);
    return;
  }

  // Sélecteur manuel : ouvrir "Ou choisissez une autre catégorie"
  const trigger = [...document.querySelectorAll('input[role="combobox"], button')]
    .find((e) => /choisissez/i.test(e.value || e.textContent || ""));
  if (!trigger) throw new Error("Catégorie: ni suggestion ni sélecteur manuel trouvés.");
  await humanPause();
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await sleep(800);

  // Panneau gauche = racines (ul de 13 items — on repère par contenu)
  const leftUl = [...document.querySelectorAll("ul")]
    .find((u) => u.children.length >= 10 && u.textContent.includes("Divers"));
  if (!leftUl) throw new Error("Catégorie: panneau des racines introuvable.");
  const rootLi = [...leftUl.children].find((li) => li.textContent.trim() === root);
  if (!rootLi) {
    throw new Error(
      `Catégorie: racine "${root}" introuvable. Racines Leboncoin: ` +
      JSON.stringify([...leftUl.children].map((li) => li.textContent.trim()))
    );
  }
  await humanPause(); // temps de "lecture" des racines avant le clic
  (rootLi.querySelector("button, a") || rootLi).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await sleep(600);

  const rightUl = [...document.querySelectorAll("ul")]
    .filter((u) => u !== leftUl)
    .find((u) => [...u.children].some((c) => c.textContent.trim() === leaf));
  if (!rightUl) {
    const panes = [...document.querySelectorAll("ul")].filter((u) => u !== leftUl && u.children.length > 0);
    throw new Error(
      `Catégorie: feuille "${leaf}" introuvable sous "${root}". Options affichées: ` +
      JSON.stringify(panes.map((p) => [...p.children].map((c) => c.textContent.trim().slice(0, 40))).flat().slice(0, 20)) +
      ". Corriger src/utils/lbcCategories.js avec un de ces libellés."
    );
  }
  const leafLi = [...rightUl.children].find((c) => c.textContent.trim() === leaf);
  await humanPause(); // temps de "lecture" des feuilles avant le clic
  (leafLi.querySelector("button, a") || leafLi).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await humanPause();
  console.log(`[leboncoin] catégorie via sélecteur manuel: ${root} > ${leaf}`);
}

// Le libellé d'une suggestion concatène racine+feuille SANS séparateur
// ("ModeMontres & Bijoux" — vérifié) : containsAsWords échouerait (pas de
// frontière de mot devant la feuille). On matche donc sur le SUFFIXE (le
// libellé se termine par la feuille) ou l'égalité racine+feuille.
function findSuggestionRadio(root, leaf) {
  const leafN = normalizeFuzzy(leaf);
  const rootN = normalizeFuzzy(root);
  for (const radio of document.querySelectorAll('input[type="radio"]')) {
    const label = radio.closest("li, label, div");
    if (!label) continue;
    const labelN = normalizeFuzzy(label.textContent);
    if (labelN.endsWith(leafN) || labelN === rootN + leafN) return radio;
  }
  return null;
}

// ── Critères (combobox à menu, IDs instables → label[for] sémantique) ──────

// label[for="condition"] ou label[for$="_material"] → wrapper → input combobox.
// Relevé de TOUS les critères combobox affichés à l'étape 2 (chantier champs
// obligatoires, 2026-07-16). Clé = attribut for du label (nom sémantique
// stable, ex. watches_jewels_brand — les ids React :form-field-_r_X_ sont
// inutilisables, relevé form-survey 05/07). Requis = astérisque en fin de
// libellé (motif « Produit* » relevé en réel sur Équipement bébé) — marqueur
// INDICATIF : la validation du Continuer reste le juge (elle promeut
// required=true via le routage needsUser). Vide = combobox sans valeur.
function enumerateLbcCriteria() {
  const out = [];
  const seen = new Set();
  for (const label of document.querySelectorAll("label[for]")) {
    const key = label.getAttribute("for") || "";
    // ids React dynamiques et champs de base (titre/prix/adresse) exclus :
    // on ne relève que les critères sémantiques de l'étape 2.
    if (!key || seen.has(key) || /^:|^(subject|body|price_cents|location|photo-input)$/.test(key)) continue;
    const input = findCriterionInput(`label[for="${CSS.escape(key)}"]`);
    if (!input) continue; // pas un combobox de critère
    seen.add(key);
    const text = (label.textContent || "").trim();
    out.push({
      key,
      label: text.replace(/\s*\*\s*$/, "").trim() || key,
      required: /\*\s*$/.test(text),
      inputType: "combobox",
      filled: Boolean(String(input.value ?? "").trim()),
      source: "dom",
    });
  }
  return out;
}

function findCriterionInput(labelSelector) {
  const label = document.querySelector(labelSelector);
  if (!label) return null;
  let wrap = label.parentElement;
  for (let i = 0; i < 4 && wrap; i++) {
    const inp = wrap.querySelector('input[role="combobox"]');
    if (inp) return inp;
    wrap = wrap.parentElement;
  }
  return null;
}

// Cascade v2 (portée de vinted.js) + jamais bloquant. skipIfPrefilled : ne pas
// écraser un critère que Leboncoin a déjà déduit du titre.
async function fillCriterionSafe(fieldName, labelSelector, rawValue, warnings, { skipIfPrefilled = false, sizeField = false } = {}) {
  try {
    const input = findCriterionInput(labelSelector);
    if (!input) {
      // Critère absent pour cette catégorie : normal (champs dynamiques), silencieux.
      return false;
    }
    if (skipIfPrefilled && input.value.trim()) {
      console.log(`[leboncoin] ${fieldName}: déjà pré-rempli par LBC ("${input.value}"), conservé`);
      return true;
    }
    await humanPause();
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await sleep(700);
    const menu = document.getElementById(input.getAttribute("aria-controls"));
    const optionSelector = 'li, [role="option"], button';
    const scope = menu || document;
    const match = findOptionCascade(scope, optionSelector, rawValue, { sizeField });
    if (!match) {
      const available = [...scope.querySelectorAll(optionSelector)]
        .map((o) => o.textContent.trim()).filter(Boolean).slice(0, 30);
      throw new Error(`option "${rawValue}" sans correspondance. Options: ${JSON.stringify(available)}`);
    }
    await humanPause(); // temps de "lecture" de la liste avant le clic
    match.el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await humanPause();
    if (match.stage !== "exact") {
      const note = `${fieldName}: "${rawValue}" → option LBC "${match.label}" (match ${match.stage})`;
      console.warn(`[leboncoin] ≈ ${note}`);
      warnings.push(note);
    }
    return true;
  } catch (e) {
    const note = `${fieldName}: champ sauté — ${e.message}`;
    console.warn(`[leboncoin] ⚠️ ${note}`);
    warnings.push(note);
    document.body.click(); // referme un éventuel menu resté ouvert
    await humanPause();
    return false;
  }
}

// ── Univers (critère OBLIGATOIRE du rayon Mode) ──────────────────────────────
// "Veuillez choisir un univers de vêtement" bloque le passage à l'aperçu :
// contrairement aux autres critères, un échec ici ne doit JAMAIS être
// silencieux (cas réel du 2026-07-06 : univers="Mixte" bien présent dans le
// job, non appliqué, zéro trace). Le combobox label[for$="_univers"] vient
// du relevé Montres & Bijoux (accessories_univers) ; sur d'autres catégories
// (Vêtements) le contrôle peut être rendu autrement (radios/pills) — d'où le
// fallback : conteneur titré "Univers" → clic sur l'option via la cascade.
// @returns {Promise<boolean>} true si l'univers a bien été posé (ou était déjà
//   pré-rempli par LBC), false sinon — l'appelant l'inscrit alors dans
//   unfilledRequired.
async function fillUnivers(rawValue, warnings) {
  // 1. Combobox classique. Suffixes relevés : "_univers" (Montres & Bijoux),
  // "_universe" (anglais — Équipement bébé, campagne 2026-07-08 ; ses valeurs
  // sont FONCTIONNELLES : Alimentation/Mobilité/Sécurité/Sommeil..., pas un
  // genre — l'app fournit la valeur fonctionnelle via getLbcBabyEquipment
  // pour les icônes mappées, 🍼 pour l'instant ; les autres icônes bébé
  // gardent un rawValue genre qui n'y matchera pas, warning propre attendu).
  if (findCriterionInput('label[for$="_univers"], label[for$="_universe"]')) {
    return await fillCriterionSafe("univers", 'label[for$="_univers"], label[for$="_universe"]', rawValue, warnings, { skipIfPrefilled: true });
  }

  // 2. Contrôle non-combobox : libellé "Univers" puis options cliquables
  // autour (radios, pills, boutons). On remonte de quelques parents depuis
  // le libellé jusqu'à trouver un conteneur qui porte les options.
  const title = [...document.querySelectorAll("legend, label, span, p, h2, h3, h4")]
    .find((el) => normalizeFuzzy(el.textContent) === "univers"
      || /^univers( de |[\s:*])/.test(normalizeFuzzy(el.textContent)));
  if (title) {
    let scope = title.parentElement;
    for (let i = 0; i < 4 && scope; i++, scope = scope.parentElement) {
      // Pré-rempli par LBC depuis le titre → on ne touche pas (même règle
      // que skipIfPrefilled sur le combobox).
      if (scope.querySelector('input:checked, [aria-checked="true"], [aria-selected="true"]')) {
        console.log("[leboncoin] univers: déjà pré-sélectionné par LBC, conservé");
        return true;
      }
      const match = findOptionCascade(
        scope,
        'input[type="radio"], [role="radio"], [role="option"], button, label, li',
        rawValue
      );
      if (match) {
        await humanPause(); // temps de "lecture" des options avant le clic
        realClick(match.el);
        await humanPause();
        if (match.stage !== "exact") {
          const note = `univers: "${rawValue}" → option LBC "${match.label}" (match ${match.stage})`;
          console.warn(`[leboncoin] ≈ ${note}`);
          warnings.push(note);
        }
        return true;
      }
    }
  }

  // 3. Introuvable : warning EXPLICITE — si le critère était réellement
  // absent de la catégorie, le Continuer passera et le warning restera
  // anodin ; s'il était obligatoire, l'échec du Continuer remontera ce
  // warning dans l'erreur du job (relevé correctif).
  const note = `univers: contrôle introuvable sur cette catégorie — valeur "${rawValue}" non appliquée`;
  console.warn(`[leboncoin] ⚠️ ${note}`);
  warnings.push(note);
  return false;
}

// ── Adresse (autocomplete type Google Places) ───────────────────────────────

// ── Avance de wizard PAGINÉ (2026-07-19, cas réel Divers > Autres) ───────────
// Certaines catégories fragmentent le dépôt en PAGES successives reliées par
// « Continuer » (relevé live : Divers > Autres = type d'annonce → photos →
// description → prix → remise), là où les catégories standard révèlent tout
// progressivement sur une même page. Générique : attend `selector` ; s'il
// n'apparaît pas et qu'un bouton « Continuer » existe, on le clique (étape
// intermédiaire) et on ré-attend — au plus maxSteps clics. Sur une catégorie
// standard, l'élément est trouvé à la première sonde : zéro clic, zéro
// changement de comportement. Retourne l'élément ou null (jamais de throw :
// l'appelant garde son message d'erreur métier).
async function advanceWizardTo(selector, { probeMs = 5000, maxSteps = 3 } = {}) {
  for (let step = 0; step <= maxSteps; step++) {
    const el = await waitFor(() => document.querySelector(selector), probeMs);
    if (el) return el;
    if (step === maxSteps) return null;
    const btn = findButtonByExactText("Continuer");
    if (!btn) return null;
    console.log(`[leboncoin] "${selector}" absent — étape intermédiaire du wizard, clic Continuer (${step + 1}/${maxSteps})`);
    await humanPause();
    btn.click();
    await sleep(1500);
  }
  return null;
}

async function fillAddress(adresse, warnings) {
  const input = findCriterionInput('label[for="location"]')
    || [...document.querySelectorAll("input")].find((i) => (i.placeholder || "") === "Adresse");
  if (!input) {
    // Champ absent de l'aperçu (LBC l'a peut-être mémorisé d'un dépôt
    // précédent — à observer) : on continue sans bloquer.
    const note = "adresse: champ introuvable dans l'aperçu (peut-être déjà mémorisée par LBC)";
    console.warn(`[leboncoin] ⚠️ ${note}`);
    warnings.push(note);
    return { ok: true };
  }
  // ⚠️ ORDRE DES GARDES (corrigé 2026-07-09). Avant, "champ déjà rempli" était
  // testé AVANT "adresse absente" et retournait ok:true : une valeur laissée
  // par un brouillon LBC restauré (adresse d'un run de test précédent) était
  // conservée EN SILENCE et partait dans l'aperçu. Une fausse adresse posée
  // sans le moindre warning est le pire cas possible — on ne fait plus jamais
  // confiance à une valeur pré-remplie qu'on n'a pas nous-mêmes vérifiée.
  const prefilled = input.value.trim();
  if (!adresse) {
    return {
      ok: false,
      error: prefilled
        ? `Le champ adresse de Leboncoin contient déjà "${prefilled}" (brouillon restauré ?), ` +
          "et aucune « Adresse de remise Leboncoin » n'est renseignée dans les Réglages " +
          "FillSell : impossible de vérifier que c'est la bonne adresse. La renseigner dans " +
          "les Réglages, puis relancer. Le brouillon Leboncoin est conservé."
        : "Adresse requise pour Leboncoin : renseigner « Adresse de remise Leboncoin » " +
          "dans les Réglages FillSell, puis relancer. Le brouillon Leboncoin est conservé.",
    };
  }

  // Tokens significatifs de l'adresse des Réglages (mots ≥ 3 lettres + nombres).
  const tokens = normalizeFuzzy(adresse).split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 || /^\d+$/.test(t));
  const missingTokens = (text) => {
    const n = normalizeFuzzy(text);
    return tokens.filter((t) => !n.includes(t));
  };

  if (prefilled) {
    if (!missingTokens(prefilled).length) {
      console.log(`[leboncoin] adresse: déjà remplie et conforme aux Réglages ("${prefilled}"), conservée`);
      return { ok: true };
    }
    const note = `adresse: champ pré-rempli ("${prefilled}") ≠ adresse des Réglages — réécriture`;
    console.warn(`[leboncoin] ⚠️ ${note}`);
    warnings.push(note);
  }

  input.scrollIntoView({ block: "center" });
  // La valeur BRUTE des Réglages est tapée telle quelle — jamais de
  // transformation de casse ni de ponctuation : l'autocomplete LBC (type
  // Google Places) matche très bien "7 allée du saut du loup 91160 saulx les
  // chartreux" en minuscules, et tout reformatage "d'affichage" ajouterait
  // des virgules/parenthèses que le géocodeur peut ne pas comprendre.
  await typeInto(input, adresse);

  // Leboncoin n'accepte une adresse que CHOISIE dans le dropdown de
  // l'autocomplete (type Google Places) : un texte collé, même correct
  // visuellement, laisse le champ invalide (cas réel du 2026-07-06,
  // "sans suggestion" alors que le texte était bien inséré). D'où :
  // détection LARGE des suggestions (listbox lié à l'input via
  // aria-controls/aria-owns d'abord, sélecteurs génériques ensuite),
  // choix de la 1re suggestion PERTINENTE (partage de tokens avec
  // l'adresse saisie), clic à séquence pointer complète, puis contrôle
  // que le champ est réellement validé avant de continuer.
  const findSuggestions = () => {
    const scopes = [];
    const ownedId = input.getAttribute("aria-controls") || input.getAttribute("aria-owns");
    if (ownedId) {
      const owned = document.getElementById(ownedId);
      if (owned) scopes.push(owned);
    }
    scopes.push(...document.querySelectorAll('[role="listbox"]'));
    let cands = scopes.flatMap((s) => [...s.querySelectorAll('[role="option"], li')]);
    if (!cands.length) {
      cands = [...document.querySelectorAll(
        '[role="option"], [class*="suggestion" i] li, ul[class*="autocomplete" i] li, [data-testid*="suggestion" i]'
      )];
    }
    // Visibles et non vides uniquement (offsetParent null = caché).
    return cands.filter((el) => el.offsetParent !== null && el.textContent.trim());
  };

  // ⚠️ BUG RÉEL DU 2026-07-09 — "10 Rue de Rivoli, Paris (75004) Marais" posé à
  // la place de l'adresse de l'utilisateur. Deux défauts cumulés, tous deux
  // corrigés ici :
  //
  // 1. LISTE LUE TROP TÔT. Depuis la frappe humaine (80–250 ms/caractère), la
  //    saisie d'une adresse dure plusieurs SECONDES et Leboncoin propose des
  //    suggestions pour chaque PRÉFIXE tapé. L'ancien `waitFor(première liste
  //    non vide)` retournait donc la liste du préfixe ("10 rue de " →
  //    "10 Rue de Rivoli…"), jamais celle de l'adresse complète. On attend
  //    maintenant que la liste se STABILISE (deux relevés identiques espacés
  //    de settleMs) : c'est le signal que le debounce a fini sur le texte final.
  // 2. SEUIL DE PERTINENCE ABSURDE. L'ancien test acceptait toute suggestion
  //    partageant AU MOINS UN token : "10 Rue de Rivoli, Paris" partage "10",
  //    "rue" et "paris" avec "10 rue de la Paix, Paris" et gagnait. On exige
  //    désormais que TOUS les tokens de l'adresse des Réglages soient présents
  //    dans la suggestion. Sinon → needsUser (jamais d'adresse approximative).
  const suggestionsSignature = (els) => els.map((e) => e.textContent.trim()).join("|");
  const waitForStableSuggestions = async (timeoutMs = 12000, settleMs = 700) => {
    const start = Date.now();
    let lastSig = null;
    let lastChangeAt = Date.now();
    while (Date.now() - start < timeoutMs) {
      const cur = findSuggestions();
      const sig = suggestionsSignature(cur);
      if (sig && sig === lastSig && Date.now() - lastChangeAt >= settleMs) return cur;
      if (sig !== lastSig) {
        lastSig = sig;
        lastChangeAt = Date.now();
      }
      await sleep(150);
    }
    const last = findSuggestions();
    return last.length ? last : null;
  };

  const candidates = await waitForStableSuggestions();
  if (!candidates) {
    return {
      ok: false,
      error:
        `Adresse "${adresse}" sans suggestion dans l'autocomplete Leboncoin — vérifier ` +
        "l'orthographe dans les Réglages FillSell (format : numéro rue, ville). " +
        "Le brouillon Leboncoin est conservé.",
    };
  }

  // Meilleure suggestion = celle à qui il manque le moins de tokens ; on
  // n'accepte QUE la couverture totale.
  const suggestion = [...candidates]
    .sort((a, b) => missingTokens(a.textContent).length - missingTokens(b.textContent).length)[0];
  const missing = suggestion ? missingTokens(suggestion.textContent) : tokens;
  if (!suggestion || missing.length) {
    // Des propositions existent mais aucune ne couvre l'adresse : ne jamais
    // forcer la suite avec une adresse approximative. La liste sert de relevé
    // correctif pour ajuster l'adresse dans les Réglages.
    return {
      ok: false,
      error:
        `Adresse "${adresse}" : aucune suggestion Leboncoin ne la couvre entièrement ` +
        `(la meilleure, "${suggestion ? suggestion.textContent.trim() : "—"}", ne contient pas ` +
        `${JSON.stringify(missing)}). Propositions affichées: ` +
        `${JSON.stringify(candidates.map((c) => c.textContent.trim()).slice(0, 5))}. ` +
        "Corriger l'adresse dans les Réglages FillSell (format : numéro rue, ville). " +
        "Le brouillon Leboncoin est conservé.",
    };
  }

  const chosen = suggestion.textContent.trim();
  await humanPause(); // temps de "lecture" des suggestions avant le clic
  realClick(suggestion);
  await humanPause();

  // ⚠️ FAUX NÉGATIF DU 2026-07-09 — le job échouait en « Adresse non validée
  // par Leboncoin après sélection de "7 Allée du Saut du Loup,
  // Saulx-les-Chartreux (91160)" — message affiché: "localisationLocation" »
  // alors que l'adresse BRUTE des Réglages avait bien été tapée telle quelle
  // et la bonne suggestion cliquée (le libellé cité est celui de la
  // suggestion LBC, pas une adresse que nous aurions reformatée). Deux leçons :
  //   1. le signal FIABLE d'une sélection prise est la VALEUR DE L'INPUT
  //      (React y reporte la suggestion choisie) — pas la fermeture du
  //      dropdown, pas aria-invalid, pas un nœud d'erreur ;
  //   2. "localisationLocation" est une clé i18n BRUTE de Leboncoin, portée
  //      en permanence par un nœud [class*="error"]/aria-live du champ même
  //      sans erreur affichée : scraper ces nœuds sans filtre de visibilité
  //      ni de texte humain fabrique de fausses erreurs (cf. isHumanMessageNode).
  const selectionTaken = () =>
    input.value.trim() && !missingTokens(input.value).length ? true : null;

  let taken = await waitFor(selectionTaken, 5000);
  if (!taken) {
    // Le clic n'a pas été pris par le composant React (famille de composants
    // déjà capricieuse au clic, cf. realClick) : repli clavier — ArrowDown
    // surligne la première suggestion, Enter la valide. Notre candidate à
    // couverture totale est en tête de liste dans le cas nominal ; si LBC en
    // valide une autre, le contrôle de couverture ci-dessous la rejettera.
    input.focus();
    dispatchKey(input, "keydown", "ArrowDown");
    dispatchKey(input, "keyup", "ArrowDown");
    await humanPause();
    dispatchKey(input, "keydown", "Enter");
    dispatchKey(input, "keyup", "Enter");
    taken = await waitFor(selectionTaken, 4000);
  }

  if (!taken) {
    const visibleError = findVisibleFieldError(input);
    return {
      ok: false,
      error:
        `Adresse des Réglages tapée telle quelle ("${adresse}") et suggestion Leboncoin ` +
        `"${chosen}" sélectionnée, mais Leboncoin n'a pas reporté la sélection dans le champ` +
        (visibleError ? ` — message affiché: "${visibleError.slice(0, 120)}"` : "") +
        ". Vérifier l'adresse dans les Réglages FillSell. Le brouillon Leboncoin est conservé.",
    };
  }

  if (normalizeFuzzy(chosen) !== normalizeFuzzy(adresse)) {
    const note = `adresse: "${adresse}" → suggestion LBC "${chosen}"`;
    console.log(`[leboncoin] ≈ ${note}`);
    warnings.push(note);
  }
  return { ok: true };
}

// Nœud de message réellement destiné à l'utilisateur : visible (les régions
// d'erreur/aria-live de LBC restent en permanence dans le DOM, parfois avec
// une clé i18n brute — "localisationLocation", cas réel du 2026-07-09) et au
// texte humain (une clé brute est un identifiant sans le moindre espace).
// getClientRects (et non offsetParent, null aussi sur position:fixed) pour la
// visibilité.
function isHumanMessageNode(el) {
  const txt = (el.textContent || "").trim();
  return Boolean(txt) && /\s/.test(txt) && el.getClientRects().length > 0;
}

// Message d'erreur RÉEL d'un champ : remonte 4 parents depuis l'input et ne
// retient que les nœuds d'erreur visibles au texte humain (cf.
// isHumanMessageNode — jamais une clé i18n brute).
function findVisibleFieldError(input) {
  let scope = input;
  for (let i = 0; i < 4 && scope; i++, scope = scope.parentElement) {
    const nodes = scope.querySelectorAll?.('[role="alert"], [aria-live="assertive"], [class*="error" i]') ?? [];
    for (const el of nodes) {
      if (isHumanMessageNode(el)) return el.textContent.trim();
    }
  }
  return null;
}

// Clic "réel" : certains composants React de Leboncoin ignorent un
// MouseEvent click isolé (même famille de composants que l'autocomplete) —
// on rejoue la séquence complète pointerdown → mousedown → pointerup →
// mouseup → click, comme une vraie interaction.
function realClick(el) {
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    const Ctor = type.startsWith("pointer") ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, view: window }));
  }
}

// ── Helpers génériques (repris de vinted.js — candidats à un shared-fill.js
// commun quand les deux handlers seront stabilisés) ─────────────────────────

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
// C'est CE handler qui a déclenché "Accès temporairement restreint" ("vous
// surfez et cliquez à une vitesse surhumaine") sur Leboncoin. Deux signaux de
// bot évidents, présents sur les 4 handlers :
//   - valeur posée en UNE fois : execCommand("insertText") recevait le TEXTE
//     ENTIER, donc un titre de 60 caractères apparaissait en 0 ms, sans une
//     seule frappe clavier ;
//   - rythme mécanique : exactement CLICK_DELAY (250 ms) entre chaque action.
// On remplace donc les délais fixes par des tirages aléatoires (humanPause) et
// la pose de valeur en bloc par une frappe caractère par caractère (typeInto)
// encadrée de keydown/keypress/keyup.
//
// ⚠️ Tous les délais passent par sleep() — donc par le timer Web Worker non
// clampé ci-dessus. Le timing humain reste ainsi valide dans un onglet caché,
// où setTimeout serait bridé à 1/s (et où 60 caractères à 165 ms coûteraient
// 60 s au lieu de 10 s). Ne JAMAIS remplacer ces sleep() par des setTimeout.
const HUMAN_CHAR_MIN = 80, HUMAN_CHAR_MAX = 250;
const HUMAN_ACTION_MIN = 300, HUMAN_ACTION_MAX = 900;
// Au-delà de ce seuil (description : plusieurs centaines de caractères), la
// frappe caractère par caractère coûterait des minutes et ferait exploser le
// budget de sendMessageToTab. On insère alors par blocs espacés d'une pause
// humaine — ce que fait de toute façon un vendeur qui colle un texte.
const HUMAN_TYPE_MAX_CHARS = 120;
const HUMAN_CHUNK_CHARS = 40;

const randInt = (min, max) => Math.round(min + Math.random() * (max - min));
const humanPause = (min = HUMAN_ACTION_MIN, max = HUMAN_ACTION_MAX) => sleep(randInt(min, max));

// Événements clavier synthétiques : ils n'insèrent aucun texte (c'est
// execCommand qui le fait) mais ils donnent aux écouteurs de la page la
// séquence qu'une vraie frappe produit.
function dispatchKey(el, type, char) {
  el.dispatchEvent(new KeyboardEvent(type, {
    key: char, bubbles: true, cancelable: true, composed: true,
  }));
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

// Polling générique d'une condition (retourne null au timeout, ne rejette pas).
async function waitFor(fn, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = fn();
    if (v) return v;
    await sleep(120);
  }
  return null;
}

function setNativeValue(element, value) {
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

// ⚠️ Les inputs React de Leboncoin (titre, adresse) IGNORENT setNativeValue +
// event "input" : le compteur reste à 0/200 et les suggestions/autocomplete
// ne se déclenchent JAMAIS (vérifié en dry-run réel — contrairement à Vinted).
// execCommand("insertText") insère comme une vraie frappe et déclenche bien
// les handlers React ; on garde setNativeValue en repli si execCommand échoue.
// Depuis 2026-07-09 : frappe caractère par caractère à rythme humain
// (80–250 ms) encadrée de keydown/keypress/keyup, au lieu d'un insertText du
// texte entier. Le premier insertText remplace la sélection totale (donc vide
// la valeur existante), les suivants s'insèrent au curseur.
async function typeInto(input, text) {
  input.focus();
  // Vider une éventuelle valeur existante (sélection totale puis remplacement).
  try {
    input.setSelectionRange?.(0, input.value.length);
  } catch { /* certains types d'input n'exposent pas setSelectionRange */ }

  const str = String(text);
  const pieces = str.length <= HUMAN_TYPE_MAX_CHARS
    ? [...str]
    : (str.match(new RegExp(`[\\s\\S]{1,${HUMAN_CHUNK_CHARS}}`, "g")) ?? []);

  let ok = true;
  for (const piece of pieces) {
    dispatchKey(input, "keydown", piece[0]);
    if (piece.length === 1) dispatchKey(input, "keypress", piece);
    ok = document.execCommand("insertText", false, piece) && ok;
    dispatchKey(input, "keyup", piece[piece.length - 1]);
    if (!ok) break;
    await (piece.length === 1
      ? sleep(randInt(HUMAN_CHAR_MIN, HUMAN_CHAR_MAX))
      : humanPause());
  }

  if (!ok || input.value !== str) {
    // Repli : frappe caractère par caractère via le setter natif — ⚠️ les
    // inputs React de LBC IGNORENT setNativeValue (compteur figé, autocomplete
    // muet), ce repli n'est là que si execCommand devient indisponible.
    setNativeValue(input, "");
    for (const char of str) {
      dispatchKey(input, "keydown", char);
      setNativeValue(input, input.value + char);
      dispatchKey(input, "keyup", char);
      await sleep(randInt(HUMAN_CHAR_MIN, HUMAN_CHAR_MAX));
    }
  }
  await humanPause();
}

// Renseigne un champ texte/textarea de l'aperçu (description, prix) de façon
// robuste : execCommand d'abord (comme typeInto), setNativeValue en repli.
function setFieldValue(el, value) {
  el.focus();
  try { el.setSelectionRange?.(0, el.value.length); } catch { /* noop */ }
  const ok = document.execCommand("insertText", false, String(value));
  if (!ok || el.value !== String(value)) setNativeValue(el, String(value));
}

function findButtonByExactText(text) {
  const candidates = document.querySelectorAll('button, [role="button"]');
  for (const el of candidates) {
    if (el.textContent.trim() === text) return el;
  }
  return null;
}

const normalizeFuzzy = (s) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function containsAsWords(hay, needle) {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(hay);
}

// ── Garde anti-nombre-nu (2026-07-15, chantier tailles enfant) ──────────────
// Sur un champ TAILLE/POINTURE uniquement (opts.sizeField) : les grilles
// enfant LBC sont des chaînes combinées qui CONTIENNENT des nombres nus
// (« 3 ans / 98 cm » ⊃ « 3 », « 36 mois / 98 cm » ⊃ « 36 ») et les
// tailles adultes/pointures sont des nombres nus contenus dans ces chaînes.
// Sans garde, la cascade peut poser une taille FAUSSE en silence dans les
// deux sens — y compris via le filet singulier/pluriel (« 36 » matchait
// « 36 mois » une fois « mois » singularisé en « moi »). Règle : pour un
// nombre nu, seul l'EXACT fait foi (segment de grille compris) — contenance
// à côté contenu purement numérique rejetée, filet singulier/pluriel
// désactivé (aucun sens pour une taille). Champs non taille inchangés.
const PURE_NUMBER_RE = /^\d+(?:[.,]\d+)?$/;

// Cascade v2 identique à vinted.js : exact → option⊂valeur (la plus longue) →
// valeur⊂option (la plus courte) → composants (et/,/&/+) → null.
function findOptionCascade(root, optionSelector, text, { sizeField = false } = {}) {
  const options = Array.from(root.querySelectorAll(optionSelector))
    .map((el) => ({ el, label: el.textContent.trim(), norm: normalizeFuzzy(el.textContent) }))
    .filter((o) => o.norm);
  if (!options.length) return null;
  const target = normalizeFuzzy(text);

  const exact = options.find(
    (o) => o.norm === target || o.label.split("/").some((p) => normalizeFuzzy(p) === target)
  );
  if (exact) return { ...exact, stage: "exact" };

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

  // Filet singulier/pluriel : "Biberon" ↔ option "Biberons" — aucun stage
  // précédent ne les rapproche (containsAsWords exige une frontière de mot,
  // or le "s" du pluriel colle au mot). Comparaison après retrait du "s"
  // final de chaque mot (normalizeFuzzy a déjà réduit à [a-z0-9]). Ce stage
  // ne s'exécute que là où la cascade échouait déjà (aucun impact sur les
  // matchs existants) — ajouté pour Équipement bébé (Produit*, 2026-07-09).
  // DÉSACTIVÉ sur les champs taille : « mois » singularisé devient « moi »
  // et un « 36 » nu matcherait « 36 mois » (garde anti-nombre-nu ci-dessus).
  if (sizeField) return null;
  const singularize = (s) => s.replace(/([a-z]{2,})s\b/g, "$1");
  const targetSing = singularize(target);
  if (targetSing) {
    const singExact = options.find((o) => singularize(o.norm) === targetSing);
    if (singExact) return { ...singExact, stage: "singulier-pluriel" };
    const singFuzzy = options
      .filter((o) => containsAsWords(singularize(o.norm), targetSing)
        || containsAsWords(targetSing, singularize(o.norm)))
      .sort((a, b) => a.norm.length - b.norm.length)[0];
    if (singFuzzy) return { ...singFuzzy, stage: "singulier-pluriel" };
  }
  return null;
}

async function urlToFile(url, index) {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  return new File([blob], `photo_${index}.${ext}`, { type: blob.type });
}

async function uploadPhotos(input, photos) {
  const files = await Promise.all(photos.map((p, i) => urlToFile(p.url, i)));
  const dataTransfer = new DataTransfer();
  files.forEach((f) => dataTransfer.items.add(f));
  input.files = dataTransfer.files;
  await humanPause(); // temps de "sélection des fichiers" avant le dépôt
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(1500 * files.length);
}

console.log(`[leboncoin] prêt — build ${LEBONCOIN_BUILD} | BUILD_ID __FILLSELL_BUILD_ID__ | DRY_RUN=${DRY_RUN} | DELETE_DRY_RUN=${DELETE_DRY_RUN}`);
