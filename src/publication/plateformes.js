// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT D'UNE PLATEFORME POUR CET ARTICLE — UNE DÉCISION, DEUX LECTEURS (01/10)
// ═══════════════════════════════════════════════════════════════════════════
// « Où publier ? » dessine la ligne, le pied de page choisit le bouton. Avant
// le 01/10 les deux comptaient chacun de leur côté : la ligne était grisée
// (déjà en ligne, catégorie refusée…) pendant que le bouton comptait encore
// `selected` — et rien ne disait qu'il n'y avait rien à publier (aspirateur
// iLife de Nico : en ligne sur 4 plateformes, Beebs refuse la catégorie).
//
// Les classes, dans l'ordre de priorité des phrases de la ligne :
//   · « fait »    : déjà en ligne, ou une publication est en cours ;
//   · « refus »   : la plateforme n'accepte pas l'article (catégorie absente ou
//                   interdite), ou elle n'est pas encore ouverte ;
//   · « geste »   : bloquée par quelque chose que la personne peut lever
//                   (compte eBay, pause, attente d'un champ ou d'une connexion) ;
//   · « cochable ».
// Aucune règle neuve : ce sont exactement les conditions qui grisaient la case.
// La règle partagée elle-même (utils/oplaAcces ne fait que la ré-exporter) :
// ce module reste pur, sans client Supabase — le selftest l'exécute sous Node.
import { parcageDepasse } from "../../supabase/functions/_shared/acces-opla.js";
import { NOM } from "./texte";

export function etatPlateforme(p, m) {
  const support = m.platformSupport?.[p] ?? "supported";
  const dejaEnLigne = m.publishedSet.has(p);
  const enCours = !dejaEnLigne && m.queuedSet.has(p);
  const attente = m.attentes?.[p];
  const enAttente = !dejaEnLigne && !enCours && Boolean(attente?.bloque);
  // Parcage « Autoriser Opla » dépassé par la preuve d'accès : il repart seul.
  const repartSeule = enAttente && attente.kind === "attente_autorisation" && parcageDepasse(attente.job, m.oplaAccesDetail);
  const compteAbsent = p === "ebay" && m.ebayBloque;
  const enPause = m.pausedPlatforms.includes(p);
  const pasEncoreOuverte = m.plateformesAVenir.includes(p) && !m.plateformesOuvertes.includes(p);
  const fermeeCategorie = m.categorieFermee(support);
  const disabled = pasEncoreOuverte || fermeeCategorie || dejaEnLigne || enCours || enAttente || compteAbsent || enPause;
  let classe = "cochable";
  if (pasEncoreOuverte) classe = "refus";
  else if (dejaEnLigne || enCours || repartSeule) classe = "fait";
  else if (enAttente || compteAbsent) classe = "geste";
  else if (fermeeCategorie) classe = "refus";
  else if (enPause) classe = "geste";
  return {
    p, support, classe, disabled, cochee: !disabled && m.selected.has(p),
    dejaEnLigne, enCours, enAttente, repartSeule, attente, compteAbsent, enPause, pasEncoreOuverte, fermeeCategorie,
  };
}

/** Toutes les plateformes affichées, rangées par classe. */
export function bilanPlateformes(m) {
  const etats = m.plateformesAffichees.map(p => etatPlateforme(p, m));
  return {
    etats,
    cochables: etats.filter(e => e.classe === "cochable").map(e => e.p),
    cochees: etats.filter(e => e.cochee).map(e => e.p),
    fait: etats.filter(e => e.classe === "fait"),
    refus: etats.filter(e => e.classe === "refus"),
    geste: etats.filter(e => e.classe === "geste"),
  };
}

function liste(noms, en) {
  if (noms.length <= 1) return noms.join("");
  return `${noms.slice(0, -1).join(", ")} ${en ? "and" : "et"} ${noms[noms.length - 1]}`;
}

/**
 * Rien n'est cochable : ce que l'écran dit, une ligne par cas. `null` quand
 * au moins une plateforme peut partir.
 */
export function rienAPublier(bilan, lang = "fr") {
  if (bilan.cochables.length) return null;
  const en = lang === "en";
  const lignes = [];
  const enLigne = bilan.fait.filter(e => e.dejaEnLigne).map(e => NOM(e.p));
  const enCours = bilan.fait.filter(e => !e.dejaEnLigne).map(e => NOM(e.p));
  if (enLigne.length) lignes.push(en ? `Already online on ${liste(enLigne, en)}.` : `Déjà en ligne sur ${liste(enLigne, en)}.`);
  if (enCours.length) lignes.push(en ? `Already being published on ${liste(enCours, en)}.` : `Publication déjà en cours sur ${liste(enCours, en)}.`);
  for (const e of bilan.refus) {
    if (e.pasEncoreOuverte) lignes.push(en ? `${NOM(e.p)} isn't open yet.` : `${NOM(e.p)} n'est pas encore ouverte.`);
    else if (e.support === "prohibited") lignes.push(en ? `${NOM(e.p)} refuses this item.` : `${NOM(e.p)} refuse cet article.`);
    else lignes.push(en ? `${NOM(e.p)} has no category for this item.` : `${NOM(e.p)} n'a pas de catégorie pour cet article.`);
  }
  for (const e of bilan.geste) {
    lignes.push(en ? `${NOM(e.p)} is waiting for you: see its line below.` : `${NOM(e.p)} attend un geste de ta part : vois sa ligne ci-dessous.`);
  }
  // Un geste peut débloquer une plateforme : ce n'est pas « rien à publier »,
  // c'est « rien pour l'instant ».
  const titre = bilan.geste.length
    ? (en ? "Nothing can go out right now" : "Rien ne peut partir pour l'instant")
    : (en ? "Nothing to publish for this item" : "Rien à publier pour cet article");
  return { titre, lignes, attendGeste: bilan.geste.length > 0 };
}
