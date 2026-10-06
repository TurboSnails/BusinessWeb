import { useState } from "react";
import { PageTitle } from "../components/ui/PageTabs";
import {
  Building2,
  Calculator,
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
  parseNumber,
  saveDcfRecord,
  toBaseAmount,
  toBaseShares,
} from "../features/dcf";
import type {
  Currency,
  DcfRecord,
  DcfSheetInput,
  Market,
  MoneyUnit,
  MultipleBand,
  ShareUnit,
} from "../features/dcf";
import "../features/dcf/dcf.css";

const NUMERIC_FIELDS = [
  "baseFcf",
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

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange(next: string): void;
}): JSX.Element {
  // 提示文字放在 label 外面：否则会和字段名连在一起变成可访问名称的一部分
  return (
    <div className="dcf-field">
      <label>
        {label}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <small>{hint ?? ""}</small>
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

export default function Dcf(): JSX.Element {
  const [form, setForm] = useState<DcfForm>(emptyForm);
  const [records, setRecords] = useState<DcfRecord[]>(() => loadDcfRecords());
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const input = toInput(form);
  const result = calculateSheetDcf(input);
  const waccResult = calculateWacc(input);
  const bands = calculateMultiples(input);
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
    <main className="dcf-page">
      <PageTitle>现金流折现估值（含 WACC）</PageTitle>
      <div className="page-toolbar">
        <span className="page-toolbar__note">
          五年现金流折现 + 终值 + 股权桥接，口径与原表一致；记录只存在当前浏览器。
        </span>
      </div>

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
          />
          <Field
            label="五年成长率 (%)"
            hint="每年复利增长"
            value={form.values.growth}
            onChange={(v) => setNumber("growth", v)}
          />
          <Field
            label="永续增长率 (%)"
            hint="通常取 2%~3%"
            value={form.values.perpetualGrowth}
            onChange={(v) => setNumber("perpetualGrowth", v)}
          />
          <Field
            label="期望折现率 (%)"
            hint="可填入下方算出的 WACC"
            value={form.values.discountRate}
            onChange={(v) => setNumber("discountRate", v)}
          />
          <Field
            label="现金及其他投资"
            hint={amountHint("cash")}
            value={form.values.cash}
            onChange={(v) => setNumber("cash", v)}
          />
          <Field
            label="总负债"
            hint={amountHint("debt")}
            value={form.values.debt}
            onChange={(v) => setNumber("debt", v)}
          />
          <Field
            label="流通股数"
            hint={shareHint()}
            value={form.values.shares}
            onChange={(v) => setNumber("shares", v)}
          />
          <Field
            label="当前股价"
            hint="每股价格，不随金额单位换算"
            value={form.values.currentPrice}
            onChange={(v) => setNumber("currentPrice", v)}
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
            <p>负债按税后成本计入，股权按 CAPM 估算；总负债沿用上一张卡的输入。</p>
          </div>
        </div>
        <div className="dcf-form">
          <Field
            label="市值"
            hint={amountHint("marketCap")}
            value={form.values.marketCap}
            onChange={(v) => setNumber("marketCap", v)}
          />
          <Field
            label="β 值"
            hint="未填按 1 估算"
            value={form.values.beta}
            onChange={(v) => setNumber("beta", v)}
          />
          <Field
            label="利息支出"
            hint={amountHint("interestExpense")}
            value={form.values.interestExpense}
            onChange={(v) => setNumber("interestExpense", v)}
          />
          <Field
            label="税前收入"
            hint={amountHint("pretaxIncome")}
            value={form.values.pretaxIncome}
            onChange={(v) => setNumber("pretaxIncome", v)}
          />
          <Field
            label="所得税"
            hint={amountHint("taxPaid")}
            value={form.values.taxPaid}
            onChange={(v) => setNumber("taxPaid", v)}
          />
          <Field
            label="无风险利率 (%)"
            hint="国债收益率"
            value={form.values.riskFreeRate}
            onChange={(v) => setNumber("riskFreeRate", v)}
          />
          <Field
            label="市场预期回报 (%)"
            hint="股指长期年化"
            value={form.values.marketReturn}
            onChange={(v) => setNumber("marketReturn", v)}
          />
        </div>
        <div className="dcf-actions" style={{ marginTop: 14 }}>
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
          />
        </div>
        <div className="dcf-metrics" style={{ marginTop: 14 }}>
          {bands.map((band) => (
            <BandCard key={band.label} band={band} currency={input.currency} />
          ))}
        </div>
      </section>

      <section className="dcf-card">
        <div className="dcf-head">
          <span className="dcf-badge">
            <Calculator size={18} />
          </span>
          <div>
            <h2>估值结果</h2>
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
        <div className="dcf-metrics" style={{ marginTop: 10 }}>
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

        <div className="dcf-actions" style={{ marginTop: 18 }}>
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
          <p className="dcf-muted" role="status" style={{ marginTop: 8 }}>
            {notice}
          </p>
        )}
        {error && (
          <p className="dcf-error" role="alert" style={{ marginTop: 8 }}>
            {error}
          </p>
        )}
      </section>

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
    </main>
  );
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
