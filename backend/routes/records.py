"""
检测记录路由
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..services.detection_service import detection_service

records_bp = Blueprint('records', __name__)

@records_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_detection_stats():
    """获取检测统计"""
    try:
        user_id = get_jwt_identity()
        
        stats = detection_service.get_detection_stats(user_id)
        
        return jsonify({
            "success": True,
            "stats": stats
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "获取统计数据失败"
        }), 500

@records_bp.route('/recent', methods=['GET'])
@jwt_required()
def get_recent_detections():
    """获取最近检测记录"""
    try:
        user_id = get_jwt_identity()
        
        limit = request.args.get('limit', 5, type=int)
        limit = min(limit, 20)  # 最大20条
        
        records = detection_service.get_detection_history(user_id, limit, 0)
        
        return jsonify({
            "success": True,
            "recent_detections": records
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "获取最近检测记录失败"
        }), 500

@records_bp.route('/defect-types', methods=['GET'])
def get_defect_types():
    """获取缺陷类型列表"""
    try:
        defect_types = [
            {"name": "裂纹", "value": "crack", "color": "#ff6b6b"},
            {"name": "锈蚀", "value": "rust", "color": "#4ecdc4"},
            {"name": "凹坑", "value": "pit", "color": "#45b7d1"},
            {"name": "划痕", "value": "scratch", "color": "#96ceb4"},
            {"name": "变形", "value": "deformation", "color": "#feca57"},
            {"name": "无缺陷", "value": "no_defect", "color": "#54a0ff"}
        ]
        
        return jsonify({
            "success": True,
            "defect_types": defect_types
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "获取缺陷类型失败"
        }), 500

@records_bp.route('/delete/<int:record_id>', methods=['DELETE'])
@jwt_required()
def delete_detection_record(record_id):
    """删除检测记录"""
    try:
        user_id = get_jwt_identity()
        
        from ..models.record import DetectionRecord
        record = DetectionRecord.query.filter_by(id=record_id, user_id=user_id).first()
        
        if not record:
            return jsonify({"success": False, "error": "记录不存在"}), 404
        
        # 删除记录
        from .. import db
        db.session.delete(record)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "记录删除成功"
        })
        
    except Exception as e:
        from .. import db
        db.session.rollback()
        return jsonify({
            "success": False,
            "error": "删除记录失败"
        }), 500

@records_bp.route('/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        "status": "healthy",
        "service": "steel-defect-detection-records"
    })