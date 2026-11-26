// ═══════════════════════════════════════════════════════════════
// Supabase Edge Function "api" — BYL payments (replaces Firebase functions)
//
//   POST /api/createBylCheckout     tier upgrade checkout (legacy demo)
//   POST /api/createCreditCheckout  gift / plan / tree / credit checkout (login required)
//   POST /api/bylWebhook            BYL webhook
//   GET  /api/checkPaymentStatus    poll tier payment
//   GET  /api/checkCreditPayment    poll gift / credit payment
//   POST /api/checkExpiredGifts     expire gifts past expiresAt
//   POST /api/fixPendingPayments    admin: re-check stuck pending payments
//
// Promo codes and "use credit" are database functions (redeem_promo_code,
// use_credit) the app calls directly.
//
// Deploy:  npx supabase functions deploy api --no-verify-jwt
// Secrets: npx supabase secrets set BYL_PROJECT_ID=... BYL_TOKEN=...
//          BYL_WEBHOOK_SECRET=... BASE_URL=https://www.mendchilgee.site ADMIN_SECRET=...
// ═══════════════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) ?? "";
const cfg = {
  projectId: env("BYL_PROJECT_ID"),
  token: env("BYL_TOKEN"),
  webhookSecret: env("BYL_WEBHOOK_SECRET"),
  baseUrl: env("BASE_URL") || "https://www.mendchilgee.site",
  adminSecret: env("ADMIN_SECRET"),
};

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const nowIso = () => new Date().toISOString();

// ── Pricing (mirror of src/config/plans.js) ──────────────────────
const PRICE_MAP: Record<string, number> = { basic: 6000, premium: 9000, standard: 6000 };
const CREDIT_PRICE = 5000;
const BASE_GIFT_PRICE = 5000;
const INCLUDED_IMAGES = 0;
const EXTRA_IMG_PRICE = 500;
const EXTRA_VID_PRICE = 500;
const VIDEO_CHUNK_SECONDS = 10;
const INCLUDED_VIDEO_SECONDS = 15;
const PLAN_PRICES: Record<string, number> = { basic: 5000, standard: 8000, premium: 12000 };
// Letter trees: capacity → price (mirror of src/components/LetterTree/pricing.js)
const TREE_PRICES: Record<number, number> = { 10: 15000, 15: 20000, 20: 25000, 25: 30000, 30: 35000 };
const PLAN_LABELS: Record<string, string> = { basic: "Энгийн", standard: "Стандарт", premium: "Премиум" };

// ── CORS ─────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  cfg.baseUrl,
  "https://www.mendchilgee.site",
  "https://mendchilgee.site",
  "https://mendchilgee-pi.vercel.app",
  "https://www.bolzii.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

function cors(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : cfg.baseUrl,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });

// ── Helpers ──────────────────────────────────────────────────────
async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) return null;
  return data.user.id;
}

async function bylCreateCheckout(payload: unknown) {
  const res = await fetch(`https://byl.mn/api/v1/projects/${cfg.projectId}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("BYL create checkout failed:", res.status, text);
    return null;
  }
  return (await res.json()).data;
}

async function bylGetCheckout(checkoutId: string) {
  if (!checkoutId || !cfg.token || !cfg.projectId) return null;
  const res = await fetch(
    `https://byl.mn/api/v1/projects/${cfg.projectId}/checkouts/${checkoutId}`,
    { headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const body = await res.json();
  return body.data ?? body;
}

const isComplete = (c: { status?: string } | null) =>
  !!c && (c.status === "complete" || c.status === "paid");

async function hmacHex(secret: string, body: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function processCredit(ref: string, checkout: unknown, via: string) {
  const { data, error } = await db.rpc("process_credit_payment", {
    p_ref: ref, p_checkout: checkout ?? {}, p_via: via,
  });
  if (error) throw error;
  return data;
}

async function processDemo(ref: string, checkout: unknown, via: string) {
  const { data, error } = await db.rpc("process_demo_payment", {
    p_ref: ref, p_checkout: checkout ?? {}, p_via: via,
  });
  if (error) throw error;
  return data;
}

function creditPaymentResponse(d: Record<string, any>) {
  const r: Record<string, unknown> = {
    status: d.status || "pending",
    quantity: d.quantity || 0,
    amount: d.amount || 0,
    purchaseType: d.purchaseType || "credit",
  };
  if (d.purchaseType === "gift") {
    Object.assign(r, {
      giftId: d.giftId,
      imageCount: d.imageCount || 0,
      videoCount: d.videoCount || 0,
      extraImages: d.extraImages || 0,
      imgCost: d.imgCost || 0,
      vidCost: d.vidCost || 0,
      totalAmount: d.totalAmount || d.amount || 0,
    });
  }
  if (d.purchaseType === "tree") {
    Object.assign(r, { treeId: d.treeId, capacity: d.capacity, totalAmount: d.totalAmount || d.amount || 0 });
  }
  if (d.purchaseType === "plan") {
    Object.assign(r, {
      planId: d.planId,
      extraImages: d.extraImages || 0,
      extraVideoSeconds: d.extraVideoSeconds || 0,
      totalAmount: d.totalAmount || d.amount || 0,
    });
  }
  return r;
}

async function forwardToAdminWebhook(ref: string) {
  try {
    const [{ data: settings }, { data: pay }] = await Promise.all([
      db.from("app_settings").select("data").eq("id", "webhook").maybeSingle(),
      db.from("credit_payments").select("user_id, data").eq("id", ref).maybeSingle(),
    ]);
    const url = settings?.data?.url;
    if (!url || !pay) return;
    const cd = pay.data || {};
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "payment.completed",
        purchaseType: cd.purchaseType || "credit",
        userId: pay.user_id,
        giftId: cd.giftId || null,
        treeId: cd.treeId || null,
        amount: cd.totalAmount || cd.amount || 0,
        imageCount: cd.imageCount || 0,
        totalVideoSeconds: cd.totalVideoSeconds || 0,
        paidAt: nowIso(),
        clientRef: ref,
      }),
    });
  } catch (e) {
    console.warn("Admin webhook forward failed:", (e as Error).message);
  }
}

// ── Handlers ─────────────────────────────────────────────────────

async function createBylCheckout(req: Request) {
  const body = await req.json().catch(() => ({}));
  const plan = body.plan;
  const giftId = body.giftId || null;
  if (!PRICE_MAP[plan]) return json(req, { error: "Invalid plan" }, 400);

  const amount = PRICE_MAP[plan];
  const clientRef = `gift_${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${plan}`;
  const giftParam = giftId ? `&giftId=${encodeURIComponent(giftId)}` : "";
  const checkout = await bylCreateCheckout({
    success_url: `${cfg.baseUrl}/payment/success?ref=${encodeURIComponent(clientRef)}${giftParam}`,
    cancel_url: cfg.baseUrl,
    client_reference_id: clientRef,
    customer_email: body.customerEmail || null,
    items: [{ price_data: { unit_amount: amount, product_data: { name: `Valentine demo - ${plan}` } }, quantity: 1 }],
  });
  if (!checkout) return json(req, { error: "BYL create failed" }, 500);

  const { error } = await db.from("demo_payments").insert({
    id: clientRef,
    data: {
      client_reference_id: clientRef, plan, giftId, amount, status: "pending",
      checkout_id: checkout.id || null, createdAt: nowIso(), checkoutRaw: checkout,
    },
  });
  if (error) throw error;
  return json(req, { checkoutUrl: checkout.url, client_reference_id: clientRef });
}

async function createCreditCheckout(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return json(req, { error: "Нэвтэрнэ үү" }, 401);

  const body = await req.json().catch(() => ({}));
  const purchaseType = body.type || "credit";
  const rand = Math.random().toString(36).slice(2, 9);
  const meta: Record<string, unknown> = {};
  let amount: number;
  let quantity = 1;
  let clientRef: string;
  let productName: string;

  if (purchaseType === "gift") {
    const giftId = body.giftId;
    if (!giftId) return json(req, { error: "Missing giftId" }, 400);
    const { data: gift } = await db.from("gifts").select("user_id").eq("id", giftId).maybeSingle();
    if (!gift || gift.user_id !== userId) return json(req, { error: "Gift not found" }, 404);

    const imageCount = Math.max(0, parseInt(body.imageCount) || 0);
    const extraImages = Math.max(0, imageCount - INCLUDED_IMAGES);
    const imgCost = extraImages * EXTRA_IMG_PRICE;
    const totalVideoSeconds = Math.max(0, parseInt(body.totalVideoSeconds) || 0);
    const extraVideoSeconds = Math.max(0, totalVideoSeconds - INCLUDED_VIDEO_SECONDS);
    const videoChunks = extraVideoSeconds > 0 ? Math.ceil(extraVideoSeconds / VIDEO_CHUNK_SECONDS) : 0;
    const vidCost = videoChunks * EXTRA_VID_PRICE;
    amount = BASE_GIFT_PRICE + imgCost + vidCost;

    clientRef = `credit_${Date.now()}_${rand}_gift`;
    productName = "Мэндчилгээ";
    if (imageCount > 0) productName += ` +${imageCount} зураг`;
    if (videoChunks > 0) productName += ` +${totalVideoSeconds}сек видео`;
    Object.assign(meta, {
      purchaseType: "gift", giftId, imageCount, totalVideoSeconds, videoChunks,
      extraImages, imgCost, vidCost, totalAmount: amount,
    });
  } else if (purchaseType === "tree") {
    const treeId = body.treeId;
    if (!treeId) return json(req, { error: "Missing treeId" }, 400);
    const { data: tree } = await db.from("letter_trees")
      .select("user_id, capacity, paid").eq("id", treeId).maybeSingle();
    if (!tree || tree.user_id !== userId) return json(req, { error: "Tree not found" }, 404);
    if (tree.paid) return json(req, { error: "Already paid" }, 409);
    const capacity = tree.capacity as number;
    if (!TREE_PRICES[capacity]) return json(req, { error: "Invalid capacity" }, 400);
    amount = TREE_PRICES[capacity];
    clientRef = `credit_${Date.now()}_${rand}_tree`;
    productName = `Захидлын мод (${capacity} захидал)`;
    Object.assign(meta, { purchaseType: "tree", treeId, capacity, totalAmount: amount });
  } else if (purchaseType === "plan") {
    const planId = body.planId;
    if (!planId || !PLAN_PRICES[planId]) return json(req, { error: "Invalid planId" }, 400);
    const extraImages = Math.max(0, parseInt(body.extraImages) || 0);
    const extraVideoSeconds = Math.max(0, parseInt(body.extraVideoSeconds) || 0);
    amount = PLAN_PRICES[planId] + extraImages * EXTRA_IMG_PRICE +
      Math.ceil(extraVideoSeconds / 10) * EXTRA_VID_PRICE;
    clientRef = `credit_${Date.now()}_${rand}_plan`;
    productName = `${PLAN_LABELS[planId] || planId} багц`;
    Object.assign(meta, { purchaseType: "plan", planId, extraImages, extraVideoSeconds, totalAmount: amount });
  } else {
    quantity = Math.max(1, Math.min(10, parseInt(body.quantity) || 1));
    amount = CREDIT_PRICE * quantity;
    clientRef = `credit_${Date.now()}_${rand}_${quantity}`;
    productName = `Мэндчилгээ эрх (x${quantity})`;
  }

  const enc = encodeURIComponent(clientRef);
  const checkout = await bylCreateCheckout({
    success_url: `${cfg.baseUrl}/payment/success?ref=${enc}&type=credit`,
    cancel_url: `${cfg.baseUrl}/payment/cancel?ref=${enc}&type=credit`,
    client_reference_id: clientRef,
    items: [{ price_data: { unit_amount: amount, product_data: { name: productName } }, quantity: 1 }],
  });
  if (!checkout) return json(req, { error: "BYL checkout creation failed" }, 500);

  const { error } = await db.from("credit_payments").insert({
    id: clientRef,
    user_id: userId,
    data: {
      client_reference_id: clientRef, userId, quantity, amount, status: "pending",
      checkout_id: checkout.id || null, createdAt: nowIso(), ...meta,
    },
  });
  if (error) throw error;
  return json(req, { checkoutUrl: checkout.url, client_reference_id: clientRef });
}

async function bylWebhook(req: Request) {
  const raw = new Uint8Array(await req.arrayBuffer());
  const signature = (req.headers.get("Byl-Signature") ?? "").toLowerCase();
  const signed = !!cfg.webhookSecret && safeEqual(await hmacHex(cfg.webhookSecret, raw), signature);

  let event: any;
  try {
    event = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventId = event.id?.toString();
  if (eventId) {
    const { data: seen } = await db.from("processed_webhook_events").select("id").eq("id", eventId).maybeSingle();
    if (seen) return new Response("OK");
  }

  if (event.type === "checkout.completed") {
    let checkout = event.data?.object;
    // Bad/missing signature: don't trust the body — ask BYL directly.
    if (!signed) {
      console.warn("Webhook signature mismatch — verifying with BYL API");
      checkout = await bylGetCheckout(checkout?.id);
    }
    const ref = checkout?.client_reference_id;
    if (isComplete(checkout) && ref) {
      if (ref.startsWith("credit_")) {
        const r = await processCredit(ref, checkout, signed ? "webhook" : "webhook_verified_api");
        if (r?.already === false) await forwardToAdminWebhook(ref);
      } else {
        await processDemo(ref, checkout, "webhook");
      }
    } else if (!signed) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  if (eventId) {
    await db.from("processed_webhook_events").upsert({
      id: eventId, data: { processedAt: nowIso(), eventType: event.type || null },
    });
  }
  return new Response("OK");
}

async function checkPaymentStatus(req: Request, url: URL) {
  const ref = url.searchParams.get("ref");
  if (!ref) return json(req, { error: "missing ref" }, 400);
  const { data: row } = await db.from("demo_payments").select("data").eq("id", ref).maybeSingle();
  if (!row) return json(req, { status: "not_found" }, 404);
  const d = row.data || {};
  const out = (status: string) => json(req, {
    status, paidAt: d.paidAt || null, amount: d.amount || null, plan: d.plan || null, giftId: d.giftId || null,
  });
  if (d.status === "paid") return out("paid");

  const checkout = await bylGetCheckout(d.checkout_id).catch(() => null);
  if (isComplete(checkout)) {
    await processDemo(ref, checkout, "polling_fallback");
    return out("paid");
  }
  return out(d.status || "pending");
}

async function checkCreditPayment(req: Request, url: URL) {
  const ref = url.searchParams.get("ref");
  if (!ref) return json(req, { error: "missing ref" }, 400);
  const { data: row } = await db.from("credit_payments").select("data").eq("id", ref).maybeSingle();
  if (!row) return json(req, { status: "not_found" }, 404);
  const d = row.data || {};
  if (d.status === "paid") return json(req, creditPaymentResponse(d));

  const checkout = await bylGetCheckout(d.checkout_id).catch(() => null);
  if (isComplete(checkout)) {
    const r = await processCredit(ref, checkout, "polling_fallback");
    if (r?.already === false) await forwardToAdminWebhook(ref);
    return json(req, creditPaymentResponse({ ...d, status: "paid" }));
  }
  return json(req, creditPaymentResponse(d));
}

async function checkExpiredGifts(req: Request) {
  const { data, error } = await db.rpc("expire_gifts");
  if (error) throw error;
  return json(req, { expired: data, message: `Expired ${data} gifts` });
}

async function fixPendingPayments(req: Request, url: URL) {
  const body = await req.json().catch(() => ({}));
  const key = body.adminKey || url.searchParams.get("adminKey");
  if (!cfg.adminSecret || key !== cfg.adminSecret) return json(req, { error: "Unauthorized" }, 403);

  const results: Record<string, any> = {};
  for (const [table, process] of [
    ["credit_payments", processCredit],
    ["demo_payments", processDemo],
  ] as const) {
    const r = { scanned: 0, fixed: 0, notPaid: 0, errors: 0, details: [] as unknown[] };
    const { data: rows } = await db.from(table).select("id, data").eq("data->>status", "pending");
    r.scanned = rows?.length || 0;
    for (const row of rows || []) {
      try {
        const checkout = await bylGetCheckout(row.data?.checkout_id);
        if (!checkout) {
          r.errors++;
          r.details.push({ ref: row.id, error: "checkout lookup failed" });
        } else if (isComplete(checkout)) {
          await process(row.id, checkout, "fixPendingPayments");
          r.fixed++;
          r.details.push({ ref: row.id, status: "FIXED" });
        } else {
          r.notPaid++;
          r.details.push({ ref: row.id, bylStatus: checkout.status, status: "NOT_PAID_ON_BYL" });
        }
      } catch (e) {
        r.errors++;
        r.details.push({ ref: row.id, error: (e as Error).message });
      }
    }
    results[table === "credit_payments" ? "creditPayments" : "demoPayments"] = r;
  }
  return json(req, results);
}

// ── Router ───────────────────────────────────────────────────────
const routes: Record<string, { method: string[]; fn: (req: Request, url: URL) => Promise<Response> }> = {
  createBylCheckout: { method: ["POST"], fn: createBylCheckout },
  createCreditCheckout: { method: ["POST"], fn: createCreditCheckout },
  bylWebhook: { method: ["POST"], fn: bylWebhook },
  checkPaymentStatus: { method: ["GET"], fn: checkPaymentStatus },
  checkCreditPayment: { method: ["GET"], fn: checkCreditPayment },
  checkExpiredGifts: { method: ["GET", "POST"], fn: checkExpiredGifts },
  fixPendingPayments: { method: ["POST"], fn: fixPendingPayments },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });

  const url = new URL(req.url);
  const name = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const route = routes[name];
  if (!route) return json(req, { error: "not_found" }, 404);
  if (!route.method.includes(req.method)) return json(req, { error: "Method Not Allowed" }, 405);

  try {
    return await route.fn(req, url);
  } catch (err) {
    console.error(`${name} error:`, err);
    return json(req, { error: "internal_error" }, 500);
  }
});
