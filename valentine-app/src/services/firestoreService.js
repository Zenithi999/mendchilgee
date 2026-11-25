// ═══════════════════════════════════════════════════════════════
// Profile / terms helpers (formerly Firestore; now Supabase).
// File name kept so existing imports keep working.
// ═══════════════════════════════════════════════════════════════

import { supabase } from "../supabase";
import { getDoc } from "../lib/docs";

/** The signed-in user's profile document, or null. */
export async function getUserProfile(userId) {
  const row = await getDoc("profiles", userId);
  return row ? row.data || {} : null;
}

// Save terms agreement for the signed-in user
export const saveTermsAgreement = async (_userId, termsVersion) => {
  const { error } = await supabase.rpc("accept_terms", { p_version: termsVersion });
  if (error) throw error;
};

// Get user's terms agreement status
export const getTermsAgreement = async (userId) => {
  const profile = await getUserProfile(userId);
  if (!profile) return null;
  return {
    termsAccepted: profile.termsAccepted || false,
    termsAcceptedAt: profile.termsAcceptedAt || null,
    termsVersion: profile.termsVersion || null,
  };
};
