// ═══════════════════════════════════════════════════════════════════════════
// STOCK — LE MENU « … » D'UN ARTICLE (refonte du 03/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// La carte ne garde qu'UNE action ; TOUT le reste vit ici, et rien n'a
// disparu : chaque ligne appelle le MÊME geste qu'avant la refonte (StockTab
// passe ses propres fonctions — publierAvecDetail, markSold,
// ouvrirFeuilleRepublication, setRemoveModalItem, delItem…). Ce composant ne
// sait rien faire tout seul.
// En tête : l'article (photo, titre, prix, pastille). Puis « Ce qui se passe »
// — les états secondaires que l'ancienne carte affichait en puces (publiée à
// vérifier, lien en cours, annonce introuvable, masquée, en ligne depuis…) —
// puis les actions, puis la saisie du prix d'achat quand il manque.
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import Feuille, { IntituleSection } from './Feuille';
import GalleryPhoto from '../components/GalleryPhoto';
import { PastilleEtat } from './Carte';
import { S } from './jetons';
import { lirePrixSaisi } from './regles';

const TON_INFO = {
  regler: { fond: S.ambreFond, bord: S.ambreBord, encre: S.ambreEncre },
  echec: { fond: S.rougeFond, bord: S.rougeBord, encre: S.rouge },
  neutre: { fond: S.paper, bord: S.border, encre: S.ink2 },
  ok: { fond: S.menthe, bord: S.mentheBord, encre: S.tealDeep },
};

export function LigneAction({ icone: Icone, libelle, detail = null, onTap, desactive = false, danger = false, droite = null }) {
  return (
    <button type="button" className="sk-btn sk-presse" disabled={desactive} onClick={onTap}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '8px 16px', boxSizing: 'border-box',
        border: 'none', borderRadius: 0, background: 'transparent', textAlign: 'left', opacity: desactive ? 0.5 : 1,
        boxShadow: `inset 0 -1px 0 ${S.borderSoft}`,
      }}>
      <span style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: danger ? S.rougeFond : S.menthe, color: danger ? S.rouge : S.tealDeep,
      }}>
        {Icone && <Icone size={20} strokeWidth={2} aria-hidden="true" />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, lineHeight: '20px', fontWeight: 700, color: danger ? S.rouge : S.ink }}>{libelle}</span>
        {detail && <span style={{ display: 'block', fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2, marginTop: 2 }}>{detail}</span>}
      </span>
      {droite ?? (!desactive && <ChevronRight size={18} color={S.chevron} aria-hidden="true" style={{ flexShrink: 0 }} />)}
    </button>
  );
}

function SaisiePrixAchat({ lang, onValider, onInconnu }) {
  const fr = lang !== 'en';
  const [texte, setTexte] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  const valeur = lirePrixSaisi(texte);
  const valider = async () => {
    if (valeur == null || busy) return;
    setBusy(true); setErreur(null);
    try {
      const r = await onValider(texte);
      if (r === false) setErreur(fr ? "Le prix n'a pas pu être enregistré." : 'The price could not be saved.');
    } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, borderRadius: 16, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}` }}>
      <div style={{ fontSize: 14, lineHeight: '20px', fontWeight: 700 }}>{fr ? "Prix d'achat" : 'Purchase price'}</div>
      <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2 }}>
        {fr ? 'Ce que tu as payé. Un 0 (don, lot offert) est un prix valide.' : 'What you paid. 0 (gift, free lot) is a valid price.'}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', boxSizing: 'border-box', borderRadius: 12, background: '#FFFFFF', border: `1px solid ${S.border}` }}>
          <input inputMode="decimal" value={texte} onChange={(e) => setTexte(e.target.value)} className="sk-champ"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); valider(); } }}
            placeholder={fr ? '12,50' : '12.50'} aria-label={fr ? "Prix d'achat en euros" : 'Purchase price in euros'}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, color: S.ink, textAlign: 'right' }} />
          <span style={{ fontSize: 16, fontWeight: 700 }}>€</span>
        </label>
        <button type="button" className="sk-btn sk-presse" disabled={valeur == null || busy} onClick={valider}
          style={{ height: 40, padding: '0 16px', border: 'none', borderRadius: 12, background: valeur == null ? S.disabled : S.tealDeep, color: valeur == null ? S.ink2 : '#FFFFFF', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {busy ? '…' : (fr ? 'Enregistrer' : 'Save')}
        </button>
      </div>
      <button type="button" className="sk-btn" onClick={onInconnu}
        style={{ alignSelf: 'flex-start', minHeight: 40, padding: '0 4px', border: 'none', background: 'transparent', color: S.tealDeep, fontSize: 13, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>
        {fr ? 'Je ne sais plus' : "I don't remember"}
      </button>
      {erreur && <div role="status" style={{ fontSize: 12, fontWeight: 600, color: S.rouge }}>{erreur}</div>}
    </div>
  );
}

/**
 * @param {object} p
 *   p.article {photo, titre, prix, pastille}
 *   p.infos [{cle, ton, texte, titre?, onTap?}]
 *   p.mur — élément « Me connecter » (BoutonMeConnecter) quand un mur attend
 *   p.actions [{cle, icone, libelle, detail?, onTap, desactive?, danger?}]
 *   p.prixAchat {onValider(texte) → Promise<bool>, onInconnu} | null
 */
export default function MenuArticle({ lang = 'fr', article, infos = [], mur = null, actions = [], prixAchat = null, onFermer }) {
  const fr = lang !== 'en';
  const principales = actions.filter((a) => !a.danger);
  const dangereuses = actions.filter((a) => a.danger);
  return (
    <Feuille lang={lang} titre={fr ? 'Article' : 'Item'} etiquette={article?.titre} onFermer={onFermer}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: S.paper }}>
          <GalleryPhoto url={article?.photo} alt="" fallback={<span />} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="sk-deux-lignes" style={{ display: 'block', fontSize: 15, lineHeight: '20px', fontWeight: 700, overflowWrap: 'anywhere' }}>{article?.titre}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, minWidth: 0, flexWrap: 'wrap' }}>
            {article?.prix && <span className="sk-chiffres" style={{ fontSize: 13, fontWeight: 700 }}>{article.prix}</span>}
            <PastilleEtat texte={article?.pastille?.texte} ton={article?.pastille?.ton} compacte />
          </span>
        </span>
      </div>

      {infos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <IntituleSection>{fr ? 'Ce qui se passe' : "What's going on"}</IntituleSection>
          {infos.map((i) => {
            const t = TON_INFO[i.ton] ?? TON_INFO.neutre;
            const contenu = (
              <>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: '20px', fontWeight: 600, color: t.encre }}>{i.texte}</span>
                {i.onTap && <ChevronRight size={16} aria-hidden="true" style={{ flexShrink: 0, color: t.encre }} />}
              </>
            );
            const style = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 40, padding: '8px 12px', boxSizing: 'border-box', borderRadius: 12, background: t.fond, border: `1px solid ${t.bord}`, textAlign: 'left' };
            return i.onTap
              ? <button key={i.cle} type="button" className="sk-btn" title={i.titre ?? undefined} onClick={i.onTap} style={style}>{contenu}</button>
              : <div key={i.cle} title={i.titre ?? undefined} style={style}>{contenu}</div>;
          })}
        </div>
      )}

      {mur && <div style={{ padding: 16, borderRadius: 16, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}` }}>{mur}</div>}

      {principales.length > 0 && (
        <div style={{ borderRadius: 16, overflow: 'hidden', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}` }}>
          {principales.map((a) => <LigneAction key={a.cle} {...a} />)}
        </div>
      )}

      {prixAchat && <SaisiePrixAchat lang={lang} onValider={prixAchat.onValider} onInconnu={prixAchat.onInconnu} />}

      {dangereuses.length > 0 && (
        <div style={{ borderRadius: 16, overflow: 'hidden', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}` }}>
          {dangereuses.map((a) => <LigneAction key={a.cle} {...a} />)}
        </div>
      )}
    </Feuille>
  );
}
