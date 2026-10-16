// Icônes SVG des écrans du 16/10 (tracés des maquettes validées par Nico).
// ⛔ Aucun émoji dans ces écrans : une icône est toujours un SVG d'ici.
const TRACES = {
  synchro: <><path d="M21 12a9 9 0 0 0-15.5-6.2L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 15.5 6.2L21 16" /><path d="M21 21v-5h-5" /></>,
  colis: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7 12 12l8.7-5" /><path d="M12 22V12" /></>,
  lens: <><circle cx="12" cy="12" r="9" /><path d="M14.3 3.3 9 12.5" /><path d="M20.7 9H10" /><path d="M18.9 17.5 13.6 8.3" /><path d="M9.7 20.7 15 11.5" /><path d="M3.3 15H14" /><path d="M5.1 6.5l5.3 9.2" /></>,
  ia: <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z" /></>,
  ia2: <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" /></>,
  cloche: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  courbe: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  loupe: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  poubelle: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
  fleche: <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>,
  coche: <path d="M5 12l5 5 9-10" />,
  etiquette: <><path d="M20 12l-8 8-9-9V3h8z" /><circle cx="7.5" cy="7.5" r="1" /></>,
  barres: <><path d="M3 3v18h18" /><path d="M8 17v-6" /><path d="M13 17V7" /><path d="M18 17v-4" /></>,
  diamant: <><path d="M6 3h12l4 6-10 12L2 9z" /><path d="M2 9h20" /></>,
  calendrier: <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4" /><path d="M16 2v4" /><path d="M3 10h18" /><path d="M12 14v3l2 1" /></>,
  alerte: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" /></>,
  horloge: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  envoi: <><path d="M12 15V3" /><path d="M7 8l5-5 5 5" /><path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" /></>,
  haut: <><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></>,
  tshirt: <><path d="M20.4 6.5 12 3 3.6 6.5 5 9l2-1v12h10V8l2 1z" /><path d="M9.5 3.8a2.6 2.6 0 0 0 5 0" /></>,
  retour: <><path d="M9 14l-5-5 5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
  ampoule: <><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" /></>,
  recu: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6" /><path d="M9 12h6" /></>,
  croix: <><path d="M18 6 6 18" /><path d="M6 6l12 12" /></>,
  // Catégories (vignette d'une vente sans photo) — un tracé par catégorie.
  telephone: <><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></>,
  maison: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></>,
  bouilloire: <><path d="M6 20h12l-1-11H7z" /><path d="M17 11h2a2 2 0 0 1 0 4h-1.5" /><path d="M9 9V6h6v3" /></>,
  note: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  ballon: <><circle cx="12" cy="12" r="9" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M3 12h18" /></>,
  jouet: <><path d="M5 8h14v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" /><circle cx="9.5" cy="12.5" r="1" /><circle cx="14.5" cy="12.5" r="1" /><path d="M8 8V5a2 2 0 0 1 4 0v3" /></>,
  livre: <><path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" /><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z" /></>,
  goutte: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  voiture: <><path d="M5 17h14v-5l-2-5H7l-2 5z" /><circle cx="8" cy="17" r="2" /><circle cx="16" cy="17" r="2" /><path d="M5 12h14" /></>,
  etoile: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  ecran: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8" /><path d="M12 16v4" /></>,
  feuille: <><path d="M20 4C10 4 4 10 4 20c10 0 16-6 16-16z" /><path d="M4 20 14 10" /></>,
  marteau: <><path d="M14 4l6 6-3 3-6-6z" /><path d="M11 7 3 15l3 3 8-8" /></>,
};

// Une catégorie de l'app → son tracé (repli : le colis).
const PAR_CATEGORIE = {
  'Mode': 'tshirt', 'Luxe': 'diamant', 'High-Tech': 'telephone', 'Maison': 'maison', 'Électroménager': 'bouilloire',
  'Jouets': 'jouet', 'Livres': 'livre', 'Sport': 'ballon', 'Auto-Moto': 'voiture', 'Beauté': 'goutte', 'Musique': 'note',
  'Collection': 'etoile', 'Jardin': 'feuille', 'Bricolage': 'marteau', 'Multimédia': 'ecran',
};
export function IconeCategorie({ type, taille = 24, couleur = '#5C6560' }) {
  const cle = Object.keys(PAR_CATEGORIE).find((k) => k.toLowerCase() === String(type ?? '').toLowerCase());
  return <Icone nom={cle ? PAR_CATEGORIE[cle] : 'colis'} taille={taille} couleur={couleur} epaisseur={1.8} />;
}

export default function Icone({ nom, taille = 18, couleur = 'currentColor', epaisseur = 2, style, className }) {
  const t = TRACES[nom];
  if (!t) return null;
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth={epaisseur}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style} className={className}>
      {t}
    </svg>
  );
}

// Couronne pleine (Pro, Premium) — remplie, pas en trait.
export function Couronne({ taille = 14, couleur = '#F2D38A' }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill={couleur} aria-hidden="true" focusable="false">
      <path d="M3 18h18l-1.5-10-5 4L12 5l-2.5 7-5-4z" />
    </svg>
  );
}
