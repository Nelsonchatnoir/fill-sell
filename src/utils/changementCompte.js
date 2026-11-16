// ═══════════════════════════════════════════════════════════════════════════
// « TON ORDINATEUR EST CONNECTÉ À UN AUTRE COMPTE LEBONCOIN » — LES TEXTES (16/11/2026, point 4 puis point 7 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Module PUR (aucun import, aucun accès réseau) : lu par src/stock/ChangementCompte.jsx et par le verrou
// scripts/comptes-plateforme-remplacer-selftest.mjs. La base (migration 20261116200000) retient UN compte suivi par
// plateforme ; quand le dernier relevé complet de l'ordinateur lit un autre compte, compte_plateforme_a_confirmer() rend
// une ligne { platform, cas, compte_lu, releve_le, annonces_lues, compte_suivi, simulation } — la simulation est le bilan
// de remplacer_compte_plateforme(…, p_simuler = true). Ici, seulement les phrases.
// Règles des textes (16/10, selftest:aucune-estimation) : jamais un mot technique, un émoji, une durée ni une heure prévue ;
// le compte vient TOUJOURS du dernier relevé (jamais une saisie) ; « ce n'est pas une vente », « rien n'est retiré ».

const NOMS = { leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', vinted: 'Vinted', ebay: 'eBay' };

export function nomPlateforme(platform) {
  return NOMS[platform] ?? (platform ? String(platform) : 'Leboncoin');
}

/** Le numéro d'un compte de plateforme, court et lisible : « n° 23b59b14 ». */
export function compteCourt(compte) {
  const c = String(compte ?? '').trim();
  if (!c) return '';
  return `n° ${c.length > 8 ? c.slice(0, 8) : c}`;
}

function nombre(n, lang) {
  const v = Number(n) || 0;
  return lang === 'en' ? String(v) : v.toLocaleString('fr-FR');
}

function pluriel(n, un, plusieurs) {
  return (Number(n) || 0) > 1 ? plusieurs : un;
}

/** « 16/11 à 14:16 » (heure de Paris), ou '' si la date est illisible. */
export function dateReleve(iso, lang = 'fr') {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' }).format(d);
  const heure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return lang === 'en' ? `${jour} at ${heure}` : `${jour} à ${heure}`;
}

function liste(mots, lang) {
  const l = mots.filter(Boolean);
  if (l.length <= 1) return l[0] ?? '';
  return `${l.slice(0, -1).join(', ')} ${lang === 'en' ? 'and' : 'et'} ${l[l.length - 1]}`;
}

/** L'ancien compte d'une question : le compte suivi, sinon les comptes que la simulation clôt. */
export function ancienCompte(q) {
  if (q?.compte_suivi) return [q.compte_suivi];
  const a = q?.simulation?.anciens;
  return Array.isArray(a) ? a.filter(Boolean) : [];
}

/**
 * La question posée à la personne (une ligne de compte_plateforme_a_confirmer()).
 * @returns {{ titre, texte, detail, voir, oui, non, nAnciennes }}
 */
export function questionChangementCompte(q, lang = 'fr') {
  const en = lang === 'en';
  const pf = nomPlateforme(q?.platform);
  const nouveau = compteCourt(q?.compte_lu);
  const anciens = ancienCompte(q).map(compteCourt);
  const nAnciennes = Number(q?.simulation?.annonces ?? 0) + (q?.simulation?.annonces_republication_engagee_laissees?.length ?? 0);
  const lues = Number(q?.annonces_lues ?? 0);
  const quand = dateReleve(q?.releve_le, lang);
  const titre = en ? `${pf} account` : `Compte ${pf}`;
  const texte = en
    ? `Your computer is signed in to another ${pf} account: ${nouveau}. Your old account ${liste(anciens, lang)}: ${nombre(nAnciennes, lang)} ${pluriel(nAnciennes, 'listing', 'listings')}.`
    : `Ton ordinateur est connecté à un autre compte ${pf} : ${nouveau}. Ton ancien compte ${liste(anciens, lang)} : ${nombre(nAnciennes, lang)} ${pluriel(nAnciennes, 'annonce', 'annonces')}.`;
  const detail = lues > 0
    ? (en
      ? `Read by your computer${quand ? ` on ${quand}` : ''}: ${nombre(lues, lang)} ${pluriel(lues, 'listing', 'listings')} on ${nouveau}.`
      : `Lu par ton ordinateur${quand ? ` le ${quand}` : ''} : ${nombre(lues, lang)} ${pluriel(lues, 'annonce', 'annonces')} sur le compte ${nouveau}.`)
    : '';
  return {
    titre, texte, detail, nAnciennes,
    voir: en ? 'See what changes' : 'Voir ce qui change',
    oui: en ? 'Yes, follow this account' : 'Oui, suivre ce compte',
    non: en ? 'No, keep the old one' : 'Non, garder l’ancien',
  };
}

/** Ce qui change, phrase par phrase, à partir de la simulation (ou du bilan du geste fait). */
export function bilanChangementCompte(sim, lang = 'fr', platform = 'leboncoin') {
  const en = lang === 'en';
  const pf = nomPlateforme(platform);
  if (!sim || sim.ok === false) return [];
  const out = [];
  const n = Number(sim.annonces ?? 0);
  out.push(en
    ? `FillSell will stop following the ${nombre(n, lang)} ${pluriel(n, 'listing', 'listings')} of your old account. It is not a sale: nothing is removed and no item leaves your stock.`
    : `FillSell ne suivra plus ${n > 1 ? `les ${nombre(n, lang)} annonces` : 'l’annonce'} de ton ancien compte. Ce n’est pas une vente : rien n’est retiré et aucun article ne quitte ton stock.`);
  const nq = Number(sim.questions_vendue ?? 0) + Number(sim.premieres_lectures_hors_ligne ?? 0);
  if (nq > 0) {
    out.push(en
      ? `${nombre(nq, lang)} “Sold?” ${pluriel(nq, 'question', 'questions')} on these listings will be closed: they are not sales.`
      : `${nombre(nq, lang)} ${pluriel(nq, 'question', 'questions')} « Vendue ? » sur ces annonces ${pluriel(nq, 'sera close', 'seront closes')} : ce ne sont pas des ventes.`);
  }
  const nl = Number(sim.fiches_liberees ?? 0);
  if (nl > 0) {
    out.push(en
      ? `${nombre(nl, lang)} ${pluriel(nl, 'item', 'items')} can be listed on ${pf} again.`
      : `${nombre(nl, lang)} ${pluriel(nl, 'article pourra', 'articles pourront')} de nouveau être ${pluriel(nl, 'publié', 'publiés')} sur ${pf}.`);
  }
  const vendus = Array.isArray(sim.objets_vendus_encore_en_ligne) ? sim.objets_vendus_encore_en_ligne : [];
  if (vendus.length) {
    const titres = liste(vendus.map((o) => (o?.titre ? `« ${String(o.titre).trim()} »` : (en ? `listing ${o?.numero ?? ''}` : `annonce ${o?.numero ?? ''}`))), lang);
    out.push(en
      ? `Sold items still online on your old account: ${titres}. If that account is still open, remove them yourself.`
      : `${pluriel(vendus.length, 'Objet vendu encore en ligne', 'Objets vendus encore en ligne')} sur ton ancien compte : ${titres}. Si ce compte est encore ouvert, retire-${pluriel(vendus.length, 'le', 'les')} toi-même.`);
  }
  const retraits = Array.isArray(sim.retraits) ? sim.retraits : [];
  if (retraits.length) {
    out.push(en
      ? `${nombre(retraits.length, lang)} ${pluriel(retraits.length, 'removal', 'removals')} FillSell can no longer do on your old account: remove ${pluriel(retraits.length, 'it', 'them')} yourself if the account is still open.`
      : `${nombre(retraits.length, lang)} ${pluriel(retraits.length, 'retrait', 'retraits')} que FillSell ne peut plus faire sur ton ancien compte : si ce compte est encore ouvert, ${pluriel(retraits.length, 'fais-le', 'fais-les')} toi-même.`);
  }
  const nr = Number(sim.republications ?? 0);
  if (nr > 0) {
    out.push(en
      ? `${nombre(nr, lang)} ${pluriel(nr, 'repost', 'reposts')} not started yet will be stopped (the quota is given back).`
      : `${nombre(nr, lang)} ${pluriel(nr, 'republication', 'republications')} pas encore ${pluriel(nr, 'lancée sera arrêtée', 'lancées seront arrêtées')} (le quota est rendu).`);
  }
  const engagees = Array.isArray(sim.annonces_republication_engagee_laissees) ? sim.annonces_republication_engagee_laissees.length : 0;
  if (engagees > 0) {
    out.push(en
      ? `${nombre(engagees, lang)} ${pluriel(engagees, 'listing being reposted is', 'listings being reposted are')} followed until the repost is done.`
      : `${nombre(engagees, lang)} ${pluriel(engagees, 'annonce en cours de republication reste suivie', 'annonces en cours de republication restent suivies')} jusqu’au bout.`);
  }
  return out;
}

const REFUS = {
  fr: {
    session: 'Reconnecte-toi à FillSell, puis réessaie.',
    plateforme: 'FillSell ne sait changer que ton compte Leboncoin.',
    compte_invalide: 'Ce compte n’est pas reconnu : lance « Synchroniser » depuis ton ordinateur, puis réessaie.',
    aucun_releve: 'Ton ordinateur n’a pas encore lu de compte : lance « Synchroniser » depuis ton ordinateur, puis réessaie.',
    pas_le_dernier_releve: 'Ton ordinateur a lu un autre compte depuis : lance « Synchroniser », puis réessaie.',
    releve_incomplet: 'Le dernier relevé de tes annonces n’a pas tout lu : lance « Synchroniser », puis réessaie.',
    releve_en_cours: 'Un relevé de tes annonces est en cours : réessaie quand il sera fini.',
    tache_en_cours: 'FillSell travaille sur une de tes annonces : réessaie quand elle sera finie.',
    erreur: 'Le changement n’a pas pu se faire. Réessaie.',
  },
  en: {
    session: 'Sign back in to FillSell, then try again.',
    plateforme: 'FillSell can only change your Leboncoin account.',
    compte_invalide: 'This account is not recognised: tap “Sync” on your computer, then try again.',
    aucun_releve: 'Your computer has not read an account yet: tap “Sync” on your computer, then try again.',
    pas_le_dernier_releve: 'Your computer has read another account since: tap “Sync”, then try again.',
    releve_incomplet: 'The last scan of your listings did not read everything: tap “Sync”, then try again.',
    releve_en_cours: 'A scan of your listings is running: try again when it is done.',
    tache_en_cours: 'FillSell is working on one of your listings: try again when it is done.',
    erreur: 'The change could not be made. Try again.',
  },
};

/** Le refus d'un appel à remplacer_compte_plateforme, en clair (jamais le texte brut du serveur). */
export function messageRefusChangement(r, lang = 'fr') {
  const T = REFUS[lang === 'en' ? 'en' : 'fr'];
  return T[r?.motif] ?? T.erreur;
}

/** Le geste fait. */
export function messageChangementFait(r, lang = 'fr', platform = 'leboncoin') {
  const en = lang === 'en';
  const pf = nomPlateforme(platform);
  const n = Number(r?.annonces_closes ?? r?.annonces ?? 0);
  if (r?.deja) return en ? `FillSell already follows this ${pf} account.` : `FillSell suit déjà ce compte ${pf}.`;
  return en
    ? `Done: FillSell now follows this ${pf} account. ${nombre(n, lang)} ${pluriel(n, 'listing', 'listings')} of your old account ${pluriel(n, 'is', 'are')} no longer followed. Nothing was removed.`
    : `C’est fait : FillSell suit désormais ce compte ${pf}. ${n > 1 ? `Les ${nombre(n, lang)} annonces` : 'L’annonce'} de ton ancien compte ${n > 1 ? 'ne sont plus suivies' : 'n’est plus suivie'}. Rien n’a été retiré.`;
}

/** « Non, garder l'ancien » : rien ne change, le geste à faire. */
export function messageGarderAncien(lang = 'fr', platform = 'leboncoin') {
  const pf = nomPlateforme(platform);
  return lang === 'en'
    ? `Nothing changes. Sign your computer back in to your usual ${pf} account, then tap “Sync”.`
    : `Rien ne change. Reconnecte ton ordinateur à ton compte ${pf} habituel, puis lance « Synchroniser ».`;
}

/** La ligne de « À régler » (une par plateforme concernée ; n = nombre de questions). */
export function ligneChangementCompte(questions, lang = 'fr') {
  const qs = Array.isArray(questions) ? questions.filter(Boolean) : [];
  if (!qs.length) return null;
  const q = qs[0];
  const pf = nomPlateforme(q.platform);
  const { nAnciennes } = questionChangementCompte(q, lang);
  return {
    cle: 'compte_change', n: qs.length,
    titre: lang === 'en' ? `${pf}: another account is signed in` : `${pf} : un autre compte est connecté`,
    detail: lang === 'en'
      ? `Your computer reads ${compteCourt(q.compte_lu)}. Choose which account FillSell follows (${nombre(nAnciennes, lang)} ${pluriel(nAnciennes, 'listing', 'listings')} on the old one).`
      : `Ton ordinateur lit le compte ${compteCourt(q.compte_lu)}. Choisis le compte que FillSell suit (${nombre(nAnciennes, lang)} ${pluriel(nAnciennes, 'annonce', 'annonces')} sur l’ancien).`,
  };
}

const IMPORT_REFUSE = {
  fr: {
    autre_compte: 'Cette annonce est sur un autre compte Leboncoin que celui que FillSell suit : elle n’entre pas dans ton stock.',
    compte_quitte: 'Cette annonce est sur ton ancien compte Leboncoin, que FillSell ne suit plus : elle n’entre pas dans ton stock.',
    compte_a_confirmer: 'Ton ordinateur a lu deux comptes Leboncoin : choisis d’abord celui que FillSell suit (À régler), puis cette annonce pourra entrer dans ton stock.',
  },
  en: {
    autre_compte: 'This listing is on another Leboncoin account than the one FillSell follows: it does not enter your stock.',
    compte_quitte: 'This listing is on your old Leboncoin account, which FillSell no longer follows: it does not enter your stock.',
    compte_a_confirmer: 'Your computer has read two Leboncoin accounts: first choose the one FillSell follows (To fix), then this listing can enter your stock.',
  },
};

/**
 * Le refus d'un import (rapprochement_decider → rapprocher_importer) pour une annonce d'un compte non suivi : la phrase
 * vraie, à la place du message générique du serveur. null pour tout autre refus (le message du serveur reste).
 */
export function texteImportRefuse(r, lang = 'fr') {
  if (r?.reason !== 'annonce_non_prouvee_vivante') return null;
  return IMPORT_REFUSE[lang === 'en' ? 'en' : 'fr'][r?.motif] ?? null;
}
