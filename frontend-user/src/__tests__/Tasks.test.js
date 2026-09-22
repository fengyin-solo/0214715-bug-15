/**
 * 任务中心页面（Tasks.vue）组件测试
 *
 * 覆盖：
 * - 待处理列表与详情页不错位（选中任务实时取数，无旧快照残留）
 * - 支付/取消/确认收货成功后列表、角标、Tab 数量联动
 * - 重复点击（loading 期间确认按钮禁用，动作只执行一次）
 * - 请求失败（弹窗保留、错误提示、数据不变、可重试）
 * - 空列表展示
 * - 再次打开任务中心（mounted 重新同步）
 * - 动作按钮、金额、类型与业务数据对应
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import Tasks from '../views/Tasks.vue'
import taskStore from '../utils/taskStore'

// ---------- Modal / Toast 轻量桩（Teleport 内容直接渲染在 document.body） ----------
const ModalStub = {
  name: 'Modal',
  props: {
    modelValue: Boolean,
    title: String,
    subtitle: String,
    icon: String,
    iconType: String,
    size: String,
    showFooter: { type: Boolean, default: true },
    showCancel: { type: Boolean, default: true },
    cancelText: String,
    confirmText: String,
    confirmType: String,
    loading: Boolean
  },
  emits: ['update:modelValue', 'confirm', 'cancel'],
  template: `
    <div v-if="modelValue" class="modal-stub" :data-title="title">
      <h3>{{ title }}</h3>
      <p class="modal-subtitle">{{ subtitle }}</p>
      <slot></slot>
      <div v-if="showFooter" class="modal-footer">
        <button v-if="showCancel" class="stub-cancel" @click="$emit('cancel'); $emit('update:modelValue', false)">{{ cancelText || '取消' }}</button>
        <button class="stub-confirm" :class="confirmType" :disabled="loading" @click="$emit('confirm')">
          <span v-if="loading" class="loading"></span>{{ confirmText || '确认' }}
        </button>
      </div>
    </div>
  `
}

const ToastStub = {
  name: 'Toast',
  props: ['modelValue', 'type', 'title', 'message'],
  template: `<div v-if="modelValue" class="toast-stub" :data-type="type">{{ title }} {{ message }}</div>`
}

function makeSeed() {
  return [
    {
      id: 'BK1', type: 'booking', title: '3号球桌 - 美式九球', subtitle: '2026-03-02 14:00 - 16:00',
      amount: 120, status: 'pending_payment', createdAt: '2026-03-01 10:00',
      extra: { tableId: 3, date: '2026-03-02', time: '14:00 - 16:00', duration: 2, orderNo: 'BK001' }
    },
    {
      id: 'SP1', type: 'order', title: 'LP专业斯诺克球杆', subtitle: '待发货',
      amount: 2999, status: 'shipped', createdAt: '2026-03-01 09:00',
      extra: { orderNo: 'SP001', items: [{ id: 1, name: 'LP专业斯诺克球杆', icon: '🏏', qty: 1 }], createTime: '2026-03-01 09:00' }
    },
    {
      id: 'SP2', type: 'order', title: '星牌比赛用球', subtitle: '已完成',
      amount: 1299, status: 'completed', createdAt: '2026-02-28 10:00',
      extra: { orderNo: 'SP002' }
    },
    {
      id: 'CR1', type: 'course', title: '台球入门基础课', subtitle: '已取消',
      amount: 599, status: 'cancelled', createdAt: '2026-02-27 10:00',
      extra: { courseId: 1, coach: '张明' }
    }
  ]
}

function mountPage() {
  return mount(Tasks, {
    global: {
      stubs: { Modal: ModalStub, Toast: ToastStub },
      mocks: {
        $router: { push: vi.fn() }
      }
    }
  })
}


function modalEl(wrapper, title) {
  const root = wrapper.element
  if (title) {
    return [...root.querySelectorAll('.modal-stub')].find(m => m.dataset.title === title)
  }
  return root.querySelector('.modal-stub')
}

function clickAction(wrapper, taskId, label) {
  const card = wrapper.findAll('.task-card').find(c => c.text().includes(taskStore.getById(taskId).title))
  const btn = card.findAll('.action-btn').find(b => b.text().includes(label))
  expect(btn).toBeTruthy()
  btn.trigger('click')
  return btn
}

describe('Tasks.vue 任务中心页面', () => {
  beforeEach(() => {
    localStorage.clear()
    taskStore.setTransport(() => Promise.resolve({ success: true }))
    taskStore.__reset(makeSeed())
  })

  it('初始展示待处理任务，数量角标正确，已完成/已取消不出现在待处理', () => {
    const wrapper = mountPage()
    expect(wrapper.findAll('.task-card')).toHaveLength(2)
    expect(wrapper.find('.stat-item.pending .stat-value').text()).toBe('2')
    expect(wrapper.find('.stat-item.completed .stat-value').text()).toBe('2')
  })

  it('动作按钮与任务类型/状态对应：预约有付款/取消，已发货订单有确认收货', () => {
    const wrapper = mountPage()
    const bookingCard = wrapper.findAll('.task-card').find(c => c.text().includes('3号球桌'))
    const orderCard = wrapper.findAll('.task-card').find(c => c.text().includes('LP专业斯诺克'))
    expect(bookingCard.text()).toContain('继续付款')
    expect(bookingCard.text()).toContain('取消')
    expect(orderCard.text()).toContain('确认收货')
    expect(orderCard.text()).toContain('查看物流')
  })

  it('支付成功：任务状态迁移、金额/业务数据保留，列表状态文本联动更新', async () => {
    const wrapper = mountPage()
    clickAction(wrapper, 'BK1', '继续付款')
    await nextTick()

    // 支付弹窗展示的是该任务的金额与类型
    const payModal = modalEl(wrapper, '确认付款')
    expect(payModal.textContent).toContain('¥120')
    expect(payModal.textContent).toContain('球桌预约')

    payModal.querySelector('.stub-confirm').click()
    await flushPromises()
    await nextTick()

    expect(taskStore.getById('BK1').status).toBe('upcoming')
    expect(taskStore.getById('BK1').amount).toBe(120)
    expect(taskStore.getById('BK1').extra.tableId).toBe(3)
    // 该卡片状态由“待付款”变为“待开始”，动作变为 查看详情/再次预约（不再有付款按钮）
    const card = wrapper.findAll('.task-card').find(c => c.text().includes('3号球桌'))
    expect(card.text()).toContain('待开始')
    expect(card.text()).not.toContain('继续付款')
  })

  it('支付期间确认按钮禁用，重复点击只执行一次', async () => {
    const transport = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 20)))
    taskStore.setTransport(transport)

    const wrapper = mountPage()
    clickAction(wrapper, 'BK1', '继续付款')
    await nextTick()

    const confirmBtn = () => {
      const modal = modalEl(wrapper, '确认付款')
      return modal ? modal.querySelector('.stub-confirm') : null
    }
    expect(confirmBtn()).not.toBeNull()
    expect(confirmBtn().disabled).toBe(false)
    confirmBtn().click()
    await nextTick()
    expect(confirmBtn().disabled).toBe(true)
    confirmBtn().click()
    confirmBtn().click()

    await vi.waitFor(() => expect(confirmBtn()).toBeNull())
    expect(transport).toHaveBeenCalledTimes(1)
    expect(taskStore.getById('BK1').status).toBe('upcoming')
    wrapper.unmount()
  })

  it('请求失败：弹窗保留、错误展示、任务不变；恢复后重试成功', async () => {
    taskStore.setTransport(() => Promise.resolve({ success: false, message: '余额不足' }))
    const wrapper = mountPage()
    clickAction(wrapper, 'BK1', '继续付款')
    await nextTick()

    modalEl(wrapper, '确认付款').querySelector('.stub-confirm').click()
    await flushPromises()
    await nextTick()

    // 支付弹窗仍在，显示错误
    const payModal = modalEl(wrapper, '确认付款')
    expect(payModal).not.toBeUndefined()
    expect(payModal.querySelector('.action-error').textContent).toContain('余额不足')
    // 数据未变
    expect(taskStore.getById('BK1').status).toBe('pending_payment')

    // 恢复传输层后重试
    taskStore.setTransport(() => Promise.resolve({ success: true }))
    payModal.querySelector('.stub-confirm').click()
    await flushPromises()
    await nextTick()
    expect(taskStore.getById('BK1').status).toBe('upcoming')
    expect(modalEl(wrapper, '确认付款')).toBeUndefined()
  })

  it('取消任务：迁移到已取消并出现在已完成列表，不再残留于待处理', async () => {
    const wrapper = mountPage()
    clickAction(wrapper, 'BK1', '取消')
    await nextTick()

    modalEl(wrapper, '确认取消').querySelector('.stub-confirm').click()
    await flushPromises()
    await nextTick()

    expect(taskStore.getById('BK1').status).toBe('cancelled')
    expect(wrapper.find('.stat-item.pending .stat-value').text()).toBe('1')

    wrapper.findAll('.tab-btn')[1].trigger('click')
    await nextTick()
    const texts = wrapper.findAll('.task-card').map(c => c.text())
    expect(texts.some(t => t.includes('3号球桌') && t.includes('已取消'))).toBe(true)
  })

  it('确认收货：shipped 订单进入已完成，金额保留', async () => {
    const wrapper = mountPage()
    clickAction(wrapper, 'SP1', '确认收货')
    await nextTick()
    const modal = modalEl(wrapper, '确认收货')
    expect(modal.textContent).toContain('¥2,999')

    modal.querySelector('.stub-confirm').click()
    await flushPromises()
    await nextTick()

    expect(taskStore.getById('SP1').status).toBe('completed')
    expect(taskStore.getById('SP1').amount).toBe(2999)
    // 待处理中不再有该订单，历史数量增加
    expect(wrapper.find('.stat-item.pending .stat-value').text()).toBe('1')
    expect(wrapper.findAll('.task-card').some(c => c.text().includes('LP专业斯诺克'))).toBe(false)
  })

  it('详情弹窗展示与该任务类型对应的业务数据（不与其它任务错位）', async () => {
    const wrapper = mountPage()
    // 已发货订单：查看物流（view）
    clickAction(wrapper, 'SP1', '查看物流')
    await nextTick()
    const detail = modalEl(wrapper, '商城订单详情')
    expect(detail.textContent).toContain('SP001')
    expect(detail.textContent).toContain('LP专业斯诺克球杆')
    expect(detail.textContent).toContain('¥2,999')
    expect(detail.textContent).not.toContain('BK001')
  })

  it('任务被处理后列表实时刷新，不残留旧状态', async () => {
    const wrapper = mountPage()
    clickAction(wrapper, 'BK1', '继续付款')
    await nextTick()
    modalEl(wrapper, '确认付款').querySelector('.stub-confirm').click()
    await flushPromises()
    await nextTick()

    // 支付后卡片仍在待处理，但状态文本已由待付款变为待开始，无旧动作残留
    const card = wrapper.findAll('.task-card').find(c => c.text().includes('3号球桌'))
    expect(card).toBeTruthy()
    expect(card.text()).toContain('待开始')
    expect(card.text()).not.toContain('待付款')
  })

  it('再次打开任务中心：从 localStorage 同步最新状态', async () => {
    // 先在"上一次访问"完成支付并持久化
    let wrapper = mountPage()
    clickAction(wrapper, 'BK1', '继续付款')
    await nextTick()
    modalEl(wrapper, '确认付款').querySelector('.stub-confirm').click()
    await flushPromises()
    wrapper.unmount()

    // 重新挂载（再次打开）：状态为 upcoming，待付款按钮不再出现
    wrapper = mountPage()
    expect(taskStore.getById('BK1').status).toBe('upcoming')
    const card = wrapper.findAll('.task-card').find(c => c.text().includes('3号球桌'))
    expect(card.text()).toContain('待开始')
    expect(card.text()).not.toContain('继续付款')
  })

  it('空列表：待处理与已完成都显示空状态', async () => {
    taskStore.__clear()
    const wrapper = mountPage()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.find('.empty-state').text()).toContain('暂无待处理任务')
    expect(wrapper.find('.stat-item.pending .stat-value').text()).toBe('0')

    wrapper.findAll('.tab-btn')[1].trigger('click')
    await nextTick()
    expect(wrapper.find('.empty-state').text()).toContain('暂无已完成任务')
  })

  it('类型筛选与业务数据对应：只看订单时仅展示订单任务', async () => {
    const wrapper = mountPage()
    wrapper.findAll('.filter-btn').find(b => b.text().includes('订单')).trigger('click')
    await nextTick()
    const cards = wrapper.findAll('.task-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].text()).toContain('商城订单')
    expect(cards[0].text()).toContain('LP专业斯诺克球杆')
  })
})
