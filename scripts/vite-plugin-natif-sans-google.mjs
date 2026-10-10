import { sansBalisesGoogle, traceursHorsConsentement } from './site/lib/balises.mjs';

// L'APP NATIVE NE CHARGE AUCUNE BALISE GOOGLE (10/10/2026, Nico).
//
// Le site et l'app web chargent Google Tag Manager et Google Ads SOUS
// CONSENTEMENT (build Vercel, bandeau maison, 09/10). L'app iPhone / Android
// n'a pas de bandeau : elle embarquait pourtant index.html tel quel, GTM et
// Google Ads compris, chargés sans accord. Décision de Nico : pas de bandeau
// dans l'app native, donc pas de balise Google là-bas.
//
// Ce plugin ne tourne que dans les builds HORS site (`npm run build` : binaires
// natifs et OTA ; serveur de dev) : il retire les blocs gtm, gtag-aw et
// gtm-noscript de la coquille (sansBalisesGoogle) et REFUSE le build si un
// traceur tiers y reste. Le build Vercel (FILLSELL_SITE=1) ne le charge pas :
// il garde ses balises sous consentement. index.html, la source, ne change pas.
export default function natifSansGoogle() {
  return {
    name: 'fillsell-natif-sans-google',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // (10/10 après-midi) Seule la coquille de l'app porte les blocs
        // marqués : les pages d'aperçu (scripts/apercu/*.html, serveur de
        // dev) n'en ont pas, et le serveur levait sur chacune — tous les
        // aperçus étaient morts. Sans bloc, rien à retirer ; le refus d'un
        // traceur resté vaut toujours, pour toute page.
        const sortie = /<!-- site:balises:/.test(html) ? sansBalisesGoogle(html) : html;
        const restes = traceursHorsConsentement(sortie);
        if (restes.length) {
          throw new Error(`[natif] traceur tiers resté dans la coquille de l'app native (aucun bandeau) : ${restes.join(', ')}`);
        }
        return sortie;
      },
    },
  };
}
