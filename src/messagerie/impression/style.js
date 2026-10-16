// Les couleurs et la police des écrans d'impression (style des écrans du 16/10).
import { UI } from '../../components/ui';

export const ENCRE2 = '#5C6560';
export const LIGNE = '#EFECE6';
export const MENTHE = '#E6F1EE';
export const POLICE = "'Space Grotesk',sans-serif";
export const TONS = Object.freeze({
  ok: { fond: MENTHE, encre: '#1B6E62', bord: '#D6E2DE' },
  ambre: { fond: '#FFF6E3', encre: '#8A6100', bord: '#EED9A6' },
  rouge: { fond: '#FEF2F2', encre: '#B91C1C', bord: '#FECACA' },
  neutre: { fond: '#F6F5F1', encre: ENCRE2, bord: UI.border },
});
