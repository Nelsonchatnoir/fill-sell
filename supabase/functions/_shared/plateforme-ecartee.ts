// Une plateforme volontairement écartée est un parcage, pas un incident.
// Seule la fonction SQL qui traite le geste inverse de l'utilisateur connaît
// le bon statut et le bon motif à restaurer. Aucun veilleur générique ne doit
// donc modifier ni réveiller ces jobs entre-temps.

export const SOURCE_PLATEFORME_ECARTEE = "plateforme_ecartee";

type JobMinimal = {
  platform_fields?: unknown;
};

export function estJobPlateformeEcartee(job: JobMinimal | null | undefined): boolean {
  const pf = job?.platform_fields && typeof job.platform_fields === "object"
    ? job.platform_fields as Record<string, unknown>
    : {};
  return pf.needs_user_source === SOURCE_PLATEFORME_ECARTEE;
}

export function messagePlateformeEcartee(platform: unknown): string {
  const cle = String(platform ?? "").toLowerCase();
  const libelle = ({
    vinted: "Vinted",
    leboncoin: "Leboncoin",
    beebs: "Beebs",
    ebay: "eBay",
    opla: "Opla",
  } as Record<string, string>)[cle] ?? String(platform ?? "cette plateforme");
  return `En pause : tu as indiqué ne pas vendre sur ${libelle}. Rien ne part sur cette plateforme. ` +
    "Pour la reprendre, réactive-la dans Réglages › Plateformes : cette publication repartira d'elle-même.";
}
