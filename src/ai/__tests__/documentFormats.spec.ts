import { describe, expect, it } from 'vitest'
import {
  isAllowedUploadFile,
  normalizeUploadMimetype,
  resolveExtractionKind,
} from '../services/documentFormats.js'

describe('documentFormats', () => {
  it('allows CSV by extension when browser sends empty MIME', () => {
    expect(isAllowedUploadFile('测试数据.csv', '')).toBe(true)
    expect(normalizeUploadMimetype('测试数据.csv', '')).toBe('text/csv')
    expect(resolveExtractionKind('测试数据.csv', '')).toBe('csv')
  })

  it('allows CSV when browser sends excel MIME', () => {
    expect(isAllowedUploadFile('data.csv', 'application/vnd.ms-excel')).toBe(true)
    expect(normalizeUploadMimetype('data.csv', 'application/vnd.ms-excel')).toBe('text/csv')
  })

  it('allows OFD by extension when MIME is octet-stream', () => {
    expect(isAllowedUploadFile('发票.ofd', 'application/octet-stream')).toBe(true)
    expect(normalizeUploadMimetype('发票.ofd', 'application/octet-stream')).toBe('application/ofd')
    expect(resolveExtractionKind('发票.ofd', 'application/octet-stream')).toBe('ofd')
  })

  it('allows legacy Word .doc', () => {
    expect(isAllowedUploadFile('report.doc', 'application/msword')).toBe(true)
    expect(resolveExtractionKind('report.doc', 'application/msword')).toBe('doc')
  })

  it('allows DOCX', () => {
    expect(isAllowedUploadFile('项目报告.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
    expect(resolveExtractionKind('项目报告.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx')
  })

  it('rejects unsupported extensions', () => {
    expect(isAllowedUploadFile('archive.zip', 'application/zip')).toBe(false)
  })
})
