/**
 * Agent 工作流 MongoDB 模型
 *
 * 主键与外键均使用 ObjectId，API 层以 24 位 hex 字符串输出。
 */

import mongoose from 'mongoose'
import { tenantPlugin } from '../../middleware/tenantPlugin.js'

export interface IAgentWorkflow {
  tenantId: string
  name: string
  /** 租户内唯一，供 Open API by-slug 执行 */
  slug?: string | null
  description: string
  status: 'draft' | 'published' | 'archived'
  draftGraph: Record<string, unknown>
  /** 当前草稿版本号 (yyyymmddhhmmss) */
  version: string
  /** 嵌入式版本快照 */
  versions: Array<{ version: string; createdAt: Date; graph: Record<string, unknown> }>
  /** 稳定发布 ID (UUID)，首次发布生成，后续复用 */
  publishId?: string | null
  /** 已发布版本号 (yyyymmddhhmmss) */
  publishedVersion?: string | null
  /** 已发布版本对应的 graph 快照 */
  publishedGraph?: Record<string, unknown> | null
  /** 执行完成后 POST 结果的回调 URL（Open API / 外部集成） */
  onCompleteWebhook?: { url: string; secret?: string } | null
  /** 兼容旧数据：已发布版本 ObjectId */
  currentVersionId?: mongoose.Types.ObjectId | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

const MAX_VERSIONS = 20

const versionSnapshotSchema = new mongoose.Schema(
  {
    version: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    graph: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { _id: false },
)

const agentWorkflowSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    name: { type: String, required: true },
    slug: { type: String, default: null, index: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    draftGraph: { type: mongoose.Schema.Types.Mixed, required: true },
    version: { type: String, default: '' },
    versions: { type: [versionSnapshotSchema], default: [] },
    publishId: { type: String, default: null, index: true },
    publishedVersion: { type: String, default: null },
    publishedGraph: { type: mongoose.Schema.Types.Mixed, default: null },
    onCompleteWebhook: {
      type: {
        url: { type: String, required: true },
        secret: { type: String },
      },
      default: null,
    },
    currentVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AgentWorkflowVersion',
      default: null,
    },
    createdBy: { type: String, required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: unknown, ret: Record<string, unknown>) {
        ret.id = String(ret._id)
        delete ret._id
        delete ret.__v
        if (ret.currentVersionId != null) {
          ret.currentVersionId = String(ret.currentVersionId)
        }
      },
    },
  },
)

agentWorkflowSchema.index({ name: 1 })
agentWorkflowSchema.index({ status: 1 })
agentWorkflowSchema.index({ createdBy: 1 })
agentWorkflowSchema.index({ tenantId: 1, slug: 1 }, { unique: true, sparse: true })
agentWorkflowSchema.plugin(tenantPlugin)

export const AgentWorkflowModel =
  mongoose.models.AgentWorkflow ??
  mongoose.model<IAgentWorkflow>('AgentWorkflow', agentWorkflowSchema)

export interface IAgentWorkflowVersion {
  tenantId: string
  workflowId: mongoose.Types.ObjectId
  version: number
  graph: Record<string, unknown>
  publishedBy: string
  createdAt: Date
}

const versionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AgentWorkflow',
      required: true,
      index: true,
    },
    version: { type: Number, required: true },
    graph: { type: mongoose.Schema.Types.Mixed, required: true },
    publishedBy: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc: unknown, ret: Record<string, unknown>) {
        ret.id = String(ret._id)
        delete ret._id
        delete ret.__v
        if (ret.workflowId != null) {
          ret.workflowId = String(ret.workflowId)
        }
      },
    },
  },
)

versionSchema.index({ workflowId: 1, version: -1 }, { unique: true })
versionSchema.plugin(tenantPlugin)

export const AgentWorkflowVersionModel =
  mongoose.models.AgentWorkflowVersion ??
  mongoose.model<IAgentWorkflowVersion>('AgentWorkflowVersion', versionSchema)

const nodeRecordSchema = new mongoose.Schema(
  {
    nodeId: String,
    nodeType: String,
    nodeName: String,
    status: String,
    startedAt: Date,
    finishedAt: Date,
    durationMs: Number,
    input: mongoose.Schema.Types.Mixed,
    output: mongoose.Schema.Types.Mixed,
    error: String,
  },
  { _id: false },
)

export interface IAgentWorkflowExecution {
  tenantId: string
  workflowId: mongoose.Types.ObjectId
  workflowName: string
  /** 发布 ID（执行已发布版本时），草稿执行时为 null */
  versionId: string | null
  /** 执行的版本号 (yyyymmddhhmmss) */
  version: string
  status: 'running' | 'success' | 'error' | 'waiting' | 'cancelled'
  trigger: 'manual' | 'chat' | 'webhook' | 'api'
  startedAt: Date
  finishedAt?: Date
  durationMs?: number
  nodeRecords: Array<Record<string, unknown>>
  conversationHistory?: Array<{ role: string; content: string; at?: string }>
  parentExecutionId?: string | null
  error?: string
  triggeredBy: string
  streamingOutput?: {
    nodeId: string
    nodeType: string
    text: string
    updatedAt: string
  } | null
  completeCallbackUrl?: string | null
  completeCallbackSecret?: string | null
}

const executionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AgentWorkflow',
      required: true,
      index: true,
    },
    workflowName: { type: String, required: true },
    versionId: { type: String, default: null },
    version: { type: String, default: '' },
    status: {
      type: String,
      enum: ['running', 'success', 'error', 'waiting', 'cancelled'],
      default: 'running',
    },
    trigger: {
      type: String,
      enum: ['manual', 'chat', 'webhook', 'api'],
      default: 'manual',
    },
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
    durationMs: Number,
    nodeRecords: { type: [nodeRecordSchema], default: [] },
    error: String,
    triggeredBy: { type: String, required: true },
    conversationHistory: {
      type: [
        {
          role: { type: String, enum: ['user', 'assistant', 'system'] },
          content: { type: String },
          at: { type: String },
        },
      ],
      default: [],
    },
    parentExecutionId: { type: String, default: null },
    streamingOutput: {
      type: {
        nodeId: String,
        nodeType: String,
        text: String,
        updatedAt: String,
      },
      default: null,
    },
    completeCallbackUrl: { type: String, default: null },
    completeCallbackSecret: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: unknown, ret: Record<string, unknown>) {
        ret.id = String(ret._id)
        delete ret._id
        delete ret.__v
        if (ret.workflowId != null) {
          ret.workflowId = String(ret.workflowId)
        }
        if (ret.versionId != null) {
          ret.versionId = String(ret.versionId)
        }
      },
    },
  },
)

executionSchema.index({ workflowId: 1, startedAt: -1 })
executionSchema.index({ status: 1 })
executionSchema.plugin(tenantPlugin)

export const AgentWorkflowExecutionModel =
  mongoose.models.AgentWorkflowExecution ??
  mongoose.model<IAgentWorkflowExecution>('AgentWorkflowExecution', executionSchema)
