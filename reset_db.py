
import os
import sys

# 将当前文件夹加入 Python 路径
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from backend.database import engine, Base
from backend.models.user import User
from backend.models.detection import DetectionRecord

def reset_db():
    db_path = os.path.join(current_dir, 'database', 'steel_defect.db')
    if os.path.exists(db_path):
        os.remove(db_path)
        print(f"已删除旧数据库: {db_path}")
    
    Base.metadata.create_all(bind=engine)
    print("数据库表结构已重新创建成功。")

if __name__ == "__main__":
    reset_db()
