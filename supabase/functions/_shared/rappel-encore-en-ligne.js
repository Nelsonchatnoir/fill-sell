// ═══════════════════════════════════════════════════════════════════════════
// UNE QUESTION SUR UNE ANNONCE VENDUE ENCORE EN LIGNE EST RELANCÉE DANS L'APP TANT QU'ELLE N'A PAS DE RÉPONSE
// (19/11/2026, terminal t5 — décision de Nico : « aucune double vente » ; pas un mail)
// ═══════════════════════════════════════════════════════════════════════════
// LES QUESTIONS (lues par encore_en_ligne_questions, migration 20261119180000) :
//   · « À régler — Vendu, encore en ligne : Retirer / Plus tard » (sorte a_regler : tâche annulée + pending_removal sur un
//     article vendu) ;
//   · « Déjà vendu ? » (sorte deja_vendu : inventaire_doublons copie_non_prouvee « proposee »).
//   Jamais après « Non » (la question n'est plus « proposee ») ni après « Retirer » / « Oui » (un retrait existe : la base
//   l'écarte), ni sur Opla, ni sans numéro d'annonce.
// LA CONDITION DE CHAQUE RELANCE : l'annonce a été REVUE EN LIGNE (relevé ou veille) APRÈS la question — et, pour la
//   suivante, après la relance précédente. Une annonce qu'on ne voit plus n'est plus relancée (c'est la borne).
// « PLUS TARD » = 3 JOURS : le point de départ devient la fin du report ; l'annonce revient dans « À régler ». Un report
//   donné AVANT cette règle (sans la marque pending_removal_reporte_jours, sous la promesse « la question ne revient
//   plus ») est reposé UNE fois, DANS LE BANDEAU SEULEMENT (jamais un push) ; un nouveau « Plus tard » le remet sous la
//   règle des 3 jours.
// LA CADENCE (par annonce) : J+1, J+3, puis tous les 3 jours jusqu'à J+30, ensuite tous les 7 jours.
// PAR COMPTE : UNE note regroupée par 24 h, de 9 h à 20 h (Paris), jamais dans l'heure d'un autre push FillSell.
// L'INTERRUPTEUR : coin_config rappel_encore_en_ligne_actif (0 = rien, ni bandeau ni push).
// Pur (Deno + Node) : push-ventes (le push) et l'app (le bandeau) l'appellent. Verrou : selftest:rappel-encore-en-ligne.

export const JOUR_MS = 86_400_000;
export const REPORT_MS = 3 * JOUR_MS;
export const LONG_MS = 30 * JOUR_MS;
export const PAS_COURT_MS = 3 * JOUR_MS;
export const PAS_LONG_MS = 7 * JOUR_MS;
export const ENTRE_DEUX_NOTES_MS = 20 * 3600_000;   // une note par jour et par compte (20 h : la passe du lendemain passe)
export const ECART_AUTRE_PUSH_MS = 3600_000;
export const HEURE_DEBUT = 9, HEURE_FIN = 20;
export const FEATURE_RAPPEL = 'rappel_encore_en_ligne';
const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', ebay: 'eBay', opla: 'Opla' };

const ms = (v) => { if (v == null || v === '') return NaN; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : NaN; };

/** Le point de départ de la question (ms), ou null si elle ne se pose pas (encore reportée). `ancien` = report d'avant la règle. */
export function departDe(q, maintenant = Date.now()) {
  const pose = ms(q?.question_le);
  if (!Number.isFinite(pose)) return { depart: null, ancien: false };
  const rep = ms(q?.report_le);
  if (q?.sorte === 'a_regler' && Number.isFinite(rep)) {
    if (q?.report_borne !== true) return { depart: Math.max(pose, rep), ancien: true };   // reposé une fois, bandeau seulement
    const fin = rep + REPORT_MS;
    return fin > maintenant ? { depart: null, ancien: false } : { depart: Math.max(pose, fin), ancien: false };
  }
  return { depart: pose, ancien: false };
}

/** Revue en ligne après le point de départ (et après `apres`, la relance précédente) ? */
export const revueApres = (q, depart, apres = -Infinity) => {
  const vu = ms(q?.vu_le);
  return Number.isFinite(vu) && depart != null && vu > depart && vu > apres;
};

/** Le décalage de la relance n° k (0 = la première) depuis le départ : J+1, J+3, +3 j jusqu'à J+30, puis +7 j. */
export function decalage(k) {
  if (k <= 0) return JOUR_MS;
  let d = 3 * JOUR_MS;
  for (let i = 1; i < k; i++) d += d < LONG_MS ? PAS_COURT_MS : PAS_LONG_MS;
  return d;
}

/** L'heure de Paris (0-23) d'un instant. */
export function heureParis(t) {
  // (formatToParts : « 22 h » en français ; seule la partie « hour » compte)
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t));
  return Number(p.find((x) => x.type === 'hour')?.value ?? NaN);
}

/** Les annonces du BANDEAU (l'app) : questions ouvertes, revues en ligne après la question (ou la fin du report). */
export function aMontrer(questions, { actif = false, maintenant = Date.now() } = {}) {
  if (!actif) return [];
  const out = [];
  for (const q of Array.isArray(questions) ? questions : []) {
    const { depart } = departDe(q, maintenant);
    if (depart == null || !revueApres(q, depart)) continue;
    out.push(q);
  }
  return out;
}

/**
 * Les notes PUSH à envoyer (le serveur).
 * @param {{ questions: object[], traces: Array<{user_id, created_at, cles?: string[]}>, autresPush?: Array<{user_id, created_at}>,
 *           actif?: boolean, maintenant?: number }} o
 * @returns {Array<{ user_id: string, cles: string[], annonces: Array<{cle, platform, titre, vu_le}>, rang: number }>}
 */
export function notesRappel({ questions = [], traces = [], autresPush = [], actif = false, maintenant = Date.now() } = {}) {
  if (!actif) return [];
  const h = heureParis(maintenant);
  if (!(h >= HEURE_DEBUT && h < HEURE_FIN)) return [];   // heure illisible = la nuit : rien
  const parCle = new Map(); const derniereParCompte = new Map();
  for (const t of Array.isArray(traces) ? traces : []) {
    const le = ms(t?.created_at); if (!Number.isFinite(le)) continue;
    const u = String(t.user_id);
    derniereParCompte.set(u, Math.max(derniereParCompte.get(u) ?? -Infinity, le));
    for (const c of Array.isArray(t?.cles) ? t.cles : []) { const l = parCle.get(c) ?? []; l.push(le); parCle.set(c, l); }
  }
  const autre = new Map();
  for (const p of Array.isArray(autresPush) ? autresPush : []) {
    const le = ms(p?.created_at); if (Number.isFinite(le)) autre.set(String(p.user_id), Math.max(autre.get(String(p.user_id)) ?? -Infinity, le));
  }
  const parCompte = new Map();
  for (const q of Array.isArray(questions) ? questions : []) {
    const { depart, ancien } = departDe(q, maintenant);
    if (depart == null || ancien) continue;                        // reporté, ou report d'avant la règle : bandeau seulement
    const faites = (parCle.get(q.cle) ?? []).filter((le) => le >= depart).sort((a, b) => a - b);
    const derniere = faites.length ? faites[faites.length - 1] : -Infinity;
    if (!revueApres(q, depart, derniere)) continue;                // jamais sans une vue en ligne plus récente
    if (depart + decalage(faites.length) > maintenant) continue;   // pas encore l'heure
    const u = String(q.user_id);
    const l = parCompte.get(u) ?? { user_id: u, cles: [], annonces: [], rang: 0 };
    l.cles.push(q.cle); l.annonces.push({ cle: q.cle, platform: q.platform, titre: q.titre, vu_le: q.vu_le });
    l.rang = Math.max(l.rang, faites.length + 1);
    parCompte.set(u, l);
  }
  const notes = [];
  for (const [u, note] of parCompte) {
    if (maintenant - (derniereParCompte.get(u) ?? -Infinity) < ENTRE_DEUX_NOTES_MS) continue;
    if (maintenant - (autre.get(u) ?? -Infinity) < ECART_AUTRE_PUSH_MS) continue;
    notes.push(note);
  }
  return notes;
}

const jourParis = (t, lang) => new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' }).format(new Date(t));

/** Le texte de la note (jamais « Chrome » ni « ordinateur » : rien ici ne dépend de la voie). */
export function messageRappel(note, { lang = 'fr' } = {}) {
  const en = lang === 'en';
  const a = note?.annonces ?? [];
  const pfs = [...new Set(a.map((x) => NOMS[x.platform] ?? x.platform))].join(', ');
  const titre = en ? 'Possible double sale' : 'Double vente possible';
  let corps;
  if (a.length === 1) {
    const t = String(a[0].titre ?? '').slice(0, 60);
    const vu = Number.isFinite(ms(a[0].vu_le)) ? jourParis(ms(a[0].vu_le), lang) : null;
    corps = en
      ? `“${t}” is sold, but its ${pfs} listing is still online${vu ? ` (seen on ${vu})` : ''}. Remove it, or tell us it's another item.`
      : `« ${t} » est vendu, mais son annonce ${pfs} est encore en ligne${vu ? ` (vue le ${vu})` : ''}. Retire-la, ou dis-nous que c'est un autre exemplaire.`;
  } else {
    corps = en
      ? `${a.length} sold items still have a listing online (${pfs}). Tap to sort it out.`
      : `${a.length} articles vendus ont encore une annonce en ligne (${pfs}). Touche pour régler.`;
  }
  return { titre, corps, donnees: { type: 'encore_en_ligne', n: String(a.length) } };
}
