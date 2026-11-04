// ═══════════════════════════════════════════════════════════════════════════
// UNE INFORMATION QUE NOUS N'AVONS PAS SU NOMMER N'EST PAS UN GESTE DE LA PERSONNE (05/11, point 5)
// ═══════════════════════════════════════════════════════════════════════════
// Le cas : linda.sidhoum (Premium), republication Vinted a79256da, needs_user « capture_incomplete » depuis le 30/10
// 09:36 : « la capture de ton annonce est incomplète : taille (item_attributes=4 → libellé) … Complète l'information
// manquante ». L'annonce PORTE sa taille (item_attributes size=4) ; c'est la lecture du référentiel de Vinted
// (/api/v2/size_groups → « Failed to fetch ») qui a échoué chez nous. Depuis le 01/10, les deux captures « → libellé »
// du parc viennent de ce même échec réseau. On demandait à la personne de compléter une taille qu'elle avait déjà.
// LA RÈGLE : un motif « … → libellé) » (un identifiant lu sur l'annonce, que nous n'avons pas su traduire en libellé)
// est un échec de NOTRE résolution, jamais une information manquante. Quand TOUS les motifs d'une capture incomplète
// sont de cette forme, la republication repart seule (étape a_capturer, rien n'a été retiré), espacée, au plus
// REPRISES_LIBELLE_MAX fois ; ensuite la question d'avant revient telle quelle. Un motif d'une autre forme (champ
// réellement absent, photo) garde la règle d'avant. Pur, sans import réseau (Deno + Node).
// Preuve : scripts/capture-libelle-selftest.mjs.

export const REPRISES_LIBELLE_MAX = 3;
/** Délais des reprises, en minutes (1re, 2e, 3e). */
export const DELAIS_REPRISE_LIBELLE_MIN = [10, 30, 120];
const LIBELLE_IRRESOLU_RE = /→ libellé\)$/;

/** Les motifs d'une capture incomplète lus dans le texte de l'extension (forme actuelle et forme ≤ 0.6.x « failed »),
 *  ou null si le texte n'en est pas une. */
export function motifsCaptureIncomplete(texte) {
  const t = String(texte ?? "");
  const actuel = t.match(/la capture de ton annonce est incomplète : (.+?)\. Ton annonce est intacte/s);
  const ancien = t.match(/^Capture incomplète \((.+?)\) — republication/s);
  const corps = (actuel ?? ancien)?.[1];
  if (!corps) return null;
  return corps.split(" ; ").map((m) => m.trim()).filter(Boolean);
}

/** Tous les motifs sont-ils des identifiants que nous n'avons pas su nommer ? (un motif coupé n'en est pas un) */
export function seulementLibellesIrresolus(motifs) {
  return Array.isArray(motifs) && motifs.length > 0 && motifs.every((m) => LIBELLE_IRRESOLU_RE.test(String(m)));
}

const NOMS_CHAMP = {
  taille: "sa taille", couleur: "sa couleur", marque: "sa marque", etat: "son état", colis: "son format de colis",
  categorie: "sa catégorie", matiere: "sa matière",
};
export function messageRepriseLibelle(champs) {
  const noms = [...new Set(champs.map((c) => NOMS_CHAMP[c] ?? "cette information"))];
  const quoi = noms.length ? noms.join(" et ") : "cette information";
  return `Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Ton annonce porte bien ${quoi}, ` +
    "mais FillSell n'a pas réussi à en lire le nom chez Vinted : ça vient de chez nous. Nouvel essai automatique, " +
    "rien à faire de ton côté.";
}

/**
 * La reprise d'une capture incomplète « → libellé », ou null (épuisée : la règle d'avant s'applique).
 * @param {object} pf — platform_fields du job (base + corps)
 * @param {string[]} motifs
 * @param {number} [maintenant]
 * @returns {null | { pf: object, message: string, n: number, dansMinutes: number }}
 */
export function repriseCaptureLibelle(pf, motifs, maintenant = Date.now()) {
  const base = pf && typeof pf === "object" ? pf : {};
  const avant = Number(base.capture_libelle_reprises ?? 0) || 0;
  if (avant >= REPRISES_LIBELLE_MAX) return null;
  const n = avant + 1;
  const dansMinutes = DELAIS_REPRISE_LIBELLE_MIN[Math.min(n, DELAIS_REPRISE_LIBELLE_MIN.length) - 1];
  const champs = [...new Set(motifs.map((m) => (String(m).split(/[\s(]/)[0] || "").toLowerCase()).filter(Boolean))];
  const pfNeuf = { ...base };
  for (const k of ["needs_user_source", "champs_a_completer", "needsUserField", "needsUserFields",
    "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"]) delete pfNeuf[k];
  pfNeuf.capture_libelle_reprises = n;
  pfNeuf.capture_libelle_reprise = { le: new Date(maintenant).toISOString(), n, motifs: motifs.slice(0, 5) };
  pfNeuf.next_action_after = new Date(maintenant + dansMinutes * 60_000).toISOString();
  return { pf: pfNeuf, message: messageRepriseLibelle(champs), n, dansMinutes };
}
