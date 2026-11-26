import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTemplatesByCategory, CATEGORIES } from "../templateConfigs";
import { MdAutoAwesome, MdCheck, MdArrowForward } from "react-icons/md";
import PixelTree from "./LetterTree/PixelTree";

// Letter tree shown as an extra "template" in the New Year category
const TREE_PREVIEW = [
  { slot: 0, decor: "ball-red" }, { slot: 1, decor: "star" }, { slot: 2, decor: "ball-blue" },
  { slot: 3, decor: "candy" }, { slot: 4, decor: "bell" }, { slot: 5, decor: "heart" },
  { slot: 6, decor: "ball-gold" }, { slot: 7, decor: "snowflake" }, { slot: 8, decor: "gift" },
  { slot: 9, decor: "sock" },
];

const CATEGORY_NAMES = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, `${c.emoji} ${c.name}`])
);

export default function TemplateSelector({ onSelect, category }) {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();

  const templates = category ? getTemplatesByCategory(category) : [];

  const handleSelect = (template) => {
    setSelected(template.id);
    setTimeout(() => onSelect(template), 600);
  };

  return (
    <div className="page page-enter">
      <div className="selector-container">
        {/* Header */}
        <div className="selector-header">
          <div className="selector-icon"><MdAutoAwesome /></div>
          <h1 className="font-script selector-title">
            {CATEGORY_NAMES[category] || "Мэндчилгээ"}
          </h1>
          <p className="selector-subtitle">Загвараа сонгоорой <MdAutoAwesome /></p>
        </div>

        {/* Template Cards */}
        <div className="template-grid">
          {category === "newyear" && (
            <div
              className={`template-card template-card-tree${hovered === "letter-tree" ? " hovered" : ""}${selected === "letter-tree" ? " selected" : ""}`}
              style={{
                "--card-primary": "#c5b358",
                "--card-secondary": "#b3122e",
                "--card-accent": "#e6d690",
                "--card-bg": "#14532d",
              }}
              onMouseEnter={() => setHovered("letter-tree")}
              onMouseLeave={() => setHovered(null)}
              onClick={() => {
                setSelected("letter-tree");
                setTimeout(() => navigate("/trees"), 400);
              }}
            >
              <div className="template-preview">
                <div className="template-preview-bg" />
                <div className="template-preview-tree">
                  <PixelTree capacity={10} ornaments={TREE_PREVIEW} showEmpty={false} />
                </div>
                <div className="template-sparkle s1">✦</div>
                <div className="template-sparkle s2">✧</div>
                <div className="template-sparkle s3">✦</div>
              </div>
              <div className="template-info">
                <h3 className="template-name">Захидлын мод 🎄💌</h3>
                <p className="template-desc">
                  QR / линкээ найзууддаа илгээ — захидал бүр модонд гэрэлтэх чимэглэл болно. 1-р сарын 1-нд нээгдэнэ!
                </p>
                <div className="template-tags">
                  <span className="template-tag">👥 Олон хүнээс</span>
                  <span className="template-tag">📱 QR код</span>
                  <span className="template-tag">🔒 1/1-нд нээгдэнэ</span>
                </div>
              </div>
              <div className="template-select-btn">
                {selected === "letter-tree" ? <>Сонгогдсон <MdCheck /></> : <>Мод үүсгэх <MdArrowForward /></>}
              </div>
            </div>
          )}
          {templates.map((tmpl, idx) => (
            <div
              key={tmpl.id}
              className={`template-card${hovered === tmpl.id ? " hovered" : ""}${selected === tmpl.id ? " selected" : ""}`}
              style={{
                animationDelay: `${idx * 0.15}s`,
                "--card-primary": tmpl.theme.colors["--t-primary"],
                "--card-secondary": tmpl.theme.colors["--t-secondary"],
                "--card-accent": tmpl.theme.colors["--t-accent"],
                "--card-bg": tmpl.theme.colors["--t-bg2"],
              }}
              onMouseEnter={() => setHovered(tmpl.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => handleSelect(tmpl)}
            >
              {/* Preview area */}
              <div className="template-preview">
                <div className="template-preview-bg" />
                <div className="template-preview-emoji">
                  {tmpl.card.preview}
                </div>
                {/* Decorative elements */}
                <div className="template-sparkle s1">✦</div>
                <div className="template-sparkle s2">✧</div>
                <div className="template-sparkle s3">✦</div>
              </div>

              {/* Info */}
              <div className="template-info">
                <h3 className="template-name">{tmpl.card.name}</h3>
                <p className="template-desc">{tmpl.card.desc}</p>

                {/* Feature tags */}
                <div className="template-tags">
                  {tmpl.card.tags.map((tag, ti) => (
                    <span key={ti} className="template-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Select indicator */}
              <div className="template-select-btn">
                {selected === tmpl.id ? <>Сонгогдсон <MdCheck /></> : <>Сонгох <MdArrowForward /></>}
              </div>
            </div>
          ))}
        </div>

        <p className="selector-footer">
          Загвараа сонгосны дараа асуулт, зураг нэмэх боломжтой <MdAutoAwesome />
        </p>
      </div>
    </div>
  );
}
