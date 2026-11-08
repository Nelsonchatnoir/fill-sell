// ═══════════════════════════════════════════════════════════════════════════
// L'AVANCEMENT DE LA FILE DE REPUBLICATION, PAR PLATEFORME (08/11, point 1 f de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Joséphine (826 republications lancées le 04/11) a fait ~80 cycles pause → reprise le 08/11 pour « faire partir »
// sa file : rien ne lui disait qu'elle avançait. L'app montre désormais, plateforme par plateforme : combien sont
// passées depuis le début du lot, combien restent, le rythme constaté et une estimation HONNÊTE de la fin.
//
// ⛔ Exception NOMMÉE à la règle du 16/10 (« aucun temps estimé ») : décision de Nico du 08/11. L'estimation est
// bornée à ce qui se mesure :
//   · le rythme est celui CONSTATÉ sur les dernières republications de la plateforme (24 h au plus), en ne comptant
//     que le temps où le poste travaillait (un écart de plus de 45 min — ordinateur éteint, pause — n'est pas compté) ;
//   · la pause de respiration (2 h toutes les 50, règle du 04/09) est ajoutée telle quelle ;
//   · moins de 4 republications constatées → AUCUNE estimation (rythme inconnu, on ne devine pas) ;
//   · l'estimation se dit en temps de POSTE ALLUMÉ (l'ordinateur, ou FillSell Cloud) : jamais une heure d'horloge.
// Pur (aucun accès réseau) : get-pending-jobs (mode plafond_only) le nourrit, le selftest le rejoue.

export const ECART_INACTIF_MS = 45 * 60_000;
export const FENETRE_RYTHME_MS = 24 * 3600_000;
export const MIN_CONSTATEES = 4;
export const MAX_CONSTATEES = 20;

const ts = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : null; };

/**
 * Le rythme constaté (republications par heure de poste actif) sur des horodatages de publication.
 * @returns {number|null} null = pas assez de mesures.
 */
/** @param {Array<string|null|undefined>} horodatages @param {{ maintenant?: number }} [o] */
export function rythmeConstate(horodatages, o = {}) {
  const { maintenant = Date.now() } = o;
  const h = (horodatages ?? []).map(ts).filter((t) => t !== null && maintenant - t <= FENETRE_RYTHME_MS)
    .sort((a, b) => b - a).slice(0, MAX_CONSTATEES);
  if (h.length < MIN_CONSTATEES) return null;
  let actifMs = 0;
  let ecarts = 0;
  for (let i = 1; i < h.length; i++) {
    const e = h[i - 1] - h[i];
    if (e > ECART_INACTIF_MS) continue;
    actifMs += e;
    ecarts++;
  }
  if (ecarts < MIN_CONSTATEES - 1 || actifMs <= 0) return null;
  return (ecarts / actifMs) * 3600_000;
}

/**
 * @param {{ enFile?: Array<{platform:string, created_at:string, status:string}>, faites?: Array<{platform:string|null, created_at:string|null, published_at:string|null}>, faitesLotParPf?: Record<string, number>|null, maintenant?: number, pauseApres?: number, pauseDureeMin?: number }} [p]
 *   enFile : republications pending/processing/needs_user ; faites : republications publiées (récentes)
 * @returns {{ plateformes: Record<string, object>, total: { faites:number, restantes:number, a_toi:number } } | null}
 */
export function avancementRepublication(p = {}) {
  const { enFile = [], faites = [], faitesLotParPf = null, maintenant = Date.now(), pauseApres = 50, pauseDureeMin = 120 } = p;
  const parPf = new Map();
  const entree = (pf) => {
    if (!parPf.has(pf)) parPf.set(pf, { restantes: 0, a_toi: 0, debut: null, publiees: [] });
    return parPf.get(pf);
  };
  for (const j of enFile ?? []) {
    const pf = String(j?.platform ?? "").trim();
    if (!pf) continue;
    const e = entree(pf);
    if (j.status === "needs_user") e.a_toi++;
    else e.restantes++;
    const c = ts(j.created_at);
    if (c !== null && (e.debut === null || c < e.debut)) e.debut = c;
  }
  if (!parPf.size) return null;
  for (const f of faites ?? []) {
    const pf = String(f?.platform ?? "").trim();
    const e = parPf.get(pf);
    if (!e) continue;
    e.publiees.push(f);
  }
  const plateformes = {};
  let tf = 0, tr = 0, ta = 0;
  for (const [pf, e] of parPf) {
    // Passées = les republications de CE lot (nées depuis la plus ancienne qui attend encore, à la seconde près).
    // `faitesLotParPf` (compté par la base, exact) l'emporte sur les lignes récentes reçues.
    const compte = faitesLotParPf && Number.isFinite(Number(faitesLotParPf[pf])) ? Number(faitesLotParPf[pf]) : null;
    const faitesLot = compte !== null ? compte : e.debut === null ? 0
      : e.publiees.filter((f) => { const c = ts(f.created_at); return c !== null && c >= e.debut - 1000; }).length;
    const rythme = rythmeConstate(e.publiees.map((f) => f.published_at), { maintenant });
    let finH = null;
    if (rythme && e.restantes > 0) {
      const pauses = pauseApres > 0 ? Math.floor(e.restantes / pauseApres) : 0;
      finH = e.restantes / rythme + (pauses * pauseDureeMin) / 60;
    }
    plateformes[pf] = {
      restantes: e.restantes,
      a_toi: e.a_toi,
      faites: faitesLot,
      depuis: e.debut === null ? null : new Date(e.debut).toISOString(),
      rythme_h: rythme === null ? null : Math.round(rythme * 10) / 10,
      fin_estimee_h: finH === null ? null : Math.round(finH * 10) / 10,
    };
    tf += faitesLot; tr += e.restantes; ta += e.a_toi;
  }
  return { plateformes, total: { faites: tf, restantes: tr, a_toi: ta } };
}

/** « environ 6 h », « environ 3 jours », « moins d'une heure » — une durée de poste allumé, jamais une heure d'horloge. */
export function dureeEstimee(heures, lang = "fr") {
  const fr = lang !== "en";
  if (!Number.isFinite(heures) || heures < 0) return null;
  if (heures < 1) return fr ? "moins d'une heure" : "under an hour";
  if (heures < 36) { const h = Math.round(heures); return fr ? `environ ${h} h` : `about ${h} h`; }
  const j = Math.round(heures / 24);
  return fr ? `environ ${j} jour${j > 1 ? "s" : ""}` : `about ${j} day${j > 1 ? "s" : ""}`;
}

/** La phrase d'une plateforme : « 80 faites · 253 restantes · ~9/h · fin dans environ 30 h d'ordinateur allumé ». */
export function phraseAvancement(a, { lang = "fr", cloud = false } = {}) {
  const fr = lang !== "en";
  if (!a) return null;
  const parts = [fr ? `${a.faites} faite${a.faites > 1 ? "s" : ""}` : `${a.faites} done`,
    fr ? `${a.restantes} restante${a.restantes > 1 ? "s" : ""}` : `${a.restantes} to go`];
  if (a.a_toi) parts.push(fr ? `${a.a_toi} à toi de jouer` : `${a.a_toi} your move`);
  if (a.rythme_h) parts.push(fr ? `≈ ${String(a.rythme_h).replace(".", ",")} par heure` : `≈ ${a.rythme_h} per hour`);
  let fin = null;
  if (a.restantes > 0 && a.fin_estimee_h !== null) {
    const d = dureeEstimee(a.fin_estimee_h, lang);
    // estimation-ok: décision de Nico du 08/11 (point 1 f) — fin de file au rythme CONSTATÉ, en temps de poste allumé.
    if (d) fin = fr ? `fin dans ${d} ${cloud ? "de FillSell Cloud" : "d'ordinateur allumé"}` : `done in ${d} of ${cloud ? "FillSell Cloud" : "computer on"}`; // estimation-ok: décision de Nico du 08/11 (point 1 f)
  } else if (a.restantes > 0) {
    fin = fr ? "fin estimée dès les premières republications" : "estimate after the first reposts";
  }
  return { texte: parts.join(" · "), fin };
}
