// Le profil Cloud lu par les flux de paiement des STORES (Apple, Google), avec
// le verdict de la PRÉPARATION de l'essai (05/10, socle Cloud) : un essai que la
// préparation a refusé (appareil ou compte de plateforme déjà vus sur l'essai
// d'un autre compte) n'est PAS activé par la semaine offerte du store — Cloud
// démarre au premier paiement réel, comme un essai déjà pris ailleurs
// (verdictEssaiStore, _shared/cloud-option.js).
// Socle absent (migration non appliquée) ou lecture en échec : comportement
// d'avant, à l'identique — jamais un point de panne d'un paiement.
// deno-lint-ignore-file no-explicit-any
// (08/11, résiliation) + la période payée et l'arrêt programmé (un arrêt déjà écrit ne se réécrit pas) ; l'adresse et
// la langue servent aux mails Cloud (_shared/cloud-mails-envoi.ts), jamais à la décision.
export const COLONNES_CLOUD_STORE = "cloud_canal, cloud_ref, is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete, cloud_periode_fin, cloud_arret_fin_periode, email, lang";

export async function profilCloudPourStore(admin: any, userId: string | null | undefined): Promise<Record<string, unknown>> {
  if (!userId) return {};
  const { data: profil } = await admin.from("profiles").select(COLONNES_CLOUD_STORE).eq("id", userId).maybeSingle();
  let interdit = false;
  try {
    const { data: p, error } = await admin.rpc("cloud_essai_permis", { p_user: userId });
    if (!error) interdit = p?.prepare === true && p?.permis === false && p?.raison !== "essai_deja_pris";
  } catch (_e) { /* socle absent : comme avant */ }
  return { ...(profil ?? {}), cloud_essai_interdit: interdit };
}
