import { esc } from '../../scripts/site/lib/html.mjs';
import { LANGUES, LANGUE_RACINE } from '../langues.mjs';
import { TEXTES } from './textes.mjs';

// Page 404 statique (09/10/2026) — servie par Vercel pour toute URL qui ne
// correspond ni à un fichier ni à une route de l'app (fin du « soft 404 » :
// avant, une URL inventée répondait 200 avec la coquille vide, revue B I1).
// Une section par langue déclarée (site/langues.mjs), la langue racine en
// tête avec le seul <h1> : on ne sait pas d'où vient le visiteur. Des liens
// vers les pivots, jamais une redirection automatique. noindex.
export function introuvable({ site }) {
  const lien = (id, lang) => `<a href="${esc(site.chemin(id, lang))}">${esc(site.nomCourt(id, lang))}</a>`;
  const ordre = [LANGUE_RACINE, ...LANGUES.map((l) => l.code).filter((c) => c !== LANGUE_RACINE)];
  const sections = ordre.map((lang, i) => {
    const t = TEXTES[lang].introuvable;
    const titre = i === 0 ? `<h1>${esc(t.titre)}</h1>` : `<h2>${esc(t.titre)}</h2>`;
    const texte = i === 0 ? `<p class="chapo">${esc(t.texte)}</p>` : `<p>${esc(t.texte)}</p>`;
    return `<section lang="${esc(lang)}">
${i === 0 ? '<p class="code-404" aria-hidden="true">404</p>' : ''}${titre}
${texte}
<ul class="liens-404"><li>${lien('accueil', lang)}</li><li>${lien('faq', lang)}</li><li>${lien('blog', lang)}</li><li><a href="/login">${esc(t.seConnecter)}</a></li></ul>
</section>`;
  });
  return `<div class="cadre introuvable">
<!--fs:contenu:debut-->
${sections.join('\n')}
<!--fs:contenu:fin-->
</div>`;
}
