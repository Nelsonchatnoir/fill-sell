// ═══════════════════════════════════════════════════════════════════════════
// LES MORCEAUX D'EXTENSION MIS DE CÔTÉ PAR LE RETOUR ARRIÈRE DU 28/09
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico, 28/09 au soir (9d8c2d4) : l'extension repart du code de
// la 0.6.75 ; ce que la 0.6.76 et les paquets 0.6.78 apportaient revient UN
// PAR UN, chacun prouvé par une vraie republication. Les selftests écrits
// pour ces morceaux sont restés rouges depuis — ils décrivaient un code qui
// n'était plus livré, et noyaient les vrais rouges (point 29 du 03/10).
//
// CE REGISTRE DIT CE QUI EST ENCORE DE CÔTÉ. Les tests concernés le lisent :
//   · tant qu'un morceau est listé ici, son test vérifie qu'il est bien
//     ABSENT du code livré (le registre ne ment pas) et garde ses assertions
//     d'origine sans les exécuter ;
//   · le jour où le code revient, ce contrôle TOMBE : on retire la ligne
//     d'ici, avec la preuve réelle (job, date) dans le message de commit — et
//     les assertions d'origine reprennent, telles qu'elles ont été écrites.
// `remplace` : le morceau ne reviendra pas, une décision postérieure l'a
// remplacé (le test le dit et renvoie au test qui garde la nouvelle règle).
//
// Morceaux déjà REVENUS le 03/10 (retirés de ce registre) : tailles Vinted du
// point G (âges anglais, pays gardé), mur de boutique nommé et
// preuve_manquante (0.6.78), relevé borné et tenu éveillé (8b6f539).

export const MORCEAUX = {
  "recreation-par-redirection": {
    etat: "mis_de_cote",
    origine: "99782e6 + 67d6749 (0.6.78, 28/09)",
    quoi: "la recréation Vinted se rattache par l'identifiant vu dans la redirection de notre onglet de dépôt",
    pourquoi: "jamais prouvé en réel (2e essai du 28/09, Sweat Tommy : aucun identifiant vu) ; la règle 0.6.75 rétablie le 28/09 (décision Nico) rattache déjà la recréation unique",
    pour_revenir: "une vraie republication Vinted dont la recréation est rattachée par recreation_redirection",
  },
  "recreation-sans-doublon-0678": {
    etat: "mis_de_cote",
    origine: "67d6749 (0.6.78, 28/09)",
    quoi: "gardes anti-doublon de la recréation : la une-passe compte comme tentative (recreation_tentee), une recréation déjà importée en fiche séparée n'en appelle pas une 3e, la question liste les candidates",
    pourquoi: "jamais servi ; la règle 0.6.75 garde l'essentiel (dressing relu avant toute recréation quand l'onglet répond ; plusieurs candidates = pause, rien recréé)",
    pour_revenir: "une vraie republication Vinted coupée après soumission, reprise sans seconde annonce",
  },
  "copie-avant-retrait-point-d": {
    etat: "mis_de_cote",
    origine: "078ee88 (0.6.76, point D)",
    quoi: "pré-vol de republication plus strict : description exigée dans la copie Vinted ; sur Leboncoin, un lien d'annonce ne remplace plus la catégorie, un compteur de photos ne remplace plus les images",
    pourquoi: "jamais servi ; risque de bloquer des republications Leboncoin qui marchent (imports du relevé sans photo ni catégorie sur le job) ; 0 retrait Leboncoin resté sans recréation sur 7 jours au 03/10",
    pour_revenir: "republications Leboncoin d'annonces importées prouvées en réel avec le pré-vol strict",
  },
  "file-par-article-extension": {
    etat: "mis_de_cote",
    origine: "078ee88 (0.6.76, point D)",
    quoi: "le miroir extension de recreationRetientFile : une question en attente ne retient plus toute la file",
    pourquoi: "la partie serveur est livrée (get-pending-jobs, _shared/file-republication.js) ; la partie extension n'a jamais été servie",
    pour_revenir: "une file réelle où une question en attente laisse partir les autres articles",
  },
  "identifiant-annonce-strict": {
    etat: "mis_de_cote",
    origine: "078ee88 (0.6.76, point D)",
    quoi: "extractListingId strict : domaine de la plateforme exigé, page de membre ou de recherche Beebs jamais lue comme une annonce",
    pourquoi: "fonction centrale (retraits, rattachements) ; aucune adresse de ce genre dans les jobs vivants au 03/10 (Beebs 1 260 « /p/<id> », Vinted 56 280 « /items/<id> »)",
    pour_revenir: "un retrait réel Vinted ET Beebs avec la version stricte",
  },
  "colis-strict-point-d": {
    etat: "remplace",
    origine: "078ee88 (0.6.76, point D)",
    quoi: "selectPackageSize({ strict }) : format de colis inconnu = aucun retrait",
    pourquoi: "remplacé par la décision de Nico du 02/10 (b69f2cd) : un format inconnu ou non offert est DEMANDÉ à la personne avant tout retrait — gardé par selftest:vinted-colis-envoi",
  },
  "poste-instance": {
    etat: "mis_de_cote",
    origine: "f6dd466 (0.6.76, point C)",
    quoi: "identifiant d'installation stable par poste (identifiantInstallation)",
    pourquoi: "la partie serveur (réservation compatible) est appliquée et accepte les anciennes extensions ; la partie extension n'a jamais été servie",
    pour_revenir: "deux postes réels qui se partagent la file sans se voler un job",
  },
  "vente-deux-lectures": {
    etat: "mis_de_cote",
    origine: "a3e8a17 (0.6.76, point E)",
    quoi: "un signal de vente du relevé Vinted ne vaut qu'après deux lectures espacées",
    pourquoi: "jamais servi ; aujourd'hui le relevé ne fait que POSER le drapeau sur le job, la vente s'écrit au geste de la personne (bandeau « Vendue sur Vinted »)",
    pour_revenir: "deux relevés réels d'une même vente, espacés, avant le drapeau",
  },
};

/**
 * Le contrôle commun. Rend `true` quand le morceau est REVENU (absent du
 * registre) : le test exécute alors ses assertions d'origine. Rend `false`
 * quand il est de côté : le test vérifie seulement que le code livré ne le
 * porte pas, et le dit.
 * @param {string} id
 * @param {boolean} presentDansLeCode — ce que le test lit dans le code livré
 * @param {(cond: boolean, nom: string, detail?: string) => void} ok
 */
export function morceauRevenu(id, presentDansLeCode, ok) {
  const m = MORCEAUX[id];
  if (!m) return true;
  const libelle = m.etat === "remplace" ? "remplacé" : "mis de côté le 28/09";
  ok(!presentDansLeCode,
    `⏸ ${id} — ${libelle} (${m.origine}) : absent du code livré`,
    presentDansLeCode
      ? `le code est revenu : retire « ${id} » de scripts/lib/morceaux-mis-de-cote.mjs avec sa preuve réelle (${m.pour_revenir ?? "cf. registre"})`
      : "");
  return false;
}
