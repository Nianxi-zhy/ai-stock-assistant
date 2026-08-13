"""给 Agent 使用的 LLM 调用工具"""
from __future__ import annotations

import json
import re
from typing import Optional

from openai import OpenAI

from app.config import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
from app.db import insert_token_log
from app.schemas.usage import TokenUsage
from app.services.usage_service import build_token_usage


def _extract_json(text: str) -> dict:
    text = text.strip()
    try:
        result = json.loads(text)
        # 如果 AI 返回的是 list（如 [...objects]），取第一个元素
        if isinstance(result, list):
            result = result[0] if result else {}
        if not isinstance(result, dict):
            raise ValueError(f"JSON 不是对象类型: {type(result).__name__}")
        return result
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ValueError(f"AI 返回内容不是合法 JSON: {text[:200]}")
        return json.loads(match.group())


def _extract_cache_hit(usage) -> int:
    """从 API 响应中提取缓存命中 token 数（兼容 DeepSeek 与 OpenAI 格式）。"""
    try:
        legacy = getattr(usage, "prompt_cache_hit_tokens", None)
        if legacy:
            return int(legacy)
        details = getattr(usage, "prompt_tokens_details", None)
        if details is not None:
            return getattr(details, "cached_tokens", 0) or 0
    except Exception:
        pass
    return 0


def _extract_usage(response) -> TokenUsage:
    usage = getattr(response, "usage", None)
    pt = getattr(usage, "prompt_tokens", 0) or 0
    ct = getattr(usage, "completion_tokens", 0) or 0
    cache_hit = _extract_cache_hit(usage)

    tu = build_token_usage(prompt_tokens=pt, completion_tokens=ct, model=OPENAI_MODEL, cache_hit_tokens=cache_hit)
    insert_token_log(model=OPENAI_MODEL, prompt_tokens=pt, completion_tokens=ct, cache_hit_tokens=cache_hit)
    return tu


def call_llm(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.3,
    max_tokens: int = 1024,
    return_raw: bool = False,
) -> tuple[dict, TokenUsage] | tuple[dict, TokenUsage, str]:
    """调用 LLM 并返回 (解析后的 JSON, Token用量)。

    return_raw=True 时返回 (JSON, 用量, 原始文本)。
    """
    client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL, timeout=60)
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    raw = response.choices[0].message.content or ""
    parsed = _extract_json(raw)
    usage = _extract_usage(response)
    if return_raw:
        return parsed, usage, raw
    return parsed, usage
