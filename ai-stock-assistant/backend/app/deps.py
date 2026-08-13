"""FastAPI 公共依赖 — 可选的 API Key 鉴权。

未配置 API_KEY 时全部放行（向后兼容），仅首次请求时 warning 提示。
配置后校验请求头 X-API-Key，使用 hmac.compare_digest 防时序攻击。
"""
from __future__ import annotations

import hmac
import logging

from fastapi import Header, HTTPException, status

from app.config import API_KEY

logger = logging.getLogger(__name__)

_auth_warned = False


async def verify_api_key(x_api_key: str = Header(default="", alias="X-API-Key")) -> None:
    """若 API_KEY 未配置则放行；否则校验 X-API-Key 头，不匹配返回 401。"""
    global _auth_warned
    if not API_KEY:
        if not _auth_warned:
            _auth_warned = True
            logger.warning("API_KEY 未配置，API 鉴权未启用 — 局域网内任何人均可调用写操作/烧钱接口。")
        return
    if not x_api_key or not hmac.compare_digest(x_api_key, API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 API Key",
        )
