import { prixSelonStrategie, positionDansFourchette, libelleStrategie } from '../../utils/strategiePrix';
import { analyseFiabilite } from '../AnalyseMarche';
import { formatCurrency } from '../../utils/shared';
import { useTranslation } from '../../i18n/useTranslation';

// ═══════════════════════════════════════════════════════════════════════════
// LE PRIX DU RÉSULTAT SUIT LA STRATÉGIE DU VENDEUR (29/10, lot B 1.4 — affichage seul)
// ═══════════════════════════════════════════════════════════════════════════
// « 24 € · ta stratégie : vente rapide », et la jauge vente rapide / marché /
// prix haut. La stratégie (Réglages › Rédaction, platform_settings.redaction.
// strategie_prix) ne fait que CHOISIR la borne de la fourchette que l'analyse
// a déjà rendue (utils/strategiePrix.js) : aucun appel, aucun prix inventé.
// Ce que la moitié « prix » d'AnalyseMarche disait, et qui ne se perd pas :
//   · la fiabilité — une seule annonce, ou aucune : le prix est une estimation,
//     et on le dit (même règle qu'AnalyseMarche : pas de fourchette ni de jauge
//     à zéro annonce, elles habilleraient une supposition) ;
//   · le prix plafond d'achat en chine (« achète en dessous de »), jamais sur
//     un objet déduit, jamais à 0 € (Number(null) === 0, cf. AnalyseMarche) ;
//   · la marge, quand un prix d'achat est saisi.
// Le verdict (« Bon deal ») n'est pas repris : il tombe avec la marge, et le
// viseur ne demande pas le prix d'achat.

const fmt = (v, currency) => formatCurrency(v, currency, Number.isInteger(v) ? 0 : null);

export default function PrixStrategie({ result, strategie, prixAchat = null, lang, currency = 'EUR' }) {
  const { t, tpl } = useTranslation(lang);
  const p = prixSelonStrategie(result, strategie);
  if (!p) return null;
  const { niveau } = analyseFiabilite(result);
  const fourchette = niveau !== 'aucune' ? p.fourchette : null;
  const position = fourchette ? positionDansFourchette(p.prix, fourchette) : null;
  const achat = Number.parseFloat(prixAchat);
  const aAchat = Number.isFinite(achat) && achat > 0;
  const marge = aAchat ? p.prix - achat : null;
  const objetDeduit = result.objet_source === 'deduit';
  const plafondBrut = result.prix_achat_suggere;
  const plafond = !aAchat && !objetDeduit && niveau !== 'aucune'
    && plafondBrut != null && Number.isFinite(Number(plafondBrut)) && Number(plafondBrut) > 0
    ? Number(plafondBrut) : null;
  const zones = ['rapide', 'marche', 'haut'];
  return (
    <div className="lns-carte lns-carte--s" style={{ gap: 10 }}>
      <div className="lns-prix-tete">
        <span className="lns-h">{t('lensPrixRevente')}</span>
        {fourchette && (
          <span className="lns-compte">
            {tpl('lensMarcheFourchette', { bas: fmt(fourchette.bas, currency), haut: fmt(fourchette.haut, currency) })}
          </span>
        )}
      </div>
      <div className="lns-prix-ligne">
        <span className="lns-prix">{niveau === 'aucune' ? `≈ ${fmt(p.prix, currency)}` : fmt(p.prix, currency)}</span>
        <span className="lns-strategie">{tpl('lensTaStrategie', { nom: libelleStrategie(p.strategie, lang) })}</span>
      </div>
      {position != null && (
        <>
          <div className="lns-jauge" role="img"
            aria-label={tpl('lensTaStrategie', { nom: libelleStrategie(p.strategie, lang) })}>
            <span className="lns-jauge-curseur" style={{ left: `${(position * 100).toFixed(1)}%` }} />
          </div>
          <div className="lns-jauge-legende">
            {zones.map((z) => (
              <span key={z} data-actif={z === p.strategie ? '1' : undefined}>
                {t(z === 'rapide' ? 'lensJaugeRapide' : z === 'marche' ? 'lensJaugeMarche' : 'lensJaugeHaut')}
              </span>
            ))}
          </div>
        </>
      )}
      {niveau === 'fragile' && <p className="lns-note-prix lns-note-prix--attention">{t('lensUneSeuleAnnonce')}</p>}
      {niveau === 'aucune' && <p className="lns-note-prix lns-note-prix--attention">{t('lensAucuneAnnonce')}</p>}
      {aAchat && (
        <p className="lns-note-prix">
          {tpl('lensMarge', {
            m: `${marge >= 0 ? '+' : '−'}${fmt(Math.abs(marge), currency)}`,
            a: fmt(achat, currency),
          })}
        </p>
      )}
      {plafond != null && (
        <p className="lns-note-prix">{tpl('lensAcheteSous', { p: fmt(plafond, currency) })}</p>
      )}
    </div>
  );
}
