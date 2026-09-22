/**
 * 任务中心存储管理
 * 统一管理预约、报名、订单等任务数据。
 *
 * 设计要点：
 * - 内存中维护一份 reactive 任务列表作为唯一数据源（single source of truth），
 *   任何修改都经过受控的状态迁移方法，并持久化到 localStorage；
 *   任务中心、业务页面、导航栏读取同一份数据，天然跨页面联动、不会残留旧结果。
 * - 所有写操作都带前置状态校验（重复支付、重复取消、非法确认收货等会被拒绝），
 *   并按任务 id 做“处理中”互斥，杜绝重复操作/并发整组写覆盖。
 * - executeAction 是统一的异步动作入口，模拟网络请求、失败回滚（失败时数据不变），
 *   transport 可替换，便于模拟请求失败场景。
 */

import { reactive, readonly } from 'vue'

const STORAGE_KEY = 'billiard_user_tasks'

const logger = {
  info: (...args) => console.log('[taskStore]', ...args),
  warn: (...args) => console.warn('[taskStore]', ...args),
  error: (...args) => console.error('[taskStore]', ...args)
}

const taskTypeConfig = {
  booking: {
    name: '球桌预约',
    icon: '🎱',
    actions: {
      pending_payment: [
        { key: 'pay', label: '继续付款', type: 'primary' },
        { key: 'cancel', label: '取消', type: 'danger' }
      ],
      upcoming: [
        { key: 'view', label: '查看详情', type: 'primary' },
        { key: 'rebook', label: '再次预约', type: 'default', route: '/tables' }
      ],
      ongoing: [
        { key: 'view', label: '查看详情', type: 'primary' }
      ],
      completed: [
        { key: 'view', label: '查看结果', type: 'default' },
        { key: 'rebook', label: '再次预约', type: 'primary', route: '/tables' }
      ],
      cancelled: [
        { key: 'view', label: '查看详情', type: 'default' },
        { key: 'rebook', label: '再次预约', type: 'primary', route: '/tables' }
      ]
    }
  },
  course: {
    name: '课程报名',
    icon: '📚',
    actions: {
      pending_payment: [
        { key: 'pay', label: '继续付款', type: 'primary' },
        { key: 'cancel', label: '取消', type: 'danger' }
      ],
      upcoming: [
        { key: 'view', label: '查看详情', type: 'primary', route: '/courses' }
      ],
      ongoing: [
        { key: 'view', label: '继续学习', type: 'primary', route: '/courses' }
      ],
      completed: [
        { key: 'view', label: '查看结果', type: 'default' },
        { key: 'review', label: '评价', type: 'primary' }
      ],
      cancelled: [
        { key: 'view', label: '查看详情', type: 'default' }
      ]
    }
  },
  competition: {
    name: '赛事报名',
    icon: '🏆',
    actions: {
      pending_payment: [
        { key: 'pay', label: '继续付款', type: 'primary' },
        { key: 'cancel', label: '取消', type: 'danger' }
      ],
      upcoming: [
        { key: 'view', label: '查看赛程', type: 'primary', route: '/competitions' }
      ],
      ongoing: [
        { key: 'view', label: '观看直播', type: 'primary', route: '/competitions' }
      ],
      completed: [
        { key: 'view', label: '查看结果', type: 'default', route: '/competitions' }
      ],
      cancelled: [
        { key: 'view', label: '查看详情', type: 'default' }
      ]
    }
  },
  order: {
    name: '商城订单',
    icon: '🛒',
    actions: {
      pending_payment: [
        { key: 'pay', label: '继续付款', type: 'primary' },
        { key: 'cancel', label: '取消', type: 'danger' }
      ],
      pending_shipment: [
        { key: 'view', label: '查看订单', type: 'primary', route: '/shop' },
        { key: 'remind', label: '提醒发货', type: 'default' }
      ],
      shipped: [
        { key: 'view', label: '查看物流', type: 'primary' },
        { key: 'confirm', label: '确认收货', type: 'primary' }
      ],
      completed: [
        { key: 'view', label: '查看结果', type: 'default', route: '/shop' },
        { key: 'review', label: '评价', type: 'primary' },
        { key: 'rebuy', label: '再次购买', type: 'default', route: '/shop' }
      ],
      cancelled: [
        { key: 'view', label: '查看详情', type: 'default' },
        { key: 'rebuy', label: '再次购买', type: 'primary', route: '/shop' }
      ]
    }
  }
}

const statusConfig = {
  pending_payment: { text: '待付款', type: 'warning' },
  upcoming: { text: '待开始', type: 'info' },
  ongoing: { text: '进行中', type: 'primary' },
  pending_shipment: { text: '待发货', type: 'warning' },
  shipped: { text: '已发货', type: 'info' },
  completed: { text: '已完成', type: 'success' },
  cancelled: { text: '已取消', type: 'success' }
}

/**
 * 允许的状态迁移白名单：只有表中列出的迁移才合法。
 * 防止重复支付、对已取消/已完成任务继续操作等错位问题。
 */
const statusTransitions = {
  pay: {
    from: ['pending_payment'],
    resolve: (task) => (task.type === 'order' ? 'pending_shipment' : 'upcoming')
  },
  cancel: {
    from: ['pending_payment', 'upcoming', 'pending_shipment'],
    resolve: () => 'cancelled'
  },
  confirm: {
    from: ['shipped'],
    resolve: () => 'completed'
  }
}

const actionSubtitles = {
  pay: (task) => {
    if (task.type === 'order') return '支付成功，待发货'
    if (task.type === 'course') return '支付成功，等待开课'
    if (task.type === 'competition') return '支付成功，等待比赛开始'
    return '支付成功，等待使用'
  },
  cancel: () => '任务已取消',
  confirm: () => '交易已完成'
}

/**
 * 模拟网络请求的传输层。返回 Promise；默认始终成功。
 * 测试中可通过 taskStore.setTransport 替换，以模拟请求失败。
 */
let actionTransport = () => Promise.resolve({ success: true })

/** 每个任务正在处理中的动作（按 taskId 互斥，防止重复操作） */
const inflight = reactive({})

/**
 * 唯一数据源：所有任务都保存在这个 reactive 数组中。
 * 只存储原始任务字段，展示字段（typeName/actions 等）由 enrichTask 派生。
 */
const state = reactive({
  tasks: []
})

// ==================== 持久化 ====================

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks))
    return true
  } catch (e) {
    logger.error('保存任务失败', e)
    return false
  }
}

/**
 * 从 localStorage 恢复任务；没有任何数据时写入默认演示任务。
 * 返回原始任务数组。
 */
function loadFromStorage() {
  let tasks = null
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) tasks = parsed
    }
  } catch (e) {
    logger.error('加载任务失败', e)
  }

  if (!tasks) {
    tasks = getDefaultTasks()
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
    } catch (e) {
      logger.error('初始化任务失败', e)
    }
  }
  return tasks
}

function init() {
  const tasks = loadFromStorage()
  state.tasks.splice(0, state.tasks.length, ...tasks)
}

/**
 * 跨标签页/跨页面联动：其它页面（含业务页整组写入）改动 localStorage 后，
 * 当前页面的任务中心与角标自动同步。
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    let tasks = []
    try {
      tasks = event.newValue ? JSON.parse(event.newValue) : []
      if (!Array.isArray(tasks)) tasks = []
    } catch (e) {
      logger.error('同步任务失败', e)
      tasks = []
    }
    state.tasks.splice(0, state.tasks.length, ...tasks)
  })
}

// ==================== 工具函数 ====================

function formatDate(date) {
  const d = new Date(date)
  const pad = (n) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

let idSeq = 0
function generateTaskId() {
  idSeq = (idSeq + 1) % 10000
  return 'T' + Date.now().toString() + idSeq.toString().padStart(4, '0')
}

function enrichTask(task) {
  const typeInfo = taskTypeConfig[task.type]
  const statusInfo = statusConfig[task.status]
  const actions = typeInfo?.actions?.[task.status] || []

  return {
    ...task,
    typeName: typeInfo?.name || task.type,
    typeIcon: typeInfo?.icon || '📋',
    statusText: statusInfo?.text || task.status,
    statusType: statusInfo?.type || 'info',
    actions,
    processing: !!inflight[task.id]
  }
}

function sortByCreatedAt(tasks) {
  return [...tasks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function getDefaultTasks() {
  const now = Date.now()
  return [
    {
      id: 'T' + now.toString() + '0001',
      type: 'booking',
      title: '3号球桌 - 美式九球',
      subtitle: '2026-02-15 14:00 - 16:00',
      amount: 120,
      status: 'pending_payment',
      createdAt: formatDate(new Date(now - 86400000)),
      extra: { tableId: 3, date: '2026-02-15', time: '14:00 - 16:00', duration: 2 }
    },
    {
      id: 'T' + now.toString() + '0002',
      type: 'course',
      title: '台球入门基础课',
      subtitle: '报名成功，等待开课',
      amount: 599,
      status: 'upcoming',
      createdAt: formatDate(new Date(now - 259200000)),
      extra: { courseId: 1 }
    },
    {
      id: 'T' + now.toString() + '0003',
      type: 'competition',
      title: '周末九球挑战赛',
      subtitle: '比赛进行中',
      amount: 100,
      status: 'ongoing',
      createdAt: formatDate(new Date(now - 432000000)),
      extra: { competitionId: 2 }
    },
    {
      id: 'T' + now.toString() + '0004',
      type: 'order',
      title: 'LP专业斯诺克球杆',
      subtitle: '待发货',
      amount: 2999,
      status: 'pending_shipment',
      createdAt: formatDate(new Date(now - 172800000)),
      extra: { orderNo: 'SP' + now.toString().slice(-8), productId: 1 }
    }
  ]
}

/**
 * 校验任务是否可以执行某个动作。
 * @param {Object} task 任务对象
 * @param {string} action 动作
 * @param {Object} [opts]
 * @param {boolean} [opts.skipInflight=false] 内部执行阶段调用时跳过处理中互斥检查
 * @returns {{valid: boolean, error?: string}}
 */
function validateTransition(task, action, { skipInflight = false } = {}) {
  const rule = statusTransitions[action]
  if (!rule) return { valid: true }
  if (!task) return { valid: false, error: '任务不存在' }
  if (!skipInflight && inflight[task.id]) {
    return { valid: false, error: '操作处理中，请勿重复提交' }
  }
  if (!rule.from.includes(task.status)) {
    return { valid: false, error: '当前任务状态不允许此操作' }
  }
  return { valid: true }
}

// ==================== Store ====================

export const taskStore = {
  /** 响应式只读状态，供组件在 computed 中直接使用（跨页面联动） */
  state: readonly(state),

  /**
   * 初始化/重新拉取数据。再次打开任务中心时调用，保证展示的是最新数据。
   */
  init() {
    init()
    return this.getAll()
  },

  getAll() {
    return sortByCreatedAt(state.tasks.map(enrichTask))
  },

  getByStatus(status) {
    const tasks = this.getAll()
    if (status === 'pending') {
      return tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    }
    if (status === 'completed') {
      // 历史列表包含已完成与已取消
      return tasks.filter(t => t.status === 'completed' || t.status === 'cancelled')
    }
    return tasks
  },

  getById(taskId) {
    const task = state.tasks.find(t => t.id === taskId)
    return task ? enrichTask(task) : null
  },

  add(taskData) {
    const newTask = {
      ...taskData,
      id: taskData.id || generateTaskId(),
      createdAt: taskData.createdAt || formatDate(new Date())
    }
    state.tasks.unshift(newTask)
    persist()
    logger.info('任务已添加', newTask)
    return enrichTask(newTask)
  },

  update(taskId, updates) {
    const index = state.tasks.findIndex(t => t.id === taskId)
    if (index === -1) {
      logger.warn('任务不存在', taskId)
      return null
    }
    state.tasks[index] = { ...state.tasks[index], ...updates, id: taskId }
    persist()
    logger.info('任务已更新', taskId, updates)
    return enrichTask(state.tasks[index])
  },

  /**
   * 受状态白名单保护的状态迁移。
   * 非法迁移（重复支付/取消、确认未发货订单等）一律拒绝并返回 null。
   */
  transition(taskId, action, extraUpdates = {}, options = {}) {
    const task = state.tasks.find(t => t.id === taskId)
    const check = validateTransition(task, action, { skipInflight: !!options.skipInflight })
    if (!check.valid) {
      logger.warn('非法状态迁移被拒绝', { taskId, action, status: task?.status, error: check.error })
      return null
    }
    const rule = statusTransitions[action]
    const newStatus = rule.resolve(task)
    const updates = { status: newStatus, ...extraUpdates }
    if (actionSubtitles[action]) {
      updates.subtitle = actionSubtitles[action](task)
    }
    return this.update(taskId, updates)
  },

  updateStatus(taskId, newStatus) {
    if (!statusConfig[newStatus]) {
      logger.error('无效的状态', newStatus)
      return null
    }
    return this.update(taskId, { status: newStatus })
  },

  /**
   * 兼容旧调用：支付（带状态保护，pending_payment 之外的状态返回 null）。
   */
  markAsPaid(taskId) {
    return this.transition(taskId, 'pay')
  },

  /**
   * 取消任务：迁移为 cancelled（保留记录，进入历史），不再物理删除。
   */
  cancelTask(taskId) {
    return this.transition(taskId, 'cancel')
  },

  /**
   * 确认收货：仅 shipped -> completed。
   */
  confirmReceived(taskId) {
    return this.transition(taskId, 'confirm')
  },

  /**
   * 统一的异步动作入口（支付/取消/确认收货）。
   * - 前置校验（存在性、状态、重复提交）
   * - 调用传输层模拟网络请求；请求失败时数据保持不变并抛出错误
   * - 成功后执行状态迁移并持久化
   *
   * @param {string} taskId
   * @param {'pay'|'cancel'|'confirm'} action
   * @returns {Promise<{success: true, task: Object}>}
   */
  async executeAction(taskId, action) {
    const task = state.tasks.find(t => t.id === taskId)
    const check = validateTransition(task, action)
    if (!check.valid) {
      const error = new Error(check.error)
      error.code = 'INVALID_STATE'
      throw error
    }

    inflight[taskId] = action
    try {
      const res = await actionTransport({ taskId, action, task: { ...task } })
      if (res && res.success === false) {
        throw new Error(res.message || '操作失败，请稍后重试')
      }
      const updated = this.transition(taskId, action, res?.updates || {}, { skipInflight: true })
      if (!updated) {
        throw new Error('任务状态已变更，请刷新后重试')
      }
      logger.info('任务动作成功', { taskId, action })
      return { success: true, task: updated }
    } finally {
      delete inflight[taskId]
    }
  },

  /**
   * 批量执行同一动作（整组处理）。
   * 任一前置校验不通过或请求失败则整组中止，已处理的任务回滚，
   * 不会出现“一部分成功一部分失败”的错位数据。
   * @returns {Promise<{success: boolean, taskIds: string[], error?: string}>}
   */
  async executeBatch(taskIds, action) {
    const ids = [...new Set(taskIds || [])]
    if (ids.length === 0) return { success: false, taskIds: [], error: '未选择任务' }

    // 1. 整组前置校验
    for (const id of ids) {
      const task = state.tasks.find(t => t.id === id)
      const check = validateTransition(task, action)
      if (!check.valid) {
        return { success: false, taskIds: [], error: check.error }
      }
    }

    // 2. 快照，用于失败回滚
    const snapshot = state.tasks.map(t => ({ ...t }))
    const succeeded = []
    for (const id of ids) {
      inflight[id] = action
    }
    try {
      for (const id of ids) {
        const task = state.tasks.find(t => t.id === id)
        const res = await actionTransport({ taskId: id, action, task: { ...task } })
        if (res && res.success === false) {
          throw new Error(res.message || '部分任务处理失败')
        }
        const updated = this.transition(id, action, res?.updates || {}, { skipInflight: true })
        if (!updated) throw new Error('部分任务状态已变更')
        succeeded.push(id)
      }
      logger.info('批量任务动作成功', { action, count: ids.length })
      return { success: true, taskIds: ids }
    } catch (e) {
      // 整组回滚，避免残留中间结果
      state.tasks.splice(0, state.tasks.length, ...snapshot.map(t => ({ ...t })))
      persist()
      logger.error('批量任务动作失败，已回滚', e)
      return { success: false, taskIds: succeeded, error: e.message }
    } finally {
      ids.forEach(id => delete inflight[id])
    }
  },

  isProcessing(taskId) {
    return !!inflight[taskId]
  },

  /** 替换传输层（测试用，模拟请求失败/延迟） */
  setTransport(fn) {
    actionTransport = typeof fn === 'function' ? fn : actionTransport
  },

  remove(taskId) {
    const index = state.tasks.findIndex(t => t.id === taskId)
    if (index === -1) {
      logger.warn('任务不存在，无法删除', taskId)
      return false
    }
    state.tasks.splice(index, 1)
    persist()
    logger.info('任务已删除', taskId)
    return true
  },

  addBookingTask(table, bookingInfo) {
    return this.add({
      type: 'booking',
      title: `${table.name} - ${table.type}`,
      subtitle: `${bookingInfo.date} ${bookingInfo.time}`,
      amount: table.price * bookingInfo.duration,
      status: 'pending_payment',
      extra: {
        tableId: table.id,
        date: bookingInfo.date,
        time: bookingInfo.time,
        duration: bookingInfo.duration,
        orderNo: bookingInfo.orderNo
      }
    })
  },

  addCourseTask(course, enrollInfo) {
    return this.add({
      type: 'course',
      title: course.name,
      subtitle: '报名成功，等待开课',
      amount: course.price,
      status: 'upcoming',
      extra: {
        courseId: course.id,
        orderNo: enrollInfo.orderNo,
        coach: course.coach,
        lessons: course.lessons
      }
    })
  },

  addCompetitionTask(competition, regInfo) {
    return this.add({
      type: 'competition',
      title: competition.name,
      subtitle: competition.status === 'upcoming' ? '等待比赛开始' : '比赛进行中',
      amount: competition.fee,
      status: competition.status === 'upcoming' ? 'upcoming' : 'ongoing',
      extra: {
        competitionId: competition.id,
        regNo: regInfo.regNo,
        playerNo: regInfo.playerNo,
        date: competition.date
      }
    })
  },

  addOrderTask(order) {
    return this.add({
      type: 'order',
      title: order.items.map(i => i.name).join('、'),
      subtitle: '已下单，待发货',
      amount: order.amount,
      status: 'pending_shipment',
      extra: {
        orderNo: order.orderNo,
        items: order.items,
        createTime: order.createTime
      }
    })
  },

  getPendingCount() {
    return this.getByStatus('pending').length
  },

  getCompletedCount() {
    return this.getAll().filter(t => t.status === 'completed').length
  },

  /** 历史（已完成 + 已取消）数量，供“历史”页签角标使用 */
  getHistoryCount() {
    return this.getByStatus('completed').length
  },

  clearAll() {
    state.tasks.splice(0, state.tasks.length)
    persist()
    logger.info('所有任务已清除')
  },

  /** 仅供测试：重置为指定任务或默认演示任务 */
  __reset(tasks) {
    Object.keys(inflight).forEach(k => delete inflight[k])
    const next = tasks || getDefaultTasks()
    state.tasks.splice(0, state.tasks.length, ...next.map(t => ({ ...t })))
    persist()
  },

  /** 仅供测试：清空存储并重置内存（模拟空列表/首次打开） */
  __clear() {
    Object.keys(inflight).forEach(k => delete inflight[k])
    state.tasks.splice(0, state.tasks.length)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      logger.error('清除存储失败', e)
    }
  }
}

// 模块加载即从存储恢复一次（单例）
init()

export default taskStore
