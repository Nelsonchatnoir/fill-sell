import { useEffect, useState } from 'react';
import { useCloudProfil } from './useCloudProfil';
import { C, BLANC, MENTHE, DEGRADE_TEAL, POLICE } from './theme';
import {
  bandeauCloudVisible, lireFermetureBandeauCloud, noterFermetureBandeauCloud, textesBandeauCloud, ORIGINE_BANDEAU_CLOUD,
} from './bandeauCloud';

// « NOUVEAU · FillSell Cloud — Plus besoin d'ordinateur » en haut du Tableau (08/11/2026 soir, point 4 de Nico) :
// la maquette B « Le relais » (https://claude.ai/artifact/KeD76ohqxxTNmmFEVsjVQh), CLAIRE seulement (l'app n'a pas de
// mode sombre). Le PC se ferme, le nuage prend le relais, trois annonces en partent. Règles d'affichage :
// cloud/bandeauCloud.js (pures, selftest:cloud-bandeau). Aucun prix. Animations coupées si le téléphone demande moins
// d'animations. « Essayer 7 jours » = le parcours d'achat du Cloud de l'hôte (Stripe sur le web, Apple sur iPhone).
const BORD = '#CBE7E2';
const vusCetteSession = new Set();

const CSS = `
.fsbc{position:relative;box-sizing:border-box;border-radius:22px;background:${MENTHE};border:1px solid ${BORD};display:flex;align-items:center;gap:22px;padding:14px 10px 14px 18px;margin:0 0 14px;color:${C.ink};font-family:${POLICE};animation:fsbc-entree .5s cubic-bezier(.2,.8,.2,1) both}
.fsbc *{box-sizing:border-box}
.fsbc-scene{position:relative;width:132px;height:88px;flex:none}
.fsbc-pc{position:absolute;left:0;bottom:2px;width:66px;height:46px;color:${C.ink};overflow:visible}
.fsbc-coque{fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round}
.fsbc-socle{fill:currentColor}
.fsbc-ecran{transform-box:fill-box;transform-origin:50% 100%;animation:fsbc-ecran 8s ease-in-out infinite}
.fsbc-lumiere{fill:${C.teal};animation:fsbc-lumiere 8s ease-in-out infinite}
.fsbc-nuage{position:absolute;left:56px;top:4px;width:56px;height:40px;fill:${C.teal};animation:fsbc-nuage 8s ease-in-out infinite}
.fsbc-annonce{position:absolute;left:96px;top:34px;width:20px;height:15px;border-radius:4px;background:${BLANC};border:1.5px solid ${C.teal};opacity:0;animation:fsbc-annonce 8s ease-out infinite}
.fsbc-annonce.n2{animation-delay:.45s}
.fsbc-annonce.n3{animation-delay:.9s}
.fsbc-textes{flex:1;min-width:0}
.fsbc-ligne1{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.fsbc-pastille{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;padding:3px 8px;border-radius:999px;background:${C.tealDeep};color:${BLANC};line-height:1.3}
.fsbc-titre{font-size:15px;font-weight:700;color:${C.ink}}
.fsbc-accroche{margin:6px 0 0;font-size:22px;line-height:1.15;font-weight:700;color:${C.ink}}
.fsbc-sous{margin:4px 0 0;font-size:14px;line-height:1.4;color:#3E4D48}
.fsbc-btn{font:inherit;font-size:14px;font-weight:700;min-height:44px;padding:0 20px;border-radius:999px;border:0;background:${DEGRADE_TEAL};color:${BLANC};cursor:pointer;flex:none;white-space:nowrap}
.fsbc-btn:focus-visible,.fsbc-fermer:focus-visible{outline:2px solid ${C.tealDeep};outline-offset:2px}
.fsbc-fermer{width:44px;height:44px;border-radius:50%;border:0;background:transparent;display:grid;place-items:center;cursor:pointer;flex:none;color:${C.ink};padding:0;align-self:flex-start}
.fsbc-fermer svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
@media (max-width:640px){
.fsbc{flex-direction:column;align-items:stretch;gap:12px;padding:14px}
.fsbc-scene{align-self:center;margin:-2px 0 -6px}
.fsbc-textes{padding-right:0}
.fsbc-accroche{font-size:20px}
.fsbc-sous{font-size:13px}
.fsbc-btn{width:100%}
.fsbc-fermer{position:absolute;top:4px;right:4px}
}
@keyframes fsbc-entree{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
@keyframes fsbc-ecran{0%,14%{transform:scaleY(1)}28%,86%{transform:scaleY(.14)}100%{transform:scaleY(1)}}
@keyframes fsbc-lumiere{0%,12%{opacity:.9}24%,88%{opacity:0}100%{opacity:.9}}
@keyframes fsbc-nuage{0%,24%{opacity:.3;transform:translateY(2px) scale(.94)}38%,86%{opacity:1;transform:translateY(-2px) scale(1)}100%{opacity:.3;transform:translateY(2px) scale(.94)}}
@keyframes fsbc-annonce{0%,40%{opacity:0;transform:translate(0,0) scale(.6)}47%{opacity:1;transform:translate(6px,4px) scale(1)}68%{opacity:1;transform:translate(18px,30px) scale(1)}78%,100%{opacity:0;transform:translate(22px,38px) scale(.9)}}
@media (prefers-reduced-motion: reduce){
.fsbc,.fsbc-ecran,.fsbc-lumiere,.fsbc-nuage,.fsbc-annonce{animation:none!important}
.fsbc-ecran{transform:scaleY(.14)}
.fsbc-lumiere{opacity:0}
.fsbc-nuage{opacity:1}
.fsbc-annonce{display:none}
}
`;

/**
 * @param {{ userId: string, lang?: string, vendable: boolean, compteLu: boolean, clientCloud: boolean,
 *           ecranLibre: boolean, plateforme?: string, onEssayer: () => void, journal?: (evenement: string, m?: object) => void }} p
 */
export default function BandeauCloudTableau({ userId, lang = 'fr', vendable, compteLu, clientCloud, ecranLibre, plateforme = 'web', onEssayer, journal }) {
  const [fermeLe, setFermeLe] = useState(() => lireFermetureBandeauCloud(userId));
  useEffect(() => { setFermeLe(lireFermetureBandeauCloud(userId)); }, [userId]);
  // Le profil Cloud (essai déjà pris ?) n'est lu QUE si tout le reste permet déjà le bandeau : aucune requête sinon.
  const pretALire = Boolean(userId && vendable && compteLu && !clientCloud && ecranLibre
    && bandeauCloudVisible({ vendable, compteLu, clientCloud, profilLu: true, profil: null, fermeLe, ecranLibre }));
  const lecture = useCloudProfil(userId, { actif: pretALire });
  const visible = bandeauCloudVisible({
    vendable, compteLu, clientCloud, ecranLibre, fermeLe,
    profilLu: lecture.etat === 'ok', profil: lecture.profil,
  });
  useEffect(() => {
    if (!visible || vusCetteSession.has(userId)) return;
    vusCetteSession.add(userId);
    try { journal?.('cloud_bandeau_vu', { plateforme, origine: ORIGINE_BANDEAU_CLOUD }); } catch { /* trace seule */ }
  }, [visible, userId, plateforme, journal]);
  if (!visible) return null;
  const T = textesBandeauCloud(lang);
  const essayer = () => {
    try { journal?.('cloud_bandeau_clic', { plateforme, origine: ORIGINE_BANDEAU_CLOUD }); } catch { /* trace seule */ }
    onEssayer?.();
  };
  const fermer = () => {
    try { journal?.('cloud_bandeau_ferme', { plateforme, origine: ORIGINE_BANDEAU_CLOUD }); } catch { /* trace seule */ }
    setFermeLe(noterFermetureBandeauCloud(userId));
  };
  return (
    <section className="fsbc" data-cloud-bandeau="tableau" aria-label={T.aria}>
      <style>{CSS}</style>
      <div className="fsbc-scene" aria-hidden="true">
        <svg className="fsbc-pc" viewBox="0 0 66 46">
          <g className="fsbc-ecran">
            <rect className="fsbc-coque" x="9" y="2" width="48" height="33" rx="3" />
            <rect className="fsbc-lumiere" x="13" y="6" width="40" height="25" rx="1.5" />
          </g>
          <path className="fsbc-socle" d="M2 38h62l-4 6H6z" />
        </svg>
        <svg className="fsbc-nuage" viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></svg>
        <span className="fsbc-annonce" /><span className="fsbc-annonce n2" /><span className="fsbc-annonce n3" />
      </div>
      <div className="fsbc-textes">
        <div className="fsbc-ligne1"><span className="fsbc-pastille">{T.pastille}</span><span className="fsbc-titre">{T.titre}</span></div>
        <p className="fsbc-accroche">{T.accroche}</p>
        <p className="fsbc-sous">{T.sous}</p>
      </div>
      <button type="button" className="fsbc-btn" onClick={essayer}>{T.cta}</button>
      <button type="button" className="fsbc-fermer" aria-label={T.fermer} onClick={fermer}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
      </button>
    </section>
  );
}
