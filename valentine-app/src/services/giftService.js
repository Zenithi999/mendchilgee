// ═══════════════════════════════════════════════════════════════
// Gift Service — CRUD for the `gifts` table (Supabase)
// Row: { id, user_id, data (gift body), view_count, created_at, updated_at }
// ═══════════════════════════════════════════════════════════════

import { supabase } from "../supabase";
import { nowIso } from "../lib/docs";

const TABLE = "gifts";

/**
 * Deep-clean an object so it is valid JSON:
 * strips undefined / functions / symbols, turns NaN/Infinity into null.
 */
function sanitize(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj === "string" || typeof obj === "boolean") return obj;
  if (typeof obj === "number") return Number.isFinite(obj) ? obj : null;
  if (typeof obj === "function" || typeof obj === "symbol") return undefined;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(sanitize).filter((v) => v !== undefined);
  if (typeof obj === "object") {
    const clean = {};
    for (const [key, value] of Object.entries(obj)) {
      const v = sanitize(value);
      if (v !== undefined) clean[key] = v;
    }
    return clean;
  }
  return obj;
}

/** DB row → the gift object the UI uses */
function rowToGift(row) {
  if (!row) return null;
  return {
    ...(row.data || {}),
    id: row.id,
    userId: row.user_id ?? row.data?.userId ?? null,
    viewCount: row.view_count ?? 0,
  };
}

/** Strip fields that live in columns, not in `data` */
function toData(gift) {
  const raw = { ...gift };
  delete raw.id;
  delete raw.viewCount;
  return sanitize(raw);
}

/**
 * Save a new gift. Returns the generated ID.
 */
export async function saveGift(gift, userId) {
  const now = nowIso();
  const data = toData({ ...gift, userId, createdAt: now, updatedAt: now });
  const { data: row, error } = await supabase
    .from(TABLE)
    .insert({ user_id: userId, data })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

/**
 * Update an existing gift (shallow merge into the stored body).
 * Payment fields (paidTier, creditUsed, expiresAt…) are protected by the
 * database and only change through payments / credits.
 */
export async function updateGift(giftId, gift) {
  const { data: current, error: readErr } = await supabase
    .from(TABLE)
    .select("data")
    .eq("id", giftId)
    .single();
  if (readErr) throw readErr;
  const data = { ...(current.data || {}), ...toData(gift), updatedAt: nowIso() };
  const { error } = await supabase.from(TABLE).update({ data }).eq("id", giftId);
  if (error) throw error;
}

/**
 * Save or update: if the gift already has an id, update; otherwise create.
 * Returns the document ID.
 */
export async function saveOrUpdateGift(gift, userId) {
  if (gift.id) {
    await updateGift(gift.id, gift);
    return gift.id;
  }
  return saveGift(gift, userId);
}

/**
 * Get a single gift by ID.
 */
export async function getGift(giftId) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", giftId).maybeSingle();
  if (error) throw error;
  return rowToGift(data);
}

/**
 * Get all gifts for a specific user.
 */
export async function getUserGifts(userId) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("user_id", userId);
  if (error) throw error;
  return (data || []).map(rowToGift);
}

/**
 * Delete a gift by ID.
 */
export async function deleteGift(giftId) {
  const { error } = await supabase.from(TABLE).delete().eq("id", giftId);
  if (error) throw error;
}

/**
 * Increment the view counter (called when a recipient opens the gift).
 */
export async function incrementViewCount(giftId) {
  const { error } = await supabase.rpc("increment_gift_view", { p_gift_id: giftId });
  if (error) console.warn("Failed to increment view count:", error);
}

/**
 * Mark a gift whose paid period ended as expired (anyone may do this).
 */
export async function markGiftExpired(giftId) {
  const { error } = await supabase.rpc("mark_gift_expired", { p_gift_id: giftId });
  if (error) console.warn("Failed to mark gift expired:", error);
}
