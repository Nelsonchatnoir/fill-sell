// ═══════════════════════════════════════════════════════════════════════════
// MINI-DOM POUR LES SELFTESTS DES CONTENT SCRIPTS (16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Juste ce qu'il faut pour faire tourner, en Node, des fonctions EXTRAITES
// d'un content script (jamais recopiées) sur une page fabriquée : éléments,
// attributs, texte, parent, et des sélecteurs simples — étiquette,
// [attr], [attr="v"], [attr$="v"], [attr^="v"], .classe, listes « a, b ».
// Aucun rendu, aucune mise en page : une case « visible » est une case présente.

export class El {
  constructor(tag, attrs = {}, enfants = []) {
    this.tagName = String(tag).toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentElement = null;
    this._texte = "";
    this.journal = null;
    for (const e of enfants) this.ajouter(e);
  }
  ajouter(e) {
    if (typeof e === "string") { this._texte += e; return this; }
    e.parentElement = this;
    this.children.push(e);
    return this;
  }
  retirer(e) { this.children = this.children.filter((x) => x !== e); e.parentElement = null; }
  get textContent() { return this._texte + this.children.map((c) => c.textContent).join(""); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? String(this.attrs[k]) : null; }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); }
  get id() { return this.attrs.id ?? ""; }
  get className() { return this.attrs.class ?? ""; }
  get value() { return this.attrs.value ?? ""; }
  contains(e) { for (let n = e; n; n = n.parentElement) if (n === this) return true; return false; }
  *descendants() { for (const c of this.children) { yield c; yield* c.descendants(); } }
  querySelectorAll(sel) { const t = compiler(sel); return [...this.descendants()].filter((e) => t(e)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  closest(sel) { const t = compiler(sel); for (let n = this; n; n = n.parentElement) if (n.tagName && t(n)) return n; return null; }
  matches(sel) { return compiler(sel)(this); }
  dispatchEvent(ev) { this.onclick?.(ev); return true; }
  click() { this.onclick?.({ type: "click" }); }
}

export class Doc extends El {
  constructor(enfants = []) { super("#document", {}, enfants); }
  getElementById(id) { return this.querySelector(`[id="${id}"]`); }
}

/** Un sélecteur simple → un prédicat. */
export function compiler(selecteur) {
  const alternatives = String(selecteur).split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^([a-zA-Z][\w-]*)?((?:\[[^\]]+\]|\.[\w-]+)*)$/);
    if (!m) throw new Error(`mini-dom : sélecteur non pris en charge « ${s} »`);
    const tag = m[1] ? m[1].toUpperCase() : null;
    const conds = [...(m[2] ?? "").matchAll(/\[([\w-]+)(?:([$^*]?=)"([^"]*)")?\]|\.([\w-]+)/g)].map((c) => {
      if (c[4]) return (e) => String(e.getAttribute("class") ?? "").split(/\s+/).includes(c[4]);
      const [, k, op, v] = c;
      if (!op) return (e) => e.hasAttribute(k);
      return (e) => {
        const a = e.getAttribute(k);
        if (a == null) return false;
        if (op === "=") return a === v;
        if (op === "$=") return a.endsWith(v);
        if (op === "^=") return a.startsWith(v);
        return a.includes(v);
      };
    });
    return (e) => (!tag || e.tagName === tag) && conds.every((f) => f(e));
  });
  return (e) => alternatives.some((f) => f(e));
}

/** Raccourci : h("li", {}, h("button", {}, h("span", {}, "Mode"))). */
export const h = (tag, attrs = {}, ...enfants) => new El(tag, attrs, enfants.flat());
