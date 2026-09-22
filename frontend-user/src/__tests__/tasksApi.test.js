/**
 * 任务中心 API 集成测试（/user/tasks）
 *
 * 覆盖：
 * - 单条 pay / cancel / confirm 的结果与状态迁移
 * - 批量动作（taskIds）整组成功与失败
 * - 非法动作（重复支付、对未发货订单确认收货）返回失败且数据不变
 * - GET 列表按 status 分组
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { api } from '../utils/api'
import taskStore from '../utils/taskStore'

function seed() {
  taskStore.__reset([
    { id: 'A', type: 'booking', title: 'a', subtitle: '', amount: 10, status: 'pending_payment', createdAt: '2026-03-01 10:00', extra: { tableId: 1 } },
    { id: 'B', type: 'order', title: 'b', subtitle: '', amount: 20, status: 'pending_payment', createdAt: '2026-03-01 09:00', extra: { orderNo: 'B1' } },
    { id: 'C', type: 'order', title: 'c', subtitle: '', amount: 30, status: 'shipped', createdAt: '2026-02-28 10:00', extra: { orderNo: 'C1' } }
  ])
}

describe('API /user/tasks', () => {
  beforeEach(() => {
    localStorage.clear()
    taskStore.setTransport(() => Promise.resolve({ success: true }))
    seed()
  })

  it('GET 返回任务列表（带派生字段）', async () => {
    const res = await api.getTasks()
    expect(res.success).toBe(true)
    expect(res.data.length).toBe(3)
    expect(res.data[0]).toHaveProperty('typeName')
    expect(res.data[0]).toHaveProperty('actions')
  })

  it('GET 按 status=pending/completed 分组', async () => {
    const pending = await api.getTasks({ status: 'pending' })
    expect(pending.data.map(t => t.id).sort()).toEqual(['A', 'B', 'C'])
    const done = await api.getTasks({ status: 'completed' })
    expect(done.data).toEqual([])
  })

  it('POST pay 成功迁移状态', async () => {
    const res = await api.doTaskAction({ taskId: 'A', action: 'pay' })
    expect(res.success).toBe(true)
    expect(taskStore.getById('A').status).toBe('upcoming')
    // 金额与业务数据保持
    expect(taskStore.getById('A').amount).toBe(10)
    expect(taskStore.getById('A').extra.tableId).toBe(1)
  })

  it('POST pay 对已支付任务失败（重复支付）', async () => {
    await api.doTaskAction({ taskId: 'A', action: 'pay' })
    const res = await api.doTaskAction({ taskId: 'A', action: 'pay' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/状态/)
    expect(taskStore.getById('A').status).toBe('upcoming')
  })

  it('POST cancel 将任务置为 cancelled（保留记录）', async () => {
    const res = await api.doTaskAction({ taskId: 'A', action: 'cancel' })
    expect(res.success).toBe(true)
    expect(taskStore.getById('A').status).toBe('cancelled')
    expect(taskStore.getAll().some(t => t.id === 'A')).toBe(true)
  })

  it('POST confirm 仅对 shipped 订单成功', async () => {
    const ok = await api.doTaskAction({ taskId: 'C', action: 'confirm' })
    expect(ok.success).toBe(true)
    expect(taskStore.getById('C').status).toBe('completed')

    const bad = await api.doTaskAction({ taskId: 'B', action: 'confirm' })
    expect(bad.success).toBe(false)
    expect(taskStore.getById('B').status).toBe('pending_payment')
  })

  it('POST 批量支付整组成功，各任务迁移到对应状态', async () => {
    const res = await api.doTaskAction({ taskIds: ['A', 'B'], action: 'pay' })
    expect(res.success).toBe(true)
    expect(taskStore.getById('A').status).toBe('upcoming')
    expect(taskStore.getById('B').status).toBe('pending_shipment')
  })

  it('POST 批量中含非法状态时整组失败且数据不变', async () => {
    // C 为 shipped，不能 pay
    const res = await api.doTaskAction({ taskIds: ['A', 'C'], action: 'pay' })
    expect(res.success).toBe(false)
    expect(taskStore.getById('A').status).toBe('pending_payment')
    expect(taskStore.getById('C').status).toBe('shipped')
  })

  it('传输层失败时接口返回失败且任务不变', async () => {
    taskStore.setTransport(() => Promise.resolve({ success: false, message: '网关错误' }))
    const res = await api.doTaskAction({ taskId: 'A', action: 'pay' })
    expect(res.success).toBe(false)
    expect(res.error).toBe('网关错误')
    expect(taskStore.getById('A').status).toBe('pending_payment')
  })
})
