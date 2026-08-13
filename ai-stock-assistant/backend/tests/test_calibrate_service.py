"""calibrate_service 纯函数与参数缓存逻辑单元测试。

通过 monkeypatch 替换 _load_all_params 隔离 DB，绝不访问 backend/data/ 真实库。
"""
import math
from unittest.mock import Mock

import pytest

import app.services.calibrate_service as cs


@pytest.fixture(autouse=True)
def isolated_params_cache(monkeypatch):
    """每个测试前后清空参数缓存，并阻断真实 DB 加载。"""
    loader = Mock(return_value={})
    monkeypatch.setattr(cs, "_load_all_params", loader)
    cs.invalidate_params_cache()
    yield loader
    cs.invalidate_params_cache()


class TestLatest:
    def test_normal_value(self):
        assert cs._latest({"close": 12.5}, "close") == 12.5

    def test_missing_and_none(self):
        assert cs._latest({"close": 1.0}, "ma20") is None
        assert cs._latest({"close": None}, "close") is None

    def test_nan_returns_none(self):
        assert cs._latest({"close": float("nan")}, "close") is None
        assert cs._latest({"close": "nan"}, "close") is None

    def test_non_numeric_returns_none(self):
        assert cs._latest({"close": "abc"}, "close") is None

    def test_numeric_string_parsed(self):
        assert cs._latest({"close": "3.25"}, "close") == 3.25
        assert not math.isnan(cs._latest({"close": "3.25"}, "close"))


class TestParam:
    def test_missing_key_returns_default(self, isolated_params_cache):
        assert cs._param("thr.nope", 0.5) == 0.5

    def test_int_default_converts(self, isolated_params_cache):
        isolated_params_cache.return_value = {"thr.rsi_min": (35.7, "")}
        assert cs._param("thr.rsi_min", 30) == 35
        assert isinstance(cs._param("thr.rsi_min", 30), int)

    def test_float_default_converts(self, isolated_params_cache):
        isolated_params_cache.return_value = {"thr.vol": (1.2, "")}
        assert cs._param("thr.vol", 1.05) == 1.2

    def test_bool_default_prefers_value_str(self, isolated_params_cache):
        isolated_params_cache.return_value = {"flag.a": (0, "yes"), "flag.b": (1, "")}
        assert cs._param("flag.a", False) == "yes"
        assert cs._param("flag.b", False) == 1

    def test_none_value_falls_back_to_zero(self, isolated_params_cache):
        isolated_params_cache.return_value = {"k": (None, "")}
        assert cs._param("k", 9) == 0
        assert cs._param("k", 0.5) == 0.0


class TestParamsCache:
    def test_loads_only_once_until_invalidated(self, isolated_params_cache):
        isolated_params_cache.return_value = {"k": (1.0, "")}
        cs._param("k", 0.0)
        cs._param("k", 0.0)
        assert isolated_params_cache.call_count == 1

        cs.invalidate_params_cache()
        cs._param("k", 0.0)
        assert isolated_params_cache.call_count == 2

    def test_load_failure_not_cached_and_returns_default(self, isolated_params_cache):
        isolated_params_cache.side_effect = RuntimeError("db down")
        assert cs._param("k", 7) == 7
        # 失败不缓存：下次会重试
        assert cs._param("k", 7) == 7
        assert isolated_params_cache.call_count == 2


class TestLoadRuleWeights:
    def test_db_weights_override_defaults(self, isolated_params_cache):
        isolated_params_cache.return_value = {
            "weight.close above MA20": (40.0, ""),
        }
        weights = cs.load_rule_weights()
        assert weights["close above MA20"] == 40
        # 其余规则回落到默认值
        for rule in cs.RULE_NAMES:
            assert rule in weights
        assert weights["RSI in healthy range"] == cs.DEFAULT_WEIGHTS["RSI in healthy range"]
