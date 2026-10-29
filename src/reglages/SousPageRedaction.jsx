// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › RÉDACTION — MES CONSIGNES POUR L'IA ET MA STRATÉGIE DE PRIX (29/10, lot B 1.1 → 1.4)
// ═══════════════════════════════════════════════════════════════════════════
// Promesses faites à XEWER (mails de Nico des 26/10 et 27/10), maquette validée par Nico le 29/10 :
//   · « titre, description et prix au choix […] Ce sera un réglage » → « FillSell écrit tout » (défaut, rien ne
//     change) / « J'écris, FillSell m'aide champ par champ » (platform_settings.redaction.a_la_demande) ;
//   · « aller directement à la création de l'annonce après l'analyse » → ouvrir_annonce_apres_scan ;
//   · « tu enregistres une fois ton propre modèle (ta structure de titre, ta structure de description, les infos que
//     tu mets toujours, ta façon de présenter l'état) » → consignes (src/utils/consignesRedaction.js) ;
//   · « Vente rapide à prix attractif, prix du marché ou prix plus haut pour attendre le bon acheteur » →
//     strategie_prix (src/utils/strategiePrix.js).
// Propres au compte, modifiables à tout moment ; écrits par platform_settings_fusionner seulement. Les consignes ne
// servent qu'aux générations demandées : un texte tapé par le vendeur n'est jamais réécrit.
import { useState } from 'react';
import { Toggle } from '../components/ui';
import BoutonDictee from '../components/BoutonDictee';
import { R } from './theme';
import { Groupe, Carte, Bouton, Note } from './ReglagesUI';
import { useReglagesRedaction, useRedactionALaDemande } from '../utils/redactionALaDemande';
import { TONS, LONGUEUR_MAX_CONSIGNE } from '../utils/consignesRedaction';
import { STRATEGIES_PRIX, TITRES_STRATEGIE } from '../utils/strategiePrix';

const TEXTES = {
  fr: {
    gCreation: "À la création d'une annonce",
    toutFillsell: 'FillSell écrit tout',
    toutFillsellNote: "Titre, description et prix remplis après l'analyse, comme aujourd'hui. Ce que tu modifies reste à toi.",
    aLaDemande: "J'écris, FillSell m'aide champ par champ",
    aLaDemandeNote: "Titre, description et prix restent vides. Un bouton « Générer avec l'IA » sur chaque champ. L'analyse (rayon, PEGI, caractéristiques, livraison) reste complète.",
    ouvrir: "Ouvrir l'annonce dès la fin de l'analyse",
    ouvrirNote: "Sans passer par l'écran d'estimation. L'analyse reste consultable depuis l'annonce.",
    gConsignes: "Mes consignes pour l'IA",
    consignesNote: "Appliquées à chaque génération que tu demandes. Jamais sur un texte que tu as tapé.",
    ton: 'Ton',
    tons: { simple: 'Simple', precis: 'Précis et factuel', chaleureux: 'Chaleureux' },
    titre: 'Structure de mes titres',
    titreEx: 'Ex. : nom du jeu + console + état + « PAL FR »',
    description: 'Format de mes descriptions',
    descriptionEx: 'Ex. : une ligne par élément (boîte, notice, disque), puis « testé et fonctionnel »',
    etat: "Ma façon de présenter l'état",
    etatEx: 'Ex. : toujours nommer les traces et micro-rayures',
    toujours: 'À toujours mentionner',
    toujoursEx: 'Ex. : envoi soigné sous 48 h',
    eviter: 'À éviter',
    eviterEx: "Ex. : pas de hashtags, pas d'émojis",
    gStrategie: 'Ma stratégie de prix',
    strategieNote: {
      rapide: "L'estimation vise le bas de la fourchette du marché.",
      marche: "Le prix médian des annonces comparables. C'est le réglage d'avant.",
      haut: "L'estimation vise le haut de la fourchette.",
    },
    strategieAide: "Un prix que tu tapes n'est jamais changé. La stratégie s'affiche à côté du prix avant chaque publication.",
    enregistrer: 'Enregistrer mes consignes',
    enregistre: 'Consignes enregistrées.',
    echec: "Pas enregistré : réessaie dans un instant.",
  },
  en: {
    gCreation: 'When creating a listing',
    toutFillsell: 'FillSell writes everything',
    toutFillsellNote: 'Title, description and price filled in after the analysis, as today. What you change stays yours.',
    aLaDemande: 'I write, FillSell helps field by field',
    aLaDemandeNote: 'Title, description and price stay empty. A “Generate with AI” button on each field. The analysis (category, PEGI, details, shipping) stays complete.',
    ouvrir: 'Open the listing as soon as the analysis is done',
    ouvrirNote: 'Without the estimate screen. The analysis stays one tap away from the listing.',
    gConsignes: 'My guidelines for the AI',
    consignesNote: 'Applied to every generation you ask for. Never to a text you typed.',
    ton: 'Tone',
    tons: { simple: 'Simple', precis: 'Precise and factual', chaleureux: 'Warm' },
    titre: 'How I structure my titles',
    titreEx: 'E.g. game name + console + condition + “PAL FR”',
    description: 'How I format my descriptions',
    descriptionEx: 'E.g. one line per item (box, manual, disc), then “tested and working”',
    etat: 'How I describe the condition',
    etatEx: 'E.g. always name marks and micro-scratches',
    toujours: 'Always mention',
    toujoursEx: 'E.g. careful shipping within 48 h',
    eviter: 'Avoid',
    eviterEx: 'E.g. no hashtags, no emojis',
    gStrategie: 'My pricing strategy',
    strategieNote: {
      rapide: 'The estimate aims at the low end of the market range.',
      marche: 'The median price of comparable listings. This was the previous setting.',
      haut: 'The estimate aims at the high end of the range.',
    },
    strategieAide: 'A price you type is never changed. The strategy is shown next to the price before each publication.',
    enregistrer: 'Save my guidelines',
    enregistre: 'Guidelines saved.',
    echec: 'Not saved: try again in a moment.',
  },
};

const CHAMPS_TEXTE = ['titre', 'description', 'etat', 'toujours', 'eviter'];

function Choix({ choisi, titre, note, onChoisir }) {
  return (
    <button type="button" role="radio" aria-checked={choisi} onClick={onChoisir}
      style={{ display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%', textAlign: 'left', padding: 12, borderRadius: 12,
        border: 'none', background: choisi ? '#EFF4F2' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: R.ink, minHeight: 44 }}>
      <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', marginTop: 1, boxSizing: 'border-box',
        border: choisi ? '6px solid #1B6E62' : `2px solid ${R.border}`, background: '#FFFFFF' }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{titre}</span>
        {note ? <span style={{ fontSize: 12, lineHeight: '17px', color: R.texteSecondaire }}>{note}</span> : null}
      </span>
    </button>
  );
}

// Le formulaire des consignes : monté avec les consignes ENREGISTRÉES (sa clé change quand la lecture est faite), il
// garde ensuite la saisie de la personne jusqu'à « Enregistrer ».
function FormulaireConsignes({ initial, X, lang, enregistrer }) {
  const [brouillon, setBrouillon] = useState(() => ({ ...initial }));
  const [touche, setTouche] = useState(false);
  const [etat, setEtat] = useState(null); // 'ok' | 'echec' | null
  const [enCours, setEnCours] = useState(false);
  const poser = (k, v) => { setTouche(true); setEtat(null); setBrouillon((b) => ({ ...b, [k]: v })); };
  const sauver = async () => {
    setEnCours(true);
    const { ok } = await enregistrer({ consignes: brouillon });
    setEnCours(false);
    setEtat(ok ? 'ok' : 'echec');
    if (ok) setTouche(false);
  };
  const zone = { width: '100%', boxSizing: 'border-box', minHeight: 64, padding: '10px 12px', borderRadius: 12, border: `1px solid ${R.border}`,
    background: R.paper, fontFamily: 'inherit', fontSize: 16, lineHeight: 1.45, color: R.ink, outline: 'none', resize: 'vertical' };
  return (
    <Groupe intitule={X.gConsignes}>
      <Note>{X.consignesNote}</Note>
      <Carte>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: R.ink }}>{X.ton}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TONS.map((tn) => {
                const on = brouillon.ton === tn;
                return (
                  <button key={tn} type="button" aria-pressed={on} onClick={() => poser('ton', on ? '' : tn)}
                    style={{ minHeight: 40, padding: '0 14px', borderRadius: 999, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${on ? R.ink : R.border}`, background: on ? R.ink : '#FFFFFF', color: on ? '#F6F5F1' : R.texteSecondaire }}>
                    {X.tons[tn]}
                  </button>
                );
              })}
            </div>
          </div>
          {CHAMPS_TEXTE.map((k) => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: R.ink }}>{X[k]}</span>
              <textarea value={brouillon[k] ?? ''} rows={2} maxLength={LONGUEUR_MAX_CONSIGNE} placeholder={X[`${k}Ex`]}
                onChange={(e) => poser(k, e.target.value)} style={zone} />
              <BoutonDictee valeur={brouillon[k] ?? ''} onChange={(v) => poser(k, v)} lang={lang} separateur={k === 'description' ? '\n' : ' '} />
            </label>
          ))}
          <Bouton enCours={enCours} disabled={!touche} onClick={sauver}>{X.enregistrer}</Bouton>
          {etat === 'ok' ? <span role="status" style={{ fontSize: 13, color: '#1B6E62', fontWeight: 600 }}>{X.enregistre}</span> : null}
          {etat === 'echec' ? <span role="alert" style={{ fontSize: 13, color: R.negative, fontWeight: 600 }}>{X.echec}</span> : null}
        </div>
      </Carte>
    </Groupe>
  );
}

export default function SousPageRedaction({ c }) {
  const userId = c.user?.id ?? null;
  const en = c.lang === 'en';
  const X = en ? TEXTES.en : TEXTES.fr;
  const lang = en ? 'en' : 'fr';
  const { reglages, lue, enregistrer } = useReglagesRedaction(userId);
  const redaction = useRedactionALaDemande(userId);

  return (
    <>
      <Groupe intitule={X.gCreation}>
        <Carte>
          <div role="radiogroup" aria-label={X.gCreation} style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Choix choisi={!redaction.aLaDemande} titre={X.toutFillsell} note={X.toutFillsellNote} onChoisir={() => redaction.choisir(false)} />
            <Choix choisi={redaction.aLaDemande} titre={X.aLaDemande} note={X.aLaDemandeNote} onChoisir={() => redaction.choisir(true)} />
          </div>
          <div className="rg-ligne" style={{ minHeight: 60, gap: 12, borderTop: `1px solid ${R.border}` }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: R.ink }}>{X.ouvrir}</span>
              <span style={{ fontSize: 12, lineHeight: '17px', color: R.texteSecondaire }}>{X.ouvrirNote}</span>
            </span>
            <Toggle checked={reglages.ouvrirApresScan} onChange={(on) => enregistrer({ ouvrirApresScan: on })} />
          </div>
        </Carte>
      </Groupe>

      <FormulaireConsignes key={lue ? 'lu' : 'attente'} initial={reglages.consignes} X={X} lang={lang} enregistrer={enregistrer} />

      <Groupe intitule={X.gStrategie}>
        <Carte>
          <div role="radiogroup" aria-label={X.gStrategie} style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {STRATEGIES_PRIX.map((s) => (
              <Choix key={s} choisi={reglages.strategiePrix === s} titre={TITRES_STRATEGIE[lang][s]} note={X.strategieNote[s]}
                onChoisir={() => enregistrer({ strategiePrix: s })} />
            ))}
          </div>
        </Carte>
        <Note>{X.strategieAide}</Note>
      </Groupe>
    </>
  );
}
