// ═══════════════════════════════════════════════════════════════════════════
// UNE REPUBLICATION ARRÊTÉE SUR UNE VALEUR QUE SON ANNONCE PORTE : JAMAIS UNE IMPASSE (13/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Lot « zéro problème », étape 5 (question 3 de l'agent C). update-job-status reprend deux fois un pré-vol négatif de
// republication Vinted dont la capture PORTE la valeur refusée (taille, état, marque, couleur), puis s'arrêtait :
//   · valeur hors de la liste servie (État, plusieurs champs, grille adulte sur une taille enfant) → la liste RETIRÉE et
//     « Relance depuis l'app ; si ça se reproduit, écris-nous » : une impasse ;
//   · valeur DANS la liste (la saisie n'a pas pris) → « on reprend au prochain passage » : rien ne reprenait (la relance
//     après mise à jour ne joue plus pour un arrêt écrit par un build qui a déjà le correctif — point 1c).
// Cas réels : 7d6e2c34 · 6afcb6e8 (État « Bon état », 0.6.169), ae593eaf · 39201deb (« Neuf sans étiquette »),
// cdf7007c · e8e1cd5a (Taille + État), 68e350f0 ×3 (0.6.149), 48dd94f7 · ec5b7f25 (Montres), f3407ada (grille femme
// servie sur « 12 ans / 152 cm »). Seule la taille hors grille avait sa question (point 1c, vinted-taille-hors-grille.js).
// LA RÈGLE (Nico, 12/11) : UNE vraie question avec la liste quand elle est connue ; sinon un message vrai qui dit quoi
// faire ; jamais « écris-nous » comme seule sortie. Dans l'ordre :
//   1. une relance après mise à jour couvre l'arrêt (relance-apres-maj.js : build de l'arrêt plus ancien que le
//      correctif) → son message d'attente, la source « grille_incoherente » gardée — handler-watch relance au build ;
//   2. grille ADULTE servie sur une taille ENFANT → aucune liste (elle ferait choisir faux) : ce qui s'est passé, le rayon
//      de l'annonce, et quoi faire (vérifier le rayon sur Vinted, « Relancer ») ;
//   3. la liste du champ de la question est connue → UNE question (champ_a_choisir), la liste ENTIÈRE, en tête :
//      la valeur de l'annonce telle que Vinted l'écrit (elle est dans la liste : la saisie n'a pas pris), sinon pour
//      l'état l'équivalent du JUGE UNIQUE (etat-correspondance.js, par niveau et identifiant de rayon), pour la taille
//      les voisines (même système, même nombre) — jamais une valeur devinée ; les autres champs refusés sont nommés
//      (une question à la fois : s'ils sont encore refusés, la même règle les pose) ;
//   4. sinon (aucune liste) → message vrai : « Relancer » fait un essai complet avant toute suppression ; si Vinted
//      montre alors sa liste, la question viendra avec elle.
// La cible de la réponse est celle de la question de l'extension (vintedAspects.<code> : propagée à la recréation et
// recopiée sur le champ dédié par vinted.js ; republish_user_fields.taille : get-pending-jobs la fait entrer dans la
// capture). Aucune règle ne cherche un mot : les listes sont celles que Vinted sert, l'état se juge par niveau.
// Pur : update-job-status (Deno) et scripts/grille-incoherente-jamais-impasse-selftest.mjs (Node).

import { etatDansLaGrille, rayonSansEtiquette } from "./etat-correspondance.js";
import { voisinesTaille } from "./vinted-taille-hors-grille.js";

const comparable = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const propre = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const LE_CHAMP = Object.freeze({ taille: "la taille", etat: "l'état", marque: "la marque", couleur: "la couleur" });
const DEBUT = "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. ";

/**
 * @param {{
 *   cles: string[], valeurs: Record<string, string>, nuf?: Record<string, any> | null, listeServie?: unknown[],
 *   champQuestion?: string, valeurOfferte?: boolean, grilleAdulteEnfant?: boolean, libelles: Record<string, string>,
 *   attenteMaj?: string | null, rayonId?: number | string | null, categorie?: unknown[] | null,
 * }} a
 * @returns {{ type: "question", needs_user_source: "champ_a_choisir", needsUserField: Record<string, unknown>,
 *   champs_a_completer: string[], en_tete: string[], raison: string, message: string }
 *   | { type: "message", needs_user_source: "grille_incoherente", raison: string, message: string }}
 */
export function issueGrilleIncoherente({
  cles = [], valeurs = {}, nuf = null, listeServie = [], champQuestion = "", valeurOfferte = false, grilleAdulteEnfant = false,
  libelles = {}, attenteMaj = null, rayonId = null, categorie = null,
} = {}) {
  const champs = (Array.isArray(cles) ? cles : []).map(String);
  const resume = champs.map((c) => `${libelles[c] ?? c} « ${propre(valeurs[c])} »`).join(", ");
  // 1. Une relance après mise à jour couvre l'arrêt : elle est la sortie (handler-watch relance dès que le poste a le build).
  if (typeof attenteMaj === "string" && attenteMaj.trim()) {
    return { type: "message", needs_user_source: "grille_incoherente", raison: "relance_apres_maj", message: attenteMaj };
  }
  const liste = (Array.isArray(listeServie) ? listeServie : []).map((v) => String(v ?? "")).filter((v) => v.trim());
  // 2. Grille adulte servie sur une taille enfant : la liste ferait choisir faux — jamais proposée.
  if (grilleAdulteEnfant === true) {
    const exemples = liste.slice(0, 3).map((o) => `« ${propre(o)} »`).join(", ");
    const rayon = Array.isArray(categorie) && categorie.length ? ` — ton annonce est rangée en « ${categorie.map(propre).join(" › ")} »` : "";
    return {
      type: "message", needs_user_source: "grille_incoherente", raison: "grille_adulte_taille_enfant",
      message: DEBUT +
        `Pour ta taille enfant « ${propre(valeurs.taille)} », le formulaire Vinted a proposé une grille de tailles adulte` +
        `${exemples ? ` (${exemples}…)` : ""} à chaque essai : il ne s'est pas ouvert sur un rayon enfant${rayon}. ` +
        "Vérifie le rayon de ton annonce sur Vinted et corrige-le s'il n'est pas en Enfants, puis appuie sur « Relancer » : " +
        "un nouvel essai complet est fait, et rien n'est retiré avant.",
    };
  }
  // 3. La liste du champ de la question est connue : UNE question.
  const champ = String(champQuestion ?? "");
  const valeur = propre(valeurs?.[champ]);
  if (nuf && typeof nuf === "object" && liste.length && champ && champs.includes(champ) && valeur) {
    let enTete = [];
    const exacte = liste.find((o) => comparable(o) === comparable(valeur));
    if (exacte) enTete = [exacte];
    else if (champ === "etat") {
      const e = etatDansLaGrille(valeur, liste, { plateforme: "vinted", sansEtiquette: rayonSansEtiquette({ plateforme: "vinted", rayonId }) });
      if (e) enTete = [e];
    } else if (champ === "taille") enTete = voisinesTaille(valeur, liste);
    const allowed = [...enTete, ...liste.filter((o) => !enTete.includes(o))].slice(0, 200);
    const libelle = libelles[champ] ?? champ;
    const leChamp = LE_CHAMP[champ] ?? `le champ « ${libelle} »`;
    const autres = champs.filter((c) => c !== champ);
    const suite = autres.length
      ? ` Vinted a aussi refusé ${autres.map((c) => `${libelles[c] ?? c} « ${propre(valeurs[c])} »`).join(", ")} : si c'est encore le cas après ta réponse, la question te sera posée de la même façon.`
      : "";
    const offerte = Boolean(exacte) || valeurOfferte === true;
    const message = offerte
      ? DEBUT + `Vinted propose bien ${libelle} « ${valeur} » pour ce rayon, mais notre saisie n'a pas pris sur son formulaire (trois essais) — ` +
        `ça vient de chez nous, pas de ton annonce. Confirme ${leChamp} dans la liste (« ${propre(enTete[0] ?? valeur)} » en tête) : ` +
        `ta réponse relance la republication, et rien n'est retiré avant.${suite}`
      : DEBUT + `Vinted n'accepte pas ${libelle} « ${valeur} » pour ce rayon. Choisis ${leChamp} de ton article dans la liste` +
        `${enTete.length ? ` (le plus proche en tête : ${enTete.slice(0, 3).map((o) => `« ${propre(o)} »`).join(", ")})` : ""} : ` +
        `ta réponse sert à republier cette annonce, et rien n'est retiré avant.${suite}`;
    return {
      type: "question", needs_user_source: "champ_a_choisir", raison: offerte ? "saisie_non_prise_vinted" : "valeur_hors_grille_vinted",
      en_tete: enTete, champs_a_completer: [champ], message,
      needsUserField: {
        ...nuf,
        allowed_values: allowed,
        voisines: enTete,
        raison: offerte ? "saisie_non_prise_vinted" : "valeur_hors_grille_vinted",
        target: nuf.target && typeof nuf.target === "object" && nuf.target.key
          ? nuf.target
          : { root: "vintedAspects", key: String(nuf.field_key ?? champ) },
      },
    };
  }
  // 4. Aucune liste connue : un message vrai qui dit quoi faire.
  return {
    type: "message", needs_user_source: "grille_incoherente", raison: "liste_inconnue",
    message: DEBUT +
      `Le formulaire Vinted n'a pas accepté ${resume || "une information de ton annonce"} (trois essais), sans montrer la liste de ce qu'il accepte. ` +
      "Appuie sur « Relancer » : un nouvel essai complet est fait, et rien n'est retiré avant ; si Vinted refuse encore en " +
      "montrant sa liste, tu choisiras dans cette liste.",
  };
}
