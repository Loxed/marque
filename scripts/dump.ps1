# dump_to_md.ps1 -- dump a project's source files into a single markdown file
# for pasting into AI chat contexts.
#
# Usage:
#   .\dump_to_md.ps1                                  # dump everything
#   .\dump_to_md.ps1 src lib                          # only src/ and lib/
#   .\dump_to_md.ps1 -Since                           # only files changed since last commit
#   .\dump_to_md.ps1 -Ext ts,tsx,rs                   # override extensions
#   .\dump_to_md.ps1 -Copy                            # copy result to clipboard
#   .\dump_to_md.ps1 -Build                           # include build/deploy files
#   .\dump_to_md.ps1 src -Since -Copy -Build          # combine freely

param(
    [string[]]$Folders   = @(),
    [string[]]$Ext       = @(),
    [switch]  $Since,
    [switch]  $Copy,
    [switch]  $Build
)

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root        = Split-Path -Parent $ScriptDir
$ProjectName = Split-Path -Leaf $Root
$Out         = Join-Path $Root "${ProjectName}_dump.md"

$DefaultExtensions = @(
    'py','js','jsx','ts','tsx','css','scss',
    'html','yaml','yml','toml','json','sh','bash',
    'rs','go','java','cpp','c','h','cs','rb','php',
    'swift','kt','vue','svelte','mdx','mq'
)

$BuildExtensions = @('spec','cfg','ini','env')

$BuildFilenames = @(
    'Dockerfile','Makefile','docker-compose.yml','docker-compose.yaml',
    '.dockerignore','.gitignore','Procfile','fly.toml','railway.toml',
    'render.yaml','netlify.toml','vercel.json','.env.example'
)

$ExcludeDirs = @(
    '.venv','venv','env','__pycache__','.git',
    'build','dist','out','target','node_modules',
    '.next','.nuxt','.svelte-kit','coverage','.cache'
)

$ExcludeFiles = @('package-lock.json','yarn.lock','pnpm-lock.yaml',
                  'Cargo.lock','poetry.lock')
# Wildcard patterns handled separately
$ExcludeGlobs = @('*.min.js','*.min.css')

# -- Resolve extensions --------------------------------------------------------
$Extensions = if ($Ext.Count -gt 0) { $Ext } else { $DefaultExtensions }
if ($Build) { $Extensions = $Extensions + $BuildExtensions }

# -- Add output filename to .gitignore ----------------------------------------
$OutputFilename = "${ProjectName}_dump.md"
$GitIgnorePath  = Join-Path $Root '.gitignore'

if (Test-Path $GitIgnorePath) {
    $GitIgnoreContent = Get-Content $GitIgnorePath -Raw
    if ($GitIgnoreContent -notmatch "(?m)^$([regex]::Escape($OutputFilename))$") {
        Add-Content $GitIgnorePath "`n$OutputFilename"
        Write-Host "  + Added $OutputFilename to .gitignore"
    }
} else {
    Set-Content $GitIgnorePath $OutputFilename
    Write-Host "  + Created .gitignore with $OutputFilename"
}

# -- If -Since, collect changed files -----------------------------------------
$ChangedFiles = @()
if ($Since) {
    $Unstaged  = git -C $Root diff --name-only HEAD  2>$null
    $Staged    = git -C $Root diff --name-only --cached 2>$null
    $Untracked = git -C $Root ls-files --others --exclude-standard 2>$null

    $ChangedFiles = @($Unstaged) + @($Staged) + @($Untracked) |
                   Where-Object { $_ -ne '' } |
                   Sort-Object -Unique

    if ($ChangedFiles.Count -eq 0) {
        Write-Host '  No changed files since last commit.'
        exit 0
    }
}

# -- Language hint map --------------------------------------------------------
$LangMap = @{
    py     = 'python'
    js     = 'jsx';    jsx = 'jsx'
    ts     = 'tsx';    tsx = 'tsx'
    sh     = 'bash';   bash = 'bash'
    rs     = 'rust'
    go     = 'go'
    java   = 'java'
    cpp    = 'cpp';    c = 'cpp'; h = 'cpp'
    cs     = 'csharp'
    rb     = 'ruby'
    swift  = 'swift'
    kt     = 'kotlin'
    html   = 'html'
    css    = 'css';    scss = 'css'
    yaml   = 'yaml';   yml = 'yaml'
    toml   = 'toml'
    json   = 'json'
    spec   = 'python'; cfg = 'python'
    ini    = 'ini'
    mq     = 'markdown'
}

# -- Dump files ---------------------------------------------------------------
$Sb = [System.Text.StringBuilder]::new()

Get-ChildItem -Path $Root -Recurse -File | Sort-Object FullName | ForEach-Object {
    $File     = $_
    $FullPath = $File.FullName
    $Rel      = $FullPath.Substring($Root.Length).TrimStart('\','/')

    # Normalise to forward slashes for consistent matching
    $RelFwd = $Rel -replace '\\','/'

    # Skip excluded dirs
    $Skip = $false
    foreach ($Dir in $ExcludeDirs) {
        if ($Build -and $Dir -eq '.git') {
            # Block .git/ but allow .github/
            if ($RelFwd -eq '.git' -or $RelFwd.StartsWith('.git/')) {
                $Skip = $true; break
            }
        } else {
            if ($RelFwd -match "(^|/)$([regex]::Escape($Dir))(/|$)") {
                $Skip = $true; break
            }
        }
    }
    if ($Skip) { return }

    # Skip excluded filenames
    $Filename = $File.Name
    if ($ExcludeFiles -contains $Filename) { return }

    # Skip glob patterns (*.min.js, *.min.css)
    foreach ($Glob in $ExcludeGlobs) {
        if ($Filename -like $Glob) { return }
    }

    # Skip this script and the output file
    if ($FullPath -eq $MyInvocation.MyCommand.Path) { return }
    if ($FullPath -eq $Out) { return }

    # If -Since, skip files not in the changed list
    if ($Since -and ($ChangedFiles -notcontains $RelFwd)) { return }

    # If folders were specified, only include files under those folders
    if ($Folders.Count -gt 0) {
        $MatchFolder = $false
        foreach ($Folder in $Folders) {
            $FolderFwd = $Folder -replace '\\','/'
            if ($RelFwd.StartsWith($FolderFwd)) { $MatchFolder = $true; break }
        }
        if (-not $MatchFolder) { return }
    }

    # Check extension match
    $Ext2 = $File.Extension.TrimStart('.')
    $MatchExt = $Extensions -contains $Ext2

    # -Build: also match exact filenames
    if (-not $MatchExt -and $Build) {
        if ($BuildFilenames -contains $Filename) { $MatchExt = $true }
    }

    if (-not $MatchExt) { return }

    # Language hint
    $Lang = if ($LangMap.ContainsKey($Ext2)) { $LangMap[$Ext2] } else { $Ext2 }

    $Content = Get-Content $FullPath -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if ($null -eq $Content) { $Content = '' }

    $null = $Sb.AppendLine("# $RelFwd")
    $null = $Sb.AppendLine('```' + $Lang)
    $null = $Sb.Append($Content)
    if (-not $Content.EndsWith("`n")) { $null = $Sb.AppendLine() }
    $null = $Sb.AppendLine('```')
    $null = $Sb.AppendLine()
    $null = $Sb.AppendLine('----')
    $null = $Sb.AppendLine()
}

$FinalContent = $Sb.ToString()
[System.IO.File]::WriteAllText($Out, $FinalContent, [System.Text.Encoding]::UTF8)

# -- Token estimate -----------------------------------------------------------
$Chars  = [System.IO.FileInfo]::new($Out).Length
$Tokens = [math]::Floor($Chars / 4)

Write-Host "Written to $OutputFilename"
Write-Host "~$Tokens tokens"
if ($Build) {
    Write-Host '  (-Build: included .spec, workflows, Dockerfile, Makefile, etc.)'
}

# -- Copy to clipboard --------------------------------------------------------
if ($Copy) {
    Get-Content $Out -Raw | Set-Clipboard
    Write-Host 'Copied to clipboard'
}