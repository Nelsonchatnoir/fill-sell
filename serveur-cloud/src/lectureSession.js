// (21/11/2026 midi, points 1 et 2 de Nico — Muriel 0c97dc8b, fausses alertes « reconnecte-toi ») LA SESSION LUE SUR LA VRAIE
// PLATEFORME, SUR LE MOMENT.
//
// Le cas de Muriel (20/11 16:56 → 21/11 01:12, 14 essais Leboncoin « abandonnés ») : à 8 essais, le cookie de connexion
// Leboncoin (__Secure-Login) était posé et l'extension du même navigateur lisait ses 20 commandes (23:13:30) — la session
// MARCHAIT. Mais la page de connexion restait hors de www.leboncoin.fr (une étape d'auth.leboncoin.fr) : la lecture du compte
// de « Me connecter » ne lit que dans CETTE page (« hors_site »), la connexion n'était jamais reconnue, et à la fermeture la
// session valide était EFFACÉE du profil (« sessions_purgees », 10 à 20 cookies à chaque fois).
// Le même défaut, à l'envers : « reconnecte-toi » dit sur un cookie absent ou une lecture faite trop tôt (le jeton « luat » de
// Leboncoin n'est reposé par la page qu'une seconde après son chargement), sans jamais demander à la plateforme.
//
// LA RÈGLE (toutes les plateformes, tous les comptes) : une page DE FOND du même navigateur ouvre une page du compte sur le
// site de la plateforme (la page fait elle-même ses requêtes, comme une visite normale), attend qu'elle ait posé sa session,
// et lit le compte par la lecture de « Me connecter » (plateformes.js, LECTURES_COMPTE). Trois issues, jamais devinées :
//   · « ok »         : 200 et un compte lu — la session marche ;
//   · « perdue »     : la plateforme dit qu'il n'y a pas de session (aucun jeton au bout de l'attente, 401, page de connexion
//                      de la plateforme à la place de la page du compte) ;
//   · « incertaine » : tout le reste (anti-robot, réseau, page qui ne charge pas) — on ne conclut RIEN.
// Rien ne sort de la page : l'état HTTP et la présence d'un identifiant, jamais un jeton ni un courriel. Aucun mot de passe,
// aucune saisie, aucun clic. Une lecture par compte et par plateforme à la fois, au plus une toutes les 2 min (sauf forcée).
import { DEFINITIONS, EXPRESSION_ETAT_PAGE, expressionLectureCompte, verdictLectureCompte, pageDeResolution } from './plateformes.js';

export const LECTURE_SESSION_ATTENTE_MS = 20_000;
export const LECTURE_SESSION_PAS_MS = 1_000;
export const LECTURE_SESSION_ECART_MS = 2 * 60_000;
/** Hors du site, sur la plateforme (page de connexion d'auth.leboncoin.fr…) : stable aussi longtemps = « perdue ». */
export const HORS_SITE_STABLE_MS = 4_000;
const MOTIFS_SANS_SESSION = Object.freeze(['sans_jeton', 'sans_session', 'anonyme']);

/**
 * Le verdict d'UN relevé de la page de fond (pure : testée). `etat` : EXPRESSION_ETAT_PAGE ; `lu` : la lecture du compte
 * (ou null si elle n'a pas été faite) ; `horsSiteDepuis` : depuis quand la page est hors du site (ms) ; `fin` : l'attente est
 * finie. Rend { issue: 'ok'|'perdue'|'incertaine'|null (on continue), motif, http }.
 */
export function verdictReleve(plateforme, { etat, lu, horsSiteDepuis = null, fin = false, maintenant = Date.now() }) {
  const def = DEFINITIONS[plateforme];
  if (!def) return { issue: 'incertaine', motif: 'plateforme_inconnue', http: 0 };
  if (etat && (etat.bloque || etat.restreint || etat.captcha)) return { issue: 'incertaine', motif: 'anti_robot', http: 0 };
  if (etat && etat.pret && etat.hote && etat.hote !== def.hoteSite) {
    // Renvoyée hors du site : sur la plateforme elle-même (sa page de connexion), c'est qu'il n'y a plus de session.
    const surLaPlateforme = def.domaine.test(String(etat.hote));
    if (surLaPlateforme && horsSiteDepuis != null && maintenant - horsSiteDepuis >= HORS_SITE_STABLE_MS) {
      return { issue: 'perdue', motif: 'page_de_connexion', http: 0 };
    }
    return fin ? { issue: surLaPlateforme ? 'perdue' : 'incertaine', motif: surLaPlateforme ? 'page_de_connexion' : 'hors_site', http: 0 } : { issue: null };
  }
  if (lu) {
    const v = verdictLectureCompte(lu);
    if (v.ok) return { issue: 'ok', motif: null, http: v.http };
    const sansSession = MOTIFS_SANS_SESSION.includes(v.motif) || v.http === 401;
    // Le jeton de la page arrive une seconde après son chargement (Leboncoin « luat ») : on attend la fin avant de conclure.
    if (fin) return { issue: sansSession ? 'perdue' : 'incertaine', motif: v.motif ?? `http_${v.http}`, http: v.http };
    return { issue: null, motif: v.motif, http: v.http };
  }
  return fin ? { issue: 'incertaine', motif: 'page_non_chargee', http: 0 } : { issue: null };
}

export function creerLectureSession({ navigateurs, journal, delais = {} }) {
  const enVol = new Map();
  const dernieres = new Map();
  const attenteMs = delais.attenteMs ?? LECTURE_SESSION_ATTENTE_MS;
  const pasMs = delais.pasMs ?? LECTURE_SESSION_PAS_MS;
  const ecartMs = delais.ecartMs ?? LECTURE_SESSION_ECART_MS;
  const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

  /**
   * La session de `plateforme` du compte, lue sur la plateforme. `raison` : pour le journal ; `forcer` : sans l'écart de 2 min.
   * Rend { issue, motif, http, duree_ms }. Le relais du navigateur laisse passer la plateforme le temps de la lecture si elle
   * était fermée (puis la liste d'avant revient, quoi qu'il arrive : l'appelant rouvre s'il le décide).
   */
  function lire(user, plateforme, { raison = null, forcer = false } = {}) {
    const cle = `${user}:${plateforme}`;
    if (enVol.has(cle)) return enVol.get(cle);
    const d = dernieres.get(cle);
    if (!forcer && d && Date.now() - d.le < ecartMs) return Promise.resolve({ ...d.r, memoire: true });
    const p = lireUneFois(user, plateforme, raison)
      .then((r) => { dernieres.set(cle, { le: Date.now(), r }); return r; })
      .finally(() => enVol.delete(cle));
    enVol.set(cle, p);
    return p;
  }

  async function lireUneFois(user, plateforme, raison) {
    const debut = Date.now();
    const h = navigateurs.ouvert(user);
    const expression = expressionLectureCompte(plateforme);
    if (!h?.cdp || !expression) return { issue: 'incertaine', motif: h ? 'sans_lecture' : 'navigateur_ferme', http: 0, duree_ms: 0 };
    let cible = null, rendre = null, exception = false;
    let r = { issue: 'incertaine', motif: 'page_non_chargee', http: 0 };
    try {
      ({ targetId: cible } = await h.cdp.send('Target.createTarget', { url: 'about:blank', background: true }));
      const { sessionId } = await h.cdp.send('Target.attachToTarget', { targetId: cible, flatten: true });
      // Le relais : la plateforme joignable le temps de la lecture (exception par page du moteur steel, sinon la liste).
      exception = navigateurs.permettreCadre?.(user, cible, plateforme) === true;
      if (!exception && !(h.permises ?? []).includes(plateforme) && typeof navigateurs.permettre === 'function') {
        rendre = [...(h.permises ?? [])];
        await navigateurs.permettre(user, [...rendre, plateforme]);
      }
      await h.cdp.send('Page.enable', {}, sessionId).catch(() => {});
      await h.cdp.send('Page.navigate', { url: pageDeResolution(plateforme) }, sessionId);
      const limite = Date.now() + attenteMs;
      let horsSiteDepuis = null;
      for (;;) {
        await dormir(pasMs);
        const fin = Date.now() >= limite;
        const etat = (await h.cdp.send('Runtime.evaluate', { expression: EXPRESSION_ETAT_PAGE, returnByValue: true }, sessionId).catch(() => null))?.result?.value ?? null;
        const def = DEFINITIONS[plateforme];
        const surSite = etat?.pret && etat.hote === def.hoteSite;
        if (etat?.pret && etat.hote && !surSite) horsSiteDepuis ??= Date.now(); else horsSiteDepuis = null;
        const lu = surSite
          ? (await h.cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId).catch(() => null))?.result?.value ?? null
          : null;
        const v = verdictReleve(plateforme, { etat, lu, horsSiteDepuis, fin });
        if (v.issue) { r = v; break; }
        if (fin) break;
      }
    } catch (e) {
      r = { issue: 'incertaine', motif: 'erreur', http: 0, erreur: String(e?.message ?? e).slice(0, 160) };
    } finally {
      if (cible) {
        if (exception) navigateurs.retirerCadre?.(user, cible);
        await h.cdp.send('Target.closeTarget', { targetId: cible }).catch(() => {});
      }
      if (rendre) await navigateurs.permettre(user, rendre).catch((e) => journal.alerte('lecture_session_relais_non_rendu', { user, plateforme, erreur: e.message }));
    }
    const res = { issue: r.issue, motif: r.motif ?? null, http: r.http ?? 0, duree_ms: Date.now() - debut, ...(r.erreur ? { erreur: r.erreur } : {}) };
    journal.info('lecture_session', { user, plateforme, raison, ...res });
    return res;
  }

  return { lire };
}
