// Vinted : une pause « anti-robot » n'existe que sur une réponse HTTP 403.
// Les textes, les pages inhabituelles et les 401 ne sont jamais des preuves.
export const MOTIF_ANTIROBOT_VINTED_403 = "antirobot_vinted_403";

// La sonde normale tourne toutes les 10 minutes. Deux intervalles laissent une
// marge à un poll retardé sans transformer une ancienne observation en vérité.
export const PREUVE_403_VINTED_FRAICHEUR_MS = 20 * 60_000;
// Deux annonces distinctes doivent avoir rencontré un 403 récent pour ouvrir
// un épisode de compte. Une fois l'épisode ouvert, la sonde datée le maintient.
export const OBSERVATION_403_VINTED_FRAICHEUR_MS = 6 * 60 * 60_000;
const TOLERANCE_FUTUR_MS = 60_000;

type Objet = Record<string, unknown>;

function objet(v: unknown): Objet | null {
  return v && typeof v === "object" ? v as Objet : null;
}

function temps(v: unknown): number | null {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? t : null;
}

function dateValide(t: number | null, maintenant: number, fraicheur: number): t is number {
  return t != null && t <= maintenant + TOLERANCE_FUTUR_MS && maintenant - t <= fraicheur;
}

function dateSonde(session: Objet): number | null {
  const par = objet(session.checked_at_par_plateforme);
  return temps(par?.vinted ?? session.checked_at);
}

function est403Sonde(session: Objet): boolean {
  const http = objet(session.http);
  return session.vinted !== true && Number(http?.vinted) === 403;
}

export type Preuve403Vinted = {
  at: string;
  atMs: number;
  source: "courante" | "precedente";
};

/**
 * Rend la dernière preuve HTTP 403 encore valable.
 * Une observation courante plus récente (200, 401 ou autre) invalide toujours
 * le 403 précédent : l'historique ne doit jamais contredire le présent.
 */
export function preuveSonde403Vinted(extensionSessions: unknown, maintenant = Date.now()): Preuve403Vinted | null {
  const courant = objet(extensionSessions);
  if (!courant) return null;
  const precedent = objet(courant.previous);
  const tCourant = dateSonde(courant);
  const tPrecedent = precedent ? dateSonde(precedent) : null;

  if (tCourant != null && (tPrecedent == null || tCourant >= tPrecedent)) {
    if (!dateValide(tCourant, maintenant, PREUVE_403_VINTED_FRAICHEUR_MS) || !est403Sonde(courant)) return null;
    return { at: new Date(tCourant).toISOString(), atMs: tCourant, source: "courante" };
  }
  if (!precedent || !dateValide(tPrecedent, maintenant, PREUVE_403_VINTED_FRAICHEUR_MS) || !est403Sonde(precedent)) return null;
  return { at: new Date(tPrecedent).toISOString(), atMs: tPrecedent, source: "precedente" };
}

function objetPorte403(v: Objet): boolean {
  // Une valeur structurée prime sur le texte. Ainsi http=401 accompagné d'un
  // ancien message contenant « 403 » ne devient jamais un anti-robot.
  if (v.http != null) return Number(v.http) === 403;
  return /\bHTTP\s*403\b/i.test(String(v.motif ?? v.message ?? ""));
}

export type Observation403Vinted = {
  at: string;
  atMs: number;
  source: "capture_echec" | "blocage_antirobot";
};

/** Une observation de job exacte, datée et récente — jamais un simple mot. */
export function observation403Vinted(job: unknown, maintenant = Date.now()): Observation403Vinted | null {
  const j = objet(job);
  const pf = objet(j?.platform_fields);
  if (!pf) return null;
  const candidats: Observation403Vinted[] = [];
  const capture = objet(pf.capture_echec);
  const tCapture = capture ? temps(capture.at) : null;
  if (capture && objetPorte403(capture) && dateValide(tCapture, maintenant, OBSERVATION_403_VINTED_FRAICHEUR_MS)) {
    candidats.push({ at: new Date(tCapture).toISOString(), atMs: tCapture, source: "capture_echec" });
  }
  const blocage = objet(pf.blocage_antirobot);
  const tBlocage = blocage ? temps(blocage.derniere ?? blocage.depuis) : null;
  if (blocage && objetPorte403(blocage) && dateValide(tBlocage, maintenant, OBSERVATION_403_VINTED_FRAICHEUR_MS)) {
    candidats.push({ at: new Date(tBlocage).toISOString(), atMs: tBlocage, source: "blocage_antirobot" });
  }
  return candidats.sort((a, b) => b.atMs - a.atMs)[0] ?? null;
}

/** Marqueur canonique d'un épisode déjà ouvert. Les anciens marqueurs larges
 *  ne suffisent pas : ils doivent être re-prouvés par deux 403 de jobs. */
export function episodeAntirobotVinted403(job: unknown): boolean {
  const j = objet(job);
  const pf = objet(j?.platform_fields);
  const attente = objet(pf?.attente_antirobot_compte);
  if (!attente) return false;
  return attente.motif === MOTIF_ANTIROBOT_VINTED_403
    && Number(attente.http) === 403
    && temps(attente.preuve_403_le) != null;
}
