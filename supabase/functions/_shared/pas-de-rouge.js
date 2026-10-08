// ═══════════════════════════════════════════════════════════════════════════
// PAS DE ROUGE — TROIS SORTIES, JAMAIS UNE QUATRIÈME (2026-09-22)
// ═══════════════════════════════════════════════════════════════════════════
// Demande de Nico, mot pour mot : « plus jamais de rouge chez l'utilisateur ».
// Ce qui est acceptable, et RIEN d'autre :
//   · REPRISE — le défaut est chez nous : on relance nous-mêmes, la personne
//     n'a rien à faire et on ne lui demande rien ;
//   · À TOI — il y a un geste PRÉCIS et faisable : un champ à choisir dans une
//     liste, un bouton « Me connecter », un bouton « Autoriser ». Jamais un
//     « à toi de jouer » sans quoi jouer ;
//   · INFO — la plateforme ne sait pas faire, il n'y a rien à tenter : on le
//     dit en une phrase neutre et on CLÔT le job.
//
// ⛔ CE MODULE NE DEVINE RIEN, et surtout il ne DÉGUISE rien. Un défaut de chez
//    nous ne devient jamais une « limite de la plateforme » : il devient une
//    REPRISE. La seule chose qu'on retire à la personne, c'est le rouge et le
//    vocabulaire de développeur — jamais la vérité sur ce qui s'est passé.
//
// ⛔ LE MOTIF DÉCIDE, PAS LE STATUT. On classe sur le texte BRUT envoyé par le
//    handler (celui qui porte la signature) et, à défaut, sur le texte déjà
//    réécrit. Un motif inconnu n'est PAS un échec : c'est une reprise tant
//    qu'il reste du budget, puis un « relancer » ambre. Le rouge n'est jamais
//    une sortie de cette fonction.
//
// ⛔ LES ANCRES DE CONNEXION SONT COPIÉES DE personne. Les textes « Connexion
//    <Plateforme> requise » et « REAUTH VENTE eBay » sont lus À L'IDENTIQUE
//    par trois lecteurs déjà en place — MUR_CONNEXION_ANCRE (StockTab, qui
//    pose le bouton « Me connecter »), MUR_CONNEXION (handler-watch, qui
//    relance tout seul dès que la sonde revoit la session) et la relance
//    manuelle. Changer un seul de ces débuts de phrase, c'est offrir un bouton
//    que personne ne relancera. Le selftest les vérifie mot pour mot.

/**
 *  {"reprise"|"a_toi"|"info"} Verdict
 *  {Object} Sortie
 *  {Verdict} verdict
 *  {"pending"|"needs_user"|"cancelled"} statut  jamais "failed"
 *  {string} message   tutoiement, aucun terme de développeur
 *  {string} motif     nom interne, journal et selftest, jamais l'écran
 *  {string} [source]  marqueur needs_user_source (pilote le bouton)
 *  {number} [dansMinutes] délai avant reprise (pose next_action_after)
 *  {Object} [champ]   champ à faire choisir, avec sa liste fermée
 */

import { autorisationOplaRequise, connexionOplaRequise, cookiesOplaTropVolumineux } from "./textes-jobs.ts";
import { lectureRefusBeebs, taillesCompatibles } from "./beebs-refus-formulaire.js";
import { BUILD_COLIS_DANS_ENVOI, refusColisVinted, colisEnvoyeEtRefuse, messageColisAttendMiseAJour, messageColisRefuseMemeEnvoye, posteAvecEnvoiColis, messageColisNonAfficheParLaPage } from "./vinted-colis.js";

const NOM = {
  vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla", depop: "Depop",
};

/** « la publication » / « la republication » / « le retrait ». */
function acte(action) {
  if (action === "republish") return "la republication";
  if (action === "delete") return "le retrait";
  return "la publication";
}

/** (05/10) Un retrait bloqué : l'article est vendu, l'annonce encore en ligne. */
function risqueRetrait(action, nom) {
  return action === "delete"
    ? ` Ton article est vendu mais son annonce est encore en ligne sur ${nom} (risque de double vente).`
    : "";
}

// ── LES MOTIFS, DANS L'ORDRE OÙ ILS SONT ESSAYÉS ───────────────────────────
// Le premier qui reconnaît gagne. Les plus spécifiques d'abord : un message
// peut porter deux signatures (« Failed to fetch » DANS une republication mise
// en pause), et c'est la plus précise qui doit parler.

/** Rien n'a bougé chez la plateforme : le canal, l'onglet ou le réseau a lâché. */
const CANAL_RE =
  /Could not establish connection|Receiving end does not exist|The message port closed|message channel closed|A listener indicated an asynchronous response|No tab with id|Onglet de travail ferm|onglet navigué\/rechargé|pas de réponse du content script|sonde injoignable|onglet de travail Vinted\s*:|Timeout\s*:|Failed to fetch|NetworkError|Load failed|ERR_[A-Z_]+|L'opération n'a pas pu aboutir sur ton ordinateur|mise en veille par Chrome/i;

/** Notre serveur ou celui d'en face a hoqueté : 5xx, 429, 408. */
const SERVEUR_RE = /HTTP\s*(?:5\d\d|429|408)\b|\b(?:502|503|504|520|522|524)\b\s*$/i;

/** L'anti-robot de la plateforme, jamais la faute de la personne. */
const ANTIROBOT_RE = /CHALLENGE|anti-?robot|access_denied|DataDome|protection anti-robot/i;

/** Les photos ne sont pas arrivées : c'est notre dépôt qui a lâché, pas l'annonce. */
const PHOTOS_RE = /photos? ne sont pas arriv|\d+\/\d+\s*confirmée?\(?s?\)?\s*après|URL\s*pr[ée]sign[ée]e|presigned/i;

/** Le panneau de catégorie de Leboncoin n'a pas fini de se peindre. */
const PANNEAU_RE = /panneau des racines introuvable|panneau de cat[ée]gorie introuvable|racines introuvable/i;

/** Mur de connexion nommé par nos propres handlers (ancres partagées). */
const REAUTH_EBAY_RE = /^REAUTH VENTE eBay|reconnexion de s[ée]curit[ée] pour vendre|page inattendue.*session eBay est valide/i;
const CONNEXION_RE =
  /^Connexion (?:Vinted|Leboncoin|eBay|Beebs|Depop) requise|page de connexion à la place du formulaire|session Vinted refusée|mur de connexion|session (?:expirée|morte|refusée)/i;

/** Opla : ce n'est pas une connexion, c'est la permission d'hôte de l'extension. */
const OPLA_ACCES_RE = /accès à opla\.co a été refusé|permission.*opla\.co|host permission.*opla/i;
/** Opla, session FERMÉE vue par la PAGE : l'ancre écrite par content-scripts/opla.js
 *  (OPLA_MSG_SESSION) quand l'API d'Opla répond 401 dans l'onglet. */
const OPLA_CONNEXION_RE = /^Connexion Opla requise/i;
/** Opla, 494 = REQUEST_HEADER_TOO_LARGE chez Vercel (son hébergeur) : les cookies
 *  du site dans CE Chrome dépassent 16 Ko. Louis, nuit du 23/09, six kits. */
const OPLA_494_RE = /Arbre Opla indisponible \(HTTP 494\)|HTTP 494\b|REQUEST_HEADER_TOO_LARGE/i;
/** Opla, l'onglet a quitté www.opla.co (2026-09-27, carhoa 71df89e9, thomas.vinted590002
 *  840b67ec) : Chrome refuse la réinjection (« Cannot access contents of the page …
 *  must request permission to access the respective host ») et l'onglet devient
 *  illisible. Ce n'est pas un canal coupé : la page est partie ailleurs — le plus
 *  souvent la connexion Opla (cookies __txn_ d'une connexion en cours, aucun __session). */
const OPLA_HORS_HOTE_RE = /Cannot access contents of the page|must request permission to access the respective host|URL illisible \(hors de nos permissions d'h[ôo]te\)/i;
/** Le code posé par noterSessionDeconnectee : une page de connexion RÉELLEMENT vue. */
const HTTP_MUR_OBSERVE = "login_redirect_observee";

/** Leboncoin Pro hors forfait : l'écran de dépôt n'offre que « Valider et payer ». */
const LBC_PAYANT_RE = /ne propose aucune option gratuite|Boostez votre annonce.*Valider et payer|aucun chemin gratuit/i;

/** Beebs n'a aucun rayon pour cet objet — vérifié, pas supposé. */
const BEEBS_RAYON_RE = /n'a pas de rayon reconnu/i;
/** Beebs : son formulaire a refusé l'enregistrement (TypeError de SON serveur, 27/09). */
const BEEBS_ENREGISTREMENT_RE = /Une erreur est survenue lors de l['’]enregistrement de votre annonce/i;

/** Une taille hors de la grille de la plateforme : liste fermée, choix à faire. */
const TAILLE_HORS_GRILLE_RE = /n'appartient pas à la grille/i;
/** Pour update-job-status : un needs_user posé DIRECTEMENT par le pré-vol de
 *  l'extension (Opla, taille hors grille) doit passer par le classement, sinon
 *  la personne lit le message brut du handler (« MEN_TRO_OTHER (14 valeurs :
 *  TAILLE_UNIQUE, XXS… Opla l'accepterait en 200 : on refuse ») — vécu par
 *  josephinecerni le 27/09 (chino homme 44, grille Opla en lettres). */
export function estTailleHorsGrille(texte) {
  return TAILLE_HORS_GRILLE_RE.test(String(texte ?? ""));
}

// ── VINTED A RESTREINT LE COMPTE, AVEC UNE DATE (27/09, nadegemarcelin78) ────
// Cinq republications arrêtées « état de l'annonce non vérifié » : le vrai
// motif dormait dans platform_fields.last_diagnostic — la page
// vinted.fr/listing-restriction, « Compte restreint jusqu'au 26/09/2026 : tu
// ne peux plus ajouter de nouveaux articles ni modifier tes annonces ». Rien à
// faire de son côté, rien à faire du nôtre avant cette date : on le dit, on
// attend la fin de la restriction, et on repart seuls le lendemain.
const RESTRICTION_RE = /Compte restreint jusqu'au (\d{2})\/(\d{2})\/(\d{4})/i;
/**
 * La restriction Vinted lue dans le diagnostic du job, ou null.
 * @returns {{ jusquau: string, fin: number, libelle: string }|null}
 *   `fin` = fin de la journée indiquée (Paris, heure d'été ou d'hiver), en ms.
 */
export function restrictionVinted(pf) {
  const d = pf && typeof pf === "object" && pf.last_diagnostic && typeof pf.last_diagnostic === "object"
    ? pf.last_diagnostic : null;
  if (!d) return null;
  const texte = `${String(d.titre ?? "")}\n${String(d.corps ?? "")}`;
  const m = RESTRICTION_RE.exec(texte);
  if (!m && String(d.signal ?? "") !== "listing_restriction") return null;
  if (!m) return { jusquau: null, fin: null, libelle: String(d.titre ?? "Compte restreint") };
  const [, jj, mm, aaaa] = m;
  // Décalage Paris : +02:00 de fin mars à fin octobre, +01:00 sinon (approché
  // au mois : une heure d'écart sur une reprise à minuit ne change rien).
  const mois = Number(mm);
  const decalage = mois >= 4 && mois <= 10 ? "+02:00" : "+01:00";
  const fin = Date.parse(`${aaaa}-${mm}-${jj}T23:59:59${decalage}`);
  return { jusquau: `${jj}/${mm}`, fin: Number.isFinite(fin) ? fin : null, libelle: m[0] };
}

/** Opla : aucune feuille résolue pour l'article (pré-vol opla_categorie_absente). */
const OPLA_CATEGORIE_ABSENTE_RE = /Aucune catégorie Opla n['’]a été résolue/i;

/** L'annonce n'existe plus en face : ce n'est pas un échec, c'est un fait. */
const DISPARUE_RE = /n'est plus en ligne|annonce introuvable|n'existe plus sur/i;

/** Le chien de garde a arrêté une attente trop longue. */
const VEILLE_RE = /attendait une réponse depuis plusieurs jours/i;

/** (25/09) Le blocage « anti-robot » d'un job est-il CONTREDIT par la sonde ?
 *  Blocage observé depuis au moins 2 h (platform_fields.blocage_antirobot,
 *  posé par l'extension) ET sonde de la plateforme à true, fraîche (< 1 h),
 *  relevée APRÈS le début du blocage. */
function antirobotContreditParLaSonde(pf, sessions, platform) {
  const depuis = Date.parse(String(pf?.blocage_antirobot?.depuis ?? ""));
  if (!Number.isFinite(depuis) || Date.now() - depuis < 2 * 3_600_000) return false;
  if (!sessions || sessions[platform] !== true) return false;
  const brut = sessions?.checked_at_par_plateforme?.[platform] ?? sessions?.checked_at ?? "";
  const vu = Date.parse(String(brut));
  return Number.isFinite(vu) && vu > depuis && Date.now() - vu < 3_600_000;
}

// ══ UN RETRAIT N'EST JAMAIS ARRÊTÉ SUR UN RATÉ TECHNIQUE (04/10, Nico) ═════
// recrutementgroupezk704 (a7dd76cd, Levi's 511) : cinq essais du retrait en
// une soirée, puis « Tu peux la relancer d'un clic » — et l'annonce, vendue
// ailleurs, restait achetable. Règle : un RETRAIT dont l'essai a raté pour une
// raison technique (motif inconnu, attente trop longue) n'attend jamais un
// clic : il repart tout seul, espacé (10 min, 30 min, 1 h, 2 h, puis toutes
// les 3 h), jusqu'à ce qu'il soit fait. Le message dit la vérité : pas encore
// retirée, donc encore en vente. Jamais « deleted » sans la preuve
// (update-job-status), jamais une reprise sur un geste réel (connexion,
// autorisation Opla, refus de Vinted pour CETTE annonce) : ceux-là gardent
// leur bouton.
const MOTIFS_TECHNIQUES_RETRAIT = new Set(["inconnu_relancer", "attente_trop_longue"]);
const DELAIS_RETRAIT_MIN = [10, 30, 60, 120, 180];

export function delaiRepriseRetrait(reprisesFaites) {
  const n = Math.max(0, Number(reprisesFaites) || 0);
  return DELAIS_RETRAIT_MIN[Math.min(n, DELAIS_RETRAIT_MIN.length - 1)];
}

function retraitJamaisArrete(arg, sortie) {
  if (arg?.action !== "delete" || !sortie || sortie.statut !== "needs_user") return sortie;
  if (!MOTIFS_TECHNIQUES_RETRAIT.has(sortie.motif)) return sortie;
  const nom = NOM[arg.platform] ?? arg.platform;
  return {
    verdict: "reprise", statut: "pending", motif: `retrait_${sortie.motif}`,
    dansMinutes: delaiRepriseRetrait(arg.reprises),
    message:
      "Le retrait n'est pas encore fait : l'essai n'a pas abouti de notre côté, et rien n'a été touché. " +
      "FillSell réessaie tout seul, et continuera jusqu'à ce que l'annonce soit retirée. " +
      `Tant que ce n'est pas fait, elle reste en vente sur ${nom} : si tu veux être sûr d'éviter une double vente, ` +
      `retire-la toi-même depuis l'appli ${nom}.`,
  };
}

/**
 * Classe un échec. Rend TOUJOURS une sortie : il n'existe pas de quatrième
 * issue. `essais` est le nombre de tentatives déjà consommées sur ce job.
 * (04/10) Un retrait n'est jamais arrêté sur un raté technique (ci-dessus).
 */
export function classerEchec(arg) {
  return retraitJamaisArrete(arg, classerEchecSansRegleRetrait(arg));
}

function classerEchecSansRegleRetrait(arg) {
  const { platform, action } = arg;
  const nom = NOM[platform] ?? platform;
  const essais = Number(arg.essais ?? 0) || 0;
  const pf = arg.pf ?? {};
  // Le BRUT porte la signature ; le réécrit ne sert que si le brut est vide.
  const t = `${String(arg.brut ?? "")}\n${String(arg.reecrit ?? "")}`.trim();
  const source = String(pf["needs_user_source"] ?? "");
  // ── CE QUE LA SONDE A VU (2026-09-23) ─────────────────────────────────────
  // profiles.extension_sessions, relevé par l'extension. Tri-état par
  // plateforme : true connecté, false déconnecté, null/absent INDÉTERMINÉ.
  // ⛔ null ne vaut JAMAIS false : ne rien savoir n'autorise rien.
  const sessions = arg.sessions && typeof arg.sessions === "object" ? arg.sessions : null;
  const sondeDit = sessions ? sessions[platform] : undefined;
  // ── OPLA : SEULE LA PAGE PROUVE UNE SESSION FERMÉE (2026-09-24) ──────────
  // Le 401 de la sonde du service worker ne prouve rien : mesuré le 24/09 sur
  // quinze comptes (Nico, xxewwer, nadegemarcelin78, van-breugel.sandra,
  // meminiandmove…) dont les relevés et dépôts, dans l'onglet, aboutissaient.
  // Les extensions ≤ 0.6.64 écrivent encore `opla: false` sur ce 401 : ici,
  // « déconnecté » ne se lit QUE sur le code posé par noterSessionDeconnectee
  // (page de connexion vue par l'onglet) — jamais sur un code HTTP numérique.
  // Ni « à autoriser », ni « session fermée », ni retenue : le brut est classé
  // plus bas comme n'importe quel autre échec (reprise espacée, ou son motif).
  const httpOpla = String(sessions?.http?.opla ?? "");
  const deconnecte = platform === "opla"
    ? (sondeDit === false && httpOpla === HTTP_MUR_OBSERVE)
    : sondeDit === false;
  const connecte = sondeDit === true;
  // ── CE QUE LE POSTE SAIT DE LUI-MÊME (2026-09-24) ─────────────────────────
  // update-job-status le pose depuis profiles.extension_postes : le poste qui
  // rapporte cet échec a-t-il la permission d'hôte opla.co ? Un échec Opla ne
  // peut venir que d'un poste qui a PASSÉ la porte de permission : lui dire
  // « Autorise Opla », c'est demander un geste déjà fait (Louis, nuit du
  // 23/09 : 131 fois, deux profils Chrome sur un même compte). true = prouvé ;
  // absent = inconnu (anciens appelants), et l'arbitrage d'avant s'applique.
  const accesPoste = arg.oplaAccesDuPoste === true;
  // Reprises déjà faites par ce module sur ce job (pas_de_rouge_reprises).
  const reprisesFaites = Number(arg.reprises ?? 0) || 0;

  // ── 0. LA SONDE DIT « DÉCONNECTÉ » : IL Y A UN GESTE, ON LE DIT ───────────
  // (2026-09-23, meminiandmove.) Ses 3 publications Opla tournaient en
  // « L'opération a été interrompue sur ton ordinateur. Elle reprend toute
  // seule, rien à faire de ton côté » — tentatives 2 et 4 — alors que sa sonde
  // Opla répondait 401 et extension_sessions.opla = false. La reprise promise
  // ne pouvait PAS aboutir : sans autorisation, chaque essai refait le même
  // mur. « Rien à faire de ton côté » était faux, et c'est la pire des
  // réponses : elle laisse quelqu'un attendre indéfiniment un événement qui
  // n'arrivera jamais.
  // La règle vaut pour TOUTE plateforme dont la sonde dit « déconnecté » : le
  // geste passe devant la reprise. Elle est placée AVANT tout le reste parce
  // qu'un mur d'autorisation se déguise en n'importe quoi en aval (canal
  // coupé, timeout, 401, page inattendue).
  // ── 0 pré. VINTED A RESTREINT LE COMPTE JUSQU'À UNE DATE (27/09) ─────────
  // Le diagnostic porte la page vinted.fr/listing-restriction et sa date : ni
  // un anti-robot, ni une session fermée, ni un geste à faire — une attente
  // datée. Lue AVANT tout le reste : le refus 403 du retrait qu'elle provoque
  // se déguise en « CHALLENGE / access_denied » plus bas (nadegemarcelin78,
  // 5 republications, 8 reprises de 45 min pour rien, puis un needs_user brut).
  // (Objet écrit en entier : l'aide reprise() n'est déclarée que plus bas.)
  if (platform === "vinted") {
    const r = restrictionVinted(pf);
    if (r) {
      const encore = r.fin != null ? r.fin - Date.now() : 0;
      if (encore > 0) {
        return {
          verdict: "reprise", statut: "pending", motif: "compte_restreint",
          dansMinutes: Math.max(5, Math.ceil(encore / 60_000) + 5),
          message:
            `Vinted a restreint ton compte jusqu'au ${r.jusquau} (« ${r.libelle} ») : d'ici là, il n'accepte ni nouvelle annonce ni ` +
            `modification — de toi comme de FillSell. Rien n'a été touché, ton annonce est intacte. ${acte(action).replace(/^la /, "La ").replace(/^le /, "Le ")} ` +
            "repart toute seule dès la fin de la restriction, sans rien faire de ton côté.",
        };
      }
      return {
        verdict: "reprise", statut: "pending", motif: "compte_restreint_echu", dansMinutes: 1,
        message:
          `La restriction de ton compte Vinted${r.jusquau ? ` (jusqu'au ${r.jusquau})` : ""} est terminée : ` +
          `${acte(action)} repart toute seule, l'état réel de l'annonce est revérifié avant tout geste.`,
      };
    }
  }

  // ── 0 bis. VINTED EXIGE LE FORMAT DE COLIS QUE SON FORMULAIRE NE MONTRE PAS
  //    (02/10, lohanobert59 — _shared/vinted-colis.js) ──────────────────────
  // Avant : « On ne sait pas encore pourquoi : on refait un essai tout seuls »
  // — la cause était connue, et l'essai, sur le même poste, refaisait le même
  // POST sans format. Le correctif est dans l'extension (0.6.84) :
  //   · format envoyé directement et refusé quand même → arrêt, message vrai
  //     (publication) ; la recréation, elle, garde sa reprise de 6 h ;
  //   · sinon → le job attend un poste qui porte le correctif
  //     (build_min_requis : get-pending-jobs ne le sert à aucun autre).
  if (platform === "vinted" && refusColisVinted(t)) {
    if (colisEnvoyeEtRefuse(t)) {
      if (action === "republish") {
        return {
          verdict: "reprise", statut: "pending", motif: "colis_refuse_meme_envoye", dansMinutes: 360,
          message: messageColisRefuseMemeEnvoye(action),
        };
      }
      return {
        verdict: "info", statut: "cancelled", motif: "colis_refuse_meme_envoye",
        message: messageColisRefuseMemeEnvoye(action),
      };
    }
    // (06/10, patrick giry) Le poste porte DÉJÀ l'envoi direct : rien à
    // attendre d'une mise à jour — le message le dit, sans build_min_requis.
    if (posteAvecEnvoiColis(arg.build)) {
      return {
        verdict: "reprise", statut: "pending", motif: "colis_non_affiche", dansMinutes: 30,
        message: messageColisNonAfficheParLaPage(action, 30),
      };
    }
    return {
      verdict: "reprise", statut: "pending", motif: "colis_non_propose", dansMinutes: 30,
      pf: { build_min_requis: BUILD_COLIS_DANS_ENVOI },
      message: messageColisAttendMiseAJour(action),
    };
  }

  // ── 0 ter. OPLA REFUSE CE PRIX, ÉCRIT DANS SES RÈGLES (04/10) ────────────
  // Lebonzeze (f2rhrt5zc6), sac à 1 100 € : le pré-vol de l'extension refuse
  // AVANT tout envoi (« Opla plafonne les annonces à 1000 € ») — et ce refus,
  // lu comme un motif inconnu, a été repris cinq fois avant un « relance d'un
  // clic » qui le referait à l'identique. Un prix hors des limites écrites
  // d'Opla (plafond 1 000 €, profil vérifié au-dessus de 300 €, plancher de
  // conversion) ne se reprend pas : on le dit tout de suite, avec les issues.
  if (platform === "opla" && /Opla plafonne les annonces à|Opla exige un profil vérifié au-dessus de|sous notre plancher de .* — presque toujours une erreur de conversion/i.test(t)) {
    const plafond = /plafonne les annonces à/i.test(t);
    const verifie = /profil vérifié/i.test(t);
    return {
      verdict: "a_toi", statut: "needs_user", motif: "opla_prix_hors_limites", source: "relancer",
      message: plafond
        ? "Opla n'accepte pas d'annonce au-dessus de 1 000 € : rien n'a été envoyé. Baisse le prix de la fiche sous 1 000 € puis relance, ou ne publie pas cet article sur Opla."
        : verifie
          ? "Au-dessus de 300 €, Opla exige un profil vérifié : rien n'a été envoyé. Fais vérifier ton profil sur Opla (ou baisse le prix sous 300 €), puis relance."
          : "Le prix de cette annonce est anormalement bas pour Opla (sans doute une erreur de saisie) : rien n'a été envoyé. Corrige le prix de la fiche puis relance.",
    };
  }

  // ⛔ Les motifs qui portent DÉJÀ un geste précis (taille à choisir, limite de
  //    plateforme vérifiée) gardent la main : ils sont plus spécifiques.
  if (deconnecte && !TAILLE_HORS_GRILLE_RE.test(t) && !LBC_PAYANT_RE.test(t) && !BEEBS_RAYON_RE.test(t)) {
    if (platform === "opla") {
      // ── DEUX MURS, DEUX GESTES — ET LE 401 DE SONDE N'EN EST AUCUN ──────
      // (2026-09-23, revu le 24/09.) `deconnecte` ne peut être vrai ici que
      // sur une page de connexion VUE par l'onglet (noterSessionDeconnectee →
      // http.opla = "login_redirect_observee") : le geste est « Me
      // connecter ». Jamais « Autoriser Opla » pour une session fermée — une
      // session fermée n'est pas une permission manquante. Et jamais l'un ni
      // l'autre sur le 401 du service worker : le 23/09 chez Marine il
      // arrivait pendant que le relevé lisait 57 annonces ; le 24/09 il
      // faisait dire « Autorise Opla » à Nico, dont le poste avait l'accès.
      // La permission manquante, elle, se reconnaît à son marqueur (règle 1).
      return {
        verdict: "a_toi", statut: "needs_user", motif: "connexion", source: "connexion",
        message: connexionOplaRequise(action),
      };
    } else {
      return {
        verdict: "a_toi", statut: "needs_user", motif: "connexion", source: "connexion",
        message:
          `Connexion ${nom} requise : ton navigateur n'est plus connecté à ${nom}, ` +
          `donc ${acte(action)} ne peut pas aboutir.${risqueRetrait(action, nom)} Clique sur « Me connecter » ci-dessous : ` +
          "dès que tu es reconnecté, on repart tout seuls. Rien n'a été touché.",
      };
    }
  }

  // ── 1. OPLA, PERMISSION D'HÔTE ────────────────────────────────────────────
  // Marqueur d'abord (le serveur le NOMME), texte ensuite. Il y a un bouton :
  // « Autoriser Opla », déjà servi par l'app. Le message d'avant promettait
  // « on réessaie tout seuls, rien à faire de ton côté » — c'était faux : sans
  // la permission, aucune reprise ne peut aboutir.
  if (platform === "opla" && !accesPoste && (source === "opla_acces" || OPLA_ACCES_RE.test(t))) {
    return {
      verdict: "a_toi", statut: "needs_user", motif: "opla_acces", source: "opla_acces",
      message: autorisationOplaRequise(action),
    };
  }

  // ── 2. MURS DE CONNEXION ──────────────────────────────────────────────────
  // Un geste clair, un bouton, et handler-watch relance tout seul dès que la
  // sonde revoit la session. Les débuts de phrase sont des ANCRES partagées.
  if (platform === "ebay" && REAUTH_EBAY_RE.test(t)) {
    return {
      verdict: "a_toi", statut: "needs_user", motif: "reauth_ebay", source: "connexion",
      message:
        "REAUTH VENTE eBay : eBay te demande de te reconnecter avant de te laisser déposer une annonce. " +
        "Clique sur « Me connecter » ci-dessous, reconnecte-toi sur eBay, et on reprend " +
        `${acte(action)} tout seuls — rien n'a été publié, rien n'est perdu.`,
    };
  }
  // Opla, la PAGE a dit 401 (« Connexion Opla requise ») et la sonde n'a pas
  // tranché « déconnecté » (sinon la règle 0 a déjà parlé) : le geste est
  // « Me connecter ». Jamais « Autoriser Opla » pour une session fermée.
  if (platform === "opla" && OPLA_CONNEXION_RE.test(t)) {
    // (27/09, point 19) La sonde a vu Opla CONNECTÉ : c'est un refus passager,
    // jamais « connecte-toi » tant qu'il reste des essais courts.
    if (connecte && reprisesFaites < 3) {
      // (objet écrit en entier : l'aide reprise() n'est déclarée que plus bas)
      return {
        verdict: "reprise", statut: "pending", motif: "refus_session_bonne", dansMinutes: [3, 6, 10][reprisesFaites],
        message:
          "Opla a refusé l'accès à l'instant, mais ta connexion Opla est bonne : il n'y a rien à faire de ton côté " +
          "et rien n'a été touché. On refait un essai tout seuls dans quelques minutes.",
      };
    }
    return {
      verdict: "a_toi", statut: "needs_user", motif: "connexion", source: "connexion",
      message: connexionOplaRequise(action),
    };
  }
  if (CONNEXION_RE.test(t) && NOM[platform] && platform !== "opla") {
    // ── ON N'ENVOIE PAS RÉPARER CE QUI N'EST PAS CASSÉ (2026-09-23) ─────────
    // La sonde vient de voir la plateforme VIVANTE : le texte dit « session »,
    // la mesure dit le contraire, et c'est la mesure qui gagne. Vécu chez
    // van-breugel.sandra le 23/09 — 4 republications arrêtées sur « Connecte-toi
    // sur vinted.fr » avec http.vinted = 200 relevé DEUX MINUTES plus tôt, son
    // identité Vinted lisible, et 10 autres annonces parties dans la même
    // heure. Ce qui a refusé la capture n'est pas établi (une capture en échec
    // n'écrivait rien : le code HTTP est perdu) — mais la session, elle, est
    // mesurée, et elle allait bien. C'est tout ce qu'il faut savoir ici.
    // Ce n'est pas un échec et ce n'est pas son problème : c'est une reprise,
    // ESPACÉE (45 min) — réessayer tout de suite, c'est re-taper la porte qui
    // vient de se fermer, et c'est ce va-et-vient qui entretenait le refus.
    if (connecte) {
      return {
        verdict: "reprise", statut: "pending", motif: "refus_session_bonne", dansMinutes: 45,
        message:
          `${nom} nous a refusé l'accès à ta fiche à l'instant, mais ta connexion ${nom} est bonne : ` +
          "il n'y a rien à faire de ton côté et rien n'a été touché. " +
          "On refait un essai tout seuls dans trois quarts d'heure, au calme.",
      };
    }
    return {
      verdict: "a_toi", statut: "needs_user", motif: "connexion", source: "connexion",
      message:
        `Connexion ${nom} requise : ton navigateur n'est plus connecté à ${nom}, ` +
        `donc ${acte(action)} ne peut pas aboutir.${risqueRetrait(action, nom)} Clique sur « Me connecter » ci-dessous : ` +
        "dès que tu es reconnecté, on repart tout seuls. Rien n'a été touché.",
    };
  }

  // ── 2 bis. OPLA : LES COOKIES DU SITE DÉPASSENT LA LIMITE DE SON HÉBERGEUR ──
  // (2026-09-24, Louis.) 494 = REQUEST_HEADER_TOO_LARGE chez Vercel : toute
  // requête vers opla.co depuis ce Chrome est refusée, page comme API. Ce
  // n'est ni l'annonce ni nous, mais « relancer » retaperait le même mur : il y
  // a un geste, et un seul — supprimer les cookies du site opla.co dans CE
  // Chrome. L'extension 0.6.64 le mesure AVANT de tenter, purge elle-même
  // quand aucune session n'est en jeu, et relance seule quand c'est propre.
  if (platform === "opla" && OPLA_494_RE.test(t)) {
    return {
      verdict: "a_toi", statut: "needs_user", motif: "opla_cookies", source: "opla_cookies",
      message: cookiesOplaTropVolumineux(action),
    };
  }

  // ── 3. LIMITES DE PLATEFORME — INFO NEUTRE, JOB CLOS ──────────────────────
  // Il n'y a RIEN à faire : ni pour nous, ni pour la personne. On le dit et on
  // ferme. ⛔ Cette sortie est réservée à ce qui a été VÉRIFIÉ en face.
  if (platform === "leboncoin" && LBC_PAYANT_RE.test(t)) {
    return {
      verdict: "info", statut: "cancelled", motif: "lbc_sans_option_gratuite",
      message:
        "Leboncoin ne propose plus de dépôt gratuit sur ce compte : son dernier écran n'offre que « Valider et payer ». " +
        "FillSell ne paie jamais à ta place, donc cette annonce n'est pas partie et rien ne t'a été facturé. " +
        "Tes autres plateformes ne sont pas concernées.",
    };
  }
  if (platform === "beebs" && BEEBS_RAYON_RE.test(t)) {
    return {
      verdict: "info", statut: "cancelled", motif: "beebs_sans_rayon",
      message:
        "Beebs n'a pas de rayon qui corresponde à cet article : son rayon Chaussures ne propose que " +
        "Bottes, Baskets, Sandales et nu-pieds, Chaussures à talon, Chaussons, Chaussures de sport et Mules et sabots. " +
        "On préfère ne rien publier plutôt que de le ranger au mauvais endroit. " +
        "Tes autres plateformes ne sont pas concernées.",
    };
  }
  if (action === "republish" && DISPARUE_RE.test(t) && /plus en ligne|n'existe plus/i.test(t)) {
    return {
      verdict: "info", statut: "cancelled", motif: "annonce_disparue",
      message:
        `Cette annonce n'est plus en ligne sur ${nom} (vendue, retirée ou supprimée depuis sa dernière lecture). ` +
        "FillSell n'a rien retiré. Si tu l'as vendue, marque-la vendue ; sinon remets-la en ligne, puis synchronise.",
    };
  }

  // ── 4. UN CHOIX DANS UNE LISTE ────────────────────────────────────────────
  // La plateforme refuse une valeur et nous connaissons celles qu'elle accepte.
  // Le message ne nomme NI la grille, NI le code interne : il donne le choix.
  if (TAILLE_HORS_GRILLE_RE.test(t)) {
    const nuf = pf["needsUserField"] ?? null;
    const valeurs = Array.isArray(nuf?.["allowed_values"])
      ? nuf["allowed_values"].map(String) : [];
    const refusee = /«\s*([^»]+?)\s*»/.exec(String(arg.brut ?? ""))?.[1] ?? "";
    // Demi-pointure sur une grille d'entiers (2026-09-23 soir) : le handler
    // n'a envoyé que les DEUX voisines. Le message les nomme — un geste.
    const demiPointure = /^\d{1,2}[.,]5$/.test(refusee.trim()) && valeurs.length === 2;
    if (demiPointure) {
      return {
        verdict: "a_toi", statut: "needs_user", motif: "taille_hors_grille", source: "champ_a_choisir",
        message:
          `${nom} n'accepte pas les demi-pointures pour ce type d'article : pour du ${refusee.trim().replace(".", ",")}, ` +
          `choisis ${valeurs[0]} ou ${valeurs[1]} ci-dessous — un seul geste, et on repart.`,
      };
    }
    const apercu = valeurs.length ? ` ${nom} accepte : ${valeurs.join(", ")}.` : "";
    return {
      verdict: "a_toi", statut: "needs_user", motif: "taille_hors_grille", source: "champ_a_choisir",
      message:
        (refusee ? `${nom} n'accepte pas la taille « ${refusee} » pour ce type d'article.` : `${nom} n'accepte pas cette taille.`) +
        apercu + " Choisis celle qui convient ci-dessous et on repart.",
    };
  }

  // ── OPLA : LA CATÉGORIE, DEMANDÉE DANS LA LISTE QUE LE SERVEUR A POSÉE (25/09) ──
  // nadegemarcelin78, « Contes pour les Filles » (86ff39c5) : dix refus
  // « Aucune catégorie Opla n'a été résolue » en un jour, puis un « relancer »
  // qui rejouait exactement le même refus. La republication de l'extension
  // 0.6.68 ne sait pas poser la question (seul le dépôt la pose), et rien ne
  // la posait à sa place. Or le serveur a servi la liste des feuilles
  // possibles (`oplaCategoryAsk`, get-pending-jobs → opla-completion) ; le
  // background la renvoie avec le job. On la pose donc ici, au format de
  // l'extension (content-scripts/opla.js, needsUserField « Catégorie Opla ») :
  // la réponse est un LIBELLÉ de cette liste, que get-pending-jobs retraduit
  // en code au passage suivant (récolte de completerJobOpla).
  // ⛔ SANS LISTE, PAS DE QUESTION : moins de deux feuilles avec leur code, et
  //    on retombe sur la suite (reprise, puis « relancer »), comme avant.
  if (platform === "opla" && OPLA_CATEGORIE_ABSENTE_RE.test(t)) {
    const posees = Array.isArray(pf?.["oplaCategoryAsk"]?.["options"]) ? pf["oplaCategoryAsk"]["options"] : [];
    const titres = [...new Set(feuillesPourQuestionOpla(posees)
      .filter((o) => o && typeof o === "object" && String(o.code ?? "").trim() && String(o.title ?? "").trim())
      .map((o) => String(o.title).trim()))];
    if (titres.length >= 2) {
      return {
        verdict: "a_toi", statut: "needs_user", motif: "categorie_a_choisir", source: "champ_a_choisir",
        champ: {
          field_key: "oplaCategoryChoice",
          field_label: "Catégorie Opla",
          allowed_values: titres,
          input_type: "selection_only",
          options_completes: true,
          target: { root: null, key: "oplaCategoryChoice" },
        },
        message:
          `${nom} a besoin de savoir dans quelle catégorie ranger cet article, et on ne veut pas la deviner. ` +
          `Choisis-la ci-dessous parmi les ${titres.length} proposées : un seul geste, et ${acte(action)} repart. ` +
          (action === "republish" ? "Ton annonce n'a pas été touchée." : "Rien n'a été publié."),
      };
    }
  }

  // ── 5. NOTRE DÉFAUT — ON REPREND, ON NE DEMANDE RIEN ──────────────────────
  // Tout ce qui suit est chez nous ou chez la plateforme, jamais chez la
  // personne. On le dit sans jargon, on annonce la reprise, et on la fait.
  // ── UNE REPRISE N'EST PAS UNE BOUCLE (2026-09-24) ──────────────────────────
  // Chaque reprise remettait le budget de tentatives à zéro : les 14 kits de
  // Louis ont tourné toute la nuit, une tentative toutes les 8 minutes, sans
  // que rien ne change. On reprend toujours — c'est notre défaut, jamais un
  // geste demandé — mais de plus en plus espacé : dès la 3e reprise 45 min,
  // dès la 5e 3 h, dès la 8e 6 h. Le compteur est platform_fields.
  // pas_de_rouge_reprises, tenu par update-job-status.
  const espacer = (min) => reprisesFaites >= 8 ? Math.max(min, 360)
    : reprisesFaites >= 5 ? Math.max(min, 180)
    : reprisesFaites >= 3 ? Math.max(min, 45)
    : min;
  const reprise = (motif, message, dansMinutes) => ({
    verdict: "reprise", statut: "pending", motif, message, dansMinutes: espacer(dansMinutes),
  });

  // ── BEEBS N'ENREGISTRE PAS L'ANNONCE : 3 REFUS SUR LA MÊME CATÉGORIE = INFO,
  //    JOB CLOS (2026-09-27, GO Nico — xxewwer af4ea3d3) ─────────────────────
  // « Une erreur est survenue lors de l'enregistrement de votre annonce » :
  // le formulaire Beebs répond 200 avec une TypeError de SON serveur
  // (« Cannot read properties of undefined (reading 'id') »). Reproduit deux
  // fois à la main le 27/09 sur un autre compte, même catégorie (Maison ›
  // Meubles › Meubles de rangement), marque « Autre » puis « Sans marque » :
  // c'est la CATÉGORIE, côté Beebs — pas l'annonce, pas la marque, pas le
  // compte. Le job tournait toutes les 6 h en « on refait un essai » (14 fois).
  // Règle : on compte les refus PAR CATÉGORIE (beebs_enregistrement_echecs) ;
  // au 3e, on le dit et on clôt — rien n'a été publié, rien facturé, les
  // autres plateformes continuent. Une reprise « inconnu » déjà comptée sur ce
  // même refus (pas_de_rouge_reprises) vaut pour l'historique : un job qui a
  // déjà buté quatorze fois n'a pas droit à trois essais de plus.
  if (platform === "beebs" && BEEBS_ENREGISTREMENT_RE.test(t)) {
    const chemin = Array.isArray(pf.beebsCategoryPath)
      ? pf.beebsCategoryPath.map(String).join(" › ") : String(pf.beebsCategoryPath ?? "").trim();
    const prec = pf.beebs_enregistrement_echecs && typeof pf.beebs_enregistrement_echecs === "object"
      ? pf.beebs_enregistrement_echecs : null;
    const historique = prec && String(prec.categorie ?? "") === chemin
      ? (Number(prec.n) || 0)
      : (String(pf?.pas_de_rouge?.motif ?? "") === "inconnu_reprise" ? reprisesFaites : 0);
    const n = historique + 1;
    const marqueur = { beebs_enregistrement_echecs: { categorie: chemin, n, derniere: new Date().toISOString() } };
    const rayon = chemin ? ` dans la catégorie « ${chemin} »` : "";
    if (n >= 3) {
      return {
        verdict: "info", statut: "cancelled", motif: "beebs_enregistrement_refuse", pf: marqueur,
        message:
          `Beebs n'arrive pas à enregistrer cette annonce${rayon} : son formulaire répond « Une erreur est survenue ` +
          `lors de l'enregistrement » à chaque essai (${n} fois), y compris quand on le remplit à la main. C'est une panne ` +
          "de Beebs sur cette catégorie, pas ton annonce. On arrête ici : rien n'a été publié sur Beebs, rien ne t'a été " +
          "facturé, et tes autres plateformes ne sont pas concernées. Tu pourras relancer Beebs pour cet article plus tard.",
      };
    }
    return {
      ...reprise("beebs_enregistrement",
        `Beebs n'a pas enregistré l'annonce${rayon} (« Une erreur est survenue lors de l'enregistrement », essai ${n} sur 3) : ` +
        "rien n'a été publié. On refait un essai tout seuls plus tard ; au troisième refus dans cette catégorie, on arrête et on te le dit.",
        45),
      pf: marqueur,
    };
  }

  if (PHOTOS_RE.test(t)) {
    return reprise("photos_non_deposees",
      `Les photos n'ont pas fini d'arriver chez ${nom} : on a arrêté AVANT de toucher à quoi que ce soit, ` +
      "ton annonce est intacte. On refait un essai tout seuls, rien à faire de ton côté.", 10);
  }
  if (PANNEAU_RE.test(t)) {
    return reprise("panneau_categorie",
      `La page de dépôt de ${nom} n'a pas fini de s'afficher avant qu'on choisisse la catégorie. ` +
      "Rien n'a été publié. On recommence tout seuls dans quelques minutes.", 5);
  }
  if (ANTIROBOT_RE.test(t)) {
    // ── UN RETRAIT REFUSÉ SUR UNE SEULE ANNONCE N'EST PAS UN ANTI-ROBOT (25/09) ──
    // Compte de Nico, « Buste femme terre cuite » (retrait Vinted du 24/09
    // 23:54) : 403 access_denied à chaque essai pendant plus de 7 h, alors que
    // les retraits de la peinture (10 s avant) et des bobines (2 min après)
    // passaient, et que la sonde Vinted répondait 200. Classé « anti-robot »,
    // le job tournait SANS FIN : reprise espacée, budget remis à zéro, nouvel
    // épisode toutes les 6 h — et le message promettait une reprise qui ne
    // pouvait pas aboutir, pendant que l'annonce restait en ligne.
    // Un vrai anti-robot coupe TOUT le compte : la sonde, elle aussi, prend un
    // 403 (Vinted : null, jamais true). Donc : blocage vu depuis ≥ 2 h, et la
    // sonde Vinted, fraîche, relevée APRÈS le début du blocage, dit que Vinted
    // répond → c'est CETTE annonce que Vinted refuse de retirer. On le dit, on
    // rend la main (relance d'un clic), et on arrête de marteler.
    // Vinted seul : c'est la seule sonde dont le « true » vaut une réponse 200.
    if (action === "delete" && platform === "vinted" && antirobotContreditParLaSonde(pf, sessions, platform)) {
      const heures = Math.max(2, Math.round((Date.now() - Date.parse(String(pf?.blocage_antirobot?.depuis))) / 3_600_000));
      return {
        verdict: "a_toi", statut: "needs_user", motif: "retrait_refuse_annonce", source: "relancer",
        message:
          `Vinted refuse de retirer CETTE annonce depuis ${heures} h, alors qu'il répond normalement à ton compte : ` +
          "ce n'est donc pas une vérification anti-robot. L'annonce est peut-être en cours de vérification chez Vinted. " +
          "Rien n'a été supprimé : elle est toujours en ligne. Retire-la toi-même sur Vinted si elle doit disparaître, " +
          "ou relance le retrait d'un clic ci-dessous un peu plus tard.",
      };
    }
    return reprise("antirobot",
      `${nom} a affiché une vérification anti-robot au lieu de la page attendue. Rien n'a été ` +
      `${action === "delete" ? "retiré" : "publié"}, ton annonce est intacte. On réessaie plus tard, ` +
      "au calme — tu peux aussi ouvrir " + nom + " et passer la vérification, ça ira plus vite.", 45);
  }
  if (SERVEUR_RE.test(t)) {
    return reprise("serveur",
      `${nom} n'a pas répondu correctement pendant ${acte(action)}. Ce n'est pas ton annonce : ` +
      "on refait un essai tout seuls dans quelques minutes.", 10);
  }
  // ── OPLA, ONGLET HORS DE www.opla.co (2026-09-27) ─────────────────────────
  // Classé « canal coupé » jusqu'ici : reprise sans fin toutes les 6 h et « tu
  // n'as rien à faire » — faux, la page partait sur la connexion d'Opla. On le
  // dit : poste sans l'accès → « Autoriser Opla » ; connexion absente PROUVÉE
  // (liste des cookies complète, aucun __session) ou déjà une reprise faite →
  // « Me connecter » ; sinon une seule reprise, au calme.
  if (platform === "opla" && OPLA_HORS_HOTE_RE.test(t)) {
    if (!accesPoste) {
      return {
        verdict: "a_toi", statut: "needs_user", motif: "opla_acces", source: "opla_acces",
        message: autorisationOplaRequise(action),
      };
    }
    const oc = pf && typeof pf.opla_cookies === "object" ? pf.opla_cookies : null;
    const gros = Array.isArray(oc?.gros) ? oc.gros : [];
    const listeComplete = !!oc && Number.isFinite(Number(oc.n)) && gros.length >= Number(oc.n);
    const sansSession = oc?.session_cookie_presente === false ||
      (listeComplete && !gros.some((c) => /^__session/.test(String(c?.name ?? ""))));
    if (sansSession) {
      return { verdict: "a_toi", statut: "needs_user", motif: "connexion", source: "connexion",
        message: connexionOplaRequise(action) };
    }
    // (27/09, point 19 — samazer59) La sonde a vu Opla CONNECTÉ : l'onglet a
    // quitté opla.co le temps d'un rafraîchissement de session. Jamais
    // « connecte-toi » : quelques minutes (3, 6, 10), puis 45.
    if (connecte) {
      return reprise("opla_hors_hote",
        `${acte(action).replace(/^la /, "La ").replace(/^le /, "Le ")} a été interrompue : l'onglet Opla a quitté opla.co ` +
        "un instant. Ta connexion Opla est bonne, rien n'a été touché : on refait un essai tout seuls dans quelques minutes.",
        reprisesFaites < 3 ? [3, 6, 10][reprisesFaites] : 45);
    }
    return reprise("opla_hors_hote",
      `${acte(action).replace(/^la /, "La ").replace(/^le /, "Le ")} a été interrompue : l'onglet Opla a quitté opla.co ` +
      "(souvent la page de connexion). Rien n'a été touché : on refait un essai un peu plus tard.", 45);
  }
  if (CANAL_RE.test(t)) {
    return reprise("canal_coupe",
      `${acte(action).replace(/^la /, "La ").replace(/^le /, "Le ")} a été interrompue sur ton ordinateur ` +
      "(onglet fermé, mise en veille ou coupure réseau). Rien n'a été touché : on reprend " +
      "au prochain passage, tu n'as rien à faire.", 5);
  }
  if (VEILLE_RE.test(t)) {
    return {
      verdict: "a_toi", statut: "needs_user", motif: "attente_trop_longue", source: "relancer",
      message:
        `${acte(action).replace(/^la /, "Cette ").replace(/^le /, "Ce ")} attendait depuis plusieurs jours ` +
        "sans que ton ordinateur puisse la reprendre. Rien n'a été touché. " +
        "Ouvre Chrome avec l'extension FillSell, puis relance-la d'un clic ci-dessous.",
    };
  }

  if (platform === "beebs" && /élément introuvable:\s*#input-pictures/i.test(t)) {
    const message = "FillSell n’a pas pu ouvrir l’ajout des photos sur Beebs. Rien n’a été publié. ";
    if (essais < 3 && reprisesFaites < 3) return reprise("beebs_formulaire_photos", message + "Un nouvel essai est prévu automatiquement.", 15);
    return { verdict: "a_toi", statut: "needs_user", motif: "beebs_formulaire_photos", source: "relancer",
      message: message + "Tu peux relancer après la mise à jour de l’extension." };
  }

  // ── BEEBS RESTE SUR LE FORMULAIRE APRÈS « PUBLIER » (2026-10-01, Marie) ───
  // mariecreativedigital, chemise Hilfiger (0f457c57) : six essais, six fois
  // « Taille 8XL » sur le formulaire, rien soumis — et chaque fois « on refait
  // un essai tout seuls ». Le refus se lit dans ce que l'essai a laissé :
  //   · l'adresse a été « validée » sur un bouton qui n'est pas une adresse
  //     (sans le code postal) : c'est NOTRE sélecteur (« 8 » de « 8 Mai » ⊂
  //     « 8XL »), corrigé dans l'extension (BUILD_BEEBS_ADRESSE_STRICTE) ;
  //     relancer sur le même build refait le même mur → needs_user tout de
  //     suite, et le correctif d'extension réarme le job sur un poste à jour ;
  //   · une taille affichée qui n'est pas celle de la fiche : la question de
  //     la taille, tout de suite.
  if (platform === "beebs" && /Dépôt Beebs non confirmé/i.test(t)) {
    const lecture = lectureRefusBeebs(pf, String(arg.brut ?? t));
    if (lecture.adresseSurAutreChose) {
      const autre = lecture.adresseSurAutreChose;
      const taille = lecture.tailleAffichee && lecture.tailleVoulue && lecture.tailleAffichee !== lecture.tailleVoulue
        ? ` (la taille affichée est devenue « ${lecture.tailleAffichee} » au lieu de « ${lecture.tailleVoulue} »)` : "";
      return {
        verdict: "a_toi", statut: "needs_user", motif: "beebs_adresse_mal_choisie", source: "relancer",
        message:
          `Beebs n'a pas validé ton adresse d'envoi : FillSell a cliqué « ${autre} » dans la page au lieu de ton adresse${taille}. ` +
          "Rien n'a été publié sur Beebs. C'est un défaut de FillSell, corrigé dans la prochaine version de l'extension : " +
          "la publication repartira toute seule dès que ton ordinateur l'aura.",
      };
    }
    if (lecture.tailleAffichee && lecture.tailleVoulue && !taillesCompatibles(lecture.tailleAffichee, lecture.tailleVoulue)) {
      return {
        verdict: "a_toi", statut: "needs_user", motif: "beebs_taille_refusee", source: "champ_a_choisir",
        champ: { field_key: "Taille", field_label: "Taille", platform: "beebs", target: { root: null, key: "taille" }, input_type: "dropdown" },
        message:
          `Beebs refuse la taille « ${lecture.tailleAffichee} » pour cet article (la fiche dit « ${lecture.tailleVoulue} ») : ` +
          "rien n'a été publié. Choisis la bonne taille ci-dessous et la publication repart.",
      };
    }
  }

  // ── 6. MOTIF INCONNU — TOUJOURS PAS DE ROUGE ──────────────────────────────
  // ⛔ ON NE DIT PAS CE QU'ON NE SAIT PAS. Tant qu'il reste du budget, on
  //    reprend (c'est ce qui répare le plus souvent). Budget épuisé : un
  //    « relancer » ambre, avec le bouton — jamais un échec rouge et muet.
  // ⛔ (2026-09-27, xxewwer af4ea3d3 : 14 reprises en 2 jours) `essais` est
  //    remis à zéro à chaque reprise : seul le compteur de reprises du module
  //    borne la boucle. Au-delà de 3 reprises, « relancer » ambre.
  if (essais < 3 && reprisesFaites < 3) {
    return reprise("inconnu_reprise",
      `${acte(action).replace(/^la /, "La ").replace(/^le /, "Le ")} n'a pas abouti et ton annonce n'a pas ` +
      "été touchée. On ne sait pas encore pourquoi : on refait un essai tout seuls.", 15);
  }
  return {
    verdict: "a_toi", statut: "needs_user", motif: "inconnu_relancer", source: "relancer",
    message:
      `${acte(action).replace(/^la /, "La ").replace(/^le /, "Le ")} n'a pas abouti après plusieurs essais ` +
      "automatiques, et ton annonce n'a pas été touchée. Tu peux la relancer d'un clic ci-dessous ; " +
      "si ça bloque encore, écris-nous, on regarde avec toi.",
  };
}
import { feuillesPourQuestionOpla } from './opla-questions.js';
