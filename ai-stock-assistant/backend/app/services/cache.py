"""简单 TTL 内存缓存"""
from __future__ import annotations

import time
from typing import Any, Callable, Optional


class TTLCache:
    """带过期时间的键值缓存。线程安全由 GIL 保证。"""

    def __init__(self, default_ttl: float = 300):
        self._default_ttl = default_ttl
        self._data: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Optional[Any]:
        now = time.time()
        entry = self._data.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if now > expires_at:
            del self._data[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        expires_at = time.time() + (ttl if ttl is not None else self._default_ttl)
        self._data[key] = (expires_at, value)

    def clear(self) -> None:
        self._data.clear()

    def memoize(self, ttl: Optional[float] = None) -> Callable:
        """装饰器：缓存函数返回值。"""
        def decorator(fn: Callable) -> Callable:
            def wrapper(*args, **kwargs):
                key = f"{fn.__name__}:{args}:{kwargs}"
                cached = self.get(key)
                if cached is not None:
                    return cached
                result = fn(*args, **kwargs)
                self.set(key, result, ttl=ttl)
                return result
            return wrapper
        return decorator
