// Empreinte de version (2026-07-12, demande Nico) : PREMIÈRE ligne de console
// à l'injection — permet de vérifier, à chaque test, quelle version du code
// tourne RÉELLEMENT dans l'onglet. À METTRE À JOUR à chaque modification de
// ce fichier.
const EBAY_BUILD = "2026-07-12-12h05 (desc-blur-oracle + empreinte, après 340158e)";
console.log(`[ebay.js] build ${EBAY_BUILD}`);

// Content script eBay — remplit le formulaire "Terminer votre annonce".
//
// ⚠️ DRY_RUN passé à false le 2026-07-12 (session de rodage supervisée par
// Nico : 1 article test, T-shirt Patagonia à 30 €, piloté à la main) : TOUT
// job publish part désormais en LIVE, plus seulement ceux marqués
// platform_fields.live_run — le clic "Mettre en vente avec les frais
// affichés" (engagement de frais + publication réelle) est effectué. En
// dry-run, le formulaire était rempli de bout en bout mais ce bouton n'était
// JAMAIS cliqué — eBay conserve de toute façon un BROUILLON auto-sauvegardé
// (draftId dans l'URL), inspectable puis supprimable dans
// "Vendre > Brouillons".
//
// Architecture relevée en session réelle (2026-07-07, connecté) :
//   - Pas de wizard à piloter : l'URL directe
//     /sl/list?mode=AddItem&categoryId=<id>&title=<t>&condition=<condId>
//     ouvre DIRECTEMENT le formulaire final (redirigé vers
//     /lstng?draftId=...&mode=AddItem, un brouillon est créé automatiquement).
//     La catégorie est posée par son categoryId (ebayCategories.js côté app),
//     le titre et l'état arrivent pré-remplis — zéro clic d'arbre, zéro
//     ambiguïté de recherche mot-clé. C'est le background qui construit
//     cette URL (PLATFORM_HANDLERS.ebay.newListingUrl est une fonction).
//   - Item specifics : lignes button[id*="item-specific-dropdown-label"]
//     (texte = libellé du champ), menu .se-filter-menu-button__menu-container
//     avec recherche input.textbox__control ("Recherchez/ajoutez des détails")
//     et options div[role="menuitemradio"|"menuitemcheckbox"].menu__item.
//     Audit obligatoires/facultatifs par catégorie : voir
//     docs/ebay-item-specifics-survey (rapport de session) — Marque toujours
//     obligatoire ; Mode : + Taille (ou "Pointure EU" pour les chaussures),
//     Couleur, Département (PRÉ-REMPLI par la catégorie, on n'y touche pas),
//     et des champs par catégorie (Style, Longueur de la robe...) largement
//     pré-remplis par eBay depuis le titre.
//   - Prix : format par défaut = ENCHÈRES. Il faut basculer le listbox
//     Format sur "Achat immédiat" pour exposer input[name="price"].
//   - Description : RTE dans l'iframe same-origin #se-rte-frame__summary.
//   - Pièges : popup "Astuces photos" (.lightbox-dialog, bouton OK) qui
//     s'ouvre toute seule par-dessus le formulaire ; chips
//     "Fréquemment sélectionnées" et extraction auto depuis le titre qui
//     pré-remplissent des specifics (on ne ré-écrit jamais un champ déjà
//     rempli).
const DRY_RUN = false;

const SPECIFICS_MENU_SELECTOR = ".se-filter-menu-button__menu-container";

// ── Communication avec le background ────────────────────────────────────────

// typeof guard : permet d'injecter ce fichier tel quel dans une page pour un
// dry-run piloté (hors extension), où chrome.runtime n'existe pas.
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "GO_TO_SELL") {
      sendResponse(goToSellFromHome());
      return false; // réponse synchrone : la navigation détruirait le canal
    }
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

// ── Entrée par la home : clic réel sur "Vendre" ──────────────────────────────
// Le background dépose l'onglet de travail sur ebay.fr (et non plus directement
// sur /sl/list, cf. background.js) puis appelle ce handler. On rend la main
// TOUT DE SUITE — le clic déclenche une navigation qui détruirait le canal de
// message avant la réponse — et on clique juste après, à distance humaine.
//
// Jamais bloquant : lien introuvable ou page de connexion → { clicked:false },
// le background enchaîne sur la navigation directe vers l'URL de dépôt.
// ── Fin d'annonce (Phase B, 2026-07-11) ─────────────────────────────────────
// eBay ne "supprime" pas : on TERMINE l'annonce ("Terminer l'annonce") depuis
// le Hub vendeur (/sh/lst/active — page vérifiée en session réelle 2026-07-11,
// mais VIDE à ce moment-là : la ligne d'annonce et son menu d'actions n'ont
// jamais été observés, cascades défensives à valider au premier dry-run avec
// une annonce en cours).
// ⚠️ DELETE_DRY_RUN reste à true tant que 3 fins d'annonces réelles n'ont pas
// été validées manuellement.
const DELETE_DRY_RUN = true;

async function deleteListing(job) {
  const trace = [];
  const t = (line) => { trace.push(line); console.log(`[ebay][delete] ${line}`); };

  if (!/\/sh\/lst/.test(location.pathname)) {
    return { success: false, error: `Page inattendue pour une fin d'annonce eBay : ${location.href}`, trace };
  }
  t(`Hub vendeur ok : ${location.pathname}`);
  await humanPause(1200, 2500);

  const idMatch = String(job.listing_url ?? "").match(/\/itm\/(?:[^/]*\/)?(\d{9,})|itemId=(\d{9,})/i);
  const itemId = idMatch?.[1] ?? idMatch?.[2] ?? null;

  let anchor = itemId ? document.querySelector(`a[href*="${itemId}"]`) : null;
  if (anchor) t(`annonce trouvée par itemId ${itemId}`);
  if (!anchor && job.title) {
    anchor = Array.from(document.querySelectorAll("a"))
      .find((a) => a.textContent.trim() === job.title.trim()) ?? null;
    if (anchor) t(`annonce trouvée par titre exact : "${job.title}"`);
  }
  if (!anchor) {
    t(`annonce INTROUVABLE dans le Hub vendeur (itemId=${itemId ?? "?"}, titre="${job.title ?? "?"}")`);
    if (DELETE_DRY_RUN) return { success: true, dryRun: true, found: false, trace };
    return { success: false, error: "Annonce introuvable dans le Hub vendeur", trace };
  }

  const row = anchor.closest("tr") ?? anchor.closest('[class*="grid-row"], [class*="listing-row"], li');
  t(`ligne englobante : <${row?.tagName?.toLowerCase() ?? "?"}>`);

  // Menu d'actions de la ligne (dropdown) : l'ouvrir n'est pas destructif.
  let control = findEbayEnd(row ?? document);
  if (!control) {
    const menuBtn = Array.from(row?.querySelectorAll("button") ?? []).find((b) => {
      const label = ((b.getAttribute("aria-label") || "") + " " + b.textContent).toLowerCase();
      return b.getAttribute("aria-haspopup") === "true" || /actions|options|menu/.test(label);
    });
    if (menuBtn) {
      t(`menu d'actions ouvert : "${(menuBtn.getAttribute("aria-label") || menuBtn.textContent).trim()}"`);
      realClick(menuBtn);
      await humanPause(700, 1400);
      control = findEbayEnd(document); // menus eBay montés en portal
    }
  }

  if (!control) {
    const visible = Array.from((row ?? document).querySelectorAll("button, a"))
      .map((b) => b.textContent.trim()).filter(Boolean).slice(0, 20);
    t(`"Terminer l'annonce" INTROUVABLE — actions visibles : ${visible.join(" | ") || "(aucune)"}`);
    if (DELETE_DRY_RUN) return { success: true, dryRun: true, found: false, trace };
    return { success: false, error: "Action 'Terminer l'annonce' introuvable", trace };
  }
  t(`contrôle localisé : "${control.textContent.trim()}"`);

  if (DELETE_DRY_RUN) {
    t("🧪 DELETE_DRY_RUN actif — contrôle localisé, AUCUN clic effectué.");
    return { success: true, dryRun: true, found: true, trace };
  }

  // ── LIVE (après validation manuelle) ───────────────────────────────────
  realClick(control);
  await humanPause(1000, 2000);
  // Dialogue de motif ("L'objet n'est plus à vendre"…) puis bouton final.
  const reason = await waitFor(() => {
    const dialog = document.querySelector('[role="dialog"], .lightbox-dialog');
    if (!dialog) return null;
    return Array.from(dialog.querySelectorAll('input[type="radio"], label'))
      .find((el) => /plus à vendre|n'est plus disponible|vendu/i.test(el.textContent || "")) ?? null;
  }, 8000);
  if (reason) { t(`motif choisi : "${(reason.textContent || "").trim()}"`); realClick(reason); await humanPause(500, 1100); }
  const confirmBtn = await waitFor(() => {
    const dialog = document.querySelector('[role="dialog"], .lightbox-dialog');
    if (!dialog) return null;
    return Array.from(dialog.querySelectorAll("button"))
      .find((b) => /terminer|envoyer|confirmer|end listing/i.test(b.textContent)) ?? null;
  }, 8000);
  if (!confirmBtn) return { success: false, error: "Confirmation de fin d'annonce introuvable", trace };
  t(`confirmation : "${confirmBtn.textContent.trim()}"`);
  realClick(confirmBtn);
  await sleep(3000);
  return { success: true, trace };
}

function findEbayEnd(root) {
  if (!root) return null;
  return Array.from(root.querySelectorAll("button, a, [role='menuitem'], [role='option']"))
    .find((el) => /terminer l['’]annonce|end listing/i.test(el.textContent.trim())) ?? null;
}

function goToSellFromHome() {
  if (/(^|\.)signin\.ebay\./.test(location.hostname) || document.querySelector('input[type="password"]')) {
    return { clicked: false, reason: "page de connexion eBay" };
  }
  const link = [...document.querySelectorAll("a")].find((a) => {
    const href = a.getAttribute("href") || "";
    return /\/sl\/sell|\/sl\/list|sell\.ebay\./.test(href)
      || a.textContent.trim().toLowerCase() === "vendre";
  });
  if (!link) return { clicked: false, reason: 'lien "Vendre" introuvable sur la home' };

  humanPause(600, 1500).then(() => {
    link.scrollIntoView({ block: "center" });
    realClick(link);
    console.log('[ebay] entrée par la home : clic réel sur "Vendre" →', link.getAttribute("href"));
  });
  return { clicked: true };
}

// ── Remplissage du formulaire ────────────────────────────────────────────────

/**
 * @param {object} job — cross_post_jobs :
 *   { id, platform, title, description, price, photos, platform_fields }
 *   platform_fields (ebay, posés par l'app via ebayCategories.js) :
 *     { ebayCategoryId, ebayCategoryPath, ebayGenreRequired?, genre?, etat?,
 *       marque?, taille?, couleur?, colors?, matiere? }
 *   Le background a déjà navigué l'onglet de travail sur l'URL /sl/list
 *   construite avec ebayCategoryId + title + conditionId — ici on vérifie,
 *   on complète (photos, specifics, format, prix, description) et on
 *   s'arrête avant la publication.
 */
async function fillListingForm(job) {
  console.log("[ebay] fillListingForm — job:", job.id, job.title, DRY_RUN ? "(DRY_RUN)" : "(LIVE)");

  const fields = job.platform_fields || {};
  const warnings = [];
  // Trace des specifics réellement posés — ou trouvés déjà remplis — pendant
  // ce run (2026-07-11). Sert UNIQUEMENT au constat unfilledRequired du
  // DRY_RUN : fillSpecificSafe ne dit pas QUEL label du groupe a matché, donc
  // un succès marque tout le groupe de synonymes (même logique que la
  // comparaison en face dans computeUnfilledRequired).
  const filledSpecifics = new Set();
  const fillSpecificTracked = async (labels, value) => {
    const ok = await fillSpecificSafe(labels, value, warnings);
    if (ok) for (const l of labels) filledSpecifics.add(normalizeFuzzy(l));
    // ~5 s entre deux champs (2026-07-12, observation en direct de Nico) :
    // l'enchaînement rapide faisait sauter des remplissages — la page n'a
    // pas fini de digérer l'action précédente (re-renders lourds d'eBay)
    // quand la suivante part. On lui laisse LARGEMENT le temps.
    await fieldSettle();
    return ok;
  };

  // Session : signin.ebay.fr intercepte la navigation quand le compte n'est
  // pas connecté. Même règle que Vinted/LBC : needsUser (ré-armement borné
  // côté background), aucune interaction sur une page de connexion.
  if (/(^|\.)signin\.ebay\.fr$/.test(location.hostname) || document.querySelector('input[type="password"]')) {
    return {
      success: false,
      needsUser: true,
      error:
        "Connexion eBay requise : se connecter sur ebay.fr dans Chrome " +
        "(l'onglet de travail est resté ouvert), le job repartira au prochain passage.",
    };
  }

  // Fallback explicite : sans categoryId, pas d'URL de dépôt possible — le
  // background n'aurait même pas dû nous envoyer ici, mais on garde le
  // message actionnable au cas où (job antérieur au mapping, icône hors
  // périmètre). Même distinction de cause que Vinted via ebayGenreRequired.
  if (!fields.ebayCategoryId) {
    if (fields.ebayGenreRequired && !fields.genre) {
      // Distingué de "Mixte" depuis le 2026-07-09 : les deux cas partageaient
      // le même message, impossible de savoir lequel s'était produit sur un
      // job réel (et donc si c'était un rejet légitime ou une donnée manquante).
      return {
        success: false,
        error:
          "Genre absent pour cet article de mode : eBay range la mode en rayons " +
          "(Femme/Homme/Fille/Garçon/Bébé/Enfant unisexe) et aucun genre n'a été " +
          "renseigné. Choisir un genre dans les champs eBay de l'app, puis régénérer " +
          "le job.",
      };
    }
    if (fields.ebayGenreRequired && fields.genre === "Mixte") {
      return {
        success: false,
        error:
          "Genre « Mixte » : eBay n'a pas de rayon mixte en mode (seuls les parfums " +
          "ont une feuille « Parfums mixtes »). Choisir Femme, Homme, Fille, Garçon, " +
          "Bébé ou Enfant unisexe dans les champs eBay de l'app, puis régénérer le job.",
      };
    }
    if (fields.ebayGenreRequired) {
      return {
        success: false,
        error:
          `Genre « ${fields.genre} » sans rayon eBay pour cette catégorie d'article ` +
          "(certaines feuilles n'existent pas en unisexe enfant : robe, écharpe, gants, " +
          "casquette, lunettes, porte-monnaie). Choisir Fille, Garçon ou Bébé dans les " +
          "champs eBay de l'app, puis régénérer le job.",
      };
    }
    return {
      success: false,
      error:
        "platform_fields.ebayCategoryId absent — article non mappé vers le catalogue eBay " +
        "(icône hors périmètre : véhicule immatriculé, valise... ou job antérieur au " +
        "mapping). Régénérer l'annonce depuis l'app, ou compléter src/utils/ebayCategories.js.",
    };
  }

  // Le formulaire final vit sur /lstng?draftId=... (redirection depuis
  // /sl/list). Si on est resté sur /sl/prelist*, le categoryId n'a pas été
  // accepté (id périmé ?) — erreur-relevé plutôt que remplissage à l'aveugle.
  const formReady = await waitFor(
    () => document.querySelector('input[name="title"]') && /\/lstng/.test(location.pathname),
    20000
  );
  if (!formReady) {
    return {
      success: false,
      error:
        `Formulaire eBay non atteint (page actuelle: ${location.pathname}). ` +
        `categoryId=${fields.ebayCategoryId} probablement refusé par /sl/list — vérifier ` +
        "l'id dans src/utils/ebayCategories.js (arbre docs/ebay-categories-raw.txt).",
    };
  }

  // Popup parasite "Astuces photos" (vécue en session réelle) : elle
  // recouvre le formulaire et avale les clics. On ferme toute lightbox
  // présente maintenant, et on re-vérifie avant chaque interaction sensible
  // via dismissLightboxes().
  await dismissLightboxes();

  // Vérification catégorie : la section "CATÉGORIE DE L'OBJET" affiche le
  // chemin complet — la feuille de notre mapping doit s'y trouver, sinon
  // eBay a re-routé l'id vers autre chose (warning-relevé, non bloquant :
  // le dry-run sert exactement à voir ça).
  const leafLabel = fields.ebayCategoryPath?.[fields.ebayCategoryPath.length - 1];
  if (leafLabel) {
    const mainText = document.querySelector("main")?.innerText ?? "";
    if (!mainText.includes(leafLabel)) {
      warnings.push(
        `catégorie: feuille "${leafLabel}" (id ${fields.ebayCategoryId}) non retrouvée sur la ` +
        "page — vérifier le mapping ebayCategories.js"
      );
    }
  }

  if (job.photos?.length) {
    await uploadPhotos(job.photos);
    await fieldSettle();
  }

  // Titre : déjà passé par l'URL, mais tronqué/réencodé possible — on
  // impose la valeur exacte du job si elle diffère (80 caractères max eBay).
  const titleInput = document.querySelector('input[name="title"]');
  const wantedTitle = String(job.title ?? "").slice(0, 80);
  if (titleInput && wantedTitle && titleInput.value !== wantedTitle) {
    await typeInto(titleInput, wantedTitle);
    // Le titre déclenche côté eBay un recalcul lourd (suggestions de
    // catégorie/aspects) : on le laisse se terminer avant d'attaquer les
    // specifics.
    await fieldSettle();
  }

  // ── Item specifics (tous non bloquants, warning si introuvable) ──────────
  // Département : jamais touché (pré-rempli par la catégorie genrée).
  // Libellés multiples par champ : le nom varie selon la catégorie
  // ("Taille" en vêtements, "Pointure EU" en chaussures...) — on prend le
  // premier présent sur la page.
  if (fields.marque) {
    await fillSpecificTracked(["Marque"], fields.marque);
  }
  const taille = fields.taille ? String(fields.taille).replace(/^EU\s*/i, "") : null;
  if (taille) {
    await fillSpecificTracked(["Taille", "Pointure EU", "Pointure"], taille);
  }
  const couleur = fields.colors?.[0] || fields.couleur;
  if (couleur) {
    await fillSpecificTracked(["Couleur"], couleur);
  }
  if (fields.matiere) {
    await fillSpecificTracked(["Matière", "Matériau", "Matériaux"], fields.matiere);
  }

  // ── État ──────────────────────────────────────────────────────────────────
  // Posé par l'URL (conditionId calculé par le background : neuf → 1000,
  // sinon 3000). Le libellé affiché varie par catégorie ("Occasion - Très
  // bon état" en vêtements, "Occasion" ailleurs) — on relève sans corriger :
  // la granularité fine des états vêtements (Parfait état/Bon état...)
  // passera par l'UI dans un lot ultérieur si besoin.
  const condLabel = document.querySelector("#summary-condition-field-value")?.textContent?.trim();
  if (fields.etat && condLabel && !sameConditionFamily(fields.etat, condLabel)) {
    warnings.push(`état: "${fields.etat}" → état eBay "${condLabel}" (défaut URL, granularité non ajustée)`);
  }

  // ── Prix : basculer Enchères → Achat immédiat puis poser le prix ─────────
  if (job.price != null) {
    await fieldSettle();
    await ensureAchatImmediat(warnings);
    // 20 s (et pas 8) : la section PRIX se re-rend après la bascule Achat
    // immédiat ET après le calcul du prix suggéré (priceAutoFillPref) — cas
    // réel campagne 2026-07-08 : le champ est apparu après le timeout de 8 s,
    // le prix suggéré eBay (5,28 €) restait en place au lieu du prix du job.
    const priceInput = await waitFor(() => {
      const el = document.querySelector('input[name="price"]');
      return el && el.offsetParent !== null ? el : null;
    }, 20000);
    if (priceInput) {
      // Pose en un coup (pas typeInto) : champ à format monétaire, la frappe
      // caractère par caractère risquerait le reformatage à la volée (bug
      // "NaN €" vécu sur le prix Vinted). 2 à 4 caractères : ce n'est pas le
      // signal de vitesse à l'origine du blocage. Encadré de pauses humaines.
      await humanPause();
      priceInput.focus();
      setNativeValue(priceInput, String(job.price).replace(".", ","));
      priceInput.dispatchEvent(new Event("blur", { bubbles: true }));
      await humanPause();
    } else {
      warnings.push("prix: input[name=price] introuvable après bascule Achat immédiat — prix suggéré eBay conservé");
    }
  }

  // ── Description (RTE dans une iframe same-origin) ─────────────────────────
  // descOk (2026-07-12, vécu en LIVE réel) : l'iframe RTE n'était pas encore
  // chargée au moment du remplissage, le texte est parti dans le vide et eBay
  // a refusé la soumission (« Vous devez ajouter une description ») — pendant
  // que le job partait en "published" fantôme. La description est OBLIGATOIRE
  // côté eBay : en LIVE, on ne clique PAS si elle n'a pas pu être posée.
  let descOk = true;
  if (job.description) {
    await fieldSettle();
    descOk = await fillDescription(job.description, warnings);
  }

  // Gate par job (2026-07-11) : DRY_RUN global reste true par défaut ; un job
  // explicitement marqué platform_fields.live_run === true (test supervisé
  // Patagonia) publie pour de vrai. Aucun autre job n'est affecté.
  const dryRun = DRY_RUN && job.platform_fields?.live_run !== true;
  if (dryRun) {
    const draftId = new URLSearchParams(location.search).get("draftId");
    warnings.push(`brouillon eBay auto-sauvegardé (draftId=${draftId}) — à supprimer dans Vendre > Brouillons après inspection`);
    console.log(
      "[ebay] 🧪 DRY_RUN actif — formulaire rempli, « Mettre en vente avec les frais affichés » NON cliqué.",
      "\nJob:", job.id,
      "\nTitre:", job.title,
      "\nPrix:", job.price,
      "\nChamps plateforme:", fields,
      warnings.length ? `\nWarnings (${warnings.length}): ${warnings.join(" | ")}` : "\nAucun warning."
    );
    // unfilledRequired réel depuis le 2026-07-11 : le job porte
    // fields.ebayRequiredAspects (référentiel API Taxonomy, table
    // ebay_item_aspects lue par ListingPreviewScreen) et on compare aux
    // specifics effectivement posés pendant ce run. Champ absent du job
    // (catégorie hors référentiel) → [] , comportement d'avant. Le genre
    // (ebayGenreRequired) reste traité par precheckJob avant navigation.
    const unfilledRequired = computeUnfilledRequired(fields, filledSpecifics);
    if (unfilledRequired.length) {
      const note = `aspects obligatoires eBay non remplis (${unfilledRequired.length}) : ${unfilledRequired.join(", ")}`;
      console.warn(`[ebay] ⚠️ ${note}`);
      warnings.push(note);
    }
    return { success: true, dryRun: true, warnings, unfilledRequired };
  }

  // ── Publication LIVE ────────────────────────────────────────────────────────
  // Description manquante = refus GARANTI par la validation eBay : inutile de
  // cliquer, on remonte tout de suite un needsUser actionnable (le formulaire
  // et son brouillon restent en place dans l'onglet de travail).
  if (!descOk) {
    return {
      success: false,
      needsUser: true,
      error:
        "LIVE : description non posée dans l'éditeur eBay (" +
        (warnings.find((w) => w.startsWith("description:")) ?? "cause inconnue") +
        ") — publication NON tentée : eBay la refuse (« Vous devez ajouter une description »). " +
        "Le job repartira au prochain passage.",
      warnings,
      unfilledRequired: computeUnfilledRequired(fields, filledSpecifics),
    };
  }

  // Passe de rattrapage finale (2026-07-12, observation en session réelle) :
  // l'onglet de travail étant caché, une pose peut n'avoir pas pris au
  // premier passage (réaction au clic différée par le throttling). Plusieurs
  // dizaines de secondes se sont écoulées depuis (prix, description) : on
  // re-tente UNE fois, sans refresh de page, chaque aspect obligatoire connu
  // encore vide dans le DOM ACTUEL — avant de conclure au needsUser.
  const knownAspectFills = [
    { labels: ["Marque"], value: fields.marque },
    { labels: ["Taille", "Pointure EU", "Pointure"], value: taille },
    { labels: ["Couleur"], value: couleur },
    { labels: ["Matière", "Matériau", "Matériaux"], value: fields.matiere },
  ];
  const emptyBeforeRetry = computeUnfilledRequired(fields, filledSpecifics);
  for (const { labels, value } of knownAspectFills) {
    if (!value || !labels.some((l) => emptyBeforeRetry.includes(l))) continue;
    console.log(`[ebay] passe finale : re-tentative sur "${labels[0]}" (obligatoire encore vide dans le DOM)`);
    await fillSpecificTracked(labels, value);
  }

  // Aspect obligatoire CONNU (référentiel ebay_item_aspects porté par le job
  // via fields.ebayRequiredAspects) encore vide au moment du clic = refus
  // GARANTI par la validation eBay (vécu en LIVE réel 2026-07-12 : « La
  // caractéristique de l'objet Marque est manquante ») : on ne clique pas non
  // plus. computeUnfilledRequired lit l'état RÉEL du formulaire (valeurs
  // pré-remplies par eBay incluses) et filledSpecifics n'est alimenté que par
  // des poses VÉRIFIÉES en relecture (fillSpecificSafe) — plus de confiance
  // aveugle dans le fait d'avoir cliqué.
  const unfilledRequired = computeUnfilledRequired(fields, filledSpecifics);
  if (unfilledRequired.length) {
    return {
      success: false,
      needsUser: true,
      error:
        `LIVE : aspect(s) obligatoire(s) eBay vide(s) sur le formulaire : ${unfilledRequired.join(", ")} — ` +
        "publication NON tentée (refus eBay garanti). Compléter le(s) champ(s) dans l'app ou " +
        "directement sur le formulaire resté ouvert ; le job repartira au prochain passage.",
      warnings,
      unfilledRequired,
    };
  }

  // Le clic "Mettre en vente avec les frais affichés" est un engagement de
  // frais. Libellé relevé en session réelle 2026-07-07 ; on privilégie le
  // bouton mentionnant les frais, repli sur tout "Mettre en vente" hors liens
  // de navigation.
  const listBtn =
    Array.from(document.querySelectorAll("button")).find((b) =>
      /mettre en vente avec les frais/i.test(b.textContent)
    ) ??
    Array.from(document.querySelectorAll("button")).find((b) =>
      /^mettre en vente/i.test(b.textContent.trim())
    );
  if (!listBtn) {
    return {
      success: false,
      needsUser: true,
      error: "LIVE : bouton « Mettre en vente » introuvable sur le formulaire — publier à la main puis vérifier le sélecteur.",
      warnings,
      unfilledRequired,
    };
  }
  console.log(`[ebay] 🚀 LIVE — clic « ${listBtn.textContent.trim()} » (engagement de frais)`);
  await humanPause(1200, 2400);
  realClick(listBtn);
  // La suite est surveillée côté background — detectReauth, puis
  // verifyEbaySubmission (2026-07-12 : la soumission peut être REFUSÉE sur
  // place par la validation eBay, bandeau « Vous devez ajouter une
  // description » vécu en LIVE réel, et seul le background survit à une
  // éventuelle redirection), puis captureListingUrl. On répond tout de suite.
  await sleep(3000);
  return { success: true, listingUrl: null, warnings, unfilledRequired };
}

// ── État : comparaison de famille (neuf vs occasion) ────────────────────────
// Le conditionId de l'URL ne code que la famille — on ne signale un écart
// que si le job dit "neuf" et la page "occasion" (ou l'inverse).
function sameConditionFamily(jobEtat, pageLabel) {
  const isNeuf = (s) => /neuf/i.test(s);
  return isNeuf(jobEtat) === isNeuf(pageLabel);
}

// ── Item specifics ───────────────────────────────────────────────────────────

// Trouve la ligne d'un specific par son libellé (bouton-label relevé :
// button[id*="item-specific-dropdown-label"], texte exact = nom du champ).
function findSpecificLabelButton(labels) {
  const buttons = [...document.querySelectorAll('button[id*="item-specific-dropdown-label"]')];
  for (const label of labels) {
    const btn = buttons.find((b) => b.textContent.trim() === label);
    if (btn) return { btn, label };
  }
  return null;
}

// Anatomie d'une ligne de specific (relevée en dry-run réel) : le
// bouton-label ne déclenche RIEN (bug du 1er dry-run : "menu pas ouvert") —
// le vrai déclencheur est le bouton-valeur button.se-expand-button__button
// (chevron, porte aria-expanded), et la valeur sélectionnée s'affiche dans
// son textContent. La ligne porte aussi les chips "Fréquemment
// sélectionnées" (button.fake-link) : sélection en UN clic sans ouvrir le
// menu quand l'une d'elles matche notre valeur.
function specificRow(labelBtn) {
  let row = labelBtn.parentElement;
  for (let i = 0; i < 6 && row; i++, row = row.parentElement) {
    const expandBtn = row.querySelector("button.se-expand-button__button, button[aria-expanded]");
    if (expandBtn && expandBtn !== labelBtn) return { row, expandBtn };
  }
  return null;
}

// ── Constat des obligatoires non remplis (2026-07-11) ───────────────────────
// fields.ebayRequiredAspects = noms d'aspects required=true de la catégorie
// (référentiel API Taxonomy, posé sur le job par ListingPreviewScreen). Pur
// CONSTAT : on compare la liste aux specifics posés pendant ce run
// (filledSpecifics) et aux valeurs pré-remplies par eBay lui-même (lecture
// SEULE du bouton-valeur — même anatomie et même piège badge "Tendances" que
// fillSpecificSafe). On ne tente RIEN de remplir ici : les obligatoires hors
// de nos 4 champs (Type, Style, Longueur de la robe...) ressortent avec leur
// label eBay exact — rapport honnête de ce qui manque, pas un mensonge
// d'exhaustivité. ebayRequiredAspects absent (catégorie hors référentiel :
// les 3 non-feuilles du mapping, ou id futur non re-fetché) → [] comme avant.
function computeUnfilledRequired(fields, filledSpecifics) {
  const required = Array.isArray(fields.ebayRequiredAspects) ? fields.ebayRequiredAspects : [];
  const unfilled = [];
  for (const name of required) {
    if (filledSpecifics.has(normalizeFuzzy(name))) continue;
    const found = findSpecificLabelButton([name]);
    const anatomy = found ? specificRow(found.btn) : null;
    const current = anatomy ? anatomy.expandBtn.textContent.trim().replace(/^Tendances$/i, "") : "";
    if (current) {
      console.log(`[ebay] ${name}: obligatoire déjà pré-rempli par eBay ("${current}"), conservé`);
      continue;
    }
    unfilled.push(name);
  }
  return unfilled;
}

async function fillSpecificSafe(labels, rawValue, warnings) {
  const fieldName = labels[0].toLowerCase();
  try {
    await dismissLightboxes();
    const found = findSpecificLabelButton(labels);
    if (!found) {
      // Champ absent de cette catégorie : normal (specifics dynamiques), silencieux.
      return false;
    }
    const anatomy = specificRow(found.btn);
    if (!anatomy) throw new Error(`bouton-valeur (se-expand-button) introuvable pour "${found.label}"`);
    // ⚠️ "Tendances" est un BADGE d'aide affiché dans le bouton-valeur de
    // certains champs (Matière, Type de taille...), pas une valeur
    // sélectionnée — faux positif vécu au dry-run ("déjà rempli (Tendances)").
    const readValue = () => anatomy.expandBtn.textContent.trim().replace(/^Tendances$/i, "");
    // eBay pré-remplit beaucoup depuis le titre et la catégorie (Département,
    // Type, Style...) : on ne ré-écrit jamais une valeur existante.
    const current = readValue();
    if (current) {
      console.log(`[ebay] ${found.label}: déjà rempli ("${current}"), conservé`);
      return true;
    }

    // 2 poses, chacune VÉRIFIÉE par relecture (2026-07-12, même rigueur que
    // fillDescription) : un clic (chip, toggle, option de menu) peut ne pas
    // être enregistré par eBay pendant que la ligne se re-rend — vécu en LIVE
    // réel, chip Marque « Patagonia » visible à l'écran mais jamais cochée,
    // job soumis puis refusé (« La caractéristique de l'objet Marque est
    // manquante »). Seule la valeur RELUE dans le bouton-valeur fait foi,
    // jamais le fait d'avoir cliqué. La 2e pose ignore la chip et passe par
    // le menu, le chemin le plus explicite.
    for (let attempt = 1; attempt <= 2; attempt++) {
      await setSpecificValue(found, anatomy, rawValue, warnings, fieldName, { skipChip: attempt > 1 });
      // 8 s : l'onglet de travail est caché, le commit React qui affiche la
      // valeur est différé par le throttling (observé en session réelle
      // 2026-07-12 : toggle Taille cliqué → valeur "M" visible ~1-2 s plus
      // tard, davantage sous charge).
      const taken = await waitFor(() => readValue() || null, 8000);
      if (taken) {
        console.log(`[ebay] ${found.label}: valeur posée et relue ("${taken}")${attempt > 1 ? " (2e pose)" : ""}`);
        return true;
      }
      console.warn(`[ebay] ${found.label}: valeur non enregistrée (relecture vide, pose ${attempt}/2)`);
      // Referme un éventuel menu/panneau resté ouvert avant de re-poser.
      document.body.click();
      await sleep(randInt(1200, 2200));
      await dismissLightboxes();
    }
    throw new Error(`la valeur "${rawValue}" ne persiste pas après 2 poses (relecture vide)`);
  } catch (e) {
    const note = `${fieldName}: champ sauté — ${e.message}`;
    console.warn(`[ebay] ⚠️ ${note}`);
    warnings.push(note);
    document.body.click(); // referme un éventuel menu resté ouvert
    await humanPause();
    return false;
  }
}

// Pose UNE fois la valeur d'un specific (chip / toggles / menu) — l'écriture
// seule : la vérification par relecture vit dans fillSpecificSafe. Jette sur
// les cas sans issue (option absente du référentiel de la page, menu pas
// ouvert), que la relance ne réparerait pas.
async function setSpecificValue(found, anatomy, rawValue, warnings, fieldName, { skipChip = false } = {}) {
  // Fast-path 1 : chip "Fréquemment sélectionnées" qui matche exactement —
  // un clic, pas de menu, pas de frappe (précieux aussi parce que l'onglet
  // de travail est en arrière-plan : les timers y sont bridés à 1 s).
  if (!skipChip) {
    const chip = [...anatomy.row.querySelectorAll("button.fake-link")]
      .find((b) => normalizeFuzzy(b.textContent) === normalizeFuzzy(String(rawValue)));
    if (chip) {
      realClick(chip);
      await humanPause();
      console.log(`[ebay] ${found.label}: chip "Fréquemment sélectionnées" cliquée ("${chip.textContent.trim()}")`);
      return;
    }
  }

  // Fast-path 2 : certains champs (Taille sur les vêtements) ne sont PAS
  // des menus mais un GROUPE DE TOGGLES (2XS...4XL) rendu directement dans
  // la ligne (vécu au dry-run : "menu pas ouvert") — cascade sur les
  // toggles, pas de dropdown.
  const toggles = [...anatomy.row.querySelectorAll("button.se-toggle-button-group__toggle-button, .toggle-button")];
  if (toggles.length) {
    const match = findOptionCascade(anatomy.row, "button.se-toggle-button-group__toggle-button, .toggle-button", String(rawValue));
    if (!match) {
      throw new Error(
        `option "${rawValue}" absente du groupe de toggles. Options: ` +
        JSON.stringify(toggles.map((t) => t.textContent.trim()).slice(0, 20))
      );
    }
    realClick(match.el);
    await humanPause();
    if (match.stage !== "exact") {
      const note = `${fieldName}: "${rawValue}" → toggle eBay "${match.label}" (match ${match.stage})`;
      console.warn(`[ebay] ≈ ${note}`);
      warnings.push(note);
    }
    return;
  }

  found.btn.scrollIntoView({ block: "center" });

  // Menu ouvert : recherche + options. La recherche filtre ET permet
  // d'ajouter une valeur libre ("Recherchez/ajoutez des détails").
  //
  // ⚠️ Recherche SCOPÉE À LA LIGNE (relevé en session réelle 2026-07-11,
  // catégorie 15687 T-shirts) : les menu-containers des specifics
  // coexistent TOUS dans le DOM dès le rendu (10 relevés, un par ligne,
  // le 1er du document étant celui de Marque), cachés tant que leur ligne
  // n'est pas dépliée. L'ancien document.querySelector(SPECIFICS_MENU_SELECTOR)
  // regardait donc toujours le container de MARQUE : Marque passait
  // (container document-first), Couleur/Matière ne passaient jamais
  // ("menu pas ouvert") alors que leur menu s'ouvrait bien — Taille passait
  // par les toggles et Type/Département étaient pré-remplis, ce qui a
  // masqué le bug. Le menu qui s'ouvre est .fake-menu-button__menu dans le
  // .se-filter-menu-button de la ligne ; fallback document pour ne pas
  // régresser si eBay téléporte un jour le menu hors de la ligne.
  const holder = anatomy.expandBtn.closest(".se-filter-menu-button") || anatomy.row;
  const visibleMenu = () => {
    const scoped = holder.querySelector(`${SPECIFICS_MENU_SELECTOR}, .fake-menu-button__menu`);
    if (scoped && scoped.offsetParent !== null) return scoped;
    const global = document.querySelector(SPECIFICS_MENU_SELECTOR);
    return global && global.offsetParent !== null ? global : null;
  };
  // Onglet de travail CACHÉ (observé en session réelle 2026-07-12) : la
  // réaction d'eBay au clic (ouverture du menu, commits d'état React) est
  // DIFFÉRÉE de plusieurs secondes par le throttling — un clic peut sembler
  // perdu alors qu'il n'a pas encore produit son effet. On attend d'abord ;
  // si aria-expanded n'est toujours pas passé à true (l'état commité), le
  // clic a réellement été avalé (vécu) : on re-clique UNE fois.
  realClick(anatomy.expandBtn);
  let menu = await waitFor(visibleMenu, 4000);
  if (!menu) {
    if (anatomy.expandBtn.getAttribute("aria-expanded") !== "true") {
      console.log(`[ebay] ${found.label}: menu sans réaction au 1er clic — re-clic`);
      realClick(anatomy.expandBtn);
    }
    menu = await waitFor(visibleMenu, 8000);
  }
  if (!menu) throw new Error(`menu du specific "${found.label}" pas ouvert`);

  const search = menu.querySelector("input.textbox__control, input[type='text']");
  if (search) {
    // Valeur posée EN UN SEUL setNativeValue (2026-07-12, même leçon que le
    // prix Vinted) : la frappe incrémentale search.value + char se CORROMPT
    // dans l'onglet de travail caché — les commits React différés par le
    // throttling s'intercalent entre deux écritures. Reproduit en session
    // réelle : "Patagonia" tapé caractère par caractère → "iaPatagonia" dans
    // le champ, filtre sans résultat, champ sauté. Un encadrement
    // keydown/keyup garde une trace clavier plausible ; ce champ vit DANS le
    // menu d'un formulaire déjà rempli à cadence humaine.
    search.focus();
    await humanPause();
    const firstChar = String(rawValue)[0] ?? "";
    dispatchKey(search, "keydown", firstChar);
    dispatchKey(search, "keypress", firstChar);
    setNativeValue(search, String(rawValue));
    dispatchKey(search, "keyup", firstChar);
    // Debounce du filtre : 1500 ms (700 avant) — les timers de la page sont
    // eux aussi bridés quand l'onglet est caché.
    await sleep(1500);
  }

  const optionSelector = '[role="menuitemradio"], [role="menuitemcheckbox"], .menu__item';
  let match = findOptionCascade(menu, optionSelector, String(rawValue));
  if (!match && search) {
    // Aucune option : valeur libre — eBay matérialise la saisie comme
    // première entrée du menu une fois tapée ; on re-scanne sans filtre
    // de cascade (n'importe quelle option contenant la saisie exacte).
    const typed = [...menu.querySelectorAll(optionSelector)]
      .find((o) => normalizeFuzzy(o.textContent).includes(normalizeFuzzy(String(rawValue))));
    if (typed) match = { el: typed, label: typed.textContent.trim(), stage: "saisie-libre" };
  }
  if (!match) {
    const available = [...menu.querySelectorAll(optionSelector)]
      .map((o) => o.textContent.trim()).filter(Boolean).slice(0, 20);
    throw new Error(`option "${rawValue}" sans correspondance. Options: ${JSON.stringify(available)}`);
  }

  await humanPause(); // temps de "lecture" de la liste avant le clic
  realClick(match.el);
  await humanPause();
  // menuitemradio se ferme seul ; menuitemcheckbox (multi) reste ouvert.
  if (document.querySelector(SPECIFICS_MENU_SELECTOR)?.offsetParent) {
    document.body.click();
    await humanPause();
  }
  if (match.stage !== "exact") {
    const note = `${fieldName}: "${rawValue}" → option eBay "${match.label}" (match ${match.stage})`;
    console.warn(`[ebay] ≈ ${note}`);
    warnings.push(note);
  }
}

// ── Format de prix : Enchères → Achat immédiat ──────────────────────────────
// FillSell publie à prix fixe. Le listbox Format (bouton texte "Enchères",
// aria-haspopup=listbox) expose exactement deux options relevées :
// "Enchères" / "Achat immédiat".
async function ensureAchatImmediat(warnings) {
  const current = [...document.querySelectorAll('button[aria-haspopup="listbox"]')]
    .find((b) => ["Enchères", "Achat immédiat"].includes(b.textContent.trim()));
  if (!current) {
    warnings.push("format: listbox Enchères/Achat immédiat introuvable — format eBay par défaut conservé");
    return;
  }
  if (current.textContent.trim() === "Achat immédiat") return;

  realClick(current);
  const option = await waitFor(() => {
    return [...document.querySelectorAll('[role="option"]')]
      .find((o) => o.offsetParent !== null && o.textContent.trim() === "Achat immédiat") || null;
  }, 5000);
  if (!option) {
    warnings.push('format: option "Achat immédiat" pas apparue — format Enchères conservé');
    document.body.click();
    return;
  }
  realClick(option);
  await sleep(800); // re-render de la section PRIX (le champ price apparaît)
}

// ── Description (iframe RTE same-origin #se-rte-frame__summary) ─────────────
// Retourne true si la description a RÉELLEMENT pris, false sinon.
//
// ⚠️ Deux faux positifs vécus en LIVE réel avant d'arriver ici :
// 1. (2026-07-12 matin) iframe pas encore initialisée → attente durcie :
//    document "complete" + zone éditable (20 s).
// 2. (2026-07-12 midi) le VRAI piège, isolé en session réelle sur le
//    formulaire : eBay ne synchronise l'état soumis de la description
//    qu'au BLUR/FOCUSOUT du contenteditable — jamais sur l'événement
//    "input", jamais au keyup (testé un par un). Écrire l'innerHTML et
//    relire le MÊME DOM disait "pris" pendant que l'état eBay restait
//    vide → soumission refusée (« Vous devez ajouter une description »).
//    L'état soumis a un miroir lisible : le textarea CACHÉ
//    [name="description"] (éditeur source HTML du RTE) dans le document
//    PARENT — c'est LUI l'oracle de la relecture, pas le contenteditable.
async function fillDescription(text, warnings) {
  const target = await waitFor(() => {
    const iframe = document.querySelector('iframe#se-rte-frame__summary, iframe[title="Description"]');
    const doc = iframe?.contentDocument;
    if (!doc || doc.readyState !== "complete" || !doc.body) return null;
    return doc.querySelector('[contenteditable="true"]') || doc.body;
  }, 20000);
  if (!target) {
    warnings.push("description: RTE (iframe) pas chargé après 20 s — description non remplie");
    return false;
  }
  // textContent + <br> manuels : le RTE interprète le HTML, on n'injecte
  // que des sauts de ligne (jamais le texte brut en innerHTML).
  const html = String(text)
    .split("\n")
    .map((line) => line.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])))
    .join("<br>");
  // Oracle : miroir de l'état eBay, dans le document parent (pas l'iframe).
  const oracle = () => document.querySelector('textarea[name="description"]');
  const marker = String(text).split("\n")[0].slice(0, 30);
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      target.focus?.();
      target.innerHTML = html;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.ownerDocument.body.dispatchEvent(new Event("input", { bubbles: true }));
      await humanPause();
      // Le déclencheur de synchro (validé en isolation : run 1 et run 2
      // synchronisés au 1er essai, y compris par-dessus un contenu existant).
      target.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      target.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      const synced = await waitFor(() => {
        const ta = oracle();
        return ta && ta.value.includes(marker) ? ta : null;
      }, 8000);
      if (synced) {
        console.log(`[ebay] description synchronisée (textarea miroir, ${synced.value.length} car.)${attempt > 1 ? " (2e pose)" : ""}`);
        return true;
      }
      if (!oracle()) {
        // Markup eBay changé (plus de textarea miroir) : repli sur la
        // relecture du contenteditable, avec un warning-relevé pour ne pas
        // masquer la perte de l'oracle.
        const got = (target.textContent || "").replace(/\s+/g, " ").trim();
        const ok = got.length >= Math.min(20, String(text).trim().length);
        warnings.push("description: textarea miroir [name=description] introuvable — relecture CE seule (oracle perdu, à re-relever)");
        return ok;
      }
      console.warn(`[ebay] description non synchronisée dans le textarea miroir (pose ${attempt}/2)`);
      await sleep(1500);
    }
  } catch (e) {
    warnings.push(`description: RTE inaccessible (${e.message}) — description non remplie`);
    return false;
  }
  warnings.push("description: posée dans le RTE mais JAMAIS synchronisée dans l'état eBay (textarea miroir vide après 2 poses + blur) — description non prise");
  return false;
}

// ── Popups parasites ─────────────────────────────────────────────────────────
// "Astuces photos" (vécu) et consœurs : .lightbox-dialog avec un bouton OK.
// Jamais plus de quelques itérations, et on ne touche qu'aux boutons de
// fermeture (OK / croix), rien d'autre dans la lightbox.
async function dismissLightboxes() {
  for (let i = 0; i < 3; i++) {
    const dlg = [...document.querySelectorAll(".lightbox-dialog")].find((d) => d.offsetParent !== null);
    if (!dlg) return;
    const closer =
      [...dlg.querySelectorAll("button")].find((b) => b.textContent.trim() === "OK") ||
      dlg.querySelector('button[aria-label*="ermer" i], button.icon-btn');
    if (!closer) return;
    closer.click();
    await sleep(500);
  }
}

// ── Helpers génériques (repris de vinted.js/leboncoin.js — candidats à un
// shared-fill.js commun quand les trois handlers seront stabilisés) ──────────

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
//   - valeur posée en UNE fois (execCommand du texte entier / setter natif),
//     aucune séquence clavier — un champ de 60 caractères en 0 ms ;
//   - rythme mécanique : exactement CLICK_DELAY (250 ms) entre chaque action.
// On remplace donc les délais fixes par des tirages aléatoires (humanPause) et
// la pose de valeur en bloc par une frappe caractère par caractère (typeInto)
// encadrée de keydown/keypress/keyup.
//
// ⚠️ Tous les délais passent par sleep() — donc par le timer Web Worker non
// clampé ci-dessus. Le timing humain reste ainsi valide dans un onglet caché,
// où setTimeout serait bridé à 1/s. Ne JAMAIS remplacer ces sleep() par des
// setTimeout.
const HUMAN_CHAR_MIN = 80, HUMAN_CHAR_MAX = 250;
const HUMAN_ACTION_MIN = 300, HUMAN_ACTION_MAX = 900;
// Pause d'assimilation ENTRE CHAQUE champ (2026-07-12, demandé par Nico après
// observation en direct) : ~5 s pour laisser eBay digérer chaque action
// (re-renders lourds, recalculs de suggestions) avant d'attaquer la suivante.
// Jitter léger : jamais deux pauses identiques (règle anti-bot du projet).
const FIELD_SETTLE_MIN_MS = 4600, FIELD_SETTLE_MAX_MS = 5800;
const fieldSettle = () => sleep(randInt(FIELD_SETTLE_MIN_MS, FIELD_SETTLE_MAX_MS));
const HUMAN_TYPE_MAX_CHARS = 120;
const HUMAN_CHUNK_CHARS = 40;

const randInt = (min, max) => Math.round(min + Math.random() * (max - min));
const humanPause = (min = HUMAN_ACTION_MIN, max = HUMAN_ACTION_MAX) => sleep(randInt(min, max));

function dispatchKey(el, type, char) {
  el.dispatchEvent(new KeyboardEvent(type, {
    key: char, bubbles: true, cancelable: true, composed: true,
  }));
}

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

// Frappe "réelle" (pattern LBC) : execCommand d'abord, setter natif en repli.
// Depuis 2026-07-09 : caractère par caractère à rythme humain (80–250 ms),
// encadré de keydown/keypress/keyup. La sélection initiale est remplacée par le
// premier insertText, les suivants s'insèrent au curseur. Au-delà de
// HUMAN_TYPE_MAX_CHARS on insère par blocs espacés d'une pause humaine.
async function typeInto(input, text) {
  input.focus();
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
    // Repli : setter natif, au même rythme humain.
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

// Séquence pointer complète (les composants eBay écoutent pointerdown/up,
// même famille de besoin que Vinted #brand et l'autocomplete LBC).
function realClick(el) {
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    const Ctor = type.startsWith("pointer") ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, view: window }));
  }
}

const normalizeFuzzy = (s) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function containsAsWords(hay, needle) {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(hay);
}

// Cascade v2 : exact → option⊂valeur (la plus longue) → valeur⊂option (la
// plus courte) → composants (et/,/&/+).
// ⚠️ DIVERGENCE avec vinted.js/leboncoin.js depuis le 2026-07-11 : le stage
// "exact" ne fait PLUS le fallback label.split("/"). Chez Vinted, une case
// "M / 38 / 10" est UNE option à équivalences (le split y est légitime) ;
// chez eBay, "M/L" et "L" sont DEUX tailles DISTINCTES (demi-tailles) — le
// split créait un faux positif : taille="L" matchait le segment "L" de
// "M/L" (avant "L" dans le DOM) et .find() s'arrêtait là. Cas réel : job
// 8dbdeb70 (taille="L", catégorie 15687) affichait "M/L" sélectionné alors
// que l'option "L" existait. Un exact = la valeur ENTIÈRE de l'option, rien
// d'autre ; si "L" n'existe pas, les stages fuzzy prennent le relais (avec
// warning, donc jamais en silence).
function findOptionCascade(root, optionSelector, text) {
  const options = Array.from(root.querySelectorAll(optionSelector))
    .map((el) => ({ el, label: el.textContent.trim(), norm: normalizeFuzzy(el.textContent) }))
    .filter((o) => o.norm);
  if (!options.length) return null;
  const target = normalizeFuzzy(text);

  const exact = options.find((o) => o.norm === target);
  if (exact) return { ...exact, stage: "exact" };

  const optionInTarget = (t) =>
    options.filter((o) => containsAsWords(t, o.norm)).sort((a, b) => b.norm.length - a.norm.length)[0];
  const fuzzy = optionInTarget(target);
  if (fuzzy) return { ...fuzzy, stage: "fuzzy" };

  const targetInOption = (t) =>
    options.filter((o) => containsAsWords(o.norm, t)).sort((a, b) => a.norm.length - b.norm.length)[0];
  const inverse = targetInOption(target);
  if (inverse) return { ...inverse, stage: "fuzzy-inverse" };

  const components = target.split(/\s+et\s+|[,&+/]/).map((c) => c.trim()).filter(Boolean);
  if (components.length > 1) {
    for (const comp of components) {
      const compExact = options.find((o) => o.norm === comp);
      if (compExact) return { ...compExact, stage: "composant" };
      const compFuzzy = optionInTarget(comp) || targetInOption(comp);
      if (compFuzzy) return { ...compFuzzy, stage: "composant" };
    }
  }
  return null;
}

async function urlToFile(url, index) {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  return new File([blob], `photo_${index}.${ext}`, { type: blob.type });
}

async function uploadPhotos(photos) {
  const input = await waitFor(
    () => document.querySelector('input#fehelix-uploader, input[type="file"]'),
    8000
  );
  if (!input) throw new Error("input photos (#fehelix-uploader) introuvable");
  const files = await Promise.all(photos.map((p, i) => urlToFile(p.url, i)));
  const dataTransfer = new DataTransfer();
  files.forEach((f) => dataTransfer.items.add(f));
  input.files = dataTransfer.files;
  await humanPause(); // temps de "sélection des fichiers" avant le dépôt
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(1500 * files.length);
}

console.log("[ebay] Content script FillSell chargé (DRY_RUN =", DRY_RUN, ", v3: entrée par la home + specifics expand-button/chips + timing humain)");
