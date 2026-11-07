// ═══════════════════════════════════════════════════════════════════════════
// LA FIN DE L'ESSAI « FILLSELL CLOUD » — LA VEILLE, ET L'APRÈS (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// CONCEPTION. Deux feuilles, montées par cloud/HoteCloud.jsx (une à la fois,
// une fois chacune par essai) :
//
//   · RappelVeilleFinEssai — la veille (ou le jour même) de la bascule :
//     « Demain, l'option passe à 24,99 €/mois », la date ET l'heure, ce qui se
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
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cloud } from 'lucide-react';
import { C, MENTHE, BLANC, DEGRADE_TEAL, POLICE } from './theme';
import { textesCloud } from './textes';
import { dateLongue, heureDe, issueVeilleArret, RELECTURES_APRES_BOUTIQUE_MS } from './regles';
import { voieArretCloud, voieBoutique } from './achatCloud';

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
 * actions.arreter : ({ canal }) => Promise<{ ok, etat, voie }> — fourni par l'hôte (paiement).
 * canal / plateforme (07/11 soir) : profiles.cloud_canal et Capacitor.getPlatform — un Cloud pris sur l'App Store ou
 * Google Play s'arrête dans la boutique : la feuille le dit, ouvre ses abonnements, et ne dit JAMAIS « c'est arrêté »
 * ni « rien n'est facturé » avant que la boutique l'ait confirmé.
 */
// (08/11, ordre de Nico) Après « Arrêter » : la boutique ouverte → « Tu as ouvert tes abonnements Apple ; dès qu'Apple
// nous confirme l'arrêt, c'est réglé », puis, à la CONFIRMATION (relue en base : quatre relectures au plus,
// RELECTURES_APRES_BOUTIQUE_MS, jamais une boucle), « C'est arrêté. Rien ne sera prélevé. » Stripe : « rien ne sera
// prélevé » seulement si cancel-subscription l'a relu chez Stripe. Aucun abonnement trouvé : le message du serveur.
// arretConfirme : arretEssaiConfirme(cloud, profil) (cloud/regles.js), calculé par l'hôte ; relire : la relecture de
// l'état Cloud de l'hôte ; onSuivi : l'hôte garde la feuille montée pendant le suivi (l'essai arrêté n'est plus « la
// veille »).
export function RappelVeilleFinEssai({ lang = 'fr', cloud, quand = 'demain', nomPalier = null, actions = {}, onFermer, canal = null, plateforme = 'web', arretConfirme = false, relire = null, onSuivi = null }) {
  const T = textesCloud(lang);
  const [etat, setEtat] = useState('question'); // 'question' | 'en_cours' | 'arretee' | 'boutique' | 'rien' | 'echec'
  // La date et l'heure de la bascule, figées à l'ouverture : l'arrêt ramène la fin d'essai à « maintenant ».
  const [fige] = useState(() => ({ date: dateLongue(cloud?.essaiFin, lang), heure: heureDe(cloud?.essaiFin, lang) }));
  const { date, heure } = fige;
  const voie = voieArretCloud(canal, plateforme);
  const boutique = voieBoutique(voie);
  // (08/11) L'échec d'ouverture des abonnements de la boutique dit le chemin EXACT (message de l'hôte) ; le bouton
  // d'arrêt reste là pour réessayer.
  const [messageEchec, setMessageEchec] = useState(null);
  const [reponse, setReponse] = useState(null);

  const arreter = async () => {
    if (typeof actions.arreter !== 'function' || etat === 'en_cours') return;
    setEtat('en_cours');
    try {
      const r = await actions.arreter({ canal });
      setMessageEchec(r?.ok === false && boutique && r?.message ? r.message : null);
      setReponse(r ?? null);
      const suite = r?.ok === false ? 'echec' : r?.etat === 'boutique' ? 'boutique' : r?.etat === 'rien' ? 'rien' : 'arretee';
      if (suite !== 'echec') onSuivi?.();
      setEtat(suite);
    } catch {
      setMessageEchec(null);
      setEtat('echec');
    }
  };
  // La confirmation de la boutique arrive par son webhook : quelques relectures, puis plus rien.
  useEffect(() => {
    if (etat !== 'boutique' || arretConfirme || typeof relire !== 'function') return undefined;
    const minuteries = RELECTURES_APRES_BOUTIQUE_MS.map((ms) => setTimeout(() => relire(), ms));
    return () => minuteries.forEach(clearTimeout);
  }, [etat, arretConfirme, relire]);
  const fini = etat === 'arretee' || etat === 'boutique' || etat === 'rien';
  const issue = issueVeilleArret({ etat, arretConfirme, aucunPrelevement: reponse?.aucun_prelevement === true });
  const texteIssue = issue === 'boutique_ouverte' ? T.veilleBoutiqueOuverte(voie)
    : issue === 'arrete_sans_prelevement' ? T.veilleArreteeConfirmee
      : issue === 'rien' ? (reponse?.message ?? T.veilleArretee)
        : T.veilleArretee;

  return (
    <Feuille onFermer={onFermer} etiquette={T.veilleTitre(quand, heure)}>
      <div data-cloud="veille">
        <EnTete kicker={T.veilleKicker} titre={T.veilleTitre(quand, heure)} />

        {fini ? (
          <p data-zone="issue" data-issue={issue ?? ''} style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.55, fontWeight: 600, color: C.ink }}>{texteIssue}</p>
        ) : (
          <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '13px 14px', marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, fontWeight: 600, color: C.ink }}>{boutique ? T.veilleTexteBoutique(date, heure, voie) : T.veilleTexte(date, heure, nomPalier)}</p>
            <div data-zone="bascule" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 5, background: C.amber, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{T.veilleBascule(date, heure)}</span>
            </div>
          </div>
        )}

        {etat === 'echec' && (
          <p role="status" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, fontWeight: 600, color: '#7A4A0B', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '10px 12px' }}>
            {messageEchec ?? T.veilleArretEchec}
          </p>
        )}

        {fini ? (
          <button type="button" onClick={onFermer} style={bouton(true)}>{T.fermer}</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" onClick={onFermer} style={bouton(true)}>{T.veilleGarder}</button>
            {/* Apple vu ailleurs que sur iPhone / iPad : rien à ouvrir ici, le texte dit où l'arrêter. */}
            {typeof actions.arreter === 'function' && voie !== 'apple_ailleurs' && (
              <button type="button" onClick={arreter} disabled={etat === 'en_cours'} style={{ ...bouton(false), opacity: etat === 'en_cours' ? 0.6 : 1 }}>
                {etat === 'en_cours' ? '…' : boutique ? T.arreterBoutiqueCta(voie) : T.veilleArreter}
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
 * 04/10 soir, un compte Free reprend l'option comme les autres (Free + FillSell Cloud).
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

/**
 * (03/11, point 3 de Nico) LE CLOUD ARRÊTÉ — résiliation, impayé, option reprise puis arrêtée : jamais « ton essai
 * est terminé » ni « rien n'a été facturé » pour quelqu'un qui a payé. Le vrai état : les tâches repassent par
 * l'extension FillSell de l'ordinateur ; deux gestes, reprendre FillSell Cloud ou installer / ouvrir l'extension.
 */
export function EcranCloudArrete({ lang = 'fr', actions = {}, onFermer }) {
  const T = textesCloud(lang);
  return (
    <Feuille onFermer={onFermer} etiquette={T.arretTitre}>
      <div data-cloud="arrete">
        <EnTete kicker={T.arretKicker} titre={T.arretTitre} />
        <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.55, fontWeight: 600, color: C.ink }}>{T.arretTexte}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {typeof actions.ajouter === 'function' && (
            <button type="button" onClick={actions.ajouter} style={bouton(true)}>{T.arretCtaReprendre}</button>
          )}
          {typeof actions.extension === 'function' && (
            <button type="button" onClick={actions.extension} style={bouton(false)}>{T.arretCtaExtension}</button>
          )}
          <button type="button" onClick={onFermer} style={{ minHeight: 44, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: C.mute2 }}>
            {T.fermer}
          </button>
        </div>
      </div>
    </Feuille>
  );
}

/**
 * (03/11, point 5 de Nico) LA PLACE LIBRE, GARDÉE 24 H à un(e) inscrit(e) de la liste d'attente : un bandeau (en plus
 * de la notification push), qui ouvre l'offre. Fermable ; jamais un mail.
 */
export function BandeauPlaceLibre({ lang = 'fr', onDemarrer, onFermer }) {
  const T = textesCloud(lang);
  return (
    <div data-cloud="place-libre" role="status" style={{
      position: 'fixed', left: 12, right: 12, top: 'calc(env(safe-area-inset-top, 0px) + 10px)', zIndex: 9980,
      maxWidth: 480, margin: '0 auto', boxSizing: 'border-box', background: C.paper, border: `1.5px solid ${C.teal}`,
      borderRadius: 18, padding: '12px 14px', fontFamily: POLICE, boxShadow: '0 14px 30px -18px rgba(16,32,27,0.55)',
      display: 'flex', alignItems: 'center', gap: 11,
    }}>
      <span aria-hidden="true" style={{
        width: 34, height: 34, borderRadius: 11, background: MENTHE, border: '1px solid rgba(47,158,144,0.28)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Cloud size={18} color={C.tealDeep} strokeWidth={2.2} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{T.placeLibreTitre}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.mute2, lineHeight: 1.4, marginTop: 2 }}>{T.placeLibreTexte}</div>
        {typeof onDemarrer === 'function' && (
          <button type="button" onClick={onDemarrer} style={{ ...bouton(true), minHeight: 44, marginTop: 9, fontSize: 13.5 }}>{T.placeLibreCta}</button>
        )}
      </div>
      <button type="button" aria-label={T.fermer} onClick={onFermer} style={{
        alignSelf: 'flex-start', minWidth: 44, minHeight: 44, border: 'none', background: 'none', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 20, lineHeight: 1, color: C.mute2,
      }}>×</button>
    </div>
  );
}
