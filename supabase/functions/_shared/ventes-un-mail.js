// ═══════════════════════════════════════════════════════════════════════════
// LES VENTES PROCHES TIENNENT DANS UN SEUL MAIL (24/10, lot « zéro blocage », A9 — Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Le 24/10 à 12:11, louis-seller a reçu 5 mails pour 5 ventes enregistrées dans le
// MÊME passage (un relevé Leboncoin, 5 notes décidées à la même milliseconde) :
// push-ventes envoyait un mail par note. Sur 7 jours : 47 mails de trop, dont 35
// pour des ventes décidées dans le même passage.
// LA RÈGLE : toutes les notes d'un compte décidées dans le même passage partent
// dans UN mail (« N articles vendus »). Deux mails au plus : les ventes
// enregistrées d'un côté, les ventes « à confirmer » de l'autre (le mail le dit
// pour toutes ses lignes). Jamais une vente sans mail, jamais deux mails pour une
// même vente : chaque note garde SA réservation `vente:<id>` (push-ventes).
// Une vente isolée part seule, sans aucun retard, comme avant.
// Pur : scripts/ventes-un-mail-selftest.mjs.

/**
 * Les groupes de notes qui partagent un mail : même compte, même adresse, même
 * langue, même nature (enregistrée / à confirmer). Ordre stable : la plus ancienne
 * note (plus petit id) en tête de chaque groupe, groupes dans l'ordre de leur tête.
 * @template {{ id: number, user_id: string, email?: string|null, lang?: string|null, a_decider?: boolean }} N
 * @param {N[]} notes
 * @returns {N[][]}
 */
export function groupesDeMail(notes) {
  const groupes = new Map();
  const tries = [...(Array.isArray(notes) ? notes : [])].filter((n) => n && n.id != null)
    .sort((a, b) => Number(a.id) - Number(b.id));
  for (const n of tries) {
    const cle = [
      String(n.user_id ?? ""),
      String(n.email ?? "").trim().toLowerCase(),
      String(n.lang ?? "fr").toLowerCase() === "en" ? "en" : "fr",
      n.a_decider === true ? "a_confirmer" : "enregistree",
    ].join("|");
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(n);
  }
  return [...groupes.values()];
}
