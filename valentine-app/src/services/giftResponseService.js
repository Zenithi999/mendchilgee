// ═══════════════════════════════════════════════════════════════
// Gift Response Service — latest response/choices per giftId
// ═══════════════════════════════════════════════════════════════

import { getDoc, mergeDoc, nowIso, rowToDoc } from "../lib/docs";

const TABLE = "gift_responses";

export async function saveGiftResponse(giftId, choices) {
  if (!giftId) throw new Error("giftId is required");
  const now = nowIso();
  await mergeDoc(TABLE, String(giftId), {
    giftId: String(giftId),
    choices: choices || {},
    respondedAt: now,
    updatedAt: now,
  });
}

export async function getGiftResponse(giftId) {
  if (!giftId) return null;
  return rowToDoc(await getDoc(TABLE, String(giftId)));
}
