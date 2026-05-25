"""
钢材缺陷检测系统 - FastAPI应用入口
"""

import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# 添加项目根目录到Python路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.database import engine, Base, run_migrations
from backend.routes import auth, detect, data, stream

# 创建数据库表
Base.metadata.create_all(bind=engine)
# 对已存在的数据库执行字段迁移（新增 detection_time 等）
run_migrations()

# 创建FastAPI应用
app = FastAPI(
    title="钢材缺陷检测系统",
    description="基于YOLOv8的智能钢材缺陷检测平台",
    version="1.0.0"
)

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件
app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")
app.mount("/uploads", StaticFiles(directory="backend/uploads"), name="uploads")
app.mount("/results", StaticFiles(directory="backend/results"), name="results")

# 注册API路由
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(detect.router, prefix="/api/detect", tags=["检测"])
app.include_router(data.router, prefix="/api/data", tags=["数据"])
app.include_router(stream.router, prefix="/api/stream", tags=["推流"])

@app.get("/")
async def root():
    """根路径 - 返回前端页面"""
    from fastapi.responses import FileResponse
    return FileResponse("frontend/index.html")

@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "service": "steel-defect-detection",
        "version": "1.0.0"
    }

@app.get("/api/info")
async def system_info():
    """系统信息"""
    return {
        "name": "钢材缺陷检测系统",
        "version": "1.0.0",
        "description": "基于YOLOv8的智能钢材缺陷检测平台",
        "author": "Steel Defect Detection Team",
        "api_version": "v1"
    }

if __name__ == "__main__":
    import uvicorn
    
    # 创建必要的目录
    os.makedirs("backend/uploads", exist_ok=True)
    os.makedirs("backend/results", exist_ok=True)
    os.makedirs("frontend/static", exist_ok=True)
    os.makedirs("frontend/assets", exist_ok=True)
    
    print("=" * 50)
    print("钢材缺陷检测系统")
    print("=" * 50)
    print("访问地址: http://localhost:8000")
    print("API文档: http://localhost:8000/docs")
    print("=" * 50)
    
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )