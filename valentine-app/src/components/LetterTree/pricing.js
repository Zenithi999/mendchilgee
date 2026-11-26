// Letter tree sizes → price (₮). Mirror of TREE_PRICES in supabase/functions/api.
export const TREE_TIERS = [
  { capacity: 10, price: 15000, label: "Жижиг" },
  { capacity: 15, price: 20000, label: "Дунд" },
  { capacity: 20, price: 25000, label: "Том" },
  { capacity: 25, price: 30000, label: "Их том" },
  { capacity: 30, price: 35000, label: "Аварга" },
];

export const priceFor = (capacity) => TREE_TIERS.find((t) => t.capacity === capacity)?.price ?? 0;
export const formatMnt = (n) => `${n.toLocaleString("en-US")}₮`;
