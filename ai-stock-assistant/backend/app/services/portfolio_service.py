"""持仓管理服务"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import List, Optional

from app.db import get_connection, get_db, init_db
from app.schemas.portfolio import (
    AddPositionRequest,
    DailyReviewResult,
    HoldingCreate,
    HoldingItem,
    HoldingListResponse,
    HoldingUpdate,
    MonthlyPnL,
    SellOrderRequest,
    TradeRecord,
)


# ─── 建表 ───

def ensure_tables():
    init_db()


# ─── 持仓 CRUD ───

def create_holding(data: HoldingCreate) -> HoldingItem:
    ensure_tables()
    buy_date = data.buy_date or date.today().isoformat()
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO holdings (code, name, buy_date, buy_price, quantity,
               stop_loss, take_profit, ai_score_at_buy, buy_reason, current_price)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (data.code, data.name, buy_date, data.buy_price, data.quantity,
             data.stop_loss, data.take_profit, data.ai_score_at_buy, data.buy_reason, data.buy_price),
        )
        conn.commit()
        # Also record the buy trade
        conn.execute(
            """INSERT INTO trades (holding_id, code, name, trade_date, trade_type,
               price, quantity, reason)
               VALUES (?, ?, ?, ?, 'buy', ?, ?, ?)""",
            (cursor.lastrowid, data.code, data.name, buy_date, data.buy_price, data.quantity, data.buy_reason),
        )
        conn.commit()
        return get_holding_by_id(cursor.lastrowid)


def add_position(holding_id: int, data: AddPositionRequest) -> HoldingItem:
    """加仓：加权平均买入价，增加股数，记录买入交易。"""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM holdings WHERE id = ? AND status = 'holding'", (holding_id,)).fetchone()
        if not row:
            raise ValueError(f"持仓 {holding_id} 不存在或已平仓")

        old_qty = row["quantity"]
        old_price = row["buy_price"]
        new_qty = data.add_quantity
        new_price = data.add_price

        total_qty = old_qty + new_qty
        avg_price = round((old_price * old_qty + new_price * new_qty) / total_qty, 3)

        conn.execute(
            "UPDATE holdings SET buy_price = ?, quantity = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            (avg_price, total_qty, holding_id),
        )
        conn.execute(
            """INSERT INTO trades (holding_id, code, name, trade_date, trade_type,
               price, quantity, reason)
               VALUES (?, ?, ?, date('now', 'localtime'), 'buy', ?, ?, ?)""",
            (holding_id, row["code"], row["name"], new_price, new_qty, data.add_reason),
        )
        conn.commit()
        return get_holding_by_id(holding_id)
    finally:
        conn.close()


def get_holding_by_id(holding_id: int) -> HoldingItem:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM holdings WHERE id = ?", (holding_id,)).fetchone()
        if not row:
            raise ValueError(f"持仓 {holding_id} 不存在")
        return _row_to_holding(row)
    finally:
        conn.close()


def list_holdings(status: str = "holding") -> HoldingListResponse:
    ensure_tables()
    with get_db() as conn:
        if status == "holding":
            rows = conn.execute(
                "SELECT * FROM holdings WHERE status IN ('holding', 'pending') ORDER BY created_at DESC",
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM holdings WHERE status = ? ORDER BY created_at DESC",
                (status,),
            ).fetchall()
        items = [_row_to_holding(r) for r in rows]
        total_cost = sum(h.buy_price * h.quantity for h in items)
        total_mv = sum(h.current_price * h.quantity for h in items)
        total_pnl = sum(h.pnl_amount or 0 for h in items) if status == "sold" else (total_mv - total_cost)
        return HoldingListResponse(
            count=len(items),
            total_market_value=round(total_mv, 2),
            total_cost=round(total_cost, 2),
            total_pnl=round(total_pnl, 2),
            total_pnl_pct=round((total_pnl / total_cost * 100) if total_cost else 0, 2),
            items=items,
        )


def update_holding(holding_id: int, data: HoldingUpdate) -> HoldingItem:
    conn = get_connection()
    try:
        fields = []
        values = []
        if data.stop_loss is not None:
            fields.append("stop_loss = ?")
            values.append(data.stop_loss)
        if data.take_profit is not None:
            fields.append("take_profit = ?")
            values.append(data.take_profit)
        if data.buy_price is not None:
            fields.append("buy_price = ?")
            values.append(data.buy_price)
        if not fields:
            return get_holding_by_id(holding_id)
        fields.append("updated_at = datetime('now', 'localtime')")
        values.append(holding_id)
        conn.execute(
            f"UPDATE holdings SET {', '.join(fields)} WHERE id = ?",
            values,
        )
        conn.commit()
        # Also update the buy trade record price if buy_price changed
        if data.buy_price is not None:
            conn.execute(
                "UPDATE trades SET price = ? WHERE holding_id = ? AND trade_type = 'buy'",
                (data.buy_price, holding_id),
            )
            conn.commit()
        return get_holding_by_id(holding_id)
    finally:
        conn.close()


def sell_holding(holding_id: int, sell_price: Optional[float] = None, reason: str = "") -> HoldingItem:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM holdings WHERE id = ? AND status = 'holding'", (holding_id,)).fetchone()
        if not row:
            raise ValueError(f"持仓 {holding_id} 不存在或已平仓")

        price = sell_price if sell_price is not None else row["current_price"]
        pnl = (price - row["buy_price"]) * row["quantity"]
        pnl_pct = (price - row["buy_price"]) / row["buy_price"] * 100

        conn.execute(
            "UPDATE holdings SET status = 'sold', current_price = ?, sell_price = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            (price, price, holding_id),
        )
        conn.execute(
            """INSERT INTO trades (holding_id, code, name, trade_date, trade_type,
               price, quantity, reason, pnl, pnl_pct)
               VALUES (?, ?, ?, date('now', 'localtime'), 'sell', ?, ?, ?, ?, ?)""",
            (holding_id, row["code"], row["name"], price, row["quantity"], reason, round(pnl, 2), round(pnl_pct, 2)),
        )
        conn.commit()
        return get_holding_by_id(holding_id)
    finally:
        conn.close()


def create_sell_order(holding_id: int, sell_price: float) -> HoldingItem:
    """挂单：设置卖出挂单价，status→pending。"""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM holdings WHERE id = ? AND status = 'holding'", (holding_id,)).fetchone()
        if not row:
            raise ValueError(f"持仓 {holding_id} 不存在或已平仓")
        conn.execute(
            "UPDATE holdings SET status = 'pending', sell_price = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            (sell_price, holding_id),
        )
        conn.commit()
        return get_holding_by_id(holding_id)
    finally:
        conn.close()


def update_sell_order_price(holding_id: int, sell_price: float) -> HoldingItem:
    """改价：修改 pending 状态下的挂单价。"""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM holdings WHERE id = ? AND status = 'pending'", (holding_id,)).fetchone()
        if not row:
            raise ValueError(f"持仓 {holding_id} 不在挂单状态")
        conn.execute(
            "UPDATE holdings SET sell_price = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            (sell_price, holding_id),
        )
        conn.commit()
        return get_holding_by_id(holding_id)
    finally:
        conn.close()


def confirm_sell(holding_id: int, reason: str = "挂单成交") -> HoldingItem:
    """确认成交：status→sold，创建卖出交易记录。"""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM holdings WHERE id = ? AND status = 'pending'", (holding_id,)).fetchone()
        if not row:
            raise ValueError(f"持仓 {holding_id} 不在挂单状态")

        price = row["sell_price"] if row["sell_price"] > 0 else row["current_price"]
        pnl = (price - row["buy_price"]) * row["quantity"]
        pnl_pct = (price - row["buy_price"]) / row["buy_price"] * 100

        conn.execute(
            "UPDATE holdings SET status = 'sold', current_price = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            (price, holding_id),
        )
        conn.execute(
            """INSERT INTO trades (holding_id, code, name, trade_date, trade_type,
               price, quantity, reason, pnl, pnl_pct)
               VALUES (?, ?, ?, date('now', 'localtime'), 'sell', ?, ?, ?, ?, ?)""",
            (holding_id, row["code"], row["name"], price, row["quantity"], reason, round(pnl, 2), round(pnl_pct, 2)),
        )
        conn.commit()
        return get_holding_by_id(holding_id)
    finally:
        conn.close()


def cancel_sell_order(holding_id: int) -> HoldingItem:
    """取消挂单：status→holding，清空 sell_price。"""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM holdings WHERE id = ? AND status = 'pending'", (holding_id,)).fetchone()
        if not row:
            raise ValueError(f"持仓 {holding_id} 不在挂单状态")
        conn.execute(
            "UPDATE holdings SET status = 'holding', sell_price = 0.0, updated_at = datetime('now', 'localtime') WHERE id = ?",
            (holding_id,),
        )
        conn.commit()
        return get_holding_by_id(holding_id)
    finally:
        conn.close()


def list_sold_watch() -> list[dict]:
    """获取已平仓持仓及实时价格对比。"""
    from app.services.stock_service import get_realtime_price
    raw = list_holdings(status="sold")
    items = []
    for h in raw.items:
        try:
            realtime = get_realtime_price(h.code)
        except Exception:
            realtime = h.current_price
        sell_price = h.sell_price or h.current_price
        diff = round(realtime - sell_price, 2)
        diff_pct = round((realtime - sell_price) / sell_price * 100, 2) if sell_price else 0
        items.append({
            "code": h.code,
            "name": h.name,
            "sell_price": sell_price,
            "sell_date": h.updated_at[:10] if h.updated_at else h.buy_date,
            "quantity": h.quantity,
            "current_price": round(realtime, 2),
            "diff": diff,
            "diff_pct": diff_pct,
            "status": "up" if diff > 0 else ("down" if diff < 0 else "flat"),
        })
    return items


def update_current_prices(code: str, price: float) -> None:
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE holdings SET current_price = ?, updated_at = datetime('now', 'localtime') WHERE code = ? AND status IN ('holding', 'pending')",
            (price, code),
        )
        conn.commit()
    finally:
        conn.close()


def refresh_all_prices() -> int:
    """Refresh current_price for all holdings from Tencent real-time API."""
    from app.services.stock_service import get_realtime_price
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT DISTINCT code FROM holdings WHERE status IN ('holding', 'pending')"
        ).fetchall()
        codes = [r["code"] for r in rows]
        updated = 0
        for code in codes:
            try:
                price = get_realtime_price(code)
                conn.execute(
                    "UPDATE holdings SET current_price = ?, updated_at = datetime('now', 'localtime') WHERE code = ? AND status = 'holding'",
                    (price, code),
                )
                updated += 1
            except Exception:
                continue
        conn.commit()
        return updated
    finally:
        conn.close()


def delete_holding(holding_id: int) -> None:
    """撤销建仓：删除持仓记录及关联的买入交易（仅当无卖出交易时允许）。"""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM holdings WHERE id = ?", (holding_id,)).fetchone()
        if not row:
            raise ValueError(f"持仓 {holding_id} 不存在")

        # Only allow deletion if no sell trades exist
        sell_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM trades WHERE holding_id = ? AND trade_type = 'sell'",
            (holding_id,),
        ).fetchone()["cnt"]
        if sell_count > 0:
            raise ValueError("该持仓已有卖出记录，无法撤销")

        conn.execute("DELETE FROM trades WHERE holding_id = ?", (holding_id,))
        conn.execute("DELETE FROM holdings WHERE id = ?", (holding_id,))
        conn.commit()
    finally:
        conn.close()


# ─── 交易记录 ───

def list_trades(
    limit: int = 50,
    trade_type: Optional[str] = None,
    sort: str = "desc",
    code: Optional[str] = None,
) -> list[TradeRecord]:
    ensure_tables()
    conn = get_connection()
    try:
        conditions = []
        params = []
        if trade_type:
            conditions.append("trade_type = ?")
            params.append(trade_type)
        if code:
            conditions.append("code = ?")
            params.append(code)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        order = "DESC" if sort == "desc" else "ASC"
        rows = conn.execute(
            f"SELECT * FROM trades {where} ORDER BY trade_date {order}, created_at {order} LIMIT ?",
            (*params, limit),
        ).fetchall()
        return [_row_to_trade(r) for r in rows]
    finally:
        conn.close()


def get_trade_stats() -> dict:
    ensure_tables()
    conn = get_connection()
    try:
        sells = conn.execute(
            "SELECT COUNT(*) as cnt, COALESCE(SUM(pnl), 0) as total_pnl, "
            "COALESCE(AVG(pnl_pct), 0) as avg_pnl_pct, "
            "COALESCE(MAX(pnl_pct), 0) as max_pnl_pct, "
            "COALESCE(MIN(pnl_pct), 0) as min_pnl_pct "
            "FROM trades WHERE trade_type = 'sell'"
        ).fetchone()

        win_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM trades WHERE trade_type = 'sell' AND pnl > 0"
        ).fetchone()["cnt"]

        total_sells = sells["cnt"]

        # Max drawdown: worst pnl_pct among all sell trades
        max_dd = conn.execute(
            "SELECT COALESCE(MIN(pnl_pct), 0) as dd FROM trades WHERE trade_type = 'sell'"
        ).fetchone()["dd"]

        # Average holding days: for each sold holding, days between buy and sell
        avg_days = conn.execute(
            """SELECT COALESCE(AVG(days), 0) as avg_days FROM (
                SELECT julianday(s.trade_date) - julianday(h.buy_date) as days
                FROM trades s
                JOIN holdings h ON s.holding_id = h.id
                WHERE s.trade_type = 'sell' AND h.status = 'sold'
            )""",
        ).fetchone()["avg_days"]

        return {
            "total_trades": total_sells,
            "win_count": win_count,
            "loss_count": total_sells - win_count,
            "win_rate": round(win_count / total_sells * 100, 1) if total_sells else 0,
            "total_pnl": round(sells["total_pnl"], 2),
            "avg_return": round(sells["avg_pnl_pct"], 2),
            "max_return": round(sells["max_pnl_pct"], 2),
            "min_return": round(sells["min_pnl_pct"], 2),
            "max_drawdown": round(max_dd, 2),
            "avg_holding_days": round(avg_days, 1),
        }
    finally:
        conn.close()


def get_monthly_pnl() -> list[MonthlyPnL]:
    ensure_tables()
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT strftime('%Y-%m', trade_date) as month,
                      COUNT(*) as trade_count,
                      COALESCE(SUM(pnl), 0) as total_pnl,
                      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as win_count
               FROM trades WHERE trade_type = 'sell'
               GROUP BY month ORDER BY month ASC""",
        ).fetchall()
        return [
            MonthlyPnL(
                month=r["month"],
                trade_count=r["trade_count"],
                total_pnl=round(r["total_pnl"], 2),
                win_count=r["win_count"],
            )
            for r in rows
        ]
    finally:
        conn.close()


# ─── 持仓建议 ───


def get_holdings_advice() -> list[dict]:
    """
    自动评估持仓：
    1. 实时拉 K 线更新价格
    2. 查 daily_reviews 是否有今日 LLM 分析
    3. 没有则运行 LLM 分析并缓存
    4. 返回综合建议（LLM + 规则兜底）
    """
    from app.services.indicator_service import get_indicator_snapshot
    from app.services.news_service import build_news_summary, get_stock_news_bundle
    from app.services.stock_service import get_kline

    today = date.today().isoformat()

    # 1. 刷新价格
    raw = list_holdings(status="holding")
    for h in raw.items:
        try:
            kline = get_kline(h.code, days=5)
            if not kline.empty:
                update_current_prices(h.code, float(kline.iloc[-1]["close"]))
        except Exception:
            pass

    # 2. 重新读取（含更新后的价格）
    holdings = list_holdings(status="holding")
    advice_list: list[dict] = []

    for h in holdings.items:
        days = h.days_held or 0
        pnl = h.pnl_pct or 0

        # 查询今日 LLM review（2 小时内有效）
        llm_action: Optional[str] = None
        llm_score: Optional[int] = None
        llm_reason: Optional[str] = None
        llm_suggested_sell_price: Optional[float] = None
        HOLDING_ACTION_MAP = {
            "买入": "考虑加仓",
            "观望": "继续持有",
            "卖出": "建议卖出",
            "持有": "继续持有",
            "加仓": "考虑加仓",
            "减仓": "建议减仓",
        }
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT action, score, reason, created_at, suggested_sell_price FROM daily_reviews WHERE holding_id = ? AND review_date = ? ORDER BY created_at DESC LIMIT 1",
                (h.id, today),
            ).fetchone()
            if row:
                last_time = row["created_at"]
                if last_time:
                    elapsed = (datetime.now() - datetime.fromisoformat(last_time)).total_seconds()
                    if elapsed < 7200:  # 2 小时内有效
                        llm_action = HOLDING_ACTION_MAP.get(row["action"], row["action"])
                        llm_score = row["score"]
                        llm_reason = row["reason"]
                        llm_suggested_sell_price = row["suggested_sell_price"]
        finally:
            conn.close()

        # 3. 如果没有有效的今日 LLM 分析，运行
        if not llm_action:
            try:
                indicators = get_indicator_snapshot(h.code, days=80, name=h.name)
                if indicators:
                    from app.services.ai_service import analyze_holding
                    news_bundle = get_stock_news_bundle(h.code, h.name)
                    news_summary = build_news_summary(news_bundle)
                    result = analyze_holding(
                        indicators,
                        news_summary=news_summary,
                        buy_price=h.buy_price,
                        current_price=h.current_price,
                        pnl_pct=pnl,
                        holding_days=days,
                        stop_loss=h.stop_loss or 0,
                        take_profit=h.take_profit or 0,
                    )
                    llm_action = HOLDING_ACTION_MAP.get(result.action, result.action)
                    llm_score = result.score
                    llm_reason = result.reason[:200]
                    llm_suggested_sell_price = result.suggested_sell_price

                    # 存入 daily_reviews
                    conn2 = get_connection()
                    try:
                        conn2.execute(
                            """INSERT INTO daily_reviews
                               (holding_id, code, review_date, action, score, stars, reason, current_price, pnl_pct, token_usage,
                                suggested_sell_price)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (h.id, h.code, today, llm_action, llm_score, result.stars,
                             llm_reason, h.current_price, pnl, json.dumps({}),
                             llm_suggested_sell_price),
                        )
                        conn2.commit()
                    finally:
                        conn2.close()
            except Exception:
                pass

        # 4. 规则兜底 — 基于当前价格和盈亏动态计算建议字段
        def _rule_based_advice(current_price: float, buy_price: float, stop_loss: float,
                               take_profit: float, pnl_pct: float, days_held: int):
            sp = None
            close = current_price
            if stop_loss > 0 and close <= stop_loss:
                act, sev, rea = "建议止损", "danger", f"当前价 ¥{close:.2f} 已触及止损线 ¥{stop_loss:.2f}"
                sp = close
            elif take_profit > 0 and close >= take_profit:
                act, sev, rea = "考虑止盈", "success", f"当前价 ¥{close:.2f} 已达止盈目标 ¥{take_profit:.2f}"
                sp = take_profit
            elif pnl_pct < -15:
                act, sev, rea = "建议止损", "danger", f"亏损 {pnl_pct:.1f}%，超过 15% 止损线"
                sp = close
            elif pnl_pct < -5:
                act, sev, rea = "注意风险", "warning", f"浮亏 {pnl_pct:.1f}%，建议密切关注，可考虑设置止损"
            elif pnl_pct > 25:
                act, sev, rea = "考虑止盈", "success", f"盈利 {pnl_pct:.1f}%，超过 25% 收益目标"
                sp = close
            elif pnl_pct > 15:
                act, sev, rea = "考虑止盈", "info", f"盈利 {pnl_pct:.1f}%，建议分批止盈锁定利润"
            elif days_held > 60:
                act, sev, rea = "建议评估", "info", f"已持有 {days_held} 天，建议重新评估是否继续持有"
            elif days_held > 30:
                act, sev, rea = "继续持有", "default", f"已持有 {days_held} 天，收益 {pnl_pct:+.1f}%，建议按计划持有"
            else:
                act, sev, rea = "继续持有", "default", f"收益 {pnl_pct:+.1f}%，建议继续持有观察"
            return act, sev, rea, sp

        rule_act, rule_sev, rule_reason, rule_sell_price = _rule_based_advice(
            h.current_price, h.buy_price, h.stop_loss or 0, h.take_profit or 0, pnl, days,
        )

        if llm_action:
            rule_action = llm_action
            rule_severity = "default"
            rule_reason = llm_reason or ""
            suggested_sell_price = llm_suggested_sell_price or rule_sell_price
        else:
            rule_action = rule_act
            rule_severity = rule_sev
            rule_reason = rule_reason
            suggested_sell_price = rule_sell_price

        advice_list.append({
            "holding_id": h.id,
            "code": h.code,
            "name": h.name,
            "action": rule_action,
            "severity": rule_severity,
            "reason": rule_reason,
            "days_held": days,
            "pnl_pct": round(pnl, 2),
            "pnl_amount": round(h.pnl_amount or 0, 2),
            "market_value": round(h.market_value or 0, 2),
            "buy_price": round(h.buy_price, 2),
            "current_price": round(h.current_price, 2),
            "llm_analyzed": llm_action is not None,
            "suggested_sell_price": round(suggested_sell_price, 2) if suggested_sell_price else None,
        })
    return advice_list


# ─── 辅助函数 ───

def _row_to_holding(row) -> HoldingItem:
    d = dict(row)
    cost = d["buy_price"] * d["quantity"]
    mv = d["current_price"] * d["quantity"]
    pnl_amount = mv - cost
    pnl_pct = (d["current_price"] - d["buy_price"]) / d["buy_price"] * 100 if d["buy_price"] else 0

    # Calculate days held
    try:
        buy = datetime.strptime(d["buy_date"], "%Y-%m-%d")
        days_held = (datetime.now() - buy).days
    except (ValueError, TypeError):
        days_held = None

    return HoldingItem(
        id=d["id"],
        code=d["code"],
        name=d["name"],
        buy_date=d["buy_date"],
        buy_price=d["buy_price"],
        quantity=d["quantity"],
        current_price=d["current_price"],
        stop_loss=d["stop_loss"],
        take_profit=d["take_profit"],
        ai_score_at_buy=d["ai_score_at_buy"],
        buy_reason=d["buy_reason"],
        status=d["status"],
        sell_price=d.get("sell_price", 0.0),
        pnl_pct=round(pnl_pct, 2),
        pnl_amount=round(pnl_amount, 2),
        market_value=round(mv, 2),
        days_held=days_held,
        created_at=d["created_at"],
        updated_at=d["updated_at"],
    )


def _row_to_trade(row) -> TradeRecord:
    d = dict(row)
    return TradeRecord(
        id=d["id"],
        holding_id=d["holding_id"],
        code=d["code"],
        name=d["name"],
        trade_date=d["trade_date"],
        trade_type=d["trade_type"],
        price=d["price"],
        quantity=d["quantity"],
        reason=d["reason"],
        pnl=d["pnl"],
        pnl_pct=d["pnl_pct"],
        created_at=d["created_at"],
    )
