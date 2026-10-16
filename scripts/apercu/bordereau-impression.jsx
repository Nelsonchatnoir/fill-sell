// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — bordereaux : étiquette 10 × 15, code de dépôt, tout imprimer (16/10)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte les VRAIS écrans de
// src/messagerie/impression/ sur des bordereaux SYNTHÉTIQUES fabriqués ici
// (pdf-lib, canvas) : aucun vrai bordereau, aucune requête vers l'extérieur.
//
//   bordereau-impression.html?ecran=apercu|original|code|tout
import { createRoot } from 'react-dom/client';
import { PDFDocument, rgb } from 'pdf-lib';
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import ApercuBordereau from '../../src/messagerie/impression/ApercuBordereau.jsx';
import ToutImprimer from '../../src/messagerie/impression/ToutImprimer.jsx';

const ecran = new URLSearchParams(location.search).get('ecran') || 'apercu';
const MM = 72 / 25.4;

function crayon(page) {
  const H = page.getHeight();
  const noir = rgb(0, 0, 0);
  const plein = (x, y, l, h) => page.drawRectangle({ x: x * MM, y: H - (y + h) * MM, width: l * MM, height: h * MM, color: noir });
  const f = {
    plein,
    cadre: (x, y, l, h, e = 0.5) => { plein(x, y, l, e); plein(x, y + h - e, l, e); plein(x, y, e, h); plein(x + l - e, y, e, h); },
    texte: (x, y, l, corps = 2.4) => { let cx = x; let n = 0; while (cx < x + l - 1.6) { plein(cx, y, 1.2, corps); cx += 1.8; n++; if (n % 6 === 0) cx += 1.6; } },
    paragraphe: (x, y, l, lignes, pas = 4) => { for (let i = 0; i < lignes; i++) f.texte(x, y + i * pas, l); },
    barres: (x, y, l, h) => { let cx = x; let i = 0; while (cx < x + l) { const b = 0.35 * (1 + (i % 3)); plein(cx, y, b, h); cx += b + 0.35 * (1 + ((i * 7) % 2)); i++; } },
  };
  return f;
}

async function pdfMondialRelay() {
  const doc = await PDFDocument.create();
  const f = crayon(doc.addPage([210 * MM, 297 * MM]));
  f.cadre(4, 4, 202, 136, 0.6); f.plein(8, 8, 60, 10);
  f.paragraphe(10, 24, 80, 5); f.paragraphe(110, 24, 80, 6);
  f.barres(20, 70, 90, 22); f.paragraphe(10, 110, 180, 5);
  f.paragraphe(10, 160, 190, 6); f.plein(20, 200, 12, 12); f.paragraphe(10, 230, 190, 8);
  return doc.save();
}
async function pdfColissimo() {
  const doc = await PDFDocument.create();
  const f = crayon(doc.addPage([210 * MM, 297 * MM]));
  f.cadre(18, 30, 104, 124, 0.8); f.paragraphe(22, 36, 90, 6); f.barres(26, 70, 85, 25); f.paragraphe(22, 105, 90, 8);
  f.cadre(140, 30, 60, 70, 0.4); f.paragraphe(144, 36, 50, 12); f.paragraphe(15, 180, 180, 15);
  return doc.save();
}
async function pngCode() {
  const c = document.createElement('canvas'); c.width = 232; c.height = 232;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 232, 232); x.fillStyle = '#000';
  let s = 11;
  for (let i = 0; i < 29; i++) for (let j = 0; j < 29; j++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; if (s & 0x80000000) x.fillRect(i * 8, j * 8, 8, 8); }
  for (const [a, b] of [[0, 0], [22, 0], [0, 22]]) { x.fillRect(a * 8, b * 8, 56, 56); x.fillStyle = '#fff'; x.fillRect(a * 8 + 8, b * 8 + 8, 40, 40); x.fillStyle = '#000'; x.fillRect(a * 8 + 16, b * 8 + 16, 24, 24); }
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

window.__pret = false;
const racine = createRoot(document.getElementById('apercu'));
(async () => {
  try { window.localStorage.clear(); } catch { /* aperçu */ }
  if (ecran === 'original') window.localStorage.setItem('fillsell.bordereau.format', 'origine');
  const mr = { octets: await pdfMondialRelay(), platform: 'vinted', transporteur: 'Mondial Relay', commande_ref: '9001' };
  const co = { octets: await pdfColissimo(), platform: 'leboncoin', transporteur: 'Colissimo', commande_ref: 'L-4521' };
  const code = { octets: await pngCode(), platform: 'vinted', transporteur: 'Vinted Go', commande_ref: '9002' };
  const fermer = () => { window.__ferme = true; };
  if (ecran === 'tout') racine.render(<ToutImprimer ouvert copies={[mr, co, code]} lang="fr" onFermer={fermer} />);
  else racine.render(<ApercuBordereau ouvert copie={ecran === 'code' ? code : mr} lang="fr" onFermer={fermer} />);
  window.__pret = true;
})();
