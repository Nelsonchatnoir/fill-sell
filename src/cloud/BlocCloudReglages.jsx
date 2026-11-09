// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › ABONNEMENT — LE BLOC « FILLSELL CLOUD » (04/10/2026, conception ; nom du 03/11)
// ═══════════════════════════════════════════════════════════════════════════
// Monté par reglages/SousPageAbonnement.jsx derrière cloudOfferVisible().
// L'état vient de cloudDuProfil (utils/palier.js), lu par useCloudProfil dans
// une requête À PART : lecture ratée = le bloc n'apparaît pas (jamais un état
// deviné, jamais un bouton qui ment).
//
// Décisions FINALES de Nico (04/10 soir) : l'option se prend seule sur un
// compte Free (quotas Free gardés) ou en plus d'une formule ; arrêter pendant
// l'essai = tout de suite, rien facturé ; une fois payée, elle tourne jusqu'à
// la fin de la période (« s'arrête le [date] ») ; résilier la formule ne
// l'arrête pas.
//
// Les états, et ce que chacun DIT :
//   · aucun          — ce que fait l'option ; « Essayer 7 jours gratuits »,
//                      carte demandée, rien prélevé avant le [date] (Free :
//                      « tu restes à N annonces par mois ») ;
//   · essai          — combien de jours, la DATE et l'HEURE de bascule, le
//                      montant, et « Arrêter le Cloud » ; un compte Free y lit
//                      UNE mention de Premium (jamais une fenêtre, jamais
//                      ailleurs) ;
//   · paye           — active, en plus de quelle formule (ou avec Free) ;
//                      arrêt demandé : « S'arrête le [date] » et « Garder
//                      l'option ». ⛔ Pas de prix : même règle que la formule
//                      (SousPageAbonnement), un tarif particulier ne se devine pas ;
//   · essai_termine  — terminé ou arrêté, rien n'a été facturé ; l'ajouter.
//   (· suspendu      — n'est plus rendu depuis CLOUD_EXIGE_UN_PALIER = false ;
//                      gardé tant que l'interrupteur existe dans palier.js.)
// « Arrêter » se confirme en deux temps, comme la résiliation : la phrase dit
// ce qui change (tout de suite, ou à la fin de la période) AVANT le geste.
// (07/11 soir, essai TestFlight de Nico) Cloud pris sur l'App Store ou Google Play (profiles.cloud_canal) : la
// confirmation dit OÙ l'arrêter et que FillSell le verra dès que la boutique l'aura confirmé ; son bouton ouvre les
// abonnements de la boutique (achatCloud.js, voieArretCloud). Jamais « tout de suite », jamais « rien n'est facturé »
// avant la confirmation de la boutique. Le geste reçoit le canal ({ canal }), jamais l'événement du clic.
//
// ⛔ Toute date vient de l'essai réel (essaiFin), de la période payée
//    (periodeFin / arretPrevuLe) ou, avant l'essai, de maintenant + 7 jours.
// ⛔ Les gestes viennent de l'hôte (`actions`) ; un geste absent = pas de
//    bouton. Aucun n'est inventé ici : arrêter, ajouter, essayer, reprendre
//    passent par le paiement, que ce bloc ne touche jamais.
import { useEffect, useRef, useState } from 'react';
import { Cloud } from 'lucide-react';
import { R } from '../reglages/theme';
import { Groupe, Carte, Bouton, Note } from '../reglages/ReglagesUI';
import { CLOUD_ESSAI_JOURS, nomDuPalier, palierDesDrapeaux } from '../utils/palier';
import { textesCloud } from './textes';
import { textesConnexion } from './textesConnexion';
import { dateLongue, heureDe, jourDEssai, finEssaiSiOnCommence } from './regles';
import { DEGRADE_TEAL } from './theme';
import { voieArretCloud, voieBoutique } from './achatCloud';
// (08/11, refus Google) Mobile : un bouton d'achat n'agit qu'une fois le prix de la boutique affiché.
import { prixPret } from '../lib/prixBoutique';

function Glyphe() {
  return (
    <span aria-hidden="true" style={{
      width: 36, height: 36, borderRadius: 12, flexShrink: 0, background: R.menthe, border: `1px solid ${R.mentheBord}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Cloud size={19} color={R.tealDeep} strokeWidth={2.1} />
    </span>
  );
}

// Point + mot, jamais une couleur seule (même vocabulaire que Réglages).
const TONS = {
  aucun: { point: R.chevron, encre: R.texteSecondaire },
  essai: { point: R.teal, encre: R.tealDeep },
  paye: { point: R.teal, encre: R.tealDeep },
  arret_prevu: { point: R.amber, encre: '#8A4B2C' },
  suspendu: { point: R.amber, encre: '#8A4B2C' },
  essai_termine: { point: R.chevron, encre: R.texteSecondaire },
};

function EtatPastille({ ton, children }) {
  const t = TONS[ton] ?? TONS.aucun;
  return (
    <span data-zone="etat" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 'auto' }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: t.point }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: t.encre }}>{children}</span>
    </span>
  );
}

// La jauge de l'essai : sept segments, un par jour — le jour en cours en teal.
function JaugeEssai({ jour, T }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div aria-hidden="true" style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: CLOUD_ESSAI_JOURS }, (_, i) => (
          <span key={i} style={{
            flex: 1, height: 6, borderRadius: 3,
            background: i < jour ? `linear-gradient(120deg,${R.teal},${R.tealDeep})` : R.border,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color: R.texteSecondaire }}>{T.essaiJauge(jour, CLOUD_ESSAI_JOURS)}</span>
    </div>
  );
}

const pTexte = { margin: 0, fontSize: 14, lineHeight: 1.5, color: R.ink };
const pNote = { margin: 0, fontSize: 13, lineHeight: 1.5, color: R.texteSecondaire };
// Le bouton plein de Réglages, sur la moitié PROFONDE du dégradé : le dégradé
// habituel ne donne que 3,27:1 au blanc (cf. cloud/theme.js, DEGRADE_TEAL).
const PLEIN = { width: '100%', background: DEGRADE_TEAL };

/**
 * cloud      : cloudDuProfil(…) — null pendant la lecture
 * lecture    : 'lecture' | 'ok' (l'hôte ne monte pas le bloc sur un échec)
 * nomPalier  : 'Premium' | 'Pro' | 'Business' | null (compte Free)
 * actions    : { essayer?, ajouter?, arreter?, reprendre?, meConnecter?, voirFormules? }
 * quotaFree  : annonces par mois du plan Free (quotas_etat) — jamais en dur
 * maintenant : l'instant de la lecture (date d'un essai pas encore ouvert)
 * arretDemande : compteur — quand il change, la confirmation d'arrêt s'ouvre
 *                (le lien « Arrêter aussi l'option » de la résiliation)
 * canal      : profiles.cloud_canal ('apple' | 'google' | 'stripe' | null) — qui facture, donc qui arrête
 * plateforme : 'ios' | 'android' | 'web' (Capacitor.getPlatform) — la feuille Apple ne s'ouvre que sur iPhone / iPad
 */
export default function BlocCloudReglages({
  lang = 'fr', cloud, lecture = 'ok', nomPalier = null, actions = {}, arretEnCours = false,
  quotaFree = null, maintenant, arretDemande = 0, refus = null, canal = null, plateforme = 'web',
}) {
  const T = textesCloud(lang);
  // (05/10) Essai refusé APRÈS coup (carte ou compte de plateforme déjà vus) : on le DIT.
  const Tc = textesConnexion(lang);
  const phraseRefus = refus === 'carte_deja_vue' ? Tc.refusCarte : refus === 'compte_plateforme_deja_vu' ? Tc.refusComptePlateforme : null;
  const [confirmer, setConfirmer] = useState(false);
  const [horloge] = useState(() => Date.now());
  // (07/11 soir) Le geste en cours (un seul à la fois) ; la boutique ouverte, en attente de sa confirmation.
  const [enCoursLocal, setEnCoursLocal] = useState(false);
  const [attenteBoutique, setAttenteBoutique] = useState(null);
  // (08/11, ordre de Nico) Les abonnements de la boutique n'ont pas pu s'ouvrir : le message (chemin exact) RESTE à
  // l'écran avec un second bouton qui réessaie — jamais un écran muet, jamais un toast qui disparaît seul.
  const [echecBoutique, setEchecBoutique] = useState(null);
  const voie = voieArretCloud(canal, plateforme);
  const enCours = arretEnCours || enCoursLocal;
  const lancerArret = async () => {
    if (enCours || typeof actions.arreter !== 'function') return;
    setEnCoursLocal(true);
    try {
      const r = await actions.arreter({ canal });
      if (r?.etat === 'boutique') { setAttenteBoutique(r.voie ?? voie); setEchecBoutique(null); setConfirmer(false); }
      else if (r?.etat === 'erreur' && voieBoutique(r?.voie ?? voie)) { setEchecBoutique({ voie: r?.voie ?? voie, message: r?.message ?? Tc.arretBoutiqueEchec(r?.voie ?? voie) }); setConfirmer(false); }
    } catch { /* l'hôte a déjà dit l'échec */ } finally {
      setEnCoursLocal(false);
    }
  };
  // (08/11, ordre de Nico) Cloud pris sur l'App Store (vu sur iPhone / iPad) ou Google Play : « Arrêter le Cloud » ouvre
  // DIRECTEMENT la feuille d'abonnements de la boutique — c'est elle qui demande la confirmation. Stripe (FillSell
  // arrête) et Apple vu ailleurs (rien à ouvrir ici) gardent la confirmation en deux temps qui dit ce qui change.
  const ouvreLaBoutique = voie === 'apple' || voie === 'google';
  // « Arrêter aussi l'option » (résiliation) : ouvre la confirmation, une fois
  // par demande — ajustement d'état pendant le rendu, motif React documenté.
  const [demandeVue, setDemandeVue] = useState(arretDemande);
  if (arretDemande !== demandeVue) {
    setDemandeVue(arretDemande);
    setConfirmer(true);
  }
  const arretRef = useRef(null);
  useEffect(() => {
    if (arretDemande > 0) arretRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [arretDemande]);

  if (lecture === 'lecture' || !cloud) {
    return (
      <Groupe intitule={T.groupe}>
        <Carte pad style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Glyphe />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: R.ink }}>{T.nom}</span>
          <span style={{ fontSize: 13, color: R.texteSecondaire }}>{T.etatLecture}</span>
        </Carte>
      </Groupe>
    );
  }

  const { etat } = cloud;
  const free = !nomPalier;
  const date = dateLongue(cloud.essaiFin, lang);
  const heure = heureDe(cloud.essaiFin, lang);
  const dateAvantEssai = dateLongue(finEssaiSiOnCommence(maintenant ?? horloge), lang);
  const arretPrevu = etat === 'paye' && cloud.arretPrevuLe ? dateLongue(cloud.arretPrevuLe, lang) : null;
  const ton = arretPrevu ? 'arret_prevu' : etat;
  const libelleEtat = arretPrevu ? T.etatArretPrevu(arretPrevu) : {
    aucun: T.etatAucun, essai: T.etatEssai, paye: T.etatPaye, suspendu: T.etatSuspendu,
    essai_termine: cloud.essaiArrete ? T.etatArrete : T.etatTermine,
  }[etat] ?? T.etatAucun;
  const peutArreter = (etat === 'essai' || (etat === 'paye' && !arretPrevu) || etat === 'suspendu') && typeof actions.arreter === 'function';
  const quotaLigne = free ? <p style={{ ...pTexte, fontWeight: 600 }}>{T.freeCloudQuota(quotaFree)}</p> : null;

  return (
    <Groupe intitule={T.groupe}>
      <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div data-cloud="reglages" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 6 }}>
            <Glyphe />
            {/* Le nom ne se coupe pas : une pastille longue (« S'arrête le … ») passe à la ligne. */}
            <strong style={{ flex: '1 0 auto', whiteSpace: 'nowrap', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: R.ink }}>{T.nom}</strong>
            <EtatPastille ton={ton}>{libelleEtat}</EtatPastille>
          </div>

          {etat === 'aucun' && (
            <>
              {/* (08/11, point C1) « FillSell Cloud — plus besoin d'ordinateur » */}
              <p data-cloud-accroche="1" style={{ ...pTexte, margin: 0, fontWeight: 700, color: R.ink }}>{T.accroche}</p>
              <p style={pTexte}>{T.ceQueCaFait}</p>
              {quotaLigne}
              {!cloud.essaiPris ? (
                <>
                  {actions.essayer && <Bouton ton="plein" onClick={actions.essayer} disabled={!prixPret('cloud')} style={PLEIN}>{T.aucunCtaEssai}</Bouton>}
                  <p style={pNote}>{T.aucunNoteEssai(dateAvantEssai)}</p>
                </>
              ) : (
                <>
                  {actions.ajouter && <Bouton ton="plein" onClick={actions.ajouter} disabled={!prixPret('cloud')} style={PLEIN}>{T.aucunCta}</Bouton>}
                  <p style={pNote}>{T.aucunNote}</p>
                </>
              )}
            </>
          )}

          {etat === 'essai' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span data-zone="reste" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: R.ink }}>{T.essaiReste(cloud.joursRestants)}</span>
                <p style={pTexte}>{T.essaiFin(date, heure, nomPalier)}</p>
              </div>
              <JaugeEssai jour={jourDEssai(cloud) ?? 1} T={T} />
              {/* Free en essai : UNE mention de Premium, ici et nulle part ailleurs. */}
              {!cloud.avecFormule && (
                <div data-zone="mention-premium" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '12px 14px 4px', borderRadius: 12, background: R.menthe, border: `1px solid ${R.mentheBord}` }}>
                  <p style={{ ...pTexte, fontSize: 13.5 }}>{T.mentionPremium(quotaFree)}</p>
                  {actions.voirFormules && (
                    <button type="button" onClick={actions.voirFormules} className="rg-focus" style={{
                      alignSelf: 'flex-start', minHeight: 44, padding: '0 2px', border: 'none', background: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: R.tealDeep, textDecoration: 'underline', textUnderlineOffset: 3,
                    }}>{T.voirPremium}</button>
                  )}
                </div>
              )}
            </>
          )}

          {etat === 'paye' && !arretPrevu && <p style={pTexte}>{T.payeTexte(nomPalier)}</p>}
          {etat === 'paye' && arretPrevu && (
            <>
              <p style={pTexte}>{T.arretPrevuTexte(arretPrevu)}</p>
              {actions.reprendre && <Bouton ton="creux" onClick={() => actions.reprendre({ canal })} style={{ width: '100%' }}>{T.garderOption}</Bouton>}
            </>
          )}

          {etat === 'suspendu' && (
            <>
              <p style={pTexte}>{T.suspenduTexte}</p>
              {actions.voirFormules && <Bouton ton="plein" onClick={actions.voirFormules} style={PLEIN}>{T.voirFormules}</Bouton>}
            </>
          )}

          {etat === 'essai_termine' && (
            <>
              <p style={pTexte}>{phraseRefus ?? (cloud.essaiArrete ? T.arreteTexte(date) : T.termineTexte(date))}</p>
              <p style={pNote}>{T.termineSuite}</p>
              {actions.ajouter && <Bouton ton="plein" onClick={actions.ajouter} disabled={!prixPret('cloud')} style={PLEIN}>{T.termineCta}</Bouton>}
            </>
          )}

          {(etat === 'essai' || etat === 'paye') && !arretPrevu && actions.meConnecter && (
            <Bouton ton="creux" onClick={actions.meConnecter} style={{ width: '100%' }}>{T.meConnecter}</Bouton>
          )}
        </div>
      </Carte>

      {/* « Arrêter le Cloud » — visible, jamais caché sous un menu, et confirmé
          en deux temps : la phrase dit ce qui change AVANT le geste. */}
      {peutArreter && (!confirmer ? (
        <Bouton ton="danger-creux" onClick={ouvreLaBoutique ? lancerArret : () => setConfirmer(true)} enCours={ouvreLaBoutique && enCours} style={{ width: '100%', minHeight: 50 }}>{T.arreter}</Bouton>
      ) : (
        <div ref={arretRef}>
          <ConfirmationArretCloud lang={lang} cloud={cloud} nomPalier={nomPalier} voie={voie} enCours={enCours} onArreter={lancerArret} onAnnuler={() => setConfirmer(false)} />
        </div>
      ))}
      {/* Les abonnements de la boutique ne se sont pas ouverts : le chemin exact, et un second bouton qui réessaie. */}
      {echecBoutique && peutArreter && !confirmer && (
        <div data-cloud="arret-echec" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Note>{echecBoutique.message}</Note>
          <Bouton ton="creux" onClick={lancerArret} enCours={enCours} style={{ width: '100%' }}>{Tc.reessayer}</Bouton>
        </div>
      )}
      {/* La boutique ouverte : on attend SA confirmation (webhook) — rien n'a changé chez nous. */}
      {attenteBoutique && !echecBoutique && peutArreter && !confirmer && <Note>{T.arretBoutiqueAttente(attenteBoutique)}</Note>}
      {/* La note se tait pendant la confirmation, qui dit déjà la même chose. */}
      {etat === 'essai' && !confirmer && <Note>{T.essaiNote(nomPalier)}</Note>}
    </Groupe>
  );
}

/**
 * (07/11 soir) La confirmation « Arrêter FillSell Cloud ? » — à part pour être rendue et prouvée seule
 * (scripts/cloud-ecrans-selftest.mjs, 7c ter). `voie` : voieArretCloud(canal, plateforme) (cloud/achatCloud.js).
 *   · boutique (Apple, Google) : où l'arrêter, et que FillSell le verra dès qu'elle l'aura confirmé ; le bouton ouvre ses
 *     abonnements (Apple vu ailleurs que sur iPhone / iPad : pas de bouton, la phrase dit où) ;
 *   · Stripe (ou canal inconnu) : la phrase d'avant, mot pour mot — c'est FillSell qui arrête, le serveur confirme.
 */
export function ConfirmationArretCloud({ lang = 'fr', cloud, nomPalier = null, voie = 'serveur', enCours = false, onArreter, onAnnuler }) {
  const T = textesCloud(lang);
  const boutique = voieBoutique(voie);
  const etat = cloud?.etat;
  return (
    <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div data-cloud="arret" data-voie={voie}>
        <div style={{ fontSize: 15, fontWeight: 700, color: R.ink }}>{T.arreterTitre}</div>
        <p style={{ ...pTexte, marginTop: 4 }}>
          {boutique ? T.arreterBoutique(voie)
            : etat === 'essai' ? T.arreterEssai(nomPalier) : T.arreterPaye(cloud?.periodeFin ? dateLongue(cloud.periodeFin, lang) : null)}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* Apple vu ailleurs que sur iPhone / iPad : rien à ouvrir ici, la phrase dit où. */}
        {voie !== 'apple_ailleurs' && (
          <Bouton ton="danger-plein" onClick={onArreter} enCours={enCours}>{enCours ? '…' : boutique ? T.arreterBoutiqueCta(voie) : T.arreterConfirmer}</Bouton>
        )}
        <Bouton ton="creux" onClick={onAnnuler} disabled={enCours}>{voie === 'apple_ailleurs' ? T.arreterBoutiqueFermer : T.arreterAnnuler}</Bouton>
      </div>
    </Carte>
  );
}

const nomPalierDe = (c) => nomDuPalier(palierDesDrapeaux({ isPremium: c?.isPremium, isPro: c?.isPro, isBusiness: c?.isBusiness }));

/**
 * Le bloc BRANCHÉ, ce que SousPageAbonnement monte. `lecture` = useCloudReglages(c)
 * (cloud/useCloudProfil.js).
 * `actions` : les gestes que l'hôte sait faire (cf. en-tête).
 */
export function BlocCloudReglagesLu({ c, lecture, actions, arretDemande = 0 }) {
  if (!lecture || lecture.etat === 'echec' || lecture.etat === 'inactif') return null;
  const nomPalier = nomPalierDe(c);
  const plafond = Number(c?.quotas?.annonces?.plafond);
  return (
    <BlocCloudReglages
      lang={c.lang}
      cloud={lecture.cloud}
      lecture={lecture.etat}
      nomPalier={nomPalier}
      actions={actions}
      quotaFree={!nomPalier && Number.isFinite(plafond) ? plafond : null}
      maintenant={lecture.luLe ?? undefined}
      refus={lecture.profil?.cloud_essai_refus ?? null}
      arretDemande={arretDemande}
      canal={lecture.profil?.cloud_canal ?? null}
      plateforme={c?.plateforme ?? 'web'}
    />
  );
}

/**
 * Dans la confirmation « Se désabonner » de la FORMULE : l'option, elle,
 * continue (le compte repasse en Free + FillSell Cloud) — dit AU MOMENT de
 * résilier, avec le lien pour l'arrêter aussi. Seulement si l'option tourne
 * et qu'aucun arrêt n'est déjà prévu ; drapeau baissé ou lecture incertaine :
 * rien, et la confirmation reste mot pour mot.
 */
export function MentionCloudResiliation({ lang = 'fr', lecture, onArreterOption }) {
  const cloud = lecture?.etat === 'ok' ? lecture.cloud : null;
  if (!cloud || !cloud.actif || cloud.arretPrevuLe) return null;
  const T = textesCloud(lang);
  return (
    <div data-cloud="resiliation" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '12px 14px 4px', borderRadius: 12, background: R.menthe, border: `1px solid ${R.mentheBord}` }}>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: R.ink }}>{T.resiliationCloud}</p>
      {typeof onArreterOption === 'function' && (
        <button type="button" onClick={onArreterOption} className="rg-focus" style={{
          alignSelf: 'flex-start', minHeight: 44, padding: '0 2px', border: 'none', background: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: R.negatifTexte, textDecoration: 'underline', textUnderlineOffset: 3,
        }}>{T.resiliationCloudLien}</button>
      )}
    </div>
  );
}
