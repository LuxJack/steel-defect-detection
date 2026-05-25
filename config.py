"""
系统配置文件
"""

import os

# 基础配置
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SECRET_KEY = 'your-secret-key-change-in-production'
DEBUG = True

# 数据库配置
SQLALCHEMY_DATABASE_URL = 'sqlite:///database/steel_defect.db'
SQLALCHEMY_TRACK_MODIFICATIONS = False

# 文件上传配置
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'backend/uploads')
RESULTS_FOLDER = os.path.join(BASE_DIR, 'backend/results')
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

# 模型配置
MODEL_PATH = os.path.join(BASE_DIR, 'model/weights/best.pt')
DEFAULT_MODEL = 'yolov8n.pt'

# JWT配置
JWT_SECRET_KEY = 'jwt-secret-key-change-in-production'
JWT_ACCESS_TOKEN_EXPIRES = 3600  # 1小时

# CORS配置
CORS_ORIGINS = [
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
]