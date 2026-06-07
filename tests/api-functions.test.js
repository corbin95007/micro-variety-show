import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const API_FUNCTION_LIMIT = 12
const apiRoot = path.resolve('api')

function isPrivateApiSegment(segment) {
  return segment.startsWith('_')
}

function listApiFunctions(dir = apiRoot) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  return entries.flatMap((entry) => {
    if (isPrivateApiSegment(entry.name)) return []

    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) return listApiFunctions(fullPath)
    if (entry.isFile() && entry.name.endsWith('.js')) return [fullPath]
    return []
  })
}

describe('api function budget', () => {
  it(`keeps Vercel API Functions at or below ${API_FUNCTION_LIMIT}`, () => {
    const functions = listApiFunctions()
      .map((filePath) => path.relative(apiRoot, filePath).replace(/\\/g, '/'))
      .sort()

    expect(functions.length, functions.join('\n')).toBeLessThanOrEqual(API_FUNCTION_LIMIT)
  })
})
