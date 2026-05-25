import random
from pathlib import Path

import cv2
import numpy as np

img_dir = Path(r"C:\Users\李宏杰\Desktop\课程作业\毕设\steel-defect-detection - 副本 (3)\test\images")
out_path = Path(r"C:\Users\李宏杰\Desktop\课程作业\毕设\steel-defect-detection - 副本 (3)\test\random_10s.mp4")

fps = 12
duration = 10 
image_hold_seconds = 1.5
frames_per_image = max(1, int(round(fps * image_hold_seconds)))
image_count = max(1, int(round(duration / image_hold_seconds)))

images = sorted([*img_dir.glob("*.jpg"), *img_dir.glob("*.jpeg"), *img_dir.glob("*.png")])
if not images:
  raise SystemExit("没有找到图片")

if len(images) >= image_count:
  selected = random.sample(images, image_count)
else:
  selected = [random.choice(images) for _ in range(image_count)]

def read_image(path: Path):
  data = np.fromfile(str(path), dtype=np.uint8)
  if data.size == 0:
    return None
  return cv2.imdecode(data, cv2.IMREAD_COLOR)


first = read_image(selected[0])
if first is None:
  raise SystemExit(f"读取失败: {selected[0]}")

h, w = first.shape[:2]
writer = cv2.VideoWriter(str(out_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
if not writer.isOpened():
  raise SystemExit("视频写入器初始化失败，请检查编码器或输出路径")

for p in selected:
  img = read_image(p)
  if img is None:
    continue
  if img.shape[:2] != (h, w):
    img = cv2.resize(img, (w, h))
  for _ in range(frames_per_image):
    writer.write(img)

writer.release()
print("已生成:", out_path)