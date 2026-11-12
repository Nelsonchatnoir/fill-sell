// ═══════════════════════════════════════════════════════════════════════════
// LES FORMULES AVEC CLOUD À L'ÉCRAN (11/11/2026, textes validés par Nico) — l'interrupteur et les trois cartes
// ═══════════════════════════════════════════════════════════════════════════
// UNE source pour la fenêtre d'offres (ConversionModal, position « Avec Cloud ») et l'étape « Choisis ta formule » du
// parcours d'entrée. Les RÈGLES (quelles cartes, quel bouton, l'essai) sont dans cloud/formulesCloud.js (pures,
// testées) ; ce fichier ne fait que les dessiner.
//   · « Sans Cloud | Avec Cloud » en haut ; Pro + Cloud porte « Notre conseil » ;
//   · sous chaque prix « Le Cloud pour 22 € de plus » (20 € Pro et Business) — un fait, jamais un rabais affiché ;
//   · ⛔ Business + Cloud : ni pastille, ni « Essayer », ni « 0 € aujourd'hui » — « Passer à Business + Cloud » ;
//   · le prix du CANAL (web : Stripe ; iPhone / Android : la boutique, « … » et bouton inactif tant qu'il charge) ;
//   · serveur plein : « Complet pour le moment » et la liste d'attente (BlocCompletCloud), aucun bouton d'achat.
// ⛔ Aucun paiement ici : `onChoisir(carte)` remonte à l'hôte, qui passe par cloud/achatFormuleCloud.js.
import { Cloud } from 'lucide-react';
import { C, MENTHE, BLANC, DEGRADE_TEAL } from './theme';
import { textesFormules, NOMS_FORMULES, NOMS_PALIERS_SEULS } from './textesFormules';
import { nomBoutique } from './formulesCloud';
import { BlocCompletCloud } from './InterrupteurCloud';
import { prixOuChargement, prixPret, supplementAffiche, zeroAffiche } from '../lib/prixBoutique';
import { mentionFormuleCloud } from '../utils/mentionsAbonnement';

const ENCRE_SOMBRE = 'rgba(246,245,241,0.78)';

/** L'interrupteur « Sans Cloud | Avec Cloud » : deux boutons, 44 px de haut, l'état lu par un lecteur d'écran. */
export function BasculeCloud({ vue, onChange, lang = 'fr' }) {
  const T = textesFormules(lang);
  const bouton = (v, libelle) => {
    const actif = vue === v;
    return (
      <button key={v} type="button" aria-pressed={actif} data-formules-vue={v} onClick={() => { if (!actif) onChange?.(v); }} style={{
        flex: 1, minHeight: 44, border: 'none', borderRadius: 999, cursor: actif ? 'default' : 'pointer', fontFamily: 'inherit',
        fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        background: actif ? (v === 'avec' ? DEGRADE_TEAL : C.ink) : 'transparent', color: actif ? BLANC : C.mute2,
        boxShadow: actif ? '0 6px 16px -8px rgba(16,32,27,0.55)' : 'none', transition: 'background .18s ease, color .18s ease',
      }}>
        {v === 'avec' && <Cloud size={15} strokeWidth={2.4} aria-hidden="true" />}
        {libelle}
      </button>
    );
  };
  return (
    <div role="group" aria-label={T.basculeEtiquette} data-formules-bascule="" style={{
      display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: C.paper, border: `1px solid ${C.border}`, marginBottom: 14,
    }}>
      {bouton('sans', T.sansCloud)}
      {bouton('avec', T.avecCloud)}
    </div>
  );
}

const STYLES_CARTE = {
  premium_cloud: { fond: C.paper, bord: `1.5px solid ${C.teal}`, ombre: '0 12px 30px -16px rgba(27,110,98,0.4)', sombre: false,
    bouton: { background: DEGRADE_TEAL, color: BLANC } },
  pro_cloud: { fond: `radial-gradient(130% 120% at 100% 0%, rgba(232,149,109,0.28), transparent 58%), ${C.ink}`, bord: '1.5px solid rgba(214,178,96,0.55)',
    ombre: '0 14px 34px -14px rgba(16,32,27,0.5)', sombre: true, bouton: { background: `linear-gradient(120deg,${C.amber},#F2B48C)`, color: C.ink } },
  business_cloud: { fond: 'radial-gradient(140% 110% at 0% 0%, rgba(155,232,220,0.16), transparent 55%), radial-gradient(130% 120% at 100% 100%, rgba(242,201,138,0.14), transparent 55%), #060B09',
    bord: '1.5px solid rgba(174,233,223,0.5)', ombre: '0 16px 40px -14px rgba(0,0,0,0.65)', sombre: true,
    bouton: { background: 'linear-gradient(120deg,#F4FFFD,#9BE8DC 55%,#F2C98A)', color: '#060B09' } },
};

/**
 * Une carte « Avec Cloud ». `carte` : un élément de cartesFormulesCloud (cloud/formulesCloud.js).
 * palierIci : le palier du compte ; echeance / finEssai : dates déjà écrites (Paris) ; canalApp / canalAbonnement : les
 * canaux ; corps(palier, sombre) : ce que la formule comprend (tuiles et lignes de la feuille des offres) ou null.
 */
export function CarteFormuleCloud({ carte, lang = 'fr', palierIci = 'gratuit', echeance = null, finEssai = null, canalApp = 'stripe', canalAbonnement = null, venteFermee = false, onChoisir, corps = null }) {
  const T = textesFormules(lang);
  const f = carte.formule;
  const s = STYLES_CARTE[f];
  const nom = NOMS_FORMULES[f];
  const prix = prixOuChargement(f, lang);
  const sup = supplementAffiche(f, lang);
  const encre = s.sombre ? C.paper : C.ink;
  const sous = s.sombre ? ENCRE_SOMBRE : C.mute2;
  const pret = prixPret(f) && !carte.enLecture;
  const nomPalierIci = NOMS_PALIERS_SEULS[palierIci] ?? null;
  const canalMentions = canalApp === 'apple' ? 'ios' : canalApp === 'google' ? 'android' : 'web';
  const libelleCta = carte.cta === 'essai' ? T.ctaEssai
    : carte.cta === 'essai_abonne' ? T.ctaEssaiAbonne
      : carte.cta === 'ajouter' ? T.ctaAjouter
        : T.ctaPasser(nom);
  const note = carte.note === 'prorata' ? T.prorata(echeance)
    : carte.note === 'note_essai' ? T.noteEssai(nomPalierIci ?? '', nom, finEssai ?? '', echeance ?? '')
      : carte.note === 'boutique' ? T.boutique(nomBoutique(carte.achetable ? canalApp : canalAbonnement) ?? 'App Store')
        : carte.note === 'carte_sur_mobile' ? T.carteSurMobile : null;
  return (
    <section data-formule-cloud={f} data-cta={carte.cta ?? ''} aria-label={nom} style={{
      position: 'relative', background: s.fond, border: s.bord, borderRadius: 22, padding: '18px 18px 16px', boxShadow: s.ombre,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {carte.misEnAvant && (
        <span data-formule-conseil="" style={{
          position: 'absolute', top: -11, right: 16, padding: '4px 11px', borderRadius: 999, background: DEGRADE_TEAL, color: BLANC,
          fontSize: 11, fontWeight: 700, boxShadow: '0 6px 14px -6px rgba(27,110,98,0.7)',
        }}>{T.notreConseil}</span>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: encre }}>
            <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 9, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: s.sombre ? 'rgba(155,232,220,0.14)' : MENTHE }}>
              <Cloud size={15} strokeWidth={2.3} color={s.sombre ? '#9BE8DC' : C.tealDeep} />
            </span>
            {nom}
          </span>
          {carte.pastille && (
            <span data-formule-pastille="" style={{
              alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 999, padding: '4px 9px',
              color: s.sombre ? '#10201B' : C.tealDeep, background: s.sombre ? '#9BE8DC' : MENTHE,
            }}>{T.pastilleEssai}</span>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ whiteSpace: 'nowrap', lineHeight: 1 }}>
            <span data-formule-prix="" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: encre }}>{prix}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: sous }}>{T.parMois}</span>
          </div>
          {sup && <div data-formule-supplement="" style={{ fontSize: 11, fontWeight: 700, color: s.sombre ? '#9BE8DC' : C.tealDeep, marginTop: 4 }}>{T.supplement(sup)}</div>}
        </div>
      </div>

      {(carte.maFormule || carte.actuelle) && (
        <p data-formule-ma="" style={{ margin: 0, fontSize: 12.5, fontWeight: 700, lineHeight: 1.45, borderRadius: 12, padding: '8px 10px',
          color: s.sombre ? C.paper : C.tealDeep, background: s.sombre ? 'rgba(255,255,255,0.08)' : MENTHE }}>
          {carte.actuelle ? T.taFormule(nom) : T.taFormuleAvec(nomPalierIci ?? '', prix)}
        </p>
      )}

      {typeof corps === 'function' ? corps(carte.palier, s.sombre) : null}

      {carte.achetable && !venteFermee && (
        <>
          <button type="button" data-formule-cta={carte.cta} disabled={!pret} aria-disabled={!pret}
            onClick={() => { if (pret) onChoisir?.(carte); }}
            style={{
              width: '100%', minHeight: 50, border: 'none', borderRadius: 14, cursor: pret ? 'pointer' : 'default', fontFamily: 'inherit',
              fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', opacity: pret ? 1 : 0.55, ...s.bouton,
            }}>
            {carte.enLecture ? '…' : libelleCta}
          </button>
          <p data-formule-ligne-prix={carte.lignePrix} style={{ margin: 0, textAlign: 'center', fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: sous }}>
            {carte.lignePrix === 'essai' ? T.lignePrixEssai(prix, zeroAffiche(f, lang)) : T.lignePrix(prix)}
          </p>
        </>
      )}
      {note && <p data-formule-note={carte.note} style={{ margin: 0, fontSize: 12, fontWeight: 600, lineHeight: 1.45, color: sous }}>{note}</p>}
      {carte.achetable && !venteFermee && (
        <p data-formule-mention="" style={{ margin: 0, fontSize: 10.5, lineHeight: 1.45, color: s.sombre ? 'rgba(246,245,241,0.6)' : '#6B7280' }}>
          {mentionFormuleCloud({ canal: canalMentions, lang, prix, essai: carte.essai, business: f === 'business_cloud' })}
        </p>
      )}
    </section>
  );
}

/**
 * La position « Avec Cloud » : le mot du Founder, la liste d'attente si le serveur est plein, les cartes, la ligne commune.
 *   modele  : cartesFormulesCloud(…) ; vente : useDisponibiliteCloud(…) ({ dispo, inscrire }) ou null.
 */
export default function OffresAvecCloud({ modele, lang = 'fr', vente = null, venteFermee = false, onChoisir, corps = null, ...autres }) {
  const T = textesFormules(lang);
  return (
    <div data-formules-cloud="" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {modele.founder && (
        <p data-formule-founder="" style={{ margin: 0, fontSize: 12.5, fontWeight: 700, lineHeight: 1.45, color: '#8A4B2C', background: '#FDEEE6', border: `1px solid ${C.amber}`, borderRadius: 14, padding: '10px 12px' }}>
          {T.founder}
        </p>
      )}
      {venteFermee && vente && <BlocCompletCloud dispo={vente.dispo} onInscrire={vente.inscrire} lang={lang} />}
      {modele.cartes.map((carte) => (
        <CarteFormuleCloud key={carte.formule} carte={carte} lang={lang} venteFermee={venteFermee} onChoisir={onChoisir} corps={corps} {...autres} />
      ))}
      <p data-formules-commune="" style={{ margin: '2px 2px 0', fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: C.mute2, textAlign: 'center' }}>{T.ligneCommune}</p>
    </div>
  );
}
