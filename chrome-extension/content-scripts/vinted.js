// Content script Vinted — remplit le formulaire de dépôt d'annonce.
//
// ⚠️ DRY_RUN doit rester à true tant qu'au moins 3 publications réelles n'ont
// pas été validées manuellement. En dry-run, le formulaire est rempli mais le
// bouton publier n'est JAMAIS cliqué — le résultat est loggé en console.
const DRY_RUN = true;

// ── Sélecteurs DOM (TODO : à remplir en inspectant la vraie page de dépôt) ────
const SELECTORS = {
  photoInput: null,      // TODO: input[type=file] d'upload des photos
  title: null,           // TODO: champ titre
  description: null,     // TODO: champ description
  price: null,           // TODO: champ prix
  brand: null,           // TODO: champ marque (platform_fields.marque)
  size: null,            // TODO: sélecteur taille (platform_fields.taille)
  condition: null,       // TODO: sélecteur état (platform_fields.etat)
  material: null,        // TODO: sélecteur matière (platform_fields.matiere)
  submitButton: null,    // TODO: bouton "Ajouter" / publier
};

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
 * @param {object} job — un job cross_post_jobs :
 *   { id, platform, title, description, price, photos, photo_option, platform_fields, inventaire_id }
 *   photos: [{ type, url }] ; platform_fields (vinted): { taille, matiere, etat, marque }
 * @returns {Promise<{success: boolean, dryRun?: boolean, listingUrl?: string, error?: string}>}
 */
async function fillListingForm(job) {
  console.log("[vinted] fillListingForm — job:", job.id, job.title);

  // TODO: uploader les photos (job.photos) via SELECTORS.photoInput
  //   → fetch(photo.url) → blob → new File([...]) → DataTransfer → input.files + event "change"

  // TODO: remplir le titre (job.title) via SELECTORS.title
  //   → utiliser setNativeValue() ci-dessous (Vinted est une app React,
  //     assigner .value directement ne déclenche pas leur state)

  // TODO: remplir la description (job.description) via SELECTORS.description

  // TODO: remplir le prix (job.price) via SELECTORS.price

  // TODO: sélectionner marque / taille / état / matière depuis job.platform_fields
  //   (dropdowns Vinted : ouvrir, chercher, cliquer l'option — champ null → laisser vide)

  if (DRY_RUN) {
    console.log(
      "[vinted] 🧪 DRY_RUN actif — formulaire rempli, publication NON déclenchée.",
      "\nJob:", job.id,
      "\nTitre:", job.title,
      "\nPrix:", job.price,
      "\nChamps plateforme:", job.platform_fields
    );
    return { success: true, dryRun: true };
  }

  // TODO: cliquer SELECTORS.submitButton

  // TODO: attendre la redirection vers l'annonce créée et récupérer son URL
  //   (elle part dans listing_url via update-job-status, puis check-listing-status
  //    s'en sert pour détecter la vente)
  const listingUrl = null;

  return { success: true, listingUrl };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Assigne une valeur à un input/textarea contrôlé par React en déclenchant
// le setter natif + un event "input", sinon le state React ne voit rien.
function setNativeValue(element, value) {
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
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

console.log("[vinted] Content script FillSell chargé (DRY_RUN =", DRY_RUN, ")");
