// ═══════════════════════════════════════════════════════════════
// Credit Service — user credits, promo codes, BYL purchases
// ═══════════════════════════════════════════════════════════════

import { supabase, apiFetch } from "../supabase";
import { getDoc, subscribe } from "../lib/docs";

// ── Credits ──────────────────────────────────────────────────

/**
 * Subscribe to user credits in real-time. Returns an unsubscribe function.
 */
export function subscribeToCredits(userId, callback) {
  return subscribe(
    "profiles",
    async () => {
      const row = await getDoc("profiles", userId);
      callback(row?.data?.credits || 0);
    },
    `id=eq.${userId}`,
  );
}

/**
 * Get user credits once.
 */
export async function getUserCredits(userId) {
  const row = await getDoc("profiles", userId);
  return row?.data?.credits || 0;
}

/**
 * Profiles are created automatically for every new account (DB trigger).
 * Kept for backward compatibility.
 */
export async function ensureUserProfile() {}

// ── Promo Codes ──────────────────────────────────────────────

const PROMO_MESSAGES = {
  missing_params: "Промо код эсвэл хэрэглэгчийн мэдээлэл дутуу байна",
  invalid_code: "Промо код олдсонгүй",
  code_inactive: "Промо код идэвхгүй байна",
  already_used: "Та энэ промо кодыг аль хэдийн ашигласан байна",
  code_exhausted: "Промо кодын хэрэглээний лимит дууссан байна",
};

/**
 * Redeem a promo code for the signed-in user.
 * Returns { success: true, newCredits: number } on success.
 * Throws Error with Mongolian message on failure.
 */
export async function redeemPromoCode(code) {
  const { data, error } = await supabase.rpc("redeem_promo_code", { p_code: code });
  if (error) throw new Error("Серверийн алдаа. Дахин оролдоно уу.");
  if (data?.error) throw new Error(PROMO_MESSAGES[data.error] || "Промо код алдаатай байна");
  return data;
}

// ── BYL Credit Purchases ─────────────────────────────────────

/**
 * Create a BYL checkout for purchasing credits.
 * Returns { checkoutUrl, client_reference_id }
 */
export async function createCreditCheckout(_userId, quantity = 1) {
  const res = await apiFetch("/createCreditCheckout", {
    method: "POST",
    body: JSON.stringify({ quantity }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Төлбөр үүсгэхэд алдаа гарлаа");
  }
  return data;
}

/**
 * Check credit purchase payment status.
 * Returns { status: "pending"|"paid", quantity, amount }
 */
export async function checkCreditPayment(clientRef) {
  const res = await apiFetch(`/checkCreditPayment?ref=${encodeURIComponent(clientRef)}`);
  return res.json();
}

// ── Credit Consumption ───────────────────────────────────────

/**
 * Use 1 credit to activate a gift (remove watermark).
 * Returns { success: true, remainingCredits: number }
 */
export async function useCredit(_userId, giftId) {
  const { data, error } = await supabase.rpc("use_credit", { p_gift_id: giftId });
  if (error) throw new Error("Эрх ашиглахад алдаа гарлаа");
  if (data?.error) {
    throw new Error(
      data.error === "no_credits"
        ? "Эрх хүрэлцэхгүй байна. Эрх худалдаж авна уу."
        : "Эрх ашиглахад алдаа гарлаа",
    );
  }
  return data;
}
