import asyncio
import json
import logging
import os
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from app.schemas.stock import IndicatorSnapshot
from app.services.indicator_service import get_indicator_snapshot
from app.services.stock_service import get_kline, get_realtime_price

logger = logging.getLogger(__name__)

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
        price = await asyncio.to_thread(get_realtime_price, code)
        return {"code": code, "price": price}
    except Exception:
        logger.exception("获取实时行情失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.get("/search")
async def search_stocks(q: str = Query("", min_length=1)):
    try:
        stocks = await asyncio.to_thread(_load_stock_list)
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
    except Exception:
        logger.exception("搜索股票失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.get("/{code}/kline")
async def get_stock_kline(code: str, days: int = 60):
    try:
        kline = await asyncio.to_thread(get_kline, code, days=days)
        if kline.empty:
            raise HTTPException(status_code=404, detail=f"股票 {code} 未找到 K 线数据")
        records = kline.to_dict(orient="records")
        result = []
        for r in records:
            row = {}
            # 统一列名：akshare 中文 → 英文
            col_map = {"日期": "date", "开盘": "open", "收盘": "close", "最高": "high", "最低": "low", "成交量": "volume"}
            for cn, en in col_map.items():
                if cn in r:
                    row[en] = r[cn]
                elif en in r:
                    row[en] = r[en]
            # 日期对象 → 字符串
            val = row.get("date")
            if hasattr(val, "strftime"):
                row["date"] = val.strftime("%Y-%m-%d")
            else:
                row["date"] = str(val)
            # 浮点数精度
            for k in ("open", "close", "high", "low", "volume"):
                if k in row and isinstance(row[k], (int, float)):
                    row[k] = round(float(row[k]), 3)
            result.append(row)
        return {"code": code, "days": len(result), "klines": result}
    except HTTPException:
        raise
    except Exception:
        logger.exception("获取 K 线数据失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.get("/{code}/indicators-history")
async def get_stock_indicators_history(code: str, days: int = 120):
    try:
        kline = await asyncio.to_thread(get_kline, code, days=days)
        if kline.empty:
            raise HTTPException(status_code=404, detail=f"股票 {code} 未找到 K 线数据")
        from app.services.indicator_service import calculate_indicators
        enriched = await asyncio.to_thread(calculate_indicators, kline)
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
    except Exception:
        logger.exception("获取指标历史失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.get("/{code}/indicators", response_model=IndicatorSnapshot)
async def get_stock_indicators(code: str, days: int = 60, name: str = ""):
    try:
        snapshot = await asyncio.to_thread(get_indicator_snapshot, code, days=days, name=name or None)
        if not snapshot:
            raise HTTPException(status_code=404, detail=f"股票 {code} 指标计算失败")
        return snapshot
    except HTTPException:
        raise
    except Exception:
        logger.exception("获取指标快照失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")
