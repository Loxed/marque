#!/usr/bin/env pwsh

param(
    [switch]$Since,
    [switch]$Copy,
    [switch]$Build,
    [switch]$Select,
    [string[]]$Ext = @(),
    [string[]]$Folders = @()
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path (Join-Path $ScriptDir "..")
$Root = $Root.Path

$ProjectName = Split-Path $Root -Leaf
$Out = Join-Path $Root "$ProjectName`_dump.md"

# ---------------- FOLDER SELECTION MENU ----------------
if ($Select) {

    Write-Host "`nScanning folders..." -ForegroundColor Cyan

    $allFolders = Get-ChildItem $Root -Directory -Recurse |
        Sort-Object FullName |
        ForEach-Object { $_.FullName.Replace($Root + "\", "") }

    if ($allFolders.Count -eq 0) {
        Write-Host "No folders found." -ForegroundColor Yellow
        exit 0
    }

    Write-Host "`nSelect folders to include:`n" -ForegroundColor Green

    for ($i = 0; $i -lt $allFolders.Count; $i++) {
        Write-Host "[$i] $($allFolders[$i])"
    }

    Write-Host ""
    $input = Read-Host "Enter folder numbers (comma-separated, e.g. 0,2,5) or 'all'"

    if ($input.Trim().ToLower() -eq "all") {
        $Folders = @()
    }
    else {
        $indexes = $input -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }

        $Folders = foreach ($i in $indexes) {
            if ($i -match '^\d+$' -and [int]$i -lt $allFolders.Count) {
                $allFolders[[int]$i]
            }
        }
    }

    Write-Host "`nSelected folders:" -ForegroundColor Cyan
    if ($Folders.Count -eq 0) {
        Write-Host "ALL (no folder filter)" -ForegroundColor Yellow
    } else {
        $Folders | ForEach-Object { Write-Host " - $_" }
    }
}

# ---------------- DEFAULT CONFIG ----------------

$DefaultExtensions = @(
    "py","js","jsx","ts","tsx","css","scss","html","yaml","yml","toml",
    "json","sh","bash","rs","go","java","cpp","c","h","cs","rb","php",
    "swift","kt","vue","svelte","mdx","mq"
)

$BuildExtensions = @("spec","cfg","ini","env")

$BuildFilenames = @(
    "Dockerfile","Makefile","docker-compose.yml","docker-compose.yaml",
    ".dockerignore",".gitignore","Procfile","fly.toml","railway.toml",
    "render.yaml","netlify.toml","vercel.json",".env.example"
)

$ExcludeDirs = @(
    ".venv","venv","env","__pycache__",".git",
    "build","dist","out","target","node_modules",
    ".next",".nuxt",".svelte-kit","coverage",".cache"
)

$ExcludeFiles = @(
    "package-lock.json","yarn.lock","pnpm-lock.yaml",
    "Cargo.lock","poetry.lock","*.min.js","*.min.css"
)

# ---------------- EXTENSIONS ----------------
if ($Ext.Count -eq 0) {
    $Ext = $DefaultExtensions
}
if ($Build) {
    $Ext += $BuildExtensions
}

# ---------------- GITIGNORE ----------------
$Gitignore = Join-Path $Root ".gitignore"
$OutputFileName = "$ProjectName`_dump.md"

if (Test-Path $Gitignore) {
    $content = Get-Content $Gitignore
    if ($content -notcontains $OutputFileName) {
        Add-Content $Gitignore ""
        Add-Content $Gitignore $OutputFileName
    }
} else {
    Set-Content $Gitignore $OutputFileName
}

# ---------------- CHANGED FILES ----------------
$ChangedFiles = @()

if ($Since) {
    $Changed = git -C $Root diff --name-only HEAD 2>$null
    $Staged = git -C $Root diff --name-only --cached 2>$null
    $Untracked = git -C $Root ls-files --others --exclude-standard 2>$null

    $ChangedFiles = @($Changed + $Staged + $Untracked) |
        Where-Object { $_ -and $_.Trim() -ne "" } |
        Sort-Object -Unique

    if ($ChangedFiles.Count -eq 0) {
        Write-Host "No changed files."
        exit 0
    }
}

# ---------------- OUTPUT FILE ----------------
"" | Set-Content $Out

# ---------------- MAIN WALK ----------------
Get-ChildItem $Root -Recurse -File |
    Sort-Object FullName |
    ForEach-Object {

        $file = $_.FullName
        $rel = $file.Substring($Root.Length).TrimStart("\","/")

        # exclude dirs
        foreach ($dir in $ExcludeDirs) {
            if ($rel -like "*$dir*") { return }
        }

        # exclude files
        $filename = Split-Path $rel -Leaf
        foreach ($pattern in $ExcludeFiles) {
            if ($filename -like $pattern) { return }
        }

        if ($file -eq $PSCommandPath) { return }
        if ($file -eq $Out) { return }

        # since filter
        if ($Since -and ($ChangedFiles -notcontains $rel)) {
            return
        }

        # folder filter
        if ($Folders.Count -gt 0) {
            $match = $false
            foreach ($f in $Folders) {
                if ($rel.StartsWith($f)) { $match = $true }
            }
            if (-not $match) { return }
        }

        # extension filter
        $ext = [System.IO.Path]::GetExtension($file).TrimStart(".")
        $matchExt = $Ext -contains $ext

        if (-not $matchExt -and $Build) {
            if ($BuildFilenames -contains $filename) {
                $matchExt = $true
            }
        }

        if (-not $matchExt) { return }

        # language map
        $lang = switch ($ext) {
            "py" { "python" }
            "js" { "jsx" }
            "jsx" { "jsx" }
            "ts" { "tsx" }
            "tsx" { "tsx" }
            "sh" { "bash" }
            "bash" { "bash" }
            "rs" { "rust" }
            "go" { "go" }
            "java" { "java" }
            "cpp" { "cpp" }
            "c" { "cpp" }
            "h" { "cpp" }
            "cs" { "csharp" }
            "rb" { "ruby" }
            "swift" { "swift" }
            "kt" { "kotlin" }
            "html" { "html" }
            "css" { "css" }
            "scss" { "css" }
            "yaml" { "yaml" }
            "yml" { "yaml" }
            "toml" { "toml" }
            "json" { "json" }
            default { $ext }
        }

        Add-Content $Out "# $rel"
        Add-Content $Out "```$lang"
        Get-Content $file | Add-Content $Out
        Add-Content $Out "```"
        Add-Content $Out ""
        Add-Content $Out "----"
        Add-Content $Out ""
    }

# ---------------- STATS ----------------
$chars = (Get-Content $Out -Raw).Length
$tokens = [math]::Floor($chars / 4)

Write-Host "`nWritten to $OutputFileName"
Write-Host "~$tokens tokens"

# ---------------- CLIPBOARD ----------------
if ($Copy) {
    Get-Content $Out -Raw | Set-Clipboard
    Write-Host "Copied to clipboard"
}