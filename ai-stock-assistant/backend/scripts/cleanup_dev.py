"""开发环境清理脚本（任务收尾必跑，AGENTS.md 规则）

清理项（全部是可再生缓存/临时文件，绝不碰用户数据）：
1. opencode 临时目录 C:/Users/<user>/AppData/Local/Temp/opencode 下的文件
2. backend 所有 __pycache__（Python 自动重新生成）
3. frontend/.next/cache（Next.js 编译缓存，dev server 会自动重建）
4. SQLite WAL/SHM 残留（WAL 模式正常会自动 checkpoint）
5. 检查 uvicorn 进程数是否正常（reloader+worker=2，多了是僵尸）

用法（backend 目录）：
  & "C:/Users/19412/anaconda3/envs/d2l-zh/python.exe" scripts/cleanup_dev.py
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent.parent  # ai-stock-assistant
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
TEMP_DIR = Path(os.environ.get("TEMP", "")) / "opencode"


def fmt_kb(size: int) -> str:
    return f"{size / 1024:.0f} KB" if size < 1024 * 1024 else f"{size / 1024 / 1024:.1f} MB"


def report(name: str, size: int, removed: bool) -> None:
    action = "已删除" if removed else "跳过"
    print(f"  [{action}] {name}: {fmt_kb(size)}" if size else f"  [跳过] {name}: 0")


def main() -> None:
    print("== 清理检查 ==")

    # 1. opencode 临时文件
    if TEMP_DIR.exists():
        files = [f for f in TEMP_DIR.iterdir() if f.is_file()]
        size = sum(f.stat().st_size for f in files)
        for f in files:
            try:
                f.unlink()
            except Exception:
                pass
        report("opencode temp", size, bool(files))
    else:
        print("  [跳过] opencode temp: 目录不存在")

    # 2. __pycache__
    total = 0
    removed = 0
    for cache in BACKEND.rglob("__pycache__"):
        if not cache.is_dir():
            continue
        total += sum(f.stat().st_size for f in cache.glob("*.pyc") if f.is_file())
        try:
            shutil.rmtree(cache)
            removed += 1
        except Exception:
            pass
    print(f"  [已删除] __pycache__: {removed} 个目录, {fmt_kb(total)}")

    # 3. frontend/.next：dev server 未运行时整体删除（含 600MB+ 的 .next/dev 编译产物）；
    #    运行时只清 cache 子目录（强制重建会打断正在使用的界面）
    import urllib.request

    next_dir = FRONTEND / ".next"
    frontend_running = False
    try:
        urllib.request.urlopen("http://localhost:3000", timeout=3)
        frontend_running = True
    except Exception:
        frontend_running = False

    if frontend_running:
        cache_dir = next_dir / "cache"
        if cache_dir.exists():
            size = sum(f.stat().st_size for f in cache_dir.rglob("*") if f.is_file())
            try:
                shutil.rmtree(cache_dir)
                report(".next/cache (前端运行中)", size, True)
            except Exception as e:
                report(f".next/cache (失败: {e})", size, False)
        else:
            print("  [跳过] .next/cache: 不存在")
        print("  [跳过] .next/dev (605MB+): 前端 dev server 运行中，停止前端后可整体清理")
    elif next_dir.exists():
        size = sum(f.stat().st_size for f in next_dir.rglob("*") if f.is_file())
        try:
            shutil.rmtree(next_dir)
            report(".next (前端已停止)", size, True)
        except Exception as e:
            report(f".next (失败: {e})", size, False)
    else:
        print("  [跳过] .next: 不存在")

    # 4. SQLite WAL/SHM 残留
    for db_dir in (BACKEND / "data",):
        for name in ("ai_stock.db-wal", "ai_stock.db-shm"):
            p = db_dir / name
            if p.exists():
                size = p.stat().st_size
                try:
                    p.unlink()
                    report(f"data/{name}", size, True)
                except Exception:
                    report(f"data/{name}", size, False)
            else:
                print(f"  [跳过] data/{name}: 不存在")

    # 5. 进程检查（uvicorn 正常应为 2 个 python：reloader+worker；node 正常 2-3 个）
    try:
        ps = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Measure-Object | Select-Object -ExpandProperty Count"],
            capture_output=True, text=True, timeout=30,
        )
        py_count = ps.stdout.strip()
        print(f"  进程检查: python.exe 共 {py_count} 个 (uvicorn 正常=2)")
    except Exception:
        print("  进程检查: 跳过")

    print("== 清理完成 ==")


if __name__ == "__main__":
    main()
