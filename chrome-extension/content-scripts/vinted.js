// Empreinte de version (2026-07-12) : PREMIÈRE ligne de console à l'injection —
// dit quelle version du code tourne RÉELLEMENT dans l'onglet. À METTRE À JOUR à
// chaque modification de ce fichier.
const VINTED_BUILD = "2026-07-13-23h45 (suppression SANS LAYOUT : garde de peinture retiree — elle interdisait toute suppression en fenetre minimisee)";
console.log(`[vinted.js] build ${VINTED_BUILD}`);

// Content script Vinted — remplit le formulaire de dépôt d'annonce.
//
// ⚠️ DRY_RUN passé à false le 2026-07-12 (session de rodage supervisée par
// Nico : 1 article test, T-shirt Patagonia à 30 €, piloté à la main) : TOUT
// job publish part désormais en LIVE, plus seulement ceux marqués
// platform_fields.live_run. En dry-run, le formulaire était rempli mais le
// bouton publier n'était JAMAIS cliqué — le résultat était loggé en console.
const DRY_RUN = false;

// Panneau réutilisé par les dropdowns du formulaire (confirmé pour Catégorie ;
// supposé partagé avec Marque/Taille/État/Couleur/Matière, mêmes composants
// Vinted). waitForElementGone dessus ne bloque jamais (résout au timeout),
// donc même si l'hypothèse est fausse pour un champ donné, au pire on perd
// le timeout en délai, sans casser le flux.
const DROPDOWN_PANEL_SELECTOR = ".input-dropdown__content";

// ── Communication avec le background ──────────────────────────────────────────

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

  // ── Relais des captures de la sonde réseau (2026-07-13) ─────────────────────
  // La sonde vit dans le monde MAIN (window.__fsCaptures) : elle MEURT avec la
  // page. Or Vinted redirige après une publication réussie — au moment où on
  // voudrait lire la preuve, elle n'existe plus (job ba84ebb0 : annonce en
  // ligne, job en "failed"). La sonde postMessage donc chaque capture ; on la
  // relaie AUSSITÔT au background, seul endroit qui survit à la navigation.
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data?.__fillsellProbe) return;
    try {
      chrome.runtime.sendMessage({ type: "VINTED_PROBE_CAPTURE", capture: e.data.capture }).catch(() => {});
    } catch { /* extension rechargée : sans conséquence */ }
  });
}

// ── Suppression d'annonce (Phase B, 2026-07-11) ────────────────────────────────
// ⚠️ DELETE_DRY_RUN : passé à false le 2026-07-12 sur décision de Nico (session
// autonome). Gate Vinted : 1/3.
//
// ✅ CAUSE ÉLUCIDÉE le 2026-07-12 (ce n'était ni DataDome, ni la connexion, ni
// le sélecteur — les trois hypothèses successives étaient fausses) : la page
// annonce Vinted n'est ni peinte ni hydratée dans un onglet EN ARRIÈRE-PLAN,
// et l'onglet de travail est créé active:false.
//   onglet caché  : DOM complet (HTML serveur), [data-testid="item-delete-button"]
//                   TROUVÉ par querySelector, mais 0×0, offsetParent null, aucun
//                   handler React → simulateFullClick sans aucun effet → la
//                   modale ne se monte jamais → « Modale de confirmation
//                   introuvable » (on accusait la modale ; le coupable était le
//                   clic, qui n'avait rien déclenché).
//   onglet peint  : bouton 361×36, le même clic monte la modale.
// Parade : le background rend l'onglet visible pendant la suppression
// (paintTab), et la garde de peinture ci-dessous refuse tout clic sur un
// élément à 0×0.
//
// Markup de la modale relevé en réel (onglet peint) :
//   item-delete-modal--overlay, item-delete-modal,
//   item-delete-confirmation-button ("Confirmer et supprimer"),
//   item-delete-cancelation-button ("Annuler")
// → les sélecteurs du 2026-07-11 étaient corrects et le sont restés.
// SÉLECTEURS CONFIRMÉS en session réelle du 2026-07-11 (annonce
// /items/9376376044 réellement publiée puis supprimée) :
//   page annonce vendeur → button[data-testid="item-delete-button"]
//     ("Supprimer" — visible directement, avec item-edit-button,
//      item-hide-button, mark-as-sold-button, mark-as-reserved-button)
//   modale "Supprimer l'article" →
//     button[data-testid="item-delete-confirmation-button"]
//       ("Confirmer et supprimer")
//     button[data-testid="item-delete-cancelation-button"] ("Annuler")
//   après confirmation : redirection vers /member/<id> ; l'URL de l'annonce
//   sert ensuite une page "Page not found".
const DELETE_DRY_RUN = false;

async function deleteListing(job) {
  const trace = [];
  const t = (line) => { trace.push(line); console.log(`[vinted][delete] ${line}`); };

  // Le background a navigué l'onglet de travail sur listing_url : on doit
  // être sur la page de l'annonce (côté propriétaire).
  if (!/\/items\/\d+/.test(location.pathname)) {
    return { success: false, error: `Page inattendue pour une suppression Vinted : ${location.href}`, trace };
  }
  t(`page annonce ok : ${location.pathname}`);
  await humanPause(800, 1800);

  // Sélecteur CONFIRMÉ (session réelle 2026-07-11) en tête de cascade, puis
  // repli générique testid → texte exact → menu "plus d'options" (ouvrir un
  // menu n'est pas destructif, cliquer "Supprimer" le serait — jamais fait
  // en dry-run).
  let control =
    document.querySelector('[data-testid="item-delete-button"]') ??
    document.querySelector('[data-testid*="delete"]');
  if (control) t(`contrôle trouvé par testid : ${control.getAttribute("data-testid")}`);

  if (!control) {
    control = findDeleteByText();
    if (control) t(`contrôle trouvé par texte : "${control.textContent.trim()}"`);
  }

  if (!control) {
    // Menu "..." / "Plus d'options" éventuel sur la page annonce vendeur.
    const menuBtn = Array.from(document.querySelectorAll("button")).find((b) => {
      const label = (b.getAttribute("aria-label") || "").toLowerCase();
      return /options|plus d|more/.test(label);
    });
    if (menuBtn) {
      t(`menu candidat ouvert : aria-label="${menuBtn.getAttribute("aria-label")}"`);
      simulateFullClick(menuBtn);
      await humanPause(600, 1200);
      control = document.querySelector('[data-testid*="delete"]') || findDeleteByText();
      if (control) t(`contrôle trouvé dans le menu : "${control.textContent.trim()}"`);
    }
  }

  if (!control) {
    const visible = Array.from(document.querySelectorAll("button, a"))
      .map((b) => b.textContent.trim()).filter((s) => s && s.length < 40).slice(0, 25);
    t(`contrôle Supprimer INTROUVABLE — libellés visibles : ${visible.join(" | ")}`);
    if (DELETE_DRY_RUN) return { success: true, dryRun: true, found: false, trace };
    return { success: false, error: "Contrôle de suppression introuvable sur la page annonce", trace };
  }

  if (DELETE_DRY_RUN) {
    t("🧪 DELETE_DRY_RUN actif — contrôle localisé, AUCUN clic effectué.");
    return { success: true, dryRun: true, found: true, trace };
  }

  // ── LIVE ─────────────────────────────────────────────────────────────────
  // ⚠️ GARDE DE PEINTURE SUPPRIMÉE (2026-07-13). Elle exigeait que le bouton
  // mesure plus de 0×0 avant de cliquer — or l'onglet de travail vit désormais
  // dans une fenêtre MINIMISÉE, jamais rendue : le bouton y mesure TOUJOURS 0×0.
  // Cette garde interdisait donc purement et simplement toute suppression Vinted.
  // Son hypothèse de départ (« sans layout, le clic part dans le vide et les
  // handlers React ne sont pas attachés ») est INFIRMÉE par un run réel du
  // 2026-07-13 : en fenêtre minimisée, les clics de suppression eBay ont bel et
  // bien retiré les deux annonces. Le clic fonctionne sans layout ; c'était la
  // LECTURE (rects, innerText) qui était aveugle, pas l'action.
  // On clique donc, et c'est la MODALE qui fait foi juste après — puis, en
  // dernier ressort, l'état réel de l'annonce, vérifié par le background.
  t(`bouton Supprimer localisé (visibilityState=${document.visibilityState}, pas de mesure de layout) — clic`);
  control.scrollIntoView({ block: "center" });
  await humanPause(600, 1200);
  simulateFullClick(control);
  await humanPause(800, 1600);
  // Modale "Supprimer l'article" — sélecteur CONFIRMÉ (2026-07-11) :
  // item-delete-confirmation-button ("Confirmer et supprimer"), repli texte.
  const confirmBtn = await waitFor(() => {
    return (
      document.querySelector('[data-testid="item-delete-confirmation-button"]') ??
      (() => {
        const dialog = document.querySelector('[role="dialog"], .ReactModal__Content');
        if (!dialog) return null;
        return Array.from(dialog.querySelectorAll("button"))
          .find((b) => /confirmer et supprimer|supprimer|delete/i.test(b.textContent)) ?? null;
      })()
    );
  }, 6000);
  if (!confirmBtn) {
    // Si on arrive ici, ce n'est PAS un problème de peinture (vérifiée juste
    // au-dessus) : la modale ne s'est réellement pas montée, ou son markup a
    // changé. On remonte les testids présents — c'est ce relevé qui a permis
    // d'élucider le cas du 2026-07-12.
    const testids = [...document.querySelectorAll("[data-testid]")]
      .map((e) => e.getAttribute("data-testid"))
      .filter((id) => /delete|modal|dialog/i.test(id));
    t(`modale NON montée — testids delete/modal présents : ${testids.join(", ") || "(aucun)"}`);
    return {
      success: false,
      error: `Modale de confirmation introuvable après le clic Supprimer (testids présents : ${testids.join(", ") || "aucun"})`,
      trace,
    };
  }
  t(`confirmation : "${confirmBtn.textContent.trim()}"`);
  simulateFullClick(confirmBtn);
  // Confirmé en réel : redirection vers /member/<id> après suppression.
  await sleep(3000);
  return { success: true, trace };
}

function findDeleteByText() {
  return Array.from(document.querySelectorAll("button, a, [role='button'], [role='menuitem']"))
    .find((el) => /^supprimer( l['’]annonce)?$/i.test(el.textContent.trim())) ?? null;
}

// waitFor local à la suppression (vinted.js n'avait que waitForElement, à
// sélecteur fixe — ici la condition est composée).
async function waitFor(fn, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = fn();
    if (value) return value;
    await sleep(150);
  }
  return null;
}

// ── Remplissage du formulaire ──────────────────────────────────────────────────

/**
 * @param {object} job — un job cross_post_jobs (colonnes réelles vérifiées en base) :
 *   { id, platform, title, description, price, photos, photo_option, platform_fields, inventaire_id }
 *   photos: [{ url, type }] — pas des File, il faut fetch() chaque url.
 *   platform_fields (vinted, vérifié sur des jobs réels) : { etat, marque, taille, matiere, categorie }
 *     - categorie est le libellé FillSell plat (ex: "Mode"), pas un chemin Vinted.
 *       Aucun mapping catégorie FillSell → chemin catalogue Vinted n'existe encore
 *       dans le projet (vérifié : ni ici, ni côté génération des jobs pour les
 *       autres plateformes). La sélection de catégorie ci-dessous n'est donc
 *       jamais déclenchée par les jobs actuels — elle est câblée en attente
 *       d'un futur `platform_fields.categoryPath` (tableau de labels dans l'ordre
 *       du chemin Vinted, ex: ["Femmes","Vêtements","Robes","Midi"]) sans rien
 *       inventer côté mapping. `colors` (tableau, 2 max, dominante d'abord) est
 *       fourni depuis 2026-07 par l'app (couleur IA → split → colors) ; seul
 *       `packageSize` reste sans source de donnée, câblé en best-effort.
 * @returns {Promise<{success: boolean, dryRun?: boolean, listingUrl?: string, error?: string}>}
 */
async function fillListingForm(job) {
  console.log("[vinted] fillListingForm — job:", job.id, job.title, DRY_RUN ? "(DRY_RUN)" : "(LIVE)");

  // Session : le background vient de naviguer l'onglet de travail sur
  // /items/new. Si Vinted a redirigé ailleurs (login, vérification) ou
  // affiche un formulaire d'authentification, on s'arrête AVANT tout
  // remplissage : needsUser (ré-armement borné côté background, jamais de
  // retry immédiat), aucune interaction sur une page de connexion.
  if (!location.pathname.startsWith("/items/new") || document.querySelector('input[type="password"]')) {
    return {
      success: false,
      needsUser: true,
      error:
        "Connexion Vinted requise : se connecter sur vinted.fr dans Chrome " +
        "(l'onglet de travail est resté ouvert), le job repartira au prochain passage.",
    };
  }

  const fields = job.platform_fields || {};

  // Fallback explicite : sans chemin de catégorie, l'annonce ne peut pas être
  // publiée sur Vinted — on échoue AVANT de remplir quoi que ce soit, avec un
  // message actionnable. `vintedGenreRequired` (posé par l'app à la création
  // du job quand l'icône est un article de mode adulte) permet de distinguer
  // la vraie cause : genre manquant/Mixte vs icône hors mapping. Vinted n'a
  // aucun rayon Mixte (vérifié sur l'arbre complet) — pour la mode, seul un
  // rayon Femme/Homme est publiable.
  if (!fields.categoryPath?.length) {
    if (fields.vintedGenreRequired && (!fields.genre || fields.genre === "Mixte")) {
      return {
        success: false,
        error:
          "Genre requis pour cet article : c'est un article de mode et Vinted ne " +
          "propose que les rayons Femmes/Hommes (pas de Mixte). Choisir Femme ou " +
          "Homme dans les champs Vinted de l'app, puis régénérer le job.",
      };
    }
    if (fields.vintedGenreRequired && fields.genre === "Enfant") {
      return {
        success: false,
        error:
          "Article de mode en genre Enfant — rayon Enfants hors périmètre du " +
          "mapping actuel (Lot 1 = adultes). Prévu en Lot 2.",
      };
    }
    return {
      success: false,
      error:
        "platform_fields.categoryPath absent — article non mappé vers le catalogue Vinted " +
        "(icône hors périmètre du mapping, ou job antérieur au mapping). " +
        "Régénérer l'annonce depuis l'app, ou compléter src/utils/vintedCategories.js.",
    };
  }

  const photoResult = job.photos?.length ? await uploadPhotos(job.photos) : null;
  if (job.title) await fillTextField('#title, [data-testid="title--input"]', job.title);
  if (job.description) await fillTextField('#description, [data-testid="description--input"]', job.description);

  await selectCategory(fields.categoryPath);

  // Dégradation propre : seule la CATÉGORIE (ci-dessus) reste bloquante —
  // sans elle rien n'est publiable. Tous les champs à choix fermé qui
  // suivent sautent avec un warning en cas de libellé introuvable, plutôt
  // que de faire échouer le job entier sur un détail.
  const warnings = [];
  if (photoResult?.duplicated) {
    warnings.push(
      `photos: ${job.photos.length} fournie(s), complétées à ${photoResult.count} par duplication ` +
      "(Vinted exige 3 photos minimum sur les marques premium)"
    );
  }

  if (fields.marque) {
    // Deux sections dans le menu marque avec des ids différents :
    // "Marques populaires" (id="brand-XXX") et "Suggestions"
    // (id="suggested-brand-XXX"). L'aria-label porte le nom exact de la
    // marque dans les deux → on matche dessus (flag "i" : insensible à la
    // casse), au lieu du préfixe d'id qui ratait les suggestions.
    try {
      await selectSimpleOption(
        '#brand, [data-testid="brand-select-dropdown-input"]',
        `[role="button"][aria-label="${CSS.escape(fields.marque)}" i]`,
        fields.marque,
        { searchInputSelector: "#brand-search-input" }
      );
    } catch (e) {
      const note = `marque: champ sauté — ${e.message}`;
      console.warn(`[vinted] ⚠️ ${note}`);
      warnings.push(note);
      await closeAnyOpenDropdown();
    }
  }

  // ── High-Tech (2026-07-13, relevé RÉEL du formulaire Téléphones portables —
  // échec 400 du job f69e319c : model / internal_memory_capacity / sim_lock
  // tous requis et jamais remplis) ────────────────────────────────────────────
  // ⚠️ Le champ Modèle (#model) n'EXISTE dans le DOM qu'après la pose de la
  // MARQUE (constaté : il apparaît à la sélection de Xiaomi) — ce bloc doit
  // rester APRÈS le bloc marque ci-dessus. Ses options n'ont PAS d'aria-label
  // (contrairement aux marques) : on matche par texte sur les fils --title.
  if (fields.modele) {
    try {
      await selectSimpleOption(
        '#model, [data-testid="model-select-input"]',
        '[data-testid^="model-"][data-testid$="--title"]',
        fields.modele,
        { searchInputSelector: "#model-search-input" }
      );
    } catch (e) {
      const note = `modèle: champ sauté — ${e.message}`;
      console.warn(`[vinted] ⚠️ ${note}`);
      warnings.push(note);
      await closeAnyOpenDropdown();
    }
  }
  // Espace de stockage : liste fermée (20 options relevées, 256 Mo → 4 To),
  // mêmes testids que état/matière → cascade standard.
  if (fields.stockage) {
    await selectClosedOptionSafe(
      "stockage",
      '#internal_memory_capacity, [data-testid="category-internal_memory_capacity-single-list-input"]',
      '[data-testid^="internal_memory_capacity-"]',
      fields.stockage,
      warnings
    );
  }
  // Simlockage : champ OBLIGATOIRE du formulaire téléphone (400 réel du job
  // f69e319c : « Sélectionne une valeur pour continuer »).
  // ⚠️ SÉMANTIQUE PIÉGEUSE, prouvée sur annonces réelles le 2026-07-13 : le
  // libellé porteur est « Simlockage » (Non = pas de simlock = désimlocké),
  // PAS le placeholder « L'appareil est-il désimlocké ? » — 4 annonces sur 5
  // dont la description dit « désimlocké » portent sim_lock="Non" (la 5e est
  // un vendeur piégé par cette ambiguïté de Vinted).
  // DÉFAUT ASSUMÉ : « Non » (= désimlocké), la quasi-totalité du marché FR de
  // l'occasion — indéductible d'une photo, donc jamais généré par l'IA.
  // fields.simlock ("Oui"/"Non") prime s'il est fourni un jour. Le bloc est
  // gaté sur la PRÉSENCE du champ dans le DOM : hors téléphone, il n'existe
  // pas et on ne tente rien.
  if (document.querySelector('#sim_lock, [data-testid="category-sim_lock-single-list-input"]')) {
    await selectClosedOptionSafe(
      "simlockage",
      '#sim_lock, [data-testid="category-sim_lock-single-list-input"]',
      '[data-testid^="sim_lock-"]',
      fields.simlock ?? "Non",
      warnings
    );
  }

  if (fields.taille) {
    // La grille Vinted affiche "42", pas "EU 42" (préfixe côté FillSell) —
    // on retire le préfixe, le match exact-par-segment fait le reste.
    await selectClosedOptionSafe(
      "taille",
      '#size, [data-testid="category-size-single-grid-input"]',
      '[data-testid^="size-group-"]',
      String(fields.taille).replace(/^EU\s*/i, ""),
      warnings,
      // Garde anti-nombre-nu : un « 3 » ne doit jamais matcher « 3 ans /
      // 98 cm » par contenance, ni « 36 mois » l'option adulte « 36 ».
      { sizeField: true }
    );
  }
  if (fields.etat) {
    await selectClosedOptionSafe(
      "état",
      '#condition, [data-testid="category-condition-single-list-input"]',
      '[data-testid^="condition-"]',
      fields.etat,
      warnings
    );
  }
  // platform_fields.colors : posé par l'app à l'insert (couleur IA de la liste
  // fermée Vinted, éditable, splittée en tableau). Absent sur les jobs anciens.
  if (fields.colors?.length) await selectColors(fields.colors, warnings);

  if (fields.matiere) {
    // Liste Vinted GLOBALE (55 options identiques toutes catégories,
    // vérifié sur Montres/T-shirts/Sacs) mais l'IA peut générer un composé
    // ("Résine et acier inoxydable") — c'est le cas d'origine de la cascade.
    await selectClosedOptionSafe(
      "matière",
      '#material, [data-testid="category-material-multi-list-input"]',
      '[data-testid^="material-"]',
      fields.matiere,
      warnings
    );
  }
  if (job.price != null) await fillPriceField(job.price);

  // Format de colis — RÈGLE PRODUIT (Nico, 2026-07-12) : sur TOUTE la branche
  // Mode (vêtements ET chaussures), c'est TOUJOURS « Petit », sans exception.
  // ⚠️ Ne pas se fier au "défaut pré-coché" : Vinted pré-coche selon la
  // CATÉGORIE et met « Moyen » sur les chaussures (constaté sur l'annonce New
  // Balance de ce soir, colis parti en Moyen). On clique donc explicitement.
  // Hors Mode (le peu qui existe sur Vinted), aucune donnée de poids n'existe
  // dans le projet : on laisse le défaut de Vinted plutôt que de deviner.
  const isFashionJob =
    (job.platform_fields?.categorie ?? "") === "Mode" ||
    /^(femmes?|hommes?|enfants?|filles?|gar[çc]ons?)$/i.test(String(fields.categoryPath?.[0] ?? "")) ||
    Boolean(String(job.platform_fields?.taille ?? "").trim());
  const wantedPackage = fields.packageSize ?? (isFashionJob ? "Petit" : null);
  if (wantedPackage) await selectPackageSize(wantedPackage);

  // Gate par job (2026-07-11) : DRY_RUN global reste true par défaut ; un job
  // marqué platform_fields.live_run === true (test supervisé) publie vraiment.
  const dryRun = DRY_RUN && job.platform_fields?.live_run !== true;
  if (dryRun) {
    console.log(
      "[vinted] 🧪 DRY_RUN actif — formulaire rempli, publication NON déclenchée.",
      "\nJob:", job.id,
      "\nTitre:", job.title,
      "\nPrix:", job.price,
      "\nChamps plateforme:", fields,
      warnings.length ? `\nWarnings (${warnings.length}): ${warnings.join(" | ")}` : "\nAucun warning."
    );
    // unfilledRequired systématiquement VIDE sur Vinted, et c'est un constat,
    // pas un oubli : le seul champ marqué obligatoire dans le code est le
    // genre (vintedGenreRequired), et il est contrôlé par precheckJob AVANT
    // toute navigation — un job sans genre n'atteint jamais ce handler. Aucun
    // des champs remplis ici (état, taille, marque, matière, couleurs,
    // packageSize) n'est marqué requis où que ce soit. On expose quand même la
    // clé pour que les 4 handlers aient le même contrat côté background.
    return { success: true, dryRun: true, warnings, unfilledRequired: [] };
  }

  // Filet avant le clic (2026-07-11) : un panneau de dropdown resté ouvert
  // recouvre le bouton Publier et le clic part dans le vide, sans erreur.
  await closeAnyOpenDropdown();

  const publishBtn = await waitForElement('[data-testid="upload-form-save-button"]');
  publishBtn.click();
  await sleep(2500);

  // Modale "Ajoute des photos à cette annonce" (marques premium, < 3 photos) :
  // uploadPhotos complète désormais toujours à 3, mais si Vinted durcit sa
  // règle, on la DÉTECTE au lieu de croire à une publication réussie — le job
  // repart en needsUser plutôt qu'en published fantôme.
  const photoModal = Array.from(document.querySelectorAll("h2, h3, [role='dialog']"))
    .some((el) => /ajoute des photos à cette annonce/i.test(el.textContent || ""));
  if (photoModal) {
    return {
      success: false,
      needsUser: true,
      error:
        "Vinted refuse la publication : « Ajoute des photos à cette annonce » (minimum imposé sur " +
        "les marques premium). Ajouter des photos à l'annonce dans l'app, puis régénérer le job.",
      warnings,
    };
  }

  // ⚠️ PREUVE DE PUBLICATION (2026-07-12) — le trou noir du run de ce soir.
  // AVANT : on retournait `success: true` juste après le clic, sans rien
  // vérifier. Quand Vinted REFUSAIT le formulaire (validation : « Le champ prix
  // doit être supérieur ou égal à 1.0 »), le job partait quand même en
  // "published" — annonce inexistante, listing_url vide ("aucune URL capturée"),
  // et pire : une annonce fantôme entrait dans le poll de détection de vente.
  // Vérifié en base ce soir : 2 jobs Vinted "published" (Xiaomi, New Balance)
  // alors que la garde-robe Vinted ne contient NI l'un NI l'autre.
  // MAINTENANT : on ne conclut au succès que sur une PREUVE — la redirection
  // vers la page de l'annonce (/items/<id>) — et on remonte le message de
  // validation exact quand Vinted refuse.
  const proof = await waitForPublishOutcome();
  if (proof.error) {
    // La sonde réseau dit ce que Vinted a REÇU (et répondu) — c'est elle qui
    // tranchera si le prix part à 0/null malgré un champ correctement affiché.
    return { success: false, error: proof.error, warnings };
  }
  return { success: true, listingUrl: proof.listingUrl, warnings };
}

// Après le clic Publier, Vinted fait l'un des QUATRE (le 4e découvert en réel
// le 2026-07-13, job 32a47b4e) :
//   1. redirige vers /items/<id> (succès — preuve n°1) ;
//   2. reste sur le formulaire et affiche une/des erreurs de validation ;
//   3. rame (upload photos, anti-bot) — on laisse du temps avant de conclure ;
//   4. PUBLIE (HTTP 200, item créé) mais affiche une modale à la place de la
//      redirection (after_upload_actions: ["show_item_verification_modal"]) —
//      l'annonce 9386838630 était réellement en ligne pendant que le job
//      partait en failed « aucune redirection ». D'où la preuve n°2 : la
//      RÉPONSE SERVEUR capturée par la sonde (item.id + code:0 + HTTP 200),
//      qui donne aussi l'URL sans attendre aucune navigation.
async function waitForPublishOutcome(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastValidation = null;

  while (Date.now() < deadline) {
    const m = location.pathname.match(/^\/items\/(\d+)/);
    if (m) return { listingUrl: location.origin + location.pathname };

    const served = await readProbeSuccess();
    if (served) {
      // Fermeture best-effort de la modale post-publication pour laisser
      // l'onglet de travail propre — le succès est déjà acquis, on ne le
      // conditionne à rien de visuel.
      await closePostPublishModal();
      return { listingUrl: served.listingUrl };
    }

    const validation = readValidationErrors();
    if (validation) lastValidation = validation;

    await sleep(1000);
  }

  if (lastValidation) {
    return {
      error:
        `Vinted a REFUSÉ la publication : ${lastValidation} — l'annonce n'a PAS été créée. ` +
        "(Le formulaire est resté sur /items/new.)",
    };
  }
  return {
    error:
      "Publication Vinted non confirmée : aucune redirection vers la page de l'annonce après " +
      `${timeoutMs / 1000} s, et aucun message d'erreur lisible. L'annonce n'a PAS été considérée ` +
      "comme publiée (le statut ne sera pas 'published' sans preuve).",
  };
}

// Preuve n°2 : la sonde réseau (monde MAIN, posée par le background) a capturé
// la réponse du POST /api/v2/item_upload/items. HTTP 200 + code:0 + item.id ⇒
// l'annonce EXISTE, quelle que soit la suite visuelle (modale, redirection
// lente…). Les captures portent la réponse en texte tronqué : on extrait par
// motif, pas de parse strict.
async function readProbeSuccess() {
  const res = await askBackground({ type: "VINTED_PROBE_CAPTURES" });
  const captures = Array.isArray(res?.captures) ? res.captures : [];
  for (let i = captures.length - 1; i >= 0; i--) {
    const c = captures[i];
    if (Number(c?.status) !== 200) continue;
    if (!/item_upload\/items/i.test(String(c?.url ?? ""))) continue;
    const body = String(c?.reponse ?? "");
    const idMatch = body.match(/"item"\s*:\s*\{\s*"id"\s*:\s*(\d+)/);
    if (idMatch && /"code"\s*:\s*0\b/.test(body)) {
      return { listingUrl: `${location.origin}/items/${idMatch[1]}` };
    }
  }
  return null;
}

// Modale post-publication (show_item_verification_modal & consorts) : on tente
// les fermetures classiques du design system Vinted, sans jamais échouer — si
// la modale reste, l'onglet de travail sera de toute façon re-navigué au
// prochain job (et le succès est déjà rapporté).
async function closePostPublishModal() {
  try {
    // offsetParent est null en fenêtre minimisée (aucun layout) : on prendrait
    // toujours « aucune modale ». On prend la première du DOM — best-effort.
    const dialog = document.querySelector('[role="dialog"], .web_ui__Dialog__content');
    if (!dialog) return;
    const closer =
      dialog.querySelector('[data-testid*="close"], button[aria-label*="Fermer" i], button[aria-label*="Close" i]') ??
      Array.from(dialog.querySelectorAll("button")).find((b) =>
        /^(plus tard|non merci|fermer|ok|compris|continuer)$/i.test((b.textContent || "").trim())
      );
    if (closer) {
      simulateFullClick(closer);
      await humanPause();
    }
  } catch { /* best-effort assumé */ }
}

// Messages de validation du formulaire Vinted.
// ⚠️ NE PAS FILTRER PAR VOCABULAIRE (leçon du 2026-07-12). La 1re version exigeait
// que le texte contienne « doit/obligatoire/requis/supérieur/… » — or les messages
// les plus DÉCISIFS de Vinted n'emploient AUCUN de ces mots :
//     « Ajoute au moins une photo »      → MASQUÉ
//     « Choisis une sous-catégorie »     → MASQUÉ
//     « Le champ prix doit être supérieur ou égal à 1.0 » → remonté
// Résultat : sur un refus, on ne remontait QUE l'erreur de prix et on accusait le
// prix… alors que la vraie cause pouvait être la photo ou la catégorie. Vérifié
// sur le VRAI formulaire : un formulaire sans catégorie affiche l'erreur
// « prix ≥ 1.0 » MÊME quand le prix a été tapé au clavier par un humain — ce
// message est donc un SYMPTÔME, pas un diagnostic. On remonte tout, désormais.
function readValidationErrors() {
  const nodes = document.querySelectorAll(
    '[data-testid*="error"], [class*="error"], [role="alert"], .web_ui__InputBar__error'
  );
  const seen = new Set();
  for (const n of nodes) {
    const txt = (n.textContent || "").trim();
    if (!txt || txt.length > 200) continue;
    seen.add(txt);
  }
  return seen.size ? [...seen].join(" · ") : null;
}

// ── Helpers génériques ─────────────────────────────────────────────────────────

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
// où setTimeout serait bridé à 1/s (et où 200 caractères à 165 ms coûteraient
// 200 s au lieu de 33 s). Ne JAMAIS remplacer ces sleep() par des setTimeout.
const HUMAN_CHAR_MIN = 80, HUMAN_CHAR_MAX = 250;
const HUMAN_ACTION_MIN = 300, HUMAN_ACTION_MAX = 900;
// Au-delà de ce seuil (description générée : plusieurs centaines de
// caractères), la frappe caractère par caractère coûterait des minutes et
// ferait exploser le budget de sendMessageToTab. On insère alors par blocs
// espacés d'une pause humaine — ce que fait de toute façon un vendeur qui
// colle un texte puis le relit, et qui reste très loin du "tout en une fois".
const HUMAN_TYPE_MAX_CHARS = 120;
const HUMAN_CHUNK_CHARS = 40;

const randInt = (min, max) => Math.round(min + Math.random() * (max - min));
const humanPause = (min = HUMAN_ACTION_MIN, max = HUMAN_ACTION_MAX) => sleep(randInt(min, max));

// Événements clavier synthétiques : ils n'insèrent aucun texte (c'est
// setNativeValue/execCommand qui le fait) mais ils donnent aux écouteurs de la
// page la séquence qu'une vraie frappe produit. Untrusted (isTrusted=false),
// comme tous nos events — on ne cherche pas à tromper une détection qui
// inspecte isTrusted, seulement à ne plus émettre un profil de frappe absurde.
function dispatchKey(el, type, char) {
  el.dispatchEvent(new KeyboardEvent(type, {
    key: char, bubbles: true, cancelable: true, composed: true,
  }));
}

// Frappe humaine dans un input/textarea React. ⚠️ Ne PAS utiliser sur un champ
// à masque de saisie (prix Vinted) : la concaténation sur el.value relit une
// valeur déjà reformatée par la page (bug "NaN €", cf. fillPriceField).
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

// Attend qu'un élément apparaisse dans le DOM (pages SPA à rendu différé).
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

// Certains champs (ex: #brand) semblent dépendre de la catégorie tout juste
// choisie (les IDs "suggested-brand-*" du rapport DOM varient par catégorie) :
// React peut remonter/remplacer ce nœud juste après la fermeture du popup
// Catégorie. waitForElement renvoie le PREMIER nœud trouvé, qui peut être sur
// le point d'être détaché — cliquer dessus ne produit alors aucun effet
// visible, sans lever d'exception. On vérifie que le nœud trouvé est encore
// le même après une courte pause avant de le considérer "stable" à cliquer.
async function waitForStableElement(selector, timeoutMs = 5000, settleMs = 200) {
  const start = Date.now();
  let el = await waitForElement(selector, timeoutMs);
  while (Date.now() - start < timeoutMs) {
    await sleep(settleMs);
    const again = document.querySelector(selector);
    if (again === el) return el; // même nœud avant/après la pause : stable
    el = again || (await waitForElement(selector, timeoutMs - (Date.now() - start)));
  }
  return el;
}

// Attend qu'un élément disparaisse du DOM ou devienne invisible (offsetParent
// null — couvre le cas où Vinted le laisse monté mais masqué pendant
// l'animation de fermeture). Ne rejette jamais : au pire on attend le
// timeout puis on continue, pour ne pas bloquer indéfiniment si l'hypothèse
// de sélecteur est fausse pour un champ donné.
function waitForElementGone(selector, timeoutMs = 3000) {
  const isGone = () => {
    const el = document.querySelector(selector);
    return !el || el.offsetParent === null;
  };
  return new Promise((resolve) => {
    if (isGone()) return resolve(true);
    const observer = new MutationObserver(() => {
      if (isGone()) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(true);
      }
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}

// Assigne une valeur à un input/textarea contrôlé par React en déclenchant
// le setter natif + les events "input"/"change", sinon le state React ne voit rien.
function setNativeValue(element, value) {
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

// Confirmé par test réel : element.click() natif est bien tenté sur #brand
// (nœud stable, isConnected) mais n'ouvre pas le panneau — contrairement à
// #category où click() suffit. Certains composants React n'écoutent pas
// l'event "click" haut niveau mais pointerdown/mousedown (pattern courant
// pour les listbox/combobox afin de gérer focus et fermeture au clic
// extérieur sans race condition). On rejoue la séquence bas niveau complète
// qu'un vrai clic souris génère, dans l'ordre, avec des coordonnées réalistes.
function simulateFullClick(element) {
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const base = { bubbles: true, cancelable: true, composed: true, view: window, clientX, clientY, button: 0 };

  element.dispatchEvent(new PointerEvent("pointerdown", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
  element.focus();
  element.dispatchEvent(new PointerEvent("pointerup", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
  element.dispatchEvent(new MouseEvent("click", base));
}

async function fillTextField(selector, value) {
  const el = await waitForElement(selector);
  await typeHuman(el, value);
  el.blur();
  await humanPause();
}

async function fillPriceField(value) {
  // Prix = champ texte à masque monétaire live (virgule + €), pas type="number".
  //
  // ⚠️ HISTORIQUE — deux pièges successifs, le second constaté en PUBLICATION
  // RÉELLE le 2026-07-11 :
  //   1. typeHuman concatène sur el.value, que Vinted reformate à la volée →
  //      chaîne invalide ("NaN €"). D'où l'ancienne pose en un coup.
  //   2. Mais setNativeValue NE SUFFIT PAS : il n'émet qu'un Event("input")
  //      générique, sans inputType ni data. Le masque de Vinted ne met alors
  //      pas à jour SON état interne — le champ AFFICHE bien "200,00 €" mais
  //      la soumission est refusée avec « Le champ prix doit être supérieur
  //      ou égal à 1.0 » (constaté sur l'annonce 9376376044 : publication
  //      bloquée jusqu'à une frappe clavier manuelle).
  // Fix : document.execCommand("insertText") — la seule voie qui produit un
  // vrai InputEvent (inputType/data), comme leboncoin.js (typeInto/
  // setFieldValue) sur ses inputs React.
  //
  // ⚠️ EN UN SEUL APPEL, jamais caractère par caractère : testé en réel le
  // 2026-07-11, une frappe char-by-char via execCommand redonne "NaN €" —
  // le masque reformate le champ après CHAQUE insertion et le caret se
  // retrouve au mauvais endroit, donc les caractères suivants s'insèrent dans
  // la valeur déjà formatée. Une insertion unique sur une sélection totale
  // laisse le masque formater une fois : "200" → "200,00 €" (vérifié).
  // L'exception au timing humain reste assumée (un prix fait 2-4 caractères,
  // ce n'est pas le signal de vitesse qui a déclenché le blocage LBC).
  const str = String(value).replace(".", ",");

  // Saisie complète, ré-exécutable telle quelle (le nœud peut être remonté par
  // React entre deux poses : on le re-résout à chaque appel).
  const typeIntoPrice = async () => {
    const el = await waitForElement('#price, [data-testid="price-input--input"]');
    await humanPause();
    el.focus();
    let ok = false;
    try {
      el.setSelectionRange?.(0, el.value.length);
      document.execCommand("delete", false, null); // vide le champ ET son masque
      await humanPause();
      el.setSelectionRange?.(0, el.value.length);
      dispatchKey(el, "keydown", str[0]);
      ok = document.execCommand("insertText", false, str);
      dispatchKey(el, "keyup", str[str.length - 1]);
    } catch (e) {
      console.warn("[vinted] ⚠️ prix : execCommand indisponible —", String(e?.message ?? e));
    }
    if (!ok) {
      // Repli historique : pose la valeur mais Vinted REFUSE la soumission
      // (« Le champ prix doit être supérieur ou égal à 1.0 ») — la garde
      // ci-dessous ne le verra pas (l'affichage est correct), le clic Publier
      // échouera. Ce repli n'existe que si execCommand disparaît de Chrome.
      console.warn("[vinted] ⚠️ prix : repli setNativeValue — la validation Vinted risque de refuser la soumission");
      setNativeValue(el, str);
    }
    // 'change' natif + el.blur() (focusout réel). ⚠️ RÉVISION 2026-07-13 (lecture
    // des fibers React sur le vrai formulaire) : le blur n'est PAS le point de
    // commit — quand le composant fonctionne, onChange committe SEUL (l'état
    // React porte déjà "95" avant tout blur) et le blur ne fait que FORMATER
    // l'affichage ("95" → "95,00 €"). Le blur réel reste : inoffensif, fidèle au
    // geste humain, et il quitte réellement le champ (l'ancien Event('blur')
    // synthétique ne retirait même pas le focus).
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
    await sleep(800); // laisser un éventuel commit différé se propager
    await humanPause();
    return el;
  };

  let el = await typeIntoPrice();

  // Vérification immédiate : le champ doit afficher un montant non nul et
  // SANS NaN. C'est cette garde qui a attrapé le "NaN €" de la frappe
  // char-by-char en test réel — sans elle, le job serait parti jusqu'au clic
  // Publier pour échouer là-bas, sans message exploitable.
  const shown = String(el.value ?? "");
  if (/nan/i.test(shown) || !/[1-9]/.test(shown)) {
    throw new Error(
      `Prix non pris en compte par Vinted (champ = "${shown}") — la saisie du champ masqué a été rejetée.`
    );
  }

  // ── PREUVE DE COMMIT (2026-07-13) — l'affichage MENT. ────────────────────────
  // Prouvé en run réel (sonde réseau) puis reproduit en session pilotée : le
  // champ peut afficher « 95,00 € » avec un état React VIDE à tous les niveaux
  // (lecture des fibers) — la soumission part alors avec price: null. La
  // catégorie est HORS DE CAUSE (T-shirts et Baskets se comportent à
  // l'identique, testé croisé sur le vrai formulaire) ; le mode défaillant est
  // lié à l'état focus/peinture du document (même famille que le throttling
  // React de l'onglet caché documenté sur eBay). Seul l'état React fait foi, et
  // il n'est lisible que depuis le monde MAIN → on le demande au background.
  //
  // ⚠️ HISTORIQUE des escalades (2026-07-13), les deux prouvées en réel :
  //   v1 repose+onglet peint → ÉCHEC (job c7e10631 : paintTab ne produit aucun
  //      événement, et la lecture « au plus haut » prenait un niveau d'affichage
  //      pour le formulaire — d'où l'exigence de niveau BRUT ci-dessous) ;
  //   v2 clics trusted chrome.debugger → a commité (job 32a47b4e) mais bandeau
  //      « débogage » global non supprimable : invendable en production.
  // v3 — appel DIRECT de props.onChange du composant prix via les fibers
  // (monde MAIN, côté background) : prouvé en session pilotée dans les
  // conditions exactes de l'échec (onglet caché, hasFocus=false, zéro CDP) —
  // le niveau formulaire passe à la valeur brute, signature du mode sain.
  // Invisible, sans permission supplémentaire, Chrome par défaut.
  const expected = parseFloat(String(value).replace(",", "."));
  const committedOk = (s) =>
    Array.isArray(s?.levels) &&
    s.levels.some((v) => {
      if (!v || /€/.test(String(v))) return false; // niveau d'affichage formaté : ne prouve rien
      const n = parseFloat(String(v).replace(",", "."));
      return Number.isFinite(n) && Math.abs(n - expected) < 0.005;
    });
  let state = await askBackground({ type: "VINTED_PRICE_STATE" });
  if (state?.readable && !committedOk(state)) {
    console.warn("[vinted] ⚠️ prix affiché mais NON commité dans l'état React — commit direct par props.onChange (fibers)");
    const commit = await askBackground({ type: "VINTED_COMMIT_PRICE", value: str });
    if (!commit?.ok) {
      console.warn("[vinted] ⚠️ commit direct refusé :", commit?.reason ?? "réponse nulle");
    }
    await sleep(1000); // laisser le re-render propager la prop value
    state = await askBackground({ type: "VINTED_PRICE_STATE" });
    if (state?.readable && !committedOk(state)) {
      throw new Error(
        `Prix jamais commité dans l'état React du formulaire (affiché "${String(el.value ?? "")}", ` +
        `niveaux fibers [${(state?.levels ?? []).map((v) => `"${v}"`).join(", ")}], ` +
        `commit direct : ${commit?.ok ? "ok" : commit?.reason ?? "échec"}) — job arrêté AVANT le ` +
        "clic Publier (sinon Vinted recevrait price: null et refuserait)."
      );
    }
    if (state?.readable) console.log("[vinted] prix commité par props.onChange :", state.levels);
  }
}

// Messages vers le background (lecture des fibers React en monde MAIN, peinture
// temporaire de l'onglet). Résilient : background plus ancien ou message inconnu
// → null, et l'appelant continue comme avant (aucune régression possible).
function askBackground(msg) {
  try {
    return chrome.runtime.sendMessage(msg).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

async function openDropdown(triggerSelector) {
  // Filet de sécurité : si le panneau précédent (ex: Catégorie) n'a pas fini
  // de se fermer, cliquer le trigger suivant tout de suite peut rater le clic
  // ou ouvrir/refermer le mauvais panneau. Ce cas est censé être déjà réglé
  // par l'attente dans confirmDropdownIfNeeded ; ceci est redondant mais
  // gratuit (no-op si le panneau est déjà absent).
  await waitForElementGone(DROPDOWN_PANEL_SELECTOR, 2000);
  // waitForStableElement : certains champs (ex: #brand, dont les suggestions
  // dépendent de la catégorie tout juste choisie — ids "suggested-brand-*" du
  // rapport DOM) peuvent être remontés par React juste après la fermeture de
  // Catégorie. Cliquer le tout premier nœud trouvé risque de cliquer un nœud
  // sur le point d'être détaché.
  const trigger = await waitForStableElement(triggerSelector);
  // Certains composants (confirmé sur #brand) ne sont pas immédiatement
  // réactifs juste après la fermeture du popup précédent : le premier clic
  // (séquence bas niveau pointerdown/mousedown/pointerup/mouseup/click) peut
  // ne rien ouvrir alors même que le nœud est stable et sans exception. Plutôt
  // qu'un délai fixe deviné avant le clic, on attend le résultat qui compte
  // réellement — le panneau ouvert — et on réessaie tant qu'il ne l'est pas.
  const opened = await clickUntilPanelOpens(trigger);
  if (!opened) {
    throw new Error(
      `Le clic sur ${triggerSelector} n'a pas ouvert de panneau (${DROPDOWN_PANEL_SELECTOR}) ` +
      `après plusieurs tentatives.`
    );
  }
  await humanPause();
  return trigger;
}

async function clickUntilPanelOpens(trigger, { attempts = 6, perAttemptMs = 300 } = {}) {
  for (let i = 0; i < attempts; i++) {
    simulateFullClick(trigger);
    const opened = await waitForElement(DROPDOWN_PANEL_SELECTOR, perAttemptMs).catch(() => null);
    if (opened) return true;
  }
  return false;
}

// Confirmé par test réel sur Catégorie : cliquer la feuille (rond radio) ne
// ferme PAS le popup, il faut ensuite cliquer "Fait" pour valider et fermer.
// Comportement des autres popups à liste unique (État, Matière...) non
// vérifié — on tente ce clic partout par prudence : no-op si le bouton
// n'existe pas pour ce champ (ex: Marque semble se fermer seule au clic sur
// une option, à confirmer). Recherche document-wide par texte exact : un
// seul popup est ouvert à la fois, pas de risque de collision.
function findButtonByExactText(text) {
  const candidates = document.querySelectorAll('button, [role="button"]');
  for (const el of candidates) {
    if (el.textContent.trim() === text) return el;
  }
  return null;
}

// Valide ET FERME le panneau. Le "Fait" n'existe pas partout (Matière/Couleur
// en multi-sélection n'en ont pas) : après le clic éventuel, on GARANTIT que
// le panneau a disparu (closeAnyOpenDropdown → clic extérieur complet), sinon
// il recouvre le bouton Publier — bug constaté en publication réelle du
// 2026-07-11.
async function confirmDropdownIfNeeded() {
  const doneBtn = findButtonByExactText("Fait");
  if (!doneBtn) {
    await closeAnyOpenDropdown();
    return;
  }
  doneBtn.click();
  // Attente active de la fermeture réelle du panneau plutôt qu'un délai
  // fixe : hypothèse confirmée par test réel — le clic sur #brand juste
  // après "Fait" (250 ms fixes) tombait sur la modale Catégorie encore en
  // train de se démonter, #brand-search-input n'apparaissait jamais.
  if (!(await waitForElementGone(DROPDOWN_PANEL_SELECTOR, 3000))) {
    await closeAnyOpenDropdown(); // "Fait" cliqué mais panneau récalcitrant
  }
  await humanPause();
}

// Match exact d'abord (texte entier, ou segment pour les grilles de taille
// type "M / 38 / 10"), includes() en repli seulement. Sans ça, "Bon état"
// sélectionne "Très bon état" (premier dans la liste) et la taille "S"
// matche "XS / 34 / 6" — textes d'options confirmés par inspection DOM.
function findOptionByText(root, optionSelector, text) {
  const options = Array.from(root.querySelectorAll(optionSelector));
  // \s+ → " " : mêmes espaces insécables que dans la cascade (cf.
  // normalizeFuzzy — « 128 Go » du DOM porte U+00A0, prouvé job 7b67d67f).
  const normalize = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const target = normalize(text);
  const exact = options.find(
    (o) =>
      normalize(o.textContent) === target ||
      o.textContent.split("/").some((part) => normalize(part) === target)
  );
  if (exact) return exact;
  return options.find((o) => normalize(o.textContent).includes(target));
}

async function waitForOptionByText(optionSelector, text, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = findOptionByText(document, optionSelector, text);
    if (found) return found;
    await sleep(80);
  }
  throw new Error(`Option "${text}" introuvable pour ${optionSelector}`);
}

// ── Matching en cascade pour les champs à choix fermé (matière, état,
// taille, couleur) : l'IA génère du texte libre qui ne colle pas toujours
// aux options Vinted (cas réel : "Résine et acier inoxydable" alors que la
// liste ne propose que "Acier"). Cascade, du plus sûr au plus permissif :
//   1. exact — texte entier ou segment "/" (grilles de taille)
//   2. option ⊂ valeur, en MOTS ENTIERS, accents ignorés — la plus longue
//      option contenue gagne ("acier" trouvé dans "résine et acier
//      inoxydable" ; les mots entiers évitent que "Or" matche "bORdeaux")
//   2bis. valeur ⊂ option, en mots entiers — l'option la plus COURTE gagne
//      ("Unique" → "Taille unique", cas réel de la grille taille des
//      montres, qui liste des diamètres + "Taille unique"). Sans danger
//      pour "Bon état"/"Très bon état" : l'exact passe toujours avant.
//   3. composants — la valeur est éclatée sur "et"/","/"&"/"+"/"/" et
//      chaque composant repasse par 1 puis 2/2bis ("Résine" seul, etc.)
// Retourne { el, label, stage } ou null — le caller décide de skipper. ──
// ⚠️ ESPACES NORMALISÉS (2026-07-13, job 7b67d67f — prouvé par relevé de
// codes) : les options Vinted à valeur numérique portent une ESPACE
// INSÉCABLE entre nombre et unité — « 128 Go » du DOM est
// 0031 0032 0038 00A0 0047 006F (U+00A0), jamais égal au « 128 Go » (espace
// normale) généré par l'IA. Aucun étage de la cascade ne matchait → champ
// stockage sauté → refus 400 Vinted (internal_memory_capacity). \s couvre
// U+00A0 et U+202F : les deux côtés de la comparaison passent par ici.
const normalizeFuzzy = (s) =>
  s.replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function containsAsWords(hay, needle) {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(hay);
}

// ── Garde anti-nombre-nu (2026-07-15, chantier tailles enfant) ──────────────
// Sur un champ TAILLE uniquement (opts.sizeField) : la grille enfant Vinted
// est une chaîne combinée qui CONTIENT des nombres nus (« 3 ans / 98 cm » ⊃
// « 3 ») et les tailles adultes/pointures sont des nombres nus CONTENUS dans
// ces chaînes. Sans garde, la cascade peut poser une taille FAUSSE en
// silence dans les deux sens. Règle : pour un nombre nu, seul l'EXACT fait
// foi (l'exact-par-segment « M / 38 / 10 » reste un exact) — tout match par
// CONTENANCE dont le côté contenu est purement numérique est rejeté (champ
// laissé vide avec warning, jamais faux). Les autres champs sont inchangés.
const PURE_NUMBER_RE = /^\d+(?:[.,]\d+)?$/;

function findOptionCascade(root, optionSelector, text, { sizeField = false } = {}) {
  const options = Array.from(root.querySelectorAll(optionSelector))
    .map((el) => ({ el, label: el.textContent.trim(), norm: normalizeFuzzy(el.textContent) }))
    .filter((o) => o.norm);
  if (!options.length) return null;
  const target = normalizeFuzzy(text);

  // 1. exact (texte entier ou segment de grille)
  const exact = options.find(
    (o) => o.norm === target || o.label.split("/").some((p) => normalizeFuzzy(p) === target)
  );
  if (exact) return { ...exact, stage: "exact" };

  const sizeGuardOk = (contained) => !sizeField || !PURE_NUMBER_RE.test(contained);

  const optionInTarget = (t) =>
    options
      .filter((o) => containsAsWords(t, o.norm) && sizeGuardOk(o.norm))
      .sort((a, b) => b.norm.length - a.norm.length)[0];

  // 2. option contenue dans la valeur (mots entiers, option la plus longue)
  const fuzzy = optionInTarget(target);
  if (fuzzy) return { ...fuzzy, stage: "fuzzy" };

  // 2bis. valeur contenue dans une option (mots entiers, option la plus
  // courte = la plus proche de la valeur) : "unique" → "Taille unique"
  const targetInOption = (t) =>
    options
      .filter((o) => containsAsWords(o.norm, t) && sizeGuardOk(t))
      .sort((a, b) => a.norm.length - b.norm.length)[0];
  const inverse = targetInOption(target);
  if (inverse) return { ...inverse, stage: "fuzzy-inverse" };

  // 3. composant par composant ("Résine et acier inoxydable" → "résine",
  // "acier inoxydable")
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

async function waitForOptionCascade(optionSelector, text, timeoutMs = 5000, opts = {}) {
  const start = Date.now();
  let lastOptions = [];
  while (Date.now() - start < timeoutMs) {
    const found = findOptionCascade(document, optionSelector, text, opts);
    if (found) return found;
    lastOptions = Array.from(document.querySelectorAll(optionSelector))
      .map((o) => o.textContent.trim()).filter(Boolean);
    if (lastOptions.length) break; // options rendues mais aucun match : inutile d'attendre
    await sleep(80);
  }
  throw new Error(
    `Option "${text}" sans correspondance (même approximative) pour ${optionSelector}. ` +
    `Options Vinted: ${JSON.stringify(lastOptions.slice(0, 60))}`
  );
}

// Referme proprement un panneau resté ouvert après un échec de sélection —
// sans ça, le champ suivant échouerait en cascade (openDropdown attendrait
// la disparition d'un panneau qui ne se ferme jamais).
// Ferme un panneau de dropdown resté ouvert.
//
// ⚠️ Le panneau MATIÈRE (multi-sélection, pas de bouton "Fait") reste OUVERT
// après le clic sur une option — constaté en publication RÉELLE le 2026-07-11,
// il recouvrait le formulaire et le clic suivant sur "Ajouter" partait dans le
// vide. Les trois voies ont été testées sur la vraie page :
//   - document.body.click()  → NE FERME PAS. C'est le bug d'origine : un
//     .click() nu n'émet QUE l'event "click", sans pointerdown/mousedown — or
//     c'est sur ceux-là que Vinted branche sa détection de "clic extérieur".
//   - KeyboardEvent Escape synthétique (document / panneau / activeElement)
//     → NE FERME PAS (Vinted ignore les events clavier non trusted ; l'Échap
//     qui marchait en test manuel était une vraie frappe, hors de portée d'un
//     content script).
//   - séquence souris COMPLÈTE (simulateFullClick) sur un élément EXTÉRIEUR au
//     panneau → FERME. C'est la seule voie qui marche.
async function closeAnyOpenDropdown() {
  if (!document.querySelector(DROPDOWN_PANEL_SELECTOR)) return;

  const done = findButtonByExactText("Fait");
  if (done) {
    done.click();
    if (await waitForElementGone(DROPDOWN_PANEL_SELECTOR, 2000)) {
      await humanPause();
      return;
    }
  }

  // Clic extérieur RÉALISTE : un élément qui n'est ni dans le panneau ni un
  // champ (le titre du formulaire fait un point de sortie neutre), avec la
  // séquence pointer/mouse complète.
  const panel = document.querySelector(DROPDOWN_PANEL_SELECTOR);
  const outside = Array.from(document.querySelectorAll("h1, h2, header"))
    .find((el) => el.offsetParent !== null && !panel?.contains(el)) ?? document.body;
  simulateFullClick(outside);
  await waitForElementGone(DROPDOWN_PANEL_SELECTOR, 2000);
  await humanPause();
}

async function selectSimpleOption(triggerSelector, optionSelector, optionText, { searchInputSelector } = {}) {
  await openDropdown(triggerSelector);
  let optionTimeout = 5000;
  if (searchInputSelector) {
    // Le champ de recherche est rendu APRÈS l'ouverture du menu : l'attendre
    // activement. Avant : querySelector immédiat → null → toute la saisie
    // était sautée en silence, la liste restait sur "Marques populaires" et
    // l'option cherchée ne pouvait jamais apparaître, quel que soit le
    // polling en aval.
    const search = await waitForElement(searchInputSelector, 5000).catch(() => null);
    if (search) {
      // Frappe caractère par caractère : une assignation unique n'émet qu'un
      // seul event "input", pas toujours suffisant pour déclencher le debounce
      // de recherche Vinted. Depuis 2026-07-09 le rythme est humain (typeHuman,
      // 80–250 ms/caractère + keydown/keyup) au lieu des 40 ms fixes.
      await typeHuman(search, optionText);
      optionTimeout = 10000;
    }
  }
  // waitForOptionByText re-scanne le DOM toutes les 80 ms jusqu'au timeout —
  // c'est lui qui absorbe debounce + réseau + re-render, sans délai fixe.
  const option = await waitForOptionByText(optionSelector, optionText, optionTimeout);
  await humanPause(); // temps de "lecture" de la liste avant le clic
  option.click();
  await humanPause();
  await confirmDropdownIfNeeded();
}

// Variante robuste pour les champs à choix fermé (taille, état, matière) :
// matching en cascade ET jamais bloquante — un libellé IA sans équivalent
// Vinted saute le champ avec un warning au lieu de faire échouer le job
// entier (le champ restera vide, corrigeable à la main avant publication).
async function selectClosedOptionSafe(fieldName, triggerSelector, optionSelector, rawText, warnings, opts = {}) {
  try {
    await openDropdown(triggerSelector);
    const match = await waitForOptionCascade(optionSelector, rawText, 5000, opts);
    await humanPause(); // temps de "lecture" de la liste avant le clic
    match.el.click();
    await humanPause();
    await confirmDropdownIfNeeded();
    if (match.stage !== "exact") {
      const note = `${fieldName}: "${rawText}" → option Vinted "${match.label}" (match ${match.stage})`;
      console.warn(`[vinted] ≈ ${note}`);
      warnings.push(note);
    }
    return true;
  } catch (e) {
    const note = `${fieldName}: champ sauté — ${e.message}`;
    console.warn(`[vinted] ⚠️ ${note}`);
    warnings.push(note);
    await closeAnyOpenDropdown();
    return false;
  }
}

// Catégorie : menu en cascade, panneau réécrit en place à chaque niveau (pas de
// nouvelle ouverture de menu). path = ["Femmes", "Vêtements", "Robes", "Midi"] par ex.
// Attention : certains chemins ont un niveau supplémentaire (ex: "Pour occasions"
// sous Robes) — le path fourni en amont doit correspondre à un chemin complet
// jusqu'à une feuille terminale (option avec rond radio, pas chevron), sinon
// Vinted reste bloqué sur un niveau intermédiaire.
//
// Les erreurs listent les options réellement affichées par Vinted à ce niveau :
// c'est le retour dont on a besoin pendant les dry-runs pour corriger les
// libellés draft de vintedCategories.js (côté app) sans naviguer à la main.
const CATALOG_OPTION_SELECTOR = 'li.web_ui__Item__item [role="button"][id^="catalog-"]';

function visibleCatalogLabels(limit = 20) {
  return Array.from(document.querySelectorAll(CATALOG_OPTION_SELECTOR))
    .map((o) => o.textContent.trim())
    .filter(Boolean)
    .slice(0, limit);
}

// Un niveau intermédiaire porte un chevron (classe web_ui__Cell__with-chevron,
// confirmée par inspection DOM réelle du formulaire) ; une feuille
// sélectionnable porte un rond radio. Le clic sur la feuille NE ferme PAS le
// menu (confirmé par test réel) : il faut ensuite valider via "Fait"
// (confirmDropdownIfNeeded). La classe chevron peut être sur le bouton
// lui-même, un parent ou un descendant selon le rendu — on teste les trois.
// Décision AVANT chaque clic : pas de profondeur supposée, c'est le DOM réel
// qui dit si on descend ou si on sélectionne (certains chemins ont un 5e
// niveau, ex: "Pour occasions" sous "Robes").
function isChevronOption(option) {
  return Boolean(
    option.matches(".web_ui__Cell__with-chevron") ||
    option.closest(".web_ui__Cell__with-chevron") ||
    option.querySelector(".web_ui__Cell__with-chevron")
  );
}

async function selectCategory(path) {
  await openDropdown('#category, [data-testid="catalog-select-dropdown-input"]');
  for (let i = 0; i < path.length; i++) {
    const levelLabel = path[i];
    const isLast = i === path.length - 1;

    let option;
    try {
      option = await waitForOptionByText(CATALOG_OPTION_SELECTOR, levelLabel);
    } catch {
      throw new Error(
        `Catégorie: niveau "${levelLabel}" introuvable (chemin ${JSON.stringify(path)}). ` +
        `Options affichées par Vinted à ce niveau: ${JSON.stringify(visibleCatalogLabels())}. ` +
        `Corriger le chemin dans vintedCategories.js avec un de ces libellés.`
      );
    }

    const hasChevron = isChevronOption(option);

    // Le chemin continue mais Vinted dit que c'est déjà une feuille :
    // le mapping a un niveau de trop.
    if (!isLast && !hasChevron) {
      throw new Error(
        `Catégorie: "${levelLabel}" est une feuille terminale mais le chemin continue avec ` +
        `${JSON.stringify(path.slice(i + 1))}. Retirer les niveaux excédentaires dans vintedCategories.js.`
      );
    }

    // Dernier niveau du chemin mais encore un chevron : profondeur
    // supplémentaire dans le catalogue réel. On clique quand même pour révéler
    // les sous-niveaux et les remonter dans l'erreur du job.
    if (isLast && hasChevron) {
      option.click();
      await sleep(400);
      throw new Error(
        `Catégorie: le chemin ${JSON.stringify(path)} s'arrête sur un niveau intermédiaire. ` +
        `Sous-niveaux proposés par Vinted: ${JSON.stringify(visibleCatalogLabels())}. ` +
        `Ajouter le niveau terminal manquant dans vintedCategories.js.`
      );
    }

    await humanPause();
    option.click();
    await sleep(400);
  }
  // Le dernier clic (feuille) ne ferme pas le menu : valider explicitement.
  await confirmDropdownIfNeeded();
}

async function selectColors(colorNames, warnings = []) {
  // multi-sélection, 2 couleurs maximum côté Vinted — même cascade que les
  // autres choix fermés, et jamais bloquant (couleur ignorée si introuvable).
  try {
    await openDropdown('#color, [data-testid="color-select-dropdown-input"]');
  } catch (e) {
    const note = `couleur: champ sauté — ${e.message}`;
    console.warn(`[vinted] ⚠️ ${note}`);
    warnings.push(note);
    return;
  }
  for (const name of colorNames.slice(0, 2)) {
    const match = findOptionCascade(document, '[data-testid^="color-"]', name);
    if (match) {
      await humanPause();
      match.el.click();
      await humanPause();
      if (match.stage !== "exact") {
        const note = `couleur: "${name}" → option Vinted "${match.label}" (match ${match.stage})`;
        console.warn(`[vinted] ≈ ${note}`);
        warnings.push(note);
      }
    } else {
      const note = `couleur: "${name}" sans correspondance, ignorée`;
      console.warn(`[vinted] ⚠️ ${note}`);
      warnings.push(note);
    }
  }
  // Multi-sélection sans bouton "valider" : le clic body NE FERME PAS le
  // panneau (constaté en réel le 2026-07-11, même famille que Matière) — on
  // passe par le clic extérieur complet de closeAnyOpenDropdown.
  await closeAnyOpenDropdown();
}

// ⚠️ 2026-07-12 : « Petit » n'est PAS toujours pré-coché — Vinted choisit le
// format par défaut selon la CATÉGORIE, et sur les chaussures il pré-coche
// « Moyen » (constaté sur l'annonce New Balance de ce soir). L'ancien
// `if (size === "Petit") return;` faisait donc confiance à un défaut qui n'en
// est pas un : on ne cliquait rien et le colis partait en Moyen.
// Décision produit Nico (2026-07-12) : sur TOUTE la branche Mode (vêtements ET
// chaussures), c'est TOUJOURS « Petit », sans exception. On CLIQUE désormais le
// format, on ne le suppose plus.
async function selectPackageSize(size = "Petit") {
  const map = { Petit: 1, Moyen: 2, Grand: 3 };
  const n = map[size] || 1;
  const radio = await waitForElement(`[data-testid="package_type_selector_${n}--input"]`);
  if (!radio.checked) {
    simulateFullClick(radio);
    await humanPause();
  }
  // Vérification : le format retenu doit être celui demandé (sinon on publierait
  // avec des frais de port faux, invisible jusqu'à la première vente).
  const after = document.querySelector(`[data-testid="package_type_selector_${n}--input"]`);
  if (after && !after.checked) {
    console.warn(`[vinted] ⚠️ format de colis : "${size}" n'a pas pris (radio non coché après clic)`);
  }
}

// job.photos: [{ url, type }] — pas des File prêts, on fetch chaque url puis
// on construit les File nous-mêmes avant de les déposer sur l'input.
async function urlToFile(url, index) {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  return new File([blob], `photo_${index}.${ext}`, { type: blob.type });
}

// Minimum 3 photos (constaté en publication réelle le 2026-07-11) : avec 2
// photos sur un article de marque premium (Patagonia), le clic Publier ouvre
// une modale bloquante « Ajoute des photos à cette annonce — Les annonces
// comportant des articles de luxe et des articles haut de gamme doivent
// inclure au moins 3 photos pour prouver leur authenticité ». Vinted ne dit
// PAS à l'avance quelles marques sont concernées : on complète donc TOUJOURS
// à 3 en dupliquant la dernière photo fournie (mieux qu'une annonce bloquée ;
// l'utilisateur peut retirer le doublon à la main). Aucun effet si l'app en
// fournit déjà 3 ou plus.
const VINTED_MIN_PHOTOS = 3;

async function uploadPhotos(photos) {
  const source = photos.slice();
  const duplicated = source.length > 0 && source.length < VINTED_MIN_PHOTOS;
  while (source.length > 0 && source.length < VINTED_MIN_PHOTOS) {
    source.push(source[source.length - 1]);
  }
  if (duplicated) {
    console.warn(
      `[vinted] ⚠️ ${photos.length} photo(s) fournie(s) — complété à ${VINTED_MIN_PHOTOS} par duplication ` +
      "(minimum imposé par Vinted sur les marques premium, sinon modale bloquante au clic Publier)."
    );
  }

  const files = await Promise.all(source.map((p, i) => urlToFile(p.url, i)));
  const input = await waitForElement('input[data-testid="add-photos-input"]');
  const dataTransfer = new DataTransfer();
  files.forEach((f) => dataTransfer.items.add(f));
  input.files = dataTransfer.files;
  await humanPause(); // temps de "sélection des fichiers" avant le dépôt
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(1500 * files.length); // laisser le temps à l'upload asynchrone Vinted
  return { count: files.length, duplicated };
}

// Marqueur de version dans le log : permet de vérifier depuis la console
// qu'une version fraîche du script est bien injectée après un reload de
// l'extension (le libellé change à chaque évolution notable du remplissage).
console.log(`[vinted] prêt — build ${VINTED_BUILD} | DRY_RUN=${DRY_RUN} | DELETE_DRY_RUN=${DELETE_DRY_RUN}`);
