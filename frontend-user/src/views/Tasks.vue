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
          <span class="stat-value">{{ historyCount }}</span>
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
          :class="{ active: activeTab === 'history' }"
          @click="switchTab('history')"
        >
          <span class="tab-label">已完成</span>
          <span v-if="historyCount > 0" class="tab-badge">{{ historyCount }}</span>
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
        :class="[task.statusType, task.type]"
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
            :disabled="task.processing"
            @click="handleAction(task, action)"
          >
            <span v-if="task.processing" class="btn-spinner"></span>
            {{ action.label }}
          </button>
        </div>
      </div>
      </div>

      <div v-else class="empty-state">
      <div class="empty-icon">📋</div>
      <h3>暂无{{ activeTab === 'pending' ? '待处理' : '已完成' }}任务</h3>
      <p>{{ activeType === 'all' ? '当前没有' + (activeTab === 'pending' ? '待处理' : '已完成') + '任务' : '暂无' + getTypeText + '记录' }}</p>
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
      :loading="actionLoading"
      @confirm="confirmPay"
      @cancel="onActionModalClosed"
      @update:model-value="onPayModalToggle"
    >
      <div v-if="selectedTask" class="pay-info">
        <div class="pay-item">
          <span class="pay-label">订单编号</span>
          <span class="pay-value">{{ selectedTask.id }}</span>
        </div>
        <div class="pay-item">
          <span class="pay-label">项目名称</span>
          <span class="pay-value">{{ selectedTask.title }}</span>
        </div>
        <div class="pay-item">
          <span class="pay-label">项目类型</span>
          <span class="pay-value">{{ selectedTask.typeName }}</span>
        </div>
        <div class="pay-total">
          <span class="pay-label">应付金额</span>
          <span class="pay-amount">¥{{ formatAmount(selectedTask.amount) }}</span>
        </div>
        <p v-if="actionError" class="action-error">{{ actionError }}</p>
      </div>
    </Modal>

    <Modal
      v-model="showCancelModal"
      icon="warning"
      icon-type="warning"
      title="确认取消"
      :subtitle="cancelSubtitle"
      size="small"
      confirm-text="确认取消"
      confirm-type="danger"
      :loading="actionLoading"
      @confirm="confirmCancel"
      @cancel="onActionModalClosed"
      @update:model-value="onCancelModalToggle"
    >
      <p v-if="actionError" class="action-error">{{ actionError }}</p>
    </Modal>

    <Modal
      v-model="showConfirmModal"
      icon="📦"
      icon-type="info"
      title="确认收货"
      subtitle="请确认您已收到商品"
      size="small"
      confirm-text="确认收货"
      :loading="actionLoading"
      @confirm="confirmReceive"
      @cancel="onActionModalClosed"
      @update:model-value="onConfirmModalToggle"
    >
      <div v-if="selectedTask" class="pay-info">
        <div class="pay-item">
          <span class="pay-label">订单编号</span>
          <span class="pay-value">{{ selectedTask.extra?.orderNo || selectedTask.id }}</span>
        </div>
        <div class="pay-item">
          <span class="pay-label">商品</span>
          <span class="pay-value">{{ selectedTask.title }}</span>
        </div>
        <div class="pay-total">
          <span class="pay-label">订单金额</span>
          <span class="pay-amount">¥{{ formatAmount(selectedTask.amount) }}</span>
        </div>
        <p v-if="actionError" class="action-error">{{ actionError }}</p>
      </div>
    </Modal>

    <Modal
      v-model="showDetailModal"
      :title="(selectedTask?.typeName || '任务') + '详情'"
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
          <div class="detail-row">
            <span class="detail-label">任务描述</span>
            <span class="detail-value">{{ selectedTask.subtitle }}</span>
          </div>

          <!-- 按任务类型展示对应业务数据，避免详情与业务错位 -->
          <template v-if="selectedTask.type === 'booking'">
            <div v-if="selectedTask.extra?.orderNo" class="detail-row">
              <span class="detail-label">预约单号</span>
              <span class="detail-value">{{ selectedTask.extra.orderNo }}</span>
            </div>
            <div v-if="selectedTask.extra?.tableId" class="detail-row">
              <span class="detail-label">球桌编号</span>
              <span class="detail-value">{{ selectedTask.extra.tableId }}号球桌</span>
            </div>
            <div v-if="selectedTask.extra?.date" class="detail-row">
              <span class="detail-label">预约日期</span>
              <span class="detail-value">{{ selectedTask.extra.date }}</span>
            </div>
            <div v-if="selectedTask.extra?.time" class="detail-row">
              <span class="detail-label">使用时段</span>
              <span class="detail-value">{{ selectedTask.extra.time }}</span>
            </div>
            <div v-if="selectedTask.extra?.duration" class="detail-row">
              <span class="detail-label">预约时长</span>
              <span class="detail-value">{{ selectedTask.extra.duration }}小时</span>
            </div>
          </template>

          <template v-else-if="selectedTask.type === 'course'">
            <div v-if="selectedTask.extra?.orderNo" class="detail-row">
              <span class="detail-label">报名单号</span>
              <span class="detail-value">{{ selectedTask.extra.orderNo }}</span>
            </div>
            <div v-if="selectedTask.extra?.coach" class="detail-row">
              <span class="detail-label">授课教练</span>
              <span class="detail-value">{{ selectedTask.extra.coach }}</span>
            </div>
            <div v-if="selectedTask.extra?.lessons" class="detail-row">
              <span class="detail-label">课时</span>
              <span class="detail-value">{{ selectedTask.extra.lessons }}</span>
            </div>
          </template>

          <template v-else-if="selectedTask.type === 'competition'">
            <div v-if="selectedTask.extra?.regNo" class="detail-row">
              <span class="detail-label">报名编号</span>
              <span class="detail-value">{{ selectedTask.extra.regNo }}</span>
            </div>
            <div v-if="selectedTask.extra?.playerNo != null" class="detail-row">
              <span class="detail-label">参赛号码</span>
              <span class="detail-value">#{{ selectedTask.extra.playerNo }}</span>
            </div>
            <div v-if="selectedTask.extra?.date" class="detail-row">
              <span class="detail-label">比赛日期</span>
              <span class="detail-value">{{ selectedTask.extra.date }}</span>
            </div>
          </template>

          <template v-else-if="selectedTask.type === 'order'">
            <div v-if="selectedTask.extra?.orderNo" class="detail-row">
              <span class="detail-label">订单编号</span>
              <span class="detail-value">{{ selectedTask.extra.orderNo }}</span>
            </div>
            <div v-if="selectedTask.extra?.items?.length" class="detail-block">
              <span class="detail-label">商品清单</span>
              <div class="order-items">
                <div v-for="item in selectedTask.extra.items" :key="item.id" class="order-item-row">
                  <span>{{ item.icon }} {{ item.name }}</span>
                  <span>x{{ item.qty }}</span>
                </div>
              </div>
            </div>
            <div v-if="selectedTask.extra?.createTime" class="detail-row">
              <span class="detail-label">下单时间</span>
              <span class="detail-value">{{ selectedTask.extra.createTime }}</span>
            </div>
          </template>

          <div v-if="selectedTask.amount > 0" class="detail-row">
            <span class="detail-label">交易金额</span>
            <span class="detail-value amount">¥{{ formatAmount(selectedTask.amount) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">创建时间</span>
            <span class="detail-value">{{ selectedTask.createdAt }}</span>
          </div>
        </div>
      </div>
      <div v-else class="detail-gone">
        <div class="empty-icon">📋</div>
        <p>该任务不存在或已被处理</p>
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
import { taskStore } from '../utils/taskStore'

export default {
  name: 'Tasks',
  components: { Modal, Toast },
  data() {
    return {
      activeTab: 'pending',
      activeType: 'all',
      // 只保存选中任务的 id，展示内容始终从 store 实时取，杜绝旧快照残留
      selectedTaskId: null,
      showPayModal: false,
      showCancelModal: false,
      showConfirmModal: false,
      showDetailModal: false,
      showSuccessModal: false,
      actionLoading: false,
      actionError: '',
      successTitle: '',
      successMessage: '',
      showToast: false,
      toastType: 'success',
      toastTitle: '',
      toastMessage: ''
    }
  },
  computed: {
    // 直接读取 reactive store：业务页新增/支付/取消后，任务中心与角标自动联动
    allTasks() {
      return taskStore.getAll()
    },
    pendingTasks() {
      return this.allTasks.filter(task => task.status !== 'completed' && task.status !== 'cancelled')
    },
    historyTasks() {
      return this.allTasks.filter(task => task.status === 'completed' || task.status === 'cancelled')
    },
    pendingCount() {
      return this.pendingTasks.length
    },
    historyCount() {
      return this.historyTasks.length
    },
    currentTabTasks() {
      return this.activeTab === 'pending' ? this.pendingTasks : this.historyTasks
    },
    filteredTasks() {
      if (this.activeType === 'all') {
        return this.currentTabTasks
      }
      return this.currentTabTasks.filter(task => task.type === this.activeType)
    },
    // 选中任务的实时视图；任务被删除时自动为 null，详情/弹窗不会错位
    selectedTask() {
      return this.selectedTaskId ? taskStore.getById(this.selectedTaskId) : null
    },
    paySubtitle() {
      const task = this.selectedTask
      if (!task || task.amount == null) return ''
      return '确认支付 ¥' + this.formatAmount(task.amount) + ' 元'
    },
    cancelSubtitle() {
      const task = this.selectedTask
      if (!task) return '确定要取消此任务吗？'
      return `确定要取消「${task.title}」吗？取消后可在已完成列表中查看记录。`
    }
  },
  mounted() {
    // 再次打开任务中心时从存储同步最新数据
    taskStore.init()
  },
  activated() {
    taskStore.init()
  },
  methods: {
    formatAmount(value) {
      return Number(value || 0).toLocaleString()
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
      // 以 id 选中；所有弹窗内容由 selectedTask 计算属性实时派生
      this.selectedTaskId = task.id
      this.actionError = ''

      if (action.route) {
        this.navigateToRoute(action.route, action.key, task)
        return
      }

      const actionMap = {
        pay: () => this.openPayModal(),
        cancel: () => this.openCancelModal(),
        view: () => this.openDetailModal(),
        remind: () => this.handleRemind(),
        rebook: () => this.navigateToRoute('/tables', 'rebook', task),
        rebuy: () => this.navigateToRoute('/shop', 'rebuy', task),
        confirm: () => this.openConfirmModal(),
        review: () => this.handleReview()
      }
      const handler = actionMap[action.key]
      if (handler) handler()
    },
    navigateToRoute(route, actionKey, task) {
      logger.info('Navigate to business page', { route, actionKey, taskId: task.id, type: task.type })

      const query = {}
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

      this.$router.push({ path: route, query })
    },
    openPayModal() {
      if (!this.selectedTask || this.selectedTask.status !== 'pending_payment') {
        this.showNotification('warning', '无法支付', '该任务当前状态不可支付')
        return
      }
      this.actionError = ''
      this.showPayModal = true
    },
    openCancelModal() {
      if (!this.canCancel(this.selectedTask)) {
        this.showNotification('warning', '无法取消', '该任务当前状态不可取消')
        return
      }
      this.actionError = ''
      this.showCancelModal = true
    },
    openConfirmModal() {
      if (!this.selectedTask || this.selectedTask.status !== 'shipped') {
        this.showNotification('warning', '无法确认收货', '只有已发货的订单可以确认收货')
        return
      }
      this.actionError = ''
      this.showConfirmModal = true
    },
    openDetailModal() {
      this.showDetailModal = true
    },
    canCancel(task) {
      return !!task && ['pending_payment', 'upcoming', 'pending_shipment'].includes(task.status)
    },
    /**
     * 统一执行动作：loading 期间按钮禁用防止重复提交；
     * 请求失败时弹窗保留、展示错误，任务数据不变；成功后关闭弹窗。
     */
    async runAction(action, successNotify) {
      const task = this.selectedTask
      if (!task) {
        this.showNotification('error', '操作失败', '任务不存在或已被处理')
        return false
      }
      if (this.actionLoading) return false
      this.actionLoading = true
      this.actionError = ''
      try {
        const { task: updated } = await taskStore.executeAction(task.id, action)
        this.showPayModal = false
        this.showCancelModal = false
        this.showConfirmModal = false
        if (successNotify) {
          this.successTitle = successNotify.title
          this.successMessage = successNotify.message
          this.showSuccessModal = true
        }
        logger.info('Task action success', { taskId: task.id, action, status: updated.status })
        return true
      } catch (e) {
        // 失败：保留弹窗与原任务数据，允许重试
        this.actionError = e.message || '操作失败，请稍后重试'
        this.showNotification('error', '操作失败', this.actionError)
        logger.error('Task action failed', { taskId: task.id, action, error: e.message })
        return false
      } finally {
        this.actionLoading = false
      }
    },
    confirmPay() {
      return this.runAction('pay', { title: '支付成功', message: '您的订单已支付成功' })
    },
    confirmCancel() {
      return this.runAction('cancel').then((ok) => {
        if (ok) this.showNotification('success', '取消成功', '任务已取消')
      })
    },
    confirmReceive() {
      return this.runAction('confirm').then((ok) => {
        if (ok) this.showNotification('success', '确认收货成功', '感谢您的购买')
      })
    },
    async handleRemind() {
      const task = this.selectedTask
      if (!task) return
      this.showNotification('success', '已提醒', '已提醒卖家尽快发货')
      logger.info('Reminder sent', { taskId: task.id })
    },
    handleReview() {
      if (!this.selectedTask) return
      this.showNotification('info', '评价功能', '评价功能开发中，敬请期待')
    },
    // 弹窗关闭（含遮罩/×/取消）时清理错误与选中态，避免下次打开残留旧内容
    onActionModalClosed() {
      if (this.actionLoading) return
      this.actionError = ''
    },
    onPayModalToggle(visible) {
      if (!visible && !this.actionLoading) this.actionError = ''
    },
    onCancelModalToggle(visible) {
      if (!visible && !this.actionLoading) this.actionError = ''
    },
    onConfirmModalToggle(visible) {
      if (!visible && !this.actionLoading) this.actionError = ''
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
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.action-btn.primary {
  background: var(--gradient-1);
  color: var(--bg-dark);
}

.action-btn.primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--primary-glow);
}

.action-btn.default {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.action-btn.default:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--text-muted);
}

.action-btn.danger {
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  color: #ff6b6b;
}

.action-btn.danger:hover:not(:disabled) {
  background: rgba(255, 107, 107, 0.2);
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
  gap: 1rem;
}

.pay-label,
.detail-label {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.pay-value,
.detail-value {
  font-weight: 500;
  text-align: right;
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

.action-error {
  color: #ff6b6b;
  font-size: 0.85rem;
  margin-top: 0.25rem;
  text-align: left;
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

.detail-block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.order-items {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.order-item-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
}

.detail-value.amount {
  color: var(--primary);
  font-weight: 600;
}

.detail-gone {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--text-secondary);
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
