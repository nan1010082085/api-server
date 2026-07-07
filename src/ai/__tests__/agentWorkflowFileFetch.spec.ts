/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveWorkflowApiFile } from '../services/agentWorkflowFileFetch.js'

describe('resolveWorkflowApiFile', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches binary response directly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(Buffer.from('%PDF'), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="report.pdf"',
      },
    }))

    const file = await resolveWorkflowApiFile(
      {
        fetchUrl: 'https://files.example.com/doc/1',
        fetchResponseMode: 'binary',
      },
      (text) => text,
    )

    expect(file.filename).toBe('report.pdf')
    expect(file.mimetype).toBe('application/pdf')
    expect(file.content.toString('utf-8')).toBe('%PDF')
  })

  it('parses json-base64 response', async () => {
    const content = Buffer.from('hello', 'utf-8').toString('base64')
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      data: {
        content,
        filename: 'note.txt',
        mimetype: 'text/plain',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const file = await resolveWorkflowApiFile(
      {
        fetchUrl: 'https://api.example.com/files/{{$input.id}}',
        fetchResponseMode: 'json-base64',
        fetchContentPath: 'data.content',
        fetchFilenamePath: 'data.filename',
        fetchMimetypePath: 'data.mimetype',
      },
      (text) => text.replace('{{$input.id}}', '42'),
    )

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/files/42',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(file.filename).toBe('note.txt')
    expect(file.content.toString('utf-8')).toBe('hello')
  })

  it('follows json-url download link', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        downloadUrl: 'https://cdn.example.com/a.png',
        filename: 'a.png',
        mimetype: 'image/png',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(Buffer.from('PNG'), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }))

    const file = await resolveWorkflowApiFile(
      {
        fetchUrl: 'https://api.example.com/meta/1',
        fetchResponseMode: 'json-url',
        fetchContentPath: 'downloadUrl',
        fetchFilenamePath: 'filename',
        fetchMimetypePath: 'mimetype',
      },
      (text) => text,
    )

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(file.filename).toBe('a.png')
    expect(file.mimetype).toBe('image/png')
  })

  it('rejects missing url', async () => {
    await expect(resolveWorkflowApiFile({}, (text) => text)).rejects.toThrow('未配置查询接口 URL')
  })
})
