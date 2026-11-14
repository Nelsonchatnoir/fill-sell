import { esc } from '../../scripts/site/lib/html.mjs';
import { LANGUE_RACINE } from '../langues.mjs';
import { LIENS } from './textes.mjs';
import { badges } from './composants.mjs';
import { avecLogos } from './blocs.mjs';

// Page /installer (13/11/2026) — destination UNIQUE des publicités Meta (campagne Trafic) :
// l'iPhone part vers l'App Store, l'Android vers Google Play, l'ordinateur reste sur la page et voit les deux
// badges officiels et l'accès au web. noindex, hors sitemap (verify-site : PAGES_HORS_INDEX).
//
// Mesure : seuls utm_source, utm_medium, utm_campaign, utm_content et utm_term de l'adresse sont relus, bornés
// et transmis à Google Play dans `referrer` (rapport « acquisition » de la Play Console). Rien d'autre n'est lu
// ni transmis. L'App Store n'a pas d'équivalent sans le jeton fournisseur (pt) d'App Store Connect : quand il est
// connu, il se pose dans APP_STORE_PT et la campagne part dans `ct`.
// (14/11, bloc E1) Règle d'Apple (developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links) :
// lien `…/id<app>?pt=<jeton fournisseur>&ct=<campagne>&mt=8` ; ct = 30 caractères au plus, jamais une espace en
// premier ou dernier caractère ; pt = un nombre, propre au compte développeur, qui NE SE FABRIQUE PAS : Nico le lit
// en générant un lien de campagne dans App Store Connect (App Analytics → Acquisition → Campagnes). Le résultat est
// AGRÉGÉ (premiers téléchargements par campagne, seuil de 5, 24 h après le lancement), jamais relié à un compte.
// La source d'acquisition du site (fs_acq) est relevée comme sur toute page par le script d'aiguillage. Elle suit
// la personne qui s'inscrit sur le web (ordinateur, ou téléphone resté sur la page) ; dans l'app native, Android la
// retrouve par Google Play (src/utils/acquisition.js, enrichirSourceAndroid : prochain binaire, INACTIF), l'iPhone
// jamais (aucun referrer App Store : « app_ios »).

export const APP_STORE_PT = null;
export const PARAMS_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

/**
 * Où envoyer ce visiteur. PURE (testée par scripts/site/installer-selftest.mjs) ; sérialisée telle quelle dans la
 * page, d'où les seules constructions ES5 et l'absence de toute dépendance (les constantes arrivent en arguments).
 * @returns {string|null} l'adresse du store, ou null (ordinateur : on reste sur la page)
 */
export function destinationInstallation(ua, recherche, liens, params, pt) {
  ua = String(ua || '');
  var iphone = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile\//.test(ua));
  var android = /Android/i.test(ua);
  if (!iphone && !android) return null;
  var q = {};
  String(recherche || '').replace(/^\?/, '').split('&').forEach(function (paire) {
    var i = paire.indexOf('=');
    var cle = i < 0 ? paire : paire.slice(0, i);
    var brut = i < 0 ? '' : paire.slice(i + 1);
    var v;
    try { v = decodeURIComponent(brut.replace(/\+/g, ' ')); } catch (_e) { v = ''; }
    v = v.replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 100);
    if (params.indexOf(cle) >= 0 && v && !(cle in q)) q[cle] = v;
  });
  if (iphone) {
    var jeton = String(pt || '').replace(/[^0-9]/g, '');
    var ct = q.utm_campaign ? q.utm_campaign.slice(0, 30).trim() : '';
    if (!jeton || !ct) return liens.appStore;
    return liens.appStore + '?pt=' + jeton + '&ct=' + encodeURIComponent(ct) + '&mt=8';
  }
  var ref = params.filter(function (c) { return q[c]; }).map(function (c) { return c + '=' + encodeURIComponent(q[c]); }).join('&');
  return ref ? liens.googlePlay + '&referrer=' + encodeURIComponent(ref) : liens.googlePlay;
}

const TEXTE = {
  title: 'Installer FillSell sur ton téléphone',
  description: "Installe l'app FillSell sur iPhone ou sur Android : publie, republie et suis tes ventes sur Vinted, Leboncoin, eBay, Beebs et Depop.",
  titre: 'Installer FillSell',
  chapo: "Sur ton téléphone, le store s'ouvre tout seul. Sinon, choisis ton store ci-dessous : l'app est gratuite pour commencer.",
  texte: 'FillSell publie, republie et retire tes annonces sur Vinted, Leboncoin, eBay, Beebs et Depop, et suit tes ventes depuis ton téléphone.',
  web: 'Utiliser FillSell sur le web',
};

export const PAGE_INSTALLER = { id: 'installer', chemin: '/installer', title: TEXTE.title, description: TEXTE.description };

export function installer({ site }) {
  const lang = LANGUE_RACINE;
  const appel = `(${destinationInstallation.toString()})(navigator.userAgent, location.search, ${JSON.stringify({ appStore: LIENS.appStore, googlePlay: LIENS.googlePlay })}, ${JSON.stringify(PARAMS_UTM)}, ${JSON.stringify(APP_STORE_PT)})`;
  return `<div class="cadre introuvable">
<!--fs:contenu:debut-->
<section lang="${esc(lang)}">
<h1>${esc(TEXTE.titre)}</h1>
<p class="chapo">${esc(TEXTE.chapo)}</p>
<p>${avecLogos(site, TEXTE.texte)}</p>
${badges(site, lang)}
<ul class="liens-404"><li><a href="/login?mode=signup" data-cta="signup_installer">${esc(TEXTE.web)}</a></li></ul>
</section>
<!--fs:contenu:fin-->
</div>
<script>(function () { try { var d = ${appel}; if (d) location.replace(d); } catch (e) {} })();</script>`;
}
