// ═══════════════════════════════════════════════════════════════════════════
// LA CARTE FILLSELL CLOUD EN TÊTE DU STOCK (18/11/2026, lot T1 de Nico — maquette 14 validée)
// ═══════════════════════════════════════════════════════════════════════════
// C'est là que les gens disent oui : les deux derniers essais Cloud (15/11, 17/11) ont été pris depuis le Stock, pas dans
// l'accueil. La carte S'AJOUTE au-dessus du Stock (montée par App.jsx, onglet Stock) : rien du Stock ne bouge.
//   · compte gratuit sans Cloud : la carte EN GRAND — Pro + Cloud, « 7 jours gratuits » seulement si la carte d'offre le
//     porte (cartesFormulesCloud : droit lu + boutique), un gros bouton qui lance l'achat par le chemin existant
//     (lancerAchatFormule d'App : conditions, Stripe ou boutique), « Voir les formules » (la fenêtre d'offres) ;
//   · abonné payant : une carte DISCRÈTE (une ligne), qui ouvre la fenêtre d'offres — jamais un achat en un geste ;
//   · rien pendant 7 jours après un paiement, rien à un client Cloud, rien tant que l'état n'est pas lu
//     (propositionsCloud.js, décisions 3 et 5 de Nico) ; rien là où le Cloud ne se vend pas.
// Journal (usage_logs, feature 'cloud_tunnel' via logTunnel) : stock_carte_cloud_vue { taille, essai_propose } une fois
// par affichage, stock_carte_cloud_clic { action, essai_propose }.
import { useEffect, useRef, useState } from 'react';
import { Cloud, ChevronRight, Mail, X } from 'lucide-react';
import { canalDeVente, cloudOffreVendable, formulesCloudVendables } from '../config/cloudOffer';
import { businessOfferVisible } from '../config/businessOffer';
import { useCloudProfil } from './useCloudProfil';
import { useDisponibiliteCloud, venteFermee } from './useDisponibiliteCloud';
import { cartesFormulesCloud, essaiPermisDuCompte, texteLignePrix } from './formulesCloud';
import { textesFormules, NOMS_FORMULES } from './textesFormules';
import { usePropositionsCloud } from './propositionsCloud';
import { offreAccueil } from '../entree/regles';
import { textesEntree } from '../entree/textes';
import { HeroRelais } from '../entree/EtapesAccueil';
import { CSS_ANIM_ACCUEIL } from '../entree/theme';
import { prixOuChargement, prixPret, zeroAffiche, etatEssaiBoutique } from '../lib/prixBoutique';
import { usePrixBoutique } from '../lib/usePrixBoutique';
import { C, MENTHE, BLANC, DEGRADE_TEAL, POLICE } from './theme';

const FORMULE = 'pro_cloud';
// La croix de la grande carte : elle redevient la ligne discrète pendant 30 jours (sur cet appareil) — jamais disparue.
const REDUITE_MS = 30 * 24 * 3600 * 1000;
const cleReduite = (userId) => `fs_carte_cloud_stock_reduite:${userId}`;
const lireReduite = (userId) => { try { const v = Number(localStorage.getItem(cleReduite(userId))); return Number.isFinite(v) && v > 0 && Date.now() - v < REDUITE_MS; } catch { return false; } };
const CSS = `
.fs-ccs{position:relative;overflow:hidden;box-sizing:border-box;border-radius:26px;padding:16px 16px 10px;margin:0 0 14px;
  background:linear-gradient(160deg,#F4FBF9 0%,#E2F2EE 100%);border:1px solid #CBE7E2;box-shadow:0 24px 40px -30px rgba(27,110,98,.7);
  font-family:${POLICE};color:${C.ink};animation:fsCcsEntree .5s cubic-bezier(.2,.8,.2,1) both}
.fs-ccs *{box-sizing:border-box}
.fs-ccs-grille{display:flex;flex-direction:column}
.fs-ccs-illus{width:74%;margin:-6px auto 2px}
@media (min-width:760px){.fs-ccs-grille{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:24px;align-items:center}.fs-ccs-illus{width:100%;margin:0;order:2}.fs-ccs{padding:22px 24px 14px}}
@keyframes fsCcsEntree{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
.fs-ccs-cta{position:relative;overflow:hidden;width:100%;min-height:54px;border-radius:999px;border:0;background:${DEGRADE_TEAL};color:${BLANC};font:inherit;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 12px 26px -12px rgba(47,158,144,.75)}
.fs-ccs-cta:disabled{opacity:.55;cursor:default}
.fs-ccs-lien{display:inline-flex;align-items:center;gap:4px;border:0;background:none;color:${C.tealDeep};font:inherit;font-size:13.5px;font-weight:700;min-height:44px;padding:0 4px;cursor:pointer}
.fs-ccs-x{position:absolute;top:8px;right:8px;z-index:1;width:44px;height:44px;border-radius:22px;border:0;background:transparent;display:grid;place-items:center;color:${C.ink};cursor:pointer}
.fs-ccs-x:focus-visible{outline:2px solid ${C.tealDeep};outline-offset:2px}
.fs-ccs-discrete{display:flex;align-items:center;gap:12px;width:100%;text-align:left;margin:0 0 14px;padding:12px 14px;border-radius:18px;border:1px solid #D6E2DE;background:${MENTHE};font-family:${POLICE};color:${C.ink};cursor:pointer;min-height:56px}
.fs-ccs-cta:focus-visible,.fs-ccs-lien:focus-visible,.fs-ccs-discrete:focus-visible{outline:2px solid ${C.tealDeep};outline-offset:2px}
@media (prefers-reduced-motion:reduce){.fs-ccs{animation:none}}
${CSS_ANIM_ACCUEIL}`;

/**
 * Props : userId, lang, palier ('gratuit'|'premium'|'pro'|'business'), plateforme (Capacitor), clientCloud, compteLu,
 *   onEssai(formule, opts) → lancerAchatFormule d'App ; onVoirOffres() → la fenêtre d'offres sur « Avec Cloud » ;
 *   journal(evenement, metadata) → logTunnel ; lienOrdinateur : null, ou { envoi, envoyer } (téléphone, extension jamais vue).
 */
export default function CarteCloudStock({ userId, lang = 'fr', palier = 'gratuit', plateforme = 'web', clientCloud = false, compteLu = false, onEssai, onVoirOffres, journal, lienOrdinateur = null }) {
  usePrixBoutique();
  const prop = usePropositionsCloud();
  const formules = Boolean(userId) && formulesCloudVendables(userId, { plateforme });
  const cloudSeul = !formules && Boolean(userId) && cloudOffreVendable(userId);
  const actif = Boolean(userId) && compteLu && !clientCloud && prop.lu && prop.carteStock != null && (formules || cloudSeul);
  const lecture = useCloudProfil(userId, { actif });
  const vente = useDisponibiliteCloud({ actif: actif && formules });
  const essaiPermis = essaiPermisDuCompte(lecture);
  const palierIci = palier === 'free' ? 'gratuit' : (palier ?? 'gratuit');
  const modele = actif && formules ? cartesFormulesCloud({
    palier: palierIci, canalApp: canalDeVente(plateforme), canalAbonnement: null, essaiPermis,
    essaiBoutique: (f) => etatEssaiBoutique(f), businessVisible: businessOfferVisible(userId),
  }) : { cartes: [] };
  const o = offreAccueil(modele, essaiPermis);
  const deja = lecture.etat === 'ok' && lecture.cloud?.actif === true;
  const [reduite, setReduite] = useState(() => (userId ? lireReduite(userId) : false));
  const taille = prop.carteStock === 'grande' && reduite ? 'discrete' : prop.carteStock;
  const visible = actif && !deja && lecture.etat === 'ok' && (cloudSeul || taille === 'discrete' || (o.carte && !o.enLecture));

  const vuRef = useRef(null);
  useEffect(() => {
    if (!visible) return;
    const cle = `${taille}|${o.essaiPropose}`;
    if (vuRef.current === cle) return;
    vuRef.current = cle;
    journal?.('stock_carte_cloud_vue', { taille, essai_propose: o.essaiPropose, raison_sans_essai: o.raison, formules });
  }, [visible, taille, o.essaiPropose, o.raison, formules, journal]);

  if (!visible) return null;
  const T = textesEntree(lang);
  const TF = textesFormules(lang);
  const fr = lang !== 'en';

  if (taille === 'discrete') {
    return (
      <>
        <style>{CSS}</style>
        <button type="button" className="fs-ccs-discrete" data-carte-cloud-stock="discrete" onClick={() => { journal?.('stock_carte_cloud_clic', { action: 'offres', taille }); onVoirOffres?.(); }}>
          <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 12, background: BLANC, display: 'grid', placeItems: 'center', color: C.tealDeep, flexShrink: 0 }}><Cloud size={20} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{fr ? 'FillSell Cloud' : 'FillSell Cloud'}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: '#3E4D48', marginTop: 1 }}>{fr ? 'Publie sans ordinateur : ajoute-le à ta formule quand tu veux.' : 'Post without a computer: add it to your plan whenever you want.'}</span>
          </span>
          <ChevronRight size={18} color={C.tealDeep} aria-hidden="true" />
        </button>
      </>
    );
  }

  const nom = NOMS_FORMULES[FORMULE];
  const prix = prixOuChargement(FORMULE, lang);
  const zero = zeroAffiche(FORMULE, lang);
  const essai = o.essaiPropose;
  const ventesFermees = formules && venteFermee(vente.dispo);
  const pret = formules && o.carte?.achetable === true && !ventesFermees && prixPret(FORMULE);
  const ligne = !formules ? '' : essai ? T.acCloudPrixEssai(zero, prix)
    : o.carte?.lignePrix === 'aujourdhui' ? T.acCloudPrixAujourdhui(prix)
      : texteLignePrix(o.carte, { T: TF, nom, prix, zero });
  const cta = () => {
    journal?.('stock_carte_cloud_clic', { action: formules ? 'achat' : 'offres', essai_propose: essai, taille });
    if (formules && pret) onEssai?.(FORMULE, { essaiAffiche: essai });
    else onVoirOffres?.();
  };
  return (
    <section className="fs-ccs" data-carte-cloud-stock="grande" aria-label="FillSell Cloud">
      <style>{CSS}</style>
      <button type="button" className="fs-ccs-x" aria-label={fr ? 'Réduire' : 'Collapse'} onClick={() => {
        journal?.('stock_carte_cloud_reduite', { essai_propose: essai });
        try { localStorage.setItem(cleReduite(userId), String(Date.now())); } catch { /* affichage seul */ }
        setReduite(true);
      }}><X size={18} /></button>
      <div className="fs-ccs-grille">
        <div className="fs-ccs-illus"><HeroRelais /></div>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px 5px 9px', borderRadius: 999, background: BLANC, border: '1px solid #D6E2DE', fontSize: 12, fontWeight: 700, color: C.tealDeep, marginBottom: 10 }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: C.teal }} />FillSell Cloud
          </span>
          <h2 style={{ margin: '0 0 2px', fontSize: 24, lineHeight: 1.1, letterSpacing: '-0.035em' }}>{T.acCloudTitre}</h2>
          {essai && (
            <p style={{ margin: '0 0 8px', fontSize: 34, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.045em', background: `linear-gradient(110deg,${C.teal} 0%,${C.tealDeep} 55%,${C.teal} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              {T.acCloudTitreEssai.join(' ')}
            </p>
          )}
          <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.5, color: '#3E4D48' }}>
            {fr ? 'Tes annonces partent de nos serveurs, 24 h/24, vers Vinted, Leboncoin, Beebs et Depop. Tu pilotes tout depuis ton téléphone.'
              : 'Your listings go out from our servers, 24/7, to Vinted, Leboncoin, Beebs and Depop. You drive everything from your phone.'}
          </p>
          {!ventesFermees && (
            <button type="button" className="fs-ccs-cta" onClick={cta} disabled={formules && !pret}>
              <span className={pret ? 'ac-brille' : undefined} style={{ position: 'absolute', inset: 0 }} aria-hidden="true" />
              <span style={{ position: 'relative' }}>{formules ? (essai ? T.acCloudCtaEssai : T.acCloudCtaPasser(nom)) : (fr ? 'Découvrir FillSell Cloud' : 'Discover FillSell Cloud')}</span>
            </button>
          )}
          {ligne && <p data-ligne-prix="" style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.45, textAlign: 'center' }}>{nom} : {ligne.charAt(0).toLowerCase() + ligne.slice(1)}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4, marginTop: 4 }}>
            <button type="button" className="fs-ccs-lien" onClick={() => { journal?.('stock_carte_cloud_clic', { action: 'offres', essai_propose: essai, taille }); onVoirOffres?.(); }}>
              {fr ? 'Voir les formules' : 'See the plans'}<ChevronRight size={16} aria-hidden="true" />
            </button>
            {lienOrdinateur && (
              <button type="button" className="fs-ccs-lien" disabled={lienOrdinateur.envoi?.etat === 'en_cours' || lienOrdinateur.envoi?.etat === 'envoye'} onClick={() => { journal?.('stock_carte_cloud_clic', { action: 'lien_ordinateur', taille }); lienOrdinateur.envoyer?.(); }} style={{ color: '#3E4D48' }}>
                <Mail size={15} aria-hidden="true" />
                {lienOrdinateur.envoi?.etat === 'envoye' ? (fr ? 'Lien envoyé sur ta boîte mail' : 'Link sent to your inbox') : (fr ? "J'ai un ordinateur : m'envoyer le lien" : 'I have a computer: email me the link')}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
