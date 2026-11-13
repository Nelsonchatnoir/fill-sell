// ── 5 bis. TON PLAN FREE (04/11/2026, lot 3) ────────────────────────────────
// Maquette o-free, validée par Nico le 03/11. N'existe qu'AVEC la grille à 3
// jauges (coin_config.grille_trois_jauges = 1) et pour un compte Free
// (c.plan.free) — téléphone comme ordinateur. Les quotas se lisent comme ce
// qu'on a, pas comme une limite.
//
// (13/11/2026, bloc B2 de Nico) CE N'EST PLUS UNE ÉTAPE : un écran de plus juste avant la sortie, que le récap redisait
// déjà en une ligne. Son contenu ENTIER (`PlanFree` ci-dessous : les 3 chiffres et ce qu'ils comptent, la remise à zéro,
// ce qui est sans limite, l'exemple, la bande Cloud, « Besoin de plus un jour ? ») est rendu DANS le récap (EtapeFin),
// pour un compte Free avec la grille — rien n'est caché, un écran de moins. L'étape `EtapeFree` (export par défaut)
// reste montable pour un retour arrière : il suffit de remettre sa ligne dans plan.js.
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

/**
 * Le plan Free, en entier. `recap` : la forme du récap (EtapeFin) — un intitulé de section au lieu du grand titre
 * d'écran, la phrase « Besoin de plus un jour ? » en bas du bloc (dans l'étape, elle est sous le bouton).
 */
export function PlanFree({ c, T, recap = false }) {
  const plan = c.plan;
  const exemple = `${compteJauge('annonces', 1, c.lang)}${c.lang === 'en' ? ' and ' : ' et '}${compteJauge('publications', 2, c.lang)}`;
  return (
    <section data-entree={recap ? 'fin-plan-free' : 'plan-free'} style={recap ? { marginTop: 14 } : undefined}>
      <Kicker>{c.cloudPris ? T.freeKickerCloud : T.freeKicker}</Kicker>
      {recap
        ? <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.01em', color: E.ink }}>{T.freeTitre}</p>
        : <Titre>{T.freeTitre}</Titre>}
      <Texte style={recap ? { margin: '0 0 12px', fontSize: 13 } : undefined}>{T.freeTexte}</Texte>

      <Carte style={{ padding: '4px 16px', marginBottom: 12 }}>
        {JAUGES.map((j, k) => {
          const n = plan?.[j];
          return (
            <div key={j} data-jauge={j} className="en-monte" style={{
              display: 'grid', gridTemplateColumns: '64px 1fr', gap: 12, alignItems: 'center', padding: '11px 0',
              borderBottom: k === JAUGES.length - 1 ? 'none' : `1px solid ${E.ligneDouce}`, animationDelay: `${k * 70}ms`,
            }}>
              <span style={{ fontSize: Number.isFinite(n) ? (recap ? 26 : 30) : 15, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: E.tealDeep, fontVariantNumeric: 'tabular-nums' }}>
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
      {recap && <Texte style={{ margin: c.cloudPris ? '12px 0 0' : 0, fontSize: 12 }}>{T.freeFormules}</Texte>}
    </section>
  );
}

export default function EtapeFree({ c, T, onSuivant }) {
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
      <PlanFree c={c} T={T} />
    </Scene>
  );
}
