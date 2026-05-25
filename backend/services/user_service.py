"""
用户服务 - FastAPI版本
"""

import jwt
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from ..models.user import User

class UserService:
    def __init__(self):
        self.secret_key = "steel_defect_detection_secret_key"
        self.algorithm = "HS256"
    
    def hash_password(self, password: str) -> str:
        """哈希密码"""
        import hashlib
        return hashlib.sha256(password.encode('utf-8')).hexdigest()
    
    def check_password(self, password: str, hashed: str) -> bool:
        """验证密码"""
        import hashlib
        return hashlib.sha256(password.encode('utf-8')).hexdigest() == hashed
    
    def create_user(self, db: Session, username: str, email: str, password: str):
        """创建新用户"""
        try:
            # 检查用户名和邮箱是否已存在
            if db.query(User).filter(User.username == username).first():
                return {"success": False, "error": "用户名已存在"}
            
            if db.query(User).filter(User.email == email).first():
                return {"success": False, "error": "邮箱已存在"}
            
            # 创建用户
            hashed_password = self.hash_password(password)
            user = User(
                username=username,
                email=email,
                password_hash=hashed_password,
                created_at=datetime.now()
            )
            
            db.add(user)
            db.commit()
            db.refresh(user)
            
            return {"success": True, "user": user}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": f"创建用户失败: {str(e)}"}
    
    def authenticate_user(self, db: Session, username: str, password: str):
        """用户认证"""
        try:
            user = db.query(User).filter(User.username == username).first()
            
            if not user:
                return {"success": False, "error": "用户不存在"}
            
            if not self.check_password(password, user.password_hash):
                return {"success": False, "error": "密码错误"}
            
            # 生成JWT令牌
            token_data = {
                "user_id": user.id,
                "username": user.username,
                "exp": datetime.now() + timedelta(days=7)
            }
            
            access_token = jwt.encode(token_data, self.secret_key, algorithm=self.algorithm)
            
            return {
                "success": True,
                "access_token": access_token,
                "user": user
            }
        except Exception as e:
            return {"success": False, "error": f"认证失败: {str(e)}"}
    
    def get_user_by_token(self, db: Session, token: str):
        """通过令牌获取用户"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            user_id = payload.get("user_id")
            
            if not user_id:
                return None
            
            user = db.query(User).filter(User.id == user_id).first()
            return user
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
        except Exception:
            return None
    
    def get_user_by_id(self, db: Session, user_id: int):
        """通过ID获取用户"""
        return db.query(User).filter(User.id == user_id).first()
    
    def update_user(self, db: Session, user_id: int, **kwargs):
        """更新用户信息"""
        try:
            user = db.query(User).filter(User.id == user_id).first()
            
            if not user:
                return {"success": False, "error": "用户不存在"}
            
            for key, value in kwargs.items():
                if hasattr(user, key):
                    setattr(user, key, value)
            
            user.updated_at = datetime.now()
            db.commit()
            
            return {"success": True, "user": user}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": f"更新用户失败: {str(e)}"}

# 创建全局用户服务实例
user_service = UserService()