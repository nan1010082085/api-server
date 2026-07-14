/**
 * SchemaEmbedding — stores vector embeddings for FormSchema documents.
 *
 * Each document maps a schema to its embedding vector, enabling
 * semantic search via cosine similarity.
 *
 * Fields:
 * - _id: auto-generated ObjectId
 * - schemaId: reference to FormSchema._id (UUID string)
 * - editId: reference to FormSchema.editId (for lookup)
 * - name: schema name (denormalized for display)
 * - type: schema type (form | search_list)
 * - contentHash: hash of the schema content used for embedding,
 *                used to detect stale embeddings that need re-indexing
 * - embedding: vector array (dimensions depend on configured embedding model)
 * - metadata: extracted features (widget types, field names, labels)
 * - timestamps: auto createdAt / updatedAt
 */

import mongoose from 'mongoose'
import { tenantPlugin } from '../middleware/tenantPlugin.js'

export interface ISchemaEmbedding {
  tenantId: string
  entityKind: 'schema' | 'flow' | 'document'
  schemaId: string
  editId: string
  name: string
  type: string
  contentHash: string
  embedding: number[]
  metadata: {
    widgetTypes: string[]
    fieldNames: string[]
    labels: string[]
    description: string
  }
  createdAt: Date
  updatedAt: Date
}

const metadataSchema = new mongoose.Schema(
  {
    widgetTypes: { type: [String], default: [] },
    fieldNames: { type: [String], default: [] },
    labels: { type: [String], default: [] },
    description: { type: String, default: '' },
  },
  { _id: false },
)

const schemaEmbeddingDef = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    entityKind: { type: String, enum: ['schema', 'flow', 'document'], default: 'schema', index: true },
    schemaId: { type: String, required: true, index: true },
    editId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    contentHash: { type: String, required: true },
    embedding: { type: [Number], required: true },
    metadata: { type: metadataSchema, default: () => ({}) },
  },
  {
    timestamps: true,
  },
)

// Index for efficient similarity search by type
schemaEmbeddingDef.index({ type: 1 })
// Index for content hash to detect stale embeddings
schemaEmbeddingDef.index({ contentHash: 1 })

schemaEmbeddingDef.plugin(tenantPlugin)

export const SchemaEmbeddingModel =
  mongoose.models.SchemaEmbedding ?? mongoose.model<ISchemaEmbedding>('SchemaEmbedding', schemaEmbeddingDef)
