"""rule_engine 纯逻辑单元测试：规则评估、评分、工具函数。

全部使用内存构造的小型 DataFrame 与显式 ctx，不触网、不触 DB。
"""
import math

import pandas as pd
import pytest

from app.services.rule_engine import (
    RuleCheck,
    _evaluate_rules,
    _is_risky_name,
    _latest_number,
    _rule_score,
)

CTX = {
    "ma20_ma60_tol": 0.98,
    "rsi_min": 30,
    "rsi_max": 70,
    "volume_ratio": 1.05,
    "weights": {
        "close above MA20": 20,
        "MA20 above or near MA60": 10,
        "RSI in healthy range": 15,
        "MACD improving": 15,
        "volume above 20-day average": 5,
    },
}


def _make_df(close, ma20, ma60, rsi, macd_hist, prev_macd_hist, last_volume, base_volume=100.0):
    """构造 20 行 K 线：前 19 行相同的基础值，最后一行为待评估值。"""
    rows = {
        "close": [base_volume] * 19 + [close],
        "ma20": [base_volume] * 19 + [ma20],
        "ma60": [base_volume] * 19 + [ma60],
        "rsi": [50.0] * 19 + [rsi],
        "macd_hist": [0.0] * 18 + [prev_macd_hist, macd_hist],
        "volume": [base_volume] * 19 + [last_volume],
    }
    return pd.DataFrame(rows)


def _passed_map(checks):
    return {c.name: c.passed for c in checks}


class TestLatestNumber:
    def test_normal_value(self):
        row = pd.Series({"close": 12.5})
        assert _latest_number(row, "close") == 12.5

    def test_nan_returns_none(self):
        row = pd.Series({"close": float("nan")})
        assert _latest_number(row, "close") is None

    def test_missing_field_returns_none(self):
        row = pd.Series({"close": 1.0})
        assert _latest_number(row, "ma20") is None


class TestIsRiskyName:
    @pytest.mark.parametrize("name", ["ST 药业", "*ST 科技", "某某退市股", "退市博元"])
    def test_risky(self, name):
        assert _is_risky_name(name) is True

    @pytest.mark.parametrize("name", ["贵州茅台", "宁德时代"])
    def test_normal(self, name):
        assert _is_risky_name(name) is False


class TestEvaluateRules:
    def test_all_pass(self):
        df = _make_df(close=11, ma20=10, ma60=10, rsi=50,
                      macd_hist=0.5, prev_macd_hist=-0.1, last_volume=200)
        result = _passed_map(_evaluate_rules(df, "测试股", CTX))
        assert all(result.values()), result

    def test_all_fail(self):
        df = _make_df(close=9, ma20=9, ma60=10, rsi=80,
                      macd_hist=-0.5, prev_macd_hist=-0.1, last_volume=50)
        result = _passed_map(_evaluate_rules(df, "测试股", CTX))
        assert not any(result.values()), result

    def test_nan_indicators_fail_gracefully(self):
        df = _make_df(close=11, ma20=math.nan, ma60=10, rsi=math.nan,
                      macd_hist=0.5, prev_macd_hist=-0.1, last_volume=200)
        result = _passed_map(_evaluate_rules(df, "测试股", CTX))
        assert result["close above MA20"] is False
        assert result["RSI in healthy range"] is False
        # 其余规则不受影响
        assert result["MACD improving"] is True

    def test_macd_improving_when_hist_rises_but_negative(self):
        # hist 仍为负但在改善（> 前值）也算通过
        df = _make_df(close=9, ma20=9, ma60=10, rsi=80,
                      macd_hist=-0.1, prev_macd_hist=-0.5, last_volume=50)
        result = _passed_map(_evaluate_rules(df, "测试股", CTX))
        assert result["MACD improving"] is True

    def test_volume_uses_20day_mean(self):
        # 最后一根量=105，20 日均量含自身 -> (19*100+105)/20=100.25，阈值 1.05 -> 不通过
        df = _make_df(close=9, ma20=9, ma60=10, rsi=80,
                      macd_hist=-0.5, prev_macd_hist=-0.1, last_volume=105)
        result = _passed_map(_evaluate_rules(df, "测试股", CTX))
        assert result["volume above 20-day average"] is False


class TestRuleScore:
    def test_weighted_percentage(self):
        checks = [
            RuleCheck("a", True, 20),
            RuleCheck("b", False, 10),
            RuleCheck("c", True, 15),
        ]
        assert _rule_score(checks) == round(35 / 45 * 100)

    def test_all_pass_gives_100(self):
        checks = [RuleCheck("a", True, 20), RuleCheck("b", True, 5)]
        assert _rule_score(checks) == 100

    def test_zero_total_weight_gives_0(self):
        checks = [RuleCheck("a", True, 0), RuleCheck("b", True, 0)]
        assert _rule_score(checks) == 0
