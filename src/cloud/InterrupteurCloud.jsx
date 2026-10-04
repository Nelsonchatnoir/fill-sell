// ═══════════════════════════════════════════════════════════════════════════
// L'INTERRUPTEUR « SANS ORDINATEUR · +20 €/MOIS » — FEUILLE DES FORMULES
// ═══════════════════════════════════════════════════════════════════════════
// CONCEPTION (04/10/2026), monté par components/ConversionModal.jsx derrière
// cloudOfferVisible() (drapeau baissé = jamais rendu).
//
// UN interrupteur pour TOUTES les cartes : l'option s'ajoute à la formule
// choisie, elle n'est pas un palier (décision Nico du 04/10). Depuis les
// décisions du 04/10 soir, elle se prend AUSSI seule sur un compte Free : pour
// un lecteur Free, l'interrupteur se pose AU-DESSUS de la carte Free et, coché,
// la carte Free porte sa propre voie « Free + Sans ordinateur » (bouton dédié,
// jamais onUpgrade('free')), les cartes payantes leur « + 20 € ».
//
// L'ESSAI, SANS PIÈGE : décoché, la pastille d'essai et la ligne « carte
// demandée, rien n'est prélevé pour l'option avant le [date] » ; coché, une
// frise en trois temps — aujourd'hui (carte demandée, rien prélevé), la DATE
// de bascule (20 €/mois), et la sortie (où, comment, prévenu la veille dans
// l'app et par e-mail). Essai déjà pris : ni pastille ni frise, une phrase qui
// dit que l'option est facturée dès aujourd'hui.
// La date vient TOUJOURS de maintenant + 7 jours (finEssaiSiOnCommence) : un
// essai pas encore ouvert n'a pas d'autre date vraie.
//
// ⛔ Ce bloc ne décide de rien : il reçoit `offre` (cloud/regles.js,
//    offreCloudPourModale) et `coche`. L'hôte transmet le choix par
//    onUpgrade(tier, { cloud }) ou, pour Free + Sans ordinateur, onCloudSeul().
import { useState } from 'react';
import { Cloud } from 'lucide-react';
import { C, MENTHE, BLANC, DEGRADE_TEAL } from './theme';
import { textesCloud } from './textes';
import { dateLongue, finEssaiSiOnCommence } from './regles';

function Glyphe({ taille = 34 }) {
  return (
    <span aria-hidden="true" style={{
      width: taille, height: taille, borderRadius: Math.round(taille / 3), flexShrink: 0,
      background: MENTHE, border: `1px solid rgba(47,158,144,0.28)`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Cloud size={Math.round(taille * 0.52)} color={C.tealDeep} strokeWidth={2.2} />
    </span>
  );
}

// L'interrupteur lui-même : 46 × 28, piste teal quand il est coché. Toute la
// rangée d'en-tête est la zone tactile (≥ 44 px), pas seulement le bouton.
function Bascule({ coche }) {
  return (
    <span aria-hidden="true" style={{
      position: 'relative', width: 46, height: 28, borderRadius: 14, flexShrink: 0,
      background: coche ? C.tealDeep : '#CFC9BA', transition: 'background .18s ease',
    }}>
      <span style={{
        position: 'absolute', top: 3, left: 3, width: 22, height: 22, borderRadius: 11, background: BLANC,
        boxShadow: '0 1px 3px rgba(16,32,27,0.3)',
        transform: `translateX(${coche ? 18 : 0}px)`, transition: 'transform .18s cubic-bezier(.22,.61,.36,1)',
      }} />
    </span>
  );
}

export function PastilleEssai({ T }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start',
      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: C.tealDeep, background: MENTHE, borderRadius: 999, padding: '4px 9px',
    }}>
      {T.essaiPastille}
    </span>
  );
}

// La frise de l'essai. `etapes` = [{ quand, quoi, bascule? }] ; le point de la
// bascule (le jour où l'option devient payante) est ambre, les autres teal.
function Frise({ etapes, zone = 'frise' }) {
  return (
    <ol data-zone={zone} style={{ listStyle: 'none', margin: '12px 0 0', padding: '12px 0 0', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 9 }}>
      {etapes.map((e, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span aria-hidden="true" style={{
            width: 9, height: 9, borderRadius: 5, marginTop: 4, flexShrink: 0,
            background: e.bascule ? C.amber : C.teal,
          }} />
          <span style={{ fontSize: 12.5, lineHeight: 1.45, color: C.ink, minWidth: 0 }}>
            <strong style={{ fontWeight: 700 }}>{e.quand}</strong>
            <span style={{ color: C.mute2, fontWeight: 600 }}> — {e.quoi}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

// La date de bascule d'un essai qui commencerait maintenant (jamais en dur).
const dateBascule = (lang, maintenant) => dateLongue(finEssaiSiOnCommence(maintenant), lang);

// Les trois temps de l'essai ; le 2e (la bascule) est marqué.
function etapesEssai(T, lang, maintenant) {
  const [aujourdhui, bascule, sortie] = T.frise(dateBascule(lang, maintenant));
  return [aujourdhui, { ...bascule, bascule: true }, sortie];
}

const styleBoutonPlein = {
  width: '100%', minHeight: 48, border: 'none', borderRadius: 14, cursor: 'pointer',
  background: DEGRADE_TEAL, color: BLANC, fontFamily: 'inherit', fontSize: 14.5, fontWeight: 700,
  boxShadow: '0 10px 22px -8px rgba(47,158,144,0.5)',
};

/**
 * offre : { mode: 'interrupteur', essai } (sinon rien n'est rendu ici)
 * coche, onBasculer(bool), lang, maintenant (horloge injectable pour l'aperçu)
 * freeCompris : la carte Free porte la voie « Free + Sans ordinateur »
 */
export default function InterrupteurCloud({ offre, coche, onBasculer, lang = 'fr', maintenant, freeCompris = false }) {
  // L'horloge est figée à l'ouverture : la date de bascule affichée ne bouge
  // pas sous les yeux, et le rendu reste pur. `maintenant` = horloge de l'aperçu.
  const [horloge] = useState(() => Date.now());
  if (offre?.mode !== 'interrupteur') return null;
  const T = textesCloud(lang);
  const now = maintenant ?? horloge;
  return (
    <div data-cloud="interrupteur" style={{
      background: C.paper, borderRadius: 18, padding: '12px 14px 14px',
      border: coche ? `1.5px solid ${C.teal}` : `1px solid ${C.border}`,
      boxShadow: coche ? '0 10px 26px -18px rgba(27,110,98,0.55)' : 'none',
      transition: 'border-color .18s ease',
    }}>
      <button
        type="button"
        role="switch"
        aria-checked={coche}
        onClick={() => onBasculer?.(!coche)}
        style={{
          display: 'flex', alignItems: 'center', gap: 11, width: '100%', minHeight: 48,
          padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <Glyphe />
        <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, color: C.ink, letterSpacing: '-0.01em' }}>
          {T.libelleInterrupteur}
        </span>
        <Bascule coche={coche} />
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 6 }}>
        {offre.essai && <PastilleEssai T={T} />}
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: C.mute2 }}>
          {T.ceQueCaFait} {T.ebayDeja}
        </p>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, fontWeight: 600, color: C.mute2 }}>
          {freeCompris ? T.sAjouteFree : T.sAjoute}
          {offre.essai && !coche ? <> {T.carteDemandee(dateBascule(lang, now))}</> : null}
        </p>
      </div>

      {coche && (offre.essai
        ? <Frise etapes={etapesEssai(T, lang, now)} />
        : (
          <p data-zone="sans-essai" style={{ margin: '12px 0 0', padding: '12px 0 0', borderTop: `1px solid ${C.border}`, fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: C.ink }}>
            {T.sansEssai}
          </p>
        ))}
    </div>
  );
}

/**
 * La voie « Free + Sans ordinateur », posée DANS la carte Free quand
 * l'interrupteur est coché. Bouton dédié : `onCloudSeul` (jamais
 * onUpgrade('free'), qui partirait en paiement de formule). Sans geste d'hôte,
 * rien n'est rendu.
 * quotaFree : le nombre d'annonces du plan Free, LU dans coin_config
 * (quota_annonces_free) par l'hôte — jamais écrit ici.
 */
export function SectionFreeCloud({ offre, quotaFree, onCloudSeul, lang = 'fr', maintenant }) {
  const [horloge] = useState(() => Date.now());
  if (offre?.mode !== 'interrupteur' || typeof onCloudSeul !== 'function') return null;
  const T = textesCloud(lang);
  const n = Number(quotaFree);
  const quota = Number.isFinite(n) ? n : null;
  const etapes = T.freeCloudFrise(dateBascule(lang, maintenant ?? horloge), quota)
    .map((e, i) => (i === 2 ? { ...e, bascule: true } : e));
  return (
    <div data-cloud="free" style={{ marginTop: 2, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Glyphe taille={28} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>{T.freeCloudTitre}</span>
      </div>
      <p data-zone="quota-free" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.45, fontWeight: 700, color: C.ink }}>
        {T.freeCloudQuota(quota)}
      </p>
      {offre.essai
        ? <Frise etapes={etapes} zone="frise-free" />
        : <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: C.mute2 }}>{T.freeCloudSansEssai}</p>}
      <button type="button" onClick={onCloudSeul} style={{ ...styleBoutonPlein, marginTop: 12 }}>
        {offre.essai ? T.freeCloudCtaEssai : T.freeCloudCta}
      </button>
    </div>
  );
}

/** Une ligne à la place de l'interrupteur : option déjà active, ou en pause. */
export function LigneCloudModale({ offre, lang = 'fr' }) {
  if (offre?.mode !== 'deja_actif' && offre?.mode !== 'suspendu') return null;
  const T = textesCloud(lang);
  return (
    <div data-cloud="ligne" style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '10px 12px' }}>
      <Glyphe taille={30} />
      <span style={{ fontSize: 12.5, lineHeight: 1.45, fontWeight: 600, color: C.ink }}>
        {offre.mode === 'deja_actif' ? T.dejaActif : T.suspenduModale}
      </span>
    </div>
  );
}

/**
 * Le prix d'une carte quand l'option est cochée : « 12,99 € + 20 € ».
 * `cloud` = { essai } ; `sombre` = cartes Pro / Business (fond encre).
 * Hors option, la carte garde SON balisage d'origine (ConversionModal) —
 * ce composant n'est jamais rendu.
 */
export function PrixAvecCloud({ prix, cloud, sombre = false, taille = 22, lang = 'fr', encreClaire = C.ink }) {
  const T = textesCloud(lang);
  const encre = sombre ? C.paper : encreClaire;
  const sous = sombre ? 'rgba(246,245,241,0.78)' : C.mute2;
  return (
    <div data-cloud="prix" style={{ textAlign: 'right', minWidth: 0 }}>
      <div style={{ lineHeight: 1, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: taille, fontWeight: 700, letterSpacing: '-0.02em', color: encre }}>{prix}</span>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: sombre ? '#9BE8DC' : C.tealDeep }}> {T.prixOption}</span>
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: sous, marginTop: 3 }}>
        {cloud?.essai ? T.prixOptionSousEssai : T.prixOptionSous}
      </div>
    </div>
  );
}

/**
 * Ajouter l'option à la formule DÉJÀ payée (Premium, Pro, Business), sans
 * changer de palier. ⛔ Jamais par onUpgrade(palier actuel) : les hôtes
 * actuels lanceraient un SECOND abonnement. Rendu seulement si l'hôte fournit
 * `onAjouter` (aucun ne le fait tant que le paiement de l'option n'existe pas).
 */
export function CarteAjoutCloud({ offre, nomPalier, onAjouter, lang = 'fr', maintenant }) {
  const [horloge] = useState(() => Date.now());
  if (offre?.mode !== 'interrupteur' || typeof onAjouter !== 'function') return null;
  const T = textesCloud(lang);
  return (
    <div data-cloud="ajout" style={{ background: C.paper, border: `1.5px solid ${C.teal}`, borderRadius: 18, padding: '12px 14px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minHeight: 44 }}>
        <Glyphe />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, color: C.ink }}>{T.libelleInterrupteur}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.mute2, marginTop: 2 }}>{T.ajoutTitre(nomPalier)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 6 }}>
        {offre.essai && <PastilleEssai T={T} />}
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: C.mute2 }}>{T.ceQueCaFait}</p>
      </div>
      {offre.essai ? <Frise etapes={etapesEssai(T, lang, maintenant ?? horloge)} /> : (
        <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: C.ink }}>{T.aucunNote}</p>
      )}
      <button type="button" onClick={onAjouter} style={{ ...styleBoutonPlein, marginTop: 12 }}>
        {offre.essai ? T.ajoutCtaEssai : T.ajoutCta}
      </button>
    </div>
  );
}
