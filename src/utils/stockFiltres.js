// ═══════════════════════════════════════════════════════════════════════════
// STOCK — TRIS, FILTRES, ET « CE QUI COINCE », PAR PLATEFORME
// ═══════════════════════════════════════════════════════════════════════════
// Demande d'une utilisatrice Pro (08/09) : 352 articles, et il fallait faire
// défiler tout le stock pour retrouver quoi que ce soit. Elle a 14 articles
// bloqués et ne les retrouve pas — mesuré en base, le chiffre est exact.
// Sur le parc : 93 articles chez 12 comptes, dont 54 chez un seul.
//
// ⛔ RÈGLE DE FOND, ET ELLE COMMANDE TOUT LE FICHIER (arbitrage Nico 08/09) :
// LE BLOCAGE VIT SUR LA PLATEFORME, JAMAIS SUR L'ARTICLE. Un article dont la
// publication Beebs réclame une taille reste publiable sur eBay, republiable
// sur Vinted et vendable. Rien ici ne rend un article « bloqué » : on rend, par
// article, la LISTE des plateformes qui réclament quelque chose — et l'écran
// n'enlève jamais une action à cause d'un filtre.
//
// ⛔ AUCUN STATUT N'EST INVENTÉ. « À compléter » lit les jobs 'needs_user',
// « En échec » les 'failed' — tels qu'ils existent déjà. Aucune écriture, aucun
// champ d'inventaire touché : ce module ne fait que LIRE et compter.
//
// ⛔ LES PLATEFORMES EN LIGNE VIENNENT DE computeRemovalInfo, jamais d'un
// second calcul « équivalent ». C'est la fonction qui décide déjà quels logos
// s'affichent sur la carte : si les compteurs de filtre divergeaient d'elle,
// on annoncerait « 134 absents de Leboncoin » sur un critère que l'écran
// n'applique pas — un compteur qui ment, exactement le piège déjà pris avec le
// bloc de republication automatique (cf. RepublishAutoBlock).
// ═══════════════════════════════════════════════════════════════════════════

import { computeRemovalInfo } from './publicationState';

export const PLATEFORMES_STOCK = ['vinted', 'leboncoin', 'beebs', 'ebay'];

export const LIBELLE_PLATEFORME = {
  vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay',
};

// ── Le champ qui manque, dit en français ────────────────────────────────────
// La source est le job, dans cet ordre de précision : le champ précis que le
// handler a nommé (needsUserField, posé par le content script — l'app ne
// devine rien), puis la liste champs_a_completer du pré-vol. Les clés
// techniques ci-dessous sont celles qu'on a réellement vues en base ; une clé
// inconnue est rendue TELLE QUELLE plutôt que traduite au hasard — mieux vaut
// un mot brut qu'un mot faux.
const CHAMPS_FR = {
  taille: 'la taille', size: 'la taille', clothing_st: 'la taille',
  marque: 'la marque', brand: 'la marque', sans_marque: 'la marque',
  etat: "l'état", condition: "l'état", status: "l'état",
  couleur: 'la couleur', color: 'la couleur',
  matiere: 'la matière', material: 'la matière',
  univers: "l'univers", clothing_type: "l'univers", shoe_type: "l'univers",
  house_and_garden_type: "l'univers",
  categorie: 'la catégorie', category: 'la catégorie', catalog_id: 'la catégorie',
  colis: 'la taille du colis', package_size_id: 'la taille du colis',
  format_colis: 'la taille du colis',
  isbn: "l'ISBN", description: 'la description', photos: 'les photos',
  prix: 'le prix', price: 'le prix', title: 'le titre', titre: 'le titre',
  modele: 'le modèle', model: 'le modèle',
  produit: 'le produit', decoration_type: 'le produit',
};

const CHAMPS_FR_EN = {
  'la taille': 'the size', 'la marque': 'the brand', "l'état": 'the condition',
  'la couleur': 'the colour', 'la matière': 'the material', "l'univers": 'the category',
  'la catégorie': 'the category', 'la taille du colis': 'the parcel size',
  "l'ISBN": 'the ISBN', 'la description': 'the description', 'les photos': 'the photos',
  'le prix': 'the price', 'le titre': 'the title', 'le modèle': 'the model',
  'le produit': 'the product',
};

/** Nettoie une clé technique (« taille (size_id → libellé) » → « taille »). */
function cleNue(brut) {
  return String(brut ?? '').trim().split(/[\s(]/)[0].toLowerCase();
}

/**
 * Ce qui manque sur CE job, en français, sans jamais inventer.
 * Rend null quand le job ne le dit pas — l'écran affiche alors « à compléter »
 * tout court, ce qui reste vrai.
 */
export function champManquant(job, lang = 'fr') {
  const pf = job?.platform_fields ?? {};
  const brut = pf.needsUserField?.field_label
    ?? pf.needsUserField?.field_key
    ?? (Array.isArray(pf.champs_a_completer) ? pf.champs_a_completer[0] : null);
  if (!brut) return null;
  const fr = CHAMPS_FR[cleNue(brut)] ?? String(brut).trim();
  if (lang === 'en') return CHAMPS_FR_EN[fr] ?? fr;
  return fr;
}

/**
 * L'état d'un article, plateforme par plateforme.
 * @param {object[]} jobs  tous les jobs de l'article (jobsByInventaire[id])
 * @returns {{enLigne:string[], aCompleter:object[], enEchec:object[]}}
 *   aCompleter / enEchec : [{ platform, job, champ }] — UNE entrée par
 *   plateforme, la plus récente gagnant si plusieurs jobs se répondent.
 */
export function etatPlateformes(jobs, lang = 'fr') {
  const liste = Array.isArray(jobs) ? jobs : [];
  const { publishedActive } = computeRemovalInfo(liste);
  const aCompleter = new Map();
  const enEchec = new Map();
  // Du plus ancien au plus récent : le dernier écrit gagne, donc l'état le
  // plus frais l'emporte sans avoir à trier deux fois.
  const parDate = liste.slice().sort(
    (a, b) => (Date.parse(a?.created_at ?? '') || 0) - (Date.parse(b?.created_at ?? '') || 0),
  );
  for (const j of parDate) {
    const p = j?.platform;
    if (!p || !PLATEFORMES_STOCK.includes(p)) continue;
    if (j.action === 'delete') continue;
    if (j.status === 'needs_user') {
      aCompleter.set(p, { platform: p, job: j, champ: champManquant(j, lang) });
      enEchec.delete(p);
    } else if (j.status === 'failed') {
      enEchec.set(p, { platform: p, job: j, champ: null });
      aCompleter.delete(p);
    } else if (j.status === 'published' || j.status === 'pending' || j.status === 'processing') {
      // Un job reparti efface l'ardoise de CETTE plateforme : sans ça, un
      // needs_user résolu la semaine dernière la marquerait à vie.
      aCompleter.delete(p);
      enEchec.delete(p);
    }
  }
  return {
    enLigne: Array.isArray(publishedActive) ? publishedActive : [],
    aCompleter: [...aCompleter.values()],
    enEchec: [...enEchec.values()],
  };
}

/** Index { id → état } pour toute une liste. Un seul passage. */
export function indexEtatStock(items, jobsByInventaire, lang = 'fr') {
  const index = new Map();
  for (const it of items ?? []) {
    if (!it?.id) continue;
    index.set(String(it.id), etatPlateformes(jobsByInventaire?.[it.id], lang));
  }
  return index;
}

// ── Compteurs ───────────────────────────────────────────────────────────────
// ⛔ Un filtre à zéro ne s'affiche pas : c'est la règle produit (« le nombre
// avant le clic »), et un chip qui promet 0 article est une porte fermée.
export function compteursStock(items, index) {
  const enLigne = {}; const pasEncore = {};
  for (const p of PLATEFORMES_STOCK) { enLigne[p] = 0; pasEncore[p] = 0; }
  let jamais = 0; let aCompleter = 0; let enEchec = 0;
  for (const it of items ?? []) {
    const e = index.get(String(it?.id));
    if (!e) continue;
    for (const p of PLATEFORMES_STOCK) {
      if (e.enLigne.includes(p)) enLigne[p] += 1; else pasEncore[p] += 1;
    }
    if (!e.enLigne.length) jamais += 1;
    if (e.aCompleter.length) aCompleter += 1;
    if (e.enEchec.length) enEchec += 1;
  }
  return { enLigne, pasEncore, jamais, aCompleter, enEchec };
}

// ── Filtres ─────────────────────────────────────────────────────────────────
// `diffusion` : { mode:'en_ligne'|'pas_encore', platform } | { mode:'jamais' } | null
// `probleme`  : 'a_completer' | 'en_echec' | null
// Ils se COMBINENT, et se combinent aussi avec les filtres existants (type,
// marque, boutique, recherche) puisqu'on reçoit déjà leur résultat.
export function filtrerStock(items, index, { diffusion = null, probleme = null } = {}) {
  let out = items ?? [];
  if (diffusion?.mode === 'jamais') {
    out = out.filter((it) => !(index.get(String(it?.id))?.enLigne.length));
  } else if (diffusion?.mode && diffusion.platform) {
    const p = diffusion.platform;
    const veutEnLigne = diffusion.mode === 'en_ligne';
    out = out.filter((it) => {
      const e = index.get(String(it?.id));
      if (!e) return false;
      return e.enLigne.includes(p) === veutEnLigne;
    });
  }
  if (probleme === 'a_completer') {
    out = out.filter((it) => index.get(String(it?.id))?.aCompleter.length);
  } else if (probleme === 'en_echec') {
    out = out.filter((it) => index.get(String(it?.id))?.enEchec.length);
  }
  return out;
}

// ── Tris ────────────────────────────────────────────────────────────────────
// 'defaut' NE TRIE PAS : il rend la liste telle qu'elle arrive, c'est-à-dire
// l'ordre déjà construit par App.jsx (jamais-en-ligne d'abord, puis annonces de
// la plus ancienne à la plus récente). C'est le tri « ancienneté de l'annonce »
// demandé — il existait déjà, on ne le réécrit pas.
export const TRIS_STOCK = ['defaut', 'prix_desc', 'prix_asc', 'ajout_desc', 'ajout_asc'];

const nombreOuNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function trierStock(items, tri) {
  const liste = items ?? [];
  if (!tri || tri === 'defaut') return liste;
  // Copie indexée : deux valeurs égales ne permutent JAMAIS (l'acquis
  // anti-saut de la galerie tient — un tri instable fait sauter la liste sous
  // le doigt pendant qu'on scrolle).
  const paires = liste.map((it, k) => [it, k]);
  const parCle = (lire, croissant) => paires.sort((a, b) => {
    const va = lire(a[0]); const vb = lire(b[0]);
    // Valeur inconnue TOUJOURS en fin de liste, dans les deux sens : on ne
    // prétend pas qu'un prix absent vaut zéro (règle VIDE ≠ ZÉRO).
    if (va == null && vb == null) return a[1] - b[1];
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va === vb) return a[1] - b[1];
    return croissant ? (va < vb ? -1 : 1) : (va > vb ? -1 : 1);
  }).map(([it]) => it);

  if (tri === 'prix_desc') return parCle((it) => nombreOuNull(it?.prix_vente), false);
  if (tri === 'prix_asc') return parCle((it) => nombreOuNull(it?.prix_vente), true);
  if (tri === 'ajout_desc') return parCle((it) => Date.parse(it?.created_at ?? '') || null, false);
  if (tri === 'ajout_asc') return parCle((it) => Date.parse(it?.created_at ?? '') || null, true);
  return liste;
}

export function libelleTri(tri, lang = 'fr') {
  const fr = lang !== 'en';
  return {
    defaut: fr ? "Annonce la plus ancienne" : 'Oldest listing',
    prix_desc: fr ? 'Prix décroissant' : 'Price high to low',
    prix_asc: fr ? 'Prix croissant' : 'Price low to high',
    ajout_desc: fr ? 'Ajouté récemment' : 'Recently added',
    ajout_asc: fr ? "Ajouté il y a longtemps" : 'Added long ago',
  }[tri] ?? (fr ? "Annonce la plus ancienne" : 'Oldest listing');
}

// ── La pastille de la carte ─────────────────────────────────────────────────
// ⛔ UN NOM DE PLATEFORME NE SE TRONQUE JAMAIS (réserve Nico du 08/09) : un
// « 1 échec · Leb… » ne dit rien à personne, c'est pire que pas de nom. La
// règle est donc de ne nommer QUE lorsqu'il y a une seule plateforme
// concernée ; dès qu'il y en a deux, on COMPTE. L'anneau posé sur le logo, lui,
// ne tronque pas — et le libellé le plus long possible ici
// (« À compléter · Leboncoin ») tient dans la rangée .icons, qui défile de
// toute façon à l'horizontale.
export function pastillesEtat(etat, lang = 'fr') {
  const fr = lang !== 'en';
  const out = [];
  const nc = etat?.aCompleter?.length ?? 0;
  const ne = etat?.enEchec?.length ?? 0;
  // ⛔ ON NE NOMME LA PLATEFORME QUE S'IL N'Y A QU'UNE SEULE PASTILLE.
  // Avec deux pastilles côte à côte, « À compléter · Beebs » puis « 2 échecs »
  // ne tiennent pas dans la largeur d'une carte : la seconde se coupait en
  // « 2 éc… » (capture Nico, 08/09). Un compte tronqué ne vaut pas mieux qu'un
  // nom tronqué. Dès qu'il y a deux registres, les deux comptent au lieu de
  // nommer — et le détail complet reste dans le title, la popup le dit en
  // entier.
  const deuxPastilles = nc > 0 && ne > 0;
  if (nc === 1 && !deuxPastilles) {
    const e = etat.aCompleter[0];
    const nom = LIBELLE_PLATEFORME[e.platform] ?? e.platform;
    out.push({
      ton: 'warn', platform: e.platform, job: e.job,
      texte: fr ? `À compléter · ${nom}` : `To complete · ${nom}`,
      detail: e.champ
        ? (fr ? `${nom} : il manque ${e.champ}` : `${nom}: ${e.champ} is missing`)
        : (fr ? `${nom} attend une information` : `${nom} is waiting for information`),
    });
  } else if (nc >= 1) {
    out.push({
      ton: 'warn', platform: null, job: null,
      texte: fr ? `${nc} à compléter` : `${nc} to complete`,
      detail: etat.aCompleter
        .map((e) => {
          const nom = LIBELLE_PLATEFORME[e.platform] ?? e.platform;
          return e.champ
            ? (fr ? `${nom} : il manque ${e.champ}` : `${nom}: ${e.champ} is missing`)
            : nom;
        })
        .join(fr ? ' · ' : ' · '),
    });
  }
  if (ne === 1 && !deuxPastilles) {
    const e = etat.enEchec[0];
    const nom = LIBELLE_PLATEFORME[e.platform] ?? e.platform;
    out.push({
      ton: 'err', platform: e.platform, job: e.job,
      texte: fr ? `1 échec · ${nom}` : `1 failure · ${nom}`,
      detail: fr ? `${nom} : la publication a échoué` : `${nom}: publishing failed`,
    });
  } else if (ne >= 1) {
    out.push({
      ton: 'err', platform: null, job: null,
      texte: fr ? `${ne} échec${ne > 1 ? 's' : ''}` : `${ne} failure${ne > 1 ? 's' : ''}`,
      detail: etat.enEchec.map((e) => LIBELLE_PLATEFORME[e.platform] ?? e.platform).join(' · '),
    });
  }
  return out;
}
