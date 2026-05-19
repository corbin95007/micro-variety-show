import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { parse as parseQueryString } from 'node:querystring'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiRoot = path.join(root, 'api')
const host = '127.0.0.1'
const port = 3000
const mirrorBaseRoot = path.join(root, '.tmp', 'dev-api-esm')

const MIME_JSON = 'application/json; charset=utf-8'
const MIME_TEXT = 'text/plain; charset=utf-8'

function loadDotEnv() {
  const envPath = path.join(root, '.env')
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()
    if (!key || process.env[key] !== undefined) continue

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

loadDotEnv()

function getApiVersion() {
  return String(Math.max(...listApiFiles().map((filePath) => fs.statSync(filePath).mtimeMs)))
}

function ensureEsmMirror(version) {
  const mirrorRoot = path.join(mirrorBaseRoot, version)
  const mirrorApiRoot = path.join(mirrorRoot, 'api')
  fs.mkdirSync(mirrorRoot, { recursive: true })
  fs.writeFileSync(path.join(mirrorRoot, 'package.json'), '{"type":"module"}\n')
  fs.cpSync(apiRoot, mirrorApiRoot, { recursive: true, force: true })

  return mirrorApiRoot
}

function listApiFiles(dir = apiRoot) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return listApiFiles(fullPath)
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : []
  })
}

function pathSegments(value) {
  return value.split('/').filter(Boolean)
}

function matchRoute(requestPath) {
  const normalizedPath = requestPath.replace(/^\/api\/?/, '')
  const requestSegments = pathSegments(normalizedPath)

  for (const filePath of listApiFiles()) {
    const relative = path.relative(apiRoot, filePath).replace(/\\/g, '/').replace(/\.js$/, '')
    const routeSegments = pathSegments(relative)
    if (routeSegments.length !== requestSegments.length) continue

    const query = {}
    let matched = true

    for (let index = 0; index < routeSegments.length; index += 1) {
      const routeSegment = routeSegments[index]
      const requestSegment = decodeURIComponent(requestSegments[index])

      if (routeSegment.startsWith('[') && routeSegment.endsWith(']')) {
        query[routeSegment.slice(1, -1)] = requestSegment
        continue
      }

      if (routeSegment !== requestSegment) {
        matched = false
        break
      }
    }

    if (matched) return { filePath, query }
  }

  return null
}

function getHeader(req, name) {
  return req.headers[name.toLowerCase()]
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return undefined

  const rawBody = Buffer.concat(chunks)
  const contentType = String(getHeader(req, 'content-type') || '').toLowerCase()
  const text = rawBody.toString('utf8')

  if (contentType.includes('application/json')) {
    if (!text.trim()) return {}
    return JSON.parse(text)
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return parseQueryString(text)
  }

  return text
}

function augmentResponse(res) {
  res.status = (statusCode) => {
    res.statusCode = statusCode
    return res
  }

  res.set = res.setHeader.bind(res)

  res.json = (payload) => {
    if (!res.hasHeader('Content-Type')) res.setHeader('Content-Type', MIME_JSON)
    res.end(JSON.stringify(payload))
    return res
  }

  res.send = (payload = '') => {
    if (Buffer.isBuffer(payload)) {
      res.end(payload)
      return res
    }

    if (typeof payload === 'object') {
      return res.json(payload)
    }

    if (!res.hasHeader('Content-Type')) res.setHeader('Content-Type', MIME_TEXT)
    res.end(String(payload))
    return res
  }

  return res
}

async function loadHandler(filePath) {
  try {
    const mirrorApiRoot = ensureEsmMirror(getApiVersion())
    const mirrorPath = path.join(mirrorApiRoot, path.relative(apiRoot, filePath))
    const module = await import(pathToFileURL(mirrorPath).href)
    return module.default || module.handler || module
  } catch (esmError) {
    try {
      delete require.cache[require.resolve(filePath)]
      const module = require(filePath)
      return module.default || module
    } catch (commonJsError) {
      commonJsError.cause = esmError
      throw commonJsError
    }
  }
}

async function handleRequest(req, res) {
  augmentResponse(res)

  try {
    const parsedUrl = new URL(req.url, `http://${host}:${port}`)
    if (!parsedUrl.pathname.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' })
    }

    const route = matchRoute(parsedUrl.pathname)
    if (!route) {
      return res.status(404).json({ error: 'API route not found' })
    }

    req.query = {
      ...Object.fromEntries(parsedUrl.searchParams.entries()),
      ...route.query,
    }
    req.body = await readBody(req)

    const handler = await loadHandler(route.filePath)
    if (typeof handler !== 'function') {
      return res.status(500).json({ error: 'API route does not export a handler' })
    }

    await handler(req, res)
    if (!res.writableEnded) res.end()
  } catch (error) {
    console.error('Local API error:', error)
    if (!res.writableEnded) {
      res.status(500).json({ error: error.message || 'Internal server error' })
    }
  }
}

const server = createServer(handleRequest)

server.listen(port, host, () => {
  console.log(`Local API server listening on http://${host}:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
