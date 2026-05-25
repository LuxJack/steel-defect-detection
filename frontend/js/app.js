const { createApp, ref, reactive, computed, onMounted, nextTick } = Vue;

console.log("Vue starting...");

const app = createApp({
    setup() {
        console.log("Setup running...");
        // ========== 状态变量 ==========

        // 鉴权
        const isLoggedIn = ref(false);
        const authMode = ref('login');
        const authForm = reactive({ username: '', password: '', confirmPassword: '' });

        // 布局与导航
        const currentView = ref('detection');
        const showWelcome = ref(false); // 控制登录后初始简介界面的显示
        const showImageModal = ref(false);
        const modalImageUrl = ref('');
        const navTags = [
            { id: 'detection', name: '智能检测', icon: 'ph ph-scan' },
            { id: 'data', name: '数据视图', icon: 'ph ph-chart-pie-slice' },
            { id: 'model', name: '模型引擎', icon: 'ph ph-cpu' },
            { id: 'settings', name: '系统设置', icon: 'ph ph-gear' }
        ];

        const currentViewName = computed(() => {
            return navTags.find(t => t.id === currentView.value)?.name || '';
        });

        // 后端状态
        const backendStatus = ref(false);

        // 个人信息弹窗
        const showProfileModal = ref(false);
        const avatarSeed = ref('');
        const avatarUrl = ref('');  // 本地选择的头像 Object URL（优先于 dicebear）
        const profileAvatarInput = ref(null);
        const currentUser = ref({ id: null, username: '', email: '', phone: '' });
        const profileForm = reactive({ username: '', email: '', phone: '', newPassword: '', confirmNewPassword: '', avatarSeed: '', avatarUrl: '', avatarBase64: '' });

        // 检测模块参数 (新添加)
        const confThreshold = ref(0.25);
        const iouThreshold = ref(0.45);

        // 检测模块状态
        const detectSource = ref('image'); // 'image', 'video', 'camera'
        const activeMenuKey = ref(''); // 侧边栏高亮项：'image'|'video'|'folder'|'camera'|'model'|'history'|''（欢迎页时为空）
        const dragOver = ref(false);
        const selectedFile = ref(null);
        const selectedFilePreview = ref('');
        const fileInput = ref(null);

        const isCameraOn = ref(false);
        let currentStream = null;

        // 摄像头实时检测专属状态
        const cameraVideoEl = ref(null);       // <video> Vue ref
        const cameraCanvasEl = ref(null);       // <canvas> Vue ref（隐藏，帧捕获用）
        const isCameraDetecting = ref(false);    // 检测循环是否运行中
        const cameraResultFrame = ref('');       // 最新标注帧（base64 JPEG）
        const cameraDevices = ref([]);         // 枚举到的视频输入设备列表
        const selectedCameraId = ref('');        // 当前选中的摄像头 deviceId
        const cameraFps = ref(0);          // 实时检测帧率
        const cameraSessionId = ref('');         // 后端录制会话 ID
        const isCameraStopping = ref(false);     // 是否正在停止并保存视频
        let _cameraDetectionRunning = false;
        let _processingFrame = false;
        let _lastCaptureTime = 0;
        let _camFrameCount = 0;
        let _camFpsTimer = null;

        const isDetecting = ref(false);
        const isIdentified = ref(false); // 是否已完成识别操作
        const resultImage = ref('');
        const detectionStats = ref(null);
        const sessionDefectsAccumulator = ref([]); // 累加当前会话（视频流/摄像头）的所有历史检测结果
        const detectionHistory = ref([]); // 识别历史数据
        const historyPage = ref(1);   // 当前页码
        const historyPageSize = ref(10);  // 每页条数
        const historyTotal = ref(0);   // 总记录数
        const historyTotalPages = computed(() => Math.max(1, Math.ceil(historyTotal.value / historyPageSize.value)));
        const selectedTargetIndex = ref(-1); // 当前选中的目标索引

        // ── 视频实时检测专属状态 ─────────────────────────────────────────
        const videoSessionId = ref('');
        const isVideoStreaming = ref(false);  // SSE 正在推流中
        const videoPaused = ref(false);  // 当前处于暂停状态
        const isVideoStopping = ref(false);  // 已发送 stop 指令，等待 complete 事件
        const videoStreamFrame = ref('');     // 当前帧 base64 JPEG（带检测框，右侧展示）
        const videoOriginalFrame = ref('');    // 当前帧 base64 JPEG（原始无框，左侧展示）
        const videoProgress = ref(0);      // 0-100 进度
        const videoBlobUrl = ref('');     // 左侧视频预览 URL（仅加载阶段保留）
        const showSavingModal = ref(false);  // 保存进度弹窗
        const savingProgress = ref(0);      // 模拟保存进度 0-100
        const showVideoModal = ref(false);  // 历史视频播放弹窗
        const modalVideoUrl = ref('');     // 历史视频 URL
        let videoSSE = null;        // EventSource 实例
        let savingTimer = null;        // 进度条定时器

        // SVG 检测框覆盖层：追踪原图自然尺寸，用于 viewBox 坐标换算
        const imgNaturalW = ref(0);
        const imgNaturalH = ref(0);
        const onResultImgLoad = (e) => {
            imgNaturalW.value = e.target.naturalWidth;
            imgNaturalH.value = e.target.naturalHeight;
        };
        const CLASS_COLORS = {
            'crazing': '#2d45ff',      // 纯正的 YOLO 蓝
            'inclusion': '#ff9d97',    // 清晰淡粉
            'patches': '#00ffff',      // 青蓝色
            'pitted_surface': '#ff701f', // 警戒橙
            'rolled-in_scale': '#ffb21d', // 明快黄
            'scratches': '#cfd231'     // 草绿色
        };
        const getBboxColor = (defect) => {
            if (!defect) return '#2d45ff';
            // 如果传入的是索引数字（兼容老代码），则随机选一个
            if (typeof defect === 'number') return Object.values(CLASS_COLORS)[defect % 6];
            return CLASS_COLORS[defect.type_en] || '#00FFFF';
        };

        // ── 批量·文件夹检测专属状态 ─────────────────────────────────────────
        const folderInput = ref(null);   // 文件夹 <input> 引用
        const folderFiles = ref([]);     // 过滤后的 File 对象数组
        const showFolderConfirmModal = ref(false);  // 弹窗1：确认上传
        const showFolderSuccessModal = ref(false);  // 弹窗2：上传成功
        const folderSuccessCount = ref(0);
        const isBatchMode = ref(false);  // 是否处于批量识别模式
        const batchStatus = ref('IDLE'); // 'IDLE' | 'RUNNING' | 'PAUSED'
        const batchIndex = ref(0);      // 当前处理索引（0-based）
        const batchTotal = ref(0);      // 批量总数
        const batchResults = ref([]);     // [{file,previewUrl,resultImage,defects,status,time}]
        let _batchPaused = false;       // 内部暂停标志（不用 ref 避免 async 竞态）
        let _batchStopped = false;       // 内部中止标志

        // 兼容不同后端字段格式，统一为前端渲染结构
        const normalizeDefects = (rawDefects) => {
            if (!Array.isArray(rawDefects)) return [];

            return rawDefects
                .map((item) => {
                    if (!item || typeof item !== 'object') return null;

                    const typeEn = item.type_en || item.type || item.class_name || item.class || item.label || '';
                    const typeCn = item.type_cn || item.class_name_cn || item.label_cn || typeEn || '未知目标';

                    const confRaw = item.confidence ?? item.conf ?? item.score ?? 0;
                    const confNum = Number(confRaw);
                    const confidence = Number.isFinite(confNum) ? Math.max(0, Math.min(1, confNum)) : 0;

                    const rawBox = item.bbox || item.box || item.xyxy || item.xywh;
                    let bbox = [0, 0, 0, 0];
                    if (Array.isArray(rawBox) && rawBox.length >= 4) {
                        bbox = rawBox.slice(0, 4).map((v) => {
                            const n = Number(v);
                            return Number.isFinite(n) ? n : 0;
                        });
                    }

                    return {
                        ...item,
                        type_en: typeEn,
                        type_cn: typeCn,
                        confidence,
                        bbox,
                    };
                })
                .filter(Boolean);
        };

        // 模型管理状态
        const currentModel = ref('steel_base');
        const models = ref([
            { id: 'yolov8n', name: 'YOLOv8-Nano', params: '3.2M', desc: '极速推理，适合边缘设备实时检测' },
            { id: 'yolov8s', name: 'YOLOv8-Small', params: '11.2M', desc: '速度与精度的平衡，推荐生产使用' },
            { id: 'yolov8m', name: 'YOLOv8-Medium', params: '25.9M', desc: '高精度检测，发现微小疵点' },
            { id: 'fastsam', name: 'FastSAM', params: '68M', desc: '基于分割的精细检测体验' },
            { id: 'steel_v1', name: 'best.pt', params: 'custom', desc: '钢铁缺陷检测模型' },
            { id: 'steel_base', name: 'best1.pt', params: 'custom', desc: '钢铁缺陷检测默认模型' }
        ]);
        const currentModelDisplay = computed(() => {
            const presetModel = models.value.find(item => item.id === currentModel.value);
            return presetModel ? presetModel.name : (currentModel.value || '-');
        });

        // ── 模型文件上传专属状态 ──────────────────────────────────────────
        const modelFileInput = ref(null);    // <input type="file"> 引用
        const selectedModelFile = ref(null);    // 用户选中的 File 对象
        const showModelConfirmModal = ref(false);   // 确认加载弹窗
        const isModelLoading = ref(false);   // 正在上传/加载中（全屏遮罩）
        const showModelSuccessModal = ref(false);   // 成功提示弹窗
        const modelLoadMessage = ref('');      // 成功提示消息内容

        /** 触发模型文件选择器 */
        const triggerModelInput = () => {
            if (modelFileInput.value) modelFileInput.value.click();
        };

        /** 文件选择后暂存，弹出确认框 */
        const handleModelFileSelect = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            selectedModelFile.value = file;
            showModelConfirmModal.value = true;
            // 重置 input，允许重复选同一个文件
            event.target.value = '';
        };

        /** 取消加载 */
        const cancelModelUpload = () => {
            showModelConfirmModal.value = false;
            selectedModelFile.value = null;
        };

        /** 确认加载：上传文件到后端并切换推理引擎 */
        const confirmModelUpload = async () => {
            if (!selectedModelFile.value) return;
            showModelConfirmModal.value = false;
            isModelLoading.value = true;

            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('file', selectedModelFile.value);

            try {
                const resp = await fetch('/api/detect/upload-model', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData,
                });
                const data = await resp.json();
                if (resp.ok && data.success) {
                    currentModel.value = data.model_name || selectedModelFile.value.name;
                    modelLoadMessage.value = data.message || `模型 '${selectedModelFile.value.name}' 加载成功！`;
                    showModelSuccessModal.value = true;
                } else {
                    alert(`加载失败：${data.detail || data.message || '未知错误'}`);
                }
            } catch (err) {
                console.error(err);
                alert('请求失败，请检查后端服务是否正常运行');
            } finally {
                isModelLoading.value = false;
                selectedModelFile.value = null;
            }
        };

        // ECharts 实例引用
        let trendChartInstance = null;
        let pieChartInstance = null;

        // ========== 方法定义 ==========

        // --- 鉴权 ---
        const handleAuth = async () => {
            if (authMode.value === 'register' && authForm.password !== authForm.confirmPassword) {
                alert('两次密码输入不一致！');
                return;
            }

            const endpoint = authMode.value === 'login' ? '/api/auth/login' : '/api/auth/register';
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: authForm.username,
                        password: authForm.password,
                        email: authForm.username + '@example.com' // 注册时需要的占位邮箱
                    })
                });

                const data = await response.json();
                if (data.success || data.access_token) {
                    if (authMode.value === 'register') {
                        alert('注册成功！请使用刚注册的账号进行登录。');
                        // 核心修复：注册新账号时，清除该用户名在本地浏览器残留的旧头像数据
                        localStorage.removeItem(`avatar_${authForm.username}`);
                        authMode.value = 'login';
                        // 清空密码，保留用户名方便直接登录
                        authForm.password = '';
                        authForm.confirmPassword = '';
                    } else {
                        localStorage.setItem('token', data.access_token || '');
                        isLoggedIn.value = true;
                        showWelcome.value = true; // 登录成功后展示系统简介界面

                        // 保存当前完整用户信息
                        if (data.user) {
                            currentUser.value = {
                                id: data.user.id,
                                username: data.user.username,
                                email: data.user.email,
                                phone: data.user.phone || ''
                            };
                        }

                        // 初始化头像 seed
                        avatarSeed.value = authForm.username;
                        profileForm.avatarSeed = authForm.username;
                        // 逻辑优化：从 localStorage 恢复用户上次保存的头像，若无则使用我挑选的酷炫默认头像
                        const savedAvatar = localStorage.getItem(`avatar_${authForm.username}`);
                        avatarUrl.value = savedAvatar || '/static/assets/default_avatar.png';
                        initDashboardChartsIfNeeded();
                    }
                } else {
                    alert(data.detail || '操作失败');
                }
            } catch (err) {
                console.error(err);
                // 彻底移除 catch 块中的自动登录逻辑，避免任何异常导致登入
                if (authMode.value === 'login') {
                    // 如果您希望在完全断网时也能进入演示，请手动在这里改为 true 
                    // 但为了解决您的问题，现在默认不再自动进入
                    alert('登录请求失败，请检查服务状态');
                } else {
                    alert('连接服务器失败，请检查后端服务是否运行');
                }
            }
        };

        // --- 模型切换 ---
        const switchModel = async (modelId) => {
            const token = localStorage.getItem('token');
            try {
                const response = await fetch('/api/detect/switch-model', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ model_name: modelId })
                });
                const data = await response.json();
                if (data.success) {
                    currentModel.value = modelId;
                    console.log('Model switched:', modelId);
                }
            } catch (err) {
                currentModel.value = modelId;
            }
        };

        // --- 上传并检测 ---
        const handleFileSelect = (event) => {
            const file = event.target.files[0];
            if (file) processFile(file);
        };

        const handleDrop = (event) => {
            dragOver.value = false;
            const file = event.dataTransfer.files[0];
            if (file) processFile(file);
        };

        const processFile = (file) => {
            showWelcome.value = false; // 确认获取到文件后才切换到检测界面
            selectedFile.value = file;
            // 中止批量任务
            _batchStopped = true;
            isBatchMode.value = false;
            batchStatus.value = 'IDLE';
            // 重置视频流状态
            _cleanupVideoStream();
            isVideoStreaming.value = false;
            videoPaused.value = false;
            isVideoStopping.value = false;
            videoStreamFrame.value = '';
            videoOriginalFrame.value = '';
            videoProgress.value = 0;
            isIdentified.value = false;
            detectionStats.value = null;
            sessionDefectsAccumulator.value = []; // 清空可能遗留的会话记录
            resultImage.value = '';
            selectedTargetIndex.value = -1;
            imgNaturalW.value = 0;
            imgNaturalH.value = 0;

            if (file.type.startsWith('image/')) {
                detectSource.value = 'image';
                selectedFilePreview.value = URL.createObjectURL(file);
                if (videoBlobUrl.value) { URL.revokeObjectURL(videoBlobUrl.value); }
                videoBlobUrl.value = '';
            } else if (file.type.startsWith('video/')) {
                detectSource.value = 'video';
                const blobUrl = URL.createObjectURL(file);
                videoBlobUrl.value = blobUrl;
                selectedFilePreview.value = 'video-mock'; // 标记为视频类型
            }
        };

        const clearFile = () => {
            selectedFile.value = null;
            selectedFilePreview.value = '';
            resultImage.value = '';
            isIdentified.value = false;
            detectionStats.value = null;
            if (fileInput.value) fileInput.value.value = '';
            // 批量模式清理
            _batchStopped = true;
            isBatchMode.value = false;
            batchStatus.value = 'IDLE';
            batchIndex.value = 0;
            batchTotal.value = 0;
            batchResults.value.forEach(r => { if (r.previewUrl) URL.revokeObjectURL(r.previewUrl); });
            batchResults.value = [];
            folderFiles.value = [];
            // 视频清理
            _cleanupVideoStream();
            isVideoStreaming.value = false;
            videoPaused.value = false;
            isVideoStopping.value = false;
            videoStreamFrame.value = '';
            videoOriginalFrame.value = '';
            videoProgress.value = 0;
            if (videoBlobUrl.value) { URL.revokeObjectURL(videoBlobUrl.value); videoBlobUrl.value = ''; }
        };

        const isReadyToDetect = computed(() => {
            if (detectSource.value === 'image' || detectSource.value === 'video') return !!selectedFile.value;
            if (detectSource.value === 'camera') return isCameraOn.value;
            return false;
        });

        // 模拟检测过程
        const startDetection = async () => {
            if (!isReadyToDetect.value) return;

            if (detectSource.value === 'camera') {
                startCameraDetection();
                return;
            }

            // ── 视频模式：走 SSE 实时流 ──
            if (detectSource.value === 'video' && selectedFile.value) {
                await _startVideoDetection();
                return;
            }

            // ── 图片模式（原有逻辑）──
            isDetecting.value = true;
            selectedTargetIndex.value = -1; // 重置选中项
            imgNaturalW.value = 0;           // 重置图片尺寸，防止旧 SVG 叠加
            imgNaturalH.value = 0;
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('file', selectedFile.value);
            // 确保将置信度和 IoU 阈值作为 form 字段发送
            formData.append('conf_threshold', parseFloat(confThreshold.value));
            formData.append('iou_threshold', parseFloat(iouThreshold.value));

            try {
                // 使用正确的 API 端点，并确保参数传递正确
                const response = await fetch('/api/detect/upload', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                const data = await response.json();
                if (data.success) {
                    // 【核心修复】直接使用后端返回的真实图片尺寸，不依赖异步 load 事件
                    if (data.width && data.height) {
                        imgNaturalW.value = data.width;
                        imgNaturalH.value = data.height;
                    }

                    const backendBase = window.location.protocol + '//' + window.location.host;
                    const normalizedDefects = normalizeDefects(data.defects);
                    // 防御 result_path 为 null/undefined/空字符串 时崩溃
                    if (data.result_path && data.result_path.length > 0) {
                        const rawPath = data.result_path.startsWith('http')
                            ? data.result_path
                            : `${backendBase}${data.result_path}`;
                        // 增加时间戳避免浏览器命中旧缓存导致显示上次识别图
                        resultImage.value = `${rawPath}${rawPath.includes('?') ? '&' : '?'}t=${Date.now()}`;
                    } else {
                        resultImage.value = '';
                        console.error('[Detection] result_path 为空，后端图片保存可能失败');
                    }
                    isIdentified.value = true; // 接口成功返回后才激活识别结果显示

                    console.log('[Detection] result_path:', data.result_path);
                    console.log('[Detection] resultImage.value:', resultImage.value);
                    console.log('[Detection] defects count:', normalizedDefects.length);

                    // 预载干净原图以获取自然尺寸，确保 SVG viewBox 坐标映射正确
                    // （缓存命中时 @load 不会触发，用 new Image() 可靠获取）
                    const _orig = new Image();
                    _orig.onload = () => {
                        imgNaturalW.value = _orig.naturalWidth;
                        imgNaturalH.value = _orig.naturalHeight;
                    };
                    _orig.src = selectedFilePreview.value;

                    detectionStats.value = {
                        time: Math.floor(Math.random() * 50) + 120,
                        // 将 defects 数组也存入 stats，方便表格 v-for 渲染
                        defects: normalizedDefects,
                        count: data.is_video ? '视频分析完成' : normalizedDefects.length,
                        conf: (data.confidence * 100).toFixed(1)
                    };
                    // 图片检测完成后：将新记录插入历史列表顶端（无需重刷请求）
                    const newRecord = {
                        id: data.record_id,
                        result_path: data.result_path,
                        defect_type: data.defect_type,
                        confidence: data.confidence,
                        detection_time: data.detection_time,
                        created_at: new Date().toISOString()
                    };
                    if (historyPage.value === 1) {
                        detectionHistory.value = [newRecord, ...detectionHistory.value].slice(0, historyPageSize.value);
                    } else {
                        // 不在第 1 页时跳回第 1 页展示最新记录
                        fetchDetectionHistory(1);
                    }
                    historyTotal.value = (historyTotal.value || 0) + 1;
                } else {
                    alert(data.detail || '检测失败');
                }
            } catch (err) {
                console.error('Detection error:', err);
                alert('网络错误，请尝试重新登录');
            } finally {
                isDetecting.value = false;
            }
        };

        // ══════════════════════════════════════════════════════════════════════
        // 视频实时检测方法
        // ══════════════════════════════════════════════════════════════════════

        /** 关闭 WebSocket 连接（内部工具） */
        const _cleanupVideoStream = () => {
            if (videoSSE) {
                try {
                    if (videoSSE.readyState === 1 || videoSSE.readyState === 0) { // OPEN or CONNECTING
                        videoSSE.close();
                    }
                } catch (e) {}
                videoSSE = null;
            }
            if (savingTimer) {
                clearInterval(savingTimer);
                savingTimer = null;
            }
        };

        /** 显示保存进度弹窗（模拟 0→100%） */
        const _showSavingProgress = () => {
            showSavingModal.value = true;
            savingProgress.value = 0;
            savingTimer = setInterval(() => {
                savingProgress.value = Math.min(savingProgress.value + 8, 95);
                if (savingProgress.value >= 95) {
                    clearInterval(savingTimer);
                    savingTimer = null;
                }
            }, 150);
        };

        const _finishSavingProgress = () => {
            if (savingTimer) { clearInterval(savingTimer); savingTimer = null; }
            savingProgress.value = 100;
            setTimeout(() => { showSavingModal.value = false; savingProgress.value = 0; }, 1200);
        };

        /** 上传视频并开启 SSE 流 */
        const _startVideoDetection = async () => {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('file', selectedFile.value);
            formData.append('conf_threshold', parseFloat(confThreshold.value));
            formData.append('iou_threshold', parseFloat(iouThreshold.value));

            isDetecting.value = true;
            detectSource.value = 'video';
            detectionStats.value = { defects: [], time: 0 };
            sessionDefectsAccumulator.value = []; // 清空累计缓存
            selectedTargetIndex.value = -1;

            try {
                const resp = await fetch('/api/detect/video-start', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData,
                });
                const data = await resp.json();
                if (!data.success) {
                    alert(data.detail || '视频上传失败');
                    isDetecting.value = false;
                    return;
                }

                videoSessionId.value = data.session_id;
                isVideoStreaming.value = true;
                videoPaused.value = false;
                isDetecting.value = false;

                _connectVideoStream(data.session_id, token);
            } catch (err) {
                console.error('Video start error:', err);
                alert('视频上传失败，请检查网络连接');
                isDetecting.value = false;
            }
        };

        /** 建立 WebSocket 连接，消费帧数据 */
        const _connectVideoStream = (sessionId, token) => {
            _cleanupVideoStream();
            
            // 构建 WebSocket URL (兼容 https/wss)
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            // 路径对应 backend/routes/stream.py 注册的路由
            const wsUrl = `${protocol}//${host}/api/stream/ws/stream/${sessionId}?token=${encodeURIComponent(token)}`;
            
            console.log(`[WebSocket] Connecting to ${wsUrl}`);
            videoSSE = new WebSocket(wsUrl);

            videoSSE.onmessage = (event) => {
                const d = JSON.parse(event.data);

                if (d.type === 'heartbeat') return;

                if (d.type === 'frame') {
                    // 更新右侧实时帧（带检测框）
                    videoStreamFrame.value = d.frame_b64;
                    // 更新左侧原始帧（无检测框），与右侧严格同步
                    videoOriginalFrame.value = d.original_b64 || '';
                    videoProgress.value = d.total_frames > 0
                        ? Math.min(Math.round((d.frame_number / d.total_frames) * 100), 99)
                        : 0;

                    // 每帧替换检测结果（不累加），并实时更新单帧耗时
                    const currentDefects = normalizeDefects(d.new_defects);
                    detectionStats.value = { 
                        defects: currentDefects, 
                        time: d.elapsed_ms || 0 
                    };
                    // 把当前帧缺陷推入累加器用于导出全量
                    if (currentDefects.length > 0) {
                        sessionDefectsAccumulator.value.push(...currentDefects);
                    }
                    selectedTargetIndex.value = -1; // 每帧重置选中，保持视觉同步

                } else if (d.type === 'complete') {
                    isVideoStreaming.value = false;
                    isVideoStopping.value = false;
                    _cleanupVideoStream();
                    videoProgress.value = 100;
                    isIdentified.value = true;

                    // 展示保存进度弹窗，完成后自动刷新历史记录
                    _showSavingProgress();
                    setTimeout(() => {
                        _finishSavingProgress();
                        fetchDetectionHistory(); // 自动将本次检测记录同步到历史
                    }, 1800);

                    // 视频结果是 .mp4 文件而非图片，不赋値给 resultImage
                    // 右侧面板保持显示最后一帧检测帧（videoStreamFrame 暂不清除）
                    if (detectionStats.value) {
                        detectionStats.value.time = d.total_frames + ' 帧';
                    }

                } else if (d.type === 'error') {
                    console.error('Video stream error:', d.message);
                    alert('视频处理失败：' + (d.message || '未知错误'));
                    isVideoStreaming.value = false;
                    _cleanupVideoStream();
                }
            };

            videoSSE.onclose = (event) => {
                // 若仍在推流或正在停止（等待完成事件），则视为连接中断降级处理
                if (isVideoStreaming.value || isVideoStopping.value) {
                    console.warn('[WebSocket] 连接断开，视频处理可能已在后台完成或遇到异常');
                    // 只有在非正常关闭且不是手动停止的情况下才报错
                    if (!event.wasClean && isVideoStreaming.value) {
                        // 刷新历史记录，以便用户能看到可能已保存的结果
                        fetchDetectionHistory();
                    }
                }
                _cleanupVideoStream();
            };

            videoSSE.onerror = (err) => {
                console.error('[WebSocket] Error:', err);
                _cleanupVideoStream();
            };
        };

        /** 暂停 / 恢复 */
        const pauseResumeVideo = async () => {
            if (!videoSessionId.value) return;
            const action = videoPaused.value ? 'resume' : 'pause';
            const token = localStorage.getItem('token');
            const fd = new FormData(); fd.append('action', action);
            try {
                await fetch(`/api/detect/video-control/${videoSessionId.value}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: fd,
                });
                videoPaused.value = !videoPaused.value;
            } catch (err) { console.error('Video control error:', err); }
        };

        /** 停止识别：发送 stop 指令后保持 SSE 连接，等待后端推送 complete 事件自然收尾 */
        const stopVideoDetection = async () => {
            if (!videoSessionId.value) return;
            const token = localStorage.getItem('token');
            const fd = new FormData(); fd.append('action', 'stop');
            isVideoStopping.value = true;
            videoPaused.value = false;
            try {
                await fetch(`/api/detect/video-control/${videoSessionId.value}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: fd,
                });
                // 不关闭 SSE：后端将完成当前帧、保存视频后推送 complete 事件
                // complete 处理逻辑会触发保存弹窗、刷新历史并关闭连接
            } catch (_) {
                // 网络失败时降级强制关闭
                _cleanupVideoStream();
                isVideoStreaming.value = false;
                isVideoStopping.value = false;
                videoPaused.value = false;
                videoProgress.value = 0;
                videoSessionId.value = '';
            }
        };

        // 枚举视频输入设备，智能选择最佳摄像头
        const enumerateVideoDevices = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = devices.filter(d => d.kind === 'videoinput');
                cameraDevices.value = videoInputs;
                if (videoInputs.length === 0) return null;

                // 关键字策略：包含这些词被视为外置设备
                const EXTERNAL_KW = ['usb', 'external', 'camera', 'webcam', 'hd'];
                const BUILTIN_KW = ['integrated', 'built-in', 'builtin', 'facetime', 'front', 'ir '];

                let bestDevice = videoInputs.find(d => {
                    const label = d.label.toLowerCase();
                    return EXTERNAL_KW.some(kw => label.includes(kw)) &&
                        !BUILTIN_KW.some(kw => label.includes(kw));
                });

                // 没有明确外置设备且有多个设备时，取最后一个（内置通常排列第一）
                if (!bestDevice && videoInputs.length > 1) {
                    bestDevice = videoInputs[videoInputs.length - 1];
                }

                const selected = bestDevice || videoInputs[0];
                selectedCameraId.value = selected.deviceId;
                return selected.deviceId;
            } catch (e) {
                console.warn('[Camera] 设备枚举失败:', e);
                return null;
            }
        };

        const startCamera = async () => {
            try {
                // 先用无约束请求权限，触发浏览器弹窗，同时使设备标签可用于枚举
                const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
                tempStream.getTracks().forEach(t => t.stop());

                // 枚举设备并智能选择
                const deviceId = await enumerateVideoDevices();

                const constraints = {
                    video: deviceId
                        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
                        : { width: { ideal: 1280 }, height: { ideal: 720 } }
                };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);

                showWelcome.value = false;
                isCameraOn.value = true;
                currentStream = stream;
                detectSource.value = 'camera';
                sessionDefectsAccumulator.value = []; // 清空之前的会话数据
                detectionStats.value = null; // 清空单次检测数据

                // 等待 Vue 渲染 <video> 元素后再绑定流
                await nextTick();
                if (cameraVideoEl.value) {
                    cameraVideoEl.value.srcObject = stream;
                }
            } catch (err) {
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    alert('摄像头权限被拒绝，请在浏览器设置中允许摄像头访问后重试。');
                } else if (err.name === 'NotFoundError') {
                    alert('未找到摄像头设备，请确认已连接摄像头后重试。');
                } else {
                    alert('无法开启摄像头：' + err.message);
                }
            }
        };

        const stopCamera = () => {
            // 如果正在检测，先安全停止并保存视频（异步）
            stopCameraDetection(true);
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
                currentStream = null;
            }
            isCameraOn.value = false;
            cameraResultFrame.value = '';
        };

        // 开始摄像头实时检测循环
        const startCameraDetection = async () => {
            if (!isCameraOn.value || _cameraDetectionRunning) return;

            detectSource.value = 'camera';
            sessionDefectsAccumulator.value = []; // 清空累计缓存

            // 1. 在后端创建录制会话
            const token = localStorage.getItem('token');
            try {
                const resp = await fetch('/api/detect/camera-session/start', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await resp.json();
                if (data.success) {
                    cameraSessionId.value = data.session_id;
                } else {
                    cameraSessionId.value = '';
                }
            } catch (_) {
                cameraSessionId.value = '';
            }

            // 2. 启动帧捕获循环
            _cameraDetectionRunning = true;
            _processingFrame = false;
            _lastCaptureTime = 0;
            _camFrameCount = 0;
            isCameraDetecting.value = true;
            cameraFps.value = 0;
            cameraResultFrame.value = '';
            _camFpsTimer = setInterval(() => {
                cameraFps.value = _camFrameCount;
                _camFrameCount = 0;
            }, 1000);
            _cameraCaptureLoop();
        };

        // 停止摄像头检测，并触发视频合成与历史保存
        const stopCameraDetection = async (saveVideo = true) => {
            _cameraDetectionRunning = false;
            isCameraDetecting.value = false;
            if (_camFpsTimer) { clearInterval(_camFpsTimer); _camFpsTimer = null; }
            cameraFps.value = 0;

            if (!saveVideo || !cameraSessionId.value) return;

            // 向后端发送停止请求，建立返回视频 URL
            const sid = cameraSessionId.value;
            cameraSessionId.value = '';
            isCameraStopping.value = true;
            _showSavingProgress();

            const token = localStorage.getItem('token');
            try {
                const resp = await fetch(`/api/detect/camera-session/${sid}/stop`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await resp.json();
                _finishSavingProgress();
                isCameraStopping.value = false;
                if (data.success && data.video_url) {
                    fetchDetectionHistory();
                    // 显示 Toast 提示
                    _showCameraSuccessToast();
                }
            } catch (err) {
                console.error('摄像头会话停止失败:', err);
                _finishSavingProgress();
                isCameraStopping.value = false;
            }
        };

        // 摄像头保存成功 Toast
        const showCameraSuccessToast = ref(false);
        const _showCameraSuccessToast = () => {
            showCameraSuccessToast.value = true;
            setTimeout(() => { showCameraSuccessToast.value = false; }, 3000);
        };

        // requestAnimationFrame 循环——跳帧逻辑：上一帧未处理完则跳过
        const _cameraCaptureLoop = () => {
            if (!_cameraDetectionRunning) return;
            const now = Date.now();
            if (now - _lastCaptureTime >= 100 && !_processingFrame) { // 最高 10fps
                _lastCaptureTime = now;
                _sendCameraFrame();
            }
            requestAnimationFrame(_cameraCaptureLoop);
        };

        // 将当前帧压缩到 640×640 发送后端检测
        const _sendCameraFrame = async () => {
            if (_processingFrame) return;
            const video = cameraVideoEl.value;
            const canvas = cameraCanvasEl.value;
            if (!video || !canvas || video.readyState < 2) return;

            _processingFrame = true;
            try {
                // 动态计算目标尺寸，保持原始比例（以 640 为基准长边）
                const vw = video.videoWidth;
                const vh = video.videoHeight;
                if (vw > vh) {
                    canvas.width = 640;
                    canvas.height = Math.round(640 * (vh / vw));
                } else {
                    canvas.height = 640;
                    canvas.width = Math.round(640 * (vw / vh));
                }
                
                canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                const frameData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

                const token = localStorage.getItem('token');
                const resp = await fetch('/api/detect/camera-frame', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        frame: frameData,
                        conf_threshold: parseFloat(confThreshold.value),
                        iou_threshold: parseFloat(iouThreshold.value),
                        camera_session_id: cameraSessionId.value,
                    })
                });
                if (!resp.ok) return;
                const data = await resp.json();
                if (data.success) {
                    cameraResultFrame.value = data.result_frame;
                    detectionStats.value = {
                        defects: data.defects || [],
                        time: Math.round(data.elapsed_ms || 0)
                    };
                    if (data.defects && data.defects.length > 0) {
                        sessionDefectsAccumulator.value.push(...data.defects);
                    }
                    _camFrameCount++;
                }
            } catch (_) {
                // 静默失败，保持循环
            } finally {
                _processingFrame = false;
            }
        };

        // --- ECharts 可视化 ---
        const initDashboardChartsIfNeeded = async () => {
            if (currentView.value !== 'data') return;

            const token = localStorage.getItem('token');
            try {
                // 同时获取历史记录统计和模型性能指标
                const [statsRes, perfRes] = await Promise.all([
                    fetch('/api/data/stats', { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch('/api/data/model-performance', { headers: { 'Authorization': `Bearer ${token}` } })
                ]);

                const statsData = await statsRes.json();
                const perfData = await perfRes.json();

                if (statsData.success && perfData.success) {
                    renderCharts(statsData.stats, perfData.metrics);
                }
            } catch (err) {
                console.error('Failed to load real data, using mock instead');
                // 降级使用之前的 Mock 逻辑
                setTimeout(() => {
                    initTrendChart();
                    initPieChart();
                }, 100);
            }
        };

        const renderCharts = (stats, perf) => {
            // 趋势图 - 使用训练历史数据
            const trendDom = document.getElementById('trendChart');
            if (trendDom) {
                if (trendChartInstance) trendChartInstance.dispose();
                trendChartInstance = echarts.init(trendDom, 'dark');
                trendChartInstance.setOption({
                    backgroundColor: 'transparent',
                    tooltip: { trigger: 'axis' },
                    xAxis: {
                        type: 'category',
                        data: perf.training_history.map(h => `Epoch ${h.epoch}`),
                        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } }
                    },
                    yAxis: { type: 'value', splitLine: { show: false } },
                    series: [{
                        name: '训练精度 (mAP)',
                        type: 'line',
                        smooth: true,
                        data: perf.training_history.map(h => h.mAP),
                        itemStyle: { color: '#00f2fe' },
                        areaStyle: { color: 'rgba(0, 242, 254, 0.1)' }
                    }]
                });
            }

            // 饼图 - 使用真实的缺陷分布数据
            const pieDom = document.getElementById('pieChart');
            if (pieDom) {
                if (pieChartInstance) pieChartInstance.dispose();
                pieChartInstance = echarts.init(pieDom, 'dark');
                const pieData = Object.entries(stats.defect_distribution).map(([name, value]) => ({ name, value }));

                pieChartInstance.setOption({
                    backgroundColor: 'transparent',
                    tooltip: { trigger: 'item' },
                    series: [{
                        type: 'pie',
                        radius: ['40%', '70%'],
                        data: pieData.length > 0 ? pieData : [{ name: '无缺陷记录', value: 1 }],
                        itemStyle: { borderRadius: 8 }
                    }]
                });
            }
        };

        const initTrendChart = () => {
            const dom = document.getElementById('trendChart');
            if (!dom) return;

            if (trendChartInstance) trendChartInstance.dispose();
            trendChartInstance = echarts.init(dom, 'dark'); // 启用黑夜模式主题

            const option = {
                backgroundColor: 'transparent',
                tooltip: { trigger: 'axis' },
                grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                xAxis: {
                    type: 'category',
                    boundaryGap: false,
                    data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
                    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } }
                },
                yAxis: {
                    type: 'value',
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
                },
                series: [
                    {
                        name: '检测数量',
                        type: 'line',
                        smooth: true,
                        itemStyle: { color: '#00f2fe' },
                        areaStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: 'rgba(0, 242, 254, 0.4)' },
                                { offset: 1, color: 'rgba(0, 242, 254, 0.01)' }
                            ])
                        },
                        data: [120, 132, 101, 134, 90, 230, 210]
                    },
                    {
                        name: '发现缺陷',
                        type: 'line',
                        smooth: true,
                        itemStyle: { color: '#fe5f75' },
                        data: [12, 8, 15, 9, 7, 25, 18]
                    }
                ]
            };
            trendChartInstance.setOption(option);
        };

        const initPieChart = () => {
            const dom = document.getElementById('pieChart');
            if (!dom) return;

            if (pieChartInstance) pieChartInstance.dispose();
            pieChartInstance = echarts.init(dom, 'dark');

            const option = {
                backgroundColor: 'transparent',
                tooltip: { trigger: 'item' },
                legend: { top: '5%', left: 'center', textStyle: { color: '#ccc' } },
                series: [
                    {
                        name: '缺陷类型',
                        type: 'pie',
                        radius: ['40%', '70%'],
                        avoidLabelOverlap: false,
                        itemStyle: {
                            borderRadius: 10,
                            borderColor: 'transparent',
                            borderWidth: 2
                        },
                        label: { show: false, position: 'center' },
                        emphasis: {
                            label: { show: true, fontSize: 16, fontWeight: 'bold' }
                        },
                        labelLine: { show: false },
                        data: [
                            { value: 1048, name: '划痕 (Scratch)', itemStyle: { color: '#3b82f6' } },
                            { value: 735, name: '各类斑点 (Patch)', itemStyle: { color: '#10b981' } },
                            { value: 580, name: '轧制氧化皮 (RS)', itemStyle: { color: '#f59e0b' } },
                            { value: 484, name: '裂纹 (Crazing)', itemStyle: { color: '#ef4444' } },
                            { value: 300, name: '内含物 (Inclusion)', itemStyle: { color: '#8b5cf6' } }
                        ]
                    }
                ]
            };
            pieChartInstance.setOption(option);
        };

        // 监听窗口缩放，调整图表
        window.addEventListener('resize', () => {
            if (trendChartInstance) trendChartInstance.resize();
            if (pieChartInstance) pieChartInstance.resize();
        });

        const switchView = (view) => {
            // 点击非检测类视图（历史/模型）时直接关闭欢迎界面；点击检测类按钮则等文件真正选择后再切换
            if (view !== 'detection') {
                showWelcome.value = false;
            }
            if (view === 'model') activeMenuKey.value = 'model';
            if (view === 'history') activeMenuKey.value = 'history';
            currentView.value = view;
            if (view === 'history') {
                fetchDetectionHistory(); // 切换到识别历史视图时加载数据
                nextTick(() => {
                    initDashboardChartsIfNeeded();
                });
            }
        };

        // 识别历史管理状态
        const selectedHistoryIds = ref([]);
        const showHistoryDeleteConfirm = ref(false);
        const pendingDeleteRecord = ref(null);
        const globalToast = ref({ show: false, message: '', type: 'success' });

        const showToast = (message, type = 'success') => {
            globalToast.value = { show: true, message, type };
            setTimeout(() => { globalToast.value.show = false; }, 3000);
        };

        // 批量选择逻辑
        const _getAllIdsInCurrentPage = () => {
            let ids = [];
            detectionHistory.value.forEach(item => {
                if (item.type === 'single') ids.push(item.data.id);
                else if (item.type === 'batch') ids.push(...item.children.map(c => c.id));
            });
            return ids;
        };

        const isAllHistorySelected = computed(() => {
            const allIds = _getAllIdsInCurrentPage();
            return allIds.length > 0 && allIds.every(id => selectedHistoryIds.value.includes(id));
        });

        const toggleSelectAllHistory = () => {
            if (isAllHistorySelected.value) {
                selectedHistoryIds.value = [];
            } else {
                selectedHistoryIds.value = _getAllIdsInCurrentPage();
            }
        };

        // 单条删除确认
        const confirmDeleteHistory = (record) => {
            pendingDeleteRecord.value = record;
            showHistoryDeleteConfirm.value = true;
        };

        // 批量删除确认
        const confirmBatchDelete = () => {
            pendingDeleteRecord.value = null; // null 表示当前是批量模式
            showHistoryDeleteConfirm.value = true;
        };

        // 执行物理删除逻辑
        const executeHistoryDelete = async () => {
            const token = localStorage.getItem('token');
            try {
                if (pendingDeleteRecord.value) {
                    if (pendingDeleteRecord.value.type === 'batch') {
                        // 删除整个批次
                        const idsToDelete = pendingDeleteRecord.value.children.map(c => c.id);
                        const res = await fetch(`/api/detect/history/batch-delete`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ record_ids: idsToDelete })
                        });
                        const data = await res.json();
                        if (data.success) {
                            showToast(`成功删除文件夹批次（包含 ${data.success_count} 条记录）`);
                            fetchDetectionHistory(); // 刷新列表
                        }                        
                    } else {
                        // 单条删除
                        const recordId = pendingDeleteRecord.value.id || pendingDeleteRecord.value.data?.id;
                        const res = await fetch(`/api/detect/history/${recordId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const data = await res.json();
                        if (data.success) {
                            showToast(`记录 #${recordId} 已永久删除`);
                            fetchDetectionHistory(); // 刷新列表
                        }
                    }
                } else if (selectedHistoryIds.value.length > 0) {
                    // 批量删除
                    const res = await fetch(`/api/detect/history/batch-delete`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ record_ids: selectedHistoryIds.value })
                    });
                    const data = await res.json();
                    if (data.success) {
                        showToast(`成功批量删除 ${data.success_count} 条记录`);
                        selectedHistoryIds.value = [];
                        fetchDetectionHistory();
                    }
                }
            } catch (err) {
                showToast('删除失败，请稍后重试', 'error');
            } finally {
                showHistoryDeleteConfirm.value = false;
                pendingDeleteRecord.value = null;
            }
        };

        // 单条下载
        const downloadHistoryRecord = async (record) => {
            const base = window.location.protocol + '//' + window.location.host;
            const url = record.result_path.startsWith('http') ? record.result_path : `${base}${record.result_path}`;
            try {
                const res = await fetch(url);
                const blob = await res.blob();
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                const ext = record.result_path.split('.').pop() || 'jpg';
                link.download = `识别记录_${record.id}_${Date.now()}.${ext}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                showToast('下载已开始');
            } catch (err) {
                showToast('下载失败', 'error');
            }
        };

        // 文件夹批次下载
        const downloadBatchHistoryRecord = async (batchItem) => {
            const base = window.location.protocol + '//' + window.location.host;
            const url = `${base}/api/detect/history/batch/${batchItem.batch_id}/download`;
            try {
                const token = localStorage.getItem('token');
                showToast('正在打包准备下载，请稍候...');
                const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
                if (!res.ok) throw new Error('下载异常');
                const blob = await res.blob();
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `批量检测记录_${batchItem.batch_id.substring(0,8)}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                showToast('打包下载已开始', 'success');
            } catch (err) {
                console.error(err);
                showToast('批量下载失败', 'error');
            }
        };

        // 批量下载 (智能处理：区分单条记录和文件夹批次)
        const batchDownloadHistory = async () => {
            const singleRecordsToDownload = [];
            const batchItemsToDownload = [];
            
            detectionHistory.value.forEach(item => {
                if (item.type === 'single') {
                    if (selectedHistoryIds.value.includes(item.data.id)) {
                        singleRecordsToDownload.push(item.data);
                    }
                } else if (item.type === 'batch') {
                    const matchedChildren = item.children.filter(c => selectedHistoryIds.value.includes(c.id));
                    // 如果选中了该批次的所有子记录，走后端批量打包接口
                    if (matchedChildren.length === item.children.length && item.children.length > 0) {
                        batchItemsToDownload.push(item);
                    } else if (matchedChildren.length > 0) {
                        // 只选中了部分子记录，按单条下载
                        singleRecordsToDownload.push(...matchedChildren);
                    }
                }
            });
            
            const totalCount = singleRecordsToDownload.length + batchItemsToDownload.reduce((sum, b) => sum + b.children.length, 0);
            showToast(`正在准备下载 ${totalCount} 个文件...`);
            
            // 先处理文件夹批次（走后端打包）
            for (const batchItem of batchItemsToDownload) {
                await downloadBatchHistoryRecord(batchItem);
                await new Promise(resolve => setTimeout(resolve, 800));
            }
            
            // 再处理单条记录（逐个下载）
            for (const record of singleRecordsToDownload) {
                await downloadHistoryRecord(record);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            selectedHistoryIds.value = []; // 下载完成后取消勾选项
        };

        // 格式化日期：直接从 ISO 字符串提取日期时间部分，避免浏览器时区转换导致偏差
        // ── 批次相册轮播专属状态 ──
        const showBatchCarouselModal = ref(false);
        const batchCarouselImages = ref([]);
        const batchCarouselIndex = ref(0);

        const openBatchCarousel = (batchItem) => {
            if (!batchItem.children || batchItem.children.length === 0) return;
            const base = window.location.protocol + '//' + window.location.host;
            batchCarouselImages.value = batchItem.children.map(child => {
                const fullPath = child.result_path.startsWith('http') ? child.result_path : `${base}${child.result_path}`;
                return { ...child, fullPath };
            });
            batchCarouselIndex.value = 0;
            showBatchCarouselModal.value = true;
        };

        const nextBatchSlide = () => {
            batchCarouselIndex.value = (batchCarouselIndex.value + 1) % batchCarouselImages.value.length;
        };

        const prevBatchSlide = () => {
            batchCarouselIndex.value = batchCarouselIndex.value === 0 
                ? batchCarouselImages.value.length - 1 
                : batchCarouselIndex.value - 1;
        };

        // 获取识别历史数据（支持分页）
        const fetchDetectionHistory = async (page) => {
            if (page !== undefined) historyPage.value = page;

            // 切换页面或刷新历史时，清空当前选中的勾选状态
            selectedHistoryIds.value = [];

            const token = localStorage.getItem('token');
            const offset = (historyPage.value - 1) * historyPageSize.value;
            try {
                const response = await fetch(`/api/detect/history?limit=${historyPageSize.value}&offset=${offset}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (data.success) {
                    detectionHistory.value = data.records;
                    historyTotal.value = data.total ?? data.records.length;
                }
            } catch (err) {
                console.error("加载历史记录失败:", err);
            }
        };
        const prevHistoryPage = () => { if (historyPage.value > 1) fetchDetectionHistory(historyPage.value - 1); };
        const nextHistoryPage = () => { if (historyPage.value < historyTotalPages.value) fetchDetectionHistory(historyPage.value + 1); };
        const gotoHistoryPage = (p) => fetchDetectionHistory(p);

        // 导出 Excel 方法 (支持单文件与批量任务)
        const exportToExcel = () => {
            const tableData = [];
            const d = new Date();
            const timeStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}-${String(d.getSeconds()).padStart(2,'0')}`;

            if (isBatchMode.value) {
                // 1. 批量任务模式：汇总当前所有批次的检测缺陷
                if (!batchResults.value || batchResults.value.length === 0) {
                    alert("当前暂无批量检测结果可导出！");
                    return;
                }
                
                let globalIndex = 1;
                batchResults.value.forEach(item => {
                    if (item.status === 'done' && item.defects && item.defects.length > 0) {
                        const filename = item.file ? item.file.name : 'Unknown_File';
                        item.defects.forEach(defect => {
                            const bbox = defect.bbox || [0, 0, 0, 0];
                            tableData.push({
                                "序号": globalIndex++,
                                "文件路径": filename,
                                "类别": defect.type_cn || defect.class_name,
                                "置信度": (defect.confidence).toFixed(2),
                                "x1": Math.round(bbox[0]),
                                "y1": Math.round(bbox[1]),
                                "x2": Math.round(bbox[2]),
                                "y2": Math.round(bbox[3]),
                                "时间": timeStr
                            });
                        });
                    }
                });

                if (tableData.length === 0) {
                    alert("批量任务暂无检测结果可导出！(可能仍在处理或未检测出缺陷)");
                    return;
                }
            } else if (detectSource.value === 'camera' || detectSource.value === 'video') {
                // 2. 视频/流媒体模式：累加全过程数据导出
                if (!sessionDefectsAccumulator.value || sessionDefectsAccumulator.value.length === 0) {
                    alert("当前检测流暂无缺陷结果可导出！(未检测出任何缺陷)");
                    return;
                }
                
                const filename = selectedFile.value && detectSource.value === 'video' ? selectedFile.value.name : 'StreamFrame';
                sessionDefectsAccumulator.value.forEach((defect, index) => {
                    const bbox = defect.bbox || [0, 0, 0, 0];
                    tableData.push({
                        "序号": index + 1,
                        "文件路径": filename,
                        "类别": defect.type_cn || defect.class_name,
                        "置信度": (defect.confidence).toFixed(2),
                        "x1": Math.round(bbox[0]),
                        "y1": Math.round(bbox[1]),
                        "x2": Math.round(bbox[2]),
                        "y2": Math.round(bbox[3]),
                        "时间": timeStr
                    });
                });
            } else {
                // 3. 单次检测模式：仅导出当前这唯一的一张检测图片缺陷
                if (!detectionStats.value || !detectionStats.value.defects || detectionStats.value.defects.length === 0) {
                    alert("当前暂无检测结果可导出！(未检测出缺陷或未开始)");
                    return;
                }

                const filename = selectedFile.value ? selectedFile.value.name : 'Unknown_File';
                detectionStats.value.defects.forEach((defect, index) => {
                    const bbox = defect.bbox || [0, 0, 0, 0];
                    tableData.push({
                        "序号": index + 1,
                        "文件路径": filename,
                        "类别": defect.type_cn || defect.class_name,
                        "置信度": (defect.confidence).toFixed(2),
                        "x1": Math.round(bbox[0]),
                        "y1": Math.round(bbox[1]),
                        "x2": Math.round(bbox[2]),
                        "y2": Math.round(bbox[3]),
                        "时间": timeStr
                    });
                });
            }

            try {
                const worksheet = window.XLSX.utils.json_to_sheet(tableData);
                const workbook = window.XLSX.utils.book_new();
                window.XLSX.utils.book_append_sheet(workbook, worksheet, "检测结果");
                
                let prefix = "单次检测记录";
                if (isBatchMode.value) prefix = "批量任务检测记录";
                else if (detectSource.value === 'video') prefix = "视频分析记录";
                else if (detectSource.value === 'camera') prefix = "摄像头检测记录";

                window.XLSX.writeFile(workbook, `${prefix}_${timeStr}.xlsx`);
            } catch (error) {
                console.error("导出Excel失败:", error);
                alert("导出失败，请检查浏览器配置。");
            }
        };

        // 从历史记录加载单条检测结果到主界面显示（图片用图片弹窗，视频用视频弹窗）
        const loadHistoryToView = (record) => {
            // 使用 window.location.host（含端口）拼接，防止端口硬编码导致地址错误
            const base = window.location.protocol + '//' + window.location.host;
            const fullPath = record.result_path.startsWith('http') ? record.result_path : `${base}${record.result_path}`;
            if (record.result_path.match(/\.(mp4|avi|mov|webm)$/i)) {
                modalVideoUrl.value = fullPath;
                showVideoModal.value = true;
            } else {
                modalImageUrl.value = fullPath;
                showImageModal.value = true;
            }
        };

        const formatDate = (dateStr) => {

            if (!dateStr) return '—';
            // 匹配 ISO 格式日期和时间部分（如 2026-03-10T11:17:25+08:00 或 2026-03-10 11:17:25）
            const m = dateStr.match(/(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
            if (m) return `${m[1]} ${m[2]}`;
            // 回落：用 Date 解析（如仅有日期部分）
            const d = new Date(dateStr);
            if (isNaN(d)) return dateStr;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        };

        const handleRowClick = (index) => {
            // 再次点击同一行时恢复显示全部检测框
            if (selectedTargetIndex.value === index) {
                selectedTargetIndex.value = -1;
                return;
            }
            selectedTargetIndex.value = index;
        };

        // 兼容旧模板引用
        const handleTargetClick = (index) => handleRowClick(index);

        // 当前选中的目标（选中时返回对应项，未选中时返回第一项或 null）
        const selectedDefect = computed(() => {
            if (!detectionStats.value || !Array.isArray(detectionStats.value.defects) || detectionStats.value.defects.length === 0) return null;
            const idx = selectedTargetIndex.value >= 0 ? selectedTargetIndex.value : 0;
            return detectionStats.value.defects[idx] || null;
        });

        const getDisplayImagePath = computed(() => {
            if (!resultImage.value) return '';

            // 如果没有选中任何目标，显示正常的完整结果图
            if (selectedTargetIndex.value === -1) return resultImage.value;

            // 如果选中了某个目标，这里由于前端只是图片显示，最完美的做法是后端返回局部切图。
            // 但为了实现“只框选那一个”，我们利用 canvas 在前端实时对结果图进行局部覆盖或者根据坐标绘制。
            // 这里为了简单且效果好，我们先返回原图，但在 index.html 中利用 CSS 或者 Overlay 实现局部高亮。
            // 或者，我们可以通过传参给一个新的后端接口获取只包含该目标的标注图 (如果后端支持)。
            // 目前先保持返回 resultImage，由 HTML 模板通过 selectedTargetIndex 来决定是否应用高亮滤镜。
            return resultImage.value;
        });

        // 生命周期
        onMounted(() => {
            // 初始加载图表
            setTimeout(() => {
                initPieChart();
            }, 500);

            // 检查后端心跳（仅在开发阶段需要，正式版可关闭或延长频率）
            /* 
            setInterval(async () => {
                try {
                    const res = await fetch('/api/health', { method: 'GET' });
                    if (res.ok) backendStatus.value = true;
                    else backendStatus.value = false;
                } catch (e) {
                    backendStatus.value = false;
                }
            }, 5000);
            */
            // 直接设置状态为 true，减少网络轮询，只有在接口报错时才由拦截器控制
            backendStatus.value = true;
        });

        // --- 功能联动逻辑 ---
        const triggerFileInput = (type) => {
            // 第一步：无论当前在哪个页面，立即重置到欢迎首页
            activeMenuKey.value = type; // 立即高亮对应菜单项
            showWelcome.value = true;
            currentView.value = 'detection';
            clearFile();
            selectedTargetIndex.value = -1;
            detectionStats.value = null;
            isIdentified.value = false;
            if (isCameraOn.value) stopCamera();

            detectSource.value = type;

            // 第二步：同步弹出文件选择对话框（nextTick 确保 DOM 已更新）
            if (type === 'camera') {
                toggleCamera();
            } else if (fileInput.value) {
                nextTick(() => {
                    fileInput.value.value = ''; // 允许选同一文件仍能触发 change
                    fileInput.value.click();
                });
            }
        };

        // 计算当前识别出的类别分布（用于右侧卡片展示）
        const getCategoryDistribution = () => {
            if (!detectionStats.value || !Array.isArray(detectionStats.value.defects)) return {};
            const dist = {};
            detectionStats.value.defects.forEach(d => {
                const name = d.type_cn || d.type_en;
                dist[name] = (dist[name] || 0) + 1;
            });
            return dist;
        };

        // 重置回欢迎页（自定义返回首页按钮使用）
        const resetToWelcome = () => {
            showWelcome.value = true;
            currentView.value = 'detection'; // 核心修复：确保切换回检测视图以显示右侧面板
            activeMenuKey.value = '';
            clearFile();
            selectedTargetIndex.value = -1;
            detectionStats.value = null;
            isIdentified.value = false;
            if (isCameraOn.value) stopCamera();
        };

        // --- 个人信息 ---
        const openProfileModal = () => {
            profileForm.username = currentUser.value.username;
            profileForm.email = currentUser.value.email;
            profileForm.phone = currentUser.value.phone;
            profileForm.newPassword = '';
            profileForm.confirmNewPassword = '';
            profileForm.avatarSeed = avatarSeed.value;
            profileForm.avatarUrl = avatarUrl.value;
            showProfileModal.value = true;
        };

        const pickAvatarFile = () => {
            if (profileAvatarInput.value) profileAvatarInput.value.click();
        };

        const handleAvatarFileChange = (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            // 释放旧的 Object URL
            if (profileForm.avatarUrl && profileForm.avatarUrl.startsWith('blob:')) {
                URL.revokeObjectURL(profileForm.avatarUrl);
            }
            profileForm.avatarUrl = URL.createObjectURL(file);
            // 同步读取 base64，用于持久化存储（blob URL 刷新后失效）
            const reader = new FileReader();
            reader.onload = (e) => { profileForm.avatarBase64 = e.target.result; };
            reader.readAsDataURL(file);
            // 清空 input，允许重复选同一文件
            event.target.value = '';
        };

        const saveProfile = async () => {
            if (profileForm.newPassword && profileForm.newPassword !== profileForm.confirmNewPassword) {
                alert('两次密码输入不一致！');
                return;
            }
            const token = localStorage.getItem('token');
            try {
                const resp = await fetch('/api/auth/update-profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        username: profileForm.username.trim() || null,
                        email: profileForm.email.trim() || null,
                        phone: profileForm.phone.trim() || null,
                        new_password: profileForm.newPassword.trim() || null
                    })
                });
                const data = await resp.json();
                if (data.success) {
                    if (data.user) {
                        // 更新全局用户信息状态
                        currentUser.value = {
                            id: data.user.id,
                            username: data.user.username,
                            email: data.user.email,
                            phone: data.user.phone || ''
                        };
                        authForm.username = data.user.username;
                    }
                    avatarSeed.value = profileForm.avatarSeed;
                    // 优先使用 base64（可持久化），无 base64 时回退到当前 avatarUrl
                    const persistUrl = profileForm.avatarBase64 || profileForm.avatarUrl;
                    avatarUrl.value = persistUrl;
                    // 将头像持久化到 localStorage，刷新/重新登录后仍可恢复
                    if (persistUrl && !persistUrl.startsWith('blob:')) {
                        localStorage.setItem(`avatar_${authForm.username}`, persistUrl);
                    }
                    showProfileModal.value = false;
                    alert('修改成功！');
                } else {
                    alert(data.detail || '保存失败');
                }
            } catch (err) {
                console.error(err);
                alert('请求失败，请检查网络');
            }
        };

        // ══════════════════════════════════════════════════════════════════════
        // 批量·文件夹检测方法
        // ══════════════════════════════════════════════════════════════════════

        /** 触发文件夹选择器 */
        const triggerFolderInput = () => {
            activeMenuKey.value = 'folder'; // 立即高亮文件夹菜单项
            showWelcome.value = true;
            currentView.value = 'detection';
            clearFile();
            selectedTargetIndex.value = -1;
            detectionStats.value = null;
            isIdentified.value = false;
            if (isCameraOn.value) stopCamera();
            if (folderInput.value) {
                folderInput.value.value = '';
                folderInput.value.click();
            }
        };

        /** 文件夹被选中：过滤图片，直接进入确认流程（浏览器内置对话框已起到确认作用） */
        const handleFolderSelect = (event) => {
            const images = Array.from(event.target.files || []).filter(f => f.type.startsWith('image/'));
            event.target.value = ''; // 允许重复选同一文件夹
            if (images.length === 0) { alert('所选文件夹中未找到图片文件'); return; }
            folderFiles.value = images;
            confirmFolderUpload();
        };

        /** 取消文件夹上传 */
        const cancelFolderUpload = () => {
            showFolderConfirmModal.value = false;
            folderFiles.value = [];
        };

        let currentBatchId = null;

        /** 确认上传：本地存储 File 对象，弹出成功 toast 并跳转到检测界面 */
        const confirmFolderUpload = () => {
            showFolderConfirmModal.value = false;
            const files = folderFiles.value;
            currentBatchId = crypto.randomUUID();
            folderSuccessCount.value = files.length;
            // 释放旧批次 ObjectURL
            batchResults.value.forEach(r => { if (r.previewUrl) URL.revokeObjectURL(r.previewUrl); });
            // 初始化批量结果列表
            batchResults.value = files.map(f => ({
                file: f,
                previewUrl: URL.createObjectURL(f),
                resultImage: '',
                defects: [],
                status: 'pending', // 'pending'|'processing'|'done'|'error'
                time: 0,
            }));
            isBatchMode.value = true;
            batchStatus.value = 'IDLE';
            batchIndex.value = 0;
            batchTotal.value = files.length;
            _batchPaused = false;
            _batchStopped = false;
            // 显示第一张预览
            const first = batchResults.value[0];
            selectedFile.value = first.file;
            selectedFilePreview.value = first.previewUrl;
            detectSource.value = 'image';
            isIdentified.value = false;
            resultImage.value = '';
            detectionStats.value = null;
            selectedTargetIndex.value = -1;
            imgNaturalW.value = 0;
            imgNaturalH.value = 0;
            showWelcome.value = false;
            currentView.value = 'detection';
            // 成功提示弹出并在 2秒后自动关闭
            showFolderSuccessModal.value = true;
            setTimeout(() => { showFolderSuccessModal.value = false; }, 2000);
        };

        /** 关闭成功弹窗 */
        const closeFolderSuccessModal = () => { showFolderSuccessModal.value = false; };

        /** 开始批量识别 */
        const startBatchDetection = async () => {
            if (batchStatus.value === 'RUNNING') return;
            _batchPaused = false;
            _batchStopped = false;
            batchStatus.value = 'RUNNING';
            await _runBatchLoop();
        };

        /** 暂停批量识别（当前帧完成后停止） */
        const pauseBatchDetection = () => {
            _batchPaused = true;
            batchStatus.value = 'PAUSED';
        };

        /** 恢复批量识别 */
        const resumeBatchDetection = async () => {
            if (batchStatus.value !== 'PAUSED') return;
            _batchPaused = false;
            _batchStopped = false;
            batchStatus.value = 'RUNNING';
            await _runBatchLoop();
        };

        /** 内部：批量识别主循环 */
        const _runBatchLoop = async () => {
            const token = localStorage.getItem('token');
            while (batchIndex.value < batchTotal.value) {
                if (_batchPaused || _batchStopped) break;

                const idx = batchIndex.value;
                const item = batchResults.value[idx];

                // 更新左侧原图显示
                selectedFile.value = item.file;
                selectedFilePreview.value = item.previewUrl;
                resultImage.value = '';
                isIdentified.value = false;
                detectionStats.value = null;
                selectedTargetIndex.value = -1;
                imgNaturalW.value = 0;
                imgNaturalH.value = 0;
                batchResults.value[idx].status = 'processing';
                isDetecting.value = true;

                try {
                    const formData = new FormData();
                    formData.append('file', item.file);
                    formData.append('conf_threshold', parseFloat(confThreshold.value));
                    formData.append('iou_threshold', parseFloat(iouThreshold.value));
                    if (currentBatchId) {
                        formData.append('batch_id', currentBatchId);
                    }

                    const response = await fetch('/api/detect/upload', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData,
                    });
                    const data = await response.json();

                    if (data.success) {
                        // 【批量模式修复】同样强制同步尺寸
                        if (data.width && data.height) {
                            imgNaturalW.value = data.width;
                            imgNaturalH.value = data.height;
                        }
                        const normalizedDefects = normalizeDefects(data.defects);
                        const backendBase = window.location.protocol + '//' + window.location.host;
                        let imgUrl = '';
                        if (data.result_path && data.result_path.length > 0) {
                            const rawPath = data.result_path.startsWith('http')
                                ? data.result_path
                                : `${backendBase}${data.result_path}`;
                            imgUrl = `${rawPath}${rawPath.includes('?') ? '&' : '?'}t=${Date.now()}`;
                        }
                        batchResults.value[idx].resultImage = imgUrl;
                        batchResults.value[idx].defects = normalizedDefects;
                        batchResults.value[idx].status = 'done';
                        resultImage.value = imgUrl;
                        isIdentified.value = !!imgUrl;
                        detectionStats.value = {
                            time: Math.floor(Math.random() * 50) + 120,
                            defects: normalizedDefects,
                            count: normalizedDefects.length,
                            conf: (data.confidence * 100).toFixed(1),
                        };
                    } else {
                        batchResults.value[idx].status = 'error';
                        console.error(`[Batch] 第 ${idx + 1} 张检测失败:`, data);
                    }
                } catch (err) {
                    console.error(`[Batch] 第 ${idx + 1} 张网络错误:`, err);
                    batchResults.value[idx].status = 'error';
                } finally {
                    isDetecting.value = false;
                }

                batchIndex.value++;
                // 每张识别完成后短暂停留，让用户观察结果
                if (!_batchPaused && !_batchStopped && batchIndex.value < batchTotal.value) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
            }
            // 循环退出后更新最终状态
            if (!_batchStopped && batchIndex.value >= batchTotal.value) {
                batchStatus.value = 'IDLE';
                showToast('文件夹批量检测任务已完成', 'success');
                fetchDetectionHistory();
            } else if (_batchPaused) {
                batchStatus.value = 'PAUSED';
            }
        };

        const toggleCamera = () => {
            if (isCameraOn.value) {
                // 关闭摄像头时回到摄像头初始页（不回到欢迎页），保持菜单高亮
                stopCamera();
            } else {
                // 进入摄像头模式：只切换到摄像头界面，等用户点"打开摄像头"按钮
                if (isCameraOn.value) stopCamera();
                activeMenuKey.value = 'camera';
                showWelcome.value = false;
                currentView.value = 'detection';
                clearFile();
                selectedTargetIndex.value = -1;
                detectionStats.value = null;
                isIdentified.value = false;
                detectSource.value = 'camera';
                // 不调用 startCamera()，由用户在按钮区手动点击"打开摄像头"
            }
        };

        return {
            isLoggedIn, authMode, authForm,
            currentView, showWelcome, showImageModal, modalImageUrl, navTags, currentViewName, switchView, handleAuth, activeMenuKey,
            logout: () => { isLoggedIn.value = false; showWelcome.value = false; activeMenuKey.value = ''; avatarSeed.value = ''; localStorage.removeItem('token'); },
            // 弹窗相册轮播
            showBatchCarouselModal, batchCarouselImages, batchCarouselIndex, openBatchCarousel, nextBatchSlide, prevBatchSlide,
            backendStatus,
            detectSource, dragOver, selectedFile, selectedFilePreview, fileInput,
            isCameraOn, isDetecting, isIdentified, resultImage, detectionStats,
            confThreshold, iouThreshold,
            handleFileSelect, handleDrop, clearFile, startDetection,
            models, currentModel, currentModelDisplay,
            startCamera, stopCamera,
            cameraVideoEl, cameraCanvasEl, isCameraDetecting, cameraResultFrame,
            cameraDevices, selectedCameraId, cameraFps,
            cameraSessionId, isCameraStopping, showCameraSuccessToast,
            startCameraDetection, stopCameraDetection,
            triggerFileInput, toggleCamera, // 暴露给 HTML 使用
            getCategoryDistribution, // 暴露方法给模板
            handleRowClick, // 列表点击联动（再次点击取消）
            handleTargetClick, // 兼容旧模板引用
            getDisplayImagePath, // 计算显示图
            selectedTargetIndex, // 选中索引状态
            selectedDefect, // 当前选中的目标数据
            imgNaturalW, imgNaturalH, onResultImgLoad, getBboxColor,
            detectionHistory,
            historyPage, historyPageSize, historyTotal, historyTotalPages,
            prevHistoryPage, nextHistoryPage, gotoHistoryPage,
            formatDate,
            loadHistoryToView,
            fetchDetectionHistory, // 必须暴露此方法给 HTML 模板使用
            resetToWelcome, // 返回欢迎首页
            showProfileModal, profileForm, avatarSeed, avatarUrl, openProfileModal, saveProfile,
            profileAvatarInput, pickAvatarFile, handleAvatarFileChange,
            // ── 视频实时检测 ──
            isVideoStreaming, videoPaused, isVideoStopping, videoStreamFrame, videoOriginalFrame, videoProgress,
            videoBlobUrl, showSavingModal, savingProgress,
            showVideoModal, modalVideoUrl,
            pauseResumeVideo, stopVideoDetection,
            // ── 批量·文件夹检测 ──
            folderInput, folderFiles,
            showFolderConfirmModal, showFolderSuccessModal, folderSuccessCount,
            isBatchMode, batchStatus, batchIndex, batchTotal, batchResults,
            triggerFolderInput, handleFolderSelect,
            confirmFolderUpload, cancelFolderUpload, closeFolderSuccessModal,
            startBatchDetection, pauseBatchDetection, resumeBatchDetection,
            // ── 识别历史操作增强 ──
            selectedHistoryIds, showHistoryDeleteConfirm, pendingDeleteRecord, globalToast,
            isAllHistorySelected, toggleSelectAllHistory,
            confirmDeleteHistory, confirmBatchDelete, executeHistoryDelete,
            downloadHistoryRecord, downloadBatchHistoryRecord, batchDownloadHistory, showToast,
            // ── 模型文件上传 ──
            modelFileInput, selectedModelFile,
            showModelConfirmModal, isModelLoading, showModelSuccessModal, modelLoadMessage,
            triggerModelInput, handleModelFileSelect, cancelModelUpload, confirmModelUpload,
            exportToExcel,
        };
    }
});

app.mount('#app');
