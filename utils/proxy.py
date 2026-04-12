# -*- coding: utf-8 -*-
"""代理工具"""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


def setup_proxy(proxy_dict: Optional[dict] = None) -> dict:
    if not proxy_dict:
        existing = {}
        if os.environ.get("HTTP_PROXY"):
            existing["http"] = os.environ["HTTP_PROXY"]
        if os.environ.get("HTTPS_PROXY"):
            existing["https"] = os.environ["HTTPS_PROXY"]
        return existing

    http_proxy = proxy_dict.get("http", "")
    https_proxy = proxy_dict.get("https", http_proxy)

    if http_proxy:
        os.environ["HTTP_PROXY"] = http_proxy
        os.environ["http_proxy"] = http_proxy
    if https_proxy:
        os.environ["HTTPS_PROXY"] = https_proxy
        os.environ["https_proxy"] = https_proxy

    return proxy_dict


def clear_proxy():
    for var in ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"]:
        os.environ.pop(var, None)
