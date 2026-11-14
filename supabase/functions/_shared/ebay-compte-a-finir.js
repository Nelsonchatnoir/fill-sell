// ═══════════════════════════════════════════════════════════════════════════
// eBAY — « TON COMPTE N'EST PAS ENCORE PRÊT À VENDRE » : LE MESSAGE, LE GESTE, LE LIEN (14/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Point 5a de Nico (cliente Cloud af37fa49, iPhone) : eBay relié à 14:27, publications eBay en attente. Ce que l'app lui
// montrait :
//   · « … il reste à finir ton compte vendeur chez eBay (vérification ou inscription vendeur). C'est ici : — rien n'a
//     été envoyé à eBay… » — une cause que le serveur n'avait JAMAIS lue (seller_state vide : « rien de relevé » valait
//     « inscription vendeur »), et une phrase cassée (l'adresse est retirée du texte à l'affichage : « C'est ici : — ») ;
//   · « Me connecter », qui ouvrait « Connecter eBay — Chrome doit rester ouvert sur ton ordinateur » : le parcours pour
//     RELIER un compte, à une personne dont le compte est relié, et le vocabulaire « ordinateur » à une cliente Cloud ;
//   · depuis « À régler » : aucun lien, aucun geste, seulement « Relancer maintenant » (qui reparquait).
// LA RÈGLE, pour tous les comptes : le message NOMME ce qui manque (inscription vendeur, règles de paiement / retours /
// livraison, ville d'expédition), sans adresse dans le texte ; le geste est un bouton sous le message — l'écran eBay
// de FillSell (« Finir mon compte eBay », qui relève le compte et crée les règles sur un appui), et l'espace vendeur
// eBay (lien VÉRIFIÉ) ; jamais « Me connecter », jamais « ordinateur ». Les publications repartent seules : ebay-account
// à chaque geste dans l'app, et la relecture bornée d'ebay-api-worker si c'est fait sur eBay (_shared/ebay-voie.ts).
// Module PUR (aucun import) : lu par le serveur (ebay-voie.ts) et par l'app (utils/shared.js, utils/messagesServeur.js).
// ═══════════════════════════════════════════════════════════════════════════

// Liens VÉRIFIÉS (14/11, aide eBay « Conditions de vente » id=4212 : « Gestionnaire des conditions de vente » =
// https://www.ebay.fr/bp/manage ; Seller Hub /sh/ovw relevé le 10/09 et le 12/10).
export const LIEN_EBAY_ESPACE_VENDEUR = "https://www.ebay.fr/sh/ovw";
export const LIEN_EBAY_REGLES_DE_VENTE = "https://www.ebay.fr/bp/manage";

/** Les étapes qu'un message nomme, dans l'ordre où elles se disent. */
const ORDRE = ["politiques_activees", "politique_paiement", "politique_retours", "politique_livraison", "lieu_expedition"];
const REGLES = { politique_paiement: ["de paiement", "payment"], politique_retours: ["de retours", "returns"], politique_livraison: ["de livraison", "shipping"] };

const joindre = (parts, et) => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} ${et} ${parts[parts.length - 1]}`);

/** Ce qui manque, en mots (« tes règles de paiement, de retours et de livraison et ta ville d'expédition… »), ou "". */
export function listeAFinirEbay(manque, lang = "fr") {
  const en = lang === "en";
  const m = new Set(Array.isArray(manque) ? manque.map(String) : []);
  const regles = ORDRE.filter((c) => REGLES[c] && m.has(c)).map((c) => REGLES[c][en ? 1 : 0]);
  const parts = [];
  if (m.has("politiques_activees")) parts.push(en ? "your selling policies turned on" : "l'activation de tes conditions de vente");
  if (regles.length) parts.push(en ? `your ${joindre(regles, "and")} policies` : `tes règles ${joindre(regles, "et")}`);
  if (m.has("lieu_expedition")) parts.push(en ? "your shipping town (town and postcode)" : "ta ville d'expédition (ville et code postal)");
  // Entre les morceaux (règles, ville…), une virgule avant le dernier : « tes règles de paiement et de retours, et ta ville ».
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")}, ${en ? "and" : "et"} ${parts[parts.length - 1]}`;
}

const SUITE = { fr: "Rien n'a été envoyé à eBay, et tes annonces eBay partiront toutes seules dès que ton compte sera prêt.",
  en: "Nothing was sent to eBay, and your eBay listings will go out on their own as soon as your account is ready." };

/** Ce qui reste, par étape (« quoi » du message). */
function quoiAFinir(etape, lang) {
  const en = lang === "en";
  const liste = listeAFinirEbay(etape?.manque, lang);
  switch (etape?.etape) {
    case "plafond": return en
      ? "its selling limit is zero, and only eBay can lift it: open your eBay seller account (button “Open my eBay seller account”) to see what it is waiting for"
      : "son plafond de vente est à zéro, et c'est eBay qui le relève : ouvre ton compte vendeur eBay (bouton « Ouvrir mon compte vendeur eBay ») pour voir ce qu'il attend";
    case "vendeur": return en
      ? "set up your eBay seller account, your seller registration isn't finished (identity, account where your sales money is paid): tap “Finish my eBay seller account”"
      : "configure ton compte vendeur eBay, ton inscription vendeur n'est pas finie (identité, compte où recevoir l'argent de tes ventes) : appuie sur « Finir mon compte vendeur eBay »";
    case "retours": return en
      ? "you still need to choose, in Settings › eBay account, whether you accept returns"
      : "il reste à choisir, dans Réglages › Compte eBay, si tu acceptes les retours";
    case "conditions": return en
      ? `set up your eBay seller account, it is missing ${liste || "your payment, returns and shipping policies"}. FillSell can create your policies with the settings of your eBay listings: tap “Create my eBay policies”, nothing is created without your OK (or create them yourself in your eBay seller space)`
      : `configure ton compte vendeur eBay, il lui manque ${liste || "tes règles de paiement, de retours et de livraison"}. FillSell peut créer tes règles avec les réglages de tes annonces eBay : appuie sur « Créer mes conditions eBay », rien n'est créé sans ton accord (ou crée-les toi-même dans ton espace vendeur eBay)`;
    case "a_lire": return en
      ? "FillSell couldn't read yet what your eBay seller account is missing: open Settings › eBay account (button “Finish my eBay account”), it shows the step left"
      : "FillSell n'a pas encore pu lire ce qui manque sur ton compte vendeur eBay : ouvre Réglages › Compte eBay (bouton « Finir mon compte eBay »), il te montre l'étape qui reste";
    default: return en
      ? `finish its setup in FillSell, ${liste ? `still to set: ${liste}` : "a step is left"}: open Settings › eBay account (button “Finish my eBay account”), the step left is shown there`
      : `finis son réglage dans FillSell, ${liste ? `il reste ${liste}` : "il reste une étape"} : ouvre Réglages › Compte eBay (bouton « Finir mon compte eBay »), l'étape qui reste y est indiquée`;
  }
}

/** Le message « compte à finir » (FR, écrit en base ; EN pour l'affichage). Jamais d'adresse dans le texte. */
export function texteCompteEbayAFinir(etape, lang = "fr") {
  const en = lang === "en";
  return en
    ? `Your eBay account is linked to FillSell, but eBay doesn't let it sell yet: ${quoiAFinir(etape, "en")}. ${SUITE.en}`
    : `Ton compte eBay est bien relié à FillSell, mais eBay ne le laisse pas encore vendre : ${quoiAFinir(etape, "fr")}. ${SUITE.fr}`;
}

const DEBUT_FR = "Ton compte eBay est bien relié à FillSell, mais eBay ne le laisse pas encore vendre : ";
const ETAPES_CONNUES = ["plafond", "vendeur", "retours", "conditions", "a_lire", "parcours"];
const toutesLesListes = () => {
  // Toutes les combinaisons d'étapes nommables (2^5) : la traduction retrouve le message exact, jamais deviné.
  const out = [];
  for (let k = 0; k < (1 << ORDRE.length); k++) out.push(ORDRE.filter((_, i) => k & (1 << i)));
  return out;
};

/** La version anglaise d'un message « compte à finir » écrit par le serveur (le texte exact), ou null. */
export function traduireTexteCompteEbayAFinir(texte) {
  const t = String(texte ?? "");
  if (!t.startsWith(DEBUT_FR)) return null;
  for (const etape of ETAPES_CONNUES) {
    const listes = etape === "conditions" || etape === "parcours" ? toutesLesListes() : [[]];
    for (const manque of listes) {
      const e = { etape, manque };
      if (texteCompteEbayAFinir(e, "fr") === t) return texteCompteEbayAFinir(e, "en");
    }
  }
  return null;
}

/**
 * LE GESTE sous une publication parquée « compte à finir » (needs_user_source ebay_compte_a_finir), pour tous les
 * écrans — jamais « Me connecter » (le compte est relié), jamais « ordinateur ».
 *   action  'ebay_ouvrir_hub'      : le lien eBay seul (plafond, inscription vendeur : c'est chez eBay) ;
 *           'creer_conditions_ebay': « Créer mes conditions eBay » dans FillSell (décision de Nico du 04/11) ;
 *           'ouvrir_compte_ebay'   : l'écran eBay de FillSell (Réglages › Compte eBay : relève, choisit, ville) ;
 *   lien    { url, libelle } : l'espace vendeur eBay (vérifié), en second, ou null.
 *   aide    la phrase qui dit que tout repart seul.
 * Un lien n'est jamais pris hors de https://www.ebay.fr/.
 */
export function gesteCompteEbayAFinir(aFinir, lang = "fr") {
  const en = lang === "en";
  const etape = String(aFinir?.etape ?? "");
  const urlSure = (u, repli) => (typeof u === "string" && /^https:\/\/www\.ebay\.fr\//.test(u) ? u : repli);
  const aide = en ? "Once your eBay account is ready, your eBay listings go out on their own." : "Dès que ton compte eBay est prêt, tes annonces eBay partent toutes seules.";
  if (etape === "plafond" || etape === "vendeur") {
    const plafond = etape === "plafond";
    return {
      action: "ebay_ouvrir_hub",
      url: urlSure(aFinir?.url, LIEN_EBAY_ESPACE_VENDEUR),
      libelle: en ? (plafond ? "Open my eBay seller account" : "Finish my eBay seller account") : (plafond ? "Ouvrir mon compte vendeur eBay" : "Finir mon compte vendeur eBay"),
      aide: en
        ? (plafond ? "Once eBay lifts your selling limit, this listing goes out on its own." : "Once eBay lets your account sell, your eBay listings go out on their own.")
        : (plafond ? "Dès qu'eBay relève ton plafond de vente, cette annonce part toute seule." : "Dès qu'eBay laisse ton compte vendre, tes annonces eBay partent toutes seules."),
      lien: null,
    };
  }
  if (etape === "conditions") {
    return {
      action: "creer_conditions_ebay", url: null,
      libelle: en ? "Create my eBay policies" : "Créer mes conditions eBay",
      aide: en ? "FillSell creates them with the settings of your eBay listings: nothing is created without your OK." : "FillSell les crée avec les réglages de tes annonces eBay : rien n'est créé sans ton accord.",
      lien: { url: LIEN_EBAY_REGLES_DE_VENTE, libelle: en ? "Or create them myself on eBay" : "Ou les créer moi-même sur eBay" },
      apres: aide,
    };
  }
  // parcours, retours, a_lire, job d'avant sans étape : l'écran eBay de FillSell dit l'étape qui reste.
  return {
    action: "ouvrir_compte_ebay", url: null,
    libelle: en ? "Finish my eBay account" : "Finir mon compte eBay",
    aide,
    lien: etape === "" ? { url: LIEN_EBAY_ESPACE_VENDEUR, libelle: en ? "Open my eBay seller space" : "Ouvrir mon espace vendeur eBay" } : null,
  };
}
