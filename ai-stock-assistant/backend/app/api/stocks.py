import json
import os
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from app.schemas.stock import IndicatorSnapshot
from app.services.indicator_service import get_indicator_snapshot
from app.services.stock_service import get_kline, get_realtime_price

router = APIRouter(prefix="/stocks", tags=["stocks"])

_STOCK_CACHE_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "stock_list.json"


def _load_stock_list() -> list[dict]:
    if _STOCK_CACHE_PATH.exists():
        with open(_STOCK_CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    import akshare
    df = akshare.stock_info_a_code_name()
    records = df.to_dict(orient="records")
    os.makedirs(_STOCK_CACHE_PATH.parent, exist_ok=True)
    with open(_STOCK_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False)
    return records


@router.get("/realtime/{code}")
async def get_stock_realtime(code: str):
    try:
        price = get_realtime_price(code)
        return {"code": code, "price": price}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search_stocks(q: str = Query("", min_length=1)):
    try:
        stocks = _load_stock_list()
        q_upper = q.upper()
        results = []
        for s in stocks:
            code: str = str(s["code"])
            name: str = str(s["name"])
            if q_upper in code or q_upper in name.upper():
                results.append({"code": code.zfill(6), "name": name.strip()})
            if len(results) >= 10:
                break
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{code}/kline")
async def get_stock_kline(code: str, days: int = 60):
    try:
        kline = get_kline(code, days=days)
        if kline.empty:
            raise HTTPException(status_code=404, detail=f"股票 {code} 未找到 K 线数据")
        records = kline.to_dict(orient="records")
        for r in records:
            if hasattr(r.get("日期"), "strftime"):
                r["日期"] = r["日期"].strftime("%Y-%m-%d")
            for k in list(r.keys()):
                if isinstance(r[k], float):
                    r[k] = round(r[k], 3)
        return {"code": code, "days": len(records), "klines": records}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{code}/indicators-history")
async def get_stock_indicators_history(code: str, days: int = 120):
    try:
        kline = get_kline(code, days=days)
        if kline.empty:
            raise HTTPException(status_code=404, detail=f"股票 {code} 未找到 K 线数据")
        from app.services.indicator_service import calculate_indicators
        enriched = calculate_indicators(kline)
        records = []
        for _, row in enriched.iterrows():
            records.append({
                "date": str(row["date"]),
                "macd_dif": round(float(row["macd_dif"]), 4) if pd.notna(row["macd_dif"]) else None,
                "macd_dea": round(float(row["macd_dea"]), 4) if pd.notna(row["macd_dea"]) else None,
                "macd_hist": round(float(row["macd_hist"]), 4) if pd.notna(row["macd_hist"]) else None,
                "rsi": round(float(row["rsi"]), 2) if pd.notna(row["rsi"]) else None,
                "boll_upper": round(float(row["boll_upper"]), 2) if pd.notna(row["boll_upper"]) else None,
                "boll_mid": round(float(row["boll_mid"]), 2) if pd.notna(row["boll_mid"]) else None,
                "boll_lower": round(float(row["boll_lower"]), 2) if pd.notna(row["boll_lower"]) else None,
            })
        return {"code": code, "days": len(records), "records": records}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{code}/indicators", response_model=IndicatorSnapshot)
async def get_stock_indicators(code: str, days: int = 60, name: str = ""):
    try:
        snapshot = get_indicator_snapshot(code, days=days, name=name or None)
        if not snapshot:
            raise HTTPException(status_code=404, detail=f"股票 {code} 指标计算失败")
        return snapshot
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
