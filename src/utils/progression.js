// ═══════════════════════════════════════════════════════════════════════════
// LA BARRE DE PROGRESSION — le moteur (calcul pur, aucun DOM, aucun React)
// ═══════════════════════════════════════════════════════════════════════════
// Chantier clarté du 01/10/2026 (demande de Nico) : la barre restait immobile
// pendant toute l'opération puis sautait au maximum à la fin — on croyait que
// rien ne se passait. Règle désormais, pour TOUTES les barres de l'app :
//
//   · chaque étape RÉELLE (connue du serveur ou de l'extension) occupe une
//     PLAGE de la barre, proportionnelle à sa durée attendue ;
//   · pendant qu'on attend la nouvelle suivante, la barre glisse dans la plage
//     de l'étape en cours : vite au début, de plus en plus lentement, sans
//     jamais s'arrêter net. Une étape qui traîne au-delà de sa durée attendue
//     déborde très lentement sur la suite (au plus la moitié de ce qui reste) ;
//   · une nouvelle étape repart de là où la barre est (jamais de recul) ;
//   · tant que ce n'est pas VRAIMENT fini, la barre ne dépasse jamais PLAFOND
//     (99 %). 100 % n'existe que sur l'état « termine ».
//
// La barre ne ment jamais : la phrase nomme l'étape RÉELLE en cours (jamais
// une étape devinée), et rien n'affiche 100 % ni « Terminé » avant la fin.
// Les temps sont en millisecondes (performance.now()), les durées en secondes,
// les valeurs en pourcentage (0 à 100).
// Preuve : scripts/progression-selftest.mjs (npm run selftest:progression).

export const PLAFOND = 99;

// courbe(1) = 0,70 : à la durée attendue de l'étape, la barre a couvert 70 %
// de sa plage. Forme hyperbolique (et non exponentielle) : la queue décroît
// lentement, la barre bouge encore visiblement à 3 × la durée attendue au lieu
// de se figer — c'est exactement l'attente « sans nouvelle » de Nico.
const PENTE = 7 / 3;

export function courbe(x) {
  if (!(x > 0)) return 0;
  return 1 - 1 / (1 + PENTE * x);
}

// Une étape sans durée connue vaut 3 s ; jamais moins d'une demi-seconde
// (une durée nulle ferait bondir la barre au bout de sa plage).
const dureeDe = (e) => Math.max(0.5, Number(e?.duree) || 3);

// Plages des étapes : chaque étape occupe une part de [0, PLAFOND]
// proportionnelle à son poids — par défaut sa durée attendue, ce qui donne une
// allure régulière d'un bout à l'autre quand les durées sont justes.
export function plagesDe(etapes) {
  const liste = (Array.isArray(etapes) ? etapes : []).filter(Boolean);
  const poids = liste.map((e) => Math.max(0.01, Number(e.poids ?? dureeDe(e)) || 1));
  const total = poids.reduce((a, b) => a + b, 0) || 1;
  let cumul = 0;
  return liste.map((e, i) => {
    const debut = (cumul / total) * PLAFOND;
    cumul += poids[i];
    return { ...e, debut, fin: (cumul / total) * PLAFOND, duree: dureeDe(e) };
  });
}

// Avancement CONNU en fraction (relevé : « 12 articles sur 48 ») : la barre se
// pose sur la fraction et glisse vers la suivante attendue (`pas`), sans
// jamais l'atteindre avant que le nouveau compte arrive.
export function plageFraction(fraction, pas = 0.05, dureePas = 3) {
  const f = Math.min(1, Math.max(0, Number(fraction) || 0));
  const p = Math.max(0, Number(pas) || 0);
  return {
    debut: f * PLAFOND,
    fin: Math.min(PLAFOND, (f + p) * PLAFOND),
    duree: Math.max(0.5, Number(dureePas) || 3),
    debord: false,
  };
}

// DÉBORD d'une étape qui traîne : passé sa durée attendue, la barre peut
// empiéter sur la suite, très lentement, sans jamais dépasser la moitié de ce
// qui reste jusqu'au plafond. Sans lui, une étape trois fois trop longue
// collait la barre au bout de sa plage (0,03 %/s mesuré : immobile à l'œil).
// L'étape suivante repart alors de là où la barre est, et les étapes
// restantes se partagent ce qui reste (plageAncree) : rien ne se fige.
// Pas de débord sur un avancement connu (fraction) : le compte réel prime.
const DEBORD = 0.5;
const LENTEUR_DEBORD = 6;

// Valeur visée par une piste à l'instant `maintenant` (ms), dans sa plage
// courante, en partant de `depart` (la valeur atteinte quand l'étape a
// commencé). Jamais en dessous du départ, jamais au plafond.
export function valeurDansPlage(plage, depart, debutMs, maintenant) {
  if (!plage) return Math.max(0, Number(depart) || 0);
  const de = Math.min(Math.max(plage.debut, Number(depart) || 0), plage.fin);
  const x = Math.max(0, (maintenant - debutMs) / 1000) / plage.duree;
  const principal = de + (plage.fin - de) * courbe(x);
  const y = x - 1;
  const debord = plage.debord === false || y <= 0
    ? 0
    : Math.max(0, PLAFOND - plage.fin) * DEBORD * (1 - 1 / (1 + y / LENTEUR_DEBORD));
  return Math.min(PLAFOND, principal + debord);
}

// La plage d'une étape qui commence alors que la barre a déjà dépassé son
// début (débord de l'étape d'avant) : elle repart de la barre et garde SA part
// de ce qui reste jusqu'au plafond — la dernière étape finit toujours au
// plafond, aucune ne se retrouve sans place.
export function plageAncree(plage, depart) {
  if (!plage) return plage;
  const d = Number(depart) || 0;
  if (!(d > plage.debut) || plage.debut >= PLAFOND) return plage;
  const part = (plage.fin - plage.debut) / (PLAFOND - plage.debut);
  return { ...plage, debut: d, fin: Math.min(PLAFOND, d + (PLAFOND - d) * part) };
}

// Attente longue : l'étape dure nettement plus que prévu. On le DIT (la phrase
// change), on ne fait pas courir la barre plus vite pour autant.
export function attenteLongue(plage, debutMs, maintenant) {
  if (!plage) return false;
  const ecoule = (maintenant - debutMs) / 1000;
  return ecoule > Math.max(plage.duree * 2.5, plage.duree + 10);
}

// Lissage de l'affichage : la valeur affichée rejoint la valeur visée en
// douceur (constante de temps `tau`, en secondes) — c'est ce qui efface tout
// à-coup quand une étape arrive plus tôt ou plus tard que prévu. Vitesse
// plafonnée (VITESSE_MAX %/s) : une étape sautée ou la fin se rattrapent en
// glissant, jamais d'un bond. Elle ne recule jamais.
export const VITESSE_MAX = 30;
// La FIN (état « termine ») se pose plus vite : quelle que soit la distance
// qui reste, la barre rejoint 100 % en moins d'une seconde, en ralentissant —
// l'écran suivant (les annonces rédigées, le résultat Lens) n'attend pas.
export const VITESSE_FIN = 120;
export function lisser(affichee, visee, dtMs, tau = 0.3, vitesseMax = VITESSE_MAX) {
  if (!(visee > affichee)) return affichee;
  if (!(dtMs > 0)) return affichee;
  const k = 1 - Math.exp(-dtMs / 1000 / tau);
  const pas = Math.min((visee - affichee) * k, vitesseMax * dtMs / 1000);
  const v = affichee + pas;
  // La fin se pose franchement à 100 (pas de traîne à 99,98) ; ailleurs on
  // colle à la cible quand l'écart n'est plus visible.
  if (visee >= 100 && v > 99.5) return 100;
  return visee - v < 0.02 ? visee : v;
}

// États d'une piste : 'en_cours' (avance), 'attente' (pas encore son tour),
// 'pause' (rien ne peut bouger : ordinateur éteint, plateforme en pause),
// 'termine', 'echec'. Seul 'en_cours' fait avancer la barre ; seul 'termine'
// la mène à 100 %.
export const ETATS = ['en_cours', 'attente', 'pause', 'termine', 'echec'];
export const etatNormalise = (e) => (ETATS.includes(e) ? e : 'en_cours');

// État d'ensemble de plusieurs pistes (une par plateforme) :
//   · toutes terminées → 'termine' ;
//   · au moins une avance (ou attend son tour derrière une qui avance) → 'en_cours' ;
//   · plus rien n'avance et une au moins a échoué → 'partiel' si d'autres ont
//     réussi, 'echec' sinon — JAMAIS « terminé » ;
//   · sinon (tout est en pause ou en file) → 'pause' / 'attente'.
export function etatGlobal(etats) {
  const liste = (etats ?? []).map(etatNormalise);
  if (!liste.length) return 'en_cours';
  if (liste.every((e) => e === 'termine')) return 'termine';
  if (liste.some((e) => e === 'en_cours')) return 'en_cours';
  const echecs = liste.filter((e) => e === 'echec').length;
  const reste = liste.filter((e) => e === 'attente' || e === 'pause').length;
  if (echecs && !reste) return liste.some((e) => e === 'termine') ? 'partiel' : 'echec';
  if (liste.some((e) => e === 'pause')) return 'pause';
  return 'attente';
}

// Valeur d'ensemble : la moyenne des pistes. Moyenne de valeurs qui ne
// reculent jamais → ne recule jamais ; une seule piste à 99 % → < 100 %.
export function moyenne(valeurs) {
  const l = (valeurs ?? []).filter((v) => Number.isFinite(v));
  if (!l.length) return 0;
  return l.reduce((a, b) => a + b, 0) / l.length;
}

// Le pourcentage écrit : arrondi INFÉRIEUR (99,7 s'écrit 99, jamais 100), et
// 100 seulement quand c'est fini.
export function pourcentageEcrit(valeur, fini) {
  if (fini) return 100;
  return Math.max(0, Math.min(PLAFOND, Math.floor(valeur)));
}
