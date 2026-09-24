// Petits helpers de texte du nouveau stepper (hors composants, pour le
// rechargement à chaud de Vite).
import { PLATFORM_LABELS } from "./moteur/champsPartages";

export const NOM = (p) => PLATFORM_LABELS[p] ?? p;

/** « il y a 3 min » — pour la pastille d'extension. */
export function ilYA(iso, lang = "fr") {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  const en = lang === "en";
  if (s < 90) return en ? "just now" : "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return en ? `${m} min ago` : `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return en ? `${h} h ago` : `il y a ${h} h`;
  const j = Math.round(h / 24);
  return en ? `${j} days ago` : `il y a ${j} jours`;
}
