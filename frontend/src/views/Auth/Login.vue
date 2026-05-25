<template>
  <div class="auth-container">
    <div class="auth-background">
      <div class="floating-shapes">
        <div class="shape shape-1"></div>
        <div class="shape shape-2"></div>
        <div class="shape shape-3"></div>
      </div>
    </div>
    
    <div class="auth-card glass-effect fade-in">
      <div class="auth-header">
        <div class="auth-logo">
          <img src="../../assets/logo.png" alt="Logo" class="logo-img" v-if="hasLogo" />
          <div class="logo-placeholder" v-else>
            <i class="fas fa-robot"></i>
          </div>
        </div>
        <h1 class="auth-title">钢材缺陷检测系统</h1>
        <p class="auth-subtitle">INTELLIGENT IDENTIFICATION PLATFORM</p>
      </div>
      
      <form @submit.prevent="handleLogin" class="auth-form">
        <div class="form-group">
          <div class="input-wrapper">
            <i class="fas fa-user-circle input-icon"></i>
            <div class="input-content">
              <label for="username" class="input-label">ACCESS ID / 用户名</label>
              <input
                id="username"
                v-model="form.username"
                type="text"
                class="input-field"
                placeholder="请输入用户名"
                required
              />
            </div>
          </div>
        </div>
        
        <div class="form-group">
          <div class="input-wrapper">
            <i class="fas fa-lock input-icon"></i>
            <div class="input-content">
              <label for="password" class="input-label">PASSWORD / 密码</label>
              <input
                id="password"
                v-model="form.password"
                type="password"
                class="input-field"
                placeholder="请输入密码"
                required
              />
            </div>
          </div>
        </div>
        
        <button type="submit" class="btn btn-login" :disabled="loading">
          <i class="fas fa-sign-in-alt" v-if="!loading"></i>
          <span v-if="loading" class="loading-spinner"></span>
          {{ loading ? '登录中...' : '立即登录' }}
        </button>
        
        <div v-if="error" class="error-message">
          {{ error }}
        </div>
      </form>
      
      <div class="auth-footer">
        <router-link to="/register" class="auth-link">注册新账号</router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

export default {
  name: 'Login',
  setup() {
    const router = useRouter()
    const authStore = useAuthStore()
    
    const form = ref({
      username: '',
      password: ''
    })
    
    const loading = ref(false)
    const error = ref('')
    const hasLogo = ref(false) // 设置为 false 以使用图标占位符
    
    const handleLogin = async () => {
      if (!form.value.username || !form.value.password) {
        error.value = '请填写用户名和密码'
        return
      }
      
      loading.value = true
      error.value = ''
      
      const result = await authStore.login(form.value.username, form.value.password)
      
      if (result.success) {
        router.push('/')
      } else {
        error.value = result.error
      }
      
      loading.value = false
    }
    
    return {
      form,
      loading,
      error,
      hasLogo,
      handleLogin
    }
  }
}
</script>

<style scoped>
.auth-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #fcefe8; /* 浅橘红色背景，参考图1 */
  position: relative;
  overflow: hidden;
}

.auth-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  opacity: 0.4;
  pointer-events: none;
}

.floating-shapes {
  position: relative;
  width: 100%;
  height: 100%;
}

.shape {
  position: absolute;
  border-radius: 50%;
  background: #fa8c16;
  opacity: 0.1;
  animation: float 10s ease-in-out infinite;
}

.shape-1 {
  width: 300px;
  height: 300px;
  top: -50px;
  right: -50px;
}

.shape-2 {
  width: 200px;
  height: 200px;
  bottom: -50px;
  left: -50px;
  animation-delay: -2s;
}

.shape-3 {
  width: 150px;
  height: 150px;
  top: 40%;
  left: 10%;
  animation-delay: -5s;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  33% { transform: translate(30px, 50px) rotate(10deg); }
  66% { transform: translate(-20px, 20px) rotate(-10deg); }
}

.auth-card {
  width: 100%;
  max-width: 440px;
  background: #ffffff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
  position: relative;
  z-index: 10; /* 提高层级 */
  display: block; /* 确保是块级元素 */
  margin: 0 auto; /* 保证水平居中 */
}

.auth-header {
  text-align: center;
  margin-bottom: 35px;
}

.auth-logo {
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
}

.logo-placeholder {
  width: 80px;
  height: 80px;
  background: #fa8c16;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 40px;
  box-shadow: 0 4px 12px rgba(250, 140, 22, 0.3);
  position: relative;
  overflow: hidden;
}

.logo-placeholder::after {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 60%);
}

.auth-title {
  font-size: 24px;
  font-weight: 700;
  color: #8c2a0d; 
  margin-bottom: 4px;
  letter-spacing: 1px;
}

.auth-subtitle {
  color: #bfbfbf;
  font-size: 11px;
  letter-spacing: 1px;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%; /* 确保表单占满卡片 */
}

.form-group {
  margin-bottom: 4px;
  width: 100%; /* 确保组占满 */
}

.input-wrapper {
  display: flex;
  align-items: center;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px 16px; /* 增加内边距 */
  transition: all 0.3s;
  background: #fafafa;
  width: 100%; /* 确保包装器占满 */
}

.input-wrapper:focus-within {
  border-color: #fa8c16;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(250, 140, 22, 0.1);
}

.input-icon {
  font-size: 18px;
  color: #bfbfbf;
  margin-right: 15px; /* 增加间距 */
  flex-shrink: 0; /* 防止图标被压缩 */
}

.input-content {
  flex: 1; /* 让输入内容区域占满剩余空间 */
  display: flex;
  flex-direction: column;
  min-width: 0; /* 防止溢出 */
}

.input-label {
  font-size: 10px;
  color: #8c8c8c;
  margin-bottom: 4px;
  font-weight: 500;
  white-space: nowrap;
}

.input-field {
  border: none;
  background: transparent;
  padding: 4px 0;
  font-size: 16px; /* 稍微加大字号 */
  color: #262626;
  outline: none;
  width: 100%; /* 确保输入框横向铺满 */
  display: block;
}

.btn-login {
  height: 48px;
  background: #1890ff; /* 蓝色按钮，参考图1 */
  color: white;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  transition: all 0.3s;
  margin-top: 10px;
  border: none;
  width: 100%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.btn-login:hover {
  background: #40a9ff;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.3);
}

.btn-login:active {
  background: #096dd9;
  transform: translateY(0);
}

.btn-login:disabled {
  background: #bfbfbf;
  cursor: not-allowed;
  transform: none;
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid #ffffff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  color: #ff4d4f;
  background: #fff2f0;
  border: 1px solid #ffccc7;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  text-align: center;
  margin-top: 8px;
}

.auth-footer {
  text-align: left;
  margin-top: 15px;
}

.auth-link {
  color: #1890ff;
  text-decoration: none;
  font-size: 14px;
  transition: color 0.3s;
}

.auth-link:hover {
  color: #40a9ff;
  text-decoration: underline;
}

@media (max-width: 480px) {
  .auth-card {
    padding: 30px 20px;
    margin: 15px;
  }
  
  .auth-title {
    font-size: 20px;
  }
}
</style>