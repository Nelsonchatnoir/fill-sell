import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter, slugFromPath, sortPosts } from '../src/blog/frontmatter.js';

// Prérendu du blog au build (2026-09-05).
//
// Constat sur la SORTIE du build, pas sur la config : le rewrite Vercel sert le
// même index.html sur /blog et /blog/<slug>. Le HTML reçu par un crawler
// portait donc le <title>, la description, le canonical et le hreflang de la
// HOME, et un <div id="root"></div> vide — le texte des articles ne vivait que
// dans assets/blog-*.js, rendu par React après coup. useSeo (src/lib/seo.js)
// corrige les balises côté client, ce que Googlebot finit par voir, mais avec
// un budget de rendu JS, du retard, et rien du tout pour les autres robots
// (Bing, réseaux sociaux, aperçus de lien, LLM crawlers).
//
// Ce plugin écrit, après le bundle, une page HTML COMPLÈTE par article dans
// dist/blog/<slug>/index.html (+ dist/blog/index.html pour la liste), à partir
// du dist/index.html produit par Vite : mêmes scripts, même CSS, même entrée
// SPA — seuls le <head> (title, description, og, canonical, hreflang, JSON-LD)
// et le contenu de #root changent. Vercel sert un fichier présent sur disque
// AVANT d'appliquer les rewrites, donc ces pages priment sur le fallback SPA.
// Au chargement, React monte l'app dans #root (createRoot vide le conteneur)
// et BlogPost.jsx reprend la main : le HTML statique n'est là que pour le
// premier octet et les robots, l'app reste l'app.
//
// Le sitemap est généré ICI aussi, depuis les mêmes fichiers .md : un article
// ajouté est dans le sitemap par construction, plus besoin d'y penser (le
// public/sitemap.xml manuel a été retiré le même jour). `translation: <slug>`
// dans le frontmatter relie une version FR et une version EN : hreflang posé
// dans le <head> et dans le sitemap, x-default sur la version française.
//
// Toute rupture (balise attendue absente de index.html, traduction inconnue,
// CSS du blog introuvable) fait ÉCHOUER le build — jamais une page servie avec
// les métadonnées de la home en silence.

const SITE_ORIGIN = 'https://fillsell.app';
const BLOG_DIR = 'src/blog';

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// JSON-LD dans un <script> : « </ » fermerait la balise, on le neutralise.
const jsonLd = obj => JSON.stringify(obj).replace(/<\//g, '<\\/');

function formatDate(dateStr, lang) {
  return new Date(dateStr).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

async function loadPosts() {
  const dir = path.resolve(BLOG_DIR);
  const files = (await readdir(dir)).filter(f => f.endsWith('.md'));
  const posts = await Promise.all(files.map(async file => {
    const raw = await readFile(path.join(dir, file), 'utf8');
    const { data, content } = parseFrontmatter(raw);
    return { slug: slugFromPath(file), ...data, content };
  }));
  for (const p of posts) {
    if (!p.title || !p.date || !p.lang) {
      throw new Error(`[prerender-blog] ${p.slug}.md : frontmatter incomplet (title/date/lang requis)`);
    }
    if (p.translation && !posts.some(o => o.slug === p.translation)) {
      throw new Error(`[prerender-blog] ${p.slug}.md : translation « ${p.translation} » ne correspond à aucun article`);
    }
  }
  return sortPosts(posts);
}

// Remplace la valeur capturée par le groupe central de `re` ; échoue si la
// balise n'est pas dans le template — signe qu'index.html a changé et que la
// page prérendue partirait avec les métadonnées de la home.
function setTag(html, re, value, label) {
  if (!re.test(html)) throw new Error(`[prerender-blog] balise introuvable dans index.html : ${label}`);
  return html.replace(re, (_m, before, _old, after) => `${before}${esc(value)}${after}`);
}

const metaRe = (attr, name) => new RegExp(`(<meta ${attr}="${name}" content=")([^"]*)(")`);

// Liens hreflang d'une page : elle-même, sa traduction, et x-default sur la
// version française du couple. Sans traduction, un seul lien (comme l'ancien
// sitemap manuel).
function alternates(post, bySlug) {
  const self = { lang: post.lang, href: `${SITE_ORIGIN}/blog/${post.slug}` };
  if (!post.translation) return [self];
  const other = bySlug.get(post.translation);
  const pair = [self, { lang: other.lang, href: `${SITE_ORIGIN}/blog/${other.slug}` }];
  const fr = pair.find(a => a.lang === 'fr') ?? self;
  return [...pair, { lang: 'x-default', href: fr.href }];
}

function applyHead(template, {
  lang, title, description, canonical, ogType, ogImage, hreflangs, extraHead,
}) {
  let html = template;
  html = setTag(html, /(<html lang=")([^"]*)(")/, lang, 'html lang');
  html = setTag(html, /(<title>)([^<]*)(<\/title>)/, title, 'title');
  html = setTag(html, metaRe('name', 'description'), description, 'meta description');
  html = setTag(html, metaRe('property', 'og:type'), ogType, 'og:type');
  html = setTag(html, metaRe('property', 'og:url'), canonical, 'og:url');
  html = setTag(html, metaRe('property', 'og:locale'), lang === 'fr' ? 'fr_FR' : 'en_US', 'og:locale');
  html = setTag(html, metaRe('property', 'og:title'), title, 'og:title');
  html = setTag(html, metaRe('property', 'og:description'), description, 'og:description');
  html = setTag(html, metaRe('property', 'og:image'), ogImage, 'og:image');
  html = setTag(html, metaRe('name', 'twitter:title'), title, 'twitter:title');
  html = setTag(html, metaRe('name', 'twitter:description'), description, 'twitter:description');
  html = setTag(html, metaRe('name', 'twitter:image'), ogImage, 'twitter:image');
  html = setTag(html, /(<link rel="canonical" href=")([^"]*)(")/, canonical, 'canonical');

  // Le bloc hreflang de la home (fr/en/x-default → origine) est remplacé par
  // celui de la page ; il est contigu dans index.html, on retire les trois
  // lignes puis on pose les nôtres au même endroit.
  const hreflangRe = /(\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>)+/;
  if (!hreflangRe.test(html)) throw new Error('[prerender-blog] bloc hreflang introuvable dans index.html');
  const links = hreflangs.map(a => `\n    <link rel="alternate" hreflang="${esc(a.lang)}" href="${esc(a.href)}" />`).join('');
  html = html.replace(hreflangRe, links);

  return html.replace('</head>', `${extraHead}\n  </head>`);
}

function navHtml(isFr, backLink) {
  return `<nav class="blog-nav"><div class="blog-nav-inner">` +
    `<a href="/" class="blog-brand"><img src="/icon_180x180.png" alt="FillSell" width="28" height="28" style="border-radius:7px"><span class="blog-brand-name">FillSell</span></a>` +
    `<div class="blog-nav-links">${backLink}<a href="https://fillsell.app" class="blog-nav-cta">${isFr ? 'Essayer gratuitement' : 'Try for free'}</a></div>` +
    `</div></nav>`;
}

// Miroir de BlogPost.jsx : mêmes classes, même ordre — le CSS du blog s'applique
// au HTML statique comme au rendu React qui le remplace.
function postBody(post, contentHtml) {
  const isFr = post.lang === 'fr';
  return navHtml(isFr, `<a href="/blog" class="blog-nav-link">← Blog</a>`) +
    `<article class="blog-post-wrap">` +
    `<a href="/blog" class="blog-back">← ${isFr ? 'Retour au blog' : 'Back to blog'}</a>` +
    `<header class="blog-post-header">` +
    `<div class="blog-post-meta">${esc(formatDate(post.date, post.lang))}<span class="blog-card-lang" style="margin-left:10px">${esc(post.lang.toUpperCase())}</span></div>` +
    `<h1 class="blog-post-title">${esc(post.title)}</h1>` +
    (post.description ? `<p class="blog-post-desc">${esc(post.description)}</p>` : '') +
    `</header>` +
    `<div class="blog-content">${contentHtml}</div>` +
    `<div class="blog-post-cta"><p>${isFr
      ? 'Calculez vos marges automatiquement avec FillSell — dictez vos achats, l\'app fait le reste.'
      : 'Calculate your margins automatically with FillSell — log your purchases by voice, the app does the rest.'
    }</p><a href="https://fillsell.app">${isFr ? 'Essayer FillSell gratuitement →' : 'Try FillSell for free →'}</a></div>` +
    `</article>`;
}

// Miroir de BlogList.jsx.
function listBody(posts) {
  const cards = posts.map(p =>
    `<a href="/blog/${esc(p.slug)}" class="blog-card">` +
    `<div><span class="blog-card-date">${esc(formatDate(p.date, p.lang))}</span><span class="blog-card-lang">${esc(p.lang.toUpperCase())}</span></div>` +
    `<h2>${esc(p.title)}</h2><p>${esc(p.description ?? '')}</p>` +
    `<span class="blog-card-read">Lire l'article →</span></a>`,
  ).join('');
  return navHtml(true, `<a href="/" class="blog-nav-link">Accueil</a>`) +
    `<div class="blog-hero"><h1>Blog FillSell</h1><p>Guides pratiques pour revendre plus intelligemment et calculer vos marges avec précision.</p></div>` +
    `<div class="blog-list">${cards}</div>`;
}

function articleJsonLd(post) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description ?? '',
    datePublished: post.date,
    inLanguage: post.lang,
    mainEntityOfPage: `${SITE_ORIGIN}/blog/${post.slug}`,
    ...(post.og_image ? { image: SITE_ORIGIN + post.og_image } : {}),
    author: { '@type': 'Organization', name: 'FillSell', url: SITE_ORIGIN },
    publisher: {
      '@type': 'Organization',
      name: 'FillSell',
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icon_180x180.png` },
    },
  };
}

// Même contrat que BlogPost.jsx : faq = JSON sur une ligne, invalide → rien.
function faqJsonLd(post) {
  if (!post.faq) return null;
  let entries;
  try { entries = JSON.parse(post.faq); } catch { return null; }
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.filter(e => e && e.q && e.a).map(e => ({
      '@type': 'Question',
      name: e.q,
      acceptedAnswer: { '@type': 'Answer', text: e.a },
    })),
  };
}

function sitemapXml(posts, bySlug) {
  const latest = posts.reduce((m, p) => (p.date > m ? p.date : m), '');
  const url = (loc, lastmod, changefreq, priority, alts = []) =>
    `  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${esc(lastmod)}</lastmod>\n` +
    `    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n` +
    alts.map(a => `    <xhtml:link rel="alternate" hreflang="${esc(a.lang)}" href="${esc(a.href)}"/>\n`).join('') +
    `  </url>\n`;
  const home = [
    { lang: 'fr', href: SITE_ORIGIN }, { lang: 'en', href: SITE_ORIGIN }, { lang: 'x-default', href: SITE_ORIGIN },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    url(SITE_ORIGIN, '2026-07-26', 'monthly', '1.0', home) +
    url(`${SITE_ORIGIN}/legal`, '2026-07-26', 'yearly', '0.3') +
    url(`${SITE_ORIGIN}/blog`, latest, 'weekly', '0.8') +
    posts.map(p => url(`${SITE_ORIGIN}/blog/${p.slug}`, p.updated || p.date, 'monthly', '0.7', alternates(p, bySlug))).join('') +
    `</urlset>\n`;
}

export default function prerenderBlog() {
  let outDir = 'dist';
  return {
    name: 'prerender-blog',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },

    async closeBundle() {
      // Chargés ici et pas en tête de fichier : react-markdown n'a rien à faire
      // dans le processus du serveur de dev.
      const [{ default: React }, { renderToStaticMarkup }, { default: ReactMarkdown }, { default: remarkGfm }] =
        await Promise.all([import('react'), import('react-dom/server'), import('react-markdown'), import('remark-gfm')]);

      const dist = path.resolve(outDir);
      const template = await readFile(path.join(dist, 'index.html'), 'utf8');
      const assets = await readdir(path.join(dist, 'assets'));
      const blogCss = assets.find(f => /^blog-.*\.css$/.test(f));
      if (!blogCss) throw new Error('[prerender-blog] assets/blog-*.css introuvable : le HTML statique serait servi sans style');
      const preload = names => names
        .map(n => assets.find(f => new RegExp(`^${n}-.*\\.js$`).test(f)))
        .filter(Boolean)
        .map(f => `\n    <link rel="modulepreload" crossorigin href="/assets/${f}" />`).join('');
      const cssLink = `\n    <link rel="stylesheet" crossorigin href="/assets/${blogCss}" />`;

      const posts = await loadPosts();
      const bySlug = new Map(posts.map(p => [p.slug, p]));
      const ld = obj => `\n    <script type="application/ld+json" data-blog-jsonld>${jsonLd(obj)}</script>`;

      for (const post of posts) {
        const contentHtml = renderToStaticMarkup(
          React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, post.content),
        );
        const faq = faqJsonLd(post);
        const html = applyHead(template, {
          lang: post.lang,
          title: `${post.title} — FillSell`,
          description: post.description ?? '',
          canonical: `${SITE_ORIGIN}/blog/${post.slug}`,
          ogType: 'article',
          ogImage: SITE_ORIGIN + (post.og_image || '/og-image-fillsell.png'),
          hreflangs: alternates(post, bySlug),
          extraHead: cssLink + preload(['blog', 'BlogPost']) + ld(articleJsonLd(post)) + (faq ? ld(faq) : ''),
        }).replace('<div id="root"></div>', `<div id="root">${postBody(post, contentHtml)}</div>`);
        const dir = path.join(dist, 'blog', post.slug);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, 'index.html'), html);
      }

      const listHtml = applyHead(template, {
        lang: 'fr',
        title: 'Le blog des revendeurs — FillSell',
        description: 'Guides concrets pour vendre en seconde main : cross-listing, publication multi-plateformes, calcul de marges et gestion de stock. Écrits par l\'équipe FillSell, sans promesses en l\'air.',
        canonical: `${SITE_ORIGIN}/blog`,
        ogType: 'website',
        ogImage: `${SITE_ORIGIN}/og-image-fillsell.png`,
        hreflangs: [{ lang: 'fr', href: `${SITE_ORIGIN}/blog` }],
        extraHead: cssLink + preload(['blog', 'BlogList']),
      }).replace('<div id="root"></div>', `<div id="root">${listBody(posts)}</div>`);
      await writeFile(path.join(dist, 'blog', 'index.html'), listHtml);

      await writeFile(path.join(dist, 'sitemap.xml'), sitemapXml(posts, bySlug));
      console.log(`[prerender-blog] ${posts.length} article(s) + liste prérendus, sitemap.xml généré`);
    },
  };
}
