// ════════════════════════════════════════════════════════════════════════════
// NOTIFICATION « VENTE ANNULÉE — <titre> : REMETTRE EN VENTE ? » (25/10, point 3 de Nico) — le texte, sans réseau
// ════════════════════════════════════════════════════════════════════════════
// Une vente annulée (vente_commande_annulee_vinted ; vente_transaction_annulee_leboncoin) rend l'article au stock et
// PROPOSE sa remise en vente (remises_en_vente « proposee », dépôt vendu marqué « vente_annulee_remise ») : carte
// « Vente annulée — Remettre en vente ? » dans « À régler ». push-ventes prévient le vendeur UNE fois par annulation
// (table push_annulations, clé unique user_id + cle), seulement pour une annulation NEUVE (après l'armement
// coin_config.push_annulations_depuis, de moins de 24 h), jamais pour une proposition déjà acceptée ou close, et
// seulement sur les téléphones enregistrés (appareils_push = le réglage « Notifications de ventes » de CHAQUE
// appareil). Notification de SERVICE (règles Apple/Google) : jamais de marketing, et JAMAIS de mail sur ce chemin.
//
// Ce module ne lit rien (ni base, ni réseau, ni horloge) : ses règles se testent seules
// (scripts/push-annulation-selftest.mjs). Il est importé par push-ventes (Deno) et par le selftest (Node).

const NOMS = { vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla", depop: "Depop" };

/** La langue de la notification : celle du profil (profiles.lang) — « en » si elle commence par « en », sinon « fr ». */
export function langueNotif(v) {
  return String(v ?? "").toLowerCase().startsWith("en") ? "en" : "fr";
}

/** Le titre d'article lisible (espaces resserrés, 120 caractères au plus), ou null. */
function titreLisible(t) {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, 120) : null;
}

/**
 * Le message d'une annulation.
 *   note : { id, plateforme, titre, inventaire_id, vente_id, nb_articles } (servie par push_annulations_a_envoyer)
 *   → { titre: « Vente annulée sur Vinted », corps: « Robe Mango corail : remettre en vente ? », donnees }
 * Données : des CHAÎNES seulement (FCM refuse tout le reste).
 *   · type « vente_annulee » : l'app d'avant (pushVentes.js n'ouvre que type « vente ») l'ignore à l'appui — elle
 *     s'ouvre, sans plus, jamais sur la fiche (une publication ordinaire depuis la fiche doublerait le « Republier »
 *     de Vinted) ; l'app d'après (OTA) mène à l'écran « Ventes annulées » de « À régler ».
 *   · note_id préfixé « annulation- » : l'étiquette Android (`vente-<note_id>`, push-envoi.ts) ne remplace jamais
 *     la notification d'une VENTE de même numéro (deux tables, deux suites de numéros).
 */
export function messageAnnulation(note, lang = "fr") {
  const en = langueNotif(lang) === "en";
  const nom = note?.plateforme ? NOMS[String(note.plateforme)] : undefined;
  const titre = nom
    ? (en ? `Sale cancelled on ${nom}` : `Vente annulée sur ${nom}`)
    : (en ? "Sale cancelled" : "Vente annulée");
  const article = titreLisible(note?.titre) ?? (en ? "One of your items" : "Un de tes articles");
  const n = Number(note?.nb_articles);
  const nb = Number.isInteger(n) && n > 1 ? n : 1;
  const autres = nb - 1;
  const corps = autres > 0
    ? (en
      ? `${article} and ${autres} other item${autres > 1 ? "s" : ""}: list them again?`
      : `${article} et ${autres} autre${autres > 1 ? "s" : ""} article${autres > 1 ? "s" : ""} : les remettre en vente ?`)
    : (en ? `${article}: list it again?` : `${article} : remettre en vente ?`);
  const donnees = { type: "vente_annulee", note_id: `annulation-${note?.id ?? ""}` };
  if (note?.inventaire_id != null && note.inventaire_id !== "") donnees.inventaire_id = String(note.inventaire_id);
  if (note?.vente_id != null && note.vente_id !== "") donnees.vente_id = String(note.vente_id);
  if (note?.plateforme) donnees.plateforme = String(note.plateforme);
  if (nb > 1) donnees.nb_articles = String(nb);
  return { titre, corps, donnees };
}
