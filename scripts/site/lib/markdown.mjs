import { readFileSync } from 'node:fs';
import path from 'node:path';
import { routeAppPour } from '../routes-app.mjs';
import { dimensionsImage } from './images-dimensions.mjs';
import { ORIGINE } from './html.mjs';

// Rendu Markdown du site vitrine (09/10/2026) : react-markdown + remark-gfm,
// rendus par renderToStaticMarkup — les mêmes briques que le prérendu du blog
// (éprouvées), chargées à la demande (aucun module lourd dans le processus du
// serveur de dev, revue A M5).
//
// ⛔ Les liens `[texte](page:<id>)` sont résolus DANS LE MDAST, par le plugin
// remark ci-dessous, AVANT rehype et avant `urlTransform` : react-markdown 10
// remplace tout protocole inconnu par "" avant d'appeler le moindre composant
// (revue C I6, démontré). Résolus dans `components.a`, ils pointeraient tous
// sur la page elle-même, sans aucune erreur. Ici, un id inconnu fait échouer
// le build en nommant le fichier.
//
// Liens (09/10, revue de la fondation I-2 et M-2) : un lien est une ancre
// (#…), un mailto:/tel:, une URL https:// EXTERNE, un `page:` ou une route de
// l'app — rien d'autre. Un lien relatif écrit à la main ([x](faq), ../page)
// visait /crosslisting/faq une fois servi sous /crosslisting/… : refusé. Un
// `page:<id>` vise la version de MÊME langue ; viser une autre langue
// s'écrit `page:<langue>:<id>` (le lien porte alors hreflang) — plus de repli
// silencieux qui changeait de langue ou contournait un brouillon.
//
// llms-full.txt (revue de la fondation M-5) : le Markdown de chaque page est
// RE-SÉRIALISÉ depuis l'arbre déjà résolu (liens titrés et par référence
// compris), jamais réécrit par une expression régulière sur le source.

let briques = null;
async function chargerBriques() {
  if (!briques) {
    const [{ default: React }, { renderToStaticMarkup }, { default: Markdown }, { default: remarkGfm }, { toMarkdown }, { gfmToMarkdown }] =
      await Promise.all([
        import('react'), import('react-dom/server'), import('react-markdown'), import('remark-gfm'),
        import('mdast-util-to-markdown'), import('mdast-util-gfm'),
      ]);
    briques = { React, renderToStaticMarkup, Markdown, remarkGfm, toMarkdown, gfmToMarkdown };
  }
  return briques;
}

// Diacritiques combinants (U+0300 à U+036F), retirés après NFD — écrits par
// leur code : invisibles dans le source, ils se perdent à la première retouche.
const DIACRITIQUES = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

/** Identifiant d'ancre lisible : « Le cas des lots » → « le-cas-des-lots ». */
export function ancre(texte) {
  return String(texte).normalize('NFD').replace(DIACRITIQUES, '')
    .toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
}

// Ids posés par les gabarits (cible du lien d'évitement, menu) : un titre
// « ## Contenu » ou « ## Navigation » les reprenait en double (revue de la
// fondation M-3). Un titre qui y tombe reçoit « -2 ».
export const IDS_GABARIT = ['contenu', 'navigation'];

// Nœuds de BLOC : leur texte se joint par une espace (une liste « - Vinted /
// - Leboncoin » donnait « VintedLeboncoin » dans la FAQPage, revue de la
// fondation I-1) ; le texte en ligne (gras, lien, code) se colle tel quel.
const BLOCS = new Set(['paragraph', 'heading', 'list', 'listItem', 'blockquote', 'table', 'tableRow', 'tableCell', 'code', 'thematicBreak']);

/**
 * Le texte VISIBLE d'un nœud mdast, tel que la page l'affiche : sans le texte
 * alternatif des images ni le HTML brut (react-markdown ne les rend pas en
 * texte), blocs séparés par une espace. Source unique des questions et des
 * réponses de la FAQPage.
 */
export function texteVisible(n) {
  if (!n) return '';
  if (n.type === 'text' || n.type === 'inlineCode' || n.type === 'code') return n.value ?? '';
  if (n.type === 'break') return ' ';
  if (!Array.isArray(n.children)) return '';
  const separateur = n.children.some((c) => BLOCS.has(c.type)) ? ' ' : '';
  // Seuls les blancs ASCII se fusionnent : une insécable écrite (« plateformes ? »)
  // reste ce qu'elle est, à l'écran comme dans le JSON-LD.
  return n.children.map(texteVisible).join(separateur).replace(/[ \t\r\n]+/g, ' ').trim();
}

/**
 * Contrôle d'un lien écrit dans le Markdown (hors page: et media:, traités à
 * part). Lève avec le fichier et la raison. `source` : 'site' (site/contenu)
 * ou 'blog' (src/blog, partagé avec la SPA, qui écrit ses liens en chemins).
 */
export function verifierLienEcrit(url, { fichier, source }) {
  const refus = (raison) => new Error(`[site] ${fichier} : lien « ${url} » — ${raison}`);
  if (!url) throw refus('cible vide');
  if (url.startsWith('#') || /^(mailto|tel):/i.test(url)) return;
  if (url.startsWith('//')) throw refus('adresse sans protocole : écris https://… en entier');
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    let u;
    try { u = new URL(url); } catch { throw refus('adresse illisible'); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw refus(`protocole ${u.protocol} refusé (https://, mailto:, tel:, page: seulement)`);
    const nous = u.hostname === 'fillsell.app' || u.hostname === 'www.fillsell.app';
    if (nous && (u.protocol === 'http:' || u.hostname !== 'fillsell.app')) {
      throw refus('vise le site en http:// ou par www. (une redirection de plus) : page:<id> pour une page du site, https://fillsell.app/… sinon');
    }
    if (nous && source === 'site') {
      throw refus("adresse absolue vers le site : page:<id> pour une page (un renommage ne casse rien), le chemin /… pour une route de l'app");
    }
    if (!nous && u.protocol === 'http:') throw refus('lien externe en http:// : https:// attendu');
    return;
  }
  if (url.startsWith('/')) {
    if (source !== 'site') return;
    const chemin = url.split(/[?#]/)[0];
    if (!routeAppPour(chemin) || routeAppPour(chemin).partagee) {
      throw refus(
        'lien interne écrit à la main. Vers une page du site : [texte](page:<id>) (un renommage ne casse rien) ; ' +
        "seules les routes de l'app (/login, /extension…) s'écrivent en chemin.",
      );
    }
    return;
  }
  throw refus('lien RELATIF : servi sous un sous-dossier (/crosslisting/…), il viserait une autre adresse — page:<id> pour une page du site');
}

const TITRE_FAQ = /^(questions fr[ée]quentes|faq|foire aux questions|frequently asked questions)$/i;

function visiter(noeud, fn, parent = null) {
  fn(noeud, parent);
  if (Array.isArray(noeud.children)) for (const enfant of [...noeud.children]) visiter(enfant, fn, noeud);
}

/** URL absolue d'un chemin du site (llms-full.txt). */
const absolue = (url) => (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? ORIGINE + url : url);

/**
 * Le Markdown RÉSOLU d'un arbre (llms-full.txt) : copie de l'arbre, liens et
 * images en URL absolues, sérialisée par mdast-util-to-markdown.
 */
function markdownResolu(arbre) {
  const { toMarkdown, gfmToMarkdown } = briques;
  const copie = structuredClone(arbre);
  visiter(copie, (n) => {
    if (n.type === 'link' || n.type === 'definition' || n.type === 'image') n.url = absolue(n.url);
    delete n.data;
  });
  return toMarkdown(copie, { extensions: [gfmToMarkdown()] }).trim();
}

/**
 * Plugin remark : liens `page:`, médias, ancres des titres, extraction de la
 * FAQ visible et des termes du glossaire, Markdown résolu. Remplit `info`.
 */
function remarqueSite(ctx) {
  return () => (arbre) => {
    const info = ctx.info;
    const ancresPrises = new Set(IDS_GABARIT);
    const definitionsAutreLangue = new Map();

    // 1. Liens (et définitions des liens par référence).
    visiter(arbre, (n) => {
      if (n.type !== 'link' && n.type !== 'definition') return;
      const url = String(n.url ?? '');
      if (url.startsWith('page:')) {
        const [cible, morceauAncre] = url.slice(5).split('#');
        // page:<id> ou page:<langue>:<id> (un id ne contient jamais « : »).
        const [langueVisee, id] = cible.includes(':') ? cible.split(':') : [null, cible];
        const e = ctx.resoudre(id, ctx.fichier, langueVisee);
        n.url = e.chemin + (morceauAncre ? `#${morceauAncre}` : '');
        if (e.lang !== ctx.lang) {
          if (n.type === 'link') n.data = { ...(n.data ?? {}), hProperties: { ...(n.data?.hProperties ?? {}), hrefLang: e.hreflang } };
          else definitionsAutreLangue.set(n.identifier, e.hreflang);
        }
        info.liensInternes.push(n.url);
        return;
      }
      if (url.startsWith('media:')) throw new Error(`[site] ${ctx.fichier} : « ${url} » est un média, pas une page — ![texte](${url}) pour une image`);
      verifierLienEcrit(url, ctx);
    });
    // Liens par référence vers une définition d'une autre langue : hreflang aussi.
    if (definitionsAutreLangue.size) {
      visiter(arbre, (n) => {
        if (n.type !== 'linkReference' || !definitionsAutreLangue.has(n.identifier)) return;
        n.data = { ...(n.data ?? {}), hProperties: { ...(n.data?.hProperties ?? {}), hrefLang: definitionsAutreLangue.get(n.identifier) } };
      });
    }

    // 2. Images : manifeste des médias (AVIF/WebP, dimensions) ou fichier public.
    let rang = 0;
    visiter(arbre, (n) => {
      if (n.type !== 'image') return;
      const url = String(n.url ?? '');
      const principale = n.title === 'principale';
      if (principale && rang !== 0) {
        throw new Error(`[site] ${ctx.fichier} : seule la PREMIÈRE image peut être « principale » (${url})`);
      }
      if (!String(n.alt ?? '').trim()) throw new Error(`[site] ${ctx.fichier} : image « ${url} » sans texte alternatif ![…](…)`);
      const cle = url.startsWith('media:') ? url.slice(6) : url;
      const media = ctx.medias.entree(cle);
      let image;
      if (media) {
        image = { ...media, cle, alt: n.alt, principale };
      } else if (url.startsWith('/') && !url.startsWith('//')) {
        const fichierPublic = path.join(ctx.racine, 'public', ...url.split('/').filter(Boolean));
        let dims;
        try { dims = dimensionsImage(readFileSync(fichierPublic)); } catch { dims = null; }
        if (!dims) throw new Error(`[site] ${ctx.fichier} : image « ${url} » introuvable dans public/ ou de format illisible (png, jpeg, webp, gif)`);
        image = { cle, alt: n.alt, principale, largeur: dims.largeur, hauteur: dims.hauteur, repli: url, variantes: null };
      } else {
        throw new Error(`[site] ${ctx.fichier} : image « ${url} » inconnue — media:<nom> doit figurer au manifeste (npm run site:images), un chemin /… doit exister dans public/`);
      }
      n.url = image.repli;
      n.title = null;
      n.data = { ...(n.data ?? {}), hProperties: { ...(n.data?.hProperties ?? {}), dataImage: String(info.images.length) } };
      info.images.push(image);
      rang++;
    });

    // 3. Ancres des titres h2/h3 (sommaire cliquable), jamais un id du gabarit.
    visiter(arbre, (n) => {
      if (n.type !== 'heading' || (n.depth !== 2 && n.depth !== 3)) return;
      const texte = texteVisible(n);
      let id = ancre(texte);
      for (let i = 2; ancresPrises.has(id); i++) id = `${ancre(texte)}-${i}`;
      ancresPrises.add(id);
      n.data = { ...(n.data ?? {}), hProperties: { ...(n.data?.hProperties ?? {}), id } };
      info.titres.push({ niveau: n.depth, texte, id });
    });

    // 4. FAQ VISIBLE → données FAQPage. Le JSON-LD reprend le texte affiché
    //    (texteVisible, la forme que le vérificateur relit dans la page),
    //    jamais un texte parallèle qui divergerait (revue B M1).
    const enfants = arbre.children;
    let debut = -1;
    const toutesLesH3 = ctx.type === 'faq';
    if (!toutesLesH3) {
      debut = enfants.findIndex((n) => n.type === 'heading' && n.depth === 2 && TITRE_FAQ.test(texteVisible(n)));
      if (ctx.faqAttendue && debut < 0) {
        throw new Error(`[site] ${ctx.fichier} : « faq: true » mais aucune section « ## Questions fréquentes » (ou « ## FAQ ») dans le corps`);
      }
    }
    if (toutesLesH3 || debut >= 0) {
      const faq = [];
      let courante = null;
      for (let i = toutesLesH3 ? 0 : debut + 1; i < enfants.length; i++) {
        const n = enfants[i];
        if (n.type === 'heading' && n.depth <= 2 && !toutesLesH3) break;
        if (n.type === 'heading' && n.depth <= 3) {
          courante = n.depth === 3 ? { question: texteVisible(n), reponse: [] } : null;
          if (courante) faq.push(courante);
          continue;
        }
        if (courante) courante.reponse.push(texteVisible(n));
      }
      info.faq = faq.map((q) => ({ question: q.question, reponse: q.reponse.filter(Boolean).join(' ') }))
        .filter((q) => q.question && q.reponse);
      if (!info.faq.length) info.faq = null;
    }

    // 5. GLOSSAIRE : chaque « ### Terme » et sa définition (le PREMIER paragraphe
    //    sous le terme, une phrase autonome) → DefinedTermSet. Texte VISIBLE,
    //    relu par le vérificateur dans la page.
    if (ctx.type === 'glossaire') {
      const termes = [];
      for (let i = 0; i < enfants.length; i++) {
        const n = enfants[i];
        if (n.type !== 'heading' || n.depth !== 3) continue;
        const suivant = enfants.slice(i + 1).find((x) => x.type !== 'html');
        const definition = suivant?.type === 'paragraph' ? texteVisible(suivant) : '';
        if (!definition) throw new Error(`[site] ${ctx.fichier} : terme « ${texteVisible(n)} » sans définition (un paragraphe juste sous le ### )`);
        termes.push({ terme: texteVisible(n), definition, id: n.data?.hProperties?.id });
      }
      if (!termes.length) throw new Error(`[site] ${ctx.fichier} : glossaire sans aucun terme (### Terme, puis sa définition)`);
      info.termes = termes;
    }

    // 6. Le Markdown résolu (llms-full.txt), APRÈS toutes les résolutions.
    info.markdown = markdownResolu(arbre);
  };
}

/** Forme d'une image : capture de téléphone (haute), fenêtre (large) ou carte. */
export function formeImage({ largeur, hauteur }) {
  if (!largeur || !hauteur) return 'carte';
  if (hauteur / largeur > 1.6) return 'telephone';
  if (largeur / hauteur > 1.3) return 'fenetre';
  return 'carte';
}

const el = (tagName, properties, children) => ({ type: 'element', tagName, properties, children });
const estTitre = (n, ...niveaux) => n?.type === 'element' && niveaux.includes(n.tagName);

/** Texte d'un nœud hast. */
function texteHast(n) {
  if (n.type === 'text') return n.value;
  return (n.children ?? []).map(texteHast).join('').trim();
}

/**
 * Plugin rehype (après la conversion en HTML, avant le rendu React) :
 *   · une image SEULE dans son paragraphe devient une <figure> — dans un
 *     CADRE DE TÉLÉPHONE dessiné en CSS si c'est une capture haute (jamais un
 *     téléphone cuit dans l'image), avec la mention « compte de démonstration » ;
 *   · la FAQ visible (section « Questions fréquentes », ou toutes les ### du
 *     type faq) en <details> accessibles : <summary> porte le ### et la
 *     réponse suit, SEULE, jusqu'au titre suivant — le vérificateur relit
 *     exactement ce texte contre la FAQPage.
 */
/**
 * Un tableau Markdown, accessible (revue technique M-2) :
 *   · enveloppé dans une région qui défile sur mobile sans élargir la page,
 *     NOMMÉE par le titre qui la précède (aria-labelledby ; « Tableau » seul,
 *     identique sur toutes les pages, ne disait rien) — repli : le libellé ;
 *   · coin d'en-tête VIDE (« | | Vinted | Beebs | ») : il devient une cellule
 *     ordinaire, et la première colonne devient l'en-tête de LIGNE
 *     (<th scope="row">) — un lecteur d'écran annonce enfin la ligne ;
 *   · en-têtes de colonne en scope="col" ; une ligne d'en-tête ENTIÈREMENT
 *     vide (« | | | », tableau clé → valeur) est retirée : des en-têtes de
 *     colonne vides ne nomment rien.
 * L'arrêt du clavier (tabindex) n'est gardé par site.js que si le bloc défile.
 */
function tableAccessible(table, titre, libelle) {
  const lignes = (balise) => (table.children ?? []).filter((n) => n.type === 'element' && n.tagName === balise)
    .flatMap((s) => (s.children ?? []).filter((r) => r.type === 'element' && r.tagName === 'tr'));
  const cellules = (tr) => (tr.children ?? []).filter((c) => c.type === 'element' && (c.tagName === 'th' || c.tagName === 'td'));
  let entete = lignes('thead')[0];
  const coin = entete ? cellules(entete)[0] : null;
  const coinVide = !!coin && !texteHast(coin);
  if (entete && cellules(entete).every((c) => !texteHast(c))) {
    table.children = (table.children ?? []).filter((n) => !(n.type === 'element' && n.tagName === 'thead'));
    entete = null;
  }
  if (entete) {
    for (const c of cellules(entete)) {
      if (c === coin && coinVide) { c.tagName = 'td'; continue; }
      c.properties = { ...c.properties, scope: 'col' };
    }
  }
  if (coinVide) {
    for (const tr of lignes('tbody')) {
      const premiere = cellules(tr)[0];
      if (premiere) { premiere.tagName = 'th'; premiere.properties = { ...premiere.properties, scope: 'row' }; }
    }
  }
  if (titre?.id) table.properties = { ...table.properties, ariaLabelledBy: titre.id };
  return el('div', {
    className: ['defile'], role: 'region', tabIndex: 0, dataDefile: '',
    ...(titre?.id ? { ariaLabelledBy: titre.id } : { ariaLabel: libelle }),
  }, [table]);
}

function rehypeSite(ctx) {
  return () => (arbre) => {
    // 0. Tableaux (nommés par le titre qui les précède) et blocs <pre> (arrêt
    //    du clavier s'ils défilent : sans règle, quatre formules élargissaient
    //    /blog/comment-calculer-profits-vinted à 777 px sur un écran de 320,
    //    revue technique C-10).
    let dernierTitre = null;
    const visiterBlocs = (n) => {
      if (!Array.isArray(n.children)) return;
      n.children = n.children.map((c) => {
        if (c.type !== 'element') return c;
        if (/^h[1-6]$/.test(c.tagName)) { dernierTitre = { id: c.properties?.id, texte: texteHast(c) }; return c; }
        if (c.tagName === 'table') return tableAccessible(c, dernierTitre, ctx.libelleTableau);
        if (c.tagName === 'pre') { c.properties = { ...c.properties, className: [...[].concat(c.properties?.className ?? []), 'bloc-code'], tabIndex: 0, dataDefile: '' }; return c; }
        visiterBlocs(c);
        return c;
      });
    };
    visiterBlocs(arbre);

    // 1. Figures.
    const visiterHast = (n) => {
      if (!Array.isArray(n.children)) return;
      n.children = n.children.map((c) => {
        if (c.type === 'element' && c.tagName === 'p') {
          const utiles = c.children.filter((x) => !(x.type === 'text' && !x.value.trim()));
          if (utiles.length === 1 && utiles[0].type === 'element' && utiles[0].tagName === 'img') {
            const image = ctx.info.images[Number(utiles[0].properties?.dataImage)];
            const forme = image ? formeImage(image) : 'carte';
            const contenu = forme === 'telephone' ? [el('div', { className: ['telephone'] }, [utiles[0]])] : [utiles[0]];
            const legende = forme === 'telephone' && ctx.libelleCapture ? [el('figcaption', {}, [{ type: 'text', value: ctx.libelleCapture }])] : [];
            return el('figure', { className: ['media', `media-${forme}`] }, [...contenu, ...legende]);
          }
        }
        visiterHast(c);
        return c;
      });
    };
    visiterHast(arbre);

    // 1 bis. Comparatif (type classement, 10/10, Nico) : chaque comparatif
    //    REPLIÉ, déplié au toucher. Une section ## qui porte des ### garde son
    //    titre et son introduction visibles (la réponse courte reste lue
    //    d'emblée) et replie chacun de ses ### ; une section ## sans ### se
    //    replie entière. La FAQ (plus bas) garde son propre repli. Le texte
    //    reste dans le HTML (<details>), tel quel : même empreinte des dates.
    if (ctx.type === 'classement') {
      const tous = arbre.children;
      const faqA = tous.findIndex((n) => estTitre(n, 'h2') && TITRE_FAQ.test(texteHast(n)));
      const borne = faqA >= 0 ? faqA : tous.length;
      const repli = (titre, corps) => el('details', { className: ['repli'] }, [
        el('summary', {}, [titre]),
        el('div', { className: ['repli-corps'] }, corps),
      ]);
      const plie = [];
      let k = 0;
      while (k < borne && !estTitre(tous[k], 'h2')) plie.push(tous[k++]);
      while (k < borne) {
        const h2 = tous[k];
        let j = k + 1;
        while (j < borne && !estTitre(tous[j], 'h2')) j++;
        const section = tous.slice(k + 1, j);
        if (section.some((n) => estTitre(n, 'h3'))) {
          plie.push(h2);
          let m = 0;
          while (m < section.length && !estTitre(section[m], 'h3')) plie.push(section[m++]);
          while (m < section.length) {
            const h3 = section[m++];
            const corps = [];
            while (m < section.length && !estTitre(section[m], 'h3')) corps.push(section[m++]);
            plie.push(repli(h3, corps));
          }
        } else {
          plie.push(repli(h2, section));
        }
        k = j;
      }
      arbre.children = [...plie, ...tous.slice(borne)];
    }

    // 2. FAQ en <details>.
    const enfants = arbre.children;
    let debut;
    let fin = enfants.length;
    if (ctx.type === 'faq') {
      debut = 0;
    } else {
      debut = enfants.findIndex((n) => estTitre(n, 'h2') && TITRE_FAQ.test(texteHast(n)));
      if (debut < 0) return;
      const suivant = enfants.findIndex((n, i) => i > debut && estTitre(n, 'h2'));
      if (suivant >= 0) fin = suivant;
      debut += 1;
    }
    const sortie = enfants.slice(0, debut);
    let i = debut;
    while (i < fin) {
      const n = enfants[i];
      if (!estTitre(n, 'h3')) { sortie.push(n); i++; continue; }
      const reponse = [];
      i++;
      while (i < fin && !estTitre(enfants[i], 'h2', 'h3')) reponse.push(enfants[i++]);
      sortie.push(el('details', { className: ['faq-item'] }, [
        el('summary', {}, [n]),
        el('div', { className: ['faq-reponse'] }, reponse),
      ]));
    }
    arbre.children = [...sortie, ...enfants.slice(fin)];
  };
}

/**
 * Rend un corps Markdown en HTML statique.
 * ctx : { fichier, source ('site'|'blog'), type, lang, faqAttendue, racine,
 *         resoudre(id, fichier, langue|null) → { chemin, lang, hreflang },
 *         medias, url(fichierGenere), libelleTableau, libelleCapture }
 * Rend { html, markdown, titres, images, faq, termes, liensInternes }.
 */
export async function rendreMarkdown(markdown, ctx) {
  const { React, renderToStaticMarkup, Markdown, remarkGfm } = await chargerBriques();
  const info = { titres: [], images: [], faq: null, termes: null, liensInternes: [], markdown: '' };
  const h = React.createElement;

  const composants = {
    img: ({ node: _node, ...props }) => {
      const image = info.images[Number(props['data-image'] ?? props.dataImage)];
      const attrsImg = {
        src: image.repli, alt: image.alt, width: image.largeur, height: image.hauteur,
        decoding: 'async',
        ...(image.principale ? { fetchPriority: 'high' } : { loading: 'lazy' }),
      };
      if (!image.variantes) return h('img', attrsImg);
      const sources = ['avif', 'webp']
        .filter((format) => image.variantes[format]?.length)
        .map((format) => h('source', {
          key: format,
          type: `image/${format}`,
          srcSet: image.variantes[format].map((v) => `${ctx.url(v.fichier)} ${v.largeur}w`).join(', '),
          // Alignés sur site.css (revue technique M-7) : .prose .telephone = min(64vw, 270px)
          // moins ses bords ; la colonne de lecture fait 720 px au plus.
          sizes: formeImage(image) === 'telephone' ? '(min-width: 422px) 252px, calc(64vw - 18px)' : '(min-width: 784px) 720px, calc(100vw - 36px)',
        }));
      return h('picture', null, ...sources, h('img', attrsImg));
    },
  };

  const brut = renderToStaticMarkup(h(Markdown, {
    remarkPlugins: [remarkGfm, remarqueSite({ ...ctx, info })],
    rehypePlugins: [rehypeSite({ ...ctx, info })],
    components: composants,
  }, markdown));

  // React écrit srcSet / fetchPriority / hrefLang : valides (HTML insensible à
  // la casse), mais on sert la forme usuelle, plus lisible et plus sûre pour
  // les outils.
  const html = brut.replace(/ srcSet="/g, ' srcset="').replace(/ fetchPriority="/g, ' fetchpriority="').replace(/ hrefLang="/g, ' hreflang="');
  if (/href=""|href="#"|\b(href|src)="(page|media):/.test(html)) {
    throw new Error(`[site] ${ctx.fichier} : lien vide, « # » seul ou « page: / media: » non résolu dans la sortie`);
  }
  return { html, ...info };
}
