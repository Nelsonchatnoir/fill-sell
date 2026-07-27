// chrome-extension/selectors/ebay.registry.js
//
// FICHIER DE DONNÉES PUR — aucune logique, aucun import applicatif.
// Source de vérité : docs/SELECTOR_AUDIT.md (audit du 2026-07-26, HEAD 73ac223), §3
// (content-scripts/ebay.js + confirmations dans background.js).
// Aucun sélecteur inventé — mêmes conventions de maillons que vinted.registry.js.
//
// Clés optional: true (A1 — absence nominale ou sémantique inversée, d'après
// les notes déjà portées par le registre ; se résolvent par tryResolveSelector) :
//   - auth.password_guard (présence = needsUser, absence = état sain)
//   - publish.notices     (l'absence est un état normal pré-clic)

export const EBAY_SELECTORS = {
  "delete.listing_row": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      { type: "template", value: 'a[href*="{itemId}"]', params: ["itemId"], note: "ancre par id d'annonce (dynamique itemId)" },
      { type: "css", value: "a", note: "parcours de toutes les ancres (querySelectorAll)" },
      { type: "css", value: "tr", note: "via closest() depuis l'ancre" },
      { type: "css", value: '[class*="grid-row"], [class*="listing-row"], li', note: "via closest(), 2e forme de ligne" },
    ],
    source: "ebay.js:135-148",
    note: "localisation de la ligne au Hub vendeur ; vérif post : garde ebayIdAlreadyKnown (id 9+ chiffres ≠ preuve, 5d9d308)",
  },

  "delete.row_menu": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      { type: "css", value: "button", note: "querySelectorAll(\"button\")" },
      { type: "css", value: "button.fake-menu__item" },
      { type: "css", value: "button.fake-menu__item, [role='menuitem'], button" },
    ],
    source: "ebay.js:154, 172, 302 (findEbayEnd)",
    note: "menu d'actions ; vérif post : texte « Mettre fin » exigé",
  },

  "delete.dialog": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      { type: "css", value: '[role="dialog"], [class*="dialog"], [class*="modal"]', note: "3 formes" },
    ],
    source: "ebay.js:193",
    note: "attente du dialogue de fin d'annonce ; vérif post : le dialogue doit NOMMER l'annonce du job, sinon abandon + closeDialog() (l.225-228)",
  },

  "delete.confirm": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      {
        type: "text",
        scope: "button",
        textMatches: "^Mettre fin à l'annonce$",
        note: "source = comparaison STRICTE === (ebay.js:233) : casse exacte, apostrophe droite U+0027 seule, aucun flag — vérifié au code le 27/07 (la classe ['’] antérieure élargissait le contrat)",
      },
    ],
    assert: { visible: true, enabled: true },
    source: "ebay.js:231-241",
    note: "aucun fallback (texte seul) ; PAS de vérif dans le content script — sleep(4000) puis délégation explicite au background (§7)",
  },

  "delete.dialog_close": {
    criticality: "orange",
    workflows: ["delete"],
    chain: [
      {
        type: "text",
        scope: "button",
        textMatches: "^annuler$",
        flags: "i",
        note: "source ebay.js:211 : /^annuler$/i sur le texte ; la branche OR /fermer|close/i porte sur l'ARIA-LABEL, non représentable en maillon text (textContent seul)",
      },
    ],
    source: "ebay.js:208-219 (closeDialog, abandon propre)",
    note: "vérif post : état loggé si introuvable ; flags restaurés au code le 27/07",
  },

  "nav.sell_entry": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      {
        type: "text",
        scope: "a",
        textMatches: "^vendre$",
        flags: "i",
        note: "source ebay.js:314 : textContent.trim().toLowerCase() === \"vendre\" (≡ ^vendre$/i) ; la branche OR sur href /\\/sl\\/sell|\\/sl\\/list|sell\\.ebay\\./ (ebay.js:313) n'est pas représentable en maillon text",
      },
    ],
    source: "ebay.js:307-324 (goToSellFromHome)",
    note: "vérif post : URL du formulaire attendue ensuite ; flags restaurés au code le 27/07",
  },

  "auth.password_guard": {
    criticality: "red",
    optional: true,
    workflows: ["publish"],
    chain: [{ type: "css", value: 'input[type="password"]' }],
    source: "ebay.js:308, 364 (gardes de session)",
    note: "sémantique INVERSÉE : présence ⇒ needsUser ; absence = état sain",
  },

  "publish.form_title": {
    criticality: "red",
    workflows: ["publish"],
    chain: [{ type: "css", value: 'input[name="title"]' }],
    assert: { visible: true, enabled: true },
    source: "ebay.js:424, 465",
    note: "aucun fallback (§8) — sert aussi de détection « formulaire atteint » ; vérif post : échec explicite si absent (categoryId refusé)",
  },

  "publish.category_check": {
    criticality: "green",
    workflows: ["publish"],
    chain: [{ type: "css", value: "main" }],
    source: "ebay.js:449",
    note: "vérif feuille de catégorie affichée via innerText — ⚠ layout-dépendant (§9c : innerText vide sans rendu ⇒ warning émis à tort)",
  },

  "publish.specific_label": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'button[id*="item-specific-dropdown-label"]' },
    ],
    source: "ebay.js:490, 917, 952, 957 (SPECIFIC_LABEL_BTN, findSpecificLabelButton)",
    note: "vérif post : croiser PLUSIEURS labels ⇒ hors de la ligne (garde documentée l.948-950)",
  },

  "publish.specific_value": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: "button.se-expand-button__button, button.fake-menu-button__button", note: "2 formes" },
    ],
    source: "ebay.js:946, 958 (SPECIFIC_VALUE_BTN)",
    note: "bouton-valeur de la ligne ; vérif post : readAspectDisplayValue",
  },

  "publish.specific_row": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      {
        type: "css",
        value: '[class*="summary__attributes--field"], li, .se-field, .field, div',
        note: "via closest(), 5 formes",
      },
    ],
    source: "ebay.js:970, 999, 1028, 1132",
    note: "remontée à la ligne d'aspect ; vérif post : dump systématique de la ligne en échec (85979e2)",
  },

  "publish.specific_display": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: '[class*="summary__attributes--value"] [class*="textual-display"]' },
      {
        type: "css",
        value: '.fake-menu-button__menu, [class*="list-menu"], .menu__items, [class*="tooltip"], [class*="overlay"]',
        note: "EXCLUSION via closest() — un nœud dans ces conteneurs n'est PAS une valeur (fix a9cc6a2 : ne JAMAIS lire une option de menu fermé comme valeur)",
      },
      { type: "css", value: 'button[class*="summary__attributes--pill-active"]', note: "pilule" },
    ],
    source: "ebay.js:1014-1029 (readAspectDisplayValue)",
    note: "3 lectures ordonnées — c'est la lecture de vérité",
  },

  "publish.specific_menu": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      {
        type: "css",
        value: ".se-filter-menu-button__menu-container",
        note: "SPECIFICS_MENU_SELECTOR — scopé closest('.se-filter-menu-button') puis global",
      },
      { type: "css", value: ".fake-menu-button__menu", note: "repli" },
    ],
    source: "ebay.js:49, 811, 1297-1299, 1364 (visibleMenu)",
    note: "⚠ visibleMenu repose sur offsetParent (§9a+§9c) : faux « fermé » possible en fenêtre non rendue → re-clic qui BASCULE le menu",
  },

  "publish.specific_option": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: '[role="menuitemradio"], [role="menuitemcheckbox"], .menu__item', note: "3 formes + cascade" },
    ],
    source: "ebay.js:1341, 1350-1355, 1704",
    note: "options de menu ; vérif post : relecture display après pose",
  },

  "publish.specific_textbox": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: "input.textbox__control, input[type='text']", note: "2 formes" },
    ],
    source: "ebay.js:1319",
    note: "saisie libre d'aspect ; vérif post : relecture 8 s (throttling onglet caché)",
  },

  "publish.specific_toggle": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: "button.se-toggle-button-group__toggle-button, .toggle-button" },
      { type: "css", value: "button.fake-link", note: "fake-link aria-expanded piégeux" },
    ],
    source: "ebay.js:1259, 1132, 1245",
    note: "affichages alternatifs",
  },

  "publish.condition_value": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [{ type: "css", value: "#summary-condition-field-value" }],
    source: "ebay.js:570",
    note: "état pré-rempli par l'URL ; vérif post : comparé au job",
  },

  "publish.price": {
    criticality: "red",
    workflows: ["publish"],
    chain: [{ type: "css", value: 'input[name="price"]' }],
    assert: { visible: true, enabled: true },
    source: "ebay.js:584, 765",
    note: "aucun fallback (§8) ; vérif post : garde pré-submit — ⚠ validation actuelle par offsetParent (l.585, §9c)",
  },

  "publish.buy_it_now": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'button[aria-haspopup="listbox"]' },
      {
        type: "text",
        scope: '[role="option"]',
        textMatches: "^Achat immédiat$",
        note: "source ebay.js:1412 : comparaison STRICTE === « Achat immédiat » — casse exacte, aucun flag, ancrage restauré au code le 27/07",
      },
    ],
    source: "ebay.js:1380, 1390 (ensureAchatImmediat)",
    note: "⚠ offsetParent l.1391 (§9c)",
  },

  "publish.description": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'iframe#se-rte-frame__summary, iframe[title="Description"]' },
      { type: "css", value: '[contenteditable="true"]', note: "dans l'iframe" },
      { type: "css", value: 'textarea[name="description"]', note: "oracle" },
    ],
    source: "ebay.js:1419-1435 (fillDescription)",
    note: "3 étages ; vérif post : oracle relu",
  },

  "publish.photo_input": {
    criticality: "red",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'input#fehelix-uploader, input[type="file"]', note: "2 formes" },
    ],
    assert: { enabled: true },
    source: "ebay.js:1747 (uploadPhotos)",
    note: "AUCUNE vérif post : sleep(1500×n) seul (§7) ; input file, jamais d'assert visible",
  },

  "publish.submit": {
    criticality: "red",
    workflows: ["publish"],
    chain: [
      {
        type: "text",
        scope: "button",
        textMatches: "mettre en vente avec les frais",
        flags: "i",
        note: "régex n°1 de retrouveListBtn (ebay.js:861) — littéral complété au code le 27/07, l'audit l'élidait",
      },
      {
        type: "text",
        scope: "button",
        textMatches: "^mettre en vente",
        flags: "i",
        note: "régex n°2 de retrouveListBtn (ebay.js:864), repli — relocalisé sur le nœud VIVANT à chaque usage",
      },
    ],
    assert: { visible: true, enabled: true },
    source: "ebay.js:859-865 (retrouveListBtn)",
    note: "pas de fallback structurel (texte seul) ; vérif post : détection d'effet (URL quittée / bouton détaché·désactivé / notice ou dialogue apparu, surveilleNotices l.826), re-clic unique sinon, verdict final délégué au background",
  },

  "publish.notices": {
    criticality: "red",
    optional: true,
    workflows: ["publish"],
    chain: [
      { type: "css", value: '.page-notice, [role="alert"], [role="dialog"], [class*="lightbox" i]', note: "4 formes" },
    ],
    source: "ebay.js:826 (surveilleNotices)",
    note: "signal — référence relevée AVANT le clic submit ; l'absence est un état normal pré-clic",
  },

  "publish.lightbox": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: ".lightbox-dialog" },
      { type: "css", value: 'button[aria-label*="ermer" i], button.icon-btn', note: "fermeture, scopée au dialogue" },
    ],
    source: "ebay.js:1482-1486 (dismissLightboxes, popup « Astuces photos »)",
    note: "vérif post : relecture — ⚠ offsetParent l.1482 (§9c)",
  },

  "publish.post_submit_confirm": {
    criticality: "red",
    workflows: ["publish"],
    chain: [
      { type: "css", value: '[role="dialog"], [class*="lightbox" i], [class*="modal" i]', note: "dialogues" },
      {
        type: "css",
        value: 'button[aria-label*="ermer" i], button[aria-label*="lose" i], button.lightbox-dialog__close',
        note: "bouton close, scopé au dialogue",
      },
    ],
    source: "background.js:2538-2564 (readEbayFailureDiagnostics, closeEbayPostPublishPopup)",
    note: "vérif post : croisé avec le Hub vendeur",
  },

  "status.hub_links": {
    criticality: "red",
    workflows: ["status_check"],
    chain: [
      { type: "css", value: 'a[href*="/itm/"]', note: "Hub vendeur /sh/lst/active" },
      { type: "css", value: "a[href]", note: "ancres génériques" },
    ],
    source: "background.js:3237, 3425, 3441",
    note: "récupération listing_url + confirmation de publication ; matching par TITRE obligatoire, jamais « lien unique » (règle listing_url croisée)",
  },
};
