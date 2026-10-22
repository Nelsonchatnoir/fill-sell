// ═══════════════════════════════════════════════════════════════════════════
// LE TITRE, LA DESCRIPTION, L'ÉTAT ET LES PHOTOS DU VENDEUR PARTENT TELS QUELS
// (22/10 soir, point 8 — Louis, « Insert / Rangement Zombicide »)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI S'EST PASSÉ (vérifié en base) : le 20/10 à 13:49, dix fiches naissent
// du relevé Beebs de louis@ avec le titre et la vignette de la liste — ni texte,
// ni état, une photo. Leur annonce Beebs (son texte « 🎯 Organisez vos
// figurines… », « Neuf », quatre photos) n'est LUE (capture) qu'à 22:20. Louis
// publie sur Leboncoin à 13:57 : la fiche est vide, le moteur fait ce que la
// règle du 21/09 lui permet — il remplit les cases vides (texte rédigé, « Très
// bon état » par défaut, une photo). La seule fiche déjà lue (la jaune) part
// juste. Puis chaque republication Leboncoin RECOPIE le job source : l'écrasement
// se reproduit à l'infini.
//
// LA RÈGLE (Nico, 22/10) : titre, description, état et photos d'une fiche
// importée ou écrite par le vendeur partent TELS QUELS ; l'IA ne complète que ce
// qui est vide CHEZ LE VENDEUR — une case vide dans FillSell parce que l'annonce
// d'origine n'est pas encore lue n'est PAS vide : on attend la lecture
// (« en cours de lecture de ton annonce d'origine »), on ne rédige pas.
//
// Ce fichier (.js, lu par Deno ET par l'app, comme etat-plateformes.js) porte :
//   · plateformeOrigine / texteDuVendeurSurFiche — qui a écrit la fiche ;
//   · lectureOrigineEnAttente — faut-il attendre la lecture de l'annonce d'origine ;
//   · contenuAImposer — au moment de partir (get-pending-jobs), ce que la fiche
//     impose à une copie dont le contenu a été produit AVANT que le vendeur ne
//     soit lu (publication faite trop tôt, republication qui recopie ce dépôt).
// ⛔ Jamais au-dessus d'un choix de la personne : un contenu produit APRÈS que la
//    fiche portait déjà le texte / l'état du vendeur est un contenu qu'elle a vu
//    et validé (copie dissociée, état choisi au stepper — règle du 15/10, DeadRoz) :
//    on n'y touche pas.
// ═══════════════════════════════════════════════════════════════════════════
import { tierEtat, RANG_ETAT, etatPourPlateforme } from "./etat-plateformes.js";

/** La règle « le texte du vendeur fait foi » (generate-listing, 21/09) : une copie rédigée avant n'est jamais un choix. */
export const REGLE_TEXTE_VENDEUR_LE = "2026-09-22T00:00:00+02:00";

/** Les plateformes dont un import peut naître (Opla : sortie le 10/10, plus aucun import). */
export const PLATEFORMES_IMPORT = Object.freeze(["vinted", "leboncoin", "beebs", "ebay", "depop"]);

/** La plateforme d'origine d'une fiche importée ; null pour une fiche écrite dans FillSell. */
export function plateformeOrigine(fiche) {
  const o = String(fiche?.origine ?? "").trim().toLowerCase();
  if (o === "vinted_sync") return "vinted";
  const m = o.match(/^releve_([a-z]+)$/);
  return m && PLATEFORMES_IMPORT.includes(m[1]) ? m[1] : null;
}

const nbMots = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;
/** Même seuil que generate-listing (07/09) : un texte d'un seul mot ne dit rien de l'article. */
export const texteSuffisant = (s) => nbMots(s) >= 2;

/** L'URL d'une photo (chaîne nue ou objet {url}). */
export function urlPhoto(p) {
  if (typeof p === "string") return p.trim() || null;
  if (p && typeof p === "object" && typeof p.url === "string") return p.url.trim() || null;
  return null;
}
/** Les photos, en URLs, dans l'ordre, sans doublon. */
export function photosEnUrls(photos) {
  const out = [];
  for (const p of Array.isArray(photos) ? photos : []) {
    const u = urlPhoto(p);
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}
/** Une photo hébergée chez nous (stockage Supabase) : le dépôt sait toujours la lire. */
export const photoChezNous = (u) => /\/storage\/v1\/object\/public\//.test(String(u ?? ""));

const marqueur = (fiche, cle) => String(fiche?.attributs?.[cle]?.v ?? "").trim().toLowerCase();
const marqueurVendeur = (v) => v === "vinted" || v === "manuel" || v.startsWith("releve");

/** La fiche porte-t-elle le contenu du vendeur ? (même règle que generate-listing, 21/09) */
export function texteDuVendeurSurFiche(fiche) {
  return Boolean(plateformeOrigine(fiche))
    || marqueurVendeur(marqueur(fiche, "description_source"))
    || marqueurVendeur(marqueur(fiche, "titre_source"));
}

/**
 * Faut-il attendre la lecture de l'annonce d'origine avant toute publication ?
 *
 * @param fiche     {origine, description, photos, attributs}
 * @param annonces  lignes annonces_plateforme de la fiche : [{platform, capture_le, disparu_le}]
 * @param lu        {descriptionLueLe, origineLueLe} — une lecture DÉJÀ faite (détail Vinted lu, description reprise) :
 *                  ce qui manque encore n'existe pas chez le vendeur, on n'attend plus (jamais une attente sans fin)
 * @returns null (rien à attendre) | {plateforme, manque: Array<'description'|'etat'|'photos'>}
 *
 * Par plateforme d'origine :
 *  · Vinted — le dressing porte titre, état et photos, jamais la description (lue au détail) : on attend
 *    la description tant qu'elle manque ;
 *  · Leboncoin, Beebs, Depop — la liste ne porte que titre et vignette ; tant que l'annonce d'origine n'a
 *    JAMAIS été lue (capture), ce qui manque (texte, état, photos) existe peut-être chez le vendeur : on
 *    attend. Une fois lue, ce qui manque encore n'existe pas chez lui : l'IA peut compléter ;
 *  · eBay — le relevé par l'API lit l'annonce entière : rien à attendre.
 */
export function lectureOrigineEnAttente(fiche, annonces = [], lu = {}) {
  const pf = plateformeOrigine(fiche);
  if (!pf || pf === "ebay") return null;
  const manque = [];
  if (!texteSuffisant(fiche?.description)) manque.push("description");
  if (pf !== "vinted") {
    if (!String(fiche?.attributs?.etat?.v ?? "").trim()) manque.push("etat");
    if (photosEnUrls(fiche?.photos).length <= 1) manque.push("photos");
  }
  if (!manque.length) return null;
  if (pf === "vinted") {
    // Lue (détail, reprise) : ce qui manque n'existe pas chez le vendeur. Annonce Vinted disparue du dressing
    // (vendue, supprimée) : plus rien à lire. Dans les deux cas, on n'attend pas.
    if (lu?.descriptionLueLe || lu?.origineLueLe || fiche?.disparu_le) return null;
    return { plateforme: pf, manque };
  }
  const lignes = (Array.isArray(annonces) ? annonces : []).filter((a) => a?.platform === pf && !a?.disparu_le);
  if (!lignes.length) return null;                       // l'annonce d'origine n'est plus en ligne : rien à lire
  if (lignes.some((a) => a?.capture_le)) return null;    // déjà lue : ce qui manque n'existe pas chez le vendeur
  return { plateforme: pf, manque };
}

const NOMS = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", depop: "Depop", opla: "Opla" };
/** La phrase montrée pendant l'attente — jamais une erreur. */
export function messageLectureOrigine(attente, lang = "fr") {
  const nom = NOMS[attente?.plateforme] ?? attente?.plateforme ?? "";
  return lang === "en"
    ? `Reading your original ${nom} listing (text, photos, condition): it goes out with YOUR content as soon as the FillSell extension on your computer has read it.`
    : `En cours de lecture de ton annonce d'origine ${nom} (texte, photos, état) : elle partira avec TON contenu dès que l'extension FillSell de ton ordinateur l'aura lue.`;
}

const comparable = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "");
/** La copie reprend-elle le texte du vendeur ? (une adaptation — coupe, nettoyage — en garde l'essentiel) */
export function copieReprendLeTexte(copie, texte) {
  const a = comparable(copie), b = comparable(texte);
  if (!b) return true;
  if (!a) return false;
  if (a.includes(b) || b.includes(a)) return a.length >= Math.min(b.length, 40);
  // Les 60 premiers caractères comparables du vendeur au début de la copie : une coupe à la longueur
  // maximale de la plateforme (Vinted, Depop) garde le début.
  const debut = b.slice(0, Math.min(60, b.length));
  return a.startsWith(debut);
}

/**
 * Ce que la fiche impose à la copie d'une plateforme, au moment de partir.
 *
 * @param job    {platform, title, description, photos, photo_option, platform_fields, created_at}
 * @param fiche  {origine, titre, description, photos, attributs}
 * @param temps  {contenuLe, descriptionLueLe, etatLuLe, photosLuesLe} — ISO. `contenuLe` : quand le contenu
 *               de la copie a été produit (le premier dépôt de la fiche sur la plateforme, que les
 *               republications recopient).
 * @returns {{description?: string, etat?: string, photos?: string[], raisons: string[], photos_a_rapatrier?: boolean}}
 */
export function contenuAImposer(job, fiche, temps = {}) {
  const out = { raisons: [] };
  if (!job || !fiche || !texteDuVendeurSurFiche(fiche)) return out;
  const t0 = Date.parse(String(temps.contenuLe ?? job.created_at ?? ""));
  if (!Number.isFinite(t0)) return out;
  const apres = (iso) => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) && t > t0; };
  const pf = String(job.platform ?? "");

  // DESCRIPTION — absente de la copie, et lue chez le vendeur APRÈS que la copie a été rédigée — ou copie rédigée
  // AVANT la règle « le texte du vendeur fait foi » (21/09) : le moteur réécrivait alors le texte du vendeur même
  // quand la fiche le portait, et chaque republication recopie ce dépôt (Louis, « Black Plague », 22/10).
  const fd = String(fiche.description ?? "").trim();
  const avantRegle = t0 < Date.parse(REGLE_TEXTE_VENDEUR_LE);
  if (texteSuffisant(fd) && (apres(temps.descriptionLueLe) || avantRegle) && !copieReprendLeTexte(job.description, fd)) {
    out.description = fd;
    out.raisons.push("description");
  }

  // ÉTAT — jamais dégradé : l'état du vendeur, lu après la copie, au-dessus de celui de la copie.
  const etatFiche = String(fiche?.attributs?.etat?.v ?? "").trim();
  const tf = tierEtat(etatFiche);
  const tj = tierEtat(job?.platform_fields?.etat);
  if (tf && apres(temps.etatLuLe) && (!tj || RANG_ETAT[tj] < RANG_ETAT[tf])) {
    // Depop : la copie porte l'état dans le vocabulaire Vinted (le content script le traduit en code Depop).
    const e = etatPourPlateforme(etatFiche, pf === "depop" ? "vinted" : pf);
    if (e?.valeur && !e.meilleur) {
      out.etat = e.valeur;
      out.raisons.push("etat");
    }
  }

  // PHOTOS — toutes celles de la fiche, dans l'ordre, quand la copie en a moins (copie « originale »
  // seulement : une copie retouchée est un choix de la personne). Hébergées chez nous seulement :
  // sinon on attend leur rapatriement (handler-watch), on n'envoie pas une adresse de CDN.
  const fp = photosEnUrls(fiche.photos);
  const jp = photosEnUrls(job.photos);
  const originale = String(job.photo_option ?? "original") === "original";
  if (originale && fp.length > jp.length && apres(temps.photosLuesLe)) {
    if (fp.every(photoChezNous)) {
      out.photos = fp;
      out.raisons.push("photos");
    } else {
      out.photos_a_rapatrier = true;
    }
  }
  return out;
}
