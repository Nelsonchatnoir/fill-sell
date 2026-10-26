// ═══════════════════════════════════════════════════════════════════════════
// UN JOB BLOQUÉ PAR UN DÉFAUT D'EXTENSION DÉJÀ CORRIGÉ REPART TOUT SEUL
// (25/09/2026, LES PETITES FIOLES)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : 5 republications Leboncoin d'un compte PRO, 40 essais, tous
// par la 0.6.63, tous morts sur « contrôle Supprimer introuvable … actions
// relevées: [] ». Cause : la fiche d'une annonce PRO ne monte son panneau
// « Gestion de mon annonce » qu'au-delà de 971 px, et la fenêtre de travail
// est plus étroite ; la 0.6.66 (f3891c7) ouvre alors le tiroir « Gérer ».
// Mais la cliente est restée en 0.6.63, ses jobs sont en needs_user « relance
// d'un clic » — la relancer sur la 0.6.63, c'est cinq échecs de plus.
//
// LA RÈGLE (Nico, 25/09) : un job arrêté par un défaut qu'une version plus
// récente corrige se réarme DE LUI-MÊME dès qu'un poste de ce compte polle
// avec cette version — sans geste, sans surveillance.
//
// ⛔ BORNES :
//   · le défaut est reconnu par SA signature (texte de l'erreur brute, du
//     dernier diagnostic ou de l'erreur technique) ET par le build qui a
//     échoué, plus ancien que le correctif — jamais par un texte seul ;
//   · un seul réarmement par job et par correctif (`correctif_leve`) : un
//     échec sur un build corrigé n'est JAMAIS réarmé — il reste en needs_user
//     avec le diagnostic du nouveau build, qui est la mesure qui manquait ;
//   · un job réarmé n'est servi qu'à un poste dont le build porte le
//     correctif (`build_min_requis`) : un autre profil Chrome resté en 0.6.63
//     ne le brûle pas ;
//   · le BUILD_ID fait foi (préfixe horodaté), jamais le numéro de version.
// ES module, trois imports relatifs eux-mêmes sans import (Deno + Node).
import { lectureRefusBeebs } from "./beebs-refus-formulaire.js";
import { BUILD_VINTED_MARQUE_PAR_ID, BUILD_VINTED_MARQUE_CHAINE, marqueAIdentifiantCapturee } from "./vinted-marque-par-id.js";
import { normalizeIsbn } from "./isbn.js";

/** Le préfixe horodaté d'un BUILD_ID (« 2026-09-24T14:34:46Z+aa459a7 · v0.6.66 ») en ms, NaN sinon. */
export function buildMsDe(build) {
  const m = String(build ?? "").match(/(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)/);
  return m ? Date.parse(m[1]) : NaN;
}

// ── L'ISBN CAPTURÉ REMIS TEL QUEL (2026-09-27, carhoa « gobelins ») ─────────
// BUILD_ID du premier build d'extension qui remet dans le corps du POST de
// recréation l'ISBN CAPTURÉ sur l'annonce d'origine, tel quel — « 0000000000000 »
// compris. Avant lui, toute valeur que normalizeIsbn refuse était écartée et la
// recréation partait avec "isbn": null (400). Tant qu'un poste est plus ancien
// que lui, get-pending-jobs ne lui sert AUCUNE republication Vinted à l'étape
// qui supprime quand sa capture porte un tel ISBN de 13 chiffres
// (_shared/isbn-capture-preuve.js, posteRemetIsbnCapture). (25/10, décision de
// Nico) Plus de preuve valeur par valeur : la valeur d'origine part telle quelle.
export const BUILD_ISBN_CAPTURE_TEL_QUEL = "2026-09-27T09:42:56Z"; // BUILD_ID de la 0.6.70 (61cbced), zip build/CWS-0.6.70-A-TELEVERSER

// ── L'ISBN CAPTURÉ DE 10 CARACTÈRES REMIS TEL QUEL (25/10, Rég 6f1b1f70, Vincent A. ×29) ──
// Les 30 annonces d'origine portent « 0000000000 » (10 zéros), accepté par Vinted
// à leur création. Jusqu'à la 0.6.142, la sonde du corps du dépôt n'armait que
// 13 chiffres : avec 10 caractères elle restait désarmée, et le POST portait ce
// que la page sérialise — la page vide l'ISBN (relevé du 14-15/09 : « isbn POSÉ
// dans le corps par la sonde (0000000000000) — la page l'avait laissé vide ») →
// "isbn": null APRÈS le retrait, annonce perdue (cas du 27/09). Le premier
// paquet qui arme la sonde sur 10 caractères (0.6.143) porte cette valeur ;
// avant elle, aucune republication à ISBN capturé de 10 caractères n'est
// servie à l'étape qui retire. Posée le 25/10 au BUILD_ID du paquet 0.6.143
// (2026-10-25T10:06:44Z+a5ea8ba, build/CWS-0.6.143-A-TELEVERSER) : le premier
// qui arme la sonde sur 10 caractères.
export const BUILD_ISBN_10_TEL_QUEL = "2026-10-25T10:06:44Z";

// ── LA REPUBLICATION OPLA JUGÉE SUR L'ANNONCE (2026-09-27, doriane-henri) ───
// BUILD_ID du premier build (0.6.74, e1dbc59) qui reprend la marque et la
// taille de l'ANNONCE Opla en ligne quand la fiche importée n'en a pas. Avant
// lui, une republication Opla sans marque (ou refusée « exige une taille »)
// échoue au pré-vol à coup sûr et se relance toute seule en boucle : tant que
// le poste est plus ancien, get-pending-jobs ne la lui sert pas (aucune
// écriture) ; elle part dès qu'un poste porte ce build.
export const BUILD_OPLA_REPUBLICATION_SUR_ANNONCE = "2026-09-27T18:22:27Z"; // BUILD_ID de la 0.6.74, zip build/CWS-0.6.74-A-TELEVERSER

// ── L'ADRESSE BEEBS VALIDÉE SUR UNE VRAIE SUGGESTION (2026-10-01, Marie) ────
// Horodatage du commit du correctif (50a2c27, 0.6.83) : tout build produit
// depuis porte un BUILD_ID plus récent. Avant lui, le sélecteur d'adresse
// pouvait cliquer un bouton de taille (« 8XL » pour « 8 Mai ») — le dépôt
// restait sur le formulaire, sans fin (cf. _shared/beebs-refus-formulaire.js).
export const BUILD_BEEBS_ADRESSE_STRICTE = "2026-10-01T15:29:31Z";

// ── LE FORMAT DE COLIS BEEBS EXPLICITE (2026-10-04, Louis) ─────────────────
// Horodatage du commit du correctif (7c03a7f, 0.6.95) : tout build produit
// depuis porte un BUILD_ID plus récent. Avant lui, le remplisseur Beebs gardait
// TOUJOURS le pré-remplissage du format de colis (« 1 kg » posé sur des
// rangements de 200 g). Une republication Beebs pas encore retirée dont on
// connaît le format à reproduire n'est servie qu'à un poste qui le porte.
export const BUILD_BEEBS_FORMAT_EXPLICITE = "2026-10-04T09:19:39Z";

// ── LA FIN D'ANNONCE eBay PAR LE NUMÉRO DE LA LIGNE (2026-10-02, xxewwer) ──
// Commit 57e2667 (0.6.84) : le dialogue de fin d'annonce n'exige plus le titre
// du job (eBay ne l'y porte plus en entier). Les retraits arrêtés sur « ne nomme
// pas l'annonce du job » attendent un poste qui porte ce build.
export const BUILD_EBAY_FIN_PAR_NUMERO = "2026-10-02T08:01:46Z";

// ── UN ASPECT eBay EN SAISIE LIBRE SE REMPLIT (2026-10-03, point 7) ───────
// « Numéro de pièce fabricant » (geronimo0550 0692b536 et 6 autres jobs depuis
// le 16/08) : la ligne n'a ni bouton-valeur ni puce, seulement une saisie ;
// aucun chemin n'y écrivait. Horodatage du correctif (ebay.js,
// inputTexteDeLaLigne, 0.6.90) : tout build produit depuis le porte.
export const BUILD_EBAY_SAISIE_LIBRE = "2026-10-03T11:30:00Z";

// ── LA MARQUE DEPOP PAR ÉGALITÉ EXACTE (17/10, Nico — _shared/marque-depop.js) ──
// Jusqu'à la 0.6.122, la clé du connecteur Depop ignorait « & » et « + » :
// « H&M » et « H&M+ », « Lacoste » et « Lacoste + » se confondaient et la
// publication s'arrêtait sur « Plusieurs marques Depop s'écrivent… ». Le
// serveur ne tranche jamais cette question (ce serait perdre une vraie marque) :
// elle repart une fois, dès qu'un poste porte la règle exacte (0.6.123).
// BUILD_ID de la 0.6.123 (zip build/CWS-0.6.123-A-TELEVERSER/, 2026-10-17T13:13:01Z+250dc2f),
// posé au paquet le 17/10 (« 2099 » avant, valeur jamais atteinte).
export const BUILD_DEPOP_MARQUE = "2026-10-17T13:13:01Z";

// ── « ESPACE DE STOCKAGE » / « SIMLOCKAGE » REPRIS DE LA CAPTURE (24/10, lot « zéro blocage », A5) ──
// thibault dca41766 (« Samsung player start 2 ») : la capture porte internal_memory_capacity [1292] et
// sim_lock [1313], les extensions ≤ 0.6.133 ne les reposent pas (codes « dédiés », exclus de la résolution
// des caractéristiques capturées) → pré-vol négatif « Vinted exige des champs encore vides … Espace de
// stockage », question SANS liste (« valeurs indisponibles » → « Relancer » sans valeur) → 6 arrêts identiques.
// La 0.6.134 les reprend de la capture (vinted.js, resoudreAttributsCaptures sur les deux codes dédiés). Sans
// entrée ici, le job ne repartait JAMAIS seul après la mise à jour du poste (règle du 06/10 : toute extension
// qui corrige un arrêt y ajoute son entrée). BUILD_ID de la 0.6.134 = BUILD_VINTED_MARQUE_CHAINE.
export const BUILD_VINTED_STOCKAGE_CAPTURE = "2026-10-24T13:58:51Z";

// ── (26/10 nuit, point 3c — Thibault, dca41766) LE MODÈLE DE REPLI REPOSÉ À LA RECRÉATION ──
// Le premier paquet qui sait CHOISIR une ligne de repli du champ Modèle (« Mon modèle ne figure pas dans la liste »,
// vinted.js selectVintedModel) — avant lui, les replis étaient toujours écartés : servir le repli à un poste plus
// ancien recréerait sans modèle (400) et la relance tournerait en boucle. Posée au BUILD_ID du paquet 0.6.146
// (2026-10-26T00:53:28Z+ebdc605, build/CWS-0.6.146-A-TELEVERSER) : un poste plus ancien ne reçoit jamais le repli.
export const BUILD_VINTED_MODELE_REPLI = "2026-10-26T00:53:28Z";

// ── (26/10 nuit, point 4) LA MARQUE VINTED CRÉÉE, MÊME PAR-DESSUS UN PRÉ-REMPLISSAGE ──
// « Vinted ne permet plus de créer une marque » était un constat manuel du 03/10, démenti le 17/10 puis en prod les
// 20-21/10 ; et la chaîne de repli ne jouait pas quand Vinted avait pré-rempli une autre marque. Le paquet 0.6.146
// crée la marque (« Utiliser … comme marque ») ou la choisit dans le catalogue, même par-dessus un pré-remplissage.
export const BUILD_VINTED_MARQUE_CREEE = "2026-10-26T00:53:28Z";

export const CORRECTIFS_EXTENSION = [
  {
    // (17/10) Rien n'a été créé chez Depop : la question tombe avant les
    // photos et la création, et avant tout retrait en republication. La marque
    // du job reste celle de la fiche ; le poste à jour la trouve telle quelle
    // dans la liste de Depop, sinon il publie en « Other », jamais une autre.
    cle: "depop_marque_ambigue",
    platform: "depop",
    actions: ["publish", "republish"],
    signature: /^Plusieurs marques Depop s'écrivent/,
    buildMin: BUILD_DEPOP_MARQUE,
    version: "0.6.123",
    motif: "marque Depop lue par égalité exacte (« H&M » n'est plus confondue avec « H&M+ »)",
    clesARetirer: ["needsUserField", "needsUserFields", "needs_user_source", "needsUserBoucle", "boucle_needs_user", "pas_de_rouge", "pas_de_rouge_reprises", "needsUserAttempts"],
  },
  {
    // (2026-10-03, point 7) Rien n'a été soumis (« publication NON tentée ») :
    // le réarmement ne peut pas créer de doublon. La valeur est déjà sur le job.
    cle: "ebay_aspect_saisie_libre",
    platform: "ebay",
    actions: ["publish", "republish"],
    signature: /champ sauté — bouton-valeur introuvable pour "[^"]+"[^|]*input\.textbox__control/,
    buildMin: BUILD_EBAY_SAISIE_LIBRE,
    version: "0.6.90",
    motif: "aspect eBay en saisie libre (« Numéro de pièce fabricant ») rempli et relu depuis la 0.6.90",
    clesARetirer: ["needsUserField", "needsUserFields", "needs_user_source", "pas_de_rouge", "pas_de_rouge_reprises", "needsUserAttempts", "champs_a_completer"],
  },
  {
    // (2026-10-01, mariecreativedigital, chemise Hilfiger 0f457c57) : six
    // dépôts restés sur le formulaire, l'adresse « validée » sur « 8XL ».
    // Rien n'a jamais été soumis (sonde réseau vide) : le réarmement ne peut
    // pas créer de doublon. Le job repart sur un poste ≥ 0.6.83.
    cle: "beebs_adresse_suggestion_stricte",
    platform: "beebs",
    actions: ["publish", "republish"],
    signature: /Dépôt Beebs non confirmé/,
    buildMin: BUILD_BEEBS_ADRESSE_STRICTE,
    version: "0.6.83",
    motif: "adresse Beebs validée sur un bouton qui n'était pas une adresse (option de taille)",
    condition: (job) => !!lectureRefusBeebs(job?.platform_fields, "").adresseSurAutreChose,
    clesARetirer: ["needsUserField", "needsUserFields", "needs_user_source", "pas_de_rouge", "pas_de_rouge_reprises", "needsUserAttempts"],
  },
  {
    cle: "vinted_navigation_annonce_exacte",
    platform: "vinted", actions: ["delete", "republish"],
    signature: /onglet de travail n'était pas encore sur la page de ton annonce/,
    buildMin: "2026-09-28T14:31:20Z", version: "0.6.76",
    motif: "navigation vérifiée vers l'identifiant exact avant le retrait",
  },
  {
    cle: "lbc_retrait_pro_tiroir",
    platform: "leboncoin",
    actions: ["delete", "republish"],
    // Ce que les builds d'avant écrivaient : l'erreur du retrait et son diagnostic.
    signature: /Contr[ôo]le « Supprimer l'annonce » introuvable sur la page de l'annonce|contr[ôo]le Supprimer introuvable sur la page de l'annonce/i,
    buildMin: "2026-09-24T14:34:46Z", // BUILD_ID de la 0.6.66 (aa459a7) — commit du correctif f3891c7
    version: "0.6.66",
    motif: "retrait Leboncoin pro : fiche sans panneau de gestion en fenêtre étroite (tiroir « Gérer » ouvert depuis la 0.6.66)",
  },
  {
    // (25/10) Même défaut, valeur de 10 caractères (« 0000000000 », Rég et
    // Vincent A.) : jusqu'à la 0.6.142 la sonde n'armait que 13 chiffres, la
    // recréation partait avec "isbn": null. Le build qui arme la sonde sur 10
    // caractères relance la recréation, une fois. Placée AVANT l'entrée des
    // 13 chiffres : un échec d'avant la 0.6.70 sur une valeur de 10 caractères
    // n'est relancé que par un poste qui sait la remettre.
    cle: "vinted_isbn_10_tel_quel",
    platform: "vinted",
    actions: ["republish"],
    signature: /"isbn":null[\s\S]*Merci d'entrer un numéro ISBN valide|Merci d'entrer un numéro ISBN valide[\s\S]*"isbn":null/,
    buildMin: BUILD_ISBN_10_TEL_QUEL,
    version: "0.6.143",
    motif: "ISBN capturé de 10 caractères (« 0000000000 ») remis tel quel à la recréation",
    // La copie porte une valeur de 10 caractères qui n'est pas un ISBN-10
    // valide (un ISBN-10 valide part converti en 13 chiffres, sur tout build),
    // et personne n'a répondu autre chose.
    condition: (job) => {
      const pf = job?.platform_fields ?? {};
      const snap = pf.republish_snapshot;
      const v = String((snap && typeof snap === "object" ? snap.isbn : "") ?? "").replace(/[\s-]/g, "").toUpperCase();
      return /^\d{9}[\dX]$/.test(v) && !normalizeIsbn(v).ok && !String(pf.vintedAspects?.isbn ?? "").trim();
    },
    clesARetirer: ["needsUserField", "needsUserFields", "server_required_fields", "recreation_retries", "recreation_tentee"],
  },
  {
    // (2026-09-27, carhoa « Livre sur la tentation des gobelins », job
    // 279c046f) : recréation partie avec "isbn": null alors que l'annonce
    // d'origine portait « 0000000000000 » — le build qui la remet telle quelle
    // relance la recréation (l'annonce est déjà retirée : étape 'deleted').
    cle: "vinted_isbn_capture_tel_quel",
    platform: "vinted",
    actions: ["republish"],
    signature: /"isbn":null[\s\S]*Merci d'entrer un numéro ISBN valide|Merci d'entrer un numéro ISBN valide[\s\S]*"isbn":null/,
    buildMin: BUILD_ISBN_CAPTURE_TEL_QUEL,
    version: "0.6.70",
    motif: "ISBN capturé non standard (« 0000000000000 ») remis tel quel à la recréation",
    // Seulement si la copie de l'annonce porte bien un ISBN : la signature
    // seule rattraperait aussi un livre qui n'en avait pas.
    condition: (job) => {
      const snap = job?.platform_fields?.republish_snapshot;
      return !!(snap && typeof snap === "object" && String(snap.isbn ?? "").trim());
    },
    // La question « ISBN » posée après l'échec n'a plus lieu d'être, et la
    // recréation repart avec son budget d'essais entier.
    clesARetirer: ["needsUserField", "needsUserFields", "server_required_fields", "recreation_retries", "recreation_tentee"],
  },
  {
    // (2026-10-17, patrick giry « Paris 2024 » 3730ef49, Romain « pago »
    // 770bed7f — cf. _shared/vinted-marque-par-id.js) La marque de l'annonce
    // en ligne (brand_id capturé > 1) que le menu de Vinted ne propose plus :
    // les builds d'avant posaient la question « Sans marque ou une marque du
    // catalogue » (0.6.94+), s'arrêtaient sur « Le champ Marque n'a pas pu
    // être renseigné / posé » (≤ 0.6.93), ou recréaient sans marque après le
    // retrait (400 `brand`). Le build qui la pose par son identifiant relance
    // le job, UNE fois : une republication pas encore retirée repart de la
    // relecture de l'annonce (a_capturer, gpj), une annonce déjà retirée est
    // recréée avec sa marque. Rien n'est demandé à la personne.
    cle: "vinted_marque_par_identifiant",
    platform: "vinted",
    actions: ["republish"],
    signature: /Vinted ne connaît pas la marque|Le champ Marque n'a pas pu être (renseigné|posé)|Vinted exige « Marque »|"field":"brand"/,
    buildMin: BUILD_VINTED_MARQUE_PAR_ID,
    version: "0.6.123",
    motif: "marque de l'annonce en ligne reprise par son identifiant capturé quand le menu de Vinted ne la propose plus",
    // Seulement si l'annonce d'origine porte une vraie marque à identifiant :
    // sans lui, la question reste la seule issue honnête.
    condition: (job) => marqueAIdentifiantCapturee(job?.platform_fields) != null,
    clesARetirer: [
      "needsUserField", "needsUserFields", "champs_a_completer", "boucle_needs_user",
      "taille_grille_refus", "taille_grille_reprise", "taille_grille_reprise_derniere",
      "server_required_fields", "recreation_retries", "recreation_tentee",
    ],
  },
  {
    // Rien n'a été retiré : arrêt AVANT le retrait (étape captured). Le job repart UNE fois, re-capturé
    // (a_capturer), servi au seul poste ≥ 0.6.134 (build_min_requis). La boucle « redemandé N fois » d'un
    // build d'avant (error_technique.brut) est reconnue aussi.
    cle: "vinted_stockage_simlock_capture",
    platform: "vinted",
    actions: ["republish"],
    signature: /Vinted exige des champs encore vides pour cette catégorie : [^.]*(Espace de stockage|Simlockage)|sur la cible vintedAspects\.(internal_memory_capacity|sim_lock)\b/,
    buildMin: BUILD_VINTED_STOCKAGE_CAPTURE,
    version: "0.6.134",
    motif: "« Espace de stockage » et « Simlockage » repris de la capture de l'annonce d'origine",
    condition: (job) => {
      const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
      if (pf.republish_step === "deleted" || pf.deleted_at) return false; // jamais après un retrait (sa règle à elle)
      const cible = String(pf.needsUserField?.target?.key ?? pf.needsUserField?.field_key ?? pf.boucle_needs_user?.field_key ?? "");
      const champs = Array.isArray(pf.champs_a_completer) ? pf.champs_a_completer.map(String) : [];
      return ["internal_memory_capacity", "sim_lock"].includes(cible)
        || champs.some((c) => /^(Espace de stockage|Simlockage)$/.test(c));
    },
    clesARetirer: ["needsUserField", "needsUserFields", "champs_a_completer", "boucle_needs_user"],
  },
  {
    // (25/10 nuit, patrick.giry07 3730ef49 « Paris 2024 », id 305315) Le réarmement 0.6.123 ci-dessus a déjà servi
    // (correctif_leve) : la 0.6.128 a reposé la question (aucune preuve d'envoi par identifiant au parc : 0 trace
    // marque_pose_envoi en 30 j) et la réponse de la personne ne remplace jamais la marque capturée (règle du 17/10).
    // La 0.6.134 porte la chaîne de repli de Nico (24/10) : même marque autrement écrite, sinon « Sans marque » —
    // le job repart UNE fois vers un poste qui la porte. Même signature, même condition que l'entrée 0.6.123.
    cle: "vinted_marque_chaine_de_repli",
    platform: "vinted",
    actions: ["republish"],
    signature: /Vinted ne connaît pas la marque|Le champ Marque n'a pas pu être (renseigné|posé)|Vinted exige « Marque »|"field":"brand"/,
    buildMin: BUILD_VINTED_MARQUE_CHAINE,
    version: "0.6.134",
    motif: "marque hors du menu de Vinted : même marque autrement écrite, sinon « Sans marque » (règle de Nico, 24/10)",
    condition: (job) => marqueAIdentifiantCapturee(job?.platform_fields) != null,
    clesARetirer: ["needsUserField", "needsUserFields", "champs_a_completer", "boucle_needs_user"],
  },
  {
    // (26/10 nuit, point 4) Les arrêts « Vinted ne connaît pas la marque … et ne permet plus d'en créer » (christophe
    // « uncle stubble » ×2, patrick « Paris 2024 », Johan « The North Face », Romain « pago ») : la 0.6.146 crée la
    // marque ou la choisit, même par-dessus un pré-remplissage de Vinted. Le job repart UNE fois vers un poste qui la
    // porte : une republication pas encore retirée repart de la relecture de l'annonce (a_capturer), une publication
    // refait son dépôt. Jamais après un retrait (sa règle à elle). Rien n'est demandé à la personne.
    cle: "vinted_marque_creee",
    platform: "vinted",
    actions: ["publish", "republish"],
    signature: /Vinted ne connaît pas la marque|ne permet plus d'en créer|n'a pas proposé de créer|Le champ Marque n'a pas pu être (renseigné|posé)/,
    buildMin: BUILD_VINTED_MARQUE_CREEE,
    version: "0.6.146",
    motif: "marque Vinted créée ou choisie même par-dessus un pré-remplissage (la règle « Vinted n'en crée plus » est retirée)",
    condition: (job) => {
      const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
      return !(pf.republish_step === "deleted" || pf.deleted_at);
    },
    clesARetirer: ["needsUserField", "needsUserFields", "champs_a_completer", "boucle_needs_user"],
  },
];

/** Les textes d'un job où la signature d'un défaut peut se lire. */
function textesDuJob(job) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const et = pf.error_technique;
  return [
    job?.error,
    pf.last_diagnostic,
    typeof et === "string" ? et : (et && typeof et === "object" ? (et.brut ?? JSON.stringify(et)) : ""),
    pf.needs_user_vu_erreur,
  ].map((t) => String(t ?? "")).filter(Boolean);
}

/**
 * Le correctif qui répare CE job, s'il existe : bonne plateforme, bonne
 * action, signature lue dans ses textes, build de l'échec PLUS ANCIEN que le
 * correctif, jamais déjà réarmé pour ce correctif. null sinon.
 */
export function correctifPourJob(job, correctifs = CORRECTIFS_EXTENSION) {
  if (!job || job.status !== "needs_user") return null;
  const pf = (job.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const buildEchec = buildMsDe(job.handler_build);
  if (!Number.isFinite(buildEchec)) return null; // build inconnu : on ne devine pas
  const textes = textesDuJob(job);
  for (const c of correctifs) {
    if (job.platform !== c.platform) continue;
    if (!c.actions.includes(String(job.action ?? "publish"))) continue;
    if (!(buildEchec < buildMsDe(c.buildMin))) continue;
    if (pf.correctif_leve && typeof pf.correctif_leve === "object" && pf.correctif_leve.cle === c.cle) continue;
    if (!textes.some((t) => c.signature.test(t))) continue;
    if (typeof c.condition === "function" && !c.condition(job)) continue;
    return c;
  }
  return null;
}

/** Le poste qui polle porte-t-il ce correctif ? (build du poll ≥ build du correctif) */
export function posteAJour(buildDuPoste, correctif) {
  const b = buildMsDe(buildDuPoste);
  return Number.isFinite(b) && b >= buildMsDe(correctif.buildMin);
}
