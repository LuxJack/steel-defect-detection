<template>
  <div class="detection-page">
    <div class="page-header">
      <h2>钢材缺陷检测</h2>
      <p>上传钢材图片进行智能缺陷检测分析</p>
    </div>
    
    <div class="detection-container">
      <!-- 上传区域 -->
      <div class="upload-section card">
        <div class="upload-area" 
             @drop.prevent="handleDrop"
             @dragover.prevent="dragOver = true"
             @dragleave="dragOver = false"
             :class="{ 'drag-over': dragOver }"
             @click="triggerFileInput">
          <div class="upload-content">
            <div class="upload-icon">📁</div>
            <h3>拖放图片或点击上传</h3>
            <p>支持 JPG、PNG 格式，最大 10MB</p>
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              @change="handleFileSelect"
              style="display: none"
            />
          </div>
        </div>
        
        <div v-if="selectedFile" class="file-info">
          <div class="file-preview">
            <img :src="previewUrl" :alt="selectedFile.name" />
          </div>
          <div class="file-details">
            <h4>{{ selectedFile.name }}</h4>
            <p>{{ (selectedFile.size / 1024 / 1024).toFixed(2) }} MB</p>
            <div class="file-actions">
              <button @click="startDetection" class="btn btn-primary" :disabled="detecting">
                <span v-if="detecting" class="loading-spinner"></span>
                {{ detecting ? '检测中...' : '开始检测' }}
              </button>
              <button @click="clearFile" class="btn btn-secondary">重新选择</button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 检测结果 -->
      <div v-if="detectionResult" class="result-section card">
        <div class="result-header">
          <h3>检测结果</h3>
          <div class="result-stats">
            <span class="stat-badge">发现 {{ defectsCount }} 个缺陷</span>
            <span class="stat-badge">置信度 {{ maxConfidence }}%</span>
          </div>
        </div>

        <!-- 上半区：图片 + 检测记录栏 -->
        <div class="result-main">
          <!-- 左侧：图片区（两个元素切换）-->
          <div class="result-image-wrapper">
            <!-- 默认：服务器预渲染结果图（含全部检测框）-->
            <img
              v-show="selectedDefectIndex === null"
              ref="resultImg"
              :src="resultImageUrl"
              alt="检测结果"
              class="result-img"
            />
            <!-- 选中某条：Canvas 绘制原图 + 单框 -->
            <canvas
              v-show="selectedDefectIndex !== null"
              ref="resultCanvas"
              class="result-img"
            ></canvas>
            <div class="image-overlay-bar">
              <span>{{ selectedDefectIndex !== null ? '当前显示目标 #' + (selectedDefectIndex + 1) : '检测完成' }}</span>
              <span>{{ detectionTime }}</span>
            </div>
          </div>

          <!-- 右侧：检测记录栏 -->
          <div class="detection-detail-panel">
            <div class="panel-title">
              <span class="panel-title-icon">≡</span> 检测记录
            </div>
            <div class="panel-body">
              <div class="form-item">
                <label class="form-label">检测类别:</label>
                <input type="text" readonly class="form-input" :value="selectedDefect ? selectedDefect.type_cn : ''" placeholder="--" />
              </div>
              <div class="form-item">
                <label class="form-label">置信度:</label>
                <input type="text" readonly class="form-input" :value="selectedDefect ? (selectedDefect.confidence * 100).toFixed(2) + '%' : ''" placeholder="--" />
              </div>
              <div class="form-item">
                <label class="form-label coord-label">坐标位置:</label>
              </div>
              <div class="form-coords">
                <div class="coord-pair">
                  <div class="coord-item">
                    <label class="coord-sub-label">X:</label>
                    <input type="text" readonly class="form-input" :value="selectedDefect ? parsedBbox.x : ''" placeholder="--" />
                  </div>
                  <div class="coord-item">
                    <label class="coord-sub-label">Y:</label>
                    <input type="text" readonly class="form-input" :value="selectedDefect ? parsedBbox.y : ''" placeholder="--" />
                  </div>
                </div>
                <div class="coord-pair">
                  <div class="coord-item">
                    <label class="coord-sub-label">宽:</label>
                    <input type="text" readonly class="form-input" :value="selectedDefect ? parsedBbox.w : ''" placeholder="--" />
                  </div>
                  <div class="coord-item">
                    <label class="coord-sub-label">高:</label>
                    <input type="text" readonly class="form-input" :value="selectedDefect ? parsedBbox.h : ''" placeholder="--" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 下半区：识别目标列表仪表盘 -->
        <div class="defects-table-section">
          <div class="defects-table-header">
            <h4><span class="table-title-icon">≡</span> 识别目标列表仪表盘</h4>
            <span class="defects-table-tip" v-if="selectedDefectIndex !== null">
              再次点击可取消选中
            </span>
          </div>
          <div v-if="defectsCount > 0" class="defects-table-wrapper">
            <table class="defects-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>文件路径</th>
                  <th>识别类型</th>
                  <th>置信度</th>
                  <th>定位坐标 (x1, y1) - (x2, y2)</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(defect, index) in detectionResult.defects"
                  :key="'row-' + index"
                  class="defect-row"
                  :class="{ 'row-active': selectedDefectIndex === index, 'row-dimmed': selectedDefectIndex !== null && selectedDefectIndex !== index }"
                  @click.stop="toggleDefect(index)"
                >
                  <td class="col-index">{{ index + 1 }}</td>
                  <td class="col-file">
                    <span class="file-icon">🖼</span>
                    {{ selectedFile ? selectedFile.name : '' }}
                  </td>
                  <td class="col-type">
                    <span class="type-badge" :class="'type-color-' + (index % 6)">{{ defect.type_cn }}</span>
                  </td>
                  <td class="col-conf">
                    {{ (defect.confidence * 100).toFixed(2) }}%
                  </td>
                  <td class="col-coords mono">
                    <span class="coord-icon">⊙</span>
                    ({{ Math.round(defect.bbox[0]) }}, {{ Math.round(defect.bbox[1]) }}) - ({{ Math.round(defect.bbox[2]) }}, {{ Math.round(defect.bbox[3]) }})
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="no-defects">
            <div class="success-icon">✅</div>
            <p>未发现缺陷，钢材质量良好</p>
          </div>
        </div>

        <div class="result-actions">
          <button @click="clearResult" class="btn btn-secondary">重新检测</button>
        </div>
      </div>
      
      <!-- 检测历史 -->
      <div class="history-section card">
        <div class="section-header">
          <h3>最近检测记录</h3>
          <button @click="refreshHistory" class="btn btn-secondary">刷新</button>
        </div>
        
        <div v-if="historyLoading" class="loading-history">
          <span class="loading-spinner"></span>
          加载中...
        </div>
        
        <div v-else-if="detectionHistory.length > 0" class="history-list">
          <div v-for="record in detectionHistory" :key="record.id" class="history-item">
            <div class="history-preview">
              <img :src="getImageUrl(record.image_path)" :alt="record.defect_type" />
            </div>
            <div class="history-info">
              <div class="history-defect">
                <span class="defect-tag" :class="getDefectClass(record.defect_type)">
                  {{ record.defect_type }}
                </span>
                <span class="confidence">{{ (record.confidence * 100).toFixed(1) }}%</span>
              </div>
              <div class="history-time">{{ formatTime(record.created_at) }}</div>
            </div>
          </div>
        </div>
        
        <div v-else class="empty-history">
          <p>暂无检测记录</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useAuthStore } from '../../stores/auth'
import axios from 'axios'

export default {
  name: 'Detection',
  setup() {
    const authStore = useAuthStore()
    const fileInput = ref(null)
    const imageWrapper = ref(null)
    const resultImg = ref(null)
    const resultCanvas = ref(null)

    const dragOver = ref(false)
    const selectedFile = ref(null)
    const previewUrl = ref('')
    const detecting = ref(false)
    const detectionResult = ref(null)
    const detectionHistory = ref([])
    const historyLoading = ref(false)
    const detectionTime = ref('')

    // bbox 叠加层相关
    const imageLoaded = ref(false)
    const imgNaturalW = ref(1)
    const imgNaturalH = ref(1)
    const imgDisplayW = ref(1)
    const imgDisplayH = ref(1)

    // 选中状态
    const selectedDefectIndex = ref(null)
    const selectedDefect = ref(null)

    const defectsCount = computed(() => {
      return detectionResult.value ? detectionResult.value.defects.length : 0
    })

    const maxConfidence = computed(() => {
      if (!detectionResult.value || defectsCount.value === 0) return 0
      const max = Math.max(...detectionResult.value.defects.map(d => d.confidence))
      return (max * 100).toFixed(1)
    })

    const resultImageUrl = computed(() => {
      if (!detectionResult.value) return ''
      return `http://localhost:8000${detectionResult.value.result_path}`
    })
    
    const triggerFileInput = () => {
      fileInput.value.click()
    }

    const handleDrop = (event) => {
      dragOver.value = false
      const files = event.dataTransfer.files
      if (files.length > 0) {
        processFile(files[0])
      }
    }

    const handleFileSelect = (event) => {
      const files = event.target.files
      if (files.length > 0) {
        processFile(files[0])
      }
    }

    const processFile = (file) => {
      if (!file.type.startsWith('image/')) {
        alert('请选择图片文件')
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        alert('文件大小不能超过10MB')
        return
      }

      selectedFile.value = file
      previewUrl.value = URL.createObjectURL(file)
      detectionResult.value = null
      imageLoaded.value = false
      selectedDefectIndex.value = null
      selectedDefect.value = null
    }

    const clearFile = () => {
      selectedFile.value = null
      previewUrl.value = ''
      detectionResult.value = null
      imageLoaded.value = false
      selectedDefectIndex.value = null
      selectedDefect.value = null
      if (fileInput.value) {
        fileInput.value.value = ''
      }
    }

    const startDetection = async () => {
      if (!selectedFile.value) return

      detecting.value = true
      imageLoaded.value = false
      selectedDefectIndex.value = null
      selectedDefect.value = null

      try {
        const formData = new FormData()
        formData.append('file', selectedFile.value)

        const response = await axios.post('/api/detect/image', formData, {
          headers: {
            'Authorization': `Bearer ${authStore.token}`,
            'Content-Type': 'multipart/form-data'
          }
        })

        detectionResult.value = response.data
        detectionTime.value = new Date().toLocaleString('zh-CN')
        await fetchDetectionHistory()

      } catch (error) {
        console.error('检测失败:', error)
        alert('检测失败，请重试')
      } finally {
        detecting.value = false
      }
    }

    const clearResult = () => {
      detectionResult.value = null
      imageLoaded.value = false
      selectedDefectIndex.value = null
      selectedDefect.value = null
      clearFile()
    }

    const downloadResult = () => {
      if (!detectionResult.value) return

      const link = document.createElement('a')
      link.href = resultImageUrl.value
      link.download = `detection_result_${Date.now()}.jpg`
      link.click()
    }

    const saveToHistory = () => {
      // 结果已自动保存到后端
      alert('检测记录已保存')
    }

    // Canvas 绘制：原图 + 单条 bbox
    const BOX_COLORS = ['#ff4d4f', '#fa8c16', '#fadb14', '#52c41a', '#1890ff', '#722ed1']

    const drawSingleBox = (index) => {
      const canvas = resultCanvas.value
      if (!canvas || !previewUrl.value || !detectionResult.value) return
      const defect = detectionResult.value.defects[index]
      if (!defect) return

      const img = new Image()
      img.src = previewUrl.value
      img.onload = () => {
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)

        const [x1, y1, x2, y2] = defect.bbox
        const color = BOX_COLORS[index % BOX_COLORS.length]
        const lineW = Math.max(2, Math.round(img.naturalWidth / 300))
        ctx.strokeStyle = color
        ctx.lineWidth = lineW
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)

        // 标签背景
        const fontSize = Math.max(14, Math.round(img.naturalWidth / 60))
        ctx.font = `bold ${fontSize}px Arial, sans-serif`
        const label = `${defect.type_cn}  ${(defect.confidence * 100).toFixed(1)}%`
        const tw = ctx.measureText(label).width
        const pad = 6
        const labelH = fontSize + pad * 2
        const labelY = y1 - labelH < 0 ? y1 : y1 - labelH
        ctx.fillStyle = color
        ctx.fillRect(x1 - lineW / 2, labelY, tw + pad * 2, labelH)
        // 标签文字
        ctx.fillStyle = index === 2 ? '#333' : '#fff'
        ctx.fillText(label, x1 + pad - lineW / 2, labelY + fontSize + pad - 2)
      }
    }

    // 选中/取消选中某条记录
    const toggleDefect = (index) => {
      if (selectedDefectIndex.value === index) {
        selectedDefectIndex.value = null
      } else {
        selectedDefectIndex.value = index
        nextTick(() => drawSingleBox(index))
      }
    }

    // 解析 bbox 坐标 - 兼容数组 [x1,y1,x2,y2] 和字符串 "(x1, y1) - (x2, y2)" 两种格式
    const parseBboxCoord = (bbox) => {
      if (!bbox) return { x: '', y: '', w: '', h: '' }
      let x1, y1, x2, y2
      if (Array.isArray(bbox)) {
        ;[x1, y1, x2, y2] = bbox
      } else if (typeof bbox === 'string') {
        const match = bbox.match(
          /\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*-\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/
        )
        if (!match) return { x: '', y: '', w: '', h: '' }
        ;[, x1, y1, x2, y2] = match.map(Number)
      } else {
        return { x: '', y: '', w: '', h: '' }
      }
      return {
        x: Math.round(x1),
        y: Math.round(y1),
        w: Math.round(x2 - x1),
        h: Math.round(y2 - y1)
      }
    }

    const parsedBbox = computed(() => parseBboxCoord(selectedDefect.value?.bbox))

    // watch selectedDefectIndex，强制更新 selectedDefect（用 spread 保证新对象引用）
    watch(selectedDefectIndex, (newIndex) => {
      if (newIndex === null || !detectionResult.value) {
        selectedDefect.value = null
      } else {
        const raw = detectionResult.value.defects[newIndex]
        if (raw) {
          // 用展开赋值，确保 Vue 每次都检测到引用变化
          selectedDefect.value = { ...raw }
        } else {
          selectedDefect.value = null
        }
      }
    })

    // 置信度颜色
    const getConfColor = (conf) => {
      if (conf >= 0.8) return '#ff4d4f'
      if (conf >= 0.5) return '#faad14'
      return '#52c41a'
    }
    
    const fetchDetectionHistory = async () => {
      historyLoading.value = true
      try {
        const response = await axios.get('/api/detect/history?limit=5', {
          headers: {
            'Authorization': `Bearer ${authStore.token}`
          }
        })
        detectionHistory.value = response.data.records
      } catch (error) {
        console.error('获取检测历史失败:', error)
      } finally {
        historyLoading.value = false
      }
    }

    const refreshHistory = () => {
      fetchDetectionHistory()
    }

    const getImageUrl = (path) => {
      return `http://localhost:8000${path}`
    }

    const getDefectClass = (defectType) => {
      if (defectType === '无缺陷') return 'no-defect'
      return 'has-defect'
    }

    const formatTime = (timeString) => {
      return new Date(timeString).toLocaleString('zh-CN')
    }

    onMounted(() => {
      fetchDetectionHistory()
    })

    return {
      fileInput,
      imageWrapper,
      resultImg,
      resultCanvas,
      dragOver,
      selectedFile,
      previewUrl,
      detecting,
      detectionResult,
      detectionHistory,
      historyLoading,
      detectionTime,
      selectedDefectIndex,
      selectedDefect,
      defectsCount,
      maxConfidence,
      resultImageUrl,
      triggerFileInput,
      handleDrop,
      handleFileSelect,
      clearFile,
      startDetection,
      clearResult,
      downloadResult,
      saveToHistory,
      toggleDefect,
      getConfColor,
      parsedBbox,
      refreshHistory,
      getImageUrl,
      getDefectClass,
      formatTime
    }
  }
}
</script>

<style scoped>
.detection-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  text-align: center;
  margin-bottom: 40px;
}

.page-header h2 {
  font-size: 32px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 8px;
}

.page-header p {
  color: var(--text-secondary);
  font-size: 16px;
}

.detection-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── 上传区 ── */
.upload-section {
  padding: 0;
  overflow: hidden;
}

.upload-area {
  padding: 60px 40px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px dashed var(--border);
  border-radius: 12px;
  margin: 20px;
}

.upload-area:hover,
.upload-area.drag-over {
  border-color: var(--primary);
  background: rgba(0, 212, 255, 0.05);
}

.upload-content {
  pointer-events: none;
}

.upload-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.upload-area h3 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.upload-area p {
  color: var(--text-secondary);
  font-size: 14px;
}

.file-info {
  display: flex;
  gap: 20px;
  padding: 20px;
  border-top: 1px solid var(--border);
}

.file-preview {
  width: 120px;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.file-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.file-details h4 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.file-details p {
  color: var(--text-secondary);
  font-size: 14px;
}

.file-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

/* ── 结果区 ── */
.result-section {
  animation: fadeIn 0.6s ease-out;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.result-header h3 {
  font-size: 24px;
  font-weight: 600;
}

.result-stats {
  display: flex;
  gap: 12px;
}

.stat-badge {
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary);
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid var(--border);
}

/* ── 上半区：图片 + 检测记录栏 ── */
.result-main {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 20px;
  margin-bottom: 24px;
  align-items: start;
}

/* 图片容器 */
.result-image-wrapper {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
}

.result-img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 480px;
  object-fit: contain;
}

/* bbox 叠加框（已移除，改为Canvas绘制） */

/* 图片底部信息条 */
.image-overlay-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%);
  padding: 12px 16px;
  color: white;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

/* ── 检测记录栏（表单样式，仿截图） ── */
.detection-detail-panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  background: #1a1a2e;
  display: flex;
  flex-direction: column;
}

.panel-title {
  font-size: 15px;
  font-weight: 700;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,255,255,0.04);
}

.panel-title-icon {
  color: #e8a020;
  font-size: 18px;
}

.panel-body {
  flex: 1;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 12px;
  font-weight: 600;
  color: #e8a020;
}

.coord-label {
  margin-bottom: 2px;
}

.form-input,
.form-display {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text-primary);
  width: 100%;
  box-sizing: border-box;
  outline: none;
  cursor: default;
  min-height: 38px;
}

.form-display {
  display: flex;
  align-items: center;
}

.form-input {
  font-family: inherit;
  line-height: 22px;
  caret-color: transparent;
  user-select: text;
}

.form-input::placeholder {
  color: rgba(255,255,255,0.25);
}

.form-input:focus {
  border-color: rgba(255,255,255,0.25);
  background: rgba(255,255,255,0.08);
}

.form-coords {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.coord-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.coord-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.coord-sub-label {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ── 识别列表 ── */
.defects-table-section {
  margin-bottom: 24px;
}

.defects-table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.defects-table-header h4 {
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-title-icon {
  color: #e8a020;
  font-size: 18px;
}

.defects-table-tip {
  font-size: 12px;
  color: var(--text-secondary);
}

.defects-table-wrapper {
  border: 1.5px solid #f0d5a0;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}

.defects-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.defects-table thead th {
  background: #fef3e2;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  color: #555;
  border-bottom: 2px solid #f0d5a0;
}

.defect-row {
  cursor: pointer;
  transition: background 0.15s, opacity 0.2s;
  border-bottom: 1px solid #f0e8d8;
}

.defect-row:last-child {
  border-bottom: none;
}

.defect-row:hover {
  background: #fff8ee;
}

.defect-row td {
  padding: 13px 16px;
  vertical-align: middle;
  font-size: 13px;
  color: #333;
}

/* 选中行 —— 橙色高亮，与截图一致 */
.row-active {
  background: #fff3e0 !important;
  border-left: 4px solid #e8a020 !important;
}

.row-active td {
  color: #333 !important;
}

/* 未选中行变淡 */
.row-dimmed {
  opacity: 0.5;
  pointer-events: auto;
  cursor: pointer;
}

.col-index {
  font-weight: 700;
  font-size: 14px;
  color: #333;
  width: 50px;
}

.col-file {
  color: #555;
  font-size: 12px;
}

.file-icon {
  margin-right: 4px;
  opacity: 0.6;
}

/* 各类别徽标颜色 */
.type-badge {
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  display: inline-block;
  border: 1.5px solid;
}

.type-color-0 { background: #fff0f0; color: #d4380d; border-color: #d4380d; }
.type-color-1 { background: #fff7e6; color: #d46b08; border-color: #d46b08; }
.type-color-2 { background: #fffbe6; color: #d48806; border-color: #d48806; }
.type-color-3 { background: #f6ffed; color: #389e0d; border-color: #389e0d; }
.type-color-4 { background: #e6f7ff; color: #096dd9; border-color: #096dd9; }
.type-color-5 { background: #f9f0ff; color: #531dab; border-color: #531dab; }

.col-conf {
  font-weight: 600;
  font-size: 13px;
  color: #333;
}

.col-coords {
  font-size: 12px;
  color: #555;
}

.col-coords.mono {
  font-family: 'Courier New', monospace;
}

.coord-icon {
  margin-right: 4px;
  color: #999;
}

.no-defects {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.success-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

/* ── 结果操作按钮 ── */
.result-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

/* ── 历史记录 ── */
.history-section {
  animation: slideInLeft 0.6s ease-out;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-header h3 {
  font-size: 20px;
  font-weight: 600;
}

.loading-history {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  border: 1px solid var(--border);
  transition: all 0.3s ease;
}

.history-item:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateX(4px);
}

.history-preview {
  width: 60px;
  height: 60px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.history-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.history-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.history-defect {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.defect-tag {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.defect-tag.has-defect {
  background: rgba(255, 107, 107, 0.1);
  color: var(--secondary);
}

.defect-tag.no-defect {
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary);
}

.confidence {
  font-size: 12px;
  color: var(--text-secondary);
}

.history-time {
  font-size: 11px;
  color: var(--text-secondary);
}

.empty-history {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

@media (max-width: 900px) {
  .result-main {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .file-info {
    flex-direction: column;
  }

  .file-preview {
    width: 100%;
    height: 200px;
  }

  .result-actions {
    flex-direction: column;
  }
}
</style>
