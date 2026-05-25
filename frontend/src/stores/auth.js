import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token'))
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  const isAuthenticated = computed(() => !!token.value)
  const currentUser = computed(() => user.value)

  const login = async (username, password) => {
    try {
      const formData = new FormData()
      formData.append('username', username)
      formData.append('password', password)
      
      const response = await axios.post('/api/auth/token', formData)
      
      if (response.data.access_token) {
        token.value = response.data.access_token
        localStorage.setItem('token', token.value)
        
        await fetchUserInfo()
        
        return { success: true }
      }
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || '登录失败' 
      }
    }
  }

  const register = async (userData) => {
    try {
      const response = await axios.post('/api/auth/register', userData)
      
      if (response.data.id) {
        return { success: true }
      }
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || '注册失败' 
      }
    }
  }

  const fetchUserInfo = async () => {
    try {
      const response = await axios.get('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token.value}`
        }
      })
      
      user.value = response.data
      localStorage.setItem('user', JSON.stringify(user.value))
    } catch (error) {
      console.error('获取用户信息失败:', error)
      logout()
    }
  }

  const logout = () => {
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  return {
    token,
    user,
    isAuthenticated,
    currentUser,
    login,
    register,
    logout,
    fetchUserInfo
  }
})