// Supabase core exports
export { supabase } from "../supabase";

// Auth service exports
export {
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  logout,
  onAuthChange,
  getCurrentUser,
} from "./authService";

// Profile / terms exports
export { getUserProfile, saveTermsAgreement, getTermsAgreement } from "./firestoreService";

// Storage exports
export {
  uploadFile,
  uploadFileWithProgress,
  uploadMemoryPhoto,
  uploadMemoryPhotoWithProgress,
  uploadMemoryVideo,
  uploadCouplePhoto,
  optimizedImageUrl,
  optimizedVideoUrl,
  videoThumbnailUrl,
} from "./cloudinaryService";
