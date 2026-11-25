// ═══════════════════════════════════════════════════════════════
// PixelOpener — pixel-art "openers" shown instead of the envelope:
//   gift  (New Year / General):   shakes, lid flies off
//   cake  (Birthday):             shakes, candles flare
//   heart (Valentine's):          beats, then pops
// The parent LoveLetter drives `phase` (envelope → glow → sealBreak →
// flap → rise → letterIn) and bursts the holiday emojis.
// ═══════════════════════════════════════════════════════════════

import "./PixelOpener.css";

const PALETTE = {
  K: "#2b1a10", // outline
  Y: "#ffd23f", // gift yellow
  y: "#f0a81c", // gift shade
  R: "#e2231a", // ribbon red
  r: "#a3121a", // ribbon dark
  W: "#ffffff",
  F: "#ffe14d", // flame
  f: "#ff8a00", // flame edge
  C: "#f4f1ea", // candle
  P: "#ffb3d1", // cake pink
  p: "#ff8fbd", // cake pink dark
  L: "#dcbcf5", // lavender icing
  l: "#bf93e6", // icing drip
  S: "#ff6f91", // strawberry
  G: "#4caf50", // leaf
  D: "#fff4e6", // plate / doily
};

// Each art piece is rows of equal-length strings; "." = empty.
const GIFT_LID = [
  "...KKK........KKK...",
  "..KRRRK......KRRRK..",
  "..KRWRRK....KRRRRK..",
  "...KRRRRK..KRRRRK...",
  "....KKKKRRRRKKKK....",
  ".KKKKKKKKRRKKKKKKKK.",
  ".KYWYYYYYRRYYYYYYYK.",
  ".KYYYYYYYRRYYYYYYYK.",
  ".KKKKKKKKRRKKKKKKKK.",
];
const GIFT_BOX = [
  "..KyyyyyyRRyyyyyyK..",
  "..KYYYYYYRRYYYYYYK..",
  "..KYWYYYYRRYYYYYYK..",
  "..KYYYYYYRrYYYYYYK..",
  "..KYYYYYYRRYYYYYYK..",
  "..KYYYYYYRRYYYYYYK..",
  "..KYYYYYYrRYYYYYYK..",
  "..KYYYYYYRRYYYYYYK..",
  "..KyyyyyyRRyyyyyyK..",
  "..KKKKKKKKKKKKKKKK..",
];

const CAKE_FLAMES = [
  "....F.....F.....F....",
  "...fFf...fFf...fFf...",
];
const CAKE_BODY = [
  "....C.....C.....C....",
  "....P.....P.....P....",
  "....C.....C.....C....",
  "..KKKKKKKKKKKKKKKKK..",
  ".KLGSLLLLGSLLLLGSLLK.",
  ".KLSSLLLLSSLLLLSSLLK.",
  ".KLLLLLLLLLLLLLLLLLK.",
  ".KlLLlLLLlLLLlLLLlLK.",
  ".KPlPPPlPPPlPPPlPPPK.",
  ".KPPPPPPPPPPPPPPPPPK.",
  ".KPPWPPPPPPPPPPWPPPK.",
  ".KWWWWWWWWWWWWWWWWWK.",
  ".KpppppppppppppppppK.",
  ".KpppppppppppppppppK.",
  "KKKKKKKKKKKKKKKKKKKKK",
  "KDDDDDDDDDDDDDDDDDDDK",
  ".KKKKKKKKKKKKKKKKKKK.",
];

const HEART = [
  "..KKK...KKK..",
  ".KRRRK.KRRRK.",
  "KRWRRRKRRRRRK",
  "KRWRRRRRRRRRK",
  "KRRRRRRRRRRRK",
  ".KRRRRRRRRRK.",
  "..KRRRRRRRK..",
  "...KRRRRRK...",
  "....KRRRK....",
  ".....KRK.....",
  "......K......",
];

/** Rows → <rect>s, offset by `dy` rows. */
function Pixels({ rows, dy = 0, className }) {
  const rects = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== "." && PALETTE[ch]) {
        rects.push(<rect key={`${x}-${y}`} x={x} y={y + dy} width="1.02" height="1.02" fill={PALETTE[ch]} />);
      }
    });
  });
  return <g className={className}>{rects}</g>;
}

const ART = {
  gift: {
    w: 20,
    h: GIFT_LID.length + GIFT_BOX.length,
    render: () => (
      <>
        <Pixels rows={GIFT_BOX} dy={GIFT_LID.length} className="px-body" />
        <Pixels rows={GIFT_LID} className="px-lid" />
      </>
    ),
  },
  cake: {
    w: 21,
    h: CAKE_FLAMES.length + CAKE_BODY.length,
    render: () => (
      <>
        <Pixels rows={CAKE_BODY} dy={CAKE_FLAMES.length} className="px-body" />
        <Pixels rows={CAKE_FLAMES} className="px-flames" />
      </>
    ),
  },
  heart: {
    w: 13,
    h: HEART.length,
    render: () => <Pixels rows={HEART} className="px-body" />,
  },
};

export default function PixelOpener({ kind, phase }) {
  const art = ART[kind];
  if (!art) return null;
  return (
    <div className={`px-opener px-${kind} px-phase-${phase}`}>
      <div className="px-glow" />
      <svg
        className="px-svg"
        viewBox={`-1 -1 ${art.w + 2} ${art.h + 2}`}
        shapeRendering="crispEdges"
        aria-label={kind}
      >
        {art.render()}
      </svg>
      <div className="px-shadow" />
    </div>
  );
}
