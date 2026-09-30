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

export const BEEBS_PREUVE_STRICTE_DEPUIS = "2026-09-29T20:13:00.000Z";

export type LienBeebsAConfirmer = {
  idCandidat: string;
  urlCandidate: string;
  platformFields: Record<string, unknown>;
};

type DepotBeebsAvecLienRecupere = {
  created_at: string;
  listing_url: string | null;
  platform_listing_id: string | null;
  platform_fields: Record<string, unknown> | null;
};

/**
 * `listing_url_recovery` vient d'une recherche par titre dans les anciennes
 * extensions : c'est une piste, jamais une identité. Depuis l'incident du
 * 29/09, on la remet en attente de la réponse « Est-ce cette annonce ? ».
 * Les lignes historiques antérieures restent hors de ce correctif d'urgence.
 */
export function mettreLienBeebsRecupereEnAttenteConfirmation(
  depot: DepotBeebsAvecLienRecupere,
  maintenant = new Date().toISOString(),
): LienBeebsAConfirmer | null {
  if (/^\d+$/.test(String(depot.platform_listing_id ?? "").trim())) return null;
  const url = String(depot.listing_url ?? "").trim();
  const id = url.match(/^https:\/\/(?:www\.)?beebs\.app\/fr\/p\/(\d+)(?:[-/?#]|$)/i)?.[1] ?? null;
  if (!id) return null;
  const pf = { ...(depot.platform_fields ?? {}) };
  const recovery = pf["listing_url_recovery"];
  const attente = pf["lien_en_attente"];
  if (!recovery || typeof recovery !== "object" || Array.isArray(recovery)) return null;
  if (!attente || typeof attente !== "object" || Array.isArray(attente)) return null;
  if (pf["lien_par_releve_exact"]) return null;
  const rattachement = pf["rattachement"];
  if (rattachement && typeof rattachement === "object" && !Array.isArray(rattachement)
      && (rattachement as Record<string, unknown>)["par"] === "utilisateur") return null;
  const creation = Date.parse(depot.created_at);
  const marqueurNouveau = pf["identifiant_beebs_non_prouve"];
  if (!(Number.isFinite(creation) && creation >= Date.parse(BEEBS_PREUVE_STRICTE_DEPUIS))
      && !(marqueurNouveau && typeof marqueurNouveau === "object" && !Array.isArray(marqueurNouveau))) return null;

  const attenteObjet = attente as Record<string, unknown>;
  pf["identifiant_beebs_non_prouve"] = {
    depuis: String((marqueurNouveau as Record<string, unknown> | undefined)?.["depuis"]
      ?? attenteObjet["depuis"] ?? maintenant),
    preuve_attendue: "identifiant du relevé confirmé par la personne",
  };
  pf["candidat_identifiant_beebs"] = {
    id, url, vu_le: maintenant, source: "listing_url_recovery_par_titre_non_probante",
  };
  pf["lien_en_attente"] = {
    ...attenteObjet,
    motif: "annonce candidate trouvée — confirmation « Est-ce cette annonce ? » requise avant tout retrait",
  };
  return { idCandidat: id, urlCandidate: url, platformFields: pf };
}

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
  pf["identifiant_beebs_non_prouve"] = {
    depuis: publishedAt,
    preuve_attendue: "identifiant du relevé confirmé par la personne",
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

// ══════════════════════════════════════════════════════════════════════════════
// NUMÉRO D'UN DÉPÔT PAR « MES ANNONCES » AVANT / APRÈS (extension 0.6.80, 30/09)
// ══════════════════════════════════════════════════════════════════════════════
// L'extension lit les identifiants du compte juste avant le clic « Mettre en
// vente » et les relit après la confirmation ; elle envoie le numéro avec la
// trace (platform_fields.preuve_identifiant_beebs). Le serveur ne la croit pas
// sur parole : il REFAIT le calcul sur les listes transmises. Même règle que
// l'extension (verdictIdentifiantBeebs) :
//   · les deux lectures sont complètes ;
//   · nouveaux = identifiants apparus ET plus grands que le plus grand d'avant
//     (Beebs numérote dans l'ordre de création) ;
//   · exactement un nouveau, et c'est le numéro envoyé.
// Plus des bornes de temps : la lecture d'après suit celle d'avant de moins de
// 15 min, et date de moins de 30 min à la réception.
// Les contrôles en base (numéro déjà porté, annonce déjà connue, dépôt
// concurrent du même compte) se font dans update-job-status.

export type LectureMesAnnoncesBeebs = {
  ok?: unknown;
  lu_le?: unknown;
  ids?: unknown;
};

export type PreuveAvantApresBeebs = {
  methode?: unknown;
  ok?: unknown;
  id?: unknown;
  sonde?: unknown;
  avant?: LectureMesAnnoncesBeebs | null;
  apres?: LectureMesAnnoncesBeebs | null;
};

export type VerdictPreuveAvantApres =
  | { ok: true; id: string; avantLe: string; apresLe: string }
  | { ok: false; motif: string };

export const PREUVE_AVANT_APRES_METHODE = "mes_annonces_avant_apres";
const ECART_AVANT_APRES_MAX_MS = 15 * 60_000;
const AGE_APRES_MAX_MS = 30 * 60_000;

function idsDeLecture(l: LectureMesAnnoncesBeebs | null | undefined): string[] {
  const brut = Array.isArray(l?.ids) ? l!.ids as unknown[] : [];
  return [...new Set(brut.map((x) => String(x ?? "").trim()).filter((x) => /^\d{6,}$/.test(x)))];
}

export function verifierPreuveAvantApresBeebs(
  trace: unknown,
  idFourni: string,
  maintenantMs = Date.now(),
): VerdictPreuveAvantApres {
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) return { ok: false, motif: "trace_absente" };
  const t = trace as PreuveAvantApresBeebs;
  if (t.methode !== PREUVE_AVANT_APRES_METHODE) return { ok: false, motif: "methode_inconnue" };
  if (t.ok !== true || String(t.id ?? "") !== idFourni) return { ok: false, motif: "numero_different_de_la_trace" };
  const avant = t.avant ?? null;
  const apres = t.apres ?? null;
  if (avant?.ok !== true) return { ok: false, motif: "lecture_avant_illisible" };
  if (apres?.ok !== true) return { ok: false, motif: "lecture_apres_illisible" };
  const avantLe = Date.parse(String(avant.lu_le ?? ""));
  const apresLe = Date.parse(String(apres.lu_le ?? ""));
  if (!Number.isFinite(avantLe) || !Number.isFinite(apresLe)) return { ok: false, motif: "horodatage_illisible" };
  if (!(apresLe > avantLe) || apresLe - avantLe > ECART_AVANT_APRES_MAX_MS) return { ok: false, motif: "lectures_trop_eloignees" };
  if (apresLe > maintenantMs + 60_000 || maintenantMs - apresLe > AGE_APRES_MAX_MS) return { ok: false, motif: "lecture_apres_perimee" };
  const a = idsDeLecture(avant);
  const dejaVus = new Set(a);
  const plancher = a.reduce((m, x) => (BigInt(x) > m ? BigInt(x) : m), 0n);
  const nouveaux = idsDeLecture(apres).filter((x) => !dejaVus.has(x) && BigInt(x) > plancher);
  if (nouveaux.length === 0) return { ok: false, motif: "aucun_nouvel_identifiant" };
  if (nouveaux.length > 1) return { ok: false, motif: "plusieurs_nouveaux_identifiants" };
  if (nouveaux[0] !== idFourni) return { ok: false, motif: "nouvel_identifiant_different" };
  return { ok: true, id: idFourni, avantLe: new Date(avantLe).toISOString(), apresLe: new Date(apresLe).toISOString() };
}

/**
 * Les trois contrôles en base d'un numéro prouvé par avant/après. Rend le
 * motif de refus, ou null si rien ne s'y oppose. Toute erreur de lecture est
 * un refus (on ne pose jamais un numéro qu'on n'a pas pu vérifier).
 *   · le numéro est déjà porté par un AUTRE dépôt (tous comptes) ;
 *   · l'annonce était déjà relevée chez ce compte AVANT la lecture d'avant ;
 *   · un autre dépôt Beebs du même compte est parti (ou tournait) pendant la
 *     fenêtre avant/après : deux dépôts, un seul numéro — on ne choisit pas.
 */
// deno-lint-ignore no-explicit-any
export async function controlerNumeroBeebsEnBase(client: any, p: {
  id: string; jobId: string; userId: string; avantLe: string; apresLe: string;
}): Promise<string | null> {
  try {
    const enCoursDepuis = new Date(Date.parse(p.avantLe) - 10 * 60_000).toISOString();
    const [porte, connue, concurrents, enCours] = await Promise.all([
      client.from("cross_post_jobs").select("id").eq("platform", "beebs")
        .eq("platform_listing_id", p.id).neq("id", p.jobId).limit(1),
      client.from("annonces_plateforme").select("id").eq("user_id", p.userId).eq("platform", "beebs")
        .eq("listing_id", p.id).lt("created_at", p.avantLe).limit(1),
      client.from("cross_post_jobs").select("id").eq("user_id", p.userId).eq("platform", "beebs")
        .in("action", ["publish", "republish"]).neq("id", p.jobId)
        .gte("published_at", p.avantLe).lte("published_at", p.apresLe).limit(1),
      client.from("cross_post_jobs").select("id").eq("user_id", p.userId).eq("platform", "beebs")
        .in("action", ["publish", "republish"]).eq("status", "processing").neq("id", p.jobId)
        .gte("platform_fields->>processing_since", enCoursDepuis).limit(1),
    ]);
    if (porte?.error || connue?.error || concurrents?.error || enCours?.error) return "verification_impossible";
    if ((porte.data ?? []).length) return "numero_deja_porte_par_un_autre_depot";
    if ((connue.data ?? []).length) return "annonce_connue_avant_le_depot";
    if ((concurrents.data ?? []).length || (enCours.data ?? []).length) return "autre_depot_beebs_pendant_la_fenetre";
    return null;
  } catch {
    return "verification_impossible";
  }
}
