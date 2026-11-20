// ═══════════════════════════════════════════════════════════════════════════
// BAC À SABLE DE LA TAILLE VINTED — le code RÉEL de vinted.js, un faux DOM à
// onglets, une horloge virtuelle (2026-09-23)
// ═══════════════════════════════════════════════════════════════════════════
// Partagé par scripts/vinted-taille-eu-selftest.mjs et scripts/tailles-rejeu.mjs.
// Les fonctions sont EXTRAITES du fichier passé (jamais recopiées) : si
// quelqu'un les réécrit, c'est le nouveau code qui tourne ici. Le mini-DOM ne
// sait que ce que `selectTailleVinted` touche : le déclencheur, la barre
// d'onglets (des <button> au texte court), la grille dont SEUL l'onglet actif
// rend ses options (data-testid="size-group-<groupe>-grid-option-<id>"), et
// le clic sur une option, journalisé.

/** Extrait une fonction de tête (async ou non) par équilibrage d'accolades. */
export function extraireFonction(src, nom) {
  const re = new RegExp(`^(?:async )?function ${nom}\\(`, "m");
  const m = src.match(re);
  if (!m) throw new Error(`${nom} introuvable`);
  // Le corps commence à l'accolade qui SUIT la parenthèse fermante des
  // paramètres — pas à la première accolade venue : « { sizeField = false } »
  // est un paramètre déstructuré, pas le corps.
  const parenOuv = src.indexOf("(", m.index);
  let prof = 0, parenFerm = -1;
  for (let j = parenOuv; j < src.length; j++) {
    if (src[j] === "(") prof++;
    else if (src[j] === ")") { prof--; if (prof === 0) { parenFerm = j; break; } }
  }
  if (parenFerm < 0) throw new Error(`${nom} : parenthèses déséquilibrées`);
  const debut = src.indexOf("{", parenFerm);
  let depth = 0;
  for (let j = debut; j < src.length; j++) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
    else if (c === "`" || c === '"' || c === "'") {
      const q = c;
      for (j++; j < src.length && src[j] !== q; j++) if (src[j] === "\\") j++;
    } else if (c === "/" && src[j + 1] === "/") {
      j = src.indexOf("\n", j);
    }
  }
  throw new Error(`${nom} : accolades déséquilibrées`);
}

const ligne = (src, re) => { const m = src.match(re); if (!m) throw new Error(`ligne introuvable : ${re}`); return m[0]; };

/**
 * Charge les fonctions de taille de vinted.js dans un bac à sable posé sur `document`.
 * (20/11/2026) `computeVintedRequiredState` : l'état des requis rendu au pré-vol (lu par la dernière passe taille) —
 * absent, il échoue comme une config illisible.
 */
export function chargerTailleVinted(src, document, { computeVintedRequiredState = async () => { throw new Error("requis non simulés"); } } = {}) {
  const optionnel = (nom) => { try { return extraireFonction(src, nom); } catch { return `function ${nom}() { throw new Error("${nom} absente de cette version"); }`; } };
  const corps = [
    ligne(src, /^const PURE_NUMBER_RE = .+;$/m),
    ligne(src, /^const TAILLE_TRIGGER_SEL = .+;$/m),
    ligne(src, /^const TAILLE_OPTIONS_SEL = .+;$/m),
    ligne(src, /^const TAILLE_PREFIXE_ONGLET_RE = .+;$/m),
    "const optionsRelevees = new Map();",
    "let diagnosticTailleDerniere = null;",
    "let optionsTailleVues = [];",
    // (20/11/2026, 0.6.195) la pose relue : saisie non prise, journal de l'étape taille (absents des versions d'avant).
    "let tailleNonPriseDerniere = null;",
    "let journalTailleVinted = [];",
    extraireFonction(src, "texteComparable"),
    "const normalizeFuzzy = (s) => texteComparable(s);",
    extraireFonction(src, "containsAsWords"),
    extraireFonction(src, "findOptionCascade"),
    extraireFonction(src, "waitForOptionCascade"),
    extraireFonction(src, "releverOngletsTaille"),
    extraireFonction(src, "groupeTailleAffiche"),
    extraireFonction(src, "attendreOptionsTaille"),
    extraireFonction(src, "activerOngletTaille"),
    extraireFonction(src, "candidatsTailleVinted"),
    // 24/09 : le relevé d'options ne garde que les libellés sélectionnables
    // (absente des versions d'avant : repli sur le relevé brut).
    (() => { try { return extraireFonction(src, "libellesOptionsLisibles"); } catch { return "function libellesOptionsLisibles(t) { return (t ?? []).map((x) => String(x ?? '').trim()).filter(Boolean); }"; } })(),
    optionnel("verdictTailleHorsGrille"),
    // 12/11 : traduction par identifiant d'un id de taille retiré par Vinted (absente des versions d'avant).
    optionnel("tailleEquivalenteRetiree"),
    // (20/11/2026, 0.6.195) La pose RELUE : lecture du champ (menus bloom, 28/10), option déjà choisie jamais re-cliquée,
    // un essai = l'ancienne pose (poserTailleVintedUnEssai), selectTailleVinted relit et retente une fois. Absentes des
    // versions d'avant : leur selectTailleVinted ne les appelle pas.
    optionnel("estMenuVintedBloom"),
    optionnel("valeurChampVinted"),
    optionnel("tailleRelueCorrespond"),
    optionnel("optionTailleDejaChoisie"),
    optionnel("cliquerOptionTailleSansBasculer"),
    optionnel("relireChampTailleVinted"),
    optionnel("poserTailleVintedUnEssai"),
    extraireFonction(src, "selectTailleVinted"),
    optionnel("dernierePasseTailleVinted"),
    optionnel("diagnosticTailleVidePrevol"),
    "return { candidatsTailleVinted, selectTailleVinted, verdictTailleHorsGrille, tailleEquivalenteRetiree, findOptionCascade, optionsRelevees, diag: () => diagnosticTailleDerniere, vues: () => optionsTailleVues, " +
      "tailleRelueCorrespond, optionTailleDejaChoisie, dernierePasseTailleVinted, diagnosticTailleVidePrevol, nonPrise: () => tailleNonPriseDerniere, journal: () => journalTailleVinted, horloge: () => Date.now() };",
  ].join("\n");
  let horloge = 0;
  const DateVirtuelle = { now: () => horloge };
  const sleep = (ms) => { horloge += ms; return Promise.resolve(); };
  const noop = async () => {};
  const consoleMuet = { log() {}, warn() {}, error() {} };
  return new Function("document", "Date", "sleep", "humanPause", "openDropdown", "confirmDropdownIfNeeded", "closeAnyOpenDropdown", "console", "computeVintedRequiredState", corps)(
    document, DateVirtuelle, sleep, noop, noop, noop, noop, consoleMuet, computeVintedRequiredState,
  );
}

class N {
  constructor(tag, attrs = {}, texte = "", onClick = null) { this.tag = tag; this.attrs = attrs; this.texte = texte; this.children = []; this.parentElement = null; this.onClick = onClick; }
  add(...kids) { for (const k of kids) { k.parentElement = this; this.children.push(k); } return this; }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join("") : this.texte; }
  getAttribute(n) { return this.attrs[n] ?? null; }
  click() { if (this.onClick) this.onClick(); }
  matches(sel) {
    const anc = sel.match(/^\[data-testid\^="([^"]+)"\]\[data-testid\$="([^"]+)"\]$/);
    if (anc) { const t = String(this.attrs["data-testid"] ?? ""); return t.startsWith(anc[1]) && t.endsWith(anc[2]); }
    const pfx = sel.match(/^\[data-testid\^="(.+)"\]$/);
    if (pfx) return String(this.attrs["data-testid"] ?? "").startsWith(pfx[1]);
    const exact = sel.match(/^\[data-testid="(.+)"\]$/);
    if (exact) return String(this.attrs["data-testid"] ?? "") === exact[1];
    if (sel.startsWith("#")) return this.attrs.id === sel.slice(1);
    return this.tag === sel;
  }
  *descendants() { for (const c of this.children) { yield c; yield* c.descendants(); } }
  querySelectorAll(sel) { return sel.split(",").map((s) => s.trim()).flatMap((s) => [...this.descendants()].filter((n) => n.matches(s))); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  closest(sel) { for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n; return null; }
}

/**
 * Un panneau Vinted : onglets [{texte, groupe, idDepart, options[]}]. Un seul
 * onglet = grille à liste unique (pas de barre). Rend { document, clics, champ, vider } —
 * `clics` journalise les libellés d'options cliqués, dans l'ordre (clics perdus compris).
 * (20/11/2026, 0.6.195) Le déclencheur porte la taille choisie (`champ.value`, relu par
 * valeurChampVinted comme un <input>) : un clic sur une option la pose, comme sur Vinted.
 * Comportements du formulaire réel rejoués à la demande :
 *   · aria        — chaque option porte aria-checked (true = la taille choisie) ;
 *   · bascule     — un clic sur l'option DÉJÀ choisie la décoche (champ vidé) ;
 *   · clicsPerdus — les N premiers clics ne prennent pas (menu pas ouvert) ;
 *   · preselection — une taille déjà choisie à l'ouverture (suggestion de Vinted) ;
 *   · vider()     — la taille vidée après coup (suggestion d'attributs tardive).
 */
export function panneau(onglets, { barre = onglets.length > 1, aria = false, bascule = false, clicsPerdus = 0, preselection = null } = {}) {
  const clics = [];
  let actif = 0;
  let perdus = clicsPerdus;
  const racine = new N("div", { class: "form" });
  const champ = new N("div", { id: "size", "data-testid": "category-size-single-grid-input" }, "Taille");
  champ.value = preselection ?? "";
  racine.add(champ);
  const panel = new N("div", { class: "panel" });
  racine.add(panel);
  const barreN = new N("div", { class: "tabs" });
  if (barre) panel.add(barreN);
  const grid = new N("div", { class: "grid" });
  panel.add(grid);
  const marquer = () => { if (aria) for (const n of grid.children) n.attrs["aria-checked"] = n.texte === champ.value ? "true" : "false"; };
  const rendre = () => {
    grid.children = [];
    const o = onglets[actif];
    o.options.forEach((t, i) => grid.add(new N("div", { "data-testid": `size-group-${o.groupe}-grid-option-${o.idDepart + i}` }, t, () => {
      clics.push(t);
      if (perdus > 0) { perdus--; return; }
      champ.value = bascule && champ.value === t ? "" : t;
      marquer();
    })));
    marquer();
  };
  if (barre) onglets.forEach((o, i) => barreN.add(new N("button", {}, o.texte, () => { actif = i; rendre(); })));
  rendre();
  const document = {
    querySelector: (sel) => racine.querySelector(sel),
    querySelectorAll: (sel) => racine.querySelectorAll(sel),
  };
  const vider = () => { champ.value = ""; marquer(); };
  return { document, clics, champ, vider };
}
