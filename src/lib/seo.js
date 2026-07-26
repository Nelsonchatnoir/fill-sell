import { useEffect } from 'react';

export const SITE_ORIGIN = 'https://fillsell.app';

/** URL canonique absolue d'une route. La home = l'origine nue, sans slash final. */
export function canonicalFor(path) {
  const clean = String(path ?? '/').split('?')[0].split('#')[0].replace(/\/+$/, '');
  if (clean === '' || clean === '/') return SITE_ORIGIN;
  return SITE_ORIGIN + (clean.startsWith('/') ? clean : `/${clean}`);
}

/**
 * SEO par route. Le rewrite Vercel sert le MÊME index.html sur toutes les
 * routes : sans ce hook, chaque page hérite du title, de la description et
 * surtout du <link rel="canonical"> de la home — elle se déclare elle-même
 * comme étant la home et ne peut donc jamais ranker séparément, tout en étant
 * listée au sitemap sous sa propre URL (deux signaux contradictoires, constat
 * 2026-07-26). Toute route indexable doit appeler ce hook.
 *
 * Deux règles à ne pas casser :
 *
 * 1. Une balise DÉJÀ présente dans index.html est restaurée à son ancienne
 *    valeur au démontage — jamais supprimée. Les deux copies locales de
 *    `useSEO` que ce hook remplace (BlogList.jsx / BlogPost.jsx) faisaient
 *    `el.remove()` sur les balises statiques qu'elles avaient seulement
 *    mutées : après un passage sur /blog, la home perdait sa description, son
 *    og:title, son og:description et son og:type jusqu'au rechargement suivant.
 *    Seules les balises réellement créées ici sont retirées.
 *
 * 2. Le canonical doit être ABSOLU et identique à l'URL listée dans
 *    public/sitemap.xml. Googlebot exécute le JS et lit le DOM rendu, donc
 *    l'injection côté client est prise en compte — mais elle ne pardonne pas
 *    l'incohérence avec le sitemap.
 */
export default function useSeo({ path, title, description, ogTitle, ogType, ogImage }) {
  useEffect(() => {
    const undo = [];

    if (title) {
      const prev = document.title;
      document.title = title;
      undo.push(() => { document.title = prev; });
    }

    // Pose `value` sur la balise ciblée, en empilant de quoi revenir en arrière.
    const put = (selector, build, attr, value) => {
      if (value == null || value === '') return;
      let el = document.head.querySelector(selector);
      if (!el) {
        el = build();
        el.setAttribute(attr, value);
        document.head.appendChild(el);
        undo.push(() => el.remove());
        return;
      }
      const prev = el.getAttribute(attr);
      el.setAttribute(attr, value);
      undo.push(() => {
        if (prev === null) el.removeAttribute(attr);
        else el.setAttribute(attr, prev);
      });
    };

    const meta = (attr, name) => () => {
      const el = document.createElement('meta');
      el.setAttribute(attr, name);
      return el;
    };
    const linkRel = rel => () => {
      const el = document.createElement('link');
      el.setAttribute('rel', rel);
      return el;
    };

    const url = canonicalFor(path);
    put('link[rel="canonical"]', linkRel('canonical'), 'href', url);
    put('meta[property="og:url"]', meta('property', 'og:url'), 'content', url);

    put('meta[name="description"]', meta('name', 'description'), 'content', description);
    put('meta[property="og:description"]', meta('property', 'og:description'), 'content', description);
    put('meta[name="twitter:description"]', meta('name', 'twitter:description'), 'content', description);

    const social = ogTitle || title;
    put('meta[property="og:title"]', meta('property', 'og:title'), 'content', social);
    put('meta[name="twitter:title"]', meta('name', 'twitter:title'), 'content', social);

    put('meta[property="og:type"]', meta('property', 'og:type'), 'content', ogType);

    if (ogImage) {
      const abs = /^https?:\/\//.test(ogImage) ? ogImage : SITE_ORIGIN + ogImage;
      put('meta[property="og:image"]', meta('property', 'og:image'), 'content', abs);
      put('meta[name="twitter:image"]', meta('name', 'twitter:image'), 'content', abs);
    }

    // Ordre inverse de la pose : une balise créée puis mutée revient bien à rien.
    return () => { for (let i = undo.length - 1; i >= 0; i -= 1) undo[i](); };
  }, [path, title, description, ogTitle, ogType, ogImage]);
}
