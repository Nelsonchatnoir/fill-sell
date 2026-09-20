// ── 1. OÙ TU VENDS ? ────────────────────────────────────────────────────────
// La première question du parcours ne parle plus d'UNE plateforme : elle les
// pose toutes les cinq, à égalité, et prévoit la sixième réponse — « je n'ai
// encore rien en ligne », qui n'existait pas.
//
// ⚠️ CE QUE CE CHOIX FAIT, ET CE QU'IL NE FAIT PAS : il se range dans le champ
// de préférence qui existe déjà (profiles.platform_settings, clé
// `plateformes_vendeur` — cf. useContexteEntree) et il règle la suite DU
// PARCOURS : l'étape eBay, puis le relevé ou la première annonce. Il ne touche
// PAS `plateformesDuCompte` — la liste des plateformes qu'un compte peut viser
// est CALCULÉE (utils/stockFiltres) ; l'écrire ici mentirait à l'écran de
// publication.
//
// « Je n'ai encore rien en ligne » est EXCLUSIF des cinq autres : le cocher
// vide la liste, cocher une plateforme le décoche. Une liste vide fait sauter
// l'étape du relevé (plan.js) — il n'aurait rien à relever.
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { E } from './theme';
import { Scene, Kicker, Titre, Texte, BoutonPrimaire } from './EntreeUI';

const PLATEFORMES = [
  { id: 'vinted', nom: 'Vinted' },
  { id: 'leboncoin', nom: 'Leboncoin' },
  { id: 'ebay', nom: 'eBay' },
  { id: 'beebs', nom: 'Beebs' },
  { id: 'opla', nom: 'Opla' },
];

function Coche({ actif }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 18, height: 18, borderRadius: 9, flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        fontSize: 11, fontWeight: 700, color: '#FFFFFF',
        background: actif ? E.teal : 'transparent',
        border: `1.5px solid ${actif ? E.teal : E.piste}`,
        transition: 'background .16s ease, border-color .16s ease',
      }}
    >
      {actif ? '✓' : ''}
    </span>
  );
}

export default function EtapePlateformes({ c, T, onSuivant }) {
  const { plateformes, debute } = c.choix;

  const basculer = (id) => c.majChoix((v) => ({
    debute: false,
    plateformes: v.plateformes.includes(id) ? v.plateformes.filter((p) => p !== id) : [...v.plateformes, id],
  }));

  const basculerDebut = () => c.majChoix((v) => (v.debute ? { ...v, debute: false } : { plateformes: [], debute: true }));

  const valider = () => {
    c.journaliser('plateformes', { plateformes, debute });
    // Une seule écriture serveur, ici — pas une par coche. Elle n'est pas
    // attendue : l'écran ne doit rien à la latence du réseau.
    c.enregistrerPlateformes();
    onSuivant();
  };

  return (
    <Scene cle="plateformes" pied={<BoutonPrimaire onClick={valider}>{T.continuer}</BoutonPrimaire>}>
      <Kicker>{T.pfKicker}</Kicker>
      <Titre>{T.pfTitre}</Titre>
      <Texte style={{ marginBottom: 18 }}>{T.pfTexte}</Texte>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {PLATEFORMES.map((p, k) => {
          const actif = !debute && plateformes.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              role="checkbox"
              aria-checked={actif}
              onClick={() => basculer(p.id)}
              className="en-tuile en-monte en-focus"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px', minHeight: 62,
                borderRadius: 16, border: `1.5px solid ${actif ? E.teal : E.border}`,
                background: actif ? E.mentheVive : E.card, fontFamily: 'inherit', cursor: 'pointer',
                textAlign: 'left', animationDelay: `${k * 45}ms`,
              }}
            >
              <PlatformLogo platform={p.id} size={30} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: E.ink }}>{p.nom}</span>
              <Coche actif={actif} />
            </button>
          );
        })}
      </div>

      {/* La réponse qui manquait : commencer de zéro est un cas normal. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={debute}
        onClick={basculerDebut}
        className="en-tuile en-monte en-focus"
        style={{
          marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px', minHeight: 56,
          borderRadius: 16, border: `1.5px solid ${debute ? E.teal : E.border}`,
          background: debute ? E.mentheVive : E.card, fontFamily: 'inherit', cursor: 'pointer',
          textAlign: 'left', animationDelay: '230ms',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: E.ink }}>{T.pfRienEnLigne}</span>
        <Coche actif={debute} />
      </button>
    </Scene>
  );
}
