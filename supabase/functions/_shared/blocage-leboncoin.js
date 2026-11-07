// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN RESTREINT L'ACCÈS : TOUT S'ARRÊTE SUR LE COMPTE, PUIS REPRISE PRUDENTE (30/10, urgence Louis)
// ═══════════════════════════════════════════════════════════════════════════
// LE CAS : Louis (Business) a deux comptes FillSell sur le même PC et la même connexion — « Amiral »
// (louis@ttfamily.fr, Brave) et louis-seller@ttfamily.fr (machine virtuelle) — qui lisent la même boutique Leboncoin
// (409 annonces). Refus 403 de Leboncoin à la veille des commandes : Amiral le 28/10 à 21:31, la VM le 29/10 à 05:35,
// Amiral encore le 30/10 à 02:27 ; trois republications en « vérification anti-robot » dès 12:51 ; le 30/10 vers
// 19:12, Leboncoin affiche « Accès temporairement restreint — un robot est sur le même réseau ». Pendant ce temps,
// FillSell continuait : republications, relevés, veille des commandes, sur les DEUX comptes.
//
// LA RÈGLE, tout le parc :
//   1. au PREMIER signe (« Accès temporairement restreint », HTTP 403 de Leboncoin, page anti-robot DataDome) vu par
//      une action ou une lecture Leboncoin du compte, le blocage est posé sur le COMPTE
//      (platform_settings.leboncoin.blocage_acces, via platform_settings_fusionner) ;
//   2. tant qu'il tient, le serveur ne sert PLUS RIEN de Leboncoin à ce compte (publications, republications,
//      retraits, relevés) et le dit aux extensions (blocages.leboncoin) pour qu'elles coupent aussi leurs lectures
//      (veille des commandes, relevé des ventes, liens, lectures de fond) — aucune relance en boucle ;
//   3. l'utilisateur est prévenu en clair, avec le nom de SON navigateur, et la détection des ventes Leboncoin n'est
//      jamais muette : le message dit qu'elle est en pause et ce que ça implique ;
//   4. UN essai au bout de 24 h (ou plus tôt, à la demande de la personne : « Leboncoin remarche ») : une seule action
//      Leboncoin, la plus ancienne. Refusée → blocage prolongé de 24 h. Passée → levée, puis REPRISE PRUDENTE 6 h :
//      une action Leboncoin toutes les 10 min au plus, jamais de rafale ; les lectures de l'extension (ventes)
//      reprennent dès la levée ; la reprise finie, le blocage est rangé (blocage_acces_dernier). Un refus après la
//      levée remet la pause, même délai (31/10, lot J 1). Un poste en machine virtuelle ne fait jamais l'essai ;
//   5. une machine virtuelle (rendu graphique logiciel) ne fait jamais Leboncoin (_shared/poste-virtuel.js).
// (03/11, point 7 — règle de Nico) L'ESSAI DEVIENT UNE VISITE DE CONTRÔLE : un compte en pause depuis le 02/11 16:03 n'avait
// aucun contrôle prévu avant le 03/11 16:22 (24 h), et l'essai prévu était une ACTION (la plus ancienne publication).
// Désormais : toutes les 2 h (ESSAI_APRES_MS), ou à la demande (« Leboncoin remarche »), UNE visite légère — le relevé
// « Mes annonces », lecture seule, posé par le serveur s'il n'y en a pas en file (get-pending-jobs) — jamais une action.
// Passée → levée et reprise prudente (la file repart d'elle-même, une action toutes les 10 min, jamais de rafale) ;
// refusée (signe de blocage dans le relevé) → prochaine visite 2 h plus tard.
// Pur (Deno + Node).

export const CHEMIN_BLOCAGE_LBC = ["leboncoin", "blocage_acces"];
export const ESSAI_APRES_MS = 2 * 3600_000;   // (03/11, point 7) une visite de contrôle toutes les 2 h (24 h avant)
// (05/11 17:20, DÉCISION DE NICO) LA REPRISE PRUDENTE EST SUPPRIMÉE : dès la levée, le compte reprend EXACTEMENT le rythme
// d'un compte jamais mis en pause (ni « une action toutes les 10 min », ni 6 h de reprise). 0 = l'état « reprise » n'existe
// plus : etatBlocageLbc rend « libre » dès leve_le, et get-pending-jobs range le blocage au passage suivant.
export const REPRISE_PRUDENTE_MS = 0;
// (03/11, point 7 — garde-fou de Nico) UNE LECTURE RÉUSSIE NE PROUVE PAS QUE LA PUBLICATION EST DÉBLOQUÉE. Si la visite
// de contrôle passe (levée) mais qu'une action est de nouveau refusée pendant la reprise prudente, c'est une RECHUTE :
// la visite suivante s'espace — 2 h à la première rechute, 6 h à la deuxième, 24 h ensuite — au lieu de reprendre
// toutes les 2 h. Les rechutes repartent de zéro quand une reprise prudente va à son terme (blocage rangé).
export const PALIERS_RECHUTE_MS = [2 * 3600_000, 6 * 3600_000, 24 * 3600_000];
/** Le délai avant la prochaine visite de contrôle d'un blocage (ESSAI_APRES_MS, ou le palier de ses rechutes). */
export function delaiControleLbc(b) {
  const r = Math.max(0, Math.floor(Number(b?.rechutes) || 0));
  return r > 0 ? PALIERS_RECHUTE_MS[Math.min(r, PALIERS_RECHUTE_MS.length) - 1] : ESSAI_APRES_MS;
}
export const ESPACEMENT_REPRISE_MS = 10 * 60_000;
/**
 * (04/11 nuit, règle de Nico — t-shirt Adidas, Leboncoin : retiré 21:54:05, retenu 11 min par la reprise prudente, en
 * ligne 22:07:30) UNE ANNONCE DÉJÀ RETIRÉE (republication à l'étape « deleted ») est redéposée TOUT DE SUITE : la reprise
 * prudente espace les NOUVELLES actions, jamais une remise en ligne. Elle compte comme l'action du moment (la suivante
 * attend ses 10 min après elle). Même règle pour la reprise après restriction Vinted (reprise-apres-restriction.js).
 */
export function annonceDejaRetiree(job) {
  return String(job?.action ?? "") === "republish"
    && String((objet(job?.platform_fields) ?? {}).republish_step ?? "") === "deleted";
}

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

// Ce que nos lecteurs et nos dépôts écrivent quand Leboncoin refuse l'accès (jamais une page de connexion : celle-là
// est une session fermée, son propre mur).
/** @type {Array<{ re: RegExp, nom: string }>} */
const SIGNES = [
  { re: /acc[eè]s temporairement restreint/i, nom: "acces_temporairement_restreint" },
  { re: /un robot est sur le m[eê]me r[ée]seau/i, nom: "robot_meme_reseau" },
  { re: /\bhttp[_ ]?403\b|\bHTTP 403\b|\bstatus(?:Code)?\W{0,3}403\b|\b403 Forbidden\b/i, nom: "http_403" },
  { re: /captcha-delivery|datadome/i, nom: "datadome" },
  { re: /v[ée]rification anti-?robot|CHALLENGE DATADOME|r[ée]soudre la v[ée]rification/i, nom: "verification_antirobot" },
];

/** Le signe de blocage d'un texte (erreur d'un job, motif d'une lecture), ou null.
 * @param {unknown} texte
 * @returns {string | null} */
export function signeBlocageLbc(texte) {
  const t = String(texte ?? "");
  if (!t) return null;
  for (const s of SIGNES) if (s.re.test(t)) return s.nom;
  return null;
}

// ── (07/11 soir, Goulvenk — tout le parc) UNE SESSION FERMÉE N'EST JAMAIS UNE RESTRICTION ─────────────────────────────
// Goulvenk (Pro) : session Leboncoin fermée dans son Chrome le 06/11 vers 00:25 (relevé des ventes « compte_absent_de_la_page »),
// veille des commandes en 403 à 01:33 (le jeton de la page, une heure après) → pause « restriction » ; puis 9 visites de
// contrôle en 26 h, toutes « session leboncoin : page de connexion », et ses tâches affichaient « En pause : nouvel essai
// automatique, rien à faire » pendant que rien ne pouvait repartir sans lui ; sa synchro de 18:10 restait « queued » ;
// revu connecté à 19:11, la visite n'est partie qu'à 19:40 (lue 17/17, pause levée à 19:42). LA RÈGLE :
//   1. un texte qui dit le mur de CONNEXION (page de connexion vue par l'onglet, « Connexion Leboncoin requise »…) n'est
//      jamais une preuve de restriction par un simple 403 : avec une session fermée, l'API refuse le jeton périmé de la
//      page en 403. Seuls les signes vus SUR LA PAGE (anti-robot, « Accès temporairement restreint ») restent des signes ;
//   2. une pause dont la dernière visite a vu la page de connexion (signe « session_fermee ») passe par le circuit
//      CONNEXION : tâches « En attente de ta connexion à Leboncoin… » (À toi de jouer), jamais « nouvel essai automatique » ;
//   3. elle ne dure jamais contre une preuve : un relevé Leboncoin lu en entier ou un dépôt Leboncoin réussi APRÈS la
//      dernière preuve la LÈVE (contrePreuvePauseLbc) ; le compte revu connecté par l'extension après la dernière visite
//      rend la visite de contrôle due TOUT DE SUITE (une toutes les 30 min au plus : jamais de rafale) ;
//   4. une synchro Leboncoin demandée par la personne pendant la pause EST la visite de contrôle (lecture seule) : elle
//      part au passage suivant, jamais muette en file.
export const SIGNE_SESSION_FERMEE = "session_fermee";
export const ESSAI_SUR_PREUVE_MIN_MS = 30 * 60_000;
// Le mur de connexion écrit par NOS lecteurs et handlers (relevé, garde de dépôt, attente de session) — jamais un texte
// de Leboncoin deviné.
const MUR_CONNEXION_LBC_RE = /page de connexion|renvoie vers la connexion|non renouvel[ée] \(session_fermee\)|Connexion Leboncoin requise|En attente de ta connexion à Leboncoin|mur de connexion/i;
/** Le texte dit-il le mur de connexion de Leboncoin (session fermée) ? @param {unknown} texte */
export function murConnexionLbc(texte) {
  return MUR_CONNEXION_LBC_RE.test(String(texte ?? ""));
}
/** Le signe de blocage d'un texte qui peut dire le mur de connexion : un 403 à côté de la page de connexion est le jeton
 *  périmé d'une session fermée, jamais une restriction (règle 1) ; les signes vus sur la page restent.
 * @param {unknown} texte @returns {string | null} */
export function signeBlocageHorsConnexionLbc(texte) {
  const signe = signeBlocageLbc(texte);
  if (signe === "http_403" && murConnexionLbc(texte)) return null;
  return signe;
}
/** La pause tient-elle sur une session fermée (dernière visite : page de connexion) ? */
export function blocageSessionFermee(b) {
  return !!b && typeof b === "object" && !b.leve_le && String(b.signe ?? "") === SIGNE_SESSION_FERMEE;
}
/**
 * (règle 3) Une preuve que Leboncoin répond APRÈS la dernière preuve de la pause : { par, le } ou null.
 * @param {any} b le blocage (blocage_acces)
 * @param {{ releveReussiLe?: string | null, depotReussiLe?: string | null }} o — fin du dernier relevé Leboncoin lu en
 *   entier (done, pas « [incomplet] »), date du dernier dépôt Leboncoin publié par l'extension
 */
export function contrePreuvePauseLbc(b, { releveReussiLe = null, depotReussiLe = null } = {}) {
  if (!b || typeof b !== "object" || b.leve_le) return null;
  const borne = ms(b.derniere_preuve) || ms(b.depuis);
  if (!Number.isFinite(borne)) return null;
  const r = ms(releveReussiLe), d = ms(depotReussiLe);
  if (Number.isFinite(r) && r > borne) return { par: "relevé Leboncoin lu en entier après la pause", le: new Date(r).toISOString() };
  if (Number.isFinite(d) && d > borne) return { par: "dépôt Leboncoin réussi après la pause", le: new Date(d).toISOString() };
  return null;
}
/** (règle 3) L'heure où l'extension a revu le compte Leboncoin connecté (extension_sessions), ou null. */
export function sessionLbcRevueLe(sessions) {
  const s = objet(sessions);
  if (!s || s.leboncoin !== true) return null;
  const le = ms(objet(s.checked_at_par_plateforme)?.leboncoin ?? s.checked_at);
  return Number.isFinite(le) ? new Date(le).toISOString() : null;
}

// (05/11, point 19 — 25caeedd) LA VISITE DE CONTRÔLE REND TOUJOURS UN VERDICT. Une visite finie sans liste (« Mes annonces »
// n'a pas rendu sa liste, jeton non renouvelé, page de connexion) et sans signe connu laissait l'essai OUVERT : le compteur
// n'avançait pas, et quand la session Leboncoin était fermée, la pause ne pouvait jamais se lever et rien ne disait
// « reconnecte-toi ». Désormais : lue en entier → passée ; un signe de blocage → refusée (ce signe) ; finie autrement
// (failed / absente / expired) → refusée, signe « session_fermee » si le texte dit la connexion, sinon « visite_sans_liste ».
export const SESSION_FERMEE_LBC_RE = /page de connexion|renvoie vers la connexion|jeton non renouvel|jeton_non_rendu|aucune session leboncoin/i;
/** @param {unknown} statut @param {unknown} texte @returns {{ verdict: "passe" | "refuse" | null, signe?: string }} */
export function verdictVisiteControleLbc(statut, texte) {
  const st = String(statut ?? ""), t = String(texte ?? "");
  if (st === "done" && !/\[incomplet\]/.test(t)) return { verdict: "passe" };
  // (07/11 soir, règle 1) La page de connexion vue par la visite bat un 403 de ses relances (jeton périmé).
  const signe = signeBlocageHorsConnexionLbc(t);
  if (signe) return { verdict: "refuse", signe };
  if (["done", "failed", "absente", "expired"].includes(st)) return { verdict: "refuse", signe: SESSION_FERMEE_LBC_RE.test(t) ? "session_fermee" : "visite_sans_liste" };
  return { verdict: null };   // en file, en cours : on attend
}

/** Le blocage posé sur le compte (platform_settings), ou null. */
export function blocageLbc(ps) {
  const lbc = objet(objet(ps)?.leboncoin);
  return objet(lbc?.blocage_acces);
}

/**
 * L'état Leboncoin du compte à cet instant :
 *   « libre » | « bloque » (rien ne part) | « essai » (une seule action peut partir) | « reprise » (une action toutes
 *   les 10 min au plus).
 */
// (07/11 soir, règles 3 et 4) `o` (facultatif, get-pending-jobs) : { synchroDemandee: une synchro Leboncoin de la
// personne attend en file — elle EST la visite ; sessionRevueLe: l'extension a revu le compte connecté à cette heure }.
// Rendu « essai » + `par` (« synchro_demandee » | « session_revue ») ; sans `o`, à l'identique d'avant.
export function etatBlocageLbc(ps, maintenant = Date.now(), o = {}) {
  const b = blocageLbc(ps);
  if (!b) return { etat: "libre", blocage: null };
  const leve = ms(b.leve_le);
  if (Number.isFinite(leve)) {
    if (maintenant - leve < REPRISE_PRUDENTE_MS) {
      const derniere = ms(b.derniere_action_reprise);
      const prete = !Number.isFinite(derniere) || maintenant - derniere >= ESPACEMENT_REPRISE_MS;
      return { etat: "reprise", blocage: b, prete };
    }
    return { etat: "libre", blocage: b };
  }
  const essai = objet(b.essai);
  if (essai && !essai.issue) {
    // Un essai déjà servi attend son résultat ; sans résultat au bout de 2 h, il compte pour un refus muet : la
    // prochaine visite de contrôle vient ESSAI_APRES_MS après lui.
    const le = ms(essai.le);
    if (Number.isFinite(le) && maintenant - le < 2 * 3600_000) return { etat: "bloque", blocage: b, essai_en_cours: true };
    const prochain = (Number.isFinite(le) ? le : maintenant) + delaiControleLbc(b);
    const demandeApres = ms(b.essai_demande_le);
    if (maintenant >= prochain || (Number.isFinite(demandeApres) && Number.isFinite(le) && demandeApres > le)) return { etat: "essai", blocage: b };
    // (07/11 soir, règle 4) Visite servie jamais prise depuis 2 h : la synchro de la personne la remplace.
    if (o?.synchroDemandee === true) return { etat: "essai", blocage: b, par: "synchro_demandee" };
    return { etat: "bloque", blocage: b };
  }
  const essaiApres = ms(b.essai_apres) || (ms(b.depuis) + delaiControleLbc(b));
  const demande = ms(b.essai_demande_le);
  if ((Number.isFinite(essaiApres) && maintenant >= essaiApres) || (Number.isFinite(demande) && demande > (ms(b.derniere_preuve) || 0))) {
    return { etat: "essai", blocage: b };
  }
  // (07/11 soir, règle 4) La synchro demandée par la personne pendant la pause part : elle EST la visite (lecture seule).
  // Une fois servie, elle n'est plus en file : une demande = une visite, jamais une boucle.
  if (o?.synchroDemandee === true) return { etat: "essai", blocage: b, par: "synchro_demandee" };
  // (07/11 soir, règle 3) Pause sur une session fermée, compte revu connecté APRÈS la dernière visite refusée : la visite
  // est due tout de suite — 30 min au moins après la précédente (jamais de rafale sur un « connecté » qui ment).
  const revue = ms(o?.sessionRevueLe);
  if (blocageSessionFermee(b) && Number.isFinite(revue) && revue > (ms(b.derniere_preuve) || ms(b.depuis) || 0)
      && maintenant - (ms(essai?.le) || 0) >= ESSAI_SUR_PREUVE_MIN_MS) {
    return { etat: "essai", blocage: b, par: "session_revue" };
  }
  return { etat: "bloque", blocage: b };
}

/** Le blocage après un signe vu (posé, ou prolongé jusqu'à la prochaine visite de contrôle).
 * @param {any} ps
 * @param {{ signe: string, source: string, detail?: string | null, maintenant?: string }} o */
export function blocagePose(ps, { signe, source, detail = null, maintenant = new Date().toISOString() }) {
  const avant = blocageLbc(ps);
  const actif = avant && !avant.leve_le;
  // Refusé pendant la reprise prudente (blocage levé encore présent) : une rechute de plus ; encore bloqué : les mêmes.
  const rechutes = avant?.leve_le ? (Number(avant.rechutes) || 0) + 1 : actif ? Number(avant.rechutes) || 0 : 0;
  return {
    depuis: actif ? avant.depuis : maintenant,
    derniere_preuve: maintenant,
    signe,
    source,
    ...(detail ? { detail: String(detail).slice(0, 240) } : {}),
    preuves: Math.min(99, (actif ? Number(avant.preuves) || 0 : 0) + 1),
    essai_apres: new Date(Date.parse(maintenant) + delaiControleLbc({ rechutes })).toISOString(),
    ...(actif && avant.essais ? { essais: avant.essais } : {}),
    ...(rechutes > 0 ? { rechutes: Math.min(99, rechutes) } : {}),
  };
}

/** Le blocage après un essai réussi : levé, reprise prudente. */
export function blocageLeve(b, { par, maintenant = new Date().toISOString() }) {
  return { ...(objet(b) ?? {}), leve_le: maintenant, leve_par: par, essai: { ...(objet(b?.essai) ?? {}), issue: "passe", fin_le: maintenant } };
}

// ── (31/10, lot J 1) UN REFUS APRÈS LA LEVÉE REMET VRAIMENT LA PAUSE ──
// platform_settings_fusionner FUSIONNE l'objet visé (avant || patch) : le blocage neuf de blocagePose, posé sur un
// blocage levé, gardait leve_le / essai « passe » de l'ancien → l'état restait « reprise » puis « libre », la pause ne
// se remettait jamais (Louis, levé le 31/10 à 19:40). Les clés de l'ancien blocage absentes du neuf sont retirées
// (p_supprimer) ; un blocage encore actif garde les siennes (son essai en cours attend son verdict).
/** Les clés à retirer en posant `nouveau` (blocagePose) sur le blocage du compte.
 * @param {any} ps
 * @param {Record<string, unknown>} nouveau
 * @returns {string[]} */
export function clesARetirerAuBlocage(ps, nouveau) {
  const avant = blocageLbc(ps);
  if (!avant || !avant.leve_le) return [];
  return Object.keys(avant).filter((k) => !(k in (objet(nouveau) ?? {})));
}

/** Les lectures que l'extension lance d'elle-même (veille des commandes, relevé des ventes, liens manquants)
 * s'arrêtent-elles ? Pendant la pause et l'essai, oui ; dès l'essai réussi (reprise prudente), non : les ventes
 * Leboncoin sont de nouveau surveillées, et seules les ACTIONS restent espacées par le serveur (31/10, lot J 1). */
export function lecturesExtensionEnPause(etat) {
  return etat === "bloque" || etat === "essai";
}

/** La reprise prudente finie, le blocage quitte `blocage_acces` (clé présente = pause ou reprise, jamais une pause
 * finie) et reste lisible dans `blocage_acces_dernier`. Le patch de platform_settings_fusionner sur ["leboncoin"].
 * @param {any} b
 * @param {{ maintenant?: string }} [o] */
export function blocageArchive(b, { maintenant = new Date().toISOString() } = {}) {
  return { patch: { blocage_acces_dernier: { ...(objet(b) ?? {}), clos_le: maintenant } }, supprimer: ["blocage_acces"] };
}

/** (03/11, point 7) La tête du message dit CE QUE Leboncoin a montré (signe du blocage) — jamais « Accès temporairement
 *  restreint » pour une vérification anti-robot ou un refus 403 (02/11 : DataDome, le message disait « restreint »). */
function teteBlocageLbc(signe, quand) {
  if (signe === "session_fermee") return `Leboncoin ne montre plus ta liste d'annonces sur ta connexion${quand} : ta session Leboncoin semble fermée`;
  if (signe === "visite_sans_liste") return `Leboncoin n'a pas rendu ta liste d'annonces à la dernière vérification${quand}`;
  if (signe === "datadome" || signe === "verification_antirobot") {
    return `Leboncoin affiche une vérification anti-robot sur ta connexion${quand}`;
  }
  if (signe === "http_403") return `Leboncoin refuse l'accès sur ta connexion${quand} (erreur 403)`;
  return `Leboncoin restreint l'accès sur ta connexion${quand} (« Accès temporairement restreint »)`;
}

/** Le texte que voit la personne (job retenu, bandeau). `nav` : nom court sûr du navigateur, sinon null.
 * @param {string | null} [nav]
 * @param {string | null} [depuisIso]
 * @param {string | null} [signe] — le signe du blocage (datadome, http_403…), pour dire ce que Leboncoin a montré */
export function messageBlocageLbc(nav = null, depuisIso = null, signe = null) {
  const dans = ["Chrome", "Brave", "Edge", "Opera"].includes(String(nav ?? "")) ? `dans ${nav}` : "dans ton navigateur";
  const t = ms(depuisIso);
  const quand = Number.isFinite(t)
    ? ` depuis le ${new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" })} à ${new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })}`
    : "";
  return `${teteBlocageLbc(signe, quand)} : FillSell a mis en pause ` +
    "TOUTES ses actions Leboncoin sur ton compte — publications, republications, retraits, relevés et détection des ventes — " +
    "pour ne pas aggraver le blocage. Rien n'a été touché. Tant que la pause dure, une vente Leboncoin n'est pas vue par " +
    "FillSell et une annonce Leboncoin d'un article vendu ailleurs n'est pas retirée : fais-le toi-même sur Leboncoin. " +
    (signe === "session_fermee"
      ? `Ouvre leboncoin.fr ${dans} et connecte-toi à ton compte Leboncoin, puis appuie sur « Leboncoin remarche » dans FillSell `
      : `Ouvre leboncoin.fr ${dans} : quand la page s'affiche normalement, appuie sur « Leboncoin remarche » dans FillSell `) +
    "(sinon FillSell revérifie lui-même de temps en temps, par une simple lecture, sans rien publier), et la reprise se fera doucement.";
}

/** Le patch platform_settings d'un essai servi (une seule action). */
export function blocageAvecEssai(b, { jobId, maintenant = new Date().toISOString() }) {
  return { ...(objet(b) ?? {}), essai: { job_id: String(jobId), le: maintenant }, essais: Math.min(99, (Number(b?.essais) || 0) + 1) };
}

/** Le patch platform_settings d'un essai refusé : bloqué jusqu'à la prochaine visite de contrôle (ESSAI_APRES_MS).
 * @param {any} b
 * @param {{ signe?: string | null, maintenant?: string }} o */
export function blocageEssaiRefuse(b, { signe, maintenant = new Date().toISOString() }) {
  return { ...(objet(b) ?? {}), derniere_preuve: maintenant, signe: signe ?? b?.signe ?? null,
    essai_apres: new Date(Date.parse(maintenant) + delaiControleLbc(b)).toISOString(),
    essai: { ...(objet(b?.essai) ?? {}), issue: "refuse", fin_le: maintenant } };
}
