// chrome-extension/selectors/resolve.js
//
// Couche de résolution en cascade au-dessus des registres déclaratifs
// (docs/SELECTOR_AUDIT.md → *.registry.js). Contrats :
//
// - resolveSelector(platform, key, opts) → { el, via, key, platform }
//   opts = { root = document, params = {}, reportFailure = true }.
//   Rétrocompatibilité : un 3e argument Node/Document est interprété comme
//   root (ancienne signature (platform, key, root, params)).
//   Parcourt la chaîne dans l'ordre, s'arrête au premier maillon qui résout ET
//   dont le bloc assert passe. Un maillon qui résout mais dont l'assert échoue
//   est un ÉCHEC de maillon : on passe au suivant.
// - Si aucun maillon ne résout : SelectorResolutionError (platform, key,
//   criticality, nombre de maillons essayés). JAMAIS de retour null silencieux
//   — a fortiori sur une clé de criticité red.
// - Clés `optional: true` (absence nominale ou sémantique inversée, listées en
//   tête de chaque registre) : resolveSelector/resolveSelectorAll REFUSENT de
//   les servir (SelectorConfigError — le mauvais appel doit casser au
//   développement, pas produire du bruit en prod). Passer par
//   tryResolveSelector, qui retourne null sans jamais lever sur une absence.
//   Symétriquement, tryResolveSelector refuse une clé non-optional.
// - Télémétrie (public.selector_health) : émise dès que via > 0 OU qu'un
//   maillon a résolu avec assert en échec ; resolved_via = -1 sur échec total.
//   tryResolveSelector n'émet JAMAIS de -1 (l'échec y est le cas nominal).
//   Fire-and-forget : jamais bloquante, jamais de throw depuis la télémétrie.
//   extension_version = version du manifest (chrome.runtime.getManifest).
// - reportFailure: false — pour les BOUCLES D'ATTENTE applicatives (SPA à
//   rendu différé) qui sondent une clé à répétition avant son apparition : un
//   -1 émis pendant que l'élément est simplement en cours de rendu serait un
//   faux signal de dégradation. La sonde passe reportFailure:false ; l'échec
//   FINAL (timeout applicatif épuisé) doit re-résoudre SANS ce flag pour
//   émettre le -1. Ne supprime que le -1 : via>0/assert restent émis.
// - Convention fenêtre non rendue (audit §9c) : les asserts de visibilité
//   n'utilisent QUE getComputedStyle — jamais offsetParent, getClientRects,
//   getBoundingClientRect ni innerText.
// - Regex (maillons `text`, asserts `textMatches`) : compilées avec les flags
//   du registre (champ `flags`, défaut AUCUN — la casse fait partie du contrat
//   du sélecteur ; ne poser "i" qu'avec preuve dans le code migré).
//
// ── Types non supportés par cette couche (A5) — clés NON résolubles ici ──────
// - `signal` (preuve d'URL / réseau / texte de page — pas un élément) :
//     vinted publish.success_signal, leboncoin publish.success_signal.
//   Ces clés restent documentaires ; leur logique vit dans les content
//   scripts. EXCLUES de toute migration vers resolveSelector.
// - `text` sans littéral (textMatches: null — libellé jamais littéralisé) :
//     leboncoin delete.card_delete (maillon 3).
// - `dynamic` sans fonction enregistrée ni params.selector :
//     vinted publish.option_item, leboncoin delete.confirm,
//     leboncoin publish.criterion_label (maillon 2),
//     leboncoin publish.listbox_owned (maillon 1),
//     beebs publish.option_label (maillon 3).
// Un maillon non résoluble compte comme maillon ESSAYÉ en échec : la cascade
// continue sur le maillon suivant.
//
// ── Fonctions `dynamic` (A4) ─────────────────────────────────────────────────
// Le registre porte le nom de la fonction (champ `fn`) ; resolve.js l'appelle
// avec (params, root). ⚠️ Ces fonctions N'ONT PAS pu être importées ici :
// elles vivent dans les content scripts (ex. vintedFieldSelector,
// content-scripts/vinted.js:52), qui sont des scripts CLASSIQUES du manifest
// — pas des modules, rien d'exportable (preuve : manifest.json,
// content_scripts sans type module ; un `export` y serait une SyntaxError).
// Les déplacer est interdit par l'énoncé de la migration. Compromis : le
// content script propriétaire ENREGISTRE sa fonction au démarrage via
// registerDynamicResolver(name, fn) — source unique préservée, zéro copie.
// La fonction peut retourner un Element, une liste d'Elements, un sélecteur
// CSS (résolu contre root) ou null.

import { VINTED_SELECTORS } from "./vinted.registry.js";
import { LEBONCOIN_SELECTORS } from "./leboncoin.registry.js";
import { EBAY_SELECTORS } from "./ebay.registry.js";
import { BEEBS_SELECTORS } from "./beebs.registry.js";
import { getInstallId } from "./installId.js";

const REGISTRIES = {
  vinted: VINTED_SELECTORS,
  leboncoin: LEBONCOIN_SELECTORS,
  ebay: EBAY_SELECTORS,
  beebs: BEEBS_SELECTORS,
};

export class SelectorResolutionError extends Error {
  constructor({ platform, key, criticality, triedLinks }) {
    super(
      `[selectors] ${platform}/${key} (criticité ${criticality}) : aucun des ${triedLinks} maillon(s) n'a résolu`
    );
    this.name = "SelectorResolutionError";
    this.platform = platform;
    this.key = key;
    this.criticality = criticality;
    this.triedLinks = triedLinks;
  }
}

// Erreur de CONFIGURATION (mauvais appel d'API, clé inconnue, placeholder de
// template manquant, fonction dynamique non enregistrée) : doit casser au
// développement — jamais avalée, jamais convertie en SelectorResolutionError.
export class SelectorConfigError extends Error {
  constructor(message) {
    super(`[selectors] ${message}`);
    this.name = "SelectorConfigError";
  }
}

function registryEntry(platform, key) {
  const registry = REGISTRIES[platform];
  if (!registry) {
    throw new SelectorConfigError(`plateforme inconnue : ${platform}`);
  }
  const entry = registry[key];
  if (!entry) {
    throw new SelectorConfigError(`clé inconnue : ${platform}/${key}`);
  }
  return entry;
}

// ── Fonctions dynamiques enregistrées par les content scripts (A4) ──────────
const DYNAMIC_RESOLVERS = new Map();

export function registerDynamicResolver(name, fn) {
  if (typeof name !== "string" || !name || typeof fn !== "function") {
    throw new SelectorConfigError("registerDynamicResolver(name, fn) : nom et fonction requis");
  }
  DYNAMIC_RESOLVERS.set(name, fn);
}

// Échappement d'une valeur injectée dans un sélecteur d'attribut entre guillemets.
function escapeForAttr(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// CSS d'un maillon css/testid/template. Lève SelectorConfigError sur un
// template dont un placeholder n'est pas fourni — JAMAIS de substitution
// silencieuse par undefined ou chaîne vide (A4).
function cssForLink(link, params, ctx) {
  switch (link.type) {
    case "css":
      return link.value;
    case "testid":
      return `[data-testid="${escapeForAttr(link.value)}"]`;
    case "template": {
      let out = link.value;
      for (const p of link.params || []) {
        const v = params ? params[p] : undefined;
        if (v === undefined || v === null || v === "") {
          throw new SelectorConfigError(
            `${ctx.platform}/${ctx.key} : maillon template — placeholder {${p}} sans valeur fournie (params requis : ${JSON.stringify(link.params)})`
          );
        }
        out = out.split(`{${p}}`).join(escapeForAttr(v));
      }
      return out;
    }
    default:
      return null;
  }
}

// Candidats d'un maillon, dans l'ordre du document. Tableau vide = maillon en
// échec (la cascade continue). Les erreurs de CONFIGURATION lèvent ; seules
// les erreurs DOM (sélecteur invalide pour ce moteur, API absente) font
// échouer le maillon en silence.
function linkCandidates(link, root, params, ctx) {
  if (link.type === "xpath") {
    try {
      const doc = root.ownerDocument || root;
      const result = doc.evaluate(link.value, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const out = [];
      for (let i = 0; i < result.snapshotLength; i++) {
        const node = result.snapshotItem(i);
        if (node && node.nodeType === 1) out.push(node);
      }
      return out;
    } catch (_) {
      return [];
    }
  }
  if (link.type === "text") {
    if (!link.scope || !link.textMatches) return []; // libellé non littéralisé : non résoluble
    const re = new RegExp(link.textMatches, link.flags || "");
    try {
      return Array.from(root.querySelectorAll(link.scope)).filter((el) =>
        re.test((el.textContent || "").trim())
      );
    } catch (_) {
      return [];
    }
  }
  if (link.type === "dynamic") {
    const fn = link.fn ? DYNAMIC_RESOLVERS.get(link.fn) : null;
    if (link.fn && !fn) {
      throw new SelectorConfigError(
        `${ctx.platform}/${ctx.key} : fonction dynamique "${link.fn}" non enregistrée (registerDynamicResolver au démarrage du content script propriétaire)`
      );
    }
    if (fn) {
      let out;
      try {
        out = fn(params || {}, root);
      } catch (_) {
        return []; // échec applicatif du résolveur : maillon en échec, cascade
      }
      if (!out) return [];
      if (typeof out === "string") {
        try {
          return Array.from(root.querySelectorAll(out));
        } catch (_) {
          return [];
        }
      }
      if (out.nodeType === 1) return [out];
      try {
        return Array.from(out).filter((n) => n && n.nodeType === 1);
      } catch (_) {
        return [];
      }
    }
    if (typeof params?.selector === "string") {
      try {
        return Array.from(root.querySelectorAll(params.selector));
      } catch (_) {
        return [];
      }
    }
    return [];
  }
  if (link.type === "signal") return []; // non supporté (A5) — jamais un élément
  const css = cssForLink(link, params, ctx); // peut lever SelectorConfigError (template)
  if (!css) return [];
  try {
    return Array.from(root.querySelectorAll(css));
  } catch (_) {
    return [];
  }
}

// Asserts post-résolution, pré-action. Fenêtre non rendue (§9c) : visibilité
// par getComputedStyle uniquement.
function assertPasses(el, assert) {
  if (!assert) return true;
  try {
    if (assert.tag && el.tagName.toLowerCase() !== assert.tag.toLowerCase()) {
      return false;
    }
    if (assert.visible) {
      if (!el.isConnected) return false;
      const win = el.ownerDocument && el.ownerDocument.defaultView;
      if (win) {
        const cs = win.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
      }
    }
    if (assert.enabled) {
      if (el.disabled === true) return false;
      if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return false;
    }
    if (assert.textMatches) {
      const re = new RegExp(assert.textMatches, assert.flags || "");
      if (!re.test((el.textContent || "").trim())) return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

// --- Télémétrie selector_health -------------------------------------------
// Anonyme (install_id seulement), fire-and-forget, dédupliquée en mémoire pour
// ne pas marteler l'API quand une même dégradation se répète dans la session.

const TELEMETRY_DEDUPE_MS = 10 * 60 * 1000;
const telemetrySent = new Map(); // "platform/key/via/assert" -> timestamp

function telemetryConfig() {
  const cfg = globalThis.FILLSELL_CONFIG;
  return {
    url: cfg?.SUPABASE_URL || "https://tojihnuawsoohlolangc.supabase.co",
    anonKey: cfg?.SUPABASE_ANON_KEY || "sb_publishable_0GoTciuApxM64_zrq3h43Q_c2Z6Obyr",
  };
}

function extensionVersion() {
  try {
    return globalThis.chrome?.runtime?.getManifest?.().version || null;
  } catch (_) {
    return null;
  }
}

function reportSelectorHealth(platform, key, resolvedVia, assertPassed) {
  try {
    const dedupeKey = `${platform}/${key}/${resolvedVia}/${assertPassed}`;
    const last = telemetrySent.get(dedupeKey);
    const now = Date.now();
    if (last && now - last < TELEMETRY_DEDUPE_MS) return;
    telemetrySent.set(dedupeKey, now);

    // Chaîne async détachée — l'appelant n'attend jamais la télémétrie.
    getInstallId()
      .then((installId) => {
        const { url, anonKey } = telemetryConfig();
        return fetch(`${url}/rest/v1/selector_health`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            install_id: installId,
            platform,
            selector_key: key,
            resolved_via: resolvedVia,
            assert_passed: assertPassed,
            extension_version: extensionVersion(),
          }),
        });
      })
      .catch(() => {});
  } catch (_) {
    // Jamais de throw depuis la télémétrie.
  }
}

// --- Cœur de résolution ----------------------------------------------------

// Normalisation des options : { root, params, reportFailure } — un Node/
// Document en 3e argument est interprété comme root (rétrocompatibilité avec
// l'ancienne signature (platform, key, root, params)).
function normalizeOpts(opts, legacyParams) {
  if (opts && (opts.nodeType === 1 || opts.nodeType === 9 || opts.nodeType === 11)) {
    return { root: opts, params: legacyParams || {}, reportFailure: true };
  }
  const o = opts || {};
  return {
    root: o.root || document,
    params: o.params || {},
    reportFailure: o.reportFailure !== false,
  };
}

// Parcourt la chaîne. Retourne { candidates, via, assertFailed } du premier
// maillon utile, ou null si aucun. Ne touche ni télémétrie ni erreurs métier.
function resolveChain(entry, root, params, ctx, wantAll) {
  let assertFailed = false;
  const chain = entry.chain || [];
  for (let via = 0; via < chain.length; via++) {
    const candidates = linkCandidates(chain[via], root, params, ctx);
    if (!candidates.length) continue;
    const kept = wantAll
      ? candidates.filter((c) => assertPasses(c, entry.assert))
      : (() => {
          const first = candidates.find((c) => assertPasses(c, entry.assert));
          return first ? [first] : [];
        })();
    if (!kept.length) {
      // Le maillon résout mais l'assert échoue : échec du maillon, on cascade.
      assertFailed = true;
      continue;
    }
    return { kept, via, assertFailed };
  }
  return null;
}

// --- API publique ----------------------------------------------------------

// resolveSelector(platform, key, opts?) → { el, via, key, platform }.
// Refuse les clés optional (SelectorConfigError) : utiliser tryResolveSelector.
export function resolveSelector(platform, key, opts = undefined, legacyParams = undefined) {
  const entry = registryEntry(platform, key);
  if (entry.optional === true) {
    throw new SelectorConfigError(
      `${platform}/${key} est optional (absence nominale) : utiliser tryResolveSelector, pas resolveSelector`
    );
  }
  const { root, params, reportFailure } = normalizeOpts(opts, legacyParams);
  const hit = resolveChain(entry, root, params, { platform, key }, false);
  if (hit) {
    if (hit.via > 0 || hit.assertFailed) {
      reportSelectorHealth(platform, key, hit.via, !hit.assertFailed);
    }
    return { el: hit.kept[0], via: hit.via, key, platform };
  }
  if (reportFailure) reportSelectorHealth(platform, key, -1, false);
  throw new SelectorResolutionError({
    platform,
    key,
    criticality: entry.criticality,
    triedLinks: (entry.chain || []).length,
  });
}

// tryResolveSelector(platform, key, opts?) → { el, via, key, platform } | null.
// Réservé aux clés optional (l'absence y est le cas nominal) : ne lève jamais
// sur une absence, n'émet JAMAIS de télémétrie resolved_via = -1. Émet en
// revanche normalement la télémétrie si via > 0 ou si un maillon a résolu avec
// assert en échec.
export function tryResolveSelector(platform, key, opts = undefined, legacyParams = undefined) {
  const entry = registryEntry(platform, key);
  if (entry.optional !== true) {
    throw new SelectorConfigError(
      `${platform}/${key} n'est pas optional : utiliser resolveSelector (échec = anomalie à signaler), pas tryResolveSelector`
    );
  }
  const { root, params } = normalizeOpts(opts, legacyParams);
  const hit = resolveChain(entry, root, params, { platform, key }, false);
  if (!hit) return null;
  if (hit.via > 0 || hit.assertFailed) {
    reportSelectorHealth(platform, key, hit.via, !hit.assertFailed);
  }
  return { el: hit.kept[0], via: hit.via, key, platform };
}

// resolveSelectorAll(platform, key, opts?) → { els, via, key, platform } —
// tous les candidats du premier maillon dont au moins un élément passe
// l'assert (les éléments en échec d'assert sont exclus). Mêmes règles
// optional/télémétrie que resolveSelector.
export function resolveSelectorAll(platform, key, opts = undefined, legacyParams = undefined) {
  const entry = registryEntry(platform, key);
  if (entry.optional === true) {
    throw new SelectorConfigError(
      `${platform}/${key} est optional (absence nominale) : utiliser tryResolveSelector, pas resolveSelectorAll`
    );
  }
  const { root, params, reportFailure } = normalizeOpts(opts, legacyParams);
  const hit = resolveChain(entry, root, params, { platform, key }, true);
  if (hit) {
    if (hit.via > 0 || hit.assertFailed) {
      reportSelectorHealth(platform, key, hit.via, !hit.assertFailed);
    }
    return { els: hit.kept, via: hit.via, key, platform };
  }
  if (reportFailure) reportSelectorHealth(platform, key, -1, false);
  throw new SelectorResolutionError({
    platform,
    key,
    criticality: entry.criticality,
    triedLinks: (entry.chain || []).length,
  });
}

// selectorFor(platform, key, linkIndex?, params?) → chaîne CSS du maillon.
// Accès au LITTÉRAL du registre pour les usages que resolveSelector ne couvre
// pas sans changer le comportement applicatif : closest(), sélecteurs
// COMPOSÉS (union avec des morceaux hors registre), attentes de disparition,
// cascades pilotées par le CONTENU (ex. scan regex des scripts inline pour le
// jeton CSRF). Le moteur reste dans le content script ; le littéral vit ici.
// Aucune télémétrie (pas de résolution). css/testid/template uniquement.
export function selectorFor(platform, key, linkIndex = 0, params = undefined) {
  const entry = registryEntry(platform, key);
  const link = (entry.chain || [])[linkIndex];
  if (!link) {
    throw new SelectorConfigError(`${platform}/${key} : pas de maillon d'index ${linkIndex}`);
  }
  const css = cssForLink(link, params || {}, { platform, key });
  if (!css) {
    throw new SelectorConfigError(
      `${platform}/${key} : le maillon ${linkIndex} (type ${link.type}) n'a pas de forme CSS — selectorFor ne s'applique qu'aux maillons css/testid/template`
    );
  }
  return css;
}
