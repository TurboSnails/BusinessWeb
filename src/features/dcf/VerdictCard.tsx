import type { Assessment } from "./assessment.ts";
import { CREDIBILITY_LABEL } from "./assessment.ts";
import { formatPct, formatPrice } from "./units.ts";
import type { Currency } from "./types.ts";
import type { PrefillItem } from "./autofill.ts";
import type { PeerStats } from "./peers.ts";

export interface MarketContext { label: string; state: string; trend: string; zone: string; weekEnding: string }

/** 三情景区间图：灰带是悲观到乐观，竖线是基准，虚线是买入参考价，三角是现价。用百分比坐标保持自适应且不写内联样式。 */
function RangeChart({ a, price, currency }: { a: Assessment; price: number | null; currency: Currency }): JSX.Element | null {
  const [bear, base, bull] = a.scenarios.map((s) => s.price);
  if (base == null) return null;
  const points = [bear, base, bull, price, a.buyBelow].filter((v): v is number => v != null && v > 0);
  const lo = Math.min(...points) * 0.9, hi = Math.max(...points) * 1.08;
  const x = (v: number) => `${(((v - lo) / (hi - lo)) * 100).toFixed(2)}%`;
  const label = (v: number, text: string, y: number, anchor: "start" | "middle" | "end" = "middle") => (
    <text x={x(v)} y={y} textAnchor={anchor} className="dcf-range__text">{text}</text>
  );
  return (
    <svg className="dcf-range" width="100%" height="86" role="img"
      aria-label={`悲观 ${formatPrice(bear, currency)}，基准 ${formatPrice(base, currency)}，乐观 ${formatPrice(bull, currency)}，现价 ${formatPrice(price, currency)}`}>
      <line x1="0" x2="100%" y1="44" y2="44" className="dcf-range__axis" />
      {bear != null && bull != null && <rect x={x(bear)} y="34" width={`${(((bull - bear) / (hi - lo)) * 100).toFixed(2)}%`} height="20" rx="4" className="dcf-range__band" />}
      {a.buyBelow != null && a.buyBelow > 0 && <>
        <line x1={x(a.buyBelow)} x2={x(a.buyBelow)} y1="28" y2="60" className="dcf-range__buy" />
        {label(a.buyBelow, `买入参考 ${formatPrice(a.buyBelow, currency)}`, 76)}
      </>}
      <line x1={x(base)} x2={x(base)} y1="30" y2="58" className="dcf-range__base" />
      {label(base, `基准 ${formatPrice(base, currency)}`, 20)}
      {price != null && price > 0 && <>
        <line x1={x(price)} x2={x(price)} y1="38" y2="64" className="dcf-range__price" />
        <circle cx={x(price)} cy="44" r="5" className="dcf-range__price-dot" />
      </>}
    </svg>
  );
}

/** 近5年自由现金流收益率区间：横条为最低～最高，竖线为中位，圆点为当前 */
function HistoryBar({ h }: { h: NonNullable<PrefillItem["fyh"]> }): JSX.Element {
  const lo = Math.min(h.lo, h.now), hi = Math.max(h.hi, h.now), span = hi - lo || 1;
  const x = (v: number) => `${(4 + ((v - lo) / span) * 92).toFixed(2)}%`;
  return (
    <svg className="dcf-hist" width="100%" height="34" role="img" aria-label={`近5年自由现金流收益率 ${h.lo}%～${h.hi}%，中位 ${h.med}%，当前 ${h.now}%`}>
      <rect x={x(h.lo)} y="10" width={`${(((h.hi - h.lo) / span) * 92).toFixed(2)}%`} height="10" rx="5" className="dcf-hist__band" />
      <line x1={x(h.med)} x2={x(h.med)} y1="6" y2="24" className="dcf-hist__med" />
      <circle cx={x(h.now)} cy="15" r="6" className="dcf-hist__now" />
      <text x={x(h.lo)} y="33" textAnchor="start" className="dcf-range__text">{h.lo}%（贵）</text>
      <text x={x(h.hi)} y="33" textAnchor="end" className="dcf-range__text">{h.hi}%（便宜）</text>
    </svg>
  );
}

const fmt1 = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);

export interface CandidateAction { inPool: boolean; onAdd(): void; onRemove(): void }

export function VerdictCard({ a, currency, price, impliedGrowth, growth, market, history, peers, onPeer, candidate }: {
  a: Assessment; currency: Currency; price: number | null; impliedGrowth: number | null; growth: number | null; market: MarketContext | null;
  history?: PrefillItem["fyh"] | null; peers?: PeerStats | null; onPeer?(code: string): void; candidate?: CandidateAction | null;
}): JSX.Element {
  const shown = peers ? [...peers.rows.slice(0, 5), ...(peers.rank > 5 ? [peers.self] : [])] : [];
  return (
    <div className={`dcf-verdict-card is-${a.tone}`}>
      <p className="dcf-verdict-card__lead">{a.verdict}</p>
      <RangeChart a={a} price={price} currency={currency} />
      <p className="dcf-range__legend" aria-hidden="true">
        <span><i className="is-band" />悲观～乐观</span><span><i className="is-base" />基准合理价</span><span><i className="is-buy" />买入参考价</span><span><i className="is-price" />现价 {formatPrice(price, currency)}</span>
      </p>
      <div className="dcf-scenarios">
        {a.scenarios.map((s) => (
          <div key={s.key} className={`dcf-scenario is-${s.key}`}>
            <small>{s.label}</small>
            <strong>{formatPrice(s.price, currency)}</strong>
            <small>增速 {formatPct(s.growth, 1)} · 折现 {formatPct(s.discountRate, 1)}</small>
          </div>
        ))}
        <div className="dcf-scenario is-buy">
          <small>买入参考价</small>
          <strong>{formatPrice(a.buyBelow, currency)}</strong>
          <small>基准价留 {a.requiredMargin * 100}% 安全边际</small>
        </div>
      </div>
      <div className="dcf-verdict-card__facts">
        <p>
          <span className={`dcf-cred is-${a.credibility}`}>可信度 {CREDIBILITY_LABEL[a.credibility]}</span>
          {a.credibilityReasons.join("；")}。可信度越低，要求的安全边际越高（高 20% / 中 30% / 低 40%）。
        </p>
        {impliedGrowth != null && growth != null && (
          <p>
            市场预期：要支撑现价，未来五年自由现金流需年增约 <strong>{formatPct(impliedGrowth, 1)}</strong>（当前假设 {formatPct(growth, 1)}）。
            {impliedGrowth > growth + 3 ? "市场比历史更乐观。" : impliedGrowth < growth - 3 ? "市场比历史更悲观，若增长延续则有空间。" : "与历史增速接近。"}
          </p>
        )}
        {market && (
          <p>
            市场环境：{market.label}处于「{market.state}」（趋势 {market.trend}、估值{market.zone}，周报 {market.weekEnding}）。
            {market.trend === "防守" ? "整体趋势偏弱，即使个股便宜也宜分批、留足现金。" : "整体趋势未破，可按计划分批。"}
          </p>
        )}
      </div>
      {history && (
        <div className="dcf-verdict-card__block">
          <h3>和自己的过去比</h3>
          <p>
            当前自由现金流收益率 <strong>{history.now}%</strong>，高于近 5 年 <strong>{history.pct}%</strong> 的时间
            （中位 {history.med}%）。{history.pct >= 70 ? "比自己过去大多数时候便宜。" : history.pct <= 30 ? "比自己过去大多数时候贵。" : "处于自己过去的中间水平。"}
            收益率 = 每年自由现金流 ÷ 市值，越高越便宜。
          </p>
          <HistoryBar h={history} />
        </div>
      )}
      {peers && (
        <div className="dcf-verdict-card__block">
          <h3>和同行比：{peers.industry}（共 {peers.count} 家）</h3>
          <p>
            自由现金流收益率排第 <strong>{peers.rank}</strong> 位（本公司 {fmt1(peers.self.fcfYield)}，同行中位 {fmt1(peers.medianYield)}）；
            营收增速本公司 {fmt1(peers.self.growth)}，同行中位 {fmt1(peers.medianGrowth)}。
            {peers.self.fcfYield > peers.medianYield && (peers.self.growth ?? 0) >= (peers.medianGrowth ?? 0) ? "比同行更便宜且增长不慢，值得细看。"
              : peers.self.fcfYield < peers.medianYield && (peers.self.growth ?? 0) <= (peers.medianGrowth ?? 0) ? "比同行贵且增长不快，需要更强的理由。"
              : "便宜与增长需要权衡：收益率高的往往增长慢。"}
          </p>
          <table className="dcf-peers">
            <thead><tr><th scope="col">公司</th><th scope="col">FCF 收益率</th><th scope="col">营收增速</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.code} className={r.self ? "is-self" : undefined}>
                  <td>{r.self || !onPeer ? r.name : <button type="button" className="dcf-link" onClick={() => onPeer(r.code)}>{r.name}</button>}</td>
                  <td>{fmt1(r.fcfYield)}</td>
                  <td>{fmt1(r.growth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {candidate && (
        <div className="dcf-actions dcf-gap">
          {candidate.inPool ? (
            <>
              <button type="button" className="dcf-button dcf-button--ghost" onClick={candidate.onAdd}>更新候选池备注</button>
              <button type="button" className="dcf-button dcf-button--ghost" onClick={candidate.onRemove}>移出候选池</button>
              <span className="dcf-muted">已在候选池，备注会写入本次合理价与买入参考价</span>
            </>
          ) : (
            <button type="button" className="dcf-button" onClick={candidate.onAdd}>加入候选池（记下买入参考价）</button>
          )}
        </div>
      )}
    </div>
  );
}
