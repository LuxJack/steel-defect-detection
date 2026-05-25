// 钢材缺陷检测系统 - 主JavaScript文件

const { createApp } = Vue;

const app = createApp({
    data() {
        return {
            // 认证状态
            isAuthenticated: false,
            currentView: 'login',
            user: {},
            token: localStorage.getItem('token'),
            
            // 登录/注册表单
            loginForm: { username: '', password: '' },
            registerForm: { username: '', email: '', password: '' },
            loading: false,
            error: '',
            
            // 主应用状态
            isCollapsed: false,
            activeTab: 'detection',
            menuItems: [
                { id: 'detection', name: '缺陷检测', icon: '🔍' },
                { id: 'dashboard', name: '数据统计', icon: '📊' },
                { id: 'model', name: '模型管理', icon: '⚙️' }
            ],
            
            // 检测功能
            selectedFile: null,
            previewUrl: '',
            dragOver: false,
            detecting: false,
            detectionResult: null,
            detectionHistory: [],
            
            // 统计数据
            stats: {},
            recentDetections: []
        }
    },
    
    computed: {
        activeTabName() {
            const item = this.menuItems.find(item => item.id === this.activeTab);
            return item ? item.name : '钢材缺陷检测系统';
        },
        
        userInitials() {
            return this.user.username ? this.user.username.charAt(0).toUpperCase() : 'U';
        },
        
        defectsCount() {
            return this.detectionResult ? this.detectionResult.defects.length : 0;
        },
        
        maxConfidence() {
            if (!this.detectionResult || this.defectsCount === 0) return 0;
            const max = Math.max(...this.detectionResult.defects.map(d => d.confidence));
            return (max * 100).toFixed(1);
        },
        
        resultImageUrl() {
            if (!this.detectionResult) return '';
            return `http://localhost:8000${this.detectionResult.result_path}`;
        },
        
        defectDistribution() {
            if (!this.stats.defect_distribution) return [];
            return Object.entries(this.stats.defect_distribution).map(([name, value]) => ({
                name,
                value
            }));
        }
    },
    
    async mounted() {
        // 检查认证状态
        if (this.token) {
            await this.checkAuth();
        }
        
        // 加载统计数据
        await this.fetchStats();
        
        // 加载检测历史
        await this.fetchDetectionHistory();
    },
    
    methods: {
        // 认证相关方法
        async checkAuth() {
            try {
                const response = await axios.get('/api/auth/me', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                
                if (response.data.success) {
                    this.user = response.data.user;
                    this.isAuthenticated = true;
                } else {
                    this.handleLogout();
                }
            } catch (error) {
                console.error('认证检查失败:', error);
                this.handleLogout();
            }
        },
        
        async handleLogin() {
            if (!this.loginForm.username || !this.loginForm.password) {
                this.error = '请填写用户名和密码';
                return;
            }
            
            this.loading = true;
            this.error = '';
            
            try {
                const response = await axios.post('/api/auth/login', this.loginForm);
                
                if (response.data.success) {
                    this.token = response.data.access_token;
                    localStorage.setItem('token', this.token);
                    this.user = response.data.user;
                    this.isAuthenticated = true;
                    this.error = '';
                } else {
                    this.error = response.data.error || '登录失败';
                }
            } catch (error) {
                this.error = error.response?.data?.error || '登录失败';
            } finally {
                this.loading = false;
            }
        },
        
        async handleRegister() {
            if (!this.registerForm.username || !this.registerForm.email || !this.registerForm.password) {
                this.error = '请填写所有必填字段';
                return;
            }
            
            if (this.registerForm.password.length < 6) {
                this.error = '密码长度至少为6位';
                return;
            }
            
            this.loading = true;
            this.error = '';
            
            try {
                const response = await axios.post('/api/auth/register', this.registerForm);
                
                if (response.data.success) {
                    this.currentView = 'login';
                    this.error = '注册成功，请登录';
                } else {
                    this.error = response.data.error || '注册失败';
                }
            } catch (error) {
                this.error = error.response?.data?.error || '注册失败';
            } finally {
                this.loading = false;
            }
        },
        
        handleLogout() {
            localStorage.removeItem('token');
            this.token = null;
            this.isAuthenticated = false;
            this.user = {};
            this.currentView = 'login';
            this.loginForm = { username: '', password: '' };
        },
        
        // 界面交互方法
        toggleSidebar() {
            this.isCollapsed = !this.isCollapsed;
        },
        
        // 文件上传和检测方法
        triggerFileInput() {
            this.$refs.fileInput.click();
        },
        
        handleDrop(event) {
            this.dragOver = false;
            const files = event.dataTransfer.files;
            if (files.length > 0) {
                this.processFile(files[0]);
            }
        },
        
        handleFileSelect(event) {
            const files = event.target.files;
            if (files.length > 0) {
                this.processFile(files[0]);
            }
        },
        
        processFile(file) {
            if (!file.type.startsWith('image/')) {
                alert('请选择图片文件');
                return;
            }
            
            if (file.size > 10 * 1024 * 1024) {
                alert('文件大小不能超过10MB');
                return;
            }
            
            this.selectedFile = file;
            this.previewUrl = URL.createObjectURL(file);
            this.detectionResult = null;
        },
        
        clearFile() {
            this.selectedFile = null;
            this.previewUrl = '';
            this.detectionResult = null;
            if (this.$refs.fileInput) {
                this.$refs.fileInput.value = '';
            }
        },
        
        async startDetection() {
            if (!this.selectedFile) return;
            
            this.detecting = true;
            
            try {
                const formData = new FormData();
                formData.append('file', this.selectedFile);
                
                const response = await axios.post('/api/detect/image', formData, {
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                });
                
                if (response.data.success) {
                    this.detectionResult = response.data;
                    await this.fetchDetectionHistory();
                    await this.fetchStats();
                } else {
                    alert(response.data.error || '检测失败');
                }
            } catch (error) {
                console.error('检测失败:', error);
                alert('检测失败，请重试');
            } finally {
                this.detecting = false;
            }
        },
        
        clearResult() {
            this.detectionResult = null;
            this.clearFile();
        },
        
        downloadResult() {
            if (!this.detectionResult) return;
            
            const link = document.createElement('a');
            link.href = this.resultImageUrl;
            link.download = `detection_result_${Date.now()}.jpg`;
            link.click();
        },
        
        // 数据获取方法
        async fetchDetectionHistory() {
            if (!this.token) return;
            
            try {
                const response = await axios.get('/api/detect/history?limit=5', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                
                if (response.data.success) {
                    this.detectionHistory = response.data.records;
                }
            } catch (error) {
                console.error('获取检测历史失败:', error);
            }
        },
        
        async fetchStats() {
            if (!this.token) return;
            
            try {
                const response = await axios.get('/api/data/stats', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                
                if (response.data.success) {
                    this.stats = response.data.stats;
                }
            } catch (error) {
                console.error('获取统计数据失败:', error);
            }
        },
        
        async fetchRecentDetections() {
            if (!this.token) return;
            
            try {
                const response = await axios.get('/api/data/recent-detections?limit=5', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                
                if (response.data.success) {
                    this.recentDetections = response.data.recent_detections;
                }
            } catch (error) {
                console.error('获取最近检测记录失败:', error);
            }
        },
        
        refreshHistory() {
            this.fetchDetectionHistory();
            this.fetchStats();
        },
        
        // 工具方法
        getImageUrl(path) {
            return `http://localhost:8000${path}`;
        },
        
        getDefectClass(defectType) {
            return defectType === '无缺陷' ? 'no-defect' : 'has-defect';
        },
        
        getColor(name) {
            const colors = {
                '裂纹': '#ff6b6b',
                '锈蚀': '#4ecdc4',
                '凹坑': '#45b7d1',
                '划痕': '#96ceb4',
                '变形': '#feca57',
                '无缺陷': '#54a0ff'
            };
            return colors[name] || '#999';
        },
        
        formatTime(timeString) {
            return new Date(timeString).toLocaleString('zh-CN');
        }
    }
});

app.mount('#app');