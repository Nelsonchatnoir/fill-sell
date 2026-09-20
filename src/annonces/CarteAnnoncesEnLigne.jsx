// ═══════════════════════════════════════════════════════════════════════════
// MES ANNONCES EN LIGNE — LA CARTE (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Remplace components/RelevesPlateformes.jsx, supprimé. Deux états, un seul
// composant :
//   · AU REPOS   cinq tuiles, une par plateforme : logo, pastille d'état,
//                nombre d'annonces, un mot. Plus ce qui empêche, dit en clair.
//   · EN COURS   la constellation, le nom de la plateforme RÉELLEMENT en
//                cours, et une barre branchée sur le nombre de plateformes
//                terminées.
//
// ⛔ RIEN N'EST INVENTÉ À L'ÉCRAN. Tout vient de `lireVague` / `etatTuile` /
//    `lireBilan` (etatReleve.js), qui ne lisent que les runs. Une plateforme
//    sans état exploitable est « en attente », jamais un faux progrès.
// ⛔ UN RELEVÉ N'EST PAS UNE PUBLICATION : aucun quota, aucun palier, aucun
//    coin_ledger. Le chemin passe par les deux RPC de relevé, et par rien
//    d'autre.
// ⛔ Le repli « détail par plateforme » est SUPPRIMÉ avec l'ancien bloc : ce
//    qu'il cachait (le motif d'une plateforme qui ne remonte rien) est
//    maintenant sur la carte, en ambre, sans rien à déplier.
import { useMemo, useState } from 'react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import OplaAutorisationModal from '../components/OplaAutorisationModal';
import InstallExtensionCta from '../components/InstallExtensionCta';
import { LABEL_RELEVE } from '../utils/syncPlateformes';
import { useReleveAnnonces } from './useReleveAnnonces';
import { etatTuile, lireVague, lireBilan, ilYA } from './etatReleve';
import { textesAnnonces } from './textes';
import { A, DEGRADE, CSS_ANNONCES } from './theme';
import ConstellationReleve from './ConstellationReleve';
import EcranRattachement from './EcranRattachement';

const nombreLisible = (n, fr) => (typeof n === 'number' && Number.isFinite(n)
  ? n.toLocaleString(fr ? 'fr-FR' : 'en-GB')
  : n);

export default function CarteAnnoncesEnLigne({
  lang, user, isNative = false, items = [], ouvert = false,
  extensionStatus = null, plateformes = null, onRattache = null,
  lancerVinted = null, etatVinted = null, ligneVinted = null,
}) {
  const T = useMemo(() => textesAnnonces(lang), [lang]);
  const r = useReleveAnnonces({ lang, user, ouvert, plateformes, lancerVinted, etatVinted });
  const [ecran, setEcran] = useState(false);
  const { fr } = r;

  const vague = useMemo(
    () => lireVague({ plateformes: r.plateformes, runs: r.runs, runVinted: r.runVinted, etatVinted }),
    [r.plateformes, r.runs, r.runVinted, etatVinted],
  );
  const bilan = useMemo(
    () => lireBilan({ plateformes: r.plateformes, runs: r.runs, runVinted: r.runVinted }),
    [r.plateformes, r.runs, r.runVinted],
  );
  const tuiles = useMemo(() => r.plateformes.map((p) => ({
    p,
    nom: LABEL_RELEVE[p] ?? p,
    e: etatTuile({
      run: p === 'vinted' ? r.runVinted : (r.runs[p] ?? null),
      vinted: p === 'vinted', etatVinted, T, fr, pip: A,
    }),
  })), [r.plateformes, r.runs, r.runVinted, etatVinted, T, fr]);

  if (!ouvert || !r.userId) return null;

  const extVue = Number.isFinite(Date.parse(extensionStatus?.lastSeenAt ?? ''));
  const nbARattacher = r.aRattacher.length;
  const enCours = vague.active;
  const occupe = !!r.busy || r.toutBusy;

  // ── LE SOUS-TITRE : l'état, en une ligne, jamais une promesse ─────────────
  const sousTitre = (() => {
    if (enCours) return T.sousEnCours(vague.faites.length, vague.total);
    // Un délai de cadence qui EMPÊCHE de relever se dit ici, pas ailleurs.
    if (etatVinted?.cadenceTexte) return etatVinted.cadenceTexte;
    if (bilan.dernierFini == null) return T.sousJamais;
    return T.sousRepos(ilYA(new Date(bilan.dernierFini).toISOString(), fr), bilan.total);
  })();

  const ctaTexte = enCours ? T.ctaEnCours : r.toutBusy ? T.ctaEnvoi : extVue ? T.ctaTout : T.ctaExtension;
  const ctaInactif = enCours || occupe || !extVue;

  // Ce qui empêche une plateforme de rendre quoi que ce soit — une bande par
  // plateforme concernée, en ambre, jamais en rouge : ce n'est pas un échec.
  const empechees = tuiles.filter((t) => t.e.phase === 'absente').map((t) => t.p);
  const signaux = [
    ...tuiles.filter((t) => t.e.phase === 'absente')
      .map((t) => ({ cle: t.p, texte: t.e.opla ? T.signalOpla : T.signalNonConnecte(t.nom) })),
    ...tuiles.filter((t) => t.e.phase === 'echec')
      .map((t) => ({
        cle: t.p,
        texte: T.signalEchec(t.nom, String((r.runs[t.p]?.erreur) ?? '').replace(/^\[incomplet\]\s*/, '').slice(0, 90) || null),
      })),
    // « Ordinateur éteint » : le run a expiré côté serveur. On le dit sans
    // accuser — c'est une machine qui dormait, pas une faute.
    ...(tuiles.some((t) => t.e.phase === 'expire') ? [{ cle: '_expire', texte: T.extensionEndormie }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{CSS_ANNONCES}</style>

      <div style={{ background: A.card, border: `1px solid ${A.border}`, borderRadius: 20, padding: '16px 16px 14px', boxShadow: '0 1px 4px rgba(16,32,27,.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', color: A.ink }}>{T.titre}</div>
            <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 500, color: A.texteSecondaire, fontVariantNumeric: 'tabular-nums' }}>
              {sousTitre}
            </div>
          </div>
          <button
            type="button"
            className="rv-cta rv-focus"
            onClick={() => { if (!ctaInactif) r.toutRelever(); }}
            disabled={ctaInactif}
            style={{
              flexShrink: 0, minHeight: 40, padding: '0 16px', borderRadius: 999, border: 'none',
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
              color: ctaInactif ? A.texteSecondaire : '#FFFFFF',
              background: ctaInactif ? A.chip : DEGRADE,
              cursor: ctaInactif ? 'default' : 'pointer',
              boxShadow: ctaInactif ? 'none' : '0 10px 20px -12px rgba(47,158,144,.9)',
            }}
          >
            {ctaTexte}
          </button>
        </div>

        {/* ── AU REPOS : les plateformes, à l'écran ─────────────────────────
            Le logo, ce qui a été relevé, et l'état en un mot. Une plateforme à
            connecter le DIT ici. Un tap relève cette plateforme-là. */}
        {!enCours && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, tuiles.length)},minmax(0,1fr))`, gap: 6, marginTop: 14 }}>
            {tuiles.map(({ p, nom, e }, k) => {
              const cliquable = !occupe && extVue && e.phase !== 'en_cours';
              return (
                <button
                  key={p}
                  type="button"
                  className="rv-up rv-focus"
                  disabled={!cliquable}
                  onClick={() => r.lancer(p)}
                  aria-label={T.tuileAria(nom, e.phase === 'fait' ? `${e.n} ${e.mot}` : e.mot)}
                  /* L'âge du dernier relevé de CETTE plateforme : la tuile n'a
                     pas la place de l'écrire, le sous-titre ne donne que le
                     plus récent des cinq. */
                  title={e.depuis ? `${nom} · ${e.depuis}` : nom}
                  style={{
                    position: 'relative', background: A.paper,
                    border: `1px solid ${e.phase === 'absente' ? A.ambreBord : A.borderSoft}`,
                    borderRadius: 14, padding: '11px 4px 9px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    fontFamily: 'inherit', cursor: cliquable ? 'pointer' : 'default', minWidth: 0,
                    animationDelay: `${k * 45}ms`,
                  }}
                >
                  <span aria-hidden="true" style={{
                    position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4,
                    border: '1.5px solid #FFFFFF', background: e.pip,
                  }} />
                  <PlatformLogo platform={p} size={24} desature={e.phase === 'absente' || e.phase === 'jamais'} />
                  <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1, color: A.ink, fontVariantNumeric: 'tabular-nums' }}>
                    {nombreLisible(e.n, fr)}
                  </span>
                  <span style={{
                    fontSize: 9.5, fontWeight: 600, lineHeight: 1.2, textAlign: 'center', width: '100%',
                    color: e.phase === 'absente' ? A.ambreEncre : A.texteSecondaire,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {e.mot}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── EN COURS : la constellation et l'avancement RÉEL ──────────────
            `vague.enCours` est la plateforme dont le run est 'running'. Aucune
            en 'running' mais des demandes en file → on dit qu'on attend
            l'ordinateur, on n'invente pas un nom. */}
        {enCours && (
          <div className="rv-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '22px 0 8px' }}>
            <ConstellationReleve
              membres={vague.membres}
              faites={vague.faites}
              enCours={vague.enCours}
              empechees={empechees}
              labels={LABEL_RELEVE}
            />
            <div style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.3, fontWeight: 700, color: A.ink, textAlign: 'center' }}>
                {vague.enCours
                  ? T.enCoursDe(LABEL_RELEVE[vague.enCours] ?? vague.enCours)
                  : (vague.faites.length === vague.total ? T.enCoursRange : T.enCoursAttente)}
              </div>
              <div style={{ position: 'relative', width: '100%', height: 5, borderRadius: 3, background: A.chip, overflow: 'hidden' }}>
                {/* ⛔ scaleX = plateformes TERMINÉES / plateformes de la vague.
                    Pas une animation, pas une durée estimée. */}
                <span style={{
                  position: 'absolute', inset: 0, borderRadius: 3, background: DEGRADE,
                  transformOrigin: 'left', transform: `scaleX(${vague.avancement})`,
                  transition: 'transform .5s cubic-bezier(.22,.61,.36,1)',
                }} />
                {vague.enCours && (
                  <span aria-hidden="true" style={{
                    position: 'absolute', top: 0, bottom: 0, width: '28%',
                    background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent)',
                    animation: 'rvBalaye 1.7s ease-in-out infinite',
                  }} />
                )}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 500, color: A.texteSecondaire, textAlign: 'center', lineHeight: 1.45 }}>
                {T.enCoursSous}
              </div>
            </div>
          </div>
        )}

        {/* Ce qui reste à trancher — SEULEMENT s'il y a vraiment quelque chose,
            et seulement au repos : pendant un relevé le compte bouge encore. */}
        {!enCours && nbARattacher > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${A.borderSoft}` }}>
            <span aria-hidden="true" style={{
              width: 26, height: 26, borderRadius: 9, flexShrink: 0, background: A.ambreFond,
              border: `1px solid ${A.ambreBord}`, color: A.ambreEncre, fontSize: 12, fontWeight: 700, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{nbARattacher > 99 ? '99+' : nbARattacher}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.45, color: A.ink }}>{T.anomalie(nbARattacher)}</span>
            <button type="button" className="rv-focus" onClick={() => setEcran(true)}
              style={{
                flexShrink: 0, minHeight: 36, padding: '0 14px', borderRadius: 999,
                border: `1px solid ${A.border}`, background: A.card, color: A.tealDeep,
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
              {T.anomalieCta}
            </button>
          </div>
        )}

        {/* Les empêchements : une bande par plateforme, en ambre. Le relevé des
            autres a marché — c'est un état mixte, pas un échec global. */}
        {!enCours && signaux.map((s) => (
          <div key={s.cle} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, padding: '10px 12px', borderRadius: 12, background: A.ambreFond, border: `1px solid ${A.ambreBord}` }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, marginTop: 6, borderRadius: 3, flexShrink: 0, background: A.pipWarn }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 1.5, color: A.ambreEncre }}>{s.texte}</span>
          </div>
        ))}

        {/* Les refus de cadence et les demandes déjà en file : sur la carte,
            jamais cachés. */}
        {r.message && (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: A.ambreFond, border: `1px solid ${A.ambreBord}`, fontSize: 11.5, lineHeight: 1.5, color: A.ambreEncre }}>
            {r.message.texte}
          </div>
        )}

        {/* Sans extension, le relevé ne peut pas partir. On le dit, et on mène
            à l'installation — pas un simple constat. */}
        {!extVue && (
          <div style={{ marginTop: 12 }}>
            <InstallExtensionCta
              lang={lang} isNative={isNative} userId={r.userId} userEmail={user?.email ?? null}
              source="stock_annonces" message={T.extensionAbsente}
            />
          </div>
        )}
      </div>

      <p style={{ margin: 0, padding: '0 4px', fontSize: 11.5, lineHeight: 1.5, color: A.texteSecondaire }}>{T.note}</p>

      {/* ⛔ CETTE LIGNE EST MONTÉE, PAS AFFICHÉE — et c'est délibéré.
          `ligneVinted` est VintedDressingSync en variante « ligne » : c'est LUI
          qui porte l'état du relevé Vinted (sonde d'extension, poll de
          progression), qui publie `lancer` au parent (registerLancer) et qui
          remonte `etatVinted` (registerEtat). Le démonter casserait « Tout
          relever » et ferait perdre le suivi en cours. La carte, elle, rend
          Vinted comme les quatre autres : une tuile, un satellite. */}
      {ligneVinted && <div aria-hidden="true" style={{ display: 'none' }}>{ligneVinted}</div>}

      {ecran && (
        <EcranRattachement
          lang={lang} items={items} annonces={r.aRattacher}
          onClose={() => setEcran(false)}
          onDecision={() => { r.recharger(); if (typeof onRattache === 'function') onRattache(); }}
        />
      )}

      {/* La modale Opla — au clic sur sa tuile, sur place. À sa fermeture on
          relit l'autorisation : la personne vient peut-être de l'accorder. */}
      {r.oplaModale && (
        <OplaAutorisationModal lang={lang} contexte="releve" onClose={r.fermerOplaModale} />
      )}
    </div>
  );
}
