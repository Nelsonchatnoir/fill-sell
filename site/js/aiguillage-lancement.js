// Lancement de l'aiguillage EN LIGNE (09/10/2026) : entrée du bundle IIFE que
// le générateur injecte dans le <head> de chaque page vitrine. La logique vit
// dans aiguillage.js (testée) ; ici, seulement le branchement sur la page :
// `data-racine="1"` sur la page « / », la clé exacte du jeton de session
// remplacée au build (lue dans src/lib/supabase.js).
import { aiguiller } from './aiguillage.js';

// Classe « js » posée AVANT la première peinture : la CSS ne replie le menu
// mobile derrière son bouton que si le JavaScript tourne. Si site.js prend un
// 404 au CDN, l'attribut onerror de son <script> la retire et la navigation
// redevient visible — jamais un bouton de menu mort (revue de la fondation I-8).
try { document.documentElement.classList.add('js'); } catch { /* sans DOM : rien à replier */ }

const script = document.currentScript;
aiguiller(window, {
  racine: !!script && script.getAttribute('data-racine') === '1',
  cleJeton: __FS_CLE_JETON__,
});
