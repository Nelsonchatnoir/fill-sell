// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LE RELEVÉ A DONNÉ — LES BANDES (2026-09-22)
// ═══════════════════════════════════════════════════════════════════════════
// Un seul composant pour TOUS les endroits où un relevé s'affiche : la carte
// du Stock, l'étape de relevé du parcours d'entrée, et son écran de fin. Sans
// lui, les trois auraient divergé — et c'est exactement ce qui manquait : le
// bouton « Me connecter » existait sur les cartes d'articles bloqués, le
// stepper et les Réglages, mais PAS là où un nouvel inscrit rencontre pour la
// première fois une plateforme non connectée.
//
// ⛔ LA RÉUSSITE PASSE EN PREMIER. Sur 7 jours, la moitié des nouveaux venus
//    dont le relevé Vinted avait parfaitement marché voyaient d'abord trois
//    bandes pour Leboncoin, Beebs et eBay — des places où ils n'ont même pas
//    de compte. L'écran donnait le sentiment que rien n'avait fonctionné. Ce
//    qui a marché se dit AVANT ce qui manque.
//
// ⛔ JAMAIS « ÉCHEC », JAMAIS « INCOMPLET », JAMAIS DE ROUGE sur un mur de
//    connexion. Une plateforme où l'on n'est pas connecté n'est pas en panne :
//    il y a un geste à faire, et le geste est là, à côté de la phrase.
//
// ⛔ AUCUNE DÉTECTION ICI. Ce composant ne décide de rien : il reçoit `murs`
//    (déjà qualifiés par `murConnexionReleve`, etatReleve.js) et les rend.
//    « Jamais vérifié » n'arrive jamais jusqu'ici — et n'affiche donc rien.
import BoutonMeConnecter from '../components/BoutonMeConnecter';
import { A } from './theme';

/** La bande verte : ce qui a marché, en tête. */
function BandeReussite({ texte }) {
  return (
    <div
      className="rv-up"
      style={{
        display: 'flex', alignItems: 'center', gap: 9, marginTop: 12,
        padding: '10px 12px', borderRadius: 12,
        background: A.menthe, border: `1px solid ${A.mentheBord}`,
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: A.pipOk }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 1.5, fontWeight: 600, color: A.tealDeep }}>
        {texte}
      </span>
    </div>
  );
}

/** Une bande ambre : le texte, et — s'il y a un geste — le geste. */
function Bande({ texte, enfant }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12,
        padding: '10px 12px', borderRadius: 12,
        background: A.ambreFond, border: `1px solid ${A.ambreBord}`,
      }}
    >
      {texte && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, marginTop: 6, borderRadius: 3, flexShrink: 0, background: A.pipWarn }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 1.5, color: A.ambreEncre }}>{texte}</span>
        </div>
      )}
      {enfant}
    </div>
  );
}

/**
 * @param {object[]} murs      [{ platform, nom, motif }] — déjà qualifiés
 * @param {object[]} signaux   [{ cle, texte }] — ce qui n'est pas un mur
 * @param {string|null} reussite  la phrase de réussite, ou null
 * @param {function|null} onOuverte  appelé quand la page de connexion s'ouvre
 */
export default function BandesReleve({
  lang = 'fr', userId = null, T, murs = [], signaux = [], reussite = null, onOuverte = null,
}) {
  if (!reussite && !murs.length && !signaux.length) return null;
  return (
    <>
      {reussite && <BandeReussite texte={reussite} />}

      {murs.map((m) => (
        <Bande
          key={`mur-${m.platform}`}
          // La phrase du mur est celle de BoutonMeConnecter (« Tu n'es pas
          // connecté à X sur ton ordinateur. ») : elle vit à UN endroit, et
          // c'est là. Ici on n'ajoute que la promesse — désormais tenue par
          // handler-watch, qui remet le relevé en file dès que la session
          // revient.
          texte={null}
          enfant={(
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <BoutonMeConnecter
                userId={userId}
                platform={m.platform}
                motif={m.motif}
                lang={lang}
                variante="ligne"
                onOuverte={onOuverte ?? undefined}
              />
              <span style={{ fontSize: 11, lineHeight: 1.45, color: A.ambreEncre, opacity: 0.85 }}>
                {T.murReprise}
              </span>
            </div>
          )}
        />
      ))}

      {signaux.map((s) => <Bande key={s.cle} texte={s.texte} />)}
    </>
  );
}
