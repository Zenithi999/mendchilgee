/**
 * One-time copy of Firebase (Auth + Firestore + Storage) into Supabase.
 *
 * Needs (never commit these):
 *   scripts/serviceAccountKey.json       Firebase service account (already used by set-admin.mjs)
 *   SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_SECRET_KEY=<service_role / sb_secret_ key>  (Supabase → Project Settings → API Keys)
 *
 * Usage (from valentine-app/scripts):
 *   npm install
 *   node migrate-firebase-to-supabase.mjs --dry-run     # count only, writes nothing
 *   node migrate-firebase-to-supabase.mjs               # copy users + data
 *   node migrate-firebase-to-supabase.mjs --files       # also copy uploaded photos/videos
 *
 * Safe to re-run: everything is upserted by id, existing users are reused.
 * Firebase passwords can't be copied — email users sign in with Google or use
 * "forgot password" once.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const DRY = process.argv.includes("--dry-run");
const FILES = process.argv.includes("--files");

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(resolve(__dirname, "serviceAccountKey.json"), "utf8"));
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY first.");
  process.exit(1);
}

const bucketName =
  process.env.FIREBASE_STORAGE_BUCKET || serviceAccount.project_id + ".firebasestorage.app";
initializeApp({ credential: cert(serviceAccount), storageBucket: bucketName });
const fs = getFirestore();
const fbAuth = getAuth();
const sb = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const log = (...a) => console.log(DRY ? "[dry-run]" : "", ...a);

// ── helpers ─────────────────────────────────────────────────────
/** Firestore values → JSON (Timestamps become ISO strings). */
function toJson(v) {
  if (v === null || v === undefined) return v ?? null;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(toJson);
  if (typeof v === "object") {
    if (typeof v.toDate === "function") return v.toDate().toISOString();
    if (v.latitude !== undefined && v.longitude !== undefined) return { lat: v.latitude, lng: v.longitude };
    if (v.path && v.id && v.firestore) return v.path; // DocumentReference
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = toJson(x);
    return out;
  }
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  return v;
}

async function readCollection(name) {
  const snap = await fs.collection(name).get();
  return snap.docs.map((d) => ({ id: d.id, data: toJson(d.data()) }));
}

async function upsert(table, rows) {
  if (DRY || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 300));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// ── 1. users ────────────────────────────────────────────────────
async function migrateUsers() {
  const existing = new Map(); // email → supabase id
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    data.users.forEach((u) => u.email && existing.set(u.email.toLowerCase(), u.id));
    if (data.users.length < 1000) break;
  }

  const map = new Map(); // firebase uid → supabase uuid
  let created = 0, reused = 0, skipped = 0;
  let token;
  do {
    const res = await fbAuth.listUsers(1000, token);
    for (const u of res.users) {
      if (!u.email) { skipped++; continue; } // anonymous / phone-only
      const email = u.email.toLowerCase();
      let id = existing.get(email);
      if (id) {
        reused++;
      } else if (!DRY) {
        const { data, error } = await sb.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { firebase_uid: u.uid, full_name: u.displayName || undefined, avatar_url: u.photoURL || undefined },
        });
        if (error) { console.warn("  user", email, error.message); continue; }
        id = data.user.id;
        created++;
      } else {
        created++;
      }
      if (id) map.set(u.uid, id);
    }
    token = res.pageToken;
  } while (token);
  log(`users: ${created} created, ${reused} already in Supabase, ${skipped} without email skipped`);
  return map;
}

// ── 2. storage files ────────────────────────────────────────────
async function migrateFiles(uidMap) {
  const urlMap = new Map(); // firebase object path → new public URL
  if (!FILES) return urlMap;
  const [files] = await getStorage().bucket().getFiles();
  let n = 0;
  for (const f of files) {
    if (f.name.endsWith("/")) continue;
    const parts = f.name.split("/");
    if (parts[1] && uidMap.has(parts[1])) parts[1] = uidMap.get(parts[1]);
    const newPath = parts.join("/");
    if (!DRY) {
      const [buf] = await f.download();
      const { error } = await sb.storage.from("media").upload(newPath, buf, {
        contentType: f.metadata.contentType || undefined,
        upsert: true,
        cacheControl: "31536000",
      });
      if (error) { console.warn("  file", f.name, error.message); continue; }
    }
    urlMap.set(f.name, sb.storage.from("media").getPublicUrl(newPath).data.publicUrl);
    if (++n % 50 === 0) log(`  files: ${n}/${files.length}`);
  }
  log(`files: ${n} copied`);
  return urlMap;
}

/** Rewrite Firebase Storage download URLs inside any JSON value. */
function rewriteUrls(value, urlMap) {
  if (urlMap.size === 0) return value;
  const re = /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?"'\s]+)(\?[^"'\s]*)?/g;
  return JSON.parse(
    JSON.stringify(value).replace(re, (m, encPath) => urlMap.get(decodeURIComponent(encPath)) || m),
  );
}

// ── 3. data ─────────────────────────────────────────────────────
async function migrateData(uidMap, urlMap) {
  const mapUid = (uid) => (uid && uidMap.get(uid)) || null;

  // profiles (credits, role, terms, plans)
  const profiles = await readCollection("userProfiles");
  const profileRows = profiles
    .filter((p) => mapUid(p.id))
    .map((p) => ({ id: mapUid(p.id), firebase_uid: p.id, data: p.data }));
  await upsert("profiles", profileRows);
  log(`profiles: ${profileRows.length}/${profiles.length}`);

  // gifts (ids kept → old share links keep working)
  const gifts = await readCollection("gifts");
  const giftRows = gifts.map((g) => {
    const { viewCount = 0, ...data } = rewriteUrls(g.data, urlMap);
    const uid = mapUid(data.userId);
    return {
      id: g.id,
      user_id: uid,
      firebase_uid: data.userId || null,
      view_count: Number(viewCount) || 0,
      data: { ...data, userId: uid },
      created_at: data.createdAt || undefined,
    };
  });
  await upsert("gifts", giftRows);
  log(`gifts: ${giftRows.length} (${giftRows.filter((g) => !g.user_id).length} without an owner account)`);

  const simple = async (collection, table, fn = (d) => ({ id: d.id, data: d.data })) => {
    const docs = await readCollection(collection);
    const rows = docs.map(fn).filter(Boolean);
    await upsert(table, rows);
    log(`${table}: ${rows.length}`);
  };

  await simple("giftResponses", "gift_responses");
  await simple("promoCodes", "promo_codes");
  await simple("promoRedemptions", "promo_redemptions", (d) => {
    const uid = mapUid(d.data.userId);
    if (!uid) return null;
    return { id: `${uid}_${d.data.code}`, user_id: uid, data: { ...d.data, userId: uid } };
  });
  await simple("credit_payments", "credit_payments", (d) => ({
    id: d.id,
    user_id: mapUid(d.data.userId),
    data: { ...d.data, userId: mapUid(d.data.userId) || d.data.userId },
  }));
  await simple("demo_payments", "demo_payments");
  await simple("appSettings", "app_settings");
  await simple("processed_webhook_events", "processed_webhook_events");
}

const uidMap = await migrateUsers();
const urlMap = await migrateFiles(uidMap);
await migrateData(uidMap, urlMap);
log("done ✔");
process.exit(0);
