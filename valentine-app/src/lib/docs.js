// ═══════════════════════════════════════════════════════════════
// Small document helpers over Supabase tables.
// Every table is { id text, data jsonb, ... } — the app keeps working
// with plain objects shaped like the old Firestore documents.
// ═══════════════════════════════════════════════════════════════

import { supabase } from "../supabase";

export const nowIso = () => new Date().toISOString();

/** Turn a timestamp (ISO string, Date, millis, or legacy Firestore {seconds}) into a Date. */
export function toDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (typeof ts === "object" && "seconds" in ts) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const toMillis = (ts) => toDate(ts)?.getTime() || 0;

/** Row → app object */
export const rowToDoc = (row) => (row ? { ...(row.data || {}), id: row.id } : null);

function check(error) {
  if (error) throw error;
}

export async function getDoc(table, id) {
  const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  check(error);
  return data;
}

export async function listDocs(table, select = "*") {
  const { data, error } = await supabase.from(table).select(select);
  check(error);
  return data || [];
}

/** Insert or shallow-merge `patch` into the row's data. */
export async function mergeDoc(table, id, patch, extra = {}) {
  const existing = await getDoc(table, id);
  if (existing) {
    const { error } = await supabase
      .from(table)
      .update({ data: { ...existing.data, ...patch }, ...extra })
      .eq("id", id);
    check(error);
  } else {
    const { error } = await supabase.from(table).insert({ id, data: patch, ...extra });
    check(error);
  }
}

export async function deleteDoc(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  check(error);
}

let channelSeq = 0;

/**
 * Live subscription: calls `load()` now and again whenever `table` changes.
 * `filter` is a Realtime filter like "id=eq.abc". Returns an unsubscribe fn.
 */
export function subscribe(table, load, filter) {
  let active = true;
  let timer = null;
  const run = () => {
    if (active) load().catch((e) => console.error(`load ${table} failed:`, e));
  };
  run();
  const channel = supabase
    .channel(`${table}-${++channelSeq}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
      () => {
        clearTimeout(timer);
        timer = setTimeout(run, 150);
      },
    )
    .subscribe();
  return () => {
    active = false;
    clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
