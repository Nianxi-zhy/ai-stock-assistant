"""测试 Server酱 通知"""
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

key = os.getenv("SERVER_CHAN_KEY", "")
if not key:
    print("错误: 请设置 SERVER_CHAN_KEY 环境变量或填写 backend/.env")
    raise SystemExit(1)

url = f"https://sctapi.ftqq.com/{key}.send"

resp = requests.post(url, data={
    "title": "AI Stock Assistant 测试",
    "desp": "## 测试消息\n\n如果你收到这条消息，说明 Server酱 配置成功！\n\n---\n\n*数据仅供参考，不构成投资建议*",
}, timeout=15)

print(f"状态码: {resp.status_code}")
print(f"返回值: {resp.text}")
