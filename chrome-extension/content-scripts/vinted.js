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

  if (job.photos?.length) await uploadPhotos(job.photos);
  if (job.title) await fillTextField('#title, [data-testid="title--input"]', job.title);
  if (job.description) await fillTextField('#description, [data-testid="description--input"]', job.description);

  // Pas de source de donnée aujourd'hui (voir doc ci-dessus) — no-op tant que
  // platform_fields.categoryPath n'existe pas.
  if (fields.categoryPath?.length) await selectCategory(fields.categoryPath);

  if (fields.marque) {
    await selectSimpleOption(
      '#brand, [data-testid="brand-select-dropdown-input"]',
      '[role="button"][id^="brand-"]',
      fields.marque,
      { searchInputSelector: "#brand-search-input" }
    );
  }
  if (fields.taille) {
    await selectSimpleOption(
      '#size, [data-testid="category-size-single-grid-input"]',
      '[data-testid^="size-group-"]',
      fields.taille
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

function findOptionByText(root, optionSelector, text) {
  const options = Array.from(root.querySelectorAll(optionSelector));
  const normalize = (s) => s.trim().toLowerCase();
  return options.find((o) => normalize(o.textContent).includes(normalize(text)));
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
  if (searchInputSelector) {
    const search = document.querySelector(searchInputSelector);
    if (search) {
      setNativeValue(search, optionText);
      await sleep(400);
    }
  }
  const option = await waitForOptionByText(optionSelector, optionText);
  option.click();
  await sleep(CLICK_DELAY);
}

// Catégorie : menu en cascade, panneau réécrit en place à chaque niveau (pas de
// nouvelle ouverture de menu). path = ["Femmes", "Vêtements", "Robes", "Midi"] par ex.
// Attention : certains chemins ont un niveau supplémentaire (ex: "Pour occasions"
// sous Robes) — le path fourni en amont doit correspondre à un chemin complet
// jusqu'à une feuille terminale (option avec rond radio, pas chevron), sinon
// Vinted reste bloqué sur un niveau intermédiaire.
async function selectCategory(path) {
  await openDropdown('#category, [data-testid="catalog-select-dropdown-input"]');
  for (const levelLabel of path) {
    const option = await waitForOptionByText('li.web_ui__Item__item [role="button"][id^="catalog-"]', levelLabel);
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
