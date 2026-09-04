// Parseur de frontmatter partagé entre l'app (posts.js, via import.meta.glob)
// et le prérendu du build (scripts/vite-plugin-prerender-blog.mjs, via fs).
// Volontairement sans aucune dépendance ni import Vite : il doit tourner tel
// quel sous Node au moment du build.
//
// Contrat : ligne à ligne, `clé: valeur`, guillemets externes retirés. Une
// valeur multi-lignes (JSON `faq` sur plusieurs lignes, par exemple) serait
// TRONQUÉE — d'où la règle « faq sur UNE seule ligne » dans BlogPost.jsx.
export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };
  const data = {};
  match[1].split('\n').forEach(line => {
    const colon = line.indexOf(':');
    if (colon === -1) return;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
    if (key) data[key] = val;
  });
  return { data, content: match[2] };
}

/** Slug d'un article = nom du fichier .md sans extension ni chemin. */
export function slugFromPath(path) {
  return path.replace(/^.*[\\/]/, '').replace(/\.md$/, '');
}

/** Tri éditorial : le plus récent d'abord. */
export function sortPosts(posts) {
  return [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
}
