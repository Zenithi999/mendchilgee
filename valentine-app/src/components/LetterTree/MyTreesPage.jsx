// ═══════════════════════════════════════════════════════════════
// /trees — create a letter tree (pick its size / price) and list mine.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ChristmasDecor from "../ChristmasDecor";
import PixelTree from "./PixelTree";
import { DECORS } from "./decors";
import { TREE_TIERS, formatMnt } from "./pricing";
import { useAuth } from "../../contexts/AuthContext";
import { createLetterTree, myLetterTrees, deleteLetterTree, payForTree } from "../../services/treeService";
import "../ChristmasDecor.css";
import "./LetterTree.css";

// sample ornaments so each size shows how big the full tree gets
const sample = (capacity) =>
  Array.from({ length: capacity }, (_, slot) => ({ slot, decor: DECORS[(slot * 7) % DECORS.length].id }));

export default function MyTreesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trees, setTrees] = useState(null);
  const [capacity, setCapacity] = useState(10);
  const [title, setTitle] = useState("Шинэ оны захидлын мод");
  const [ownerName, setOwnerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    myLetterTrees()
      .then((t) => {
        if (!alive) return;
        setTrees(t || []);
        if (!t?.length) setCreating(true);
      })
      .catch(() => {
        if (!alive) return;
        setTrees([]);
        setCreating(true);
      });
    return () => { alive = false; };
  }, []);

  const create = async (e) => {
    e.preventDefault();
    if (user?.isAnonymous) {
      setErr("Мод үүсгэхийн тулд бүртгэлээр нэвтэрнэ үү");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const id = await createLetterTree({ title, ownerName, capacity });
      try {
        await payForTree(id); // redirects to BYL
      } catch {
        // payment page couldn't open — the tree page has a "pay" button too
        navigate(`/tree/${id}`);
      }
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Төлбөр төлөгдөөгүй энэ модыг устгах уу?")) return;
    try {
      await deleteLetterTree(id);
      setTrees((t) => t.filter((x) => x.id !== id));
    } catch (e2) {
      alert(e2.message);
    }
  };

  const tier = TREE_TIERS.find((t) => t.capacity === capacity);

  return (
    <div className="lt-page xmas-theme">
      <ChristmasDecor showTree={false} />
      <div className="lt-topbar">
        <Link to="/">← Нүүр</Link>
        <span className="lt-brand">🎄 Захидлын мод</span>
      </div>

      <div className="lt-card" style={{ textAlign: "center" }}>
        <h1 className="lt-title">🎄 Шинэ оны захидлын мод</h1>
        <p className="lt-sub">
          Модоо үүсгээд QR код эсвэл линкээ найзууддаа илгээ. Захидал бүр модонд гэрэлтэх
          чимэглэл болж өлгөгдөнө. Захидлуудаа <b>1-р сарын 1-ний 00:00</b>-оос уншина ✨
        </p>
        <Link to="/tree/demo" className="lt-btn lt-btn-ghost" style={{ textDecoration: "none" }}>👀 Жишээ мод үзэх</Link>
      </div>

      {trees && trees.length > 0 && (
        <div className="lt-card">
          <h2 className="lt-title" style={{ fontSize: 20 }}>Миний модууд</h2>
          <div className="lt-tree-list">
            {trees.map((t) => (
              <div key={t.id} className="lt-tree-row">
                <Link to={`/tree/${t.id}`} className="lt-mini">
                  <PixelTree capacity={t.capacity} ornaments={sample(t.count)} showEmpty={false} still />
                </Link>
                <Link to={`/tree/${t.id}`} style={{ flex: 1, color: "inherit", textDecoration: "none" }}>
                  <b>{t.title}</b>
                  <small>💌 {t.count}/{t.capacity} захидал</small>{" "}
                  <span className={`lt-badge ${t.paid ? "lt-badge-paid" : "lt-badge-unpaid"}`}>
                    {t.paid ? "Идэвхтэй" : "Төлбөр хүлээгдэж байна"}
                  </span>
                </Link>
                {!t.paid && (
                  <button className="lt-btn lt-btn-ghost" style={{ width: "auto", padding: "8px 10px", fontSize: 13 }} onClick={() => remove(t.id)}>
                    Устгах
                  </button>
                )}
              </div>
            ))}
          </div>
          {!creating && (
            <button className="lt-btn" style={{ marginTop: 12 }} onClick={() => setCreating(true)}>＋ Шинэ мод үүсгэх</button>
          )}
        </div>
      )}

      {creating && (
        <form className="lt-card" onSubmit={create}>
          <h2 className="lt-title" style={{ fontSize: 20 }}>1. Модныхоо хэмжээг сонго</h2>
          <p className="lt-sub">Олон захидал = илүү том, илүү гэрэлтэй мод 🎄</p>
          <div className="lt-tiers">
            {TREE_TIERS.map((t) => (
              <button
                type="button"
                key={t.capacity}
                className={`lt-tier ${capacity === t.capacity ? "is-on" : ""}`}
                onClick={() => setCapacity(t.capacity)}
                aria-pressed={capacity === t.capacity}
              >
                <div className="lt-tier-tree" style={{ height: 80 + t.capacity * 3.2 }}>
                  <PixelTree capacity={t.capacity} ornaments={sample(t.capacity)} showEmpty={false} still={capacity !== t.capacity} />
                </div>
                <b>{t.label} · {t.capacity} захидал</b>
                <span className="lt-price">{formatMnt(t.price)}</span>
              </button>
            ))}
          </div>

          <h2 className="lt-title" style={{ fontSize: 20, marginTop: 20 }}>2. Нэр өгөх</h2>
          <div className="lt-modal" style={{ animation: "none", boxShadow: "none", border: "none", padding: 0, background: "transparent", maxHeight: "none" }}>
            <label htmlFor="lt-title">Модны нэр</label>
            <input id="lt-title" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
            <label htmlFor="lt-owner">Таны нэр (найзууд чинь харна)</label>
            <input id="lt-owner" value={ownerName} maxLength={40} onChange={(e) => setOwnerName(e.target.value)} placeholder="Жишээ: Тэмүүлэн" />
          </div>

          {err && <p className="lt-err">{err}</p>}
          <button type="submit" className="lt-btn" style={{ marginTop: 16 }} disabled={busy}>
            {busy ? "Түр хүлээнэ үү..." : `Үүсгээд төлөх · ${formatMnt(tier.price)}`}
          </button>
        </form>
      )}
    </div>
  );
}
