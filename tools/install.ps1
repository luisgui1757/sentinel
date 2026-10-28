#!/usr/bin/env pwsh
#Requires -Version 5.1
<#
Install the Sentinel rules and skills for one or more coding agents.

Usage:
  tools/install.ps1 -Global -Hosts LIST [-Skills LIST] [-NoRules] [-Check | -Remove]
  tools/install.ps1 -Project DIR -Hosts LIST [-Skills LIST] [-NoRules] [-Check | -Remove]

-Hosts takes codex, claude, copilot, kiro and opencode, or "all".
-Skills takes the profiles in skills/profiles.txt, or "none". The default is core.
The rules go into a managed block. Text outside the block stays. A skill folder
is replaced only when this installer or Sentinel v0.2.0 wrote it and nobody
changed it since.
tools/install does the same on macOS and Linux.
#>
[CmdletBinding()]
param(
  [switch]$Global,
  [string]$Project,
  [string[]]$Hosts,
  [string[]]$Skills = @('core'),
  [switch]$NoRules,
  [switch]$Check,
  [switch]$Remove,
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$LF = "`n"
$BEGIN = '<!-- AGENT-RULES:BEGIN do-not-edit-inside-this-block -->'
$END = '<!-- AGENT-RULES:END -->'
$AllHosts = @('codex', 'claude', 'copilot', 'kiro', 'opencode')
$Marker = '.sentinel-owned'
$Legacy = '.sentinel-skills.json'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Stop-Usage([string]$message) {
  [Console]::Error.WriteLine("install: $message")
  exit 2
}

if ($Help) {
  $inDoc = $false
  foreach ($line in (Get-Content -LiteralPath $PSCommandPath)) {
    if ($line -eq '<#') { $inDoc = $true; continue }
    if ($line -eq '#>') { break }
    if ($inDoc) { Write-Output $line }
  }
  exit 0
}

# Read and write raw UTF-8 without a BOM and without line-ending changes, so the
# result is byte-identical to tools/install.
function Read-Text([string]$path) {
  return (New-Object System.Text.UTF8Encoding($false)).GetString([System.IO.File]::ReadAllBytes($path))
}

function Write-Text([string]$path, [string]$content) {
  [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

function Write-TextAtomic([string]$path, [string]$content) {
  $dir = Split-Path -Parent $path
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $next = Join-Path $dir ('.sentinel.' + [Guid]::NewGuid().ToString('N'))
  Write-Text $next $content
  # An existing file keeps its mode, as in tools/install. On Windows,
  # [IO.File]::Replace keeps the attributes and the ACL.
  if ((Test-Path -LiteralPath $path) -and [Environment]::OSVersion.Platform -eq [PlatformID]::Unix) {
    [System.IO.File]::SetUnixFileMode($next, [System.IO.File]::GetUnixFileMode($path))
  }
  if (Test-Path -LiteralPath $path) { [System.IO.File]::Replace($next, $path, [NullString]::Value, $true) }
  else { [System.IO.File]::Move($next, $path) }
}

function Test-SameBytes([string]$path, [string]$content) {
  if (-not (Test-Path -LiteralPath $path)) { return $false }
  $a = [System.IO.File]::ReadAllBytes($path)
  $b = (New-Object System.Text.UTF8Encoding($false)).GetBytes($content)
  if ($a.Length -ne $b.Length) { return $false }
  for ($i = 0; $i -lt $a.Length; $i++) { if ($a[$i] -ne $b[$i]) { return $false } }
  return $true
}

function Test-HasBlock([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return $false }
  foreach ($line in (Read-Text $path).Split([char]10)) {
    if ($line.StartsWith('<!-- AGENT-RULES:BEGIN')) { return $true }
  }
  return $false
}

# Return the lines of the file with the managed blocks replaced by $block. An
# empty $block removes them. Throw on BEGIN without END.
function Get-Composed([string]$path, [string]$block) {
  $raw = Read-Text $path
  if ($raw.EndsWith($LF)) { $raw = $raw.Substring(0, $raw.Length - 1) }
  $out = [System.Text.StringBuilder]::new()
  $done = $false; $skip = $false
  foreach ($line in $raw.Split([char]10)) {
    if ($line.StartsWith('<!-- AGENT-RULES:BEGIN')) {
      if (-not $done) { [void]$out.Append($block); $done = $true }
      $skip = $true; continue
    }
    if ($skip -and $line.StartsWith('<!-- AGENT-RULES:END -->')) { $skip = $false; continue }
    if ($skip) { continue }
    [void]$out.Append($line + $LF)
  }
  if ($skip) { throw 'UNTERMINATED' }
  return $out.ToString()
}

# Return "<sha256>  <path>" for each file in a skill folder, sorted by path.
# EnumerateFiles returns paths that start with $dir exactly as given. Other APIs
# can expand a Windows short name such as RUNNER~1, and then the prefix differs.
function Get-Manifest([string]$dir) {
  $base = $dir.TrimEnd('\', '/')
  $files = New-Object 'System.Collections.Generic.Dictionary[string,string]' -ArgumentList ([StringComparer]::Ordinal)
  foreach ($file in [System.IO.Directory]::EnumerateFiles($base, '*', [System.IO.SearchOption]::AllDirectories)) {
    if ([System.IO.Path]::GetFileName($file) -ceq $Marker) { continue }
    $files[$file.Substring($base.Length + 1).Replace('\', '/')] = $file
  }
  $sorted = [string[]]@($files.Keys)
  [Array]::Sort($sorted, [StringComparer]::Ordinal)
  # .NET hashes the bytes directly. Get-FileHash can be missing in Windows
  # PowerShell 5.1 when PowerShell 7 started it.
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $out = [System.Text.StringBuilder]::new()
  try {
    foreach ($rel in $sorted) {
      $hash = [BitConverter]::ToString($sha.ComputeHash([System.IO.File]::ReadAllBytes($files[$rel])))
      [void]$out.Append($hash.Replace('-', '').ToLowerInvariant() + "  $rel$LF")
    }
  } finally { $sha.Dispose() }
  return $out.ToString()
}

# Sentinel v0.2.0 listed the folders that it installed in <root>/.sentinel-skills.json,
# with the SHA-256 of each file. Return name -> hashes in the format of Get-Manifest.
function Get-Legacy([string]$root) {
  $result = New-Object 'System.Collections.Generic.Dictionary[string,string]' -ArgumentList ([StringComparer]::Ordinal)
  $path = Join-Path $root $Legacy
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    foreach ($skill in (Read-Text $path | ConvertFrom-Json).skills.PSObject.Properties) {
      $files = @($skill.Value.PSObject.Properties)
      $names = [string[]]@($files | ForEach-Object { $_.Name })
      [Array]::Sort($names, [StringComparer]::Ordinal)
      $out = [System.Text.StringBuilder]::new()
      foreach ($name in $names) { [void]$out.Append(($files | Where-Object { $_.Name -ceq $name }).Value + "  $name$LF") }
      $result[$skill.Name] = $out.ToString()
    }
  }
  return , $result
}

# Return the state of an installed skill folder: missing, unowned, changed, owned,
# or legacy (installed by Sentinel v0.2.0 and not changed since).
function Get-SkillState([string]$dest, $oldHashes) {
  if (-not (Test-Path -LiteralPath $dest)) { return 'missing' }
  $markerPath = Join-Path $dest $Marker
  if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
    if ((Get-Manifest $dest) -cne (Read-Text $markerPath)) { return 'changed' }
    return 'owned'
  }
  $name = Split-Path -Leaf $dest
  if (-not $oldHashes.ContainsKey($name)) { return 'unowned' }
  if ((Get-Manifest $dest) -cne $oldHashes[$name]) { return 'changed' }
  return 'legacy'
}

function Copy-Skill([string]$src, [string]$dest) {
  $next = Join-Path (Split-Path -Parent $dest) ('.sentinel.' + [Guid]::NewGuid().ToString('N'))
  Copy-Item -LiteralPath $src -Destination $next -Recurse -Force
  Write-Text (Join-Path $next $Marker) (Get-Manifest $next)
  if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
  Move-Item -LiteralPath $next -Destination $dest
}

function Get-Home {
  if ($env:HOME) { return $env:HOME }
  if ($env:USERPROFILE) { return $env:USERPROFILE }
  return [Environment]::GetFolderPath('UserProfile')
}

function Get-EnvOr([string]$name, [string]$fallback) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if ($value) { return $value }
  return $fallback
}

if ($Global -and $Project) { Stop-Usage 'choose one of -Global or -Project' }
if (-not $Global -and -not $Project) { Stop-Usage 'choose -Global or -Project DIR' }
if ($Check -and $Remove) { Stop-Usage 'choose one of -Check or -Remove' }
$hostList = @(($Hosts -join ',').Split(',') | Where-Object { $_ })
if ($hostList -contains 'all') { $hostList = $AllHosts }
if ($hostList.Count -eq 0) { Stop-Usage '-Hosts needs a list, for example -Hosts codex,claude' }
foreach ($h in $hostList) {
  if ($AllHosts -notcontains $h) { Stop-Usage "unknown host: $h (use $($AllHosts -join ',') or all)" }
}
if ($Project) {
  if (-not (Test-Path -LiteralPath $Project -PathType Container)) { Stop-Usage '-Project needs an existing directory' }
  $Project = (Resolve-Path -LiteralPath $Project).Path
}

$profileLines = @(Get-Content -LiteralPath (Join-Path $Root 'skills/profiles.txt') |
  Where-Object { $_ -notmatch '^#' } |
  ForEach-Object { , @($_.Trim() -split '\s+') } |
  Where-Object { $_.Count -eq 2 })
$profileList = @(($Skills -join ',').Split(',') | Where-Object { $_ })
if ($profileList.Count -eq 0) { Stop-Usage '-Skills needs a list of profiles, or none' }
if ($profileList -contains 'none') { $profileList = @() }
foreach ($p in $profileList) {
  if (-not ($profileLines | Where-Object { $_[0] -ceq $p })) { Stop-Usage "unknown skill profile: $p" }
}
$allSkills = @($profileLines | ForEach-Object { $_[1] } | Sort-Object -Unique)
$skillList = @($profileLines | Where-Object { $profileList -ccontains $_[0] } | ForEach-Object { $_[1] } | Sort-Object -Unique)

$homeDir = Get-Home
$targets = @()
if ($Global) {
  if ($hostList -contains 'codex') { $targets += , @((Join-Path (Get-EnvOr 'CODEX_HOME' (Join-Path $homeDir '.codex')) 'AGENTS.md'), 'rules') }
  if ($hostList -contains 'claude') { $targets += , @((Join-Path (Get-EnvOr 'CLAUDE_CONFIG_DIR' (Join-Path $homeDir '.claude')) 'CLAUDE.md'), 'rules') }
  if ($hostList -contains 'copilot') { $targets += , @((Join-Path (Get-EnvOr 'COPILOT_HOME' (Join-Path $homeDir '.copilot')) 'copilot-instructions.md'), 'rules') }
  if ($hostList -contains 'kiro') { $targets += , @((Join-Path (Get-EnvOr 'KIRO_HOME' (Join-Path $homeDir '.kiro')) 'steering/AGENTS.md'), 'rules') }
  if ($hostList -contains 'opencode') { $targets += , @((Join-Path (Get-EnvOr 'XDG_CONFIG_HOME' (Join-Path $homeDir '.config')) 'opencode/AGENTS.md'), 'rules') }
} else {
  $targets += , @((Join-Path $Project 'AGENTS.md'), 'rules')
  if ($hostList -contains 'claude') { $targets += , @((Join-Path $Project 'CLAUDE.md'), 'import') }
}

# Codex, Copilot CLI and OpenCode read .agents/skills. Claude Code and Kiro
# each read their own folder.
$base = if ($Global) { $homeDir } else { $Project }
$claudeDir = if ($Global) { Get-EnvOr 'CLAUDE_CONFIG_DIR' (Join-Path $homeDir '.claude') } else { Join-Path $Project '.claude' }
$kiroDir = if ($Global) { Get-EnvOr 'KIRO_HOME' (Join-Path $homeDir '.kiro') } else { Join-Path $Project '.kiro' }
$skillRoots = @()
if ($skillList.Count -gt 0) {
  if ($hostList -contains 'codex' -or $hostList -contains 'copilot' -or $hostList -contains 'opencode') { $skillRoots += Join-Path $base '.agents/skills' }
  if ($hostList -contains 'claude') { $skillRoots += Join-Path $claudeDir 'skills' }
  if ($hostList -contains 'kiro') { $skillRoots += Join-Path $kiroDir 'skills' }
}

$blocks = @{
  rules = $BEGIN + $LF + (Read-Text (Join-Path $Root 'rules/AGENTS.md')) + $END + $LF
  import = $BEGIN + $LF + '@AGENTS.md' + $LF + $END + $LF
}

$status = 0
if (-not $NoRules) {
  foreach ($entry in $targets) {
    $target = $entry[0]; $block = $blocks[$entry[1]]
    if ($Check) {
      if (-not (Test-HasBlock $target)) { Write-Output "MISSING:   $target"; $status = 1; continue }
      try { $composed = Get-Composed $target $block } catch { Write-Output "MALFORMED: $target"; $status = 1; continue }
      if (Test-SameBytes $target $composed) { Write-Output "ok:        $target" }
      else { Write-Output "DRIFT:     $target"; $status = 1 }
    } elseif ($Remove) {
      if (-not (Test-HasBlock $target)) { Write-Output "absent:    $target"; continue }
      try { $rest = Get-Composed $target '' } catch {
        [Console]::Error.WriteLine("refused:   $target (AGENT-RULES:BEGIN without AGENT-RULES:END)"); $status = 1; continue
      }
      if ($rest -match '\S') { Write-TextAtomic $target $rest; Write-Output "removed:   block in $target" }
      else { Remove-Item -LiteralPath $target; Write-Output "removed:   $target" }
    } else {
      if (Test-HasBlock $target) {
        try { $composed = Get-Composed $target $block } catch {
          [Console]::Error.WriteLine("refused:   $target (AGENT-RULES:BEGIN without AGENT-RULES:END)"); $status = 1; continue
        }
      } elseif (Test-Path -LiteralPath $target) { $composed = (Read-Text $target) + $LF + $block }
      else { $composed = $block }
      if (Test-SameBytes $target $composed) { Write-Output "unchanged: $target"; continue }
      Write-TextAtomic $target $composed
      Write-Output "wrote:     $target"
    }
  }
}

$action = if ($Check) { 'check' } elseif ($Remove) { 'remove' } else { 'write' }
foreach ($skillRoot in $skillRoots) {
  $oldHashes = Get-Legacy $skillRoot
  foreach ($name in $skillList) {
    $dest = Join-Path $skillRoot $name
    $src = Join-Path $Root "skills/$name"
    $state = Get-SkillState $dest $oldHashes
    switch ("${action}:$state") {
      { $_ -like '*:unowned' } {
        if ($action -eq 'remove') { Write-Output "skipped:   $dest (not installed by Sentinel)" }
        else { [Console]::Error.WriteLine("refused:   $dest (not installed by Sentinel; move it away first)"); $status = 1 }
      }
      { $_ -like '*:changed' } { [Console]::Error.WriteLine("refused:   $dest (changed after install)"); $status = 1 }
      'write:missing' {
        New-Item -ItemType Directory -Path $skillRoot -Force | Out-Null
        Copy-Skill $src $dest; Write-Output "installed: $dest"
      }
      { $_ -in 'write:owned', 'write:legacy' } {
        if ($state -eq 'owned' -and (Get-Manifest $dest) -ceq (Get-Manifest $src)) { Write-Output "unchanged: $dest" }
        else { Copy-Skill $src $dest; Write-Output "updated:   $dest" }
      }
      'check:missing' { Write-Output "MISSING:   $dest"; $status = 1 }
      'check:legacy' { Write-Output "LEGACY:    $dest (from Sentinel v0.2.0)"; $status = 1 }
      'check:owned' {
        if ((Get-Manifest $dest) -ceq (Get-Manifest $src)) { Write-Output "ok:        $dest" }
        else { Write-Output "DRIFT:     $dest"; $status = 1 }
      }
      'remove:missing' { Write-Output "absent:    $dest" }
      { $_ -in 'remove:owned', 'remove:legacy' } { Remove-Item -LiteralPath $dest -Recurse -Force; Write-Output "removed:   $dest" }
    }
  }
  # A skill that Sentinel no longer ships leaves the machine with the next run.
  if (-not (Test-Path -LiteralPath $skillRoot)) { continue }
  $names = New-Object 'System.Collections.Generic.SortedSet[string]' -ArgumentList ([StringComparer]::Ordinal)
  foreach ($folder in @(Get-ChildItem -LiteralPath $skillRoot -Directory -Force | Where-Object { -not $_.Name.StartsWith('.') })) {
    if (Test-Path -LiteralPath (Join-Path $folder.FullName $Marker) -PathType Leaf) { [void]$names.Add($folder.Name) }
  }
  foreach ($name in $oldHashes.Keys) { [void]$names.Add($name) }
  foreach ($name in $names) {
    if ($allSkills -ccontains $name) { continue }
    $dest = Join-Path $skillRoot $name
    $state = Get-SkillState $dest $oldHashes
    if ($state -eq 'missing') { continue }
    if ($action -eq 'check') { Write-Output "RETIRED:   $dest"; $status = 1 }
    elseif ($state -in 'owned', 'legacy') { Remove-Item -LiteralPath $dest -Recurse -Force; Write-Output "removed:   $dest (retired)" }
    else { [Console]::Error.WriteLine("refused:   $dest (retired, but changed after install)"); $status = 1 }
  }
  # Remove the v0.2.0 list when each folder in it has a marker or is gone.
  $legacyPath = Join-Path $skillRoot $Legacy
  if ($action -ne 'check' -and (Test-Path -LiteralPath $legacyPath -PathType Leaf)) {
    $left = @($oldHashes.Keys | Where-Object {
      (Test-Path -LiteralPath (Join-Path $skillRoot $_) -PathType Container) -and
      -not (Test-Path -LiteralPath (Join-Path (Join-Path $skillRoot $_) $Marker) -PathType Leaf)
    })
    if ($left.Count -eq 0) { Remove-Item -LiteralPath $legacyPath -Force; Write-Output "removed:   $legacyPath" }
  }
}

$codexOverride = Join-Path (Get-EnvOr 'CODEX_HOME' (Join-Path $homeDir '.codex')) 'AGENTS.override.md'
if (-not $NoRules -and $Global -and ($hostList -contains 'codex') -and (Test-Path -LiteralPath $codexOverride)) {
  Write-Output "warning: Codex reads $codexOverride instead of AGENTS.md in that directory."
}
exit $status
