// ── 7. LE RÉCAP — LA SEULE ÉTAPE NON PASSABLE, PARCE QU'ELLE EST LA SORTIE ──
// Elle dit l'état RÉEL de ce qui a été fait et de ce qui a été sauté, avec
// l'endroit où le reprendre, et UNE prochaine étape — jamais une promesse,
// jamais un compte à rebours.
import { E, DEGRADE } from './theme';
import { Scene, Titre, Texte, Carte, BoutonPrimaire } from './EntreeUI';
import { LIBELLE_PLATEFORME } from '../utils/stockFiltres';
import BandesReleve from '../annonces/BandesReleve';
import { textesAnnonces } from '../annonces/textes';

// Une ligne : tuile + libellé + précision + pastille d'état. Les deux tons
// passent 4,5:1 sur leur fond (menthe ou papier).
function Ligne({ glyphe, libelle, valeur, fait, mot, delai }) {
  return (
    <div className="en-monte" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: `1px solid ${E.ligneDouce}`, animationDelay: delai }}>
      <span aria-hidden="true" style={{
        width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: fait ? E.menthe : E.chip, color: fait ? E.tealDeep : E.texteSecondaire, fontSize: 12, fontWeight: 700, lineHeight: 1,
      }}>{glyphe}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: E.ink }}>{libelle}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: E.texteSecondaire, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{valeur}</span>
      </span>
      <span style={{
        flexShrink: 0, padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
        background: fait ? E.menthe : E.paper, border: `1px solid ${fait ? E.mentheBord : E.border}`,
        color: fait ? E.tealDeep : E.texteSecondaire,
      }}>{mot}</span>
    </div>
  );
}

export default function EtapeFin({ c, T, pseudo, onTerminer }) {
  const noms = c.choix.plateformes.map((p) => LIBELLE_PLATEFORME[p] ?? p);
  const extFait = c.extensionVue || c.envoi.etat === 'envoye';
  const suite = c.envoi.etat === 'envoye' ? T.finSuiteLien : c.surTelephone ? T.finSuiteTel : T.finSuiteOrdi;

  return (
    <Scene cle="fin" pied={<BoutonPrimaire onClick={onTerminer}>{T.finCta}</BoutonPrimaire>}>
      {/* La coche et ses deux ondes — le seul moment du parcours qui se
          permet une célébration, et elle tient en deux anneaux. */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 18px' }}>
        <div style={{ position: 'relative', width: 70, height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 35, border: `1.5px solid ${E.teal}`, animation: 'enOnde 2.8s ease-out infinite' }} />
          <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 35, border: `1.5px solid ${E.teal}`, animation: 'enOnde 2.8s ease-out infinite', animationDelay: '1.4s' }} />
          <div style={{ width: 70, height: 70, borderRadius: 35, background: DEGRADE, color: '#FFFFFF', fontSize: 28, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 30px -16px rgba(47,158,144,0.9)' }}>✓</div>
        </div>
      </div>

      <Titre centre>{pseudo ? T.finTitreNom(pseudo) : T.finTitre}</Titre>
      <Texte centre style={{ marginBottom: 18 }}>{T.finTexte}</Texte>

      <Carte style={{ padding: '4px 16px', borderRadius: 18 }}>
        <Ligne
          glyphe={String(noms.length)} libelle={T.finPlateformes}
          valeur={noms.length ? noms.join(', ') : T.finPlateformesVide}
          fait={noms.length > 0} mot={noms.length ? T.finPret : T.finVide} delai="0ms"
        />
        <Ligne
          glyphe="⌘" libelle={T.finExtension}
          valeur={c.envoi.etat === 'envoye' ? T.finExtEnvoye : T.finExtOu}
          fait={extFait} mot={extFait ? T.finEnvoye : T.finAFaire} delai="70ms"
        />
        {c.choix.plateformes.includes('ebay') && (
          <Ligne
            glyphe="e" libelle={T.finEbay}
            valeur={c.ebayRelie ? T.finEbayApi : T.finEbayOu}
            fait={c.ebayRelie} mot={c.ebayRelie ? T.finRelie : T.finPlusTard} delai="140ms"
          />
        )}
        <Ligne glyphe="↻" libelle={T.finRepub} valeur={T.finRepubOu} fait={false} mot={T.finARegler} delai="210ms" />
      </Carte>

      {/* ── LE MUR DE CONNEXION, DIT AVANT DE SORTIR (2026-09-22) ──────────
          Dernier écran du parcours : c'est la dernière occasion de donner le
          geste avant que la personne n'arrive dans un Stock qu'elle croira
          cassé. Même composant, même détection, même bouton que partout. */}
      <BandesReleve
        lang={c.lang}
        userId={c.user?.id ?? null}
        T={textesAnnonces(c.lang)}
        murs={c.murs}
        reussite={c.murs.length && c.releveVinted != null
          ? textesAnnonces(c.lang).reussiteReleve(LIBELLE_PLATEFORME.vinted ?? 'Vinted', c.releveVinted)
          : null}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 12, padding: '13px 16px', borderRadius: 16, background: E.menthe, border: `1px solid ${E.mentheBord}` }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, background: E.teal, animation: 'enPouls 2s ease-in-out infinite' }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.5, color: E.ink }}>{suite}</span>
      </div>
    </Scene>
  );
}
