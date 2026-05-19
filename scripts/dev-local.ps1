param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$frontend = Join-Path $root 'frontend'
$apiScript = Join-Path $root 'scripts\dev-api.ps1'

if (-not (Test-Path $apiScript)) {
  throw "未找到 API 启动脚本: $apiScript"
}

if (-not (Test-Path (Join-Path $frontend 'package.json'))) {
  throw "未找到前端 package.json: $frontend"
}

if ($DryRun) {
  Write-Host 'Dry run OK: npm run dev:local will start:'
  Write-Host '- frontend: npm run dev -- --host localhost --port 5173 --strictPort, http://localhost:5173'
  Write-Host '- API: npm run dev:api, http://127.0.0.1:3000'
  Write-Host '- health check: GET http://127.0.0.1:3000/api/test/submit must return 405'
  exit 0
}

$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) {
  throw '未找到 npm.cmd 命令，请先安装 Node.js'
}

$cmdExe = if ($env:ComSpec) { $env:ComSpec } else { 'cmd.exe' }
$npmArgsPrefix = @('/d', '/c', "`"$($npmCmd.Source)`"")

$processes = @()

function Test-ApiHealth {
  $uri = 'http://127.0.0.1:3000/api/test/submit'
  $deadline = (Get-Date).AddSeconds(30)
  $lastError = $null

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $uri -Method Get -TimeoutSec 3 -ErrorAction Stop
      if ($response.StatusCode -eq 405) {
        return
      }
      $lastError = "unexpected status $($response.StatusCode)"
    }
    catch {
      if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 405) {
        return
      }
      $lastError = $_.Exception.Message
    }

    Start-Sleep -Seconds 1
  }

  throw "API 健康检查失败: GET $uri 未在 30 秒内返回 405。最后错误: $lastError"
}

function Stop-DevProcesses {
  foreach ($proc in $processes) {
    if ($proc -and -not $proc.HasExited) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

try {
  Write-Host 'Starting API on http://127.0.0.1:3000 ...'
  $processes += Start-Process -FilePath $cmdExe -ArgumentList ($npmArgsPrefix + @('run', 'dev:api')) -WorkingDirectory $root -NoNewWindow -PassThru
  Test-ApiHealth
  Write-Host 'API health check OK: GET /api/test/submit returned 405.'

  Write-Host 'Starting frontend on http://localhost:5173 ...'
  $processes += Start-Process -FilePath $cmdExe -ArgumentList ($npmArgsPrefix + @('run', 'dev', '--', '--host', 'localhost', '--port', '5173', '--strictPort')) -WorkingDirectory $frontend -NoNewWindow -PassThru

  Write-Host ''
  Write-Host 'Local dev is running. Press Ctrl+C to stop both processes.'

  while ($true) {
    Start-Sleep -Seconds 1
    foreach ($proc in $processes) {
      if ($proc.HasExited) {
        throw "本地开发进程已退出，PID: $($proc.Id)"
      }
    }
  }
}
finally {
  Stop-DevProcesses
}
