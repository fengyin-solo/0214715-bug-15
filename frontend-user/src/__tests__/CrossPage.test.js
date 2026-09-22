/**
 * 跨页面联动测试（任务中心 → 业务页）
 *
 * 覆盖场景：
 * - 任务中心带 query 跳转到球桌/课程/赛事/商城页时，业务页定位到对应业务数据
 * - 业务页提交（预约/报名/下单）的重复点击保护，不会整组重复创建任务
 * - 新增任务金额/类型/业务数据与提交内容对应，并出现在任务中心
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Tables from '../views/Tables.vue'
import Courses from '../views/Courses.vue'
import Competitions from '../views/Competitions.vue'
import Shop from '../views/Shop.vue'
import { taskStore } from '../utils/taskStore'
import { authState } from '../utils/auth'

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

let activeWrapper = null
function mountView(Component, query = {}) {
  const router = { push: vi.fn(), query }
  const wrapper = mount(Component, {
    attachTo: document.body,
    global: { mocks: { $router: router, $route: { query } } }
  })
  activeWrapper = wrapper
  return { wrapper, router }
}
function unmount() {
  if (activeWrapper) { activeWrapper.unmount(); activeWrapper = null }
  document.body.innerHTML = ''
}

beforeEach(() => {
  storageMock.clear()
  taskStore.reset([])
  authState.isLoggedIn = true
  authState.token = 'test-token'
})
afterEach(() => {
  unmount()
  authState.isLoggedIn = false
  authState.token = null
})

describe('任务中心 → 球桌页联动', () => {
  it('tableId + rebook 定位到对应球桌并直接打开预约弹窗', () => {
    const { wrapper } = mountView(Tables, { tableId: '3', action: 'rebook' })
    expect(wrapper.vm.selectedType).toBe('pool')
    expect(wrapper.vm.showBookingModal).toBe(true)
    expect(wrapper.vm.selectedTable.id).toBe(3)
  })

  it('tableId（仅查看）切换类型筛选但不弹窗', () => {
    const { wrapper } = mountView(Tables, { tableId: '1', action: 'view' })
    expect(wrapper.vm.selectedType).toBe('snooker')
    expect(wrapper.vm.showBookingModal).toBe(false)
  })

  it('预约提交进行中再次触发 confirmBooking 不会重复创建任务', async () => {
    const { wrapper } = mountView(Tables)
    wrapper.vm.openBooking(wrapper.vm.tables.find(t => t.id === 3))
    const p1 = wrapper.vm.confirmBooking()
    // 在 1.5s 请求窗口内再次触发（重复操作）
    await wrapper.vm.confirmBooking()
    await p1
    await wrapper.vm.$nextTick()

    const bookings = taskStore.getAll().filter(t => t.type === 'booking')
    expect(bookings.length).toBe(1)
    // 金额 = 60元 × 2小时
    expect(bookings[0].amount).toBe(120)
    expect(bookings[0].extra.tableId).toBe(3)
  })
})

describe('任务中心 → 课程页联动', () => {
  it('courseId 打开对应课程详情', () => {
    const { wrapper } = mountView(Courses, { courseId: '2', action: 'view' })
    expect(wrapper.vm.showDetailModal).toBe(true)
    expect(wrapper.vm.selectedCourse.id).toBe(2)
  })

  it('重复提交报名只生成一条课程任务，金额与课程价格对应', async () => {
    const { wrapper } = mountView(Courses)
    wrapper.vm.enrollCourse = wrapper.vm.courses.find(c => c.id === 1)
    const p1 = wrapper.vm.confirmEnroll()
    await wrapper.vm.confirmEnroll()
    await p1
    await wrapper.vm.$nextTick()

    const courses = taskStore.getAll().filter(t => t.type === 'course')
    expect(courses.length).toBe(1)
    expect(courses[0].amount).toBe(599)
    expect(courses[0].extra.courseId).toBe(1)
  })
})

describe('任务中心 → 赛事页联动', () => {
  it('competitionId 定位到进行中赛事并打开直播弹窗', () => {
    const { wrapper } = mountView(Competitions, { competitionId: '2', action: 'view' })
    expect(wrapper.vm.activeTab).toBe('ongoing')
    expect(wrapper.vm.showLiveModal).toBe(true)
    expect(wrapper.vm.selectedComp.id).toBe(2)
  })

  it('重复提交报名只生成一条赛事任务，报名费对应', async () => {
    const { wrapper } = mountView(Competitions)
    wrapper.vm.selectedComp = wrapper.vm.competitions.find(c => c.id === 1)
    const p1 = wrapper.vm.confirmJoin()
    await wrapper.vm.confirmJoin()
    await p1
    await wrapper.vm.$nextTick()

    const comps = taskStore.getAll().filter(t => t.type === 'competition')
    expect(comps.length).toBe(1)
    expect(comps[0].amount).toBe(200)
    expect(comps[0].extra.competitionId).toBe(1)
  })
})

describe('任务中心 → 商城页联动与重复下单', () => {
  it('rebuy + orderNo 把该任务对应商品重新加入购物车', () => {
    // 准备一条已完成订单任务
    taskStore.add({
      type: 'order',
      title: '巧克粉',
      subtitle: '已完成',
      amount: 39,
      status: 'completed',
      extra: {
        orderNo: 'SP777',
        items: [{ id: 5, name: 'Master专业巧克粉', qty: 2, price: 39 }],
        createTime: '2026-10-01 10:00'
      }
    })
    const { wrapper } = mountView(Shop, { orderNo: 'SP777', action: 'rebuy' })
    expect(wrapper.vm.cart.length).toBe(1)
    expect(wrapper.vm.cart[0].id).toBe(5)
    expect(wrapper.vm.cart[0].qty).toBe(2)
    expect(wrapper.vm.showCartModal).toBe(true)
  })

  it('view + orderNo 打开订单弹窗并展示该订单状态', async () => {
    taskStore.add({
      type: 'order',
      title: '球杆',
      subtitle: '已发货',
      amount: 2999,
      status: 'shipped',
      extra: { orderNo: 'SP888', items: [{ id: 1, name: 'LP球杆', qty: 1 }], createTime: '2026-10-02 10:00' }
    })
    const { wrapper } = mountView(Shop, { orderNo: 'SP888', action: 'view' })
    expect(wrapper.vm.showOrdersModal).toBe(true)
    expect(wrapper.vm.orders[0].orderNo).toBe('SP888')
    expect(wrapper.vm.orders[0].status).toBe('shipped')
    await wrapper.vm.$nextTick()
    // 弹窗 teleport 到 body，状态文案正确
    expect(document.body.textContent).toContain('已发货')
  })

  it('结算进行中重复确认不会重复下单；空购物车不能结算', async () => {
    const { wrapper } = mountView(Shop)
    wrapper.vm.addToCart(wrapper.vm.products.find(p => p.id === 5), 1)
    const p1 = wrapper.vm.confirmCheckout()
    await wrapper.vm.confirmCheckout()
    await p1
    await wrapper.vm.$nextTick()

    const orders = taskStore.getAll().filter(t => t.type === 'order')
    expect(orders.length).toBe(1)
    expect(orders[0].amount).toBe(39)
    expect(orders[0].status).toBe('pending_shipment')

    // 购物车已清空，再次结算被空购物车保护拦截（异步函数返回 undefined 结果）
    expect(await wrapper.vm.confirmCheckout()).toBeUndefined()
    expect(taskStore.getAll().filter(t => t.type === 'order').length).toBe(1)
  })
})
