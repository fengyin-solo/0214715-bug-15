/**
 * NavBar 跨页面联动测试：
 * 业务页面/任务中心对任务做支付、取消、新增后，导航栏待处理角标实时更新。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NavBar from '../components/NavBar.vue'
import taskStore from '../utils/taskStore'

function mountBar(isLoggedIn = true) {
  return mount(NavBar, {
    props: { isLoggedIn, userName: '张' },
    global: {
      stubs: { RouterLink: { template: '<a><slot /></a>' } }
    }
  })
}

describe('NavBar 待处理任务角标', () => {
  beforeEach(() => {
    localStorage.clear()
    taskStore.setTransport(() => Promise.resolve({ success: true }))
    taskStore.__reset([
      { id: 'A', type: 'booking', title: 'a', subtitle: '', amount: 10, status: 'pending_payment', createdAt: '2026-03-01 10:00', extra: {} },
      { id: 'B', type: 'order', title: 'b', subtitle: '', amount: 20, status: 'shipped', createdAt: '2026-03-01 09:00', extra: {} },
      { id: 'C', type: 'course', title: 'c', subtitle: '', amount: 30, status: 'completed', createdAt: '2026-02-28 10:00', extra: {} }
    ])
  })

  it('未登录不显示角标', () => {
    const wrapper = mountBar(false)
    expect(wrapper.find('.task-badge').exists()).toBe(false)
  })

  it('登录后显示待处理数量（2），支付后角标数量不变（upcoming 仍待处理），取消后减 1', async () => {
    const wrapper = mountBar(true)
    expect(wrapper.find('.task-badge').text()).toBe('2')

    await taskStore.executeAction('A', 'pay')
    await nextTick()
    expect(wrapper.find('.task-badge').text()).toBe('2')

    await taskStore.executeAction('A', 'cancel')
    // A 已经是 upcoming，仍允许取消（upcoming 在取消白名单内）
    await nextTick()
    expect(wrapper.find('.task-badge').text()).toBe('1')
  })

  it('确认收货后角标减 1', async () => {
    const wrapper = mountBar(true)
    await taskStore.executeAction('B', 'confirm')
    await nextTick()
    expect(wrapper.find('.task-badge').text()).toBe('1')
  })

  it('业务页面新增待付款任务后角标立即增加（跨页面联动）', async () => {
    const wrapper = mountBar(true)
    expect(wrapper.find('.task-badge').text()).toBe('2')
    taskStore.addBookingTask(
      { id: 9, name: '9号球桌', type: '斯诺克', price: 80 },
      { orderNo: 'BK9', date: '2026-05-01', time: '10:00 - 12:00', duration: 2 }
    )
    await nextTick()
    expect(wrapper.find('.task-badge').text()).toBe('3')
  })

  it('全部处理完后角标消失', async () => {
    const wrapper = mountBar(true)
    await taskStore.executeAction('A', 'cancel')
    await taskStore.executeAction('B', 'confirm')
    await nextTick()
    expect(wrapper.find('.task-badge').exists()).toBe(false)
  })
})
