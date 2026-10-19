# Stop the local gallery admin console (and the hugo preview child processes it started).
# NOTE: keep this file ASCII-only -- Windows PowerShell 5.1 reads .ps1 as the ANSI code page
# unless the file has a UTF-8 BOM, so non-ASCII text here would break parsing.
# Prints exactly one line: "NONE", or "PID=<pid>[,<pid>...]".

$ErrorActionPreference = 'SilentlyContinue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $here '.admin.pid'
$script:killed = @()

function Stop-AdminProcess([int]$procId) {
  if ($procId -le 0) { return }
  # Only kill when this PID really is the admin server: a stale pid file could otherwise
  # point at an unrelated process that reused the number. Require a node.exe whose command
  # line runs server.mjs -- a plain string match would also hit e.g. an editor holding the file.
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
  if (-not $proc) { return }
  if ($proc.Name -ne 'node.exe') { return }
  if (-not ($proc.CommandLine -and $proc.CommandLine -match 'admin[\\/]server\.mjs')) { return }
  # /T also ends child processes: the hugo server preview is a child of the admin server.
  & taskkill /PID $procId /T /F 2>&1 | Out-Null
  $script:killed += $procId
}

# 1) Preferred: the pid file written by server.mjs on startup.
if (Test-Path $pidFile) {
  $raw = Get-Content $pidFile -Raw -ErrorAction SilentlyContinue
  $filePid = 0
  if ($raw -and [int]::TryParse($raw.Trim(), [ref]$filePid)) { Stop-AdminProcess $filePid }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# 2) Fallback: any node.exe whose command line runs a tools\admin\server.mjs (site or theme copy).
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
foreach ($p in $procs) {
  if ($p.CommandLine -and $p.CommandLine -match 'admin[\\/]server\.mjs') {
    Stop-AdminProcess ([int]$p.ProcessId)
  }
}

if ($script:killed.Count -gt 0) {
  Write-Output ("PID=" + ($script:killed -join ','))
} else {
  Write-Output "NONE"
}
