// ── 5 bis. TON PLAN FREE (04/11/2026, lot 3) ────────────────────────────────
// Maquette o-free, validée par Nico le 03/11. N'existe qu'AVEC la grille à 3
// jauges (coin_config.grille_trois_jauges = 1) et pour un compte Free
// (plan.js : c.plan.free) — téléphone comme ordinateur. Placée après les écrans
// qui montrent ce que FillSell fait, avant le pseudo : les quotas se lisent
// comme ce qu'on a, pas comme une limite.
//
// ⛔ LES TROIS CHIFFRES SE LISENT dans coin_config (c.plan, planEntree →
//    grilleDuPalier), jamais en dur ; « illimité » se dit avec le mot.
// ⛔ AUCUN BOUTON D'ACHAT : « Besoin de plus un jour ? Les formules sont dans
//    Réglages › Abonnement. » Le bon moment pour vendre, c'est le mur.
// ⛔ AUCUN APPEL, AUCUNE ÉCRITURE.
import { JAUGES, nombre, motJauge } from '../utils/jauges';
import { E } from './theme';
import { Scene, Kicker, Titre, Texte, Carte, BoutonPrimaire, Bande, TitreCarte } from './EntreeUI';
import { compteJauge } from './regles';

export default function EtapeFree({ c, T, onSuivant }) {
  const plan = c.plan;
  const exemple = `${compteJauge('annonces', 1, c.lang)}${c.lang === 'en' ? ' and ' : ' et '}${compteJauge('publications', 2, c.lang)}`;
  const valider = () => { c.journaliser('plan_free_compris'); onSuivant(); };

  return (
    <Scene
      cle="free"
      pied={(
        <>
          <BoutonPrimaire onClick={valider}>{T.freeCta}</BoutonPrimaire>
          <Texte centre style={{ margin: '10px 0 0', fontSize: 12 }}>{T.freeFormules}</Texte>
        </>
      )}
    >
      <Kicker>{c.cloudPris ? T.freeKickerCloud : T.freeKicker}</Kicker>
      <Titre>{T.freeTitre}</Titre>
      <Texte>{T.freeTexte}</Texte>

      <Carte style={{ padding: '4px 16px', marginBottom: 12 }}>
        {JAUGES.map((j, k) => {
          const n = plan?.[j];
          return (
            <div key={j} data-jauge={j} className="en-monte" style={{
              display: 'grid', gridTemplateColumns: '64px 1fr', gap: 12, alignItems: 'center', padding: '11px 0',
              borderBottom: k === JAUGES.length - 1 ? 'none' : `1px solid ${E.ligneDouce}`, animationDelay: `${k * 70}ms`,
            }}>
              <span style={{ fontSize: Number.isFinite(n) ? 30 : 15, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: E.tealDeep, fontVariantNumeric: 'tabular-nums' }}>
                {nombre(n, c.lang)}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: E.ink }}>{motJauge(j, Number.isFinite(n) ? n : 2, c.lang)}</span>
                <span style={{ display: 'block', fontSize: 12, lineHeight: 1.4, color: E.texteSecondaire }}>{T.freeSous[j]}</span>
              </span>
            </div>
          );
        })}
      </Carte>

      <Carte style={{ padding: '14px 16px 4px', marginBottom: 12 }}>
        <TitreCarte>{T.freeSansLimite}</TitreCarte>
        {T.freeSansLimiteListe.map((x, k) => (
          <div key={x} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '11px 0', borderBottom: k === T.freeSansLimiteListe.length - 1 ? 'none' : `1px solid ${E.ligneDouce}` }}>
            <span aria-hidden="true" style={{
              width: 19, height: 19, marginTop: 1, borderRadius: 10, flexShrink: 0, background: E.menthe, border: `1px solid ${E.mentheBord}`,
              color: E.tealDeep, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            }}>✓</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5, color: E.ink }}>{x}</span>
          </div>
        ))}
      </Carte>

      <Texte style={{ margin: '0 0 12px', fontSize: 12 }}>{T.freeExemple(exemple)}</Texte>

      {c.cloudPris && <Bande>{T.freeCloud}</Bande>}
    </Scene>
  );
}
