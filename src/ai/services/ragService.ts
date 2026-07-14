/**
 * RAG Service — indexes schemas and performs semantic vector search.
 *
 * Core capabilities:
 * 1. Index a schema: extract text features → generate embedding → store in MongoDB
 * 2. Semantic search: embed query → compute cosine similarity → return top-k
 * 3. Incremental updates: re-index only when schema content changes
 * 4. Bulk re-index: rebuild all embeddings (for initial setup or data migration)
 *
 * Uses OpenAI-compatible embedding API and stores vectors in MongoDB
 * with application-level cosine similarity computation.
 *
 * When embedding API is unavailable, semanticSearch falls back to keyword
 * fuzzy matching (Jaccard) so RAG tools still return useful results.
 */

import { createHash } from 'node:crypto'
import { FormSchemaModel } from '../../models/FormSchema.js'
import { SchemaEmbeddingModel } from '../../models/SchemaEmbedding.js'
import { FlowDefinitionModel } from '../../flow-models/FlowDefinition.js'
import { FlowVersionModel } from '../../flow-models/FlowVersion.js'
import { DocumentModel } from '../models/document.js'
import { embedText, embedBatch, isEmbeddingConfigured } from './embeddingService.js'
import { fuzzySearchSchemas } from './schemaService.js'
import { logger } from '../../utils/logger.js'

// ────────────────────────────────────────────
// Content hash for change detection
// ────────────────────────────────────────────

/**
 * Compute a stable hash of schema content (name + json structure).
 * Used to detect whether a schema's embedding needs re-generation.
 */
export function computeContentHash(name: string, json: unknown): string {
  const text = extractTextForEmbedding(name, json)
  return createHash('sha256').update(text).digest('hex').slice(0, 32)
}

// ────────────────────────────────────────────
// Text extraction from schema
// ────────────────────────────────────────────

interface ExtractedFeatures {
  text: string
  widgetTypes: string[]
  fieldNames: string[]
  labels: string[]
  description: string
}

/**
 * Extract human-readable text from a schema's JSON tree for embedding.
 *
 * Collects:
 * - Schema name
 * - Widget types (e.g., "input", "select", "table")
 * - Field names and labels
 * - Any description or placeholder text
 */
export function extractTextForEmbedding(name: string, json: unknown): string {
  const features = extractFeatures(name, json)
  return [
    name,
    features.description,
    features.labels.join(' '),
    features.fieldNames.join(' '),
    features.widgetTypes.join(' '),
  ].filter(Boolean).join(' ')
}

function extractFeatures(name: string, json: unknown): ExtractedFeatures {
  const widgetTypes: string[] = []
  const fieldNames: string[] = []
  const labels: string[] = []

  function walk(nodes: Record<string, unknown>[]): void {
    for (const node of nodes) {
      if (node.type) widgetTypes.push(String(node.type))
      if (node.field) fieldNames.push(String(node.field))
      if (node.label) labels.push(String(node.label))
      if (node.placeholder) labels.push(String(node.placeholder))
      if (node.title) labels.push(String(node.title))
      if (Array.isArray(node.children)) {
        walk(node.children as Record<string, unknown>[])
      }
      // Check props for nested config
      if (node.props && typeof node.props === 'object') {
        const props = node.props as Record<string, unknown>
        if (props.label) labels.push(String(props.label))
        if (props.placeholder) labels.push(String(props.placeholder))
        if (props.field) fieldNames.push(String(props.field))
      }
    }
  }

  if (Array.isArray(json)) {
    walk(json as Record<string, unknown>[])
  }

  // Deduplicate
  const uniqueWidgetTypes = [...new Set(widgetTypes)]
  const uniqueFieldNames = [...new Set(fieldNames)]
  const uniqueLabels = [...new Set(labels)]

  const description = uniqueLabels.length > 0
    ? `包含 ${uniqueWidgetTypes.length} 种组件类型，字段包括 ${uniqueLabels.slice(0, 10).join('、')}`
    : ''

  return {
    text: '',
    widgetTypes: uniqueWidgetTypes,
    fieldNames: uniqueFieldNames,
    labels: uniqueLabels,
    description,
  }
}

// ────────────────────────────────────────────
// Indexing
// ────────────────────────────────────────────

export interface IndexResult {
  schemaId: string
  action: 'created' | 'updated' | 'skipped'
}

export interface ReindexStats {
  total: number
  created: number
  updated: number
  skipped: number
  errors: number
  flowsTotal: number
  flowsCreated: number
  flowsUpdated: number
  flowsSkipped: number
  flowsErrors: number
}

function flowEditId(flowId: string): string {
  return `flow:${flowId}`
}

export function extractFlowTextForEmbedding(
  name: string,
  description: string,
  graph: { nodes?: unknown[] } | null | undefined,
): string {
  const labels: string[] = [name, description].filter(Boolean)
  const nodes = graph?.nodes
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue
      const row = node as Record<string, unknown>
      if (row.label) labels.push(String(row.label))
      if (row.name) labels.push(String(row.name))
      if (row.type) labels.push(String(row.type))
      if (row.id) labels.push(String(row.id))
    }
  }
  return [...new Set(labels)].join(' ')
}

function computeFlowContentHash(name: string, description: string, graph: unknown): string {
  const text = extractFlowTextForEmbedding(name, description, graph as { nodes?: unknown[] })
  return createHash('sha256').update(text).digest('hex').slice(0, 32)
}

async function loadFlowGraph(definition: Record<string, unknown>): Promise<unknown> {
  const currentVersionId = definition.currentVersionId
  if (currentVersionId) {
    const version = await FlowVersionModel.findById(currentVersionId).select('graph').lean() as Record<string, unknown> | null
    if (version?.graph) return version.graph
  }
  const latest = await FlowVersionModel.findOne({ definitionId: String(definition._id) })
    .sort({ version: -1 })
    .select('graph')
    .lean() as Record<string, unknown> | null
  return latest?.graph ?? null
}

/**
 * Index a single schema: generate embedding and store/update in MongoDB.
 *
 * Skips re-indexing if the content hash hasn't changed (schema unchanged).
 */
export async function indexSchema(schemaId: string): Promise<IndexResult> {
  if (!isEmbeddingConfigured()) {
    return { schemaId, action: 'skipped' }
  }

  const schema = await FormSchemaModel.findById(schemaId).lean() as Record<string, unknown> | null
  if (!schema) {
    throw new Error(`Schema ${schemaId} not found`)
  }

  const normalizedSchemaId = String(schema._id)
  const name = String(schema.name ?? '')
  const json = schema.json
  const type = String(schema.type ?? 'form')
  const editId = String(schema.editId ?? '')
  const contentHash = computeContentHash(name, json)

  const existing = await SchemaEmbeddingModel.findOne({ editId }).lean() as Record<string, unknown> | null
  if (existing && existing.entityKind === 'flow') {
    throw new Error(`editId ${editId} is already used by a flow embedding`)
  }
  if (existing && existing.contentHash === contentHash && existing.schemaId === normalizedSchemaId) {
    if (existing.entityKind !== 'schema') {
      await SchemaEmbeddingModel.updateOne({ editId }, { entityKind: 'schema' })
    }
    return { schemaId: normalizedSchemaId, action: 'skipped' }
  }

  const text = extractTextForEmbedding(name, json)
  const { vector } = await embedText(text)
  const features = extractFeatures(name, json)

  const payload = {
    entityKind: 'schema' as const,
    schemaId: normalizedSchemaId,
    name,
    type,
    contentHash,
    embedding: vector,
    metadata: {
      widgetTypes: features.widgetTypes,
      fieldNames: features.fieldNames,
      labels: features.labels,
      description: features.description,
    },
  }

  if (existing) {
    await SchemaEmbeddingModel.updateOne({ editId }, payload)
    return { schemaId: normalizedSchemaId, action: 'updated' }
  }

  await SchemaEmbeddingModel.create({
    editId,
    ...payload,
  })

  return { schemaId: normalizedSchemaId, action: 'created' }
}

export async function indexFlowDefinition(flowId: string): Promise<IndexResult> {
  if (!isEmbeddingConfigured()) {
    return { schemaId: flowId, action: 'skipped' }
  }

  const definition = await FlowDefinitionModel.findById(flowId).lean() as Record<string, unknown> | null
  if (!definition) {
    throw new Error(`Flow ${flowId} not found`)
  }

  const normalizedFlowId = String(definition._id)
  const name = String(definition.name ?? '')
  const description = String(definition.description ?? '')
  const graph = await loadFlowGraph(definition)
  const editId = flowEditId(normalizedFlowId)
  const contentHash = computeFlowContentHash(name, description, graph)

  const existing = await SchemaEmbeddingModel.findOne({ editId: flowEditId(normalizedFlowId) }).lean() as Record<string, unknown> | null
  if (existing && existing.entityKind && existing.entityKind !== 'flow') {
    throw new Error(`editId flow:${normalizedFlowId} conflicts with schema embedding`)
  }
  if (existing && existing.contentHash === contentHash) {
    if (existing.entityKind !== 'flow') {
      await SchemaEmbeddingModel.updateOne({ editId: flowEditId(normalizedFlowId) }, { entityKind: 'flow' })
    }
    return { schemaId: normalizedFlowId, action: 'skipped' }
  }

  const text = extractFlowTextForEmbedding(name, description, graph as { nodes?: unknown[] })
  const { vector } = await embedText(text)
  const labels = text.split(/\s+/).filter(Boolean)

  const payload = {
    entityKind: 'flow' as const,
    schemaId: normalizedFlowId,
    name,
    type: 'flow',
    contentHash,
    embedding: vector,
    metadata: {
      widgetTypes: [],
      fieldNames: [],
      labels,
      description: description || `流程 ${name}`,
    },
  }

  if (existing) {
    await SchemaEmbeddingModel.updateOne({ editId }, payload)
    return { schemaId: normalizedFlowId, action: 'updated' }
  }

  await SchemaEmbeddingModel.create({
    editId,
    ...payload,
  })

  return { schemaId: normalizedFlowId, action: 'created' }
}

/**
 * Index an uploaded document into RAG.
 *
 * Extracts text from the document, generates an embedding,
 * and stores it in SchemaEmbeddingModel with entityKind 'document'.
 */
export async function indexDocument(documentId: string): Promise<IndexResult> {
  if (!isEmbeddingConfigured()) {
    return { schemaId: documentId, action: 'skipped' }
  }

  const doc = await DocumentModel.findById(documentId).lean() as Record<string, unknown> | null
  if (!doc) {
    throw new Error(`Document ${documentId} not found`)
  }

  const normalizedDocId = String(doc._id)
  const filename = String(doc.filename ?? '')
  const text = String(doc.text ?? '')

  if (!text.trim()) {
    throw new Error(`Document ${filename} has no extractable text`)
  }

  const editId = `doc:${normalizedDocId}`
  const contentHash = createHash('sha256').update(text).digest('hex').slice(0, 32)

  const existing = await SchemaEmbeddingModel.findOne({ editId }).lean() as Record<string, unknown> | null
  if (existing && existing.entityKind && existing.entityKind !== 'document') {
    throw new Error(`editId ${editId} conflicts with ${existing.entityKind} embedding`)
  }
  if (existing && existing.contentHash === contentHash) {
    if (existing.entityKind !== 'document') {
      await SchemaEmbeddingModel.updateOne({ editId }, { entityKind: 'document' })
    }
    return { schemaId: normalizedDocId, action: 'skipped' }
  }

  const { vector } = await embedText(text.slice(0, 8000))

  const payload = {
    entityKind: 'document' as const,
    schemaId: normalizedDocId,
    name: filename,
    type: 'document',
    contentHash,
    embedding: vector,
    metadata: {
      widgetTypes: [],
      fieldNames: [],
      labels: [filename],
      description: text.slice(0, 200),
    },
  }

  if (existing) {
    await SchemaEmbeddingModel.updateOne({ editId }, payload)
    return { schemaId: normalizedDocId, action: 'updated' }
  }

  await SchemaEmbeddingModel.create({
    editId,
    ...payload,
  })

  return { schemaId: normalizedDocId, action: 'created' }
}

/**
 * Bulk re-index all schemas.
 *
 * Useful for initial setup or after schema migration.
 * Returns counts of created, updated, skipped, and errored schemas.
 */
export async function reindexAll(): Promise<ReindexStats> {
  const schemas = await FormSchemaModel.find()
    .select('_id')
    .lean() as Array<Record<string, unknown>>

  const flows = await FlowDefinitionModel.find()
    .select('_id')
    .lean() as Array<Record<string, unknown>>

  const stats: ReindexStats = {
    total: schemas.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    flowsTotal: flows.length,
    flowsCreated: 0,
    flowsUpdated: 0,
    flowsSkipped: 0,
    flowsErrors: 0,
  }

  const SCHEMA_CHUNK = 5
  for (let i = 0; i < schemas.length; i += SCHEMA_CHUNK) {
    const chunk = schemas.slice(i, i + SCHEMA_CHUNK)
    await Promise.all(chunk.map(async (schema) => {
      try {
        const result = await indexSchema(String(schema._id))
        stats[result.action]++
      } catch {
        stats.errors++
      }
    }))
  }

  const FLOW_CHUNK = 5
  for (let i = 0; i < flows.length; i += FLOW_CHUNK) {
    const chunk = flows.slice(i, i + FLOW_CHUNK)
    await Promise.all(chunk.map(async (flow) => {
      try {
        const result = await indexFlowDefinition(String(flow._id))
        if (result.action === 'created') stats.flowsCreated++
        else if (result.action === 'updated') stats.flowsUpdated++
        else stats.flowsSkipped++
      } catch {
        stats.flowsErrors++
      }
    }))
  }

  return stats
}

/**
 * Index only schemas / flows that have no embedding yet (startup backfill).
 */
export async function syncMissingRagIndices(): Promise<ReindexStats> {
  const stats: ReindexStats = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    flowsTotal: 0,
    flowsCreated: 0,
    flowsUpdated: 0,
    flowsSkipped: 0,
    flowsErrors: 0,
  }

  if (!isEmbeddingConfigured()) {
    return stats
  }

  const embeddedSchemaIds = new Set(
    (await SchemaEmbeddingModel.find({ entityKind: { $in: ['schema', null] } })
      .select('schemaId')
      .lean() as Array<Record<string, unknown>>)
      .map((row) => String(row.schemaId)),
  )

  const schemas = await FormSchemaModel.find().select('_id').lean() as Array<Record<string, unknown>>
  stats.total = schemas.length

  for (const schema of schemas) {
    const id = String(schema._id)
    if (embeddedSchemaIds.has(id)) {
      stats.skipped++
      continue
    }
    try {
      const result = await indexSchema(id)
      if (result.action === 'created') stats.created++
      else if (result.action === 'updated') stats.updated++
      else stats.skipped++
    } catch {
      stats.errors++
    }
  }

  const embeddedFlowIds = new Set(
    (await SchemaEmbeddingModel.find({ entityKind: 'flow' })
      .select('schemaId')
      .lean() as Array<Record<string, unknown>>)
      .map((row) => String(row.schemaId)),
  )

  const flows = await FlowDefinitionModel.find().select('_id').lean() as Array<Record<string, unknown>>
  stats.flowsTotal = flows.length

  for (const flow of flows) {
    const id = String(flow._id)
    if (embeddedFlowIds.has(id)) {
      stats.flowsSkipped++
      continue
    }
    try {
      const result = await indexFlowDefinition(id)
      if (result.action === 'created') stats.flowsCreated++
      else if (result.action === 'updated') stats.flowsUpdated++
      else stats.flowsSkipped++
    } catch {
      stats.flowsErrors++
    }
  }

  return stats
}

// ────────────────────────────────────────────
// Semantic Search
// ────────────────────────────────────────────

export interface SearchResult {
  schemaId: string
  editId: string
  name: string
  type: string
  score: number
  metadata: {
    widgetTypes: string[]
    fieldNames: string[]
    labels: string[]
    description: string
  }
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

async function keywordFallbackSearch(
  query: string,
  options: {
    limit?: number
    type?: 'form' | 'search_list'
    minScore?: number
  },
): Promise<SearchResult[]> {
  const { limit = 5, type, minScore = 10 } = options
  const fuzzy = await fuzzySearchSchemas(query, limit * 3)
  let candidates = fuzzy.data.schemas
  if (type) {
    candidates = candidates.filter((s) => s.type === type)
  }
  candidates = candidates.filter((s) => s.score >= minScore).slice(0, limit)
  if (candidates.length === 0) return []

  const ids = candidates.map((c) => c.id)
  const schemas = await FormSchemaModel.find({ _id: { $in: ids } })
    .select('_id editId name type json')
    .lean() as Array<Record<string, unknown>>
  const schemaById = new Map(schemas.map((s) => [String(s._id), s]))

  const editIds = schemas.map((s) => String(s.editId))
  const storedEmbeddings = await SchemaEmbeddingModel.find({ editId: { $in: editIds } })
    .select('editId metadata')
    .lean() as Array<Record<string, unknown>>
  const metadataByEditId = new Map(
    storedEmbeddings.map((doc) => [String(doc.editId), doc.metadata as SearchResult['metadata']]),
  )

  return candidates.map((candidate) => {
    const schema = schemaById.get(candidate.id)
    const editId = schema ? String(schema.editId) : ''
    const storedMetadata = editId ? metadataByEditId.get(editId) : undefined
    const features = schema
      ? extractFeatures(String(schema.name), schema.json)
      : null

    return {
      schemaId: candidate.id,
      editId,
      name: candidate.name,
      type: candidate.type,
      score: candidate.score,
      metadata: storedMetadata ?? {
        widgetTypes: features?.widgetTypes ?? [],
        fieldNames: features?.fieldNames ?? [],
        labels: features?.labels ?? [],
        description: features?.description ?? '',
      },
    }
  })
}

/**
 * Perform semantic search: embed the query, then find the most similar schemas.
 *
 * Falls back to keyword fuzzy search when embedding API is unavailable.
 * Returns top-k results sorted by similarity score (0-100).
 */
export async function semanticSearch(
  query: string,
  options: {
    limit?: number
    type?: 'form' | 'search_list'
    minScore?: number
  } = {},
): Promise<SearchResult[]> {
  const { limit = 5, type, minScore = 10 } = options

  if (!isEmbeddingConfigured()) {
    logger.info({
      msg: 'rag:semanticSearch:keyword_fallback',
      reason: 'embedding_not_configured',
      query: query.slice(0, 100),
    })
    return keywordFallbackSearch(query, { limit, type, minScore })
  }

  let queryVector: number[]
  try {
    const embedded = await embedText(query)
    queryVector = embedded.vector
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.warn({
      msg: 'rag:semanticSearch:embedding_failed',
      error: errorMessage,
      query: query.slice(0, 100),
    })
    return keywordFallbackSearch(query, { limit, type, minScore })
  }

  // Fetch all embeddings (filtered by type if specified)
  const filter: Record<string, unknown> = {}
  if (type) {
    filter.type = type
  }

  const embeddings = await SchemaEmbeddingModel.find(filter)
    .select('schemaId editId name type embedding metadata')
    .lean() as Array<Record<string, unknown>>

  // Compute similarity scores
  const scored: SearchResult[] = []
  for (const doc of embeddings) {
    const embedding = doc.embedding as number[]
    const score = Math.round(cosineSimilarity(queryVector, embedding) * 100)

    if (score >= minScore) {
      scored.push({
        schemaId: String(doc.schemaId),
        editId: String(doc.editId),
        name: String(doc.name),
        type: String(doc.type),
        score,
        metadata: doc.metadata as SearchResult['metadata'],
      })
    }
  }

  // Sort by score descending, take top-k
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}
