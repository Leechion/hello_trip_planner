"""LLM服务模块"""

import json
import os
from concurrent.futures import ThreadPoolExecutor

from httpx import Client, Timeout

from ..config import normalize_proxy_env

# 确保 NO_PROXY 中的 "[::1]" 已被归一化,否则 httpx 会抛
# InvalidURL: Invalid port: ':1]'，导致所有 LLM 调用失败。
# 这里再次调用是为了覆盖"未经过 app.config 导入"的调用方(脚本/测试)。
normalize_proxy_env()

_llm_instance = None
_pool = ThreadPoolExecutor(max_workers=2)


def _sync_invoke(model: str, api_key: str, base_url: str, messages: list, timeout: int) -> str:
    """在子线程中执行同步 HTTP 请求，避免阻塞 FastAPI 事件循环"""
    with Client(timeout=Timeout(timeout), headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }) as client:
        resp = client.post(f"{base_url}/chat/completions", json={
            "model": model,
            "messages": messages,
            "max_tokens": 4096,
            "temperature": 0.7,
        })
        if resp.status_code != 200:
            raise Exception(f"HTTP {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        choices = data.get("choices", [])
        if not choices:
            raise Exception(f"无 choices: {json.dumps(data, ensure_ascii=False)[:300]}")
        return choices[0]["message"]["content"]


class SimpleLLM:
    """直接 HTTP 调用 LLM，兼容 OpenAI 和 Zhipu"""

    def __init__(self):
        from ..config import get_settings
        s = get_settings()
        self.model = s.llm_model_id or s.openai_model or "gpt-4"
        self.api_key = s.llm_api_key or s.openai_api_key
        self.base_url = (s.llm_base_url or s.openai_base_url).rstrip("/")
        self.is_zhipu = "bigmodel" in self.base_url
        self.timeout = int(os.getenv("LLM_TIMEOUT", "300"))

    def invoke(self, prompt, **kwargs):
        """prompt 可以是 str 或 list[dict]"""
        if isinstance(prompt, str):
            messages = [{"role": "user", "content": prompt}]
        else:
            messages = prompt

        if self.is_zhipu:
            messages = self._fix_zhipu_messages(messages)

        try:
            return _pool.submit(
                _sync_invoke, self.model, self.api_key, self.base_url, messages, self.timeout
            ).result()
        except Exception as e:
            if "LLM调用失败" in str(e):
                raise
            raise Exception(f"LLM调用失败: {str(e)[:200]}")

    @staticmethod
    def _fix_zhipu_messages(msgs: list) -> list:
        """Zhipu API: content 必须是 [{"type":"text","text":"..."}] 格式"""
        fixed = []
        for m in msgs:
            content = m.get("content", "")
            if isinstance(content, str):
                content = [{"type": "text", "text": content}]
            fixed.append({"role": m["role"], "content": content})
        return fixed


def get_llm():
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = SimpleLLM()
        print(f"✅ LLM服务初始化成功")
        print(f"   模型: {_llm_instance.model}")
    return _llm_instance


def reset_llm():
    global _llm_instance
    _llm_instance = None
