// ═══════════════════════════════════════════════════════════════════════════
// LES CONSIGNES DU VENDEUR POUR L'IA (29/10, lot B 1.3 — promesse faite à XEWER)
// ═══════════════════════════════════════════════════════════════════════════
// Mail de Nico à XEWER (27/10, point 4) : « tu enregistres une fois ton propre modèle (ta structure de titre, ta
// structure de description, les infos que tu mets toujours, ta façon de présenter l'état), et FillSell s'en sert à
// chaque annonce, en le combinant avec l'analyse des photos, les infos détectées et ce que tu dictes au micro. »
// Rangées dans profiles.platform_settings.redaction.consignes, propres au compte, modifiables à tout moment
// (Réglages › Rédaction). Le serveur (supabase/functions/_shared/redaction-plateformes.ts) les lit et les ajoute au
// prompt de CHAQUE rédaction — scan Lens comme génération de l'écran de publication.
// ⛔ Elles ne servent qu'aux générations : un texte tapé par le vendeur ne passe jamais par l'IA (règle du 21/09,
//    « le texte du vendeur fait foi », et lot B partie 2). Elles ne changent jamais un FAIT (état lu, marque, taille)
//    ni les listes fermées des plateformes.
// Pur, sans réseau, partagé par l'app et le serveur (scripts/consignes-redaction-selftest.mjs).

export const CHAMPS_CONSIGNES = Object.freeze(["ton", "titre", "description", "etat", "toujours", "eviter"]);
export const TONS = Object.freeze(["simple", "precis", "chaleureux"]);
export const LONGUEUR_MAX_CONSIGNE = 600;

const LIBELLES_TON = Object.freeze({ simple: "simple et direct", precis: "précis et factuel", chaleureux: "chaleureux" });

// Un texte de consigne propre : pas de caractère de contrôle (hors tabulation et retour à la ligne), pas de balise,
// longueur bornée.
const sansControle = (s) => Array.from(s).filter((ch) => {
  const c = ch.charCodeAt(0);
  return c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127);
}).join("");
const propre = (v) => sansControle(String(v ?? ""))
  .replace(/[<>]/g, "")
  .replace(/\r\n/g, "\n")
  .trim()
  .slice(0, LONGUEUR_MAX_CONSIGNE);

/**
 * Les consignes lisibles d'un objet quelconque (champs inconnus jetés, vides retirés).
 * @param {any} c
 * @returns {Record<string, string>}
 */
export function consignesValides(c) {
  const src = c && typeof c === "object" && !Array.isArray(c) ? c : {};
  /** @type {Record<string, string>} */
  const out = {};
  const ton = String(src.ton ?? "").trim().toLowerCase();
  if (TONS.includes(ton)) out.ton = ton;
  for (const k of CHAMPS_CONSIGNES) {
    if (k === "ton") continue;
    const t = propre(src[k]);
    if (t) out[k] = t;
  }
  return out;
}

/** Le vendeur a-t-il écrit au moins une consigne ? */
export function aDesConsignes(c) {
  return Object.keys(consignesValides(c)).length > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// LES CONSIGNES, BIEN LUES — NÉGATION COMPRISE (13/11, lot « zéro problème », point 5a de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Compte de63ca45 : sa case « À éviter » finit par « Ne jamais supprimer les emojis du modèle. » — l'ancienne lecture
// cherchait le MOT « emoji » dans la case et concluait « pas d'émojis » : 7 propositions sur 7 ont perdu leurs émojis
// (📍 et 🚚 de ses phrases finales compris). Décision de Nico : pas de cases à cocher, les consignes du vendeur font
// foi, BIEN LUES. La lecture se fait phrase par phrase, proposition par proposition :
//   · un mot d'ABSENCE (« pas », « jamais », « sans », « aucun ») retourne le sens ;
//   · un verbe de RETRAIT (« supprimer », « retirer », « enlever », « effacer ») ou d'ÉVITEMENT (« éviter »,
//     « interdit ») le retourne aussi — « ne jamais supprimer les émojis » = les GARDER (deux retournements) ;
//   · dans la case « À éviter », ce qui n'a ni négation ni verbe est à éviter (« hashtags » seul) ;
//   · la proposition sans verbe hérite de celui de sa phrase (« supprimer les lignes inutiles, jamais les emojis ») ;
//   · des phrases qui se contredisent : DOUTE → on ne retire rien (le modèle lit les consignes en entier).
// Rangé PAR LANGUE (la langue des consignes, celle du compte) : français livré, anglais prêt.
// Les phrases finales (« Finir EXACTEMENT … : <texte> ») et le modèle de phrase de test (« « … [date] … » ») se
// lisent ici aussi : le CODE les pose, mot pour mot, jamais le modèle (src/utils/blocsDescription.js).

const LEXIQUES_CONSIGNES = Object.freeze({
  fr: Object.freeze({
    emojis: /(?:^|[^\p{L}])(?:[ée]mojis?|[ée]moticones?|[ée]motic[ôo]nes?|smileys?|pictogrammes?)(?=$|[^\p{L}])/iu,
    hashtags: /(?:^|[^\p{L}])(?:hashtags?|hash-tags?|mots?-di[èe]ses?)(?=$|[^\p{L}])|#(?=\s|$|[»"”)])/iu,
    negation: /(?:^|[^\p{L}])(?:ne|n['’]|pas|jamais|aucune?s?|sans|z[ée]ro|ni|nulle?)(?=$|[^\p{L}])/iu,
    retrait: /(?:^|[^\p{L}])(?:supprim\p{L}*|retir\p{L}*|enl[eè]v\p{L}*|enlever|effac\p{L}*|[ôo]ter|[ôo]tez|[ôo]te)(?=$|[^\p{L}])/iu,
    evitement: /(?:^|[^\p{L}])(?:[ée]vit\p{L}*|interdi\p{L}*|proscri\p{L}*|banni\p{L}*|bannir|refus\p{L}*)(?=$|[^\p{L}])/iu,
    // Un verbe de MAINTIEN (« garder », « conserver », « reproduire ») dit lui-même le sens, même dans « À éviter ».
    maintien: /(?:^|[^\p{L}])(?:gard\p{L}*|conserv\p{L}*|reprodui\p{L}*|laiss\p{L}*|recopi\p{L}*|respect\p{L}*)(?=$|[^\p{L}])/iu,
    // « Finir EXACTEMENT, emojis et lignes vides : <texte> », « Terminer toujours par : <texte> », « Finir par « <texte> » ».
    finir: /(?:^|[.;!?\n])\s*(?:toujours\s+)?(?:finir|termine[rz]?|terminer|conclure|finis|finissez)(?:\s+toujours)?(?=[\s,:])[^:\n«"“]*?(?::|(?=\s*[«"“]))/iu,
    // Un repère de date dans un modèle de phrase : « [date] », « {date} », « <date> », « [jour] ».
    repereDate: /\[(?:date|jour|jj\/mm(?:\/aaaa)?)\]|\{date\}|<date>/iu,
    aujourdhui: /aujourd['’]hui|ce\s+jour|le\s+jour\s+m[êe]me/iu,
  }),
  en: Object.freeze({
    emojis: /(?:^|[^\p{L}])(?:emojis?|emoticons?|smileys?)(?=$|[^\p{L}])/iu,
    hashtags: /(?:^|[^\p{L}])(?:hashtags?|hash-tags?)(?=$|[^\p{L}])|#(?=\s|$|["”)])/iu,
    negation: /(?:^|[^\p{L}])(?:no|not|never|without|nor|zero|don['’]t|do\s+not)(?=$|[^\p{L}])/iu,
    retrait: /(?:^|[^\p{L}])(?:remov\p{L}*|delet\p{L}*|strip\p{L}*|drop\p{L}*)(?=$|[^\p{L}])/iu,
    evitement: /(?:^|[^\p{L}])(?:avoid\p{L}*|forbid\p{L}*|ban\p{L}*)(?=$|[^\p{L}])/iu,
    maintien: /(?:^|[^\p{L}])(?:keep\p{L}*|retain\p{L}*|preserv\p{L}*|reproduc\p{L}*)(?=$|[^\p{L}])/iu,
    finir: /(?:^|[.;!?\n])\s*(?:always\s+)?(?:end|finish|close)\s+(?:with|by)[^:\n"“]*?(?::|(?=\s*["“]))/iu,
    repereDate: /\[(?:date|day)\]|\{date\}|<date>/iu,
    aujourdhui: /today/iu,
  }),
});

const lexiqueConsignes = (langue) => LEXIQUES_CONSIGNES[String(langue ?? "").slice(0, 2).toLowerCase()] ?? LEXIQUES_CONSIGNES.fr;

// Les cases lues pour la DESCRIPTION (la case « titre » parle du titre : son « commencer par un émoji » ne dit rien
// des émojis de la description).
const CASES_DESCRIPTION = Object.freeze(["description", "etat", "toujours", "eviter"]);

/** Le sens d'une cible (émojis, hashtags) dans une case : +1 la garder, -1 l'enlever, pour chaque mention. */
function sensDansLaCase(cle, texte, cible, lex) {
  const sens = [];
  for (const phrase of String(texte ?? "").split(/[.;!?\n]+/)) {
    if (!lex[cible].test(phrase)) continue;
    const propositions = phrase.split(/,|\s+(?:et|mais|ou|and|but|or)\s+/iu);
    const tete = propositions[0] ?? "";
    const verbeDe = (s) => (lex.retrait.test(s) ? "retrait" : lex.evitement.test(s) ? "evitement" : lex.maintien.test(s) ? "maintien" : null);
    for (const p of propositions) {
      if (!lex[cible].test(p)) continue;
      const negation = lex.negation.test(p);
      const verbe = verbeDe(p) ?? (p !== tete ? verbeDe(tete) : null);
      let s = 1;
      if (verbe === "retrait" || verbe === "evitement") s = -s;
      if (negation) s = -s;
      // Case « À éviter » : ce qui n'y porte ni négation ni verbe est à éviter (un verbe de maintien dit le sens lui-même).
      if (cle === "eviter" && !negation && !verbe) s = -s;
      sens.push(s);
    }
  }
  return sens;
}

/** « garder » / « retirer » / null (rien dit, ou des phrases qui se contredisent : le doute ne retire rien). */
function verdict(sens) {
  if (!sens.length) return null;
  if (sens.every((s) => s > 0)) return "garder";
  if (sens.every((s) => s < 0)) return "retirer";
  return null;
}

/** Le texte entre guillemets français ou anglais. */
const ENTRE_GUILLEMETS = /«\s*([^»]+?)\s*»|“([^”]+)”|"([^"]+)"/gu;

/** Les phrases finales que le vendeur veut mot pour mot, telles qu'il les a écrites (lignes vides comprises). */
function finalesDuVendeur(v, lex) {
  for (const cle of ["toujours", "description"]) {
    const t = String(v[cle] ?? "");
    const m = lex.finir.exec(t);
    if (!m) continue;
    let reste = t.slice(m.index + m[0].length);
    const cite = /^\s*(?:«\s*([^»]+?)\s*»|“([^”]+)”|"([^"]+)")/u.exec(reste);
    reste = cite ? (cite[1] ?? cite[2] ?? cite[3]) : reste;
    const bloc = reste.replace(/^\s*\n+/, "").replace(/\s+$/, "").replace(/^[ \t]+/, "");
    if (bloc && bloc.length <= 400) return bloc;
  }
  return null;
}

/** Le modèle de phrase de test du vendeur : jour même, plus tard, sans date (repère « [date] »). */
function modeleDeTest(v, lex) {
  const avecDate = [];
  const sansDate = [];
  for (const cle of ["toujours", "description", "etat"]) {
    for (const m of String(v[cle] ?? "").matchAll(ENTRE_GUILLEMETS)) {
      const p = (m[1] ?? m[2] ?? m[3] ?? "").trim();
      if (!p) continue;
      (lex.repereDate.test(p) ? avecDate : sansDate).push(p);
    }
  }
  if (!avecDate.length) return null;
  const jourMeme = avecDate.find((p) => lex.aujourdhui.test(p)) ?? null;
  const plusTard = avecDate.find((p) => !lex.aujourdhui.test(p)) ?? null;
  const reference = plusTard ?? jourMeme;
  // « Jeu testé le [date] et fonctionnel. » sans « le [date] » = « Jeu testé et fonctionnel. » : c'est la forme
  // « date inconnue » si le vendeur l'a écrite.
  const comparable = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
  const sansRepere = comparable(reference.replace(new RegExp(`(?:\\s+\\p{L}{1,3})?\\s*(?:${lex.repereDate.source})`, "iu"), ""));
  const formeSansDate = sansDate.find((p) => comparable(p) === sansRepere) ?? null;
  return { jourMeme: jourMeme ?? reference, plusTard: plusTard ?? reference, sansDate: formeSansDate };
}

/**
 * Les consignes du vendeur, lues : ce que le CODE doit en tenir (le modèle, lui, les lit en entier).
 * @param {any} c  les consignes (profiles.platform_settings.redaction.consignes)
 * @param {{langue?: string}} [opts]  langue des consignes (celle du compte) — français par défaut
 * @returns {{emojis: "garder"|"retirer"|null, hashtags: "garder"|"retirer"|null, finales: string|null,
 *   modeleTest: {jourMeme: string, plusTard: string, sansDate: string|null}|null, langue: string}}
 */
export function lireConsignes(c, { langue = "fr" } = {}) {
  const v = consignesValides(c);
  const lex = lexiqueConsignes(langue);
  const sens = { emojis: [], hashtags: [] };
  for (const cle of CASES_DESCRIPTION) {
    if (!v[cle]) continue;
    for (const cible of ["emojis", "hashtags"]) sens[cible].push(...sensDansLaCase(cle, v[cle], cible, lex));
  }
  return {
    emojis: verdict(sens.emojis),
    hashtags: verdict(sens.hashtags),
    finales: finalesDuVendeur(v, lex),
    modeleTest: modeleDeTest(v, lex),
    langue: LEXIQUES_CONSIGNES[String(langue ?? "").slice(0, 2).toLowerCase()] ? String(langue).slice(0, 2).toLowerCase() : "fr",
  };
}

/** Le vendeur refuse-t-il les hashtags ? (Lu, négation comprise — « pas de hashtags » oui, « garde les hashtags » non.) */
export function consigneSansHashtag(c) {
  return lireConsignes(c).hashtags === "retirer";
}

/** Le vendeur refuse-t-il les émojis ? (Lu, négation comprise — « ne jamais supprimer les emojis » = non.) */
export function consigneSansEmoji(c) {
  return lireConsignes(c).emojis === "retirer";
}

/**
 * Le bloc placé EN TÊTE du prompt système de la rédaction ("" sans consigne : prompt d'avant, à l'identique).
 * (13/11, point 5a) Il passe EN PREMIER : quand il existe, les blocs de forme génériques du gabarit (ton, émojis du
 * gabarit, structure, longueur cible, hashtags obligatoires, ligne de fin) ne sont plus envoyés
 * (redaction-plateformes.ts) — restent « ne rien inventer », les plafonds des plateformes et les listes fermées.
 * Rédigé en français : les prompts des plateformes françaises le sont ; pour une copie dans une autre langue,
 * la directive de langue du prompt reste la règle (les consignes portent sur la forme, pas sur la langue).
 */
export function directiveConsignes(c) {
  const v = consignesValides(c);
  if (!Object.keys(v).length) return "";
  const lues = lireConsignes(c);
  const lignes = [];
  if (v.ton) lignes.push(`- Ton : ${LIBELLES_TON[v.ton]}.`);
  if (v.titre) lignes.push(`- Structure de ses titres : ${v.titre}`);
  if (v.description) lignes.push(`- Format de ses descriptions : ${v.description}`);
  if (v.etat) lignes.push(`- Sa façon de présenter l'état : ${v.etat}`);
  if (v.toujours) lignes.push(`- À toujours mentionner : ${v.toujours}`);
  if (v.eviter) lignes.push(`- À éviter : ${v.eviter}`);
  const poses = [];
  if (lues.modeleTest) poses.push("la phrase de test (« testé le … »)");
  if (lues.finales) poses.push("ses phrases de fin");
  return [
    "CONSIGNES DU VENDEUR — elles passent EN PREMIER et font foi pour la FORME de TOUTES ses annonces (structure, ton, émojis, mentions, hashtags, longueur dans le plafond de la plateforme). Lis-les en entier, négations comprises (« ne jamais supprimer les émojis » veut dire : GARDE-les). Applique-les au titre et à la description :",
    ...lignes,
    "Elles ne changent JAMAIS un fait : l'état réel, la marque, la taille, ce qui est lu sur les photos ; et jamais les valeurs des listes fermées de platform_fields. " +
    "Si une consigne demande d'affirmer un fait que l'article ne permet pas d'affirmer, ignore cette consigne-là." +
    (poses.length ? ` N'écris ni ${poses.join(" ni ")} : FillSell les pose lui-même à chaque envoi, mot pour mot, là où la plateforme les accepte.` : ""),
  ].join("\n");
}
