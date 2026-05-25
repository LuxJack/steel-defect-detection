# 使用官方 Python 3.10 薄镜像作为基础镜像
FROM python:3.10-slim

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Asia/Shanghai

# 安装系统依赖 (OpenCV需要的底层库)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制依赖文件并安装 Python 包
COPY requirements.txt .

# 使用国内源加速依赖安装 (如果你在墙外，可以去掉 -i 参数)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 复制整个项目到工作目录 
# (注意：.dockerignore中已经配置了要忽略的无用文件，如 .git, 数据库, 历史图片等)
COPY . .

# 暴露端口，与 FastAPI 使用的端口保持一致
EXPOSE 8000

# 创建必要的文件目录
RUN mkdir -p backend/uploads backend/results frontend/static frontend/assets database

# 初始化数据库结构 (在启动前执行)
RUN python reset_db.py

# 启动 FastAPI 应用 (或者直接使用 python app.py)
CMD ["python", "app.py"]