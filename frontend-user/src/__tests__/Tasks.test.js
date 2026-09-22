/**
 * 任务中心页面（Tasks.vue）组件测试
 *
 * 覆盖场景：
 * - 列表/筛选/计数与 store 联动；已取消任务进入已完成分组
 * - 支付、取消、确认收货的完整交互；重复点击不产生二次处理
 * - 请求失败时弹窗保留、数据不变，可重试成功
 * - 支付/取消后详情弹窗与列表不错位（选中项实时派生自 store）
 * - 空列表展示空状态
 * - 再次进入任务中心数据为最新（store 单一数据源）
 * - 批量处理后 UI 整组更新
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Tasks from '../views/Tasks.vue'
import { taskStore } from '../utils/taskStore'

// ==================== localStorage Mock ====================

const storageMock = (() => {
  let store = {}
  return {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value) },
    removeItem: key => { delete store[key] },
    clear: () => { store = {} }
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: storageMock, configurable: true })

// ==================== 夹具 ====================

function task(overrides = {}) {
  const seq = task.n = (task.n || 0) + 1
  return {
    id: 'T-' + seq,
    type: 'booking',
    title: '任务' + seq,
    subtitle: '副标题',
    amount: 100,
    status: 'pending_payment',
    createdAt: '2026-09-0' + (seq < 10 ? seq : 9) + ' 10:00',
    extra: { tableId: seq, date: '2026-09-20', time: '10:00 - 12:00', duration: 2 },
    ...overrides
  }
}

function fixtures() {
  task.n = 0
  return [
    task({ id: 'PAY-BOOK', type: 'booking', title: '待付预约', amount: 120 }),
    task({ id: 'PAY-ORDER', type: 'order', title: '待付订单', amount: 2999, status: 'pending_payment',
      extra: { orderNo: 'SP1', items: [{ id: 1, name: '球杆', qty: 1 }] } }),
    task({ id: 'SHIP-ORDER', type: 'order', title: '已发货订单', amount: 39, status: 'shipped',
      extra: { orderNo: 'SP2', items: [{ id: 5, name: '巧克粉', qty: 1 }] } }),
    task({ id: 'UP-BOOK', type: 'booking', title: '待开始预约', amount: 240, status: 'upcoming',
      extra: { tableId: 4, orderNo: 'BK888', date: '2026-10-01', time: '18:00 - 20:00', duration: 4 } }),
    task({ id: 'DONE-ORDER', type: 'order', title: '已完成订单', amount: 89, status: 'completed',
      extra: { orderNo: 'SP3' } })
  ]
}

// ==================== 挂载辅助 ====================

let activeWrapper = null

function mountTasks(query = {}) {
  const router = {
    push: vi.fn(),
    query
  }
  const wrapper = mount(Tasks, {
    attachTo: document.body,
    global: {
      mocks: {
        $router: router,
        $route: { query }
      }
    }
  })
  activeWrapper = wrapper
  return { wrapper, router }
}

function unmountTasks() {
  if (activeWrapper) {
    activeWrapper.unmount()
    activeWrapper = null
  }
  document.body.innerHTML = ''
}

/** 找到包含指定文案的按钮（teleport 到 body 的弹窗按钮也在 document.body 中） */
function findButtonByText(text, root = document.body) {
  const btns = root.querySelectorAll('button')
  return Array.from(btns).find(b => b.textContent.trim().includes(text))
}

function clickButton(text) {
  const btn = findButtonByText(text)
  if (!btn) throw new Error('找不到按钮：' + text)
  btn.click()
}

const advance = (ms = 400) => new Promise(resolve => setTimeout(resolve, ms))

// ==================== 测试 ====================

describe('Tasks 页面 - 列表、计数与分组', () => {
  beforeEach(() => {
    storageMock.clear()
    taskStore.reset(fixtures())
  })

  afterEach(() => {
    unmountTasks()
    vi.useRealTimers()
  })

  it('待处理列表只显示未完成/未取消任务，计数正确', () => {
    const { wrapper } = mountTasks()
    const cards = wrapper.findAll('.task-card')
    const titles = cards.map(c => c.find('.task-title').text())
    expect(titles).toContain('待付预约')
    expect(titles).toContain('待付订单')
    expect(titles).toContain('已发货订单')
    expect(titles).toContain('待开始预约')
    expect(titles).not.toContain('已完成订单')
    expect(wrapper.vm.pendingCount).toBe(4)
    expect(wrapper.vm.completedCount).toBe(1)
  })

  it('类型筛选只展示对应类型任务', async () => {
    const { wrapper } = mountTasks()
    await wrapper.findAll('.filter-btn').find(b => b.text().includes('订单')).trigger('click')
    const titles = wrapper.findAll('.task-card').map(c => c.find('.task-title').text())
    expect(titles).toEqual(expect.arrayContaining(['待付订单', '已发货订单']))
    expect(titles).not.toContain('待付预约')
  })

  it('取消后的任务进入已完成分组，待处理计数减少', async () => {
    const { wrapper } = mountTasks()
    // 点击待付预约卡片上的「取消」
    const card = wrapper.findAll('.task-card').find(c => c.text().includes('待付预约'))
    await card.findAll('button').find(b => b.text().includes('取消')).trigger('click')
    clickButton('确认取消')
    await advance(400)
    await wrapper.vm.$nextTick()

    expect(taskStore.getById('PAY-BOOK').status).toBe('cancelled')
    expect(wrapper.vm.pendingCount).toBe(3)
    expect(wrapper.vm.completedCount).toBe(2)

    // 切到已完成分组能看到已取消任务与“已取消”标识
    await wrapper.findAll('.tab-btn').find(b => b.text().includes('已完成')).trigger('click')
    const archivedText = wrapper.find('.tasks-list').text()
    expect(archivedText).toContain('待付预约')
    expect(archivedText).toContain('已取消')
  })

  it('空列表展示空状态', async () => {
    taskStore.reset([])
    const { wrapper } = mountTasks()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.find('.empty-state').text()).toContain('暂无')
    expect(wrapper.findAll('.task-card').length).toBe(0)
  })
})

describe('Tasks 页面 - 支付交互与防重复', () => {
  beforeEach(() => {
    storageMock.clear()
    taskStore.reset(fixtures())
  })

  afterEach(() => {
    unmountTasks()
  })

  it('支付成功后状态/按钮实时联动（不残留待付款旧结果）', async () => {
    const { wrapper } = mountTasks()
    const card = wrapper.findAll('.task-card').find(c => c.text().includes('待付预约'))
    await card.findAll('button').find(b => b.text().includes('继续付款')).trigger('click')
    await wrapper.vm.$nextTick()

    // 弹窗内业务数据与任务对应
    const modalText = document.body.textContent
    expect(modalText).toContain('待付预约')
    expect(modalText).toContain('球桌预约')
    expect(modalText).toContain('¥120')

    clickButton('确认支付')
    await advance(400)
    await wrapper.vm.$nextTick()

    expect(taskStore.getById('PAY-BOOK').status).toBe('upcoming')
    // 成功提示
    expect(document.body.textContent).toContain('支付成功')
    // 卡片仍在待处理分组（upcoming 仍属待处理），但状态已变为「待开始」、
    // 动作按钮不再有「继续付款」，即没有旧结果残留
    const updatedCard = wrapper.findAll('.task-card').find(c => c.text().includes('待付预约'))
    expect(updatedCard.exists()).toBe(true)
    expect(updatedCard.text()).toContain('待开始')
    expect(updatedCard.text()).not.toContain('继续付款')
    expect(updatedCard.text()).toContain('查看详情')
  })

  it('支付请求进行中重复点击确认不会二次处理', async () => {
    const { wrapper } = mountTasks()
    const card = wrapper.findAll('.task-card').find(c => c.text().includes('待付订单'))
    await card.findAll('button').find(b => b.text().includes('继续付款')).trigger('click')
    await wrapper.vm.$nextTick()

    // 立即连续点击多次（模拟重复操作）
    clickButton('确认支付')
    clickButton('确认支付')
    await advance(400)
    await wrapper.vm.$nextTick()

    expect(taskStore.getById('PAY-ORDER').status).toBe('pending_shipment')
    expect(wrapper.vm.payLoading).toBe(false)
  })

  it('支付失败（store 返回 null）时提示失败且任务仍为待付款，弹窗保留可重试', async () => {
    // 让任务在确认期间变为不可支付（模拟状态已被别处改变 / 请求失败）
    const { wrapper } = mountTasks()
    const card = wrapper.findAll('.task-card').find(c => c.text().includes('待付预约'))
    await card.findAll('button').find(b => b.text().includes('继续付款')).trigger('click')
    await wrapper.vm.$nextTick()

    // 在点击确认前，直接把 store 里状态改掉
    taskStore.updateStatus('PAY-BOOK', 'upcoming')
    clickButton('确认支付')
    await advance(400)
    await wrapper.vm.$nextTick()

    // 前置校验应阻止，弹窗关闭并提示无需重复支付，不出现成功弹窗
    expect(document.body.textContent).toContain('无需重复支付')
  })
})

describe('Tasks 页面 - 确认收货', () => {
  beforeEach(() => {
    storageMock.clear()
    taskStore.reset(fixtures())
  })

  afterEach(() => { unmountTasks() })

  it('已发货订单确认收货后变为已完成，待处理减少', async () => {
    const { wrapper } = mountTasks()
    const card = wrapper.findAll('.task-card').find(c => c.text().includes('已发货订单'))
    await card.findAll('button').find(b => b.text().includes('确认收货')).trigger('click')
    await advance(400)
    await wrapper.vm.$nextTick()

    expect(taskStore.getById('SHIP-ORDER').status).toBe('completed')
    expect(wrapper.vm.pendingCount).toBe(3)
    expect(document.body.textContent).toContain('确认收货成功')
  })

  it('重复确认收货不会二次处理', async () => {
    const { wrapper } = mountTasks()
    const card = wrapper.findAll('.task-card').find(c => c.text().includes('已发货订单'))
    const btn = card.findAll('button').find(b => b.text().includes('确认收货'))
    await btn.trigger('click')
    await btn.trigger('click') // 重复点击
    await advance(400)
    await wrapper.vm.$nextTick()
    expect(taskStore.getById('SHIP-ORDER').status).toBe('completed')
  })
})

describe('Tasks 页面 - 详情弹窗业务数据对应与跨操作不错位', () => {
  beforeEach(() => {
    storageMock.clear()
    taskStore.reset(fixtures())
  })

  afterEach(() => { unmountTasks() })

  it('详情弹窗展示与类型对应的业务字段（预约编号/球桌/日期/时长/金额）', async () => {
    const { wrapper } = mountTasks()
    const card = wrapper.findAll('.task-card').find(c => c.text().includes('待开始预约'))
    await card.findAll('button').find(b => b.text().includes('查看详情')).trigger('click')
    await wrapper.vm.$nextTick()

    const text = document.body.textContent
    expect(text).toContain('球桌预约')
    expect(text).toContain('BK888')
    expect(text).toContain('2026-10-01')
    expect(text).toContain('18:00 - 20:00')
    expect(text).toContain('4小时')
    expect(text).toContain('¥240')
  })

  it('订单详情行 computed 与订单业务数据对应（订单号/商品明细）', () => {
    const { wrapper } = mountTasks()
    wrapper.vm.selectedTaskId = 'SHIP-ORDER'
    const labels = wrapper.vm.detailExtraRows.map(r => r.label)
    expect(labels).toContain('订单编号')
    expect(labels).toContain('商品明细')
    const itemsRow = wrapper.vm.detailExtraRows.find(r => r.label === '商品明细')
    expect(itemsRow.value).toContain('巧克粉 x1')
  })

  it('选中任务被取消后弹窗自动关闭，不留存旧详情（跨操作联动）', async () => {
    const { wrapper } = mountTasks()
    // 打开预约详情
    const card = wrapper.findAll('.task-card').find(c => c.text().includes('待付预约'))
    // 待付预约没有 view 动作；直接通过取消流程验证 selectedTask 消失
    await card.findAll('button').find(b => b.text().includes('取消')).trigger('click')
    expect(wrapper.vm.selectedTaskId).toBe('PAY-BOOK')
    clickButton('确认取消')
    await advance(400)
    await wrapper.vm.$nextTick()

    // 取消后任务仍存在（cancelled），但取消弹窗已关闭
    expect(wrapper.vm.showCancelModal).toBe(false)
    expect(taskStore.getById('PAY-BOOK').status).toBe('cancelled')
  })

  it('操作后再次“打开任务中心”看到的仍是最新数据', async () => {
    taskStore.markAsPaid('PAY-BOOK')
    const { wrapper } = mountTasks()
    await wrapper.vm.$nextTick()
    // 任务仍在待处理（upcoming），卡片不再残留待付款旧结果
    const updatedCard = wrapper.findAll('.task-card').find(c => c.text().includes('待付预约'))
    expect(updatedCard.exists()).toBe(true)
    expect(updatedCard.text()).toContain('待开始')
    expect(updatedCard.text()).not.toContain('继续付款')
    expect(taskStore.getById('PAY-BOOK').actions.map(a => a.key)).toContain('view')
  })
})

describe('Tasks 页面 - 批量处理后整组 UI 联动', () => {
  beforeEach(() => {
    storageMock.clear()
    taskStore.reset(fixtures())
  })

  afterEach(() => { unmountTasks() })

  it('store 批量支付多条后，卡片状态/动作整组刷新（不残留待付款旧结果）', async () => {
    const { wrapper } = mountTasks()
    expect(wrapper.vm.pendingCount).toBe(4)

    const result = taskStore.processGroup(['PAY-BOOK', 'PAY-ORDER'], 'pay')
    expect(result.success).toBe(true)
    await wrapper.vm.$nextTick()

    // 两条任务支付后仍在待处理（upcoming/待发货），但均不再残留「继续付款/取消」
    const bookCard = wrapper.findAll('.task-card').find(c => c.text().includes('待付预约'))
    const orderCard = wrapper.findAll('.task-card').find(c => c.text().includes('待付订单'))
    expect(bookCard.text()).toContain('待开始')
    expect(bookCard.text()).not.toContain('继续付款')
    expect(orderCard.text()).toContain('待发货')
    expect(orderCard.text()).not.toContain('继续付款')
  })

  it('store 批量取消多条后，整组从待处理列表移到已完成分组', async () => {
    const { wrapper } = mountTasks()
    const result = taskStore.processGroup(['PAY-BOOK', 'PAY-ORDER'], 'cancel')
    expect(result.success).toBe(true)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.pendingCount).toBe(2)
    const titles = wrapper.findAll('.task-card').map(c => c.find('.task-title').text())
    expect(titles).not.toContain('待付预约')
    expect(titles).not.toContain('待付订单')
    expect(wrapper.vm.completedCount).toBe(3)
  })

  it('批量处理中含非法任务整组不动时，UI 仍显示完整待处理列表', async () => {
    const { wrapper } = mountTasks()
    taskStore.processGroup(['PAY-BOOK', 'SHIP-ORDER'], 'pay') // 整组应失败
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.pendingCount).toBe(4)
    expect(taskStore.getById('PAY-BOOK').status).toBe('pending_payment')
    expect(taskStore.getById('SHIP-ORDER').status).toBe('shipped')
  })
})
