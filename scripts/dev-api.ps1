$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$serverScript = Join-Path $root 'scripts\dev-api-server.mjs'

$proxyVars = @(
  'ALL_PROXY',
  'all_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'GIT_HTTP_PROXY',
  'GIT_HTTPS_PROXY'
)

foreach ($name in $proxyVars) {
  if (Test-Path "Env:$name") {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw '未找到 node 命令，请先安装 Node.js'
}

if (-not (Test-Path $serverScript)) {
  throw "未找到本地 API server: $serverScript"
}

Write-Host 'Starting local API on http://127.0.0.1:3000 ...'
& $node.Source $serverScript
