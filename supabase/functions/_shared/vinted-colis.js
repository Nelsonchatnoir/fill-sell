// ═══════════════════════════════════════════════════════════════════════════
// LE FORMAT DE COLIS QUE LE FORMULAIRE DE VINTED NE PROPOSE PLUS (02/10)
// ═══════════════════════════════════════════════════════════════════════════
// lohanobert59 (montres, catalog_id 97) : depuis fin septembre, le formulaire
// de Vinted ne rend plus la section « Format du colis » pour ce rayon, et son
// serveur exige pourtant le champ — POST /api/v2/item_upload/items → 400
// `package_size` « Sélectionne le format de ton colis ». La « Montre à
// gousset » a été retirée (une-passe) puis jamais recréée ; la « Montre
// Zenith » ne s'est jamais publiée. Les messages promettaient une reprise
// (« on réessaie tout seuls vers 10:59 ») ou avouaient ne rien savoir, alors
// que la cause était connue et que la boucle ne pouvait pas aboutir : même
// poste, même code, même POST sans format.
//
// LE CORRECTIF EST DANS L'EXTENSION (0.6.84, a078d73) : le format CONNU part
// dans le corps du POST quand la page l'oublie, et la une-passe ne retire plus
// tant qu'il n'est pas posable. Ici, la règle serveur :
//   · un refus `package_size` d'un poste plus ancien → le job attend un poste
//     qui porte le correctif (build_min_requis), message vrai, aucun geste ;
//   · un refus d'un poste À JOUR (le format a été envoyé, Vinted l'a refusé
//     quand même) → pas de boucle : publication arrêtée, message vrai ;
//   · tant qu'un poste ancien polle, les retraits Vinted d'un rayon où ce refus
//     a été vu ne lui sont PAS servis (il retirerait sans pouvoir remettre) ;
//   · l'envoi direct est « prouvé » dès qu'un POST où la sonde a posé le format
//     a été accepté (colis_pose_envoi.http = 200) et qu'aucun n'a été refusé
//     depuis : la 0.6.84 retire alors même sans la section.
// Pur, sans import réseau (Deno + Node).

// Horodatage du commit du correctif (a078d73) : tout build produit depuis
// porte un BUILD_ID plus récent (même règle que BUILD_BEEBS_ADRESSE_STRICTE).
export const BUILD_COLIS_DANS_ENVOI = "2026-10-02T07:47:43Z";
export const VERSION_COLIS_DANS_ENVOI = "0.6.84";
export const RETENUE_COLIS_ANCIEN_POSTE = "colis_non_propose_ancien_poste";

/** Le texte porte-t-il un refus Vinted sur le format de colis ? */
export function refusColisVinted(texte) {
  const t = String(texte ?? "");
  // Postes ≤ 0.6.83 : le code du champ (« package_size ») ; 0.6.84 : la phrase.
  return (/package_size/i.test(t) && /(400|Champ exigé par Vinted|Vinted exige|format de ton colis|format du colis)/i.test(t))
    || /Vinted exige le format du colis/i.test(t);
}

/** Le format avait-il été envoyé directement (et refusé quand même) ? */
export function colisEnvoyeEtRefuse(texte) {
  return /package_size_id POSÉ dans le corps|envoyé directement, refusé quand même|refusé celui que nous lui avons envoyé/i.test(String(texte ?? ""));
}

export function messageColisAttendMiseAJour(action) {
  const retiree = action === "republish";
  return (retiree
    ? "Ton annonce a été retirée de Vinted et n'est pas encore revenue en ligne : Vinted exige le format du colis, "
    : "Ta publication Vinted n'a pas abouti, rien n'a été publié : Vinted exige le format du colis, ") +
    "que son formulaire ne propose plus pour ce rayon. La nouvelle version de l'extension FillSell l'envoie directement : " +
    `${retiree ? "la remise en ligne" : "la publication"} repartira toute seule dès qu'elle sera installée sur ton ordinateur ` +
    "(Chrome la met à jour tout seul). Rien n'est perdu, rien à faire de ton côté.";
}

export function messageColisRefuseMemeEnvoye(action) {
  return action === "republish"
    ? "Ton annonce a été retirée de Vinted et n'est pas encore revenue en ligne : Vinted exige le format du colis, que son " +
      "formulaire ne propose pas pour ce rayon, et a refusé celui que nous lui avons envoyé. Rien n'est perdu : toutes ses " +
      "données sont sauvegardées. C'est de notre côté, rien à faire : nouvel essai automatique dans 6 h."
    : "Ta publication Vinted n'a pas abouti, rien n'a été publié : Vinted exige le format du colis, que son formulaire ne " +
      "propose pas pour ce rayon, et a refusé celui que nous lui avons envoyé. La publication est arrêtée sur Vinted pour cet article.";
}

/**
 * L'envoi direct du format est-il prouvé ? `preuves` = lignes
 * { http, le } lues dans platform_fields.colis_pose_envoi (tous comptes).
 * Prouvé = au moins un 200, et aucun refus (≥ 400) plus récent que le dernier 200.
 */
export function envoiColisProuve(preuves) {
  const l = (Array.isArray(preuves) ? preuves : [])
    .map((p) => ({ http: Number(p?.http), le: Date.parse(String(p?.le ?? "")) }))
    .filter((p) => Number.isFinite(p.http) && Number.isFinite(p.le));
  const ok = l.filter((p) => p.http >= 200 && p.http < 300).map((p) => p.le);
  if (!ok.length) return false;
  const dernierOk = Math.max(...ok);
  return !l.some((p) => p.http >= 400 && p.le > dernierOk);
}
