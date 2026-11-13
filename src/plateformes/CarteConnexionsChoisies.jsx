// ═══════════════════════════════════════════════════════════════════════════
// TABLEAU — « TES PLATEFORMES À CONNECTER » (13/11/2026, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// ff1f879f a choisi Vinted à l'inscription, n'y était pas connecté dans son Chrome, et rien ne le lui a dit de toute la
// nuit. Dès que l'extension est vue, chaque plateforme CHOISIE pas vue connectée a ici sa ligne : sa phrase et son
// geste (./connexionChoisie.js, ./GesteConnexion.jsx). Avant l'extension, la carte d'installation existante suffit
// (aucune ligne ici). Client FillSell Cloud : ses plateformes du Cloud sont dites par « Connecte tes comptes pour
// démarrer FillSell Cloud » (App.jsx) — ici seulement le reste (eBay à relier). Tout est connecté : rien.
// « Je ne vends pas sur X » (réversible, plateforme_ecarter) : la plateforme sort du chemin.
import { useState } from 'react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { UI } from '../components/ui';
import { ecarterPlateforme } from '../utils/veritePlateformes';
import { PLATEFORMES_CLOUD } from '../cloud/voieCloud';
import { useConnexionsChoisies } from './useConnexionsChoisies';
import { textesConnexionChoisie } from './connexionChoisie';
import GesteConnexion from './GesteConnexion';

export default function CarteConnexionsChoisies({ userId, lang = 'fr', plateformesFermees = [] }) {
  const c = useConnexionsChoisies({ userId, lang, actif: Boolean(userId), plateformesFermees });
  const [ecartEnCours, setEcartEnCours] = useState(null);
  const T = textesConnexionChoisie(lang);
  const lignes = c.clientCloud ? c.lignes.filter((l) => !PLATEFORMES_CLOUD.includes(l.p)) : c.lignes;
  if (!userId || !c.lu || !lignes.length) return null;

  const ecarter = async (p) => {
    setEcartEnCours(p);
    try { await ecarterPlateforme(p, true); } catch { /* la ligne reste : rien n'a changé */ }
    finally { setEcartEnCours(null); c.relire(); }
  };

  return (
    <section data-connexions-choisies aria-label={T.carteTitre}
      style={{ background: UI.card, borderRadius: 16, border: `1px solid ${UI.border}`, boxShadow: '0 1px 4px rgba(16,32,27,0.05)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontSize: 15, lineHeight: '20px', fontWeight: 700, color: UI.ink }}>{T.carteTitre}</div>
        <div style={{ marginTop: 2, fontSize: 13, lineHeight: '18px', fontWeight: 500, color: UI.mute2 }}>{T.carteSous(lignes.length)}</div>
      </div>
      {lignes.map((l) => (
        <div key={l.p} data-connexion-choisie={l.p} data-etat={l.etat}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: `1px solid ${UI.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PlatformLogo platform={l.p} size={22} />
            <span style={{ fontSize: 14, lineHeight: '20px', fontWeight: 700, color: UI.ink }}>{l.titre}</span>
          </div>
          <span style={{ fontSize: 13, lineHeight: '19px', fontWeight: 500, color: UI.mute2 }}>{l.texte}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <GesteConnexion ligne={l} userId={userId} lang={lang} onOuverte={c.relire} origine="carte_tableau_connexions" />
            <button type="button" disabled={ecartEnCours === l.p} onClick={() => ecarter(l.p)}
              style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 12.5, color: UI.mute2, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer', opacity: ecartEnCours === l.p ? 0.5 : 1 }}>
              {T.jeNeVendsPas(l.nom)}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
