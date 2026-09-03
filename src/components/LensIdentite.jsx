import { getTypeStyle, typeLabel, CAT_TILE_COLORS } from '../utils/shared';

// ══════════════════════════════════════════════════════════════════════════
// L'identification, rendue lisible (11/08/2026)
// ══════════════════════════════════════════════════════════════════════════
// Avant : un titre en gras, puis six pastilles grises de même poids où la
// marque, la matière et la confiance se valaient. Tout le travail de lecture
// que fait le Lens — la tension d'une batterie lue sur la plaque, la capacité
// gravée au dos d'un téléphone, la référence d'une pièce auto — n'était affiché
// NULLE PART : `attributs_visibles` partait directement dans les aspects eBay
// sans jamais passer devant l'utilisateur.
//
// Ce composant montre ce qui a réellement été LU. C'est la seule chose qui rende
// une identification impressionnante : pas une affirmation, des preuves.
//
// Trois partis pris :
//  1. La tuile de catégorie porte l'objet. Grande, colorée, elle donne l'humeur
//     du résultat avant même la lecture du titre.
//  2. « Aucune marque lisible » s'AFFICHE au lieu de laisser un vide. C'est le
//     cœur du correctif du 11/08 : une marque nulle est une bonne réponse, pas
//     une absence — et le dire construit la confiance bien mieux que de masquer.
//  3. La note du modèle (« quelle photo trancherait ») devient une invitation
//     visible, pas une ligne d'italique en bas de page. C'est la boucle : on sait
//     quoi photographier ensuite, donc on recommence.

const TEAL      = '#2F9E90';
const TEAL_DEEP = '#1B6E62';
const INK       = '#10201B';
const MUTE      = '#6B7A75';

// Libellés humains des clés d'attributs. Le sac est OUVERT côté serveur : toute
// clé inconnue passe par humaniserCle() plutôt que d'être masquée — un attribut
// lu sur l'objet ne doit jamais disparaître parce qu'on n'a pas prévu son nom.
const LABELS_FR = {
  taille:'Taille', coupe:'Coupe', composition:'Composition', saison:'Saison',
  pointure:'Pointure', semelle:'Semelle', boite_origine:'Boîte d’origine',
  filaire_ou_sans_fil:'Alimentation', tension_batterie:'Tension', nb_batteries:'Batteries',
  chargeur_inclus:'Chargeur', coffret:'Coffret', fonctionne:'Fonctionne',
  accessoires_manquants:'Accessoires manquants', accessoires_inclus:'Accessoires',
  puissance:'Puissance', capacite:'Capacité', taille_ecran:'Écran',
  generation_annee:'Génération', cables_inclus:'Câbles', boite:'Boîte',
  etat_ecran:'État de l’écran', verrouillage_compte:'Verrouillage',
  hauteur:'Hauteur', largeur:'Largeur', longueur:'Longueur', materiau:'Matériau',
  demontable:'Démontable', notice_visserie:'Notice / visserie', nb_pieces:'Pièces',
  tranche_age:'Âge', complet:'Complet', annee_periode:'Époque', edition:'Édition',
  tirage:'Tirage', signature:'Signature', vehicules_compatibles:'Compatible',
  cote:'Côté', oem_ou_adaptable:'Origine', auteur:'Auteur', editeur:'Éditeur',
  annee:'Année', isbn_ean:'ISBN / EAN', discipline:'Discipline', niveau:'Niveau',
  norme_certification:'Norme', volume:'Volume', nom_parfum:'Parfum', teinte:'Teinte',
  entame:'Entamé', dluo:'DLUO', type_instrument:'Instrument', format:'Format',
  etat_disque:'Disque', etat_pochette:'Pochette', motorisation:'Motorisation',
  largeur_coupe:'Largeur de coupe', reference_fabricant:'Référence',
  type_outil:'Type d’outil',
};

const LABELS_EN = {
  taille:'Size', coupe:'Fit', composition:'Composition', saison:'Season',
  pointure:'Shoe size', semelle:'Sole', boite_origine:'Original box',
  filaire_ou_sans_fil:'Power', tension_batterie:'Voltage', nb_batteries:'Batteries',
  chargeur_inclus:'Charger', coffret:'Case', fonctionne:'Working',
  accessoires_manquants:'Missing parts', accessoires_inclus:'Accessories',
  puissance:'Power', capacite:'Capacity', taille_ecran:'Screen',
  generation_annee:'Generation', cables_inclus:'Cables', boite:'Box',
  etat_ecran:'Screen condition', verrouillage_compte:'Account lock',
  hauteur:'Height', largeur:'Width', longueur:'Length', materiau:'Material',
  demontable:'Flat-pack', notice_visserie:'Manual / screws', nb_pieces:'Pieces',
  tranche_age:'Age range', complet:'Complete', annee_periode:'Period', edition:'Edition',
  tirage:'Print run', signature:'Signature', vehicules_compatibles:'Fits',
  cote:'Side', oem_ou_adaptable:'OEM / aftermarket', auteur:'Author', editeur:'Publisher',
  annee:'Year', isbn_ean:'ISBN / EAN', discipline:'Discipline', niveau:'Level',
  norme_certification:'Standard', volume:'Volume', nom_parfum:'Fragrance', teinte:'Shade',
  entame:'Opened', dluo:'Best before', type_instrument:'Instrument', format:'Format',
  etat_disque:'Disc', etat_pochette:'Sleeve', motorisation:'Engine',
  largeur_coupe:'Cutting width', reference_fabricant:'Reference',
  type_outil:'Tool type',
};

/** `tension_batterie` → `Tension batterie`. Filet pour toute clé non prévue. */
function humaniserCle(cle) {
  const s = String(cle).replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function libelle(cle, lang) {
  const table = lang === 'en' ? LABELS_EN : LABELS_FR;
  return table[cle] || humaniserCle(cle);
}

// Les valeurs oui / non / non testé gagnent un symbole : dans une grille, un
// coup d'œil doit suffire. « non testé » n'est PAS un échec — c'est la réponse
// honnête pour un appareil qu'aucune photo ne montre en marche, et elle a sa
// propre couleur pour ne pas être lue comme un « non ».
const TERNAIRE = {
  oui:        { texte:{ fr:'Oui', en:'Yes' },          signe:'✓', couleur:TEAL_DEEP },
  yes:        { texte:{ fr:'Oui', en:'Yes' },          signe:'✓', couleur:TEAL_DEEP },
  non:        { texte:{ fr:'Non', en:'No' },           signe:'✕', couleur:'#B4423A' },
  no:         { texte:{ fr:'Non', en:'No' },           signe:'✕', couleur:'#B4423A' },
  'non teste':{ texte:{ fr:'Non testé', en:'Untested' }, signe:'?', couleur:'#B4762A' },
  'not tested':{ texte:{ fr:'Non testé', en:'Untested' }, signe:'?', couleur:'#B4762A' },
};

const aplatir = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function ChipAttribut({ cle, valeur, lang, index }) {
  const t = TERNAIRE[aplatir(valeur)];
  return (
    <div
      className="lens-chip"
      style={{
        animationDelay: `${90 + index * 45}ms`,
        background:'#FFFFFF',
        border:'1px solid rgba(0,0,0,0.07)',
        borderRadius:12,
        padding:'8px 10px',
        minWidth:0,
      }}
    >
      <div style={{
        fontSize:9.5, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase',
        color:MUTE, marginBottom:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
      }}>
        {libelle(cle, lang)}
      </div>
      <div style={{
        fontSize:13.5, fontWeight:700, lineHeight:1.25,
        color: t ? t.couleur : INK,
        overflowWrap:'anywhere',
      }}>
        {t ? `${t.signe} ${t.texte[lang === 'en' ? 'en' : 'fr']}` : valeur}
      </div>
    </div>
  );
}

function JaugeConfiance({ confiance, lang }) {
  const niveau = confiance === 'haute' ? 3 : confiance === 'moyenne' ? 2 : 1;
  const couleur = niveau === 3 ? TEAL : niveau === 2 ? '#D9962A' : '#C2635C';
  const texte = niveau === 3
    ? (lang === 'en' ? 'Confident' : 'Identification sûre')
    : niveau === 2
      ? (lang === 'en' ? 'Partly identified' : 'Identification partielle')
      : (lang === 'en' ? 'Uncertain' : 'Identification incertaine');
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:6 }}>
      <div style={{ display:'flex', gap:3 }}>
        {[1, 2, 3].map(i => (
          <span
            key={i}
            className={i <= niveau ? 'lens-seg' : undefined}
            style={{
              animationDelay:`${140 + i * 70}ms`,
              width:16, height:4, borderRadius:99,
              background: i <= niveau ? couleur : 'rgba(0,0,0,0.10)',
              display:'block',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize:11, fontWeight:700, color:couleur }}>{texte}</span>
    </div>
  );
}

/**
 * En-tête d'identification + fiche technique.
 *
 * Tolérant aux résultats à l'ANCIEN schéma : `attributs_visibles` absent →
 * aucune fiche, `categorie` absente → tuile neutre, `confiance` absente →
 * aucune jauge. Rien n'est obligatoire, rien ne casse.
 */
export default function LensIdentite({ result, lang }) {
  const style = getTypeStyle(result.categorie);
  const tuile = CAT_TILE_COLORS[result.categorie] || '#ECEAE4';

  const attributs = (result.attributs_visibles && typeof result.attributs_visibles === 'object')
    ? Object.entries(result.attributs_visibles).filter(([, v]) => v != null && String(v).trim())
    : [];

  const marqueLue = result.marque && String(result.marque).trim();

  // ── Identification non établie (11/08/2026, incident 10:18) ──────────────
  // Une pince Facom rendue en « Fourche à bêcher Spear & Jackson 4 dents », à
  // 22 € « basé sur 6 annonces ». Faux, détaillé, crédible : le pire des trois
  // ensemble. Quand le serveur n'a pas pu tenir l'identification, l'écran doit
  // le DIRE en premier — avant le titre, avant la tuile — et demander la photo
  // qui trancherait, plutôt que de présenter une fiche complète.
  // Deux niveaux, posés par le serveur, jamais recalculés ici :
  //   · incertaine — rien à quoi se raccrocher (1 photo, ni marque ni référence) ;
  //   · contredite — la réponse se contredisait : le prix a été retiré.
  const incertaine = result.identification_incertaine === true;
  const contredite = result.identification_contredite === true;
  // ── Objet DÉDUIT (2026-08-11) — le cran intermédiaire ────────────────────
  // Une réponse peut être parfaitement cohérente et parfaitement fausse : une
  // pince plate rendue en cisailles, avec 4 recherches web venues confirmer les
  // cisailles. Aucun des deux niveaux ci-dessus ne la voit — c'est `objet_source`
  // qui la voit, parce qu'il ne demande pas au modèle d'être d'accord avec
  // lui-même mais d'où vient ce qu'il affirme.
  // Le serveur a déjà retiré le conseil d'achat et le verdict ; il reste à le
  // DIRE, sinon leur absence se lit comme un oubli. Jamais en même temps que le
  // bandeau « incertaine », qui est plus grave et couvre déjà le cas.
  const objetDeduit = result.objet_source === 'deduit';
  const note = result.notes && String(result.notes).trim();
  // La note ne devient une invitation que si elle apporte quelque chose : sur une
  // identification sûre, le modèle n'a rien à réclamer et l'encart serait du bruit.
  // Quand le bandeau ci-dessous s'affiche, il l'absorbe — jamais deux fois.
  const noteUtile = !incertaine && result.confiance !== 'haute' && note;

  return (
    <>
      <style>{`
        @keyframes lensTuile {
          0%   { opacity:0; transform:scale(0.6) rotate(-8deg); }
          60%  { opacity:1; transform:scale(1.06) rotate(2deg); }
          100% { opacity:1; transform:scale(1) rotate(0deg); }
        }
        @keyframes lensMonte {
          from { opacity:0; transform:translateY(7px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes lensSeg {
          from { opacity:0; transform:scaleX(0.2); }
          to   { opacity:1; transform:scaleX(1); }
        }
        .lens-tuile { animation:lensTuile 0.5s cubic-bezier(0.34,1.56,0.64,1) both; }
        .lens-chip  { animation:lensMonte 0.34s cubic-bezier(0.22,1,0.36,1) both; }
        .lens-seg   { animation:lensSeg 0.3s ease-out both; transform-origin:left center; }
        .lens-note  { animation:lensMonte 0.34s cubic-bezier(0.22,1,0.36,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .lens-tuile, .lens-chip, .lens-seg, .lens-note { animation:none !important; }
        }
      `}</style>

      {/* ── Identification non établie : dit AVANT tout le reste ──
          Placé au-dessus de l'en-tête à dessein. Une fiche détaillée qui
          commence par un titre affirmatif se lit comme un résultat sûr, quelle
          que soit la jauge posée dessous. */}
      {incertaine && (
        <div
          className="lens-note"
          style={{
            background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12,
            padding:'11px 13px', marginBottom:14,
            display:'flex', gap:10, alignItems:'flex-start',
          }}
        >
          <span style={{ fontSize:16, lineHeight:1.2, flexShrink:0 }}>📸</span>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:12.5, fontWeight:800, color:'#92400E', marginBottom:3 }}>
              {lang === 'en'
                ? "I don't recognise this item with certainty"
                : 'Je ne reconnais pas cet objet avec certitude'}
            </div>
            <div style={{ fontSize:11.5, color:'#92400E', lineHeight:1.5, opacity:0.9 }}>
              {lang === 'en'
                ? 'Add one more photo — the label, the rating plate, the underside, the back — then run the analysis again. What follows is a reading, not a confirmed identification.'
                : 'Ajoute une photo — l’étiquette, la plaque signalétique, le dessous de l’objet, le dos — puis relance l’analyse. Ce qui suit est une lecture, pas une identification confirmée.'}
            </div>
            {/* La note du modèle nomme LA photo qui trancherait : elle est plus
                précise que la phrase générique ci-dessus, on la garde dessous. */}
            {note && (
              <div style={{ fontSize:11.5, color:'#92400E', lineHeight:1.45, marginTop:5, fontStyle:'italic', opacity:0.8 }}>
                {note}
              </div>
            )}
            {contredite && (
              <div style={{ fontSize:11.5, color:'#92400E', lineHeight:1.5, marginTop:6, fontWeight:600 }}>
                {lang === 'en'
                  ? 'No price was established: an estimate built on a misread object is worse than no estimate at all.'
                  : 'Aucun prix n’a été établi : une estimation fondée sur un objet mal reconnu est pire que pas d’estimation.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Objet déduit : plus léger que le bandeau ci-dessus, et exclusif de
          lui. Le prix et les annonces comparables restent affichés — ce sont
          des faits de marché, l'utilisateur doit pouvoir juger sur pièces. Ce
          qui a été retiré côté serveur, c'est ce qui l'engagerait à sortir de
          l'argent : le « Achète en dessous de X » et le verdict. */}
      {!incertaine && objetDeduit && (
        <div
          className="lens-note"
          style={{
            background:'#F5F7F6', border:'1px solid #DCE3E0', borderRadius:12,
            padding:'10px 12px', marginBottom:14,
            display:'flex', gap:9, alignItems:'flex-start',
          }}
        >
          <span style={{ fontSize:15, lineHeight:1.2, flexShrink:0 }}>🔎</span>
          <div style={{ minWidth:0, fontSize:11.5, color:'#4A5B55', lineHeight:1.5 }}>
            {lang === 'en'
              ? <>I <strong>worked this object out</strong> from the photos — I did not read it on the item. The market price and the comparable listings below are real, but they describe the object as I named it: check that name first. No purchase advice on a guess.</>
              : <>J’ai <strong>déduit</strong> cet objet des photos — je ne l’ai pas lu sur l’article. Le prix de marché et les annonces comparables ci-dessous sont réels, mais ils portent sur l’objet tel que je l’ai nommé : vérifie ce nom d’abord. Pas de conseil d’achat sur une supposition.</>}
          </div>
        </div>
      )}

      {/* ── En-tête : la tuile porte l'objet, le titre le nomme ── */}
      <div style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:14 }}>
        <div
          className="lens-tuile"
          style={{
            width:54, height:54, flexShrink:0, borderRadius:16, background:tuile,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:26,
            boxShadow:'0 4px 12px rgba(0,0,0,0.06)',
          }}
        >
          {style.emoji}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:16.5, color:INK, lineHeight:1.28 }}>
            {result.titre || (lang === 'en' ? 'Item' : 'Article')}
          </div>
          <div style={{ marginTop:3, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            {marqueLue ? (
              <span style={{ fontSize:13, fontWeight:700, color:TEAL_DEEP }}>{result.marque}</span>
            ) : (
              // Dit, pas masqué : une marque nulle est un résultat, pas un trou.
              <span style={{ fontSize:12, fontWeight:600, color:MUTE, fontStyle:'italic' }}>
                {lang === 'en' ? 'No brand legible' : 'Aucune marque lisible'}
              </span>
            )}
            {result.modele && (
              <span style={{ fontSize:12, fontWeight:600, color:MUTE }}>· {result.modele}</span>
            )}
          </div>
          {result.confiance && <JaugeConfiance confiance={result.confiance} lang={lang} />}
        </div>
      </div>

      {/* ── Fiche technique : ce qui a été LU sur l'objet ── */}
      {attributs.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{
            fontSize:9.5, fontWeight:800, letterSpacing:'0.09em', textTransform:'uppercase',
            color:MUTE, marginBottom:7,
          }}>
            {lang === 'en' ? 'Read on the item' : 'Lu sur l’objet'}
          </div>
          <div style={{
            display:'grid',
            gridTemplateColumns:'repeat(auto-fill, minmax(104px, 1fr))',
            gap:6,
          }}>
            {attributs.map(([cle, valeur], i) => (
              <ChipAttribut key={cle} cle={cle} valeur={String(valeur)} lang={lang} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── Ce qu'une photo de plus trancherait ──
          Le prompt garantit depuis le 11/08 que `notes` nomme LA photo qui
          lèverait le doute (plaque signalétique, dessous de l'objet, numéro de
          série…). C'est exploitable : on l'affiche comme une piste, pas comme
          une note de bas de page. */}
      {noteUtile && (
        <div
          className="lens-note"
          style={{
            animationDelay:'240ms',
            background:'rgba(47,158,144,0.07)',
            border:'1px solid rgba(47,158,144,0.20)',
            borderRadius:12, padding:'10px 12px', marginBottom:12,
            display:'flex', gap:9, alignItems:'flex-start',
          }}
        >
          <span style={{ fontSize:15, lineHeight:1.2, flexShrink:0 }}>📸</span>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:11.5, fontWeight:800, color:TEAL_DEEP, marginBottom:2 }}>
              {lang === 'en' ? 'One more photo would sharpen this' : 'Une photo de plus affinerait l’analyse'}
            </div>
            <div style={{ fontSize:11.5, color:MUTE, lineHeight:1.45 }}>{result.notes}</div>
          </div>
        </div>
      )}

      {/* ── Le reste de l'identification, en pastilles ──
          État, matière, couleur et catégorie : utiles, secondaires. Ils gardent
          leur forme d'origine, ils ont juste cessé d'être au même niveau que la
          marque et la confiance. */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
        {result.etat_estime && (
          <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:'#F5F3FF', color:'#7C3AED', border:'1px solid #DDD6FE' }}>{result.etat_estime}</span>
        )}
        {result.couleur && (
          <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:'#F8FAFC', color:'#475569', border:'1px solid #E2E8F0' }}>{result.couleur}</span>
        )}
        {result.matiere && (
          <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:'#FFF7ED', color:'#C2410C', border:'1px solid #FED7AA' }}>{result.matiere}</span>
        )}
        {/* Sans émoji : la tuile d'en-tête le porte déjà, le répéter ici
            faisait doublon à l'écran. La pastille garde le LIBELLÉ, que la
            tuile, elle, n'a pas. */}
        {result.categorie && (
          <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:style.bg, color:style.color, border:`1px solid ${style.border}` }}>
            {typeLabel(result.categorie, lang)}
          </span>
        )}
      </div>
    </>
  );
}
