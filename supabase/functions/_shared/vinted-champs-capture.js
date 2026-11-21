// ═══════════════════════════════════════════════════════════════════════════
// UNE PUBLICATION VINTED SANS RAYON REPREND CELUI DE LA CAPTURE DE SON ANNONCE (21/11/2026 nuit, rouge 1 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas : noubliejamais (Pro), « La maison de bluey », fiche importée de Vinted (vinted_sync) ; une vente partielle de son
// annonce 10896452513 (il en restait 4) a créé la remise en vente Vinted 77a6de8f (20/11 18:45, remises_en_vente_tick).
// La tâche héritait des champs du job VENDU — une annonce importée, jamais publiée par FillSell : aucun categoryPath. Le
// formulaire Vinted refuse sans rayon (content-scripts/vinted.js, « platform_fields.categoryPath absent ») : trois
// reprises, puis « La publication n'a pas abouti après plusieurs essais automatiques ». Même défaut que le short de Nico
// du 24/10 (migration 20261024235900, jamais appliquée — son corps de remises_en_vente_tick est périmé).
// LA RÈGLE (au départ, get-pending-jobs — vaut pour toute publication Vinted sans rayon, quelle que soit sa source) : le
// rayon, l'état, la taille, la marque, les couleurs, l'ISBN et la matière viennent de la capture de l'annonce de CETTE
// fiche (vinted_republish_captures, verdict « valide », la capture nommée par la tâche d'abord, sinon la plus récente qui
// porte un rayon) — la même lecture que la recréation d'une republication. Ce que porte déjà la tâche garde la main ;
// jamais un rayon inventé. Sans capture : la tâche le dit (pas-de-rouge, motif « vinted_rayon_inconnu »).
// Pur (Deno + Node).

const texte = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** La tâche est-elle une publication Vinted sans rayon, à compléter par une capture ? (pur) */
export function vintedSansRayon(job) {
  if (job?.platform !== "vinted" || job?.action !== "publish") return false;
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (pf.remise_par_republier) return false;   // « Republier » de Vinted : aucun formulaire, aucun rayon à poser
  return !(Array.isArray(pf.categoryPath) && pf.categoryPath.length > 0);
}

/**
 * Les champs à poser sur la tâche depuis la capture (pur) — null si la capture n'a pas de rayon. `capture` :
 * { id, captured_at, libelles }. Seuls les champs ABSENTS de la tâche sont rendus ; categoryPath toujours (absent par
 * construction), avec la trace `rayon_de_la_capture`.
 */
export function champsVintedDeLaCapture(pf, capture) {
  const lib = capture?.libelles && typeof capture.libelles === "object" ? capture.libelles : null;
  const chemin = Array.isArray(lib?.categoryPath) ? lib.categoryPath.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  if (!chemin.length) return null;
  const p = pf && typeof pf === "object" ? pf : {};
  const out = { categoryPath: chemin };
  const poser = (cle, v) => { if (v != null && (p[cle] == null || p[cle] === "" || (Array.isArray(p[cle]) && !p[cle].length))) out[cle] = v; };
  poser("etat", texte(lib.etat));
  poser("taille", texte(lib.taille));
  poser("marque", texte(lib.marque));
  poser("colors", Array.isArray(lib.couleurs) && lib.couleurs.length ? lib.couleurs.map(String) : null);
  poser("isbn", texte(lib.isbn));
  poser("matiere", texte(lib.matiere));
  out.rayon_de_la_capture = { capture_id: capture.id ?? null, captured_at: capture.captured_at ?? null, champs: Object.keys(out) };
  return out;
}
