// chrome-extension/selectors/vinted.registry.js
//
// FICHIER DE DONNÉES PUR — aucune logique, aucun import applicatif.
// Source de vérité : docs/SELECTOR_AUDIT.md (audit du 2026-07-26, HEAD 73ac223), §1.
// Aucun sélecteur inventé : tout littéral vient de l'audit, à l'identique ; les
// sélecteurs construits dynamiquement sont reportés avec leur mode de construction
// (type 'dynamic'/'template'/'signal'). Le premier maillon de chaque chaîne est le
// sélecteur actuellement utilisé en prod.
//
// Types de maillon :
//   css      — sélecteur CSS littéral (value)
//   testid   — data-testid (value), résolu en [data-testid="<value>"]
//   xpath    — expression XPath (value)
//   text     — éléments de `scope` filtrés par regex `textMatches` sur textContent
//   template — sélecteur CSS à trous {param} (value + params), résolu avec des
//              paramètres fournis à l'appel
//   dynamic  — construit par une fonction du content script (construction) ;
//              résolu via la fonction nommée par `fn` (enregistrée par le
//              content script propriétaire, cf. registerDynamicResolver) ou
//              via params.selector
//   signal   — pas un élément : signal de preuve (URL, réseau, texte de page)
//
// Clés optional: true (A1 — absence nominale ou sémantique inversée, d'après
// les notes déjà portées par le registre ; se résolvent par tryResolveSelector,
// jamais resolveSelector) :
//   - publish.dropdown_panel  (l'absence du panneau est un état normal)
//   - auth.password_guard     (sémantique inversée : présence = needsUser)

export const VINTED_SELECTORS = {
  "publish.field_input": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      {
        type: "dynamic",
        fn: "vintedFieldSelector",
        construction:
          "vintedFieldSelector(code) — map spéciale '#brand, [data-testid=\"brand-select-dropdown-input\"]' / model / color / condition / size / material, sinon motif générique category-<code>-… (ex. réel l.614 : '#sim_lock, [data-testid=\"category-sim_lock-single-list-input\"]')",
        note: "chaque entrée de la map est déjà une paire #id, [data-testid=…] (fallback interne) ; fn à enregistrer par vinted.js via registerDynamicResolver",
      },
    ],
    source: "vinted.js:52-68, 94, 100, 614, 679",
    note: "vérif post : relecture de la valeur après pose (patterns de commit fiber)",
  },

  "publish.photo_input": {
    criticality: "red",
    workflows: ["publish"],
    chain: [{ type: "css", value: 'input[data-testid="add-photos-input"]' }],
    assert: { enabled: true },
    source: "vinted.js:1994",
    note: "uploadPhotos — AUCUNE vérif post : sleep(1500×n) seul (§7 de l'audit) ; input file, jamais d'assert visible",
  },

  "publish.dropdown_panel": {
    criticality: "orange",
    optional: true,
    workflows: ["publish"],
    chain: [{ type: "css", value: ".input-dropdown__content" }],
    source: "vinted.js:143, 1620, 1634 (DROPDOWN_PANEL_SELECTOR)",
    note: "closeAnyOpenDropdown — l'ABSENCE du panneau est un état normal (vérif post = relecture d'absence) ; un échec de résolution n'est pas une anomalie pour cette clé",
  },

  "publish.catalog_option": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [{ type: "css", value: 'li.web_ui__Item__item [role="button"][id^="catalog-"]' }],
    assert: { visible: true },
    source: "vinted.js:1828, 1831 (CATALOG_OPTION_SELECTOR)",
    note: "visibleCatalogLabels, cascade catégorie — match exact-d'abord (findOptionByText), chevron testé via .web_ui__Cell__with-chevron (l.1848-1850)",
  },

  "publish.option_item": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      {
        type: "dynamic",
        construction:
          "sélecteur passé en paramètre optionSelector aux résolveurs génériques (findOptionByText, findOptionCascade, waitForOptionCascade, findVintedModelOption)",
      },
    ],
    source: "vinted.js:1470, 1537, 1590, 1694, 1805",
    note: "fallback interne : cascade exact → normalisé → includes ; normalisation espaces insécables (U+00A0)",
  },

  "publish.custom_brand_option": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [{ type: "css", value: "#custom-select-brand" }],
    assert: { visible: true },
    source: "vinted.js (selectVintedBrand, repli création de marque)",
    note:
      "relevé EN DIRECT le 2026-07-29 sur /items/new (catégorie Robes d'été, marque « Mela & Adorna ») : " +
      "role=button, classes web_ui__Cell__cell/clickable, SANS aria-label ni data-testid, texte « Utiliser \"X\" comme marque » ; " +
      "n'apparaît qu'après frappe d'une marque HORS catalogue dans #brand-search-input ; " +
      "le clic seul ne commite PAS #brand (la ligne disparaît, valeur vide) — c'est la fermeture du panneau par « Fait » qui commite ; " +
      "vérif post : relecture de #brand.value non vide, sinon throw (le job échoue avant soumission)",
  },

  "publish.model_option": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      {
        type: "css",
        value: '[role="button"], [data-testid^="model-"]:not([data-testid$="--title"])',
        note: "utilisé via closest() depuis le nœud cliqué — 2 formes dans le closest",
      },
    ],
    source: "vinted.js:1717 (clickModelOption)",
  },

  "publish.done_button": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "text", scope: 'button, [role="button"]', textMatches: "^Fait$" },
    ],
    assert: { visible: true, enabled: true },
    source: "vinted.js:1436, 1449, 1622 (findButtonByExactText)",
    note: "boutons par texte exact « Fait »",
  },

  "publish.package_type": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      {
        type: "template",
        value: '[data-testid="package_type_selector_{n}--input"]',
        params: ["n"],
        note: "n = 1..3",
      },
    ],
    source: "vinted.js:1955",
  },

  "publish.submit": {
    criticality: "red",
    workflows: ["publish"],
    chain: [{ type: "testid", value: "upload-form-save-button" }],
    assert: { visible: true, enabled: true },
    source: "vinted.js:823 (fin de fillListingForm)",
    note: "aucun fallback (§8) ; vérif post : waitForPublishOutcome() — redirection /items/<id> OU sonde réseau (l.903-946)",
  },

  "publish.success_signal": {
    criticality: "red",
    workflows: ["publish"],
    chain: [
      {
        type: "signal",
        signals: [
          { kind: "url", pattern: "^\\/items\\/(\\d+)" },
          {
            kind: "network",
            construction:
              "sonde réseau injectée monde MAIN — capture le POST de dépôt (status + errors[{field,value}]) relayée via VINTED_PROBE_CAPTURE",
          },
        ],
      },
    ],
    source: "vinted.js:903-946, 126-176 (waitForPublishOutcome, readProbeSuccess, readServerValidationErrors)",
    note: "2 signaux indépendants (URL, réseau) — c'est LA vérification de publication, pas un sélecteur d'élément",
  },

  "publish.post_publish_modal": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      {
        type: "css",
        value: '[role="dialog"], .web_ui__Dialog__content',
        note: "étape 1 : conteneur de la modale",
      },
      {
        type: "css",
        value: '[data-testid*="close"], button[aria-label*="Fermer" i], button[aria-label*="Close" i]',
        note: "étape 2 : bouton de fermeture, scopé au conteneur",
      },
      {
        type: "css",
        value: "button",
        note: "étape 3 : repli — tous les boutons du conteneur",
      },
    ],
    source: "vinted.js:970-974 (closePostPublishModal)",
    note: "chaîne à 3 étages (conteneur → bouton → repli), vérif post : relecture de disparition",
  },

  "publish.field_dialog_headers": {
    criticality: "green",
    workflows: ["publish"],
    chain: [{ type: "css", value: "h2, h3, [role='dialog']" }],
    source: "vinted.js:831 (labelWithOptions)",
  },

  "auth.password_guard": {
    criticality: "red",
    optional: true,
    workflows: ["publish"],
    chain: [{ type: "css", value: 'input[type="password"]' }],
    source: "vinted.js:451 (fillListingForm, garde de session)",
    note: "sémantique INVERSÉE : la PRÉSENCE de l'élément ⇒ needsUser (déconnexion) ; son absence est l'état sain — ne jamais traiter l'échec de résolution comme une anomalie",
  },

  "delete.csrf_token": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      { type: "css", value: "script:not([src])", note: "scan des scripts inline" },
      { type: "css", value: 'meta[name="csrf-token"], meta[name="csrf_token"]' },
    ],
    source: "vinted.js:247, 251 (extractVintedCsrfToken)",
    note: "2 sources ; vérif post : absence de jeton ⇒ AUCUN envoi (l.337-352)",
  },

  "delete.card_button": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      {
        type: "text",
        scope: "button, a, [role='button'], [role='menuitem']",
        textMatches: "^supprimer( l['’]annonce)?$",
        flags: "i",
        note: "libellé complété le 27/07 depuis le code (vinted.js:409 : /^supprimer( l['’]annonce)?$/i) — l'audit ne le littéralisait pas",
      },
    ],
    source: "vinted.js:408 (findDeleteByText)",
    note: "aucun fallback structurel (texte seul) ; vérif post : gate DELETE_DRY_RUN ; ⚠ findDeleteByText n'est APPELÉE NULLE PART (code mort, grep 27/07) — la suppression Vinted passe par l'API",
  },

  "status.price_input": {
    criticality: "red",
    workflows: ["publish"],
    chain: [
      { type: "css", value: '#price, [data-testid="price-input--input"]', note: "paire id/testid (fallback interne à la paire)" },
    ],
    assert: { visible: true, enabled: true },
    source: "background.js:2867, 2925 (readVintedPriceState, commitVintedPrice, via executeScript)",
    note: "garde prix pré-submit ; vérif post : relecture du state React après commit",
  },
};
