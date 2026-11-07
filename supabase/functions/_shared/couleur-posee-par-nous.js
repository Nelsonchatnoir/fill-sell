// ═══════════════════════════════════════════════════════════════════════════
// VINTED : QUI A POSÉ LA COULEUR EN LIGNE ? (07/11/2026, décision de Nico — Marta MELE)
// ═══════════════════════════════════════════════════════════════════════════
// « Établis qui a posé la couleur en ligne. Si c'est NOUS (remise en ligne FillSell), on remet la couleur de sa
// fiche. Si c'est la personne elle-même sur Vinted, on garde la sienne. » Une republication Vinted recrée l'annonce
// depuis sa CAPTURE (la couleur en ligne). Deux dépôts de Marta avaient posé une autre couleur que la leur :
//   · b9460406 « Vestito rosa » : annonce d'origine 24 (« Rosa », ROSE), recréée le 25/10 par la republication
//     5b179870 (0.6.141) en 5 (« Rosa », PINK) — même libellé italien, deux cases : le chemin par libellé a pris
//     la première ;
//   · f1c4a0e0 « Maglietta J & Y » : fiche « Blu marino » (27), publiée le 25/10 (98c8d46d) en 9 « Bleu » — la table
//     de l'app ne connaît pas « blu marino » (src/utils/vintedColors.js : « Blu » → Bleu).
// LA RÈGLE (tous les comptes) — la capture de l'annonce en ligne garde sa couleur, SAUF quand tout ceci est prouvé :
//   1. l'annonce en ligne a été DÉPOSÉE PAR FILLSELL (job publish/republish publié sous ce numéro, jamais une ligne
//      « sync-dressing » de la synchro, qui n'est que le relevé d'une annonce née sur Vinted) ;
//   2. la couleur de ce dépôt ne venait pas de la personne (réponse à une question, couleur saisie à la republication) ;
//   3. ce que ce dépôt DEVAIT remettre (la référence) est connu :
//        · republication : la couleur de l'annonce d'avant, relue par sa capture (identifiants) ;
//        · publication : la couleur de la fiche au moment du dépôt (copie du job), libellé EXACT de la palette
//          Vinted (français relevé le 25/09, italien relevé le 07/11) — un libellé libre ou inconnu : aucune référence ;
//   4. la couleur en ligne DIFFÈRE de la référence, et c'est NOTRE dépôt qui l'a posée : elle est celle qu'il a
//      envoyée (identifiants), ou elle porte le même libellé que ce qu'il a envoyé (« Rosa » = 5 et 24) ;
//   5. AUCUN changement relevé depuis notre dépôt : toute lecture de cette annonce faite après le dépôt (capture
//      antérieure, couleur relue par la synchro sur la fiche) montre la couleur d'aujourd'hui.
// Alors la référence part (identifiants ET libellés de la capture) ; sinon la couleur en ligne, comme aujourd'hui.
// ⛔ Le doute garde la couleur en ligne (jamais l'inverse) : référence inconnue ou ambiguë, langue inconnue, lecture
//    contradictoire, dépôt introuvable → rien ne change.
// Pur : lu par get-pending-jobs (Deno) et par scripts/couleur-posee-par-nous-selftest.mjs (Node).

/** GET /api/v2/colors — français : vinted.fr 25/09/2026 (= _shared/vinted-ids-publication.ts) ; italien : vinted.it
 *  07/11/2026 (catalogue public, 29 couleurs, mêmes identifiants). id → libellé affiché. */
export const COULEURS_VINTED_PAR_LANGUE = Object.freeze({
  fr: Object.freeze({
    1: "Noir", 3: "Gris", 12: "Blanc", 20: "Crème", 4: "Beige", 21: "Abricot", 11: "Orange", 22: "Corail", 7: "Rouge",
    23: "Bordeaux", 5: "Fuchsia", 24: "Rose", 6: "Violet", 25: "Lila", 26: "Bleu clair", 9: "Bleu", 27: "Marine",
    17: "Turquoise", 30: "Menthe", 10: "Vert", 28: "Vert foncé", 16: "Kaki", 2: "Marron", 29: "Moutarde", 8: "Jaune",
    13: "Argenté", 14: "Doré", 15: "Multicolore", 32: "Transparence",
  }),
  it: Object.freeze({
    1: "Nero", 3: "Grigio", 12: "Bianco", 20: "Panna", 4: "Beige", 21: "Albicocca", 11: "Arancione", 22: "Corallo",
    7: "Rosso", 23: "Borgogna", 5: "Rosa", 24: "Rosa", 6: "Viola", 25: "Lilla", 26: "Azzurro", 9: "Blu",
    27: "Blu marino", 17: "Turchese", 30: "Menta", 10: "Verde", 28: "Verde scuro", 16: "Cachi", 2: "Marrone",
    29: "Senape", 8: "Giallo", 13: "Argento", 14: "Oro", 15: "Multi", 32: "Chiaro",
  }),
});

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : null; };

/** Identifiants de couleur (entiers > 0, uniques, deux au plus, dans l'ordre). */
export function idsCouleur(liste) {
  const out = [];
  for (const v of Array.isArray(liste) ? liste : []) {
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 2);
}

const memes = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** « Nero, Bianco » / « Noir et Blanc » / ["Rosa"] → libellés (deux au plus). */
export function libellesCouleur(v) {
  const brut = Array.isArray(v) ? v : (v == null ? [] : String(v).split(/\s*(?:,|\/|\+|&|\s+et\s+|\s+and\s+)\s*/i));
  return brut.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 2);
}

/** Libellé EXACT d'une palette relevée → identifiants possibles (« Rosa » → [5, 24]). Inconnu → []. */
export function idsDuLibelle(libelle) {
  const k = norm(libelle);
  if (!k) return [];
  const out = [];
  for (const table of Object.values(COULEURS_VINTED_PAR_LANGUE)) {
    for (const [id, t] of Object.entries(table)) if (norm(t) === k && !out.includes(Number(id))) out.push(Number(id));
  }
  return out.sort((a, b) => a - b);
}

/** La langue des libellés d'une capture : celle dont la table nomme chaque identifiant comme la capture. */
export function langueDesCouleurs(ids, libelles) {
  if (!ids.length || ids.length !== libelles.length) return null;
  for (const [langue, table] of Object.entries(COULEURS_VINTED_PAR_LANGUE)) {
    if (ids.every((id, i) => table[id] != null && norm(table[id]) === norm(libelles[i]))) return langue;
  }
  return null;
}

/** La couleur en ligne d'une capture : identifiants (natif) et libellés (libellés de la capture, sinon natif). */
export function couleurDeLaCapture(capture) {
  const natif = (capture?.natif && typeof capture.natif === "object") ? capture.natif
    : ((capture?.payload?.natif && typeof capture.payload.natif === "object") ? capture.payload.natif : {});
  const ids = idsCouleur([natif.color1_id, natif.color2_id]);
  const lib = libellesCouleur(capture?.libelles?.couleurs);
  const libNatif = libellesCouleur([natif.color1, natif.color2].filter((x) => x != null && String(x).trim()));
  return { ids, libelles: lib.length === ids.length ? lib : (libNatif.length === ids.length ? libNatif : lib) };
}

const pfDe = (j) => (j?.platform_fields && typeof j.platform_fields === "object") ? j.platform_fields : {};
const texte = (v) => String(v ?? "").trim();

/** La couleur de ce dépôt venait-elle de la personne (réponse, saisie) ? */
function couleurDeLaPersonne(pf) {
  const va = (pf.vintedAspects && typeof pf.vintedAspects === "object") ? pf.vintedAspects : {};
  const uf = (pf.republish_user_fields && typeof pf.republish_user_fields === "object") ? pf.republish_user_fields : {};
  return Boolean(texte(va.color) || texte(uf.couleur) || pf.republish_couleur_fournie);
}

/**
 * Ce que le dépôt a ENVOYÉ et ce qu'il devait remettre (référence).
 * @returns {{ envoyes: number[], libellesEnvoyes: string[], reference: number[] | null, libellesReference: string[], source: string }}
 */
function dossierDuDepot(depot, depotCapture) {
  const pf = pfDe(depot);
  if (String(depot?.action) === "republish") {
    const snap = (pf.republish_snapshot && typeof pf.republish_snapshot === "object") ? pf.republish_snapshot : {};
    let ids = idsCouleur([snap.color1_id, snap.color2_id]);
    let lib = libellesCouleur(snap.couleurs);
    let source = "copie du dépôt (republish_snapshot)";
    if (!ids.length && depotCapture) {
      const c = couleurDeLaCapture(depotCapture);
      ids = c.ids; lib = c.libelles; source = "capture du dépôt";
    }
    return { envoyes: ids, libellesEnvoyes: lib, reference: ids.length ? ids : null, libellesReference: lib, source };
  }
  // Publication : envoyé = identifiants servis (vinted_ids), sinon libellés français de la palette ; référence = la
  // couleur de la FICHE copiée sur le job à sa création (pf.couleur, ou le libellé d'origine du filet).
  const vids = (pf.vinted_ids && typeof pf.vinted_ids === "object") ? pf.vinted_ids : {};
  const libEnv = libellesCouleur(pf.colors);
  let envoyes = idsCouleur(vids.color_ids);
  if (!envoyes.length) {
    envoyes = idsCouleur(libEnv.map((l) => {
      const e = Object.entries(COULEURS_VINTED_PAR_LANGUE.fr).find(([, t]) => norm(t) === norm(l));
      return e ? Number(e[0]) : null;
    }));
  }
  const libFiche = libellesCouleur(texte(pf.couleur) || texte(pf.couleur_sans_question?.de));
  const cands = libFiche.map((l) => idsDuLibelle(l));
  let reference = null;
  if (libFiche.length && cands.every((c) => c.length)) {
    if (cands.every((c) => c.length === 1)) reference = cands.map((c) => c[0]);
    else if (envoyes.length === cands.length && envoyes.every((id, i) => cands[i].includes(id))) reference = envoyes.slice();
  }
  return { envoyes, libellesEnvoyes: libEnv, reference: reference ? idsCouleur(reference) : null, libellesReference: libFiche, source: "couleur de la fiche copiée sur la publication" };
}

/**
 * @param {object} a
 * @param {object} a.capture        la capture servie au job : {id, vinted_item_id, captured_at, libelles, natif | payload.natif}
 * @param {object | null} a.depot   le DÉPÔT FillSell de l'annonce en ligne : {id, action, published_at, platform_listing_id, handler_build, platform_fields}
 * @param {object | null} [a.depotCapture]  la capture qu'a utilisée ce dépôt (republication sans copie à identifiants)
 * @param {Array<object>} [a.lectures]      les autres captures de cette annonce : [{id, captured_at, libelles, natif}]
 * @param {object | null} [a.fiche]         {attributs: {couleur: {v, source, at}}}
 * @returns {{ verdict: "fiche" | "en_ligne", motif: string, en_ligne: object, reference?: number[], depot?: string,
 *             natif?: object, libelles?: object, langue?: string | null }}
 */
export function couleurDeLaFicheALaRepublication({ capture, depot, depotCapture = null, lectures = [], fiche = null }) {
  const enLigne = couleurDeLaCapture(capture);
  const rendu = { en_ligne: { ids: enLigne.ids, libelles: enLigne.libelles } };
  const garder = (motif, extra = {}) => ({ verdict: "en_ligne", motif, ...rendu, ...extra });
  if (!enLigne.ids.length) return garder("sans_couleur_en_ligne");
  const numero = texte(capture?.vinted_item_id);
  // 1. Le dépôt FillSell de l'annonce en ligne (jamais le relevé d'une annonce née sur Vinted).
  if (!depot || !numero || texte(depot.platform_listing_id) !== numero || ms(depot.published_at) == null
      || /sync-dressing/i.test(String(depot.handler_build ?? "")) || !["publish", "republish"].includes(String(depot.action))) {
    return garder("annonce_pas_de_fillsell");
  }
  const pfD = pfDe(depot);
  const idDepot = String(depot.id ?? "").slice(0, 8);
  // 2. Une couleur choisie par la personne pour ce dépôt reste la sienne.
  if (couleurDeLaPersonne(pfD)) return garder("couleur_choisie_par_la_personne", { depot: idDepot });
  // 3. La référence.
  const d = dossierDuDepot(depot, depotCapture);
  if (!d.reference) return garder("reference_inconnue", { depot: idDepot });
  if (memes(enLigne.ids, d.reference)) return garder("concorde", { depot: idDepot, reference: d.reference });
  // 4. C'est NOTRE dépôt qui a posé la couleur en ligne.
  const parIds = d.envoyes.length > 0 && memes(enLigne.ids, d.envoyes);
  const parLibelle = !parIds && d.libellesEnvoyes.length > 0 && d.libellesEnvoyes.length === enLigne.libelles.length
    && memes(enLigne.libelles.map(norm), d.libellesEnvoyes.map(norm));
  if (!parIds && !parLibelle) return garder("pas_la_couleur_de_notre_depot", { depot: idDepot, reference: d.reference, envoyes: d.envoyes });
  // 5. Aucun changement relevé depuis notre dépôt.
  const tDepot = ms(depot.published_at);
  const tCapture = ms(capture?.captured_at);
  for (const l of Array.isArray(lectures) ? lectures : []) {
    if (String(l?.id ?? "") === String(capture?.id ?? "") || texte(l?.vinted_item_id || numero) !== numero) continue;
    const t = ms(l?.captured_at);
    if (t == null || t <= tDepot) continue;
    const ids = couleurDeLaCapture(l).ids;
    if (ids.length && !memes(ids, enLigne.ids)) return garder("changee_apres_notre_depot", { depot: idDepot, lecture: String(l.id ?? "") });
  }
  const cf = fiche?.attributs?.couleur;
  if (cf && typeof cf === "object" && ["capture", "vinted_detail"].includes(String(cf.source ?? ""))) {
    const t = ms(cf.at);
    const memeLecture = t != null && tCapture != null && Math.abs(t - tCapture) < 10 * 60 * 1000;
    if (t != null && t > tDepot && !memeLecture) {
      const lus = libellesCouleur(cf.v).map(norm);
      if (lus.length && !lus.every((x) => enLigne.libelles.map(norm).includes(x))) {
        return garder("changee_apres_notre_depot", { depot: idDepot, lecture: `fiche (${cf.source})` });
      }
    }
  }
  // La référence part : identifiants, et libellés dans la langue de la capture.
  const langue = langueDesCouleurs(enLigne.ids, enLigne.libelles);
  let libelles;
  if (String(depot.action) === "republish" && d.libellesReference.length === d.reference.length) libelles = d.libellesReference.slice();
  else if (langue) libelles = d.reference.map((id) => COULEURS_VINTED_PAR_LANGUE[langue][id]);
  else if (d.libellesReference.length === d.reference.length) libelles = d.libellesReference.slice();
  else return garder("libelles_inconnus", { depot: idDepot, reference: d.reference });
  const natifCap = (capture?.natif && typeof capture.natif === "object") ? capture.natif
    : ((capture?.payload?.natif && typeof capture.payload.natif === "object") ? capture.payload.natif : {});
  const libCap = (capture?.libelles && typeof capture.libelles === "object") ? capture.libelles : {};
  return {
    verdict: "fiche",
    motif: parIds ? "posee_par_notre_depot" : "posee_par_notre_depot_meme_libelle",
    ...rendu,
    depot: idDepot,
    reference: d.reference,
    reference_source: d.source,
    langue,
    natif: { ...natifCap, color1_id: d.reference[0], color2_id: d.reference[1] ?? null, color1: libelles[0], color2: libelles[1] ?? null },
    libelles: { ...libCap, couleurs: libelles },
  };
}
