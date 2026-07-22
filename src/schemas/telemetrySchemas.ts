import { z } from 'zod'

export const telemetryEventItemSchema = z.object({
  name: z.string().min(1).max(200),
  properties: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.number().finite().optional(),
})

export const telemetryEventsBodySchema = z.object({
  events: z.array(telemetryEventItemSchema).min(1).max(100),
})

export type TelemetryEventsBody = z.infer<typeof telemetryEventsBodySchema>

export const telemetryErrorBodySchema = z.object({
  message: z.string().min(1).max(4000),
  stack: z.string().max(50_000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.number().finite().optional(),
})

export type TelemetryErrorBody = z.infer<typeof telemetryErrorBodySchema>

export const telemetryFunnelQuerySchema = z.object({
  hours: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return 24
      const n = Number(v)
      if (!Number.isFinite(n) || n <= 0) return 24
      return Math.min(Math.floor(n), 24 * 30)
    }),
})

export type TelemetryFunnelQuery = z.infer<typeof telemetryFunnelQuerySchema>

/** Funnel event names aligned with ai/app AI_TELEMETRY_EVENTS */
export const FUNNEL_EVENT_NAMES = [
  'ai.chat.send',
  'ai.workflow.template_select',
  'ai.workflow.publish',
  'ai.workflow.execute_fail',
  'ai.plugin.enable',
] as const

/**
 * 编辑器关键路径埋点事件名（与 editor src/api/telemetryApi.ts TelemetryEvent 对齐）。
 * 用于 editor-summary 聚合分组，不限制 /events 入站（入站接受任意 name）。
 */
export const EDITOR_EVENT_NAMES = [
  'save',
  'publish',
  'unpublish',
  'delete',
  'undo',
  'redo',
  'create',
  'copy',
  'import',
  'export',
] as const

export const editorSummaryQuerySchema = z.object({
  hours: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return 168
      const n = Number(v)
      if (!Number.isFinite(n) || n <= 0) return 168
      return Math.min(Math.floor(n), 24 * 90)
    }),
})

export type EditorSummaryQuery = z.infer<typeof editorSummaryQuerySchema>

