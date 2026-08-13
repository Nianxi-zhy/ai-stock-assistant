"""数据源诊断脚本 - 检测各数据源是否可用"""
import json
import time
import sys

try:
    import requests
    print("[OK] requests 库可用")
except ImportError:
    print("[FAIL] requests 库未安装")

print("\n" + "=" * 60)
print("1. 新浪财经行情 API（全市场数据源）")
print("=" * 60)
try:
    url = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData"
    params = {"page": 1, "num": 5, "sort": "symbol", "asc": 1, "node": "hs_a", "_s_r_a": "init"}
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://finance.sina.com.cn/",
    }
    t0 = time.time()
    resp = requests.get(url, params=params, timeout=15, headers=headers)
    cost = time.time() - t0
    print(f"状态码: {resp.status_code} | 耗时: {cost:.1f}s")
    text = resp.text.strip()
    if text and text != "null":
        items = json.loads(text)
        print(f"返回条数: {len(items)}")
        if items:
            print(f"第一条: {items[0]}")
    else:
        print("[❌] API 返回空数据或 null")
except Exception as e:
    print(f"[❌] 请求失败: {type(e).__name__}: {e}")


print("\n" + "=" * 60)
print("2. 东方财富 K 线 API（个股数据源）")
print("=" * 60)
try:
    url = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
    params = {
        "secid": "1.600519",
        "ut": "fa5fd1943c7b386f172d6893dbfd32bb",
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56,f57",
        "klt": "101", "fqt": "1", "end": "20500101", "lmt": "5",
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://quote.eastmoney.com/",
    }
    t0 = time.time()
    resp = requests.get(url, params=params, timeout=15, headers=headers)
    cost = time.time() - t0
    print(f"状态码: {resp.status_code} | 耗时: {cost:.1f}s")
    data = resp.json()
    klines = data.get("data", {}).get("klines")
    if klines:
        print(f"K线条数: {len(klines)}")
        print(f"最新一条: {klines[0]}")
    else:
        print(f"[❌] 未获取到 K 线数据: {data}")
except Exception as e:
    print(f"[❌] 请求失败: {type(e).__name__}: {e}")


print("\n" + "=" * 60)
print("3. DeepSeek API（AI 分析）")
print("=" * 60)
try:
    from dotenv import load_dotenv
    from pathlib import Path
    import os
    BASE_DIR = Path(__file__).resolve().parent / "app"
    load_dotenv(BASE_DIR / ".env")

    api_key = os.getenv("OPENAI_API_KEY", "")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.deepseek.com/v1")
    model = os.getenv("OPENAI_MODEL", "deepseek-chat")

    if not api_key:
        print("[⚠️] 未配置 OPENAI_API_KEY")
        print(f"    API Base: {base_url}")
        print(f"    Model: {model}")
    else:
        print(f"    API Base: {base_url}")
        print(f"    Model: {model}")
        print(f"    Key: {api_key[:8]}...{api_key[-4:]}")

        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url=base_url)
        t0 = time.time()
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "请回复ok"}],
            temperature=0.3,
            max_tokens=20,
        )
        cost = time.time() - t0
        content = response.choices[0].message.content
        print(f"耗时: {cost:.1f}s")
        print(f"回复: {content}")
except ImportError:
    print("[⚠️] openai 库未安装，跳过")
except Exception as e:
    print(f"[❌] 请求失败: {type(e).__name__}: {e}")


print("\n" + "=" * 60)
print("4. 东方财富新闻 API（AkShare）")
print("=" * 60)
try:
    import akshare as ak
    t0 = time.time()
    raw = ak.stock_news_em(symbol="600519")
    cost = time.time() - t0
    print(f"耗时: {cost:.1f}s")
    if raw is not None and not raw.empty:
        print(f"新闻条数: {len(raw)}")
        print(f"最新标题: {raw.iloc[0].get('新闻标题', 'N/A')}")
    else:
        print("[❌] AkShare 返回空数据")
except Exception as e:
    print(f"[❌] 请求失败: {type(e).__name__}: {e}")


print("\n" + "=" * 60)
print("5. 财联社电报")
print("=" * 60)
try:
    url = "https://www.cls.cn/nodeapi/telegraphList"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }
    t0 = time.time()
    resp = requests.get(url, timeout=15, headers=headers)
    cost = time.time() - t0
    print(f"状态码: {resp.status_code} | 耗时: {cost:.1f}s")
    data = resp.json()
    if "data" in data and "roll_data" in data["data"]:
        items = data["data"]["roll_data"]
        print(f"电报条数: {len(items)}")
    else:
        print(f"[❌] 返回格式不符")
except Exception as e:
    print(f"[❌] 请求失败: {type(e).__name__}: {e}")

print("\n" + "=" * 60)
print("诊断完成")
print("=" * 60)
