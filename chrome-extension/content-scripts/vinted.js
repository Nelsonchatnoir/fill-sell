// Content script Vinted — remplit le formulaire de dépôt d'annonce.
//
// ⚠️ DRY_RUN doit rester à true tant qu'au moins 3 publications réelles n'ont
// pas été validées manuellement. En dry-run, le formulaire est rempli mais le
// bouton publier n'est JAMAIS cliqué — le résultat est loggé en console.
const DRY_RUN = true;

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
    if (msg?.type !== "FILL_LISTING") return;

    fillListingForm(msg.job)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err) }));

    return true; // réponse asynchrone
  });
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

  if (job.photos?.length) await uploadPhotos(job.photos);
  if (job.title) await fillTextField('#title, [data-testid="title--input"]', job.title);
  if (job.description) await fillTextField('#description, [data-testid="description--input"]', job.description);

  await selectCategory(fields.categoryPath);

  // Dégradation propre : seule la CATÉGORIE (ci-dessus) reste bloquante —
  // sans elle rien n'est publiable. Tous les champs à choix fermé qui
  // suivent sautent avec un warning en cas de libellé introuvable, plutôt
  // que de faire échouer le job entier sur un détail.
  const warnings = [];

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
  if (fields.taille) {
    // La grille Vinted affiche "42", pas "EU 42" (préfixe côté FillSell) —
    // on retire le préfixe, le match exact-par-segment fait le reste.
    await selectClosedOptionSafe(
      "taille",
      '#size, [data-testid="category-size-single-grid-input"]',
      '[data-testid^="size-group-"]',
      String(fields.taille).replace(/^EU\s*/i, ""),
      warnings
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

  // packageSize : TOUJOURS absent, et c'est un choix, pas un oubli.
  // Re-vérifié le 2026-07-09 : aucune source de donnée fiable n'existe dans le
  // projet — ni poids ni dimensions nulle part (lens-analysis extrait titre,
  // marque, matiere, taille_estimee, etat_estime, prix… mais jamais de poids ;
  // la table inventaire n'en a pas de colonne ; aucun prompt ne l'infère).
  // Le seul candidat serait platform_fields.format_colis, mais c'est une
  // inférence IA faite pour le vocabulaire de LEBONCOIN (Lettre | Petit colis |
  // … | Non défini), pas pour celui de Vinted (Petit | Moyen | Grand) : le
  // transposer serait une heuristique inter-plateformes de plus, posée sur une
  // devinette. On préfère le défaut de Vinted ("Petit", pré-coché), qui est au
  // moins le cas majoritaire d'un vêtement. À rebrancher le jour où un poids
  // réel est saisi ou estimé.
  if (fields.packageSize) await selectPackageSize(fields.packageSize);

  if (DRY_RUN) {
    console.log(
      "[vinted] 🧪 DRY_RUN actif — formulaire rempli, publication NON déclenchée.",
      "\nJob:", job.id,
      "\nTitre:", job.title,
      "\nPrix:", job.price,
      "\nChamps plateforme:", fields,
      warnings.length ? `\nWarnings (${warnings.length}): ${warnings.join(" | ")}` : "\nAucun warning."
    );
    return { success: true, dryRun: true, warnings };
  }

  const publishBtn = await waitForElement('[data-testid="upload-form-save-button"]');
  publishBtn.click();

  // TODO: attendre la redirection vers l'annonce créée et récupérer son URL
  //   (elle part dans listing_url via update-job-status, puis check-listing-status
  //    s'en sert pour détecter la vente)
  const listingUrl = null;

  return { success: true, listingUrl, warnings };
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
  // Prix = champ texte avec formatage monétaire live (virgule + €), pas
  // type="number" natif. Bug "NaN €" : la version précédente relisait
  // `el.value` à chaque caractère pour concaténer — mais Vinted reformate le
  // champ à la volée sur "input" (masque monétaire), donc `el.value` reflète
  // sa version déjà reformatée, pas notre saisie brute ; concaténer dessus
  // produit une chaîne invalide que le parseur de Vinted ne peut plus lire.
  // Fix : on construit la cible nous-mêmes (jamais de lecture de `el.value`),
  // et on l'assigne en un seul coup — alternative validée par le rapport DOM
  // ("définir la valeur puis déclencher input/change/blur").
  //
  // ⚠️ EXCEPTION VOLONTAIRE au timing humain (2026-07-09) : typeHuman
  // concatène sur el.value, ce qui ré-introduirait exactement le bug "NaN €"
  // décrit ci-dessus sur ce champ masqué. Un prix fait 2 à 4 caractères — la
  // pose en un coup n'est pas le signal de vitesse qui a déclenché le blocage
  // (c'étaient le titre et la description). On encadre de pauses humaines.
  const el = await waitForElement('#price, [data-testid="price-input--input"]');
  await humanPause();
  el.focus();
  const str = String(value).replace(".", ",");
  setNativeValue(el, str);
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  await humanPause();
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

async function confirmDropdownIfNeeded() {
  const doneBtn = findButtonByExactText("Fait");
  if (doneBtn) {
    doneBtn.click();
    // Attente active de la fermeture réelle du panneau plutôt qu'un délai
    // fixe : hypothèse confirmée par test réel — le clic sur #brand juste
    // après "Fait" (250 ms fixes) tombait sur la modale Catégorie encore en
    // train de se démonter, #brand-search-input n'apparaissait jamais.
    await waitForElementGone(DROPDOWN_PANEL_SELECTOR, 3000);
    await humanPause();
  }
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
const normalizeFuzzy = (s) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function containsAsWords(hay, needle) {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(hay);
}

function findOptionCascade(root, optionSelector, text) {
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

  const optionInTarget = (t) =>
    options
      .filter((o) => containsAsWords(t, o.norm))
      .sort((a, b) => b.norm.length - a.norm.length)[0];

  // 2. option contenue dans la valeur (mots entiers, option la plus longue)
  const fuzzy = optionInTarget(target);
  if (fuzzy) return { ...fuzzy, stage: "fuzzy" };

  // 2bis. valeur contenue dans une option (mots entiers, option la plus
  // courte = la plus proche de la valeur) : "unique" → "Taille unique"
  const targetInOption = (t) =>
    options
      .filter((o) => containsAsWords(o.norm, t))
      .sort((a, b) => a.norm.length - b.norm.length)[0];
  const inverse = targetInOption(target);
  if (inverse) return { ...inverse, stage: "fuzzy-inverse" };

  // 3. composant par composant ("Résine et acier inoxydable" → "résine",
  // "acier inoxydable")
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

async function waitForOptionCascade(optionSelector, text, timeoutMs = 5000) {
  const start = Date.now();
  let lastOptions = [];
  while (Date.now() - start < timeoutMs) {
    const found = findOptionCascade(document, optionSelector, text);
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
async function closeAnyOpenDropdown() {
  if (!document.querySelector(DROPDOWN_PANEL_SELECTOR)) return;
  const done = findButtonByExactText("Fait");
  if (done) done.click();
  else document.body.click();
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
async function selectClosedOptionSafe(fieldName, triggerSelector, optionSelector, rawText, warnings) {
  try {
    await openDropdown(triggerSelector);
    const match = await waitForOptionCascade(optionSelector, rawText);
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
  document.body.click(); // fermer le menu, pas de bouton "valider" identifié
  await humanPause();
}

async function selectPackageSize(size = "Petit") {
  if (size === "Petit") return; // pré-coché par défaut, rien à faire
  const map = { Petit: 1, Moyen: 2, Grand: 3 };
  const n = map[size] || 1;
  const radio = await waitForElement(`[data-testid="package_type_selector_${n}--input"]`);
  radio.click();
  await humanPause();
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
  await humanPause(); // temps de "sélection des fichiers" avant le dépôt
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(1500 * files.length); // laisser le temps à l'upload asynchrone Vinted
}

// Marqueur de version dans le log : permet de vérifier depuis la console
// qu'une version fraîche du script est bien injectée après un reload de
// l'extension (le libellé change à chaque évolution notable du remplissage).
console.log("[vinted] Content script FillSell chargé (DRY_RUN =", DRY_RUN, ", matching: cascade-v1 + login-check + timing humain)");
