// ── 6. LE PSEUDO — DERNIÈRE MARCHE, INCHANGÉE DANS SA MÉCANIQUE ─────────────
// Ne s'affiche que si ni profiles.username ni le provider OAuth n'ont donné de
// nom (prop demanderPseudo), et TOUJOURS après la valeur. Champ vide accepté :
// il ne sert qu'au bonjour du tableau de bord.
import { E } from './theme';
import { Scene, Kicker, Titre, Texte, BoutonPrimaire } from './EntreeUI';

export default function EtapePseudo({ T, pseudo, setPseudo, onSuivant }) {
  return (
    <Scene cle="pseudo" pied={<BoutonPrimaire onClick={onSuivant}>{T.continuer}</BoutonPrimaire>}>
      <Kicker>{T.psKicker}</Kicker>
      <Titre>{T.psTitre}</Titre>
      <Texte>{T.psTexte}</Texte>
      <input
        value={pseudo}
        onChange={(e) => setPseudo(e.target.value.slice(0, 30))}
        maxLength={30}
        placeholder={T.psPlaceholder}
        aria-label={T.psPlaceholder}
        className="en-focus"
        style={{
          width: '100%', boxSizing: 'border-box', minHeight: 52, padding: '0 16px', borderRadius: 16,
          border: `1.5px solid ${E.border}`, background: E.card, fontFamily: 'inherit', fontSize: 16,
          color: E.ink, outline: 'none',
        }}
      />
    </Scene>
  );
}
