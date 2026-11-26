// ═══════════════════════════════════════════════════════════════
// /tree/:treeId — a letter tree.
//   Visitors: pick an ornament, write a letter → it hangs on the tree.
//   Owner:    share link / QR, pay if needed, and from 1 January read letters.
//   /tree/demo is a local showcase (nothing is saved).
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import ChristmasDecor from "../ChristmasDecor";
import PixelTree, { DecorSprite } from "./PixelTree";
import { DECORS, DECOR_BY_ID } from "./decors";
import { priceFor, formatMnt } from "./pricing";
import { getLetterTree, addTreeLetter, payForTree } from "../../services/treeService";
import "../ChristmasDecor.css";
import "./LetterTree.css";

const BURST = ["🎄", "❄️", "⭐", "🎁", "✨", "🔔", "🎅", "⛄", "🍬", "💌"];
const MAX_MSG = 1000;

function nextNewYearMs() {
  // 1 January 00:00 Ulaanbaatar (UTC+8)
  const now = new Date();
  const ubYear = new Date(now.getTime() + 8 * 3600e3).getUTCFullYear();
  return Date.UTC(ubYear + 1, 0, 1) - 8 * 3600e3;
}

function demoTree() {
  const capacity = 15;
  const decorIds = DECORS.map((d) => d.id);
  return {
    id: "demo",
    title: "Шинэ оны захидлын мод",
    ownerName: "Жишээ",
    capacity,
    paid: true,
    unlockAt: new Date(nextNewYearMs()).toISOString(),
    serverNow: new Date().toISOString(),
    isOwner: false,
    unlocked: false,
    ornaments: Array.from({ length: 9 }, (_, slot) => ({ slot, decor: decorIds[(slot * 5) % decorIds.length] })),
  };
}

function useCountdown(targetIso, offsetMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!targetIso) return null;
  const left = Math.max(0, new Date(targetIso).getTime() - (now + offsetMs));
  return {
    done: left === 0,
    d: Math.floor(left / 86400e3),
    h: Math.floor(left / 3600e3) % 24,
    m: Math.floor(left / 60e3) % 60,
    s: Math.floor(left / 1e3) % 60,
  };
}

function Burst({ seed }) {
  const parts = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => {
        const a = (i / 36) * Math.PI * 2 + (seed % 7);
        const dist = 140 + ((i * 47 + seed) % 160);
        return {
          e: BURST[(i + seed) % BURST.length],
          x: `${Math.cos(a) * dist}px`,
          y: `${Math.sin(a) * dist}px`,
          r: `${((i * 73) % 360) - 180}deg`,
          delay: `${(i % 6) * 0.03}s`,
        };
      }),
    [seed],
  );
  return (
    <div className="lt-burst" aria-hidden="true">
      {parts.map((p, i) => (
        <span key={i} style={{ "--x": p.x, "--y": p.y, "--r": p.r, animationDelay: p.delay }}>{p.e}</span>
      ))}
    </div>
  );
}

function WriteModal({ tree, onClose, onDone }) {
  const [decor, setDecor] = useState(DECORS[0].id);
  const [author, setAuthor] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!author.trim() || !message.trim()) {
      setErr("Нэр болон захидлаа бичнэ үү");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      if (tree.id === "demo") {
        const used = new Set(tree.ornaments.map((o) => o.slot));
        let slot = 0;
        while (used.has(slot)) slot++;
        if (slot >= tree.capacity) throw new Error("Мод дүүрсэн байна 🎄");
        onDone({ slot, decor });
      } else {
        const r = await addTreeLetter(tree.id, { decor, author, message });
        onDone({ slot: r.slot, decor });
      }
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  return (
    <div className="lt-modal-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="lt-modal" onSubmit={submit}>
        <h3>✍️ Захидал бичих</h3>
        <p className="lt-sub" style={{ margin: 0 }}>
          {tree.ownerName ? `${tree.ownerName}-д` : "Модны эзэнд"} шинэ оны захидал үлдээгээрэй
        </p>

        <label>1. Захидлаа ямар чимэглэл болгох вэ?</label>
        <div className="lt-decor-grid">
          {DECORS.map((d) => (
            <button
              type="button"
              key={d.id}
              className={`lt-decor-opt ${decor === d.id ? "is-on" : ""}`}
              onClick={() => setDecor(d.id)}
              aria-pressed={decor === d.id}
            >
              <DecorSprite id={d.id} size={38} blink={decor === d.id} />
              {d.name}
            </button>
          ))}
        </div>

        <label htmlFor="lt-author">2. Таны нэр</label>
        <input id="lt-author" value={author} maxLength={40} onChange={(e) => setAuthor(e.target.value)} placeholder="Жишээ: Сараа" />

        <label htmlFor="lt-msg">3. Захидал</label>
        <textarea
          id="lt-msg"
          value={message}
          maxLength={MAX_MSG}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Шинэ онд юу хүсэх вэ? 🎄"
        />
        <div className="lt-char">{message.length}/{MAX_MSG}</div>

        <p className="lt-lock-note">🔒 Захидал 1-р сарын 1-ний 00:00-д нээгдэнэ. Зөвхөн модны эзэн уншина.</p>
        {err && <p className="lt-err">{err}</p>}
        <div className="lt-btn-row">
          <button type="button" className="lt-btn lt-btn-ghost" onClick={onClose} disabled={busy}>Болих</button>
          <button type="submit" className="lt-btn" disabled={busy}>
            {busy ? "Өлгөж байна..." : "Модонд өлгөх 🎄"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ShareModal({ tree, onClose }) {
  const url = `${window.location.origin}/tree/${tree.id}`;
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 600, margin: 2, color: { dark: "#14532d", light: "#ffffff" } })
      .then(setQr)
      .catch(() => {});
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const i = document.getElementById("lt-share-url");
      i?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const share = () =>
    navigator.share?.({ title: tree.title, text: "Миний шинэ оны модонд захидал үлдээгээрэй 🎄", url }).catch(() => {});

  return (
    <div className="lt-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lt-modal">
        <h3>🔗 Модоо хуваалцах</h3>
        <p className="lt-sub">QR кодыг уншуулах эсвэл линкийг хуулж найзууддаа илгээгээрэй</p>
        <div className="lt-share-qr">
          {qr ? <img src={qr} alt="QR код" /> : <div style={{ height: 220 }} />}
          <div className="lt-link-box">
            <input id="lt-share-url" readOnly value={url} onFocus={(e) => e.target.select()} />
            <button className="lt-btn lt-btn-green" onClick={copy}>{copied ? "✓ Хуулсан" : "Хуулах"}</button>
          </div>
          <div className="lt-btn-row" style={{ width: "100%" }}>
            {qr && (
              <a className="lt-btn lt-btn-gold" href={qr} download={`zahidal-mod-${tree.id}.png`} style={{ textDecoration: "none" }}>
                QR татах
              </a>
            )}
            {typeof navigator !== "undefined" && navigator.share && (
              <button className="lt-btn lt-btn-green" onClick={share}>Илгээх</button>
            )}
          </div>
        </div>
        <button className="lt-btn lt-btn-ghost" style={{ marginTop: 12 }} onClick={onClose}>Хаах</button>
      </div>
    </div>
  );
}

function LetterModal({ letter, onClose }) {
  const d = DECOR_BY_ID[letter.decor];
  return (
    <div className="lt-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lt-modal">
        <div style={{ display: "flex", justifyContent: "center" }}>
          <DecorSprite id={letter.decor} size={64} blink />
        </div>
        <h3>💌 {letter.author}-ээс</h3>
        <p className="lt-sub" style={{ margin: 0 }}>{d?.name}</p>
        <div className="lt-letter">{letter.message}</div>
        <div className="lt-letter-from">— {letter.author}</div>
        <button className="lt-btn" style={{ marginTop: 14 }} onClick={onClose}>Уншлаа 🎄</button>
      </div>
    </div>
  );
}

export default function LetterTreePage() {
  const { treeId } = useParams();
  const isDemo = treeId === "demo";
  const [tree, setTree] = useState(() => (isDemo ? demoTree() : null));
  const [status, setStatus] = useState(isDemo ? "ok" : "loading");
  const [offset, setOffset] = useState(0); // server clock − local clock
  const [modal, setModal] = useState(null); // "write" | "share" | "letters" | {letter}
  const [newSlot, setNewSlot] = useState(null);
  const [burst, setBurst] = useState(0);
  const [toast, setToast] = useState("");
  const [payErr, setPayErr] = useState("");
  const [paying, setPaying] = useState(false);
  const toastTimer = useRef();

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }, []);

  const load = useCallback(async () => {
    if (isDemo) return;
    try {
      const t = await getLetterTree(treeId);
      if (!t) {
        setStatus("missing");
        return;
      }
      setOffset(new Date(t.serverNow).getTime() - Date.now());
      setTree(t);
      setStatus("ok");
    } catch {
      setStatus((s) => (s === "ok" ? s : "error"));
    }
  }, [treeId, isDemo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
    const t = setInterval(load, 20000); // see new ornaments from friends
    return () => clearInterval(t);
  }, [load]);

  const cd = useCountdown(tree?.unlockAt, offset);
  const unlocked = tree?.unlocked || (cd?.done ?? false);

  // once the countdown hits zero, reload so the owner gets the letters
  const unlockAt = tree?.unlockAt;
  const serverUnlocked = tree?.unlocked;
  useEffect(() => {
    if (!unlockAt || serverUnlocked || isDemo) return;
    const ms = new Date(unlockAt).getTime() - (Date.now() + offset) + 1500;
    if (ms > 2 ** 31 - 1) return; // too far away for setTimeout; polling covers it
    const t = setTimeout(load, Math.max(ms, 1500));
    return () => clearTimeout(t);
  }, [unlockAt, serverUnlocked, isDemo, offset, load]);

  const onLetterAdded = ({ slot, decor }) => {
    setModal(null);
    setNewSlot(slot);
    setBurst((b) => b + 1);
    if (isDemo) {
      setTree((t) => ({ ...t, ornaments: [...t.ornaments, { slot, decor }] }));
    } else {
      setTree((t) => ({ ...t, ornaments: [...t.ornaments.filter((o) => o.slot !== slot), { slot, decor }] }));
      load();
    }
    showToast("🎄 Таны захидал модонд өлгөгдлөө! 1-р сарын 1-нд нээгдэнэ");
    setTimeout(() => setBurst(0), 1600);
  };

  const onOrnament = (o) => {
    if (tree.isOwner && unlocked && o.message != null) setModal({ letter: o });
    else if (tree.isOwner && unlocked) load();
    else showToast(`🔒 ${DECOR_BY_ID[o.decor]?.name || "Захидал"} — 1-р сарын 1-нд нээгдэнэ`);
  };

  const pay = async () => {
    setPaying(true);
    setPayErr("");
    try {
      await payForTree(tree.id);
    } catch (e) {
      setPayErr(e.message);
      setPaying(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="lt-page xmas-theme">
        <ChristmasDecor showTree={false} />
        <div className="loader-wrap"><div className="loader-ring" /><span className="loader-text">Ачааллаж байна</span></div>
      </div>
    );
  }
  if (status !== "ok") {
    return (
      <div className="lt-page xmas-theme">
        <ChristmasDecor showTree={false} />
        <div className="lt-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 56 }}>🎄</div>
          <h1 className="lt-title">{status === "missing" ? "Мод олдсонгүй" : "Ачааллахад алдаа гарлаа"}</h1>
          <p className="lt-sub">Линкээ шалгаад дахин оролдоно уу.</p>
          <Link className="lt-btn lt-btn-green" to="/" style={{ textDecoration: "none" }}>Нүүр хуудас</Link>
        </div>
      </div>
    );
  }

  const count = tree.ornaments.length;
  const full = count >= tree.capacity;
  const left = tree.capacity - count;
  const canWrite = tree.paid && !full && !unlocked;
  const letters = tree.ornaments.filter((o) => o.message != null);

  return (
    <div className="lt-page xmas-theme">
      <ChristmasDecor showTree={false} />

      <div className="lt-topbar">
        <Link to={tree.isOwner ? "/trees" : "/"}>← {tree.isOwner ? "Миний модууд" : "mendchilgee"}</Link>
        <span className="lt-brand">🎄 Захидлын мод</span>
      </div>

      <div className="lt-card" style={{ textAlign: "center" }}>
        <h1 className="lt-title">{tree.title}</h1>
        <p className="lt-sub">
          {tree.isOwner
            ? "Найзуудаа урьж, модоо захидлаар чимэглээрэй ✨"
            : `${tree.ownerName || "Энэ хүн"}-д шинэ оны захидал үлдээгээрэй 💌`}
        </p>
        <span className="lt-counter">💌 {count} / {tree.capacity} захидал</span>
        <div className="lt-progress"><div style={{ width: `${(count / tree.capacity) * 100}%` }} /></div>

        <div className="lt-tree-stage" style={{ maxWidth: 260 + tree.capacity * 6 }}>
          <PixelTree
            capacity={tree.capacity}
            ornaments={tree.ornaments}
            newSlot={newSlot}
            onOrnamentClick={onOrnament}
          />
        </div>

        {full && <p className="lt-sub" style={{ fontWeight: 800, color: "#1f7a3a" }}>🎉 Мод бүрэн чимэглэгдлээ! Баярлалаа 🎄</p>}

        {unlocked ? (
          <p className="lt-sub" style={{ fontWeight: 800 }}>🎆 Шинэ оны мэнд! Захидлууд нээгдлээ</p>
        ) : (
          cd && (
            <>
              <div className="lt-countdown" aria-label="Захидал нээгдэх хүртэл">
                <div><b>{cd.d}</b><span>өдөр</span></div>
                <div><b>{String(cd.h).padStart(2, "0")}</b><span>цаг</span></div>
                <div><b>{String(cd.m).padStart(2, "0")}</b><span>минут</span></div>
                <div><b>{String(cd.s).padStart(2, "0")}</b><span>секунд</span></div>
              </div>
              <p className="lt-lock-note">🔒 Захидлууд 1-р сарын 1-ний 00:00-д нээгдэнэ</p>
            </>
          )
        )}
      </div>

      <div className="lt-card">
        {tree.isOwner && !tree.paid && (
          <>
            <p className="lt-sub" style={{ fontWeight: 700 }}>
              Мод идэвхжүүлэхийн тулд төлбөрөө төлнө үү: <b>{formatMnt(priceFor(tree.capacity))}</b> ({tree.capacity} захидал)
            </p>
            <button className="lt-btn" onClick={pay} disabled={paying}>
              {paying ? "Түр хүлээнэ үү..." : `💳 ${formatMnt(priceFor(tree.capacity))} төлөх`}
            </button>
            {payErr && <p className="lt-err">{payErr}</p>}
          </>
        )}

        {tree.isOwner && tree.paid && !unlocked && (
          <button className="lt-btn lt-btn-green" onClick={() => setModal("share")}>🔗 QR / линк хуваалцах</button>
        )}

        {tree.isOwner && unlocked && (
          <button className="lt-btn lt-btn-gold" onClick={() => (letters.length ? setModal("letters") : load())}>
            📬 Захидлуудаа унших ({count})
          </button>
        )}

        {!unlocked && tree.paid && (
          <button
            className={`lt-btn ${tree.isOwner ? "lt-btn-ghost" : ""}`}
            style={tree.isOwner ? { marginTop: 10 } : undefined}
            onClick={() => setModal("write")}
            disabled={!canWrite}
          >
            {full ? "Мод дүүрсэн 🎄" : `✍️ Захидал бичих${left <= 3 ? ` (${left} зай үлдлээ)` : ""}`}
          </button>
        )}

        {!tree.isOwner && !tree.paid && <p className="lt-sub">Энэ мод хараахан идэвхжээгүй байна.</p>}
        {!tree.isOwner && (
          <Link to="/trees" className="lt-btn lt-btn-gold" style={{ textDecoration: "none", marginTop: 10 }}>
            🎄 Өөрийн мод үүсгэх
          </Link>
        )}
        {isDemo && <p className="lt-lock-note">Энэ бол жишээ мод — юу ч хадгалагдахгүй.</p>}
      </div>

      {modal === "write" && <WriteModal tree={tree} onClose={() => setModal(null)} onDone={onLetterAdded} />}
      {modal === "share" && <ShareModal tree={tree} onClose={() => setModal(null)} />}
      {modal === "letters" && (
        <div className="lt-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="lt-modal">
            <h3>📬 Таны захидлууд</h3>
            <div className="lt-letter-list">
              {letters.map((o) => (
                <button key={o.slot} className="lt-letter-row" onClick={() => setModal({ letter: o })}>
                  <DecorSprite id={o.decor} size={36} />
                  <span>
                    <b>{o.author}</b>
                    <small>{o.message.slice(0, 48)}{o.message.length > 48 ? "…" : ""}</small>
                  </span>
                </button>
              ))}
            </div>
            <button className="lt-btn lt-btn-ghost" style={{ marginTop: 12 }} onClick={() => setModal(null)}>Хаах</button>
          </div>
        </div>
      )}
      {modal?.letter && <LetterModal letter={modal.letter} onClose={() => setModal(letters.length > 1 ? "letters" : null)} />}

      {burst > 0 && <Burst seed={burst} />}
      {toast && <div className="lt-toast" role="status">{toast}</div>}
    </div>
  );
}
