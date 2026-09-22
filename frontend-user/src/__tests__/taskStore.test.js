/**
 * 任务中心存储单元测试
 *
 * 覆盖场景：
 * - 支付 / 取消 / 确认收货的状态机流转与幂等（重复操作不二次处理）
 * - 请求失败（localStorage 持久化失败）时内存回滚，数据保持旧状态
 * - 再次打开任务中心（重新读取）看到的是同一份最新数据
 * - 空列表 / 清除全部
 * - 多条任务整组批量处理（全部成功 / 单个不合法整组不动 / 落库失败整组回滚）
 * - 任务动作、金额、类型与业务数据（extra）严格对应
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { taskStore } from '../utils/taskStore'

// ==================== localStorage Mock（可注入失败） ====================

const storageMock = (() => {
  let store = {}
  let failNext = false
  return {
    getItem: vi.fn(key => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => {
      if (failNext) {
        failNext = false
        throw new Error('QuotaExceededError')
      }
      store[key] = String(value)
    }),
    removeItem: vi.fn(key => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    // 测试辅助
    _failNextWrite() { failNext = true },
    _raw() { return store },
    _setRaw(data) { store = { billiard_user_tasks: JSON.stringify(data) } }
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: storageMock, configurable: true })

// ==================== 测试夹具 ====================

function makeTask(overrides = {}) {
  const seq = makeTask.seq = (makeTask.seq || 0) + 1
  return {
    id: 'FIXTURE-' + seq,
    type: 'booking',
    title: '测试球桌',
    subtitle: '待付款',
    amount: 100 + seq,
    status: 'pending_payment',
    createdAt: '2026-09-0' + (seq < 10 ? seq : 9) + ' 10:00',
    extra: { tableId: seq, date: '2026-09-20', time: '10:00 - 12:00', duration: 2 },
    ...overrides
  }
}

function seededTasks() {
  return [
    makeTask({ id: 'PP-BOOKING', type: 'booking', title: '1号球桌预约', amount: 120, status: 'pending_payment',
      extra: { tableId: 1, date: '2026-09-20', time: '10:00 - 12:00', duration: 2 } }),
    makeTask({ id: 'PP-ORDER', type: 'order', title: '球杆订单', amount: 2999, status: 'pending_payment',
      extra: { orderNo: 'SP00000001', items: [{ id: 1, name: 'LP球杆', qty: 1 }] } }),
    makeTask({ id: 'PP-COURSE', type: 'course', title: '入门课', amount: 599, status: 'pending_payment',
      extra: { courseId: 1 } }),
    makeTask({ id: 'SHIPPED-ORDER', type: 'order', title: '巧克粉订单', amount: 39, status: 'shipped',
      extra: { orderNo: 'SP00000002', items: [{ id: 5, name: '巧克粉', qty: 2 }] } }),
    makeTask({ id: 'DONE-ORDER', type: 'order', title: '手套订单', amount: 89, status: 'completed',
      extra: { orderNo: 'SP00000003' } })
  ]
}

// ==================== 测试用例 ====================

describe('taskStore - 共享数据源与再次打开', () => {
  beforeEach(() => {
    storageMock.clear()
    storageMock.setItem.mockClear()
    taskStore.reset(seededTasks())
  })

  it('再次读取得到同一份最新数据（响应式单一数据源）', () => {
    const first = taskStore.getById('PP-BOOKING')
    expect(first.status).toBe('pending_payment')

    taskStore.markAsPaid('PP-BOOKING')

    // 模拟“再次打开任务中心”：重新调用 getAll/getById
    const reopened = taskStore.getAll().find(t => t.id === 'PP-BOOKING')
    expect(reopened.status).toBe('upcoming')
    expect(reopened.subtitle).toBe('支付成功，等待使用')
    expect(taskStore.getById('PP-BOOKING').status).toBe('upcoming')
  })

  it('数据已写透到 localStorage，刷新后（从存储重载）仍为最新状态', () => {
    taskStore.markAsPaid('PP-BOOKING')
    const persisted = JSON.parse(storageMock._raw().billiard_user_tasks)
    expect(persisted.find(t => t.id === 'PP-BOOKING').status).toBe('upcoming')
  })

  it('getAll 返回的动作按钮与当前状态对应（支付后不再出现继续付款）', () => {
    const before = taskStore.getById('PP-BOOKING')
    expect(before.actions.map(a => a.key)).toContain('pay')
    expect(before.actions.map(a => a.key)).toContain('cancel')

    taskStore.markAsPaid('PP-BOOKING')
    const after = taskStore.getById('PP-BOOKING')
    expect(after.actions.map(a => a.key)).not.toContain('pay')
    expect(after.actions.map(a => a.key)).toContain('view')
  })
})

describe('taskStore - 支付（按类型流转、金额与业务数据对应）', () => {
  beforeEach(() => {
    storageMock.clear()
    taskStore.reset(seededTasks())
  })

  it('booking 支付后变为 upcoming，金额/类型/业务数据不变', () => {
    const updated = taskStore.markAsPaid('PP-BOOKING')
    expect(updated.status).toBe('upcoming')
    expect(updated.type).toBe('booking')
    expect(updated.amount).toBe(120)
    expect(updated.extra.tableId).toBe(1)
  })

  it('order 支付后变为 pending_shipment，订单业务数据保留', () => {
    const updated = taskStore.markAsPaid('PP-ORDER')
    expect(updated.status).toBe('pending_shipment')
    expect(updated.subtitle).toBe('支付成功，待发货')
    expect(updated.extra.orderNo).toBe('SP00000001')
    expect(updated.amount).toBe(2999)
  })

  it('course 支付后为 upcoming 且副标题为等待开课', () => {
    const updated = taskStore.markAsPaid('PP-COURSE')
    expect(updated.status).toBe('upcoming')
    expect(updated.subtitle).toBe('支付成功，等待开课')
  })

  it('competition 支付后为 upcoming 且副标题为等待开赛', () => {
    taskStore.reset([makeTask({ id: 'PP-COMP', type: 'competition', amount: 100, status: 'pending_payment' })])
    const updated = taskStore.markAsPaid('PP-COMP')
    expect(updated.status).toBe('upcoming')
    expect(updated.subtitle).toBe('支付成功，等待开赛')
  })
})

describe('taskStore - 重复操作幂等', () => {
  beforeEach(() => {
    storageMock.clear()
    taskStore.reset(seededTasks())
  })

  it('重复支付不会二次处理，返回 null 且状态保持', () => {
    expect(taskStore.markAsPaid('PP-BOOKING').status).toBe('upcoming')
    expect(taskStore.markAsPaid('PP-BOOKING')).toBeNull()
    expect(taskStore.getById('PP-BOOKING').status).toBe('upcoming')
  })

  it('非待付款任务（已发货/已完成）调用支付被拒绝', () => {
    expect(taskStore.markAsPaid('SHIPPED-ORDER')).toBeNull()
    expect(taskStore.markAsPaid('DONE-ORDER')).toBeNull()
  })

  it('重复取消不会二次处理；取消后任务保留为 cancelled 而非删除', () => {
    expect(taskStore.cancelTask('PP-BOOKING').status).toBe('cancelled')
    expect(taskStore.cancelTask('PP-BOOKING')).toBeNull()
    const stillThere = taskStore.getById('PP-BOOKING')
    expect(stillThere).not.toBeNull()
    expect(stillThere.status).toBe('cancelled')
    expect(taskStore.getAll().map(t => t.id)).toContain('PP-BOOKING')
  })

  it('只有待付款任务可取消，其他状态取消返回 null', () => {
    expect(taskStore.cancelTask('SHIPPED-ORDER')).toBeNull()
    expect(taskStore.cancelTask('DONE-ORDER')).toBeNull()
    expect(taskStore.getById('SHIPPED-ORDER').status).toBe('shipped')
  })

  it('确认收货重复操作幂等：只有已发货订单可确认，完成后再次确认返回 null', () => {
    expect(taskStore.confirmReceipt('SHIPPED-ORDER').status).toBe('completed')
    expect(taskStore.confirmReceipt('SHIPPED-ORDER')).toBeNull()
  })

  it('非订单类型 / 非已发货状态不能确认收货', () => {
    expect(taskStore.confirmReceipt('PP-BOOKING')).toBeNull()
    expect(taskStore.confirmReceipt('PP-ORDER')).toBeNull()
    expect(taskStore.confirmReceipt('DONE-ORDER')).toBeNull()
  })

  it('对不存在的任务执行动作全部安全返回 null/false', () => {
    expect(taskStore.markAsPaid('NOPE')).toBeNull()
    expect(taskStore.cancelTask('NOPE')).toBeNull()
    expect(taskStore.confirmReceipt('NOPE')).toBeNull()
    expect(taskStore.remove('NOPE')).toBe(false)
  })

  it('update 不允许改写 id/type/amount/extra，防止动作与业务数据错位', () => {
    const updated = taskStore.update('PP-BOOKING', {
      id: 'HACK', type: 'order', amount: 1, status: 'completed',
      extra: { tableId: 999 }
    })
    expect(updated.id).toBe('PP-BOOKING')
    expect(updated.type).toBe('booking')
    expect(updated.amount).toBe(120)
    expect(updated.extra.tableId).toBe(1)
    // 允许的字段（status）正常生效
    expect(updated.status).toBe('completed')
  })
})

describe('taskStore - 请求失败（持久化失败回滚）', () => {
  beforeEach(() => {
    storageMock.clear()
    taskStore.reset(seededTasks())
  })

  afterEach(() => {
    // 确保失败标记不会泄漏到后续用例
  })

  it('支付写入失败时内存状态回滚为待付款，返回 null', () => {
    storageMock._failNextWrite()
    const result = taskStore.markAsPaid('PP-BOOKING')
    expect(result).toBeNull()
    expect(taskStore.getById('PP-BOOKING').status).toBe('pending_payment')
  })

  it('取消写入失败时回滚，任务仍为待付款', () => {
    storageMock._failNextWrite()
    expect(taskStore.cancelTask('PP-BOOKING')).toBeNull()
    expect(taskStore.getById('PP-BOOKING').status).toBe('pending_payment')
  })

  it('确认收货写入失败时回滚，订单仍为已发货', () => {
    storageMock._failNextWrite()
    expect(taskStore.confirmReceipt('SHIPPED-ORDER')).toBeNull()
    expect(taskStore.getById('SHIPPED-ORDER').status).toBe('shipped')
  })

  it('新增任务写入失败时返回 null 且不进入列表', () => {
    const beforeCount = taskStore.getAll().length
    storageMock._failNextWrite()
    const added = taskStore.addBookingTask(
      { id: 9, name: '9号球桌', type: '中式八球', price: 50 },
      { orderNo: 'BK1', date: '2026-10-01', time: '10:00 - 11:00', duration: 1 }
    )
    expect(added).toBeNull()
    expect(taskStore.getAll().length).toBe(beforeCount)
  })
})

describe('taskStore - 空列表', () => {
  beforeEach(() => {
    storageMock.clear()
  })

  it('clearAll 后各分组均为空，计数为 0', () => {
    taskStore.reset(seededTasks())
    expect(taskStore.getAll().length).toBeGreaterThan(0)
    expect(taskStore.clearAll()).toBe(true)
    expect(taskStore.getAll()).toEqual([])
    expect(taskStore.getByStatus('pending')).toEqual([])
    expect(taskStore.getByStatus('archived')).toEqual([])
    expect(taskStore.getPendingCount()).toBe(0)
    expect(taskStore.getCompletedCount()).toBe(0)
  })

  it('localStorage 中为空数组时返回空列表而不是默认数据', () => {
    storageMock._setRaw([])
    taskStore.reset([])
    expect(taskStore.getAll()).toEqual([])
  })

  it('localStorage 数据损坏时回退到默认任务，不抛异常', async () => {
    vi.resetModules()
    storageMock.clear()
    storageMock._raw().billiard_user_tasks = '{not-json'
    const fresh = (await import('../utils/taskStore')).taskStore
    const tasks = fresh.getAll()
    expect(Array.isArray(tasks)).toBe(true)
    expect(tasks.length).toBeGreaterThan(0)
  })
})

describe('taskStore - 待处理 / 已完成分组与计数', () => {
  beforeEach(() => {
    storageMock.clear()
    taskStore.reset(seededTasks())
  })

  it('cancelled 归入已完成分组，不出现在待处理', () => {
    taskStore.cancelTask('PP-BOOKING')
    const pendingIds = taskStore.getByStatus('pending').map(t => t.id)
    const archivedIds = taskStore.getByStatus('archived').map(t => t.id)
    expect(pendingIds).not.toContain('PP-BOOKING')
    expect(archivedIds).toContain('PP-BOOKING')
    expect(archivedIds).toContain('DONE-ORDER')
    expect(taskStore.getByStatus('completed').map(t => t.id)).not.toContain('PP-BOOKING')
  })
})

describe('taskStore - 多条任务整组批量处理', () => {
  beforeEach(() => {
    storageMock.clear()
    taskStore.reset(seededTasks())
  })

  it('批量支付：组内全部待付款任务一次性支付成功', () => {
    const result = taskStore.processGroup(['PP-BOOKING', 'PP-ORDER', 'PP-COURSE'], 'pay')
    expect(result.success).toBe(true)
    expect(result.processed.length).toBe(3)
    expect(taskStore.getById('PP-BOOKING').status).toBe('upcoming')
    expect(taskStore.getById('PP-ORDER').status).toBe('pending_shipment')
    expect(taskStore.getById('PP-COURSE').status).toBe('upcoming')
  })

  it('批量取消：全部置为 cancelled 且记录保留', () => {
    const result = taskStore.processGroup(['PP-BOOKING', 'PP-ORDER'], 'cancel')
    expect(result.success).toBe(true)
    expect(result.processed.length).toBe(2)
    expect(taskStore.getById('PP-BOOKING').status).toBe('cancelled')
    expect(taskStore.getById('PP-ORDER').status).toBe('cancelled')
  })

  it('批量确认收货：仅已发货订单成功', () => {
    const result = taskStore.processGroup(['SHIPPED-ORDER'], 'confirm')
    expect(result.success).toBe(true)
    expect(taskStore.getById('SHIPPED-ORDER').status).toBe('completed')
  })

  it('组内任一任务状态不合法时整组不动（不会只处理一半）', () => {
    const result = taskStore.processGroup(['PP-BOOKING', 'SHIPPED-ORDER'], 'pay')
    expect(result.success).toBe(false)
    expect(result.error).toContain('状态')
    // 合法的那条也必须保持原状
    expect(taskStore.getById('PP-BOOKING').status).toBe('pending_payment')
    expect(taskStore.getById('SHIPPED-ORDER').status).toBe('shipped')
  })

  it('组内含不存在的任务时整组不动', () => {
    const result = taskStore.processGroup(['PP-BOOKING', 'MISSING'], 'pay')
    expect(result.success).toBe(false)
    expect(result.processed.length).toBe(0)
    expect(taskStore.getById('PP-BOOKING').status).toBe('pending_payment')
  })

  it('批量落库失败时整组回滚到操作前状态', () => {
    storageMock._failNextWrite()
    const result = taskStore.processGroup(['PP-BOOKING', 'PP-ORDER'], 'pay')
    expect(result.success).toBe(false)
    expect(taskStore.getById('PP-BOOKING').status).toBe('pending_payment')
    expect(taskStore.getById('PP-ORDER').status).toBe('pending_payment')
  })

  it('重复提交批量支付（二次调用）不会二次处理', () => {
    const first = taskStore.processGroup(['PP-BOOKING', 'PP-ORDER'], 'pay')
    expect(first.success).toBe(true)
    const second = taskStore.processGroup(['PP-BOOKING', 'PP-ORDER'], 'pay')
    expect(second.success).toBe(false)
    expect(second.processed.length).toBe(0)
  })

  it('批量处理自动去重，同一 id 传两次只处理一次', () => {
    const result = taskStore.processGroup(['PP-BOOKING', 'PP-BOOKING'], 'pay')
    expect(result.success).toBe(true)
    expect(result.processed.length).toBe(1)
  })

  it('不支持的批量动作直接拒绝', () => {
    const result = taskStore.processGroup(['PP-BOOKING'], 'explode')
    expect(result.success).toBe(false)
  })
})

describe('taskStore - 新增任务与业务数据对应', () => {
  beforeEach(() => {
    storageMock.clear()
    taskStore.reset([])
  })

  it('addBookingTask：金额=单价×时长，extra 含完整预约业务字段', () => {
    const t = taskStore.addBookingTask(
      { id: 3, name: '3号球桌', type: '美式九球', price: 60 },
      { orderNo: 'BK123', date: '2026-10-01', time: '14:00 - 16:00', duration: 2 }
    )
    expect(t).not.toBeNull()
    expect(t.type).toBe('booking')
    expect(t.amount).toBe(120)
    expect(t.status).toBe('pending_payment')
    expect(t.extra).toMatchObject({ tableId: 3, orderNo: 'BK123', date: '2026-10-01', duration: 2 })
  })

  it('addOrderTask：金额与商品明细对应订单数据', () => {
    const t = taskStore.addOrderTask({
      orderNo: 'SP999',
      amount: 39,
      items: [{ id: 5, name: '巧克粉', qty: 1, price: 39 }],
      createTime: '2026-10-01 10:00'
    })
    expect(t.type).toBe('order')
    expect(t.amount).toBe(39)
    expect(t.status).toBe('pending_shipment')
    expect(t.extra.orderNo).toBe('SP999')
    expect(t.extra.items[0].name).toBe('巧克粉')
  })

  it('add 自动生成 id/createdAt，忽略外部传入的同名字段', () => {
    const t = taskStore.add({ id: 'FORCED', createdAt: '2000-01-01 00:00', type: 'booking', amount: 1, status: 'pending_payment' })
    expect(t.id).not.toBe('FORCED')
    expect(t.createdAt).not.toBe('2000-01-01 00:00')
  })
})
