// (21/11/2026, lot de Nico, point 5 — Muriel, 0c97dc8b) LE TEXTE DE « UNE PLATEFORME DEMANDE UNE VÉRIFICATION » — pur, sans
// dépendance (verrou : scripts/lot-2111-cloud-verification-selftest.mjs). Règle de Nico : un captcha est le fonctionnement
// normal ; la cliente est PRÉVENUE (une notification, et un mail s'il n'y a aucun appareil ou si le push échoue), elle
// résout depuis l'app (« Résoudre la vérification »), ça repart. Une notification de SERVICE, jamais du marketing.

export const TYPE_MAIL_VERIFICATION = "cloud_verification";
export const NOMS_PLATEFORMES = Object.freeze({ vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", depop: "Depop" });
/** Les états qui appellent la personne (ceux qui ont le bouton « Résoudre » : src/cloud/executant.verificationAResoudre). */
export const ETATS_A_PREVENIR = Object.freeze(["a_resoudre", "revenue"]);

export const langueNotification = (lang) => (String(lang ?? "").toLowerCase().startsWith("en") ? "en" : "fr");
const nomDe = (pf) => NOMS_PLATEFORMES[String(pf ?? "")] ?? null;

/** Faut-il prévenir ? (pur) Une plateforme du Cloud, un état qui a le bouton. */
export const aPrevenir = (plateforme, etat) => Boolean(nomDe(plateforme)) && ETATS_A_PREVENIR.includes(String(etat ?? ""));

/** La notification (titre, corps, données). */
export function messageVerification(plateforme, etat, lang = "fr") {
  const nom = nomDe(plateforme) ?? "Une plateforme";
  const en = langueNotification(lang) === "en";
  const revenue = etat === "revenue";
  return {
    titre: en ? (revenue ? `${nom} asks for a check again` : `${nom} asks for a check`)
      : (revenue ? `${nom} redemande une vérification` : `${nom} demande une vérification`),
    corps: en
      ? `Open FillSell and tap "Solve the check", then slide it: ${nom} resumes on its own. Your other platforms keep going.`
      : `Ouvre FillSell et appuie sur « Résoudre la vérification », puis fais-la glisser : ${nom} reprend tout seul. Tes autres plateformes continuent.`,
    donnees: { type: "cloud_verification", plateforme: String(plateforme ?? ""), etat: String(etat ?? "") },
  };
}

/** Le mail (pur) : { sujet, titre, preheader, paragraphes, bouton, raisonEnvoi, lang }. */
export function mailVerification(plateforme, etat, lang = "fr", lienApp = "https://fillsell.app/app") {
  const nom = nomDe(plateforme) ?? "Une plateforme";
  const en = langueNotification(lang) === "en";
  const m = messageVerification(plateforme, etat, lang);
  return {
    lang: en ? "en" : "fr",
    sujet: en ? `${m.titre} on FillSell Cloud` : `${m.titre} sur FillSell Cloud`,
    titre: m.titre,
    preheader: en ? `Solve it from the app: ${nom} resumes on its own.` : `Résous-la depuis l'app : ${nom} reprend tout seul.`,
    paragraphes: en
      ? [`${nom} asked your FillSell Cloud browser for an anti-bot check. It's normal and quick: you slide it, from your phone.`,
        `Open FillSell and tap "Solve the check". Until then, only ${nom} is paused — your other platforms keep going.`]
      : [`${nom} a demandé une vérification anti-robot à ton navigateur FillSell Cloud. C'est normal et rapide : tu la fais glisser, depuis ton téléphone.`,
        `Ouvre FillSell et appuie sur « Résoudre la vérification ». D'ici là, seul ${nom} est en pause — tes autres plateformes continuent.`],
    bouton: { texte: en ? "Open FillSell" : "Ouvrir FillSell", url: lienApp },
    raisonEnvoi: en
      ? "You're receiving this email because FillSell Cloud publishes your listings and a check is waiting for you (no device received the notification)."
      : "Tu reçois ce mail parce que FillSell Cloud publie tes annonces et qu'une vérification t'attend (aucun appareil n'a reçu la notification).",
  };
}

/** Le mail part-il ? (pur) Seulement sans push reçu, et seulement si l'interrupteur coin_config « cloud_verification_mail » vaut 1. */
export function decisionMail({ pushEnvoye, interrupteur }) {
  if (pushEnvoye) return { envoyer: false, motif: "push_recu" };
  if (String(interrupteur ?? "").trim() !== "1") return { envoyer: false, motif: "mail_coupe" };
  return { envoyer: true, motif: null };
}
