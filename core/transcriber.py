# -*- coding: utf-8 -*-
"""语音转录模块 - 支持硅基流动 API、OpenAI API 和本地 Whisper"""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


class Transcriber:
    def __init__(
        self,
        api_key: Optional[str] = None,
        use_api: bool = True,
        model_name: str = "whisper-1",
        language: str = "zh",
        base_url: Optional[str] = None,
        provider: str = "siliconflow",
    ):
        self.api_key = api_key
        self.use_api = use_api
        self.model_name = model_name
        self.language = language
        self.base_url = base_url
        self.provider = provider
        self._local_model = None

    def transcribe(self, audio_path: str) -> dict:
        """转录音频，返回 {"text": ..., "segments": [...], "language": ...}"""
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"音频文件不存在: {audio_path}")

        if self.use_api and self.api_key:
            if self.provider == "siliconflow":
                return self._transcribe_siliconflow(audio_path)
            else:
                return self._transcribe_openai(audio_path)
        else:
            return self._transcribe_local(audio_path)

    def _transcribe_siliconflow(self, audio_path: str) -> dict:
        """硅基流动语音转录（直接 HTTP 调用，非 OpenAI SDK）"""
        import requests

        url = f"{self.base_url or 'https://api.siliconflow.cn/v1'}/audio/transcriptions"
        headers = {"Authorization": f"Bearer {self.api_key}"}

        logger.info("使用硅基流动语音 API 转录...")

        with open(audio_path, "rb") as f:
            files = {
                "file": (os.path.basename(audio_path), f),
                "model": (None, self.model_name),
            }
            resp = requests.post(url, headers=headers, files=files, timeout=120)

        if resp.status_code != 200:
            raise RuntimeError(f"硅基流动 API 错误 ({resp.status_code}): {resp.text}")

        data = resp.json()
        text = data.get("text", "")

        # 硅基流动不返回分段，整段文本按句子粗分
        segments = []
        if text:
            import re
            sentences = re.split(r'([。！？\n])', text)
            pos = 0
            for i in range(0, len(sentences) - 1, 2):
                chunk = sentences[i] + (sentences[i + 1] if i + 1 < len(sentences) else "")
                if chunk.strip():
                    segments.append({"start": pos, "end": pos + len(chunk), "text": chunk.strip()})
                    pos += len(chunk)
            if not segments:
                segments.append({"start": 0, "end": len(text), "text": text.strip()})

        logger.info(f"转录完成，文本长度 {len(text)} 字符")
        return {
            "text": text,
            "language": self.language,
            "segments": segments,
        }

    def _transcribe_openai(self, audio_path: str) -> dict:
        """OpenAI Whisper API 转录"""
        try:
            from openai import OpenAI
            client = OpenAI(api_key=self.api_key)
            logger.info("使用 OpenAI Whisper API 转录...")

            with open(audio_path, "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    model=self.model_name,
                    file=audio_file,
                    language=self.language if self.language != "auto" else None,
                    response_format="verbose_json",
                    timestamp_granularities=["segment"],
                )

            result = {
                "text": transcript.text,
                "language": getattr(transcript, "language", self.language),
                "segments": [],
            }

            if hasattr(transcript, "segments") and transcript.segments:
                result["segments"] = [
                    {"start": seg.start, "end": seg.end, "text": seg.text}
                    for seg in transcript.segments
                ]

            logger.info(f"转录完成，共 {len(result['segments'])} 个分段")
            return result

        except ImportError:
            logger.warning("openai 库未安装，回退到本地 Whisper")
            self.use_api = False
            return self._transcribe_local(audio_path)
        except Exception as e:
            logger.warning(f"OpenAI API 调用失败: {e}，回退到本地 Whisper")
            self.use_api = False
            return self._transcribe_local(audio_path)

    def _transcribe_local(self, audio_path: str) -> dict:
        """使用本地 faster-whisper 转录（备用方案）"""
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            raise RuntimeError(
                "本地 Whisper 未安装。请运行: pip install faster-whisper\n"
                "或配置 API Key 使用在线转录。"
            )

        logger.info("使用本地 faster-whisper 转录...")
        if self._local_model is None:
            model_size = "medium" if self.language in ("zh", "ja", "ko") else "base"
            self._local_model = WhisperModel(
                model_size,
                device="cpu",
                compute_type="int8",
            )

        segments_raw, info = self._local_model.transcribe(
            audio_path,
            language=self.language if self.language != "auto" else None,
            beam_size=5,
        )

        segments = [
            {"start": seg.start, "end": seg.end, "text": seg.text.strip()}
            for seg in segments_raw
        ]

        full_text = " ".join(seg["text"] for seg in segments)

        logger.info(f"转录完成，共 {len(segments)} 个分段")
        return {
            "text": full_text,
            "language": info.language if info else self.language,
            "segments": segments,
        }
