"""
缺陷检测路由 - FastAPI版本
"""

import os
import uuid
import json
import asyncio
from typing import List
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from ..services.detection_service import detection_service
from ..utils.helpers import validate_file, save_uploaded_file
from ..database import SessionLocal
from ..models.user import User
from .auth import get_current_user
from ..services.user_service import user_service

router = APIRouter()

security_optional = HTTPBearer(auto_error=False)

async def get_current_user_flexible(
    credentials: HTTPAuthorizationCredentials = Depends(security_optional),
    token: str = Query(default=None, description="URL 传参 token（SSE 专用）"),
):
    """同时支持 Authorization header 和 ?token= 查询参数（SSE 无法设置 header）"""
    raw = None
    if credentials:
        raw = credentials.credentials
    elif token:
        raw = token

    if not raw:
        raise HTTPException(status_code=401, detail="未提供认证令牌")

    db = SessionLocal()
    try:
        user = user_service.get_user_by_token(db, raw)
        if not user:
            raise HTTPException(status_code=401, detail="无效的认证令牌")
        return user
    finally:
        db.close()

class ModelSwitchRequest(BaseModel):
    model_name: str

@router.post("/switch-model")
async def switch_model(
    request: ModelSwitchRequest,
    current_user: User = Depends(get_current_user)
):
    """切换检测使用的模型"""
    success, message = detection_service.switch_model(request.model_name)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@router.post("/upload-model")
async def upload_model(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """上传本地模型文件（.pt / .onnx），保存至 model/weights/ 并立即加载"""
    # 校验扩展名
    original_name = file.filename or ""
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in (".pt", ".onnx"):
        raise HTTPException(status_code=400, detail="仅支持 .pt 或 .onnx 格式的模型文件")

    from config import BASE_DIR
    weights_dir = os.path.join(BASE_DIR, "model", "weights")
    os.makedirs(weights_dir, exist_ok=True)

    # 安全化文件名：仅保留字母、数字、下划线、连字符和扩展名
    safe_name = "".join(c for c in os.path.splitext(original_name)[0] if c.isalnum() or c in ("_", "-")) or "custom_model"
    save_name = f"{safe_name}{ext}"
    save_path = os.path.join(weights_dir, save_name)

    # 写入文件
    try:
        contents = await file.read()
        with open(save_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"模型文件保存失败: {str(e)}")

    # 释放旧模型并加载新模型（在线程池中执行避免阻塞事件循环）
    import asyncio
    loop = asyncio.get_event_loop()

    def _load():
        detection_service.model_path = save_path
        detection_service.model = detection_service._load_model()
        return detection_service.model is not None

    try:
        ok = await loop.run_in_executor(None, _load)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"模型加载异常: {str(e)}")

    if not ok:
        raise HTTPException(status_code=500, detail="模型文件加载失败，请确认文件为有效的 YOLO 权重")

    return {"success": True, "message": f"模型 '{original_name}' 加载成功", "model_name": save_name}

@router.get("/available-models")
async def get_models(current_user: User = Depends(get_current_user)):
    """获取可用模型列表"""
    return {
        "success": True, 
        "models": [
            {"id": "yolov8n", "name": "YOLOv8 Nano (本地模型)"},
            {"id": "yolov8s", "name": "YOLOv8 Small (待上传)"},
            {"id": "steel_v1", "name": "钢材缺陷专用模型 (精度优先)"}
        ]
    }

@router.post("/upload")
async def upload_and_detect(
    file: UploadFile = File(...),
    conf_threshold: float = Form(0.25),
    iou_threshold: float = Form(0.45),
    batch_id: str = Form(None),
    current_user: User = Depends(get_current_user)
):
    """联合上传与检测接口 (支持图片与视频)"""
    try:
        # 验证文件
        validation_result = validate_file(file)
        if not validation_result["valid"]:
            raise HTTPException(status_code=400, detail=validation_result["error"])
        
        is_video = validation_result.get("is_video", False)
        
        # 保存上传文件
        saved_file_path = save_uploaded_file(file)
        
        # 数据库操作
        db = SessionLocal()
        try:
            if is_video:
                result = detection_service.detect_video(db, saved_file_path, current_user.id)
            else:
                print(f"DEBUG: 接口收到阈值 conf={conf_threshold}, iou={iou_threshold}, batch_id={batch_id}")
                result = detection_service.detect_defects(
                    db, 
                    saved_file_path, 
                    current_user.id, 
                    conf=conf_threshold, 
                    iou=iou_threshold,
                    batch_id=batch_id
                )
            
            if result["success"]:
                return {
                    "success": True,
                    "is_video": is_video,
                    "defects": result.get("defects", []),
                    "result_path": result["result_path"],
                    "defect_type": result["defect_type"],
                    "confidence": result["confidence"],
                    "record_id": result.get("record_id"),
                    "detection_time": result.get("detection_time"),
                    "width": result.get("width"),
                    "height": result.get("height")
                }
            else:
                raise HTTPException(status_code=500, detail=result["error"])
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"检测失败: {str(e)}")

@router.post("/image")
async def detect_image(
    file: UploadFile = File(...),
    conf_threshold: float = Form(0.25),
    iou_threshold: float = Form(0.45),
    current_user: User = Depends(get_current_user)
):
    """图片缺陷检测"""
    print(f"收到图片上传请求: {file.filename}, conf={conf_threshold}")
    try:
        # 验证文件
        validation_result = validate_file(file)
        if not validation_result["valid"]:
            print(f"文件验证失败: {validation_result['error']}")
            raise HTTPException(status_code=400, detail=validation_result["error"])
        
        # 保存上传文件
        saved_file_path = save_uploaded_file(file)
        if not saved_file_path:
            print("保存上传文件失败")
            raise HTTPException(status_code=500, detail="保存上传文件失败")
        
        print(f"文件已保存至: {saved_file_path}")
        
        # 进行缺陷检测
        db = SessionLocal()
        try:
            print(f"调用检测服务... 文件路径: {saved_file_path}")
            result = detection_service.detect_defects(
                db, 
                saved_file_path, 
                current_user.id,
                conf=conf_threshold,
                iou=iou_threshold
            )
            print(f"检测服务返回结果成功状态: {result.get('success')}")
            if not result.get("success"):
                print(f"检测失败详情: {result.get('error')}")
            
            if result["success"]:
                return {
                    "success": True,
                    "defects": result["defects"],
                    "result_path": result["result_path"],
                    "image_path": result["image_path"],
                    "defect_type": result["defect_type"],
                    "confidence": result["confidence"]
                }
            else:
                raise HTTPException(status_code=500, detail=result.get("error", "未知检测错误"))
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"检测失败: {str(e)}")

@router.post("/upload_folder")
async def upload_folder_files(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user)
):
    """批量上传图片文件夹：保存所有文件并返回服务器路径列表供后续逐张检测使用"""
    saved_paths = []
    errors = []
    for file in files:
        try:
            validation_result = validate_file(file)
            if not validation_result["valid"] or validation_result.get("is_video"):
                errors.append({"filename": file.filename, "reason": validation_result.get("error", "不支持的文件类型")})
                continue
            path = save_uploaded_file(file)
            if path:
                saved_paths.append({"filename": file.filename, "path": path})
            else:
                errors.append({"filename": file.filename, "reason": "保存失败"})
        except Exception as e:
            errors.append({"filename": file.filename, "reason": str(e)})
    return {
        "success": True,
        "saved": saved_paths,
        "saved_count": len(saved_paths),
        "error_count": len(errors),
        "errors": errors,
    }

@router.get("/history")
async def get_detection_history(
    limit: int = 100, # Increased limit for grouping
    offset: int = 0,
    current_user: User = Depends(get_current_user)
):
    """获取检测历史（支持分页并根据 batch_id 分组）"""
    import json
    try:
        db = SessionLocal()
        try:
            records, total = detection_service.get_user_records(db, current_user.id, limit, offset)
            
            output = []
            batch_map = {}
            for record in records:
                # Resolve timestamps
                created_iso = record.created_at.isoformat() if record.created_at else None
                detect_iso = (
                    record.detection_time.isoformat()
                    if record.detection_time
                    else created_iso
                )
                
                # Parse bbox
                bbox = []
                if record.bbox_coordinates:
                    try:
                        bbox = json.loads(record.bbox_coordinates)
                    except:
                        pass
                        
                record_data = {
                    "id": record.id,
                    "image_path": record.image_path,
                    "result_path": record.result_path,
                    "defect_type": record.defect_type,
                    "confidence": record.confidence,
                    "created_at": created_iso,
                    "detection_time": detect_iso,
                    "bbox_coordinates": bbox
                }
                
                if not record.batch_id:
                    output.append({
                        "type": "single",
                        "data": record_data
                    })
                else:
                    if record.batch_id not in batch_map:
                        batch_obj = {
                            "type": "batch",
                            "batch_id": record.batch_id,
                            "created_at": detect_iso, 
                            "children": []
                        }
                        batch_map[record.batch_id] = batch_obj
                        output.append(batch_obj)
                        
                    batch_map[record.batch_id]["children"].append(record_data)

            return {
                "success": True,
                "total": total,
                "records": output
            }
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取历史失败: {str(e)}")

@router.delete("/history/{record_id}")
async def delete_detection_record(
    record_id: int,
    current_user: User = Depends(get_current_user)
):
    """删除单条检测历史记录"""
    db = SessionLocal()
    try:
        success, message = detection_service.delete_user_record(db, record_id, current_user.id)
        if not success:
            raise HTTPException(status_code=403 if "无权" in message else 404, detail=message)
        return {"success": True, "message": message}
    finally:
        db.close()

class BatchDeleteRequest(BaseModel):
    record_ids: List[int]

@router.post("/history/batch-delete")
async def delete_detection_records_batch(
    request: BatchDeleteRequest,
    current_user: User = Depends(get_current_user)
):
    """批量删除检测历史记录"""
    db = SessionLocal()
    try:
        success_count, errors = detection_service.delete_user_records_batch(db, request.record_ids, current_user.id)
        return {
            "success": True, 
            "success_count": success_count,
            "error_count": len(errors),
            "errors": errors
        }
    finally:
        db.close()

import io
import zipfile
from fastapi.responses import StreamingResponse

@router.get("/history/batch/{batch_id}/download")
async def download_batch_history(
    batch_id: str,
    current_user: User = Depends(get_current_user)
):
    """将整个文件夹的检测结果打包为 ZIP 下载"""
    db = SessionLocal()
    try:
        from backend.models.detection import DetectionRecord
        records = db.query(DetectionRecord).filter(
            DetectionRecord.user_id == current_user.id,
            DetectionRecord.batch_id == batch_id
        ).all()
        
        if not records:
            raise HTTPException(status_code=404, detail="未找到该批次的图像")
            
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            from config import BASE_DIR
            for record in records:
                if record.result_path:
                    # Parse the physical path from the relative path stored in DB
                    # e.g., "/results/filename.jpg" -> "backend/results/filename.jpg"
                    if record.result_path.startswith('/results/'):
                        relative_path = f"backend/results/{record.result_path[9:]}"
                    else:
                        relative_path = record.result_path.lstrip('/')
                        
                    physical_path = os.path.join(BASE_DIR, relative_path)
                    
                    if os.path.exists(physical_path):
                        filename = os.path.basename(physical_path)
                        zip_file.write(physical_path, filename)
        
        # 准备返回给客户端
        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer, 
            media_type="application/zip", 
            headers={"Content-Disposition": f"attachment; filename=batch_{batch_id}.zip"}
        )
    finally:
        db.close()


@router.get("/record/{record_id}")
async def get_detection_record(
    record_id: int,
    current_user: User = Depends(get_current_user)
):
    """获取特定检测记录"""
    try:
        db = SessionLocal()
        try:
            record = detection_service.get_record_by_id(db, record_id, current_user.id)
            
            if not record:
                raise HTTPException(status_code=404, detail="记录不存在")
            
            import json
            bbox = []
            if record.bbox_coordinates:
                try:
                    bbox = json.loads(record.bbox_coordinates)
                except:
                    pass
            
            return {
                "success": True,
                "record": {
                    "id": record.id,
                    "image_path": record.image_path,
                    "result_path": record.result_path,
                    "defect_type": record.defect_type,
                    "confidence": record.confidence,
                    "created_at": record.created_at.isoformat(),
                    "bbox_coordinates": bbox
                }
            }
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取记录失败: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════════
# 视频实时检测接口（上传 → SSE 流 → 控制）
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/video-start")
async def video_start(
    file: UploadFile = File(...),
    conf_threshold: float = Form(0.25),
    iou_threshold: float = Form(0.45),
    current_user: User = Depends(get_current_user),
):
    """上传视频文件，创建检测会话，返回 session_id"""
    validation_result = validate_file(file)
    if not validation_result["valid"]:
        raise HTTPException(status_code=400, detail=validation_result["error"])
    if not validation_result.get("is_video"):
        raise HTTPException(status_code=400, detail="请上传视频文件（mp4 / avi / mov）")

    if detection_service.model is None:
        raise HTTPException(status_code=500, detail="模型未加载，请检查权重文件")

    saved_path = save_uploaded_file(file)
    session_id = uuid.uuid4().hex

    detection_service.create_video_session(
        session_id=session_id,
        video_path=saved_path,
        user_id=current_user.id,
        db_factory=SessionLocal,
        conf=conf_threshold,
        iou=iou_threshold,
    )

    return {"success": True, "session_id": session_id}


@router.get("/video-stream/{session_id}")
async def video_stream(
    session_id: str,
    current_user: User = Depends(get_current_user_flexible),
):
    """SSE 接口：实时推送视频检测帧（base64 JPEG + 检测结果）"""
    session = detection_service.get_video_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或已过期")

    async def event_generator():
        loop = asyncio.get_event_loop()
        import queue as _queue
        try:
            while True:
                try:
                    data = await loop.run_in_executor(
                        None, lambda: session.frame_queue.get(timeout=8.0)
                    )
                    yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

                    if data.get("type") in ("complete", "error"):
                        break
                except _queue.Empty:
                    # 只有 finished 才发送合成完成事件；
                    # 'stopped' 是用户请求停止，后端可能仍在处理最后帧并将自行推送 complete
                    if session.state == 'finished':
                        yield f"data: {json.dumps({'type': 'complete', 'result_path': session.result_video_url, 'total_defects': len(session.all_defects), 'main_defect': session.main_defect, 'confidence': session.max_conf, 'total_frames': session.processed_frames})}\n\n"
                        break
                    # 心跳保活
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        finally:
            detection_service.remove_video_session(session_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/video-control/{session_id}")
async def video_control(
    session_id: str,
    action: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    """控制视频检测会话：pause / resume / stop"""
    session = detection_service.get_video_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    if action == "pause":
        session.pause()
    elif action == "resume":
        session.resume()
    elif action == "stop":
        session.stop()
    else:
        raise HTTPException(status_code=400, detail=f"未知操作: {action}")

    return {"success": True, "state": session.state}


# ══════════════════════════════════════════════════════════════════════════════
# 摄像头实时帧检测接口
# ══════════════════════════════════════════════════════════════════════════════

class CameraFrameRequest(BaseModel):
    frame: str            # base64 编码的 JPEG 帧
    conf_threshold: float = 0.25
    iou_threshold: float  = 0.45
    camera_session_id: str = ''   # 可选：摄像头录制会话 ID，提供时后端积累帧用于视频合成


@router.post("/camera-frame")
async def detect_camera_frame(
    request: CameraFrameRequest, 
    current_user: User = Depends(get_current_user),
):
    """摄像头单帧检测：接收 base64 JPEG → YOLO 推理 → 返回标注帧 + 缺陷列表"""
    if detection_service.model is None:
        raise HTTPException(status_code=500, detail="模型未加载，请检查权重文件")

    result = detection_service.detect_frame(
        request.frame,
        conf=request.conf_threshold,
        iou=request.iou_threshold,
        camera_session_id=request.camera_session_id,
    )
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "帧检测失败"))
    return result


@router.post("/camera-session/start")
async def camera_session_start(
    current_user: User = Depends(get_current_user),
):
    """创建摄像头录制会话，返回 session_id"""
    session_id = uuid.uuid4().hex
    detection_service.create_camera_session(session_id, current_user.id)
    return {"success": True, "session_id": session_id}


@router.post("/camera-session/{session_id}/stop")
async def camera_session_stop(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    """停止摄像头录制会话，将帧列表合成为 MP4 视频并保存历史记录"""
    session = detection_service.get_camera_session(session_id)
    if not session:
        return {"success": True, "video_url": "", "message": "会话不存在或已过期"}

    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权操作此会话")

    if not session.frames:
        detection_service.remove_camera_session(session_id)
        return {"success": True, "video_url": "", "message": "无有效帧数据"}

    # 在线程池中合成视频，避免阻塞事件循环
    import asyncio
    loop = asyncio.get_event_loop()
    video_url = await loop.run_in_executor(
        None, lambda: session.finalize(SessionLocal)
    )
    detection_service.remove_camera_session(session_id)
    return {"success": True, "video_url": video_url, "total_frames": len(session.frames)}