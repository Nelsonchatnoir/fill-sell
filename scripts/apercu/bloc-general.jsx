// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — le bloc général et les marqueurs de carte (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Il monte le bloc réel (pas une maquette)
// avec le vrai article de Louis THONET, et joue la mécanique complète :
// écrire une valeur générale, dissocier une carte, la rétablir.
//
// Pourquoi il existe : la seule autre façon de voir cet écran est d'ouvrir le
// stepper dans l'app, ce qui demande une session — et une session fillsell.app
// en automatisation est interdite (CLAUDE.md). Ici, aucun compte, aucun
// réseau, aucune génération : des objets en dur et le composant réel.
//
//     node scripts/apercu/capture-bloc-general.mjs
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import BlocValeursGenerales from '../../src/components/BlocValeursGenerales.jsx';
import { useTranslation } from '../../src/i18n/useTranslation.js';
import {
  appliquerGenerale, dissociationsVides, dissocier, rattacher, suitLaGenerale,
  valeurPourPlateforme, lireValeur,
} from '../../src/utils/valeursGenerales.js';

const T = {
  canvas: '#EDEAE0', paper: '#F6F5F1', ink: '#10201B', teal: '#2F9E90',
  tealDeep: '#1B6E62', mute: '#8A8578', mute2: '#6B7A75', border: '#E7E3D8',
  card: '#FFFFFF', chip: '#F2F0E9',
};

// L'article 1789991601609, relevé Beebs du 21/09 — texte, état et prix réels.
const TITRE = 'Rangement Blanc et Orange pour 12 pots et 12 couvercles pour yaourtière Multidélices';
const DESC = "Rangement pratique pour yaourtière Multidélices de chez SEB 🥣\n📦 Capacité : 12 pots + 12 couvercles\n⚠️ Pots et couvercles non fournis\n✅ Permet un stockage propre et organisé\n✅ Idéal pour optimiser l'espace dans vos placards\n✅ État : neuf\nAccessoire pratique pour compléter votre équipement Multidélices.";
const PF = ['leboncoin', 'vinted', 'beebs', 'ebay'];
const LABELS = { vinted: 'VINTED', leboncoin: 'LEBONCOIN', beebs: 'BEEBS', ebay: 'EBAY' };

function Apercu() {
  const { t } = useTranslation('fr');
  const [generales, setGenerales] = useState({ titre: TITRE, description: DESC, etat: 'Neuf sans étiquette' });
  const [dissociees, setDissociees] = useState(dissociationsVides);
  const [edited, setEdited] = useState(() => {
    let base = Object.fromEntries(PF.map((p) => [p, { title: '', description: '', platform_fields: {}, price: 12 }]));
    for (const [champ, valeur] of [['titre', TITRE], ['description', DESC], ['etat', 'Neuf sans étiquette']]) {
      base = appliquerGenerale(base, { champ, valeur, plateformes: PF, dissociees: dissociationsVides() });
    }
    return base;
  });

  const poser = (champ, valeur) => {
    setGenerales((p) => ({ ...p, [champ]: valeur }));
    setEdited((prev) => appliquerGenerale(prev, { champ, valeur, plateformes: PF, dissociees }));
  };
  const modifier = (p, champ, valeur) => {
    setEdited((prev) => {
      const base = prev[p];
      if (champ === 'titre') return { ...prev, [p]: { ...base, title: valeur } };
      if (champ === 'description') return { ...prev, [p]: { ...base, description: valeur } };
      return { ...prev, [p]: { ...base, platform_fields: { ...base.platform_fields, etat: valeur } } };
    });
    setDissociees((prev) => dissocier(prev, champ, p));
  };
  const retablir = (p, champ) => {
    const suivant = rattacher(dissociees, champ, p);
    setDissociees(suivant);
    setEdited((prev) => appliquerGenerale(prev, { champ, valeur: generales[champ], plateformes: [p], dissociees: suivant }));
  };

  return (
    <div style={{ background: T.canvas, minHeight: '100vh', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      {/* 400 px : la largeur de contrôle de la consigne — rien ne doit déborder. */}
      <div style={{ width: 400, margin: '0 auto' }}>
        <BlocValeursGenerales
          T={T} t={t} lang="fr"
          price={12} onPrixChange={() => {}} prixManquant={false}
          nbSuiveuses={PF.length}
          titre={generales.titre} onTitreChange={(v) => poser('titre', v)}
          description={generales.description} onDescriptionChange={(v) => poser('description', v)}
          etat={generales.etat} onEtatChange={(v) => poser('etat', v)}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PF.map((p) => {
            const aPart = ['titre', 'description', 'etat'].filter((c) => !suitLaGenerale(dissociees, c, p));
            const etatCarte = lireValeur(edited[p], 'etat');
            return (
              <div key={p} style={{ background: T.card, borderRadius: 18, border: `1px solid ${T.border}`, padding: 14 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{LABELS[p]}</div>
                <div data-titre={p} style={{ fontSize: 12, color: T.mute2, marginTop: 3, overflowWrap: 'anywhere',
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {lireValeur(edited[p], 'titre')}
                </div>
                <div data-etat={p} style={{ fontSize: 12, color: T.tealDeep, marginTop: 4, fontWeight: 700 }}>{etatCarte}</div>
                {aPart.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.tealDeep, background: 'rgba(47,158,144,0.12)', borderRadius: 99, padding: '2px 8px' }}>
                      {t('cardCustom')}
                    </span>
                    {aPart.map((c) => (
                      <button key={c} type="button" data-retablir={`${p}:${c}`} onClick={() => retablir(p, c)}
                        style={{ background: 'none', border: 'none', padding: 0, fontSize: 10.5, fontWeight: 700, color: T.mute, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                        {t('cardResetToGeneral')} · {c}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" data-dissocier={p}
                    onClick={() => modifier(p, 'titre', `${lireValeur(edited[p], 'titre')} (à part)`)}
                    style={{ fontSize: 11, padding: '5px 9px', borderRadius: 999, border: `1px solid ${T.border}`, background: T.chip, color: T.mute2, cursor: 'pointer', fontFamily: 'inherit' }}>
                    dissocier le titre
                  </button>
                  <span style={{ fontSize: 10.5, color: T.mute }}>
                    état servi : {valeurPourPlateforme('etat', generales.etat, p).valeur || '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('apercu')).render(<Apercu />);
