/** Narrow mongoose `.lean()` results (workaround for Mongoose 8 TS inference). */
export function leanDoc<T extends Record<string, unknown>>(doc: unknown): T | null {
  if (doc == null || Array.isArray(doc)) return null
  return doc as T
}
