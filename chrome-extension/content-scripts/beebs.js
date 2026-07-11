// Content script Beebs — remplit le formulaire de dépôt d'annonce.
//
// ⚠️ DRY_RUN doit rester à true tant qu'au moins 3 publications réelles n'ont
// pas été validées manuellement. En dry-run, le formulaire est rempli mais le
// bouton "Mettre en vente" n'est JAMAIS cliqué — le résultat est loggé en
// console.
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
const DRY_RUN = true;

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
// MÉCANIQUE DE SUPPRESSION relevée en session réelle du 2026-07-11 : elle est
// GROUPÉE, pas par carte — une barre d'actions "Tout sélectionner | Supprimer"
// en tête de liste, alimentée par une CHECKBOX par annonce. Il n'y a pas de
// menu "…" ni de bouton Supprimer dans la carte elle-même.
// ⚠️ NON EXÉCUTÉ — et pas seulement par manque de temps : DEUX dépôts réels
// (2026-07-11, 21h et 23h23) ont été confirmés par Beebs ("Votre article a
// bien été ajouté à votre dressing"), sont apparus dans "En cours de
// vérification"… puis ont DISPARU des DEUX onglets ("Actuellement en ligne" et
// "En cours de vérification"), sans message ni notification. Le second a été
// re-vérifié 30 min après le dépôt : introuvable. Cause inconnue (rejet
// silencieux de modération ? dépôt web non finalisé sans l'app mobile ?) — à
// élucider AVANT de compter sur Beebs en production, car un job partirait en
// "published" pour une annonce qui n'existe pas.
// Conséquence directe : la checkbox de carte et le dialogue de confirmation de
// suppression n'ont JAMAIS pu être observés (aucune annonce en ligne à
// supprimer). Les sélecteurs ci-dessous restent À CONFIRMER.
// ⚠️ DELETE_DRY_RUN reste à true tant que 3 suppressions réelles n'ont pas
// été validées manuellement.
const DELETE_DRY_RUN = true;

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

  const card = anchor.closest("article, li") ?? anchor.closest("div");
  t(`carte englobante : <${card?.tagName?.toLowerCase() ?? "?"}>`);

  // Suppression GROUPÉE (relevé 2026-07-11) : cocher la checkbox de CETTE
  // annonce, puis cliquer le "Supprimer" de la barre d'actions en tête de
  // liste. La checkbox est le seul input[type=checkbox] de la carte ; le
  // bouton Supprimer vit HORS de la carte (barre partagée).
  const checkbox = card?.querySelector('input[type="checkbox"]') ?? null;
  const bulkDelete = findBeebsDelete(document);

  if (!checkbox || !bulkDelete) {
    const visible = Array.from(card?.querySelectorAll("button, a, input") ?? [])
      .map((b) => b.textContent.trim() || b.type).filter(Boolean).slice(0, 20);
    t(`mécanique groupée INCOMPLÈTE — checkbox: ${!!checkbox}, bouton Supprimer: ${!!bulkDelete} — éléments de carte : ${visible.join(" | ") || "(aucun)"}`);
    if (DELETE_DRY_RUN) return { success: true, dryRun: true, found: false, trace };
    return { success: false, error: "Checkbox d'annonce ou bouton Supprimer groupé introuvable", trace };
  }
  t(`checkbox de l'annonce + bouton "${bulkDelete.textContent.trim()}" (barre groupée) localisés`);

  if (DELETE_DRY_RUN) {
    t("🧪 DELETE_DRY_RUN actif — contrôles localisés, AUCUN clic (ni coche) effectué.");
    return { success: true, dryRun: true, found: true, trace };
  }

  // ── LIVE (après validation manuelle) ───────────────────────────────────
  checkbox.click(); // sélectionne UNIQUEMENT cette annonce (jamais "Tout sélectionner")
  await humanPause(700, 1400);
  bulkDelete.click();
  await humanPause(800, 1600);
  // Dialogue de confirmation : présence non confirmée (annonce jamais sortie
  // de modération le 2026-07-11) — s'il n'y en a pas, la suppression est déjà
  // effective et le waitFor retombe à null sans échouer le job.
  const confirmBtn = await waitFor(() => {
    const dialog = document.querySelector('[role="dialog"], [class*="modal" i]');
    if (!dialog) return null;
    return Array.from(dialog.querySelectorAll("button"))
      .find((b) => /supprimer|confirmer|oui/i.test(b.textContent)) ?? null;
  }, 6000);
  if (confirmBtn) {
    t(`confirmation : "${confirmBtn.textContent.trim()}"`);
    confirmBtn.click();
  } else {
    t("aucun dialogue de confirmation — suppression supposée immédiate");
  }
  await sleep(3000);
  return { success: true, trace };
}

// Bouton "Supprimer" de la barre d'actions groupée (hors carte) — cherché au
// niveau document, jamais dans la carte (relevé 2026-07-11).
function findBeebsDelete(root) {
  if (!root) return null;
  return Array.from(root.querySelectorAll("button, a, [role='menuitem']"))
    .find((el) => /^supprimer$/i.test(el.textContent.trim())) ?? null;
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
    await selectDropdownValue("Pointure", String(fields.taille).replace(/^EU\s*/i, ""), warnings, unfilledRequired);
    await selectDropdownValue("Taille", fields.taille, warnings, unfilledRequired);
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
    return { success: true, dryRun: true, warnings, unfilledRequired };
  }

  const publishBtn = document.querySelector('button[type="submit"]');
  publishBtn?.click();

  // TODO: attendre la redirection vers l'annonce créée et récupérer son URL
  //   (comme Vinted — non nécessaire tant que DRY_RUN reste true)
  const listingUrl = null;

  return { success: true, listingUrl, warnings, unfilledRequired };
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
function findOptionCascade(els, text) {
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

// Ouvre le panneau du champ et retourne UNIQUEMENT ses options.
//
// Le panneau n'est pas un descendant du bouton (portail) : impossible de le
// scoper par le DOM. On procède donc par DIFFÉRENTIEL — les options présentes
// avant le clic ne sont pas les nôtres, les nouvelles le sont.
async function openPanelOptions(trigger, rawText, timeoutMs = 4000) {
  const before = new Set(allValueOptions());
  await humanPause();
  trigger.click(); // ⚠️ BASCULE : re-cliquer ferme le panneau (cf. closePanel)
  await humanPause();

  // La barre de recherche n'existe que sur les listes longues (Marque). Les
  // listes courtes (Âge : 10 options, Matière : 6) n'en ont pas — relevé.
  const search = document.querySelector('input[class*="__searchBarInput"]');
  if (search) await typeHuman(search, String(rawText));

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const fresh = allValueOptions().filter((el) => !before.has(el));
    if (fresh.length) return fresh;
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

/**
 * @param {string[]} unfilledRequired — accumulateur : reçoit le libellé du
 *   champ si celui-ci est OBLIGATOIRE (pas de "(facultatif)") et qu'on n'a pas
 *   réussi à lui donner une valeur. Un job ne doit jamais se déclarer réussi
 *   en laissant un champ obligatoire vide (cf. background.js).
 */
async function selectDropdownValue(labelText, rawText, warnings, unfilledRequired = []) {
  const field = findField(labelText);
  if (!field) return; // champ non affiché pour cette catégorie : rien à signaler
  const { trigger, required } = field;

  const options = await openPanelOptions(trigger, rawText);
  if (!options.length) {
    const note = `${labelText}: panneau d'options resté vide, champ laissé vide`;
    console.warn(`[beebs] ⚠️ ${note}`);
    warnings.push(note);
    if (required) unfilledRequired.push(labelText);
    await closePanel(trigger);
    return;
  }

  let match = findOptionCascade(options, rawText);

  // Repli "Autre" : la liste des matières est PAR CATÉGORIE et ne contient pas
  // toutes les matières du monde (Figurines : Plastique | Bois | Caoutchouc |
  // Tissu | Carton | Autre — "Résine" n'y est pas, cas réel du 2026-07-09).
  // Quand Beebs offre lui-même un bac générique, l'utiliser vaut mieux que
  // laisser vide un champ obligatoire. On ne l'invente pas : on ne le prend
  // que s'il figure dans les options relevées à l'écran.
  let usedFallback = false;
  if (!match) {
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

function visibleCategoryLabels(limit = 20) {
  return Array.from(document.querySelectorAll(CATEGORY_OPTION_SELECTOR))
    .map((o) => o.textContent.trim())
    .filter(Boolean)
    .slice(0, limit);
}

async function waitForCategoryOption(text, timeoutMs = 5000) {
  const start = Date.now();
  const target = text.trim().toLowerCase();
  while (Date.now() - start < timeoutMs) {
    const options = Array.from(document.querySelectorAll(CATEGORY_OPTION_SELECTOR));
    const found = options.find((o) => o.textContent.trim().toLowerCase() === target);
    if (found) return found;
    await sleep(80);
  }
  throw new Error(
    `Catégorie: niveau "${text}" introuvable. Options affichées par Beebs à ce niveau: ` +
    `${JSON.stringify(visibleCategoryLabels())}. Corriger le chemin dans beebsCategories.js.`
  );
}

async function selectCategory(path) {
  const trigger = findField("Catégorie")?.trigger;
  if (!trigger) throw new Error("Catégorie: bouton de sélection introuvable sur la page.");
  await humanPause();
  trigger.click();
  await humanPause();

  for (let i = 0; i < path.length; i++) {
    const levelLabel = path[i];
    const isLast = i === path.length - 1;
    const option = await waitForCategoryOption(levelLabel);
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
console.log("[beebs] Content script FillSell chargé (DRY_RUN =", DRY_RUN, ", v3 : + matière/couleur branchées, champ Âge (À TESTER), warnings avec options réelles)");
