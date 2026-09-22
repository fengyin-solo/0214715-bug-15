/**
 * 任务中心存储管理
 * 统一管理预约、报名、订单等任务数据。
 *
 * 设计要点（共享根因修复）：
 * - 内存中维护唯一的响应式数据源（reactive），localStorage 仅做写透持久化，
 *   所有页面读取的都是同一份数据，支付/取消/确认收货后列表与详情自动联动，
 *   不会残留 enrich 出来的旧副本。
 * - 所有变更都经过状态机校验（幂等）：重复操作直接返回 null，不会二次处理；
 *   写入 localStorage 失败时回滚内存状态，保证内存与持久层一致。
 * - 支持按任务组批量处理（processGroup），先整体校验再统一落库，任一任务不合法则整组不动。
 */

import { reactive } from 'vue'

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
      cancelled: []
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
      cancelled: []
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
        { key: 'view', label: '查看物流', type: 'primary', route: '/shop' },
        { key: 'confirm', label: '确认收货', type: 'primary' }
      ],
      completed: [
        { key: 'view', label: '查看结果', type: 'default', route: '/shop' },
        { key: 'review', label: '评价', type: 'primary' },
        { key: 'rebuy', label: '再次购买', type: 'default', route: '/shop' }
      ],
      cancelled: [
        { key: 'rebuy', label: '再次购买', type: 'default', route: '/shop' }
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
 * 支付后的目标状态 / 副标题，按任务类型区分
 */
const paidTransition = {
  booking: { status: 'upcoming', subtitle: '支付成功，等待使用' },
  course: { status: 'upcoming', subtitle: '支付成功，等待开课' },
  competition: { status: 'upcoming', subtitle: '支付成功，等待开赛' },
  order: { status: 'pending_shipment', subtitle: '支付成功，待发货' }
}

function formatDate(date) {
  const d = new Date(date)
  const pad = n => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getDefaultTasks() {
  return [
    {
      id: 'T' + Date.now().toString() + '001',
      type: 'booking',
      title: '3号球桌 - 美式九球',
      subtitle: '2026-02-15 14:00 - 16:00',
      amount: 120,
      status: 'pending_payment',
      createdAt: formatDate(new Date(Date.now() - 86400000)),
      extra: { tableId: 3, date: '2026-02-15', time: '14:00 - 16:00' }
    },
    {
      id: 'T' + Date.now().toString() + '002',
      type: 'course',
      title: '台球入门基础课',
      subtitle: '报名成功，等待开课',
      amount: 599,
      status: 'upcoming',
      createdAt: formatDate(new Date(Date.now() - 259200000)),
      extra: { courseId: 1 }
    },
    {
      id: 'T' + Date.now().toString() + '003',
      type: 'competition',
      title: '周末九球挑战赛',
      subtitle: '比赛进行中',
      amount: 100,
      status: 'ongoing',
      createdAt: formatDate(new Date(Date.now() - 432000000)),
      extra: { competitionId: 2 }
    },
    {
      id: 'T' + Date.now().toString() + '004',
      type: 'order',
      title: 'LP专业斯诺克球杆',
      subtitle: '待发货',
      amount: 2999,
      status: 'pending_shipment',
      createdAt: formatDate(new Date(Date.now() - 172800000)),
      extra: { orderNo: 'SP' + Date.now().toString().slice(-8), productId: 1 }
    }
  ]
}

// ==================== 唯一数据源 ====================

const state = reactive({
  tasks: [],
  loaded: false
})

// 进行中的操作（任务级锁，防止重复点击 / 并发重复处理）
const pendingOps = new Set()

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored == null) return getDefaultTasks()
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : getDefaultTasks()
  } catch (e) {
    logger.error('加载任务失败', e)
    return getDefaultTasks()
  }
}

function ensureLoaded() {
  if (!state.loaded) {
    state.tasks = loadFromStorage()
    state.loaded = true
  }
}

/**
 * 写透持久化。失败时抛出异常，由调用方回滚内存变更。
 */
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks))
    return true
  } catch (e) {
    logger.error('保存任务失败', e)
    throw e
  }
}

function generateTaskId() {
  return 'T' + Date.now().toString() + Math.floor(Math.random() * 1000).toString().padStart(3, '0')
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
    // 拷贝动作定义，避免多张卡片共享同一个数组引用
    actions: actions.map(a => ({ ...a }))
  }
}

function sortByCreatedAt(list) {
  return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function findIndex(taskId) {
  return state.tasks.findIndex(t => t.id === taskId)
}

/**
 * 在快照上执行变更并尝试持久化，失败自动回滚。
 * @param {Function} mutator 对 state.tasks 做变更的同步函数
 * @returns {boolean} 是否提交成功
 */
function commit(mutator) {
  const snapshot = JSON.parse(JSON.stringify(state.tasks))
  mutator()
  try {
    persist()
    return true
  } catch (e) {
    state.tasks.splice(0, state.tasks.length, ...snapshot)
    return false
  }
}

// ==================== 状态机校验 ====================

function canPay(task) {
  return !!task && !!paidTransition[task.type] && task.status === 'pending_payment'
}

function canCancel(task) {
  // 仅待付款任务可取消（与各类型 actions 配置保持一致）
  return !!task && task.status === 'pending_payment'
}

function canConfirmReceipt(task) {
  return !!task && task.type === 'order' && task.status === 'shipped'
}

/**
 * 计算单个动作在当前任务上的变更；不合法返回 null。
 */
function planTransition(task, action) {
  if (!task) return null
  switch (action) {
    case 'pay':
      return canPay(task)
        ? { status: paidTransition[task.type].status, subtitle: paidTransition[task.type].subtitle }
        : null
    case 'cancel':
      return canCancel(task)
        ? { status: 'cancelled', subtitle: '已取消' }
        : null
    case 'confirm':
      return canConfirmReceipt(task)
        ? { status: 'completed', subtitle: '已确认收货，交易完成' }
        : null
    default:
      return null
  }
}

export const taskStore = {
  /**
   * 测试 / 重新登录时重置内存数据源并持久化
   */
  reset(tasks) {
    state.tasks = tasks ? JSON.parse(JSON.stringify(tasks)) : getDefaultTasks()
    state.loaded = true
    pendingOps.clear()
    try {
      persist()
    } catch (e) {
      // 重置时持久化失败不影响内存数据
    }
    return this.getAll()
  },

  getAll() {
    ensureLoaded()
    return sortByCreatedAt(state.tasks.map(enrichTask))
  },

  getByStatus(status) {
    const tasks = this.getAll()
    if (status === 'pending') {
      return tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    }
    if (status === 'completed') {
      return tasks.filter(t => t.status === 'completed')
    }
    if (status === 'archived') {
      return tasks.filter(t => t.status === 'completed' || t.status === 'cancelled')
    }
    if (status === 'cancelled') {
      return tasks.filter(t => t.status === 'cancelled')
    }
    return tasks
  },

  getById(taskId) {
    ensureLoaded()
    const task = state.tasks.find(t => t.id === taskId)
    return task ? enrichTask(task) : null
  },

  add(taskData) {
    ensureLoaded()
    // id / createdAt 由 store 统一生成，避免外部传入导致重复或错位
    const newTask = {
      ...taskData,
      id: generateTaskId(),
      createdAt: formatDate(new Date())
    }
    const ok = commit(() => {
      state.tasks.unshift(newTask)
    })
    if (!ok) {
      logger.warn('任务添加失败（持久化失败）')
      return null
    }
    logger.info('任务已添加', newTask)
    return enrichTask(newTask)
  },

  update(taskId, updates) {
    ensureLoaded()
    const index = findIndex(taskId)
    if (index === -1) {
      logger.warn('任务不存在', taskId)
      return null
    }
    // id / type / 金额 / extra 等业务归属字段不允许通过通用 update 改写，
    // 防止任务动作与业务数据错位
    const safeUpdates = { ...updates }
    delete safeUpdates.id
    delete safeUpdates.type
    delete safeUpdates.amount
    delete safeUpdates.extra
    let result = null
    const ok = commit(() => {
      state.tasks[index] = { ...state.tasks[index], ...safeUpdates }
      result = enrichTask(state.tasks[index])
    })
    if (!ok) {
      logger.warn('任务更新失败（持久化失败）', taskId)
      return null
    }
    logger.info('任务已更新', taskId, safeUpdates)
    return result
  },

  updateStatus(taskId, newStatus) {
    if (!statusConfig[newStatus]) {
      logger.error('无效的状态', newStatus)
      return null
    }
    return this.update(taskId, { status: newStatus })
  },

  remove(taskId) {
    ensureLoaded()
    const index = findIndex(taskId)
    if (index === -1) {
      logger.warn('任务不存在，无法删除', taskId)
      return false
    }
    const ok = commit(() => {
      state.tasks.splice(index, 1)
    })
    if (!ok) {
      logger.warn('任务删除失败（持久化失败）', taskId)
      return false
    }
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

  /**
   * 标记支付：仅 pending_payment 任务可支付，按类型流转到正确状态。
   * 重复支付 / 状态不符 / 持久化失败均返回 null（幂等，不产生脏数据）。
   */
  markAsPaid(taskId) {
    ensureLoaded()
    if (pendingOps.has(taskId)) {
      logger.warn('任务正在处理中，忽略重复操作', taskId)
      return null
    }
    const index = findIndex(taskId)
    if (index === -1) {
      logger.warn('任务不存在', taskId)
      return null
    }
    const patch = planTransition(state.tasks[index], 'pay')
    if (!patch) {
      logger.warn('当前状态不可支付', {
        taskId,
        type: state.tasks[index].type,
        status: state.tasks[index].status
      })
      return null
    }
    pendingOps.add(taskId)
    let result = null
    const ok = commit(() => {
      state.tasks[index] = { ...state.tasks[index], ...patch }
      result = enrichTask(state.tasks[index])
    })
    pendingOps.delete(taskId)
    if (!ok) return null
    logger.info('任务已支付', taskId, patch)
    return result
  },

  /**
   * 取消任务：置为 cancelled（保留记录，可在已完成/已取消分组查看），
   * 而非物理删除。仅待付款任务可取消。
   */
  cancelTask(taskId) {
    ensureLoaded()
    if (pendingOps.has(taskId)) {
      logger.warn('任务正在处理中，忽略重复操作', taskId)
      return null
    }
    const index = findIndex(taskId)
    if (index === -1) {
      logger.warn('任务不存在', taskId)
      return null
    }
    const patch = planTransition(state.tasks[index], 'cancel')
    if (!patch) {
      logger.warn('当前状态不可取消', { taskId, status: state.tasks[index].status })
      return null
    }
    pendingOps.add(taskId)
    let result = null
    const ok = commit(() => {
      state.tasks[index] = { ...state.tasks[index], ...patch }
      result = enrichTask(state.tasks[index])
    })
    pendingOps.delete(taskId)
    if (!ok) return null
    logger.info('任务已取消', taskId)
    return result
  },

  /**
   * 确认收货：仅已发货的商城订单可确认，流转为 completed。
   */
  confirmReceipt(taskId) {
    ensureLoaded()
    if (pendingOps.has(taskId)) {
      logger.warn('任务正在处理中，忽略重复操作', taskId)
      return null
    }
    const index = findIndex(taskId)
    if (index === -1) {
      logger.warn('任务不存在', taskId)
      return null
    }
    const patch = planTransition(state.tasks[index], 'confirm')
    if (!patch) {
      logger.warn('当前状态不可确认收货', {
        taskId,
        type: state.tasks[index].type,
        status: state.tasks[index].status
      })
      return null
    }
    pendingOps.add(taskId)
    let result = null
    const ok = commit(() => {
      state.tasks[index] = { ...state.tasks[index], ...patch }
      result = enrichTask(state.tasks[index])
    })
    pendingOps.delete(taskId)
    if (!ok) return null
    logger.info('任务已确认收货', taskId)
    return result
  },

  /**
   * 整组批量处理（pay / cancel / confirm）。
   * - 先对整组做状态机校验，任一任务不存在或当前状态不允许该动作，则整组不执行；
   * - 全部合法后统一应用并只写一次 localStorage，落库失败整组回滚；
   * - 自动跳过处理中的任务，重复提交同一组不会二次处理。
   *
   * @returns {{ success: boolean, processed: Array, error?: string }}
   */
  processGroup(taskIds, action) {
    ensureLoaded()
    if (!['pay', 'cancel', 'confirm'].includes(action)) {
      return { success: false, processed: [], error: '不支持的批量操作：' + action }
    }
    const ids = [...new Set(taskIds)].filter(id => !pendingOps.has(id))
    if (ids.length === 0) {
      return { success: false, processed: [], error: '没有可处理的任务' }
    }

    // 第一阶段：整组校验并计算变更
    const plans = []
    for (const id of ids) {
      const index = findIndex(id)
      if (index === -1) {
        return { success: false, processed: [], error: `任务不存在：${id}` }
      }
      const patch = planTransition(state.tasks[index], action)
      if (!patch) {
        return {
          success: false,
          processed: [],
          error: `任务当前状态不允许该操作：${id}（${state.tasks[index].status}）`
        }
      }
      plans.push({ index, patch })
    }

    // 第二阶段：整组应用 + 单次落库，失败回滚
    ids.forEach(id => pendingOps.add(id))
    const ok = commit(() => {
      for (const { index, patch } of plans) {
        state.tasks[index] = { ...state.tasks[index], ...patch }
      }
    })
    ids.forEach(id => pendingOps.delete(id))
    if (!ok) {
      return { success: false, processed: [], error: '批量处理失败，请稍后重试' }
    }

    const processed = plans.map(({ index }) => enrichTask(state.tasks[index]))
    logger.info(`批量${action}成功`, { count: processed.length })
    return { success: true, processed }
  },

  /**
   * 是否有进行中的任务操作（供 UI 防重）
   */
  isPending(taskId) {
    return pendingOps.has(taskId)
  },

  getPendingCount() {
    return this.getByStatus('pending').length
  },

  getCompletedCount() {
    return this.getByStatus('archived').length
  },

  clearAll() {
    ensureLoaded()
    const ok = commit(() => {
      state.tasks.splice(0, state.tasks.length)
    })
    if (ok) logger.info('所有任务已清除')
    return ok
  }
}

export default taskStore
