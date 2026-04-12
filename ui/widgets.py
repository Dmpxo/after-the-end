# -*- coding: utf-8 -*-
"""自定义控件"""

import os
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont, QPixmap
from PyQt6.QtWidgets import (
    QComboBox, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QVBoxLayout, QWidget,
)


class DropZone(QLineEdit):
    """支持拖拽的输入框"""
    file_dropped = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setPlaceholderText("丢个链接试试，或者拖个视频文件进来~")
        self.setMinimumHeight(48)
        self.setFont(QFont("Microsoft YaHei", 12))
        self.setAcceptDrops(True)
        self.setClearButtonEnabled(True)

    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls() or event.mimeData().hasText():
            event.acceptProposedAction()
        else:
            event.ignore()

    def dragMoveEvent(self, event):
        if event.mimeData().hasUrls() or event.mimeData().hasText():
            event.acceptProposedAction()
        else:
            event.ignore()

    def dropEvent(self, event):
        if event.mimeData().hasUrls():
            url = event.mimeData().urls()[0]
            if url.isLocalFile():
                file_path = url.toLocalFile()
                ext = os.path.splitext(file_path)[1].lower()
                video_exts = {".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v"}
                if ext in video_exts:
                    self.setText(file_path)
                    self.file_dropped.emit(file_path)
                else:
                    self.setText(f"不支持的视频格式: {ext}")
        elif event.mimeData().hasText():
            self.setText(event.mimeData().text().strip())
        event.acceptProposedAction()


class StageProgress(QWidget):
    """分阶段进度展示"""

    def __init__(self, stages: list, parent=None):
        super().__init__(parent)
        self.stages = stages
        self.current_stage = -1
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 8, 0, 8)
        layout.setSpacing(4)
        self.labels = []
        for i, stage in enumerate(self.stages):
            label = QLabel(f"  ○  {stage}")
            label.setFont(QFont("Microsoft YaHei", 11))
            label.setStyleSheet("color: #666; padding: 2px 0;")
            layout.addWidget(label)
            self.labels.append(label)
        self.setFixedHeight(len(self.stages) * 28 + 16)

    def set_stage(self, index: int):
        if index < 0 or index >= len(self.labels):
            return
        for i in range(len(self.labels)):
            if i < index:
                self.labels[i].setText(self.labels[i].text().replace("○", "✅").replace("●", "✅"))
                self.labels[i].setStyleSheet("color: #00BCD4; padding: 2px 0;")
            elif i == index:
                self.labels[i].setText(self.labels[i].text().replace("○", "●").replace("✅", "✅"))
                self.labels[i].setStyleSheet("color: #fff; font-weight: bold; padding: 2px 0;")
        self.current_stage = index

    def complete(self):
        for i in range(len(self.labels)):
            self.labels[i].setText(self.labels[i].text().replace("○", "✅").replace("●", "✅"))
            self.labels[i].setStyleSheet("color: #00BCD4; padding: 2px 0;")

    def reset(self):
        for i, stage in enumerate(self.stages):
            self.labels[i].setText(f"  ○  {stage}")
            self.labels[i].setStyleSheet("color: #666; padding: 2px 0;")
        self.current_stage = -1

    def error(self, index: int, message: str):
        if 0 <= index < len(self.labels):
            self.labels[index].setText(f"  ❌  {message}")
            self.labels[index].setStyleSheet("color: #FF5252; font-weight: bold; padding: 2px 0;")


class KeyframeGallery(QWidget):
    """关键帧缩略图画廊"""
    frame_clicked = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.frames = []
        self._setup_ui()

    def _setup_ui(self):
        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(4, 4, 4, 4)
        self.layout.setSpacing(4)
        self.title_label = QLabel("🖼️ 关键帧")
        self.title_label.setFont(QFont("Microsoft YaHei", 10, QFont.Weight.Bold))
        self.title_label.setStyleSheet("color: #aaa;")
        self.layout.addWidget(self.title_label)
        self.scroll_widget = QWidget()
        self.scroll_layout = QVBoxLayout(self.scroll_widget)
        self.scroll_layout.setSpacing(6)
        self.scroll_layout.addStretch()
        self.layout.addWidget(self.scroll_widget)

    def set_frames(self, frame_paths: list):
        self.frames = frame_paths
        while self.scroll_layout.count() > 1:
            item = self.scroll_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        for i, path in enumerate(frame_paths):
            label = QLabel()
            pixmap = QPixmap(path)
            if not pixmap.isNull():
                scaled = pixmap.scaledToWidth(200, Qt.TransformationMode.SmoothTransformation)
                label.setPixmap(scaled)
            label.setCursor(Qt.CursorShape.PointingHandCursor)
            label.setToolTip(f"帧 {i + 1}")
            label.mousePressEvent = lambda e, idx=i: self.frame_clicked.emit(idx)
            self.scroll_layout.insertWidget(i, label)

    def clear(self):
        self.frames = []
        while self.scroll_layout.count() > 1:
            item = self.scroll_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()


class ExportButton(QPushButton):
    def __init__(self, parent=None):
        super().__init__("📄 导出 Markdown", parent)
        self.setFont(QFont("Microsoft YaHei", 10))
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setStyleSheet("""
            QPushButton {
                background-color: #2a2a2a; color: #ccc;
                border: 1px solid #444; border-radius: 6px; padding: 8px 20px;
            }
            QPushButton:hover {
                background-color: #333; border-color: #00BCD4; color: #00BCD4;
            }
        """)
