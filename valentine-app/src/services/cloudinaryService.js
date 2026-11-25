// ═══════════════════════════════════════════════════════════════
// Storage Service — Supabase Storage (bucket "media", public)
// File name kept so existing imports keep working.
// Paths are always  <kind>/<userId>/<file>  — the bucket policy only lets
// a user upload into their own <userId> folder.
// ═══════════════════════════════════════════════════════════════

import { supabase, SUPABASE_URL } from "../supabase";

const BUCKET = "media";
const SUPABASE_KEY =
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const rand = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const extOf = (file, fallback) => file.name?.split(".").pop()?.toLowerCase() || fallback;

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error("Нэвтэрсний дараа файл оруулна уу");
  return { id, token: data.session.access_token };
}

/**
 * Upload with progress (XHR — supabase-js has no progress events).
 * @returns {Promise<string>} public URL
 */
async function uploadToStorage(file, path, onProgress) {
  const { token } = await currentUserId();
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodedPath}`;

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=31536000");
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      console.error("Storage upload error:", xhr.status, xhr.responseText);
      reject(new Error(xhr.status === 413 ? "Файл хэт том байна" : "Файл оруулахад алдаа гарлаа"));
    };
    xhr.onerror = () => reject(new Error("Сүлжээний алдаа"));
    xhr.send(file);
  });

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ═══════════════════════════════════════════════════════════════
// URL helpers — passthrough, kept so existing imports don't break.
// ═══════════════════════════════════════════════════════════════

export function optimizedImageUrl(url) {
  return url || "";
}

export function optimizedVideoUrl(url) {
  return url || "";
}

export function videoThumbnailUrl(url) {
  return url || "";
}

// ═══════════════════════════════════════════════════════════════
// App-specific upload helpers
// ═══════════════════════════════════════════════════════════════

/** Upload a memory photo. Returns its public URL. */
export async function uploadMemoryPhoto(file, _userId, onProgress) {
  const { id } = await currentUserId();
  return uploadToStorage(file, `memories/${id}/${rand()}.${extOf(file, "jpg")}`, onProgress);
}

export function uploadMemoryPhotoWithProgress(file, userId, onProgress) {
  return uploadMemoryPhoto(file, userId, onProgress);
}

/** Upload a memory video. Returns its public URL. */
export async function uploadMemoryVideo(file, _userId, onProgress) {
  const { id } = await currentUserId();
  return uploadToStorage(file, `videos/${id}/${rand()}.${extOf(file, "mp4")}`, onProgress);
}

/** Upload profile/couple photo. */
export async function uploadCouplePhoto(file) {
  const { id } = await currentUserId();
  return uploadToStorage(file, `couples/${id}/${rand()}.${extOf(file, "jpg")}`);
}

/** Generic file upload. */
export async function uploadFile(file) {
  const { id } = await currentUserId();
  return uploadToStorage(file, `uploads/${id}/${rand()}.${extOf(file, "bin")}`);
}

/** Generic upload with progress. */
export async function uploadFileWithProgress(file, _storagePath, onProgress) {
  const { id } = await currentUserId();
  return uploadToStorage(file, `uploads/${id}/${rand()}.${extOf(file, "bin")}`, onProgress);
}
