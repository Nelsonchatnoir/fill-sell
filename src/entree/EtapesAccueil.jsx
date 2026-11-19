// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS D'ENTRÉE — LES ÉCRANS DE LA REFONTE (18/11/2026, lot T1 de Nico — maquettes validées le 18/11)
// ═══════════════════════════════════════════════════════════════════════════
// Maquettes : C:\Users\nicol\fill-and-sell-design\accueil-1811\ (écrans 03, 04, 05 et 09).
//   · « As-tu un ordinateur ? » (ordinateur) — la 2e étape de tout téléphone ;
//   · l'écran Cloud UNIQUE (cloud_offre) — Pro + Cloud, « 7 jours gratuits » seulement si la carte le porte
//     (cartesFormulesCloud : droit lu + boutique), un gros bouton, « Voir les autres formules » (feuille : la MÊME fenêtre
//     d'offres, OffresAvecCloud), « Plus tard » discret en bas ;
//   · « Pour publier, il te faut un ordinateur » (sans_cloud) — le lien par mail, jamais « Installer l'extension ».
// ⛔ Aucun paiement ici : c.formules.lancer → essaiFormule d'App.jsx (lancerAchatFormule : conditions, Stripe ou boutique),
//    les mêmes appels qu'avant la refonte. ⛔ Aucun prix écrit : prix de la boutique ou de Stripe (lib/prixBoutique.js).
// ⛔ Journal (onboarding_choice) : cloud_offre_vue { essai_propose, formule_proposee, raison_sans_essai } UNE fois par
//    décision affichée (jamais pendant la lecture), puis chaque choix.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Laptop, Cloud, ChevronRight, Info, Mail, Check, X } from 'lucide-react';
import { canalDeVente } from '../config/cloudOffer';
import { LOGOS_PLATEFORMES } from '../utils/logosPlateformes';
import { grilleDuPalier } from '../utils/jauges';
import { E, DEGRADE, OMBRE_CTA, TACTILE } from './theme';
import { Scene, Kicker, Titre, Texte, Carte, BoutonPrimaire, LienDiscret, Bande } from './EntreeUI';
import { compteJauge } from './regles';
import { useOffreAccueil } from './useOffreAccueil';
import { FenetreInfo } from './EtapeVoie';
import OffresAvecCloud from '../cloud/OffresAvecCloud';
import { texteLignePrix } from '../cloud/formulesCloud';
import { textesFormules, NOMS_FORMULES } from '../cloud/textesFormules';
import { CorpsCarteGrille } from '../components/ConversionModal';
import MentionsAbonnement from '../components/MentionsAbonnement';
import { prixOuChargement, prixPret, zeroAffiche } from '../lib/prixBoutique';
import { logInstallExtension } from '../utils/installExtensionLog';
import { messageEchecLien } from '../hooks/useEnvoiLienExtension';

const PF_CLOUD = ['Vinted', 'Leboncoin', 'Beebs', 'Depop'];
const FORMULE = 'pro_cloud';

const moinsDAnimations = () => {
  try { return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
};
const idPropre = (id) => String(id).replace(/[^a-zA-Z0-9]/g, '');

// ── Les illustrations (décoratives : aria-hidden, rien d'écrit dedans) ──────────────────────────────────────────────
function Logos({ points, hauteur }) {
  return points.map(([x, y], k) => (
    <img key={PF_CLOUD[k]} src={LOGOS_PLATEFORMES[PF_CLOUD[k]]} alt="" aria-hidden="true" data-logo-plateforme={PF_CLOUD[k]} style={{
      position: 'absolute', left: `${((x - 13) / 340) * 100}%`, top: `${((y - 13) / hauteur) * 100}%`, width: `${(26 / 340) * 100}%`,
      borderRadius: '24%', background: '#FFFFFF', boxShadow: '0 0 0 1px rgba(16,32,27,.10), 0 6px 14px -8px rgba(16,32,27,.4)',
    }} />
  ));
}
const paquet = (w = 12, h = 9) => <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2.5} fill="#FFFFFF" stroke={E.teal} strokeWidth={1.6} />;
const TRACE = { fill: 'none', stroke: '#9CCFC6', strokeWidth: 1.6, strokeDasharray: '3 4' };
const BRANCHES = [[289, 27], [313, 61], [313, 97], [289, 131]];

/** Le téléphone → FillSell Cloud → Vinted, Leboncoin, Beebs, Depop. Les annonces voyagent (SMIL), le nuage flotte. */
export function HeroRelais({ largeur = '100%' }) {
  const n = idPropre(useId()); const anime = !moinsDAnimations(); const D = '3.4s';
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: largeur, aspectRatio: '340 / 150', margin: '0 auto' }}>
      <svg viewBox="0 0 340 150" style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}>
        <defs><linearGradient id={`gN${n}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#46BBAA" /><stop offset="1" stopColor={E.tealDeep} /></linearGradient></defs>
        <path id={`pa${n}`} d="M84 78 C 104 78 112 70 130 70" style={TRACE} />
        {BRANCHES.map(([x, y], k) => <path key={k} id={`pb${n}_${k}`} d={`M226 ${58 + k * 5} C ${250 + k * 4} ${58 + k * 5}, 262 ${y}, ${x - 14} ${y}`} style={TRACE} />)}
        <g className="ac-flotte-l">
          <rect x="22" y="26" width="60" height="104" rx="13" fill="#FFFFFF" stroke={E.ink} strokeWidth="2" />
          <rect x="42" y="32" width="20" height="4" rx="2" fill={E.ink} />
          <rect x="31" y="44" width="42" height="30" rx="6" fill="#DDEFEB" />
          <path d="M40 66 l7-9 6 7 4-4 7 6" fill="none" stroke={E.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="31" y="80" width="34" height="5" rx="2.5" fill="#D9D4C8" /><rect x="31" y="90" width="24" height="5" rx="2.5" fill="#E4E0D6" />
          <rect x="31" y="106" width="42" height="13" rx="6.5" fill={E.teal} />
        </g>
        <g className="ac-flotte">
          <path transform="translate(118 18) scale(1.15)" d="M30 62 h46 a18 18 0 0 0 2-35.9 a26 26 0 0 0-49.6-4.6 A17 17 0 0 0 30 62 z" fill={`url(#gN${n})`} />
          <path d="M174 62 l9 8 16-17" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        {anime && (
          <>
            <g>{paquet(14, 11)}
              <animateMotion dur={D} repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.42;1" calcMode="linear"><mpath href={`#pa${n}`} /></animateMotion>
              <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.05;.38;.44;1" dur={D} repeatCount="indefinite" />
            </g>
            {BRANCHES.map(([x, y], k) => {
              const a = (v) => (v + k * 0.04).toFixed(2);
              return (
                <g key={k}>
                  <g>{paquet()}
                    <animateMotion dur={D} repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes={`0;${a(0.46)};${a(0.8)};1`} calcMode="linear"><mpath href={`#pb${n}_${k}`} /></animateMotion>
                    <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes={`0;${a(0.45)};${a(0.5)};${a(0.78)};${a(0.82)};1`} dur={D} repeatCount="indefinite" />
                  </g>
                  <circle cx={x} cy={y} r="14" fill="none" stroke={E.teal} strokeWidth="2" opacity="0">
                    <animate attributeName="opacity" values="0;0;.9;0;0" keyTimes={`0;${a(0.8)};${a(0.82)};${Math.min(0.99, 0.95 + k * 0.01).toFixed(2)};1`} dur={D} repeatCount="indefinite" />
                    <animate attributeName="r" values="14;14;14;21;21" keyTimes={`0;${a(0.8)};${a(0.82)};${Math.min(0.99, 0.95 + k * 0.01).toFixed(2)};1`} dur={D} repeatCount="indefinite" />
                  </circle>
                </g>
              );
            })}
          </>
        )}
      </svg>
      <Logos points={BRANCHES} hauteur={150} />
    </div>
  );
}

/** Le téléphone pilote, l'ordinateur (Chrome + l'extension) écrit et dépose sur les plateformes. */
export function HeroOrdi({ largeur = '100%' }) {
  const n = idPropre(useId()); const anime = !moinsDAnimations(); const D = '3.4s';
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: largeur, aspectRatio: '340 / 150', margin: '0 auto' }}>
      <svg viewBox="0 0 340 150" style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}>
        <path id={`oa${n}`} d="M66 80 C 88 80 96 66 116 66" style={TRACE} />
        {BRANCHES.map(([x, y], k) => <path key={k} id={`ob${n}_${k}`} d={`M226 ${56 + k * 6} C 250 ${56 + k * 6} 262 ${y} ${x - 14} ${y}`} style={TRACE} />)}
        <g className="ac-flotte-l">
          <rect x="18" y="40" width="46" height="80" rx="11" fill="#FFFFFF" stroke={E.ink} strokeWidth="2" />
          <rect x="34" y="45" width="14" height="3.5" rx="1.75" fill={E.ink} />
          <rect x="25" y="56" width="32" height="22" rx="5" fill="#DDEFEB" /><rect x="25" y="84" width="26" height="4.5" rx="2.2" fill="#D9D4C8" />
          <rect x="25" y="101" width="32" height="11" rx="5.5" fill={E.teal} />
        </g>
        <rect x="118" y="24" width="106" height="70" rx="8" fill="#FFFFFF" stroke={E.ink} strokeWidth="2" />
        <path d="M119 34 H223" stroke="#E4E0D6" strokeWidth="1.4" />
        {[126, 132, 138].map((cx) => <circle key={cx} cx={cx} cy="29.5" r="1.8" fill="#D9D4C8" />)}
        <rect className="ac-ecrit" x="128" y="44" width="58" height="6" rx="3" fill={E.teal} />
        <rect className="ac-ecrit" style={{ animationDelay: '.25s' }} x="128" y="56" width="78" height="5" rx="2.5" fill="#D9D4C8" />
        <rect className="ac-ecrit" style={{ animationDelay: '.5s' }} x="128" y="66" width="46" height="5" rx="2.5" fill="#E4E0D6" />
        <rect x="128" y="77" width="64" height="9" rx="4.5" fill="#DDEFEB" />
        <path d="M104 98 H238 L246 108 a3 3 0 0 1-2.6 4.5 H99.6 A3 3 0 0 1 97 108 Z" fill={E.ink} />
        <circle cx="206" cy="38" r="11" fill={E.teal} />
        <path d="M201 38h10M206 33v10" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
        {anime && (
          <>
            <g>{paquet()}
              <animateMotion dur={D} repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.36;1" calcMode="linear"><mpath href={`#oa${n}`} /></animateMotion>
              <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.05;.32;.38;1" dur={D} repeatCount="indefinite" />
            </g>
            {BRANCHES.map((b, k) => {
              const a = (v) => (v + k * 0.06).toFixed(2);
              return (
                <g key={k}>{paquet()}
                  <animateMotion dur={D} repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes={`0;${a(0.5)};${a(0.72)};1`} calcMode="linear"><mpath href={`#ob${n}_${k}`} /></animateMotion>
                  <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes={`0;${a(0.49)};${a(0.53)};${a(0.7)};${a(0.74)};1`} dur={D} repeatCount="indefinite" />
                </g>
              );
            })}
          </>
        )}
      </svg>
      <Logos points={BRANCHES} hauteur={150} />
    </div>
  );
}

/** Le lien part du téléphone par mail ; l'ordinateur s'allume avec l'extension. */
export function HeroMail({ largeur = '100%' }) {
  const n = idPropre(useId()); const anime = !moinsDAnimations(); const D = '3.8s';
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: largeur, aspectRatio: '340 / 140', margin: '0 auto' }}>
      <svg viewBox="0 0 340 140" style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}>
        <path id={`ma${n}`} d="M88 54 C 130 4 196 4 226 40" style={TRACE} />
        <g className="ac-flotte-l">
          <rect x="26" y="26" width="60" height="104" rx="13" fill="#FFFFFF" stroke={E.ink} strokeWidth="2" />
          <rect x="46" y="32" width="20" height="4" rx="2" fill={E.ink} />
          <rect x="35" y="46" width="42" height="12" rx="6" fill={E.teal} />
          <rect x="35" y="66" width="34" height="5" rx="2.5" fill="#D9D4C8" /><rect x="35" y="76" width="24" height="5" rx="2.5" fill="#E4E0D6" />
        </g>
        <rect x="190" y="48" width="118" height="72" rx="8" fill="#FFFFFF" stroke={E.ink} strokeWidth="2" />
        <rect x="194" y="52" width="110" height="64" rx="5" fill="#ECEAE3">
          {anime && <animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;.5;.58;.94;1" dur={D} repeatCount="indefinite" />}
        </rect>
        <path d="M176 124 H322 L330 132 a2 2 0 0 1-1.6 3 H170 a2 2 0 0 1-1.6-3 Z" fill={E.ink} />
        <g transform="translate(249 84)" opacity={anime ? 0 : 1}>
          {anime && <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.56;.62;.94;1" dur={D} repeatCount="indefinite" />}
          <circle r="17" fill={E.teal} /><path d="M-7 0h14M0 -7v14" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
        </g>
        {anime && (
          <g>
            <g transform="translate(-13 -9)"><rect width="26" height="18" rx="3.5" fill="#FFFFFF" stroke={E.tealDeep} strokeWidth="1.8" /><path d="M2 3 l11 8 11-8" fill="none" stroke={E.tealDeep} strokeWidth="1.8" strokeLinejoin="round" /></g>
            <animateMotion dur={D} repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.48;1" calcMode="linear"><mpath href={`#ma${n}`} /></animateMotion>
            <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.06;.44;.5;1" dur={D} repeatCount="indefinite" />
          </g>
        )}
      </svg>
    </div>
  );
}

// ── « As-tu un ordinateur ? » ───────────────────────────────────────────────────────────────────────────────────────
function Choix({ icone, titre, sous, onClick, cle, plein = false }) {
  return (
    <button type="button" onClick={onClick} data-entree={cle} className="en-cta en-focus" style={{
      width: '100%', boxSizing: 'border-box', minHeight: 84, padding: '16px', borderRadius: 22, cursor: 'pointer', fontFamily: 'inherit',
      textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12,
      background: E.card, border: plein ? `1.5px solid ${E.teal}` : `1.5px solid ${E.border}`,
      boxShadow: plein ? '0 16px 30px -20px rgba(27,110,98,0.7)' : 'none',
    }}>
      <span aria-hidden="true" style={{
        width: 56, height: 56, borderRadius: 18, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: plein ? DEGRADE : E.chip, color: plein ? '#FFFFFF' : E.ink,
      }}>{icone}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 16.5, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em', color: E.ink }}>{titre}</span>
        <span style={{ display: 'block', marginTop: 4, fontSize: 13, lineHeight: 1.45, color: E.texteSecondaire }}>{sous}</span>
      </span>
      <ChevronRight size={20} color={E.mute} aria-hidden="true" style={{ flexShrink: 0 }} />
    </button>
  );
}

export function EtapeOrdinateurAccueil({ c, T, onAller }) {
  const [info, setInfo] = useState(false);
  const o = useOffreAccueil(c);
  const choisir = (oui) => {
    // (19/11/2026 soir, demande de Nico) Chaque refus d'offre ou d'essai dit sa raison (offre absente, essai absent).
    c.journaliser(oui ? 'ordinateur_oui' : 'ordinateur_non', { essai_propose: o.essaiPropose, offre_cloud: o.offreCloud,
      raison_sans_essai: o.essaiPropose ? null : (o.raison ?? null),
      ...(o.sansOffre ? { raison_sans_offre: o.sansOffre.raison, detail_sans_offre: o.sansOffre.detail ?? null } : {}) });
    if (oui) {
      c.formules?.noterVoie?.('extension');
      c.choisirVoie('extension');
      onAller('extension');
      return;
    }
    if (o.formules) { c.formules.noterVoie('cloud'); c.choisirVoie('cloud'); onAller('cloud_offre'); return; }
    if (o.cloudSeul) { c.choisirVoie('cloud'); onAller('cloud'); return; }
    c.choisirVoie('sans_cloud');
    onAller('sans_cloud');
  };
  const sousNon = !o.offreCloud ? T.acOrdiNonSousSansCloud : o.essaiPropose ? T.acOrdiNonSousEssai : T.acOrdiNonSous;
  return (
    <Scene cle="ordinateur" pied={<Texte centre style={{ margin: 0, fontSize: 12.5 }}>{T.ordiPied}</Texte>}>
      <Kicker>{T.acOrdiKicker}</Kicker>
      <Titre>{T.acOrdiTitre}</Titre>
      <Texte>{T.acOrdiTexte}</Texte>
      <Choix cle="ordinateur-oui" icone={<Laptop size={27} strokeWidth={1.8} />} titre={T.acOrdiOui} sous={T.acOrdiOuiSous} onClick={() => choisir(true)} />
      <Choix cle="ordinateur-non" plein icone={<Cloud size={27} strokeWidth={1.8} />} titre={T.acOrdiNon} sous={sousNon} onClick={() => choisir(false)} />
      <button type="button" onClick={() => { c.journaliser('ordinateur_info'); setInfo(true); }} className="en-focus" aria-haspopup="dialog" style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', border: 'none', background: 'none', padding: '8px 0',
        minHeight: TACTILE, color: E.tealDeep, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}><Info size={17} aria-hidden="true" />{T.infoTitre}</button>
      {info && <FenetreInfo T={T} onFermer={() => setInfo(false)} />}
    </Scene>
  );
}

// ── L'écran Cloud unique ────────────────────────────────────────────────────────────────────────────────────────────
function Coche({ children }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderTop: `1px solid ${E.ligneDouce}` }}>
      <span aria-hidden="true" style={{
        width: 18, height: 18, marginTop: 1, borderRadius: 9, flexShrink: 0, background: E.menthe, border: `1px solid ${E.mentheBord}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: E.tealDeep,
      }}><Check size={11} strokeWidth={3.4} /></span>
      <span style={{ fontSize: 13.5, lineHeight: 1.45, color: E.ink }}>{children}</span>
    </div>
  );
}

function FeuilleAutresFormules({ c, T, o, onFermer, onChoisir }) {
  const k = c.formules;
  // (18/11/2026, essai réel) Au-dessus de tout (portail, comme la fenêtre « i ») : dans le parcours, la feuille était
  // rognée par l'écran qui glisse. Sous la case des conditions du Cloud (10060), au-dessus du parcours (9980).
  const feuille = (
    <div role="dialog" aria-modal="true" aria-label={T.acCloudAutresTitre} style={{ position: 'fixed', inset: 0, zIndex: 9990, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="ac-voile" onClick={onFermer} style={{ position: 'absolute', inset: 0, background: 'rgba(16,32,27,0.44)' }} />
      <div className="ac-feuille" style={{
        position: 'relative', maxHeight: '90%', overflowY: 'auto', background: E.paper, borderRadius: '28px 28px 0 0',
        padding: '10px 20px calc(env(safe-area-inset-bottom,0px) + 22px)', boxShadow: '0 -20px 40px -20px rgba(0,0,0,0.3)',
      }}>
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 3, background: '#CFC9BB', margin: '0 auto 12px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 21, letterSpacing: '-0.025em', color: E.ink }}>{T.acCloudAutresTitre}</h2>
          <button type="button" onClick={onFermer} aria-label={T.acCloudFermer} className="en-focus" style={{ width: TACTILE, height: TACTILE, borderRadius: 22, border: 'none', background: E.chip, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <OffresAvecCloud
          modele={o.modele} lang={c.lang} vente={k.vente} venteFermee={k.vente.fermee} onChoisir={onChoisir}
          palierIci={o.palier} canalApp={canalDeVente(c.plateforme)}
          corps={c.grille ? (palier, sombre) => <CorpsCarteGrille fr={c.lang !== 'en'} palier={palier} K={c.K} dark={sombre} margeBas={0} /> : null}
        />
        {k.achat.message && <div style={{ marginTop: 12 }}><Bande ton={k.achat.etat === 'erreur' || k.achat.etat === 'refuse' ? 'alerte' : 'menthe'}>{k.achat.message}</Bande></div>}
        <MentionsAbonnement lang={c.lang === 'en' ? 'en' : 'fr'} essaiAnnonce={o.modele.essaiAffiche} />
      </div>
    </div>
  );
  return typeof document === 'undefined' || !document.createElement ? feuille : createPortal(feuille, document.body);
}

export function EtapeCloudOffre({ c, T, onSuivant, onAller }) {
  const o = useOffreAccueil(c);
  const k = c.formules;
  const TF = textesFormules(c.lang);
  const nom = NOMS_FORMULES[FORMULE];
  const prix = prixOuChargement(FORMULE, c.lang);
  const zero = zeroAffiche(FORMULE, c.lang);
  const [autres, setAutres] = useState(false);
  const enCours = k?.achat?.etat === 'en_cours';
  const g = grilleDuPalier(c.K, 'pro');

  // LE journal de l'écran Cloud : la décision affichée (essai proposé ou non, et pourquoi), une fois par décision.
  const vuRef = useRef(null);
  useEffect(() => {
    if (o.enLecture) return;
    const cle = `${o.essaiPropose}|${o.raison}`;
    if (vuRef.current === cle) return;
    vuRef.current = cle;
    c.journaliser('cloud_offre_vue', { essai_propose: o.essaiPropose, formule_proposee: FORMULE, raison_sans_essai: o.raison, appareil: c.plateforme });
  }, [o.enLecture, o.essaiPropose, o.raison, c]);

  const apres = () => { if (c.cloud?.ouvert) onAller('cloud_connexion'); else onSuivant(); };
  const lancer = async (formule, essai, depuis) => {
    if (k.actif) { apres(); return; }
    c.journaliser('cloud_offre_clic', { formule, essai_propose: essai, depuis });
    k.choisir(formule, essai);
    const etat = await k.lancer(formule, { essaiAffiche: essai });
    if (etat) c.journaliser(essai ? `formule_essai_${etat}` : `formule_achat_${etat}`, { formule, depuis });
    if (etat === 'actif' || etat === 'change') { setAutres(false); apres(); }
  };
  const plusTard = () => {
    c.journaliser('cloud_plus_tard', { essai_propose: o.essaiPropose });
    c.choisirVoie('sans_cloud');
    onAller('sans_cloud');
  };

  if (!o.carte && !o.enLecture) {
    return (
      <Scene cle="cloud_offre" pied={<BoutonPrimaire onClick={plusTard}>{T.continuer}</BoutonPrimaire>}>
        <div style={{ margin: '0 -6px 8px' }}><HeroRelais largeur="84%" /></div>
        <Titre>{T.acCloudTitre}</Titre>
        <Texte>{T.acCloudIndispo}</Texte>
      </Scene>
    );
  }

  const essai = o.essaiPropose;
  const carte = o.carte;
  const ligne = o.enLecture ? '' : essai ? T.acCloudPrixEssai(zero, prix)
    : carte?.lignePrix === 'aujourdhui' ? T.acCloudPrixAujourdhui(prix)
      : texteLignePrix(carte, { T: TF, nom, prix, zero });
  const pret = !o.enLecture && carte?.achetable === true && !k.vente.fermee && (k.actif || prixPret(FORMULE));
  const titre = essai
    ? <><span style={{ background: `linear-gradient(110deg,${E.teal} 0%,${E.tealDeep} 55%,${E.teal} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{T.acCloudTitreEssai[0]}</span> {T.acCloudTitreEssai[1]}</>
    : T.acCloudTitre;

  return (
    <Scene
      cle="cloud_offre"
      collant
      pied={(
        <>
          {k.vente.fermee ? null : (
            <BoutonPrimaire onClick={() => lancer(FORMULE, essai, 'ecran')} disabled={enCours || !pret} style={{ position: 'relative', overflow: 'hidden' }}>
              <span className={pret && !enCours ? 'ac-brille' : undefined} style={{ position: 'absolute', inset: 0, borderRadius: 999 }} aria-hidden="true" />
              <span style={{ position: 'relative' }}>{enCours ? '…' : k.actif ? T.continuer : essai ? T.acCloudCtaEssai : T.acCloudCtaPasser(nom)}</span>
            </BoutonPrimaire>
          )}
          {ligne && !k.actif && (
            <p data-ligne-prix="" style={{ margin: '11px 0 0', fontSize: 15, lineHeight: 1.45, fontWeight: 500, color: E.ink, textAlign: 'center' }}>{ligne}</p>
          )}
          <LienDiscret onClick={plusTard} style={{ marginTop: 2 }}>{T.plusTard}</LienDiscret>
        </>
      )}
    >
      <div className="en-monte" style={{ margin: '0 -6px 4px' }}><HeroRelais largeur="72%" /></div>
      <span style={{
        display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 7, padding: '5px 11px 5px 9px', borderRadius: 999,
        background: E.card, border: `1px solid ${E.mentheBord}`, fontSize: 12, fontWeight: 700, color: E.tealDeep, marginBottom: 12,
      }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: E.teal, boxShadow: '0 0 0 3px rgba(47,158,144,.18)' }} />
        {T.acCloudPastille}
      </span>
      <h1 style={{
        margin: '0 0 12px', fontSize: essai ? 44 : 30, lineHeight: 1.02, fontWeight: 700, letterSpacing: essai ? '-0.05em' : '-0.032em', color: E.ink,
        opacity: o.enLecture ? 0.35 : 1, transition: 'opacity .3s ease',
      }}>{titre}</h1>
      <Texte>{T.acCloudTexte}</Texte>
      <Carte style={{ padding: '14px 16px 6px', border: `1.5px solid ${E.teal}`, boxShadow: '0 18px 34px -24px rgba(27,110,98,.55)', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <b style={{ fontSize: 17, letterSpacing: '-0.01em', color: E.ink }}>{nom}</b>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: E.tealDeep, color: '#FFFFFF' }}>{T.acCloudConseil}</span>
        </div>
        <div style={{ borderTop: 'none' }}>
          <Coche>{T.acCloudAnnonces(compteJauge('annonces', g.annonces, c.lang))}</Coche>
          <Coche>{T.acCloudPublications(compteJauge('publications', g.publications, c.lang))}</Coche>
          <Coche>{T.acCloudRemontees}</Coche>
        </div>
      </Carte>
      {!essai && !o.enLecture && o.raison === 'essai_deja_pris' && carte?.lignePrix === 'aujourdhui' && (
        <div style={{ marginTop: 8 }}><Bande ton="alerte">{T.acCloudSansEssaiBande(nom)}</Bande></div>
      )}
      {k.vente.fermee && <div style={{ marginTop: 10 }}><OffresAvecCloud modele={{ cartes: [], founder: false }} lang={c.lang} vente={k.vente} venteFermee onChoisir={() => {}} /></div>}
      {k.achat.message && <div style={{ marginTop: 10 }}><Bande ton={k.achat.etat === 'erreur' || k.achat.etat === 'refuse' ? 'alerte' : 'menthe'}>{k.achat.message}</Bande></div>}
      <button type="button" onClick={() => { c.journaliser('cloud_autres_formules', { essai_propose: essai }); setAutres(true); }} className="en-focus" style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'center', border: 'none', background: 'none', color: E.tealDeep,
        fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, minHeight: TACTILE, marginTop: 6, padding: '0 6px', cursor: 'pointer',
      }}>{T.acCloudAutres}<ChevronRight size={16} aria-hidden="true" /></button>
      {essai && <Texte centre style={{ margin: '0 0 2px', fontSize: 12 }}>{T.acCloudPremierPrelevement(k.dates.jourFin)}</Texte>}
      <Texte centre style={{ margin: 0, fontSize: 11.5 }}>{essai ? (T.cloudCanal[c.plateforme] ?? T.cloudCanal.web) : ''}</Texte>
      <MentionsAbonnement lang={c.lang === 'en' ? 'en' : 'fr'} essaiAnnonce={essai} />
      {autres && (
        <FeuilleAutresFormules
          c={c} T={T} o={o} onFermer={() => setAutres(false)}
          onChoisir={(x) => {
            c.journaliser(`formule_${x.formule}_${x.cta}`, { essai_propose: x.cta === 'essai', depuis: 'autres_formules' });
            return lancer(x.formule, x.cta === 'essai', 'autres_formules');
          }}
        />
      )}
    </Scene>
  );
}

// ── « Pour publier, il te faut un ordinateur » ──────────────────────────────────────────────────────────────────────
export function EtapeSansCloud({ c, T, onSuivant, onAller }) {
  const o = useOffreAccueil(c);
  const { envoi, secondesRestantes } = c;
  const envoye = envoi.etat === 'envoye';
  const envoyer = async () => {
    c.journaliser('lien_mail_demande', { depuis: 'sans_cloud', renvoi: envoye });
    logInstallExtension(c.user?.id ?? null, 'clic_mail', 'entree_sans_cloud', { renvoi: envoye });
    const r = await c.envoyerLien();
    if (r?.ok) { logInstallExtension(c.user?.id ?? null, 'mail_envoye', 'entree_sans_cloud'); c.journaliser('lien_mail_envoye', { depuis: 'sans_cloud' }); }
  };
  const revoirCloud = () => {
    c.journaliser('cloud_revu', { essai_propose: o.essaiPropose });
    c.choisirVoie('cloud');
    if (o.formules) { c.formules.noterVoie('cloud'); onAller('cloud_offre'); } else onAller('cloud');
  };
  const continuer = (sans) => { c.journaliser(sans ? 'continuer_sans_publier' : 'sans_cloud_continuer', { lien_envoye: envoye }); onSuivant(); };
  return (
    <Scene
      cle="sans_cloud"
      collant
      pied={(
        <>
          {envoye ? (
            <>
              <div className="en-monte" style={{ marginBottom: 10 }}>
                <Bande>{T.acSansEnvoye(envoi.email ?? c.user?.email ?? '')}</Bande>
              </div>
              <BoutonPrimaire onClick={() => continuer(false)}>{T.continuer}</BoutonPrimaire>
            </>
          ) : (
            <BoutonPrimaire onClick={envoyer} disabled={envoi.etat === 'en_cours'}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Mail size={19} aria-hidden="true" />{envoi.etat === 'en_cours' ? T.extCtaMailEnCours : T.acSansCta}</span>
            </BoutonPrimaire>
          )}
          {o.offreCloud && (
            <button type="button" onClick={revoirCloud} className="en-cta en-focus" style={{
              width: '100%', minHeight: 50, marginTop: 10, borderRadius: 999, border: `1.5px solid ${E.teal}`, background: E.card, color: E.tealDeep,
              fontFamily: 'inherit', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
            }}><Cloud size={18} aria-hidden="true" />{o.essaiPropose ? T.acSansCloudEssai : T.acSansCloud}</button>
          )}
          {!envoye && <LienDiscret onClick={() => continuer(true)} style={{ marginTop: 2 }}>{T.acSansContinuer}</LienDiscret>}
          {envoye && (
            <LienDiscret onClick={secondesRestantes > 0 ? undefined : envoyer} style={{ marginTop: 2, fontSize: 12.5, color: secondesRestantes > 0 ? E.texteSecondaire : E.tealDeep }}>
              {secondesRestantes > 0 ? (c.fr ? 'Renvoyer (envoyé à l\'instant)' : 'Resend (just sent)') : (c.fr ? 'Renvoyer le lien' : 'Resend the link')}
            </LienDiscret>
          )}
        </>
      )}
    >
      <div className="en-monte" style={{ margin: '0 -6px 6px' }}><HeroMail largeur="88%" /></div>
      <Kicker>{T.acSansKicker}</Kicker>
      <Titre>{T.acSansTitre}</Titre>
      <Texte>{T.acSansTexte}</Texte>
      <Carte style={{ padding: '6px 14px' }}>
        {T.acSansEtapes.map((x, i) => (
          <div key={x} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? `1px solid ${E.ligneDouce}` : 'none' }}>
            <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, background: DEGRADE, color: '#FFFFFF', fontSize: 12.5, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{i + 1}</span>
            <span style={{ fontSize: 14, lineHeight: 1.4, color: E.ink }}>{x}</span>
          </div>
        ))}
      </Carte>
      <Texte style={{ margin: '10px 0 0', fontSize: 12.5 }}>{T.acSansNote}</Texte>
      {envoi.etat === 'echec' && (
        <div style={{ marginTop: 10 }}><Bande ton="alerte">{messageEchecLien(envoi.raison, c.fr, !!envoi.email, envoi.retryDans)}</Bande></div>
      )}
    </Scene>
  );
}

/** La carte « Pas envie de le laisser allumé ? » de l'écran extension (téléphone, Cloud vendu à ce compte). */
export function AlternativeCloud({ c, T, onAller }) {
  const o = useOffreAccueil(c);
  if (!c.surTelephone || !o.offreCloud) return null;
  const aller = () => {
    c.journaliser('cloud_alternative', { essai_propose: o.essaiPropose });
    c.choisirVoie('cloud');
    if (o.formules) { c.formules.noterVoie('cloud'); onAller('cloud_offre'); } else onAller('cloud');
  };
  return (
    <button type="button" onClick={aller} className="en-cta en-focus" style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '13px 14px', borderRadius: 18, cursor: 'pointer',
      border: `1px solid ${E.mentheBord}`, background: 'linear-gradient(135deg,#F3FAF8,#E6F4F0)', marginTop: 12, fontFamily: 'inherit',
    }}>
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 13, background: E.card, display: 'grid', placeItems: 'center', color: E.tealDeep, flexShrink: 0, boxShadow: OMBRE_CTA.replace('0.75', '0.3') }}><Cloud size={22} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: E.ink }}>{T.acExtAltTitre}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: E.texteSecondaire, marginTop: 2 }}>{o.essaiPropose ? T.acExtAltSousEssai : T.acExtAltSous}</span>
      </span>
      <ChevronRight size={18} color={E.tealDeep} aria-hidden="true" />
    </button>
  );
}
