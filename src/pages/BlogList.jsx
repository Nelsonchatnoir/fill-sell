import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { posts } from '../blog/posts';
import './blog.css';

function useSEO({ title, description }) {
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
      setMeta('property', 'og:type', 'website'),
    ];
    return () => { document.title = prev; metas.forEach(el => el.remove()); };
  }, [title, description]);
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

export default function BlogList() {
  useSEO({
    title: 'Blog — FillSell',
    description: 'Conseils, guides et astuces pour les revendeurs : calcul de marges, gestion des profits, plateformes de vente.',
  });

  return (
    <>
      <nav className="blog-nav">
        <div className="blog-nav-inner">
          <Link to="/" className="blog-brand">
            <img src="/icon_180x180.png" alt="FillSell" width={28} height={28} style={{ borderRadius: 7 }} />
            <span className="blog-brand-name">FillSell</span>
          </Link>
          <div className="blog-nav-links">
            <Link to="/" className="blog-nav-link">Accueil</Link>
            <a href="https://fillsell.app" className="blog-nav-cta">Essayer gratuitement</a>
          </div>
        </div>
      </nav>

      <div className="blog-hero">
        <h1>Blog FillSell</h1>
        <p>Guides pratiques pour revendre plus intelligemment et calculer vos marges avec précision.</p>
      </div>

      <div className="blog-list">
        {posts.map(post => (
          <Link key={post.slug} to={`/blog/${post.slug}`} className="blog-card">
            <div>
              <span className="blog-card-date">{formatDate(post.date, post.lang)}</span>
              {post.lang && <span className="blog-card-lang">{post.lang.toUpperCase()}</span>}
            </div>
            <h2>{post.title}</h2>
            <p>{post.description}</p>
            <span className="blog-card-read">Lire l'article →</span>
          </Link>
        ))}
      </div>
    </>
  );
}
