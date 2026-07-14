/**
 * RAG Management Routes.
 *
 * Provides administrative endpoints for the RAG knowledge base:
 * - POST   /api/ai/rag/upload            — Upload a document and index it
 * - POST   /api/ai/rag/reindex           — Batch rebuild all schema embeddings
 * - GET    /api/ai/rag/status            — Index status and statistics
 * - DELETE /api/ai/rag/:schemaId         — Delete a single schema's embedding
 * - POST   /api/ai/rag/reindex/:schemaId — Re-index a single schema
 */

import Router from '@koa/router'
import multer from '@koa/multer'
import { reindexAll, indexSchema, indexDocument } from './services/ragService.js'
import { isEmbeddingConfigured } from './services/embeddingService.js'
import { createDocumentFromUpload } from './services/documentService.js'
import { FormSchemaModel } from '../models/FormSchema.js'
import { SchemaEmbeddingModel } from '../models/SchemaEmbedding.js'
import { FlowDefinitionModel } from '../flow-models/FlowDefinition.js'
import { authMiddleware } from '../middleware/auth.js'
import { logger } from '../utils/logger.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

const router = new Router({ prefix: '/api/ai/rag' })

// All RAG routes require authentication
router.use(authMiddleware())

function getUserId(ctx: { state: { user?: { id?: string; userId?: string } } }): string {
  return ctx.state.user?.id ?? ctx.state.user?.userId ?? 'anonymous'
}

function getTenantId(ctx: { state: { user?: { tenantId?: string }; tenantId?: string } }): string {
  return ctx.state.user?.tenantId ?? ctx.state.tenantId ?? '000000'
}

// ────────────────────────────────────────────
// POST /api/ai/rag/upload — Upload document and index to RAG
// ────────────────────────────────────────────

router.post('/upload', upload.single('file'), async (ctx) => {
  const file = ctx.file
  if (!file) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'file is required' } }
    return
  }

  try {
    const docResult = await createDocumentFromUpload(
      file.buffer,
      file.originalname,
      file.mimetype,
      getUserId(ctx),
      getTenantId(ctx),
    )

    const indexResult = await indexDocument(docResult.id)

    logger.info({
      msg: 'rag:upload:indexed',
      documentId: docResult.id,
      filename: file.originalname,
      action: indexResult.action,
    })

    ctx.body = {
      success: true,
      data: {
        documentId: docResult.id,
        filename: docResult.filename,
        action: indexResult.action,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ msg: 'rag:upload:error', error: message })
    ctx.status = 400
    ctx.body = { success: false, error: { message } }
  }
})

// ────────────────────────────────────────────
// POST /api/ai/rag/reindex — Batch rebuild all embeddings
// ────────────────────────────────────────────

router.post('/reindex', async (ctx) => {
  logger.info({ msg: 'rag:reindex:start' })

  const stats = await reindexAll()

  logger.info({
    msg: 'rag:reindex:complete',
    total: stats.total,
    created: stats.created,
    updated: stats.updated,
    skipped: stats.skipped,
    errors: stats.errors,
  })

  ctx.body = {
    success: true,
    data: {
      total: stats.total,
      created: stats.created,
      updated: stats.updated,
      skipped: stats.skipped,
      errors: stats.errors,
      flowsTotal: stats.flowsTotal,
      flowsCreated: stats.flowsCreated,
      flowsUpdated: stats.flowsUpdated,
      flowsSkipped: stats.flowsSkipped,
      flowsErrors: stats.flowsErrors,
    },
  }
})

// ────────────────────────────────────────────
// GET /api/ai/rag/status — Index statistics
// ────────────────────────────────────────────

router.get('/status', async (ctx) => {
  const [totalSchemas, totalFlows, totalEmbeddings] = await Promise.all([
    FormSchemaModel.countDocuments(),
    FlowDefinitionModel.countDocuments(),
    SchemaEmbeddingModel.countDocuments(),
  ])

  const embeddedDocs = await SchemaEmbeddingModel.find()
    .select('schemaId entityKind updatedAt')
    .lean() as unknown as Array<{ schemaId: string; entityKind?: string; updatedAt: Date }>

  const embeddedSchemaIdSet = new Set(
    embeddedDocs
      .filter((e) => e.entityKind !== 'flow')
      .map((e) => String(e.schemaId)),
  )
  const embeddedFlowIdSet = new Set(
    embeddedDocs
      .filter((e) => e.entityKind === 'flow')
      .map((e) => String(e.schemaId)),
  )

  const allSchemas = await FormSchemaModel.find()
    .select('_id name type updatedAt')
    .lean() as unknown as Array<{ _id: unknown; name: string; type: string; updatedAt: Date }>

  const allFlows = await FlowDefinitionModel.find()
    .select('_id name status updatedAt')
    .lean() as unknown as Array<{ _id: unknown; name: string; status: string; updatedAt: Date }>

  const indexedSchemas = allSchemas.filter((s) => embeddedSchemaIdSet.has(String(s._id)))
  const unindexedSchemas = allSchemas.filter((s) => !embeddedSchemaIdSet.has(String(s._id)))
  const indexedFlows = allFlows.filter((f) => embeddedFlowIdSet.has(String(f._id)))
  const unindexedFlows = allFlows.filter((f) => !embeddedFlowIdSet.has(String(f._id)))

  const staleSet = new Set<string>()
  const schemaUpdateMap = new Map(allSchemas.map((s) => [String(s._id), s.updatedAt]))
  const flowUpdateMap = new Map(allFlows.map((f) => [String(f._id), f.updatedAt]))

  for (const emb of embeddedDocs) {
    const entityId = String(emb.schemaId)
    const updatedAt = emb.entityKind === 'flow'
      ? flowUpdateMap.get(entityId)
      : schemaUpdateMap.get(entityId)
    if (updatedAt && updatedAt > emb.updatedAt) {
      staleSet.add(entityId)
    }
  }

  ctx.body = {
    success: true,
    data: {
      embeddingConfigured: isEmbeddingConfigured(),
      autoIndexEnabled: true,
      totalSchemas,
      totalFlows,
      totalEmbeddings,
      indexed: indexedSchemas.length,
      unindexed: unindexedSchemas.length,
      indexedFlows: indexedFlows.length,
      unindexedFlows: unindexedFlows.length,
      stale: staleSet.size,
      unindexedSchemas: unindexedSchemas.map((s) => ({
        id: String(s._id),
        name: s.name,
        type: s.type,
      })),
    },
  }
})

// ────────────────────────────────────────────
// DELETE /api/ai/rag/:schemaId — Delete embedding for a schema
// ────────────────────────────────────────────

router.delete('/:schemaId', async (ctx) => {
  const { schemaId } = ctx.params

  const schema = await FormSchemaModel.findById(schemaId)
    .select('_id name')
    .lean() as { _id: string; name: string } | null

  if (!schema) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Schema not found' } }
    return
  }

  const result = await SchemaEmbeddingModel.deleteOne({ schemaId })

  if (result.deletedCount === 0) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'No embedding found for this schema' } }
    return
  }

  logger.info({ msg: 'rag:delete', schemaId, name: schema.name })

  ctx.body = {
    success: true,
    data: { schemaId, deleted: true },
  }
})

// ────────────────────────────────────────────
// POST /api/ai/rag/reindex/:schemaId — Re-index a single schema
// ────────────────────────────────────────────

router.post('/reindex/:schemaId', async (ctx) => {
  const { schemaId } = ctx.params

  const schema = await FormSchemaModel.findById(schemaId)
    .select('_id name')
    .lean() as { _id: string; name: string } | null

  if (!schema) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Schema not found' } }
    return
  }

  const result = await indexSchema(schemaId)

  logger.info({ msg: 'rag:reindex:single', schemaId, action: result.action })

  ctx.body = {
    success: true,
    data: {
      schemaId: result.schemaId,
      action: result.action,
    },
  }
})

export default router
