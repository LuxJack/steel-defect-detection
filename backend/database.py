"""
数据库配置
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

import os

# 数据库文件路径
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_PATH = os.path.join(BASE_DIR, "database", "steel_defect.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

# 创建数据库引擎
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

# 创建SessionLocal类
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建Base类
Base = declarative_base()

def get_db():
    """获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations():
    """为已存在的 SQLite 数据库表追加新字段（幂等，安全可重复运行）"""
    import sqlite3
    if not os.path.exists(DATABASE_PATH):
        return
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(detection_records)")
    columns = [col[1] for col in cursor.fetchall()]
    if 'detection_time' not in columns:
        cursor.execute("ALTER TABLE detection_records ADD COLUMN detection_time DATETIME")
        print("[Migration] 已添加 detection_time 字段")
    if 'bbox_coordinates' not in columns:
        cursor.execute("ALTER TABLE detection_records ADD COLUMN bbox_coordinates TEXT")
        print("[Migration] 已添加 bbox_coordinates 字段")
    
    # 用户表迁移
    cursor.execute("PRAGMA table_info(users)")
    user_columns = [col[1] for col in cursor.fetchall()]
    if 'phone' not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN phone VARCHAR(20)")
        print("[Migration] 已为 users 表添加 phone 字段")
    
    conn.commit()
    conn.close()