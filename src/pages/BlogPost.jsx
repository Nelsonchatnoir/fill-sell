import { useEffect } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPostBySlug } from '../blog/posts';
import '../pages/landing.css';
import './blog.css';

function useSEO({ title, description, ogImage }) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    const setMeta = (attr, name, content) => {
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
      el.setAttribute('content', content);
      return el;
    };
    const metas = [
      setMeta('name', 'description', description),
      setMeta('property', 'og:title', title),
      setMeta('property', 'og:description', description),
      setMeta('property', 'og:type', 'article'),
      ...(ogImage ? [setMeta('property', 'og:image', `https://fillsell.app${ogImage}`)] : []),
    ];
    return () => { document.title = prev; metas.forEach(el => el.remove()); };
  }, [title, description, ogImage]);
}

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

  useSEO({
    title: post ? `${post.title} — FillSell` : 'Article introuvable — FillSell',
    description: post?.description ?? '',
    ogImage: post?.og_image ?? null,
  });

  if (!post) return <Navigate to="/blog" replace />;

  const isFr = post.lang === 'fr';

  return (
    <>
      <nav className="blog-nav">
        <div className="blog-nav-inner">
          <Link to="/" className="blog-brand">
            <img src="/icon-192.png" alt="FillSell" width={28} height={28} style={{ borderRadius: 7 }} />
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
