<template>
  <div class="tasks-page">
    <div class="container">
      <div class="page-header">
      <div class="header-content">
        <h1>会员任务中心</h1>
        <p class="subtitle">管理您的所有预约、报名和订单</p>
      </div>
      <div class="header-actions">
        <div class="stats-summary">
        <div class="stat-item pending">
          <span class="stat-icon">⏳</span>
          <div class="stat-text">
          <span class="stat-value">{{ pendingCount }}</span>
          <span class="stat-label">待处理</span>
          </div>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item completed">
          <span class="stat-icon">✅</span>
          <div class="stat-text">
          <span class="stat-value">{{ completedCount }}</span>
          <span class="stat-label">已完成</span>
          </div>
        </div>
        </div>
      </div>
      </div>

      <div class="filter-section">
      <div class="tab-group">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'pending' }"
          @click="switchTab('pending')"
        >
          <span class="tab-label">待处理</span>
          <span v-if="pendingCount > 0" class="tab-badge">{{ pendingCount }}</span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'completed' }"
          @click="switchTab('completed')"
        >
          <span class="tab-label">已完成</span>
          <span v-if="completedCount > 0" class="tab-badge">{{ completedCount }}</span>
        </button>
      </div>
      <div class="type-filters">
        <button
          class="filter-btn"
          :class="{ active: activeType === 'all' }"
          @click="activeType = 'all'"
        >全部</button>
        <button
          class="filter-btn"
          :class="{ active: activeType === 'booking' }"
          @click="activeType = 'booking'"
        >🎱 预约</button>
        <button
          class="filter-btn"
          :class="{ active: activeType === 'course' }"
          @click="activeType = 'course'"
        >📚 课程</button>
        <button
          class="filter-btn"
          :class="{ active: activeType === 'competition' }"
          @click="activeType = 'competition'"
        >🏆 赛事</button>
        <button
          class="filter-btn"
          :class="{ active: activeType === 'order' }"
          @click="activeType = 'order'"
        >🛒 订单</button>
      </div>
      </div>

      <div v-if="filteredTasks.length > 0" class="tasks-list">
      <div
        v-for="task in filteredTasks"
        :key="task.id"
        class="task-card"
        :class="[task.statusType, task.type, { cancelled: task.status === 'cancelled' }]"
      >
        <div class="task-header">
          <div class="task-type">
            <span class="type-icon">{{ task.typeIcon }}</span>
            <span class="type-name">{{ task.typeName }}</span>
          </div>
          <div class="task-status" :class="task.statusType">
            {{ task.statusText }}
          </div>
        </div>

        <div class="task-body">
          <h3 class="task-title">{{ task.title }}</h3>
          <p class="task-subtitle">{{ task.subtitle }}</p>
          <div class="task-meta">
            <span v-if="task.amount > 0" class="task-amount">
              ¥{{ task.amount.toLocaleString() }}
            </span>
            <span class="task-date">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
              </svg>
              {{ task.createdAt }}
            </span>
          </div>
        </div>

        <div class="task-actions">
          <button
            v-for="action in task.actions"
            :key="action.key"
            class="action-btn"
            :class="action.type"
            :disabled="isBusy(task.id)"
            @click="handleAction(task, action)"
          >
            {{ action.label }}
          </button>
        </div>
      </div>
      </div>

      <div v-else class="empty-state">
      <div class="empty-icon">📋</div>
      <h3>暂无{{ activeTab === 'pending' ? '待处理' : '已完成' }}任务</h3>
      <p>{{ activeType === 'all' ? '当前没有相关' + (activeTab === 'pending' ? '待处理' : '已完成') : getTypeText }}记录</p>
      </div>
    </div>

    <Modal
      v-model="showPayModal"
      icon="💳"
      icon-type="info"
      title="确认付款"
      :subtitle="paySubtitle"
      size="small"
      confirm-text="确认支付"
      :loading="payLoading"
      @confirm="confirmPay"
    >
      <div class="pay-info">
        <div class="pay-item">
          <span class="pay-label">订单编号</span>
          <span class="pay-value">{{ selectedTask?.id }}</span>
        </div>
        <div class="pay-item">
          <span class="pay-label">项目名称</span>
          <span class="pay-value">{{ selectedTask?.title }}</span>
        </div>
        <div class="pay-item">
          <span class="pay-label">项目类型</span>
          <span class="pay-value">{{ selectedTask?.typeName }}</span>
        </div>
        <div class="pay-total">
          <span class="pay-label">应付金额</span>
          <span class="pay-amount">¥{{ selectedTask?.amount?.toLocaleString() }}</span>
        </div>
      </div>
    </Modal>

    <Modal
      v-model="showCancelModal"
      icon="warning"
      icon-type="warning"
      title="确认取消"
      subtitle="确定要取消此任务吗？"
      size="small"
      confirm-text="确认取消"
      confirm-type="danger"
      :loading="cancelLoading"
      @confirm="confirmCancel"
    />

    <Modal
      v-model="showDetailModal"
      :title="selectedTask?.typeName + '详情'"
      size="medium"
      :show-footer="false"
    >
      <div v-if="selectedTask" class="detail-content">
        <div class="detail-header">
          <div class="detail-icon">{{ selectedTask.typeIcon }}</div>
          <div class="detail-info">
            <h3>{{ selectedTask.title }}</h3>
            <div class="detail-status" :class="selectedTask.statusType">
              {{ selectedTask.statusText }}
            </div>
          </div>
        </div>
        <div class="detail-list">
          <div class="detail-row">
            <span class="detail-label">任务编号</span>
            <span class="detail-value">{{ selectedTask.id }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">任务类型</span>
            <span class="detail-value">{{ selectedTask.typeName }}</span>
          </div>
          <div
            v-for="row in detailExtraRows"
            :key="row.label"
            class="detail-row"
          >
            <span class="detail-label">{{ row.label }}</span>
            <span class="detail-value">{{ row.value }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">任务描述</span>
            <span class="detail-value">{{ selectedTask.subtitle }}</span>
          </div>
          <div v-if="selectedTask.amount > 0" class="detail-row">
            <span class="detail-label">交易金额</span>
            <span class="detail-value amount">¥{{ selectedTask.amount.toLocaleString() }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">创建时间</span>
            <span class="detail-value">{{ selectedTask.createdAt }}</span>
          </div>
        </div>
      </div>
    </Modal>

    <Modal
      v-model="showSuccessModal"
      icon="🎉"
      icon-type="success"
      :title="successTitle"
      :subtitle="successMessage"
      size="small"
      :show-cancel="false"
      confirm-text="我知道了"
      @confirm="showSuccessModal = false"
    />

    <Toast
      v-model="showToast"
      :type="toastType"
      :title="toastTitle"
      :message="toastMessage"
    />
  </div>
</template>

<script>
import Modal from '../components/Modal.vue'
import Toast from '../components/Toast.vue'
import { logger } from '../utils/api'
import { authState } from '../utils/auth'
import { taskStore } from '../utils/taskStore'

export default {
  name: 'Tasks',
  components: { Modal, Toast },
  data() {
    return {
      activeTab: 'pending',
      activeType: 'all',
      // 只保存任务 id；弹窗内容始终从 store 实时派生，避免操作后残留旧快照
      selectedTaskId: null,
      showPayModal: false,
      showCancelModal: false,
      showDetailModal: false,
      showSuccessModal: false,
      payLoading: false,
      cancelLoading: false,
      // 任务级操作锁：防止重复点击造成重复支付/取消/确认收货
      busyTaskIds: [],
      successTitle: '',
      successMessage: '',
      showToast: false,
      toastType: 'success',
      toastTitle: '',
      toastMessage: ''
    }
  },
  computed: {
    paySubtitle() {
      if (!this.selectedTask || this.selectedTask.amount == null) return ''
      return '确认支付 ¥' + this.selectedTask.amount.toLocaleString() + ' 元'
    },
    // 直接读取 store 的响应式内存数据源，任何页面的变更都会实时联动
    allTasks() {
      return taskStore.getAll()
    },
    pendingTasks() {
      return this.allTasks.filter(task => task.status !== 'completed' && task.status !== 'cancelled')
    },
    // 已完成分组包含「已完成」和「已取消」
    completedTasks() {
      return this.allTasks.filter(task => task.status === 'completed' || task.status === 'cancelled')
    },
    pendingCount() {
      return this.pendingTasks.length
    },
    completedCount() {
      return this.completedTasks.length
    },
    currentTabTasks() {
      return this.activeTab === 'pending' ? this.pendingTasks : this.completedTasks
    },
    filteredTasks() {
      if (this.activeType === 'all') {
        return this.currentTabTasks
      }
      return this.currentTabTasks.filter(task => task.type === this.activeType)
    },
    selectedTask() {
      if (!this.selectedTaskId) return null
      return taskStore.getById(this.selectedTaskId)
    },
    /**
     * 详情弹窗中按任务类型展示对应的业务数据，
     * 保证任务动作/金额/类型与业务数据对应
     */
    detailExtraRows() {
      const task = this.selectedTask
      if (!task || !task.extra) return []
      const extra = task.extra
      switch (task.type) {
        case 'booking':
          return [
            extra.orderNo ? { label: '预约编号', value: extra.orderNo } : null,
            extra.tableId ? { label: '球桌编号', value: extra.tableId + '号球桌' } : null,
            extra.date ? { label: '预约日期', value: extra.date } : null,
            extra.time ? { label: '预约时段', value: extra.time } : null,
            extra.duration ? { label: '预约时长', value: extra.duration + '小时' } : null
          ].filter(Boolean)
        case 'course':
          return [
            extra.orderNo ? { label: '报名编号', value: extra.orderNo } : null,
            extra.courseId ? { label: '课程编号', value: 'C' + String(extra.courseId).padStart(3, '0') } : null,
            extra.coach ? { label: '授课教练', value: extra.coach } : null,
            extra.lessons ? { label: '课程课时', value: extra.lessons } : null
          ].filter(Boolean)
        case 'competition':
          return [
            extra.regNo ? { label: '报名编号', value: extra.regNo } : null,
            extra.playerNo != null ? { label: '参赛号码', value: '#' + extra.playerNo } : null,
            extra.date ? { label: '比赛日期', value: extra.date } : null
          ].filter(Boolean)
        case 'order':
          return [
            extra.orderNo ? { label: '订单编号', value: extra.orderNo } : null,
            extra.createTime ? { label: '下单时间', value: extra.createTime } : null,
            Array.isArray(extra.items)
              ? { label: '商品明细', value: extra.items.map(i => `${i.name} x${i.qty}`).join('、') }
              : null
          ].filter(Boolean)
        default:
          return []
      }
    },
    isLoggedIn() {
      return authState.isLoggedIn
    }
  },
  watch: {
    // 当前选中任务从待处理列表消失（支付/取消后），自动关闭依赖它的弹窗，
    // 防止旧结果残留或列表与详情错位
    selectedTask(task) {
      if (!task) {
        this.showPayModal = false
        this.showCancelModal = false
      }
    }
  },
  mounted() {
    // 再次打开任务中心时若当前筛选分组已空，自动切到有数据的分组
    this.normalizeActiveTab()
  },
  activated() {
    this.normalizeActiveTab()
  },
  beforeUnmount() {
    // 离开任务中心时清理所有临时 UI 状态，避免再次进入时残留旧弹窗/旧提示
    this.resetTransientState()
  },
  methods: {
    normalizeActiveTab() {
      if (this.activeTab === 'pending' && this.pendingCount === 0 && this.completedCount > 0) {
        this.activeTab = 'completed'
      } else if (this.activeTab === 'completed' && this.completedCount === 0 && this.pendingCount > 0) {
        this.activeTab = 'pending'
      }
    },
    resetTransientState() {
      this.selectedTaskId = null
      this.showPayModal = false
      this.showCancelModal = false
      this.showDetailModal = false
      this.showSuccessModal = false
      this.payLoading = false
      this.cancelLoading = false
      this.busyTaskIds = []
      this.showToast = false
    },
    isBusy(taskId) {
      return this.busyTaskIds.includes(taskId)
    },
    markBusy(taskId, busy) {
      if (busy) {
        if (!this.busyTaskIds.includes(taskId)) this.busyTaskIds.push(taskId)
      } else {
        this.busyTaskIds = this.busyTaskIds.filter(id => id !== taskId)
      }
    },
    getTypeText() {
      const typeMap = {
        booking: '预约',
        course: '课程',
        competition: '赛事',
        order: '订单'
      }
      return typeMap[this.activeType] || ''
    },
    switchTab(tab) {
      this.activeTab = tab
    },
    handleAction(task, action) {
      // 该任务已有操作在途时忽略重复点击（重复操作保护）
      if (this.isBusy(task.id)) return

      // 重新取最新任务，避免用渲染时的旧对象操作
      const freshTask = taskStore.getById(task.id)
      if (!freshTask) {
        this.showNotification('error', '任务不存在', '该任务可能已被处理，请刷新列表')
        return
      }
      // 动作与当前状态不匹配（例如卡片渲染后状态已被其他流程改变）时直接忽略
      if (!freshTask.actions.some(a => a.key === action.key)) {
        this.showNotification('warning', '操作不可用', '任务状态已变化，请刷新后重试')
        return
      }

      this.selectedTaskId = task.id

      // 支付/取消/确认收货均在任务中心内完成，不再跳转业务页，
      // 避免离开后流程残留以及业务页重复创建任务
      const actionMap = {
        pay: () => this.openPayModal(),
        cancel: () => this.openCancelModal(),
        view: () => this.openDetailModal(),
        remind: () => this.handleRemind(),
        confirm: () => this.handleConfirm(),
        review: () => this.handleReview()
      }
      if (action.route) {
        this.navigateToRoute(action.route, freshTask, action.key)
        return
      }
      const handler = actionMap[action.key]
      if (handler) handler()
    },
    navigateToRoute(route, task, actionKey) {
      logger.info('Navigate to business page', { route, actionKey, taskId: task.id, type: task.type })

      const query = { action: actionKey }
      if (task.extra) {
        if (task.type === 'booking' && task.extra.tableId) {
          query.tableId = task.extra.tableId
        }
        if (task.type === 'course' && task.extra.courseId) {
          query.courseId = task.extra.courseId
        }
        if (task.type === 'competition' && task.extra.competitionId) {
          query.competitionId = task.extra.competitionId
        }
        if (task.type === 'order' && task.extra.orderNo) {
          query.orderNo = task.extra.orderNo
        }
      }

      // 离开任务中心前清掉弹窗/选择，保证回来是干净状态
      this.showDetailModal = false
      this.selectedTaskId = null
      this.$router.push({ path: route, query })
    },
    openPayModal() {
      this.showPayModal = true
    },
    openCancelModal() {
      this.showCancelModal = true
    },
    openDetailModal() {
      this.showDetailModal = true
    },
    async confirmPay() {
      const taskId = this.selectedTaskId
      // 重复操作保护：加载中 / 任务级锁未释放时直接忽略
      if (this.payLoading || !taskId || this.isBusy(taskId)) return

      const task = taskStore.getById(taskId)
      if (!task) {
        this.showPayModal = false
        this.showNotification('error', '支付失败', '任务不存在或已被处理')
        return
      }
      // 状态机前置校验：只有待付款任务可支付
      if (task.status !== 'pending_payment') {
        this.showPayModal = false
        this.showNotification('warning', '无需重复支付', '该任务已处理，状态为「' + task.statusText + '」')
        return
      }

      this.payLoading = true
      this.markBusy(taskId, true)

      try {
        // 模拟支付网络请求
        await new Promise(resolve => setTimeout(resolve, 300))
        const updatedTask = taskStore.markAsPaid(taskId)

        if (updatedTask) {
          this.showPayModal = false
          this.successTitle = '支付成功'
          this.successMessage = '您的订单已支付成功'
          this.showSuccessModal = true
          logger.info('Payment successful', { taskId, amount: updatedTask.amount, type: updatedTask.type })
        } else {
          // 请求失败（含持久化失败/状态已变更）：弹窗保留供重试，不清空数据
          this.showNotification('error', '支付失败', '网络异常，请稍后重试')
          logger.warn('Payment failed', { taskId })
        }
      } catch (e) {
        this.showNotification('error', '支付失败', '网络异常，请稍后重试')
        logger.error('Payment error', e)
      } finally {
        this.payLoading = false
        this.markBusy(taskId, false)
      }
    },
    async confirmCancel() {
      const taskId = this.selectedTaskId
      if (this.cancelLoading || !taskId || this.isBusy(taskId)) return

      const task = taskStore.getById(taskId)
      if (!task) {
        this.showCancelModal = false
        this.showNotification('error', '取消失败', '任务不存在或已被处理')
        return
      }
      if (task.status !== 'pending_payment') {
        this.showCancelModal = false
        this.showNotification('warning', '任务已处理', '当前状态为「' + task.statusText + '」，无需取消')
        return
      }

      this.cancelLoading = true
      this.markBusy(taskId, true)

      try {
        await new Promise(resolve => setTimeout(resolve, 300))
        const updatedTask = taskStore.cancelTask(taskId)

        if (updatedTask) {
          this.showCancelModal = false
          this.showNotification('success', '取消成功', '任务已取消')
          logger.info('Task cancelled', { taskId })
        } else {
          this.showNotification('error', '取消失败', '网络异常，请稍后重试')
          logger.warn('Cancel failed', { taskId })
        }
      } catch (e) {
        this.showNotification('error', '取消失败', '网络异常，请稍后重试')
        logger.error('Cancel error', e)
      } finally {
        this.cancelLoading = false
        this.markBusy(taskId, false)
      }
    },
    async handleRemind() {
      const taskId = this.selectedTaskId
      if (!taskId || this.isBusy(taskId)) return
      const task = taskStore.getById(taskId)
      if (!task || task.status !== 'pending_shipment') {
        this.showNotification('warning', '操作不可用', '任务状态已变化')
        return
      }
      this.showNotification('success', '已提醒', '已提醒卖家尽快发货')
      logger.info('Reminder sent', { taskId })
    },
    async handleConfirm() {
      const taskId = this.selectedTaskId
      if (!taskId || this.isBusy(taskId)) return

      const task = taskStore.getById(taskId)
      if (!task) {
        this.showNotification('error', '操作失败', '任务不存在或已被处理')
        return
      }
      // 只有已发货的商城订单可以确认收货，防止误操作与跨类型错位
      if (task.type !== 'order' || task.status !== 'shipped') {
        this.showNotification('warning', '操作不可用', '当前状态为「' + task.statusText + '」，暂不能确认收货')
        return
      }

      this.markBusy(taskId, true)
      try {
        const result = taskStore.confirmReceipt(taskId)
        if (result) {
          this.showNotification('success', '确认收货成功', '感谢您的购买')
          logger.info('Receipt confirmed', { taskId })
        } else {
          this.showNotification('error', '操作失败', '请稍后重试')
        }
      } finally {
        this.markBusy(taskId, false)
      }
    },
    handleReview() {
      const taskId = this.selectedTaskId
      if (!taskId) return
      this.showNotification('info', '评价功能', '评价功能开发中，敬请期待')
    },
    showNotification(type, title, message) {
      this.toastType = type
      this.toastTitle = title
      this.toastMessage = message
      this.showToast = true
    }
  }
}
</script>

<style scoped>
.tasks-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 3rem 4rem;
}

.container {
  max-width: 1000px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 2rem;
}

.header-content h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.header-actions {
  display: flex;
  align-items: center;
}

.stats-summary {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1rem 1.5rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.stat-icon {
  font-size: 1.5rem;
}

.stat-text {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
}

.stat-item.pending .stat-value {
  color: #ffc107;
}

.stat-item.completed .stat-value {
  color: var(--primary);
}

.stat-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.stat-divider {
  width: 1px;
  height: 40px;
  background: var(--border);
}

.filter-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  gap: 1rem;
  flex-wrap: wrap;
}

.tab-group {
  display: flex;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 4px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.25rem;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--gradient-1);
  color: var(--bg-dark);
}

.tab-badge {
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
}

.type-filters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 0.5rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 20px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.3s;
}

.filter-btn:hover {
  border-color: var(--primary);
  color: var(--text-primary);
}

.filter-btn.active {
  background: rgba(0, 217, 165, 0.15);
  border-color: rgba(0, 217, 165, 0.3);
  color: var(--primary);
}

.tasks-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.task-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 1.5rem;
  transition: all 0.3s;
}

.task-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
}

.task-card.warning {
  border-left: 4px solid #ffc107;
}

.task-card.primary {
  border-left: 4px solid var(--primary);
}

.task-card.info {
  border-left: 4px solid #4facfe;
}

.task-card.success {
  border-left: 4px solid #6c757d;
  opacity: 0.9;
}

.task-card.cancelled {
  opacity: 0.65;
}

.task-card.cancelled .task-title,
.task-card.cancelled .task-amount {
  text-decoration: line-through;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.task-type {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.type-icon {
  font-size: 1.25rem;
}

.type-name {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.task-status {
  padding: 0.35rem 0.8rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}

.task-status.warning {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
}

.task-status.primary {
  background: rgba(0, 217, 165, 0.15);
  color: var(--primary);
}

.task-status.info {
  background: rgba(79, 172, 254, 0.15);
  color: #4facfe;
}

.task-status.success {
  background: rgba(108, 117, 125, 0.15);
  color: #6c757d;
}

.task-body {
  margin-bottom: 1rem;
}

.task-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.35rem;
}

.task-subtitle {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.task-amount {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--primary);
}

.task-date {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.task-date svg {
  width: 14px;
  height: 14px;
}

.task-actions {
  display: flex;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.action-btn {
  padding: 0.6rem 1.25rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  border: none;
}

.action-btn.primary {
  background: var(--gradient-1);
  color: var(--bg-dark);
}

.action-btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--primary-glow);
}

.action-btn.default {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.action-btn.default:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--text-muted);
}

.action-btn.danger {
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  color: #ff6b6b;
}

.action-btn.danger:hover {
  background: rgba(255, 107, 107, 0.2);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state h3 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
}

.empty-state p {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.pay-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pay-item,
.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.pay-label,
.detail-label {
  color: var(--text-secondary);
}

.pay-value,
.detail-value {
  font-weight: 500;
}

.pay-total {
  display: flex;
  justify-content: space-between;
  padding-top: 0.75rem;
  margin-top: 0.5rem;
  border-top: 1px solid var(--border);
}

.pay-amount {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--primary);
}

.detail-content {
  padding: 0.5rem;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 1.5rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

.detail-icon {
  font-size: 3rem;
}

.detail-info h3 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
}

.detail-status {
  display: inline-block;
  padding: 0.35rem 0.8rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}

.detail-status.warning {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
}

.detail-status.primary {
  background: rgba(0, 217, 165, 0.15);
  color: var(--primary);
}

.detail-status.info {
  background: rgba(79, 172, 254, 0.15);
  color: #4facfe;
}

.detail-status.success {
  background: rgba(108, 117, 125, 0.15);
  color: #6c757d;
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-value.amount {
  color: var(--primary);
  font-weight: 600;
}

@media (max-width: 768px) {
  .tasks-page {
    padding: 1rem 1.5rem 3rem;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .filter-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .tab-group {
    width: 100%;
  }

  .tab-btn {
    flex: 1;
    justify-content: center;
  }

  .task-actions {
    flex-wrap: wrap;
  }

  .action-btn {
    flex: 1;
    min-width: 120px;
  }
}
</style>
