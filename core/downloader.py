# -*- coding: utf-8 -*-
"""视频下载模块 - yt-dlp 封装"""

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)


def check_yt_dlp() -> tuple:
    if shutil.which("yt-dlp"):
        try:
            result = subprocess.run(
                ["yt-dlp", "--version"], capture_output=True, timeout=10,
                encoding="utf-8", errors="replace",
            )
            if result.returncode == 0:
                return True, f"yt-dlp {result.stdout.strip()}"
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
    return False, "未找到 yt-dlp，请先安装: pip install yt-dlp"


def check_ffmpeg() -> tuple:
    if shutil.which("ffmpeg"):
        try:
            result = subprocess.run(
                ["ffmpeg", "-version"], capture_output=True, timeout=10,
                encoding="utf-8", errors="replace",
            )
            if result.returncode == 0:
                version = result.stdout.split("\n")[0]
                return True, version
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
    return False, "未找到 ffmpeg，请先安装并加入 PATH"


def download_video(
    url: str,
    output_dir: Optional[str] = None,
    cookies_file: Optional[str] = None,
    proxy: Optional[str] = None,
) -> str:
    """下载视频到本地，返回本地路径"""
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="videolens_")
    os.makedirs(output_dir, exist_ok=True)

    output_template = os.path.join(output_dir, "video.%(ext)s")

    cmd = [
        "yt-dlp",
        "-f", "best[ext=mp4]/best",
        "--merge-output-format", "mp4",
        "-o", output_template,
        "--no-playlist",
        "--quiet",
        "--no-warnings",
    ]

    if cookies_file and os.path.exists(cookies_file):
        cmd.extend(["--cookies", cookies_file])
    if proxy:
        cmd.extend(["--proxy", proxy])

    logger.info(f"开始下载: {url}")

    try:
        result = subprocess.run(
            cmd + [url], capture_output=True, timeout=600,
            encoding="utf-8", errors="replace",
        )
        if result.returncode != 0:
            error_msg = result.stderr.strip()
            if "not available" in error_msg.lower():
                raise RuntimeError("该视频在当前地区不可用，请检查网络/代理设置")
            elif "login" in error_msg.lower() or "sign in" in error_msg.lower():
                raise RuntimeError("该视频需要登录，请在配置中提供 cookies 文件")
            elif "private" in error_msg.lower():
                raise RuntimeError("该视频是私密的，无法下载")
            else:
                raise RuntimeError(f"下载失败: {error_msg[:200]}")

        video_path = _find_video_file(output_dir)
        if not video_path:
            raise RuntimeError("下载完成但未找到视频文件")

        size_mb = os.path.getsize(video_path) / (1024 * 1024)
        logger.info(f"下载完成: {video_path} ({size_mb:.1f} MB)")
        return video_path

    except subprocess.TimeoutExpired:
        raise RuntimeError("下载超时（10 分钟），请检查网络连接")
    except FileNotFoundError:
        raise RuntimeError("yt-dlp 未安装，请运行: pip install yt-dlp")


def _find_video_file(directory: str) -> Optional[str]:
    video_exts = {".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv"}
    for f in os.listdir(directory):
        if os.path.splitext(f)[1].lower() in video_exts:
            return os.path.join(directory, f)
    return None


def get_video_info(url: str, proxy: Optional[str] = None) -> dict:
    cmd = ["yt-dlp", "--dump-json", "--no-playlist", "--quiet"]
    if proxy:
        cmd.extend(["--proxy", proxy])
    try:
        result = subprocess.run(cmd + [url], capture_output=True, timeout=30,
                               encoding="utf-8", errors="replace")
        if result.returncode != 0:
            return {}
        info = json.loads(result.stdout)
        return {
            "title": info.get("title", "未知标题"),
            "duration": info.get("duration", 0),
            "duration_str": _format_duration(info.get("duration", 0)),
            "thumbnail": info.get("thumbnail", ""),
            "uploader": info.get("uploader", ""),
        }
    except Exception as e:
        logger.warning(f"获取视频信息失败: {e}")
        return {}


def _format_duration(seconds) -> str:
    if not seconds:
        return "未知"
    h, remainder = divmod(int(seconds), 3600)
    m, s = divmod(remainder, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"
