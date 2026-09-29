// eBay voie extension — une activation vendeur ne se déduit jamais d'un
// texte ni d'une simple session de navigation. Seul le Seller Hub ouvert,
// sondé APRÈS le mur et encore frais, prouve que le geste est terminé.

export const SOURCE_EBAY_COMPTE_VENDEUR_INACTIF = "ebay_compte_vendeur_inactif";
export const FRAICHEUR_HUB_EBAY_MS = 3 * 60 * 60_000;

type JobMinimal = {
  platform?: unknown;
  action?: unknown;
  status?: unknown;
  platform_fields?: unknown;
};

type SessionsExtension = Record<string, unknown>;

export function estJobVendeurEbayInactif(job: JobMinimal): boolean {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object")
    ? job.platform_fields as Record<string, unknown>
    : {};
  return job?.platform === "ebay"
    && (job?.action === "publish" || job?.action === "republish")
    && job?.status === "needs_user"
    && pf.needs_user_source === SOURCE_EBAY_COMPTE_VENDEUR_INACTIF;
}

/** Rend l'instant de la preuve, ou null si le job doit rester parqué. */
export function preuveHubApresActivationVendeur(
  job: JobMinimal,
  sessions: SessionsExtension,
  maintenant = Date.now(),
): number | null {
  if (!estJobVendeurEbayInactif(job) || sessions?.ebay_hub !== true) return null;
  const dates = (sessions.checked_at_par_plateforme && typeof sessions.checked_at_par_plateforme === "object")
    ? sessions.checked_at_par_plateforme as Record<string, unknown>
    : {};
  const vu = Date.parse(String(dates.ebay_hub ?? ""));
  if (!Number.isFinite(vu) || maintenant - vu > FRAICHEUR_HUB_EBAY_MS || vu > maintenant + 60_000) return null;

  const pf = job.platform_fields as Record<string, unknown>;
  const mur = (pf.compte_vendeur_inactif && typeof pf.compte_vendeur_inactif === "object")
    ? pf.compte_vendeur_inactif as Record<string, unknown>
    : {};
  const bloqueLe = Date.parse(String(mur.derniere ?? mur.depuis ?? ""));
  // Une preuve non datée par rapport au mur ne suffit pas. C'est précisément
  // ce qui interdit qu'un ancien Hub ouvert réveille un blocage nouveau.
  if (!Number.isFinite(bloqueLe) || vu <= bloqueLe) return null;
  return vu;
}
