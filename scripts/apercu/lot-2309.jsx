// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — lot « zéro régression » du 23/09 : les écrans APRÈS, sans session
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Il monte les composants RÉELS avec des
// objets en dur (les jobs de Louis du 23/09, tels qu'en base) :
//   1. la carte du stock — le mur Opla SOUS la photo, dans la bande .gmur,
//      avec le vrai CSS du stock (STOCK_CSS lu dans StockTab.jsx) et le vrai
//      BoutonMeConnecter ; la session fermée (« Me connecter ») à côté ;
//   2. le bloc général avec les versions du texte (« Reprendre le texte de :
//      Beebs · 19/09 · Leboncoin · 23/09 · Ma fiche ») ;
//   3. les états de publication (chantier 7) : les phrases réelles de
//      etatsPublication.js sur les jobs réels de Louis — la mise en page des
//      puces est SIMULÉE (StepPublish n'est pas exportable), les textes non.
//
// Pourquoi il existe : ouvrir ces écrans dans l'app demande une session, et une
// session fillsell.app en automatisation est interdite (CLAUDE.md). Ici, aucun
// compte, aucune écriture.
//
//     node scripts/apercu/capture-lot-2309.mjs
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import BlocValeursGenerales from '../../src/components/BlocValeursGenerales.jsx';
import BoutonMeConnecter, { MESSAGE_AUTORISATION_OPLA } from '../../src/components/BoutonMeConnecter.jsx';
import { useTranslation } from '../../src/i18n/useTranslation.js';
import { MOTIFS } from '../../src/utils/connexionPlateformes.js';
import { buildCardCss } from '../../src/utils/shared.js';
import { attentesParPlateforme, phraseEtat, messageRefusPublication } from '../../src/utils/etatsPublication.js';
import stockSource from '../../src/tabs/StockTab.jsx?raw';

// Le CSS RÉEL des cartes du stock, lu dans le fichier — pas une copie.
const DEBUT = "const STOCK_CSS = buildCardCss('stock-v2') + `";
const corps = stockSource.slice(stockSource.indexOf(DEBUT) + DEBUT.length);
const STOCK_CSS = buildCardCss('stock-v2') + corps.slice(0, corps.indexOf('`;'));

const T = {
  canvas: '#EDEAE0', paper: '#F6F5F1', ink: '#10201B', teal: '#2F9E90',
  tealDeep: '#1B6E62', mute: '#8A8578', mute2: '#6B7A75', border: '#E7E3D8',
  card: '#FFFFFF', chip: '#F2F0E9',
};

// Les trois jobs du kit « Rangement Blanc et Noir » de Louis (23/09), tels qu'en base.
const JOBS_LOUIS = [
  { id: '616080af', platform: 'beebs', action: 'publish', status: 'published', created_at: '2026-09-23T17:23:03Z', error: null, platform_fields: {} },
  { id: 'd1cda4e0', platform: 'leboncoin', action: 'publish', status: 'needs_user', created_at: '2026-09-23T18:06:56Z',
    error: 'Leboncoin demande : Produit (« Veuillez choisir un type de produit »).',
    platform_fields: { needsUserField: { field_key: 'furniture_type', field_label: 'Produit', input_type: 'dropdown' } } },
  { id: '2fbd4363', platform: 'opla', action: 'publish', status: 'needs_user', created_at: '2026-09-23T18:06:56Z',
    error: MESSAGE_AUTORISATION_OPLA, platform_fields: { needs_user_source: 'opla_acces' } },
];

const TITRE_FICHE = 'Rangement Blanc et Noir 12 pour 12 pots et 12 couvercles pour yaourtière Multidélices';
const DESC_FICHE = "Rangement pratique pour yaourtière Multidélices de chez SEB 🥣\n📦 Capacité : 12 pots + 12 couvercles\n⚠️ Pots et couvercles non fournis";
const VERSIONS = [
  { platform: 'beebs', titre: 'Rangement blanc et noir pour 12 pots yaourtière Multidélices SEB', description: DESC_FICHE + '\n✅ État : neuf', date: '2026-09-19T09:12:00Z', enLigne: true, url: 'https://www.beebs.app/x' },
  { platform: 'leboncoin', titre: 'Rangement Blanc et Noir pour 12 pots et 12 couvercles — yaourtière Multidélices', description: "Rangement pratique pour yaourtière Multidélices (SEB). 12 pots + 12 couvercles, non fournis.", date: '2026-09-23T07:40:00Z', enLigne: true, url: 'https://www.leboncoin.fr/x' },
];

const Section = ({ titre, enfants, children }) => (
  <section style={{ marginBottom: 26 }}>
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute, margin: '0 0 8px' }}>{titre}</div>
    {enfants ?? children}
  </section>
);

function Carte({ titre, prix, mur }) {
  // Un GCARD réel : photo (bloc de couleur : aucun réseau), pastille et quantité
  // SUR la photo comme dans le stock, puis le corps avec la bande .gmur.
  return (
    <div className="gcard" role="button" tabIndex={0} data-mur={mur?.motif} style={{ cursor: 'default' }}>
      <div className="gphoto">
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#B7C3BF,#6B7A75)' }} />
        <div className="gstatus"><i className="dot" style={{ width: 6, height: 6, borderRadius: 3, background: '#E8956D', display: 'inline-block' }} />À compléter</div>
        <div className="gqty">×3</div>
      </div>
      <div className="gbody">
        {mur && (
          <div className="gmur">
            <BoutonMeConnecter userId="apercu" platform={mur.platform} motif={mur.motif} lang="fr" variante="ligne" />
          </div>
        )}
        <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{prix}</div>
        <div style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.3, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{titre}</div>
      </div>
    </div>
  );
}

function Apercu() {
  const { t } = useTranslation('fr');
  const [titre, setTitre] = useState(TITRE_FICHE);
  const [description, setDescription] = useState(DESC_FICHE);
  const attentes = attentesParPlateforme(JOBS_LOUIS);
  const refus = messageRefusPublication(['leboncoin', 'opla'], { publiees: new Set(), enFile: new Set(), attentes, lang: 'fr' });
  const enLigne = messageRefusPublication(['beebs'], { publiees: new Set(['beebs']), enFile: new Set(), attentes: {}, lang: 'fr' });

  return (
    <div className="stock-v2" style={{ background: T.canvas, minHeight: '100vh', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <style>{STOCK_CSS}</style>
      <div style={{ maxWidth: 400, margin: '0 auto' }}>
        <Section titre="1 · Carte du stock — le mur SOUS la photo (chantier 6)">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} data-cartes>
            <Carte titre="Rangement Blanc et Noir 12 pour 12 pots et 12 couvercles" prix="10,00 €" mur={{ platform: 'opla', motif: MOTIFS.AUTORISER_OPLA }} />
            <Carte titre="Insert / Rangement Jaune Zombicide 2ᵉ Édition" prix="12,00 €" mur={{ platform: 'opla', motif: MOTIFS.CONNEXION }} />
          </div>
          <div style={{ fontSize: 11, color: T.mute2, marginTop: 8, lineHeight: 1.4 }}>
            À gauche : permission Chrome manquante → « Autoriser Opla ». À droite : session Opla fermée → « Me connecter ». Deux murs, deux textes, deux boutons.
          </div>
        </Section>

        <Section titre="2 · Le texte à reprendre, plateforme par plateforme (chantier 3)">
          <BlocValeursGenerales
            T={T} t={t} lang="fr"
            price={10} onPrixChange={() => {}} prixManquant={false}
            nbSuiveuses={3}
            titre={titre} onTitreChange={setTitre}
            description={description} onDescriptionChange={setDescription}
            etat="Neuf sans étiquette" onEtatChange={() => {}}
            versions={VERSIONS} ficheTexte={{ titre: TITRE_FICHE, description: DESC_FICHE }}
          />
        </Section>

        <Section titre="3 · Confirme la publication — l'état, pas « retire ou décoche » (chantier 7)">
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 14 }} data-etats>
            <div style={{ fontSize: 10.5, color: T.mute, marginBottom: 8 }}>Textes réels (etatsPublication.js) sur les jobs réels de Louis — mise en page des puces simulée.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['beebs', 'leboncoin', 'opla'].map((p) => {
                const a = attentes[p];
                const libelle = a ? phraseEtat(p, a, 'fr') : 'en ligne';
                return (
                  <span key={p} data-chip={p} style={{ fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 999, border: `1px solid ${T.border}`, background: a ? '#FFF8E8' : T.chip, color: T.ink }}>
                    {p === 'beebs' ? 'Beebs' : p === 'leboncoin' ? 'Leboncoin' : 'Opla'} — {libelle}
                  </span>
                );
              })}
            </div>
            <div style={{ marginTop: 10 }}>
              <BoutonMeConnecter userId="apercu" platform="opla" motif={MOTIFS.AUTORISER_OPLA} lang="fr" variante="ligne" />
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5, color: '#8A3B2E', lineHeight: 1.45 }} data-refus>{refus}</div>
            <div style={{ marginTop: 6, fontSize: 12.5, color: '#8A3B2E', lineHeight: 1.45 }} data-refus-en-ligne>{enLigne}</div>
          </div>
        </Section>
      </div>
    </div>
  );
}

createRoot(document.getElementById('apercu')).render(<Apercu />);
