// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › EXPÉDITION › BORDEREAU AUTOMATIQUE (24/10/2026 soir, décision 1 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Le format du bordereau que FillSell demande TOUT SEUL dès une vente Vinted : choisi une fois, appliqué ensuite à
// chaque vente. (24/10 soir, décision 2 de Nico) Vinted seulement, pour tous les comptes ; Leboncoin, Beebs, Depop et
// eBay : « bientôt disponible » ; jamais une étiquette payante. Écriture par platform_settings_fusionner seulement
// (utils/formatBordereau.js).
import { useState } from 'react';
import { useFormatBordereau, libelleFormatBordereau, FORMATS_BORDEREAU } from '../utils/formatBordereau';
import { R } from './theme';
import { Groupe, Carte, Note } from './ReglagesUI';

export default function SousPageBordereaux({ c, T }) {
  const en = c.lang === 'en';
  const f = useFormatBordereau(c.user?.id);
  const [enCours, setEnCours] = useState(false);
  const choisir = async (format) => {
    if (enCours || format === f.valeur) return;
    setEnCours(true);
    const r = await f.enregistrer(format);
    setEnCours(false);
    c.toast(r.ok ? T.bordereauFormatEnregistre : T.erreurSauvegarde);
  };
  return (
    <Groupe intitule={T.bordereauAuto}>
      <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 14, lineHeight: 1.45, color: R.ink }}>
          {en
            ? 'As soon as a sale comes in on Vinted, FillSell requests the label on its own and keeps it here: open the order, it is already there.'
            : 'Dès qu’une vente arrive sur Vinted, FillSell demande le bordereau tout seul et le garde ici : tu ouvres la commande, il est déjà là.'}
        </div>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend style={{ fontSize: 13, fontWeight: 700, color: R.texteSecondaire, marginBottom: 6 }}>{en ? 'Format' : 'Format'}</legend>
          {FORMATS_BORDEREAU.map((format) => (
            <label key={format} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '8px 12px', borderRadius: 12,
              border: `1.5px solid ${f.valeur === format ? R.tealDeep : R.border}`, cursor: enCours ? 'default' : 'pointer' }}>
              <input type="radio" name="format-bordereau" checked={f.valeur === format} disabled={enCours || !f.lue}
                onChange={() => choisir(format)} style={{ width: 18, height: 18 }} />
              <span style={{ fontSize: 14 }}>{libelleFormatBordereau(format, c.lang)}{format === 'pdf' ? (en ? ' — default' : ' — par défaut') : ''}</span>
            </label>
          ))}
        </fieldset>
        <Note>
          {en
            ? 'Leboncoin, Beebs, Depop and eBay: coming soon. Never a paid label. If the automatic label fails, the button stays on the order with the real reason.'
            : 'Leboncoin, Beebs, Depop et eBay : bientôt disponible. Jamais une étiquette payante. Si le bordereau automatique échoue, le bouton reste sur la commande, avec la vraie raison.'}
        </Note>
      </Carte>
    </Groupe>
  );
}
