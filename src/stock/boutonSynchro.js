// ═══════════════════════════════════════════════════════════════════════════
// LE BOUTON « SYNCHRONISER » DIT CE QUI EST À JOUR (31/10 soir, lot J 2 — Rosa Metra)
// ═══════════════════════════════════════════════════════════════════════════
// Rosa a appuyé six fois de suite : le serveur ne relit pas une plateforme lue il y a moins de 15 min
// (demander_sync_plateforme « recent », cadence Vinted de l'app), mais rien ne le lui disait — ses appuis partaient
// sans un mot. LA RÈGLE, pure (Node, Vite) :
//   · sous le bouton, la dernière synchro de CHAQUE plateforme connectée (« Vinted à jour il y a 3 min ») ;
//   · toutes les plateformes connectées lues il y a moins de 15 min → bouton grisé, « Tout est à jour, prochaine
//     synchro automatique vers 14 h » (heure de Paris) ;
//   · cliquable dès qu'une plateforme n'est plus à jour (ses 15 min passées, une lecture ratée ou incomplète) ou
//     qu'une plateforme vient d'être connectée (session vue, pas encore lue) ;
//   · stock vide mais annonces trouvées (stock remis à zéro) : jamais grisé — la règle du 26/10 (B3) tient.
// Rien ne change à la cadence ni aux relevés automatiques : on DIT ce que le serveur fait déjà.
// « Prochaine synchro automatique » (aucune lecture de plus que celle de l'appelant) :
//   · eBay relié par l'API : le serveur repose le relevé 20 h après le dernier fini (ebay-releve-api, toutes les
//     10 min) ;
//   · les autres (alarme quotidienne de l'extension, Chrome ouvert) : jamais avant 20 h après le dernier relevé fini
//     (gardes de l'extension) ; l'alarme tombe toutes les 24 h, à l'heure du dernier relevé automatique connu.
// La plus proche des plateformes connectées est dite ; aucune connue → la phrase sans heure.

export const SYNCHRO_A_JOUR_MS = 15 * 60_000;
export const ALARME_AUTO_MS = 24 * 3600_000;
export const PLANCHER_AUTO_MS = 20 * 3600_000;
const RELEVE_EBAY_API_TOUR_MS = 10 * 60_000;
const AUTOMATIQUES = new Set(['cron', 'serveur:quotidien_api']);

const ms = (v) => { const t = typeof v === 'number' ? v : Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : NaN; };

/** « à l'instant », « il y a 3 min », « il y a 2 h », « il y a 3 j ». */
export function depuisCourt(t, maintenant, fr = true) {
  const min = Math.max(0, Math.round((maintenant - t) / 60_000));
  if (min < 1) return fr ? "à l'instant" : 'just now';
  if (min < 60) return fr ? `il y a ${min} min` : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return fr ? `il y a ${h} h` : `${h} h ago`;
  const j = Math.round(h / 24);
  return fr ? `il y a ${j} j` : `${j} d ago`;
}

// ── (01/11, lot J 2 bis — compte de Nico, 2.9.144) LE DERNIER RELEVÉ RÉUSSI, QUEL QUE SOIT SON DÉCLENCHEUR ──
// Vinted et eBay disaient « synchronisé le 29/10 » (dernier appui sur le bouton) alors que le relevé quotidien de
// l'extension (Vinted, 30/10 20:05) et celui du serveur par l'API (eBay, 31/10 10:10) avaient réussi depuis : on
// croyait que rien n'était automatique. « Synchronisé il y a… », le détail et le grisage comptent le dernier relevé
// RÉUSSI (cron, veilleur, serveur, API, bouton, app) ; plus récent que la dernière synchro demandée (réussie ou non),
// il fait la plateforme « à jour ». Les pastilles gardent leur état (règle du 05/10).
/**
 * @param {{ phase: string, fini?: unknown, tentative?: unknown }} demandee  la dernière synchro demandée (pastille)
 * @param {unknown} reussi  le dernier relevé réussi, tous déclencheurs (ISO ou ms)
 * @returns {{ phase: string, fini: number | null }}
 */
export function avecDernierReussi({ phase, fini = null, tentative = null } = {}, reussi = null) {
  const r = ms(reussi);
  const f = ms(fini);
  if (!Number.isFinite(r) || phase === 'en_cours') return { phase, fini: Number.isFinite(f) ? f : null };
  const t = ms(tentative);
  const plusRecent = !Number.isFinite(t) || r >= t;
  return { phase: plusRecent && phase !== 'hors_compte' ? 'fait' : phase, fini: Number.isFinite(f) ? Math.max(f, r) : r };
}

/** La phrase courte de la carte, à la place du détail (replié). */
export function texteAutomatique(fr = true) {
  return fr ? 'La synchro et la surveillance des ventes sont automatiques.' : 'Syncing and sales tracking are automatic.';
}

/**
 * L'état du bouton. `plateformes` : [{ p, nom, phase, fini, session, api }] — `phase` celle de la pastille
 * (etatTuile : fait, en_cours, absente, jamais, echec, expire, incomplet, hors_compte), `fini` la fin du dernier relevé
 * réussi (ms ou ISO), `session` le verdict de la sonde ('ok' | 'ko' | null), `api` eBay relié par l'API.
 * @returns {{ grise: boolean, finGriseA: number | null, lignes: Array<{ p: string, texte: string, aJour: boolean }>, connectees: string[] }}
 */
export function etatBoutonSynchro({ plateformes = [], maintenant = Date.now(), enCours = false, stockVideAvecAnnonces = false, fr = true } = {}) {
  const lignes = [];
  const connectees = [];
  let toutesAJour = true;
  let finGriseA = null;
  for (const x of Array.isArray(plateformes) ? plateformes : []) {
    const nom = String(x?.nom ?? x?.p ?? '');
    const phase = String(x?.phase ?? '');
    const fini = ms(x?.fini);
    const jamaisLue = phase === 'absente' || phase === 'jamais';
    const connectee = !jamaisLue || x?.session === 'ok' || x?.api === true;
    if (!connectee) continue;
    connectees.push(String(x.p));
    const aJour = phase === 'fait' && Number.isFinite(fini) && maintenant - fini < SYNCHRO_A_JOUR_MS;
    if (aJour) {
      finGriseA = finGriseA == null ? fini + SYNCHRO_A_JOUR_MS : Math.min(finGriseA, fini + SYNCHRO_A_JOUR_MS);
    } else {
      toutesAJour = false;
    }
    const texte = aJour ? `${nom} ${fr ? 'à jour' : 'up to date'} ${depuisCourt(fini, maintenant, fr)}`
      : phase === 'en_cours' ? `${nom} ${fr ? 'en cours' : 'syncing'}`
      : jamaisLue ? `${nom} ${fr ? 'vient d’être connecté, pas encore synchronisé' : 'just connected, not synced yet'}`
      : Number.isFinite(fini) ? `${nom} ${fr ? 'synchronisé' : 'synced'} ${depuisCourt(fini, maintenant, fr)}`
      : `${nom} ${fr ? 'pas encore synchronisé' : 'not synced yet'}`;
    lignes.push({ p: String(x.p), texte, aJour });
  }
  const grise = !enCours && !stockVideAvecAnnonces && connectees.length > 0 && toutesAJour;
  return { grise, finGriseA: grise ? finGriseA : null, lignes, connectees };
}

/**
 * La prochaine synchro automatique (ms) parmi les plateformes connectées, ou null.
 * `runs` : relevés récents du compte [{ platform, kind, declencheur, status, started_at, finished_at }].
 * @param {Array<Record<string, any>>} runs
 * @param {{ connectees: string[], ebayApi?: boolean, maintenant?: number }} o
 */
export function prochaineSynchroAuto(runs, { connectees = [], ebayApi = false, maintenant = Date.now() } = {}) {
  let plusProche = null;
  for (const p of connectees) {
    const siens = (Array.isArray(runs) ? runs : []).filter((r) => (p === 'vinted'
      ? String(r?.kind) === 'dressing'
      : String(r?.kind) === 'annonces' && String(r?.platform) === p));
    const finis = siens.filter((r) => r?.status === 'done' || (p !== 'vinted' && r?.status === 'incomplete'))
      .map((r) => ms(r.finished_at)).filter(Number.isFinite);
    if (!finis.length) continue;
    const dernierFini = Math.max(...finis);
    let t;
    if (p === 'ebay' && ebayApi) {
      t = dernierFini + PLANCHER_AUTO_MS + RELEVE_EBAY_API_TOUR_MS;
    } else {
      const plancher = Math.max(maintenant, dernierFini + PLANCHER_AUTO_MS);
      const autos = siens.filter((r) => AUTOMATIQUES.has(String(r?.declencheur ?? ''))).map((r) => ms(r.started_at)).filter(Number.isFinite);
      if (autos.length) {
        // L'alarme retombe toutes les 24 h à l'heure du dernier relevé automatique : le premier tir après le plancher.
        const phase = Math.max(...autos);
        const k = Math.max(0, Math.ceil((plancher - phase) / ALARME_AUTO_MS));
        t = phase + k * ALARME_AUTO_MS;
      } else {
        t = plancher;
      }
    }
    if (t < maintenant) t = maintenant;
    plusProche = plusProche == null ? t : Math.min(plusProche, t);
  }
  return plusProche;
}

/** « vers 14 h » (heure de Paris, à l'heure ronde la plus proche) ; « vers 14 h demain » au-delà d'aujourd'hui. */
export function texteVersHeure(t, maintenant = Date.now(), fr = true) {
  if (!Number.isFinite(t)) return null;
  const arrondi = Math.round(t / 3600_000) * 3600_000;
  const heure = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(new Date(arrondi)).find((x) => x.type === 'hour')?.value);
  const jour = (x) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(x));
  const demain = jour(arrondi) !== jour(maintenant);
  if (!fr) return `around ${heure}:00${demain ? ' tomorrow' : ''}`;
  return `vers ${heure} h${demain ? ' demain' : ''}`; // estimation-ok: l'heure du prochain relevé automatique, demandée par Nico (lot J 2, 31/10)
}

/** La phrase du bouton grisé. */
export function texteToutAJour(prochaine, maintenant = Date.now(), fr = true) {
  const vers = texteVersHeure(prochaine, maintenant, fr);
  if (fr) return vers ? `Tout est à jour, prochaine synchro automatique ${vers}` : 'Tout est à jour';
  return vers ? `Everything is up to date, next automatic sync ${vers}` : 'Everything is up to date';
}
