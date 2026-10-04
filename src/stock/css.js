// ═══════════════════════════════════════════════════════════════════════════
// STOCK — LA FEUILLE DE STYLE DE LA REFONTE (posée une fois, par StockTab)
// ═══════════════════════════════════════════════════════════════════════════
// Ne vit ici que ce qui ne s'écrit pas en style inline : :active,
// :focus-visible, le défilement sans barre, la grille responsive, la coupe à
// deux lignes, les animations (transform / opacity seulement) et leur
// extinction sous « réduire les animations ». Tout préfixé sk- : aucune règle
// ne peut toucher un écran voisin.
// ⚠️ Template literal : aucun accent grave dans ce texte.
import { S } from './jetons';

export const CSS_STOCK = `
.sk-racine { font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif; color: ${S.ink}; -webkit-font-smoothing: antialiased; }
.sk-racine button { font-family: inherit; -webkit-tap-highlight-color: transparent; }
.sk-btn { cursor: pointer; }
.sk-btn:disabled { cursor: default; }
.sk-btn:focus-visible, .sk-focus:focus-visible { outline: 2px solid ${S.teal}; outline-offset: 2px; }
.sk-presse { transition: transform .12s ease-out; }
.sk-presse:active:not(:disabled) { transform: scale(.98); }
/* Le corps d'une feuille défile EN ENTIER : ses blocs ne rétrécissent jamais
   (sinon une carte à coins arrondis rogne son propre contenu). */
.sk-feuille-corps > * { flex-shrink: 0; }
.sk-defile { overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.sk-defile::-webkit-scrollbar { display: none; }
.sk-deux-lignes { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sk-une-ligne { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-chiffres { font-variant-numeric: tabular-nums; }
.sk-grille { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
@media (min-width: 640px) { .sk-grille { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 960px) { .sk-grille { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.sk-champ::placeholder { color: ${S.placeholder}; opacity: 1; }
.sk-champ::-webkit-search-cancel-button { -webkit-appearance: none; }
@keyframes skPouls { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
@keyframes skMonte { from { transform: translateY(24px); opacity: .6 } to { transform: none; opacity: 1 } }
@keyframes skFond { from { opacity: 0 } to { opacity: 1 } }
@keyframes skEntre { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
.sk-pouls { animation: skPouls 1.4s ease-in-out infinite; }
.sk-monte { animation: skMonte .2s ease-out; }
.sk-fond { animation: skFond .16s ease-out; }
.sk-entre { animation: skEntre .2s ease-out; }
@media (prefers-reduced-motion: reduce) {
  .sk-pouls, .sk-monte, .sk-fond, .sk-entre { animation: none !important; }
  .sk-presse, .sk-presse:active { transition: none; transform: none; }
}
`;
