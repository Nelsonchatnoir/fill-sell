import { useEffect } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPostBySlug } from '../blog/posts';
import useSeo, { canonicalFor, SITE_ORIGIN } from '../lib/seo';
import './blog.css';

function formatDate(dateStr, lang) {
  try {
    return new Date(dateStr).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function BlogPost() {
  const { slug } = useParams();
  const post = getPostBySlug(slug);

  // Slug inconnu : la vue redirige vers /blog juste en dessous, donc on ne pose
  // pas un canonical sur une URL qui n'existe pas — on annonce déjà /blog.
  useSeo({
    path: post ? `/blog/${post.slug}` : '/blog',
    title: post ? `${post.title} — FillSell` : 'Article introuvable — FillSell',
    description: post?.description ?? '',
    ogType: 'article',
    ogImage: post?.og_image ?? null,
  });

  // Prérendu (2026-09-05) : en entrée directe sur /blog/<slug>, le HTML servi
  // porte déjà les JSON-LD Article/FAQ de l'article (data-blog-jsonld, posés
  // au build par scripts/vite-plugin-prerender-blog.mjs). On les retire au
  // montage — les deux effets ci-dessous les reposent à l'identique — pour ne
  // pas les servir en double une fois l'app montée.
  useEffect(() => {
    document.head.querySelectorAll('script[data-blog-jsonld]').forEach(el => el.remove());
  }, []);

  // Article JSON-LD (2026-08-02) : posé pour TOUS les articles depuis le
  // frontmatter (title/description/date/og_image). Même contrat que le script
  // FAQ ci-dessous : injecté au montage, retiré au démontage, jamais d'erreur.
  useEffect(() => {
    if (!post) return undefined;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.description ?? '',
      datePublished: post.date,
      inLanguage: post.lang ?? 'fr',
      mainEntityOfPage: canonicalFor(`/blog/${post.slug}`),
      ...(post.og_image ? { image: SITE_ORIGIN + post.og_image } : {}),
      author: { '@type': 'Organization', name: 'FillSell', url: SITE_ORIGIN },
      publisher: {
        '@type': 'Organization',
        name: 'FillSell',
        logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icon_180x180.png` },
      },
    });
    document.head.appendChild(el);
    return () => el.remove();
  }, [post]);

  // FAQ JSON-LD (2026-07-30) : un article peut porter un frontmatter `faq` —
  // un tableau JSON SUR UNE SEULE LIGNE de {q, a} (le parseur de posts.js est
  // ligne à ligne, un JSON multi-lignes serait tronqué). Injecté ici en
  // <script type="application/ld+json"> FAQPage, retiré au démontage.
  // Best-effort : JSON invalide ou absent → aucun script, jamais d'erreur.
  useEffect(() => {
    if (!post?.faq) return undefined;
    let entries;
    try { entries = JSON.parse(post.faq); } catch { return undefined; }
    if (!Array.isArray(entries) || entries.length === 0) return undefined;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: entries
        .filter(e => e && e.q && e.a)
        .map(e => ({
          '@type': 'Question',
          name: e.q,
          acceptedAnswer: { '@type': 'Answer', text: e.a },
        })),
    });
    document.head.appendChild(el);
    return () => el.remove();
  }, [post]);

  if (!post) return <Navigate to="/blog" replace />;

  const isFr = post.lang === 'fr';

  return (
    <>
      <nav className="blog-nav">
        <div className="blog-nav-inner">
          <Link to="/" className="blog-brand">
            <img src="/icon_180x180.png" alt="FillSell" width={28} height={28} style={{ borderRadius: 7 }} />
            <span className="blog-brand-name">FillSell</span>
          </Link>
          <div className="blog-nav-links">
            <Link to="/blog" className="blog-nav-link">← Blog</Link>
            <a href="https://fillsell.app" className="blog-nav-cta">
              {isFr ? 'Essayer gratuitement' : 'Try for free'}
            </a>
          </div>
        </div>
      </nav>

      <article className="blog-post-wrap">
        <Link to="/blog" className="blog-back">← {isFr ? 'Retour au blog' : 'Back to blog'}</Link>

        <header className="blog-post-header">
          <div className="blog-post-meta">
            {formatDate(post.date, post.lang)}
            {post.lang && <span className="blog-card-lang" style={{ marginLeft: 10 }}>{post.lang.toUpperCase()}</span>}
          </div>
          <h1 className="blog-post-title">{post.title}</h1>
          {post.description && <p className="blog-post-desc">{post.description}</p>}
        </header>

        <div className="blog-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
        </div>

        <div className="blog-post-cta">
          <p>{isFr
            ? 'Calculez vos marges automatiquement avec FillSell — dictez vos achats, l\'app fait le reste.'
            : 'Calculate your margins automatically with FillSell — log your purchases by voice, the app does the rest.'
          }</p>
          <a href="https://fillsell.app">
            {isFr ? 'Essayer FillSell gratuitement →' : 'Try FillSell for free →'}
          </a>
        </div>
      </article>
    </>
  );
}
