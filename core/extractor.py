# -*- coding: utf-8 -*-
"""音频提取和关键帧抽取模块"""

import logging
import os
import re
import subprocess
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)


def _run(cmd, timeout=300):
    """统一 subprocess 调用，避免 Windows GBK 编码问题"""
    result = subprocess.run(
        cmd, capture_output=True, timeout=timeout,
        encoding="utf-8", errors="replace",
    )
    return result


class VideoExtractor:
    def __init__(self, ffmpeg_path: Optional[str] = None):
        self.ffmpeg_path = ffmpeg_path or "ffmpeg"
        self.temp_dir = tempfile.mkdtemp(prefix="videolens_frames_")

    def extract_audio(self, video_path: str, output_path: Optional[str] = None) -> str:
        """提取音频为 mp3（16kHz，适合语音识别）"""
        if output_path is None:
            output_path = os.path.splitext(video_path)[0] + ".mp3"

        cmd = [
            self.ffmpeg_path, "-i", video_path,
            "-vn", "-acodec", "libmp3lame", "-ab", "128k",
            "-ar", "16000", "-y", output_path,
        ]

        logger.info(f"正在提取音频: {video_path}")
        try:
            result = _run(cmd, timeout=300)
            if result.returncode != 0:
                raise RuntimeError(f"音频提取失败: {result.stderr[:200]}")
            logger.info(f"音频提取完成: {output_path}")
            return output_path
        except subprocess.TimeoutExpired:
            raise RuntimeError("音频提取超时")
        except FileNotFoundError:
            raise RuntimeError("ffmpeg 未安装，请先安装并加入 PATH")

    def extract_keyframes(
        self, video_path: str, max_frames: int = 20,
        interval_sec: int = 30, width: int = 512,
        output_dir: Optional[str] = None,
    ) -> list:
        """抽取关键帧，返回图片路径列表"""
        if output_dir is None:
            output_dir = self.temp_dir
        os.makedirs(output_dir, exist_ok=True)

        duration = self._get_duration(video_path)
        if duration <= 0:
            duration = 300

        total_possible = int(duration / interval_sec) + 1
        actual_interval = duration / max_frames if total_possible > max_frames else interval_sec

        logger.info(f"视频时长 {duration:.0f}s，抽取 {min(total_possible, max_frames)} 帧")

        output_pattern = os.path.join(output_dir, "frame_%04d.jpg")
        cmd = [
            self.ffmpeg_path, "-i", video_path,
            "-vf", f"fps=1/{actual_interval:.1f},scale={width}:-1",
            "-frames:v", str(max_frames), "-q:v", "2", "-y", output_pattern,
        ]

        try:
            _run(cmd, timeout=300)
        except subprocess.TimeoutExpired:
            raise RuntimeError("关键帧提取超时")

        frames = sorted([
            os.path.join(output_dir, f)
            for f in os.listdir(output_dir)
            if f.startswith("frame_") and f.endswith(".jpg")
        ])
        logger.info(f"成功抽取 {len(frames)} 帧")
        return frames[:max_frames]

    def get_segments(self, video_path: str, segment_duration_min: int = 5) -> list:
        """将视频分成多个片段 [(start, end), ...]"""
        duration = self._get_duration(video_path)
        if duration <= 0:
            return [(0, 0)]
        seg_duration = segment_duration_min * 60
        segments = []
        start = 0
        while start < duration:
            end = min(start + seg_duration, duration)
            segments.append((start, end))
            start = end
        return segments

    def _get_duration(self, video_path: str) -> float:
        cmd = [self.ffmpeg_path, "-i", video_path, "-hide_banner"]
        try:
            result = _run(cmd, timeout=10)
            match = re.search(r"Duration: (\d{2}):(\d{2}):(\d{2})\.\d+", result.stderr)
            if match:
                h, m, s = int(match.group(1)), int(match.group(2)), int(match.group(3))
                return h * 3600 + m * 60 + s
        except Exception as e:
            logger.warning(f"获取视频时长失败: {e}")
        return 0

    def cleanup(self):
        import shutil
        try:
            shutil.rmtree(self.temp_dir, ignore_errors=True)
        except Exception:
            pass
