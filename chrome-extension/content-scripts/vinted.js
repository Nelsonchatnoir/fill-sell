// Content script Vinted — remplit le formulaire de dépôt d'annonce.
//
// ⚠️ DRY_RUN doit rester à true tant qu'au moins 3 publications réelles n'ont
// pas été validées manuellement. En dry-run, le formulaire est rempli mais le
// bouton publier n'est JAMAIS cliqué — le résultat est loggé en console.
const DRY_RUN = true;

const CLICK_DELAY = 250;

// ── Communication avec le background ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "FILL_LISTING") return;

  fillListingForm(msg.job)
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err) }));

  return true; // réponse asynchrone
});

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
 *       inventer côté mapping. Même chose pour `colors` et `packageSize` :
 *       aucune donnée réelle ne les fournit aujourd'hui, câblés en best-effort.
 * @returns {Promise<{success: boolean, dryRun?: boolean, listingUrl?: string, error?: string}>}
 */
async function fillListingForm(job) {
  console.log("[vinted] fillListingForm — job:", job.id, job.title, DRY_RUN ? "(DRY_RUN)" : "(LIVE)");

  const fields = job.platform_fields || {};

  // Fallback explicite : sans chemin de catégorie, l'annonce ne peut pas être
  // publiée sur Vinted — on échoue AVANT de remplir quoi que ce soit, avec un
  // message actionnable. Les jobs générés avant le mapping (ou dont l'icône /
  // genre est hors périmètre du Lot 1) tombent volontairement ici.
  if (!fields.categoryPath?.length) {
    return {
      success: false,
      error:
        "platform_fields.categoryPath absent — article non mappé vers le catalogue Vinted " +
        "(icône hors périmètre Lot 1, ou genre Enfant/Mixte/non renseigné). " +
        "Régénérer l'annonce depuis l'app, ou compléter src/utils/vintedCategories.js.",
    };
  }

  if (job.photos?.length) await uploadPhotos(job.photos);
  if (job.title) await fillTextField('#title, [data-testid="title--input"]', job.title);
  if (job.description) await fillTextField('#description, [data-testid="description--input"]', job.description);

  await selectCategory(fields.categoryPath);

  if (fields.marque) {
    await selectSimpleOption(
      '#brand, [data-testid="brand-select-dropdown-input"]',
      '[role="button"][id^="brand-"]',
      fields.marque,
      { searchInputSelector: "#brand-search-input" }
    );
  }
  if (fields.taille) {
    // La grille Vinted affiche "42", pas "EU 42" (préfixe côté FillSell) —
    // on retire le préfixe, le match exact-par-segment fait le reste.
    await selectSimpleOption(
      '#size, [data-testid="category-size-single-grid-input"]',
      '[data-testid^="size-group-"]',
      String(fields.taille).replace(/^EU\s*/i, "")
    );
  }
  if (fields.etat) {
    await selectSimpleOption(
      '#condition, [data-testid="category-condition-single-list-input"]',
      '[data-testid^="condition-"]',
      fields.etat
    );
  }
  // Pas de source de donnée aujourd'hui — no-op tant que platform_fields.colors
  // (ou équivalent) n'existe pas.
  if (fields.colors?.length) await selectColors(fields.colors);

  if (fields.matiere) {
    await selectSimpleOption(
      '#material, [data-testid="category-material-multi-list-input"]',
      '[data-testid^="material-"]',
      fields.matiere
    );
  }
  if (job.price != null) await fillPriceField(job.price);

  // Pas de source de donnée aujourd'hui — Vinted garde son défaut ("Petit")
  // tant que platform_fields.packageSize n'existe pas.
  if (fields.packageSize) await selectPackageSize(fields.packageSize);

  if (DRY_RUN) {
    console.log(
      "[vinted] 🧪 DRY_RUN actif — formulaire rempli, publication NON déclenchée.",
      "\nJob:", job.id,
      "\nTitre:", job.title,
      "\nPrix:", job.price,
      "\nChamps plateforme:", fields
    );
    return { success: true, dryRun: true };
  }

  const publishBtn = await waitForElement('[data-testid="upload-form-save-button"]');
  publishBtn.click();

  // TODO: attendre la redirection vers l'annonce créée et récupérer son URL
  //   (elle part dans listing_url via update-job-status, puis check-listing-status
  //    s'en sert pour détecter la vente)
  const listingUrl = null;

  return { success: true, listingUrl };
}

// ── Helpers génériques ─────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function fillTextField(selector, value) {
  const el = await waitForElement(selector);
  el.focus();
  setNativeValue(el, value);
  el.blur();
  await sleep(CLICK_DELAY);
}

async function fillPriceField(value) {
  // Prix = champ texte formaté (virgule + €), pas type="number" natif.
  const el = await waitForElement('#price, [data-testid="price-input--input"]');
  el.focus();
  setNativeValue(el, "");
  const str = String(value).replace(".", ",");
  for (const char of str) {
    setNativeValue(el, el.value + char);
    await sleep(30);
  }
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  await sleep(CLICK_DELAY);
}

async function openDropdown(triggerSelector) {
  const trigger = await waitForElement(triggerSelector);
  trigger.click();
  await sleep(CLICK_DELAY);
  return trigger;
}

// Match exact d'abord (texte entier, ou segment pour les grilles de taille
// type "M / 38 / 10"), includes() en repli seulement. Sans ça, "Bon état"
// sélectionne "Très bon état" (premier dans la liste) et la taille "S"
// matche "XS / 34 / 6" — textes d'options confirmés par inspection DOM.
function findOptionByText(root, optionSelector, text) {
  const options = Array.from(root.querySelectorAll(optionSelector));
  const normalize = (s) => s.trim().toLowerCase();
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

async function selectSimpleOption(triggerSelector, optionSelector, optionText, { searchInputSelector } = {}) {
  await openDropdown(triggerSelector);
  let optionTimeout = 5000;
  if (searchInputSelector) {
    const search = document.querySelector(searchInputSelector);
    if (search) {
      setNativeValue(search, optionText);
      // La recherche (ex: marque) est debouncée côté Vinted puis passe par le
      // réseau avant re-render de la liste : 400 ms ne suffisaient pas
      // (l'option "Patagonia" existait mais n'était pas encore dans le DOM).
      // On laisse la liste se rafraîchir puis on polle plus longtemps.
      await sleep(1200);
      optionTimeout = 10000;
    }
  }
  const option = await waitForOptionByText(optionSelector, optionText, optionTimeout);
  option.click();
  await sleep(CLICK_DELAY);
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
// sélectionnable porte un rond radio et son clic ferme le menu. La classe peut
// être sur le bouton lui-même, un parent ou un descendant selon le rendu — on
// teste les trois. Décision AVANT chaque clic : pas de profondeur supposée,
// c'est le DOM réel qui dit si on descend ou si on sélectionne (certains
// chemins ont un 5e niveau, ex: "Pour occasions" sous "Robes").
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

    option.click();
    await sleep(400);
  }
}

async function selectColors(colorNames) {
  // multi-sélection, 2 couleurs maximum côté Vinted
  await openDropdown('#color, [data-testid="color-select-dropdown-input"]');
  for (const name of colorNames.slice(0, 2)) {
    const option = findOptionByText(document, '[data-testid^="color-"]', name);
    if (option) {
      option.click();
      await sleep(CLICK_DELAY);
    }
  }
  document.body.click(); // fermer le menu, pas de bouton "valider" identifié
  await sleep(CLICK_DELAY);
}

async function selectPackageSize(size = "Petit") {
  if (size === "Petit") return; // pré-coché par défaut, rien à faire
  const map = { Petit: 1, Moyen: 2, Grand: 3 };
  const n = map[size] || 1;
  const radio = await waitForElement(`[data-testid="package_type_selector_${n}--input"]`);
  radio.click();
  await sleep(CLICK_DELAY);
}

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
  const input = await waitForElement('input[data-testid="add-photos-input"]');
  const dataTransfer = new DataTransfer();
  files.forEach((f) => dataTransfer.items.add(f));
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(1500 * files.length); // laisser le temps à l'upload asynchrone Vinted
}

console.log("[vinted] Content script FillSell chargé (DRY_RUN =", DRY_RUN, ")");
