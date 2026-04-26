$ErrorActionPreference = 'Stop'

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

$vercel = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercel) {
  throw '未找到 vercel 命令，请先执行 npm install -g vercel'
}

Write-Host 'Starting local API on http://localhost:3000 ...'
vercel dev --listen 3000
