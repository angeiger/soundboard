# Run this WHILE a League practice-tool game is running, from a normal
# (non-elevated) PowerShell window. It answers one question: is the hotkey
# failure an elevation mismatch, or is something else blocking delivery?
#
# A non-elevated process cannot read the main module of a process running at a
# higher integrity level. That asymmetry is what this leans on.

function Get-IntegrityHint {
  param($Process)
  try {
    $null = $Process.MainModule.FileName
    return 'readable (same or lower integrity than this shell)'
  } catch {
    return 'ACCESS DENIED (higher integrity, or protected)'
  }
}

Write-Output '=== Soundboard ==='
$sb = Get-Process Soundboard -ErrorAction SilentlyContinue
if (-not $sb) {
  Write-Output '  not running'
} else {
  foreach ($p in $sb) {
    Write-Output ("  PID {0,-7} {1}" -f $p.Id, (Get-IntegrityHint $p))
  }
}

Write-Output ''
Write-Output '=== League ==='
$lol = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match 'League|RiotClient' }
if (-not $lol) {
  Write-Output '  not running - start a practice tool game first'
} else {
  foreach ($p in $lol) {
    Write-Output ("  {0,-26} PID {1,-7} {2}" -f $p.ProcessName, $p.Id, (Get-IntegrityHint $p))
  }
}

Write-Output ''
Write-Output '=== Vanguard ==='
foreach ($name in @('vgc', 'vgtray')) {
  $proc = Get-Process $name -ErrorAction SilentlyContinue
  Write-Output ("  {0,-8} {1}" -f $name, $(if ($proc) { 'running' } else { 'not running' }))
}
$svc = Get-Service vgc -ErrorAction SilentlyContinue
Write-Output ("  service  {0}" -f $(if ($svc) { $svc.Status } else { 'not installed' }))
$vgk = Get-CimInstance Win32_SystemDriver -Filter "Name='vgk'" -ErrorAction SilentlyContinue
Write-Output ("  vgk.sys  {0}" -f $(if ($vgk) { $vgk.State } else { 'not loaded' }))

Write-Output ''
Write-Output '=== This shell ==='
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($id)
$elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Output ("  elevated: {0}" -f $elevated)
Write-Output ''
Write-Output 'Reading: if Soundboard says ACCESS DENIED it IS elevated (higher than'
Write-Output 'this shell). If League says ACCESS DENIED too, they may still differ --'
Write-Output 'cross-check both in Task Manager, Details tab, "Elevated" column.'
