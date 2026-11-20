// ═══════════════════════════════════════════════════════════════════════════
// LA LECTURE D'ORIGINE DU LOT, PAR PETITE AVANCE BORNÉE (20/11/2026 soir, bloc A de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Constat (bertaberry41, FillSell Cloud sur Android, lot db6255ae de 396 articles vers Leboncoin, 20/11) : le lot posait
// TOUTES ses demandes de lecture d'un coup (355 entre 16:00 et 16:15). Le lecteur (extension ou copie Cloud) ne sert
// « tout de suite », sans le verrou des dépôts, que les demandes de MOINS DE 15 MIN (alarme `fillsell-lecture-signal`,
// une page toutes les 8 à 20 s) : de 15:45 à 16:30, 70 lectures par quart d'heure ; ensuite, plus que celles du poll,
// sous le verrou, derrière chaque dépôt Leboncoin (~51 s) — 3 lectures de 17:00 à 18:30. Résultat mesuré : 209 lectures
// de 16:00 à 19:25, 51 min d'attente en moyenne par article, ~6 h 30 pour le lot. Et pendant ces 15 premières minutes,
// get-pending-jobs RETENAIT toute la file de publication du compte (« la lecture passe devant ») : 2 dépôts de 16:00 à
// 16:30 au lieu de 13 par quart d'heure.
// La règle : le lot ne demande que les AVANCE_LECTURE_ORIGINE prochaines lectures (dans l'ordre du lot) ; chaque lecture
// close (lue, conclue, échouée, ou un choix de la personne) libère une place pour la suivante. Chaque demande est donc
// fraîche : le lecteur la prend dans les 30 s, sans verrou, au rythme humain de toujours (8 à 20 s entre deux pages) —
// jamais une rafale, jamais une lecture de tout le lot, et les dépôts ne l'attendent plus. Une demande restée sans
// lecteur plus de 15 min est simplement redemandée (demander_lecture_origine la réarme seule après 15 min), jamais
// pendant un échec. Une lecture impossible (échec, refus anti-robot, annonce masquée, introuvable, sans texte) se dit
// tout de suite sur la ligne de l'article, avec son motif et ses issues — jamais un « Préparation… » sans fin.
// Pur, testé : scripts/lot-lecture-fenetre-selftest.mjs.

/** Combien de lectures d'origine le lot demande à l'avance, au plus (« quelques articles »). */
export const AVANCE_LECTURE_ORIGINE = 6;
/** La relecture des demandes en vol (une seule requête pour toute la fenêtre), onglet visible seulement. */
export const RELECTURE_FENETRE_MS = 15_000;
/** Au-delà, le lecteur ne voit plus la demande par son alarme : on la redemande (la base la réarme seule). */
export const REARMER_APRES_MS = 15 * 60_000;

/** Une demande « en vol » occupe une place de la fenêtre ; échouée ou conclue, elle la libère (pur). */
export function occupePlace(st) {
  if (!st || st.phase !== "origine" || !st.origineDemandee) return false;
  const e = String(st.origineEtat ?? "");
  return e !== "echec" && e !== "conclue" && !st.origineConclusion;
}

/**
 * Les articles dont la lecture se demande MAINTENANT (pur) : dans l'ordre du lot, les premiers en « origine » pas encore
 * demandés, tant que la fenêtre a des places.
 * @param {string[]} ordre  lot.ids
 * @param {Record<string, object>} etats
 */
export function aDemanderMaintenant(ordre, etats, k = AVANCE_LECTURE_ORIGINE) {
  const ids = Array.isArray(ordre) ? ordre : [];
  const enVol = ids.filter((id) => occupePlace(etats?.[id])).length;
  const libres = Math.max(0, k - enVol);
  if (!libres) return [];
  return ids.filter((id) => etats?.[id]?.phase === "origine" && !etats[id].origineDemandee).slice(0, libres);
}

/** Combien d'articles attendent leur tour AVANT celui-ci (pur) — null s'il est déjà demandé ou pas en « origine ». */
export function rangEnFile(ordre, etats, id) {
  const st = etats?.[id];
  if (!st || st.phase !== "origine" || st.origineDemandee) return null;
  let n = 0;
  for (const x of Array.isArray(ordre) ? ordre : []) {
    if (x === id) return n;
    const s = etats?.[x];
    if (s?.phase === "origine" && !s.origineDemandee) n += 1;
  }
  return n;
}

/**
 * La demande doit-elle être redemandée ? (pur) — Vinted, ni faite, ni échouée, ni close, posée il y a plus de 15 min :
 * le lecteur ne la voit plus par son alarme (seulement au poll, derrière les dépôts). Jamais pendant un échec : son repos
 * et « Réessayer » décident (règle du 30/10, plafond de 3 échecs).
 */
export function demandeARearmer(demande, plateforme, maintenant = Date.now()) {
  if (String(plateforme ?? "") !== "vinted") return false;
  if (!demande || typeof demande !== "object" || demande.faite_le) return false;
  if (demande.essai_le || demande.motif) return false;
  const t = Date.parse(String(demande.demandee_le ?? ""));
  return Number.isFinite(t) && Number(maintenant) - t >= REARMER_APRES_MS;
}

/**
 * La mesure d'un lot, posée une fois à la fin de sa préparation (pur) — usage_logs « lot_preparation_mesure ».
 * @param {{ debut: number, fin: number, ids: string[], etats: Record<string, object> }} p
 */
export function mesureDuLot({ debut, fin, ids, etats } = {}) {
  const liste = Array.isArray(ids) ? ids : [];
  const lus = liste.map((id) => etats?.[id]).filter((s) => s && Number.isFinite(s.origineDepuis));
  const moy = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length / 1000) : null);
  const enFile = lus.filter((s) => Number.isFinite(s.origineDemandeeLe)).map((s) => s.origineDemandeeLe - s.origineDepuis);
  const lecture = lus.filter((s) => Number.isFinite(s.origineDemandeeLe) && Number.isFinite(s.origineLueLe))
    .map((s) => s.origineLueLe - s.origineDemandeeLe);
  return {
    articles: liste.length,
    a_lire: lus.length,
    lus: lecture.length,
    duree_s: Number.isFinite(debut) && Number.isFinite(fin) ? Math.round((fin - debut) / 1000) : null,
    file_moy_s: moy(enFile),
    lecture_moy_s: moy(lecture),
    avance: AVANCE_LECTURE_ORIGINE,
  };
}
