// ═══════════════════════════════════════════════════════════════════════════
// LA FIN DE L'ESSAI « SANS ORDINATEUR » — LA VEILLE, ET L'APRÈS (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// CONCEPTION. Deux feuilles, montées par cloud/HoteCloud.jsx (une à la fois,
// une fois chacune par essai) :
//
//   · RappelVeilleFinEssai — la veille (ou le jour même) de la bascule :
//     « Demain, l'option passe à 20 €/mois », la date ET l'heure, ce qui se
//     passe dans chaque cas, et DEUX boutons de même taille — garder, arrêter.
//     Arrêter se fait ICI, en un geste : la feuille a déjà dit ce que ça
//     change. Aucun compte à rebours, aucune couleur d'alarme ;
//   · EcranEssaiTermine — l'essai est fini et l'option n'a pas été gardée :
//     ce qui s'arrête, ce qui CONTINUE (l'extension gratuite, eBay depuis le
//     téléphone, le stock), et la porte pour la reprendre.
//
// ⛔ Mêmes règles que la feuille des formules : palette `C`, police Space
//    Grotesk, portail sur document.body (WebKit, cf. ConversionModal), texte
//    à 4,5:1 minimum, jamais de diagnostic à l'écran.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Cloud } from 'lucide-react';
import { C, MENTHE, BLANC, DEGRADE_TEAL, POLICE } from './theme';
import { textesCloud } from './textes';
import { dateLongue, heureDe } from './regles';

const ANIM = `
@keyframes fsCloudMonte { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes fsCloudFondu { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .fs-cloud-anime { animation: none !important } }
`;

function Feuille({ onFermer, children, etiquette }) {
  return createPortal(
    <>
      <style>{ANIM}</style>
      <div
        onClick={onFermer}
        className="fs-cloud-anime"
        style={{
          position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(16,32,27,0.55)',
          backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fsCloudFondu .2s ease',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={etiquette}
          onClick={(e) => e.stopPropagation()}
          className="fs-cloud-anime"
          style={{
            width: '100%', maxWidth: 480, boxSizing: 'border-box', background: C.canvas, borderRadius: '26px 26px 0 0',
            maxHeight: '92vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            padding: '14px 18px calc(env(safe-area-inset-bottom, 0px) + 22px)',
            animation: 'fsCloudMonte .3s cubic-bezier(0.22,1,0.36,1)', fontFamily: POLICE,
          }}
        >
          <div style={{ width: 40, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 16px' }} />
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}

function EnTete({ kicker, titre }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden="true" style={{
          width: 36, height: 36, borderRadius: 12, background: MENTHE, border: '1px solid rgba(47,158,144,0.28)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Cloud size={19} color={C.tealDeep} strokeWidth={2.2} />
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.mute2 }}>{kicker}</span>
      </div>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', color: C.ink }}>{titre}</h2>
    </div>
  );
}

const bouton = (plein) => ({
  width: '100%', minHeight: 50, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 14.5, fontWeight: 700,
  border: plein ? 'none' : `1.5px solid ${C.border}`,
  background: plein ? DEGRADE_TEAL : BLANC,
  color: plein ? BLANC : C.ink,
  boxShadow: plein ? '0 10px 22px -8px rgba(47,158,144,0.5)' : 'none',
});

/**
 * La veille de la fin d'essai.
 * cloud : cloudDuProfil(…) en état 'essai' ; quand : 'demain' | 'aujourdhui'
 * actions.arreter : () => Promise<{ ok }> — fourni par l'hôte (paiement).
 */
export function RappelVeilleFinEssai({ lang = 'fr', cloud, quand = 'demain', nomPalier = null, actions = {}, onFermer }) {
  const T = textesCloud(lang);
  const [etat, setEtat] = useState('question'); // 'question' | 'en_cours' | 'arretee' | 'echec'
  const date = dateLongue(cloud?.essaiFin, lang);
  const heure = heureDe(cloud?.essaiFin, lang);

  const arreter = async () => {
    if (typeof actions.arreter !== 'function' || etat === 'en_cours') return;
    setEtat('en_cours');
    try {
      const r = await actions.arreter();
      setEtat(r?.ok === false ? 'echec' : 'arretee');
    } catch {
      setEtat('echec');
    }
  };

  return (
    <Feuille onFermer={onFermer} etiquette={T.veilleTitre(quand, heure)}>
      <div data-cloud="veille">
        <EnTete kicker={T.veilleKicker} titre={T.veilleTitre(quand, heure)} />

        {etat === 'arretee' ? (
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.55, fontWeight: 600, color: C.ink }}>{T.veilleArretee}</p>
        ) : (
          <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '13px 14px', marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, fontWeight: 600, color: C.ink }}>{T.veilleTexte(date, heure, nomPalier)}</p>
            <div data-zone="bascule" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 5, background: C.amber, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{T.veilleBascule(date, heure)}</span>
            </div>
          </div>
        )}

        {etat === 'echec' && (
          <p role="status" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, fontWeight: 600, color: '#7A4A0B', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '10px 12px' }}>
            {T.veilleArretEchec}
          </p>
        )}

        {etat === 'arretee' ? (
          <button type="button" onClick={onFermer} style={bouton(true)}>{T.fermer}</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" onClick={onFermer} style={bouton(true)}>{T.veilleGarder}</button>
            {typeof actions.arreter === 'function' && (
              <button type="button" onClick={arreter} disabled={etat === 'en_cours'} style={{ ...bouton(false), opacity: etat === 'en_cours' ? 0.6 : 1 }}>
                {etat === 'en_cours' ? '…' : T.veilleArreter}
              </button>
            )}
          </div>
        )}

        <p style={{ margin: '14px 0 0', fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: C.mute2, textAlign: 'center' }}>{T.veilleNote(nomPalier)}</p>
      </div>
    </Feuille>
  );
}

function Liste({ titre, lignes, ton }) {
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.mute2, marginBottom: 8 }}>{titre}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lignes.map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            {ton === 'continue' ? (
              <span aria-hidden="true" style={{ width: 17, height: 17, borderRadius: 9, flexShrink: 0, marginTop: 1, background: 'rgba(47,158,144,0.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.tealDeep} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
            ) : (
              <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 5, flexShrink: 0, marginTop: 5, marginLeft: 4, marginRight: 4, background: C.amber }} />
            )}
            <span style={{ fontSize: 13, lineHeight: 1.45, fontWeight: 600, color: C.ink }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Après la fin de l'essai, option non gardée.
 * actions : { ajouter?, extension? } — un geste absent = pas de bouton. Depuis le
 * 04/10 soir, un compte Free reprend l'option comme les autres (Free + Sans ordinateur).
 */
export function EcranEssaiTermine({ lang = 'fr', nomPalier = null, actions = {}, onFermer }) {
  const T = textesCloud(lang);
  const reprendre = actions.ajouter;
  return (
    <Feuille onFermer={onFermer} etiquette={T.finTitre}>
      <div data-cloud="fin">
        <EnTete kicker={T.finKicker} titre={T.finTitre} />
        <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.55, fontWeight: 600, color: C.ink }}>{T.finTexte}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <Liste titre={T.finArreteTitre} lignes={T.finArrete} ton="arrete" />
          <Liste titre={T.finContinueTitre} lignes={T.finContinue(nomPalier)} ton="continue" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {typeof reprendre === 'function' && (
            <button type="button" onClick={reprendre} style={bouton(true)}>{T.finCtaAjouter}</button>
          )}
          {typeof actions.extension === 'function' && (
            <button type="button" onClick={actions.extension} style={bouton(false)}>{T.finCtaExtension}</button>
          )}
          <button type="button" onClick={onFermer} style={{ minHeight: 44, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: C.mute2 }}>
            {T.fermer}
          </button>
        </div>
      </div>
    </Feuille>
  );
}
