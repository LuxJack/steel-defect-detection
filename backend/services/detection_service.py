"""
缺陷检测服务 - FastAPI版本
"""

import os
import uuid
import cv2
import numpy as np
import threading
import time
import base64
import queue
from datetime import datetime, timezone, timedelta

# 中国标准时间 UTC+8
CHINA_TZ = timezone(timedelta(hours=8))
import json
from sqlalchemy.orm import Session
from ultralytics import YOLO
from ..models.detection import DetectionRecord


# ──────────────────────────────────────────────────────────────────────────────
# FFmpeg 管道视频写入器：直接用 libx264 编码，绕过 OpenCV VideoWriter 编解码器依赖
# ──────────────────────────────────────────────────────────────────────────────
class FFmpegVideoWriter:
    """通过 imageio_ffmpeg 管道直接写 H.264 编码的 MP4 视频。
    接口与 cv2.VideoWriter 兼容（write / release / isOpened）。"""

    def __init__(self, output_path: str, fps: float, size: tuple):
        """
        Args:
            output_path: 输出文件路径
            fps: 帧率
            size: (width, height)
        """
        self._opened = False
        self._writer = None
        try:
            import imageio_ffmpeg
            self._writer = imageio_ffmpeg.write_frames(
                output_path,
                size,
                fps=fps,
                codec='libx264',
                pix_fmt_in='bgr24',        # OpenCV BGR 帧
                pix_fmt_out='yuv420p',      # 浏览器兼容
                output_params=['-crf', '23', '-preset', 'fast',
                               '-movflags', '+faststart'],
            )
            self._writer.send(None)  # 初始化生成器
            self._opened = True
        except Exception as e:
            print(f'[FFmpegVideoWriter] 初始化失败: {e}')

    def isOpened(self) -> bool:
        return self._opened

    def write(self, frame):
        if self._opened:
            try:
                self._writer.send(frame.tobytes())
            except Exception as e:
                print(f'[FFmpegVideoWriter] 写入帧失败: {e}')
                self._opened = False

    def release(self):
        if self._opened and self._writer:
            try:
                self._writer.close()
            except Exception as e:
                print(f'[FFmpegVideoWriter] 关闭失败: {e}')
            self._opened = False


# ──────────────────────────────────────────────────────────────────────────────
# 视频会话：每次视频检测创建一个实例，独立线程处理帧，SSE 消费队列
# ──────────────────────────────────────────────────────────────────────────────
class VideoSession:
    def __init__(self, session_id: str, video_path: str, user_id: int,
                 model, class_names_cn: dict, conf: float = 0.25, iou: float = 0.45):
        self.session_id = session_id
        self.video_path = video_path
        self.user_id = user_id
        self.model = model
        self.class_names_cn = class_names_cn
        self.conf = conf
        self.iou = iou

        self._state = 'running'   # 'running' | 'paused' | 'stopped' | 'finished'
        self._lock = threading.Lock()

        # 内存受限的帧队列（maxsize=3 防止大量帧堆积）
        self.frame_queue: queue.Queue = queue.Queue(maxsize=3)

        self.result_video_url: str = ''
        self.all_defects: list = []
        self.max_conf: float = 0.0
        self.main_defect: str = '无缺陷'
        self.total_frames: int = 0
        self.processed_frames: int = 0
        self.fps: float = 25.0
        self._thread: threading.Thread = None

    # ── 状态属性（线程安全）──────────────────────────────────────────────
    @property
    def state(self) -> str:
        with self._lock:
            return self._state

    def pause(self):
        with self._lock:
            if self._state == 'running':
                self._state = 'paused'

    def resume(self):
        with self._lock:
            if self._state == 'paused':
                self._state = 'running'

    def stop(self):
        with self._lock:
            self._state = 'stopped'
        # 排空队列，解除生产者阻塞
        while not self.frame_queue.empty():
            try:
                self.frame_queue.get_nowait()
            except queue.Empty:
                break

    # ── 启动后台线程 ────────────────────────────────────────────────────
    def start(self, db_factory):
        self._thread = threading.Thread(
            target=self._process_video, args=(db_factory,), daemon=True
        )
        self._thread.start()

    # ── 核心处理循环 ────────────────────────────────────────────────────
    def _process_video(self, db_factory):
        from config import BASE_DIR

        cap = None
        out = None
        out_abs_path = ''
        frame_count = 0

        try:
            cap = cv2.VideoCapture(self.video_path)
            if not cap.isOpened():
                self._put_event({'type': 'error', 'message': '无法打开视频文件'})
                return

            self.fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            self.total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            # 输出视频直接写磁盘，避免内存堆积
            results_dir = os.path.join(BASE_DIR, 'backend', 'results')
            os.makedirs(results_dir, exist_ok=True)
            filename = f'result_{self.session_id}.mp4'
            out_abs_path = os.path.join(results_dir, filename)
            # 通过 FFmpeg 管道直接写 H.264 视频
            out = FFmpegVideoWriter(out_abs_path, self.fps, (width, height))
            if not out.isOpened():
                print('[VideoSession] FFmpeg 写入器初始化失败，回退 mp4v')
                fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                out = cv2.VideoWriter(out_abs_path, fourcc, self.fps, (width, height))
            self.result_video_url = f'/results/{filename}'

            while True:
                # 暂停等待
                while self.state == 'paused':
                    time.sleep(0.05)
                if self.state == 'stopped':
                    break

                ret, frame = cap.read()
                if not ret:
                    break  # 视频结束

                # YOLO 推理
                t0 = time.time()
                try:
                    results = self.model(frame, conf=self.conf, iou=self.iou, verbose=False)
                    plotted = results[0].plot()
                except Exception as e:
                    print(f'[VideoSession] 帧 {frame_count} 推理失败: {e}')
                    plotted = frame  # 降级：使用原始帧
                elapsed_ms = int((time.time() - t0) * 1000)

                # 立即写入磁盘（内存效率高）
                out.write(plotted)

                # 提取本帧检测结果
                frame_defects = []
                try:
                    for r in results:
                        if r.boxes is None:
                            continue
                        for box in r.boxes:
                            c_val  = float(box.conf.item())
                            cid    = int(box.cls.item())
                            cn_en  = self.model.names[cid]
                            cn_cn  = self.class_names_cn.get(cn_en, cn_en)
                            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
                            frame_defects.append({
                                'type_en': cn_en, 'type_cn': cn_cn,
                                'confidence': c_val, 'bbox': [x1, y1, x2, y2],
                                'frame': frame_count
                            })
                            if c_val > self.max_conf:
                                self.max_conf = c_val
                                self.main_defect = cn_cn
                except Exception:
                    pass
                self.all_defects.extend(frame_defects)

                # 压缩帧用于 SSE 传输（流式展示，不囤积在内存）
                stream_w = min(width,  960)
                stream_h = int(height * stream_w / width)
                small = cv2.resize(plotted, (stream_w, stream_h))
                _, buf = cv2.imencode('.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, 75])
                frame_b64 = base64.b64encode(buf).decode('utf-8')

                # 原始帧（不带检测框），供前端左侧"原始图像"区域展示，与右侧帧严格同步
                small_orig = cv2.resize(frame, (stream_w, stream_h))
                _, orig_buf = cv2.imencode('.jpg', small_orig, [cv2.IMWRITE_JPEG_QUALITY, 65])
                orig_b64 = base64.b64encode(orig_buf).decode('utf-8')

                self._put_event({
                    'type': 'frame',
                    'frame_b64': frame_b64,
                    'original_b64': orig_b64,
                    'frame_number': frame_count,
                    'total_frames': self.total_frames,
                    'fps': self.fps,
                    'elapsed_ms': elapsed_ms,
                    'new_defects': frame_defects,
                    'total_defects': len(self.all_defects),
                })

                frame_count += 1

        except Exception as e:
            import traceback
            print(f'[VideoSession] 处理异常: {e}')
            traceback.print_exc()
            self._put_event({'type': 'error', 'message': f'处理异常: {str(e)}'})
        finally:
            if cap:  cap.release()
            if out:  out.release()

        self.processed_frames = frame_count

        # 保存历史记录
        if self.result_video_url:
            self._save_to_db(db_factory)

        with self._lock:
            self._state = 'finished'

        # 发送完成事件
        self._put_event({
            'type': 'complete',
            'result_path': self.result_video_url,
            'total_defects': len(self.all_defects),
            'main_defect': self.main_defect,
            'confidence': self.max_conf,
            'total_frames': frame_count,
        }, timeout=10.0)

    def _put_event(self, data: dict, timeout: float = 5.0):
        """安全投入队列，避免无限阻塞"""
        try:
            self.frame_queue.put(data, block=True, timeout=timeout)
        except queue.Full:
            pass  # 消费端消失时丢弃，不崩溃

    def _save_to_db(self, db_factory):
        try:
            db = db_factory()
            try:
                record = DetectionRecord(
                    user_id=self.user_id,
                    image_path=self.video_path,
                    result_path=self.result_video_url,
                    defect_type=self.main_defect if self.main_defect != '无缺陷' else '视频检测完成',
                    confidence=self.max_conf,
                    detection_time=datetime.now(CHINA_TZ),
                )
                db.add(record)
                db.commit()
            finally:
                db.close()
        except Exception as e:
            print(f'[VideoSession] 数据库保存失败: {e}')


# ──────────────────────────────────────────────────────────────────────────────
# 摄像头会话：在内存中积累检测标注帧，停止时合成 MP4 并写入历史记录
# ──────────────────────────────────────────────────────────────────────────────
class CameraSession:
    """积累摄像头实时检测标注帧，调用 finalize() 后合成 MP4 视频并保存至数据库"""
    MAX_FRAMES = 600  # 最多保留约 60 秒 (10 fps)

    def __init__(self, session_id: str, user_id: int, fps: float = 10.0):
        self.session_id = session_id
        self.user_id    = user_id
        self.fps        = fps
        self.frames: list = []          # annotated BGR numpy arrays
        self.all_defects: list = []
        self.max_conf: float  = 0.0
        self.main_defect: str = '无缺陷'
        self.result_video_url: str = ''
        self.created_at: float = time.time()

    def add_frame(self, annotated_bgr, defects: list):
        """追加一帧标注图（BGR numpy），超出 MAX_FRAMES 后静默丢弃"""
        if len(self.frames) >= self.MAX_FRAMES:
            return
        self.frames.append(annotated_bgr)
        self.all_defects.extend(defects)
        for d in defects:
            if d.get('confidence', 0) > self.max_conf:
                self.max_conf    = d['confidence']
                self.main_defect = d.get('type_cn', '未知')

    def finalize(self, db_factory) -> str:
        """合成 MP4 视频并保存数据库；返回视频 URL（无帧时返回空字符串）"""
        if not self.frames:
            return ''

        from config import BASE_DIR
        results_dir  = os.path.join(BASE_DIR, 'backend', 'results')
        os.makedirs(results_dir, exist_ok=True)
        filename     = f'camera_{self.session_id}.mp4'
        out_abs_path = os.path.join(results_dir, filename)

        h, w = self.frames[0].shape[:2]
        # 通过 FFmpeg 管道直接写 H.264 视频
        out = FFmpegVideoWriter(out_abs_path, self.fps, (w, h))
        if not out.isOpened():
            print('[CameraSession] FFmpeg 写入器初始化失败，回退 mp4v')
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out    = cv2.VideoWriter(out_abs_path, fourcc, self.fps, (w, h))

        for frame_bgr in self.frames:
            out.write(frame_bgr)
        out.release()

        self.result_video_url = f'/results/{filename}'

        # 写入历史记录
        try:
            db = db_factory()
            try:
                record = DetectionRecord(
                    user_id    = self.user_id,
                    image_path = f'camera_session_{self.session_id}',
                    result_path= self.result_video_url,
                    defect_type= self.main_defect if self.main_defect != '无缺陷' else '摄像头检测完成',
                    confidence = self.max_conf,
                    detection_time = datetime.now(CHINA_TZ),
                )
                db.add(record)
                db.commit()
            finally:
                db.close()
        except Exception as e:
            print(f'[CameraSession] DB 保存失败: {e}')

        return self.result_video_url




# ──────────────────────────────────────────────────────────────────────────────
class DetectionService:
    def __init__(self, model_path=None):
        self.model_path = model_path or 'model/weights/best1.pt'
        self.class_names_cn = {          # 初始化默认映射，_load_model 成功后会更新
            'crazing': '裂纹', 'inclusion': '夹杂物', 'patches': '斑块',
            'pitted_surface': '麻面', 'rolled-in_scale': '氧化铁皮压入', 'scratches': '划痕'
        }
        self._video_sessions: dict  = {}  # session_id -> VideoSession
        self._camera_sessions: dict = {}  # session_id -> CameraSession，
        self.model = self._load_model()
        self.available_models = {
            "yolov8n": "model/weights/yolov8n.pt",
            "yolov8s": "model/weights/yolov8s.pt",
            "steel_v1": "model/weights/best.pt",
            "steel_base": "model/weights/best1.pt"
        }
    
    def switch_model(self, model_key: str):
        """切换检测模型"""
        if model_key in self.available_models:
            self.model_path = self.available_models[model_key]
            self.model = self._load_model()
            return True, f"已切换到模型: {model_key}"
        return False, f"未找到模型: {model_key}"

    def _load_model(self):
        """加载YOLOv8模型"""
        try:
            # 确保模型路径是绝对路径，尤其是针对存储在根目录的模型
            from config import BASE_DIR
            current_model_path = self.model_path
            
            # 如果是相对路径且文件在根目录或项目目录中
            if not os.path.isabs(current_model_path):
                # 优先检查 backend/ 目录
                potential_path = os.path.join(BASE_DIR, "backend", current_model_path)
                if os.path.exists(potential_path):
                    current_model_path = potential_path
                else:
                    # 检查项目根目录
                    potential_path = os.path.join(BASE_DIR, current_model_path)
                    if os.path.exists(potential_path):
                        current_model_path = potential_path

            print(f"正在加载模型: {current_model_path}")
            # 直接加载，不使用自动下载（如果路径不存在 YOLO 会报错，我们补获它）
            if not os.path.exists(current_model_path):
                print(f"警告: 模型文件 {current_model_path} 未找到，请确保文件已放置在正确位置。")
                return None
                
            model = YOLO(current_model_path)
            # 定义类别映射（中英文）
            self.class_names_cn = {
                'crazing': '裂纹',
                'inclusion': '夹杂物',
                'patches': '斑块',
                'pitted_surface': '麻面',
                'rolled-in_scale': '氧化铁皮压入',
                'scratches': '划痕'
            }
            return model
        except Exception as e:
            print(f"模型加载失败: {e}")
            return None
    
    def detect_defects(self, db: Session, image_path: str, user_id: int, conf=0.25, iou=0.45, batch_id=None):
        """检测图片中的缺陷"""
        if self.model is None:
            print(f"DEBUG: 模型当前为 None，尝试重新加载 {self.model_path}")
            self.model = self._load_model()
            
        if not self.model:
            print("ERROR: 模型加载最终失败")
            return {"success": False, "error": "模型加载失败，请检查权重文件路径"}
        
        try:
            print(f"DEBUG: 开始处理图片: {image_path} (conf={conf}, iou={iou})")
            if not os.path.exists(image_path):
                print(f"ERROR: 文件不存在: {image_path}")
                return {"success": False, "error": "待检测文件不存在"}

            # 读取图片
            image = cv2.imread(image_path)
            if image is None:
                print(f"ERROR: cv2 无法读取图片: {image_path}")
                return {"success": False, "error": "无法读取图片文件内容"}
            
            # 使用YOLOv8进行检测
            print("DEBUG: 正在调用 YOLO 模型推理...")
            results = self.model(image, conf=conf, iou=iou)
            # 推理完成立即记录检测时刻（UTC+8 本地时间）
            detection_time = datetime.now(CHINA_TZ)
            print(f"DEBUG: 推理完成，结果对象数: {len(results)}")
            
            # 解析检测结果
            defects = []
            max_confidence = 0
            defect_type = "无缺陷"
            
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    print(f"DEBUG: 检测到 {len(boxes)} 个目标框")
                    for box in boxes:
                        confidence = box.conf.item()
                        class_id = int(box.cls.item())
                        class_name_en = self.model.names[class_id]
                        class_name_cn = self.class_names_cn.get(class_name_en, class_name_en)
                        
                        # 获取边界框坐标（xyxy 在 Ultralytics 内部已自动映射回原始图像像素）
                        coords = box.xyxy[0].tolist()
                        x1, y1, x2, y2 = [round(float(c), 2) for c in coords]
                        
                        defects.append({
                            "type_en": class_name_en,
                            "type_cn": class_name_cn,
                            "confidence": confidence,
                            "bbox": [x1, y1, x2, y2]
                        })
                        
                        if confidence > max_confidence:
                            max_confidence = confidence
                            defect_type = class_name_cn
            
            print(f"DEBUG: 处理完毕，缺陷数: {len(defects)}，主缺陷类别: {defect_type}")
            # 如果没有检测到缺陷
            if not defects:
                defect_type = "无缺陷"
                max_confidence = 0
            
            # 保存结果图片
            result_image_path = self._save_result_image(image, results)
            print(f"DEBUG: 结果图片已保存至: {result_image_path}")
            
            # 获取图片尺寸用于前端对齐
            h, w = image.shape[:2]
            
            # 保存检测记录到数据库
            try:
                record = DetectionRecord(
                    user_id=user_id,
                    batch_id=batch_id,
                    image_path=image_path,
                    result_path=result_image_path,
                    defect_type=defect_type,
                    confidence=max_confidence,
                    bbox_coordinates=json.dumps(defects),  # 保存全量坐标 JSON
                    detection_time=detection_time
                )
                
                db.add(record)
                db.commit()
                db.refresh(record)
                print(f"DEBUG: 数据库记录保存成功, ID: {record.id}")
            except Exception as db_err:
                db.rollback()
                print(f"ERROR: 数据库保存失败: {db_err}")
                # 即使保存记录失败，也要让检测结果返回给前端，不要直接崩溃
                record_id = None
            else:
                record_id = record.id
            
            return {
                "success": True,
                "defects": defects,
                "result_path": result_image_path,
                "image_path": image_path,
                "defect_type": defect_type,
                "confidence": max_confidence,
                "record_id": record_id,
                "detection_time": detection_time.isoformat(),
                "width": w,
                "height": h
            }
            
        except Exception as e:
            import traceback
            print(f"CRITICAL ERROR in detect_defects: {str(e)}")
            traceback.print_exc()
            return {"success": False, "error": f"检测发生内部错误: {str(e)}"}

    def detect_frame(self, frame_b64: str, conf: float = 0.25, iou: float = 0.45,
                     camera_session_id: str = '') -> dict:
        """对单帧图像进行检测，返回标注帧（base64）和检测结果；若提供 camera_session_id 则积累帧用于后续视频合成。"""
        if self.model is None:
            return {"success": False, "error": "模型未加载"}
        try:
            t0 = time.perf_counter()
            img_bytes = base64.b64decode(frame_b64)
            nparr = np.frombuffer(img_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if image is None:
                return {"success": False, "error": "无法解码图像帧"}

            results = self.model(image, conf=conf, iou=iou)

            defects = []
            max_confidence = 0.0
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    for box in boxes:
                        confidence = float(box.conf.item())
                        class_id = int(box.cls.item())
                        class_name_en = self.model.names[class_id]
                        class_name_cn = self.class_names_cn.get(class_name_en, class_name_en)
                        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
                        defects.append({
                            "type_en": class_name_en,
                            "type_cn": class_name_cn,
                            "confidence": confidence,
                            "bbox": [x1, y1, x2, y2]
                        })
                        if confidence > max_confidence:
                            max_confidence = confidence

            # 生成标注后的帧图像（BGR numpy）
            annotated = results[0].plot() if results else image

            # 若提供了摄像头会话 ID，将标注帧积累到会话中
            if camera_session_id:
                session = self._camera_sessions.get(camera_session_id)
                if session:
                    session.add_frame(annotated.copy(), defects)

            _, buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
            result_b64 = base64.b64encode(buf).decode('utf-8')

            elapsed_ms = (time.perf_counter() - t0) * 1000
            return {
                "success": True,
                "defects": defects,
                "result_frame": result_b64,
                "defect_count": len(defects),
                "max_confidence": max_confidence,
                "elapsed_ms": round(elapsed_ms, 1),
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def detect_video(self, db: Session, video_path: str, user_id: int):
        """检测视频中的缺陷"""
        if not self.model:
            return {"success": False, "error": "模型未加载"}
            
        try:
            from config import BASE_DIR
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                return {"success": False, "error": f"无法读取视频: {video_path}"}
            
            # 创建结果输出
            results_dir = os.path.join(BASE_DIR, "backend/results")
            os.makedirs(results_dir, exist_ok=True)
            filename = f"result_{uuid.uuid4().hex}.mp4"
            out_abs_path = os.path.join(results_dir, filename)
            
            # 获取参数
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            
            # 通过 FFmpeg 管道直接写 H.264 视频
            out = FFmpegVideoWriter(out_abs_path, fps, (width, height))
            if not out.isOpened():
                print('[detect_video] FFmpeg 写入器初始化失败，回退 mp4v')
                fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                out = cv2.VideoWriter(out_abs_path, fourcc, fps, (width, height))
            
            all_defects = []
            max_conf = 0
            main_defect = "无缺陷"
            
            frame_count = 0
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                
                # 每隔 2 帧检测一次以提高处理速度，其余帧跳过
                if frame_count % 2 == 0:
                    results = self.model(frame, verbose=False)
                    plotted_frame = results[0].plot()
                    
                    # 汇总检测结果
                    for r in results:
                        for box in r.boxes:
                            conf = box.conf.item()
                            cid = int(box.cls.item())
                            cname_en = self.model.names[cid]
                            cname_cn = self.class_names_cn.get(cname_en, cname_en)
                            if conf > 0.4:
                                all_defects.append(cname_cn)
                                if conf > max_conf:
                                    max_conf = conf
                                    main_defect = cname_cn
                    out.write(plotted_frame)
                else:
                    out.write(frame)
                
                frame_count += 1
                if frame_count > 300: # 限制视频处理长度（约10秒）
                    break
            
            cap.release()
            out.release()
            
            # 保存视频检测记录 (简化版)
            record = DetectionRecord(
                user_id=user_id,
                image_path=video_path,
                result_path=f"/results/{filename}",
                defect_type=main_defect if main_defect != "无缺陷" else "视频检测完成",
                confidence=max_conf
            )
            db.add(record)
            db.commit()
            
            return {
                "success": True,
                "result_path": f"/results/{filename}",
                "defect_type": main_defect,
                "confidence": max_conf
            }
        except Exception as e:
            return {"success": False, "error": f"视频处理失败: {str(e)}"}

    def _save_result_image(self, image, results):
        """保存带检测结果的图片"""
        try:
            # 获取基础目录
            from config import BASE_DIR
            
            # 创建结果目录（使用绝对路径）
            results_dir = os.path.join(BASE_DIR, "backend/results")
            os.makedirs(results_dir, exist_ok=True)
            
            # 生成唯一文件名
            filename = f"result_{uuid.uuid4().hex}.jpg"
            result_abs_path = os.path.join(results_dir, filename)
            
            # 绘制检测结果
            result_image = results[0].plot()
            
            # 使用 imencode + open 写文件，避免 cv2.imwrite 在含中文路径的 Windows
            # 系统上静默失败（imwrite 内部用 C fopen，不支持非 ASCII 路径）
            success_enc, buf = cv2.imencode('.jpg', result_image)
            if not success_enc or buf is None:
                raise ValueError("cv2.imencode 编码失败")
            with open(result_abs_path, 'wb') as f:
                f.write(buf.tobytes())
            
            # 验证文件确实写入成功
            if not os.path.exists(result_abs_path):
                raise IOError(f"文件写入验证失败: {result_abs_path}")
            
            print(f"DEBUG: 结果图片写入成功，大小: {os.path.getsize(result_abs_path)} bytes")
            # 返回前端访问的相对路径
            return f"/results/{filename}"
        except Exception as e:
            print(f"保存结果图片失败: {e}")
            import traceback; traceback.print_exc()
            return ""
    
    def get_user_records(self, db: Session, user_id: int, limit: int = 10, offset: int = 0):
        """获取用户检测记录（支持分页）"""
        try:
            from sqlalchemy import func
            query = db.query(DetectionRecord).filter(DetectionRecord.user_id == user_id)
            total = query.count()
            # 优先按 detection_time 倒序；旧记录 detection_time 为 NULL 时回落到 created_at
            sort_key = func.coalesce(DetectionRecord.detection_time, DetectionRecord.created_at)
            records = query.order_by(sort_key.desc()).offset(offset).limit(limit).all()
            return records, total
        except Exception as e:
            print(f"获取用户记录失败: {e}")
            return [], 0
    
    def get_record_by_id(self, db: Session, record_id: int, user_id: int):
        """通过ID获取检测记录"""
        try:
            record = db.query(DetectionRecord).filter(
                DetectionRecord.id == record_id,
                DetectionRecord.user_id == user_id
            ).first()
            
            return record
        except Exception as e:
            print(f"获取记录失败: {e}")
            return None
    
    def get_statistics(self, db: Session, user_id: int):
        """获取用户检测统计"""
        try:
            from sqlalchemy import func
            
            # 总检测次数
            total_count = db.query(func.count(DetectionRecord.id)).filter(
                DetectionRecord.user_id == user_id
            ).scalar()
            
            # 缺陷类型分布
            defect_distribution = db.query(
                DetectionRecord.defect_type,
                func.count(DetectionRecord.id)
            ).filter(
                DetectionRecord.user_id == user_id
            ).group_by(DetectionRecord.defect_type).all()
            
            return {
                "total_count": total_count or 0,
                "defect_distribution": dict(defect_distribution)
            }
        except Exception as e:
            print(f"获取统计失败: {e}")
            return {"total_count": 0, "defect_distribution": {}}

    # ── 视频会话管理方法 ────────────────────────────────────────────────
    def create_video_session(self, session_id: str, video_path: str, user_id: int,
                             db_factory, conf: float = 0.25, iou: float = 0.45) -> 'VideoSession':
        """创建并启动视频检测会话"""
        session = VideoSession(
            session_id=session_id,
            video_path=video_path,
            user_id=user_id,
            model=self.model,
            class_names_cn=self.class_names_cn,
            conf=conf,
            iou=iou,
        )
        self._video_sessions[session_id] = session
        session.start(db_factory)
        return session

    def get_video_session(self, session_id: str) -> 'VideoSession':
        return self._video_sessions.get(session_id)

    def remove_video_session(self, session_id: str):
        self._video_sessions.pop(session_id, None)

    # ── 摄像头会话管理方法 ───────────────────────────────────────────────
    def create_camera_session(self, session_id: str, user_id: int,
                              fps: float = 10.0) -> 'CameraSession':
        """创建摄像头录制会话"""
        session = CameraSession(session_id, user_id, fps)
        self._camera_sessions[session_id] = session
        return session

    def get_camera_session(self, session_id: str) -> 'CameraSession':
        return self._camera_sessions.get(session_id)

    def remove_camera_session(self, session_id: str):
        self._camera_sessions.pop(session_id, None)


    def delete_user_record(self, db: Session, record_id: int, user_id: int):
        """删除单条检测记录及其关联的物理文件"""
        try:
            from config import BASE_DIR
            record = self.get_record_by_id(db, record_id, user_id)
            if not record:
                return False, "记录不存在或无权操作"
            
            # 删除物理文件 (result_path 通常是相对路径，如 /results/xxx.jpg)
            res_rel = record.result_path.lstrip('/')
            res_abs = os.path.join(BASE_DIR, "backend", res_rel)
            if os.path.exists(res_abs):
                try:
                    os.remove(res_abs)
                    print(f"DEBUG: 已删除物理文件: {res_abs}")
                except Exception as e:
                    print(f"WARNING: 物理文件删除失败: {e}")
            
            # 从数据库删除
            db.delete(record)
            db.commit()
            return True, "删除成功"
        except Exception as e:
            db.rollback()
            return False, str(e)

    def delete_user_records_batch(self, db: Session, record_ids: list, user_id: int):
        """批量删除记录"""
        success_count = 0
        errors = []
        for rid in record_ids:
            ok, msg = self.delete_user_record(db, rid, user_id)
            if ok:
                success_count += 1
            else:
                errors.append(f"ID {rid}: {msg}")
        return success_count, errors

# 创建全局检测服务实例
detection_service = DetectionService()