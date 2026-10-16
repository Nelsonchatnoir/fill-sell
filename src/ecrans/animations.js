// ═══════════════════════════════════════════════════════════════════════════
// ÉCRANS TABLEAU · STOCK VIDE · VENTES · STATS — LES ANIMATIONS (16/10)
// ═══════════════════════════════════════════════════════════════════════════
// Maquettes validées par Nico le 16/10 (fillsell-ecrans-vides.html,
// fillsell-ecrans-pleins.html). Règles posées par Nico :
//   · CSS UNIQUEMENT, léger, fluide sur un Android d'entrée de gamme : on
//     n'anime que transform et opacity, sauf trois tracés SVG (stroke-dash)
//     de petite taille. Les animations SMIL de la maquette (<animate>,
//     <animateMotion>) sont réécrites ici en CSS ;
//   · écrans PLEINS : l'entrée se joue UNE fois à l'ouverture de l'onglet
//     (chiffres, courbes, barres, anneaux) ; seul le point « live » boucle ;
//   · écrans VIDES : boucles douces, mises en pause hors de l'écran (Boucle.jsx) ;
//   · prefers-reduced-motion : AUCUNE animation, et l'état affiché est l'état
//     final (chaque élément a son état d'arrivée comme style de base).
// Préfixe `fsx-` : aucune collision avec les classes existantes de l'app.
export const CSS_ECRANS = `
/* ── Entrées (écrans pleins) ─────────────────────────────────────────── */
@keyframes fsx-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes fsx-growY{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes fsx-growX{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes fsx-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes fsx-fade{from{opacity:0}to{opacity:1}}
@keyframes fsx-popin{0%{opacity:0;transform:scale(.3)}70%{opacity:1;transform:scale(1.18)}100%{opacity:1;transform:scale(1)}}
@keyframes fsx-ring{from{stroke-dasharray:0 100}}
@keyframes fsx-ping{0%{transform:scale(1);opacity:.5}100%{transform:scale(3.2);opacity:0}}
@keyframes fsx-shine{0%,70%{transform:translateX(-130%)}100%{transform:translateX(260%)}}
@keyframes fsx-odo{from{transform:translateY(0)}}
.fsx-rise{animation:fsx-rise .7s cubic-bezier(.22,1,.36,1) both}
.fsx-gy{transform-origin:50% 100%;animation:fsx-growY .9s cubic-bezier(.22,1,.36,1) both}
.fsx-gx{transform-origin:0 50%;animation:fsx-growX 1s cubic-bezier(.22,1,.36,1) both}
.fsx-draw{stroke-dasharray:1;animation:fsx-draw 1.5s cubic-bezier(.65,0,.35,1) both}
.fsx-fade{animation:fsx-fade .8s ease both}
.fsx-popin{transform-box:fill-box;transform-origin:center;animation:fsx-popin .55s cubic-bezier(.34,1.56,.64,1) both}
.fsx-ring{animation:fsx-ring 1.3s cubic-bezier(.65,0,.35,1) both}
.fsx-ping{transform-box:fill-box;transform-origin:center;animation:fsx-ping 2.2s ease-out infinite}
.fsx-shine{position:absolute;top:0;bottom:0;left:0;width:40%;pointer-events:none;background:linear-gradient(100deg,rgba(255,255,255,0),rgba(140,224,212,.35),rgba(255,255,255,0));animation:fsx-shine 4.5s ease-in-out 1s infinite}
/* Compteur (Compteur.jsx) : chaque chiffre est une colonne 0-9 qui roule
   jusqu'à sa valeur — le « compteur » de la maquette, sans une ligne de JS. */
.fsx-odo{position:relative;font-variant-numeric:tabular-nums;display:inline-flex;align-items:flex-start;height:1.12em;line-height:1.12em;overflow:hidden;vertical-align:bottom;white-space:nowrap}
.fsx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.fsx-odo-c{display:inline-block;height:1.12em;overflow:hidden}
.fsx-odo-c>span{display:block;transform:translateY(calc(var(--d) * -1.12em));animation:fsx-odo 1.1s cubic-bezier(.22,1,.36,1) both}
.fsx-odo-c>span>i{display:block;height:1.12em;font-style:normal;text-align:center}
.fsx-odo-s{display:inline-block;white-space:pre}

/* ── Boucles (écrans vides) ──────────────────────────────────────────── */
@keyframes fsx-blink{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes fsx-capA{0%,30%{opacity:1;transform:none}36%,94%{opacity:0;transform:translateY(-4px)}100%{opacity:1}}
@keyframes fsx-capB{0%,44%{opacity:0;transform:translateY(4px)}50%,86%{opacity:1;transform:none}92%,100%{opacity:0}}
@keyframes fsx-flux{to{stroke-dashoffset:-16}}
@keyframes fsx-monte{0%{transform:translate(var(--x),var(--y));opacity:0}4%{opacity:1}26%{opacity:1}30%{transform:translate(155px,112px)}31%,100%{transform:translate(155px,112px);opacity:0}}
@keyframes fsx-repart{0%,49%{transform:translate(155px,112px);opacity:0}50%{transform:translate(155px,112px)}52%{opacity:1}73%{opacity:1}76%{transform:translate(var(--x),var(--y))}77%,100%{transform:translate(var(--x),var(--y));opacity:0}}
@keyframes fsx-onde{0%,33%{transform:scale(1);opacity:0}34%{opacity:.55}46%{transform:scale(1.65);opacity:0}100%{transform:scale(1.65);opacity:0}}
@keyframes fsx-coche{0%,76%{opacity:0;transform:scale(.6)}80%,95%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1)}}
@keyframes fsx-scan{0%,100%{transform:translateY(0)}50%{transform:translateY(73px)}}
@keyframes fsx-pop{0%,12%{opacity:0;transform:scale(.7)}20%,84%{opacity:1;transform:scale(1)}92%,100%{opacity:0;transform:scale(.94)}}
@keyframes fsx-fadeObj{0%,45%{opacity:1}55%,92%{opacity:.15}100%{opacity:1}}
@keyframes fsx-spin{to{transform:rotate(360deg)}}
@keyframes fsx-sonne{0%,62%,100%{transform:rotate(0)}66%{transform:rotate(14deg)}70%{transform:rotate(-12deg)}74%{transform:rotate(8deg)}78%{transform:rotate(-4deg)}82%{transform:rotate(0)}}
@keyframes fsx-barre{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
@keyframes fsx-trace{0%{stroke-dashoffset:40}55%,85%{stroke-dashoffset:0}100%{stroke-dashoffset:40}}
.fsx-blink{animation:fsx-blink 1.6s ease-in-out infinite}
.fsx-capA{animation:fsx-capA 6s ease-in-out infinite}
.fsx-capB{opacity:0;animation:fsx-capB 6s ease-in-out infinite}
.fsx-flux{stroke-dasharray:3 5;animation:fsx-flux 1.2s linear infinite}
.fsx-monte{opacity:0;animation:fsx-monte 6s linear infinite both}
.fsx-repart{opacity:0;animation:fsx-repart 6s linear infinite both}
.fsx-onde{opacity:0;transform-box:fill-box;transform-origin:center;animation:fsx-onde 6s ease-out infinite}
.fsx-coche{opacity:0;animation:fsx-coche 6s ease-out infinite both}
.fsx-scan{animation:fsx-scan 3.2s cubic-bezier(.45,0,.55,1) infinite}
.fsx-pop{animation:fsx-pop 5s cubic-bezier(.34,1.56,.64,1) infinite both}
.fsx-fadeObj{animation:fsx-fadeObj 5s ease-in-out infinite}
.fsx-spin{animation:fsx-spin 4s linear infinite;transform-origin:50% 50%}
.fsx-sonne{animation:fsx-sonne 3.5s ease-in-out infinite;transform-origin:50% 15%}
.fsx-barre{animation:fsx-barre .9s ease-in-out infinite;transform-origin:50% 100%}
.fsx-trace{stroke-dasharray:40;animation:fsx-trace 3.5s ease-in-out infinite}

/* Stock vide — « Ce que FillSell fait » */
@keyframes fsx-halo{0%{transform:scale(1);opacity:.45}70%,100%{transform:scale(1.35);opacity:0}}
@keyframes fsx-rowIn{0%,8%{opacity:0;transform:translateX(-14px)}16%,86%{opacity:1;transform:none}94%,100%{opacity:0;transform:none}}
@keyframes fsx-flot{from{transform:translateX(-12px)}to{transform:translateX(0)}}
@keyframes fsx-chipOn{0%,14%{opacity:.38}22%,86%{opacity:1}94%,100%{opacity:.38}}
@keyframes fsx-pop2{0%,14%{opacity:0;transform:scale(.4)}22%,86%{opacity:1;transform:scale(1)}94%,100%{opacity:0;transform:scale(.8)}}
@keyframes fsx-up{0%,30%{transform:translateY(68px)}46%,86%{transform:translateY(0)}96%,100%{transform:translateY(68px)}}
@keyframes fsx-down1{0%,30%{transform:translateY(0)}46%,86%{transform:translateY(34px)}96%,100%{transform:translateY(0)}}
@keyframes fsx-down2{0%,30%{transform:translateY(34px)}46%,86%{transform:translateY(68px)}96%,100%{transform:translateY(34px)}}
@keyframes fsx-tagIn{0%,44%{opacity:0;transform:scale(.6)}52%,86%{opacity:1;transform:scale(1)}94%,100%{opacity:0}}
@keyframes fsx-oldOut{0%,40%{opacity:1}48%,90%{opacity:0}98%,100%{opacity:1}}
@keyframes fsx-newIn{0%,44%{opacity:0}52%,86%{opacity:1}94%,100%{opacity:0}}
@keyframes fsx-vendu{0%,8%{opacity:0;transform:scale(.5)}15%,90%{opacity:1;transform:scale(1)}96%,100%{opacity:0;transform:scale(.8)}}
@keyframes fsx-retire{0%,38%{opacity:1}47%,90%{opacity:.34}97%,100%{opacity:1}}
@keyframes fsx-barreRetire{0%,38%{transform:scaleX(0)}47%,90%{transform:scaleX(1)}97%,100%{transform:scaleX(0)}}
@keyframes fsx-tap{0%,27%{transform:scale(0);opacity:0}29%{transform:scale(.4);opacity:.55}40%,100%{transform:scale(3);opacity:0}}
@keyframes fsx-press{0%,28%,34%,100%{transform:scale(1)}31%{transform:scale(.95)}}
@keyframes fsx-doneIn{0%,52%{opacity:0;transform:translateY(4px)}58%,90%{opacity:1;transform:none}97%,100%{opacity:0}}
.fsx-halo{position:relative}
.fsx-halo::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:0 0 0 2px rgba(47,158,144,.55);pointer-events:none;animation:fsx-halo 2.4s ease-out infinite}
.fsx-rowIn{animation:fsx-rowIn 5s cubic-bezier(.22,1,.36,1) infinite both}
.fsx-flot{overflow:hidden}
.fsx-flot>i{display:block;width:calc(100% + 12px);height:100%;background-image:linear-gradient(90deg,#9CCFC4 50%,rgba(0,0,0,0) 50%);background-size:12px 2px;animation:fsx-flot .8s linear infinite}
.fsx-chipOn{animation:fsx-chipOn 5s ease-in-out infinite both}
.fsx-pop2{animation:fsx-pop2 5s cubic-bezier(.34,1.56,.64,1) infinite both}
.fsx-up{animation:fsx-up 5s cubic-bezier(.65,0,.35,1) infinite}
.fsx-down1{transform:translateY(34px);animation:fsx-down1 5s cubic-bezier(.65,0,.35,1) infinite}
.fsx-down2{transform:translateY(68px);animation:fsx-down2 5s cubic-bezier(.65,0,.35,1) infinite}
.fsx-tagIn{animation:fsx-tagIn 5s cubic-bezier(.34,1.56,.64,1) infinite both}
.fsx-oldOut{animation:fsx-oldOut 5s ease-in-out infinite}
.fsx-newIn{opacity:0;animation:fsx-newIn 5s ease-in-out infinite both}
.fsx-vendu{animation:fsx-vendu 6s cubic-bezier(.34,1.56,.64,1) infinite both}
.fsx-retire{animation:fsx-retire 6s ease-in-out infinite}
.fsx-barreRetire{transform:scaleX(0);transform-origin:0 50%;animation:fsx-barreRetire 6s cubic-bezier(.65,0,.35,1) infinite}
.fsx-tap{opacity:0;animation:fsx-tap 6s ease-out infinite}
.fsx-press{animation:fsx-press 6s ease-in-out infinite}
.fsx-doneIn{opacity:0;animation:fsx-doneIn 6s ease-out infinite both}

/* Ventes vide */
@keyframes fsx-notif{0%,4%{opacity:0;transform:translateY(-24px) scale(.96)}11%,90%{opacity:1;transform:none}97%,100%{opacity:0;transform:translateY(-10px)}}
@keyframes fsx-cloche{0%,10%,22%,100%{transform:rotate(0)}13%{transform:rotate(16deg)}16%{transform:rotate(-12deg)}19%{transform:rotate(6deg)}}
@keyframes fsx-vendu7{0%,14%{opacity:0;transform:scale(.5)}20%,90%{opacity:1;transform:scale(1)}96%,100%{opacity:0;transform:scale(.8)}}
@keyframes fsx-cadre{0%,14%{opacity:0}20%,90%{opacity:1}96%,100%{opacity:0}}
@keyframes fsx-retire7{0%,32%{opacity:1}42%,90%{opacity:.34}97%,100%{opacity:1}}
@keyframes fsx-barre7{0%,32%{transform:scaleX(0)}42%,90%{transform:scaleX(1)}97%,100%{transform:scaleX(0)}}
@keyframes fsx-marge{0%,52%{opacity:0;transform:translateY(10px) scale(.96)}60%,90%{opacity:1;transform:none}97%,100%{opacity:0}}
@keyframes fsx-remplit{0%,56%{transform:scaleX(0)}74%,90%{transform:scaleX(1)}97%,100%{transform:scaleX(0)}}
@keyframes fsx-flotte{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
.fsx-notif{animation:fsx-notif 7s cubic-bezier(.22,1,.36,1) infinite both}
.fsx-cloche{animation:fsx-cloche 7s ease-in-out infinite;transform-origin:50% 10%}
.fsx-vendu7{animation:fsx-vendu7 7s cubic-bezier(.34,1.56,.64,1) infinite both}
.fsx-cadre{opacity:0;animation:fsx-cadre 7s ease-in-out infinite both}
.fsx-retire7{animation:fsx-retire7 7s ease-in-out infinite}
.fsx-barre7{transform:scaleX(0);transform-origin:0 50%;animation:fsx-barre7 7s cubic-bezier(.65,0,.35,1) infinite}
.fsx-marge{animation:fsx-marge 7s cubic-bezier(.22,1,.36,1) infinite both}
.fsx-remplit{transform-origin:0 50%;animation:fsx-remplit 7s cubic-bezier(.65,0,.35,1) infinite}
.fsx-flotte{animation:fsx-flotte 4s ease-in-out infinite}

/* Stats vide */
@keyframes fsx-ligne{0%,4%{stroke-dashoffset:1;opacity:1}55%,88%{stroke-dashoffset:0;opacity:1}96%,100%{stroke-dashoffset:0;opacity:0}}
@keyframes fsx-aire{0%,40%{opacity:0}60%,88%{opacity:1}96%,100%{opacity:0}}
@keyframes fsx-point{0%,54%{opacity:0;transform:scale(.3)}60%,88%{opacity:1;transform:scale(1)}96%,100%{opacity:0}}
@keyframes fsx-pingBoucle{0%,58%{transform:scale(1);opacity:0}62%{opacity:.5}80%,100%{transform:scale(3);opacity:0}}
@keyframes fsx-reflet{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
@keyframes fsx-rowUp{0%,8%{opacity:0;transform:translateY(6px)}16%,86%{opacity:1;transform:none}94%,100%{opacity:0}}
@keyframes fsx-pousse{0%,10%{transform:scaleX(0)}40%,86%{transform:scaleX(1)}96%,100%{transform:scaleX(0)}}
@keyframes fsx-scintille{0%,100%{transform:scale(1) rotate(0);opacity:1}50%{transform:scale(.8) rotate(20deg);opacity:.7}}
.fsx-ligne{stroke-dasharray:1;animation:fsx-ligne 6s cubic-bezier(.65,0,.35,1) infinite}
.fsx-aire{animation:fsx-aire 6s ease-in-out infinite}
.fsx-point{transform-box:fill-box;transform-origin:center;animation:fsx-point 6s cubic-bezier(.34,1.56,.64,1) infinite}
.fsx-pingBoucle{opacity:0;transform-box:fill-box;transform-origin:center;animation:fsx-pingBoucle 6s ease-out infinite}
.fsx-sk{position:relative;overflow:hidden;background:#ECE9E3}
.fsx-sk::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(246,244,240,0) 0%,rgba(246,244,240,.9) 50%,rgba(246,244,240,0) 100%);animation:fsx-reflet 1.8s linear infinite}
.fsx-skd{position:relative;overflow:hidden;background:rgba(255,255,255,.18)}
.fsx-skd::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.28) 50%,rgba(255,255,255,0) 100%);animation:fsx-reflet 1.8s linear infinite}
.fsx-rowUp{animation:fsx-rowUp 6s cubic-bezier(.22,1,.36,1) infinite both}
.fsx-pousse{transform-origin:0 50%;animation:fsx-pousse 6s cubic-bezier(.65,0,.35,1) infinite}
.fsx-scintille{animation:fsx-scintille 2.6s ease-in-out infinite;transform-origin:50% 50%}

/* Une boucle hors de l'écran ne tourne pas (Boucle.jsx pose data-pause). */
[data-pause="1"] *,[data-pause="1"] *::after{animation-play-state:paused !important}

/* ⛔ Réglage système « réduire les animations » : rien ne bouge, et chaque
   élément est à son état d'arrivée (les styles de base SONT l'état final). */
@media (prefers-reduced-motion: reduce){
  .fsx-ecran *,.fsx-ecran *::before,.fsx-ecran *::after{animation:none !important;transition:none !important}
  /* L'image fixe montrée = le RÉSULTAT de chaque scène (la vente repérée,
     les autres annonces retirées, l'annonce remontée en tête). */
  .fsx-ecran .fsx-capB,.fsx-ecran .fsx-monte,.fsx-ecran .fsx-repart,.fsx-ecran .fsx-onde,.fsx-ecran .fsx-tap,.fsx-ecran .fsx-oldOut,.fsx-ecran .fsx-press{opacity:0 !important}
  .fsx-ecran .fsx-cadre,.fsx-ecran .fsx-coche,.fsx-ecran .fsx-newIn,.fsx-ecran .fsx-doneIn{opacity:1 !important}
  .fsx-ecran .fsx-retire,.fsx-ecran .fsx-retire7{opacity:.34 !important}
  .fsx-ecran .fsx-barreRetire,.fsx-ecran .fsx-barre7{transform:scaleX(1) !important}
}
`;
