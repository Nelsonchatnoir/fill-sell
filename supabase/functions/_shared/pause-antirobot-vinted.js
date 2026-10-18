// ═══════════════════════════════════════════════════════════════════════════
// PAUSE ANTI-ROBOT VINTED SUR LES LECTURES DE SA PROPRE BOUTIQUE (18/10, lot 5)
// ═══════════════════════════════════════════════════════════════════════════
// Constat (hu.anastasia, 14/10 → 18/10) : chaque republication servie bute sur
// la LECTURE de l'annonce (capture, HTTP 403 « protection anti-robot ») alors
// que la sonde du compte (users/current) répond 200. La pause du compte
// (get-pending-jobs) exigeait une sonde 403 : elle ne se posait jamais, et le
// serveur servait l'article SUIVANT, qui prenait un 403 à son tour — sept
// articles refusés en deux passages, plus rien republié depuis le 14/10. Le
// « on se calme 45 min » de l'extension n'espace que l'article, jamais le compte.
//
// LA RÈGLE : au moins DEUX articles distincts de SA boutique (garde de boutique
// « boutique_ok » : l'annonce lue est bien celle du compte connecté) refusés par
// l'anti-robot APRÈS le dernier succès Vinted suffisent, même sonde à 200, à
// mettre en pause les REPUBLICATIONS Vinted qui doivent encore lire leur annonce
// (toute étape sauf « deleted ») — une seule sonde toutes les 45 min, comme la
// pause du compte. Le reste passe : retraits, recréations déjà commencées,
// publications, autres plateformes. Un refus sur une AUTRE boutique ne compte
// pas (remialbertholl, 24/09) ; ni un refus faute de session (cause403
// « session_absente » : c'est une connexion à refaire, pas un anti-robot).
// Sortie inchangée : un succès Vinted postérieur aux refus lève la pause.
// Pas de passage « à toi de jouer » au bout de 6 h dans ce cas : la sonde du
// compte voit Vinted vivant, handler-watch relancerait aussitôt (boucle).
// ES module sans import (Deno + node).

export const ANTIROBOT_LECTURES_MSG =
  "Vinted refuse la lecture de tes annonces (vérification anti-robot) : tes republications Vinted sont en pause, rien n'a été touché. " +
  "Ouvre une de tes annonces sur Vinted dans ton navigateur et passe la vérification si elle s'affiche — tout repartira seul. " +
  "Tes retraits, tes nouvelles annonces et tes autres plateformes continuent normalement.";

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v)) ? v : null;

/** Le refus d'un job porte-t-il sur SA boutique (garde « boutique_ok »), hors session absente ? */
export function refusSurSaBoutique(platformFields) {
  const pf = objet(platformFields) ?? {};
  const ce = objet(pf.capture_echec);
  if (ce && String(ce.cause403 ?? "") === "session_absente") return false;
  const gb = objet(objet(pf.gardes)?.garde_boutique);
  if (!gb) return false;
  if (String(gb.verdict ?? "") === "boutique_ok") return true;
  const a = String(gb.boutique_article ?? "").trim();
  const c = String(gb.boutique_connectee ?? "").trim();
  return Boolean(a) && a === c;
}

/** Un job retenu par la pause « lectures » : une republication Vinted qui doit encore lire son annonce. */
export function retenuParPauseLectures(job) {
  if (!job || job.platform !== "vinted" || job.action !== "republish") return false;
  const pf = objet(job.platform_fields) ?? {};
  return String(pf.republish_step ?? "") !== "deleted";
}

/**
 * Le signal : `obs` = [{ article, at, saBoutique }] (refus anti-robot dans
 * l'onglet), `dernierSucces` (ms). Rend { pause, articles } — pause = au moins
 * deux articles distincts de sa boutique refusés après le dernier succès.
 */
export function signalPauseLectures(obs, dernierSucces) {
  const apres = (Array.isArray(obs) ? obs : []).filter((o) => o && o.saBoutique === true && Number(o.at) > Number(dernierSucces));
  const articles = new Set(apres.map((o) => String(o.article))).size;
  return { pause: articles >= 2, articles };
}
