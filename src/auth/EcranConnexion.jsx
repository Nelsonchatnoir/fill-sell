// ═══════════════════════════════════════════════════════════════════════════
// L'ÉCRAN D'INSCRIPTION / CONNEXION — maquette 01 validée par Nico (18/11/2026, lot T1 ; ordre du 19/11)
// ═══════════════════════════════════════════════════════════════════════════
// Maquette : C:\Users\nicol\fill-and-sell-design\accueil-1811\maquettes-accueil-1811.html, écran 01 (iPhone, Android, web).
//   · l'illustration : l'icône FillSell au centre, les cinq plateformes en orbite (anneaux, halos qui dérivent) ;
//   · « Publie une fois. Vends partout. », les logos dans la phrase ;
//   · « Continuer avec Apple » (iPhone et web — jamais sur Android : pas de connexion Apple native), « Continuer avec
//     Google », « Continuer avec mon e-mail » ; « Déjà un compte ? Se connecter » ; les mentions (Conditions,
//     Politique de confidentialité).
//   · web large : deux colonnes (le texte à gauche, l'illustration à droite) ; téléphone et web étroit : une colonne.
// ⛔ CE FICHIER NE FAIT QUE L'AFFICHAGE. Chaque bouton appelle le geste d'App.jsx d'aujourd'hui, inchangé
//    (handleAppleSignIn natif, handleOAuthSignIn('apple'|'google'), le formulaire e-mail avec son code à 6 chiffres) :
//    zéro changement de connexion. Animations : transform / opacity seulement, coupées si le téléphone le demande.
import { LOGOS_PLATEFORMES } from '../utils/logosPlateformes';

const PLATEFORMES = ['Vinted', 'Leboncoin', 'Beebs', 'Depop', 'eBay'];
const C = { canvas: '#EDEAE0', ink: '#10201B', t2: '#5C6560', teal: '#2F9E90', deep: '#1B6E62', border: '#CFC9BB' };

const CSS = `
.cnx{position:fixed;inset:0;display:flex;background:${C.canvas};color:${C.ink};font-family:'Space Grotesk',-apple-system,BlinkMacSystemFont,sans-serif;overflow:hidden;box-sizing:border-box;text-align:left}
.cnx *{box-sizing:border-box}
.cnx-blob{position:absolute;border-radius:50%;pointer-events:none}
.cnx-b1{width:420px;height:420px;left:-120px;top:-80px;background:radial-gradient(closest-side,rgba(47,158,144,.30),transparent);animation:fscDerive 12s ease-in-out infinite}
.cnx-b2{width:380px;height:380px;right:-140px;top:140px;background:radial-gradient(closest-side,rgba(232,149,109,.26),transparent);animation:fscDerive 14s ease-in-out infinite reverse}
@keyframes fscDerive{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,24px)}}
.cnx-col{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:calc(env(safe-area-inset-top,0px) + 16px) 24px calc(env(safe-area-inset-bottom,0px) + 22px)}
.cnx-haut{flex:1 0 auto;display:grid;place-items:center;padding:22px 0 34px}
.cnx-bas{position:relative;width:100%;max-width:470px;margin:0 auto}
.cnx-d{display:none}
.cnx-marque{display:none}
@media (min-width:900px){
  .cnx-col{flex:0 0 600px;padding:26px 48px 26px 56px;justify-content:flex-start}
  .cnx-haut{display:none}
  .cnx-marque{display:flex;align-items:center;gap:10px;font-weight:700;font-size:17px;letter-spacing:-.02em;color:${C.ink};background:none;border:0;padding:0;font-family:inherit;cursor:pointer;align-self:flex-start}
  .cnx-marque img{width:32px;height:32px;border-radius:9px}
  .cnx-centre{flex:1;display:flex;align-items:center}
  .cnx-bas{margin:0}
  .cnx-titre{font-size:48px!important}
  .cnx-d{position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;background:linear-gradient(160deg,#F4FBF9,#DDEFEA);overflow:hidden}
  .cnx-blob{display:none}
}
.cnx-orbite{position:relative;aspect-ratio:1;width:min(78vw,clamp(140px,calc(100vh - 500px),300px));width:min(78vw,clamp(140px,calc(100dvh - 500px),300px))}
.cnx-d .cnx-orbite{width:420px}
.cnx-anneau{position:absolute;inset:0;border-radius:50%;border:1.5px dashed rgba(27,110,98,.28)}
.cnx-anneau.a2{inset:18%;border-style:solid;border-color:rgba(27,110,98,.12)}
.cnx-icone{position:absolute;left:50%;top:50%;width:30%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:24%;box-shadow:0 20px 40px -14px rgba(16,32,27,.55);animation:fscRespire 4s ease-in-out infinite}
@keyframes fscRespire{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.04)}}
.cnx-tourne{position:absolute;inset:0;animation:fscTourne 40s linear infinite}
.cnx-sat{position:absolute;width:15%;aspect-ratio:1;margin:-7.5%;animation:fscTourne 40s linear infinite reverse}
.cnx-sat img{width:100%;height:100%;border-radius:26%;background:#fff;display:block;box-shadow:0 10px 20px -10px rgba(16,32,27,.5),0 0 0 1px rgba(16,32,27,.08)}
@keyframes fscTourne{to{transform:rotate(360deg)}}
.cnx-pop{animation:fscPop .56s cubic-bezier(.34,1.56,.64,1) backwards}
@keyframes fscPop{0%{opacity:0;transform:translateY(12px) scale(.96)}60%{opacity:1;transform:translateY(0) scale(1.012)}100%{opacity:1;transform:none}}
.cnx-titre{margin:0 0 10px;font-size:40px;line-height:1;font-weight:700;letter-spacing:-.05em;color:${C.ink}}
.cnx-grad{background:linear-gradient(110deg,#2F9E90 0%,#1B6E62 55%,#2F9E90 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.cnx-txt{margin:0 0 12px;font-size:14.5px;line-height:1.55;color:${C.t2}}
.cnx-nl{display:inline-flex;align-items:center;gap:4px;font-weight:600;color:${C.ink};white-space:nowrap;vertical-align:-3px}
.cnx-nl img{width:16px;height:16px;border-radius:4px;background:#fff;box-shadow:0 0 0 1px rgba(16,32,27,.10)}
.cnx-btns{display:flex;flex-direction:column;gap:10px;margin-top:6px;max-width:400px}
.cnx-btn{min-height:52px;border-radius:16px;font:inherit;font-size:15.5px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;width:100%;transition:transform .12s ease}
.cnx-btn:active{transform:scale(.98)}
.cnx-btn:focus-visible,.cnx-lien:focus-visible{outline:2px solid ${C.deep};outline-offset:2px}
.cnx-apple{background:#000;color:#fff;border:0}
.cnx-google{background:#fff;color:#1f1f1f;border:1px solid #D9D4C8}
.cnx-mail{background:transparent;color:${C.ink};border:1.5px solid ${C.border}}
.cnx-mention{margin:12px 0 0;font-size:11.5px;line-height:1.5;color:${C.t2};text-align:center}
@media (min-width:900px){.cnx-mention{text-align:left}}
.cnx-mention a{color:${C.t2}}
.cnx-lien{border:0;background:none;padding:6px 2px;font:inherit;font-size:inherit;font-weight:700;color:${C.deep};cursor:pointer;min-height:32px}
.cnx-erreur{margin:10px 0 0;font-size:13px;font-weight:600;color:#9B5148;text-align:center}
.cnx-legende{position:relative;margin:26px 0 0;font-size:14px;color:#3E4D48;text-align:center;max-width:380px;line-height:1.5}
@media (prefers-reduced-motion:reduce){.cnx *{animation:none!important;transition:none!important}}
`;

const TEXTES = {
  fr: {
    titre1: 'Publie une fois.', titre2: 'Vends partout.', depuis: ', depuis une seule app.', et: ' et ',
    apple: 'Continuer avec Apple', google: 'Continuer avec Google', mail: 'Continuer avec mon e-mail',
    deja: 'Déjà un compte ?', seConnecter: 'Se connecter',
    mention1: 'En continuant, tu acceptes les ', conditions: 'Conditions', mention2: ' et la ', confidentialite: 'Politique de confidentialité',
    legende: 'Tes annonces sur cinq plateformes, ton stock et tes ventes au même endroit.', accueil: 'Retour au site FillSell',
  },
  en: {
    titre1: 'Post once.', titre2: 'Sell everywhere.', depuis: ', from one app.', et: ' and ',
    apple: 'Continue with Apple', google: 'Continue with Google', mail: 'Continue with my email',
    deja: 'Already have an account?', seConnecter: 'Sign in',
    mention1: 'By continuing, you accept the ', conditions: 'Terms', mention2: ' and the ', confidentialite: 'Privacy Policy',
    legende: 'Your listings on five platforms, your stock and your sales in one place.', accueil: 'Back to the FillSell website',
  },
};
const textesConnexion = (lang) => (lang === 'en' ? TEXTES.en : TEXTES.fr);

const ICONE_FILLSELL = '/icon_180x180.png';
const APPLE = (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.37 12.75c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.75.73 1.05 1.6 2.24 2.73 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.83-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.32-3.5zM14.2 6.29c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.68-.92 2.68.97.07 1.96-.49 2.56-1.23z" /></svg>
);
const GOOGLE = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);
const MAIL = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
);

/** L'illustration : l'icône FillSell et les cinq plateformes en orbite (décorative). */
export function OrbiteFillSell() {
  return (
    <div className="cnx-orbite" aria-hidden="true">
      <span className="cnx-anneau" /><span className="cnx-anneau a2" />
      <div className="cnx-tourne">
        {PLATEFORMES.map((nom, i) => {
          const a = (i / PLATEFORMES.length) * 2 * Math.PI - Math.PI / 2;
          return (
            <span key={nom} className="cnx-sat" style={{ left: `${50 + 46 * Math.cos(a)}%`, top: `${50 + 46 * Math.sin(a)}%` }}>
              <img src={LOGOS_PLATEFORMES[nom]} alt="" data-logo-plateforme={nom} />
            </span>
          );
        })}
      </div>
      <img className="cnx-icone" src={ICONE_FILLSELL} alt="" />
    </div>
  );
}

/**
 * La coque des écrans de connexion : une colonne (téléphone, web étroit), deux colonnes sur le web large (l'orbite à
 * droite). `onAccueil` (web seulement) : la marque FillSell ramène au site.
 */
export function CoqueConnexion({ lang = 'fr', onAccueil = null, children }) {
  const T = textesConnexion(lang);
  return (
    <div className="cnx" data-ecran-connexion="">
      <style>{CSS}</style>
      <span className="cnx-blob cnx-b1" aria-hidden="true" /><span className="cnx-blob cnx-b2" aria-hidden="true" />
      <div className="cnx-col">
        {onAccueil && (
          <button type="button" className="cnx-marque" onClick={onAccueil} aria-label={T.accueil}>
            <img src={ICONE_FILLSELL} alt="" />FillSell
          </button>
        )}
        {children}
      </div>
      <div className="cnx-d" aria-hidden="true">
        <OrbiteFillSell />
        <p className="cnx-legende">{T.legende}</p>
      </div>
    </div>
  );
}

/**
 * L'écran 01 de la maquette. `apple` : 'natif' (iPhone : la feuille d'Apple), 'web' (OAuth), null (Android : rien).
 * Les gestes : ceux d'App.jsx (onApple, onGoogle) ; onEmail → le formulaire e-mail (inscription) ; onSeConnecter → le
 * formulaire e-mail (connexion). `erreur` : le refus d'une connexion Apple / Google, dit ici.
 */
export function ChoixConnexion({ lang = 'fr', apple = null, onApple, onGoogle, onEmail, onSeConnecter, erreur = null }) {
  const T = textesConnexion(lang);
  const logos = PLATEFORMES.map((nom, i) => (
    <span key={nom}>
      {i === 0 ? '' : i === PLATEFORMES.length - 1 ? T.et : ', '}
      <span className="cnx-nl"><img src={LOGOS_PLATEFORMES[nom]} alt="" />{nom}</span>
    </span>
  ));
  return (
    <>
      <div className="cnx-haut cnx-pop"><OrbiteFillSell /></div>
      <div className="cnx-centre">
        <div className="cnx-bas">
          <h1 className="cnx-titre cnx-pop" style={{ animationDelay: '.07s' }}>{T.titre1}<br /><span className="cnx-grad">{T.titre2}</span></h1>
          <p className="cnx-txt cnx-pop" style={{ animationDelay: '.14s' }}>{logos}{T.depuis}</p>
          <div className="cnx-btns cnx-pop" style={{ animationDelay: '.21s' }}>
            {apple && (
              <button type="button" className="cnx-btn cnx-apple" data-connexion="apple" onClick={onApple}>{APPLE}{T.apple}</button>
            )}
            <button type="button" className="cnx-btn cnx-google" data-connexion="google" onClick={onGoogle}>{GOOGLE}{T.google}</button>
            <button type="button" className="cnx-btn cnx-mail" data-connexion="email" onClick={onEmail}>{MAIL}{T.mail}</button>
          </div>
          {erreur && <p className="cnx-erreur" role="alert">{erreur}</p>}
          <p className="cnx-mention cnx-pop" style={{ animationDelay: '.28s', fontSize: 13 }}>
            {T.deja}{' '}<button type="button" className="cnx-lien" data-connexion="se-connecter" onClick={onSeConnecter}>{T.seConnecter}</button>
          </p>
          <p className="cnx-mention cnx-pop" style={{ animationDelay: '.28s', marginTop: 6 }}>
            {T.mention1}<a href="/legal#cgu">{T.conditions}</a>{T.mention2}<a href="/legal#confidentialite">{T.confidentialite}</a>.
          </p>
        </div>
      </div>
    </>
  );
}
