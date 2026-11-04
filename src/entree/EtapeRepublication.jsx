// ── 5. LA REPUBLICATION AUTOMATIQUE ─────────────────────────────────────────
// C'est la fonction qui fait revenir les gens, et rien n'y menait. Cet écran
// la MONTRE — la liste d'une plateforme, quatre rangs, ton annonce qui remonte
// au premier — et n'active RIEN : le créneau, les jours et les articles se
// règlent dans Réglages › Automatismes, avec les gardes de palier qui vivent
// là-bas. Un parcours d'entrée ne pose pas un réglage récurrent à la place de
// l'utilisateur.
//
// ⛔ AUCUN APPEL, AUCUNE ÉCRITURE. Cet écran ne fait que dire et passer. Si un
//    jour il pose une republication planifiée, c'est qu'on a introduit un
//    automatisme que personne n'a demandé.
//
// (04/11/2026, lot 3 — maquette o-remontees, décision de Nico du 03/11) AVEC LA GRILLE À 3 JAUGES, l'écran ne
// promet plus l'automatique à tout le monde : la republication automatique n'existe qu'à partir du Pro. Il dit ce
// que chacun a vraiment — « En Free : 30 remontées par mois » / « Dès le Pro : illimitées, et toutes seules au
// créneau que tu choisis » —, chiffres lus dans coin_config (grilleDuPalier), jamais en dur. Même carte, même
// animation (l'annonce qui remonte au premier rang). Grille éteinte : l'écran d'avant, mot pour mot.
import { grilleDuPalier } from '../utils/jauges';
import { nomDuPalier } from '../utils/palier';
import { E } from './theme';
import { Scene, Kicker, Titre, Texte, BoutonPrimaire } from './EntreeUI';
import { compteJauge } from './regles';

// « En Free » / « Dès le Pro » : ce que chaque palier a, lu dans coin_config.
function PaliersRemontees({ c, T }) {
  const free = grilleDuPalier(c.K, 'free').remontees;
  const pro = grilleDuPalier(c.K, 'pro').remontees;
  const lignes = [
    [T.remEnFree, T.remFreeVolume(compteJauge('remontees', free, c.lang))],
    [T.remDesLe(nomDuPalier('pro')), T.remProVolume(Number.isFinite(pro) ? compteJauge('remontees', pro, c.lang) : null)],
  ];
  return (
    <div data-entree="paliers-remontees" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${E.ligneDouce}` }}>
      {lignes.map(([qui, quoi]) => (
        <div key={qui} style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: 8, fontSize: 12.5, lineHeight: 1.4 }}>
          <span style={{ paddingTop: 1, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: E.texteSecondaire }}>{qui}</span>
          <span style={{ fontWeight: 600, color: E.ink }}>{quoi}</span>
        </div>
      ))}
    </div>
  );
}

export default function EtapeRepublication({ c, T, onSuivant }) {
  const grille = c?.grille === true;
  const cycle = grille ? T.remCycle : T.repCycle;
  return (
    <Scene cle="republication" pied={<BoutonPrimaire onClick={onSuivant}>{T.repCta}</BoutonPrimaire>}>
      <Kicker>{T.repKicker}</Kicker>
      <Titre>{grille ? T.remTitre : T.repTitre}</Titre>
      <Texte style={{ marginBottom: 18 }}>{grille ? T.remTexte : T.repTexte}</Texte>

      <div className="en-anime" style={{ background: E.card, border: `1px solid ${E.border}`, borderRadius: 20, padding: '18px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* La liste d'une plateforme : cinq rangs gris, ton annonce qui
              remonte au premier. Rien d'autre ne bouge. */}
          <div aria-hidden="true" style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0, 1, 2, 3, 4].map((k) => (
                <span key={k} style={{ height: 14, borderRadius: 7, background: E.chip }} />
              ))}
            </div>
            <div style={{
              position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', alignItems: 'center', gap: 7,
              padding: '6px 8px', borderRadius: 11, background: E.card, border: `1.5px solid ${E.teal}`,
              boxShadow: '0 8px 18px -10px rgba(16,32,27,0.5)', animation: 'enRangMonte 4.2s cubic-bezier(.22,.61,.36,1) infinite',
            }}>
              <span style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, background: 'linear-gradient(140deg,#9FD8CF,#2F9E90)' }} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ height: 4, width: '100%', borderRadius: 2, background: E.piste }} />
                <span style={{ height: 4, width: '62%', borderRadius: 2, background: E.piste }} />
              </span>
            </div>
            <span style={{ position: 'absolute', left: -6, top: 2, fontSize: 10, fontWeight: 700, color: E.texteSecondaire }}>1</span>
          </div>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {cycle.map((texte, k) => (
              /* Le cycle vit sur la PASTILLE, jamais sur le libellé. */
              <div key={texte} className="en-monte" style={{ display: 'flex', alignItems: 'center', gap: 9, animationDelay: `${k * 70}ms` }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: E.teal, flexShrink: 0, animation: 'enAllume 4.2s ease-in-out infinite', animationDelay: `${k * 1.4}s` }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.35, fontWeight: 600, color: E.ink }}>{texte}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ce que TU règles : dit ici, réglé plus tard. (04/11) Avec la grille : ce que chaque palier a. */}
        {grille ? <PaliersRemontees c={c} T={T} /> : (
          <div style={{ display: 'flex', gap: 7, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${E.ligneDouce}` }}>
            {T.repReglages.map((mot) => (
              <span key={mot} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 11, background: E.paper, border: `1px solid ${E.border}`, fontSize: 11.5, fontWeight: 600, color: E.ink }}>
                {mot}
              </span>
            ))}
          </div>
        )}
      </div>

      <Texte style={{ margin: '14px 0 0', fontSize: 12.5 }}>{grille ? T.remNote : T.repNote}</Texte>
    </Scene>
  );
}
