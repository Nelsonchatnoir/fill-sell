// ═══════════════════════════════════════════════════════════════════════════
// LA PUBLICATION EN LOT — LES RÈGLES PURES (nuit du 02 au 03/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Le lot ne réécrit RIEN du moteur de publication : chaque article est préparé
// par le vrai moteur du stepper (ListingPreviewScreen en mode `pilote`), qui
// rédige, résout les rayons, lit les champs exigés, pose ses gardes et appelle
// la même RPC. Ce module ne contient que ce que le lot ajoute — choisir, compter,
// classer — en fonctions pures, testées par scripts/publication-lot-selftest.mjs.
// Aucune ne lit le réseau, aucune n'écrit.
import { computeRemovalInfo, plateformesReserveesParRepublication, estArretUtilisateur, vintedPresenceArticle } from "../../utils/publicationState.js";
import { attentesParPlateforme } from "../../utils/etatsPublication.js";
import { plateformesJumelles } from "../../utils/copiesJumelles.js";
import { PALIERS as PALIERS_COMPTE, palierDesDrapeaux } from "../../utils/palier.js";
import { poidsLbcManquantPour } from "../../utils/choixPoidsLeboncoin.js";
// (25/10) Les clôtures « pas pour ce compte » : état neutre au suivi (jamais « à toi de jouer », jamais rouge).
import { estClotureLbcHorsFrance } from "../../../supabase/functions/_shared/lbc-adresse-france.js";
import { estClotureEbayHorsFrance } from "../../../supabase/functions/_shared/ebay-hors-france.js";
// (25/10, balayage des erreurs visibles, règle 3) Le suivi lit l'état UNIQUE d'un job (etatJob, attenteAutomatique)
// et la nature d'un needs_user (« en cours de confirmation » : la carte le dit gris, le lot aussi).
import { etatJob, ETATS, attenteAutomatique } from "../../../supabase/functions/_shared/etat-job.js";
import { natureNeedsUser } from "../../utils/shared.js";
// (04/11/2026, grille à 3 jauges) La règle d'affichage unique : chaque article du lot passe-t-il avec ce qu'il reste
// (partageDuLot), ce que le lot coûtera (coutPublication), les volumes du palier visé (grilleDuPalier, coin_config).
import { partageDuLot, coutPublication, grilleDuPalier, nombre, motJauge } from "../../utils/jauges.js";
// La liste de l'unité (utils/stockFiltres.js, PLATEFORMES_JAMAIS_PRECOCHEES),
// recopiée : stockFiltres importe sans extension, ce module reste lisible par
// node seul (selftest:publication-lot) — selftest:depop-file-jamais-silencieuse
// vérifie que les deux disent la même chose.
const PLATEFORMES_JAMAIS_PRECOCHEES = Object.freeze(["depop"]);

// Opla quitte FillSell le 10/10 : jamais dans un lot, ni avant ni après.
// Depop (09/10) : dans le lot pour le SEUL compte où elle est ouverte — le lot
// ne propose jamais que plateformesCompte (plateformesDuCompte, App.jsx). Le
// DÉFAUT, quand un appelant n'en donne pas, reste les quatre d'avant.
export const PLATEFORMES_LOT = Object.freeze(["vinted", "leboncoin", "ebay", "beebs", "depop"]);
export const PLATEFORMES_LOT_DEFAUT = Object.freeze(["vinted", "leboncoin", "ebay", "beebs"]);
// (12/10, A1, Nico) PLUS DE PLAFOND DE 20 ARTICLES PAR LOT — à l'unité comme en
// lot, depuis le Stock comme ailleurs (Louis, Business, bloqué à 20). La seule
// limite est le quota du palier (annonces restantes), dit avant de lancer. Le
// rythme anti-robot ne dépend pas du lot : l'extension dépose une annonce après
// l'autre (8 à 20 s entre deux, chrome-extension/config.js), les jobs arrivent
// un par un (un appel spend_coins_and_publish par article), et l'index
// cross_post_jobs_un_seul_publish_actif_par_article_plateforme refuse tout
// doublon. Gardé par scripts/lot-sans-plafond-selftest.mjs.
// Préparations en même temps (une rédaction = un appel serveur et quelques
// lectures) : trois suffisent à ne jamais attendre, sans charger le serveur.
export const PREPARATIONS_SIMULTANEES = 3;
// Le moteur d'un article doit rester au repos ce temps-là avant qu'on lise ses
// questions : un effet tardif qui pose une valeur ne doit pas être pris de court.
export const REPOS_AVANT_LECTURE_MS = 1200;

// ── Ce qu'un article peut encore recevoir ──────────────────────────────────
// Les plateformes OCCUPÉES par l'article : en ligne (publiée, pas retirée), en
// file (pending/processing), en attente d'un geste (needs_user) ou réservées par
// une republication en vol. C'est exactement ce que refuse la RPC
// (already_published) — le lot ne propose jamais ce que le serveur refuserait.
export function plateformesOccupees(item, jobs = []) {
  const liste = Array.isArray(jobs) ? jobs : [];
  const info = computeRemovalInfo(liste);
  const occ = new Set([...info.publishedActive, ...info.queued, ...plateformesReserveesParRepublication(liste)]);
  for (const [p, a] of Object.entries(attentesParPlateforme(liste))) if (a?.bloque) occ.add(p);
  // Vinted : un article du dressing EST sur Vinted, même sans job FillSell
  // (règle du 11/09, vintedPresenceArticle). Disparu de Vinted : il est libre.
  if (item) {
    const v = vintedPresenceArticle(item, liste);
    if (v?.occupee) occ.add("vinted");
    if (item.disparu_le) occ.delete("vinted");
    // (20/10, Louis) La fiche JUMELLE d'un compte relié y est déjà, dans la même boutique : occupée
    // (spend_coins_and_publish la refuserait, already_published + compte_relie).
    for (const p of plateformesJumelles(item)) occ.add(p);
  }
  return occ;
}

/** Les plateformes du lot encore libres pour cet article, dans l'ordre du lot. */
export function plateformesLibres(item, jobs, plateformesCompte = PLATEFORMES_LOT_DEFAUT) {
  const occ = plateformesOccupees(item, jobs);
  return PLATEFORMES_LOT.filter((p) => plateformesCompte.includes(p) && !occ.has(p));
}

const photosDe = (item) => {
  const p = item?.photos;
  if (!Array.isArray(p)) return [];
  return p.map((x) => (typeof x === "string" ? x : x?.url)).filter((u) => typeof u === "string" && u);
};

/**
 * Un article peut-il entrer dans un lot ? { ok, raison } — raison en mots
 * d'écran quand il ne peut pas. Jamais un article vendu, jamais sans photo
 * (aucune plateforme n'en veut), jamais un article déjà partout.
 */
export function articleSelectionnable(item, jobs, plateformesCompte = PLATEFORMES_LOT_DEFAUT, lang = "fr") {
  const en = lang === "en";
  if (!item) return { ok: false, raison: "" };
  if (String(item.statut ?? "") === "vendu" || item.sold === true) return { ok: false, raison: en ? "Sold" : "Vendu" };
  if (!photosDe(item).length) return { ok: false, raison: en ? "No photo" : "Sans photo" };
  if (!plateformesLibres(item, jobs, plateformesCompte).length) return { ok: false, raison: en ? "Already everywhere" : "Déjà partout" };
  return { ok: true, raison: "" };
}

// ── « Où les publier ? » — une ligne par plateforme pour tout le lot ───────
/**
 * Par plateforme : combien d'articles du lot pourraient y partir, combien y
 * sont déjà. `articles` = [{ item, jobs }].
 */
export function resumeParPlateforme(articles, plateformesCompte = PLATEFORMES_LOT_DEFAUT) {
  const out = {};
  for (const p of PLATEFORMES_LOT) {
    if (!plateformesCompte.includes(p)) continue;
    let possibles = 0, dejaLa = 0;
    for (const { item, jobs } of articles ?? []) {
      if (plateformesOccupees(item, jobs).has(p)) dejaLa++;
      else possibles++;
    }
    out[p] = { possibles, dejaLa };
  }
  return out;
}

/** Les plateformes cochées d'office : celles où au moins un article peut aller, hors pause et hors eBay inutilisable. */
export function choixInitial(resume, { memorise = null, enPause = [], ebayBloque = false } = {}) {
  const ouvertes = Object.entries(resume ?? {})
    .filter(([p, r]) => r.possibles > 0 && !enPause.includes(p) && !(p === "ebay" && ebayBloque))
    .map(([p]) => p);
  if (Array.isArray(memorise) && memorise.length) {
    const garde = ouvertes.filter((p) => memorise.includes(p));
    if (garde.length) return garde;
  }
  // (11/10, Simon BORGET) Depop n'est JAMAIS pré-cochée — la règle de l'unité
  // (stockFiltres.PLATEFORMES_JAMAIS_PRECOCHEES, le stepper la suit depuis le
  // 09/10) que le lot ignorait : Simon, qui ne vend que sur Vinted, a vu ses
  // quatre articles partir aussi vers Depop sans l'avoir choisi. Proposée,
  // jamais cochée d'office ; un choix mémorisé (lot précédent) la garde.
  return ouvertes.filter((p) => !PLATEFORMES_JAMAIS_PRECOCHEES.includes(p));
}

// ── Le quota du mois ───────────────────────────────────────────────────────
// Une préparation = une rédaction = une annonce du quota, comme à l'unité. Une
// fiche déjà rédigée pour TOUTES les plateformes visées ne repasse pas par la
// rédaction (le moteur la rouvre telle quelle) : elle ne coûte rien.
/** La fiche porte-t-elle une copie rédigée pour chaque plateforme visée ? */
export function ficheCouvre(fiche, plateformes) {
  const copies = fiche?.platformListings?.platforms;
  if (!copies || typeof copies !== "object") return false;
  return (plateformes ?? []).every((p) => Boolean(copies[p]));
}

/**
 * Partage les articles entre « maintenant » et « le mois prochain ».
 * `restantes` = annonces restantes du cycle (null = pas de plafond connu).
 * `consomme(article)` = true si l'article passera par une rédaction.
 * L'ordre des articles est celui de la sélection : le premier choisi part le
 * premier. Rend { maintenant: [...], plusTard: [...], aConsommer }.
 */
export function partagerQuota(articles, { restantes = null, consomme = () => true, jauges = null, plateformes = null } = {}) {
  // (04/11/2026, grille à 3 jauges — maquette 4.3) `jauges` = jaugesDuCompte(quotas_etat), présent SEULEMENT avec la
  // grille : un article passe s'il tient dans les DEUX jauges (1 annonce s'il passe par la rédaction, 1 publication
  // par plateforme visée — `plateformes(article)`), jugé par partageDuLot, dans l'ordre de la sélection. Comme avant,
  // un article qui ne tient pas n'arrête pas le partage : ce qui est déjà rédigé se publie toujours (mur Annonces).
  // Rend aussi `publications` (la somme des plateformes de « maintenant ») et `bloque` (la jauge qui a mis de côté
  // le premier article reporté, null sinon). Sans `jauges` : le partage d'avant, à l'identique.
  if (jauges) return partagerDeuxJauges(articles, { consomme, jauges, plateformes });
  const maintenant = [], plusTard = [];
  let reste = Number.isFinite(restantes) ? Math.max(0, restantes) : Infinity;
  let aConsommer = 0;
  for (const a of articles ?? []) {
    if (!consomme(a)) { maintenant.push(a); continue; }
    if (reste > 0) { maintenant.push(a); reste--; aConsommer++; }
    else plusTard.push(a);
  }
  return { maintenant, plusTard, aConsommer };
}

function partagerDeuxJauges(articles, { consomme, jauges, plateformes }) {
  const maintenant = [], plusTard = [];
  const reste = (j) => ({ ...j, restantes: j.illimite ? Infinity : Math.max(0, Number(j.restantes) || 0) });
  let restes = { ...jauges, annonces: reste(jauges.annonces), publications: reste(jauges.publications) };
  let aConsommer = 0, publications = 0, bloque = null;
  for (const a of articles ?? []) {
    const besoin = { redaction: Boolean(consomme(a)), plateformes: Math.max(0, Number(plateformes ? plateformes(a) : 0) || 0) };
    const p = partageDuLot([besoin], restes);
    if (!p.maintenant) { plusTard.push(a); bloque = bloque ?? p.bloque; continue; }
    maintenant.push(a);
    if (besoin.redaction) aConsommer++;
    publications += besoin.plateformes;
    restes = {
      ...restes,
      annonces: { ...restes.annonces, restantes: restes.annonces.restantes - (besoin.redaction ? 1 : 0) },
      publications: { ...restes.publications, restantes: restes.publications.restantes - besoin.plateformes },
    };
  }
  return { maintenant, plusTard, aConsommer, publications, bloque };
}

// ── (04/11/2026, grille à 3 jauges) CE QUE LE LOT DIT DE SON COÛT — maquettes 4.2 et 4.3 ──────────────────────
// Textes purs, lus par EcranPlateformes et le pied de l'écran 1, SEULEMENT avec la grille (jauges présentes). Le
// mot « annonce » appartient à la jauge de l'IA (décision de Nico, question 6.3) : le lot prépare des PUBLICATIONS.
const NOM_PLAN = { gratuit: "Free", free: "Free", premium: "Premium", pro: "Pro", business: "Business" };
const compteJauge = (cle, n, lang) => `${nombre(n, lang)} ${motJauge(cle, n, lang)}`;
const morceauxCout = (nA, nP, lang) => [nA > 0 ? compteJauge("annonces", nA, lang) : null, nP > 0 ? compteJauge("publications", nP, lang) : null].filter(Boolean);

/**
 * La carte « coût » de l'écran 1 : « Ce lot utilisera 12 annonces et 30 publications. » (mur actif : « Ces 5
 * articles utiliseront… »), « Il te restera 28 annonces et 370 publications ce mois-ci. » (« illimité » au
 * Business), la règle des deux jauges, et ce qui part de chaque jauge (pour les mini-jauges).
 *   partage : partagerQuota(…, { jauges }) · nbPlateformes : les plateformes cochées (la phrase de la règle).
 */
export function coutDuLot({ partage, jauges, murActif = false, nbPlateformes = 1, lang = "fr" }) {
  const en = lang === "en";
  const nA = partage?.aConsommer ?? 0;
  const nP = partage?.publications ?? 0;
  const c = coutPublication({ annonces: nA, publications: nP }, jauges, { lang, lot: true });
  const k = partage?.maintenant?.length ?? 0;
  let utilise = c.utilise;
  if (murActif && k > 0 && utilise) {
    const corps = morceauxCout(nA, nP, lang).join(en ? " and " : " et ");
    utilise = en ? (k > 1 ? `These ${k} items will use ${corps}.` : `This item will use ${corps}.`)
      : (k > 1 ? `Ces ${k} articles utiliseront ${corps}.` : `Cet article utilisera ${corps}.`);
  }
  // Les morceaux de « Il te restera … » à mettre en gras : les nombres et leur mot, tels que coutPublication les écrit.
  const gras = [];
  if (c.reste) {
    if (/illimité\.$|unlimited\.$/.test(c.reste)) gras.push(en ? "unlimited" : "illimité");
    else for (const [cle, v, n] of [["annonces", c.resteA, nA], ["publications", c.resteP, nP]]) if (n > 0 && Number.isFinite(v)) gras.push(compteJauge(cle, v, lang));
  }
  const kp = Math.max(1, Number(nbPlateformes) || 0);
  const regle = en
    ? `An item on ${kp} platform${kp > 1 ? "s" : ""} counts 1 listing and ${kp} publication${kp > 1 ? "s" : ""}. A text that's already written doesn't use a listing.`
    : `Un article sur ${kp} plateforme${kp > 1 ? "s" : ""} compte 1 annonce et ${kp} publication${kp > 1 ? "s" : ""}. Un texte déjà rédigé ne prend pas d'annonce.`;
  return { utilise, reste: c.reste, gras, regle, annonces: nA, publications: nP };
}

/**
 * Le mur du lot avec la grille (maquette 4.3) : il NOMME la jauge qui bloque.
 *   « Il te reste 5 annonces ce mois-ci : 5 articles peuvent partir maintenant. Les 7 autres restent dans ton
 *   stock, à publier dès le 16 novembre. » — ou, par les publications : « Il te reste 14 publications : 7 articles
 *   sur 2 plateformes peuvent partir maintenant. … »
 *   plateformesDe(article) : le nombre de plateformes visées par cet article · dateRemise : déjà mise en mots (ou null).
 */
export function murDuLot({ partage, jauges, palier, dateRemise = null, plateformesDe = () => 0, lang = "fr" }) {
  const en = lang === "en";
  const k = partage?.maintenant?.length ?? 0;
  const p = partage?.plusTard?.length ?? 0;
  const nom = NOM_PLAN[palier] ?? "Free";
  const titre = en ? `Your ${nom} plan doesn't cover the whole batch` : `Ton plan ${nom} ne couvre pas tout le lot`;
  const cle = partage?.bloque === "publications" ? "publications" : "annonces";
  const r = jauges?.[cle]?.restantes;
  const reste = Number.isFinite(r) ? r : 0;
  // « sur 2 plateformes » : seulement quand tous les articles qui partent visent le même nombre de plateformes.
  const nbs = [...new Set((partage?.maintenant ?? []).map((a) => Number(plateformesDe(a)) || 0))];
  const surPf = cle === "publications" && nbs.length === 1 && nbs[0] > 0
    ? (en ? ` on ${nbs[0]} platform${nbs[0] > 1 ? "s" : ""}` : ` sur ${nbs[0]} plateforme${nbs[0] > 1 ? "s" : ""}`) : "";
  const quand = en ? (dateRemise ? `from ${dateRemise}` : "from your new month") : (dateRemise ? `dès le ${dateRemise}` : "dès ton nouveau mois");
  const ilReste = en
    ? `You have ${compteJauge(cle, reste, lang)} left${cle === "annonces" ? " this month" : ""}`
    : `Il te reste ${compteJauge(cle, reste, lang)}${cle === "annonces" ? " ce mois-ci" : ""}`;
  let phrase;
  if (k > 0) {
    phrase = en
      ? `${ilReste}: ${k} item${k > 1 ? "s" : ""}${surPf} can go now. ${p > 1 ? `The other ${p} stay` : "The other one stays"} in your stock, to publish ${quand}.`
      : `${ilReste} : ${k > 1 ? `${k} articles` : "1 article"}${surPf} ${k > 1 ? "peuvent" : "peut"} partir maintenant. ${p > 1 ? `Les ${p} autres restent` : "L'autre reste"} dans ton stock, à publier ${quand}.`;
  } else {
    phrase = en
      ? `${ilReste}. ${p > 1 ? `Your ${p} items stay` : "Your item stays"} in your stock, to publish ${quand}.`
      : `${ilReste}. ${p > 1 ? `Tes ${p} articles restent` : "Ton article reste"} dans ton stock, à publier ${quand}.`;
  }
  const suite = k > 0
    ? (en ? `Or continue with the ${k > 1 ? `${k} items` : "item"} your plan allows: the button below. Nothing is lost.`
      : `Ou continue avec ${k > 1 ? `les ${k} articles` : "l'article"} que ton plan permet : le bouton du bas. Rien n'est perdu.`)
    : null;
  return { titre, phrase, suite, jauge: cle };
}

/** Le bouton du mur : le palier visé chiffré sur les deux jauges du lot (volumes lus dans coin_config, clés jauge_*). */
export function boutonPalierDuLot(palierVise, K, lang = "fr") {
  if (!palierVise) return null;
  const en = lang === "en";
  const g = grilleDuPalier(K, palierVise);
  const finies = ["annonces", "publications"].filter((j) => g[j] !== Infinity);
  const illimitees = ["annonces", "publications"].filter((j) => g[j] === Infinity);
  const a = finies.length ? `${finies.map((j) => compteJauge(j, g[j], lang)).join(en ? " and " : " et ")} ${en ? "a month" : "par mois"}` : "";
  const b = illimitees.length ? (en ? `unlimited ${illimitees.map((j) => motJauge(j, 2, lang)).join(" and ")}` : `${illimitees.map((j) => motJauge(j, 2, lang)).join(" et ")} illimitées`) : "";
  const nom = NOM_PLAN[palierVise] ?? palierVise;
  return `${en ? `Switch to ${nom}:` : `Passer ${nom} :`} ${[a, b].filter(Boolean).join(en ? " and " : " et ")}`;
}

/**
 * Le bouton du bas de l'écran 1 avec la grille, ou null (le libellé d'avant reste) : « Préparer 30 publications »
 * (décision de Nico : le mot « annonce » appartient à la jauge IA) ; rien ne tient : la jauge qui manque.
 * « Continuer avec N articles » (mur actif) et « Coche au moins une plateforme » ne changent pas : null.
 */
export function libelleCtaDuLot({ partage, murActif = false, nbChoix = 0, jauges = null, lang = "fr" }) {
  if (!jauges) return null;
  const en = lang === "en";
  const n = partage?.maintenant?.length ?? 0;
  if (!n) {
    if (!nbChoix || !(partage?.plusTard?.length)) return null;
    if (partage?.bloque === "publications") {
      const r = jauges.publications?.restantes;
      return Number.isFinite(r) && r > 0
        ? (en ? "Not enough publications left this month" : "Pas assez de publications ce mois-ci")
        : (en ? "No publications left this month" : "Plus de publication ce mois-ci");
    }
    return en ? "No listings left this month" : "Plus d'annonce ce mois-ci";
  }
  if (murActif) return null;
  const nP = partage?.publications ?? 0;
  return en ? `Prepare ${nP} publication${nP > 1 ? "s" : ""}` : `Préparer ${nP} publication${nP > 1 ? "s" : ""}`;
}

/**
 * (04/11/2026, grille à 3 jauges) Le bouton d'envoi de l'écran 2 avec la grille, ou null (le libellé d'avant) :
 * « Envoyer 30 publications », « Envoyer les 5 prêts (12 publications) » — même règle que « Préparer N
 * publications » : le mot « annonce » appartient à la jauge IA. « Programmer » vient ensuite, du libellé (inchangé).
 */
export function libelleEnvoiDuLot({ nPrets = 0, nACompleter = 0, publications = 0, jauges = null, lang = "fr" }) {
  if (!jauges || !nPrets) return null;
  const en = lang === "en";
  const pub = `publication${publications > 1 ? "s" : ""}`;
  if (nACompleter) {
    return en
      ? `Send ${nPrets > 1 ? `the ${nPrets} ready items` : "the ready item"} (${publications} ${pub})`
      : `Envoyer ${nPrets > 1 ? `les ${nPrets} prêts` : "l'article prêt"} (${publications} ${pub})`;
  }
  return en ? `Send ${publications} ${pub}` : `Envoyer ${publications} ${pub}`;
}

/** (04/11/2026, grille à 3 jauges) Le titre de l'écran de fin avec la grille : « 30 publications en file ». */
export function titreFinDuLot(n, lang = "fr") {
  const en = lang === "en";
  return en ? `${n} publication${n > 1 ? "s" : ""} queued` : `${n} publication${n > 1 ? "s" : ""} en file`;
}

// ── La durée annoncée ──────────────────────────────────────────────────────
// Médianes mesurées en prod (audit 23/09, relevés du 01/10) : un dépôt Vinted,
// Leboncoin ou Beebs ≈ 1 min à 1 min 40, eBay par l'extension ≈ 4 min, eBay par
// nos serveurs ≈ 1 min (sans l'ordinateur). Plus 14 s de pause entre deux.
const DUREE_DEPOT_S = { vinted: 60, leboncoin: 98, beebs: 60, ebay: 225, depop: 20 };
const PAUSE_ENTRE_DEUX_S = 14;
/** Minutes avec l'ordinateur allumé pour déposer `parPlateforme` = { pf: n }. */
export function dureeEstimeeMin(parPlateforme, { ebayParServeur = false } = {}) {
  let s = 0;
  for (const [p, n] of Object.entries(parPlateforme ?? {})) {
    if (!n) continue;
    if (p === "ebay" && ebayParServeur) continue; // ne demande pas l'ordinateur
    s += n * ((DUREE_DEPOT_S[p] ?? 90) + PAUSE_ENTRE_DEUX_S);
  }
  return Math.ceil(s / 60);
}
/** « ≈ 40 min », « ≈ 1 h 20 » — jamais une fausse précision. */
export function libelleDuree(min, lang = "fr") {
  if (!Number.isFinite(min) || min <= 0) return "";
  if (min < 60) return `≈ ${Math.max(5, Math.round(min / 5) * 5)} min`;
  const h = Math.floor(min / 60);
  const r = Math.round((min % 60) / 10) * 10;
  return r ? `≈ ${h} h ${String(r).padStart(2, "0")}` : (lang === "en" ? `≈ ${h} h` : `≈ ${h} h`);
}

/**
 * Les annonces qui ressemblent (m.jumeaux) et retiennent encore l'article :
 * sur une plateforme visée, pas encore tranchées — et JAMAIS pour une fiche à
 * plus d'un exemplaire (09/10 soir, Louis : la ressemblance ne bloque pas un
 * article dont on a plusieurs exemplaires).
 */
export function jumeauxQuiRetiennent(m, plateformes, tranches = new Set()) {
  if (Number(m?.quantiteFiche) > 1) return [];
  return (m?.jumeaux ?? []).filter((j) => plateformes.includes(j.platform) && !tranches.has(j.platform));
}

// ── Lire l'état d'un article préparé (le moteur, en lecture seule) ─────────
/**
 * Ce qui reste à faire pour CET article avant l'envoi, à partir de son moteur.
 * `decisions` = ce que la personne a déjà tranché dans le lot :
 *   { texteValide: bool, jumeauxTranches: Set<pf> }.
 * Rend { pret, motifs: [{ cle, libelle }], plateformes } — motifs dans les mots
 * de l'écran. `pret` ne vaut que si le moteur est au repos.
 */
export function bilanArticle(m, decisions = {}, lang = "fr") {
  const en = lang === "en";
  const motifs = [];
  if (!m) return { pret: false, motifs, plateformes: [] };
  const plateformes = [...(m.plateformesPubliables ?? [])];
  // Les questions du moteur (champs exigés, taille, genre, description Vinted,
  // rayon à choisir) — comptées comme le stepper les compte.
  if ((m.nbQuestions ?? 0) > 0) {
    motifs.push({ cle: "questions", libelle: m.nbQuestions > 1 ? (en ? `${m.nbQuestions} answers` : `${m.nbQuestions} réponses`) : (en ? "1 answer" : "1 réponse") });
  }
  // Le prix : le stepper refuse sous 1 € (minimum Vinted, le plus strict).
  const prix = Number(m.price);
  if (m.price == null || String(m.price).trim() === "" || !Number.isFinite(prix) || prix < 1) {
    motifs.push({ cle: "prix", libelle: en ? "Price" : "Prix" });
  }
  // Le texte : en lot personne ne relit une carte — un texte qui n'est pas
  // celui du vendeur (titre OU description) se montre et se valide.
  // (26/10, D3) « À la demande » : une fiche SANS description n'a rien à relire — elle attend la sienne (écrite, ou
  // « Générer »). Jamais une description vide qui part.
  if (m.redactionALaDemande && !descriptionDuMoteur(m)) {
    motifs.push({ cle: "description", libelle: en ? "Description" : "Description" });
  }
  if (texteARelire(m) && !decisions.texteValide) {
    motifs.push({ cle: "texte", libelle: en ? "Text to check" : "Texte à relire" });
  }
  // Un article qui ressemble, en ligne sur une plateforme visée : la question
  // « est-ce le même article ? » (jamais une fusion, jamais un refus muet).
  // (09/10 soir, Louis) Une fiche à PLUSIEURS exemplaires n'est jamais
  // retenue par une ressemblance (m.quantiteFiche, posée par le lot).
  const tranches = decisions.jumeauxTranches ?? new Set();
  const jumeauxOuverts = jumeauxQuiRetiennent(m, plateformes, tranches);
  if (jumeauxOuverts.length) {
    motifs.push({ cle: "jumeau", libelle: en ? "Same item?" : "Même article ?" });
  }
  // LE POIDS LEBONCOIN (11/10 soir, Nico : « le poids obligatoire est une
  // friction de trop ») : la personne choisit, pour le lot, « Laisser
  // Leboncoin estimer » (PAR DÉFAUT — Leboncoin publie et estime d'après le
  // rayon) ou « Saisir le poids » (utils/choixPoidsLeboncoin.js, retenu pour
  // les publications suivantes). Le lot pose ce choix sur le moteur
  // (m.poidsLbcChoix). Seul « Saisir le poids » sans poids connu fait d'un
  // article Leboncoin un « à compléter » ; un poids connu (lot, copie, fiche)
  // part toujours. Beebs reste facultatif. Le format deviné par la rédaction
  // reste écarté au service du job (_shared/livraison-poids.js).
  if (poidsExigePour(plateformes) && poidsLbcManquantPour(m.poidsLbcChoix, poidsConnu(m, decisions))) {
    motifs.push({ cle: "poids", libelle: en ? "Leboncoin weight" : "Poids Leboncoin" });
  }
  // (09/10 soir) DEPOP : les frais de port que paie l'acheteur — le prix par
  // défaut des Réglages, ou celui dit UNE fois pour le lot (LivraisonDuLot).
  // Sans eux, l'article est À COMPLÉTER, jamais une question après l'envoi.
  if (plateformes.includes("depop") && m.portDepop?.manquant) {
    motifs.push({ cle: "port_depop", libelle: en ? "Depop shipping" : "Port Depop" });
  }
  // (26/10, Medik8 de Nico) La seule « photo » est une image de remplissage (l'image par défaut de Beebs, lue dans
  // la page : photoVide.js) : rien ne part avec elle — l'article attend une vraie photo, dite dès sa ligne.
  if (decisions.photoVide === true) {
    motifs.push({ cle: "photo", libelle: en ? "Photo" : "Photo" });
  }
  // (10/11, URGENT d0ac0538) Rien ne part parce que l'ADRESSE DE REMISE manque (Leboncoin, Beebs la réclament) : c'est
  // ce motif-là, nommé, jamais « Aucune plateforme » ni « Coche eBay, Depop » — le lot la demande (AdresseRemiseDuLot).
  const sansAdresse = [...(m.lbcAdresseManquante?.plateformes ?? [])];
  if (!plateformes.length && sansAdresse.length) {
    motifs.push({ cle: "adresse", libelle: en ? "Pickup address" : "Adresse de remise", plateformes: sansAdresse });
  } else if (!plateformes.length) {
    // Plus aucune plateforme où partir (toutes exclues) : rien ne partira.
    motifs.push({ cle: "aucune", libelle: en ? "Nowhere to publish" : "Aucune plateforme" });
  }
  // Le bouton du moteur est gris pour une raison que rien ci-dessus ne nomme :
  // on reprend SES mots (motifsCtaGris), jamais un « prêt » qu'il refuserait.
  if (!motifs.length && m.ctaDisabled && m.preparationAuRepos) {
    motifs.push({ cle: "cta", libelle: String(m.motifsCtaGris?.[0] ?? (en ? "To check" : "À vérifier")) });
  }
  const pret = Boolean(m.preparationAuRepos) && !motifs.length && !m.ctaDisabled;
  return { pret, motifs, plateformes, jumeauxOuverts };
}

// ── LE POIDS ET LE COLIS, PAR PLATEFORME (04/10, relevé live) ─────────────
// Ce que chaque plateforme demande VRAIMENT, et ce que le lot en fait :
//   · Leboncoin : un format (une TAILLE : Petit / Moyen / Volumineux) et un
//     palier de POIDS → le poids connu choisit le palier ; sans lui,
//     Leboncoin estime (« Laisser Leboncoin estimer », par défaut, 11/10 soir)
//     ou la personne le saisit (« Saisir le poids ») ; format s'il est choisi ;
//   · Beebs : « Format du colis » = un palier de POIDS → le poids connu, sinon
//     le pré-remplissage de Beebs ou le palier du rayon (extension) ;
//   · Vinted : une TAILLE de colis, jamais un poids → pas de poids exigé ;
//     (05/10) la taille choisie (carte du stepper, bloc Livraison du lot)
//     part, sinon celle de la fiche, sinon celle retenue pour le rayon,
//     sinon celle que Vinted recommande (utils/vintedColis.js) ;
//   · eBay (API) : ni poids ni format dans notre publication — les frais
//     viennent de la politique d'expédition du compte.
export const PLATEFORMES_AU_POIDS = Object.freeze(["leboncoin", "beebs"]);
export const plateformesAuPoids = (plateformes) => [...(plateformes ?? [])].filter((p) => PLATEFORMES_AU_POIDS.includes(p));
/** (11/10) Où le poids se demande avant l'envoi QUAND la personne a choisi « Saisir le poids » : Leboncoin seulement. */
export const PLATEFORMES_POIDS_EXIGE = Object.freeze(["leboncoin"]);
export const poidsExigePour = (plateformes) => [...(plateformes ?? [])].some((p) => PLATEFORMES_POIDS_EXIGE.includes(p));

/** Le poids connu de l'article (grammes), ou null : réglé dans le lot, sur la copie Leboncoin, ou sur la fiche. */
export function poidsConnu(m, decisions = {}) {
  for (const v of [decisions?.poids, m?.edited?.leboncoin?.platform_fields?.lbcPoidsGrammes, m?.initialListing?.poids_g]) {
    const g = Number(v);
    if (v != null && v !== "" && Number.isFinite(g) && g > 0) return Math.round(g);
  }
  return null;
}

/** Une saisie de poids (« 650 », « 1,2 kg », « 300 g ») en grammes, ou null. */
export function lirePoidsSaisi(brut) {
  const t = String(brut ?? "").trim().toLowerCase().replace(",", ".");
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(kg|g)?$/);
  if (!m) return null;
  const g = m[2] === "kg" ? Number(m[1]) * 1000 : Number(m[1]);
  return Number.isFinite(g) && g >= 1 && g <= 150000 ? Math.round(g) : null;
}

/** Le texte qui part n'est-il PAS celui du vendeur ? (titre ou description) */
/** La description qui partirait (le champ général, sinon la première copie qui en porte une). */
export function descriptionDuMoteur(m) {
  const g = String(m?.generales?.description ?? "").trim();
  if (g) return g;
  for (const c of Object.values(m?.edited ?? {})) { const d = String(c?.description ?? "").trim(); if (d) return d; }
  return "";
}

export function texteARelire(m) {
  // (26/10, D3) « À la demande » : le texte est celui de la personne — sauf un champ qu'elle a fait écrire par « Générer ».
  if (m?.redactionALaDemande) return Boolean((m.texteGenere?.titre || m.texteGenere?.description) && descriptionDuMoteur(m));
  const tv = m?.texteVendeur ?? {};
  return !String(tv.titre ?? "").trim() || !String(tv.description ?? "").trim();
}

// ── Le suivi d'un lot, depuis les jobs en base ─────────────────────────────
const FINIS_EN_LIGNE = new Set(["published", "sold", "dry_run_completed"]);
/**
 * Classe les jobs d'un lot en groupes, pour l'écran de suivi :
 *   geste (needs_user) · en_cours (processing) · file (pending) ·
 *   en_ligne (published/sold) · pas_parties (failed/cancelled hors arrêt) ·
 *   arretees (arrêt demandé par la personne — dit, jamais compté en échec) ·
 *   hors_france (25/10 : close parce que la plateforme n'est pas possible pour
 *   ce compte — Leboncoin d'une adresse hors de France, eBay inscrit hors
 *   d'eBay France ; neutre, jamais « à toi de jouer », jamais « à ta demande »).
 * Par ARTICLE (une ligne par article, ses plateformes en pastilles), dans
 * l'ordre : ce qui demande un geste d'abord.
 */
export function suiviDuLot(jobs = []) {
  const parArticle = new Map();
  for (const j of jobs ?? []) {
    if (!j || String(j.action ?? "publish") !== "publish") continue;
    const k = String(j.inventaire_id ?? "");
    if (!parArticle.has(k)) parArticle.set(k, []);
    parArticle.get(k).push(j);
  }
  const lignes = [];
  const compte = { geste: 0, en_cours: 0, file: 0, en_ligne: 0, pas_parties: 0, retirees: 0, hors_france: 0, arretees: 0 };
  let annonces = 0, annoncesEnLigne = 0, annoncesRetirees = 0;
  for (const [inventaireId, liste] of parArticle) {
    // Une plateforme = son job le plus récent dans le lot.
    const parPf = new Map();
    for (const j of liste) {
      const cur = parPf.get(j.platform);
      if (!cur || String(j.created_at ?? "") > String(cur.created_at ?? "")) parPf.set(j.platform, j);
    }
    // (25/10) Une plateforme close par NOS règles sans rien à dire au lot (veilleur de 72 h, plateforme écartée,
    // eBay d'un autre site) n'est pas une annonce du lot ; un article dont tout a été clos ainsi n'a pas de ligne.
    const pastilles = [...parPf.values()].map((j) => ({ platform: j.platform, etat: etatJobLot(j), job: j }))
      .filter((p) => p.etat !== "hors_suivi");
    if (!pastilles.length) continue;
    for (const p of pastilles) {
      annonces++;
      if (p.etat === "en_ligne") annoncesEnLigne++;
      if (p.etat === "retiree") annoncesRetirees++;
    }
    const groupe = groupeArticle(pastilles.map((p) => p.etat));
    compte[groupe]++;
    lignes.push({ inventaireId, groupe, pastilles });
  }
  const ordre = ["geste", "en_cours", "file", "pas_parties", "en_ligne", "retirees", "hors_france", "arretees"];
  lignes.sort((a, b) => ordre.indexOf(a.groupe) - ordre.indexOf(b.groupe));
  const enVol = compte.en_cours + compte.file;
  return { lignes, compte, articles: lignes.length, annonces, annoncesEnLigne, annoncesRetirees, fini: enVol === 0 };
}

// ── (25/10) CE QUE NOS RÈGLES ONT CLOS — balayage des erreurs visibles, règle 3 ──
// Le veilleur de 72 h de handler-watch (« … attendait une réponse depuis plusieurs jours : nous l'avons arrêtée »,
// la même signature que le serveur, _shared/pas-de-rouge.js VEILLE_RE) et l'abandon d'une plateforme tombaient
// en « À toi de jouer · pas parties » (cas B7) : un choix déjà fait, ou une clôture de notre fait.
const VEILLE_RE = /attendait une réponse depuis plusieurs jours/i;
// L'abandon (utils/abandonPlateforme.messageAbandon) et l'arrêt d'un dépôt du lot (MESSAGE_ARRET_DEPOT) disent
// eux-mêmes « à ta demande ».
const ARRET_DEMANDE_RE = /^(Arr[êe]t[ée]e? [àa] ta demande|Stopped at your request)/i;

/** (25/10) Arrêtée par la PERSONNE : l'arrêt demandé (lot, carte) et l'abandon d'une plateforme pour cet article —
 *  le seul « à ta demande » vrai. */
export function arreteeParLaPersonne(j) {
  if (!j) return false;
  if (estArretUtilisateur(j)) return true;
  if (j.status !== "cancelled") return false;
  return Boolean(j.platform_fields?.abandon_utilisateur) || ARRET_DEMANDE_RE.test(String(j.error ?? ""));
}

/**
 * (25/10) Une publication du lot CLOSE PAR NOS RÈGLES, sans geste possible ni rien à faire :
 *   · Leboncoin d'une adresse de remise hors de France, eBay inscrit hors d'eBay France (clôtures du 25/10) ;
 *   · le veilleur de 72 h (handler-watch) ;
 *   · une attente automatique qui ne partira pas d'elle-même : plateforme écartée par la personne (« je ne vends
 *     pas sur X »), compte eBay d'un autre site.
 * Jamais un échec réel (failed : refus, dépôt jamais vu en ligne — « pas parties », à trancher par Nico), jamais
 * un arrêt demandé par la personne (« arrêtées à ta demande »).
 */
export function clotureDeNosRegles(j) {
  if (!j || String(j.action ?? "publish") !== "publish") return false;
  if (estClotureLbcHorsFrance(j) || estClotureEbayHorsFrance(j)) return true;
  if (j.status === "cancelled" && !arreteeParLaPersonne(j) && VEILLE_RE.test(String(j.error ?? ""))) return true;
  if (j.status === "needs_user") {
    const a = attenteAutomatique(j);
    return a === "ecartee" || a === "ebay_etranger";
  }
  return false;
}

/** L'état d'UNE annonce du lot, dans le vocabulaire du suivi. */
export function etatJobLot(j) {
  if (!j) return "file";
  // (25/10) + l'abandon d'une plateforme (« Arrêté à ta demande — tu as abandonné X ») : un choix déjà fait.
  if (arreteeParLaPersonne(j)) return "arretee";
  // (25/10) Close parce que la plateforme n'est pas possible pour ce compte (Leboncoin d'une adresse de remise hors
  // de France, eBay inscrit hors d'eBay France) : rien n'est parti et rien n'est à faire — NEUTRE, jamais « à toi de
  // jouer · pas parties » (le cancelled sans arret_utilisateur y tombait), jamais « arrêtée à ta demande ».
  if (estClotureLbcHorsFrance(j) || estClotureEbayHorsFrance(j)) return "hors_france";
  // (25/10) Les autres clôtures de nos règles (veilleur, plateforme écartée, eBay d'un autre site) : hors du suivi.
  if (clotureDeNosRegles(j)) return "hors_suivi";
  if (FINIS_EN_LIGNE.has(j.status)) return "en_ligne";
  // (25/10) Un job vivant : l'état UNIQUE (etatJob) tranche, comme la file et la carte. Une attente automatique
  // (« En pause », ça repart seul) n'est jamais un « geste » ; un dépôt « en cours de confirmation » chez la
  // plateforme non plus (la carte le dit gris) ; une connexion attendue, si (« À toi de jouer »).
  if (j.status === "needs_user" || j.status === "processing" || j.status === "pending") {
    if (natureNeedsUser(j) === "en_cours") return "en_cours";
    const e = etatJob(j).etat;
    if (e === ETATS.A_TOI) return "geste";
    if (e === ETATS.EN_COURS) return "en_cours";
    return "file"; // en file, ou en pause : ça repart seul
  }
  // Publiée PUIS retirée (retrait demandé, vente ailleurs) : le dépôt a réussi,
  // ce n'est jamais un « pas partie ».
  if (j.published_at || String(j.listing_url ?? "").trim()) return "retiree";
  return "pas_partie"; // failed, cancelled (hors arrêt demandé et hors clôtures de nos règles)
}

/**
 * (25/10) Les jobs d'un lot que l'APP suit (ligne du Stock, écran de suivi) : sans les plateformes dont le DERNIER
 * job a été clos par nos règles (clotureDeNosRegles) — Leboncoin d'une adresse hors de France compris (Nico, 25/10 :
 * « Leboncoin disparaît de tous les choix… Les lignes déjà annulées ne doivent plus lui apparaître comme des
 * erreurs »). Le dernier job d'une plateforme fait foi : un vieil échec n'est jamais ressuscité par la clôture qui
 * l'a suivi. suiviDuLot, appelé seul, garde le groupe neutre « réservé à la France » (preuve : lbc-adresse-france).
 */
export function jobsDuSuivi(jobs = []) {
  const dernier = new Map();
  for (const j of jobs ?? []) {
    if (!j || String(j.action ?? "publish") !== "publish") continue;
    const k = `${j.inventaire_id ?? ""}|${j.platform}`;
    const cur = dernier.get(k);
    if (!cur || String(j.created_at ?? "") > String(cur.created_at ?? "")) dernier.set(k, j);
  }
  const closes = new Set([...dernier].filter(([, j]) => clotureDeNosRegles(j)).map(([k]) => k));
  if (!closes.size) return [...(jobs ?? [])];
  return (jobs ?? []).filter((j) => !closes.has(`${j?.inventaire_id ?? ""}|${j?.platform}`));
}

/**
 * (25/10) Le lot le plus récent (identifiant posé sur ses jobs) que suit la ligne du haut du Stock, ou null — la
 * règle de StockTab (lotRecent), ici pour être prouvée. Tant qu'il avance, ou qu'il a fini depuis moins de 6 h, ou
 * qu'un article y attend un geste (7 jours au plus). Un lot fait SEULEMENT de clôtures de nos règles n'existe plus
 * pour cette ligne (Marta, 25/10 : « 0 annonce en ligne sur 38 », tout clos « réservé à la France »).
 * `jobsParArticle` = { inventaire_id: [jobs] } (la forme lue par le Stock).
 */
export function lotLePlusRecent(jobsParArticle, maintenant = Date.now()) {
  const parLot = new Map();
  for (const list of Object.values(jobsParArticle ?? {})) {
    for (const j of list ?? []) {
      const id = idLotDeJob(j);
      if (!id || j.action !== "publish" || !j.platform_fields?.lot_publication) continue;
      if (!parLot.has(id)) parLot.set(id, { id, le: j.platform_fields.lot_publication.le ?? j.created_at, jobs: [] });
      parLot.get(id).jobs.push(j);
    }
  }
  let recent = null;
  for (const l of parLot.values()) {
    const suivis = jobsDuSuivi(l.jobs);
    if (!suivis.length) continue;
    if (!recent || String(l.le) > String(recent.le)) recent = { ...l, jobs: suivis };
  }
  if (!recent) return null;
  const suivi = suiviDuLot(recent.jobs);
  if (!suivi.articles) return null;
  const ilYa = maintenant - Date.parse(recent.le ?? 0);
  if (suivi.fini && !(ilYa < 6 * 3600 * 1000) && !suivi.compte.geste) return null;
  if (ilYa > 7 * 86400 * 1000) return null;
  return { ...recent, suivi };
}

/** Le groupe d'un article, à partir des états de ses annonces. */
export function groupeArticle(etats) {
  if (etats.includes("geste")) return "geste";
  if (etats.includes("en_cours")) return "en_cours";
  if (etats.includes("file")) return "file";
  if (etats.includes("pas_partie")) return "pas_parties";
  if (etats.includes("en_ligne")) return "en_ligne";
  if (etats.includes("retiree")) return "retirees";
  if (etats.includes("hors_france")) return "hors_france";
  return "arretees";
}

// ── L'arrêt ────────────────────────────────────────────────────────────────
// Ce qu'on peut arrêter SANS RISQUE : un dépôt pas encore commencé (pending),
// ou qui attend un geste (needs_user) — rien n'est en ligne. Jamais un dépôt en
// cours (processing) : l'extension est peut-être déjà sur le formulaire, il va
// au bout et on le dit.
export function depotArretable(j) {
  return Boolean(j) && String(j.action ?? "publish") === "publish"
    && (j.status === "pending" || j.status === "needs_user")
    && !j.listing_url && !String(j.platform_listing_id ?? "").trim();
}
export const MESSAGE_ARRET_DEPOT = "Arrêtée à ta demande — rien n'a été publié.";

/** Le marqueur de lot posé dans platform_fields à la création (porté par la RPC). */
export function marqueLot(lotId, le = new Date().toISOString()) {
  return { lot_publication: { id: String(lotId), le } };
}
export const idLotDeJob = (j) => j?.platform_fields?.lot_publication?.id ?? j?.bulk_batch_id ?? null;

// ── Les réponses groupées : même liste fermée = une réponse pour tous ──────
/**
 * Regroupe, sur plusieurs articles, les questions de champ « à liste fermée »
 * identiques (même plateforme, même champ, mêmes valeurs) : une seule réponse
 * les remplit toutes. `entrees` = [{ id, gp, key, label, allowedValues }].
 * Rend [{ signature, gp, key, label, allowedValues, ids: [...] }] — seulement
 * les groupes d'au moins deux articles.
 */
export function groupesReponseCommune(entrees) {
  const groupes = new Map();
  for (const e of entrees ?? []) {
    const vals = Array.isArray(e.allowedValues) ? e.allowedValues.map((v) => String(v)) : [];
    if (!vals.length || vals.length > 60) continue;
    // (26/10 nuit, lot de Nico) Une réponse commune n'est offerte que pour une VRAIE question : jamais un champ déjà
    // résolu (deduit, non bloquant — l'ISBN de « EAT » lu sur la fiche), jamais une liste à une seule valeur (ce n'est
    // pas un choix), jamais l'ISBN (il se tape, livre par livre). Avant : « Ce livre n'a pas d'ISBN » pour 2 livres
    // dont l'un avait son ISBN — un geste l'aurait effacé.
    const a = e.a && typeof e.a === "object" ? e.a : null;
    if (a && (a.deduit || !((a.state === "missing" && a.blocking !== false) || (a.state === "invalid" && a.blocking === true)))) continue;
    if (vals.length < 2) continue;
    if (e.gp === "vinted" && e.key === "isbn") continue;
    const signature = `${e.gp}|${e.key}|${vals.join("␟")}`;
    if (!groupes.has(signature)) groupes.set(signature, { signature, gp: e.gp, key: e.key, label: e.label, allowedValues: vals, ids: [] });
    const g = groupes.get(signature);
    if (!g.ids.includes(e.id)) g.ids.push(e.id);
  }
  return [...groupes.values()].filter((g) => g.ids.length >= 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// LE MUR DE CONVERSION DU LOT (03/10/2026, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Quand le quota du mois ne couvre pas tout le lot, deux choix clairs :
//   · passer au palier au-dessus, par le parcours d'achat EXISTANT
//     (openUpgradeModal → App Store, Google Play ou Stripe) ;
//   · continuer avec ce que le quota permet — le reste attend le nouveau mois.
// Le gratuit ne dépasse JAMAIS son quota (partagerQuota ne prépare rien
// au-delà, et generate-listing refuse en 402 de son côté).
// ⛔ UN ABONNEMENT SE CHANGE LÀ OÙ IL A ÉTÉ PRIS : Apple → Apple, Google →
//    Google, carte → Stripe. Payé ailleurs que sur cet appareil : on le dit et
//    on montre où, on ne lance JAMAIS un second abonnement.

export const PALIERS = PALIERS_COMPTE;

/** Le palier d'un compte, avec l'expression canonique du premium (pur). */
export function palierCourant({ isPremium = false, isPro = false, isBusiness = false } = {}) {
  // Le calcul unique (utils/palier.js, 04/10) : Business ⇒ Pro ⇒ Premium.
  return palierDesDrapeaux({ isPremium, isPro, isBusiness });
}

/** Le palier juste au-dessus, ou null (Business, ou offre Business masquée). */
export function palierSuivant(palier, { businessVisible = false } = {}) {
  if (palier === "gratuit") return "premium";
  if (palier === "premium") return "pro";
  if (palier === "pro") return businessVisible ? "business" : null;
  return null;
}

/** Le canal de CET appareil : 'apple' (iOS), 'google' (Android), 'stripe' (web). */
export function canalAppareil(plateforme) {
  if (plateforme === "ios") return "apple";
  if (plateforme === "android") return "google";
  return "stripe";
}

/**
 * Où l'abonnement EN COURS a été pris (pur). null = aucun abonnement payant
 * connu (gratuit, ou premium offert) : rien à doublonner, l'achat se fait
 * sur cet appareil. Plusieurs marqueurs : on préfère celui de CET appareil
 * s'il en fait partie (c'est là que la montée se fera), sinon le premier.
 * ⛔ Les marqueurs Apple/Google survivent à la résiliation : ils ne disent
 *    JAMAIS qu'on est premium (règle du 25/07) — ici seulement OÙ un
 *    abonnement payant, déjà établi par le palier, a été pris.
 */
export function canalAbonnement({ payant = false, apple = null, google = null, stripe = null } = {}, canalIci = null) {
  if (!payant) return null;
  const canaux = [apple ? "apple" : null, google ? "google" : null, stripe ? "stripe" : null].filter(Boolean);
  if (!canaux.length) return null;
  if (canalIci && canaux.includes(canalIci)) return canalIci;
  return canaux[0];
}

/** Monter de palier ICI est-il possible sans doubler un abonnement ? (pur) */
export function monteePossibleIci(canalAbo, canalIci) {
  return canalAbo == null || canalAbo === canalIci;
}

// Un lot interrompu par un paiement (Stripe quitte la page) : retrouvé au
// retour, sur CET appareil seulement, pendant deux heures. Effacé dès que le
// lot part ou se ferme.
export const CLE_REPRISE_LOT = (uid) => `fs_lot_reprise_${uid}`;
export const REPRISE_LOT_MAX_MS = 2 * 3600 * 1000;
/** La reprise lue est-elle encore valable ? (pur) */
export function repriseValable(reprise, maintenant = Date.now()) {
  if (!reprise || !Array.isArray(reprise.ids) || !reprise.ids.length) return false;
  const t = Date.parse(reprise.le ?? "");
  return Number.isFinite(t) && maintenant - t >= 0 && maintenant - t <= REPRISE_LOT_MAX_MS;
}
