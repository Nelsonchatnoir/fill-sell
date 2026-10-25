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

/** coin_config.lecture_fond_mode → 0..3 ; absent ou illisible → le mode par défaut. */
export function modeLectureFond(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return LECTURE_FOND_MODE_DEFAUT;
  const n = Number(valeur);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : LECTURE_FOND_MODE_DEFAUT;
}

/**
 * Ce compte lit-il en arrière-plan à ce poll ? (pur)
 * @param {{userId?: string, mode?: number, payant?: boolean, versionOk?: boolean, pauseAntirobot?: boolean,
 *   luesAujourdhui?: number, dernierRefusMs?: number|null, maintenant?: number}} [p]
 * @returns {{actif:false, raison:string} | {actif:true, mode:'mesure'|'rattrapage', par_cycle:number, ecart_s:number[], par_jour:number}}
 */
export function regleLectureFond({
  userId, mode, payant = false, versionOk = false, pauseAntirobot = false,
  luesAujourdhui = 0, dernierRefusMs = null, maintenant = Date.now(),
} = {}) {
  const pilote = LECTURE_FOND_PILOTES.includes(String(userId ?? ""));
  const non = (raison) => ({ actif: false, raison });
  if (!versionOk) return non("extension_trop_ancienne");
  if (mode === 0) return non("coupe");
  if (pauseAntirobot) return non("pause_antirobot");
  if (Number.isFinite(dernierRefusMs) && maintenant - dernierRefusMs < LECTURE_FOND_RYTHME.pause_refus_h * 3_600_000) return non("refus_recent");
  if (mode === 1 && !pilote) return non("pas_encore_ouvert");
  if (mode === 2 && !payant && !pilote) return non("pas_encore_ouvert");
  const reste = LECTURE_FOND_RYTHME.par_jour - (Number(luesAujourdhui) || 0);
  if (reste <= 0) return non("plafond_du_jour");
  return {
    actif: true,
    mode: mode === 1 ? "mesure" : "rattrapage",
    par_cycle: Math.min(LECTURE_FOND_RYTHME.par_cycle, reste),
    ecart_s: [...LECTURE_FOND_RYTHME.ecart_s],
    par_jour: LECTURE_FOND_RYTHME.par_jour,
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
