// ═══════════════════════════════════════════════════════════════════════════
// LE TITRE D'UNE COPIE VINTED : UN SAUT DE LIGNE N'EN FAIT PAS UN AUTRE TITRE (25/10)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : Vincent A., job 9138772c, « Champavert, le lycanthrope\nPar
// Pétrus Borel ». Le champ Titre du formulaire de Vinted tient sur UNE ligne :
// il SUPPRIME le saut de ligne sans le remplacer — l'annonce est née
// « Champavert, le lycanthropePar Pétrus Borel ». Tous nos comparateurs de copie
// changent la ponctuation en espace (« …lycanthrope par… ») : la copie, en ligne
// depuis 18:53:11 le 24/10, n'a jamais été reconnue ; dépôt d'issue inconnue,
// resservi, redéposé à 19:46:01 → DEUX annonces en ligne (10514173498 et
// 10514978864). 83 fiches Vinted en stock sur 11 comptes ont un titre « mot\nmot ».
//
// DEUX RÈGLES, pures (Deno + Node), les mêmes partout :
//   · un titre servi pour un dépôt Vinted n'a jamais de saut de ligne : il devient
//     une espace (titreSansSautDeLigne) — get-pending-jobs le sert ainsi à TOUTES
//     les versions d'extension, l'extension l'applique elle aussi (sanitizeJob) ;
//   · deux titres sont ceux de la même copie (memeTitre) s'ils ont la même forme
//     normalisée (ponctuation → espace, celle de recreation_vinted_titre_norm en
//     base), OU les mêmes lettres et chiffres dans le même ordre (casse, accents,
//     espaces et ponctuation ignorés) dès 12 caractères — ce qui couvre les copies
//     déjà nées « …lycanthropePar… ». Un titre vide n'est jamais le même titre.
// Le titre ne prouve jamais rien seul : les appelants gardent leurs autres
// conditions (numéro inconnu, photos postérieures au retrait, heure d'un de nos
// envois, boutique).
//
// ⚠️ COPIE EXACTE dans chrome-extension/background.js (l'extension ne peut pas
// importer ce module) : mêmes fonctions, même texte — le selftest
// titre-copie-vinted les compare caractère pour caractère.
// ES module sans import.

/** Les sauts de ligne d'un titre deviennent une espace (Vinted les supprime sans rien mettre à la place). */
export function titreSansSautDeLigne(t) {
  return String(t ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/** Le titre porte-t-il un saut de ligne ? */
export function titreAUnSautDeLigne(t) {
  return /[\r\n]/.test(String(t ?? ""));
}

/** Forme normalisée : la même que recreation_vinted_titre_norm (base) — ponctuation et espaces → une espace. */
export function titreNormCopie(t) {
  return String(t ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Lettres et chiffres seuls, minuscules, sans accents. */
export function titreCompactCopie(t) {
  return String(t ?? "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Deux titres sont-ils ceux de la même copie Vinted ? */
export function memeTitre(a, b) {
  const na = titreNormCopie(a);
  if (!na) return false;
  if (na === titreNormCopie(b)) return true;
  const ca = titreCompactCopie(a);
  return ca.length >= 12 && ca === titreCompactCopie(b);
}
