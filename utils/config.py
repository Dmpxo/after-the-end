# -*- coding: utf-8 -*-
"""配置管理工具"""

import json
import logging
from pathlib import Path
from typing import Any
import copy

logger = logging.getLogger(__name__)

CONFIG_FILENAME = "config.json"
EXAMPLE_FILENAME = "config.json.example"

DEFAULT_CONFIG = {
    "api_keys": {
        "openai": "",
        "gemini": "",
        "siliconflow": "",
    },
    "proxy": {
        "http": "",
        "https": "",
        "enabled": False,
    },
    "default_analysis_type": "全部",
    "max_keyframes": 20,
    "keyframe_interval_sec": 30,
    "segment_duration_min": 5,
    "whisper": {
        "use_api": True,
        "model": "whisper-1",
        "language": "zh",
    },
    "ai_provider": "siliconflow",
    "gemini_model": "gemini-1.5-pro",
    "openai_model": "gpt-4o",
    "siliconflow_model": "Qwen/Qwen2.5-VL-72B-Instruct",
    "siliconflow_base_url": "https://api.siliconflow.cn/v1",
}


class ConfigManager:
    """管理 VideoLens 配置"""

    def __init__(self, config_dir: str | None = None):
        if config_dir:
            self.config_dir = Path(config_dir)
        else:
            self.config_dir = Path(__file__).parent.parent.parent
        self.config_path = self.config_dir / CONFIG_FILENAME
        self._config: dict = copy.deepcopy(DEFAULT_CONFIG)
        self._load()

    def _load(self):
        if not self.config_path.exists():
            logger.info("配置文件不存在，使用默认配置")
            self._create_example_if_missing()
            self._save()
            return
        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            self._config = self._deep_merge(DEFAULT_CONFIG, loaded)
            logger.info("配置加载成功")
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"配置文件读取失败: {e}，使用默认配置")
            self._config = copy.deepcopy(DEFAULT_CONFIG)

    def _save(self):
        try:
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(self._config, f, ensure_ascii=False, indent=2)
        except IOError as e:
            logger.error(f"配置保存失败: {e}")

    def _create_example_if_missing(self):
        example_path = self.config_dir / EXAMPLE_FILENAME
        if not example_path.exists():
            try:
                with open(example_path, "w", encoding="utf-8") as f:
                    json.dump(DEFAULT_CONFIG, f, ensure_ascii=False, indent=2)
            except IOError:
                pass

    @staticmethod
    def _deep_merge(base: dict, override: dict) -> dict:
        result = copy.deepcopy(base)
        for key, value in override.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = ConfigManager._deep_merge(result[key], value)
            else:
                result[key] = value
        return result

    def get(self, key_path: str, default: Any = None) -> Any:
        keys = key_path.split(".")
        value = self._config
        for key in keys:
            if isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return default
        return value

    def set(self, key_path: str, value: Any):
        keys = key_path.split(".")
        config = self._config
        for key in keys[:-1]:
            if key not in config or not isinstance(config[key], dict):
                config[key] = {}
            config = config[key]
        config[keys[-1]] = value
        self._save()

    @property
    def config(self) -> dict:
        return copy.deepcopy(self._config)

    @property
    def has_openai_key(self) -> bool:
        return bool(self.get("api_keys.openai"))

    @property
    def has_gemini_key(self) -> bool:
        return bool(self.get("api_keys.gemini"))

    @property
    def has_siliconflow_key(self) -> bool:
        return bool(self.get("api_keys.siliconflow"))

    @property
    def proxy_dict(self) -> dict | None:
        if not self.get("proxy.enabled"):
            return None
        proxies = {}
        http = self.get("proxy.http")
        https = self.get("proxy.https")
        if http:
            proxies["http"] = http
        if https:
            proxies["https"] = https
        elif http:
            proxies["https"] = http
        return proxies or None
