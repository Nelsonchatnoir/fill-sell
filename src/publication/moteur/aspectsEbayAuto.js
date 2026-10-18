// ═══════════════════════════════════════════════════════════════════════════
// eBay — CE QUE LE MOTEUR REMPLIT SEUL, ET QUAND (10/10/2026, cas Manon)
// ═══════════════════════════════════════════════════════════════════════════
// Publication en lot de quatre vêtements importés de Vinted vers eBay : trois
// questions « Style » et une « Type » sur des champs que l'IA pouvait remplir.
// Deux décisions du moteur (ListingPreviewScreen, stepper ET lot) vivent ici,
// pures, pour être éprouvées sans écran (scripts/ebay-aspects-auto-selftest.mjs) :
//
//   1. QUOI DEMANDER À L'IA, MAINTENANT (aspectsADemanderIa)
//      · jamais sur la liste d'une AUTRE catégorie : tant que la liste des
//        exigés relue n'est pas celle de la catégorie courante, rien ne part
//        et rien n'est déclaré « terminé » ;
//      · chaque aspect manquant est demandé UNE fois PAR catégorie — plus
//        « une seule tentative par catégorie » : un exigé devenu manquant après
//        le premier appel est demandé à son tour ;
//      · « terminé » = plus rien à demander et aucun appel en vol : c'est
//        alors seulement qu'un champ vide devient une question.
//
//   2. CE QUI DOIT PARTIR QUAND LA CATÉGORIE CHANGE (valeursAutoAReprendre)
//      Une valeur que le MOTEUR a posée pour une autre catégorie et qui n'est
//      pas dans la liste de celle-ci n'y a jamais été choisie : elle est
//      retirée et l'aspect repart comme neuf (option nommée par le titre, IA,
//      puis question). Une valeur valable ici reste. Une valeur posée ou
//      retouchée par la personne n'est jamais touchée.
//
// ES module sans dépendance : importé par ListingPreviewScreen (Vite) et par
// le selftest (Node).

/**
 * @param {object} p
 * @param {string|null} p.categorie       la catégorie eBay courante de l'encart
 * @param {boolean} p.listeAJour          la liste des exigés relue est-elle celle de `categorie` ?
 * @param {Array<{name:string,state:string}>|null} p.statut  ebayRequiredStatus
 * @param {Set<string>} p.dejaDemandes    `${categorie}|${aspect}` déjà envoyés à l'IA
 * @param {(a:object)=>unknown} [p.aDefaut]  l'aspect a-t-il un défaut déterministe (jamais demandé à l'IA)
 * @param {number} [p.enVol]              appels IA en cours
 * @returns {{ aDemander: string[], fini: boolean, attendre: boolean }}
 *   attendre : rien à décider tant que la liste n'est pas la bonne ;
 *   fini     : plus rien à demander, aucun appel en vol.
 */
export function aspectsADemanderIa({ categorie, listeAJour, statut, dejaDemandes, aDefaut = () => false, enVol = 0 }) {
  if (!categorie || !Array.isArray(statut) || !listeAJour) return { aDemander: [], fini: false, attendre: true };
  const manquants = statut.filter((a) => a?.state === "missing" && !aDefaut(a)).map((a) => a.name);
  const aDemander = manquants.filter((n) => !dejaDemandes.has(`${categorie}|${n}`));
  return { aDemander, fini: !aDemander.length && enVol === 0, attendre: false };
}

/**
 * @param {object} p
 * @param {string} p.categorie            la catégorie courante (liste à jour)
 * @param {Record<string,{categorie:string,valeur:string}>} p.autoPoses  ce que le moteur a posé, et pour quelle catégorie
 * @param {Record<string,unknown>} p.aspects   pf.ebayAspects actuel de la copie
 * @param {Array<{name:string,mode?:string,allowedValues?:string[]}>} p.statut  exigés de la catégorie courante
 * @param {(liste:string[], mode?:string)=>boolean} p.listeFermee  la liste fait-elle foi pour l'écran (isEbayClosedList)
 * @param {(s:unknown)=>string} p.norm    forme comparable (normAspectVal)
 * @returns {{ retirer: string[], reetiqueter: string[], oublier: string[] }}
 *   retirer     : valeurs posées pour une autre catégorie, hors de la liste d'ici ;
 *   reetiqueter : valeurs posées ailleurs, valables ici (gardées) ;
 *   oublier     : valeurs retouchées par la personne depuis (plus à nous).
 */
export function valeursAutoAReprendre({ categorie, autoPoses, aspects, statut, listeFermee, norm }) {
  const retirer = []; const reetiqueter = []; const oublier = [];
  for (const [nom, pose] of Object.entries(autoPoses ?? {})) {
    if (!pose || pose.categorie === categorie) continue;
    const actuelle = String(aspects?.[nom] ?? "").trim();
    if (actuelle !== pose.valeur) { oublier.push(nom); continue; }
    const a = (statut ?? []).find((x) => x?.name === nom);
    if (!a) continue; // pas exigé ici : on n'y touche pas
    const liste = Array.isArray(a.allowedValues) ? a.allowedValues : [];
    const valable = !listeFermee(liste, a.mode) || liste.some((v) => norm(v) === norm(actuelle));
    (valable ? reetiqueter : retirer).push(nom);
  }
  return { retirer, reetiqueter, oublier };
}

// ═══════════════════════════════════════════════════════════════════════════
// (18/10, eBay ÷ 5) LES QUESTIONS eBAY QUI RESTAIENT ALORS QUE LA RÉPONSE EXISTAIT
// ═══════════════════════════════════════════════════════════════════════════
// Semaine du 11/10 15:00 au 18/10 15:00 (heure de Paris), 156 questions eBay
// affichées, 41 vraies encore après le chantier « zéro friction ». Rejeu :
// scripts/bancs/zero-friction/rejeu-ebay.mjs. Quatre décisions de plus vivent
// ici, pures, éprouvées par scripts/ebay-questions-cinq-selftest.mjs.

// ── 3. « LONGUEUR DE LA ROBE » SE LIT DANS LE TEXTE DU VENDEUR ──────────────
// La liste eBay de 63861 « Robes » ne propose que « Au genou », « Midi »,
// « Asymétrique » (FREE_TEXT) : « Robe longue » n'y trouvait aucune option, et
// la réponse de l'IA était jetée par la garde des MESURES (« Longueur… »
// lue comme une dimension — _shared/ebay-aspects-ia.ts). 19 refus en 30 jours,
// 9 articles, 4 comptes. eBay accepte la valeur libre : « Longue » est déjà en
// ligne (annonces du parc et de vendeurs eBay).
// RÈGLE (banc : 40 vraies annonces eBay 63861 + annonces FillSell publiées —
// scripts/bancs/zero-friction/banc-ebay-robe-plateforme.mjs) :
//   · « longue », « maxi » → Longue ; « midi », « mi-longue », « mi-jambe »,
//     « mi-mollet » → Midi ;
//   · « manches longues / courtes » ne parlent pas de la robe : retirées ;
//   · « courte », « mini » ne sont JAMAIS posées (les vendeurs eBay choisissent
//     « Au genou » pour une robe courte : 4 justes sur 11 au banc) — leur
//     présence avec une autre longueur = doute = la question reste ;
//   · ordre : le titre, puis la description, puis la feuille Vinted du vendeur
//     (« Robes longues », « Midi ») ; le premier texte qui parle tranche.
export const EBAY_LONGUEUR_ROBE = "Longueur de la robe";
const sansAccentsMin = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MANCHES_RE = /\bmanches?\s+(?:mi[- ]?)?(?:longues?|courtes?)\b|\b(?:longues?|courtes?)\s+manches?\b/g;
function famillesDeLongueur(texte) {
  const t = sansAccentsMin(texte).replace(MANCHES_RE, " ");
  const f = new Set();
  if (/\bmi[- ]?(?:longues?|jambes?|mollets?)\b|\bmidi\b/.test(t)) f.add("midi");
  if (/\b(?:longues?|maxi)\b/.test(t.replace(/\bmi[- ]?longues?\b/g, " "))) f.add("longue");
  if (/\b(?:courtes?|mini)\b/.test(t)) f.add("courte");
  return f;
}
/**
 * @param {{ textes: Array<{source:string, texte:string}|string>, allowedValues?: string[], mode?: string }} p
 * @returns {{ valeur: string, source: string } | null}
 */
export function longueurDeLaRobeDuTexte({ textes, allowedValues = [], mode = "FREE_TEXT" }) {
  const liste = (Array.isArray(allowedValues) ? allowedValues : []).map((v) => String(v ?? "").trim()).filter(Boolean);
  const dansLaListe = (re) => liste.find((v) => re.test(sansAccentsMin(v))) ?? null;
  for (const brut of Array.isArray(textes) ? textes : []) {
    const texte = typeof brut === "string" ? brut : brut?.texte;
    const source = typeof brut === "string" ? "texte" : (brut?.source ?? "texte");
    const f = famillesDeLongueur(texte);
    if (!f.size) continue;
    if (f.size > 1 || f.has("courte")) return null; // doute, ou « courte » : jamais posé
    const famille = [...f][0];
    const ecrite = famille === "midi" ? dansLaListe(/\bmidi\b|mi-?longue/) : (dansLaListe(/\blongue\b/) ?? dansLaListe(/\bmaxi\b/));
    if (ecrite) return { valeur: ecrite, source };
    // Liste FERMÉE (SELECTION_ONLY) sans cette longueur : eBay refuserait.
    if (mode === "SELECTION_ONLY") return null;
    return { valeur: famille === "midi" ? "Midi" : "Longue", source };
  }
  return null;
}

// ── 4. UNE VALEUR CONNUE NE REDEVIENT JAMAIS UNE QUESTION ───────────────────
// Mesuré : 6 questions de la semaine portaient une valeur que le moteur avait
// DÉJÀ — « Plateforme » d'un jeu (PS3, Xbox 360, Switch : la règle des jeux
// donnait la valeur en ligne, à l'identique) exclue de l'IA parce qu'elle avait
// un défaut, puis affichée 70 à 150 s plus tard ; « Nom du jeu vidéo »,
// « Type », « Style » rendus par l'IA 1 à 70 s AVANT l'affichage. La valeur
// était posée UNE fois (une pose par passe), puis perdue, et plus jamais
// reposée ; l'IA n'est jamais redemandée. Désormais une valeur que le moteur
// connaît (défaut, option du texte, réponse de l'IA pour CETTE catégorie) est
// reposée quand le champ redevient vide — sauf si la PERSONNE y a touché (elle
// l'a vidé exprès : on ne la recouvre jamais). Plafond de reposes par champ et
// par catégorie : une boucle ne peut pas naître d'ici.
export const REPOSES_MAX = 3;
/**
 * @param {{ dejaPosee: boolean, touche: boolean, reposes?: number, plafond?: number }} p
 * @returns {boolean} le moteur peut-il (re)poser sa valeur sur ce champ vide ?
 */
export function poseAutoAutorisee({ dejaPosee, touche, reposes = 0, plafond = REPOSES_MAX }) {
  if (!dejaPosee) return true;   // première pose : comme avant
  if (touche) return false;      // la personne a vidé ou retouché : jamais recouverte
  return reposes < plafond;
}
/** La clé d'une valeur connue : une réponse ne vaut que pour SA catégorie. */
export const cleValeurConnue = (categorie, nom) => `${String(categorie ?? "")}|${String(nom ?? "")}`;

// ── 5. LA CATÉGORIE DE L'ENCART : ATTENDRE LE PRÉ-CALCUL, REFUSER L'ICÔNE DÉMENTIE ──
// (a) Aucune question eBay avant la réponse du pré-calcul de catégorie : la
//     catégorie de l'ICÔNE posait ses aspects pendant ces secondes-là (une
//     « Perceuse sans fil » pour des serviteurs de cheminée : « Batterie/pile
//     incluse », « Tension » affichées 22 s avant que le pré-calcul ne range
//     l'article ailleurs). Filet : passé ATTENTE_PRECALCUL_EBAY_MS sans réponse,
//     l'icône reprend la main, comme avant.
// (b) Quand le pré-calcul a REFUSÉ le chemin de l'icône sans en trouver un
//     autre (categorie_source « icone_non_confirmee », la vérification a dit
//     « aucune ») et que l'article part par l'API eBay : c'est le serveur qui
//     choisit parmi les suggestions d'eBay (ebay-api-worker, règle n° 2) et qui
//     remplit les aspects de CETTE catégorie-là. Les aspects de l'icône n'ont
//     plus rien à demander (« Tele de lion » → Télévisions : résolution, taille
//     d'écran, technologie d'affichage pour une tête de lion décorative).
//     ⛔ Voie extension : ebay.js navigue par l'identifiant du job, l'icône
//     part telle quelle — la règle ne s'y applique pas.
export const ATTENTE_PRECALCUL_EBAY_MS = 20000;
/** L'encart eBay peut-il se monter sur la catégorie de l'ICÔNE maintenant ? */
export function iconeEbayAdmise({ preCalculAttendu, preCalculFini, attenteEcoulee }) {
  return !preCalculAttendu || Boolean(preCalculFini) || Boolean(attenteEcoulee);
}
/** Le pré-calcul a-t-il démenti la catégorie de l'icône, sur la voie API, sans choix de la personne ? */
export function precalculEbayNonConfirme({ pfEbay, voieApi, choisi = false }) {
  return voieApi === true && !choisi && pfEbay?.categorie_source === "icone_non_confirmee";
}
