// ═══════════════════════════════════════════════════════════════════════════
// LA 2e VOIE — « JE N'AI PAS D'ORDINATEUR » → SANS ORDINATEUR (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// CONCEPTION, derrière cloudOfferVisible(). Mesuré : 7 inscrits sur 9
// décrochent au mur « installe l'extension » — beaucoup n'ont simplement pas
// d'ordinateur. Cette voie leur dit qu'il existe une autre route, SANS écraser
// la première : l'extension reste le chemin principal (gratuit), cette carte
// vient APRÈS, en secondaire (fond papier, bouton creux).
//
// Quatre formes, un seul discours (cloud/textes.js) :
//   · 'rangee' — l'étape « extension » du parcours d'entrée : une rangée SOUS
//               le bouton principal (une carte au-dessus le poussait hors de
//               l'écran — capture du 04/10) ;
//   · 'carte' — le mur (ExtensionPitchScreen), sous la section eBay ;
//   · 'lien'  — une ligne sous le bouton « m'envoyer le lien » des cartes du
//               Stock (InstallExtensionCta) ;
//   · 'page'  — la page /extension ouverte sur un téléphone : hors de l'app,
//               souvent sans session — la demande est gardée et on mène à /app.
//
// Le tap n'ouvre AUCUN paiement : il demande la feuille des formules,
// interrupteur coché (cloud/offreCloud.js), où tout est écrit avant de payer.
// Sans lecture sûre de l'état Cloud du compte (essai déjà pris ? option déjà
// active ?), la carte ne s'affiche pas — jamais un essai promis à tort.
import { useState } from 'react';
import { Cloud, ChevronRight } from 'lucide-react';
import { C, MENTHE, BLANC } from './theme';
import { textesCloud } from './textes';
import { cloudOfferVisible } from '../config/cloudOffer';
import { useCloudProfil } from './useCloudProfil';
import { voieCloud, dateLongue, finEssaiSiOnCommence } from './regles';
import { ouvrirOffreCloud, garderDemande } from './offreCloud';

function Glyphe() {
  return (
    <span aria-hidden="true" style={{
      width: 36, height: 36, borderRadius: 12, flexShrink: 0, background: MENTHE, border: '1px solid rgba(47,158,144,0.28)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Cloud size={19} color={C.tealDeep} strokeWidth={2.2} />
    </span>
  );
}

const styleBoutonCreux = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', boxSizing: 'border-box',
  minHeight: 46, borderRadius: 999, border: `1.5px solid ${C.tealDeep}`, background: BLANC,
  color: C.tealDeep, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'none',
};

/**
 * La voie, sans lecture ni drapeau (rendue telle quelle par l'aperçu et le
 * test SSR). `essai` : l'essai est-il encore proposable à ce compte ?
 */
export function CarteVoieCloud({ lang = 'fr', essai = true, variante = 'carte', onChoisir, href, sansEbay = false, maintenant }) {
  // La date « rien n'est prélevé avant le … » : maintenant + 7 jours (l'essai
  // n'est pas encore ouvert), horloge figée au montage, jamais écrite en dur.
  const [horloge] = useState(() => Date.now());
  const T = textesCloud(lang);
  if (variante === 'lien') {
    return (
      <button type="button" data-cloud="voie-lien" onClick={onChoisir} style={{
        display: 'block', width: '100%', minHeight: 44, border: 'none', background: 'none', padding: '6px 4px', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: C.tealDeep, textDecoration: 'underline', textUnderlineOffset: 3, lineHeight: 1.4,
      }}>
        {essai ? T.voieCompactEssai : T.voieCompact}
      </button>
    );
  }
  if (variante === 'rangee') {
    // Le parcours d'entrée : une RANGÉE sous le bouton principal, pas une
    // carte au-dessus — le bouton de l'extension ne descend pas d'un pixel.
    // Le détail (ce que ça fait, l'essai, la date) est dans la feuille que le
    // tap ouvre.
    return (
      <button type="button" data-cloud="voie-rangee" onClick={onChoisir} style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%', boxSizing: 'border-box', minHeight: 58,
        padding: '9px 12px', borderRadius: 16, border: `1px solid ${C.border}`, background: C.paper,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      }}>
        <Glyphe />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.mute2 }}>{T.voieKicker}</span>
          <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, color: C.ink }}>{essai ? T.voieTitreEssai : T.voieTitre}</span>
        </span>
        <ChevronRight aria-hidden="true" size={18} color={C.tealDeep} strokeWidth={2.2} style={{ flexShrink: 0 }} />
      </button>
    );
  }
  const page = variante === 'page';
  const action = page
    ? <a href={href ?? '/app'} onClick={onChoisir} style={styleBoutonCreux}>{T.pageCta}</a>
    : <button type="button" onClick={onChoisir} style={styleBoutonCreux}>{essai ? T.voieCtaEssai : T.voieCta}</button>;
  return (
    <div data-cloud={page ? 'voie-page' : 'voie'} style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 18, padding: '14px 14px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 8 }}>
        <Glyphe />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.mute2 }}>
            {page ? T.pageTitre : T.voieKicker}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.01em', color: C.ink, marginTop: 2 }}>
            {page || essai ? T.voieTitreEssai : T.voieTitre}
          </div>
        </div>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, fontWeight: 500, color: C.mute2 }}>
        {page ? T.pageTexte : T.voieTexte}{sansEbay ? null : ` ${T.ebayDeja}`}
      </p>
      {action}
      <p style={{ margin: '9px 0 0', fontSize: 12, lineHeight: 1.45, fontWeight: 500, color: C.mute2, textAlign: 'center' }}>
        {page ? T.pageNote : essai ? T.voieNote(dateLongue(finEssaiSiOnCommence(maintenant ?? horloge), lang)) : T.voieNoteSansEssai}
      </p>
    </div>
  );
}

/**
 * La voie BRANCHÉE : drapeau, lecture de l'état Cloud, et le tap qui demande
 * la feuille des formules. `origine` = vocabulaire du tunnel (télémétrie).
 */
// `sansEbay` : l'hôte dit déjà qu'eBay part sans ordinateur (le mur) — la
// carte ne le répète pas.
export default function VoieSansOrdinateur({ lang = 'fr', userId = null, origine, variante = 'carte', style, sansEbay = false }) {
  const visible = cloudOfferVisible(userId);
  const lecture = useCloudProfil(userId, { actif: visible && variante !== 'page' });
  if (!visible) return null;
  if (variante === 'page') {
    return (
      <div style={style}>
        <CarteVoieCloud lang={lang} variante="page" href="/app" onChoisir={() => garderDemande(origine)} />
      </div>
    );
  }
  const v = voieCloud(lecture);
  if (!v) return null;
  return (
    <div style={style}>
      <CarteVoieCloud lang={lang} essai={v.essai} variante={variante} sansEbay={sansEbay} maintenant={lecture.luLe ?? undefined} onChoisir={() => ouvrirOffreCloud(origine)} />
    </div>
  );
}
