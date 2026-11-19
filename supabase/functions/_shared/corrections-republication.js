// ═══════════════════════════════════════════════════════════════════════════
// LES CORRECTIONS DE LA FEUILLE DE REPUBLICATION PARTENT AUSSI (19/11/2026, demande de Nico — suite de f24628b)
// ═══════════════════════════════════════════════════════════════════════════
// La feuille de republication (src/stock/CorrigerRepublication.jsx) écrit la correction sur la FICHE au geste, et sur
// la TÂCHE : platform_fields.corrections_republication = { titre?, description?, prix?, etat?, marque?, taille?,
// couleurs?, matieres?, colis? }, chaque entrée { v: libellé, id?: identifiant de la plateforme } (forme convenue le
// 19/11 ; src/stock/correctionsRepublication.js, correctionsPourLaTache + appliquerCorrectionsTache).
// Or aucune republication ne repartait de la fiche :
//   · VINTED recrée l'annonce depuis la CAPTURE de l'annonce en ligne (vinted_republish_captures : payload.titre,
//     payload.description, libelles.*, payload.natif.* — background.js, construireJobRecreation) ;
//   · LEBONCOIN, BEEBS, DEPOP recréent depuis la COPIE du dernier dépôt en ligne (spend_coins_and_republish : title,
//     description, platform_fields du job source), complétée au service par l'annonce relevée.
// LA RÈGLE (tous les comptes) :
//   · Vinted : les corrections sont posées sur la capture (libellés ET payload.natif) à l'étape « captured », AVANT le
//     retrait, UNE fois par capture (une recapture les repose), sans toucher aux photos choisies. L'identifiant fait foi
//     quand il est là ; sinon un libellé n'est posé que s'il se résout SANS DOUTE dans le catalogue Vinted : état et
//     couleur par les tables relevées (identifiants), taille, matière et colis par la grille relevée DU RAYON de la
//     capture, marque par un identifiant connu (« Sans marque » = 1, ou la même marque déjà portée par une annonce du
//     compte, un seul identifiant). Sinon la correction n'est PAS posée et la tâche le dit (non_posees, motif) —
//     jamais une valeur inventée. Le contrôle avant retrait (pré-vol de l'extension) reste le juge : un champ que le
//     formulaire refuse arrête tout AVANT le retrait.
//   · Leboncoin, Beebs, Depop : les corrections sont posées sur la copie (colonnes title / description / price et les
//     champs que les remplisseurs lisent), une fois par tâche, avant le retrait. Une taille corrigée sur Beebs porte sa
//     trace (correction_tracee) : la taille que l'annonce affiche encore ne la reprend pas (_shared/correction-tracee.js).
//   · Une correction ne vaut que pour la tâche qui l'a reçue (job_id, sinon écrite après sa naissance) : une copie
//     recopiée d'une republication d'avant n'en hérite jamais.
// Pur (Deno + Node) : scripts/corrections-republication-vinted-selftest.mjs, scripts/corrections-republication-copie-selftest.mjs.

import { COULEURS_VINTED_PAR_LANGUE, idsDuLibelle, idsCouleur, libellesCouleur, langueDesCouleurs } from "./couleur-posee-par-nous.js";
import { LIBELLES_ETATS_VINTED, idEtatVinted } from "../../../src/utils/etatsVinted.js";
import { ETAT_PAR_PLATEFORME, etatPourPlateforme, tierEtat } from "./etat-plateformes.js";
import { grilleColisVinted } from "../../../src/utils/vintedColis.js";
import { estSansMarque } from "./marque-absente.js";
import { depopCouleursDe } from "./depop-couleur.js";
import { depopEtat, depopMatieres } from "../../../src/utils/depopAttributs.js";

export const CLE_CORRECTIONS = "corrections_republication";
export const CLE_POSEES = "corrections_republication_posees";
export const CHAMPS_CORRECTIONS = Object.freeze(["titre", "description", "prix", "etat", "marque", "taille", "couleurs", "matieres", "colis"]);
const PLATEFORMES_COPIE = new Set(["leboncoin", "beebs", "depop"]);
const MARGE_NAISSANCE_MS = 10 * 60_000;
const TITRE_MAX_VINTED = 100;

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const texte = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const pfDe = (job) => obj(job?.platform_fields) ?? {};

/**
 * Les corrections portées par la tâche, normalisées : { cle: { v, id? } }, ou null.
 * Une entrée peut être { v, id } ou une valeur nue ; un tableau (couleurs, matières) se lit « A, B ».
 */
export function correctionsDeLaTache(pf) {
  const c = obj(obj(pf)?.[CLE_CORRECTIONS]);
  if (!c) return null;
  const out = {};
  for (const cle of CHAMPS_CORRECTIONS) {
    const e = c[cle];
    if (e == null) continue;
    const brut = obj(e) ? e.v : e;
    const v = cle === "description"
      ? String(brut ?? "").replace(/\s+$/, "")
      : texte(Array.isArray(brut) ? brut.join(", ") : brut);
    if (!v.trim()) continue;
    const id = obj(e) ? e.id : undefined;
    out[cle] = { v, ...(id != null && id !== "" ? { id } : {}) };
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Les corrections valent-elles pour CETTE tâche ? (jamais héritées d'une republication d'avant, que
 * spend_coins_and_republish recopie) : la feuille nomme la tâche (job_id), sinon elle les a écrites après sa naissance.
 */
export function correctionsDeCetteTache(job) {
  const pf = pfDe(job);
  const c = obj(pf[CLE_CORRECTIONS]);
  if (!c) return null;
  if (c.job_id != null && String(c.job_id) !== "") {
    if (String(c.job_id) !== String(job?.id ?? "")) return null;
  } else {
    const le = Date.parse(String(c.le ?? ""));
    const ne = Date.parse(String(job?.created_at ?? ""));
    if (!Number.isFinite(le) || !Number.isFinite(ne) || le < ne - MARGE_NAISSANCE_MS) return null;
  }
  return correctionsDeLaTache(pf);
}

/** La trace des corrections déjà posées pour CETTE tâche (jamais celle d'une tâche d'avant), ou null. */
export function correctionsPoseesSurCetteTache(job) {
  const t = obj(pfDe(job)[CLE_POSEES]);
  return t && String(t.job_id ?? "") === String(job?.id ?? "") ? t : null;
}

/**
 * Ce champ est-il sous une correction de la feuille ? (les règles du service qui le rejouent — état de la fiche, couleur
 * posée par nous, texte du vendeur — s'effacent devant lui). Vrai tant que la correction attend d'être jugée (elle
 * passera : jamais une écriture que la correction défera), puis seulement si elle a été POSÉE ; une correction refusée
 * (non_posees) rend la main aux règles d'avant. Vinted : jugée sur CETTE capture.
 */
export function champSousCorrection(job, cle) {
  const c = correctionsDeCetteTache(job);
  if (!c?.[cle]) return false;
  const t = correctionsPoseesSurCetteTache(job);
  const pf = pfDe(job);
  const jugee = t && (job?.platform !== "vinted" || String(t.capture_id ?? "") === String(pf.capture_id ?? ""));
  if (!jugee) return true;
  return Object.prototype.hasOwnProperty.call(obj(t.posees) ?? {}, cle);
}

// ═══ VINTED : LA CAPTURE ═══════════════════════════════════════════════════════════════════════════════════════════

/** Cette tâche Vinted doit-elle recevoir ses corrections sur sa capture maintenant ? (étape « captured », avant retrait) */
export function captureACorrigerParLaFeuille(job) {
  const pf = pfDe(job);
  if (job?.platform !== "vinted" || String(job?.action) !== "republish" || job?.status !== "pending") return false;
  if (String(pf.republish_step ?? "") !== "captured" || !/^\d+$/.test(String(pf.capture_id ?? ""))) return false;
  if (pf.deleted_at != null) return false; // retrait engagé : la capture a déjà servi telle qu'elle était
  if (!correctionsDeCetteTache(job)) return false;
  const t = correctionsPoseesSurCetteTache(job);
  return !t || String(t.capture_id ?? "") !== String(pf.capture_id);
}

/** Les champs dont la résolution demande la grille relevée du rayon (platform_category_aspects). */
export const champsAGrille = (corrections) => ["taille", "matieres", "colis"].filter((k) => corrections?.[k] && corrections[k].id == null);

/** La langue des libellés d'une capture : celle de ses couleurs (fr, it), sinon celle de son état. null = inconnue. */
export function langueDeLaCapture(capture) {
  const lib = obj(capture?.libelles) ?? {};
  const nat = obj(obj(capture?.payload)?.natif) ?? {};
  const ids = idsCouleur([nat.color1_id, nat.color2_id]);
  const lc = langueDesCouleurs(ids, libellesCouleur(lib.couleurs));
  if (lc) return lc;
  const e = norm(lib.etat);
  const attr = (Array.isArray(nat.item_attributes) ? nat.item_attributes : []).find((a) => String(a?.code ?? "").toLowerCase() === "condition");
  const idE = Number(nat.status_id ?? (Array.isArray(attr?.ids) ? attr.ids[0] : null));
  if (!e || !Number.isInteger(idE)) return null;
  for (const [langue, table] of Object.entries(LIBELLES_ETATS_VINTED)) if (norm(table[idE]) === e) return langue;
  return null;
}

/** Le libellé exact d'une grille relevée qui EST la valeur (accents, casse, espaces près), une seule ; sinon null. */
export function libelleDeLaGrille(valeur, grille) {
  const k = norm(valeur);
  if (!k || !Array.isArray(grille)) return null;
  const trouves = [...new Set(grille.map((g) => String(g ?? "").trim()).filter((g) => norm(g) === k))];
  return trouves.length === 1 ? trouves[0] : null;
}

/** La grille de colis du rayon : celle du code (src/utils/vintedColis.js), sinon la relevée (« 1|Petit »). */
function grilleColis(chemin, releve) {
  const g = grilleColisVinted(chemin);
  if (Array.isArray(g) && g.length) return g.map((x) => ({ id: Number(x.id), libelle: String(x.libelle ?? "") }));
  const r = (Array.isArray(releve) ? releve : []).map((s) => String(s ?? "").match(/^(\d+)\|(.+)$/)).filter(Boolean)
    .map((m) => ({ id: Number(m[1]), libelle: m[2].trim() }));
  return r.length ? r : null;
}

const avecAttribut = (attrs, code, ids) => {
  const liste = Array.isArray(attrs) ? attrs : [];
  if (!liste.some((a) => String(a?.code ?? "").toLowerCase() === code)) return liste;
  return liste.map((a) => (String(a?.code ?? "").toLowerCase() === code ? { ...a, ids } : a));
};
const sansAttribut = (attrs, code) => (Array.isArray(attrs) ? attrs : []).filter((a) => String(a?.code ?? "").toLowerCase() !== code);

/**
 * Les corrections posées sur la capture Vinted.
 * @param {{ corrections: object, capture: {libelles, payload}, grilles?: { taille?: string[]|null, matiere?: string[]|null,
 *   colis?: string[]|null }, marques?: Array<{id:number, libelle:string}>, prixDeLaTache?: unknown }} a
 *   marques : les identifiants de marque connus pour le libellé corrigé (captures du compte), lus par l'appelant.
 * @returns {{ libelles: object, payload: object, posees: Record<string, string>, non_posees: Array<{cle, valeur, motif}>,
 *   prix: number | null, change: boolean }}
 */
export function correctionsSurLaCaptureVinted({ corrections, capture, grilles = {}, marques = [], prixDeLaTache = null } = {}) {
  const lib = { ...(obj(capture?.libelles) ?? {}) };
  const payload = { ...(obj(capture?.payload) ?? {}) };
  const nat = { ...(obj(payload.natif) ?? {}) };
  let attrs = Array.isArray(nat.item_attributes) ? nat.item_attributes.map((a) => ({ ...a })) : null;
  const posees = {};
  const non_posees = [];
  let prix = null;
  let change = false;
  const refuser = (cle, valeur, motif) => non_posees.push({ cle, valeur: String(valeur ?? "").slice(0, 200), motif });
  const langue = langueDeLaCapture(capture);
  const chemin = Array.isArray(lib.categoryPath) ? lib.categoryPath.map(String) : null;
  const c = corrections ?? {};

  if (c.titre) {
    const v = texte(c.titre.v);
    if (v.length > TITRE_MAX_VINTED) refuser("titre", v, "titre_trop_long_pour_vinted");
    else {
      if (String(payload.titre ?? "") !== v) { payload.titre = v; if ("title" in nat) nat.title = v; change = true; }
      posees.titre = v;
    }
  }
  if (c.description) {
    const v = String(c.description.v);
    if (String(payload.description ?? "") !== v) { payload.description = v; if ("description" in nat) nat.description = v; change = true; }
    posees.description = v.length > 80 ? `${v.slice(0, 80)}…` : v;
  }
  if (c.prix) {
    const n = Number(String(c.prix.v).replace(",", "."));
    if (!Number.isFinite(n) || n < 1) refuser("prix", c.prix.v, "prix_illisible");
    else {
      prix = n;
      if (Number(prixDeLaTache) !== n || Number(String(payload.prix ?? "").replace(",", ".")) !== n) change = true;
      if (Number(String(payload.prix ?? "").replace(",", ".")) !== n) payload.prix = n;
      posees.prix = String(n);
    }
  }
  if (c.etat) {
    const idDonne = Number(c.etat.id);
    const id = Number.isInteger(idDonne) && LIBELLES_ETATS_VINTED.fr[idDonne] ? idDonne : idEtatVinted(c.etat.v);
    const ref = id ? LIBELLES_ETATS_VINTED.fr[id] : null;
    const e = ref ? etatPourPlateforme(ref, "vinted") : null;
    if (!id || !ref) refuser("etat", c.etat.v, "etat_hors_catalogue_vinted");
    else if (e?.meilleur) refuser("etat", c.etat.v, "etat_embelli");
    else if (!langue || !LIBELLES_ETATS_VINTED[langue]?.[id]) refuser("etat", c.etat.v, "langue_de_la_capture_inconnue");
    else {
      const l = LIBELLES_ETATS_VINTED[langue][id];
      if (lib.etat !== l || Number(nat.status_id) !== id) change = true;
      lib.etat = l;
      nat.status_id = id;
      if (attrs) attrs = avecAttribut(attrs, "condition", [id]);
      posees.etat = l;
    }
  }
  if (c.marque) {
    const v = texte(c.marque.v);
    const idDonne = Number(c.marque.id);
    let id = Number.isInteger(idDonne) && idDonne > 0 ? idDonne : null;
    if (!id && estSansMarque(v)) id = 1;
    if (!id) {
      const ids = [...new Set((marques ?? []).filter((m) => norm(m?.libelle) === norm(v)).map((m) => Number(m?.id)).filter((n) => Number.isInteger(n) && n > 1))];
      if (ids.length === 1) id = ids[0];
      else refuser("marque", v, ids.length > 1 ? "marque_ambigue_dans_le_catalogue" : "marque_sans_identifiant_vinted");
    }
    if (id) {
      const l = id === 1 ? (estSansMarque(lib.marque) ? lib.marque : "Sans marque") : v;
      if (lib.marque !== l || Number(nat.brand_id) !== id) change = true;
      lib.marque = l;
      nat.brand_id = id;
      if (obj(nat.brand_dto)) nat.brand_dto = { ...nat.brand_dto, id, title: l };
      posees.marque = l;
    }
  }
  if (c.taille) {
    const idDonne = Number(c.taille.id);
    if (Number.isInteger(idDonne) && idDonne > 0) {
      const v = texte(c.taille.v);
      if (lib.taille !== v || Number(nat.size_id) !== idDonne) change = true;
      lib.taille = v;
      nat.size_id = idDonne;
      if (attrs) attrs = avecAttribut(attrs, "size", [idDonne]);
      if (obj(payload.champs_utilisateur)?.taille) { const { taille: _t, ...reste } = payload.champs_utilisateur; payload.champs_utilisateur = reste; }
      posees.taille = v;
    } else if (!Array.isArray(grilles.taille) || !grilles.taille.length) {
      refuser("taille", c.taille.v, "grille_du_rayon_inconnue");
    } else {
      const l = libelleDeLaGrille(c.taille.v, grilles.taille);
      if (!l) refuser("taille", c.taille.v, "taille_hors_grille_du_rayon");
      else {
        // Le libellé de la grille part SEUL (comme une taille choisie : _shared/vinted-taille-hors-grille.js) — l'identifiant
        // capturé désigne l'ancienne taille, il quitte la capture.
        const attrTaille = (attrs ?? []).find((a) => String(a?.code ?? "").toLowerCase() === "size") ?? null;
        if (lib.taille !== l || nat.size_id != null || attrTaille) change = true;
        payload.taille_corrigee = { de: lib.taille ?? null, vers: l, size_id: nat.size_id ?? null, item_attributes_size: attrTaille };
        lib.taille = l;
        nat.size_id = null;
        if (attrs) attrs = sansAttribut(attrs, "size");
        payload.champs_utilisateur = { ...(obj(payload.champs_utilisateur) ?? {}), taille: l };
        posees.taille = l;
      }
    }
  }
  if (c.couleurs) {
    let ids = [];
    let motif = null;
    if (c.couleurs.id != null) {
      ids = idsCouleur(Array.isArray(c.couleurs.id) ? c.couleurs.id : [c.couleurs.id]);
      if (!ids.length) motif = "couleur_identifiant_illisible";
    } else {
      for (const l of libellesCouleur(c.couleurs.v)) {
        const cands = idsDuLibelle(l);
        if (cands.length !== 1) { motif = cands.length ? "couleur_ambigue" : "couleur_hors_palette_vinted"; break; }
        if (!ids.includes(cands[0])) ids.push(cands[0]);
      }
      if (libellesCouleur(c.couleurs.v).length > 2) motif = motif ?? "plus_de_deux_couleurs";
    }
    const table = langue ? COULEURS_VINTED_PAR_LANGUE[langue] : null;
    if (!motif && !table) motif = "langue_de_la_capture_inconnue";
    if (!motif && ids.some((id) => !table[id])) motif = "couleur_hors_palette_vinted";
    if (motif || !ids.length) refuser("couleurs", c.couleurs.v, motif ?? "couleur_hors_palette_vinted");
    else {
      const libelles = ids.map((id) => table[id]);
      if (JSON.stringify(libellesCouleur(lib.couleurs)) !== JSON.stringify(libelles) || Number(nat.color1_id) !== ids[0] || (Number(nat.color2_id) || null) !== (ids[1] ?? null)) change = true;
      lib.couleurs = libelles;
      nat.color1_id = ids[0];
      nat.color1 = libelles[0];
      nat.color2_id = ids[1] ?? null;
      nat.color2 = libelles[1] ?? null;
      posees.couleurs = libelles.join(", ");
    }
  }
  if (c.matieres) {
    const idsDonnes = Array.isArray(c.matieres.id) ? c.matieres.id : (c.matieres.id != null ? [c.matieres.id] : []);
    const ids = [...new Set(idsDonnes.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 3);
    const morceaux = String(c.matieres.v).split(/\s*(?:,|\/|\+|&|\s+et\s+)\s*/i).map((s) => s.trim()).filter(Boolean);
    if (ids.length) {
      if (JSON.stringify(lib.matiere_ids ?? null) !== JSON.stringify(ids) || lib.matiere) change = true;
      lib.matiere_ids = ids;
      delete lib.matiere;
      if (attrs) attrs = avecAttribut(attrs, "material", ids);
      posees.matieres = texte(c.matieres.v);
    } else if (morceaux.length > 1) {
      // La recréation ne pose qu'UNE matière par son libellé (vinted.js, selectClosedOptionSafe) : plusieurs matières
      // sans leurs identifiants ne partiraient qu'en partie.
      refuser("matieres", c.matieres.v, "plusieurs_matieres_sans_identifiants");
    } else if (!Array.isArray(grilles.matiere) || !grilles.matiere.length) {
      refuser("matieres", c.matieres.v, "grille_du_rayon_inconnue");
    } else {
      const l = libelleDeLaGrille(morceaux[0], grilles.matiere);
      if (!l) refuser("matieres", c.matieres.v, "matiere_hors_liste_vinted");
      else {
        if (lib.matiere !== l || lib.matiere_ids) change = true;
        lib.matiere = l;
        delete lib.matiere_ids;
        if (attrs) attrs = sansAttribut(attrs, "material");
        posees.matieres = l;
      }
    }
  }
  if (c.colis) {
    const grille = grilleColis(chemin, grilles.colis);
    const idDonne = Number(c.colis.id);
    let choix = null;
    if (!grille) refuser("colis", c.colis.v, "grille_du_rayon_inconnue");
    else {
      choix = Number.isInteger(idDonne) && idDonne > 0
        ? grille.find((g) => g.id === idDonne) ?? null
        : (() => { const t = grille.filter((g) => norm(g.libelle) === norm(c.colis.v)); return t.length === 1 ? t[0] : null; })();
      if (!choix) refuser("colis", c.colis.v, "colis_hors_grille_du_rayon");
    }
    if (choix) {
      if (lib.colis !== choix.libelle || Number(nat.package_size_id) !== choix.id) change = true;
      lib.colis = choix.libelle;
      nat.package_size_id = choix.id;
      posees.colis = choix.libelle;
    }
  }
  if (attrs) nat.item_attributes = attrs;
  payload.natif = nat;
  return { libelles: lib, payload, posees, non_posees, prix, change };
}

/** La trace posée sur la tâche (une fois par capture pour Vinted, une fois par tâche ailleurs). */
export function traceCorrectionsPosees(pf, { jobId, captureId = null, posees, non_posees, le = new Date().toISOString() }) {
  return {
    ...(obj(pf) ?? {}),
    [CLE_POSEES]: {
      job_id: String(jobId), ...(captureId != null ? { capture_id: String(captureId) } : {}),
      posees: posees ?? {}, non_posees: non_posees ?? [], le, pose_par: "get-pending-jobs (_shared/corrections-republication.js)",
    },
  };
}

// ═══ LEBONCOIN, BEEBS, DEPOP : LA COPIE ════════════════════════════════════════════════════════════════════════════

/** Cette republication Leboncoin / Beebs / Depop doit-elle recevoir ses corrections maintenant ? (avant tout retrait) */
export function copieACorrigerParLaFeuille(job) {
  const pf = pfDe(job);
  if (!PLATEFORMES_COPIE.has(String(job?.platform)) || String(job?.action) !== "republish" || job?.status !== "pending") return false;
  if (String(pf.republish_step ?? "") === "deleted" || pf.deleted_at != null || pf.republish_suppression_envoyee) return false;
  if (!correctionsDeCetteTache(job)) return false;
  return !correctionsPoseesSurCetteTache(job);
}

/**
 * Les corrections posées sur la copie d'une republication Leboncoin / Beebs / Depop.
 * @param {{ job: object, corrections: object, tailleAffichee?: string | null }} a
 *   tailleAffichee : la taille que l'annonce Beebs affiche encore (relevé), pour la trace de correction.
 * @returns {{ colonnes: { title?, description?, price? }, pf: object, posees, non_posees, change: boolean }}
 */
export function correctionsSurLaCopie({ job, corrections, tailleAffichee = null, maintenant = new Date() } = {}) {
  const p = String(job?.platform ?? "");
  const pf = { ...pfDe(job) };
  const colonnes = {};
  const posees = {};
  const non_posees = [];
  let change = false;
  const refuser = (cle, valeur, motif) => non_posees.push({ cle, valeur: String(valeur ?? "").slice(0, 200), motif });
  const poser = (cle, v) => { if (pf[cle] !== v) { pf[cle] = v; change = true; } };
  const c = corrections ?? {};
  const premier = (v) => String(v ?? "").split(/\s*(?:,|\s+et\s+)\s*/i).map((s) => s.trim()).filter(Boolean);

  if (c.titre) {
    if (p === "depop") refuser("titre", c.titre.v, "depop_sans_titre");
    else {
      const v = texte(c.titre.v);
      if (String(job?.title ?? "") !== v) { colonnes.title = v; change = true; }
      posees.titre = v;
    }
  }
  if (c.description) {
    const v = String(c.description.v);
    if (String(job?.description ?? "") !== v) { colonnes.description = v; change = true; }
    posees.description = v.length > 80 ? `${v.slice(0, 80)}…` : v;
  }
  if (c.prix) {
    const n = Number(String(c.prix.v).replace(",", "."));
    if (!Number.isFinite(n) || n < 1) refuser("prix", c.prix.v, "prix_illisible");
    else {
      if (Number(job?.price) !== n) { colonnes.price = n; change = true; }
      if (Number(pf.prix_republication) !== n) { pf.prix_republication = n; change = true; }
      posees.prix = String(n);
    }
  }
  if (c.etat) {
    const tier = tierEtat(c.etat.v);
    const cible = p === "depop" ? "vinted" : p;
    const e = tier ? etatPourPlateforme(ETAT_PAR_PLATEFORME[tier].vinted, cible) : null;
    if (!e?.valeur) refuser("etat", c.etat.v, "etat_illisible");
    else if (e.meilleur) refuser("etat", c.etat.v, "etat_embelli");
    else if (p === "depop") {
      const type = Array.isArray(pf.depopCategoryPath) ? pf.depopCategoryPath[2] ?? null : null;
      const d = depopEtat(e.valeur, type);
      if (!d.id) refuser("etat", c.etat.v, d.refus ?? "etat_illisible");
      else { poser("etat", e.valeur); poser("depopEtat", d.id); posees.etat = e.valeur; }
    } else {
      poser("etat", e.valeur);
      if (p === "leboncoin") {
        // L'état qui part sur Leboncoin est le critère du formulaire (lbcAspects.condition, devant platform_fields.etat) :
        // le juge d'état de l'extension le pose sur la grille LIVE du rayon (« Neuf sans étiquette » → « État neuf »).
        const asp = { ...(obj(pf.lbcAspects) ?? {}) };
        if (asp.condition !== e.valeur) { asp.condition = e.valeur; pf.lbcAspects = asp; change = true; }
        if (pf.lbc_etat_precis != null) { delete pf.lbc_etat_precis; change = true; }
      }
      posees.etat = e.valeur;
    }
  }
  if (c.marque) {
    const v = texte(c.marque.v);
    poser("marque", v);
    if (p === "depop") poser("depopMarque", v);
    posees.marque = v;
  }
  if (c.taille) {
    const v = texte(c.taille.v);
    const avant = texte(pf.taille);
    if (p === "depop") { poser("depopTaille", v); poser("taille", v); posees.taille = v; }
    else if (p === "beebs") {
      const ct = obj(pf.correction_tracee);
      if (ct && ct.cle !== "taille") refuser("taille", v, "autre_correction_tracee_sur_la_copie");
      else {
        poser("taille", v);
        // (_shared/correction-tracee.js) La taille corrigée tient devant celle que l'annonce affiche ENCORE (règle du
        // 03/10 : sinon l'affichée l'emporte, ici et dans beebs.js).
        const affichee = texte(tailleAffichee) || avant;
        if (affichee && norm(affichee) !== norm(v)) {
          pf.correction_tracee = { cle: "taille", avant: affichee, apres: v, source: "feuille_republication",
            motif: "taille corrigée par la personne avant la republication", le: maintenant.toISOString(), par: "get-pending-jobs" };
          change = true;
        }
        posees.taille = v;
      }
    } else { poser("taille", v); posees.taille = v; }
  }
  if (c.couleurs) {
    const v = texte(c.couleurs.v);
    if (p === "depop") {
      const r = depopCouleursDe(v);
      if (!r.ids.length || r.ecartees.length) refuser("couleurs", v, "couleur_hors_palette_depop");
      else {
        poser("couleur", v);
        if (JSON.stringify(pf.depopCouleurs ?? null) !== JSON.stringify(r.ids)) { pf.depopCouleurs = r.ids; change = true; }
        posees.couleurs = v;
      }
    } else {
      poser("couleur", v);
      // Leboncoin lit d'abord colors[0] (leboncoin.js) : la liste suit.
      if (p === "leboncoin" && (Array.isArray(pf.colors) || pf.colors != null) && JSON.stringify(pf.colors) !== JSON.stringify([v])) { pf.colors = [v]; change = true; }
      posees.couleurs = v;
    }
  }
  if (c.matieres) {
    const v = texte(c.matieres.v);
    const liste = premier(v);
    if (p === "depop") {
      const r = depopMatieres(v);
      if (!r.ids.length || r.ecartees.length) refuser("matieres", v, "matiere_hors_liste_depop");
      else {
        poser("matiere", liste[0]);
        if (JSON.stringify(pf.depopMatieres ?? null) !== JSON.stringify(r.ids)) { pf.depopMatieres = r.ids; change = true; }
        posees.matieres = v;
      }
    } else {
      poser("matiere", liste[0]);
      if (liste.length > 1) { if (JSON.stringify(pf.matieres ?? null) !== JSON.stringify(liste)) { pf.matieres = liste; change = true; } }
      else if (pf.matieres != null) { delete pf.matieres; change = true; }
      posees.matieres = v;
    }
  }
  // Le colis hors Vinted part de la FICHE (poids et format : _shared/colis-de-la-fiche.js, Beebs : format_colis_explicite).
  if (c.colis) refuser("colis", c.colis.v, "colis_de_la_fiche");
  return { colonnes, pf, posees, non_posees, change };
}
