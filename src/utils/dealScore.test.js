import { describe, it, expect } from 'vitest';
import { calculateDealScore } from './dealScore.js';

function makeSoldees(n, overrides = {}) {
  return Array.from({ length: n }, () => ({
    prix_achat: 20,
    prix_vente: 35,
    frais: 2,
    date_achat: '2026-01-01',
    date_vente: '2026-01-15',
    categorie: 'Mode',
    ...overrides,
  }));
}

describe('calculateDealScore', () => {

  it('1. historique vide → confidence=35, dataQuality="low", score valide, aucun NaN', () => {
    const r = calculateDealScore({ prixAchat: 50, prixVente: 80, frais: 5 });

    expect(r.confidence).toBe(35);
    expect(r.dataQuality).toBe('low');
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(10);
    expect(r.score).not.toBeNaN();
    expect(r.context.profitNet).not.toBeNaN();
    expect(r.context.vsMoyenne).toBeNull();
    expect(r.context.topPercent).toBeNull();
  });

  it('2. marge négative → label "risqué"/"Risky", score < 5', () => {
    const r = calculateDealScore({ prixAchat: 100, prixVente: 80, frais: 5 });

    expect(r.score).toBeLessThan(5);
    expect(r.label).toMatch(/risqué|Risky/);
  });

  it('3. marge > 55% → profitPotentiel = 9.5', () => {
    // buy=15, sell=42, fees=3.5 → profit=23.5, marge=23.5/42*100=55.95%
    const r = calculateDealScore({ prixAchat: 15, prixVente: 42, frais: 3.5 });

    expect(r.dimensions.profitPotentiel).toBe(9.5);
  });

  it('4. dates invalides dans historique → pas de crash, fallback propre', () => {
    const historique = [
      { prix_achat: 20, prix_vente: 40, frais: 2, date_achat: 'invalid',  date_vente: 'invalid' },
      { prix_achat: 15, prix_vente: 30, frais: 1, date_achat: undefined,  date_vente: 'bad-date' },
    ];
    const r = calculateDealScore({ prixAchat: 30, prixVente: 60, frais: 5, historique });

    expect(r.score).not.toBeNaN();
    expect(isFinite(r.score)).toBe(true);
    expect(r.dimensions.liquidite).toBeGreaterThanOrEqual(0);
    expect(r.dimensions.liquidite).toBeLessThanOrEqual(10);
    // dureeMoyenne incalculable → liquidite reste au fallback neutre
    expect(r.dimensions.liquidite).toBe(5);
  });

  it('5. moyenneProfit=0 (ventes à l\'équilibre) → pas de NaN ni Infinity', () => {
    // 5 ventes avec profit nul → moyenneProfit=0 → upside retombe sur profitPotentiel
    const historique = Array.from({ length: 5 }, () => ({
      prix_achat: 30, prix_vente: 30, frais: 0,
      date_achat: '2026-01-01', date_vente: '2026-01-10',
    }));
    const r = calculateDealScore({ prixAchat: 30, prixVente: 50, frais: 5, historique });

    expect(r.score).not.toBeNaN();
    expect(isFinite(r.score)).toBe(true);
    expect(r.dimensions.upside).not.toBeNaN();
    expect(isFinite(r.dimensions.upside)).toBe(true);
  });

  it('6. 25 ventes soldées → topPercent !== null', () => {
    const r = calculateDealScore({
      prixAchat: 20, prixVente: 40, frais: 2,
      historique: makeSoldees(25),
    });

    expect(r.context.topPercent).not.toBeNull();
    expect(r.context.topPercent).toBeGreaterThanOrEqual(0);
    expect(r.context.topPercent).toBeLessThanOrEqual(100);
  });

  it('7. 3 ventes soldées → topPercent === null', () => {
    const r = calculateDealScore({
      prixAchat: 20, prixVente: 40, frais: 2,
      historique: makeSoldees(3),
    });

    expect(r.context.topPercent).toBeNull();
  });

  it('8. score toujours clampé entre 0 et 10 sur des entrées extrêmes', () => {
    const cases = [
      { prixAchat: 0.01,  prixVente: 100000, frais: 0 },
      { prixAchat: 100000, prixVente: 1,     frais: 50000 },
      { prixAchat: 0,     prixVente: 0,      frais: 0 },
      { prixAchat: -500,  prixVente: -200,   frais: 0 },
      { prixAchat: NaN,   prixVente: NaN,    frais: NaN },
    ];
    for (const params of cases) {
      const r = calculateDealScore(params);
      expect(r.score).not.toBeNaN();
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(10);
    }
  });

  it('9. pills.length jamais > 4 même quand toutes les conditions déclenchent', () => {
    // Déclenche les 6 règles : marge élevée, au-dessus moyenne, catégorie ×5,
    // vente rapide, safety élevé, upside élevé
    const historique = Array.from({ length: 5 }, () => ({
      prix_achat: 30, prix_vente: 40, frais: 2,
      date_achat: '2026-01-01', date_vente: '2026-01-05',
      categorie: 'Mode',
    }));
    const r = calculateDealScore({ prixAchat: 10, prixVente: 60, frais: 1, historique });

    expect(r.pills.length).toBeLessThanOrEqual(4);
  });

  it('10. lang="en" → label et pills en anglais', () => {
    const historique = Array.from({ length: 5 }, () => ({
      prix_achat: 30, prix_vente: 40, frais: 2,
      date_achat: '2026-01-01', date_vente: '2026-01-05',
      categorie: 'Fashion',
    }));
    const r = calculateDealScore({
      prixAchat: 10, prixVente: 60, frais: 1,
      lang: 'en',
      historique,
    });

    expect(r.label).toMatch(/^(Excellent deal|Good deal|Average deal|Risky deal)$/);
    expect(r.pills).toContain('High margin');

    const frenchPills = [
      'Forte marge',
      'Au-dessus de ta moyenne',
      'Vente rapide probable',
      'Faible risque',
      'Excellent potentiel',
    ];
    frenchPills.forEach(fp => expect(r.pills).not.toContain(fp));
  });

  it('11. marge ~76%, historique riche (10 soldées rapides) → label "Excellent deal"', () => {
    // profit=38, sell=50 → marge=76% → ppScore=9.5
    // soldées : profit moyen=22, ratio=38/22=1.73 > 1.3 → upside=9
    // durée moyenne=5j < 7 → liquidite=9 → score ≈ 9.1
    const historique = Array.from({ length: 10 }, () => ({
      prix_achat: 15, prix_vente: 40, frais: 3,
      date_achat: '2026-01-01', date_vente: '2026-01-06',
    }));
    const r = calculateDealScore({ prixAchat: 10, prixVente: 50, frais: 2, historique });

    expect(r.label).toBe('Excellent deal');
    expect(r.score).toBeGreaterThanOrEqual(8);
  });

  it('12. prixAchat = 0 → pas de crash, résultat valide', () => {
    // marge = 28/30*100 = 93.3% → ppScore = 9.5
    const r = calculateDealScore({ prixAchat: 0, prixVente: 30, frais: 2 });

    expect(r.score).not.toBeNaN();
    expect(isFinite(r.score)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(10);
    expect(r.dimensions.profitPotentiel).toBe(9.5);
  });

});
