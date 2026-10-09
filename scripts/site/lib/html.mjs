import { langue } from '../../../site/langues.mjs';

// Petits outils HTML du site vitrine (09/10/2026), partagés par le générateur,
// les gabarits (site/gabarits/*.mjs) et le vérificateur. Aucune dépendance
// lourde : le vérificateur doit pouvoir relire une sortie sans rien charger.

export const ORIGINE = 'https://fillsell.app';

/** Échappe un texte pour un nœud ou un attribut HTML. */
export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** JSON dans un <script> : « </ » fermerait la balise, on le neutralise. */
export const jsonEnLigne = (obj) => JSON.stringify(obj).replace(/<\//g, '<\\/');

/** URL absolue d'un chemin du site, sans slash final (sauf l'origine nue). */
export function urlAbsolue(chemin) {
  if (!chemin || chemin === '/') return ORIGINE;
  return ORIGINE + chemin.replace(/\/+$/, '');
}

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decoderEntites(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITES[e.toLowerCase()] ?? m;
  });
}

/** Texte lisible d'un fragment HTML (scripts, styles et balises retirés). */
export function texteBrut(html) {
  return decoderEntites(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

// Espaces, insécables (U+00A0) et fines insécables (U+202F, « 1 500 », « : »)
// comprises — écrites par leur code : invisibles dans le source, elles se
// perdent ou se dupliquent à la première retouche.
const ESPACES = new RegExp(`[\\s${String.fromCharCode(0xa0, 0x202f)}]+`);

const ESPACES_G = new RegExp(ESPACES.source, 'g');

/**
 * Forme de COMPARAISON d'un texte (09/10, revue de la fondation I-1) : le
 * texte visible vient de texteBrut, qui remplace chaque balise par une espace
 * (« c'est <strong>gratuit</strong>. » → « gratuit . », « l’<a>extension</a> »
 * → « l’ extension ») ; le JSON-LD vient de l'arbre Markdown, sans ces espaces.
 * On ramène les deux à la même forme : espaces fusionnés, aucune espace devant
 * une ponctuation fermante ni après une ouvrante ou une apostrophe. Appliquée
 * des DEUX côtés, elle ne peut rien faire passer qui diffère vraiment.
 */
export function texteComparable(texte) {
  return String(texte).replace(ESPACES_G, ' ')
    .replace(/ (?=[.,;:!?)\]}»”’…%])/g, '')
    .replace(/(?<=[([{«“‘’']) /g, '')
    .trim();
}

/** Mots d'un texte : suites contenant au moins une lettre ou un chiffre. */
export function mots(texte) {
  return String(texte).toLowerCase().split(ESPACES)
    .map((m) => m.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((m) => /[\p{L}\p{N}]/u.test(m));
}

/** Attributs d'une balise ouvrante (`<a href="x" data-y>`) en objet. */
export function attributs(balise) {
  const sortie = {};
  const corps = balise.replace(/^<\s*[\w-]+/, '').replace(/\/?>$/, '');
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(corps))) sortie[m[1].toLowerCase()] = decoderEntites(m[2] ?? m[3] ?? m[4] ?? '');
  return sortie;
}

/** Toutes les balises ouvrantes `nom` d'un document, avec leurs attributs. */
export function balisesOuvrantes(html, nom) {
  const re = new RegExp(`<${nom}\\b[^>]*>`, 'gi');
  return [...String(html).matchAll(re)].map((m) => ({ brut: m[0], attrs: attributs(m[0]), index: m.index }));
}

/** Contenu entre deux commentaires-marqueurs (`<!--fs:nom:debut-->`), ou null. */
export function region(html, nom) {
  const re = new RegExp(`<!--fs:${nom}:debut-->([\\s\\S]*?)<!--fs:${nom}:fin-->`);
  const m = re.exec(String(html));
  return m ? m[1] : null;
}

/**
 * Retire toutes les sous-régions `nom` (marqueurs compris) d'un fragment.
 * Les régions peuvent s'IMBRIQUER (un bloc d'habillage qui contient un badge
 * d'habillage) : on retire d'abord les plus intérieures, jusqu'à ce qu'il
 * n'en reste aucune — jamais un marqueur de fin orphelin.
 */
export function sansRegions(html, ...noms) {
  let sortie = String(html);
  for (const nom of noms) {
    const debut = `<!--fs:${nom}:debut-->`;
    const interieure = new RegExp(`${debut}((?:(?!${debut})[\\s\\S])*?)<!--fs:${nom}:fin-->`, 'g');
    for (let avant = null; avant !== sortie;) {
      avant = sortie;
      sortie = sortie.replace(interieure, '');
    }
  }
  return sortie;
}

/**
 * Le CONTENU PRINCIPAL d'une page (09/10, revue de la fondation I-9) : la
 * région fs:contenu, MOINS la ligne des dates (fs:dates) et l'HABILLAGE du
 * gabarit (fs:habillage : sommaire, « À lire aussi », bandeau de
 * démonstration, libellés des cartes). C'est lui, et lui seul, qui fait
 * l'empreinte des dates, le compte de mots, la similarité et la FAQ visible :
 * retoucher un libellé de gabarit, ou la description d'une AUTRE page reprise
 * dans une carte, ne « modifie » aucune page. null si la région manque.
 */
export function contenuPrincipal(html) {
  const brut = region(html, 'contenu');
  return brut === null ? null : sansRegions(brut, 'dates', 'habillage');
}

/** Date AAAA-MM-JJ → « 9 octobre 2026 » / « October 9, 2026 » (locale de site/langues.mjs). */
export function dateLisible(iso, lang) {
  const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j, 12));
  return d.toLocaleDateString(langue(lang).locale, {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

/** Date du jour à Paris, AAAA-MM-JJ (les dates du site sont des jours de Paris). */
export function aujourdhuiParis(maintenant = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(maintenant);
}

/**
 * Typographie française (09/10/2026) : espace INSÉCABLE avant « : ; ? ! » et
 * à l'intérieur des guillemets « », dans le TEXTE seulement (jamais dans une
 * balise, un script ou un style). Sans elle, « StoFlow : lequel » se coupait
 * avant les deux-points, qui ouvraient la ligne suivante. Les autres langues
 * passent telles quelles. Sans effet sur l'empreinte des dates ni sur la FAQ
 * (texteBrut et texteComparable ramènent l'insécable à une espace).
 */
export function typographie(html, lang) {
  if (lang !== 'fr') return html;
  const insecable = String.fromCharCode(0xa0);
  return String(html).replace(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>)|([^<]+)/gi, (m, balise, texte) => (balise
    ? balise
    : texte.replace(/ ([:;?!»])/g, `${insecable}$1`).replace(/« /g, `«${insecable}`)));
}
