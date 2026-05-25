from sqlalchemy import Column, Integer, String, DateTime, Float, Text
from sqlalchemy.sql import func
from ..database import Base

class DetectionRecord(Base):
    __tablename__ = "detection_records"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    batch_id = Column(String(50), nullable=True, index=True)
    image_path = Column(String(255), nullable=False)
    result_path = Column(String(255))
    defect_type = Column(String(50))
    confidence = Column(Float)
    bbox_coordinates = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    detection_time = Column(DateTime(timezone=True), nullable=True)  # 算法推理完成的精确时刻