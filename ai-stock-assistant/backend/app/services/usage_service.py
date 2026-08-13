from __future__ import annotations

from typing import Optional

from app.config import (
    LLM_INPUT_CACHE_HIT_PRICE_PER_1M,
    LLM_INPUT_PRICE_PER_1M,
    LLM_OUTPUT_PRICE_PER_1M,
    OPENAI_MODEL,
)
from app.schemas.usage import TokenUsage


def calculate_cost_rmb(
    prompt_tokens: int,
    completion_tokens: int,
    model: Optional[str] = None,
    cache_hit_tokens: int = 0,
) -> float:
    """按每百万 token 单价（人民币）估算调用成本。
    DeepSeek 区分缓存命中/未命中输入价格。
    """
    cache_miss_tokens = max(0, prompt_tokens - cache_hit_tokens)
    input_cost = (
        cache_hit_tokens / 1_000_000 * LLM_INPUT_CACHE_HIT_PRICE_PER_1M
        + cache_miss_tokens / 1_000_000 * LLM_INPUT_PRICE_PER_1M
    )
    output_cost = completion_tokens / 1_000_000 * LLM_OUTPUT_PRICE_PER_1M
    return round(input_cost + output_cost, 6)


def build_token_usage(
    prompt_tokens: int,
    completion_tokens: int,
    model: Optional[str] = None,
    cache_hit_tokens: int = 0,
) -> TokenUsage:
    model_name = model or OPENAI_MODEL
    total_tokens = prompt_tokens + completion_tokens
    return TokenUsage(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        cost_rmb=calculate_cost_rmb(prompt_tokens, completion_tokens, model_name, cache_hit_tokens),
        model=model_name,
    )


def format_usage_report(usage: TokenUsage) -> str:
    return (
        f"模型: {usage.model}\n"
        f"输入 Token: {usage.prompt_tokens}\n"
        f"输出 Token: {usage.completion_tokens}\n"
        f"合计 Token: {usage.total_tokens}\n"
        f"估算费用: {usage.cost_rmb:.4f} 元（人民币）"
    )
