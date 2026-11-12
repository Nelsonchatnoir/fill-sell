// ═══════════════════════════════════════════════════════════════════════════
// UN ARTICLE ÉPUISÉ NE PART JAMAIS — LA GARDE D'EXÉCUTION (12/11/2026, point 2 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur (compte 6e3d92b3, Pro) : vente Vinted le 11/11 à 23:06 → fiche « vendu », quantité 0 ; la cascade de la
// vente (enregistrer_vente_atomique) arrête la publication Leboncoin et arme le retrait eBay, mais laisse en file la
// republication Vinted fac6fdef de l'annonce VENDUE elle-même (la plateforme de la vente était écartée de la boucle).
// Elle ne serait pas partie : la garde de SERVICE de get-pending-jobs (« UN ARTICLE VENDU N'EST JAMAIS PUBLIÉ NI
// REPUBLIÉ », 25/09) la retient au premier poll. Mais une tâche servie avant la vente et démarrée après passait.
//
// LA RÈGLE (Nico, 12/11) : jamais de publication ni de republication d'un article vendu dont la quantité est à 0 ;
// un article en plusieurs exemplaires dont il reste une quantité n'est jamais bloqué.
//   · épuisé = fiche « vendu » OU quantité ≤ 0 — la MÊME définition que la garde de service de get-pending-jobs
//     (statut 'vendu' OU quantite ≤ 0). Une vente partielle laisse la fiche « stock » avec sa quantité restante
//     (enregistrer_vente_atomique) : elle n'est jamais épuisée ici ;
//   · au DÉMARRAGE (la tâche passe de « pending » à « processing » : update-job-status pour l'extension et le Cloud,
//     ebay-api-worker pour eBay par l'API) : rien ne part, la tâche est retenue en « article vendu » (needs_user), sans
//     rien supprimer — exactement ce que fait la garde de service. La règle « sans objet » de handler-watch
//     (_shared/questions-tranchees.ts) l'arrête ensuite si la vente est enregistrée ; une quantité 0 sans vente reste la
//     question (la personne corrige la quantité et relance), comme depuis le 25/09.
//   · une écriture en cours de route (tâche déjà « processing ») n'est jamais refusée ici : une annonce partie doit
//     être suivie, et les gardes de l'étape (annonce vendue relue avant le retrait) font le reste.
// Pur, sans import : update-job-status, ebay-api-worker (Deno), le verrou (Node).

export const SOURCE_ARTICLE_VENDU = "article_vendu";

/** Une publication ou une republication (jamais un retrait : ce sont eux qui protègent de la double vente). */
export function estPublicationOuRepublication(action) {
  return action == null || action === "publish" || action === "republish";
}

/** La fiche est épuisée : « vendu », ou quantité connue ≤ 0. Fiche illisible (null) : rien n'est décidé ici. */
export function ficheEpuisee(fiche) {
  if (!fiche || typeof fiche !== "object") return false;
  if (String(fiche.statut ?? "") === "vendu") return true;
  const q = fiche.quantite;
  return q != null && q !== "" && Number.isFinite(Number(q)) && Number(q) <= 0;
}

/** La tâche est-elle au démarrage, là où la garde s'applique ? (statut en base « pending », écriture « processing ») */
export function demarrageAGarder({ action, statutEnBase, statutDemande, inventaireId }) {
  return statutDemande === "processing" && statutEnBase === "pending"
    && estPublicationOuRepublication(action) && inventaireId != null;
}

/** Le message de la tâche retenue — le texte de la garde de service de get-pending-jobs, mot pour mot. */
export function messageArticleVendu(fiche) {
  return "Cet article est marqué vendu" + (String(fiche?.statut ?? "") !== "vendu" ? " (quantité 0)" : "") +
    " : on ne le publie pas, pour ne jamais le vendre deux fois. Si la vente n'a pas eu lieu, " +
    "corrige-la dans l'app (supprime la vente ou remets une quantité), puis relance.";
}

/** Les champs de la tâche retenue (même forme que get-pending-jobs), sans la marque de travail en cours. */
export function champsArticleVendu(pf, fiche, posePar, le = new Date().toISOString()) {
  const out = {
    ...((pf && typeof pf === "object") ? pf : {}),
    needs_user_source: SOURCE_ARTICLE_VENDU,
    article_vendu: { le, statut: fiche?.statut ?? null, quantite: fiche?.quantite ?? null, pose_par: posePar },
  };
  delete out.processing_since;
  return out;
}

/** La réponse 409 au démarrage refusé (l'extension la lit comme « skipped » : rien n'est fait, rien n'est réécrit). */
export const MESSAGE_DEMARRAGE_ARTICLE_VENDU =
  "Démarrage refusé : cet article est vendu (quantité 0). Rien n'a été publié ni supprimé ; la tâche attend dans « À régler ».";
