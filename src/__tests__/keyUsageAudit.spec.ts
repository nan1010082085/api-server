/**
 * Key Usage Audit Tests
 *
 * Verifies that:
 * - KeyUsageLog model correctly stores usage records
 * - Key usage stats aggregation works correctly
 * - Tenant isolation is enforced
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { tenantStorage } from '../middleware/tenantContext.js'
import { KeyUsageLogModel } from '../models/KeyUsageLog.js'

const TEST_MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-key-usage-audit'

/** Run a function within a specific tenant context */
async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStorage.run({ tenantId }, async () => {
      try {
        const result = await fn()
        resolve(result)
      } catch (err) {
        reject(err)
      }
    })
  })
}

beforeAll(async () => {
  mongoose.set('strictQuery', false)
  await mongoose.connect(TEST_MONGO_URI, {
    maxPoolSize: 5,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  })
}, 30000)

afterAll(async () => {
  await mongoose.connection.db!.collection('keyusagelogs').deleteMany({})
  await mongoose.disconnect()
})

beforeEach(async () => {
  const db = mongoose.connection.db!
  try { await db.collection('keyusagelogs').drop() } catch { /* ignore */ }
})

// ── Helper ──

async function createUsageLog(
  tenantId: string,
  keyId: string,
  keyName: string,
  overrides?: Partial<{
    workflowId: string
    workflowName: string
    endpoint: string
    method: string
    statusCode: number
    duration: number
  }>,
) {
  return withTenant(tenantId, () =>
    KeyUsageLogModel.create({
      tenantId,
      keyId,
      keyName,
      workflowId: overrides?.workflowId ?? null,
      workflowName: overrides?.workflowName ?? null,
      endpoint: overrides?.endpoint ?? '/api/test',
      method: overrides?.method ?? 'GET',
      statusCode: overrides?.statusCode ?? 200,
      duration: overrides?.duration ?? 100,
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    }),
  )
}

// ── KeyUsageLog Model ──

describe('KeyUsageLog Model', () => {
  it('creates a usage log with required fields', async () => {
    const log = await createUsageLog('tenant-1', 'key-1', 'Test Key')
    expect(log._id).toBeDefined()
    expect(log.keyId).toBe('key-1')
    expect(log.keyName).toBe('Test Key')
    expect(log.statusCode).toBe(200)
    expect(log.duration).toBe(100)
    expect(log.createdAt).toBeDefined()
  })

  it('stores workflow information when provided', async () => {
    const log = await createUsageLog('tenant-1', 'key-1', 'Test Key', {
      workflowId: 'wf-1',
      workflowName: 'Test Workflow',
    })
    expect(log.workflowId).toBe('wf-1')
    expect(log.workflowName).toBe('Test Workflow')
  })

  it('defaults workflow fields to null', async () => {
    const log = await createUsageLog('tenant-1', 'key-1', 'Test Key')
    expect(log.workflowId).toBeNull()
    expect(log.workflowName).toBeNull()
  })

  it('toJSON returns id instead of _id', async () => {
    const log = await createUsageLog('tenant-1', 'key-1', 'Test Key')
    const json = log.toJSON()
    expect(json.id).toBeDefined()
    expect(json._id).toBeUndefined()
    expect(json.__v).toBeUndefined()
  })
})

// ── Tenant Isolation ──

describe('KeyUsageLog Tenant Isolation', () => {
  it('only returns logs for the current tenant', async () => {
    await createUsageLog('tenant-A', 'key-a', 'Key A')
    await createUsageLog('tenant-A', 'key-a2', 'Key A2')
    await createUsageLog('tenant-B', 'key-b', 'Key B')

    const tenantALogs = await withTenant('tenant-A', () => KeyUsageLogModel.find())
    expect(tenantALogs).toHaveLength(2)
    expect(tenantALogs.every((l) => l.tenantId === 'tenant-A')).toBe(true)

    const tenantBLogs = await withTenant('tenant-B', () => KeyUsageLogModel.find())
    expect(tenantBLogs).toHaveLength(1)
    expect(tenantBLogs[0].tenantId).toBe('tenant-B')
  })

  it('countDocuments respects tenant isolation', async () => {
    await createUsageLog('tenant-A', 'key-a', 'Key A')
    await createUsageLog('tenant-A', 'key-a2', 'Key A2')
    await createUsageLog('tenant-B', 'key-b', 'Key B')

    const countA = await withTenant('tenant-A', () => KeyUsageLogModel.countDocuments())
    expect(countA).toBe(2)

    const countB = await withTenant('tenant-B', () => KeyUsageLogModel.countDocuments())
    expect(countB).toBe(1)
  })
})

// ── Aggregation Stats ──

describe('Key Usage Stats Aggregation', () => {
  beforeEach(async () => {
    // Create test data for tenant-1
    await createUsageLog('tenant-1', 'key-1', 'Production Key', {
      workflowId: 'wf-1',
      workflowName: 'Order Flow',
      statusCode: 200,
      duration: 100,
    })
    await createUsageLog('tenant-1', 'key-1', 'Production Key', {
      workflowId: 'wf-1',
      workflowName: 'Order Flow',
      statusCode: 200,
      duration: 200,
    })
    await createUsageLog('tenant-1', 'key-1', 'Production Key', {
      workflowId: 'wf-2',
      workflowName: 'Payment Flow',
      statusCode: 500,
      duration: 300,
    })
    await createUsageLog('tenant-1', 'key-2', 'Test Key', {
      workflowId: 'wf-1',
      workflowName: 'Order Flow',
      statusCode: 200,
      duration: 150,
    })

    // Create data for tenant-2 (should not appear in tenant-1 stats)
    await createUsageLog('tenant-2', 'key-3', 'Other Key', {
      statusCode: 200,
      duration: 50,
    })
  })

  it('groups stats by key correctly', async () => {
    const stats = await withTenant('tenant-1', () =>
      KeyUsageLogModel.aggregate([
        {
          $group: {
            _id: '$keyId',
            keyName: { $first: '$keyName' },
            totalRequests: { $sum: 1 },
            successRequests: {
              $sum: { $cond: [{ $lt: ['$statusCode', 400] }, 1, 0] },
            },
            failedRequests: {
              $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] },
            },
            avgDuration: { $avg: '$duration' },
          },
        },
        { $sort: { totalRequests: -1 } },
      ]),
    )

    expect(stats).toHaveLength(2)

    // key-1 has 3 requests
    const key1Stats = stats.find((s) => s._id === 'key-1')
    expect(key1Stats).toBeDefined()
    expect(key1Stats.keyName).toBe('Production Key')
    expect(key1Stats.totalRequests).toBe(3)
    expect(key1Stats.successRequests).toBe(2)
    expect(key1Stats.failedRequests).toBe(1)
    expect(key1Stats.avgDuration).toBe(200)

    // key-2 has 1 request
    const key2Stats = stats.find((s) => s._id === 'key-2')
    expect(key2Stats).toBeDefined()
    expect(key2Stats.keyName).toBe('Test Key')
    expect(key2Stats.totalRequests).toBe(1)
    expect(key2Stats.successRequests).toBe(1)
    expect(key2Stats.failedRequests).toBe(0)
  })

  it('groups stats by workflow correctly', async () => {
    const stats = await withTenant('tenant-1', () =>
      KeyUsageLogModel.aggregate([
        { $match: { workflowId: { $ne: null } } },
        {
          $group: {
            _id: { workflowId: '$workflowId', keyId: '$keyId' },
            workflowName: { $first: '$workflowName' },
            keyName: { $first: '$keyName' },
            totalRequests: { $sum: 1 },
            successRequests: {
              $sum: { $cond: [{ $lt: ['$statusCode', 400] }, 1, 0] },
            },
            failedRequests: {
              $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] },
            },
            avgDuration: { $avg: '$duration' },
          },
        },
        { $sort: { totalRequests: -1 } },
      ]),
    )

    expect(stats.length).toBeGreaterThan(0)

    // wf-1 + key-1 should have 2 requests
    const wf1Key1 = stats.find(
      (s) => s._id.workflowId === 'wf-1' && s._id.keyId === 'key-1',
    )
    expect(wf1Key1).toBeDefined()
    expect(wf1Key1.workflowName).toBe('Order Flow')
    expect(wf1Key1.totalRequests).toBe(2)
    expect(wf1Key1.successRequests).toBe(2)

    // wf-2 + key-1 should have 1 request (failed)
    const wf2Key1 = stats.find(
      (s) => s._id.workflowId === 'wf-2' && s._id.keyId === 'key-1',
    )
    expect(wf2Key1).toBeDefined()
    expect(wf2Key1.workflowName).toBe('Payment Flow')
    expect(wf2Key1.totalRequests).toBe(1)
    expect(wf2Key1.failedRequests).toBe(1)
  })
})
