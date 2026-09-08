import VintedLogo from "./VintedLogo";
import EbayLogo from "./EbayLogo";
import BeebsIcon from "./BeebsIcon";
import LeboncoinIcon from "./LeboncoinIcon";

// vinted/ebay : tracé vectoriel de marque (simple-icons) posé sur un socle carré blanc,
// pour rendre au même gabarit que les vraies icônes d'app carrées de beebs/leboncoin.
const GLYPHS = { vinted: VintedLogo, ebay: EbayLogo };
// beebs/leboncoin : icône d'app officielle (App Store), déjà carrée et pleine, aucun socle.
const APP_ICONS = { beebs: BeebsIcon, leboncoin: LeboncoinIcon };

// `fond` / `bord` (2026-09-08) : le socle blanc de vinted/ebay est TEINTABLE.
// Sans ça, colorer la mini-carte qui porte le logo ne colorait qu'un liseré de
// 3 px : le socle blanc du logo recouvrait le reste, et on obtenait un cadre
// épais autour d'un carré blanc — deux cartes emboîtées (capture Nico du
// 08/09). Les défauts reproduisent EXACTEMENT le rendu d'avant : tous les
// autres appelants sont inchangés.
// `desature` : niveaux de gris sur le GLYPHE seul, jamais sur le socle — sinon
// la teinte qui porte l'information serait effacée avec lui.
export default function PlatformLogo({ platform, size = 24, fond = "#FFFFFF", bord = "#E7E3D8", desature = false }) {
  const radius = Math.round(size * 0.28);
  const filtre = desature ? { filter: "grayscale(1)", opacity: 0.78 } : null;

  const AppIcon = APP_ICONS[platform];
  // beebs/leboncoin : icône d'app pleine, elle n'a pas de socle à teinter —
  // elle occupe déjà tout le carré, c'est la mini-carte qui l'entoure.
  if (AppIcon) return filtre
    ? <span style={{ display: "flex", lineHeight: 0, ...filtre }}><AppIcon size={size} radius={radius} /></span>
    : <AppIcon size={size} radius={radius} />;

  const Glyph = GLYPHS[platform];
  if (!Glyph) return null;

  return (
    <span
      style={{
        width: size, height: size, borderRadius: radius, boxSizing: "border-box",
        background: fond, border: `1px solid ${bord}`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}
    >
      <span style={{ display: "flex", lineHeight: 0, ...(filtre ?? {}) }}>
        <Glyph size={Math.round(size * 0.58)} />
      </span>
    </span>
  );
}
