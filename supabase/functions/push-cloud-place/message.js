// (03/11/2026, point 5 de Nico) Le texte de la notification « une place FillSell Cloud est libre » — pur, sans
// dépendance (testé par scripts/cloud-place-attente-selftest.mjs). Une notification de SERVICE : elle répond à une
// inscription explicite (« Être prévenu(e) ») ; jamais de marketing, jamais de mail.
// La place est gardée 24 h (cloud_vente_etat) : le texte le dit, sans promettre plus.

export const DUREE_GARDE_H = 24;

/** La langue de la notification (le profil) : « en » seulement si le profil le dit, sinon le français. */
export const langueNotification = (lang) => (String(lang ?? "").toLowerCase().startsWith("en") ? "en" : "fr");

/** Le message (titre, corps, données) pour un inscrit prévenu. */
export function messagePlaceLibre(note, lang = "fr") {
  const en = langueNotification(lang) === "en";
  return {
    titre: en ? "A FillSell Cloud spot is free" : "Une place FillSell Cloud est libre",
    corps: en
      ? `It's kept for you for ${DUREE_GARDE_H} hours: open FillSell to start your FillSell Cloud.`
      : `Elle t'est gardée ${DUREE_GARDE_H} heures : ouvre FillSell pour démarrer FillSell Cloud.`,
    donnees: { type: "cloud_place", user_id: String(note?.user_id ?? "") },
  };
}
