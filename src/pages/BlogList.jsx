import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { posts } from '../blog/posts';
import useSeo from '../lib/seo';
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

// Site vitrine statique (09/10/2026) : /blog est une page STATIQUE dans un
// build du site. La SPA n'arrive ici que par une navigation interne (lien
// « Blog » de l'ancien accueil, gardé en filet) : on recharge la liste
// statique au lieu de peindre l'ancienne (même règle que BlogPost.jsx).
const SITE_STATIQUE = typeof __FILLSELL_SITE__ !== 'undefined' && __FILLSELL_SITE__ === true;

export default function BlogList() {
  useSeo({
    path: '/blog',
    title: 'Le blog des revendeurs — FillSell',
    description: 'Guides concrets pour vendre en seconde main : cross-listing, publication multi-plateformes, calcul de marges et gestion de stock. Écrits par l\'équipe FillSell, sans promesses en l\'air.',
    ogType: 'website',
  });
  useEffect(() => {
    if (SITE_STATIQUE) window.location.replace('/blog');
  }, []);
  if (SITE_STATIQUE) return null;

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
