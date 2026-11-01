// ═══════════════════════════════════════════════════════════════════════════
// « TA CONNEXION EST BONNE » SE PROUVE SUR CE POSTE, MAINTENANT (01/11, Louis — tout le parc)
// ═══════════════════════════════════════════════════════════════════════════
// Le 01/11, de 10:16 à 10:40, le retrait Leboncoin « Maison Gabby » de louis-seller a lu quatre fois « Leboncoin a
// refusé l'accès à la page à l'instant, mais ta connexion Leboncoin est bonne : rien à faire de ton côté ». C'était
// faux : la session de sa machine virtuelle était morte (Leboncoin lui montrait sa propre annonce comme à un acheteur,
// et refusait ses identifiants). Trois défauts de la règle :
//   1. la « preuve » pouvait venir d'un AUTRE poste du compte (la sonde est rangée au compte, pas au poste) ;
//   2. elle pouvait être périmée : une sonde muette (403) garde la valeur connue avec sa date, et pas-de-rouge lisait
//      ce « true » sans regarder la date ; un relevé réussi il y a 2 h comptait même s'il précédait le mur ;
//   3. l'observation directe du contraire ne comptait pas : une annonce montrée « vue acheteur » à son propre vendeur
//      prouve que CE navigateur n'est pas connecté au compte de l'annonce.
// La règle : « connecté » ne se dit que si une mesure de CE poste (ou du compte quand il n'a qu'un poste vivant), de
// moins de 30 min, POSTÉRIEURE à la dernière fois que ce job a vu le mur, le dit — et jamais devant une vue acheteur.
// Sinon on dit ce qu'on sait : on attend la connexion (le message d'attente de session, inchangé).
// Pur (Deno + Node).

export const FRAICHEUR_PREUVE_SESSION_MS = 30 * 60_000;

const ms = (v) => {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? t : NaN;
};

/** Le verdict montre-t-il l'annonce comme à quelqu'un qui n'en est PAS le vendeur (Leboncoin « vue acheteur ») ? */
export function verdictVueAcheteur(...textes) {
  return textes.some((x) => /\bvue acheteur\b/i.test(typeof x === "string" ? x : (x == null ? "" : JSON.stringify(x))));
}

/** Une mesure (valeur, date) prouve-t-elle « connecté » maintenant, après `apres` ? */
function mesureBonne(valeur, date, maintenant, apres) {
  const t = ms(date);
  return valeur === true && Number.isFinite(t) && maintenant - t < FRAICHEUR_PREUVE_SESSION_MS && maintenant >= t
    && !(Number.isFinite(apres) && t <= apres);
}

/**
 * La sonde prouve-t-elle CE poste connecté à `platform` ?
 *   sessionsCompte      profiles.extension_sessions (écrit par les postes du compte, au compte)
 *   poste               profiles.extension_postes[<ce poste>] (sessions : ce que le poste dit de lui, ≥ 0.6.126)
 *   autresPostesVivants nombre d'AUTRES postes du compte vus depuis 2 h
 *   apres               (ms) la preuve doit être postérieure à cet instant (dernier mur vu par ce job) ; NaN : pas de borne
 * Rend { bonne, preuve } — preuve = le libellé journalisé, null si rien n'est prouvé.
 */
export function sondeProuveSession({ platform, sessionsCompte, poste, autresPostesVivants = 0, maintenant = Date.now(), apres = NaN }) {
  const pf = String(platform ?? "");
  const sp = poste && typeof poste.sessions === "object" && poste.sessions ? poste.sessions : null;
  if (sp && typeof sp[pf] === "boolean" && Number.isFinite(ms(sp.lu_le)) && maintenant - ms(sp.lu_le) < FRAICHEUR_PREUVE_SESSION_MS) {
    // Ce que le poste dit de lui, frais : c'est la mesure qui fait foi, dans les deux sens.
    return mesureBonne(sp[pf], sp.lu_le, maintenant, apres)
      ? { bonne: true, preuve: "sonde de ce poste « connecté » (moins de 30 min)" }
      : { bonne: false, preuve: null };
  }
  // Plusieurs postes vivants : la sonde rangée au compte peut venir d'un autre — elle ne dit rien de celui-ci.
  if (Number(autresPostesVivants) > 0) return { bonne: false, preuve: null };
  const s = sessionsCompte && typeof sessionsCompte === "object" ? sessionsCompte : null;
  if (!s) return { bonne: false, preuve: null };
  const date = (etat) => ((etat?.checked_at_par_plateforme ?? {})[pf] ?? etat?.checked_at ?? null);
  if (mesureBonne(s[pf], date(s), maintenant, apres)) return { bonne: true, preuve: "sonde « connecté » (moins de 30 min)" };
  const prev = s.previous && typeof s.previous === "object" ? s.previous : null;
  if (prev && mesureBonne(prev[pf], date(prev), maintenant, apres)) {
    return { bonne: true, preuve: "sonde « connecté » juste avant ce mur (moins de 30 min)" };
  }
  return { bonne: false, preuve: null };
}

/**
 * Les sessions données à l'arbitrage des échecs (pas-de-rouge) : un « connecté » n'y reste que s'il est prouvé pour CE
 * poste maintenant (sinon il devient « inconnu », jamais « déconnecté ») ; les autres valeurs sont rendues telles quelles.
 */
export function sessionsPourArbitrage(/** @type {{ platform: string, sessionsCompte: any, poste?: any, autresPostesVivants?: number, maintenant?: number, verdict?: any }} */ args) {
  const { platform, sessionsCompte, poste, autresPostesVivants = 0, maintenant = Date.now(), verdict = [] } = args;
  const s = sessionsCompte && typeof sessionsCompte === "object" ? sessionsCompte : null;
  if (!s) return s;
  const pf = String(platform ?? "");
  if (s[pf] !== true) return s;
  const contredit = verdictVueAcheteur(...(Array.isArray(verdict) ? verdict : [verdict]));
  if (!contredit && sondeProuveSession({ platform: pf, sessionsCompte: s, poste, autresPostesVivants, maintenant }).bonne) return s;
  return { ...s, [pf]: null };
}

/** Le dernier instant où CE job a vu le mur (refus passager ou attente de session), en ms ; NaN s'il ne l'a jamais vu. */
export function dernierMurDuJob(pf) {
  const p = pf && typeof pf === "object" ? pf : {};
  const t = [ms(p.refus_passager?.derniere), ms(p.attente_session?.derniere)].filter(Number.isFinite);
  return t.length ? Math.max(...t) : NaN;
}
