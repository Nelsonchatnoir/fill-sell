// Les règles pures de l'écran d'attente « lecture de l'annonce d'origine » (AttenteLectureOrigine.jsx, 25/10) :
// à part pour que le composant n'exporte qu'un composant (rafraîchissement à chaud) et pour les selftests.
// (25/10, Nico) Dernier recours seulement : la fiche est lue en arrière-plan dès l'import ; ici, une lecture tout de
// suite puis toutes les 6 s, 5 min au plus — et jamais « Écrire ma description » pendant l'attente (seulement si
// l'annonce d'origine n'a vraiment aucun texte : le stepper s'ouvre alors avec cette précision).
//
// ── (26/10 nuit, point 9 — patrick giry, Premium) PUBLIER SANS ORDINATEUR : LA VÉRITÉ, PUIS TROIS ISSUES ──────────
// Le 25/10 sur Android, « Publier » sur « Chemise dickies » (fiche du dressing sans texte) attendait la lecture de sa
// description Vinted ; l'écran promettait « la lecture se fait depuis ton ordinateur » — son poste était éteint (vu
// pour la dernière fois à 17:15) et en 0.6.141, trop ancien pour lire (il faut la 0.6.144 : LECTURE_FOND_VERSION_MIN,
// _shared/lecture-fond.js, la borne de get-pending-jobs). Aucune voie serveur ne lit une page Vinted (DataDome) :
// sans ordinateur, ce texte ne se lit pas. Règle de Nico (26/10 — celle du 25/10 amendée pour ce SEUL cas) :
//   · on n'attend la lecture que s'il existe un LECTEUR MAINTENANT : l'extension ≥ 0.6.144 sur cet appareil, ou un
//     poste du compte en ≥ 0.6.144 vu il y a moins de 15 min (lecteurDisponible) ;
//   · sinon, pas d'attente : une phrase vraie (heure de Paris et version réelles, jamais une heure future), puis trois
//     choix — « Écrire ma description » (le principal), « La faire rédiger par FillSell », « Attendre mon ordinateur » ;
//   · avec un lecteur, rien ne change : l'attente d'avant, sans « Écrire ma description » (règle du 25/10).
// Ce que l'app sait du poste (profiles, lu au clic) : extension_version = la version la PLUS HAUTE jamais vue sur le
// compte (noter_version_extension n'écrit qu'en montant), extension_last_seen_at = le dernier poll, tous postes
// confondus, extension_postes = par poste { le, build } (48 h). AUCUNE colonne ne dit la version d'UN poste : celle
// du compte est portée par le poste au build le plus récent (un numéro plus haut est un paquet plus récent) — c'est
// lui qui doit avoir été vu il y a moins de 15 min. Limite connue : une version venue d'un poste disparu depuis plus
// de 48 h se prête au poste restant (seule une version notée PAR POSTE lèverait ce doute).
import { LECTURE_FOND_VERSION_MIN } from "../../supabase/functions/_shared/lecture-fond.js";
import { texteSuffisant, CLE_CHOIX_SANS_LECTURE } from "../../supabase/functions/_shared/contenu-fiche.js";
import { retoucheAEcrire } from "./texteDeLaFiche.js";

/** L'écart entre deux lectures pendant l'attente. */
export const RELECTURE_ATTENTE_MS = 6_000;
/** L'attente la plus longue (l'écran reste ouvert, il ne relit plus ; « Fermer » reste là). */
export const RELECTURE_ATTENTE_MAX_MS = 5 * 60_000;

/** Depuis combien de temps, en mots (un fait au passé, jamais une promesse). */
export function depuisEnMots(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min`;
}

// ── (26/10 nuit, point 9) LE LECTEUR ─────────────────────────────────────────────────────────────────────────────
/** La plus petite extension qui sait lire une description Vinted (page publique) : la même que le serveur. */
export const LECTEUR_VERSION_MIN = LECTURE_FOND_VERSION_MIN;
/** Un poste « là maintenant » : vu au poll il y a moins de 15 min (il polle toutes les 1 à 2 min). */
export const LECTEUR_VU_MAX_MS = 15 * 60_000;
/** Sans lecteur, « Attendre mon ordinateur » relit toutes les minutes (un ordinateur se rallume en minutes)… */
export const RELECTURE_SANS_LECTEUR_MS = 60_000;
/** … et 15 min au plus : ensuite l'écran le dit et ne relit plus (la demande de lecture, elle, reste en base). */
export const ATTENTE_SANS_LECTEUR_MAX_MS = 15 * 60_000;

/** « 0.6.144 » ≥ « 0.6.141 » ? (même règle que utils/vintedSync.versionAuMoins — illisible = non). */
export function versionAuMoins(a, b) {
  const parse = (v) => String(v ?? "").trim().split(".").map((n) => parseInt(n, 10));
  const x = parse(a), y = parse(b);
  if (!x.length || x.some(Number.isNaN)) return false;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : null; };
/** L'horodatage d'un BUILD_ID (« 2026-10-25T15:28:19Z+7b08e45 ») ; null pour un build sans préfixe (dépôt local). */
const dateDuBuild = (b) => { const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/.exec(String(b ?? "")); return m ? Date.parse(m[1]) : null; };

/**
 * Un lecteur de la description Vinted existe-t-il MAINTENANT ? (pur)
 * @param {{ versionIci?: string|null, compte?: { version?: string|null, vuLe?: string|null,
 *   postes?: Record<string, {le?: string, build?: string}>|null }|null, maintenant?: number }} p
 *   versionIci : la version que l'extension de CET appareil annonce dans la page (null : aucune) ;
 *   compte : profiles.extension_version, extension_last_seen_at, extension_postes.
 * @returns {{ disponible: boolean, ou: 'ici'|'poste'|null,
 *   raison: null|'aucun_ordinateur'|'extension_ancienne'|'extension_ancienne_ici'|'ordinateur_eteint',
 *   version: string|null, versionIci: string|null, vuLe: string|null, allume: boolean }}
 */
export function lecteurDisponible({ versionIci = null, compte = null, maintenant = Date.now() } = {}) {
  const ici = versionIci ? String(versionIci) : null;
  const version = compte?.version ? String(compte.version) : null;
  const base = { versionIci: ici, version };
  if (versionAuMoins(ici, LECTEUR_VERSION_MIN)) return { ...base, disponible: true, ou: "ici", raison: null, version: ici, vuLe: null, allume: true };
  const postes = Object.values(compte?.postes && typeof compte.postes === "object" && !Array.isArray(compte.postes) ? compte.postes : {})
    .map((p) => ({ le: ms(p?.le), build: dateDuBuild(p?.build) }))
    .filter((p) => p.le != null);
  const vuCompte = ms(compte?.vuLe);
  const vus = [vuCompte, ...postes.map((p) => p.le)].filter((t) => t != null);
  const vuDernier = vus.length ? Math.max(...vus) : null;
  const recent = (t) => t != null && maintenant - t < LECTEUR_VU_MAX_MS;
  const iso = (t) => (t == null ? null : new Date(t).toISOString());
  if (versionAuMoins(version, LECTEUR_VERSION_MIN)) {
    // La version du compte est celle du poste au build le plus récent ; un build illisible (dépôt local) peut l'être.
    const builds = postes.map((p) => p.build).filter((b) => b != null);
    const plusRecent = builds.length ? Math.max(...builds) : null;
    const porteurs = postes.filter((p) => p.build == null || p.build === plusRecent);
    const vuLecteur = porteurs.length ? Math.max(...porteurs.map((p) => p.le)) : vuCompte;
    if (recent(vuLecteur)) return { ...base, disponible: true, ou: "poste", raison: null, vuLe: iso(vuLecteur), allume: true };
    if (ici) return { ...base, disponible: false, ou: null, raison: "extension_ancienne_ici", version: ici, vuLe: iso(vuLecteur ?? vuDernier), allume: true };
    return { ...base, disponible: false, ou: null, raison: "ordinateur_eteint", vuLe: iso(vuLecteur ?? vuDernier), allume: false };
  }
  if (ici) return { ...base, disponible: false, ou: null, raison: "extension_ancienne_ici", version: ici, vuLe: iso(vuDernier), allume: true };
  if (vuDernier == null && !version) return { ...base, disponible: false, ou: null, raison: "aucun_ordinateur", vuLe: null, allume: false };
  return { ...base, disponible: false, ou: null, raison: "extension_ancienne", vuLe: iso(vuDernier), allume: recent(vuDernier) };
}

// ── (28/10, Juliette, Petite planète — « lecture_origine_abandonnee ») UNE ATTENTE QUI N'ABOUTIT PAS A SES ISSUES ─────
// Avec un lecteur, l'écran attendait sans rien proposer ; sur un téléphone, il disait même « Ferme, et publie dès
// qu'elle est lue ». Constaté en base du 25 au 28/10 : 16 écrans fermés après 0 à 16 s, alors que l'ordinateur lisait la
// page 12 s à 2 min après la demande (Juliette 20:47:10 → lue 20:47:22) — et, sur un poste dont l'onglet Vinted est
// en veille (Microsoft Edge), jamais (1 072 essais de 20 s pour 6 fiches). Règle : avec un lecteur, l'écran attend
// (l'ordinateur lit au poll suivant, 2 min au plus) ; passé 3 min sans lecture, la lecture est EN RETARD — la phrase
// le dit et les trois issues du « sans lecteur » s'ajoutent (écrire, faire rédiger, continuer d'attendre), la relecture
// continue. Jamais une description à la place du vendeur sans son geste, jamais une attente sans issue.
/** Le temps laissé au lecteur (un poll de l'ordinateur, 2 min au plus, et sa lecture) avant de proposer les issues. */
export const ATTENTE_LECTEUR_MAX_MS = 3 * 60_000;

/**
 * Le lecteur tel que l'écran doit le traiter après `ecouleMs` d'attente (pur) : en retard → « sans lecteur » (raison
 * `lecture_en_retard`, les trois issues) ; sinon tel quel. Un lecteur inconnu (profil illisible) en retard aussi.
 */
export function lecteurEnRetard(lecteur, ecouleMs) {
  if (lecteur?.disponible === false) return lecteur;
  if (!(Number(ecouleMs) >= ATTENTE_LECTEUR_MAX_MS)) return lecteur;
  return {
    disponible: false, ou: lecteur?.ou ?? null, raison: "lecture_en_retard", enRetard: true,
    version: lecteur?.version ?? null, versionIci: lecteur?.versionIci ?? null, vuLe: lecteur?.vuLe ?? null, allume: lecteur?.allume ?? null,
  };
}

/** La phrase de l'attente quand c'est l'ORDINATEUR qui lit (aucune extension sur cet appareil) — jamais « ferme ». */
export function texteAttenteParOrdinateur(lang = "fr") {
  return lang === "en"
    ? "Your computer (its FillSell extension) is reading your Vinted description, usually in under 2 minutes: keep this screen open, the publishing screen opens by itself as soon as it's read."
    : "Ton ordinateur (son extension FillSell) lit ta description Vinted, en général en moins de 2 minutes : garde cet écran ouvert, l'écran de publication s'ouvre tout seul dès qu'elle est lue.";
}

// Heure de Paris : « 17:15 » le jour même, « hier à 17:15 », sinon « le 25/10 à 17:15 » (jamais une heure future).
const PARTIES_PARIS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function partiesParis(t) {
  const p = Object.fromEntries(PARTIES_PARIS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { jour: Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 86_400_000, jj: p.day, mm: p.month, heure: `${p.hour}:${p.minute}` };
}
/** Quand, en mots (heure de Paris). */
export function quandEnMots(iso, maintenant = Date.now(), lang = "fr") {
  const t = ms(iso);
  if (t == null) return null;
  const v = partiesParis(Math.min(t, maintenant));
  const ecart = partiesParis(maintenant).jour - v.jour;
  const en = lang === "en";
  if (ecart <= 0) return v.heure;
  if (ecart === 1) return en ? `yesterday at ${v.heure}` : `hier à ${v.heure}`;
  return en ? `${v.jj}/${v.mm} at ${v.heure}` : `le ${v.jj}/${v.mm} à ${v.heure}`;
}

/**
 * La phrase vraie, quand aucun lecteur n'existe (pur) — une seule phrase, l'heure et la version réelles.
 * @returns {string|null} null quand un lecteur existe (ou qu'on ne sait pas : rien n'est affirmé).
 */
export function phraseSansLecteur(lecteur, { lang = "fr", maintenant = Date.now() } = {}) {
  if (!lecteur || lecteur.disponible !== false) return null;
  const en = lang === "en";
  const debut = en ? "Only the FillSell extension on a computer can read your Vinted description: " : "Seule l'extension FillSell d'un ordinateur sait lire ta description Vinted : ";
  const v = lecteur.version ? ` (${lecteur.version})` : "";
  const quand = quandEnMots(lecteur.vuLe, maintenant, lang);
  let suite;
  if (lecteur.raison === "lecture_en_retard") {
    // (28/10) Un lecteur existe, mais la lecture n'est pas venue : la vérité, sans accuser l'ordinateur.
    suite = lecteur.ou === "ici"
      ? (en ? "the extension on this computer hasn't been able to read it yet." : "l'extension de cet ordinateur n'a pas encore pu la lire.")
      : quand
        ? (en ? `your computer hasn't read it yet (last seen at ${quand}).` : `ton ordinateur ne l'a pas encore lue (vu pour la dernière fois à ${quand}).`)
        : (en ? "your computer hasn't read it yet." : "ton ordinateur ne l'a pas encore lue.");
  } else if (lecteur.raison === "extension_ancienne_ici") {
    suite = en ? `the extension on this computer${v} needs updating.` : `l'extension de cet ordinateur${v} doit se mettre à jour.`;
  } else if (lecteur.raison === "aucun_ordinateur") {
    suite = en ? "no computer with the extension is linked to your account." : "aucun ordinateur avec l'extension n'est relié à ton compte.";
  } else if (lecteur.raison === "ordinateur_eteint") {
    suite = quand
      ? (en ? `your computer hasn't been seen since ${quand}.` : `ton ordinateur n'a pas été vu depuis ${quand}.`)
      : (en ? "your computer hasn't been seen lately." : "ton ordinateur n'a pas été vu récemment.");
  } else if (!quand) {
    suite = en ? `the extension on your computer${v} needs updating.` : `l'extension de ton ordinateur${v} doit se mettre à jour.`;
  } else if (lecteur.allume) {
    suite = en ? `your computer is on, but its extension${v} needs updating.` : `ton ordinateur est allumé, mais son extension${v} doit se mettre à jour.`;
  } else {
    suite = en ? `your computer hasn't been seen since ${quand} and its extension${v} needs updating.`
      : `ton ordinateur n'a pas été vu depuis ${quand} et son extension${v} doit se mettre à jour.`;
  }
  return debut + suite;
}

/**
 * Les issues proposées (pur) : aucune tant qu'un lecteur existe (ou qu'on ne sait pas) — l'attente d'avant ; sans
 * lecteur, trois, dans cet ordre, une seule principale.
 */
export function issuesSansLecteur(lecteur) {
  if (!lecteur || lecteur.disponible !== false) return [];
  return [
    { cle: "ecrire", principal: true },
    { cle: "rediger", principal: false },
    { cle: "attendre", principal: false },
  ];
}

/** Les mots de l'écran sans lecteur (stepper et lot : les mêmes). */
export function libellesSansLecteur(lang = "fr") {
  const en = lang === "en";
  return {
    titre: en ? "Your Vinted description isn't read yet" : "Ta description Vinted n'est pas encore lue",
    ecrire: en ? "Write my description" : "Écrire ma description",
    rediger: en ? "Have FillSell write it" : "La faire rédiger par FillSell",
    attendre: en ? "Wait for my computer" : "Attendre mon ordinateur",
    ecrireTitre: en ? "Your description" : "Ta description",
    ouvrirVinted: en ? "Open my Vinted listing ↗" : "Ouvrir mon annonce Vinted ↗",
    pourCopier: en ? "to copy your text" : "pour copier ton texte",
    placeholder: en ? "Write or paste your description…" : "Écris ou colle ta description…",
    tropCourt: en ? "Two words at least." : "Deux mots au moins.",
    continuer: en ? "Continue" : "Continuer",
    enregistrement: en ? "Saving…" : "Enregistrement…",
    retour: en ? "Back" : "Retour",
    fermer: en ? "Close" : "Fermer",
    attenteTitre: en ? "Waiting for your computer" : "En attente de ton ordinateur",
    attenteFinie: en ? "Still not read: close this, the reading carries on — publish once your computer has read it."
      : "Toujours pas lue : ferme, la lecture continue — publie quand ton ordinateur l'aura lue.",
    echec: en ? "Your choice couldn't be saved: try again." : "Ton choix n'a pas pu être enregistré : réessaie.",
    redigeeNote: en ? "FillSell writes your description from your photos and your title: check it before publishing. It isn't saved on your item."
      : "FillSell rédige ta description d'après tes photos et ton titre : relis-la avant de publier. Elle n'est pas enregistrée sur ta fiche.",
  };
}

/**
 * Ce qu'on attend, quand la personne a choisi « Attendre mon ordinateur » (pur) : la condition, jamais une heure.
 * `contexte` : « stepper » (l'écran de publication s'ouvre) ou « lot » (l'article se prépare).
 */
export function texteAttenteSansLecteur(lecteur, { lang = "fr", contexte = "stepper" } = {}) {
  const en = lang === "en";
  const ensuite = contexte === "lot"
    ? (en ? "your description is read and the item gets prepared." : "ta description est lue et l'article se prépare.")
    : (en ? "your description is read and the publishing screen opens." : "ta description est lue et l'écran de publication s'ouvre.");
  if (lecteur?.raison === "lecture_en_retard") {
    return contexte === "lot"
      ? (en ? "The reading carries on: as soon as it succeeds, the item gets prepared." : "La lecture continue : dès qu'elle aboutit, l'article se prépare.")
      : (en ? "The reading carries on: as soon as it succeeds, the publishing screen opens by itself." : "La lecture continue : dès qu'elle aboutit, l'écran de publication s'ouvre tout seul.");
  }
  const quand = lecteur?.raison === "extension_ancienne_ici"
    ? (en ? "As soon as the extension on this computer is up to date, " : "Dès que l'extension de cet ordinateur est à jour, ")
    : lecteur?.raison === "ordinateur_eteint"
      ? (en ? "As soon as your computer is on, " : "Dès que ton ordinateur est allumé, ")
      : lecteur?.raison === "aucun_ordinateur"
        ? (en ? "As soon as a computer with the FillSell extension up to date is linked to your account, " : "Dès qu'un ordinateur avec l'extension FillSell à jour est relié à ton compte, ")
        : (en ? "As soon as your computer is on with the extension up to date, " : "Dès que ton ordinateur est allumé avec l'extension à jour, ");
  return quand + ensuite;
}

/** L'annonce Vinted d'origine, pour y copier son texte (null si son numéro est inconnu). */
export function urlAnnonceVinted(item) {
  const id = String(item?.vinted_item_id ?? "").trim();
  return /^\d+$/.test(id) ? `https://www.vinted.fr/items/${id}` : null;
}

/** Assez pour être une description (même seuil que la règle d'attente et generate-listing : deux mots). */
export const descriptionEcriteSuffisante = (texte) => texteSuffisant(texte);

/**
 * Le correctif d'une description ÉCRITE par la personne, faute de lecteur (pur) : sur la fiche, marquée « manuel »
 * comme toute retouche du stepper (texteDeLaFiche.retoucheAEcrire), et le choix daté. null si trop court.
 */
export function patchDescriptionEcrite(texte, at = new Date().toISOString()) {
  const t = String(texte ?? "").trim();
  if (!texteSuffisant(t)) return null;
  const p = retoucheAEcrire({ description: "" }, { description: t }, ["description"], at);
  if (!p) return null;
  return { ...p, attributs: { ...p.attributs, [CLE_CHOIX_SANS_LECTURE]: { v: "ecrite", source: "manuel", at, motif: "lecture_origine_sans_lecteur" } } };
}

/**
 * Le correctif du choix « La faire rédiger par FillSell » (pur) : le choix seul, daté — JAMAIS une description sur la
 * fiche (le texte rédigé vit dans la copie, relu par la personne).
 */
export function patchChoixRedigee(at = new Date().toISOString()) {
  return { attributs: { [CLE_CHOIX_SANS_LECTURE]: { v: "redigee", source: "manuel", at, motif: "lecture_origine_sans_lecteur" } } };
}

// ── (29/10, lot C partie 1) LA DEMANDE SUIVIE : L'ÉTAPE VRAIE, L'ÉCHEC DIT TOUT DE SUITE, JAMAIS UN ÉCRAN FIGÉ ─────────
// Mesuré (usage_logs, 23 → 29/10) : 27 attentes et 24 abandons de cet écran (13 et 11 comptes) ; l'extension échouait
// sans que l'écran le sache (onglet indisponible 1 133 fois, introuvable 430, page sans annonce 202, anti-robot 12) — il
// attendait 3 min avant toute issue, et une annonce supprimée ouvrait le stepper sans un mot. Désormais l'extension
// (≥ 0.6.159) écrit l'état sur la demande (lectures_origine_demandees : prise_le, essai_le, motif, faite_le — migration
// 20261030090000), et l'écran le relit à chaque tour :
//   · envoyée / prise / ordinateur occupé : l'étape vraie, en mots ;
//   · échec : le motif en clair et, TOUT DE SUITE, « Réessayer » + écrire / faire rédiger ;
//   · conclue sans texte ou introuvable : la vérité, écrire / faire rédiger — jamais un stepper qui rédige en silence ;
//   · lue : le stepper s'ouvre, sans écran intermédiaire.
// Et, quoi qu'il arrive, écrire / faire rédiger restent proposés en discret après 45 s d'attente.
/** Après combien de temps d'attente les issues « écrire / faire rédiger » s'affichent (en discret) sans échec. */
export const ISSUES_EN_ATTENTE_APRES_MS = 45_000;
/** La version qui lit en 30 s au plus (signal) et dit son état (prise, échec, conclusion). */
export const LECTEUR_SUIVI_VERSION_MIN = "0.6.159";
const MOTIFS_ECHEC = new Set(["antirobot", "antirobot_pause", "onglet_indisponible", "page_sans_annonce", "session_a_rafraichir", "exception", "id_illisible", "inconnu", "reponse_vide"]);
const estMotifEchec = (m) => MOTIFS_ECHEC.has(String(m ?? "")) || /^http_/.test(String(m ?? ""));
const NOMS_PLATEFORMES = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", depop: "Depop", ebay: "eBay" };

/**
 * Où en est la lecture ? (pur)
 * @param demande  la ligne lectures_origine_demandees { demandee_le, prise_le, essai_le, motif, faite_le } (ou null)
 * @param ici      le dernier résultat d'une lecture faite par l'extension de CET appareil { note, motif, occupee } (ou null)
 * @returns {{ etat: 'envoyee'|'prise'|'occupee'|'echec'|'conclue'|'lue', motif: string|null, reessayable: boolean }}
 */
export function etatDeLaDemande(demande, ici = null) {
  const m = String(ici?.motif ?? "");
  if (ici?.note === "sans_description") return { etat: "conclue", motif: "sans_texte", reessayable: false };
  if (m === "introuvable") return { etat: "conclue", motif: "introuvable", reessayable: false };
  if (estMotifEchec(m)) return { etat: "echec", motif: m, reessayable: m !== "antirobot" && m !== "antirobot_pause" };
  const d = demande ?? null;
  const t = (v) => { const x = Date.parse(String(v ?? "")); return Number.isFinite(x) ? x : null; };
  const demandee = t(d?.demandee_le);
  const dm = String(d?.motif ?? "");
  if (d?.faite_le) {
    if (dm === "introuvable" || dm === "sans_texte") return { etat: "conclue", motif: dm, reessayable: false };
    return { etat: "lue", motif: null, reessayable: false };
  }
  const essai = t(d?.essai_le);
  if (dm && estMotifEchec(dm) && essai != null && (demandee == null || essai >= demandee)) {
    return { etat: "echec", motif: dm, reessayable: dm !== "antirobot" && dm !== "antirobot_pause" };
  }
  if (ici?.occupee) return { etat: "occupee", motif: null, reessayable: false };
  const prise = t(d?.prise_le);
  if (prise != null && (demandee == null || prise >= demandee)) return { etat: "prise", motif: null, reessayable: false };
  return { etat: "envoyee", motif: null, reessayable: false };
}

/** Ce que l'ordinateur fait en ce moment, s'il l'a dit il y a moins de 6 min (battement d'un travail sous verrou). */
export function travailDuPoste(postes, maintenant = Date.now()) {
  const liste = Object.values(postes && typeof postes === "object" && !Array.isArray(postes) ? postes : {})
    .map((p) => ({ flux: String(p?.travail?.flux ?? ""), le: Date.parse(String(p?.travail?.le ?? "")) }))
    .filter((p) => p.flux && Number.isFinite(p.le) && maintenant - p.le < 6 * 60_000);
  if (!liste.length) return null;
  liste.sort((a, b) => b.le - a.le);
  const f = liste[0].flux;
  const quoi = /sync/.test(f) ? "synchro" : /releve/.test(f) ? "releve" : "publication";
  return { flux: f, quoi };
}

/** Le motif d'un échec, en clair (pur). */
export function messageEchecLecture(motif, { lang = "fr", plateforme = "vinted" } = {}) {
  const en = lang === "en";
  const nom = NOMS_PLATEFORMES[plateforme] ?? "";
  const m = String(motif ?? "");
  if (m === "antirobot" || m === "antirobot_pause") {
    return en ? `${nom} asked your computer for a security check: readings are paused for a few hours. Write your description or have it written.`
      : `${nom} a demandé une vérification à ton ordinateur : les lectures sont en pause quelques heures. Écris ta description ou fais-la rédiger.`;
  }
  if (m === "onglet_indisponible") {
    return en ? `Your computer couldn't open ${nom} (tab asleep or closed).` : `Ton ordinateur n'a pas pu ouvrir ${nom} (onglet en veille ou fermé).`;
  }
  if (m === "page_sans_annonce") {
    return en ? `${nom} returned a page without your listing.` : `${nom} a renvoyé une page sans ton annonce.`;
  }
  if (m === "session_a_rafraichir") {
    return en ? `Your ${nom} session on your computer needs refreshing.` : `Ta session ${nom} sur ton ordinateur doit être rafraîchie.`;
  }
  return en ? "The reading didn't succeed this time." : "La lecture n'a pas abouti cette fois.";
}

/** La phrase de l'étape (pur) — un fait, jamais une heure promise. */
export function phraseEtatDemande(e, { lang = "fr", lecteur = null, travail = null, plateforme = "vinted" } = {}) {
  const en = lang === "en";
  const nom = NOMS_PLATEFORMES[plateforme] ?? "";
  const ici = lecteur?.ou === "ici";
  const sujet = ici ? (en ? "The extension on this computer" : "L'extension de cet ordinateur") : (en ? "Your computer" : "Ton ordinateur");
  switch (e?.etat) {
    case "prise":
      return en ? `${sujet} is reading your ${nom} listing…` : `${sujet} lit ton annonce ${nom}…`;
    case "occupee":
      return en ? `${sujet} is finishing a task: your reading goes first, right after it.` : `${sujet} termine une tâche en cours : ta lecture passe en premier, juste après.`;
    case "echec":
      return messageEchecLecture(e.motif, { lang, plateforme });
    case "conclue":
      return e.motif === "introuvable"
        ? (en ? `Your ${nom} listing no longer exists (sold or deleted): its description can't be read anymore.` : `Ton annonce ${nom} n'existe plus (vendue ou supprimée) : sa description ne peut plus être lue.`)
        : (en ? `Your ${nom} listing has no description.` : `Ton annonce ${nom} n'a pas de description.`);
    case "lue":
      return en ? "Read: opening the publishing screen…" : "Lue : ouverture de l'écran de publication…";
    default: {
      if (ici) return en ? `${sujet} is reading your ${nom} listing…` : `${sujet} lit ton annonce ${nom}…`;
      const occupe = travail
        ? (en ? ({ synchro: "syncing your listings", releve: "reading your listings", publication: "publishing" })[travail.quoi]
          : ({ synchro: "synchronise tes annonces", releve: "relève tes annonces", publication: "publie" })[travail.quoi])
        : null;
      if (occupe) {
        return en ? `Request sent to your computer, which is ${occupe}: your reading goes first, as soon as the current step ends.`
          : `Demande envoyée à ton ordinateur, qui ${occupe} en ce moment : ta lecture passe en premier, dès la fin de l'étape en cours.`;
      }
      // Jamais une durée promise (règle du 16/10, selftest aucune-estimation) : la condition, pas l'heure.
      return en ? "Request sent to your computer: it reads it as soon as it receives it."
        : "Demande envoyée à ton ordinateur : il la lit dès qu'il la reçoit.";
    }
  }
}

/** Les issues de l'état (pur) : échec → réessayer d'abord (s'il a un sens), conclue → écrire d'abord, attente → discrètes après 45 s. */
export function issuesDeLEtat(e, attenduMs = 0) {
  if (e?.etat === "echec") {
    return e.reessayable
      ? [{ cle: "reessayer", principal: true }, { cle: "ecrire", principal: false }, { cle: "rediger", principal: false }]
      : [{ cle: "ecrire", principal: true }, { cle: "rediger", principal: false }];
  }
  if (e?.etat === "conclue") return [{ cle: "ecrire", principal: true }, { cle: "rediger", principal: false }];
  if (e?.etat === "lue") return [];
  return Number(attenduMs) >= ISSUES_EN_ATTENTE_APRES_MS ? [{ cle: "ecrire", principal: false, discret: true }, { cle: "rediger", principal: false, discret: true }] : [];
}
