import { useNavigate } from "react-router-dom";
import PixelTree from "./PixelTree";
import "./LetterTree.css";

const PREVIEW = [
  { slot: 0, decor: "ball-red" }, { slot: 1, decor: "star" }, { slot: 2, decor: "ball-blue" },
  { slot: 3, decor: "candy" }, { slot: 4, decor: "bell" }, { slot: 5, decor: "heart" },
  { slot: 6, decor: "ball-gold" }, { slot: 7, decor: "snowflake" },
];

/** Home-page entry point for letter trees. */
export default function TreePromoCard() {
  const navigate = useNavigate();
  return (
    <button className="lt-promo" onClick={() => navigate("/trees")}>
      <span className="lt-mini">
        <PixelTree capacity={10} ornaments={PREVIEW} showEmpty={false} still />
      </span>
      <span>
        <b>Шинэ оны захидлын мод 🎄</b>
        <small>QR / линкээр найзуудаасаа захидал цуглуул — 1-р сарын 1-нд нээгдэнэ</small>
      </span>
      <span className="lt-promo-go">→</span>
    </button>
  );
}
