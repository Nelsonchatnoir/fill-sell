export type DepotBeebsSansIdentite = {
  id: string;
  user_id: string;
  inventaire_id: number | string | null;
};

export type ReleveBeebsExact = {
  job_id: string | null;
  user_id: string;
  inventaire_id: number | string | null;
  listing_id: string | null;
  disparu_le: string | null;
  source_rapprochement: string | null;
};

export type VerdictLienBeebs =
  | { ok: true; id: string; preuve: "job_id_exact" | "inventaire_confirme_par_utilisateur" }
  | { ok: false; raison: "absent" | "ambigu" | "inventaire_ambigu" };

function idsUniques(lignes: ReleveBeebsExact[]): string[] {
  return [...new Set(
    lignes
      .filter((ligne) => ligne.disparu_le == null)
      .map((ligne) => String(ligne.listing_id ?? "").trim())
      .filter((id) => /^\d+$/.test(id)),
  )];
}

/**
 * Rattache un dépôt historique uniquement avec une identité Beebs exacte.
 *
 * Deux preuves sont recevables :
 * - le relevé porte déjà le job_id exact du dépôt ;
 * - la personne a confirmé que la fiche importée est le même article
 *   (`source_rapprochement = manuel`) et il n'existe qu'un seul dépôt sans
 *   identité sur cette fiche. L'identifiant vient toujours du relevé Beebs.
 *
 * Le titre, le prix, les photos et la proximité temporelle ne sont même pas
 * des entrées de cette fonction : ils ne peuvent donc pas devenir une preuve.
 */
export function choisirIdentifiantBeebsExact(
  depot: DepotBeebsSansIdentite,
  releves: ReleveBeebsExact[],
  depotsSansIdentiteSurInventaire: number,
): VerdictLienBeebs {
  const memesUtilisateur = releves.filter((ligne) => ligne.user_id === depot.user_id);
  const directs = idsUniques(memesUtilisateur.filter((ligne) => ligne.job_id === depot.id));
  if (directs.length > 1) return { ok: false, raison: "ambigu" };
  if (directs.length === 1) return { ok: true, id: directs[0], preuve: "job_id_exact" };

  if (depot.inventaire_id == null) return { ok: false, raison: "absent" };
  if (depotsSansIdentiteSurInventaire !== 1) {
    return { ok: false, raison: "inventaire_ambigu" };
  }

  const inventaire = String(depot.inventaire_id);
  const confirmes = idsUniques(memesUtilisateur.filter((ligne) =>
    ligne.source_rapprochement === "manuel"
    && ligne.inventaire_id != null
    && String(ligne.inventaire_id) === inventaire
  ));
  if (confirmes.length > 1) return { ok: false, raison: "ambigu" };
  if (confirmes.length === 1) {
    return { ok: true, id: confirmes[0], preuve: "inventaire_confirme_par_utilisateur" };
  }
  return { ok: false, raison: "absent" };
}
