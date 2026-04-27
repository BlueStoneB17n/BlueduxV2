import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { BlueduxApi } from './api-client'

const listFilesSchema = z.object({ path: z.string().default('/') })
const readFileSchema = z.object({ path: z.string() })
const writeFileSchema = z.object({
  path: z.string(),
  content_base64: z.string(),
})
const deleteFileSchema = z.object({ path: z.string() })

export function createMcpServer(api: BlueduxApi): Server {
  const server = new Server(
    { name: 'bluedux.mcp', version: '0.0.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'list_files',
        description: 'List files in a directory of the authenticated user.',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string', default: '/' } },
        },
      },
      {
        name: 'read_file',
        description: 'Read a file. Returns base64-encoded content.',
        inputSchema: {
          type: 'object',
          required: ['path'],
          properties: { path: { type: 'string' } },
        },
      },
      {
        name: 'write_file',
        description: 'Write a file. Content must be base64-encoded.',
        inputSchema: {
          type: 'object',
          required: ['path', 'content_base64'],
          properties: {
            path: { type: 'string' },
            content_base64: { type: 'string' },
          },
        },
      },
      {
        name: 'delete_file',
        description: 'Delete a file or directory.',
        inputSchema: {
          type: 'object',
          required: ['path'],
          properties: { path: { type: 'string' } },
        },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params
    if (name === 'list_files') {
      const { path } = listFilesSchema.parse(args)
      const result = await api.listFiles(path)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
    if (name === 'read_file') {
      const { path } = readFileSchema.parse(args)
      const result = await api.readFile(path)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
    if (name === 'write_file') {
      const { path, content_base64 } = writeFileSchema.parse(args)
      const result = await api.writeFile(path, content_base64)
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, ...result }) }] }
    }
    if (name === 'delete_file') {
      const { path } = deleteFileSchema.parse(args)
      await api.deleteFile(path)
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] }
    }
    throw new Error(`unknown tool: ${name}`)
  })

  return server
}
