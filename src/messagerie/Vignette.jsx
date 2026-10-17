// ═══════════════════════════════════════════════════════════════════════════
// LA VIGNETTE D'UNE CONVERSATION OU D'UNE COMMANDE — bêta (17/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Constat de Nico (17/10, iPhone) : la conversation @genevieve-69 montrait une
// image cassée « ? ». Cause : la photo de la fiche rattachée
// (photosParInventaire[id]) est une LISTE — chaînes du CDN ou objets {url} —,
// passée telle quelle à <img src> : le navigateur recevait « url1,url2 ».
// La règle, la même pour Messages et À expédier :
//   1. la photo de l'annonce (relevée sur la plateforme) ;
//   2. sinon, les photos de la fiche du stock rattachée, lues par le
//      normaliseur unique (utils/photos.js) ;
//   3. une image qui ne se charge pas (erreur, ou 0 px) passe à la suivante ;
//      plus rien : une icône neutre. Jamais une image cassée.
import { useState } from 'react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import Icone from '../ecrans/Icone';
// Les sources, dans l'ordre : sourcesVignette (vue.js, testée).

export default function Vignette({ sources = [], platform, taille = 52, icone = 'etiquette' }) {
  const cle = sources.join('\n');
  // Les échecs valent pour CES sources : une autre liste repart de la première.
  const [echecs, setEchecs] = useState({ cle, n: 0 });
  const rang = echecs.cle === cle ? echecs.n : 0;
  const src = sources[rang] ?? null;
  const suivante = () => setEchecs({ cle, n: rang + 1 });
  return (
    <div data-vignette={src ? 'photo' : 'icone'}
      style={{ position: 'relative', width: taille, height: taille, borderRadius: 14, overflow: 'hidden', background: '#F2F0E9', flex: 'none' }}>
      {src
        ? <img key={src} src={src} alt="" loading="lazy" decoding="async" onError={suivante}
            onLoad={(e) => { if (!e.currentTarget.naturalWidth) suivante(); }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icone nom={icone} taille={Math.round(taille * 0.38)} couleur="#B5B0A3" epaisseur={1.8} />
          </span>}
      {platform ? (
        <span style={{ position: 'absolute', right: 3, bottom: 3, width: 20, height: 20, borderRadius: 7, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(16,32,27,.18)' }}>
          <PlatformLogo platform={platform} size={14} />
        </span>
      ) : null}
    </div>
  );
}
