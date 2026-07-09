// Content script eBay — remplit le formulaire "Terminer votre annonce".
//
// ⚠️ DRY_RUN doit rester à true tant que le clic "Mettre en vente avec les
// frais affichés" (engagement de frais + publication réelle) n'a pas été
// validé manuellement. En dry-run, le formulaire est rempli de bout en bout
// mais ce bouton n'est JAMAIS cliqué — eBay conserve de toute façon un
// BROUILLON auto-sauvegardé (draftId dans l'URL), inspectable puis
// supprimable dans "Vendre > Brouillons".
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
const DRY_RUN = true;

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

  if (job.photos?.length) await uploadPhotos(job.photos);

  // Titre : déjà passé par l'URL, mais tronqué/réencodé possible — on
  // impose la valeur exacte du job si elle diffère (80 caractères max eBay).
  const titleInput = document.querySelector('input[name="title"]');
  const wantedTitle = String(job.title ?? "").slice(0, 80);
  if (titleInput && wantedTitle && titleInput.value !== wantedTitle) {
    await typeInto(titleInput, wantedTitle);
  }

  // ── Item specifics (tous non bloquants, warning si introuvable) ──────────
  // Département : jamais touché (pré-rempli par la catégorie genrée).
  // Libellés multiples par champ : le nom varie selon la catégorie
  // ("Taille" en vêtements, "Pointure EU" en chaussures...) — on prend le
  // premier présent sur la page.
  if (fields.marque) {
    await fillSpecificSafe(["Marque"], fields.marque, warnings);
  }
  const taille = fields.taille ? String(fields.taille).replace(/^EU\s*/i, "") : null;
  if (taille) {
    await fillSpecificSafe(["Taille", "Pointure EU", "Pointure"], taille, warnings);
  }
  const couleur = fields.colors?.[0] || fields.couleur;
  if (couleur) {
    await fillSpecificSafe(["Couleur"], couleur, warnings);
  }
  if (fields.matiere) {
    await fillSpecificSafe(["Matière", "Matériau", "Matériaux"], fields.matiere, warnings);
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
  if (job.description) await fillDescription(job.description, warnings);

  if (DRY_RUN) {
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
    return { success: true, dryRun: true, warnings };
  }

  // Publication LIVE : le clic "Mettre en vente avec les frais affichés"
  // est un engagement de frais — refus explicite tant que le flux n'a pas
  // été validé manuellement (même politique que Leboncoin).
  return {
    success: false,
    error:
      "Publication LIVE eBay pas encore implémentée : valider manuellement le flux de " +
      "publication (frais, options) avant d'automatiser le bouton final. Laisser DRY_RUN=true.",
  };
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
    const current = anatomy.expandBtn.textContent.trim().replace(/^Tendances$/i, "");
    // eBay pré-remplit beaucoup depuis le titre et la catégorie (Département,
    // Type, Style...) : on ne ré-écrit jamais une valeur existante.
    if (current) {
      console.log(`[ebay] ${found.label}: déjà rempli ("${current}"), conservé`);
      return true;
    }

    // Fast-path 1 : chip "Fréquemment sélectionnées" qui matche exactement —
    // un clic, pas de menu, pas de frappe (précieux aussi parce que l'onglet
    // de travail est en arrière-plan : les timers y sont bridés à 1 s).
    const chip = [...anatomy.row.querySelectorAll("button.fake-link")]
      .find((b) => normalizeFuzzy(b.textContent) === normalizeFuzzy(String(rawValue)));
    if (chip) {
      realClick(chip);
      await humanPause();
      console.log(`[ebay] ${found.label}: chip "Fréquemment sélectionnées" cliquée ("${chip.textContent.trim()}")`);
      return true;
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
      return true;
    }

    found.btn.scrollIntoView({ block: "center" });
    realClick(anatomy.expandBtn);

    // Menu ouvert : recherche + options. La recherche filtre ET permet
    // d'ajouter une valeur libre ("Recherchez/ajoutez des détails").
    const menu = await waitFor(() => {
      const m = document.querySelector(SPECIFICS_MENU_SELECTOR);
      return m && m.offsetParent !== null ? m : null;
    }, 5000);
    if (!menu) throw new Error(`menu du specific "${found.label}" pas ouvert`);

    const search = menu.querySelector("input.textbox__control, input[type='text']");
    if (search) {
      // Frappe humaine (80–250 ms/caractère + keydown/keyup) au lieu des
      // 40 ms fixes d'avant le 2026-07-09.
      search.focus();
      setNativeValue(search, "");
      for (const char of String(rawValue)) {
        dispatchKey(search, "keydown", char);
        dispatchKey(search, "keypress", char);
        setNativeValue(search, search.value + char);
        dispatchKey(search, "keyup", char);
        await sleep(randInt(HUMAN_CHAR_MIN, HUMAN_CHAR_MAX));
      }
      await sleep(700); // debounce du filtre
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
    return true;
  } catch (e) {
    const note = `${fieldName}: champ sauté — ${e.message}`;
    console.warn(`[ebay] ⚠️ ${note}`);
    warnings.push(note);
    document.body.click(); // referme un éventuel menu resté ouvert
    await humanPause();
    return false;
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
async function fillDescription(text, warnings) {
  const iframe = await waitFor(
    () => document.querySelector('iframe#se-rte-frame__summary, iframe[title="Description"]'),
    5000
  );
  if (!iframe) {
    warnings.push("description: iframe RTE introuvable — description non remplie");
    return;
  }
  try {
    const doc = iframe.contentDocument;
    const target = doc.querySelector('[contenteditable="true"]') || doc.body;
    target.focus?.();
    // textContent + <br> manuels : le RTE interprète le HTML, on n'injecte
    // que des sauts de ligne (jamais le texte brut en innerHTML).
    target.innerHTML = String(text)
      .split("\n")
      .map((line) => line.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])))
      .join("<br>");
    target.dispatchEvent(new Event("input", { bubbles: true }));
    doc.body.dispatchEvent(new Event("input", { bubbles: true }));
    await humanPause();
  } catch (e) {
    warnings.push(`description: RTE inaccessible (${e.message}) — description non remplie`);
  }
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

// Cascade v2 identique à vinted.js/leboncoin.js : exact → option⊂valeur (la
// plus longue) → valeur⊂option (la plus courte) → composants (et/,/&/+).
function findOptionCascade(root, optionSelector, text) {
  const options = Array.from(root.querySelectorAll(optionSelector))
    .map((el) => ({ el, label: el.textContent.trim(), norm: normalizeFuzzy(el.textContent) }))
    .filter((o) => o.norm);
  if (!options.length) return null;
  const target = normalizeFuzzy(text);

  const exact = options.find(
    (o) => o.norm === target || o.label.split("/").some((p) => normalizeFuzzy(p) === target)
  );
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
