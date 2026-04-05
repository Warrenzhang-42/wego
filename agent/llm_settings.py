"""OpenAI-compatible LLM env helpers (WeGO agent)."""

from __future__ import annotations

import os
from pathlib import Path

_DEFAULT_BASE = "https://api.openai.com/v1"

# scnet 等平台偶发「模型名与路由不一致」时，按顺序尝试备用 model id（与官方模型列表一致）
_DEFAULT_SCNET_FALLBACKS = "MiniMax-M2,DeepSeek-V3.2"


def load_dotenv_wego() -> None:
    """
    从仓库根目录 WeGO/.env 加载配置。
    在 agent/ 目录下启动 uvicorn 时，默认 load_dotenv() 读不到上级 .env，会导致 OPENAI_* 未注入。
    """
    from dotenv import load_dotenv

    agent_dir = Path(__file__).resolve().parent
    repo_root = agent_dir.parent
    # 默认 dotenv 不覆盖已存在的 OS 环境变量，会导致 shell 里残留的旧 OPENAI_* 盖过 WeGO/.env
    load_dotenv(repo_root / ".env", override=True)
    load_dotenv(agent_dir / ".env", override=True)


def normalize_openai_api_base(raw: str | None) -> str:
    """
    LangChain ChatOpenAI expects base_url to be the API root (e.g. .../v1).
    If env mistakenly sets the full chat URL, strip the trailing /chat/completions.
    """
    if not raw or not str(raw).strip():
        return _DEFAULT_BASE
    base = str(raw).strip().rstrip("/")
    if base.endswith("/chat/completions"):
        base = base[: -len("/chat/completions")].rstrip("/")
    return base or _DEFAULT_BASE


def openai_api_base_from_env() -> str:
    return normalize_openai_api_base(os.getenv("OPENAI_API_BASE"))


def model_candidates_from_env() -> list[str]:
    """
    返回按顺序尝试的 model 列表：主模型 + OPENAI_API_MODEL_FALLBACKS。
    若未配置 FALLBACKS 且 base 为 scnet，则使用内置默认备用（MiniMax-M2、DeepSeek-V3.2）。
    """
    primary = (os.getenv("OPENAI_API_MODEL") or "gpt-4o-mini").strip()
    raw_fb = (os.getenv("OPENAI_API_MODEL_FALLBACKS") or "").strip()
    base = (os.getenv("OPENAI_API_BASE") or "").lower()
    if not raw_fb and "scnet.cn" in base:
        raw_fb = _DEFAULT_SCNET_FALLBACKS
    fallbacks = [x.strip() for x in raw_fb.split(",") if x.strip()]
    out: list[str] = []
    for m in [primary] + fallbacks:
        if m and m not in out:
            out.append(m)
    return out or [primary]


def is_gateway_model_routing_error(exc: BaseException) -> bool:
    """网关无法将 model 路由到后端时的典型报错（scnet / 聚合网关）。"""
    s = str(exc).lower()
    needles = (
        "no matching target server",
        "model_not_found",
        "invalid model",
        "unknown model",
    )
    return any(n in s for n in needles)
