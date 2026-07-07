/**
 * Fire-and-forget RAG index scheduling (used by Mongoose hooks).
 */

import { logger } from '../../utils/logger.js'
import { isEmbeddingConfigured } from './embeddingService.js'

export function scheduleSchemaRagIndex(schemaId: string): void {
  if (!isEmbeddingConfigured()) return

  const id = String(schemaId)
  import('./ragService.js')
    .then(({ indexSchema }) => indexSchema(id))
    .then((result) => {
      if (result.action !== 'skipped') {
        logger.info({ msg: 'rag:auto_index:schema', schemaId: id, action: result.action })
      }
    })
    .catch((err: unknown) => {
      logger.warn({
        msg: 'rag:auto_index:schema_failed',
        schemaId: id,
        error: err instanceof Error ? err.message : String(err),
      })
    })
}

export function scheduleFlowRagIndex(flowId: string): void {
  if (!isEmbeddingConfigured()) return

  const id = String(flowId)
  import('./ragService.js')
    .then(({ indexFlowDefinition }) => indexFlowDefinition(id))
    .then((result) => {
      if (result.action !== 'skipped') {
        logger.info({ msg: 'rag:auto_index:flow', flowId: id, action: result.action })
      }
    })
    .catch((err: unknown) => {
      logger.warn({
        msg: 'rag:auto_index:flow_failed',
        flowId: id,
        error: err instanceof Error ? err.message : String(err),
      })
    })
}

export function scheduleRagStartupSync(): void {
  if (!isEmbeddingConfigured()) {
    logger.info({ msg: 'rag:startup_sync:skipped', reason: 'embedding_not_configured' })
    return
  }

  import('./ragService.js')
    .then(({ syncMissingRagIndices }) => syncMissingRagIndices())
    .then((stats) => {
      logger.info({ msg: 'rag:startup_sync:complete', ...stats })
    })
    .catch((err: unknown) => {
      logger.warn({
        msg: 'rag:startup_sync:failed',
        error: err instanceof Error ? err.message : String(err),
      })
    })
}
