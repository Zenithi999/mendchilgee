// ═══════════════════════════════════════════════════════════════
// Letter trees (Захидлын мод) — database functions + checkout
// ═══════════════════════════════════════════════════════════════

import { supabase, apiFetch } from "../supabase";

const ERRORS = {
  login_required: "Нэвтэрч орно уу",
  invalid_capacity: "Модны хэмжээ буруу байна",
  not_found: "Мод олдсонгүй",
  not_paid: "Энэ мод хараахан идэвхжээгүй байна",
  closed: "Шинэ жил эхэлсэн тул захидал авахаа больсон",
  invalid_decor: "Чимэглэлээ сонгоно уу",
  empty: "Нэр болон захидлаа бичнэ үү",
  full: "Мод дүүрсэн байна 🎄",
  already_paid: "Төлбөр төлөгдсөн модны хэмжээг өөрчлөх боломжгүй",
};

function fail(error) {
  const key = Object.keys(ERRORS).find((k) => error?.message?.includes(k));
  const e = new Error(key ? ERRORS[key] : "Алдаа гарлаа, дахин оролдоно уу");
  e.code = key || "unknown";
  throw e;
}

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error);
  return data;
}

export const createLetterTree = ({ title, ownerName, capacity }) =>
  rpc("create_letter_tree", { p_title: title, p_owner_name: ownerName, p_capacity: capacity });

export const updateLetterTree = (treeId, { title, ownerName, capacity = null }) =>
  rpc("update_letter_tree", {
    p_tree_id: treeId, p_title: title, p_owner_name: ownerName, p_capacity: capacity,
  });

export const deleteLetterTree = (treeId) => rpc("delete_letter_tree", { p_tree_id: treeId });

export const getLetterTree = (treeId) => rpc("get_letter_tree", { p_tree_id: treeId });

export const myLetterTrees = () => rpc("my_letter_trees");

export const addTreeLetter = (treeId, { decor, author, message }) =>
  rpc("add_tree_letter", { p_tree_id: treeId, p_decor: decor, p_author: author, p_message: message });

/** Starts a BYL checkout for the tree and redirects the browser to it. */
export async function payForTree(treeId) {
  let res;
  try {
    res = await apiFetch("/createCreditCheckout", {
      method: "POST",
      body: JSON.stringify({ type: "tree", treeId }),
    });
  } catch {
    throw new Error("Төлбөрийн систем түр ажиллахгүй байна. Дараа дахин оролдоно уу");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.checkoutUrl) {
    throw new Error(data.error === "Already paid" ? "Төлбөр аль хэдийн төлөгдсөн" : "Төлбөрийн холбоос үүсгэж чадсангүй");
  }
  window.location.href = data.checkoutUrl;
}
