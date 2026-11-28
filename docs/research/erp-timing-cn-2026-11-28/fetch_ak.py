"""经 AkShare 取公开数据（乐咕乐股、东方财富、新浪、商务部），串行、每源间隔 3 秒。
本阶段不保存任何指数价格列（乐咕返回的「指数」「沪深300指数」「close」列直接丢弃）。
用法：research-py/.venv/bin/python -I fetch_ak.py
"""
import json, time, pathlib
import akshare as ak
import pandas as pd
ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "data-raw/erp-timing-cn/raw"
DROP = {"指数", "沪深300指数", "close", "收盘", "收盘价"}

def save(name, df, src, note=""):
    df = df[[c for c in df.columns if c not in DROP]].copy()
    for c in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[c]):
            df[c] = df[c].dt.strftime("%Y-%m-%d")
    rec = {"source": src, "note": note, "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
           "columns": [str(c) for c in df.columns], "rows": json.loads(df.to_json(orient="values", force_ascii=False, date_format="iso"))}
    (OUT / f"{name}.json").write_text(json.dumps(rec, ensure_ascii=False))
    print(name, df.shape, df.iloc[0].tolist()[:3], df.iloc[-1].tolist()[:3], flush=True)
    time.sleep(3)

save("lg_pe_csi300", ak.stock_index_pe_lg(symbol="沪深300"), "乐咕乐股 stock_index_pe_lg(沪深300)，经 AkShare 1.20.70", "月末；价格列已丢弃")
save("lg_ebs_csi300", ak.stock_ebs_lg(), "乐咕乐股 stock_ebs_lg（股债利差，沪深300）", "日频；价格列已丢弃")
save("lg_a_ttm_lyr", ak.stock_a_ttm_lyr(), "乐咕乐股 stock_a_ttm_lyr（全 A 市盈率 TTM / LYR 中位数与等权）", "价格列已丢弃")
save("em_bond_10y", ak.bond_zh_us_yield_em(start_date="20050101"), "东方财富 bond_zh_us_yield_em（中美国债收益率）", "")
save("sina_money_supply", ak.macro_china_money_supply_sina(), "新浪财经 macro_china_money_supply_sina（货币供应量，统计月）", "统计月，非发布日")
save("em_money_supply", ak.macro_china_money_supply_em(), "东方财富 macro_china_money_supply_em（货币供应量，统计月）", "统计月，非发布日")
save("mofcom_afre_flow", ak.macro_china_social_financing(), "商务部 macro_china_social_financing（社融增量，统计月）", "2015 起")
