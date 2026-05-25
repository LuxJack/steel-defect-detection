<template>
  <div class="layout">
    <!-- 侧边栏 -->
    <aside :class="['sidebar', { 'sidebar-collapsed': isCollapsed }]">
      <div class="sidebar-header">
        <div class="logo">
          <div class="logo-icon">🔍</div>
          <span v-if="!isCollapsed" class="logo-text">钢材检测</span>
        </div>
        <button @click="toggleSidebar" class="sidebar-toggle">
          {{ isCollapsed ? '→' : '←' }}
        </button>
      </div>
      
      <nav class="sidebar-nav">
        <router-link 
          v-for="item in menuItems" 
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: $route.path === item.path }"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span v-if="!isCollapsed" class="nav-text">{{ item.name }}</span>
        </router-link>
      </nav>
      
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">{{ userInitials }}</div>
          <div v-if="!isCollapsed" class="user-details">
            <div class="user-name">{{ authStore.currentUser?.username }}</div>
            <div class="user-role">用户</div>
          </div>
        </div>
        <button @click="handleLogout" class="logout-btn">
          <span class="logout-icon">🚪</span>
          <span v-if="!isCollapsed">退出</span>
        </button>
      </div>
    </aside>
    
    <!-- 主内容区域 -->
    <main :class="['main-content', { 'main-expanded': isCollapsed }]">
      <header class="header">
        <div class="header-left">
          <h1 class="page-title">{{ currentPageTitle }}</h1>
        </div>
        <div class="header-right">
          <div class="header-stats">
            <div class="stat-item">
              <span class="stat-label">今日检测</span>
              <span class="stat-value">{{ stats.todayCount || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">本月检测</span>
              <span class="stat-value">{{ stats.monthCount || 0 }}</span>
            </div>
          </div>
          <div class="header-actions">
            <button class="header-btn" title="刷新数据">
              🔄
            </button>
            <button class="header-btn" title="通知">
              🔔
            </button>
          </div>
        </div>
      </header>
      
      <div class="content-area">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import axios from 'axios'

export default {
  name: 'Layout',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const authStore = useAuthStore()
    
    const isCollapsed = ref(false)
    const stats = ref({})
    
    const menuItems = [
      { path: '/detection', name: '缺陷检测', icon: '🔍' },
      { path: '/dashboard', name: '数据统计', icon: '📊' },
      { path: '/model-config', name: '模型管理', icon: '⚙️' }
    ]
    
    const currentPageTitle = computed(() => {
      const item = menuItems.find(item => item.path === route.path)
      return item ? item.name : '钢材缺陷检测系统'
    })
    
    const userInitials = computed(() => {
      const username = authStore.currentUser?.username || ''
      return username.charAt(0).toUpperCase()
    })
    
    const toggleSidebar = () => {
      isCollapsed.value = !isCollapsed.value
    }
    
    const handleLogout = () => {
      authStore.logout()
      router.push('/login')
    }
    
    const fetchStats = async () => {
      try {
        const response = await axios.get('/api/data/stats', {
          headers: {
            'Authorization': `Bearer ${authStore.token}`
          }
        })
        stats.value = response.data
      } catch (error) {
        console.error('获取统计数据失败:', error)
      }
    }
    
    onMounted(() => {
      fetchStats()
    })
    
    return {
      isCollapsed,
      menuItems,
      currentPageTitle,
      authStore,
      userInitials,
      stats,
      toggleSidebar,
      handleLogout
    }
  }
}
</script>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg-primary);
}

/* 侧边栏样式 */
.sidebar {
  width: 280px;
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
  position: relative;
  z-index: 100;
}

.sidebar-collapsed {
  width: 80px;
}

.sidebar-header {
  padding: 24px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  font-size: 24px;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.sidebar-toggle {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.sidebar-toggle:hover {
  color: var(--primary);
  background: rgba(0, 212, 255, 0.1);
}

.sidebar-nav {
  flex: 1;
  padding: 20px 0;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 16px 24px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.3s ease;
  border-left: 3px solid transparent;
}

.nav-item:hover {
  background: rgba(0, 212, 255, 0.05);
  color: var(--primary);
}

.nav-item.active {
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary);
  border-left-color: var(--primary);
}

.nav-icon {
  font-size: 20px;
  margin-right: 16px;
  min-width: 24px;
  text-align: center;
}

.nav-text {
  font-weight: 600;
  white-space: nowrap;
}

.sidebar-footer {
  padding: 20px;
  border-top: 1px solid var(--border);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.user-avatar {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
  color: white;
}

.user-details {
  flex: 1;
}

.user-name {
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.user-role {
  font-size: 12px;
  color: var(--text-secondary);
}

.logout-btn {
  width: 100%;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid var(--secondary);
  color: var(--secondary);
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.3s ease;
  font-size: 14px;
}

.logout-btn:hover {
  background: rgba(255, 107, 107, 0.2);
}

/* 主内容区域样式 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
}

.main-expanded {
  margin-left: -200px;
}

.header {
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  padding: 20px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  background: linear-gradient(135deg, var(--primary), var(--accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

.header-stats {
  display: flex;
  gap: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 16px;
  background: rgba(0, 212, 255, 0.1);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.3s ease;
}

.header-btn:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: rgba(0, 212, 255, 0.1);
}

.content-area {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: -280px;
    height: 100vh;
    z-index: 1000;
  }
  
  .sidebar.mobile-open {
    left: 0;
  }
  
  .main-content {
    margin-left: 0 !important;
  }
  
  .header {
    padding: 16px 20px;
  }
  
  .header-stats {
    display: none;
  }
  
  .content-area {
    padding: 20px;
  }
}
</style>