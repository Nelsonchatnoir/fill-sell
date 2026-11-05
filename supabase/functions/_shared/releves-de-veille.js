// ═══════════════════════════════════════════════════════════════════════════
// RELEVÉS DE VEILLE AU RETOUR DE LA CONNEXION (05/11, décision de Nico — A4)
// ═══════════════════════════════════════════════════════════════════════════
// Depuis la règle du 05/10 (« aucun relevé d'import sans Synchroniser »), handler-watch ne reposait plus le relevé
// des annonces d'une plateforme quand sa session revenait après un mur de connexion (RELANCE_AUTOMATIQUE_RELEVE =
// false) : une vente faite pendant le mur n'était lue qu'au prochain clic « Synchroniser ».
// DÉCISION DE NICO (05/11) : rallumés pour Leboncoin, Beebs et Depop, en LECTURE SEULE — ventes et état des annonces,
// aucun import, aucune création d'article. La règle du 05/10 reste entière : 'reprise_connexion' est un relevé de
// VEILLE (releve_est_veille, migration 20261105110000), jamais un geste (releve_est_geste) — seul un geste ouvre
// l'import (rapprocher_releve, inventaire_ecarte_import_sync). eBay passe par son API (ebay-api-worker) : pas ici.
// Opla est quittée (10/10) : retirée. Le dressing Vinted (kind 'dressing') reste coupé : hors de la décision.
// Les gardes d'avant, inchangées (pas une visite de plus qu'avant le 05/10) : interrupteur serveur, extension vue,
// sonde de session fraîche ET postérieure au mur, aucun relevé de la plateforme en file ou en cours, 15 min après le
// dernier relevé réussi, 3 reprises au plus par épisode (depuis le dernier relevé réussi).
// NEUF : jamais pendant une pause Leboncoin (« Accès temporairement restreint ») : seule la visite de contrôle du
// serveur y lit, une à la fois (blocage-leboncoin.js) — l'extension refuserait de toute façon ce relevé.
// Pur (Node + Deno) : scripts/releves-de-veille-selftest.mjs.

import { etatBlocageLbc, lecturesExtensionEnPause } from "./blocage-leboncoin.js";

export const DECLENCHEUR_REPRISE_CONNEXION = "reprise_connexion";
export const PLATEFORMES_VEILLE_REPRISE = Object.freeze(["leboncoin", "beebs", "depop"]);
export const STATUTS_ARRET_RELEVE = Object.freeze(["absente", "failed", "expired"]);
export const CADENCE_REPRISE_MS = 15 * 60_000;
export const PLAFOND_REPRISES_PAR_EPISODE = 3;
export const FRAICHEUR_SONDE_VEILLE_MS = 3 * 60 * 60_000;
export const FENETRE_ARRETS_MS = 7 * 24 * 60 * 60_000;

const t = (v) => { const x = Date.parse(String(v ?? "")); return Number.isFinite(x) ? x : NaN; };

/** Le mur de connexion d'un relevé, sur le texte que NOS relevés écrivent (« session beebs : page de connexion ») —
 * miroir de MUR_PAGE_CONNEXION (src/annonces/etatReleve.js). Jamais une heuristique sur un message de plateforme. */
export function murConnexionVeille(erreur) {
  return /page de connexion/i.test(String(erreur ?? ""));
}

/**
 * Les relevés de veille à reposer (pur). Entrées :
 *  - arrets : relevés `kind='annonces'` arrêtés (absente/failed/expired) des 7 derniers jours, du plus récent au plus ancien ;
 *  - historique : relevés `kind='annonces'` des comptes concernés (statut, déclencheur, queued_at, started_at, finished_at) ;
 *  - profils : Map user_id → { sessions (extension_sessions), extVue (extension_last_seen_at), ps (platform_settings) } ;
 *  - ouverte : Map user_id → boolean (sync_multi_ouverte_pour).
 * Rend [{ user_id, platform, mur_du }] — un au plus par (compte, plateforme).
 * @param {{ arrets?: any[], historique?: any[], profils?: Map<string, any>, ouverte?: Map<string, boolean>, maintenant?: number }} arg
 * @returns {Array<{ user_id: string, platform: string, mur_du: string }>}
 */
export function relevesDeVeilleAReposer({ arrets = [], historique = [], profils = new Map(), ouverte = new Map(), maintenant = Date.now() }) {
  // Le PLUS RÉCENT arrêt par (compte, plateforme) fait foi : un arrêt plus récent qui n'est pas un mur l'emporte.
  const dernier = new Map();
  for (const r of arrets) {
    const platform = String(r?.platform ?? "");
    if (!PLATEFORMES_VEILLE_REPRISE.includes(platform)) continue;
    if (!STATUTS_ARRET_RELEVE.includes(String(r?.status ?? ""))) continue;
    if (!(maintenant - t(r?.finished_at) <= FENETRE_ARRETS_MS)) continue;
    const cle = `${r.user_id}|${platform}`;
    if (dernier.has(cle)) continue;
    dernier.set(cle, { user_id: String(r.user_id), platform, finished_at: String(r.finished_at), mur: murConnexionVeille(r.erreur) });
  }
  const actifs = new Set();
  const reussiA = new Map();
  const reprises = new Map();
  for (const r of historique) {
    const cle = `${r.user_id}|${r.platform}`;
    const st = String(r?.status ?? "");
    if (st === "queued" || st === "running") { actifs.add(cle); continue; }
    if (st === "done") {
      const f = t(r.finished_at);
      if (Number.isFinite(f) && f > (reussiA.get(cle) ?? 0)) reussiA.set(cle, f);
    }
    if (String(r?.declencheur ?? "") === DECLENCHEUR_REPRISE_CONNEXION) {
      const q = t(r.queued_at ?? r.started_at);
      if (Number.isFinite(q)) reprises.set(cle, [...(reprises.get(cle) ?? []), q]);
    }
  }
  const out = [];
  for (const c of dernier.values()) {
    if (!c.mur) continue;
    const cle = `${c.user_id}|${c.platform}`;
    const prof = profils.get(c.user_id);
    if (!prof || !prof.extVue) continue;                                   // extension jamais vue
    if (ouverte.get(c.user_id) !== true) continue;                         // interrupteur serveur
    const s = prof.sessions ?? {};
    if (s[c.platform] !== true) continue;                                  // pas connecté, ou inconnu
    const vu = t(s.checked_at_par_plateforme?.[c.platform] ?? s.checked_at);
    if (!Number.isFinite(vu) || maintenant - vu > FRAICHEUR_SONDE_VEILLE_MS) continue;   // sonde absente ou vieille
    const arret = t(c.finished_at);
    if (!Number.isFinite(arret) || vu <= arret) continue;                  // rien de neuf depuis le mur
    if (c.platform === "leboncoin" && lecturesExtensionEnPause(etatBlocageLbc(prof.ps ?? {}, maintenant).etat)) continue;
    if (actifs.has(cle)) continue;                                         // un relevé déjà en file ou en cours
    const reussi = reussiA.get(cle) ?? 0;
    if (reussi && reussi > arret) continue;                                // déjà reparti : plus de mur
    if (reussi && maintenant - reussi < CADENCE_REPRISE_MS) continue;      // cadence
    if ((reprises.get(cle) ?? []).filter((q) => q > reussi).length >= PLAFOND_REPRISES_PAR_EPISODE) continue;
    out.push({ user_id: c.user_id, platform: c.platform, mur_du: c.finished_at });
  }
  return out;
}

/** La ligne à poser : un relevé de VEILLE (lecture seule) — jamais un geste. */
export function ligneReleveDeVeille({ user_id, platform }, maintenant = new Date().toISOString()) {
  return { user_id, kind: "annonces", platform, status: "queued", declencheur: DECLENCHEUR_REPRISE_CONNEXION, queued_at: maintenant };
}
