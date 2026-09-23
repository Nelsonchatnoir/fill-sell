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

import { autorisationOplaRequise, connexionOplaRequise } from "./textes-jobs.ts";

const NOM = {
  vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla",
};

/** « la publication » / « la republication » / « le retrait ». */
function acte(action) {
  if (action === "republish") return "la republication";
  if (action === "delete") return "le retrait";
  return "la publication";
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
  /^Connexion (?:Vinted|Leboncoin|eBay|Beebs) requise|page de connexion à la place du formulaire|session Vinted refusée|mur de connexion|session (?:expirée|morte|refusée)/i;

/** Opla : ce n'est pas une connexion, c'est la permission d'hôte de l'extension. */
const OPLA_ACCES_RE = /accès à opla\.co a été refusé|permission.*opla\.co|host permission.*opla/i;
/** Opla, session FERMÉE vue par la PAGE : l'ancre écrite par content-scripts/opla.js
 *  (OPLA_MSG_SESSION) quand l'API d'Opla répond 401 dans l'onglet. */
const OPLA_CONNEXION_RE = /^Connexion Opla requise/i;
/** Le code posé par noterSessionDeconnectee : une page de connexion RÉELLEMENT vue. */
const HTTP_MUR_OBSERVE = "login_redirect_observee";

/** Leboncoin Pro hors forfait : l'écran de dépôt n'offre que « Valider et payer ». */
const LBC_PAYANT_RE = /ne propose aucune option gratuite|Boostez votre annonce.*Valider et payer|aucun chemin gratuit/i;

/** Beebs n'a aucun rayon pour cet objet — vérifié, pas supposé. */
const BEEBS_RAYON_RE = /n'a pas de rayon reconnu/i;

/** Une taille hors de la grille de la plateforme : liste fermée, choix à faire. */
const TAILLE_HORS_GRILLE_RE = /n'appartient pas à la grille/i;

/** L'annonce n'existe plus en face : ce n'est pas un échec, c'est un fait. */
const DISPARUE_RE = /n'est plus en ligne|annonce introuvable|n'existe plus sur/i;

/** Le chien de garde a arrêté une attente trop longue. */
const VEILLE_RE = /attendait une réponse depuis plusieurs jours/i;

/**
 * Classe un échec. Rend TOUJOURS une sortie : il n'existe pas de quatrième
 * issue. `essais` est le nombre de tentatives déjà consommées sur ce job.
 */
export function classerEchec(arg) {
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
  const deconnecte = sondeDit === false;
  const connecte = sondeDit === true;

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
  // ⛔ Les motifs qui portent DÉJÀ un geste précis (taille à choisir, limite de
  //    plateforme vérifiée) gardent la main : ils sont plus spécifiques.
  if (deconnecte && !TAILLE_HORS_GRILLE_RE.test(t) && !LBC_PAYANT_RE.test(t) && !BEEBS_RAYON_RE.test(t)) {
    if (platform === "opla") {
      // ── DEUX MURS, DEUX GESTES (2026-09-23) ─────────────────────────────
      // ⛔ Un 401 de la SONDE (service worker) ne prouve PAS une session
      //    fermée : le 23/09, chez Marine, la sonde rendait 401 pendant que le
      //    relevé, dans l'onglet, lisait 57 annonces. Le 401 de sonde reste
      //    donc « à autoriser » — la règle tranchée le 23/09 et servie par
      //    plateformes_verite (sonde_401 → a_autoriser), même écran, même mot.
      //    Ce qui prouve une session FERMÉE, c'est la PAGE : l'onglet a vu la
      //    page de connexion (noterSessionDeconnectee pose http.opla =
      //    "login_redirect_observee") ou l'API a répondu 401 dans l'onglet
      //    (content-scripts/opla.js écrit « Connexion Opla requise »). Là, le
      //    geste est « Me connecter », pas « Autoriser Opla ».
      const httpOpla = String(sessions?.http?.opla ?? "");
      if (httpOpla === HTTP_MUR_OBSERVE || OPLA_CONNEXION_RE.test(t)) {
        return {
          verdict: "a_toi", statut: "needs_user", motif: "connexion", source: "connexion",
          message: connexionOplaRequise(action),
        };
      }
      return {
        verdict: "a_toi", statut: "needs_user", motif: "opla_acces", source: "opla_acces",
        message: autorisationOplaRequise(action),
      };
    }
    return {
      verdict: "a_toi", statut: "needs_user", motif: "connexion", source: "connexion",
      message:
        `Connexion ${nom} requise : ton navigateur n'est plus connecté à ${nom}, ` +
        `donc ${acte(action)} ne peut pas aboutir. Clique sur « Me connecter » ci-dessous : ` +
        "dès que tu es reconnecté, on repart tout seuls. Rien n'a été touché.",
    };
  }

  // ── 1. OPLA, PERMISSION D'HÔTE ────────────────────────────────────────────
  // Marqueur d'abord (le serveur le NOMME), texte ensuite. Il y a un bouton :
  // « Autoriser Opla », déjà servi par l'app. Le message d'avant promettait
  // « on réessaie tout seuls, rien à faire de ton côté » — c'était faux : sans
  // la permission, aucune reprise ne peut aboutir.
  if (platform === "opla" && (source === "opla_acces" || OPLA_ACCES_RE.test(t))) {
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
        `donc ${acte(action)} ne peut pas aboutir. Clique sur « Me connecter » ci-dessous : ` +
        "dès que tu es reconnecté, on repart tout seuls. Rien n'a été touché.",
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

  // ── 5. NOTRE DÉFAUT — ON REPREND, ON NE DEMANDE RIEN ──────────────────────
  // Tout ce qui suit est chez nous ou chez la plateforme, jamais chez la
  // personne. On le dit sans jargon, on annonce la reprise, et on la fait.
  const reprise = (motif, message, dansMinutes) => ({
    verdict: "reprise", statut: "pending", motif, message, dansMinutes,
  });
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

  // ── 6. MOTIF INCONNU — TOUJOURS PAS DE ROUGE ──────────────────────────────
  // ⛔ ON NE DIT PAS CE QU'ON NE SAIT PAS. Tant qu'il reste du budget, on
  //    reprend (c'est ce qui répare le plus souvent). Budget épuisé : un
  //    « relancer » ambre, avec le bouton — jamais un échec rouge et muet.
  if (essais < 3) {
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
