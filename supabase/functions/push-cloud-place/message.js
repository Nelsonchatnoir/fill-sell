// (03/11/2026, point 5 de Nico) Le texte de la notification « une place FillSell Cloud est libre » — pur, sans
// dépendance (testé par scripts/cloud-place-attente-selftest.mjs). Une notification de SERVICE : elle répond à une
// inscription explicite (« Être prévenu(e) ») ; jamais de marketing. (20/11/2026, ordre de Nico) Un mail l'accompagne
// À CHAQUE FOIS (mailPlaceLibre, plus bas).
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

// (20/11/2026, ordre de Nico) LE MAIL « TA PLACE EST PRÊTE » part À CHAQUE FOIS : en plus du push, ou seul quand il n'y a
// aucun appareil ou que le push échoue (trois inscrites « prévenues » le 20/11 sans rien recevoir : aucun appareil, aucun
// mail). Un mail de SERVICE (réponse à « Être prévenu(e) ») : catégorie « support », comme les autres mails du Cloud.
// Les 24 h de la place ne démarrent qu'à l'envoi RÉEL d'un push ou d'un mail (index.ts).
export const TYPE_MAIL_PLACE = "cloud_place_prete";

/** Le texte du mail (pur) : { sujet, titre, preheader, paragraphes, bouton, raisonEnvoi, lang }. */
export function mailPlaceLibre(lang = "fr", lienApp = "https://fillsell.app") {
  const en = langueNotification(lang) === "en";
  return {
    lang: en ? "en" : "fr",
    sujet: en ? "Your FillSell Cloud spot is ready" : "Ta place FillSell Cloud est prête",
    titre: en ? "Your FillSell Cloud spot is ready" : "Ta place FillSell Cloud est prête",
    preheader: en ? `It's kept for you for ${DUREE_GARDE_H} hours.` : `Elle t'est gardée ${DUREE_GARDE_H} heures.`,
    paragraphes: en
      ? [`A FillSell Cloud spot has just opened up for you. It's kept for you for ${DUREE_GARDE_H} hours from this email.`,
        "Open FillSell and start FillSell Cloud: your listings will be handled even when your computer is off."]
      : [`Une place FillSell Cloud vient de se libérer pour toi. Elle t'est gardée ${DUREE_GARDE_H} heures à partir de ce mail.`,
        "Ouvre FillSell et démarre FillSell Cloud : tes annonces sont gérées même quand ton ordinateur est éteint."],
    bouton: { texte: en ? "Open FillSell" : "Ouvrir FillSell", url: lienApp },
    raisonEnvoi: en
      ? "You're receiving this email because you asked to be notified when a FillSell Cloud spot is free."
      : "Tu reçois ce mail parce que tu as demandé à être prévenu(e) quand une place FillSell Cloud se libère.",
  };
}
