// ── 4. LE RELEVÉ — CE QUI EST DÉJÀ EN LIGNE ─────────────────────────────────
// Il n'était annoncé NULLE PART dans l'ancien parcours : on parlait d'importer
// le dressing Vinted, et c'était tout. Ici, il est nommé pour ce qu'il est —
// on récupère les annonces DÉJÀ publiées sur les plateformes cochées — et il
// est MONTRÉ : une carte qui se remplit, une ligne de scan qui descend, des
// vignettes qui se chargent.
//
// ⛔ LE CONTRAT DE LECTURE EST MOT POUR MOT CELUI DE LA CARTE DE SYNC DU
//    STOCK : « On lit tes annonces. Rien n'est publié, modifié ni supprimé. »
// ⛔ Aucun quota, aucun palier : le relevé n'est ni une publication ni une
//    republication (cf. syncPlateformes.js). Il ne passe par AUCUN morceau du
//    chemin de publication — ce sont les RPC demander_sync_dressing et
//    demander_sync_plateforme, et rien d'autre.
// ⛔ LE BOUTON NE SE GRISE JAMAIS FAUTE D'EXTENSION. Sans elle, la demande est
//    retenue sur l'appareil et repart toute seule à la détection : on ne
//    renvoie personne cliquer une deuxième fois.
// ⛔ Les trois lignes d'exemple sont une ILLUSTRATION, pas une donnée : elles
//    ne prétendent pas montrer le stock réel, que personne ne connaît encore.
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { LIBELLE_PLATEFORME } from '../utils/stockFiltres';
import BandesReleve from '../annonces/BandesReleve';
import { textesAnnonces } from '../annonces/textes';
import { E } from './theme';
import { Scene, Kicker, Titre, Texte, BoutonPrimaire, LienDiscret, Etat } from './EntreeUI';

const EXEMPLES = [
  { titre: "Veste en jean Levi's", prix: '38,00 €', teinte: 'linear-gradient(140deg,#DCE3E9,#EDF1F4)', pf: 'vinted' },
  { titre: 'Console Switch + 2 jeux', prix: '185,00 €', teinte: 'linear-gradient(140deg,#E8E2D4,#F3EFE6)', pf: 'leboncoin' },
  { titre: 'Poussette Yoyo', prix: '240,00 €', teinte: 'linear-gradient(140deg,#E1E7DE,#F0F3EC)', pf: 'beebs' },
];

export default function EtapeReleve({ c, T, onSuivant }) {
  const cibles = c.choix.plateformes;
  const lance = c.releve.etat === 'lance';
  const enFile = c.releve.etat === 'en_file';
  const enCours = c.releve.etat === 'en_cours';
  const demande = lance || enFile;
  // On illustre avec les plateformes RÉELLEMENT cochées quand on peut.
  const lignes = EXEMPLES.map((ex, k) => ({ ...ex, pf: cibles[k] ?? cibles[0] ?? ex.pf }));

  const action = async () => {
    if (demande) { onSuivant(); return; }
    c.journaliser('releve_demande', { plateformes: cibles, extension_vue: c.extensionVue });
    await c.lancerReleve();
  };

  return (
    <Scene
      cle="releve"
      pied={(
        <>
          <BoutonPrimaire onClick={action} disabled={enCours}>
            {demande ? T.continuer : enCours ? T.relEnCours : T.relCta}
          </BoutonPrimaire>
          <Texte centre style={{ margin: '10px 0 0', fontSize: 12.5 }}>
            {lance ? T.relLance : enFile ? T.relEnFileNote : T.relSousBouton}
          </Texte>
          {!demande && <LienDiscret onClick={onSuivant} style={{ marginTop: 4 }}>{T.passer}</LienDiscret>}
        </>
      )}
    >
      <Kicker>{T.relKicker}</Kicker>
      <Titre>{T.relTitre}</Titre>
      <Texte>{T.relTexte}</Texte>

      <div className="en-anime" style={{ position: 'relative', background: E.card, border: `1px solid ${E.border}`, borderRadius: 20, padding: '14px 16px 8px', marginBottom: 12, overflow: 'hidden' }}>
        {/* La ligne de scan : ce qui se passe pendant qu'on relève. */}
        <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: `linear-gradient(90deg,transparent,${E.teal},transparent)`, animation: 'enScanne 3.4s cubic-bezier(.45,0,.55,1) infinite' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 10, borderBottom: `1px solid ${E.ligneDouce}` }}>
          <span style={{ flexShrink: 0, whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: E.texteSecondaire }}>{T.relCarte}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, background: E.menthe, border: `1px solid ${E.mentheBord}` }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: E.teal, animation: 'enPouls 1.8s ease-in-out infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: E.tealDeep }}>{T.relLectureSeule}</span>
          </span>
        </div>

        {lignes.map((l, k) => (
          <div
            key={l.titre}
            style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0',
              borderTop: k === 0 ? 'none' : `1px solid ${E.ligneDouce}`,
              animation: 'enRemonte .55s cubic-bezier(.22,.61,.36,1) backwards', animationDelay: `${k * 120}ms`,
            }}
          >
            <span aria-hidden="true" style={{ position: 'relative', width: 34, height: 34, borderRadius: 10, flexShrink: 0, overflow: 'hidden', background: l.teinte }}>
              <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg,transparent 30%,rgba(255,255,255,0.85) 50%,transparent 70%)', animation: 'enBalaye 3.4s ease-in-out infinite', animationDelay: `${k * 0.25}s` }} />
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: E.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.titre}</span>
            <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: E.ink, fontVariantNumeric: 'tabular-nums' }}>{l.prix}</span>
            <PlatformLogo platform={l.pf} size={22} />
          </div>
        ))}

        {/* Le rang fantôme : « et la suite de ton stock ». Décoratif, sans
            texte — un libellé à 50 % d'opacité ne passerait pas le contraste. */}
        <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0 13px', borderTop: `1px solid ${E.ligneDouce}`, opacity: 0.5 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: E.chip }} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ height: 8, width: '72%', borderRadius: 4, background: E.chip }} />
            <span style={{ height: 8, width: '44%', borderRadius: 4, background: E.chip }} />
          </span>
          <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, background: E.chip }} />
        </div>
      </div>

      {/* Les plateformes réellement visées, cochées à l'écran 1. */}
      {cibles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
          {cibles.map((pf) => (
            <span key={pf} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px 6px 7px', borderRadius: 999, background: E.card, border: `1px solid ${E.border}` }}>
              <PlatformLogo platform={pf} size={18} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: E.ink }}>{LIBELLE_PLATEFORME[pf] ?? pf}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '14px 16px', borderRadius: 16, background: E.menthe, border: `1px solid ${E.mentheBord}` }}>
        <span aria-hidden="true" style={{ width: 20, height: 20, marginTop: 1, borderRadius: 10, flexShrink: 0, border: `1.5px solid ${E.tealDeep}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: E.tealDeep }} />
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5, color: E.ink }}>{T.relContrat}</span>
      </div>

      {demande && (
        <div style={{ marginTop: 12 }}>
          <Etat ok={lance}>{lance ? T.relLance : T.relEnFile}</Etat>
        </div>
      )}

      {/* ── CE QUE LE RELEVÉ RENCONTRE, PENDANT QU'IL TOURNE (2026-09-22) ──
          Une plateforme sans session remonte en quelques secondes. Plutôt que
          de laisser la personne partir en croyant que tout va bien — puis
          découvrir trois bandes ambre dans le Stock —, on le dit ICI, avec le
          bouton. Le même composant que la carte du Stock : une seule vérité.
          Rien tant qu'aucun mur n'est NOMMÉ : un relevé qui tourne n'affiche
          pas de reproche. */}
      <BandesReleve
        lang={c.lang}
        userId={c.user?.id ?? null}
        T={textesAnnonces(c.lang)}
        murs={c.murs}
        reussite={c.murs.length && c.releveVinted != null
          ? textesAnnonces(c.lang).reussiteReleve(LIBELLE_PLATEFORME.vinted ?? 'Vinted', c.releveVinted)
          : null}
      />
    </Scene>
  );
}
