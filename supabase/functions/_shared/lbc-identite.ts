// Transaction sécurisée Leboncoin — reprise d'un job uniquement sur preuve
// booléenne fraîche, datée APRÈS le mur. Aucun nom/prénom n'entre ici.

export const SOURCE_IDENTITE_LBC = "lbc_escrow_identite";
export const FRAICHEUR_IDENTITE_LBC_MS = 3 * 60 * 60_000;

type JobMinimal = {
  platform?: unknown;
  action?: unknown;
  status?: unknown;
  platform_fields?: unknown;
};

export function estJobIdentiteLbc(job: JobMinimal): boolean {
  const pf = job?.platform_fields && typeof job.platform_fields === "object"
    ? job.platform_fields as Record<string, unknown>
    : {};
  const diagnostic = pf.last_diagnostic && typeof pf.last_diagnostic === "object"
    ? pf.last_diagnostic as Record<string, unknown>
    : {};
  return job?.platform === "leboncoin"
    && (job?.action === "publish" || job?.action === "republish")
    && job?.status === "needs_user"
    && (pf.needs_user_source === SOURCE_IDENTITE_LBC || diagnostic.quoi === SOURCE_IDENTITE_LBC);
}

/** Rend l'instant de la preuve, ou null si le job doit rester parqué. */
export function preuveIdentiteLbcApresBlocage(
  job: JobMinimal,
  sessions: Record<string, unknown>,
  maintenant = Date.now(),
): number | null {
  if (!estJobIdentiteLbc(job) || sessions?.leboncoin_identite !== true) return null;
  const dates = sessions.checked_at_par_plateforme && typeof sessions.checked_at_par_plateforme === "object"
    ? sessions.checked_at_par_plateforme as Record<string, unknown>
    : {};
  const vu = Date.parse(String(dates.leboncoin_identite ?? ""));
  if (!Number.isFinite(vu) || maintenant - vu > FRAICHEUR_IDENTITE_LBC_MS || vu > maintenant + 60_000) return null;

  const pf = job.platform_fields as Record<string, unknown>;
  const diagnostic = pf.last_diagnostic && typeof pf.last_diagnostic === "object"
    ? pf.last_diagnostic as Record<string, unknown>
    : {};
  const bloqueLe = Date.parse(String(pf.identite_lbc_bloquee_le ?? diagnostic.at ?? ""));
  if (!Number.isFinite(bloqueLe) || vu <= bloqueLe) return null;
  return vu;
}
