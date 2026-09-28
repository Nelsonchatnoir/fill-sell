// Point D : un refus article ne bloque pas les autres. Miroir testé du worker.
export function recreationRetientFile(job) {
  const pf = job?.platform_fields ?? {};
  if (pf.republish_step !== "deleted") return false;
  if (job.status === "processing") return true;
  if (job.status !== "pending") return false;
  // Un refus sur cet article attend sa propre reprise ou sa réponse.
  // Il conserve sa priorité lorsqu'il est dû, sans retenir les autres articles.
  return !pf.recreation_reprise && !pf.needsUserField && !pf.needsUserFields?.length;
}
