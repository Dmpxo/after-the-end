# -*- coding: utf-8 -*-
"""VideoLens 主窗口"""

import logging
import os
from typing import Optional

from PyQt6.QtCore import QThread, Qt, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QApplication, QComboBox, QFileDialog, QHBoxLayout, QLabel,
    QMessageBox, QPushButton, QScrollArea, QSplitter,
    QTextEdit, QVBoxLayout, QWidget,
)

from core.analyzer import VideoAnalyzer
from core.downloader import check_ffmpeg, check_yt_dlp, download_video, get_video_info
from core.extractor import VideoExtractor
from core.transcriber import Transcriber
from utils.config import ConfigManager
from utils.proxy import setup_proxy
from ui.widgets import DropZone, ExportButton, KeyframeGallery, StageProgress

logger = logging.getLogger(__name__)


class AnalysisWorker(QThread):
    """后台分析工作线程"""
    progress = pyqtSignal(int, str)
    result_ready = pyqtSignal(str)
    frames_ready = pyqtSignal(list)
    error = pyqtSignal(str)
    info_ready = pyqtSignal(dict)

    def __init__(self, config: ConfigManager, input_source: str, analysis_type: str):
        super().__init__()
        self.config = config
        self.input_source = input_source
        self.analysis_type = analysis_type
        self._running = True

    def run(self):
        try:
            proxy_dict = self.config.proxy_dict
            if proxy_dict:
                setup_proxy(proxy_dict)

            # 阶段 0：准备
            self.progress.emit(0, "正在准备视频...")

            # 阶段 1：下载
            if self.input_source.startswith(("http://", "https://")):
                self.progress.emit(1, "正在下载视频（可能需要一些时间）...")
                proxy_url = ""
                if proxy_dict:
                    proxy_url = proxy_dict.get("http", proxy_dict.get("https", ""))
                video_path = download_video(self.input_source, proxy=proxy_url)
                info = get_video_info(self.input_source)
                if info:
                    self.info_ready.emit(info)
            else:
                if not os.path.exists(self.input_source):
                    self.error.emit(f"文件不存在: {self.input_source}")
                    return
                video_path = self.input_source

            if not self._running:
                return

            # 阶段 2：提取音频
            self.progress.emit(2, "正在提取音频...")
            extractor = VideoExtractor()
            try:
                audio_path = extractor.extract_audio(video_path)
            except RuntimeError as e:
                self.error.emit(str(e))
                return

            if not self._running:
                return

            # 阶段 3：转录
            self.progress.emit(3, "正在转录语音（AI 正在听你说啥）...")
            provider = self.config.get("ai_provider", "siliconflow")
            if provider == "siliconflow":
                sf_key = self.config.get("api_keys.siliconflow", "")
                sf_base = self.config.get("siliconflow_base_url", "https://api.siliconflow.cn/v1")
                transcriber = Transcriber(
                    api_key=sf_key,
                    use_api=True,
                    model_name="FunAudioLLM/SenseVoiceSmall",
                    language=self.config.get("whisper.language", "zh"),
                    base_url=sf_base,
                    provider="siliconflow",
                )
            else:
                transcriber = Transcriber(
                    api_key=self.config.get("api_keys.openai"),
                    use_api=self.config.get("whisper.use_api", True),
                    model_name=self.config.get("whisper.model", "whisper-1"),
                    language=self.config.get("whisper.language", "zh"),
                    provider="openai",
                )
            try:
                transcript = transcriber.transcribe(audio_path)
            except Exception as e:
                self.error.emit(f"语音转录失败: {e}")
                return

            if not self._running:
                return

            # 阶段 4：关键帧
            self.progress.emit(4, "正在抽取画面关键帧...")
            keyframes = extractor.extract_keyframes(
                video_path,
                max_frames=self.config.get("max_keyframes", 20),
                interval_sec=self.config.get("keyframe_interval_sec", 30),
                width=512,
            )
            self.frames_ready.emit(keyframes)

            if not self._running:
                return

            # 阶段 5：AI 分析
            self.progress.emit(5, "正在深度分析（多模态 AI 上线）...")
            analyzer = VideoAnalyzer(
                gemini_key=self.config.get("api_keys.gemini"),
                openai_key=self.config.get("api_keys.openai"),
                siliconflow_key=self.config.get("api_keys.siliconflow"),
                provider=self.config.get("ai_provider", "siliconflow"),
                gemini_model=self.config.get("gemini_model", "gemini-1.5-pro"),
                openai_model=self.config.get("openai_model", "gpt-4o"),
                siliconflow_model=self.config.get("siliconflow_model", "Qwen/Qwen2.5-VL-72B-Instruct"),
                siliconflow_base_url=self.config.get("siliconflow_base_url", "https://api.siliconflow.cn/v1"),
                proxy=proxy_dict,
            )
            try:
                report = analyzer.analyze(
                    transcript=transcript,
                    keyframes=keyframes,
                    analysis_type=self.analysis_type,
                    video_path=video_path,
                )
            except Exception as e:
                self.error.emit(f"AI 分析失败: {e}")
                return

            # 清理
            if self.input_source.startswith(("http://", "https://")):
                extractor.cleanup()
                try:
                    os.remove(audio_path)
                except Exception:
                    pass

            self.progress.emit(6, "搞定啦！")
            self.result_ready.emit(report)

        except Exception as e:
            logger.exception("分析过程异常")
            self.error.emit(str(e))

    def stop(self):
        self._running = False


class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.config = ConfigManager()
        self.worker: Optional[AnalysisWorker] = None
        self._report_text = ""
        self._setup_ui()
        self._check_dependencies()

    def _setup_ui(self):
        self.setWindowTitle("VideoLens — 视频内容分析")
        self.setMinimumSize(1000, 700)
        self.resize(1200, 800)

        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(16, 16, 16, 16)
        main_layout.setSpacing(12)

        # 输入区
        input_layout = QVBoxLayout()
        input_layout.setContentsMargins(0, 0, 0, 0)
        input_layout.setSpacing(8)

        self.url_input = DropZone()
        self.url_input.returnPressed.connect(self._on_analyze)
        input_layout.addWidget(self.url_input)

        control_bar = QHBoxLayout()
        control_bar.setSpacing(12)
        control_bar.addWidget(QLabel("分析类型："))
        self.analysis_type = QComboBox()
        self.analysis_type.addItems(["全部", "视频摘要", "关键观点提取", "画面解读"])
        self.analysis_type.setFixedWidth(150)
        self.analysis_type.setFont(QFont("Microsoft YaHei", 10))
        control_bar.addWidget(self.analysis_type)

        control_bar.addWidget(QLabel("AI 引擎："))
        self.provider_combo = QComboBox()
        self.provider_combo.addItems(["硅基流动", "Gemini", "GPT-4o"])
        self.provider_combo.setFixedWidth(120)
        self.provider_combo.setFont(QFont("Microsoft YaHei", 10))
        current = self.config.get("ai_provider", "siliconflow")
        name_map = {"siliconflow": "硅基流动", "gemini": "Gemini", "openai": "GPT-4o"}
        self.provider_combo.setCurrentText(name_map.get(current, "硅基流动"))
        control_bar.addWidget(self.provider_combo)

        control_bar.addStretch()

        self.analyze_btn = QPushButton("🎬 开始分析")
        self.analyze_btn.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
        self.analyze_btn.setFixedSize(160, 42)
        self.analyze_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.analyze_btn.setStyleSheet("""
            QPushButton {
                background-color: #00BCD4; color: #1a1a1a;
                border: none; border-radius: 8px; font-weight: bold;
            }
            QPushButton:hover { background-color: #26C6DA; }
            QPushButton:pressed { background-color: #00ACC1; }
            QPushButton:disabled { background-color: #555; color: #888; }
        """)
        self.analyze_btn.clicked.connect(self._on_analyze)
        control_bar.addWidget(self.analyze_btn)

        input_layout.addLayout(control_bar)
        main_layout.addLayout(input_layout)

        # 进度区
        self.progress = StageProgress([
            "准备视频", "下载视频", "提取音频",
            "转录语音", "抽取关键帧", "AI 深度分析", "完成",
        ])
        self.progress.hide()
        main_layout.addWidget(self.progress)

        # 视频信息
        self.info_label = QLabel("")
        self.info_label.setStyleSheet("color: #888; font-size: 12px; padding: 2px 0;")
        self.info_label.hide()
        main_layout.addWidget(self.info_label)

        # 分割区域
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # 左侧关键帧
        self.gallery = KeyframeGallery()
        self.gallery.setMaximumWidth(260)
        self.gallery.setMinimumWidth(180)
        scroll = QScrollArea()
        scroll.setWidget(self.gallery)
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        splitter.addWidget(scroll)

        # 右侧报告
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(8)

        report_header = QHBoxLayout()
        report_header.addWidget(QLabel("📋 分析报告"))
        report_header.addStretch()
        self.export_btn = ExportButton()
        self.export_btn.clicked.connect(self._export_report)
        self.export_btn.hide()
        report_header.addWidget(self.export_btn)
        right_layout.addLayout(report_header)

        self.report_text = QTextEdit()
        self.report_text.setReadOnly(True)
        self.report_text.setFont(QFont("Microsoft YaHei", 11))
        self.report_text.setPlaceholderText(
            "分析结果会出现在这里~\n\n"
            "支持 YouTube、B站 等主流平台的视频链接，\n"
            "也支持直接拖入本地视频文件。"
        )
        right_layout.addWidget(self.report_text)

        splitter.addWidget(right_panel)
        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 3)
        main_layout.addWidget(splitter, stretch=1)

    def _check_dependencies(self):
        warnings = []
        ok_ff, msg_ff = check_ffmpeg()
        ok_yt, msg_yt = check_yt_dlp()
        if not ok_ff:
            warnings.append(f"⚠️ {msg_ff}")
        if not ok_yt:
            warnings.append(f"⚠️ {msg_yt}")
        if not self.config.has_gemini_key and not self.config.has_openai_key and not self.config.has_siliconflow_key:
            warnings.append("⚠️ 未配置 AI API Key，请在 config.json 中设置")

        if warnings:
            self.report_text.setPlainText(
                "## 环境检查\n\n"
                + "\n".join(f"- {w}" for w in warnings)
                + f"\n\n配置文件: {self.config.config_path}\n"
                "请参考 config.json.example 配置 API Key。"
            )

    def _on_analyze(self):
        source = self.url_input.text().strip()
        if not source:
            QMessageBox.information(self, "提示", "先给我个视频链接或者拖个文件进来嘛~")
            return

        provider = "siliconflow" if self.provider_combo.currentText() == "硅基流动" else ("gemini" if self.provider_combo.currentText() == "Gemini" else "openai")
        if not self.config.get(f"api_keys.{provider}"):
            QMessageBox.warning(
                self, "缺少 API Key",
                f"未配置 {self.provider_combo.currentText()} 的 API Key。\n"
                f"请在 config.json 中设置 api_keys.{provider}。\n\n"
                f"硅基流动: https://cloud.siliconflow.cn 获取 Key"
            )
            return

        self.config.set("ai_provider", provider)
        self.analyze_btn.setEnabled(False)
        self.analyze_btn.setText("⏳ 分析中...")
        self.progress.reset()
        self.progress.show()
        self.info_label.hide()
        self.export_btn.hide()
        self.gallery.clear()
        self.report_text.clear()

        self.worker = AnalysisWorker(
            config=self.config,
            input_source=source,
            analysis_type=self.analysis_type.currentText(),
        )
        self.worker.progress.connect(self._on_progress)
        self.worker.result_ready.connect(self._on_result)
        self.worker.frames_ready.connect(self._on_frames)
        self.worker.error.connect(self._on_error)
        self.worker.info_ready.connect(self._on_info)
        self.worker.start()

    def _on_progress(self, stage: int, message: str):
        self.progress.set_stage(stage)

    def _on_info(self, info: dict):
        parts = []
        if info.get("title"):
            parts.append(f"🎬 {info['title']}")
        if info.get("duration_str"):
            parts.append(f"⏱️ {info['duration_str']}")
        if info.get("uploader"):
            parts.append(f"👤 {info['uploader']}")
        self.info_label.setText("  |  ".join(parts))
        self.info_label.show()

    def _on_frames(self, frames: list):
        self.gallery.set_frames(frames)

    def _on_result(self, report: str):
        self._report_text = report
        self.report_text.setMarkdown(report)
        self.progress.complete()
        self.analyze_btn.setEnabled(True)
        self.analyze_btn.setText("🎬 开始分析")
        self.export_btn.show()

    def _on_error(self, message: str):
        self.progress.error(self.progress.current_stage, message)
        self.report_text.setPlainText(f"出错了\n\n{message}")
        self.analyze_btn.setEnabled(True)
        self.analyze_btn.setText("🎬 开始分析")

    def _export_report(self):
        if not self._report_text:
            QMessageBox.information(self, "提示", "还没有分析报告可以导出~")
            return
        path, _ = QFileDialog.getSaveFileName(
            self, "导出分析报告", "videolens_report.md",
            "Markdown (*.md);;所有文件 (*.*)",
        )
        if path:
            try:
                with open(path, "w", encoding="utf-8-sig") as f:
                    f.write(self._report_text)
                QMessageBox.information(self, "导出成功", f"报告已保存到:\n{path}")
            except Exception as e:
                QMessageBox.critical(self, "导出失败", f"保存文件失败:\n{e}")

    def closeEvent(self, event):
        if self.worker and self.worker.isRunning():
            reply = QMessageBox.question(
                self, "确认退出", "分析正在进行中，确定要退出吗？",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No,
            )
            if reply == QMessageBox.StandardButton.Yes:
                self.worker.stop()
                self.worker.wait(3000)
                event.accept()
            else:
                event.ignore()
        else:
            event.accept()
