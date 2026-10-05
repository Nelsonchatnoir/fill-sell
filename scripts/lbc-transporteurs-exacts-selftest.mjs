// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LES TRANSPORTEURS COCHÉS SONT EXACTEMENT CEUX CHOISIS (05/10)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : job 9940f84d (compte de Nico, extension 0.6.96) — demandé
// Mondial Relay + Colissimo, 350 g ; relu au dépôt : « Courrier suivi » coché
// EN PLUS (Shop2Shop bien décoché), et le dépôt est parti quand même.
// Leboncoin RECALCULE (et recoche) les transporteurs 0,3 à 1 s après
// « Valider » du poids ; l'ancienne boucle cliquait pendant ce temps-là, sur
// des cases lues une seule fois, sans relire un seul clic.
// Décision de Nico (05/10) : « Les transporteurs cochés doivent être
// exactement ceux choisis, au dépôt comme à la republication. »
//
// Ce contrôle exécute le code LIVRÉ (content-scripts/leboncoin.js : tout le
// bloc livraison, de `let bilanLivraisonLbc` à la fin de
// verifierTransporteursAvantDepotLbc, plus waitFor, plus les deux
// branchements de fillListingForm tels qu'ils sont écrits) dans une page
// Leboncoin FACTICE à horloge virtuelle — aucun navigateur, aucun réseau :
//   0. témoin : un pilote naïf (cases lues une fois, clics aussitôt) reproduit
//      9940f84d sur cette page — la simulation est fidèle au défaut ;
//   1. 9940f84d, recalcul à 300 / 500 / 800 / 1 200 / 2 500 ms : exactement
//      Mondial Relay + Colissimo au moment du dépôt ;
//   2. recalcul qui RE-REND la liste (nœuds remplacés) : exact ;
//   3. clics perdus : exact, aucun raté laissé en motif ;
//   4. recalcul APRÈS « Valider » des transporteurs : relu, refait une fois ;
//   5. recalcul juste avant le dépôt : la dernière relecture le corrige ;
//   6. Leboncoin qui garde « Courrier suivi » (ou laisse « Colissimo »
//      décoché) : RIEN NE PART — needsUser nommé, avant le clic final ;
//   7. choisi non proposé (filtré au poids) : simple avertissement ;
//   8. « Autres moyens de livraison » jamais touché ; sans demande, rien.
//
//   node scripts/lbc-transporteurs-exacts-selftest.mjs

import { readFileSync } from "node:fs";

// Le poste Windows extrait le dépôt en CRLF : on normalise, sinon les repères
// « \n} » ne matchent rien et le contrôle tombe sur un code pourtant juste.
const SRC = readFileSync(new URL("../chrome-extension/content-scripts/leboncoin.js", import.meta.url), "utf8").split("\r\n").join("\n");

let ko = 0;
const ok = (c, quoi, vu) => {
  if (!c) { ko++; console.log(`  ✗ ${quoi}${vu !== undefined ? ` — vu : ${JSON.stringify(vu)}` : ""}`); }
  else console.log(`  ✓ ${quoi}`);
};

// ── Le code LIVRÉ, relu à la source (jamais recopié ici) ────────────────────
const i0 = SRC.indexOf("let bilanLivraisonLbc = null;");
const i1 = SRC.indexOf('// Clic "réel"');
const WAITFOR = /async function waitFor\(fn, timeoutMs = 5000\) \{[\s\S]*?\n\}/.exec(SRC)?.[0];
const iPose = SRC.indexOf("  await poserLivraisonLbc(fields, warnings);");
const iGate = SRC.indexOf("  // Gate par job (2026-07-11)");
const iAvant = SRC.indexOf("  // ── LES TRANSPORTEURS, RELUS UNE DERNIÈRE FOIS (05/10)");
const iLive = SRC.indexOf("  // ── LA DESCRIPTION, RELUE JUSTE AVANT LE DÉPÔT (0.6.68)");
if (i0 < 0 || i1 < i0 || !WAITFOR || iPose < 0 || iGate < iPose || iAvant < 0 || iLive < iAvant) {
  console.log("✗ extraction impossible (bloc livraison, waitFor ou branchements de fillListingForm) — arrêt");
  process.exit(1);
}
const BLOC = SRC.slice(i0, i1);
const SEG_APRES_POSE = SRC.slice(iPose, iGate);  // pose + adresse + arrêt « contre le choix »
const SEG_AVANT_DEPOT = SRC.slice(iAvant, iLive); // dernière relecture + bouton final relu

function charger(env) {
  return new Function(
    "document", "sleep", "humanPause", "realClick", "Date", "console", "findButtonByExactText",
    `${WAITFOR}\n${BLOC}\n` +
    `async function apresPose(fields, warnings, addressResult, unfilledRequired, enumerated) {\n${SEG_APRES_POSE}\n  return null;\n}\n` +
    `async function avantDepot(warnings, unfilledRequired, enumerated, finalContinue) {\n${SEG_AVANT_DEPOT}\n  return { finalContinue };\n}\n` +
    "return { poserLivraisonLbc, verifierTransporteursAvantDepotLbc, arretTransporteursLbc, apresPose, avantDepot, bilan: () => bilanLivraisonLbc };",
  )(env.document, env.sleep, env.humanPause, () => { throw new Error("realClick inattendu : le clic natif suffit ici"); },
    env.Date, env.console, env.findButtonByExactText);
}

// ── Horloge virtuelle : sleep fait avancer le temps et joue les événements ──
function horloge() {
  let now = 0, seq = 0;
  const evts = [];
  return {
    get now() { return now; },
    plusTard(ms, fn) { evts.push({ t: now + ms, seq: seq++, fn }); },
    avancer(ms) {
      const cible = now + ms;
      for (;;) {
        evts.sort((a, b) => a.t - b.t || a.seq - b.seq);
        if (!evts.length || evts[0].t > cible) break;
        const e = evts.shift();
        now = Math.max(now, e.t);
        e.fn();
      }
      now = cible;
    },
  };
}
function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Mini-DOM : seulement ce que le bloc livraison touche ────────────────────
function compiler(sel) {
  const alternatives = sel.split(",").map((s) => s.trim()).map((s) => {
    const m = /^([a-z]*)((?:\[[^\]]+\])*)$/i.exec(s);
    if (!m) throw new Error(`sélecteur non géré par la page factice : ${s}`);
    const tag = m[1].toUpperCase();
    const filtres = [...m[2].matchAll(/\[([\w-]+)(?:([*^$]?=)"([^"]*)"(\s+i)?)?\]/g)]
      .map(([, n, op, v, i]) => ({ n, op, v, i: Boolean(i) }));
    return (el) => (!tag || el.tagName === tag) && filtres.every(({ n, op, v, i }) => {
      const a = el.getAttribute(n);
      if (a == null) return false;
      if (!op) return true;
      const A = i ? a.toLowerCase() : a, V = i ? v.toLowerCase() : v;
      return op === "=" ? A === V : op === "*=" ? A.includes(V) : op === "^=" ? A.startsWith(V) : A.endsWith(V);
    });
  });
  return (el) => alternatives.some((f) => f(el));
}
class El {
  constructor(tag, o = {}, enfants = []) {
    this.tagName = tag.toUpperCase();
    this._attrs = o.attrs ?? {};
    this._text = o.text ?? "";
    this.value = o.value;
    this._onClick = o.onClick ?? null;
    this.disabled = false;
    this.children = [];
    this.parentElement = null;
    for (const c of enfants) { c.parentElement = this; this.children.push(c); }
  }
  getAttribute(n) {
    const v = this._attrs[n];
    return v === undefined ? null : String(typeof v === "function" ? v() : v);
  }
  get innerText() {
    const t = typeof this._text === "function" ? this._text() : this._text;
    return [t, ...this.children.map((c) => c.innerText)].filter(Boolean).join("\n");
  }
  get textContent() { return this.innerText.replace(/\n/g, " "); }
  *descendants() { for (const c of this.children) { yield c; yield* c.descendants(); } }
  querySelectorAll(sel) { const f = compiler(sel); return [...this.descendants()].filter(f); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  click() { this._onClick?.(this); }
}

// ── La page « Remise du bien », telle que relevée le 24/09 ──────────────────
const TOUS = ["Courrier suivi", "Shop2Shop by Chronopost", "Mondial Relay", "Colissimo"];
const LIMITE = { "Courrier suivi": 2000, "Shop2Shop by Chronopost": 20000, "Mondial Relay": 30000, "Colissimo": 30000 };
const PALIERS = [100, 250, 500, 1000, 2000, 5000, 10000, 20000, 30000, 40000, 70000];
const FORMATS = { S: "petit", M: "moyen", L: "volumineux" };
const proposesPour = (g) => TOUS.filter((n) => LIMITE[n] >= g);

/** opts : recalculs (ms après « Valider » du poids), recalculsApresTransporteurs
 *  (ms après le 1er « Valider » des transporteurs), recalculRemplaceNoeuds,
 *  clicsPerdus { nom: n }, bloque { nom, etat } (Leboncoin impose cet état),
 *  latenceClic (ms avant que React applique un clic). */
function creerPage(opts = {}) {
  const h = horloge();
  const journal = [];
  const st = {
    gen: 0, format: "S", palier: 250, dialogue: null,
    proposes: proposesPour(250), coches: new Set(proposesPour(250)),
    clicsPerdus: { ...(opts.clicsPerdus ?? {}) }, cochesAuDepot: null,
  };
  const apresT = [...(opts.recalculsApresTransporteurs ?? [])];
  const imposer = (ens) => {
    const b = page.bloque;
    if (b && st.proposes.includes(b.nom)) { if (b.etat) ens.add(b.nom); else ens.delete(b.nom); }
    return ens;
  };
  const recalculer = () => {
    const avant = st.proposes.join("|");
    st.proposes = proposesPour(st.palier);
    st.coches = imposer(new Set(st.proposes));
    if (st.dialogue?.type === "transporteurs") {
      st.dialogue.brouillon = imposer(new Set(st.proposes));
      if (opts.recalculRemplaceNoeuds || avant !== st.proposes.join("|")) st.gen++;
    }
    journal.push(`recalcul@${h.now}`);
  };
  const ouvrir = (type) => h.plusTard(150, () => {
    if (st.dialogue) return;
    st.dialogue = type === "format" ? { type, choix: st.format } : { type, brouillon: new Set(st.coches) };
    st.gen++;
  });
  const fermer = () => { st.dialogue = null; st.gen++; };
  const basculer = (nom) => {
    const d = st.dialogue;
    if (d?.type !== "transporteurs") return;
    if ((st.clicsPerdus[nom] ?? 0) > 0) { st.clicsPerdus[nom]--; journal.push(`clic-perdu:${nom}`); return; }
    if (page.bloque?.nom === nom) { journal.push(`refus:${nom}`); return; }
    h.plusTard(opts.latenceClic ?? 40, () => {
      if (st.dialogue !== d) return;
      if (d.brouillon.has(nom)) d.brouillon.delete(nom); else d.brouillon.add(nom);
    });
  };
  function rendre() {
    const g = st.gen;
    const actif = (e) => e.gen === st.gen;
    const mk = (tag, o, enfants) => { const e = new El(tag, o, enfants); e.gen = g; return e; };
    const enfants = [
      mk("section", {}, [
        mk("div", {}, [
          mk("button", { attrs: { role: "checkbox", "aria-label": "Désactiver la livraison", "aria-checked": "true" } }),
          mk("span", { text: "Activer la livraison" }),
        ]),
        mk("div", {}, [
          mk("span", { text: () => `Colis ${FORMATS[st.format]} — jusqu’à ${st.palier} g estimés` }),
          mk("button", { attrs: { "aria-label": "Modifier" }, onClick: (e) => actif(e) && ouvrir("format") }),
        ]),
        mk("div", {}, [
          mk("span", { text: "Vos moyens de livraison" }),
          mk("span", { text: TOUS.join(" · ") }),
          mk("button", { attrs: { "aria-label": "Modifier les transporteurs" }, onClick: (e) => actif(e) && ouvrir("transporteurs") }),
        ]),
      ]),
      mk("button", { text: "Continuer", onClick: (e) => { if (!actif(e)) return; st.cochesAuDepot = [...st.coches]; journal.push("DEPOT"); } }),
    ];
    const d = st.dialogue;
    const fermerBtn = mk("button", { attrs: { "aria-label": "Fermer" }, onClick: (e) => actif(e) && fermer() });
    if (d?.type === "format") {
      enfants.push(mk("div", { attrs: { role: "dialog" } }, [
        mk("h2", { text: "Choisissez un format" }),
        ...Object.keys(FORMATS).map((v) => mk("button", {
          attrs: { role: "radio", "aria-checked": () => String(st.dialogue?.choix === v) }, value: v, text: FORMATS[v],
          onClick: (e) => { if (actif(e)) st.dialogue.choix = v; },
        })),
        mk("button", { text: "Continuer", onClick: (e) => {
          if (!actif(e)) return;
          st.dialogue = { type: "poids", format: st.dialogue.choix, choix: st.palier }; st.gen++;
        } }),
        fermerBtn,
      ]));
    } else if (d?.type === "poids") {
      enfants.push(mk("div", { attrs: { role: "dialog" } }, [
        mk("h2", { text: "Choisissez un poids" }),
        ...PALIERS.map((p) => mk("button", {
          attrs: { role: "radio", "aria-checked": () => String(st.dialogue?.choix === p) }, value: String(p), text: `${p} g`,
          onClick: (e) => { if (actif(e)) st.dialogue.choix = p; },
        })),
        mk("button", { text: "Valider", onClick: (e) => {
          if (!actif(e)) return;
          st.format = st.dialogue.format; st.palier = st.dialogue.choix; st.dialogue = null; st.gen++;
          journal.push(`poids-valide@${h.now}`);
          for (const ms of opts.recalculs ?? [500]) h.plusTard(ms, recalculer);
        } }),
        fermerBtn,
      ]));
    } else if (d?.type === "transporteurs") {
      enfants.push(mk("div", { attrs: { role: "dialog" } }, [
        mk("h2", { text: "Vos moyens de livraison" }),
        ...st.proposes.map((nom) => mk("div", {}, [
          mk("button", { attrs: { role: "checkbox", "aria-checked": () => String(Boolean(st.dialogue?.brouillon?.has(nom))) },
            onClick: (e) => actif(e) && basculer(nom) }),
          mk("div", { text: `${nom}\nJusqu’à ${LIMITE[nom] / 1000} kg` }),
        ])),
        mk("div", {}, [
          mk("button", { attrs: { role: "checkbox", "aria-checked": "false" }, onClick: () => journal.push("AUTRES-TOUCHE") }),
          mk("span", { text: "Autres moyens de livraison" }),
        ]),
        mk("button", { text: "Valider", onClick: (e) => {
          if (!actif(e)) return;
          st.coches = imposer(new Set(st.dialogue.brouillon));
          journal.push(`valider-transporteurs:[${[...st.coches].join(",")}]@${h.now}`);
          st.dialogue = null; st.gen++;
          for (const ms of apresT.splice(0)) h.plusTard(ms, recalculer);
        } }),
        fermerBtn,
      ]));
    }
    return mk("body", {}, enfants);
  }
  let arbre = null, genArbre = -1;
  const racine = () => { if (genArbre !== st.gen) { arbre = rendre(); genArbre = st.gen; } return arbre; };
  const page = {
    h, st, journal, recalculer, bloque: opts.bloque ?? null,
    document: { querySelectorAll: (s) => racine().querySelectorAll(s), querySelector: (s) => racine().querySelector(s) },
  };
  return page;
}

function environnement(opts, graine = 1) {
  const page = creerPage(opts);
  const rand = mulberry32(graine);
  const sleep = (ms) => { page.h.avancer(Math.max(0, Number(ms) || 0)); return Promise.resolve(); };
  const humanPause = (min = 300, max = 900) => sleep(Math.round(min + rand() * (max - min)));
  const BASE = Date.UTC(2026, 9, 5, 8, 0, 0);
  class FauxDate extends Date {
    constructor(...a) { super(...(a.length ? a : [BASE + page.h.now])); }
    static now() { return BASE + page.h.now; }
  }
  const logs = [];
  const cons = { log: () => {}, warn: (...a) => logs.push(a.join(" ")), error: (...a) => logs.push(a.join(" ")) };
  const findButtonByExactText = (t) => page.document.querySelectorAll("button").find((b) => b.textContent.trim() === t) ?? null;
  const M = charger({ document: page.document, sleep, humanPause, Date: FauxDate, console: cons, findButtonByExactText });
  return { page, M, logs, findButtonByExactText };
}

/** Le chemin réel, de la pose au clic final : branchement après la pose
 *  (fillListingForm), puis dernière relecture, puis le « Continuer » final
 *  — cliqué SEULEMENT si les deux branchements laissent passer. */
async function parcours(opts, fields, { graine = 1, avantDernier = null } = {}) {
  const env = environnement(opts, graine);
  const warnings = [];
  const r1 = await env.M.apresPose(fields, warnings, { ok: true }, [], []);
  if (r1) return { env, warnings, resultat: r1, depose: false };
  avantDernier?.(env.page);
  const r2 = await env.M.avantDepot(warnings, [], [], env.findButtonByExactText("Continuer"));
  if (r2?.needsUser) return { env, warnings, resultat: r2, depose: false };
  r2.finalContinue.click();
  return { env, warnings, resultat: { success: true, livraisonLbc: env.M.bilan() }, depose: env.page.journal.includes("DEPOT") };
}

const JOB_9940 = { lbcTransporteurs: ["Mondial Relay", "Colissimo"], lbcPoidsGrammes: 350 };
const memes = (a, b) => [...(a ?? [])].sort().join("|") === [...(b ?? [])].sort().join("|");
const secondes = (ms) => `${(ms / 1000).toFixed(1)} s`;

// ── 0. Témoin : la page factice reproduit bien 9940f84d ─────────────────────
// Pilote NAÏF, écrit ici (pas le code livré) : la séquence de l'ancienne
// boucle — « Valider » du poids, 0,5 s, fenêtre ouverte, cases lues une fois,
// clic aussitôt. Si ce témoin ne reproduit plus le défaut, la page factice a
// cessé d'être fidèle et le reste du contrôle ne prouve plus rien.
console.log("0. Témoin : l'ancienne séquence reproduit 9940f84d sur la page factice");
{
  const page = creerPage({ recalculs: [800] });
  const d = page.document;
  const av = (ms) => page.h.avancer(ms);
  const attendre = (f) => { for (let i = 0; i < 60; i++) { const v = f(); if (v) return v; av(120); } return null; };
  const dlg = (re) => d.querySelectorAll('[role="dialog"]').find((x) => re.test(x.innerText)) ?? null;
  d.querySelectorAll('button[aria-label="Modifier"]')[0].click();
  attendre(() => dlg(/choisissez un format/i)).querySelectorAll("button").find((b) => b.innerText === "Continuer").click();
  const p = attendre(() => dlg(/choisissez un poids/i));
  p.querySelectorAll('[role="radio"]').find((r) => r.value === "500").click(); av(400);
  p.querySelectorAll("button").find((b) => b.innerText === "Valider").click();
  av(500); // humanPause(500, 1000) de l'ancien code, borne basse
  d.querySelector('button[aria-label="Modifier les transporteurs"]').click();
  const t = attendre(() => dlg(/vos moyens de livraison/i));
  const lignes = t.querySelectorAll('[role="checkbox"]')
    .map((b) => ({ b, nom: b.parentElement.innerText.split("\n")[0] })).filter((l) => TOUS.includes(l.nom));
  for (const l of lignes) {
    if ((l.b.getAttribute("aria-checked") === "true") !== JOB_9940.lbcTransporteurs.includes(l.nom)) { l.b.click(); av(400); }
  }
  t.querySelectorAll("button").find((b) => b.innerText === "Valider").click();
  av(2000);
  const coches = [...page.st.coches];
  ok(memes(coches, ["Courrier suivi", "Mondial Relay", "Colissimo"]),
    "recalcul 800 ms après le poids : « Courrier suivi » recoché, Shop2Shop décoché — exactement 9940f84d", coches);
}

// ── 1. 9940f84d avec le code livré ──────────────────────────────────────────
console.log("1. Job 9940f84d (MR + Colissimo, 350 g), recalcul tardif à chaque délai mesuré");
{
  let tous = true, pire = 0;
  const vus = [];
  for (const recalcul of [300, 500, 800, 1200, 2500]) {
    for (const graine of [1, 2, 3]) {
      const r = await parcours({ recalculs: [recalcul] }, JOB_9940, { graine });
      const bon = r.depose && memes(r.env.page.st.cochesAuDepot, JOB_9940.lbcTransporteurs)
        && r.resultat.livraisonLbc?.posee === true && r.resultat.livraisonLbc?.ecart === null;
      if (!bon) { tous = false; vus.push({ recalcul, graine, auDepot: r.env.page.st.cochesAuDepot, bilan: r.resultat.livraisonLbc ?? r.resultat.error }); }
      pire = Math.max(pire, r.env.page.h.now);
    }
  }
  ok(tous, "15 dépôts (5 délais × 3 tirages) : exactement Mondial Relay + Colissimo au clic final, bilan posee:true, aucun écart", vus);
  ok(pire < 60_000, `durée la plus longue jusqu'au clic final : ${secondes(pire)} (< 60 s, le remplissage entier en a 300)`);
  const r = await parcours({ recalculs: [500] }, JOB_9940);
  const bilan = r.resultat.livraisonLbc;
  ok(memes(bilan?.demandes, JOB_9940.lbcTransporteurs) && memes(bilan?.poses, JOB_9940.lbcTransporteurs)
    && memes(bilan?.proposes, TOUS) && bilan?.motif === null && Array.isArray(bilan?.non_poses) && !bilan.non_poses.length,
  "bilan écrit comme avant : demandés, relus (poses), proposés, motif null", bilan);
  ok(bilan?.verifie_avant_depot?.relu === true && memes(bilan.verifie_avant_depot.coches, JOB_9940.lbcTransporteurs),
    "relu une dernière fois juste avant le dépôt", bilan?.verifie_avant_depot);
  const iPoids = r.env.page.journal.findIndex((e) => e.startsWith("poids-valide@"));
  const tPoids = Number(r.env.page.journal[iPoids]?.split("@")[1]);
  const tValider = Number(r.env.page.journal.find((e) => e.startsWith("valider-transporteurs"))?.split("@")[1]);
  ok(tValider - tPoids >= 1500, `aucune validation des transporteurs avant le calme (${secondes(tValider - tPoids)} après le poids)`);
  ok(r.env.page.st.format === "S" && r.env.page.st.palier === 500, "le poids 350 g passe toujours par le palier 500 g, format affiché gardé");
}

// ── 2. Recalcul qui re-rend la liste ────────────────────────────────────────
console.log("2. Le recalcul re-rend la fenêtre (nœuds remplacés) pendant les clics");
{
  const r = await parcours({ recalculs: [2500], recalculRemplaceNoeuds: true }, JOB_9940);
  ok(r.depose && memes(r.env.page.st.cochesAuDepot, JOB_9940.lbcTransporteurs),
    "chaque case relue à neuf par son nom : exact au dépôt", r.env.page.st.cochesAuDepot);
}

// ── 3. Clics perdus ─────────────────────────────────────────────────────────
console.log("3. Clics avalés par Leboncoin");
{
  const r = await parcours({ recalculs: [500], clicsPerdus: { "Courrier suivi": 2, "Shop2Shop by Chronopost": 1 } }, JOB_9940);
  ok(r.env.page.journal.filter((e) => e.startsWith("clic-perdu")).length === 3, "trois clics perdus ont bien eu lieu");
  ok(r.depose && memes(r.env.page.st.cochesAuDepot, JOB_9940.lbcTransporteurs), "chaque clic vérifié et rejoué : exact au dépôt", r.env.page.st.cochesAuDepot);
  ok(r.resultat.livraisonLbc?.posee === true && r.resultat.livraisonLbc?.motif === null, "aucun raté laissé en motif (posee:true)", r.resultat.livraisonLbc);
}

// ── 4. Recalcul après « Valider » des transporteurs ─────────────────────────
console.log("4. Recalcul APRÈS « Valider » des transporteurs");
{
  const r = await parcours({ recalculs: [500], recalculsApresTransporteurs: [200] }, JOB_9940);
  ok(r.warnings.some((w) => /écart relu après validation \(coché\(s\) en trop : Courrier suivi, Shop2Shop by Chronopost\) — réglage des transporteurs refait une fois/.test(w)),
    "l'écart est relu après validation, l'étape refaite une fois", r.warnings);
  ok(r.env.page.journal.filter((e) => e.startsWith("valider-transporteurs")).length === 2, "deux validations, pas plus");
  ok(r.depose && memes(r.env.page.st.cochesAuDepot, JOB_9940.lbcTransporteurs) && r.resultat.livraisonLbc?.posee === true,
    "exact au dépôt, posee:true", r.env.page.st.cochesAuDepot);
}

// ── 5. Recalcul juste avant le dépôt ────────────────────────────────────────
console.log("5. Recalcul très tardif, entre la pose et le « Continuer » final");
{
  const r = await parcours({ recalculs: [500] }, JOB_9940, { avantDernier: (page) => page.recalculer() });
  ok(r.warnings.some((w) => /écart relu juste avant le dépôt/.test(w)), "la dernière relecture voit l'écart", r.warnings);
  ok(r.depose && memes(r.env.page.st.cochesAuDepot, JOB_9940.lbcTransporteurs), "corrigé, puis déposé exact", r.env.page.st.cochesAuDepot);
}

// ── 6. Écart persistant : rien ne part ──────────────────────────────────────
console.log("6. Leboncoin impose un transporteur : RIEN NE PART");
{
  const r = await parcours({ recalculs: [500], bloque: { nom: "Courrier suivi", etat: true } }, JOB_9940);
  ok(!r.depose && !r.env.page.journal.includes("DEPOT"), "« Courrier suivi » gardé coché : le « Continuer » final n'est jamais cliqué");
  ok(r.resultat.success === false && r.resultat.needsUser === true && !r.resultat.attenteUtilisateur,
    "needsUser (reprise bornée du background, pas d'attente sans fin)", r.resultat);
  ok(String(r.resultat.error).startsWith("Leboncoin a gardé « Courrier suivi » coché alors que tu as choisi Mondial Relay et Colissimo. Rien n'a été déposé. — Observabilité: "),
    "message nommé, en français, lecture brute en annexe", r.resultat.error);
  const b = r.resultat.livraisonLbc;
  ok(b?.posee === false && b?.ecart?.bloquant === true && memes(b.ecart.en_trop, ["Courrier suivi"]) && memes(b.poses, ["Courrier suivi", "Mondial Relay", "Colissimo"]),
    "bilan joint au résultat : posee:false, écart nommé, cases relues", b);
  ok(r.env.page.journal.filter((e) => e.startsWith("valider-transporteurs")).length === 2, "pose tentée puis refaite une fois — pas une boucle");
  ok(r.env.page.h.now < 90_000, `arrêt en ${secondes(r.env.page.h.now)} (borné, < 90 s)`);

  const m = await parcours({ recalculs: [500], bloque: { nom: "Colissimo", etat: false } }, JOB_9940);
  ok(!m.depose && m.resultat.needsUser === true
    && String(m.resultat.error).startsWith("Leboncoin a laissé « Colissimo » décoché alors que tu as choisi Mondial Relay et Colissimo. Rien n'a été déposé."),
  "un choisi PROPOSÉ mais laissé décoché arrête aussi, nommé", m.resultat.error);

  const tard = await parcours({ recalculs: [500] }, JOB_9940, {
    avantDernier: (page) => { page.bloque = { nom: "Courrier suivi", etat: true }; page.recalculer(); },
  });
  ok(!tard.depose && tard.resultat.needsUser === true && /^Leboncoin a gardé « Courrier suivi » coché/.test(String(tard.resultat.error)),
    "écart apparu APRÈS la pose et persistant : arrêté à la dernière relecture, rien ne part", tard.resultat.error);
  ok(/dépôt arrêté/.test(String(tard.resultat.livraisonLbc?.motif)) && tard.resultat.livraisonLbc?.posee === false,
    "… et le bilan le dit (motif, posee:false)", tard.resultat.livraisonLbc);
}

// ── 7. Choisi non proposé : simple avertissement ────────────────────────────
console.log("7. Un transporteur choisi que Leboncoin ne propose pas (5 kg)");
{
  const r = await parcours({ recalculs: [500] }, { lbcTransporteurs: ["Courrier suivi", "Mondial Relay"], lbcPoidsGrammes: 5000 });
  ok(r.depose && memes(r.env.page.st.cochesAuDepot, ["Mondial Relay"]), "déposé avec Mondial Relay seul (choisis ∩ proposés)", r.env.page.st.cochesAuDepot);
  const b = r.resultat.livraisonLbc;
  ok(b?.non_poses?.some((n) => n.nom === "Courrier suivi" && /non proposé/.test(n.motif)) && b?.ecart === null,
    "Courrier suivi noté « non proposé », aucun écart bloquant", b);
  ok(r.warnings.some((w) => /Courrier suivi \(non proposé par Leboncoin/.test(w)), "et dit en avertissement, comme avant");

  const aucun = await parcours({ recalculs: [500] }, { lbcTransporteurs: ["Courrier suivi"], lbcPoidsGrammes: 5000 });
  ok(aucun.depose && memes(aucun.env.page.st.cochesAuDepot, ["Shop2Shop by Chronopost", "Mondial Relay", "Colissimo"]),
    "aucun choisi proposé : réglage de Leboncoin conservé, jamais « aucun transporteur », dépôt non bloqué", aucun.env.page.st.cochesAuDepot);
  ok(aucun.warnings.some((w) => /aucun des transporteurs choisis n'est proposé/.test(w)), "… et dit");
}

// ── 8. Ce qu'on ne touche jamais ────────────────────────────────────────────
console.log("8. Ce qu'on ne touche jamais");
{
  const toutes = [];
  for (const o of [{ recalculs: [800] }, { recalculs: [2500], recalculRemplaceNoeuds: true }, { recalculs: [500], bloque: { nom: "Courrier suivi", etat: true } }]) {
    toutes.push((await parcours(o, JOB_9940)).env.page.journal);
  }
  ok(!toutes.flat().includes("AUTRES-TOUCHE"), "« Autres moyens de livraison » (frais avancés par le vendeur) jamais cliqué");
  const rien = await parcours({ recalculs: [500] }, {});
  ok(rien.depose && rien.env.M.bilan() === null && !rien.env.page.journal.some((e) => /poids-valide|valider-transporteurs/.test(e)),
    "sans transporteurs ni poids demandés : rien n'est touché, aucun bilan, dépôt normal");
}

// ── 9. Le branchement, à la source ──────────────────────────────────────────
console.log("9. Branchement dans fillListingForm (dépôt = republication)");
{
  ok((SRC.match(/await poserLivraisonLbc\(fields, warnings\);/g) ?? []).length === 1,
    "un seul appel de poserLivraisonLbc : dépôt et republication passent par le même chemin");
  const iArret = SRC.indexOf("const arret = arretTransporteursLbc();");
  ok(iArret > iPose && iArret < SRC.indexOf("const dryRun = DRY_RUN"), "l'arrêt après la pose tombe avant tout dépôt (et avant le dry-run)");
  const iVerif = SRC.indexOf("await verifierTransporteursAvantDepotLbc(warnings)");
  const iClic = SRC.indexOf("realClick(finalContinue);");
  ok(iVerif > SRC.indexOf("Garde-fou pré-submit") && iVerif < SRC.indexOf("LA DESCRIPTION, RELUE JUSTE AVANT LE DÉPÔT")
    && iVerif < SRC.indexOf("const depuisClicFinal = Date.now();") && iVerif < iClic,
    "la dernière relecture est après la garde du prix, AVANT l'horodatage du clic final, hors du bloc description (qui ne rend jamais d'échec)");
  ok(/finalContinue = findButtonByExactText\("Continuer"\) \?\? finalContinue;/.test(SEG_AVANT_DEPOT),
    "le bouton final est relu après la fenêtre rouverte (un nœud détaché avalerait le clic)");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout passe — les transporteurs cochés sont exactement ceux choisis, ou rien ne part");
process.exit(ko ? 1 : 0);
