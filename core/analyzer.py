# -*- coding: utf-8 -*-
"""多模态 AI 分析模块 - Gemini / GPT-4o"""

import base64
import logging
import mimetypes
import os
from typing import Optional

logger = logging.getLogger(__name__)

ANALYSIS_PROMPTS = {
    "视频摘要": """请对这段视频内容进行简洁的摘要，包括：
1. 视频主题（一句话）
2. 核心内容概述（3-5 句话）
3. 关键信息点（列表形式）

请用中文回答，语言简洁有力。""",

    "关键观点提取": """请从这段视频中提取所有关键观点和重要信息，包括：
1. 每个核心观点的详细说明
2. 支撑观点的数据、案例或论据
3. 值得注意的细节

请用中文回答，每个观点用编号标注。""",

    "画面解读": """请仔细观察视频中的画面内容，分析：
1. 视频的视觉风格和画面构成
2. 关键帧中展示的重要信息（图表、文字、UI界面等）
3. 画面传达的情感或氛围

请用中文回答，结合具体帧的描述。""",

    "全部": """请对这段视频进行全面深度分析，包括：

## 📌 视频摘要
- 主题、核心内容、关键信息

## 💡 关键观点
- 核心论点、支撑论据、值得注意的细节

## 🖼️ 画面解读
- 视觉内容、图表数据、界面信息

## 🎯 实用收获
- 对观众最有价值的信息
- 可以直接应用的方法或知识点

请用中文回答，结构清晰，内容详实。""",
}


class VideoAnalyzer:
    def __init__(
        self,
        gemini_key: Optional[str] = None,
        openai_key: Optional[str] = None,
        siliconflow_key: Optional[str] = None,
        provider: str = "gemini",
        gemini_model: str = "gemini-1.5-pro",
        openai_model: str = "gpt-4o",
        siliconflow_model: str = "Qwen/Qwen2.5-VL-72B-Instruct",
        siliconflow_base_url: str = "https://api.siliconflow.cn/v1",
        proxy: Optional[dict] = None,
    ):
        self.gemini_key = gemini_key
        self.openai_key = openai_key
        self.siliconflow_key = siliconflow_key
        self.provider = provider
        self.gemini_model = gemini_model
        self.openai_model = openai_model
        self.siliconflow_model = siliconflow_model
        self.siliconflow_base_url = siliconflow_base_url
        self.proxy = proxy

    def analyze(
        self,
        transcript: dict,
        keyframes: list,
        analysis_type: str = "全部",
        video_path: Optional[str] = None,
    ) -> str:
        prompt = ANALYSIS_PROMPTS.get(analysis_type, ANALYSIS_PROMPTS["全部"])
        text_context = self._build_text_context(transcript)

        if self.provider == "gemini" and self.gemini_key:
            return self._analyze_with_gemini(prompt, text_context, keyframes)
        elif self.provider == "siliconflow" and self.siliconflow_key:
            return self._analyze_with_siliconflow(prompt, text_context, keyframes)
        elif self.provider == "openai" and self.openai_key:
            return self._analyze_with_openai(prompt, text_context, keyframes)
        elif self.siliconflow_key:
            return self._analyze_with_siliconflow(prompt, text_context, keyframes)
        elif self.openai_key:
            return self._analyze_with_openai(prompt, text_context, keyframes)
        elif self.gemini_key:
            return self._analyze_with_gemini(prompt, text_context, keyframes)
        else:
            raise RuntimeError("未配置任何 AI API Key。请在 config.json 中设置。")

    def _build_text_context(self, transcript: dict) -> str:
        parts = ["## 视频转录文本\n", transcript.get("text", ""), ""]
        segments = transcript.get("segments", [])
        if segments:
            parts.append("\n## 时间轴\n")
            for seg in segments[:100]:
                start_min = int(seg["start"] // 60)
                start_sec = int(seg["start"] % 60)
                parts.append(f"[{start_min:02d}:{start_sec:02d}] {seg['text']}")
        return "\n".join(parts)

    def _analyze_with_gemini(self, prompt: str, text_context: str, keyframes: list) -> str:
        try:
            import google.generativeai as genai
        except ImportError:
            raise RuntimeError("google-generativeai 未安装，请运行: pip install google-generativeai")

        genai.configure(api_key=self.gemini_key)
        model = genai.GenerativeModel(self.gemini_model)

        contents = [f"{prompt}\n\n{text_context}"]

        for frame_path in keyframes:
            if os.path.exists(frame_path):
                try:
                    mime_type = mimetypes.guess_type(frame_path)[0] or "image/jpeg"
                    with open(frame_path, "rb") as f:
                        contents.append({"mime_type": mime_type, "data": f.read()})
                except Exception as e:
                    logger.warning(f"读取帧图片失败 {frame_path}: {e}")

        logger.info(f"使用 Gemini ({self.gemini_model}) 分析中...")

        try:
            response = model.generate_content(contents)
            return response.text
        except Exception as e:
            if len(keyframes) > 5:
                logger.info("关键帧过多导致失败，减少到 5 帧重试...")
                return self._analyze_with_gemini(prompt, text_context, keyframes[:5])
            raise RuntimeError(f"Gemini 分析失败: {e}")

    def _analyze_with_openai(self, prompt: str, text_context: str, keyframes: list) -> str:
        try:
            from openai import OpenAI
        except ImportError:
            raise RuntimeError("openai 未安装，请运行: pip install openai")

        client = OpenAI(api_key=self.openai_key)
        content_parts = [{"type": "text", "text": f"{prompt}\n\n{text_context}"}]

        for frame_path in keyframes:
            if os.path.exists(frame_path):
                try:
                    with open(frame_path, "rb") as f:
                        img_b64 = base64.b64encode(f.read()).decode()
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{img_b64}", "detail": "low"},
                    })
                except Exception as e:
                    logger.warning(f"读取帧图片失败 {frame_path}: {e}")

        logger.info("使用 GPT-4o 分析中...")

        try:
            response = client.chat.completions.create(
                model=self.openai_model,
                messages=[{"role": "user", "content": content_parts}],
                max_tokens=4096,
            )
            return response.choices[0].message.content
        except Exception as e:
            if len(keyframes) > 5:
                logger.info("关键帧过多导致失败，减少到 5 帧重试...")
                return self._analyze_with_openai(prompt, text_context, keyframes[:5])
            raise RuntimeError(f"GPT-4o 分析失败: {e}")

    def _analyze_with_siliconflow(self, prompt: str, text_context: str, keyframes: list) -> str:
        try:
            from openai import OpenAI
        except ImportError:
            raise RuntimeError("openai 未安装，请运行: pip install openai")

        client = OpenAI(
            api_key=self.siliconflow_key,
            base_url=self.siliconflow_base_url,
        )
        content_parts = [{"type": "text", "text": f"{prompt}\n\n{text_context}"}]

        for frame_path in keyframes:
            if os.path.exists(frame_path):
                try:
                    with open(frame_path, "rb") as f:
                        img_b64 = base64.b64encode(f.read()).decode()
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{img_b64}", "detail": "low"},
                    })
                except Exception as e:
                    logger.warning(f"读取帧图片失败 {frame_path}: {e}")

        logger.info(f"使用硅基流动 ({self.siliconflow_model}) 分析中...")

        try:
            response = client.chat.completions.create(
                model=self.siliconflow_model,
                messages=[{"role": "user", "content": content_parts}],
                max_tokens=4096,
            )
            return response.choices[0].message.content
        except Exception as e:
            if len(keyframes) > 5:
                logger.info("关键帧过多导致失败，减少到 5 帧重试...")
                return self._analyze_with_siliconflow(prompt, text_context, keyframes[:5])
            raise RuntimeError(f"硅基流动分析失败: {e}")
