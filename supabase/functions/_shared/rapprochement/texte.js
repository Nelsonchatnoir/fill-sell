// Lecture du texte d'une annonce : titre normalisé, mots qui comptent, type d'objet,
// couleurs, tailles, dimensions, marque. Tout est fermé et explicable.
// (12/10) Les accents combinants (U+0300 à U+036F), écrits en ASCII : le déploiement
// par le connecteur Supabase rend les échappements unicode du source en caractères
// bruts (invisibles) — la même plage, sans rien qui puisse changer en route.
const ACCENTS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
export const norm = (t) => String(t ?? '').normalize('NFD').replace(ACCENTS, '').toLowerCase().replace(/\b(t|tee)[\s-]?shirts?\b/g, 'tshirt').replace(/\bsweat[\s-]?shirts?\b/g, 'sweat')
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[×x](?=\s*\d)/g, ' x ').replace(/[^a-z0-9,.]+/g, ' ').replace(/(?<!\d)[,.]|[,.](?!\d)/g, ' ').replace(/\s+/g, ' ').trim();

const VIDES = new Set(['pour', 'avec', 'sans', 'par', 'sur', 'les', 'des', 'une', 'aux', 'est', 'dans', 'tres', 'bon', 'etat', 'neuf', 'neuve',
  'taille', 'occasion', 'the', 'and', 'for', 'with', 'tbe', 'excellent', 'parfait', 'comme', 'ans', 'mois', 'vintage', 'femme', 'femmes', 'homme',
  'hommes', 'fille', 'garcon', 'enfant', 'mixte', 'unisexe', 'lot', 'tout', 'tres', 'peu', 'porte', 'portee', 'jamais', 'etiquette', 'marque', 'cm', 'de', 'du', 'la', 'le', 'et', 'en', 'a', 'au']);

export const FAMILLES = [
  ['bas', ['pantalon', 'pantalons', 'jean', 'jeans', 'legging', 'leggings', 'jogging', 'joggings', 'short', 'shorts', 'bermuda', 'pantacourt', 'jegging', 'treillis', 'chino', 'cargo', 'flare']],
  ['robe', ['robe', 'robes']],
  ['jupe', ['jupe', 'jupes', 'jupon']],
  ['dessus_chaud', ['veste', 'vestes', 'blazer', 'manteau', 'manteaux', 'doudoune', 'parka', 'blouson', 'trench', 'impermeable', 'kimono', 'perfecto', 'caban', 'poncho', 'cape']],
  ['maille', ['pull', 'pulls', 'sweat', 'sweatshirt', 'hoodie', 'cardigan', 'gilet', 'polaire', 'col']],
  ['haut', ['chemise', 'chemisier', 'blouse', 'top', 'tshirt', 'tee', 'debardeur', 'polo', 'body', 'brassiere', 'crop', 'tunique', 'caraco', 'bustier', 'corsage']],
  ['tete', ['bonnet', 'beret', 'berret', 'casquette', 'chapeau', 'bob', 'cagoule', 'bandeau', 'serre']],
  ['pieds', ['bottines', 'bottine', 'bottes', 'botte', 'baskets', 'basket', 'chaussures', 'chaussure', 'sandales', 'sandale', 'escarpins', 'escarpin', 'mocassins', 'ballerines', 'tongs', 'sneakers', 'derbies', 'boots', 'mules', 'chaussons', 'claquettes', 'espadrilles', 'talons']],
  ['sac', ['sac', 'sacs', 'pochette', 'cabas', 'sacoche', 'cartable', 'valise', 'besace', 'banane', 'portefeuille', 'porte', 'trousse', 'housse']],
  ['echarpe', ['echarpe', 'foulard', 'snood', 'etole', 'cheche']],
  ['ceinture', ['ceinture']],
  ['combi', ['combinaison', 'salopette', 'combishort']],
  ['maillot', ['maillot', 'bikini']],
  ['pyjama', ['pyjama', 'nuisette', 'peignoir', 'chemise de nuit']],
  ['lunettes', ['lunettes']],
  ['montre', ['montre']],
  ['bijou', ['collier', 'bracelet', 'bague', 'boucles', 'boucle', 'pendentif', 'broche', 'chaine', 'parure']],
  ['gants', ['gants', 'gant', 'mitaines', 'moufles']],
  ['chaussettes', ['chaussettes', 'collants', 'bas']],
  ['lingerie', ['soutien', 'culotte', 'string', 'lingerie', 'slip', 'boxer']],
  ['peluche', ['peluche', 'doudou']],
  ['vaisselle', ['mug', 'mugs', 'tasse', 'tasses', 'assiette', 'assiettes', 'verre', 'verres', 'bol', 'bols', 'plat', 'saladier', 'theiere', 'carafe']],
  ['livre', ['livre', 'livres', 'roman', 'bd', 'manga', 'album']],
  ['jeu', ['jeu', 'jouet', 'puzzle', 'lego', 'playmobil', 'figurine', 'poupee']],
];
const FAM = new Map(); for (const [f, ms] of FAMILLES) for (const m of ms) if (!FAM.has(m)) FAM.set(m, f);
// « bas » collants vs « bas » pantalon : ambigu, on le retire de chaussettes (pantalon est plus fréquent).
FAM.set('bas', 'bas');

export const COULEURS = [
  ['blanc', ['blanc', 'blanche', 'blancs', 'blanches', 'ecru', 'ivoire']],
  ['creme', ['creme', 'ecru', 'ivoire', 'beige', 'blanc casse', 'vanille']],
  ['beige', ['beige', 'sable', 'nude', 'camel', 'taupe', 'creme', 'chameau']],
  ['marron', ['marron', 'chocolat', 'brun', 'brune', 'cognac', 'camel', 'caramel', 'taupe', 'noisette', 'chataigne', 'tabac']],
  ['noir', ['noir', 'noire', 'noirs', 'noires']],
  ['gris', ['gris', 'grise', 'anthracite', 'chine', 'argent', 'argente', 'argentee', 'acier']],
  ['bleu', ['bleu', 'bleue', 'bleus', 'marine', 'turquoise', 'ciel', 'azur', 'indigo', 'denim', 'canard', 'petrole', 'roi', 'cobalt', 'navy']],
  ['rouge', ['rouge', 'rouges', 'bordeaux', 'framboise', 'carmin', 'cerise', 'brique', 'grenat']],
  ['rose', ['rose', 'roses', 'fuchsia', 'framboise', 'saumon', 'corail', 'poudre', 'magenta', 'pink']],
  ['vert', ['vert', 'verte', 'verts', 'kaki', 'olive', 'emeraude', 'menthe', 'sapin', 'pistache', 'anis', 'canard', 'petrole']],
  ['jaune', ['jaune', 'jaunes', 'moutarde', 'citron', 'ocre', 'curry', 'dore', 'doree', 'or']],
  ['orange', ['orange', 'orangee', 'corail', 'abricot', 'rouille', 'brique', 'terracotta', 'cuivre']],
  ['violet', ['violet', 'violette', 'mauve', 'lilas', 'prune', 'lavande', 'parme', 'aubergine', 'pourpre']],
];
const COUL = new Map(); for (const [c, ms] of COULEURS) for (const m of ms) { if (!COUL.has(m)) COUL.set(m, new Set()); COUL.get(m).add(c); }
// Mots qui ne disent pas la couleur de l'objet (motifs, multicolore) : on ne juge pas.
const MULTI = new Set(['multicolore', 'motif', 'motifs', 'fleuri', 'fleurs', 'fleur', 'imprime', 'rayures', 'raye', 'rayee', 'carreaux', 'leopard', 'pois', 'tie', 'dye']);

export const LETTRES = ['xxxs', 'xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '3xl', '4xl', '5xl', 'tu'];
const TL = { 'xxxl': '3xl', 'tu': 'tu', 'taille unique': 'tu' };
function canonTaille(t) { t = t.toLowerCase().trim(); return TL[t] || t; }

export function tailles(titre, attr) {
  const out = new Set();
  const n = norm(titre);
  // « taille M », « taille 38 », « taille M et L », « T.38 », « t 40 », « 38/40 »
  for (const m of n.matchAll(/\b(?:taille|tailles|t|size)\s+((?:(?:xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl|\d{1,2}(?:[.,]5)?)(?:\s*(?:et|ou|a)\s*|\s+|$))+)/g)) {
    for (const x of m[1].split(/\s+|et|ou/).filter(Boolean)) if (/^(xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl|\d{1,2}(?:[.,]5)?)$/.test(x)) out.add(canonTaille(x));
  }
  // une lettre de taille isolée en fin de titre (« Jupe crème L »)
  const fin = n.match(/\b(xxs|xs|xl|xxl|xxxl|[2-5]xl)\b/g); if (fin) for (const x of fin) out.add(canonTaille(x));
  if (/\btaille unique\b|\btu\b/.test(n)) out.add('tu');
  // attribut de la plateforme : Vinted « M / 38 / 10 » (3e = UK, ignorée), Leboncoin « 38 - M », Beebs…
  if (attr) {
    const a = String(attr).toLowerCase();
    const parts = a.split(/\s*[\/|-]\s*/).map((s) => s.trim()).filter(Boolean);
    const vintedTrois = a.includes('/') && parts.length === 3;
    parts.forEach((p, i) => {
      if (vintedTrois && i === 2) return;
      const x = p.replace(/^(eu|fr|taille)\s*/, '').replace(/\s*\(.*\)$/, '').trim();
      if (/^(xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl)$/.test(x)) out.add(canonTaille(x));
      else if (/^\d{1,2}(?:[.,]5)?$/.test(x)) out.add(x.replace(',', '.'));
      else if (/taille unique|^unique$/.test(x)) out.add('tu');
      else if (/^(\d{1,2})\s*ans$/.test(x)) out.add(x.replace(/\s+/, ''));
    });
  }
  return out;
}

// Correspondance lettre ↔ numéro (FR femme), pour juger « M » contre « 38 » sans les confondre.
const EQ = { xxs: ['32'], xs: ['32', '34'], s: ['34', '36'], m: ['38', '40'], l: ['40', '42'], xl: ['42', '44'], xxl: ['44', '46'], '3xl': ['46', '48'] };
export function taillesCompatibles(A, B) {
  if (!A.size || !B.size) return null; // inconnu
  for (const a of A) if (B.has(a)) return true;
  const ext = (S) => { const o = new Set(S); for (const s of S) for (const e of EQ[s] || []) o.add(e); for (const [l, ns] of Object.entries(EQ)) for (const s of S) if (ns.includes(s)) o.add(l); return o; };
  const EA = ext(A), EB = ext(B);
  for (const a of EA) if (EB.has(a)) return true;
  // une taille de lettre et une taille d'âge/pointure ne se comparent pas
  const lettresA = [...A].every((x) => /[a-z]/.test(x)), lettresB = [...B].every((x) => /[a-z]/.test(x));
  const numA = [...A].every((x) => /^\d/.test(x)), numB = [...B].every((x) => /^\d/.test(x));
  if ((lettresA && numB) || (numA && lettresB)) { if (EA.size === A.size && EB.size === B.size) return null; }
  return false;
}

export function couleurs(titre) {
  const n = ' ' + norm(titre) + ' ';
  const out = new Set(); let multi = false;
  for (const w of n.trim().split(' ')) { if (COUL.has(w)) for (const c of COUL.get(w)) out.add(c); if (MULTI.has(w)) multi = true; }
  if (/ blanc casse /.test(n)) out.add('creme');
  return { set: out, multi };
}
export function couleursCompatibles(A, B) {
  if (!A.set.size || !B.set.size || A.multi || B.multi) return null;
  for (const a of A.set) if (B.set.has(a)) return true;
  return false;
}

export function types(titre) {
  const out = new Set();
  const ws = norm(titre).split(' ');
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    // « porte » seul n'est un sac que suivi de « monnaie/feuille/cartes »
    if (w === 'porte' && !/^(monnaie|feuille|cartes|carte|documents)$/.test(ws[i + 1] || '')) continue;
    if (w === 'col' && !(ws[i + 1] === 'roule' || ws[i + 1] === 'v')) continue;
    if (w === 'bas' && i > 0) continue; // « pantalon taille bas » / « robe bas » : pas un type
    if (FAM.has(w)) out.add(FAM.get(w));
  }
  return out;
}
export function typesCompatibles(A, B) {
  if (!A.size || !B.size) return null;
  for (const a of A) if (B.has(a)) return true;
  return false;
}

export function jetons(titre) {
  const out = new Set();
  for (let w of norm(titre).split(' ')) {
    if (!w || VIDES.has(w)) continue;
    if (/^\d+$/.test(w)) { if (w.length >= 2) out.add(w); continue; }
    if (w.length < 3) continue;
    out.add(racine(w));
  }
  return out;
}
// dimensions : nombres suivis de cm/mm/m ou de part et d'autre d'un « x »
export function dimensions(titre) {
  const n = norm(titre); const out = new Set();
  for (const m of n.matchAll(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/g)) { out.add(m[1].replace(',', '.')); out.add(m[2].replace(',', '.')); }
  for (const m of n.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:cm|mm|ml|cl|l\b|kg|g\b|m\b)/g)) out.add(m[1].replace(',', '.'));
  return out;
}
export function dimensionsCompatibles(A, B) {
  if (!A.size || !B.size) return null;
  const inc = (X, Y) => [...X].every((x) => Y.has(x));
  return inc(A, B) || inc(B, A);
}
export function similarite(A, B) {
  if (!A.size || !B.size) return { jac: 0, cont: 0, communs: 0 };
  let c = 0; for (const a of A) if (B.has(a)) c++;
  return { jac: c / (A.size + B.size - c), cont: c / Math.min(A.size, B.size), communs: c };
}
const MARQUES_VIDES = new Set(['', 'sans marque', 'sans', 'autre', 'autres', 'vintage', 'fait main', 'handmade', 'artisanal', 'inconnue', 'inconnu', 'marque inconnue', 'no brand', 'non marque', 'generique', 'aucune', 'none', 'other', 'divers']);
export const marqueUtile = (m) => { const x = norm(m); return MARQUES_VIDES.has(x) ? '' : x; };

// ── Voisinages (07/10 nuit) : une couleur ou un type nommés autrement ne sont pas une contradiction.
const VOISINES = {
  blanc: ['creme', 'beige', 'gris'], creme: ['blanc', 'beige', 'jaune', 'marron'], beige: ['creme', 'blanc', 'marron', 'jaune', 'orange', 'rose', 'gris'],
  marron: ['beige', 'creme', 'orange', 'jaune', 'rouge', 'vert', 'gris', 'noir'], noir: ['gris', 'marron', 'bleu'], gris: ['noir', 'blanc', 'beige', 'bleu', 'vert', 'marron'],
  bleu: ['gris', 'noir', 'vert', 'violet'], rouge: ['rose', 'orange', 'marron', 'violet'], rose: ['rouge', 'violet', 'orange', 'beige'],
  vert: ['bleu', 'jaune', 'marron', 'gris', 'beige'], jaune: ['orange', 'beige', 'creme', 'vert', 'marron'], orange: ['rouge', 'jaune', 'marron', 'rose', 'beige'], violet: ['rose', 'bleu', 'rouge'],
};
// ── ATTRIBUT DISTINCTIF (11/10, Louis — « Est-ce le même article ? » en boucle)
// Copie FIDÈLE de la règle en base (mig 20261011190000 : doublon_couleurs,
// doublon_nombres, doublon_attribut_distinctif — la base garde la question,
// le moteur ne la produit plus, ni ne rattache à une autre variante).
// « Gris et Rose » / « Noir et Rose » : chacun nomme une couleur que l'autre
// n'a pas → deux articles, sans question. Tolérance : deux titres d'UNE
// couleur, voisines, l'une nommée par une nuance (anthracite ~ noir).
export const D_BASES = {
  blanc: ['blanc', 'blanche', 'blancs', 'blanches'], noir: ['noir', 'noire', 'noirs', 'noires'], gris: ['gris', 'grise', 'grises'],
  bleu: ['bleu', 'bleue', 'bleus', 'bleues'], rouge: ['rouge', 'rouges'], rose: ['rose', 'roses', 'pink'],
  vert: ['vert', 'verte', 'verts', 'vertes'], jaune: ['jaune', 'jaunes'], orange: ['orange', 'oranges'],
  violet: ['violet', 'violette', 'violets', 'violettes'], marron: ['marron', 'marrons', 'brun', 'brune'], beige: ['beige', 'beiges'],
};
export const D_NUANCES = {
  blanc: ['ecru', 'ivoire', 'creme', 'vanille'], beige: ['sable', 'nude', 'camel', 'taupe', 'chameau'],
  marron: ['chocolat', 'cognac', 'caramel', 'noisette', 'chataigne', 'tabac'], gris: ['anthracite', 'chine', 'argent', 'argente', 'argentee', 'acier'],
  bleu: ['marine', 'turquoise', 'ciel', 'azur', 'indigo', 'denim', 'cobalt', 'navy'], rouge: ['bordeaux', 'carmin', 'cerise', 'grenat'],
  rose: ['fuchsia', 'framboise', 'saumon', 'poudre', 'magenta'], vert: ['kaki', 'olive', 'emeraude', 'menthe', 'sapin', 'pistache', 'anis'],
  jaune: ['moutarde', 'citron', 'ocre', 'curry', 'dore', 'doree'], orange: ['corail', 'abricot', 'rouille', 'brique', 'terracotta', 'cuivre'],
  violet: ['mauve', 'lilas', 'prune', 'lavande', 'parme', 'aubergine', 'pourpre'],
};
export const D_VOISINES = {
  blanc: ['beige', 'gris'], beige: ['blanc', 'marron', 'jaune', 'orange', 'rose', 'gris'], marron: ['beige', 'orange', 'jaune', 'rouge', 'vert', 'gris', 'noir'],
  noir: ['gris', 'marron', 'bleu'], gris: ['noir', 'blanc', 'beige', 'bleu', 'vert', 'marron'], bleu: ['gris', 'noir', 'vert', 'violet'],
  rouge: ['rose', 'orange', 'marron', 'violet'], rose: ['rouge', 'violet', 'orange', 'beige'], vert: ['bleu', 'jaune', 'marron', 'gris', 'beige'],
  jaune: ['orange', 'beige', 'vert', 'marron'], orange: ['rouge', 'jaune', 'marron', 'rose', 'beige'], violet: ['rose', 'bleu', 'rouge'],
};
const D_MULTI = / (multicolore|multicolor|motifs?|fleuri|fleurs?|imprime|rayures?|raye|rayee|carreaux|leopard|pois|camouflage|arc en ciel) /;
function dNorm(s) {
  return ' ' + String(s ?? '').toLowerCase().normalize('NFD').replace(ACCENTS, '')
    .replace(/œ/g, 'o').replace(/æ/g, 'e').replace(/[’'\-_/.,;:!?()[\]{}"«»+*&#]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
}
export function couleursDistinctif(titre) {
  const v = dNorm(titre);
  const base = [], nuance = [];
  for (const [k, ms] of Object.entries(D_BASES)) if (ms.some((m) => v.includes(` ${m} `)) && !base.includes(k)) base.push(k);
  for (const [k, ms] of Object.entries(D_NUANCES)) if (ms.some((m) => v.includes(` ${m} `)) && !nuance.includes(k) && !base.includes(k)) nuance.push(k);
  return { base, nuance, multi: D_MULTI.test(v) };
}
export function nombresObjet(titre) {
  const brut = String(titre ?? '').toLowerCase();
  const s = ' ' + brut.replace(/[^a-z0-9àâäçéèêëîïôöùûüœ,.]+/g, ' ') + ' ';
  const out = new Set();
  const tous = (re, f) => { for (const m of s.matchAll(re)) out.add(f(m)); };
  tous(/ lot de (\d+)(?= )/g, (m) => 'q' + m[1]);
  tous(/ (\d+) ?(?:pots?|pieces?|pièces?|pcs|unites?|unités?|paires?|exemplaires?|couvercles?|bouteilles?|verres?|assiettes?|tasses?|cartes?|livres?|tomes?|figurines?)(?= )/g, (m) => 'q' + m[1]);
  tous(/ x ?(\d+)(?= )/g, (m) => 'q' + m[1]);
  tous(/ (\d+) ?x(?= )/g, (m) => 'q' + m[1]);
  tous(/ (\d+(?:[.,]\d+)?) ?(ml|cl|l|litres?|g|kg|cm|mm|m|go|to|mah|w|v)(?= )/g, (m) => 'u' + m[1].replace(',', '.') + m[2]);
  tous(/ (?:taille|t|pointure|p) ?(\d{2,3})(?= )/g, (m) => 't' + m[1]);
  tous(/ (\d+) ?(ans|mois)(?= )/g, (m) => 'a' + m[1] + m[2]);
  const r = ' ' + brut.replace(/[-_/]/g, '').replace(/[^a-z0-9]+/g, ' ') + ' ';
  for (const m of r.matchAll(/ ([a-z]{1,4}\d{2,}[a-z]{0,2})(?= )/g)) out.add('r' + m[1]);
  return out;
}
/** 'couleur' | 'nombre' | null — même verdict que doublon_attribut_distinctif (titres). */
export function attributDistinctif(titreA, titreB) {
  const ca = couleursDistinctif(titreA), cb = couleursDistinctif(titreB);
  if (!ca.multi && !cb.multi) {
    const at = [...new Set([...ca.base, ...ca.nuance])], bt = [...new Set([...cb.base, ...cb.nuance])];
    if (at.length && bt.length) {
      const aSeul = at.filter((x) => !bt.includes(x)), bSeul = bt.filter((x) => !at.includes(x));
      if (aSeul.length && bSeul.length) {
        const tolere = at.length === 1 && bt.length === 1 && (D_VOISINES[at[0]] ?? []).includes(bt[0])
          && (ca.nuance.length === 1 || cb.nuance.length === 1);
        if (!tolere) return 'couleur';
      }
    }
  }
  const na = nombresObjet(titreA), nb = nombresObjet(titreB);
  if (na.size && nb.size && [...na].some((x) => !nb.has(x)) && [...nb].some((x) => !na.has(x))) return 'nombre';
  return null;
}

export function couleursCompatibles2(A, B) {
  if (!A.set.size || !B.set.size || A.multi || B.multi) return null;
  for (const a of A.set) { if (B.set.has(a)) return true; for (const v of VOISINES[a] || []) if (B.set.has(v)) return true; }
  return false;
}
const TYPES_VOISINS = {
  haut: ['maille', 'dessus_chaud', 'robe', 'pyjama', 'lingerie', 'maillot', 'combi'], maille: ['haut', 'dessus_chaud', 'robe'], dessus_chaud: ['haut', 'maille'],
  robe: ['haut', 'maille', 'combi', 'pyjama', 'jupe'], jupe: ['robe', 'echarpe'], bas: ['combi', 'pyjama', 'chaussettes'], combi: ['bas', 'robe', 'haut', 'pyjama'],
  pyjama: ['haut', 'robe', 'bas', 'combi', 'lingerie'], lingerie: ['haut', 'pyjama', 'maillot'], maillot: ['lingerie', 'haut'], echarpe: ['jupe', 'tete'], tete: ['echarpe'],
  chaussettes: ['bas'], sac: [], pieds: [], bijou: ['montre'], montre: ['bijou'],
};
export function typesCompatibles2(A, B) {
  if (!A.size || !B.size) return null;
  for (const a of A) { if (B.has(a)) return true; for (const v of TYPES_VOISINS[a] || []) if (B.has(v)) return true; }
  return false;
}
export function sansTailleUnique(S) { const o = new Set(S); o.delete('tu'); return o; }

// Racine légère (07/10 nuit) : accords du français (colorée/coloré, noires/noir, longue/long).
const RAC = { blanche: 'blanc', blanches: 'blanc', longue: 'long', longues: 'long', fausse: 'faux', douce: 'doux', fraiche: 'frais', seche: 'sec', grosse: 'gros', basse: 'bas', bonne: 'bon' };
export function racine(w) {
  if (RAC[w]) return RAC[w];
  if (w.length <= 4) return w;
  let r = w.replace(/(es|e|s|x)$/, '');
  if (r.length > 4) r = r.replace(/(e|s)$/, '');
  return r;
}
