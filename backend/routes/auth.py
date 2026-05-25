"""
认证路由 - FastAPI版本
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
from ..services.user_service import user_service
from ..database import SessionLocal
from ..models.user import User

router = APIRouter()
security = HTTPBearer()

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """获取当前用户"""
    token = credentials.credentials
    db = SessionLocal()
    try:
        user = user_service.get_user_by_token(db, token)
        if not user:
            raise HTTPException(status_code=401, detail="无效的认证令牌")
        return user
    finally:
        db.close()

@router.post("/register")
async def register(request: RegisterRequest):
    """用户注册"""
    try:
        if not all([request.username, request.email, request.password]):
            raise HTTPException(status_code=400, detail="请填写所有必填字段")
        
        db = SessionLocal()
        try:
            result = user_service.create_user(db, request.username, request.email, request.password)
            
            if result["success"]:
                return {
                    "success": True,
                    "message": "注册成功",
                    "user": {
                        "id": result["user"].id,
                        "username": result["user"].username,
                        "email": result["user"].email,
                        "phone": result["user"].phone
                    }
                }
            else:
                raise HTTPException(status_code=400, detail=result["error"])
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"注册失败: {str(e)}")

@router.post("/login")
async def login(request: LoginRequest):
    """用户登录"""
    try:
        if not all([request.username, request.password]):
            raise HTTPException(status_code=400, detail="请填写用户名和密码")
        
        db = SessionLocal()
        try:
            result = user_service.authenticate_user(db, request.username, request.password)
            
            if result["success"]:
                return {
                    "success": True,
                    "access_token": result["access_token"],
                    "user": {
                        "id": result["user"].id,
                        "username": result["user"].username,
                        "email": result["user"].email,
                        "phone": result["user"].phone
                    }
                }
            else:
                raise HTTPException(status_code=401, detail=result["error"])
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"登录失败: {str(e)}")

@router.get("/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return {
        "success": True,
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "phone": current_user.phone
        }
    }

class UpdateProfileRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    new_password: Optional[str] = None

@router.put("/update-profile")
async def update_profile(request: UpdateProfileRequest, current_user: User = Depends(get_current_user)):
    """更新用户个人信息（用户名/密码）"""
    db = SessionLocal()
    try:
        kwargs = {}
        if request.username and request.username.strip():
            new_username = request.username.strip()
            # 检查用户名是否被其他人占用
            existing = db.query(User).filter(
                User.username == new_username,
                User.id != current_user.id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="用户名已被占用")
            
            # 【重要】同步更新邮箱，释放旧名占坑
            new_email = f"{new_username}@example.com"
            existing_email = db.query(User).filter(
                User.email == new_email,
                User.id != current_user.id
            ).first()
            if existing_email:
                raise HTTPException(status_code=400, detail="同步生成的邮箱已被占用")

            kwargs["username"] = new_username
            kwargs["email"] = new_email
        
        # 手动修改邮箱（如果用户名没改，或者想覆盖同步生成的邮箱）
        if request.email and request.email.strip() and request.email != kwargs.get("email"):
            email_to_check = request.email.strip()
            existing_e = db.query(User).filter(User.email == email_to_check, User.id != current_user.id).first()
            if existing_e:
                raise HTTPException(status_code=400, detail="邮箱已被其他账号占用")
            kwargs["email"] = email_to_check

        # 修改手机号
        if request.phone is not None: # 允许传空字符串清除手机号
            phone_val = request.phone.strip()
            if phone_val:
                existing_p = db.query(User).filter(User.phone == phone_val, User.id != current_user.id).first()
                if existing_p:
                    raise HTTPException(status_code=400, detail="手机号已被其他账号占用")
            kwargs["phone"] = phone_val if phone_val else None

        if request.new_password and request.new_password.strip():
            kwargs["password_hash"] = user_service.hash_password(request.new_password.strip())
        
        if not kwargs:
            return {"success": True, "message": "无需更新"}
            
        result = user_service.update_user(db, current_user.id, **kwargs)
        if result["success"]:
            return {
                "success": True,
                "message": "更新成功",
                "user": {
                    "id": result["user"].id,
                    "username": result["user"].username,
                    "email": result["user"].email,
                    "phone": result["user"].phone
                }
            }
        else:
            raise HTTPException(status_code=400, detail=result["error"])
    finally:
        db.close()