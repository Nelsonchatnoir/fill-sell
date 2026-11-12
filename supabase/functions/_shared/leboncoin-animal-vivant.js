// ═══════════════════════════════════════════════════════════════════════════
// UNE ANNONCE D'ANIMAL VIVANT SUR LEBONCOIN : UN GESTE CLAIR AU PREMIER PASSAGE, JAMAIS CINQ ÉCHECS
// (12/11/2026, point 6 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur (compte cfdfda6f, Business) : publication Leboncoin 298e4944 d'une SAILLIE de chat, catégorie posée par
// l'IA « Animaux › Animaux » (descente de l'arbre, motif defaut_sans_mot), poids de colis 1 kg (colis par défaut des
// Réglages). Cinq passages le 12/11 (13:02 → 14:01), cinq fois « Le wizard n'est pas passé à l'aperçu après
// Continuer » : la page « Dites-nous en plus » ne montre que le critère `animal_type`, ni « État » ni « Poids du
// colis ». Même échec le 10/11 (c8fd2caa, 99 essais, annulée par la personne).
// PREUVE de ce que Leboncoin demande (lecture seule, 12/11) : l'annonce Leboncoin 3229105886 du MÊME article, déposée
// par la personne elle-même le 19/09, porte les attributs animal_type (cat), animal_offer_nature (Saillie),
// animal_race (Oui), animal_age (Adulte), animal_birthdate, animal_litter (portée), vaccinated_animal (Oui),
// animal_breed (Ragdoll) — et shippable = false : un animal vivant ne s'envoie pas par Leboncoin, aucun poids de
// colis n'a de sens (et le formulaire n'en a pas). Ces informations, seul le vendeur les connaît ; FillSell ne les
// recueille pas et l'extension ne sait pas les poser.
// LA RÈGLE (toutes les annonces de cette catégorie, tous les comptes) : une publication ou une republication
// Leboncoin rangée « Animaux › Animaux » n'est jamais tentée. Au premier passage, elle devient un geste clair (needs_user,
// source `lbc_animal_vivant`) : la déposer soi-même sur Leboncoin puis « Synchroniser » (FillSell la retrouve et la
// suit) ; un objet pour animaux mal rangé → la catégorie « Accessoires animaux ». Aucun poids n'est posé. Une
// republication dont l'annonce est déjà retirée (étape « deleted ») n'est jamais touchée ici (elle va au bout ou à
// ses propres gardes).
// Pur, sans import : get-pending-jobs, handler-watch (Deno), l'app et le verrou (Node).

export const CHEMIN_ANIMAL_VIVANT_LBC = Object.freeze(["Animaux", "Animaux"]);
export const SOURCE_ANIMAL_VIVANT_LBC = "lbc_animal_vivant";

const norm = (s) => String(s ?? "").normalize("NFC").trim().toLowerCase();

/** Le chemin Leboncoin est-il celui des animaux vivants (« Animaux › Animaux ») ? */
export function cheminAnimalVivantLbc(chemin) {
  if (!Array.isArray(chemin) || chemin.length !== 2) return false;
  return norm(chemin[0]) === "animaux" && norm(chemin[1]) === "animaux";
}

/** Une publication ou une republication Leboncoin d'un animal vivant, pas encore engagée (rien retiré). */
export function estAnnonceAnimalVivantLbc(job) {
  if (!job || job.platform !== "leboncoin") return false;
  const action = job.action ?? "publish";
  if (action !== "publish" && action !== "republish") return false;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (action === "republish" && (pf.deleted_at || String(pf.republish_step ?? "") === "deleted")) return false;
  return cheminAnimalVivantLbc(pf.lbcCategoryPath);
}

/** Le geste, en mots simples. */
export function messageAnimalVivantLbc(job, lang = "fr") {
  const republication = (job?.action ?? "publish") === "republish";
  if (lang === "en") {
    return "For an animal listing, Leboncoin asks for details only you know (type of animal, sale / gift / stud, breed, age, "
      + "vaccinations). FillSell can't fill them in yet: post this listing yourself on Leboncoin, then tap “Sync” and FillSell "
      + "will find it and follow it. If it's an item for animals, pick the “Pet supplies” category instead. "
      + (republication ? "Your listing stays online: nothing was removed." : "Nothing was published.");
  }
  return "Pour une annonce d'animal, Leboncoin demande des informations que toi seul connais (type d'animal, vente, don "
    + "ou saillie, race, âge, vaccins). FillSell ne sait pas encore les remplir : dépose cette annonce toi-même sur "
    + "Leboncoin, puis touche « Synchroniser » : FillSell la retrouvera et la suivra. Si c'est un objet pour animaux, "
    + "choisis plutôt la catégorie « Accessoires animaux ». "
    + (republication ? "Ton annonce reste en ligne : rien n'a été retiré." : "Rien n'a été publié.");
}

/** Les champs de la tâche retenue : la source du geste, la trace, aucun poids ni marque de travail en cours. */
export function champsAnimalVivantLbc(pf, posePar, le = new Date().toISOString()) {
  const out = { ...((pf && typeof pf === "object") ? pf : {}) };
  delete out.processing_since;
  delete out.needsUserField;
  delete out.needsUserFields;
  out.needs_user_source = SOURCE_ANIMAL_VIVANT_LBC;
  out.animal_vivant_lbc = { le, pose_par: posePar, chemin: [...CHEMIN_ANIMAL_VIVANT_LBC] };
  return out;
}

/** Un article dont la catégorie Leboncoin est celle des animaux vivants : aucun poids de colis (rien ne s'envoie). */
export function sansPoidsDeColisLbc(pf) {
  return cheminAnimalVivantLbc(pf?.lbcCategoryPath);
}
