
import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from ..services.detection_service import detection_service

router = APIRouter()

@router.websocket("/ws/stream/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, token: str = Query(None)):
    """
    WebSocket 实时推流接口
    - session_id: 视频/摄像头检测会话 ID
    - token: 鉴权令牌 (Query 参数)
    """
    await websocket.accept()
    print(f"[WebSocket] Client connected: session_id={session_id}")
    
    # 获取对应的检测会话
    session = detection_service.get_video_session(session_id)
    if not session:
        session = detection_service.get_camera_session(session_id)
        
    if not session:
        print(f"[WebSocket] Session not found: {session_id}")
        await websocket.send_json({"type": "error", "message": "会话不存在或已过期"})
        await websocket.close()
        return

    try:
        loop = asyncio.get_event_loop()
        import queue as _queue
        
        while True:
            try:
                # 获取队列中的帧数据（超时设置为 5 秒，触发心跳）
                data = await loop.run_in_executor(
                    None, lambda: session.frame_queue.get(timeout=5.0)
                )
                
                # 发送 JSON 数据到前端
                await websocket.send_json(data)

                # 任务完成或报错则退出
                if data.get("type") in ("complete", "error"):
                    print(f"[WebSocket] Detection {data.get('type')}: {session_id}")
                    break
                    
            except _queue.Empty:
                # 检查会话状态是否已完成
                if getattr(session, 'state', None) == 'finished':
                    await websocket.send_json({
                        "type": "complete",
                        "result_path": getattr(session, 'result_video_url', ''),
                        "total_defects": len(getattr(session, 'all_defects', [])),
                        "main_defect": getattr(session, 'main_defect', '无缺陷'),
                        "confidence": getattr(session, 'max_conf', 0.0),
                        "total_frames": getattr(session, 'processed_frames', 0)
                    })
                    break
                
                # 发送心跳以保持长连接
                try:
                    await websocket.send_json({"type": "heartbeat"})
                except:
                    break

    except WebSocketDisconnect:
        print(f"[WebSocket] Client disconnected: {session_id}")
    except RuntimeError as e:
        if "Unexpected ASGI message 'websocket.disconnect'" in str(e):
            print(f"[WebSocket] ASGI disconnect ignored for {session_id}")
        else:
            print(f"[WebSocket] Runtime Error: {e}")
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
    finally:
        # 确保清理会话引用
        detection_service.remove_video_session(session_id)
        detection_service.remove_camera_session(session_id)
        try:
            await websocket.close()
        except:
            pass
