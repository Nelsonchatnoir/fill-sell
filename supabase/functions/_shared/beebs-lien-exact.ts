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

export type PublicationBeebsConfirmee = {
  publishedAt: string;
  platformFields: Record<string, unknown>;
};

/**
 * Revient au comportement sûr d'avant le lot 1 quand Beebs a confirmé le
 * dépôt mais n'a rendu aucun identifiant : le dépôt est terminal (il ne doit
 * surtout pas être resoumis), tandis que son lien reste explicitement en
 * attente. Ce marqueur n'est posé qu'après la redirection de succès.
 */
export function restaurerPublicationBeebsConfirmee(
  platformFields: Record<string, unknown> | null | undefined,
): PublicationBeebsConfirmee | null {
  const pf = { ...(platformFields ?? {}) };
  const attente = pf["attente_identifiant_beebs"];
  if (!attente || typeof attente !== "object" || Array.isArray(attente)) return null;
  const brut = String((attente as Record<string, unknown>)["depot_confirme_le"] ?? "").trim();
  const timestamp = Date.parse(brut);
  if (!Number.isFinite(timestamp)) return null;

  const publishedAt = new Date(timestamp).toISOString();
  const depuisBrut = String((attente as Record<string, unknown>)["depuis"] ?? brut).trim();
  const depuisTimestamp = Date.parse(depuisBrut);
  const depuis = Number.isFinite(depuisTimestamp) ? new Date(depuisTimestamp).toISOString() : publishedAt;
  delete pf["attente_identifiant_beebs"];
  delete pf["processing_since"];
  pf["lien_en_attente"] = {
    depuis,
    echeance: new Date(timestamp + 7 * 86_400_000).toISOString(),
    plateforme: "beebs",
    motif: "dépôt confirmé par Beebs sans lien ni identifiant — annonce non retirable en l'état",
  };
  pf["retour_arriere_attente_identifiant_beebs"] = {
    at: new Date().toISOString(),
    depot_confirme_le: publishedAt,
    motif: "l'identifiant exact n'est pas rendu par le dépôt ni rattaché par le relevé",
  };
  return { publishedAt, platformFields: pf };
}

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
