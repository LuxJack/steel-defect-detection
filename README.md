# 基于 YOLO 算法的钢材表面缺陷识别系统

本项目是一套面向工业场景的钢材表面缺陷智能检测平台，以 YOLOv8 为检测引擎，采用前后端分离架构，支持图片、视频及摄像头多模式缺陷识别，并提供完整的用户管理与历史记录功能。

---

## 技术栈

### 后端
- **Web 框架**：FastAPI + Uvicorn
- **AI 推理**：YOLOv8（ultralytics 8.x）+ OpenCV
- **数据库**：SQLite（SQLAlchemy ORM）
- **认证**：JWT（PyJWT + Passlib/bcrypt）
- **实时推流**：Server-Sent Events（SSE）

### 前端
- **框架**：Vue 3（CDN 引入，无构建工具依赖）
- **UI 样式**：原生 CSS 仿工业仪表盘风格，Phosphor Icons
- **图表**：ECharts 5
- **路由 / 状态（扩展版）**：Vue Router + Pinia（`src/` 目录备用）

---

## 功能特性

### 🔍 核心检测
- **6 类缺陷识别**：裂纹（crazing）、夹杂物（inclusion）、斑块（patches）、麻面（pitted_surface）、氧化铁皮压入（rolled-in_scale）、划痕（scratches）
- **图片检测**：上传图片 → YOLOv8 推理 → 带标注框结果图实时回显
- **视频逐帧检测**：SSE 流式推送，前端实时显示原始帧与检测帧双画面、进度条
- **摄像头实时识别**：调用本地摄像头逐帧检测
- **可调阈值**：前端滑块实时调整置信度（conf）与交并比（IoU）

### 📋 结果展示
- 检测结果图（后端绘制 bbox 标注后回传）
- 识别目标列表仪表盘（类型、坐标、置信度逐行展示）
- 点击表格行可高亮单个目标并用 SVG 叠加层单独显示对应检测框
- 类别统计卡片（按类型汇总数量）

### 🎞️ 视频检测
- SSE 长连接逐帧推送（支持暂停 / 继续 / 停止）
- 检测完成后自动合成带标注框的 MP4 结果视频
- 历史记录支持视频回放弹窗

### 👤 用户系统
- 账号注册 / 登录，JWT 令牌鉴权
- 检测历史记录列表（含缩略图预览）
- 历史记录加载回视图，支持点击查看详情

### 🔄 动态模型切换
- 运行时切换模型权重（YOLOv8n / YOLOv8s / 自定义钢材专用模型）

---

## 项目结构

```
steel-defect-detection/
├── app.py                  # FastAPI 应用入口，路由注册，静态文件挂载
├── config.py               # 全局配置（路径、JWT、CORS、文件大小限制等）
├── requirements.txt        # Python 依赖列表
├── reset_db.py             # 数据库重置工具脚本
│
├── backend/
│   ├── main.py             # （备用）独立启动入口
│   ├── database.py         # SQLAlchemy 引擎与 Session 初始化
│   ├── models/
│   │   ├── user.py         # 用户 ORM 模型
│   │   └── detection.py    # 检测记录 ORM 模型
│   ├── routes/
│   │   ├── auth.py         # 注册 / 登录 / Token 验证
│   │   ├── detect.py       # 图片 & 视频上传检测（/api/detect）
│   │   ├── stream.py       # SSE 视频逐帧推流（/api/stream）
│   │   ├── records.py      # 历史记录查询（/api/records）
│   │   └── data.py         # 数据统计接口（/api/data）
│   ├── services/
│   │   ├── detection_service.py   # YOLOv8 推理核心（VideoSession + DetectionService）
│   │   └── user_service.py        # 用户 CRUD 与 Token 管理
│   ├── utils/
│   │   └── helpers.py      # 文件校验、保存工具函数
│   ├── uploads/            # 上传原始文件（自动创建）
│   └── results/            # 带标注的结果图 / 视频（自动创建）
│
├── frontend/
│   ├── index.html          # 主页面（Vue 3 CDN 单文件，生产直接使用）
│   ├── index-cdn.html      # 备用 CDN 版本
│   ├── js/
│   │   └── app.js          # Vue 3 setup() 全量逻辑（状态、检测、SSE、路由）
│   ├── static/
│   │   ├── css/
│   │   │   ├── layout.css  # 三栏布局（侧边栏 / 主区 / 右面板）
│   │   │   └── style.css   # 全局样式与组件覆盖
│   │   └── js/             # 第三方静态 JS
│   └── src/                # Vue CLI / Vite 扩展版（开发备用）
│       ├── App.vue
│       ├── main.js
│       ├── router/
│       ├── stores/
│       └── views/
│
├── model/
│   ├── weights/
│   │   ├── yolov8n.pt      # YOLOv8 Nano 基础权重
│   │   └── best.pt         # 钢材缺陷微调权重（自行训练后放置）
│   └── train/              # 训练脚本 / 数据集配置
│
├── database/
│   └── steel_defect.db     # SQLite 数据库文件（自动生成）
│
└── ultralytics-8.3.55/     # 本地 ultralytics 源码（用于离线环境）
```

---

## 快速开始

### 环境要求

| 工具 | 版本要求 |
|------|---------|
| Python | 3.8 + |
| CUDA（可选） | 11.8 + （GPU 加速推理） |
| 浏览器 | Chrome 90+ / Edge 90+（支持 SSE）|

> 不需要 Node.js，前端为纯 CDN 版本，无需构建。

### 1. 克隆并安装依赖

```bash
git clone <仓库地址>
cd steel-defect-detection

# 推荐使用 conda 虚拟环境
conda create -n yolov8 python=3.10
conda activate yolov8

pip install -r requirements.txt
```

### 2. 准备模型权重

将训练好的 YOLOv8 权重文件放到 `model/weights/` 目录：

```
model/weights/yolov8n.pt   ← YOLOv8 Nano 基线（已附带）
model/weights/best.pt      ← 钢材缺陷专用权重（自行训练或下载）
```

若未准备 `best.pt`，系统会自动回退使用 `yolov8n.pt`。

### 3. 初始化数据库

```bash
python reset_db.py
```

### 4. 启动服务

```bash
python app.py
```

服务启动后访问：[http://127.0.0.1:8000](http://127.0.0.1:8000)

---

## API 接口概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录，返回 JWT |
| POST | `/api/detect/upload` | 图片 / 视频上传并检测 |
| GET  | `/api/stream/video/{session_id}` | SSE 视频逐帧推流 |
| POST | `/api/stream/start` | 创建视频检测 Session |
| POST | `/api/stream/control/{session_id}` | 暂停 / 继续 / 停止视频流 |
| GET  | `/api/records/list` | 获取当前用户历史记录 |
| GET  | `/api/data/stats` | 获取检测统计数据 |
| POST | `/api/detect/switch-model` | 切换检测模型 |
| GET  | `/api/health` | 服务健康检查 |

---

## 缺陷类别说明

| 英文标签 | 中文名称 | 描述 |
|---------|---------|------|
| `crazing` | 裂纹 | 表面微细裂纹网络 |
| `inclusion` | 夹杂物 | 轧制过程中混入的非金属夹杂 |
| `patches` | 斑块 | 不规则形状的表面色差区域 |
| `pitted_surface` | 麻面 | 表面凹坑/点蚀 |
| `rolled-in_scale` | 氧化铁皮压入 | 轧制时氧化皮被压入表面 |
| `scratches` | 划痕 | 线状机械划伤 |

---

## 注意事项

- `config.py` 中的 `SECRET_KEY` 和 `JWT_SECRET_KEY` 在生产环境必须替换为随机强密钥
- 项目路径中如含有中文、空格等特殊字符，`cv2.imwrite` 在 Windows 下会静默失败；本项目已改用 `cv2.imencode + open(..., 'wb')` 写入结果图片以兼容中文路径
- `backend/results/` 和 `backend/uploads/` 目录会由应用自动创建
- 视频检测结果 MP4 使用 H.264（`avc1`）编码，确保浏览器可直接播放

## 许可证

本项目仅供学习和研究使用。

## 贡献

欢迎提交 Issue 和 Pull Request 来改进项目。