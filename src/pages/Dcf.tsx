import { Page } from '../components/ui'
import { useEffect, useState } from "react";
import { PageTitle } from "../components/ui/PageTabs";
import {
  Building2,
  Calculator,
  Search,
  Percent,
  Save,
  TrendingUp,
} from "lucide-react";
import {
  CURRENCY_LABELS,
  MARKET_LABELS,
  MONEY_UNIT_LABELS,
  SHARE_UNIT_LABELS,
  calculateMultiples,
  calculateSensitivity,
  calculateSheetDcf,
  calculateWacc,
  deleteDcfRecord,
  formatMoney,
  formatPct,
  formatPrice,
  formatScaleHint,
  formatShares,
  formatSignedPct,
  makeDcfKey,
  makeDcfRecord,
  loadDcfRecords,
  parseDcfPrefill,
  parseNumber,
  saveDcfRecord,
  toBaseAmount,
  toBaseShares,
  deriveAutoFill,
  impliedGrowth,
  searchPrefill,
  CREDIBILITY_LABEL,
  assess,
  peerStats,
} from "../features/dcf";
import { useCandidates } from "../features/candidates/useCandidates";
import type { CandidateMarket } from "../features/candidates/validation";
import { VerdictCard, type MarketContext } from "../features/dcf/VerdictCard";
import type {
  AutoField,
  AutoFill,
  Currency,
  DcfRecord,
  PrefillItem,
  PrefillLibrary,
  DcfSheetInput,
  Market,
  MoneyUnit,
  MultipleBand,
  ShareUnit,
} from "../features/dcf";
import "../features/dcf/dcf.css";

const NUMERIC_FIELDS = [
  "baseFcf",
  "fadeYears",
  "minority",
  "growth",
  "perpetualGrowth",
  "discountRate",
  "cash",
  "debt",
  "shares",
  "currentPrice",
  "ebitda",
  "marketCap",
  "beta",
  "interestExpense",
  "pretaxIncome",
  "taxPaid",
  "riskFreeRate",
  "marketReturn",
] as const;
type NumericField = (typeof NUMERIC_FIELDS)[number];

interface DcfForm {
  company: string;
  code: string;
  market: Market;
  currency: Currency;
  moneyUnit: MoneyUnit;
  shareUnit: ShareUnit;
  baseYear: string;
  values: Record<NumericField, string>;
}

function emptyForm(): DcfForm {
  const values = {} as Record<NumericField, string>;
  for (const key of NUMERIC_FIELDS) values[key] = "";
  return {
    company: "",
    code: "",
    market: "cn",
    currency: "CNY",
    moneyUnit: "yi",
    shareUnit: "yi",
    baseYear: String(new Date().getFullYear()),
    // 成长率、永续增长率、折现率给一组常用起点，其余留空
    values: { ...values, growth: "5", perpetualGrowth: "2", discountRate: "10" },
  };
}

function toInput(form: DcfForm): DcfSheetInput {
  const numbers = {} as Record<NumericField, number | null>;
  for (const key of NUMERIC_FIELDS) numbers[key] = parseNumber(form.values[key]);
  return {
    company: form.company,
    code: form.code,
    market: form.market,
    currency: form.currency,
    moneyUnit: form.moneyUnit,
    shareUnit: form.shareUnit,
    baseYear: Number(form.baseYear) || new Date().getFullYear(),
    ...numbers,
  };
}

function fromInput(input: DcfSheetInput): DcfForm {
  const values = {} as Record<NumericField, string>;
  for (const key of NUMERIC_FIELDS) {
    const v = input[key];
    values[key] = v == null ? "" : String(v);
  }
  return {
    company: input.company,
    code: input.code,
    market: input.market,
    currency: input.currency,
    moneyUnit: input.moneyUnit,
    shareUnit: input.shareUnit,
    baseYear: String(input.baseYear),
    values,
  };
}

interface AutoHint {
  source?: string;
  autoValue?: string;
  onReset?(): void;
}

function Field({
  label,
  hint,
  value,
  onChange,
  auto,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange(next: string): void;
  auto?: AutoHint;
}): JSX.Element {
  const modified = auto?.autoValue != null && value.trim() !== auto.autoValue;
  // 提示文字放在 label 外面：否则会和字段名连在一起变成可访问名称的一部分
  return (
    <div className={`dcf-field${auto?.autoValue != null ? (modified ? " is-modified" : " is-auto") : ""}`}>
      <label>
        {label}
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <small>{hint ?? ""}</small>
      {auto?.autoValue != null &&
        (modified ? (
          <small className="dcf-auto">
            已手动修改（自动值 {auto.autoValue}）
            <button type="button" className="dcf-link" onClick={auto.onReset}>
              恢复
            </button>
          </small>
        ) : (
          <small className="dcf-auto">自动 · {auto.source}</small>
        ))}
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange(next: T): void;
}): JSX.Element {
  return (
    <div className="dcf-field">
      <label>
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <small />
    </div>
  );
}

const asOptions = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((id) => ({ id, label: labels[id] }));

/** 从公司研究页带来的公司、市场、币种与当前价；其余假设仍由自己对照财报填写 */
function initialForm(): { form: DcfForm; fromResearch: string } {
  const form = emptyForm();
  const pre = typeof window === "undefined" ? null : parseDcfPrefill(window.location.search);
  if (!pre) return { form, fromResearch: "" };
  form.company = pre.company;
  form.code = pre.code;
  form.market = pre.market;
  form.currency = pre.currency;
  if (pre.currentPrice != null) form.values.currentPrice = String(pre.currentPrice);
  return { form, fromResearch: pre.company || pre.code };
}

export default function Dcf(): JSX.Element {
  const [initial] = useState(initialForm);
  const [form, setForm] = useState<DcfForm>(initial.form);
  const [records, setRecords] = useState<DcfRecord[]>(() => loadDcfRecords());
  const [notice, setNotice] = useState("");
  const [prefillNote] = useState(() =>
    initial.fromResearch
      ? `已从公司研究页带入 ${initial.fromResearch} 的名称、市场、币种${initial.form.values.currentPrice ? "与当前价" : ""}；起始自由现金流、股本、现金与负债请对照最新财报填写。`
      : "",
  );
  const [error, setError] = useState("");
  const [library, setLibrary] = useState<PrefillLibrary | null | "error">(null);
  const [query, setQuery] = useState("");
  const [auto, setAuto] = useState<AutoFill | null>(null);
  const [item, setItem] = useState<PrefillItem | null>(null);
  // 一键估算后默认收起完整参数，手动填写时默认展开
  const [advanced, setAdvanced] = useState(true);
  const [cycle, setCycle] = useState<CycleReport | null>(null);
  const [candNotice, setCandNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`${(import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? "/"}data/market-cycle-report.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: CycleReport | null) => { if (active && Array.isArray(body?.records)) setCycle(body); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`${(import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? "/"}data/dcf-prefill.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: PrefillLibrary) => {
        if (!active || body?.schemaVersion !== 1 || !Array.isArray(body.items)) throw new Error("bad");
        setLibrary(body);
        // 从公司研究页带代码进来时，库里有就直接估算
        const code = initial.form.code.trim();
        const hit = code ? body.items.find((i) => i.c === code && i.m === initial.form.market) : null;
        if (hit) applyItem(hit, body);
      })
      .catch(() => active && setLibrary("error"));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyItem(item: PrefillItem, lib: PrefillLibrary) {
    const fill = deriveAutoFill(item, lib.riskFree);
    setForm((f) => {
      const values = { ...emptyForm().values };
      for (const key of NUMERIC_FIELDS) values[key] = fill.values[key as AutoField] ?? "";
      return { ...f, ...fill.meta, moneyUnit: "yi", shareUnit: "yi", values };
    });
    setAuto(fill);
    setItem(item);
    setAdvanced(false);
    setCandNotice("");
    setQuery("");
    setError("");
    setNotice("");
  }
  const autoHint = (field: NumericField): AutoHint | undefined => {
    const autoValue = auto?.values[field as AutoField];
    if (autoValue == null) return undefined;
    return { source: auto?.sources[field as AutoField], autoValue, onReset: () => setNumber(field, autoValue) };
  };
  const matches = library && library !== "error" ? searchPrefill(library.items, query) : [];

  const input = toInput(form);
  const result = calculateSheetDcf(input);
  const waccResult = calculateWacc(input);
  const bands = calculateMultiples(input);
  const sensitivity = calculateSensitivity(input);
  const implied = result.status === "calculated" ? impliedGrowth(input) : null;
  const assessment = assess(input, item && item.c === input.code ? item : null, implied);
  const current = item && item.c === input.code ? item : null;
  const market = marketContext(cycle, current);
  const peers = current && library && library !== "error" ? peerStats(library.items, current) : null;
  const cand = useCandidates(true);
  const candMarket: CandidateMarket | null = current ? (current.m === "us" && !current.g.includes("研究公司") ? "ndx" : current.m) : null;
  const inPool = !!candMarket && cand.items.some((i) => i.market === candMarket && i.code === current!.c);
  const candidateNote = () => assessment
    ? `DCF ${new Date().toISOString().slice(0, 10)}：基准 ${formatPrice(assessment.scenarios[1].price, input.currency)}，买入参考 ${formatPrice(assessment.buyBelow, input.currency)}（可信度${CREDIBILITY_LABEL[assessment.credibility]}，增速 ${input.growth}%、折现 ${input.discountRate}%）`
    : "";
  const key = makeDcfKey(input);
  const existing = records.find((r) => r.key === key) ?? null;

  function setNumber(field: NumericField, value: string) {
    setForm((f) => ({ ...f, values: { ...f.values, [field]: value } }));
  }
  function setMeta<K extends keyof DcfForm>(field: K, value: DcfForm[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function save() {
    setError("");
    setNotice("");
    const outcome = saveDcfRecord(
      makeDcfRecord(input, {
        result,
        wacc: waccResult,
        multiples: bands,
      }),
    );
    if (!outcome.ok) {
      setError(outcome.error ?? "保存失败");
      return;
    }
    setRecords(loadDcfRecords());
    setNotice(
      existing
        ? `已覆盖 ${existing.company} 上一次的分析记录`
        : `已保存 ${input.company.trim() || input.code.trim() || "未命名"} 的分析记录`,
    );
  }

  function load(record: DcfRecord) {
    setForm(fromInput(record.input));
    setError("");
    setNotice(`已载入 ${record.company} 的分析记录，可修改后重新保存`);
  }

  function remove(record: DcfRecord) {
    if (!window.confirm(`确定删除 ${record.company} 的这条估值记录吗？`)) return;
    const outcome = deleteDcfRecord(record.key);
    if (!outcome.ok) {
      setError(outcome.error ?? "删除失败");
      return;
    }
    setRecords(loadDcfRecords());
    setNotice(`已删除 ${record.company} 的记录`);
  }

  const amountHint = (field: NumericField) =>
    formatScaleHint(toBaseAmount(parseNumber(form.values[field]), form.moneyUnit));
  const shareHint = () =>
    formatScaleHint(toBaseShares(parseNumber(form.values.shares), form.shareUnit));

  return (
    <Page className="dcf-page">
      <PageTitle>现金流折现估值（含 WACC）</PageTitle>
      <div className="page-toolbar">
        <span className="page-toolbar__note">
          五年现金流折现 + 终值 + 股权桥接，口径与原表一致；记录只存在当前浏览器。
        </span>
        <a
          className="dcf-button dcf-button--ghost"
          href="/downloads/dcf-wacc-model.xlsx"
          download="現金流折現估值模型(含WACC).xlsx"
        >
          下载 Excel 模板
        </a>
      </div>

      {prefillNote && !auto && (
        <p className="dcf-banner" role="status">
          {prefillNote}
        </p>
      )}

      <section className="dcf-card dcf-quick">
        <div className="dcf-head">
          <span className="dcf-badge">
            <Search size={18} />
          </span>
          <div>
            <h2>一键估算</h2>
            <p>
              输入股票名称或代码，按公开财报自动填好全部假设并算出合理价；下面每一项都可以改，结果随时重算。
              {library && library !== "error" && ` 当前覆盖沪深300、恒指、恒生科技、纳指100及研究公司共 ${library.items.length} 家。`}
            </p>
          </div>
        </div>
        <div className="dcf-search">
          <input
            type="search"
            aria-label="搜索股票名称或代码"
            placeholder={library === "error" ? "预填库暂不可用，可在下方手动填写" : "例如：茅台、600519、腾讯、00700、AAPL"}
            value={query}
            disabled={library === "error"}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0] && library && library !== "error") applyItem(matches[0], library);
            }}
          />
          {query.trim() && library && library !== "error" && (
            <ul className="dcf-search__list" aria-label="搜索结果">
              {matches.length === 0 && <li className="dcf-muted">预填库里没有找到；可直接在下方手动填写。</li>}
              {matches.map((item) => (
                <li key={`${item.m}:${item.c}`}>
                  <button type="button" onClick={() => applyItem(item, library)}>
                    <strong>{item.n}</strong>
                    <span>{item.c} · {MARKET_LABELS[item.m]} · {item.g.join("、")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {auto && (
          <div className={`dcf-auto-summary is-${auto.status}`} role="status">
            <p>
              <strong>{auto.meta.company}</strong> · {auto.statusText}
            </p>
            {auto.alternatives.map((alt) => (
              <p key={alt.field + alt.value} className="dcf-auto-alt">
                {alt.reason}
                <button
                  type="button"
                  className="dcf-button dcf-button--ghost"
                  onClick={() => setNumber(alt.field as NumericField, alt.value)}
                  disabled={form.values[alt.field as NumericField] === alt.value}
                >
                  改用{alt.label}
                </button>
              </p>
            ))}
            {auto.notes.length > 0 && (
              <ul className="dcf-notes">
                {auto.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <p className="dcf-muted">
              这是按统一规则得到的起点，不是目标价：成长率与折现率对结果影响最大，可以在下方“关键假设”里拖动调整。
            </p>
          </div>
        )}
      </section>

      {assessment && (
        <section className="dcf-card" aria-labelledby="dcf-verdict-title">
          <div className="dcf-head">
            <span className="dcf-badge">
              <TrendingUp size={18} />
            </span>
            <div>
              <h2 id="dcf-verdict-title">估值结论{input.company ? ` · ${input.company}` : ""}</h2>
              <p>三种情景给出价格区间；买入参考价已按可信度留出安全边际。仅为研究参考，不是买卖指令。</p>
            </div>
          </div>
          <VerdictCard
            a={assessment}
            currency={input.currency}
            price={input.currentPrice}
            impliedGrowth={implied}
            growth={input.growth}
            market={market}
            history={current?.fyh}
            peers={peers}
            onPeer={(code) => {
              const hit = library && library !== "error" ? library.items.find((i) => i.c === code && i.m === current?.m) : null;
              if (hit && library && library !== "error") { applyItem(hit, library); window.scrollTo({ top: 0, behavior: "smooth" }); }
            }}
            candidate={candMarket && current ? {
              inPool,
              onAdd: () => {
                if (!inPool) cand.toggle(candMarket, current.c);
                cand.setNote(candMarket, current.c, candidateNote());
                setCandNotice(`已${inPool ? "更新" : "加入"}候选池：${current.n}。可在“候选池”页查看`);
              },
              onRemove: () => { cand.toggle(candMarket, current.c); setCandNotice(`已从候选池移出：${current.n}`); },
            } : null}
          />
          {candNotice && <p className="dcf-muted dcf-gap-sm" role="status">{candNotice}</p>}
        </section>
      )}

      {result.status === "calculated" && (
        <section className="dcf-card" aria-labelledby="dcf-keys-title">
          <div className="dcf-head">
            <span className="dcf-badge">
              <Percent size={18} />
            </span>
            <div>
              <h2 id="dcf-keys-title">关键假设</h2>
              <p>这几项对结果影响最大。拖动看看合理价怎么变：假设差一点，结果可能差很多。</p>
            </div>
          </div>
          <div className="dcf-sliders">
            {KEY_SLIDERS.map((k) => (
              <KeySlider key={k.field} spec={k} value={form.values[k.field]} autoValue={auto?.values[k.field as AutoField]} onChange={(v) => setNumber(k.field, v)} />
            ))}
          </div>
        </section>
      )}

      <details className="dcf-advanced" open={advanced} onToggle={(e) => setAdvanced((e.target as HTMLDetailsElement).open)}>
        <summary>完整参数（进阶）：财报数据、WACC、EBITDA 倍数{auto ? " · 已自动填好，可逐项核对修改" : ""}</summary>

      <section className="dcf-card">
        <div className="dcf-head">
          <span className="dcf-badge">
            <Building2 size={18} />
          </span>
          <div>
            <h2>公司与单位</h2>
            <p>金额与股本按所选单位填写，换算后参与计算；汇率不自动换算，请自行统一口径。</p>
          </div>
        </div>
        <div className="dcf-form">
          <Field
            label="公司名称"
            hint="用于识别同一家公司"
            value={form.company}
            onChange={(v) => setMeta("company", v)}
          />
          <Field
            label="股票代码"
            hint="A股/港股/美股代码"
            value={form.code}
            onChange={(v) => setMeta("code", v)}
          />
          <Select
            label="市场"
            value={form.market}
            options={asOptions(MARKET_LABELS)}
            onChange={(v) => setMeta("market", v)}
          />
          <Select
            label="币种"
            value={form.currency}
            options={asOptions(CURRENCY_LABELS)}
            onChange={(v) => setMeta("currency", v)}
          />
          <Select
            label="金额单位"
            value={form.moneyUnit}
            options={asOptions(MONEY_UNIT_LABELS)}
            onChange={(v) => setMeta("moneyUnit", v)}
          />
          <Select
            label="股本单位"
            value={form.shareUnit}
            options={asOptions(SHARE_UNIT_LABELS)}
            onChange={(v) => setMeta("shareUnit", v)}
          />
          <Field
            label="基年"
            hint="现金流表的起始年份"
            value={form.baseYear}
            onChange={(v) => setMeta("baseYear", v)}
          />
        </div>
      </section>

      <section className="dcf-card">
        <div className="dcf-head">
          <span className="dcf-badge">
            <Calculator size={18} />
          </span>
          <div>
            <h2>现金流折现假设</h2>
            <p>基年现金流不折现，往后推五年；第五年并入终值后一起折现。</p>
          </div>
        </div>
        <div className="dcf-form">
          <Field
            label="起始自由现金流"
            hint={amountHint("baseFcf")}
            value={form.values.baseFcf}
            onChange={(v) => setNumber("baseFcf", v)}
            auto={autoHint("baseFcf")}
          />
          <Field
            label="五年成长率 (%)"
            hint="每年复利增长"
            value={form.values.growth}
            onChange={(v) => setNumber("growth", v)}
            auto={autoHint("growth")}
          />
          <Field
            label="永续增长率 (%)"
            hint="通常取 2%~3%"
            value={form.values.perpetualGrowth}
            onChange={(v) => setNumber("perpetualGrowth", v)}
            auto={autoHint("perpetualGrowth")}
          />
          <Field
            label="过渡期年数"
            hint="0 = 原表两阶段；建议 5"
            value={form.values.fadeYears}
            onChange={(v) => setNumber("fadeYears", v)}
            auto={autoHint("fadeYears")}
          />
          <Field
            label="期望折现率 (%)"
            hint="可填入下方算出的 WACC"
            value={form.values.discountRate}
            onChange={(v) => setNumber("discountRate", v)}
            auto={autoHint("discountRate")}
          />
          <Field
            label="现金及其他投资"
            hint={amountHint("cash")}
            value={form.values.cash}
            onChange={(v) => setNumber("cash", v)}
            auto={autoHint("cash")}
          />
          <Field
            label="有息负债"
            hint={amountHint("debt")}
            value={form.values.debt}
            onChange={(v) => setNumber("debt", v)}
            auto={autoHint("debt")}
          />
          <Field
            label="少数股东权益"
            hint={amountHint("minority")}
            value={form.values.minority}
            onChange={(v) => setNumber("minority", v)}
            auto={autoHint("minority")}
          />
          <Field
            label="流通股数"
            hint={shareHint()}
            value={form.values.shares}
            onChange={(v) => setNumber("shares", v)}
            auto={autoHint("shares")}
          />
          <Field
            label="当前股价"
            hint="每股价格，不随金额单位换算"
            value={form.values.currentPrice}
            onChange={(v) => setNumber("currentPrice", v)}
            auto={autoHint("currentPrice")}
          />
        </div>
      </section>

      <section className="dcf-card">
        <div className="dcf-head">
          <span className="dcf-badge">
            <Percent size={18} />
          </span>
          <div>
            <h2>加权平均资本成本 WACC</h2>
            <p>负债按税后成本计入，股权按 CAPM 估算；有息负债沿用上一张卡的输入。</p>
          </div>
        </div>
        <div className="dcf-form">
          <Field
            label="市值"
            hint={amountHint("marketCap")}
            value={form.values.marketCap}
            onChange={(v) => setNumber("marketCap", v)}
            auto={autoHint("marketCap")}
          />
          <Field
            label="β 值"
            hint="未填按 1 估算"
            value={form.values.beta}
            onChange={(v) => setNumber("beta", v)}
            auto={autoHint("beta")}
          />
          <Field
            label="利息支出"
            hint={amountHint("interestExpense")}
            value={form.values.interestExpense}
            onChange={(v) => setNumber("interestExpense", v)}
            auto={autoHint("interestExpense")}
          />
          <Field
            label="税前收入"
            hint={amountHint("pretaxIncome")}
            value={form.values.pretaxIncome}
            onChange={(v) => setNumber("pretaxIncome", v)}
            auto={autoHint("pretaxIncome")}
          />
          <Field
            label="所得税"
            hint={amountHint("taxPaid")}
            value={form.values.taxPaid}
            onChange={(v) => setNumber("taxPaid", v)}
            auto={autoHint("taxPaid")}
          />
          <Field
            label="无风险利率 (%)"
            hint="国债收益率"
            value={form.values.riskFreeRate}
            onChange={(v) => setNumber("riskFreeRate", v)}
            auto={autoHint("riskFreeRate")}
          />
          <Field
            label="市场预期回报 (%)"
            hint="股指长期年化"
            value={form.values.marketReturn}
            onChange={(v) => setNumber("marketReturn", v)}
            auto={autoHint("marketReturn")}
          />
        </div>
        <div className="dcf-actions dcf-gap">
          {waccResult.status === "calculated" ? (
            <>
              <strong>
                WACC {formatPct(waccResult.wacc)} · 股权成本{" "}
                {formatPct((waccResult.costOfEquity ?? 0) * 100)} · 负债成本{" "}
                {formatPct((waccResult.costOfDebt ?? 0) * 100)} · 税率{" "}
                {formatPct((waccResult.taxRate ?? 0) * 100)}
              </strong>
              <button
                type="button"
                className="dcf-button dcf-button--ghost"
                onClick={() =>
                  setNumber("discountRate", (waccResult.wacc ?? 0).toFixed(2))
                }
              >
                用 WACC 作为折现率
              </button>
            </>
          ) : (
            <span className="dcf-muted">{waccResult.reason}</span>
          )}
        </div>
        {waccResult.notes.length > 0 && (
          <ul className="dcf-notes">
            {waccResult.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="dcf-card">
        <div className="dcf-head">
          <span className="dcf-badge">
            <TrendingUp size={18} />
          </span>
          <div>
            <h2>EBITDA 倍数（对照参考）</h2>
            <p>隐含每股价格 = EBITDA × 倍数 ÷ 流通股数；金融股与亏损公司不适用。</p>
          </div>
        </div>
        <div className="dcf-form">
          <Field
            label="EBITDA"
            hint={amountHint("ebitda")}
            value={form.values.ebitda}
            onChange={(v) => setNumber("ebitda", v)}
            auto={autoHint("ebitda")}
          />
        </div>
        <div className="dcf-metrics dcf-gap">
          {bands.map((band) => (
            <BandCard key={band.label} band={band} currency={input.currency} />
          ))}
        </div>
      </section>

      </details>

      <section className="dcf-card">
        <div className="dcf-head">
          <span className="dcf-badge">
            <Calculator size={18} />
          </span>
          <div>
            <h2>估值结果（明细）</h2>
            <p>{result.reason}</p>
          </div>
        </div>
        <div className="dcf-metrics">
          <div className="dcf-metric">
            <small>企业价值 EV</small>
            <strong>{formatMoney(result.enterpriseValue ?? null, input.currency)}</strong>
          </div>
          <div className="dcf-metric">
            <small>股权价值</small>
            <strong>{formatMoney(result.equityValue ?? null, input.currency)}</strong>
          </div>
          <div className="dcf-metric">
            <small>股票合理价</small>
            <strong>{formatPrice(result.price, input.currency)}</strong>
          </div>
          <div className="dcf-metric">
            <small>安全边际</small>
            <strong
              className={
                result.mos == null ? "" : result.mos > 0 ? "dcf-up" : "dcf-down"
              }
            >
              {formatSignedPct((result.mos ?? 0) * 100)}
            </strong>
            {result.verdict && (
              <span
                className={
                  result.verdict === "BUY"
                    ? "dcf-verdict dcf-verdict--buy"
                    : "dcf-verdict dcf-verdict--sell"
                }
              >
                {result.verdict}
              </span>
            )}
          </div>
        </div>
        <div className="dcf-metrics dcf-gap">
          <div className="dcf-metric">
            <small>终值（未折现）</small>
            <strong>{formatMoney(result.terminalValue ?? null, input.currency)}</strong>
          </div>
          <div className="dcf-metric">
            <small>终值占 EV</small>
            <strong>{formatPct((result.terminalShare ?? 0) * 100, 1)}</strong>
          </div>
          <div className="dcf-metric">
            <small>流通股数</small>
            <strong>{formatShares(toBaseShares(input.shares, input.shareUnit))}</strong>
          </div>
          <div className="dcf-metric">
            <small>当前股价</small>
            <strong>{formatPrice(input.currentPrice, input.currency)}</strong>
          </div>
        </div>

        {result.cashflows.length > 0 && (
          <table className="dcf-table">
            <thead>
              <tr>
                <th>年份</th>
                {result.cashflows.map((_, i) => (
                  <th key={i}>{input.baseYear + i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>自由现金流</td>
                {result.cashflows.map((flow, i) => (
                  <td key={i}>{formatMoney(flow, input.currency)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        )}

        {result.warnings.length > 0 && (
          <ul className="dcf-notes">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        <div className="dcf-actions dcf-gap">
          <button type="button" className="dcf-button" onClick={save}>
            <Save size={15} />{" "}
            {existing ? `保存并覆盖 ${existing.company} 的记录` : "保存本次分析"}
          </button>
          {existing && (
            <span className="dcf-muted">
              上次保存于 {new Date(existing.savedAt).toLocaleString("zh-CN")}
            </span>
          )}
        </div>
        {notice && (
          <p className="dcf-muted dcf-gap-sm" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="dcf-error dcf-gap-sm" role="alert">
            {error}
          </p>
        )}
      </section>

      {sensitivity && (
        <section className="dcf-card">
          <div className="dcf-head">
            <span className="dcf-badge">
              <Percent size={18} />
            </span>
            <div>
              <h2>敏感性矩阵：折现率 × 永续增长率</h2>
              <p>
                估值是一个区间，不是一个点。其余假设不变，只看这两项变动时的合理价；带框为当前假设。
              </p>
            </div>
          </div>
          <div className="dcf-sens">
            <table className="dcf-table" aria-label="DCF 敏感性矩阵">
              <thead>
                <tr>
                  <th className="dcf-sens__corner">折现率 \ 永续增长</th>
                  {sensitivity.perpetualGrowths.map((g) => (
                    <th key={g}>{formatPct(g)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sensitivity.cells.map((row, ri) => (
                  <tr key={sensitivity.discountRates[ri]}>
                    <td>{formatPct(sensitivity.discountRates[ri])}</td>
                    {row.map((cell, ci) => (
                      <td
                        key={cell.perpetualGrowth}
                        className={ri === 2 && ci === 2 ? "dcf-sens__center" : undefined}
                        style={sensitivityStyle(cell.mos)}
                        title={
                          cell.mos == null
                            ? undefined
                            : `安全边际 ${formatSignedPct(cell.mos * 100)}`
                        }
                      >
                        {cell.price == null ? "—" : formatPrice(cell.price, input.currency)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dcf-sens__legend" aria-hidden="true">
            <span><i className="dcf-sens__swatch is-high" />高于现价（越红越高）</span>
            <span><i className="dcf-sens__swatch is-low" />低于现价（越绿越低）</span>
          </div>
          <p className="dcf-muted dcf-gap-sm">
            合理价区间 {formatPrice(sensitivity.minPrice, input.currency)} ~{" "}
            {formatPrice(sensitivity.maxPrice, input.currency)}
            {sensitivity.positiveShare != null &&
              `；25 种组合中 ${Math.round(sensitivity.positiveShare * 25)} 种高于现价`}
            。"—"表示折现率不高于永续增长率，终值无意义。
          </p>
        </section>
      )}

      <section className="dcf-card">
        <div className="dcf-head">
          <span className="dcf-badge">
            <Save size={18} />
          </span>
          <div>
            <h2>已保存的公司</h2>
            <p>最多保留 20 条；同一家公司再次保存会覆盖上一次的记录。</p>
          </div>
        </div>
        {records.length === 0 ? (
          <p className="dcf-empty">还没有保存过估值记录。</p>
        ) : (
          records.map((record) => (
            <div className="dcf-record" key={record.key}>
              <div className="dcf-record__main">
                <strong>
                  {record.company}
                  {record.code ? ` · ${record.code}` : ""}
                </strong>
                <small>
                  {MARKET_LABELS[record.market]} ·{" "}
                  {new Date(record.savedAt).toLocaleString("zh-CN")} · 合理价{" "}
                  {formatPrice(record.result.price, record.input.currency)} ·
                  安全边际 {formatSignedPct((record.result.mos ?? 0) * 100)}
                  {record.debtBasis !== "interestBearing" && " · 旧口径（按总负债扣减，合理价可能偏低）"}
                </small>
              </div>
              <div className="dcf-actions">
                <button
                  type="button"
                  className="dcf-button dcf-button--ghost"
                  onClick={() => load(record)}
                >
                  载入
                </button>
                <button
                  type="button"
                  className="dcf-button dcf-button--danger"
                  onClick={() => remove(record)}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </Page>
  );
}

/** 安全边际越高越红、越低越绿（红涨绿跌），深浅随幅度，50% 封顶 */
function sensitivityStyle(mos: number | null): React.CSSProperties | undefined {
  if (mos == null) return undefined;
  const alpha = Math.min(Math.abs(mos) / 0.5, 1) * 0.35;
  const rgb = mos >= 0 ? "196, 80, 63" : "63, 154, 98";
  return { background: `rgba(${rgb}, ${alpha.toFixed(3)})` };
}

function BandCard({
  band,
  currency,
}: {
  band: MultipleBand;
  currency: Currency;
}): JSX.Element {
  return (
    <div className="dcf-metric">
      <small>
        {band.label} · {band.multiple}× EBITDA
      </small>
      <strong>{formatPrice(band.price, currency)}</strong>
      {band.status !== "calculated" && <small className="dcf-muted">{band.reason}</small>}
    </div>
  );
}

interface CycleReport {
  records: { weekEnding: string; markets: Record<"csi300" | "hsi" | "hstech", { legacyState: string; shadow: { trendState: string; valuationZone: string } }> }[];
}
/** 个股所在市场的牛熊周期状态：A股看沪深300，港股科技看恒生科技，其余港股看恒指；美股暂无 */
function marketContext(report: CycleReport | null, item: PrefillItem | null): MarketContext | null {
  const latest = report?.records?.[0];
  if (!latest || !item || item.m === "us") return null;
  const id = item.m === "cn" ? "csi300" : item.g.includes("恒生科技") ? "hstech" : "hsi";
  const m = latest.markets[id];
  if (!m) return null;
  const label = { csi300: "A股（沪深300）", hsi: "港股（恒生指数）", hstech: "港股（恒生科技）" }[id];
  return { label, state: m.legacyState, trend: m.shadow.trendState, zone: m.shadow.valuationZone, weekEnding: latest.weekEnding };
}

interface SliderSpec { field: NumericField; label: string; min: number; max: number; step: number; unit: string; explain: string }
const KEY_SLIDERS: SliderSpec[] = [
  { field: "growth", label: "五年成长率", min: -10, max: 30, step: 0.5, unit: "%", explain: "未来 5 年自由现金流每年增长多少。参考历史增速和行业前景；成熟公司通常 3%～8%。" },
  { field: "discountRate", label: "折现率", min: 5, max: 16, step: 0.1, unit: "%", explain: "你要求的年回报率。越高，未来的钱折算到今天越不值钱，合理价越低；风险越大的公司应越高。" },
  { field: "perpetualGrowth", label: "永续增长率", min: 0, max: 4, step: 0.1, unit: "%", explain: "十年以后的长期增速，通常 2%～3%，不应高于经济的长期名义增速。" },
  { field: "fadeYears", label: "过渡期", min: 0, max: 10, step: 1, unit: " 年", explain: "高增长结束后，用几年逐步降到长期增速。0 年表示一步到位，最保守。" },
];
function KeySlider({ spec, value, autoValue, onChange }: { spec: SliderSpec; value: string; autoValue?: string; onChange(v: string): void }): JSX.Element {
  const n = parseNumber(value);
  const current = n == null ? spec.min : Math.min(spec.max, Math.max(spec.min, n));
  return (
    <div className="dcf-slider">
      <div className="dcf-slider__top">
        <span>{spec.label}</span>
        <strong>{n == null ? "—" : `${n}${spec.unit}`}</strong>
      </div>
      <input type="range" aria-label={spec.label} min={spec.min} max={spec.max} step={spec.step} value={current} onChange={(e) => onChange(e.target.value)} />
      <small>
        {spec.explain}
        {autoValue != null && value.trim() !== autoValue && (
          <button type="button" className="dcf-link" onClick={() => onChange(autoValue)}>恢复自动值 {autoValue}{spec.unit}</button>
        )}
      </small>
    </div>
  );
}
