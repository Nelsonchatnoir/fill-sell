// Routes de l'APP (SPA React) — liste FERMÉE (09/10/2026, chantier site vitrine).
//
// Avant le site statique, vercel.json réécrivait TOUT vers /index.html : une URL
// inconnue répondait 200 avec la coquille vide (« soft 404 », revue B I1), et
// n'importe quel fichier posé dans le dossier de sortie pouvait masquer une
// route de l'app sans erreur (revue A I3, revue C I10 : une page « extension »
// aurait remplacé pour toujours la page d'installation ouverte par le mail
// send-extension-link).
//
// Désormais :
//   · vercel.json ne réécrit vers /app-shell.html QUE les chemins ci-dessous
//     (selftest:site-routes-app vérifie que vercel.json, AppRouter.jsx et les
//     URL écrites dans supabase/functions/, chrome-extension/ et src/ sont
//     couverts) ; tout le reste tombe sur 404.html ;
//   · le générateur et site:verifier REFUSENT toute page vitrine dont le chemin
//     recoupe une de ces routes (sauf `partagee`, voir plus bas).
//
// Champs :
//   source    motif Vercel (syntaxe de vercel.json, `(.*)` = la suite du chemin)
//   pourquoi  qui ouvre cette URL — l'appelant décide, pas la liste
//   noindex   l'en-tête X-Robots-Tag est posé par vercel.json (route privée)
//   partagee  le site statique écrit AUSSI des pages sous ce chemin (le blog) :
//             le fichier sur disque passe avant le rewrite, la coquille ne
//             sert que les adresses que le site n'a pas écrites (un slug
//             inconnu → BlogPost → /blog, comme avant)
//   sitemap   route de l'app INDEXABLE déjà présente dans le sitemap de prod
//             (garde de non-régression, revue B M9) — SANS lastmod depuis le
//             09/10 : la date suivait le fichier src/pages/Legal.jsx, et un
//             commentaire ajouté par un autre terminal faisait échouer le
//             déploiement (revue de la fondation I-3)
//
// ⛔ Ajouter une route à AppRouter.jsx, ou une URL du site dans un mail, une
// fonction, l'extension : l'ajouter ICI et dans vercel.json (même commit),
// sinon elle répondra 404. TOUS les builds le refusent en nommant la route
// (natif, OTA, Vercel : plugin appShell → scripts/site/controle-routes.mjs) —
// plus seulement un selftest lancé à la main (revue de la fondation, app § 2).
export const ROUTES_APP = [
  { source: '/app', pourquoi: "l'app connectée (popup de l'extension, rechargement build.json)" },
  { source: '/app/(.*)', pourquoi: "sous-chemins de l'app (filet : aucun aujourd'hui, l'app vit sur /app)" },
  { source: '/login', noindex: true, pourquoi: 'connexion et inscription (?mode=signup, ?offre=)' },
  { source: '/auth', noindex: true, pourquoi: "bouton « Se connecter » du popup de l'extension (chrome-extension/config.js AUTH_URL) : SPA → route * → /" },
  { source: '/auth/(.*)', noindex: true, pourquoi: '/auth/callback (OAuth Google/Apple), /auth/confirm (lien de confirmation)' },
  { source: '/success', noindex: true, pourquoi: 'retour Stripe (create-checkout-session success_url)' },
  { source: '/cancel', noindex: true, pourquoi: 'retour Stripe (cancel_url ?session_id=)' },
  { source: '/reset-password', noindex: true, pourquoi: 'lien du mail de réinitialisation (App.jsx resetPasswordForEmail)' },
  { source: '/extension', pourquoi: "page d'installation de l'extension (mail send-extension-link, URL_EXTENSION)" },
  { source: '/ebay/(.*)', noindex: true, pourquoi: 'retour du consentement eBay (/ebay/retour?etat=, _shared/ebay-oauth.ts)' },
  { source: '/desinscription', noindex: true, pourquoi: 'lien de désinscription des mails (obligation légale)' },
  { source: '/legal', pourquoi: 'mentions légales et confidentialité (pied de chaque mail, /legal#confidentialite exigé par Google OAuth)', sitemap: true },
  { source: '/demo/(.*)', noindex: true, nofollow: true, pourquoi: 'démonstrations non listées (/demo/barre-progression)' },
  { source: '/blog', partagee: true, pourquoi: 'liste du blog (route React BlogList ; le site écrit /blog en statique)' },
  { source: '/blog/(.*)', partagee: true, pourquoi: 'articles (route React BlogPost ; le site écrit chaque article connu en statique)' },
];

// Fichiers du dossier de sortie qui appartiennent à l'app ou au build, jamais
// au site : une page vitrine ne peut pas porter ces noms (revue A I3).
export const FICHIERS_RESERVES = ['app-shell.html', 'build.json', 'fillsell-extension.zip'];

// Pages HTML de public/ PERMISES, une par une, avec leur raison (09/10/2026,
// revue de la fondation, app § 5). site:verifier refuse toute page HTML de la
// sortie sans marqueur fillsell-page (une coquille ou le reste d'un autre build
// passerait pour une page) : un fichier de vérification Search Console
// (google<code>.html) déposé dans public/ aurait fait tomber le build Vercel,
// et lui seul. Tout build le refuse désormais en local (scripts/site/controle.mjs)
// tant qu'il n'est pas nommé ici. Chemins relatifs à public/, en « / ».
export const HTML_PUBLIC_PERMIS = [
  // { fichier: 'google0123456789abcdef.html', pourquoi: 'vérification Search Console (Nico, date)' },
];

// La destination unique des rewrites de l'app (copie de la coquille Vite).
export const COQUILLE = '/app-shell.html';

// Motif Vercel → RegExp ancrée. Couvre ce que vercel.json emploie : littéraux,
// groupes regex `( … )` gardés tels quels (alternatives, `(?!…)`), `\\.`
// échappé, et les paramètres `:nom` / `:nom*` de path-to-regexp.
export function sourceVersRegex(source) {
  let sortie = '';
  let profondeur = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') { sortie += c + (source[i + 1] ?? ''); i++; continue; }
    if (c === '(') { profondeur++; sortie += c; continue; }
    if (c === ')') { profondeur--; sortie += c; continue; }
    if (profondeur > 0) { sortie += c; continue; }
    if (c === ':') {
      const m = /^:([A-Za-z_]\w*)(\*)?/.exec(source.slice(i));
      if (m) { sortie += m[2] ? '(.*)' : '([^/]+)'; i += m[0].length - 1; continue; }
    }
    sortie += /[.*+?^${}|[\]]/.test(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${sortie}$`);
}

const REGEX_ROUTES = ROUTES_APP.map((r) => ({ ...r, regex: sourceVersRegex(r.source) }));

/** La route de l'app qui sert ce chemin (sans query), ou null. */
export function routeAppPour(chemin) {
  return REGEX_ROUTES.find((r) => r.regex.test(chemin)) ?? null;
}

/**
 * Le chemin d'une page vitrine recoupe-t-il l'app ? Rend la raison, ou null.
 * On juge sur le PREMIER segment, pas sur le chemin exact : une page
 * /legal/cgv créerait un dossier legal/ dans la sortie, et le jour où
 * quelqu'un y pose un index.html, il passe avant le rewrite de /legal.
 * Refuser tout le segment ferme la porte une fois pour toutes.
 */
export function cheminReserve(chemin) {
  const propre = chemin.replace(/\/+$/, '') || '/';
  if (propre === '/') return null;
  const premier = propre.split('/')[1];
  if (FICHIERS_RESERVES.includes(premier)) return `fichier réservé au build : ${premier}`;
  if (premier === 'assets') return '/assets/ est réservé aux fichiers du build (le site range les siens sous /assets/site/)';
  for (const r of REGEX_ROUTES) {
    if (r.partagee) continue;
    const segment = r.source.split('/')[1];
    if (segment === premier) return `route de l'app ${r.source} (${r.pourquoi})`;
  }
  return null;
}
