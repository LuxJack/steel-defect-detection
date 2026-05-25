"""
工具函数 - FastAPI版本
"""

import os
import uuid
from fastapi import UploadFile

def allowed_file(filename: str) -> bool:
    """检查文件类型是否允许"""
    allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'mp4', 'avi', 'mov'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

def validate_file(file: UploadFile) -> dict:
    """验证上传文件 (图片或视频)"""
    try:
        # 检查文件类型
        filename = file.filename
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
        
        is_video = ext in {'mp4', 'avi', 'mov'}
        
        if not allowed_file(filename):
            return {"valid": False, "error": "不支持的文件类型"}
        
        # 检查文件大小
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        
        limit = 50 * 1024 * 1024 if is_video else 10 * 1024 * 1024
        
        if file_size > limit:
            return {"valid": False, "error": f"文件大小超过限制 ({'50MB' if is_video else '10MB'})"}
        
        return {"valid": True, "error": "", "is_video": is_video}
    except Exception as e:
        return {"valid": False, "error": f"文件验证失败: {str(e)}"}

def save_uploaded_file(file: UploadFile) -> str:
    """保存上传的文件"""
    try:
        # 获取基础目录
        from config import BASE_DIR
        
        # 创建上传目录（使用绝对路径）
        uploads_dir = os.path.join(BASE_DIR, "backend/uploads")
        os.makedirs(uploads_dir, exist_ok=True)
        
        # 生成安全的文件名
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4().hex}{file_extension}"
        
        file_abs_path = os.path.join(uploads_dir, unique_filename)
        
        # 保存文件
        with open(file_abs_path, "wb") as buffer:
            content = file.file.read()
            buffer.write(content)
        
        # 返回可以在后端代码中直接访问的路径（相对于 BASE_DIR）
        # 或者返回绝对路径，但为了后续逻辑一致性，这里返回绝对路径
        return file_abs_path
    except Exception as e:
        print(f"保存文件失败: {e}")
        return ""

def get_file_extension(filename: str) -> str:
    """获取文件扩展名"""
    return os.path.splitext(filename)[1].lower()

def generate_unique_filename(original_filename: str) -> str:
    """生成唯一文件名"""
    file_extension = get_file_extension(original_filename)
    return f"{uuid.uuid4().hex}{file_extension}"

def ensure_directory_exists(directory: str):
    """确保目录存在"""
    os.makedirs(directory, exist_ok=True)

def format_file_size(size_bytes: int) -> str:
    """格式化文件大小"""
    if size_bytes == 0:
        return "0B"
    
    size_names = ["B", "KB", "MB", "GB"]
    i = 0
    while size_bytes >= 1024 and i < len(size_names) - 1:
        size_bytes /= 1024
        i += 1
    
    return f"{size_bytes:.2f}{size_names[i]}"