// ═══════════════════════════════════════════════════════════════
// PixelTree — the letter tree. Every ornament is a letter; each one
// blinks on and off on its own rhythm like real tree lights.
// ═══════════════════════════════════════════════════════════════

import { useId, useMemo } from "react";
import { buildTree } from "./treeLayout";
import { DECORS, DECOR_BY_ID, artToRects, artSize } from "./decors";
import "./LetterTree.css";

const SPRITE_SCALE = 0.74;

const TOP_STAR = [
  "....K....",
  "...KYK...",
  "...KYK...",
  "KKKKHKKKK",
  "KYYHHHYYK",
  ".KYYHYYK.",
  "..KYYYK..",
  ".KYYKYYK.",
  ".KYK.KYK.",
  "KKK...KKK",
];

const STAR_RECTS = artToRects(TOP_STAR, { H: "#fffbe0" });

/** One decor drawn in its own little SVG (used by the picker). */
export function DecorSprite({ id, size = 40, blink = false, style }) {
  const d = DECOR_BY_ID[id];
  if (!d) return null;
  const { w, h } = artSize(d.art);
  const rects = artToRects(d.art, d.colors);
  return (
    <svg
      className={`lt-sprite ${blink ? "lt-sprite-blink" : ""}`}
      viewBox={`-1 -1 ${w + 2} ${h + 2}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      style={{ "--glow": d.glow, ...style }}
      aria-label={d.name}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w + 0.02} height={1.02} fill={r.fill} />
      ))}
    </svg>
  );
}

function Ornament({ o, pos, uid, isNew, onClick, index }) {
  const d = DECOR_BY_ID[o.decor] || DECORS[0];
  const { w, h } = artSize(d.art);
  const rects = useMemo(() => artToRects(d.art, d.colors), [d]);
  // each ornament gets its own blink speed / phase, stable per slot
  const dur = 1.1 + ((o.slot * 37) % 17) / 10; // 1.1s – 2.7s
  const delay = -(((o.slot * 53) % 23) / 10);
  const s = SPRITE_SCALE;
  return (
    <g
      className={`lt-orn ${isNew ? "lt-orn-new" : ""} ${onClick ? "lt-orn-click" : ""}`}
      transform={`translate(${pos.x} ${pos.y})`}
      style={{ "--dur": `${dur}s`, "--delay": `${delay}s`, "--i": index }}
      onClick={onClick ? () => onClick(o) : undefined}
      role={onClick ? "button" : undefined}
      aria-label={d.name}
    >
      <g className="lt-orn-inner">
        <circle className="lt-halo" r={4.6} fill={`url(#${uid}-halo-${d.id})`} />
        <g className="lt-orn-art" transform={`scale(${s}) translate(${-w / 2} ${-h / 2})`}>
          {rects.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w + 0.03} height={1.03} fill={r.fill} />
          ))}
        </g>
        {/* bigger invisible tap target */}
        <circle r={4} fill="transparent" />
      </g>
    </g>
  );
}

export default function PixelTree({
  capacity,
  ornaments = [],
  newSlot = null,
  onOrnamentClick,
  showEmpty = true,
  still = false,
  className = "",
}) {
  const tree = buildTree(capacity);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const full = ornaments.length >= capacity;
  const usedDecors = useMemo(() => [...new Set(ornaments.map((o) => o.decor))], [ornaments]);
  const taken = new Set(ornaments.map((o) => o.slot));

  return (
    <div className={`lt-tree ${full ? "lt-full" : ""} ${still ? "lt-still" : ""} ${className}`}>
      <svg
        className="lt-svg"
        viewBox={`-2 -2 ${tree.W + 4} ${tree.H + 4}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`Захидлын мод: ${ornaments.length}/${capacity}`}
      >
        <defs>
          {usedDecors.map((id) => (
            <radialGradient key={id} id={`${uid}-halo-${id}`}>
              <stop offset="0%" stopColor={DECOR_BY_ID[id]?.glow || "#fff"} stopOpacity="0.95" />
              <stop offset="100%" stopColor={DECOR_BY_ID[id]?.glow || "#fff"} stopOpacity="0" />
            </radialGradient>
          ))}
          <radialGradient id={`${uid}-star`}>
            <stop offset="0%" stopColor="#fff6b0" stopOpacity="1" />
            <stop offset="100%" stopColor="#ffd23f" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* trunk + pot */}
        <rect x={tree.trunk.x} y={tree.trunk.y} width={tree.trunk.w} height={tree.trunk.h} fill="#6b3a1e" />
        <rect x={tree.trunk.x + 1} y={tree.trunk.y} width={1} height={tree.trunk.h} fill="#8d5330" />
        <g className="lt-pot">
          <rect x={tree.pot.x - 1} y={tree.pot.y} width={tree.pot.w + 2} height={2} fill="#1d1208" />
          <rect x={tree.pot.x} y={tree.pot.y} width={tree.pot.w} height={1} fill="#e8c547" />
          <rect x={tree.pot.x + 1} y={tree.pot.y + 2} width={tree.pot.w - 2} height={tree.pot.h - 2} fill="#b3122e" />
          <rect x={tree.pot.x} y={tree.pot.y + 2} width={1} height={tree.pot.h - 2} fill="#1d1208" />
          <rect x={tree.pot.x + tree.pot.w - 1} y={tree.pot.y + 2} width={1} height={tree.pot.h - 2} fill="#1d1208" />
          <rect x={tree.pot.x + 1} y={tree.pot.y + tree.pot.h - 1} width={tree.pot.w - 2} height={1} fill="#1d1208" />
          <rect x={tree.pot.x + 1} y={tree.pot.y + 3} width={tree.pot.w - 2} height={1} fill="#e8c547" />
          <rect x={tree.pot.x + 2} y={tree.pot.y + 2} width={1} height={tree.pot.h - 3} fill="#e0485e" />
        </g>

        {/* foliage */}
        <g className="lt-foliage">
          {tree.pixels.map((p, i) => (
            <rect key={i} x={p.x} y={p.y} width={p.w + 0.02} height={1.02} fill={p.fill} />
          ))}
        </g>

        {/* tinsel + garland lights */}
        <g className="lt-tinsel">
          {tree.tinsel.map((t, i) => (
            <rect key={i} x={t.x} y={t.y} width={1.02} height={1.02} fill={i % 3 ? "#7fe3ff" : "#c9f5ff"} />
          ))}
        </g>
        <g className="lt-bulbs">
          {tree.bulbs.map((b, i) => (
            <rect
              key={i}
              className={`lt-bulb lt-bulb-g${b.group}`}
              x={b.x}
              y={b.y}
              width={1.02}
              height={1.02}
              fill={b.color}
              style={{ "--c": b.color }}
            />
          ))}
        </g>

        {/* empty spots: faint twinkles waiting for a letter */}
        {showEmpty &&
          tree.slots.map((pos, slot) =>
            taken.has(slot) ? null : (
              <g key={`e${slot}`} className="lt-empty" transform={`translate(${pos.x} ${pos.y})`} style={{ "--d": `${-(slot % 7) * 0.4}s` }}>
                <rect x={-0.5} y={-1.5} width={1} height={3} fill="#fff6c8" />
                <rect x={-1.5} y={-0.5} width={3} height={1} fill="#fff6c8" />
              </g>
            ),
          )}

        {/* letters as ornaments */}
        {ornaments.map((o, i) => {
          const pos = tree.slots[o.slot];
          if (!pos) return null;
          return (
            <Ornament
              key={o.slot}
              o={o}
              pos={pos}
              uid={uid}
              index={i}
              isNew={o.slot === newSlot}
              onClick={onOrnamentClick}
            />
          );
        })}

        {/* star on top — shines brighter the fuller the tree */}
        <g className="lt-star" transform={`translate(${tree.star.x} ${tree.star.y})`}>
          <circle className="lt-star-glow" r={7} fill={`url(#${uid}-star)`} />
          <g className="lt-star-rays">
            {[0, 45, 90, 135].map((a) => (
              <rect key={a} x={-0.5} y={-11} width={1} height={22} fill="#fff3b0" transform={`rotate(${a})`} />
            ))}
          </g>
          <g transform="translate(-4.5 -6)">
            {STAR_RECTS.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w + 0.02} height={1.02} fill={r.fill} />
            ))}
          </g>
        </g>
      </svg>
      {full && !still && (
        <div className="lt-full-sparkles" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ "--i": i, left: `${6 + ((i * 41) % 88)}%`, top: `${4 + ((i * 29) % 80)}%` }}>✦</span>
          ))}
        </div>
      )}
    </div>
  );
}
