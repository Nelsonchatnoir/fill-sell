// ── « UN JUMEAU EST DÉJÀ EN LIGNE » — PRÉVENIR, JAMAIS INTERDIRE (2026-09-21) ─
//
// POURQUOI. Cas Romain (voirememe), 21/09 : le relevé du 19/09 a créé une
// SECONDE ligne de stock « Cluedo Conspiration Hasbro » pour un objet qui en
// avait déjà une (« Cluedo Conspiration », août). Les deux lignes étaient
// vraies, les deux avaient leurs annonces, et l'app n'avait rien à en dire :
// le verrou existant (`publishedSet` / `queuedSet`, ListingPreviewScreen) ne
// regarde QUE les jobs de l'ARTICLE qu'on publie. Publier depuis la seconde
// ligne était donc parfaitement autorisé — et aurait posé un second Cluedo là
// où l'objet était déjà en vente. Sur Vinted, deux annonces identiques valent
// un AVERTISSEMENT (Romain en avait pris un le 19/09) puis une restriction de
// compte.
//
// ⛔ ON PRÉVIENT, ON N'INTERDIT PAS. Deux exemplaires du même jouet, c'est
//    banal chez un revendeur — et personne mieux que la personne ne sait si
//    elle en a deux. Le message nomme l'annonce, donne son lien, et le bouton
//    Publier reste exactement aussi cliquable qu'avant. Aucun `needs_user`,
//    aucune garde serveur, aucune plateforme décochée, aucune unité en jeu.
//
// ⛔ CE N'EST PAS UNE PREUVE, C'EST UN FILET. Le critère (≥ 2 mots
//    significatifs en commun) rattrape « Cluedo Conspiration Hasbro » ↔
//    « Hasbro Cluedo Conspiracy Board Game », mais PAS « HotWheels Stunt
//    Track » ↔ « Hot Wheels Lanceur Vertical » (mesuré le 21/09 sur le compte
//    de Romain : 4 paires vues sur les 5 réelles). Un silence ne dit donc
//    JAMAIS « aucun jumeau ». Le rapprochement qui TRANCHE, lui, appartient à
//    l'écran « Rattacher » — c'est lui qui devra faire disparaître la cause.
//
// COÛT. Deux lectures bornées, déclenchées seulement à l'étape Publier, et
// seulement sur les plateformes cochées : le filtre est posé CÔTÉ SERVEUR sur
// les mots les plus rares du titre, jamais « tous les jobs du compte »
// (44 651 lignes dans le parc, et PostgREST tronque à 1000 sans prévenir).
// Extensions explicites : ce module est aussi importé tel quel par Node
// (scripts/etats-publication-selftest.mjs) — Vite les accepte à l'identique.
import { texteComparable } from "./texteComparable.js";
import { idAnnonceDe } from "./publicationState.js";
// ── LA COULEUR EXCLUT, LA PHOTO PROUVE (2026-09-23, kits de Louis) ──────────
// « Rangement Blanc et Noir… » et « Rangement Blanc et Gris… » partagent six
// mots et la même photo : deux kits, deux annonces. L'alerte les citait comme
// jumeaux. Désormais :
//   · deux titres à couleurs (ou nombres) différentes ne sont JAMAIS des
//     jumeaux (variantesTitre — même règle que le faisceau SQL) ;
//   · la PHOTO prouve : mêmes empreintes (photo-empreinte, cache
//     photo_empreintes) → jumeau, même avec peu de mots ;
//   · sans preuve photo, il faut le titre entier (≥ 4 mots) ET le même prix,
//     ou le titre normalisé identique — plus jamais « 2 mots + prix ».
// La fonction edge injoignable → on retombe sur le texte seul, strict.
import { variantesIncompatibles } from "./variantesTitre.js";
import { titreNorm } from "./rapprochementJumeau.js";
import { chargerEmpreintes, meilleurAppariement } from "./empreintePhoto.js";
import { urlsPhotos } from "./photos.js";

// Mots qui ne distinguent rien : ils sont dans un titre sur trois.
const MOTS_VIDES = new Set([
  "taille", "unique", "jeux", "jouets", "avec", "pour", "dans", "sans", "plus",
  "tres", "neuf", "neuve", "neufs", "collection", "produit", "marque", "etat",
  "lot", "piece", "pieces", "original", "originale", "vintage", "occasion",
  "with", "from", "size", "brand", "item", "items", "game", "games", "new",
]);

const SEUIL_MOTS_COMMUNS = 2;   // plancher : en dessous, on ne cherche même pas
const MOTS_SUFFISANTS = 4;      // tellement de mots en commun que le prix ne sert plus
const MAX_MOTS_FILTRE = 4;      // au-delà, le `or=` ramène tout le compte
const MAX_LIGNES_LUES = 200;

// Forme comparable, réduite à des mots nus : accents retirés (texteComparable,
// le même normalisateur que partout ailleurs), puis tout ce qui n'est ni
// lettre ni chiffre devient une coupure.
// Une ANNÉE ne distingue rien non plus : deux Hot Wheels « 2026 » de modèles
// différents partageaient « wheels » + « 2026 » au même prix de 5 € et
// déclenchaient l'avertissement (cas mesuré chez Romain le 21/09). Les autres
// nombres, eux, discriminent bel et bien (1000 pièces, 527 pièces, 125 ml).
const estUneAnnee = (m) => /^(19|20)\d{2}$/.test(m);

export function motsDuTitre(...morceaux) {
  const brut = texteComparable(morceaux.filter(Boolean).join(" "));
  return [...new Set(brut.replace(/[^a-z0-9]+/g, " ").trim().split(" "))]
    .filter((m) => m.length >= 4 && !MOTS_VIDES.has(m) && !estUneAnnee(m));
}

// Les mots du titre SOURCE, accents COMPRIS : `ilike` compare littéralement,
// et le titre stocké en face peut très bien s'écrire « Édition ».
function motsAccentues(...morceaux) {
  const brut = String(morceaux.filter(Boolean).join(" ")).toLowerCase();
  return [...new Set(brut.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" "))]
    .filter((m) => m.length >= 4);
}

// Les plus longs d'abord : un mot long est plus rare, donc plus discriminant.
const plusRares = (mots) => [...mots].sort((a, b) => b.length - a.length).slice(0, MAX_MOTS_FILTRE);

// `col.ilike.*mot*,col.ilike.*autre*` — les mots sont [a-z0-9] après
// normalisation, ou des lettres accentuées : rien qui casse la syntaxe
// PostgREST (ni virgule, ni parenthèse, ni guillemet).
function clauseOu(colonne, titre, marque) {
  const formes = new Set([...plusRares(motsDuTitre(titre, marque)), ...plusRares(motsAccentues(titre, marque))]);
  return [...formes].map((m) => `${colonne}.ilike.*${m}*`).join(",");
}

// Deux titres parlent-ils du même objet ? Volontairement grossier : c'est un
// avertissement, pas une fusion.
export function motsCommuns(motsArticle, titreCandidat) {
  const b = new Set(motsDuTitre(titreCandidat));
  return motsArticle.filter((m) => b.has(m));
}

const memePrix = (a, b) => {
  const x = Number(a), y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.01;
};

// ── LA RÈGLE, ET POURQUOI ELLE A DEUX BRANCHES ──────────────────────────────
// Deux mots en commun suffisent à rapprocher deux objets DIFFÉRENTS d'un même
// vendeur : « Puzzle Clementoni Disney Panorama » et « Puzzle Clementoni
// Marvel Panorama » en partagent trois, « Montre Swatch quartz » et « Montre
// Seiko quartz » aussi (mesuré le 21/09 sur le parc). Un avertissement qui
// crie à chaque puzzle ne serait plus lu. On exige donc, EN PLUS des deux
// mots, l'un de ces deux signaux :
//   · le MÊME PRIX — c'est le même objet mis en vente deux fois, pas deux
//     variantes d'une gamme (Cluedo 14/14, Bop It 15/15, Mega Pokémon 25/25) ;
//   · QUATRE mots en commun ou plus — le titre entier se recouvre, le prix ne
//     tranche plus rien (Puzzle Disney Panorama : 4 mots, 12 € vs 9 €).
// Prix inconnu d'un côté ⇒ seule la seconde branche compte : un prix absent
// n'est pas un prix égal (règle du 03/08, VIDE ≠ ZÉRO, même esprit).
export function estUnJumeau(communs, prixArticle, prixCandidat) {
  if (communs.length >= MOTS_SUFFISANTS) return true;
  return communs.length >= SEUIL_MOTS_COMMUNS && memePrix(prixArticle, prixCandidat);
}

/**
 * Le verdict FINAL sur un candidat, une fois les mots communs comptés :
 *   · variante (couleur / nombre différents) → jamais ;
 *   · photo identique → jumeau, preuve « photo » ;
 *   · titre normalisé identique → jumeau, preuve « titre » ;
 *   · titre entier (≥ 4 mots) ET même prix → jumeau, preuve « texte » ;
 *   · sinon → non. (Sans empreintes disponibles, la règle texte seule vaut.)
 */
export function verdictJumeau({ titre, prix, candidat, photo = null }) {
  if (variantesIncompatibles(titre, candidat.titre).incompatibles) return null;
  if (photo && photo.verdict === "identique") return "photo";
  const tn = titreNorm(titre);
  if (tn && tn.length > 12 && tn === titreNorm(candidat.titre)) return "titre";
  if ((candidat.mots?.length ?? 0) >= MOTS_SUFFISANTS && memePrix(prix, candidat.prix)) return "texte";
  return null;
}

/**
 * Les annonces d'AUTRES articles, déjà en ligne, qui ressemblent à celui-ci.
 *
 * @param {object}   supabase
 * @param {object}   p
 * @param {string}   p.userId
 * @param {number?}  p.inventaireId  l'article qu'on publie (exclu de la recherche)
 * @param {string}   p.titre
 * @param {string?}  p.marque
 * @param {number?}  p.prix          le prix de CE lot (cf. estUnJumeau)
 * @param {string[]} p.plateformes   les plateformes VISÉES par ce lot
 * @returns {Promise<Array<{platform,url,titre,prix,inventaireId,mots}>>}
 *          [] = rien trouvé, ou rien de cherchable, ou lecture en échec. Jamais
 *          null : un aléa réseau se tait, il n'alarme pas et ne bloque rien.
 */
export async function chercherJumeauxEnLigne(supabase, { userId, inventaireId = null, titre, marque = null, prix = null, plateformes = [], photos = [] }) {
  const cibles = [...new Set((plateformes ?? []).filter(Boolean))];
  if (!userId || !cibles.length) return [];
  const mots = motsDuTitre(titre, marque);
  // Un titre sans mot distinctif (« Lot », « Neuf ») ne peut rien rapprocher :
  // on se tait plutôt que de rapprocher n'importe quoi.
  if (mots.length < SEUIL_MOTS_COMMUNS) return [];

  const trouves = [];
  const vus = new Set(); // `plateforme:identifiant d'annonce`
  const ajouter = (o) => {
    const cle = `${o.platform}:${o.id ?? o.url ?? o.titre}`;
    if (vus.has(cle)) return;
    vus.add(cle);
    trouves.push(o);
  };
  // Les photos de L'ARTICLE (jusqu'à 3) : la preuve se cherche contre elles.
  const photosArticle = urlsPhotos(photos ?? []).filter((u) => /^https?:\/\//.test(u)).slice(0, 3);

  // 1. LE RELEVÉ DU COMPTE — la source la plus sûre : elle dit « en ligne »
  //    parce que l'annonce a été VUE sur la plateforme, pas parce qu'un job
  //    dit l'avoir posée. Ne couvre pas Vinted (rapprocher_releve ne traite
  //    que leboncoin/beebs/ebay/opla) — d'où la seconde lecture.
  //    L'article publié est écarté EN JS, pas par un `neq` : un `neq` sur
  //    inventaire_id écarterait aussi les annonces encore à rattacher
  //    (inventaire_id NULL), qui sont justement en ligne elles aussi.
  try {
    const { data, error } = await supabase
      .from("annonces_plateforme")
      .select("platform, listing_id, url, titre, prix, inventaire_id, photo_url")
      .eq("user_id", userId)
      .is("disparu_le", null)
      .eq("statut_plateforme", "en_ligne")
      .in("platform", cibles)
      .or(clauseOu("titre", titre, marque))
      .order("vu_le", { ascending: false })
      .range(0, MAX_LIGNES_LUES - 1);
    if (error) throw error;
    for (const a of data ?? []) {
      if (inventaireId != null && a.inventaire_id === inventaireId) continue;
      const communs = motsCommuns(mots, a.titre);
      // Au moins deux mots pour être CANDIDAT ; le verdict se rend plus bas,
      // avec la couleur et la photo.
      if (communs.length < SEUIL_MOTS_COMMUNS) continue;
      ajouter({
        platform: a.platform, id: a.listing_id ?? null, url: a.url || null,
        titre: a.titre || "", prix: a.prix ?? null, inventaireId: a.inventaire_id ?? null, mots: communs,
        photos: a.photo_url && /^https?:\/\//.test(a.photo_url) ? [a.photo_url] : [],
      });
    }
  } catch (e) {
    console.warn("[jumeauxEnLigne] relevé:", e?.message ?? e);
  }

  // 2. NOS PROPRES DÉPÔTS — indispensable pour Vinted, et pour tout ce qui est
  //    parti depuis le dernier relevé.
  try {
    const { data, error } = await supabase
      .from("cross_post_jobs")
      .select("inventaire_id, platform, title, price, listing_url, platform_listing_id, photos")
      .eq("user_id", userId)
      .in("platform", cibles)
      .in("action", ["publish", "republish"])
      .eq("status", "published")
      .or(clauseOu("title", titre, marque))
      .order("published_at", { ascending: false })
      .range(0, MAX_LIGNES_LUES - 1);
    if (error) throw error;
    const candidats = (data ?? []).filter((j) =>
      j.inventaire_id != null
      && j.inventaire_id !== inventaireId
      && motsCommuns(mots, j.title).length >= SEUIL_MOTS_COMMUNS);

    // Un dépôt reste 'published' en base quelques minutes après un retrait
    // réussi (cf. publicationState.js) : sans cette relecture, l'app
    // avertirait d'un jumeau qui n'est plus en ligne. On ne lit que les
    // retraits ABOUTIS des articles candidats — une poignée de lignes.
    const retires = new Set();
    if (candidats.length) {
      const { data: dels } = await supabase
        .from("cross_post_jobs")
        .select("platform, listing_url, platform_listing_id")
        .eq("user_id", userId)
        .eq("action", "delete")
        .eq("status", "deleted")
        .in("inventaire_id", [...new Set(candidats.map((j) => j.inventaire_id))])
        .range(0, MAX_LIGNES_LUES - 1);
      for (const d of dels ?? []) retires.add(`${d.platform}:${idAnnonceDe(d)}`);
    }
    for (const j of candidats) {
      const id = idAnnonceDe(j);
      if (id && retires.has(`${j.platform}:${id}`)) continue;
      ajouter({
        platform: j.platform, id, url: j.listing_url || null,
        titre: j.title || "", prix: j.price ?? null, inventaireId: j.inventaire_id,
        mots: motsCommuns(mots, j.title),
        photos: urlsPhotos(Array.isArray(j.photos) ? j.photos : []).filter((u) => /^https?:\/\//.test(u)).slice(0, 2),
      });
    }
  } catch (e) {
    console.warn("[jumeauxEnLigne] dépôts:", e?.message ?? e);
  }

  // ── LA COULEUR EXCLUT, LA PHOTO PROUVE ────────────────────────────────────
  // D'abord l'exclusion (gratuite), puis les empreintes des photos qui
  // restent à comparer — une seule demande, bornée, jamais bloquante.
  const restants = trouves.filter((t) => !variantesIncompatibles(titre, t.titre).incompatibles);
  let empreintes = new Map();
  if (photosArticle.length && restants.some((t) => t.photos?.length)) {
    empreintes = await chargerEmpreintes(supabase, [...photosArticle, ...restants.flatMap((t) => t.photos ?? [])]);
  }
  const empA = photosArticle.map((u) => empreintes.get(u)).filter(Boolean);
  const jumeaux = [];
  for (const t of restants) {
    const empB = (t.photos ?? []).map((u) => empreintes.get(u)).filter(Boolean);
    const photo = empA.length && empB.length ? meilleurAppariement(empA, empB) : null;
    const preuve = verdictJumeau({ titre, prix, candidat: t, photo });
    if (!preuve) continue;
    jumeaux.push({ ...t, preuve, photo: photo ? { dhash: photo.dhash, phash: photo.phash, verdict: photo.verdict } : null });
  }

  // UNE annonce nommée par plateforme : le message dit « un jumeau », pas un
  // inventaire. La preuve la plus forte d'abord (photo, titre, texte), puis la
  // mieux rapprochée, puis celle qui a un lien.
  const rang = { photo: 3, titre: 2, texte: 1 };
  const parPlateforme = new Map();
  for (const t of jumeaux.sort((a, b) => (rang[b.preuve] - rang[a.preuve]) || (b.mots.length - a.mots.length) || ((b.url ? 1 : 0) - (a.url ? 1 : 0)))) {
    if (!parPlateforme.has(t.platform)) parPlateforme.set(t.platform, t);
  }
  return [...parPlateforme.values()];
}
