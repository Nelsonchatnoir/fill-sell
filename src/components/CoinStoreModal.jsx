import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { purchaseCoins } from "../lib/iap";
import { supabaseUrl, supabaseAnonKey } from "../lib/supabase";
import PepiteIcon from "./PepiteIcon";

// Store de packs de pièces — grille validée 2026-07-06.
// Natif : achat consumable @capgo/native-purchases puis validation du reçu par
// l'edge function validate-coin-purchase (qui crédite le wallet, idempotent).
// Web : checkout Stripe mode payment (create-checkout-session, product=coins_*),
// crédit par stripe-webhook au retour — la page /success recharge l'app.
const PACKS = [
  { id: "coins_100",  product: "app.fillsell.coins.100",  coins: 100,  price: "4,99 €" },
  { id: "coins_220",  product: "app.fillsell.coins.220",  coins: 220,  price: "9,99 €",  bonus: "+10%" },
  { id: "coins_460",  product: "app.fillsell.coins.460",  coins: 460,  price: "19,99 €", bonus: "+15%" },
  { id: "coins_1150", product: "app.fillsell.coins.1150", coins: 1150, price: "49,99 €", bonus: "+15%" },
];

const TEAL = "#2F9E90";
const TEAL_DEEP = "#1B6E62";

export default function CoinStoreModal({ open, onClose, lang, supabase, onPurchased }) {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg]   = useState(null);
  if (!open) return null;

  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();

  async function buy(pack) {
    setBusy(pack.id);
    setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (isNative) {
        const res = await purchaseCoins(pack.product, session?.user?.id);
        if (res.cancelled) return;
        const r = await fetch(`${supabaseUrl}/functions/v1/validate-coin-purchase`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "apikey": supabaseAnonKey },
          body: JSON.stringify({ platform, productId: pack.product, receipt: res.receipt, purchaseToken: res.purchaseToken }),
        });
        const body = await r.json();
        if (!r.ok || body.error) throw new Error(body.error || `HTTP ${r.status}`);
        setMsg({ ok: true, text: lang === "en" ? `+${pack.coins} Nuggets added!` : `+${pack.coins} Pépites créditées !` });
        onPurchased?.();
      } else {
        // Web : redirection checkout Stripe, crédit par le webhook
        const r = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "apikey": supabaseAnonKey },
          body: JSON.stringify({ product: pack.id }),
        });
        const { url, error } = await r.json();
        if (error) throw new Error(error);
        window.location.href = url;
      }
    } catch (e) {
      setMsg({ ok: false, text: lang === "en" ? `Error: ${e.message}` : `Erreur : ${e.message}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10002,
        background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: "24px 24px 0 0", padding: "26px 22px 34px",
          width: "100%", maxWidth: 480,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18, color: "#111", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <PepiteIcon size={24} /> {lang === "en" ? "Stock up on Nuggets" : "Recharger des Pépites"}
        </div>
        <p style={{ fontSize: 12.5, color: "#6B6862", lineHeight: 1.5, margin: "0 0 16px" }}>
          {lang === "en"
            ? "Nuggets pay for publishing (3 original · 12 light · 35 advanced per listing). They never expire."
            : "Les Pépites paient tes publications (3 original · 12 légère · 35 avancée par annonce). Elles n'expirent jamais."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {PACKS.map((p) => (
            <button
              key={p.id}
              onClick={() => buy(p)}
              disabled={!!busy}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                padding: "13px 14px", borderRadius: 14,
                background: "#F6F5F1", border: "1px solid #E7E3D8",
                cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit",
                opacity: busy && busy !== p.id ? 0.55 : 1,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#10201B", display: "inline-flex", alignItems: "center", gap: 5 }}><PepiteIcon size={17} /> {p.coins}</span>
                {p.bonus && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: TEAL_DEEP, background: "#E7F3F0", border: "1px solid #CBE5DF", padding: "2px 7px", borderRadius: 999 }}>
                    {p.bonus}
                  </span>
                )}
              </span>
              <span style={{
                fontSize: 13.5, fontWeight: 700, color: "#fff", whiteSpace: "nowrap",
                background: `linear-gradient(120deg,${TEAL},${TEAL_DEEP})`,
                padding: "7px 14px", borderRadius: 999, minWidth: 76, textAlign: "center",
              }}>
                {busy === p.id ? "…" : p.price}
              </span>
            </button>
          ))}
        </div>

        {msg && (
          <div style={{ fontSize: 13, fontWeight: 600, textAlign: "center", marginBottom: 10, color: msg.ok ? TEAL_DEEP : "#B0645A" }}>
            {msg.text}
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            width: "100%", padding: "12px", borderRadius: 14, border: "none",
            background: "none", color: "#6B6862", fontWeight: 600, fontSize: 13.5,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {lang === "en" ? "Close" : "Fermer"}
        </button>
      </div>
    </div>
  );
}
