import VintedLogo from "./VintedLogo";
import EbayLogo from "./EbayLogo";
import BeebsIcon from "./BeebsIcon";
import LeboncoinIcon from "./LeboncoinIcon";

// vinted/ebay : tracé vectoriel de marque (simple-icons) posé sur un socle carré blanc,
// pour rendre au même gabarit que les vraies icônes d'app carrées de beebs/leboncoin.
const GLYPHS = { vinted: VintedLogo, ebay: EbayLogo };
// beebs/leboncoin : icône d'app officielle (App Store), déjà carrée et pleine, aucun socle.
const APP_ICONS = { beebs: BeebsIcon, leboncoin: LeboncoinIcon };

export default function PlatformLogo({ platform, size = 24 }) {
  const radius = Math.round(size * 0.28);

  const AppIcon = APP_ICONS[platform];
  if (AppIcon) return <AppIcon size={size} radius={radius} />;

  const Glyph = GLYPHS[platform];
  if (!Glyph) return null;

  return (
    <span
      style={{
        width: size, height: size, borderRadius: radius, boxSizing: "border-box",
        background: "#FFFFFF", border: "1px solid #E7E3D8",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}
    >
      <Glyph size={Math.round(size * 0.58)} />
    </span>
  );
}
