"""配置管理模块"""

import os
from pathlib import Path
from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_proxy_env() -> None:
    """归一化 NO_PROXY/no_proxy 中的 IPv6 写法。

    httpx 解析 bypass 列表时会按 "host:port" 切分，
    形如 "[::1]" 的条目会被当作非法端口而抛
    `InvalidURL: Invalid port: ':1]'`，导致所有经 httpx 的请求
    （例如全部 LLM 调用）失败。这里统一转成无边括号的 "::1"。
    """
    for key in ("NO_PROXY", "no_proxy"):
        value = os.environ.get(key)
        if not value:
            continue
        parts = []
        for item in value.split(","):
            item = item.strip()
            if item.startswith("[") and item.endswith("]"):
                item = item[1:-1]
            parts.append(item)
        os.environ[key] = ",".join(parts)


normalize_proxy_env()

class Settings(BaseSettings):
    """应用配置"""

    # 应用基本配置
    app_name: str = "HelloAgents智能旅行助手"
    app_version: str = "1.0.0"
    debug: bool = False

    # 服务器配置
    host: str = "0.0.0.0"
    port: int = 8000

    # CORS配置 - 使用字符串,在代码中分割
    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:3000"

    # 高德地图API配置
    amap_api_key: str = ""

    # AigoHotel 酒店MCP配置（STDIO，包名 aigohotel-mcp）
    aigohotel_mcp_key: str = ""

    # Unsplash API配置
    unsplash_access_key: str = ""
    unsplash_secret_key: str = ""

    # LLM配置 (兼容 LLM_* / OPENAI_* 两套变量名)
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4"
    llm_model_id: str = ""
    llm_api_key: str = ""
    llm_base_url: str = ""

    # JWT 配置
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    # 日志配置
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent.parent / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    def get_cors_origins_list(self) -> List[str]:
        """获取CORS origins列表

        注意:allow_credentials=True 时若返回 "*",Starlette 会回显任意请求方 Origin
        并附 Access-Control-Allow-Credentials: true,等于放行所有站点。
        这里直接拒绝 "*",强制使用显式白名单。
        """
        origins = [origin.strip() for origin in self.cors_origins.split(',') if origin.strip()]
        if "*" in origins:
            raise ValueError(
                "CORS_ORIGINS 不能为 '*'（当前 allow_credentials=True，会放行任意站点）。"
                "请配置显式白名单，例如 http://localhost:3000"
            )
        return origins

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug_value(cls, value):
        """兼容常见的环境值,避免 DEBUG=release 这类配置导致启动失败"""
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug", "dev", "development"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", "prod", "production"}:
                return False
        return value


# 创建全局配置实例
settings = Settings()


def get_settings() -> Settings:
    """获取配置实例"""
    return settings


# 验证必要的配置
def validate_config():
    """验证配置是否完整"""
    errors = []
    warnings = []

    if not settings.amap_api_key:
        errors.append("AMAP_API_KEY未配置")

    if not settings.jwt_secret_key:
        errors.append("JWT_SECRET_KEY未配置,请在.env中设置一个随机密钥")

    # CORS 配置校验:allow_credentials=True 下 "*" 等于放行所有站点
    try:
        settings.get_cors_origins_list()
    except ValueError as e:
        errors.append(str(e))

    # HelloAgentsLLM会自动从LLM_API_KEY读取,不强制要求OPENAI_API_KEY
    llm_api_key = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not llm_api_key:
        warnings.append("LLM_API_KEY或OPENAI_API_KEY未配置,LLM功能可能无法使用")

    if errors:
        error_msg = "配置错误:\n" + "\n".join(f"  - {e}" for e in errors)
        raise ValueError(error_msg)

    if warnings:
        print("\n⚠️  配置警告:")
        for w in warnings:
            print(f"  - {w}")

    return True


# 打印配置信息(用于调试)
def print_config():
    """打印当前配置(隐藏敏感信息)"""
    print(f"应用名称: {settings.app_name}")
    print(f"版本: {settings.app_version}")
    print(f"服务器: {settings.host}:{settings.port}")
    print(f"高德地图API Key: {'已配置' if settings.amap_api_key else '未配置'}")

    # 检查LLM配置
    llm_key = settings.llm_api_key or settings.openai_api_key
    llm_base_url = settings.llm_base_url or settings.openai_base_url
    llm_model = settings.llm_model_id or settings.openai_model

    print(f"LLM API Key: {'已配置' if llm_key else '未配置'}")
    print(f"LLM Base URL: {llm_base_url}")
    print(f"LLM Model: {llm_model}")
    print(f"日志级别: {settings.log_level}")
