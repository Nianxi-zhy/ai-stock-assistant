from __future__ import annotations

import argparse
import json
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError, as_completed
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from time import monotonic
from typing import Optional
from uuid import uuid4

import app.config as cfg
from app.db import get_connection
from app.services.indicator_service import detect_market_phase
from app.services.fundamental_service import get_fundamental_snapshot
from app.agents import (
    AgentResult,
    run_decision_agent,
    run_news_agent,
    run_risk_agent,
    run_technical_agent,
)
from app.agents.orchestrator import run_agent_pipeline
from app.schemas.stock import CandidateFailure, AgentDetail, RecommendationItem, RecommendationReport, RuleCandidate
from app.schemas.usage import TokenUsage
from app.services.filter_service import get_price_mode_label
from app.services.indicator_service import build_indicator_explanation
from app.services.news_service import build_news_summary, clear_news_cache, get_stock_news_bundle
from app.services.rule_engine import screen_candidates
from app.services.usage_service import build_token_usage, format_usage_report

logger = logging.getLogger(__name__)


def _empty_usage() -> TokenUsage:
    return build_token_usage(prompt_tokens=0, completion_tokens=0, model=cfg.OPENAI_MODEL)


def persist_recommendation_report(report: RecommendationReport) -> None:
    """把推荐报告落库（recommendation_run + recommendation 两张表），供 API 与自动调度共用。"""
    conn = get_connection()
    try:
        usage = report.usage_summary
        conn.execute(
            """INSERT INTO recommendation_run
               (run_id, recommend_date, generated_at, as_of_trade_date, parameters_json,
                budget_json, filter_mode_json, candidate_count, analyzed_count,
                recommendation_count, failed_candidates_json, prompt_tokens,
                completion_tokens, total_tokens, cost_rmb)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                report.run_id, report.date, report.generated_at, report.as_of_trade_date or "",
                json.dumps(report.parameters, ensure_ascii=False),
                json.dumps(report.budget, ensure_ascii=False),
                json.dumps(report.filter_mode, ensure_ascii=False),
                report.candidate_count, report.analyzed_count, report.count,
                json.dumps([item.model_dump() for item in report.failed_candidates], ensure_ascii=False),
                usage.prompt_tokens, usage.completion_tokens, usage.total_tokens, usage.cost_rmb,
            ),
        )
        for item in report.recommendations:
            usage = item.token_usage or TokenUsage()
            conn.execute(
                """INSERT INTO recommendation
                   (run_id, recommend_date, trade_date, code, name, rank, score, stars, action, reason,
                    rule_score, passed_rules_json, failed_rules_json, analysis_status,
                    analysis_warnings_json, news_count, close_price, target_price, stop_loss_price,
                    agent_details_json, prompt_tokens, completion_tokens, total_tokens, cost_rmb)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    report.run_id, report.date, item.trade_date or "", item.code, item.name,
                    item.rank, item.score, item.stars, item.action, item.reason, item.rule_score,
                    json.dumps(item.passed_rules, ensure_ascii=False),
                    json.dumps(item.failed_rules, ensure_ascii=False), item.analysis_status,
                    json.dumps(item.analysis_warnings, ensure_ascii=False), item.news_count,
                    item.close_price, item.target_price, item.stop_loss_price,
                    json.dumps([detail.model_dump() for detail in item.agent_details], ensure_ascii=False),
                    usage.prompt_tokens, usage.completion_tokens, usage.total_tokens, usage.cost_rmb,
                ),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@dataclass
class CandidateProcessResult:
    candidate: RuleCandidate
    score: int
    action: str
    reason: str
    news_count: int
    token_usage: TokenUsage
    agent_details: list[AgentDetail]
    analysis_warnings: list[str]


def _process_candidate(
    candidate: RuleCandidate,
    deadline: float,
) -> CandidateProcessResult:
    if monotonic() >= deadline:
        raise TimeoutError("recommendation budget exhausted before analysis")

    news_bundle = get_stock_news_bundle(candidate.code, candidate.name)
    news_summary = build_news_summary(news_bundle)

    # Attach fundamental data
    if cfg.FUNDAMENTAL_ENABLED and not candidate.fundamental_summary:
        fund = get_fundamental_snapshot(candidate.code, candidate.name)
        candidate.pe_ratio = fund.get("pe_ratio")
        candidate.pb_ratio = fund.get("pb_ratio")
        candidate.roe = fund.get("roe")
        candidate.fundamental_score = fund.get("score", 0)
        candidate.fundamental_summary = fund.get("summary", "")

    indicators = candidate.indicators.model_copy(update={
        "fundamental_summary": candidate.fundamental_summary,
        "fundamental_score": candidate.fundamental_score,
    })

    if monotonic() >= deadline:
        raise TimeoutError("recommendation budget exhausted before agent pipeline")
    pipeline = run_agent_pipeline(candidate.code, candidate.name, indicators, news_summary)

    agent_details = [
        AgentDetail(
            name="news",
            label="NewsAgent",
            stars=pipeline.news_result.stars,
            signal=pipeline.news_result.signal,
            summary=pipeline.news_result.summary,
            details=pipeline.news_result.details,
            status=pipeline.news_result.status,
            error=pipeline.news_result.error,
        ),
        AgentDetail(
            name="technical",
            label="TechnicalAgent",
            stars=pipeline.technical_result.stars,
            signal=pipeline.technical_result.signal,
            summary=pipeline.technical_result.summary,
            details=pipeline.technical_result.details,
            status=pipeline.technical_result.status,
            error=pipeline.technical_result.error,
        ),
        AgentDetail(
            name="risk",
            label="RiskAgent",
            stars=pipeline.risk_result.stars,
            signal=pipeline.risk_result.signal,
            summary=pipeline.risk_result.summary,
            details=pipeline.risk_result.details,
            status=pipeline.risk_result.status,
            error=pipeline.risk_result.error,
        ),
        AgentDetail(
            name="fundamental",
            label="FundamentalAgent",
            stars=pipeline.fundamental_result.stars,
            signal=pipeline.fundamental_result.signal,
            summary=pipeline.fundamental_result.summary,
            details=pipeline.fundamental_result.details,
            status=pipeline.fundamental_result.status,
            error=pipeline.fundamental_result.error,
        ),
    ]

    return CandidateProcessResult(
        candidate=candidate,
        score=pipeline.score,
        action=pipeline.action,
        reason=pipeline.reason,
        news_count=news_bundle.count,
        token_usage=pipeline.combined_usage,
        agent_details=agent_details,
        analysis_warnings=pipeline.analysis_warnings,
    )


def _log_candidate_rows(
    candidates: list[RuleCandidate],
    run_id: str,
    recommend_date: str,
    env_status: str = "",
    env_score: int = 0,
) -> None:
    """把规则引擎筛出的全部候选写入 candidate_log（对照组记录，失败不影响主流程）。"""
    try:
        conn = get_connection()
        try:
            for candidate in candidates:
                conn.execute(
                    """INSERT OR REPLACE INTO candidate_log
                       (run_id, recommend_date, code, name, rule_score,
                        passed_rules_json, failed_rules_json, status, env_status, env_score)
                       VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?)""",
                    (run_id, recommend_date, candidate.code, candidate.name, candidate.rule_score,
                     json.dumps(candidate.passed_rules, ensure_ascii=False),
                     json.dumps(candidate.failed_rules, ensure_ascii=False),
                     env_status, env_score),
                )
            conn.commit()
        except Exception as e:
            logger.warning("写入候选日志失败: %s", e)
            conn.rollback()
        finally:
            conn.close()
    except Exception as e:
        logger.warning("候选日志记录异常: %s", e)
        pass


def _update_analyzed_candidate_rows(
    analyzed: list[CandidateProcessResult],
    run_id: str,
) -> None:
    """把 LLM 分析结果回填到 candidate_log（失败不影响主流程）。"""
    try:
        conn = get_connection()
        try:
            for result in analyzed:
                action = result.action or ""
                status = "llm_buy" if action == "买入" else "llm_rejected"
                conn.execute(
                    """UPDATE candidate_log
                       SET llm_analyzed = 1, llm_score = ?, llm_action = ?,
                           llm_reason = ?, status = ?
                       WHERE run_id = ? AND code = ?""",
                    (result.score * 10, action, result.reason, status, run_id, result.candidate.code),
                )
            conn.commit()
        except Exception as e:
            logger.warning("回填候选分析结果失败: %s", e)
            conn.rollback()
        finally:
            conn.close()
    except Exception as e:
        logger.warning("回填候选分析结果异常: %s", e)
        pass


def build_recommendations(
    candidate_limit: int = 10,
    top_n: int = 5,
    min_rule_score: int = 60,
    env_status: Optional[str] = None,
    env_score: Optional[int] = None,
) -> RecommendationReport:
    """批量推荐：规则预筛选后，多 Agent 并行分析候选股。"""
    if candidate_limit <= 0 or top_n <= 0:
        raise ValueError("candidate_limit and top_n must be greater than 0")

    candidate_limit = min(candidate_limit, cfg.RECOMMENDATION_MAX_CANDIDATES)
    top_n = min(top_n, candidate_limit)
    run_id = uuid4().hex
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    started_at = monotonic()
    deadline = started_at + cfg.RECOMMENDATION_RUN_TIMEOUT_SECONDS
    parameters = {
        "candidate_limit": candidate_limit,
        "top_n": top_n,
        "min_rule_score": min_rule_score,
    }
    budget = {
        "max_candidates": cfg.RECOMMENDATION_MAX_CANDIDATES,
        "max_prescreen": cfg.RECOMMENDATION_MAX_PRESCREEN,
        "max_workers": cfg.RECOMMENDATION_MAX_WORKERS,
        "timeout_seconds": cfg.RECOMMENDATION_RUN_TIMEOUT_SECONDS,
    }

    clear_news_cache()
    candidates = screen_candidates(
        max_candidates=candidate_limit,
        min_rule_score=min_rule_score,
        deadline=deadline,
    )
    if not candidates:
        return RecommendationReport(
            date=date.today().isoformat(),
            run_id=run_id,
            generated_at=generated_at,
            parameters=parameters,
            budget={**budget, "elapsed_seconds": round(monotonic() - started_at, 2)},
            filter_mode={
                "low_price_mode": cfg.LOW_PRICE_MODE,
                "max_stock_price": cfg.MAX_STOCK_PRICE,
            },
            candidate_count=0,
            analyzed_count=0,
            count=0,
            usage_summary=_empty_usage(),
            recommendations=[],
        )

    # 对照组记录：规则筛出的所有候选先落库（含未被 LLM 分析/被否决的）
    _log_candidate_rows(
        candidates,
        run_id,
        date.today().isoformat(),
        env_status or "",
        env_score or 0,
    )

    analyzed: list[CandidateProcessResult] = []
    failed_candidates: list[CandidateFailure] = []
    usage_summary = _empty_usage()
    # 所有 agent 共享一个 4 线程的池，避免 3×4=12 线程嵌套导致 LLM 限流
    pool_size = min(len(candidates), 4)

    pool = ThreadPoolExecutor(max_workers=pool_size)
    futures = {pool.submit(_process_candidate, candidate, deadline): candidate for candidate in candidates}
    timed_out = False
    try:
        timeout = max(0, deadline - monotonic())
        for future in as_completed(futures, timeout=timeout):
            candidate = futures[future]
            try:
                result = future.result()
            except Exception as exc:
                failed_candidates.append(CandidateFailure(
                    code=candidate.code,
                    name=candidate.name,
                    stage="candidate_pipeline",
                    error=str(exc) or type(exc).__name__,
                ))
                continue
            analyzed.append(result)
            usage_summary = usage_summary.merge(result.token_usage)
    except FuturesTimeoutError:
        timed_out = True
    finally:
        if timed_out:
            for future, candidate in futures.items():
                if not future.done():
                    future.cancel()
                    failed_candidates.append(CandidateFailure(
                        code=candidate.code,
                        name=candidate.name,
                        stage="budget",
                        error="recommendation run timed out",
                    ))
            pool.shutdown(wait=False, cancel_futures=True)
        else:
            pool.shutdown(wait=True)

    # 回填 LLM 分析结果（含未进最终推荐的）
    _update_analyzed_candidate_rows(analyzed, run_id)

    analyzed.sort(key=lambda result: (result.score, result.candidate.rule_score), reverse=True)

    recommendations = []
    for index, result in enumerate(analyzed[:top_n]):
        candidate = result.candidate
        score = result.score
        stars = max(1, min(5, round(score / 2)))
        price = candidate.close_price or 0
        # ATR-based target/stop prices
        atr = candidate.indicators.atr or 0
        atr_pct = candidate.indicators.atr_pct or 3
        score_ratio = score / 10
        # 评分越高，止盈乘数越大，止损乘数越小（更紧的止损）
        target_mult = 1.0 + atr_pct / 100 * (1.5 + score_ratio * 0.5)  # 1.5~2倍ATR止盈
        stop_mult = 1.0 - atr_pct / 100 * (1.5 - score_ratio * 0.3)    # 0.9~1.5倍ATR止损
        recommendations.append(RecommendationItem(
            rank=index + 1,
            code=candidate.code,
            name=candidate.name,
            close_price=price,
            passes_price_filter=None,
            score=score * 10,
            stars=stars,
            action=result.action,
            reason=result.reason,
            token_usage=result.token_usage,
            rule_score=candidate.rule_score,
            passed_rules=candidate.passed_rules,
            failed_rules=candidate.failed_rules,
            news_count=result.news_count,
            agent_details=result.agent_details,
            target_price=round(price * target_mult, 2),
            stop_loss_price=round(price * stop_mult, 2),
            trade_date=candidate.trade_date,
            analysis_status="partial" if result.analysis_warnings else "complete",
            analysis_warnings=result.analysis_warnings,
        ))

    return RecommendationReport(
        date=date.today().isoformat(),
        run_id=run_id,
        generated_at=generated_at,
        as_of_trade_date=min(candidate.trade_date for candidate in candidates),
        parameters=parameters,
        budget={**budget, "elapsed_seconds": round(monotonic() - started_at, 2)},
        filter_mode={
            "low_price_mode": cfg.LOW_PRICE_MODE,
            "max_stock_price": cfg.MAX_STOCK_PRICE,
        },
        candidate_count=len(candidates),
        analyzed_count=len(analyzed),
        count=len(recommendations),
        usage_summary=usage_summary,
        recommendations=recommendations,
        failed_candidates=failed_candidates,
    )


def save_report(report: RecommendationReport, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"recommendations_{report.date}.json"
    output_path.write_text(
        json.dumps(report.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Day 2 batch stock recommendations.")
    parser.add_argument("--candidate-limit", type=int, default=10, help="规则筛选后最多分析几只")
    parser.add_argument("--top-n", type=int, default=5, help="最终推荐数量")
    parser.add_argument("--min-rule-score", type=int, default=60, help="规则评分下限")
    parser.add_argument(
        "--output-dir",
        type=str,
        default="output",
        help="JSON 报告输出目录",
    )
    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("Day 2/3: 预筛选 + 新闻 + AI 推荐")
    logger.info("=" * 60)
    logger.info(get_price_mode_label())
    logger.info(
        f"参数: candidate_limit={args.candidate_limit}, "
        f"top_n={args.top_n}, min_rule_score={args.min_rule_score}"
    )

    report = build_recommendations(
        candidate_limit=args.candidate_limit,
        top_n=args.top_n,
        min_rule_score=args.min_rule_score,
    )

    output_path = save_report(report, Path(args.output_dir))

    logger.info("\n" + "=" * 60)
    logger.info("筛选与统计")
    logger.info("=" * 60)
    logger.info(f"规则候选: {report.candidate_count} 只")
    logger.info(f"AI 已分析: {report.analyzed_count} 只")
    logger.info(f"最终推荐: {report.count} 只")
    logger.info(format_usage_report(report.usage_summary))

    logger.info("\n" + "=" * 60)
    logger.info("Top 推荐")
    logger.info("=" * 60)
    if not report.recommendations:
        logger.info("暂无符合条件的推荐，可尝试降低 --min-rule-score 或扩大 --candidate-limit")
    for item in report.recommendations:
        logger.info(
            f"#{item.rank} {item.name}({item.code}) "
            f"价={item.close_price:.2f} 规则={item.rule_score} AI={item.score} "
            f"新闻={item.news_count}条 星级={item.stars}/5 建议={item.action}"
        )
        logger.info(f"   理由: {item.reason}")

    logger.info("\n" + "=" * 60)
    logger.info("JSON 报告")
    logger.info("=" * 60)
    logger.info(output_path.resolve())


if __name__ == "__main__":
    main()
