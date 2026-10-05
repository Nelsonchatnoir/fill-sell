// ═══════════════════════════════════════════════════════════════════════════
// LA FIN D'UN RELEVÉ (05/10, Marine) — module PUR (aucun import), testé par
// scripts/releve-fin-claire-selftest.mjs. Ré-exporté par etatReleve.js.
// ═══════════════════════════════════════════════════════════════════════════
const MUR_OPLA = /acc[èe]s opla non accord/i;

// ── LA FIN D'UN RELEVÉ, DITE EN CLAIR (05/10, Marine) ───────────────────────
// Chaque relevé qui n'aboutit pas se résume à UNE situation, lue sur les
// marqueurs que NOS relevés écrivent (extension 0.6.99, handler-watch) — et
// sur les textes des versions précédentes, pour les lignes déjà en base. La
// phrase montrée est choisie ici ; le texte brut de `erreur` (codes HTTP,
// pages, minutes) reste en base pour nous, jamais à l'écran.
//   pas_connecte  la personne n'est pas connectée à la plateforme sur son
//                 ordinateur → « Connecte-toi à X sur ton ordinateur… »
//   autre_compte  Chrome est sur une autre boutique que celle suivie
//   anti_robot    la plateforme a bloqué la lecture un moment
//   arret         la lecture s'est arrêtée avant la fin (chien de garde)
//   pas_prise     l'ordinateur n'a jamais pris la demande (Chrome fermé)
//   echec         tout le reste
const RE_PAS_CONNECTE = /\[pas_connecte\]|aucune session vinted|session_absente|session vinted.{0,40}401|refusé la lecture du compte|page de connexion/i;
const RE_AUTRE_COMPTE = /\[boutique_a_confirmer\]|\[hors-compte-ebay\]/i;
const RE_ANTI_ROBOT = /\[anti_robot\]|anti-robot|\[retry403\]/i;
const RE_ARRET = /\[watchdog\]/i;
const RE_PAS_PRISE = /jamais réclamée|sans extension disponible/i;

export function situationFinReleve(run) {
  const e = String(run?.erreur ?? '');
  if (RE_PAS_CONNECTE.test(e) || MUR_OPLA.test(e)) return 'pas_connecte';
  if (RE_AUTRE_COMPTE.test(e)) return 'autre_compte';
  if (RE_ANTI_ROBOT.test(e)) return 'anti_robot';
  if (RE_ARRET.test(e)) return 'arret';
  if (RE_PAS_PRISE.test(e)) return 'pas_prise';
  return 'echec';
}

// La phrase d'une situation, pour une plateforme nommée. T = textesAnnonces(lang).
export function texteSituation(situation, nom, T) {
  if (situation === 'pas_connecte') return T.signalNonConnecte(nom);
  if (situation === 'autre_compte') return T.finAutreCompte(nom);
  if (situation === 'anti_robot') return T.finAntiRobot(nom);
  if (situation === 'arret') return T.finArret(nom);
  if (situation === 'pas_prise') return T.finPasPrise(nom);
  return T.finEchec(nom);
}

export function texteFinReleve(run, nom, T) {
  if (/acc[èe]s opla non accord/i.test(String(run?.erreur ?? ''))) return T.signalOpla;
  return texteSituation(situationFinReleve(run), nom, T);
}
