// ═══════════════════════════════════════════════════════════════════════════
// CAUSE D'UN BLOCAGE — QUI PEUT AGIR ? (lot « zéro blocage », 24/10, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Une publication, une republication et un retrait doivent passer à 100 %, sans
// aucun geste de l'utilisateur, sauf les cas où lui seul peut agir : se connecter à
// une plateforme, finir son compte vendeur, compte restreint par la plateforme.
// Tout le reste vient de nous. » (Nico, 24/10)
//
// Ce module CLASSE un arrêt (job needs_user / failed, retenue en file, ou erreur
// archivée) par ORIGINE et par CAUSE exacte. Il ne décide rien, il n'écrit rien :
// il sert la sentinelle (ops-digest), la mesure du lot et le rejeu.
//   · « utilisateur » : lui seul peut agir (connexion, compte vendeur à finir,
//     compte restreint / anti-robot, plateforme qu'il a désactivée, paiement chez
//     la plateforme, adresse ou politique de son compte) ;
//   · « garde »       : un doute devenu question, voulu (deux annonces possibles,
//     vente signalée à confirmer) — jamais tranché seul ;
//   · « plateforme »  : la plateforme refuse sans donner de motif (modération) ;
//   · « nous »        : tout le reste — un champ, une valeur, un titre, une
//     capture, une lecture, un contrôle avant retrait. À ZÉRO.
// ⚠️ Un job arrêté chez nous puis abandonné par l'utilisateur reste un ÉCHEC de
// notre côté, jamais une annulation (`blocagesDuJob` relit erreurs_archivees).
// Données : `platform_fields.needs_user_source` d'abord (posé par le code), puis le
// texte de l'erreur. Toute règle ajoutée ici se prouve dans
// scripts/cause-blocage-selftest.mjs.

export const ORIGINE = Object.freeze({
  UTILISATEUR: "utilisateur",
  GARDE: "garde",
  PLATEFORME: "plateforme",
  NOUS: "nous",
});

// Sources posées par le code, dont la cause est sans ambiguïté.
const PAR_SOURCE = Object.freeze({
  connexion: [ORIGINE.UTILISATEUR, "connexion"],
  session_vinted: [ORIGINE.UTILISATEUR, "connexion"],
  attente_session: [ORIGINE.UTILISATEUR, "connexion"],
  ebay_connexion_requise: [ORIGINE.UTILISATEUR, "connexion"],
  depop_acces: [ORIGINE.UTILISATEUR, "connexion"],
  opla_acces: [ORIGINE.UTILISATEUR, "connexion"],
  depop_vendeur: [ORIGINE.UTILISATEUR, "compte_a_finir"],
  ebay_compte_a_finir: [ORIGINE.UTILISATEUR, "compte_a_finir"],
  ebay_compte_vendeur_inactif: [ORIGINE.UTILISATEUR, "compte_a_finir"],
  compte_vinted_bloque: [ORIGINE.UTILISATEUR, "compte_restreint"],
  // (25/10 nuit, audit N1) Deux sources posées par le code que la sentinelle rangeait en « nous/autre » : la
  // vérification anti-robot sur le compte (la personne seule peut la passer) et l'annonce d'une autre boutique
  // que celle ouverte dans le navigateur (la personne ouvre la bonne boutique).
  verification_antirobot: [ORIGINE.UTILISATEUR, "compte_restreint"],
  boutique_etrangere: [ORIGINE.UTILISATEUR, "connexion"],
  plateforme_ecartee: [ORIGINE.UTILISATEUR, "plateforme_desactivee"],
  // (25/10, N6) eBay refuse le brouillon sans conditions de retour et le compte n'en a pas : la personne
  // choisit, une fois, pour le compte (_shared/ebay-brouillon-refus.js) — une politique de son compte.
  ebay_retours_a_choisir: [ORIGINE.UTILISATEUR, "reglage_du_compte"],
  recreation_deja_partie: [ORIGINE.GARDE, "doublon_possible"],
  depot_deja_parti: [ORIGINE.GARDE, "doublon_possible"],
  article_vendu: [ORIGINE.GARDE, "vente_a_confirmer"],
  introuvable_a_confirmer: [ORIGINE.NOUS, "introuvable_a_confirmer"],
  introuvable_persistant: [ORIGINE.NOUS, "introuvable_persistant"],
  capture_incomplete: [ORIGINE.NOUS, "capture_incomplete"],
  ebay_site_etranger: [ORIGINE.NOUS, "site_ebay_non_pris_en_charge"],
  // (26/10 nuit, point 5) Leboncoin refuse le texte de la copie à la modération : FillSell adapte la copie.
  lbc_moderation: [ORIGINE.NOUS, "texte_refuse_moderation"],
  // (29/10, lot B 4.6) Beebs a refusé l'annonce à sa vérification (sans motif) et la relance la redéposerait à
  // l'identique : FillSell la retient (get-pending-jobs) — le refus vient de la plateforme.
  refus_beebs_meme_contenu: [ORIGINE.PLATEFORME, "moderation"],
});

// Le texte, dans l'ordre : la première règle qui reconnaît gagne. Les causes
// « utilisateur » passent AVANT les nôtres (un message de connexion qui cite un
// champ reste une connexion).
const PAR_TEXTE = Object.freeze([
  // ── utilisateur ──
  [/Connexion (Vinted|Leboncoin|Beebs|eBay|Depop|Opla) requise|reconnecte-toi|en attente de ta connexion|Connecte ton compte eBay|connecte-toi (sur vinted|[àa] eBay sur ton ordinateur)|attend que Vinted soit rouvert|attend ton autorisation|reconnexion de s[ée]curit[ée]/i, ORIGINE.UTILISATEUR, "connexion"],
  [/configuration de vendeur|compte eBay n.est pas encore pr[êe]t|mise [àa] niveau de ton compte vendeur|ton nom et (ton )?pr[ée]nom|compte eBay doit d.abord [êe]tre ouvert [àa] la vente/i, ORIGINE.UTILISATEUR, "compte_a_finir"],
  [/compte (Vinted|Leboncoin|Beebs|eBay|Depop) (est )?(restreint|suspendu|bloqu[ée])|bloque tes actions|v[ée]rification anti-robot sur ton compte|(Vinted|Leboncoin|Beebs|eBay|Depop) a restreint ton compte/i, ORIGINE.UTILISATEUR, "compte_restreint"],
  [/tu as indiqu[ée] ne pas vendre/i, ORIGINE.UTILISATEUR, "plateforme_desactivee"],
  [/Arr[êe]t[ée]e? [àa] ta demande|Stopped at your request|abandonn[ée]? .* pour cet article/i, ORIGINE.UTILISATEUR, "arret_demande"],
  [/aucune option gratuite|Valider et payer|pr[êe]te sur Leboncoin/i, ORIGINE.UTILISATEUR, "paiement_plateforme"],
  [/eBay ne le laisse pas encore vendre|eBay a retir[ée] l.acc[èe]s de FillSell/i, ORIGINE.UTILISATEUR, "compte_a_finir"],
  [/Vinted affiche .{0,60} sur ton ordinateur|En attente de ta boutique Vinted/i, ORIGINE.UTILISATEUR, "connexion"],
  // (26/10 nuit, point 14c) « Beebs a besoin de ta rue pour publier » : l'adresse de SES Réglages n'a pas de rue — lui seul la donne.
  [/n.a pas accept[ée] l.adresse d.envoi|a besoin de ta rue pour publier|Pas de retour.* exige que tu acceptes les retours/i, ORIGINE.UTILISATEUR, "reglage_du_compte"],
  // (25/10, N6) Le refus du brouillon qui nomme les retours, et la question qu'il pose : un réglage du compte.
  [/manquants dans le brouillon\s*:[^.]*\bretours?\b|eBay refuse de mettre cet article en vente sans conditions de retour/i, ORIGINE.UTILISATEUR, "reglage_du_compte"],
  // ── garde voulue (doute → question) ──
  [/pourrait (correspondre|[êe]tre cet article)|On ne red[ée]pose pas, pour ne jamais la mettre en double/i, ORIGINE.GARDE, "doublon_possible"],
  [/signal[ée] vendu|Vendue \?/i, ORIGINE.GARDE, "vente_a_confirmer"],
  // ── la plateforme refuse sans motif ──
  // (27/10) Le motif ne dit plus « refusée par sa modération » (une déduction) mais l'absence constatée : « absente de
  // tes annonces … aux relevés complets du … et du …, et Leboncoin n'a donné aucun motif ». Même classe.
  // (30/10, lot E, migration 20261030230000) Leboncoin : « … n'a rien affiché à FillSell … son motif est dans le mail ». Même classe.
  [/n.a jamais mis cette annonce en ligne|refus[ée]e par sa mod[ée]ration|n.a pas mis cette annonce en ligne|refus[ée]e [àa] la v[ée]rification|n.a donn[ée] aucun motif|n.a rien affich[ée] [àa] FillSell/i, ORIGINE.PLATEFORME, "moderation"],
  // ── nous ──
  [/description, le rayon Depop et l.[ée]tat manquent|manquent dans la copie de ton annonce/i, ORIGINE.NOUS, "capture_depop_incomplete"],
  [/frais de port/i, ORIGINE.NOUS, "capture_depop_frais_de_port"],
  [/n.accepte pas (les|ce|cet|cette)|n.accepte pas l.[ée]lectronique|interdit sur (Vinted|Leboncoin|Beebs|eBay|Depop)/i, ORIGINE.NOUS, "article_refuse_entre_en_file"],
  [/n.est plus propos[ée]e par le menu/i, ORIGINE.NOUS, "marque_hors_menu"],
  [/ne conna[îi]t pas la marque|Marque n.a pas pu [êe]tre renseign[ée]|marque .* introuvable/i, ORIGINE.NOUS, "marque_inconnue"],
  [/format du colis/i, ORIGINE.NOUS, "format_colis_refuse"],
  // (25/10, audit N9) Trois causes que la sentinelle rangeait en « autre » : la republication Vinted sans
  // couleur (6ff45122, 775186a3), la sous-catégorie que Vinted demande (cartes « …à l'unité », 328c17f2,
  // 9de4f193 — et la question du moteur qui la pose), la mention d'un site refusée par Leboncoin (3e3074ef,
  // « instagram »). Toutes de notre fait : couleur posée sans question, moteur de rayon, copie nettoyée.
  [/exige une couleur [àa] la cr[ée]ation|aucune couleur n.a pu [êe]tre d[ée]duite/i, ORIGINE.NOUS, "couleur_absente"],
  [/cat[ée]gorie plus pr[ée]cise|ne propose pas « [^»]+ » [àa] cet endroit de son catalogue|Le catalogue Vinted a chang[ée] autour de|n.accepte plus la cat[ée]gorie de cette annonce/i, ORIGINE.NOUS, "sous_categorie_a_choisir"],
  [/mention d.un site internet|site internet autre que leboncoin|ne respectent pas nos r[èe]gles de contenu/i, ORIGINE.NOUS, "texte_refuse_mention_site"],
  // (26/10 nuit, point 5 — 52b5ec71) « Nous refusons ce type de bien ou service », « ne respecte pas nos règles de
  // diffusion » : la modération refuse le TEXTE servi (la même description est en ligne ailleurs) — notre fait.
  [/refusons ce type de bien|ne respecte pas nos r[èe]gles de diffusion|a refus[ée] cette annonce [àa] la mod[ée]ration/i, ORIGINE.NOUS, "texte_refuse_moderation"],
  [/exige des champs encore vides|exige une taille|champs? (obligatoire|requis)|demande .* pour ton compte, et ce champ/i, ORIGINE.NOUS, "champ_demande"],
  [/refuse le titre|titolo|simboli|trop de lettres majuscules|titre (vide|refus[ée])/i, ORIGINE.NOUS, "titre_refuse"],
  [/ISBN/i, ORIGINE.NOUS, "isbn"],
  [/capture .* incompl[èe]te|photo non re-h[ée]berg[ée]e/i, ORIGINE.NOUS, "capture_incomplete"],
  [/s.interrompt (chaque fois )?au m[êe]me moment/i, ORIGINE.NOUS, "interruption_repetee"],
  [/prouver que (l.annonce|cette annonce) t.appartient|n.arrivons pas encore [àa] prouver/i, ORIGINE.NOUS, "appartenance_non_prouvee"],
  [/n.a pas rendu cette annonce [àa] la derni[èe]re lecture|refuse de rendre cette annonce/i, ORIGINE.NOUS, "lecture_annonce_echouee"],
  [/jamais vue en ligne|jamais r[ée]ussi [àa] r[ée]cup[ée]rer son lien|jamais eu son num[ée]ro/i, ORIGINE.NOUS, "depot_non_confirme"],
  [/\[selectors\]|n.a r[ée]solu|s[ée]lecteur/i, ORIGINE.NOUS, "selecteur_casse"],
  [/cat[ée]gorie .* (r[ée]solue|ranger)|rayon/i, ORIGINE.NOUS, "categorie"],
  [/n.est pas dans la liste des marques de Depop/i, ORIGINE.NOUS, "marque_inconnue"],
  [/Cat[ée]gorie eBay [àa] confirmer|CategoryPath absent|article non mapp[ée]/i, ORIGINE.NOUS, "categorie"],
  [/l.[ée]tat de ton annonce .{0,20} n.a pas pu [êe]tre v[ée]rifi[ée]|sur la page de vente Leboncoin/i, ORIGINE.NOUS, "lecture_annonce_echouee"],
  [/Sur quelle de tes boutiques Vinted publier/i, ORIGINE.NOUS, "boutique_a_choisir"],
  [/n.accepte que ses propres valeurs|eBay a refus[ée] la publication/i, ORIGINE.NOUS, "valeur_refusee"],
  [/doit [êe]tre renseign[ée]|Depop exige le genre|Leboncoin demande :/i, ORIGINE.NOUS, "champ_demande"],
  [/capture datait de plus de .{0,10} et la nouvelle capture a [ée]chou[ée]/i, ORIGINE.NOUS, "capture_incomplete"],
  [/exige le code-barres|\bEAN\b/, ORIGINE.NOUS, "ean"],
  // (25/10, R2) eBay n'a reçu aucune photo (refus « Photos » du brouillon, ou le compte des photos reçues de
  // l'extension) : notre fait — avant « n'a pas abouti », qui le rangeait en « inexpliqué ».
  [/manquants dans le brouillon\s*:\s*(?:[^.]*,\s*)?Photos\b|eBay n.a (pas )?re[çc]u (aucune photo|les photos)|Photos non re[çc]ues par eBay/i, ORIGINE.NOUS, "photos_non_recues"],
  // (25/10, N6) Le choix de retours est fait, l'extension du poste ne sait pas encore le poser : notre fait.
  [/choix de retours eBay est bien enregistr[ée]/i, ORIGINE.NOUS, "retours_non_poses"],
  [/n.a pas abouti|On ne sait pas encore pourquoi|apr[èe]s plusieurs essais|n.a pas pu aboutir sur ton ordinateur/i, ORIGINE.NOUS, "echec_inexplique"],
  [/n.arrive pas [àa] d[ée]marrer/i, ORIGINE.NOUS, "demarrage_impossible"],
]);

const PLATEFORMES_QUITTEES = new Set(["opla"]);

/**
 * Classe UN arrêt.
 * @param {{ texte?: string|null, source?: string|null, platform?: string|null }} a
 * @returns {{ origine: string, cause: string }}
 */
export function causeDuTexte({ texte = null, source = null, platform = null } = {}) {
  if (platform && PLATEFORMES_QUITTEES.has(String(platform))) return { origine: ORIGINE.PLATEFORME, cause: "plateforme_quittee" };
  const t = String(texte ?? "");
  // Le texte d'abord quand il dit une cause « utilisateur » ou une garde : une source
  // générique (« relancer », « champ_a_choisir ») ne la contredit jamais.
  for (const [re, origine, cause] of PAR_TEXTE) {
    if (origine === ORIGINE.NOUS) break;
    if (re.test(t)) return { origine, cause };
  }
  const s = PAR_SOURCE[String(source ?? "")];
  if (s) return { origine: s[0], cause: s[1] };
  for (const [re, origine, cause] of PAR_TEXTE) {
    if (origine !== ORIGINE.NOUS) continue;
    if (re.test(t)) return { origine, cause };
  }
  if (String(source ?? "") === "champ_a_choisir") return { origine: ORIGINE.NOUS, cause: "champ_demande" };
  if (String(source ?? "") === "prevol_negatif") return { origine: ORIGINE.NOUS, cause: "prevol_negatif" };
  return { origine: ORIGINE.NOUS, cause: "autre" };
}

const STATUTS_ARRET = new Set(["needs_user", "failed"]);

/**
 * Tous les arrêts d'un job : l'état courant (needs_user / failed) et chaque erreur
 * archivée à l'état needs_user / failed. Un job annulé par l'utilisateur APRÈS un
 * arrêt de notre fait garde cet arrêt, marqué `abandonne: true` : c'est un échec,
 * jamais une annulation.
 * @param {{ status?: string, error?: string|null, platform?: string, action?: string, platform_fields?: object|null }} job
 * @returns {Array<{ origine: string, cause: string, statut: string, le: string|null, texte: string, courant: boolean, abandonne: boolean }>}
 */
export function blocagesDuJob(job) {
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  const out = [];
  // (25/10 nuit, audit N1) « Arrêtée à ta demande » (féminin, arretLot.js) et la marque arret_utilisateur
  // comptent aussi : 12 échecs de notre fait devenaient invisibles.
  const abandonne = job?.status === "cancelled" && (pf.abandon_utilisateur != null || pf.arret_utilisateur != null
    || /Arr[êe]t[ée]e? [àa] ta demande|Stopped at your request/i.test(String(job?.error ?? "")));
  const archives = Array.isArray(pf.erreurs_archivees) ? pf.erreurs_archivees : [];
  // (25/10, audit N9 — 3e3074ef, « instagram » refusé par Leboncoin) Un arrêt AFFICHÉ sous le message générique
  // (« n'a pas abouti… », requalification d'affichage) garde sa vraie cause dans error_technique.brut : quand
  // elle en nomme une de notre fait, c'est elle qui compte — jamais « inexpliqué » quand la cause est écrite.
  const brut = String(pf.error_technique?.brut ?? "");
  const causeBrute = brut ? causeDuTexte({ texte: brut, source: null, platform: job?.platform }) : null;
  const preciser = (c) => (c.cause === "echec_inexplique" && causeBrute?.origine === ORIGINE.NOUS
    && !["echec_inexplique", "autre"].includes(causeBrute.cause) ? causeBrute : c);
  for (const e of archives) {
    if (!e || !STATUTS_ARRET.has(String(e.statut ?? ""))) continue;
    const texte = String(e.erreur ?? "");
    // L'arrêt archivé ne garde pas sa source : seul le texte parle.
    const c = preciser(causeDuTexte({ texte, source: null, platform: job?.platform }));
    out.push({ ...c, statut: String(e.statut), le: e.le ?? null, texte, courant: false, abandonne });
  }
  if (STATUTS_ARRET.has(String(job?.status ?? ""))) {
    const texte = String(job?.error ?? "");
    const c = preciser(causeDuTexte({ texte, source: pf.needs_user_source ?? null, platform: job?.platform }));
    out.push({ ...c, statut: String(job.status), le: null, texte, courant: true, abandonne: false });
  }
  return out;
}

/** Les arrêts de notre fait d'un job (pour la sentinelle et le rejeu). */
export const blocagesDeNotreFait = (job) => blocagesDuJob(job).filter((b) => b.origine === ORIGINE.NOUS);

// Retenues EN FILE (statut pending) qui sont des arrêts de notre fait, même sans needs_user.
// (25/10, R2 et N6) L'arrêt « photos non reçues » et les retours choisis mais non posés attendent en file
// (pending, defaut_fillsell : un poste plus récent) : des arrêts de notre fait, comptés comme tels.
const RETENUES_EN_FILE = new Set(["marque_hors_menu", "photos_non_recues", "retours_non_poses"]);

/**
 * LA SENTINELLE (ops-digest) : les arrêts de notre fait, regroupés par cause × plateforme × action.
 * Un job compte une fois par cause : « en_cours » s'il est encore arrêté (ou retenu en file par une règle
 * de notre fait), « nouveaux » si l'arrêt date d'après `depuis`, « abandonnes » si la personne a ensuite
 * abandonné (un échec, jamais une annulation). Une série d'accidents avant retrait (> 3 reprises) compte
 * comme un arrêt en cours. Pur.
 * @param {Array<object>} jobs  id, user_id, platform, action, status, error, created_at, platform_fields
 * @param {{ depuis?: string|null }} [o]
 */
export function sentinelleArrets(jobs, { depuis = null } = {}) {
  const t0 = Date.parse(String(depuis ?? ""));
  const groupes = new Map();
  for (const j of Array.isArray(jobs) ? jobs : []) {
    const pf = j?.platform_fields && typeof j.platform_fields === "object" ? j.platform_fields : {};
    const arrets = blocagesDeNotreFait(j);
    if (String(j?.status ?? "") === "pending" && j?.error) {
      const c = causeDuTexte({ texte: j.error, source: pf.needs_user_source ?? null, platform: j.platform });
      if (c.origine === ORIGINE.NOUS && RETENUES_EN_FILE.has(c.cause)) arrets.push({ ...c, courant: true, abandonne: false, le: null });
    }
    const reprises = Number(pf.reprise_avant_retrait?.n) || 0;
    if (reprises > 3 && ["pending", "processing", "needs_user"].includes(String(j?.status ?? ""))) {
      arrets.push({ origine: ORIGINE.NOUS, cause: "accidents_repetes_avant_retrait", courant: true, abandonne: false, le: pf.reprise_avant_retrait?.le ?? null });
    }
    const parCause = new Map();
    for (const a of arrets) {
      const p = parCause.get(a.cause) ?? { courant: false, abandonne: false, nouveau: false };
      p.courant ||= Boolean(a.courant);
      p.abandonne ||= Boolean(a.abandonne);
      const le = Date.parse(String(a.courant ? (a.le ?? j?.created_at ?? "") : (a.le ?? "")));
      p.nouveau ||= Number.isFinite(t0) && Number.isFinite(le) && le >= t0;
      parCause.set(a.cause, p);
    }
    for (const [cause, p] of parCause) {
      const cle = `${cause}|${j.platform}|${j.action}`;
      const g = groupes.get(cle) ?? { cause, platform: j.platform, action: j.action, en_cours: 0, nouveaux: 0, abandonnes: 0, comptes: new Set(), exemples: [] };
      if (p.courant) g.en_cours++;
      if (p.nouveau) g.nouveaux++;
      if (p.abandonne) g.abandonnes++;
      if (j.user_id) g.comptes.add(String(j.user_id));
      if (g.exemples.length < 3) g.exemples.push(String(j.id ?? "").slice(0, 8));
      groupes.set(cle, g);
    }
  }
  return [...groupes.values()]
    .map((g) => ({ ...g, comptes: g.comptes.size }))
    .filter((g) => g.en_cours || g.nouveaux || g.abandonnes)
    .sort((a, b) => (b.nouveaux - a.nouveaux) || (b.en_cours - a.en_cours) || String(a.cause).localeCompare(String(b.cause)));
}
