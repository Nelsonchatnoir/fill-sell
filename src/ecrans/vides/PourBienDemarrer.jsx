// ═══════════════════════════════════════════════════════════════════════════
// « POUR BIEN DÉMARRER » — EN TÊTE DU TABLEAU VIDE (18/11/2026, lot T1 de Nico, maquette 16 validée)
// ═══════════════════════════════════════════════════════════════════════════
// Quatre marches, l'anneau de progression ; chaque marche mène au geste qui existe déjà (aucun geste neuf) :
//   2. « Choisir comment publier » (FillSell Cloud ou ton ordinateur) → le Stock, où vit la carte Cloud et le lien de
//      l'extension ; faite pour un client Cloud ou une extension déjà vue ;
//   3. « Synchroniser tes annonces » → le Stock (sa carte de synchronisation) — le même appel que « Synchroniser mes
//      boutiques » (onImport) ;
//   4. « Publier ta première annonce » → Lens (onOpenLens).
// S'AJOUTE au-dessus du Tableau vide d'avant : rien n'en est retiré. Transform/opacity seulement.
import { Check, ChevronRight } from 'lucide-react';
import { UI } from '../../components/ui';

const ENCRE2 = '#5C6560';
const CSS = `
@keyframes pbdEntree{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes pbdAnneau{from{stroke-dashoffset:var(--pbd-plein)}to{stroke-dashoffset:var(--pbd-fait)}}
.pbd{animation:pbdEntree .45s cubic-bezier(.22,.61,.36,1) both}
.pbd-l{transition:background .15s ease}
.pbd-l:active{background:#F6F5F1}
.pbd-l:focus-visible{outline:2px solid ${UI.tealDeep};outline-offset:-2px;border-radius:12px}
@media (prefers-reduced-motion:reduce){.pbd{animation:none}}
`;

export default function PourBienDemarrer({ lang = 'fr', voieChoisie = false, onStock, onLens }) {
  const fr = lang !== 'en';
  const marches = [
    { cle: 'compte', fait: true, titre: fr ? 'Compte créé' : 'Account created' },
    { cle: 'voie', fait: voieChoisie, titre: fr ? 'Choisir comment publier' : 'Choose how to post', sous: fr ? 'FillSell Cloud, ou ton ordinateur' : 'FillSell Cloud, or your computer', onClick: onStock },
    { cle: 'synchro', fait: false, titre: fr ? 'Synchroniser tes annonces' : 'Sync your listings', sous: fr ? 'Tes annonces en ligne deviennent ton stock' : 'Your online listings become your stock', onClick: onStock },
    { cle: 'publier', fait: false, titre: fr ? 'Publier ta première annonce' : 'Post your first listing', sous: fr ? 'Une photo suffit, l\'IA remplit la fiche' : 'One photo is enough, AI fills the card', onClick: onLens },
  ];
  const faites = marches.filter((m) => m.fait).length;
  const R = 19; const tour = 2 * Math.PI * R;
  const suivante = marches.find((m) => !m.fait)?.cle;
  return (
    <section className="pbd" data-pour-bien-demarrer="" style={{ background: '#FFFFFF', border: `1px solid ${UI.border}`, borderRadius: 24, padding: '14px 16px 6px', marginBottom: 14, fontFamily: "'Space Grotesk',sans-serif", color: UI.ink }}>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
          <circle cx="23" cy="23" r={R} fill="none" stroke="#EFEDE5" strokeWidth="5" />
          <circle cx="23" cy="23" r={R} fill="none" stroke={UI.teal} strokeWidth="5" strokeLinecap="round" transform="rotate(-90 23 23)"
            strokeDasharray={tour} strokeDashoffset={tour * (1 - faites / marches.length)}
            style={{ '--pbd-plein': tour, '--pbd-fait': tour * (1 - faites / marches.length), animation: 'pbdAnneau .9s cubic-bezier(.22,.61,.36,1) both .2s' }} />
          <text x="23" y="27.5" textAnchor="middle" fontFamily="Space Grotesk, sans-serif" fontSize="12" fontWeight="700" fill={UI.ink}>{faites}/{marches.length}</text>
        </svg>
        <div>
          <b style={{ display: 'block', fontSize: 16 }}>{fr ? 'Pour bien démarrer' : 'Getting started'}</b>
          <span style={{ display: 'block', fontSize: 12.5, color: ENCRE2 }}>{fr ? `${faites} étape${faites > 1 ? 's' : ''} sur ${marches.length}` : `${faites} of ${marches.length} steps`}</span>
        </div>
      </div>
      {marches.map((m) => {
        const Balise = m.fait || !m.onClick ? 'div' : 'button';
        return (
          <Balise key={m.cle} {...(Balise === 'button' ? { type: 'button', onClick: m.onClick, className: 'pbd-l' } : {})} data-marche={m.cle} style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 48, padding: '10px 0', textAlign: 'left',
            border: 'none', borderTop: '1px solid #EFEDE5', background: 'none', fontFamily: 'inherit', color: m.fait ? ENCRE2 : UI.ink,
            cursor: Balise === 'button' ? 'pointer' : 'default',
          }}>
            <span aria-hidden="true" style={{
              width: 24, height: 24, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center',
              background: m.fait ? UI.teal : 'transparent', border: m.fait ? 'none' : `2px solid ${m.cle === suivante ? UI.teal : '#DCD6C6'}`, color: '#FFFFFF',
            }}>{m.fait ? <Check size={13} strokeWidth={3.2} /> : null}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, textDecoration: m.fait ? 'line-through' : 'none', textDecorationColor: 'rgba(92,101,96,.5)' }}>{m.titre}</span>
              {m.sous && !m.fait && <span style={{ display: 'block', fontSize: 12, color: ENCRE2, marginTop: 1 }}>{m.sous}</span>}
            </span>
            {Balise === 'button' && <ChevronRight size={18} color={UI.mute} aria-hidden="true" />}
          </Balise>
        );
      })}
    </section>
  );
}
