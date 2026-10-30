// ═══════════════════════════════════════════════════════════════════════════
// UNE DESCRIPTION ÉCRITE PAR FILLSELL NE CONTREDIT JAMAIS LA FICHE (26/10, règles 4 et 5 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Vu sur la maquette du lot (hoodie Nike de Nico) : « Bon état général » pour une fiche « Très bon état », et
// « #femme » inventé. Deux règles, appliquées au texte qui PART (construireJobs) et à celui qu'on MONTRE :
//   4. un texte rédigé par FillSell garde l'état de la fiche (une autre formule d'état est remplacée par la sienne),
//      son genre (« homme » contre une fiche « femme » est réécrit ; « pour femme » sans rien qui le fonde tombe)
//      et ne garde que les hashtags que la fiche fonde (un mot de son titre, de sa marque, de sa couleur, de sa
//      matière, de sa taille, de son texte) — jamais un genre, un style ou une marque inventés ;
//   5. des hashtags seulement là où ils servent : Vinted, et Depop dans sa limite de 5 ; jamais sur Leboncoin,
//      eBay, Beebs ni Opla (une ligne de hashtags tombe, un « #mot » dans une phrase redevient « mot »).
// ⛔ LE TEXTE DU VENDEUR FAIT FOI : (30/10, lot E) il part tel qu'il l'a écrit sur TOUTES les plateformes, hashtags
//    compris, comme toute ligne qu'il a ajoutée ou retouchée dans un texte de FillSell (lignesEcritesParLaPersonne).
//    Les règles 4 et 5 ne touchent que ce que FillSell a rédigé. Rien n'est jamais AJOUTÉ à un texte.
// Pur (Node + navigateur) : scripts/description-fidele-selftest.mjs.

const PLATEFORMES_A_HASHTAGS = { vinted: Infinity, depop: 5 };
const RE_HASHTAG = /(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_'-]*)/gu;

const comparable = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Les formules d'état, de la plus longue à la plus courte (une formule courte ne coupe jamais une longue).
const FORMULES_ETAT = [
  { re: /neuf avec (?:son |l')?etiquette/, canon: "neuf avec etiquette" },
  { re: /neuf sans (?:son |l')?etiquette/, canon: "neuf sans etiquette" },
  { re: /tres bon etat/, canon: "tres bon etat" },
  { re: /excellent etat/, canon: "tres bon etat" },
  { re: /etat neuf|comme neuf/, canon: "neuf" },
  { re: /bon etat/, canon: "bon etat" },
  { re: /etat (?:correct|satisfaisant|moyen)/, canon: "satisfaisant" },
];
function canonEtat(etat) {
  const t = comparable(etat);
  for (const f of FORMULES_ETAT) if (f.re.test(t)) return f.canon;
  if (/^neuf/.test(t)) return "neuf";
  if (/satisfaisant/.test(t)) return "satisfaisant";
  return null;
}

/**
 * L'état de la fiche, remis dans un texte rédigé : chaque formule d'état DIFFÉRENTE de celle de la fiche est
 * remplacée par l'état de la fiche (casse de la phrase gardée). Une fiche sans état connu : rien ne change.
 */
export function etatFidele(texte, etatFiche) {
  const voulu = canonEtat(etatFiche);
  const t = String(texte ?? "");
  if (!voulu || !t) return t;
  const motFiche = String(etatFiche).trim();
  // Une seule passe, sur le texte comparable aligné caractère pour caractère (NFD retiré par caractère).
  const plat = [...t].map((c) => comparable(c) || c).join("");
  if (plat.length !== t.length) return t; // un caractère qui change de longueur : on ne touche à rien
  const motifs = new RegExp(FORMULES_ETAT.map((f) => f.re.source).join("|"), "g");
  let sortie = "", dernier = 0, m;
  while ((m = motifs.exec(plat))) {
    const canon = canonEtat(m[0]);
    if (canon && canon !== voulu) {
      const original = t.slice(m.index, m.index + m[0].length);
      const majuscule = /^\p{Lu}/u.test(original);
      const remplacement = majuscule ? motFiche.charAt(0).toUpperCase() + motFiche.slice(1) : motFiche.charAt(0).toLowerCase() + motFiche.slice(1);
      sortie += t.slice(dernier, m.index) + remplacement;
      dernier = m.index + m[0].length;
    }
  }
  return sortie + t.slice(dernier);
}

// Le genre : seuls « femme » et « homme » se contredisent franchement (un « enfant », un « mixte » ne se réécrit pas).
function canonGenre(genre) {
  const t = comparable(genre).trim();
  if (/^(femmes?|woman|women|fille)/.test(t)) return "femme";
  if (/^(hommes?|man|men|garcon)/.test(t)) return "homme";
  return null;
}

/**
 * Le genre de la fiche, remis dans un texte rédigé. Fiche « femme » ou « homme » : le mot contraire (« homme »,
 * « hommes ») devient celui de la fiche, casse gardée. Fiche sans genre (ni sur son titre, ni dans le texte du
 * vendeur) : « pour femme », « pour homme » tombent — un genre que rien ne fonde est une info inventée.
 */
export function genreFidele(texte, fiche = {}) {
  const t = String(texte ?? "");
  if (!t) return t;
  const plat = [...t].map((c) => comparable(c) || c).join("");
  if (plat.length !== t.length) return t;
  const voulu = canonGenre(fiche.genre);
  if (voulu) {
    const contraire = voulu === "femme" ? "homme" : "femme";
    const re = new RegExp(`(^|[^a-z0-9])(${contraire})(s?)(?=[^a-z0-9]|$)`, "g");
    let sortie = "", dernier = 0, m;
    while ((m = re.exec(plat))) {
      const debut = m.index + m[1].length;
      const original = t.slice(debut, debut + m[2].length);
      const mot = /^\p{Lu}/u.test(original) ? voulu.charAt(0).toUpperCase() + voulu.slice(1) : voulu;
      sortie += t.slice(dernier, debut) + mot;
      dernier = debut + m[2].length;
    }
    return sortie + t.slice(dernier);
  }
  const fondement = comparable([fiche.titre, fiche.texteVendeur, fiche.objet].filter(Boolean).join(" "));
  if (/(^|[^a-z0-9])(femmes?|hommes?)([^a-z0-9]|$)/.test(fondement)) return t;
  const re = /[ \t]+pour (?:une |un )?(?:femmes?|hommes?)(?=[^a-z0-9]|$)/g;
  let sortie = "", dernier = 0, m;
  while ((m = re.exec(plat))) {
    sortie += t.slice(dernier, m.index);
    dernier = m.index + m[0].length;
  }
  return sortie + t.slice(dernier);
}

/** Les mots que la fiche fonde : titre, marque, couleur, matière, taille, texte du vendeur. */
export function motsDeLaFiche(fiche = {}) {
  const sources = [fiche.titre, fiche.marque, fiche.couleur, fiche.matiere, fiche.taille, fiche.genre, fiche.texteVendeur, fiche.objet]
    .filter(Boolean).join(" ");
  return new Set(comparable(sources).split(/[^a-z0-9]+/).filter((w) => w.length >= 2));
}

/**
 * Le texte qui part sur UNE plateforme.
 * @param {string} texte
 * @param {string} platform
 * @param {{ fiche?: object, texteDuVendeur?: boolean, lignesDuVendeur?: Set<string>|null }} [opts]  fiche : { titre,
 *   marque, couleur, matiere, taille, genre, etat, texteVendeur, objet } ; texteDuVendeur : le texte est celui du
 *   vendeur (il part tel quel, partout) ; lignesDuVendeur : les lignes que la personne a écrites ou retouchées dans
 *   le texte de FillSell (lignesEcritesParLaPersonne) — parties telles quelles, partout.
 */
export function descriptionFidele(texte, platform, { fiche = {}, texteDuVendeur = false, lignesDuVendeur = null } = {}) {
  let t = String(texte ?? "");
  if (!t.trim()) return t;
  // ── (30/10, lot E) CE QUE LA PERSONNE A ÉCRIT PART TEL QUEL, SUR TOUTES LES PLATEFORMES ──
  // thecloset72000 ajoutait sa référence « #the_closet72jeanFR44 #jean » sous le texte : partie sur Vinted et Depop,
  // retirée sur Leboncoin, Beebs et eBay (une ligne de hashtags tombait là où ils « ne servent pas », même écrite par
  // elle). La règle 5 du 26/10 (pas de hashtags hors Vinted et Depop) ne vise que les hashtags de FillSell.
  if (texteDuVendeur) return t;
  const limite = PLATEFORMES_A_HASHTAGS[platform] ?? 0;
  const protegees = [];
  if (lignesDuVendeur && lignesDuVendeur.size) {
    t = t.split("\n").map((l) => (l.trim() && lignesDuVendeur.has(cleDeLigne(l)) ? `${protegees.push(l) - 1}` : l)).join("\n");
  }
  const rendre = (s) => (protegees.length ? s.replace(/(\d+)/g, (_, i) => protegees[Number(i)]) : s);
  t = genreFidele(etatFidele(t, fiche.etat), fiche);
  const fondes = motsDeLaFiche(fiche);
  // Sur Depop (5 au plus), les hashtags de la personne passent d'abord.
  let gardes = protegees.reduce((n, l) => n + (l.match(RE_HASHTAG) ?? []).length, 0);
  // Là où un hashtag ne sert pas, une QUEUE de hashtags en fin de ligne (« … bon état. #vintage #femme ») tombe
  // entière : ce n'est pas une phrase. Un « #mot » isolé dans une phrase redevient « mot », plus bas.
  if (limite === 0) {
    t = t.split("\n").map((ligne) => ligne.replace(/((?:[\s(]#[\p{L}\p{N}][\p{L}\p{N}_'-]*){2,}|(?<=[.!?…])[ \t]*#[\p{L}\p{N}][\p{L}\p{N}_'-]*)[ \t]*$/u, "")).join("\n");
  }
  t = t.replace(RE_HASHTAG, (tout, avant, mot) => {
    if (limite === 0) return `${avant}\uE000${mot}`; // marqué : « #mot » → « mot » ou ligne retirée, plus bas
    const fonde = texteDuVendeur || comparable(mot).split(/[^a-z0-9]+/).filter(Boolean).every((w) => fondes.has(w));
    if (!fonde || gardes >= limite) return `${avant}\uE001`;
    gardes++;
    return tout;
  });
  // Une ligne faite seulement de hashtags retirés ou dégriffés tombe ; ailleurs « mot » reste dans sa phrase.
  const lignes = t.split("\n").map((l) => {
    const sansMarques = l.replace(/\uE001/g, "").replace(/\uE000[\p{L}\p{N}_'-]+/gu, "").trim();
    if ((/\uE000|\uE001/.test(l)) && !sansMarques) return null;
    return l.replace(/\uE001/g, "").replace(/\uE000/g, "").replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/g, "");
  }).filter((l) => l !== null);
  return rendre(lignes.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, ""));
}

/** La clé d'une ligne pour la comparer (espaces, casse et accents ignorés). */
function cleDeLigne(l) {
  return comparable(l).replace(/\s+/g, " ").trim();
}

/**
 * (30/10, lot E) Les lignes du texte qui n'existent dans AUCUNE copie rédigée par FillSell : ce sont celles que la
 * personne a écrites (ou retouchées). Copies inconnues → aucune ligne (la règle d'avant s'applique).
 * @param {string} texte  le texte de la carte
 * @param {Array<string|null|undefined>} copiesFillSell  les descriptions rédigées par FillSell (toutes plateformes)
 * @returns {Set<string>}
 */
export function lignesEcritesParLaPersonne(texte, copiesFillSell) {
  const copies = (copiesFillSell ?? []).filter((c) => typeof c === "string" && c.trim());
  if (!copies.length) return new Set();
  const deFillSell = new Set(copies.flatMap((c) => c.split("\n")).map(cleDeLigne).filter(Boolean));
  return new Set(String(texte ?? "").split("\n").map(cleDeLigne).filter((k) => k && !deFillSell.has(k)));
}

/** Les plateformes où un hashtag sert (pour le dire à l'écran). */
export function hashtagsServent(platform) {
  return (PLATEFORMES_A_HASHTAGS[platform] ?? 0) > 0;
}
