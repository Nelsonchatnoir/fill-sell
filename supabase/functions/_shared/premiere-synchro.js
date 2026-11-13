// ═══════════════════════════════════════════════════════════════════════════
// LA PREMIÈRE SYNCHRO PART SEULE (26/10, Azizak Shop — règle de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Azizak Shop : inscrit à 11:27, 5 plateformes choisies, extension active à 12:05, Vinted connecté — jamais touché
// « Synchroniser » : 0 fiche, 0 annonce, un prospect chaud qui ne voit rien. Mesure du 26/10 : sur 102 inscrits des
// 15 derniers jours dont l'extension a été vue, 20 n'ont jamais eu de synchro, 14 avec une plateforme connectée.
// LA RÈGLE : dès que l'extension passe (get-pending-jobs) et qu'au moins une plateforme CHOISIE y est connectée, un
// compte récent (coin_config.premiere_synchro_auto_jours, défaut 15) reçoit SA première synchro, par les MÊMES
// demandes que le bouton (demander_sync_dressing, demander_sync_plateforme : les seuls déclencheurs que l'extension
// déjà installée importe). Interrupteur : coin_config.premiere_synchro_auto = 0 coupe tout (absent = en marche).
//
// ── (13/11, décision de Nico — lot du 13/11, N1) PAR PLATEFORME, UNE FOIS PAR PLATEFORME ──────────────────────────────
// Avant : une fois par COMPTE — la première demande posée (n'importe quelle plateforme) était la marque. ff1f879f
// (13/11) : Leboncoin seul connecté à 02:59, sa première synchro part ; Vinted, connecté plus tard, ne l'aurait jamais
// eue. 1f95f334 : Depop vu connecté, jamais relevé, parce que Leboncoin avait eu la sienne le 02/11.
// Désormais : une plateforme CHOISIE (ni écartée), dont la session est VUE (`true`), qui n'a jamais été relevée
// (aucun relevé fait, incomplet, en file ou en cours) et dont la première synchro n'a jamais été posée (marque :
// usage_logs premiere_synchro_auto, `plateformes`), reçoit la sienne — même si une autre plateforme a déjà eu la sienne.
// Mêmes RPC, mêmes gardes (cadence, déjà en attente, version, plateforme écartée), même fenêtre de jours. Relevés lus
// incomplets (plafond de lecture atteint) → rien : jamais deux fois.
// Pur (Deno + Node) : scripts/premiere-synchro-selftest.mjs, scripts/connexion-choisie-selftest.mjs.

export const DECLENCHEUR_GESTE_RE = /^(bouton|bouton_distant|app)(:redemande)?$/;
export const PREMIERE_SYNCHRO_JOURS_DEFAUT = 15;
export const PLATEFORMES_PREMIERE_SYNCHRO = Object.freeze(["vinted", "leboncoin", "beebs", "depop", "ebay"]);
// Un relevé qui compte comme « déjà relevée » : fini (fait / incomplet) ou en vol (en file / en cours).
const STATUTS_RELEVEE = new Set(["done", "incomplete", "queued", "running"]);

/** La plateforme d'un relevé (vinted_sync_runs) : le dressing est Vinted, les relevés « annonces » portent la leur. */
export function plateformeDuRun(r) {
  const kind = String(r?.kind ?? "");
  if (kind === "dressing") return "vinted";
  if (kind === "annonces") return String(r?.platform ?? "").toLowerCase() || null;
  return null;
}

/** Les plateformes dont la première synchro a déjà été posée (usage_logs premiere_synchro_auto → metadata.plateformes). */
export function plateformesDejaPosees(lignes) {
  const out = [];
  for (const l of Array.isArray(lignes) ? lignes : []) {
    const pfs = l?.metadata?.plateformes;
    for (const pf of Array.isArray(pfs) ? pfs : []) {
      const p = String(pf);
      if (PLATEFORMES_PREMIERE_SYNCHRO.includes(p) && !out.includes(p)) out.push(p);
    }
  }
  return out;
}

/**
 * Les plateformes dont la première synchro doit partir maintenant (vide : rien à faire).
 * @param {object} p
 * @param {string|null} p.inscritLe            profiles.created_at
 * @param {unknown} p.platformSettings          profiles.platform_settings (plateformes_vendeur, plateformes_ecartees)
 * @param {unknown} p.sessions                  profiles.extension_sessions ({ vinted: true, … })
 * @param {Array<{kind?: string, platform?: string|null, status?: string, declencheur?: string|null}>} p.runs
 *        les relevés du compte (vinted_sync_runs dressing/annonces) — un relevé sans `kind` n'est attribué à aucune
 *        plateforme
 * @param {string[]|null} [p.dejaPosees]        plateformes dont la première synchro a déjà été posée (plateformesDejaPosees)
 * @param {boolean} [p.runsComplets]            false : la lecture des relevés a atteint son plafond → rien
 * @param {{ actif?: boolean, jours?: number }} [p.reglage]
 * @param {number} [p.maintenant]
 * @returns {string[]}
 */
export function premiereSynchroAPoser({ inscritLe, platformSettings, sessions, runs = [], dejaPosees = [], runsComplets = true, reglage = {}, maintenant = Date.now() }) {
  if (reglage.actif === false) return [];
  if (runsComplets === false) return [];
  const jours = Number(reglage.jours) > 0 ? Number(reglage.jours) : PREMIERE_SYNCHRO_JOURS_DEFAUT;
  const t = Date.parse(String(inscritLe ?? ""));
  if (!Number.isFinite(t) || maintenant - t > jours * 86_400_000) return [];
  const ps = platformSettings && typeof platformSettings === "object" ? platformSettings : {};
  const choisies = Array.isArray(ps.plateformes_vendeur) ? ps.plateformes_vendeur.map(String) : [];
  const ecartees = new Set(Array.isArray(ps.plateformes_ecartees) ? ps.plateformes_ecartees.map(String) : []);
  const s = sessions && typeof sessions === "object" ? sessions : {};
  const relevees = new Set();
  for (const r of runs ?? []) {
    const pf = plateformeDuRun(r);
    if (pf && STATUTS_RELEVEE.has(String(r?.status ?? ""))) relevees.add(pf);
  }
  const deja = new Set(Array.isArray(dejaPosees) ? dejaPosees.map(String) : []);
  // Aucune plateforme choisie (étape passée) : celles où l'extension voit une session.
  return PLATEFORMES_PREMIERE_SYNCHRO.filter((pf) => (choisies.length ? choisies.includes(pf) : true)
    && !ecartees.has(pf) && s[pf] === true && !relevees.has(pf) && !deja.has(pf));
}
