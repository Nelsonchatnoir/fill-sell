// ═══════════════════════════════════════════════════════════════════════════
// DU VOCABULAIRE QUI N'A RIEN À FAIRE SOUS LES YEUX D'UN VENDEUR (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// Règle, sans exception : aucun message montré à quelqu'un ne porte un chemin
// de fichier, un nom de fonction, un identifiant technique ou un nom de route.
//
// Ce module ne reconnaît PAS une cause — c'est tout son intérêt. G1 et G4a
// (update-job-status) nomment des signatures connues et savent quoi répondre.
// Celui-ci fait l'inverse : il ne sait pas ce qui s'est passé, il sait
// seulement que le texte n'est pas montrable. Filet FERMÉ, placé en dernier.
//
// ⚠️ IL VIT DANS UN FICHIER, ET PAS EN DUR DANS LA FONCTION, POUR UNE RAISON
//    VÉCUE : en écrivant le contrôle de non-régression j'ai retapé ce motif
//    dans un script jetable, un « \\[object Object\\] » y est devenu
//    « [object Object] » — une CLASSE DE CARACTÈRES qui matche la lettre « o ».
//    Résultat du passage à blanc : 235 formes sur 237 requalifiées, soit
//    12 243 jobs dont « Annonce retirée par le vendeur — pas une vente ». Un
//    motif recopié est un motif qui dérive : il n'existe qu'ici, et le
//    selftest le passe sur les VRAIS messages du parc.

const MOTIFS = [
  // chemin de fichier du dépôt (src/utils/ebayCategories.js, docs/…)
  "(?:^|[^a-z])(?:src|scripts|docs|supabase|chrome-extension)/[a-z0-9._/-]+",
  // fichier de code nommé
  "\\.(?:js|ts|mjs|jsx|tsx)\\b",
  // nom d'une de nos fonctions serveur (« update-job-status → » lu par une
  // vendeuse le 17/09 : le seul texte du parc qui fuyait ENCORE à l'écran)
  "\\b(?:update-job-status|get-pending-jobs|generate-listing|voice-intent|voice-transcribe|ebay-api-worker|handler-watch|resolve-categorie|deal-analysis|email-tunnel)\\b",
  // identifiant interne
  "\\b(?:categoryId|catalogId|catalog_id|size_id|leaf_id|field_key|platform_fields|needsUserFields?|oplaCategoryChoice|valeur_inchangee)\\b",
  // route d'une plateforme
  "/(?:sl/list|lstng|items/new|ws/eBayISAPI|fpa)\\b",
  // fragment de DOM / API navigateur
  "querySelector|outerHTML|innerHTML|data-testid|document\\.|window\\.",
  // exception JavaScript
  "\\b(?:TypeError|ReferenceError|SyntaxError)\\b|Cannot read propert|is not defined|is not a function",
  // valeur crachée telle quelle
  "\\[object Object\\]",
];

const VOCABULAIRE_RE = new RegExp(MOTIFS.join("|"), "i");

// ── ON JUGE CE QUI EST MONTRÉ, PAS CE QUI EST STOCKÉ ────────────────────────
// Un message peut porter une annexe « — Observabilité: … » : chemin de rayon,
// fragments de DOM, id du job. Elle est destinée au support et l'app la retire
// déjà avant d'afficher (humanizeJobError). La juger reviendrait à jeter un
// message parfaitement lisible pour du texte que personne ne voit.
// Cas mesuré : « "Catégorie Opla" : ta réponse a bien été enregistrée, et ce
// champ est pourtant redemandé à l'identique… » — utile, honnête, et suivie
// d'une annexe qui nomme oplaCategoryChoice. On garde le message, on ignore
// l'annexe. Même traitement pour le préfixe de log « LIVE : ».
const ANNEXE_SUPPORT_RE = /\s*[—–-]?\s*(?:Observabilit[ée]|LIVE)\s*:.*$/is;

/** Le texte tel qu'il sera MONTRÉ : sans l'annexe réservée au support. */
export function partieMontree(texte: unknown): string {
  return typeof texte === "string" ? texte.replace(ANNEXE_SUPPORT_RE, "").trim() : "";
}

/** Ce qui sera montré porte-t-il du vocabulaire de développeur ? */
export function porteDuVocabulaireDeDeveloppeur(texte: unknown): boolean {
  const montre = partieMontree(texte);
  return montre !== "" && VOCABULAIRE_RE.test(montre);
}

/** Le fragment fautif, pour le journal interne — jamais pour l'écran. */
export function marqueurDeDeveloppeur(texte: unknown): string | null {
  const m = partieMontree(texte).match(VOCABULAIRE_RE);
  return m ? m[0].trim().slice(0, 80) : null;
}

// ── UN GESTE NE SE JETTE PAS AVEC SA ROUTE (03/10, point 14) ────────────────
// f2rhrt5zc6 (job 618164ab) : « eBay demande une mise à niveau de ton compte
// vendeur avant de pouvoir déposer une annonce (/fpa/upgrade). Ouvre ebay.fr
// dans Chrome, suis les étapes… » — un message vrai, avec son geste, jeté
// ENTIER pour une incise entre parenthèses, et remplacé par un générique qui
// accusait « notre côté ». Quand le vocabulaire ne vit QUE dans des
// parenthèses, on retire ces parenthèses-là et on garde le message ; s'il en
// reste ailleurs (cas d'adamchocho13 : chemin de fichier dans la phrase), ou
// si presque rien ne reste, le filet fait son travail comme avant.
const INCISE_RE = /\s*\(([^()]*)\)/g;
const RESTE_MIN = 40;

/** Le texte montré sans ses incises techniques, ou null s'il ne s'en sort pas propre. */
export function sansIncisesTechniques(texte: unknown): string | null {
  const montre = partieMontree(texte);
  if (!montre || !VOCABULAIRE_RE.test(montre)) return null;
  const nettoye = montre
    .replace(INCISE_RE, (incise: string, dedans: string) => (VOCABULAIRE_RE.test(dedans) ? "" : incise))
    .replace(/\s{2,}/g, " ")
    .trim();
  if (nettoye.length < RESTE_MIN || VOCABULAIRE_RE.test(nettoye)) return null;
  return nettoye;
}
