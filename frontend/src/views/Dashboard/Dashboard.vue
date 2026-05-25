<template>
  <div class="dashboard-page">
    <div class="dashboard-header">
      <h2>数据统计大屏</h2>
      <p>实时监控钢材缺陷检测数据</p>
    </div>
    
    <div class="stats-overview">
      <div class="stat-card card">
        <div class="stat-icon">📊</div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.todayCount || 0 }}</div>
          <div class="stat-label">今日检测</div>
        </div>
      </div>
      
      <div class="stat-card card">
        <div class="stat-icon">📈</div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.weekCount || 0 }}</div>
          <div class="stat-label">本周检测</div>
        </div>
      </div>
      
      <div class="stat-card card">
        <div class="stat-icon">📅</div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.monthCount || 0 }}</div>
          <div class="stat-label">本月检测</div>
        </div>
      </div>
      
      <div class="stat-card card">
        <div class="stat-icon">🔢</div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.totalCount || 0 }}</div>
          <div class="stat-label">总检测量</div>
        </div>
      </div>
    </div>
    
    <div class="charts-grid">
      <div class="chart-card card">
        <h3>缺陷类型分布</h3>
        <div class="chart-container">
          <div v-if="defectDistribution.length > 0" class="pie-chart">
            <div v-for="item in defectDistribution" :key="item.name" class="pie-item">
              <div class="pie-color" :style="{ backgroundColor: getColor(item.name) }"></div>
              <span class="pie-label">{{ item.name }}</span>
              <span class="pie-value">{{ item.value }}</span>
            </div>
          </div>
          <div v-else class="no-data">暂无数据</div>
        </div>
      </div>
      
      <div class="chart-card card">
        <h3>本周检测趋势</h3>
        <div class="chart-container">
          <div class="line-chart">
            <div v-for="day in weeklyTrend" :key="day.date" class="line-item">
              <div class="line-bar" :style="{ height: getBarHeight(day.count) + 'px' }"></div>
              <span class="line-label">{{ formatDate(day.date) }}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="chart-card card">
        <h3>最近检测记录</h3>
        <div class="recent-detections">
          <div v-for="detection in recentDetections" :key="detection.id" class="detection-item">
            <div class="detection-type">{{ detection.defect_type }}</div>
            <div class="detection-confidence">{{ (detection.confidence * 100).toFixed(1) }}%</div>
            <div class="detection-time">{{ formatTime(detection.created_at) }}</div>
          </div>
          <div v-if="recentDetections.length === 0" class="no-data">暂无检测记录</div>
        </div>
      </div>
      
      <div class="chart-card card">
        <h3>检测质量分析</h3>
        <div class="quality-stats">
          <div class="quality-item">
            <span class="quality-label">优质检测</span>
            <span class="quality-value">{{ qualityStats.good }}%</span>
          </div>
          <div class="quality-item">
            <span class="quality-label">一般检测</span>
            <span class="quality-value">{{ qualityStats.normal }}%</span>
          </div>
          <div class="quality-item">
            <span class="quality-label">需改进</span>
            <span class="quality-value">{{ qualityStats.poor }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import axios from 'axios'

export default {
  name: 'Dashboard',
  setup() {
    const authStore = useAuthStore()
    const stats = ref({})
    const recentDetections = ref([])
    
    const defectDistribution = computed(() => {
      if (!stats.value.defect_distribution) return []
      return Object.entries(stats.value.defect_distribution).map(([name, value]) => ({
        name,
        value
      }))
    })
    
    const weeklyTrend = computed(() => {
      return stats.value.weekly_trend || []
    })
    
    const qualityStats = computed(() => {
      const total = stats.value.totalCount || 1
      const good = Math.round(((stats.value.todayCount || 0) / total) * 100)
      const normal = Math.round(((stats.value.weekCount || 0) / total) * 50)
      const poor = 100 - good - normal
      
      return {
        good: Math.max(0, good),
        normal: Math.max(0, normal),
        poor: Math.max(0, poor)
      }
    })
    
    const getColor = (name) => {
      const colors = {
        '裂纹': '#ff6b6b',
        '锈蚀': '#4ecdc4',
        '凹坑': '#45b7d1',
        '划痕': '#96ceb4',
        '变形': '#feca57',
        '无缺陷': '#54a0ff'
      }
      return colors[name] || '#999'
    }
    
    const getBarHeight = (count) => {
      const max = Math.max(...weeklyTrend.value.map(d => d.count), 1)
      return (count / max) * 100
    }
    
    const formatDate = (dateString) => {
      const date = new Date(dateString)
      return `${date.getMonth() + 1}/${date.getDate()}`
    }
    
    const formatTime = (timeString) => {
      return new Date(timeString).toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    }
    
    const fetchDashboardData = async () => {
      try {
        const [statsResponse, recentResponse] = await Promise.all([
          axios.get('/api/data/stats', {
            headers: { 'Authorization': `Bearer ${authStore.token}` }
          }),
          axios.get('/api/data/recent-detections?limit=5', {
            headers: { 'Authorization': `Bearer ${authStore.token}` }
          })
        ])
        
        stats.value = statsResponse.data
        recentDetections.value = recentResponse.data.recent_detections
      } catch (error) {
        console.error('获取仪表盘数据失败:', error)
      }
    }
    
    onMounted(() => {
      fetchDashboardData()
    })
    
    return {
      stats,
      recentDetections,
      defectDistribution,
      weeklyTrend,
      qualityStats,
      getColor,
      getBarHeight,
      formatDate,
      formatTime
    }
  }
}
</script>

<style scoped>
.dashboard-page {
  max-width: 1200px;
  margin: 0 auto;
}

.dashboard-header {
  text-align: center;
  margin-bottom: 40px;
}

.dashboard-header h2 {
  font-size: 32px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 8px;
}

.dashboard-header p {
  color: var(--text-secondary);
  font-size: 16px;
}

.stats-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
  margin-bottom: 40px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--glow);
}

.stat-icon {
  font-size: 48px;
  opacity: 0.8;
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 36px;
  font-weight: 700;
  color: var(--primary);
  line-height: 1;
  margin-bottom: 4px;
}

.stat-label {
  color: var(--text-secondary);
  font-size: 14px;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 24px;
}

.chart-card {
  padding: 24px;
}

.chart-card h3 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 20px;
  color: var(--text-primary);
}

.chart-container {
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pie-chart {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pie-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.pie-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

.pie-label {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
}

.pie-value {
  font-weight: 600;
  color: var(--primary);
}

.line-chart {
  display: flex;
  align-items: end;
  gap: 16px;
  height: 120px;
  width: 100%;
}

.line-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.line-bar {
  width: 100%;
  background: linear-gradient(to top, var(--primary), var(--accent));
  border-radius: 4px 4px 0 0;
  min-height: 4px;
  transition: height 0.3s ease;
}

.line-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.recent-detections {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.detection-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.detection-type {
  font-weight: 600;
  color: var(--primary);
}

.detection-confidence {
  color: var(--secondary);
  font-size: 14px;
}

.detection-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.quality-stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.quality-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.quality-label {
  color: var(--text-primary);
}

.quality-value {
  font-weight: 600;
  color: var(--primary);
}

.no-data {
  text-align: center;
  color: var(--text-secondary);
  font-style: italic;
}

@media (max-width: 768px) {
  .stats-overview {
    grid-template-columns: 1fr;
  }
  
  .charts-grid {
    grid-template-columns: 1fr;
  }
  
  .stat-card {
    flex-direction: column;
    text-align: center;
  }
}
</style>