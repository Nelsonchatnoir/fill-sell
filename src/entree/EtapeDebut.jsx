// ── 4 bis. JE N'AI ENCORE RIEN EN LIGNE ─────────────────────────────────────
// L'état que l'ancien parcours ne prévoyait pas : la personne n'a rien à
// relever. On ne lui montre donc pas un relevé vide — on lui montre par où
// commence sa première annonce. C'est plan.js qui fait l'aiguillage : aucune
// plateforme cochée = l'étape « relevé » n'existe pas dans sa liste.
// Le tuto « du téléphone à l'ordinateur » ne vit PAS ici : il est sur l'écran
// extension, que tout le monde traverse.
import { E, DEGRADE } from './theme';
import { Scene, Kicker, Titre, Texte, Carte, BoutonPrimaire } from './EntreeUI';

export default function EtapeDebut({ c, T, onSuivant }) {
  return (
    <Scene
      cle="debut"
      pied={<BoutonPrimaire onClick={() => { c.journaliser('premiere_annonce'); onSuivant(); }}>{T.debCta}</BoutonPrimaire>}
    >
      <Kicker>{T.debKicker}</Kicker>
      <Titre>{T.debTitre}</Titre>
      <Texte>{T.debTexte}</Texte>

      <Carte style={{ padding: '18px 16px' }}>
        {T.debEtapes.map((texte, k) => (
          <div key={texte} className="en-monte" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '11px 0', animationDelay: `${k * 70}ms` }}>
            <span aria-hidden="true" style={{
              width: 24, height: 24, borderRadius: 12, flexShrink: 0, background: DEGRADE, color: '#FFFFFF',
              fontSize: 12, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{k + 1}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.5, color: E.ink }}>{texte}</span>
          </div>
        ))}
      </Carte>
    </Scene>
  );
}
