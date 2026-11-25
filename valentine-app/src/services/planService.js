// ═══════════════════════════════════════════════════════════════
// Plan Service — Legacy helpers kept for backward compat
// ═══════════════════════════════════════════════════════════════

import { apiFetch } from "../supabase";
import { getDoc, subscribe, toDate } from "../lib/docs";
import { useCredit as consumeCredit } from "./creditService";
import { MAX_VIDEO_SECONDS } from "../config/plans";

// ── Plan Subscriptions (real-time) ──────────────────────────

/**
 * Subscribe to user's active plan in real-time.
 * Returns an unsubscribe function.
 * Callback receives: { planId, extraImages, extraVideoSeconds, activatedAt, expiresAt, ... }
 */
export function subscribeToUserPlan(userId, callback) {
  return subscribe(
    "profiles",
    async () => {
      const row = await getDoc("profiles", userId);
      const data = row?.data || {};
      callback({
        planId: data.planId || null,
        extraImages: data.extraImages || 0,
        extraVideoSeconds: data.extraVideoSeconds || 0,
        credits: data.credits || 0,
        planActivatedAt: data.planActivatedAt || null,
        planExpiresAt: data.planExpiresAt || null,
      });
    },
    `id=eq.${userId}`,
  );
}

/**
 * Get user's current plan info (one-time read).
 */
export async function getUserPlan(userId) {
  const data = (await getDoc("profiles", userId))?.data || {};
  return {
    planId: data.planId || null,
    extraImages: data.extraImages || 0,
    extraVideoSeconds: data.extraVideoSeconds || 0,
    credits: data.credits || 0,
  };
}

// ── Plan Purchase ────────────────────────────────────────────

/**
 * Create a BYL checkout for purchasing a plan + extras.
 * @param {string} userId
 * @param {{ planId: string, extraImages: number, extraVideoSeconds: number, totalAmount: number }} options
 * @returns {{ checkoutUrl: string, client_reference_id: string }}
 */
export async function createPlanCheckout(_userId, { planId, extraImages, extraVideoSeconds, totalAmount }) {
  const res = await apiFetch("/createCreditCheckout", {
    method: "POST",
    body: JSON.stringify({
      quantity: 1,
      // Pass plan info as metadata for the backend
      planId,
      extraImages,
      extraVideoSeconds,
      totalAmount,
      type: "plan",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Төлбөр үүсгэхэд алдаа гарлаа");
  }
  return data;
}

/**
 * Check plan payment status.
 */
export async function checkPlanPayment(clientRef) {
  const res = await apiFetch(`/checkCreditPayment?ref=${encodeURIComponent(clientRef)}`);
  return res.json();
}

// ── Plan Activation (use 1 credit to activate a gift) ───────

/**
 * Activate a gift using the user's plan / credit.
 * Calls the existing useCredit endpoint but also passes plan info.
 */
export async function activateGiftWithPlan(userId, giftId) {
  return consumeCredit(userId, giftId);
}

// ── Limits Helpers ──────────────────────────────────────────

/**
 * Get the effective image limit for a user. (Now fixed at 20)
 */
export function getUserImageLimit() {
  return 20; // no hard limit per plan; soft limit in UI
}

/**
 * Get the effective video limit for a user (in seconds).
 */
export function getUserVideoLimit() {
  return MAX_VIDEO_SECONDS; // 60s global cap
}

/**
 * Check if a user's plan is expired.
 */
export function isPlanExpired(planExpiresAt) {
  if (!planExpiresAt) return true;
  const expiresDate = toDate(planExpiresAt);
  return new Date() > expiresDate;
}

/**
 * Get remaining days for a plan.
 */
export function getPlanRemainingDays(planExpiresAt) {
  if (!planExpiresAt) return 0;
  const expiresDate = toDate(planExpiresAt);
  const diff = expiresDate - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
