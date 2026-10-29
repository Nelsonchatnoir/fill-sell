// Clavier ou pointeur (29/10, cadre bleu vu sur iPhone en touchant un graphe du Tableau) :
// pose <html data-saisie="pointeur|clavier"> selon la DERNIÈRE saisie. Les écrans du Tableau
// et des Statistiques (bureau.css) n'affichent un repère de focus, à leurs couleurs, qu'au
// clavier : jamais de cadre au toucher ni à la souris, même là où le navigateur en dessine un
// (iOS sur un élément SVG focalisable). Un seul écouteur pour toute l'app, posé à la première
// ouverture d'un de ces écrans ; phase de capture, donc avant le focus que le toucher déclenche.
let pose = false;

export function suivreSaisie() {
  if (pose || typeof document === 'undefined') return;
  pose = true;
  const racine = document.documentElement;
  const poser = (v) => { if (racine.dataset.saisie !== v) racine.dataset.saisie = v; };
  document.addEventListener('pointerdown', () => poser('pointeur'), true);
  document.addEventListener('keydown', (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) poser('clavier'); }, true);
}
