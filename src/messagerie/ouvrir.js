// ═══════════════════════════════════════════════════════════════════════════
// OUVRIR UNE PAGE DE LA PLATEFORME, OU LA COPIE D'UN BORDEREAU (bêta, 16/10)
// ═══════════════════════════════════════════════════════════════════════════
// Natif (iOS / Android) : navigateur système (@capacitor/browser), comme
// ebayCompte.js. Web : un nouvel onglet. Pour une adresse obtenue APRÈS une
// attente (adresse signée de la copie), l'onglet est ouvert d'abord, dans le
// geste de la personne, puis dirigé — sinon le navigateur le bloquerait.
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const natif = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

export async function ouvrirLien(url) {
  if (!url) return;
  if (natif()) { await Browser.open({ url }).catch(() => {}); return; }
  window.open(url, '_blank', 'noopener');
}

/** Ouvre une adresse que `obtenir()` rend après une attente (rend false si rien). */
export async function ouvrirApres(obtenir) {
  if (natif()) {
    const url = await obtenir().catch(() => null);
    if (!url) return false;
    await Browser.open({ url }).catch(() => {});
    return true;
  }
  const onglet = window.open('', '_blank');
  const url = await obtenir().catch(() => null);
  if (!url) { try { onglet?.close(); } catch { /* déjà fermé */ } return false; }
  if (onglet) {
    try { onglet.opener = null; } catch { /* sans effet */ }
    onglet.location.href = url;
  } else {
    window.location.assign(url);
  }
  return true;
}
