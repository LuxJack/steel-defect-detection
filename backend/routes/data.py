"""
数据统计路由 - FastAPI版本
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import func
from ..database import SessionLocal
from ..models.detection import DetectionRecord
from ..models.user import User
from .auth import get_current_user

router = APIRouter()

class StatsResponse(BaseModel):
    today_count: int
    week_count: int
    month_count: int
    total_count: int
    defect_distribution: Dict[str, int]

@router.get("/model-performance")
async def get_model_performance(current_user: User = Depends(get_current_user)):
    """获取模型训练性能指标集"""
    # 模拟真实训练指标，通常从本地 model/train/results.csv 读取
    # 这里为了演示直接返回常见的钢材缺陷检测指标
    return {
        "success": True,
        "metrics": {
            "mAP50": 0.856,
            "mAP50-95": 0.542,
            "precision": 0.884,
            "recall": 0.812,
            "classes": [
                {"name": "裂纹", "precision": 0.82, "recall": 0.78, "mAP50": 0.81},
                {"name": "夹杂物", "precision": 0.89, "recall": 0.85, "mAP50": 0.87},
                {"name": "斑块", "precision": 0.91, "recall": 0.88, "mAP50": 0.90},
                {"name": "麻面", "precision": 0.85, "recall": 0.80, "mAP50": 0.83},
                {"name": "氧化铁皮压入", "precision": 0.88, "recall": 0.82, "mAP50": 0.86},
                {"name": "划痕", "precision": 0.93, "recall": 0.90, "mAP50": 0.92}
            ],
            "training_history": [
                {"epoch": 1, "loss": 2.1, "mAP": 0.2},
                {"epoch": 10, "loss": 1.5, "mAP": 0.45},
                {"epoch": 50, "loss": 0.8, "mAP": 0.75},
                {"epoch": 100, "loss": 0.5, "mAP": 0.85}
            ]
        }
    }

@router.get("/stats")
async def get_detection_stats(current_user: User = Depends(get_current_user)):
    """获取检测统计数据"""
    try:
        today = datetime.now().date()
        week_ago = today - timedelta(days=7)
        month_ago = today - timedelta(days=30)
        
        db = SessionLocal()
        try:
            # 今日检测数量
            today_count = db.query(DetectionRecord).filter(
                DetectionRecord.user_id == current_user.id,
                func.date(DetectionRecord.created_at) == today
            ).count()
            
            # 本周检测数量
            week_count = db.query(DetectionRecord).filter(
                DetectionRecord.user_id == current_user.id,
                DetectionRecord.created_at >= week_ago
            ).count()
            
            # 本月检测数量
            month_count = db.query(DetectionRecord).filter(
                DetectionRecord.user_id == current_user.id,
                DetectionRecord.created_at >= month_ago
            ).count()
            
            # 总检测数量
            total_count = db.query(DetectionRecord).filter(
                DetectionRecord.user_id == current_user.id
            ).count()
            
            # 缺陷类型分布
            defect_distribution = db.query(
                DetectionRecord.defect_type,
                func.count(DetectionRecord.id)
            ).filter(
                DetectionRecord.user_id == current_user.id
            ).group_by(DetectionRecord.defect_type).all()
            
            defect_distribution_dict = {}
            for defect_type, count in defect_distribution:
                defect_distribution_dict[defect_type] = count
            
            return {
                "success": True,
                "stats": {
                    "today_count": today_count,
                    "week_count": week_count,
                    "month_count": month_count,
                    "total_count": total_count,
                    "defect_distribution": defect_distribution_dict
                }
            }
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统计数据失败: {str(e)}")

@router.get("/recent-detections")
async def get_recent_detections(
    limit: int = 5,
    current_user: User = Depends(get_current_user)
):
    """获取最近检测记录"""
    try:
        db = SessionLocal()
        try:
            recent_detections = db.query(DetectionRecord).filter(
                DetectionRecord.user_id == current_user.id
            ).order_by(DetectionRecord.created_at.desc()).limit(limit).all()
            
            return {
                "success": True,
                "recent_detections": [
                    {
                        "id": record.id,
                        "defect_type": record.defect_type,
                        "confidence": record.confidence,
                        "created_at": record.created_at.isoformat()
                    }
                    for record in recent_detections
                ]
            }
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取最近检测记录失败: {str(e)}")

@router.get("/defect-analysis")
async def get_defect_analysis(current_user: User = Depends(get_current_user)):
    """获取缺陷分析数据"""
    try:
        db = SessionLocal()
        try:
            # 获取最近30天的检测数据
            thirty_days_ago = datetime.now() - timedelta(days=30)
            
            daily_stats = db.query(
                func.date(DetectionRecord.created_at).label('date'),
                func.count(DetectionRecord.id).label('count'),
                func.avg(DetectionRecord.confidence).label('avg_confidence')
            ).filter(
                DetectionRecord.user_id == current_user.id,
                DetectionRecord.created_at >= thirty_days_ago
            ).group_by(func.date(DetectionRecord.created_at)).all()
            
            return {
                "success": True,
                "analysis": {
                    "daily_stats": [
                        {
                            "date": stat.date.isoformat(),
                            "count": stat.count,
                            "avg_confidence": float(stat.avg_confidence) if stat.avg_confidence else 0
                        }
                        for stat in daily_stats
                    ]
                }
            }
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取缺陷分析数据失败: {str(e)}")