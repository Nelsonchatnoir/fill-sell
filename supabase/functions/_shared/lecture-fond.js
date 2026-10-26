// ═══════════════════════════════════════════════════════════════════════════
// LE TEXTE DU VENDEUR LU EN ARRIÈRE-PLAN, DÈS L'IMPORT (25/10, chantier « importer son Vinted puis publier ailleurs »)
// ═══════════════════════════════════════════════════════════════════════════
// Le relevé du dressing Vinted ne porte ni la description, ni la couleur, ni le rayon : le 25/10, 71 473 des 83 027
// articles importés n'avaient pas de description (381 comptes), et publier ailleurs dépendait d'une lecture faite AU
// CLIC — qui, chez Louis, n'aboutissait jamais (pont de la page mort après une mise à jour de l'extension, lecteur de
// secours muet depuis la 0.6.130). Désormais l'extension (≥ 0.6.144) lit la PAGE PUBLIQUE de chaque annonce importée
// sans texte, EN ARRIÈRE-PLAN, à la fin de ses polls : une page vue comme un visiteur, depuis l'onglet de travail.
// Ce module décide, côté serveur, QUI lit, QUOI et À QUEL RYTHME (get-pending-jobs le sert dans `lecture_fond`) :
//   · ouverture par paliers (coin_config.lecture_fond_mode ; absent = LECTURE_FOND_MODE_DEFAUT) :
//       0 coupé · 1 comptes pilotes seulement, en MESURE (même chemin, même rythme, rien d'écrit) ·
//       2 comptes payants (et pilotes) · 3 tous les comptes ;
//   · rythme : 2 pages au plus par poll (un poll toutes les 2 min), 20 à 45 s entre deux pages, 300 par jour et par
//     compte — la veille des ventes lit déjà jusqu'à 8 pages d'annonces par poll sur les comptes actifs ;
//   · GARDE ANTI-ROBOT : le premier refus de Vinted (403, 429, page de vérification) coupe le compte 6 h (ici, et
//     dans l'extension, qui se coupe elle-même) ; ops-digest compte les refus du parc chaque jour ;
//   · ordre : les fiches les plus récemment importées d'abord (celles qu'on publiera bientôt) ; une fiche lue n'est
//     relue qu'après 30 jours (7 jours après un échec : annonce introuvable, page sans elle).
// Jamais une ligne écrite par le serveur : il ne fait que servir une liste ; l'extension écrit ce qui MANQUE.

export const LECTURE_FOND_VERSION_MIN = "0.6.144";
/** Comptes pilotes (mode 1) : le poste de Nico. */
export const LECTURE_FOND_PILOTES = Object.freeze(["f44b5917-bccc-4431-ba41-f40571a2ed18"]);
/** Le mode tant que coin_config.lecture_fond_mode n'existe pas. */
export const LECTURE_FOND_MODE_DEFAUT = 1;
// (25/10, méthode de Nico : « l'extension lit chaque annonce en arrière-plan, à la suite ») 3 pages par poll (au lieu
// de 2) : le même écart mesuré entre deux pages (20 à 45 s, 0 refus sur 33 pages le 25/10), une lecture presque
// continue derrière un import ; le plafond du jour et la coupure au premier refus ne changent pas.
export const LECTURE_FOND_RYTHME = Object.freeze({ par_cycle: 3, ecart_s: Object.freeze([20, 45]), par_jour: 300, pause_refus_h: 6 });
const JOUR_MS = 86_400_000;
// (26/10, urgence « la publication est devenue lente ») La lecture de fond se met en PAUSE pendant que la personne
// publie : elle tourne dans le poll de l'extension, verrou de flux tenu, et s'espace de 20 à 45 s entre deux pages —
// une lecture demandée par l'écran au clic « Publier » attendait derrière (75 s et 97 s mesurées le 26/10 sur le poste
// de Nico, pour une lecture de 1 s). Signal : un geste de publication tracé (usage_logs) il y a moins de 10 min.
export const FEATURES_PUBLICATION = Object.freeze([
  "generate_listing", "resolve_categorie", "resolve_categorie_cache", "ia_levier", "lbc_champs_ia", "ebay_aspects_ia", "publish",
]);
export const PAUSE_PUBLICATION_MIN = 10;

/** coin_config.lecture_fond_mode → 0..3 ; absent ou illisible → le mode par défaut. */
export function modeLectureFond(valeur, defaut = LECTURE_FOND_MODE_DEFAUT) {
  if (valeur === null || valeur === undefined || valeur === "") return defaut;
  const n = Number(valeur);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : defaut;
}

/**
 * Ce compte lit-il en arrière-plan à ce poll ? (pur)
 * @param {{userId?: string, mode?: number, payant?: boolean, versionOk?: boolean, pauseAntirobot?: boolean,
 *   luesAujourdhui?: number, dernierRefusMs?: number|null, maintenant?: number, personnePublie?: boolean,
 *   rythme?: {par_cycle: number, ecart_s: readonly number[], par_jour: number, pause_refus_h: number}}} [p]
 * @returns {{actif:false, raison:string} | {actif:true, mode:'mesure'|'rattrapage', par_cycle:number, ecart_s:number[], par_jour:number}}
 */
export function regleLectureFond({
  userId, mode, payant = false, versionOk = false, pauseAntirobot = false,
  luesAujourdhui = 0, dernierRefusMs = null, maintenant = Date.now(), rythme = LECTURE_FOND_RYTHME, personnePublie = false,
} = {}) {
  const pilote = LECTURE_FOND_PILOTES.includes(String(userId ?? ""));
  const non = (raison) => ({ actif: false, raison });
  if (!versionOk) return non("extension_trop_ancienne");
  if (mode === 0) return non("coupe");
  if (personnePublie) return non("personne_publie");
  if (pauseAntirobot) return non("pause_antirobot");
  if (Number.isFinite(dernierRefusMs) && maintenant - dernierRefusMs < rythme.pause_refus_h * 3_600_000) return non("refus_recent");
  if (mode === 1 && !pilote) return non("pas_encore_ouvert");
  if (mode === 2 && !payant && !pilote) return non("pas_encore_ouvert");
  const reste = rythme.par_jour - (Number(luesAujourdhui) || 0);
  if (reste <= 0) return non("plafond_du_jour");
  return {
    actif: true,
    mode: mode === 1 ? "mesure" : "rattrapage",
    par_cycle: Math.min(rythme.par_cycle, reste),
    ecart_s: [...rythme.ecart_s],
    par_jour: rythme.par_jour,
  };
}

/** La dernière lecture de la page publique posée sur la fiche (attributs.page_publique_lue). */
function derniereLecture(f) {
  const l = f?.page_publique_lue ?? f?.attributs?.page_publique_lue ?? null;
  if (!l || typeof l !== "object") return null;
  const t = Date.parse(String(l.at ?? l.v ?? ""));
  return Number.isFinite(t) ? { t, echec: Boolean(l.echec) } : null;
}

/** La fiche a-t-elle besoin de sa page publique ? (pur) — sans texte, sans rayon ou sans couleur, pas lue récemment. */
export function aLireEnFond(f, maintenant = Date.now()) {
  if (!f || !/^\d+$/.test(String(f.vinted_item_id ?? ""))) return false;
  const l = derniereLecture(f);
  if (l && maintenant - l.t < (l.echec ? 7 : 30) * JOUR_MS) return false;
  const vide = (v) => !String(v ?? "").trim();
  const couleur = f.couleur ?? f.attributs?.couleur ?? null;
  return vide(f.description) || f.vinted_catalog_id == null || !couleur;
}

/**
 * La liste servie à ce poll (pur). `mesure` : toutes les fiches Vinted du compte, en rotation (rien n'est écrit) ;
 * `rattrapage` : les fiches à lire, les plus récemment importées d'abord.
 */
export function listeLectureFond(lignes, regle, maintenant = Date.now()) {
  if (!regle?.actif) return [];
  const toutes = (Array.isArray(lignes) ? lignes : []).filter((f) => /^\d+$/.test(String(f?.vinted_item_id ?? "")));
  const n = Math.max(0, Number(regle.par_cycle) || 0);
  if (regle.mode === "mesure") {
    if (!toutes.length) return [];
    // Le poste pilote rattrape D'ABORD ses vraies fiches à lire (écrites : c'est la preuve du parcours « importer puis
    // publier ailleurs »), puis complète le poll par la rotation de mesure (rien d'écrit).
    const aLire = toutes.filter((f) => aLireEnFond(f, maintenant))
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
      .slice(0, n);
    const deja = new Set(aLire.map((f) => String(f.id)));
    const reste = toutes.filter((f) => !deja.has(String(f.id)));
    const out = aLire.map((f) => ({ inventaire_id: String(f.id), vinted_item_id: String(f.vinted_item_id), ecrire: true }));
    if (reste.length) {
      const depart = Math.floor(maintenant / 120_000) * n % reste.length;   // rotation, un tour par poll
      for (let i = 0; out.length < n && i < reste.length; i++) {
        const f = reste[(depart + i) % reste.length];
        out.push({ inventaire_id: String(f.id), vinted_item_id: String(f.vinted_item_id), ecrire: false });
      }
    }
    return out;
  }
  return toutes
    .filter((f) => aLireEnFond(f, maintenant))
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, n)
    .map((f) => ({ inventaire_id: String(f.id), vinted_item_id: String(f.vinted_item_id) }));
}

/** Minuit, heure de Paris, du jour de `maintenant` (ISO) — pour le plafond du jour. */
export function debutJourParis(maintenant = Date.now()) {
  const d = new Date(maintenant);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const ecoule = (Number(p.hour) * 60 + Number(p.minute)) * 60_000 + d.getUTCSeconds() * 1000 + d.getUTCMilliseconds();
  return new Date(maintenant - ecoule).toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════
// (25/10 soir — Nico : « Ensuite Beebs (0.6.145 après 48 h de pilote sur mon poste) ») BEEBS EN ARRIÈRE-PLAN
// ═══════════════════════════════════════════════════════════════════════════
// L'index Beebs lu par le serveur (releve-completer) porte texte, marque, état, âge, couleur, matière, taille et rayon,
// mais UNE seule photo : les autres ne sont que sur la page de l'annonce. Le relevé en lit 20 à 27 par passage (≈ un
// relevé par jour et par compte) : 390 fiches Beebs restaient à une photo le 25/10 (docs/enquetes/import-publier-ailleurs-2510/
// LECTURE-FOND-AUTRES-PLATEFORMES.md). Ici la page de l'annonce est lue par une requête de MÊME ORIGINE depuis l'onglet
// www.beebs.app (lireHtmlMemeOrigine, ~1 s, l'onglet ne navigue jamais vers l'annonce), à un rythme plus lent que Vinted :
// Beebs est plus nerveux (DataDome sur 3,2 % des relevés « Mes annonces », mesuré sur 7 jours) → 2 pages par poll, 30 à
// 60 s d'écart, 120 par jour et par compte ; le premier 403 / 429 / page de vérification coupe le compte 12 h (serveur
// ET extension), sans aucun repli qui naviguerait.
// Ouverture : coin_config.lecture_fond_mode_beebs (absent = 1 : le poste pilote, en MESURE — même chemin, même rythme,
// rien d'écrit sauf ses vraies fiches à lire ; 2 payants ; 3 tous ; 0 coupé). Critères du pilote avant toute ouverture
// (≥ 48 h, décision de Nico) : ≥ 200 lectures, 0 refus, médiane < 3 s, échecs hors anti-robot < 5 %.
export const LECTURE_FOND_BEEBS_VERSION_MIN = "0.6.145";
export const LECTURE_FOND_BEEBS_MODE_DEFAUT = 1;
export const LECTURE_FOND_BEEBS_RYTHME = Object.freeze({ par_cycle: 2, ecart_s: Object.freeze([30, 60]), par_jour: 120, pause_refus_h: 12 });
const ORIGINE_BEEBS = /^https:\/\/www\.beebs\.app\/[^\s]+$/;

/** La dernière lecture de fond Beebs posée sur la fiche (attributs.page_beebs_lue). */
function derniereLectureBeebs(a) {
  const l = a?.page_beebs_lue ?? null;
  if (!l || typeof l !== "object") return null;
  const t = Date.parse(String(l.at ?? l.v ?? ""));
  return Number.isFinite(t) ? { t, echec: Boolean(l.echec) } : null;
}

/**
 * Cette annonce Beebs a-t-elle besoin de sa page ? (pur) — annonce vivante d'une fiche au stock non fusionnée à qui il
 * MANQUE quelque chose (une photo ou moins, pas de texte ou pas d'état : `fiche_manque`, posé par la requête du serveur) ;
 * pas déjà capturée avec plusieurs photos ; pas relue depuis 30 jours (7 jours après un échec).
 * @param {{listing_id?: string, url?: string, capture_le?: string|null, capture_photos?: number|null,
 *   fiche_au_stock?: boolean, fiche_manque?: boolean, page_beebs_lue?: unknown}} a
 */
export function aLireEnFondBeebs(a, maintenant = Date.now()) {
  if (!a || !/^\d+$/.test(String(a.listing_id ?? "")) || !ORIGINE_BEEBS.test(String(a.url ?? ""))) return false;
  if (a.fiche_au_stock !== true || a.fiche_manque !== true) return false;
  const l = derniereLectureBeebs(a);
  if (l && maintenant - l.t < (l.echec ? 7 : 30) * JOUR_MS) return false;
  // Déjà capturée avec plusieurs photos : la fiche se complète par les déclencheurs, rien à relire.
  if (a.capture_le && Number(a.capture_photos) > 1) return false;
  return true;
}

/**
 * La liste Beebs servie à ce poll (pur). `mesure` (poste pilote) : ses vraies annonces à lire d'abord (écrites), puis une
 * rotation sur toutes ses annonces vivantes (rien d'écrit) ; `rattrapage` : les annonces à lire, les plus récentes d'abord.
 * Chaque ligne : { plateforme:'beebs', listing_id, url, inventaire_id, titre, prix, vignette, ecrire? }.
 */
export function listeLectureFondBeebs(annonces, regle, maintenant = Date.now()) {
  if (!regle?.actif) return [];
  const toutes = (Array.isArray(annonces) ? annonces : [])
    .filter((a) => /^\d+$/.test(String(a?.listing_id ?? "")) && ORIGINE_BEEBS.test(String(a?.url ?? "")) && a?.inventaire_id != null);
  const n = Math.max(0, Number(regle.par_cycle) || 0);
  const ligne = (a, ecrire) => ({
    plateforme: "beebs", listing_id: String(a.listing_id), url: String(a.url), inventaire_id: String(a.inventaire_id),
    titre: a.titre ?? null, prix: a.prix ?? null, vignette: a.photo_url ?? null, ...(ecrire === undefined ? {} : { ecrire }),
  });
  const parRecence = (x, y) => String(y.created_at ?? "").localeCompare(String(x.created_at ?? ""));
  const aLire = toutes.filter((a) => aLireEnFondBeebs(a, maintenant)).sort(parRecence);
  if (regle.mode === "mesure") {
    const pris = aLire.slice(0, n);
    const deja = new Set(pris.map((a) => String(a.listing_id)));
    const out = pris.map((a) => ligne(a, true));
    const reste = toutes.filter((a) => !deja.has(String(a.listing_id)) && a?.fiche_au_stock === true);
    if (reste.length) {
      const depart = Math.floor(maintenant / 120_000) * n % reste.length;   // rotation, un tour par poll
      for (let i = 0; out.length < n && i < reste.length; i++) out.push(ligne(reste[(depart + i) % reste.length], false));
    }
    return out;
  }
  return aLire.slice(0, n).map((a) => ligne(a));
}

/** Un résultat de lecture Beebs est-il un refus anti-robot ? (pur) — tout 403, 429 ou page de vérification. */
export function refusAntirobotBeebs(motif, http = null) {
  const h = Number(http);
  if (h === 403 || h === 429) return true;
  return /^HTTP (403|429)\b/.test(String(motif ?? "")) || /anti-?robot|captcha|datadome/i.test(String(motif ?? ""));
}
