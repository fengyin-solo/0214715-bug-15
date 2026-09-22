/**
 * 任务中心 Store 单元测试
 *
 * 覆盖：
 * - 多条任务的整组处理（批量支付/取消/确认收货、失败整组回滚）
 * - 重复操作（重复支付/取消/确认、处理中互斥）
 * - 请求失败（状态与金额保持不变、可重试）
 * - 再次打开任务中心（localStorage 持久化与恢复）
 * - 空列表
 * - 任务动作、金额、类型与业务数据（extra）严格对应
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import taskStore from '../utils/taskStore'

const STORAGE_KEY = 'billiard_user_tasks'

// 立即 resolve 的传输层，避免测试等待
const immediateTransport = () => Promise.resolve({ success: true })

function makeSeed() {
  const base = '2026-03-01 1'
  return [
    {
      id: 'BK1',
      type: 'booking',
      title: '3号球桌 - 美式九球',
      subtitle: '2026-03-02 14:00 - 16:00',
      amount: 120,
      status: 'pending_payment',
      createdAt: base + '0:00',
      extra: { tableId: 3, date: '2026-03-02', time: '14:00 - 16:00', duration: 2, orderNo: 'BK001' }
    },
    {
      id: 'CR1',
      type: 'course',
      title: '台球入门基础课',
      subtitle: '报名成功，等待开课',
      amount: 599,
      status: 'pending_payment',
      createdAt: base + '1:00',
      extra: { courseId: 1, orderNo: 'CR001', coach: '张明', lessons: '8课时' }
    },
    {
      id: 'CP1',
      type: 'competition',
      title: '周末九球挑战赛',
      subtitle: '等待比赛开始',
      amount: 100,
      status: 'pending_payment',
      createdAt: base + '2:00',
      extra: { competitionId: 2, regNo: 'REG001', playerNo: 7, date: '2026-03-05' }
    },
    {
      id: 'SP1',
      type: 'order',
      title: 'LP专业斯诺克球杆',
      subtitle: '待付款',
      amount: 2999,
      status: 'pending_payment',
      createdAt: base + '3:00',
      extra: { orderNo: 'SP001', items: [{ id: 1, name: 'LP专业斯诺克球杆', qty: 1 }], createTime: '2026-03-01 10:00' }
    },
    {
      id: 'SP2',
      type: 'order',
      title: '星牌比赛用球',
      subtitle: '已发货',
      amount: 1299,
      status: 'shipped',
      createdAt: base + '4:00',
      extra: { orderNo: 'SP002', items: [{ id: 2, name: '星牌比赛用球', qty: 2 }] }
    }
  ]
}

function reset(seed = makeSeed()) {
  taskStore.setTransport(immediateTransport)
  taskStore.__reset(seed)
}

describe('taskStore - 基础与数据对应', () => {
  beforeEach(() => {
    localStorage.clear()
    reset()
  })

  it('返回的任务携带按类型/状态派生的名称、图标与动作', () => {
    const booking = taskStore.getById('BK1')
    expect(booking.typeName).toBe('球桌预约')
    expect(booking.typeIcon).toBe('🎱')
    expect(booking.statusText).toBe('待付款')
    expect(booking.actions.map(a => a.key)).toEqual(['pay', 'cancel'])

    const order = taskStore.getById('SP2')
    expect(order.typeName).toBe('商城订单')
    expect(order.statusText).toBe('已发货')
    expect(order.actions.map(a => a.key)).toEqual(['view', 'confirm'])
  })

  it('待处理/历史分组正确（已取消进入历史，不计待处理）', () => {
    expect(taskStore.getByStatus('pending').map(t => t.id).sort()).toEqual(['BK1', 'CP1', 'CR1', 'SP1', 'SP2'])
    expect(taskStore.getByStatus('completed')).toHaveLength(0)
    expect(taskStore.getPendingCount()).toBe(5)
  })

  it('addBookingTask/addCourseTask/addCompetitionTask/addOrderTask 的金额、类型与业务数据一一对应', () => {
    const booking = taskStore.addBookingTask(
      { id: 6, name: '6号球桌', type: '中式八球', price: 50 },
      { orderNo: 'BKX', date: '2026-04-01', time: '10:00 - 12:00', duration: 3 }
    )
    expect(booking.type).toBe('booking')
    expect(booking.amount).toBe(150)
    expect(booking.status).toBe('pending_payment')
    expect(booking.extra).toMatchObject({ tableId: 6, date: '2026-04-01', duration: 3, orderNo: 'BKX' })

    const course = taskStore.addCourseTask(
      { id: 3, name: '九球高级技巧', price: 1999, coach: '王磊', lessons: '16课时' },
      { orderNo: 'CRX' }
    )
    expect(course.type).toBe('course')
    expect(course.amount).toBe(1999)
    expect(course.extra).toMatchObject({ courseId: 3, coach: '王磊', lessons: '16课时', orderNo: 'CRX' })

    const comp = taskStore.addCompetitionTask(
      { id: 4, name: '会员积分争霸赛', fee: 50, status: 'upcoming', date: '2026-04-01' },
      { regNo: 'REGX', playerNo: 9 }
    )
    expect(comp.type).toBe('competition')
    expect(comp.amount).toBe(50)
    expect(comp.status).toBe('upcoming')
    expect(comp.extra).toMatchObject({ competitionId: 4, regNo: 'REGX', playerNo: 9 })

    const order = taskStore.addOrderTask({
      orderNo: 'SPX',
      amount: 3038,
      items: [{ id: 1, name: 'LP球杆' }, { id: 2, name: '星牌球' }],
      createTime: 'now'
    })
    expect(order.type).toBe('order')
    expect(order.amount).toBe(3038)
    expect(order.status).toBe('pending_shipment')
    expect(order.title).toBe('LP球杆、星牌球')
    expect(order.extra.orderNo).toBe('SPX')
  })

  it('列表按创建时间倒序排列', () => {
    const ids = taskStore.getAll().map(t => t.id)
    expect(ids).toEqual(['SP2', 'SP1', 'CP1', 'CR1', 'BK1'])
  })
})

describe('taskStore - 支付（含重复操作与失败）', () => {
  beforeEach(() => {
    localStorage.clear()
    reset()
  })

  it('支付后各类型迁移到正确状态且金额不变', async () => {
    await taskStore.executeAction('BK1', 'pay')
    await taskStore.executeAction('CR1', 'pay')
    await taskStore.executeAction('CP1', 'pay')
    await taskStore.executeAction('SP1', 'pay')

    expect(taskStore.getById('BK1').status).toBe('upcoming')
    expect(taskStore.getById('CR1').status).toBe('upcoming')
    expect(taskStore.getById('CP1').status).toBe('upcoming')
    expect(taskStore.getById('SP1').status).toBe('pending_shipment')

    // 金额与业务数据不被动作改写
    expect(taskStore.getById('BK1').amount).toBe(120)
    expect(taskStore.getById('SP1').amount).toBe(2999)
    expect(taskStore.getById('SP1').extra.orderNo).toBe('SP001')
  })

  it('markAsPaid 对非待付款任务拒绝（防止重复支付）', async () => {
    await taskStore.executeAction('BK1', 'pay')
    expect(taskStore.markAsPaid('BK1')).toBeNull()
    // 已发货订单不能支付
    expect(taskStore.markAsPaid('SP2')).toBeNull()
    // 不存在的任务
    expect(taskStore.markAsPaid('NOPE')).toBeNull()
  })

  it('处理中重复发起同一动作会被互斥拒绝，且只执行一次传输', async () => {
    let release
    const transport = vi.fn(() => new Promise((resolve) => {
      release = () => resolve({ success: true })
    }))
    taskStore.setTransport(transport)

    const p1 = taskStore.executeAction('BK1', 'pay')
    const p2 = taskStore.executeAction('BK1', 'pay')
    await expect(p2).rejects.toThrow(/处理中/)
    release()
    const res = await p1
    expect(res.success).toBe(true)
    expect(transport).toHaveBeenCalledTimes(1)
    expect(taskStore.isProcessing('BK1')).toBe(false)
  })

  it('请求失败时状态与金额保持不变，并可以重试成功', async () => {
    taskStore.setTransport(() => Promise.resolve({ success: false, message: '支付失败' }))
    await expect(taskStore.executeAction('BK1', 'pay')).rejects.toThrow('支付失败')

    const after = taskStore.getById('BK1')
    expect(after.status).toBe('pending_payment')
    expect(after.amount).toBe(120)

    // 重试
    taskStore.setTransport(immediateTransport)
    const retry = await taskStore.executeAction('BK1', 'pay')
    expect(retry.success).toBe(true)
    expect(taskStore.getById('BK1').status).toBe('upcoming')
  })

  it('传输层抛异常时同样不改变任务', async () => {
    taskStore.setTransport(() => Promise.reject(new Error('网络异常')))
    await expect(taskStore.executeAction('CR1', 'pay')).rejects.toThrow('网络异常')
    expect(taskStore.getById('CR1').status).toBe('pending_payment')
  })
})

describe('taskStore - 取消与确认收货', () => {
  beforeEach(() => {
    localStorage.clear()
    reset()
  })

  it('取消是状态迁移到 cancelled（保留记录、进入历史），而非物理删除', async () => {
    await taskStore.executeAction('BK1', 'cancel')
    const t = taskStore.getById('BK1')
    expect(t.status).toBe('cancelled')
    expect(t.statusText).toBe('已取消')
    expect(taskStore.getAll().some(x => x.id === 'BK1')).toBe(true)
    expect(taskStore.getByStatus('pending').some(x => x.id === 'BK1')).toBe(false)
    expect(taskStore.getByStatus('completed').some(x => x.id === 'BK1')).toBe(true)
  })

  it('已取消/已完成任务不能再次取消或支付', async () => {
    await taskStore.executeAction('BK1', 'cancel')
    await expect(taskStore.executeAction('BK1', 'cancel')).rejects.toThrow(/状态/)
    await expect(taskStore.executeAction('BK1', 'pay')).rejects.toThrow(/状态/)

    await taskStore.executeAction('SP2', 'confirm')
    expect(taskStore.getById('SP2').status).toBe('completed')
    await expect(taskStore.executeAction('SP2', 'confirm')).rejects.toThrow(/状态/)
  })

  it('确认收货仅允许 shipped -> completed，金额保留', async () => {
    const res = await taskStore.executeAction('SP2', 'confirm')
    expect(res.task.status).toBe('completed')
    expect(res.task.amount).toBe(1299)

    // 待付款订单不能确认收货
    await expect(taskStore.executeAction('SP1', 'confirm')).rejects.toThrow(/状态/)
  })

  it('cancelTask/confirmReceived 同步保护方法行为一致', async () => {
    expect((await Promise.resolve(taskStore.cancelTask('CR1'))).status).toBe('cancelled')
    expect(taskStore.confirmReceived('SP2').status).toBe('completed')
    expect(taskStore.confirmReceived('BK1')).toBeNull()
  })
})

describe('taskStore - 批量处理（整组）', () => {
  beforeEach(() => {
    localStorage.clear()
    reset()
  })

  it('批量支付多条任务：全部成功且各自金额/类型/业务数据不串位', async () => {
    const res = await taskStore.executeBatch(['BK1', 'CR1', 'CP1', 'SP1'], 'pay')
    expect(res.success).toBe(true)
    expect(res.taskIds).toHaveLength(4)

    const statuses = ['BK1', 'CR1', 'CP1', 'SP1'].map(id => taskStore.getById(id).status)
    expect(statuses).toEqual(['upcoming', 'upcoming', 'upcoming', 'pending_shipment'])

    // 金额与业务数据仍严格对应
    expect(taskStore.getById('BK1').amount).toBe(120)
    expect(taskStore.getById('BK1').extra.tableId).toBe(3)
    expect(taskStore.getById('CR1').amount).toBe(599)
    expect(taskStore.getById('CR1').extra.courseId).toBe(1)
    expect(taskStore.getById('CP1').amount).toBe(100)
    expect(taskStore.getById('CP1').extra.competitionId).toBe(2)
    expect(taskStore.getById('SP1').amount).toBe(2999)
    expect(taskStore.getById('SP1').extra.orderNo).toBe('SP001')
  })

  it('批量中任一任务状态非法时整组拒绝，没有任务被改动', async () => {
    // SP2 是 shipped，不能 pay
    const res = await taskStore.executeBatch(['BK1', 'SP2'], 'pay')
    expect(res.success).toBe(false)
    expect(taskStore.getById('BK1').status).toBe('pending_payment')
    expect(taskStore.getById('SP2').status).toBe('shipped')
  })

  it('批量请求中途失败时整组回滚到操作前', async () => {
    let call = 0
    taskStore.setTransport(() => {
      call += 1
      // 第 3 条失败
      return Promise.resolve(call === 3 ? { success: false, message: '部分失败' } : { success: true })
    })
    const res = await taskStore.executeBatch(['BK1', 'CR1', 'CP1'], 'pay')
    expect(res.success).toBe(false)
    expect(['BK1', 'CR1', 'CP1'].map(id => taskStore.getById(id).status)).toEqual([
      'pending_payment',
      'pending_payment',
      'pending_payment'
    ])
  })

  it('批量确认收货与空输入处理', async () => {
    expect((await taskStore.executeBatch([], 'confirm')).success).toBe(false)
    const res = await taskStore.executeBatch(['SP2'], 'confirm')
    expect(res.success).toBe(true)
    expect(taskStore.getById('SP2').status).toBe('completed')
  })
})

describe('taskStore - 再次打开与空列表', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('再次打开任务中心时从 localStorage 恢复最新数据', async () => {
    reset()
    await taskStore.executeAction('BK1', 'pay')
    await taskStore.executeAction('SP2', 'confirm')

    // 模拟重新进入：重新执行初始化
    const restored = taskStore.init()
    expect(restored.find(t => t.id === 'BK1').status).toBe('upcoming')
    expect(restored.find(t => t.id === 'SP2').status).toBe('completed')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).find(t => t.id === 'BK1').status).toBe('upcoming')
  })

  it('空列表：清空后待处理与历史均为空；新增任务后立即可见', () => {
    taskStore.__clear()
    expect(taskStore.getAll()).toEqual([])
    expect(taskStore.getPendingCount()).toBe(0)
    expect(taskStore.getHistoryCount()).toBe(0)
    expect(taskStore.getByStatus('pending')).toEqual([])
    expect(taskStore.getByStatus('completed')).toEqual([])

    taskStore.add({ type: 'booking', title: '新预约', amount: 80, status: 'pending_payment', extra: {} })
    expect(taskStore.getAll()).toHaveLength(1)
    expect(taskStore.getPendingCount()).toBe(1)
  })

  it('存储损坏时回退到默认数据而不崩溃', () => {
    localStorage.setItem(STORAGE_KEY, '{bad json')
    const tasks = taskStore.init()
    expect(Array.isArray(tasks)).toBe(true)
    expect(tasks.length).toBeGreaterThan(0)
  })
})
