# Windows PowerShell Git Automation Deployment Script for WhatsApp Automation Engine
# Usage: .\deploy-github.ps1

Write-Host "=============================================" -ForegroundColor Green
Write-Host "    GitHub Auto-Deploy & Push Automation     " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

# Check if git is installed
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git is not installed on this system. Please install Git and try again."
    Read-Host "`nPress Enter to exit..."
    Exit
}

# Determine script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

# Check if .git directory exists
$isInitialized = Test-Path -Path ".git"

# Helper function to run Git and check for failures
function Invoke-GitCommand {
    param(
        [string[]]$Arguments,
        [string]$FailureMessage
    )
    $proc = Start-Process -FilePath "git" -ArgumentList $Arguments -NoNewWindow -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Host "`n[FATAL ERROR] $FailureMessage" -ForegroundColor Red
        Read-Host "`nPress Enter to exit..."
        Exit
    }
}

# Ask for Remote URL if not initialized or remote is missing
$remoteUrl = ""
if (-not $isInitialized) {
    Write-Host "`nInitializing a new Git repository..." -ForegroundColor Yellow
    $remoteUrl = Read-Host "Enter your GitHub Repository HTTPS URL (e.g. https://github.com/user/repo.git)"
    if ([string]::IsNullOrWhiteSpace($remoteUrl)) {
        Write-Error "GitHub Remote Repository URL is required for setup."
        Read-Host "`nPress Enter to exit..."
        Exit
    }
} else {
    # Check current remote URL
    $remoteUrl = git remote get-url origin 2>$null
    if ([string]::IsNullOrWhiteSpace($remoteUrl)) {
        Write-Host "`nNo GitHub remote origin found!" -ForegroundColor Yellow
        $remoteUrl = Read-Host "Enter your GitHub Repository HTTPS URL"
        if ([string]::IsNullOrWhiteSpace($remoteUrl)) {
            Write-Error "GitHub Remote Repository URL is required."
            Read-Host "`nPress Enter to exit..."
            Exit
        }
        Invoke-GitCommand -Arguments @("remote", "add", "origin", $remoteUrl) -FailureMessage "Failed to add remote origin."
    } else {
        Write-Host "`nDetected Remote Origin: $remoteUrl" -ForegroundColor Cyan
    }
}

# Read current version from root package.json
$packageJsonPath = Join-Path $scriptDir "package.json"
$version = "2.0.1"
if (Test-Path $packageJsonPath) {
    $content = Get-Content $packageJsonPath -Raw
    if ($content -match '"version":\s*"([^"]+)"') {
        $version = $Matches[1]
    }
}

Write-Host "`nCurrent Version: $version" -ForegroundColor Cyan

# Ask for version bump option
Write-Host "Select Version Bump option:" -ForegroundColor Yellow
Write-Host "1. Keep current ($version)"
Write-Host "2. Patch bump (e.g., $version -> bump last digit)"
Write-Host "3. Minor bump (e.g., $version -> bump middle digit)"
Write-Host "4. Major bump (e.g., $version -> bump first digit)"
$bumpChoice = Read-Host "Choice [1-4] (default: 1)"

if ([string]::IsNullOrWhiteSpace($bumpChoice)) { $bumpChoice = "1" }

$newVersion = $version
if ($bumpChoice -ne "1") {
    $parts = $version.Split('.')
    if ($parts.Length -eq 3) {
        [int]$major = $parts[0]
        [int]$minor = $parts[1]
        [int]$patch = $parts[2]
        
        switch ($bumpChoice) {
            "2" { $patch += 1 }
            "3" { $minor += 1; $patch = 0 }
            "4" { $major += 1; $minor = 0; $patch = 0 }
        }
        $newVersion = "$major.$minor.$patch"
        
        # Update version in all package.json files
        $jsonFiles = @("package.json", "backend/package.json", "frontend/package.json")
        foreach ($fileRel in $jsonFiles) {
            $filePath = Join-Path $scriptDir $fileRel
            if (Test-Path $filePath) {
                $fileContent = Get-Content $filePath -Raw
                $fileContent = $fileContent -replace '"version":\s*"[^"]+"', "`"version`": `"$newVersion`""
                Set-Content $filePath $fileContent -Encoding utf8
            }
        }
        Write-Host "Version successfully bumped to: v$newVersion" -ForegroundColor Green
    }
}

# Automatically scan changed files for a descriptive commit message
$gitStatus = git status --porcelain
$changedFiles = @()
if ($gitStatus) {
    foreach ($line in $gitStatus) {
        if ($line.Length -gt 3) {
            $file = $line.Substring(3).Trim()
            $changedFiles += [System.IO.Path]::GetFileName($file)
        }
    }
}

# Include the bumped files if version changed
if ($bumpChoice -ne "1") {
    $changedFiles += "package.json"
}

# Unique file list
$uniqueFiles = $changedFiles | Sort-Object -Unique
$fileList = $uniqueFiles -join ", "
if ($fileList.Length -gt 60) {
    $fileList = $fileList.Substring(0, 57) + "..."
}

$defaultMsg = "Release v$newVersion"
if (-not [string]::IsNullOrWhiteSpace($fileList)) {
    $defaultMsg = "Release v$newVersion - Updates in: $fileList"
}

# Ask for Commit Message / Notes
Write-Host "`nGenerated Commit Message:" -ForegroundColor Cyan
Write-Host "  $defaultMsg" -ForegroundColor Gray
$customNote = Read-Host "`nEnter commit notes (or press Enter to use default)"
if ([string]::IsNullOrWhiteSpace($customNote)) {
    $commitMessage = $defaultMsg
} else {
    $commitMessage = "Release v$newVersion - $customNote"
}

# Helper function to stage and commit safely
function Safe-Commit {
    param($msg)
    Write-Host "`nStaging files..." -ForegroundColor Yellow
    Invoke-GitCommand -Arguments @("add", ".") -FailureMessage "Staging files failed."
    
    $status = git status --porcelain
    if ([string]::IsNullOrWhiteSpace($status)) {
        Write-Host "Working tree clean. Nothing to commit." -ForegroundColor Yellow
    } else {
        Write-Host "Creating commit: '$msg'" -ForegroundColor Yellow
        Invoke-GitCommand -Arguments @("commit", "-m", "`"$msg`"") -FailureMessage "Committing changes failed."
    }
}

# Execute Git operations
if (-not $isInitialized) {
    Write-Host "`n[1/4] Running git init..." -ForegroundColor Yellow
    Invoke-GitCommand -Arguments @("init") -FailureMessage "Git initialization failed."
    
    Write-Host "[2/4] Committing files..." -ForegroundColor Yellow
    Safe-Commit -msg $commitMessage
    
    Write-Host "[3/4] Renaming branch to 'main'..." -ForegroundColor Yellow
    Invoke-GitCommand -Arguments @("branch", "-M", "main") -FailureMessage "Renaming branch to 'main' failed."
    
    Write-Host "[4/4] Adding remote origin and pushing..." -ForegroundColor Yellow
    $existingRemote = git remote get-url origin 2>$null
    if ([string]::IsNullOrWhiteSpace($existingRemote)) {
        Invoke-GitCommand -Arguments @("remote", "add", "origin", $remoteUrl) -FailureMessage "Failed to add remote origin."
    } else {
        Invoke-GitCommand -Arguments @("remote", "set-url", "origin", $remoteUrl) -FailureMessage "Failed to update remote origin."
    }
    
    Write-Host "Attempting standard push..." -ForegroundColor Yellow
    $proc = Start-Process -FilePath "git" -ArgumentList @("push", "-u", "origin", "main") -NoNewWindow -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Host "`n[WARNING] Standard push failed. Retrying with Force Push (git push -f)..." -ForegroundColor Yellow
        $procForce = Start-Process -FilePath "git" -ArgumentList @("push", "-u", "-f", "origin", "main") -NoNewWindow -Wait -PassThru
        if ($procForce.ExitCode -ne 0) {
            Write-Host "`n[FATAL ERROR] Force push failed as well. Please verify GitHub permissions." -ForegroundColor Red
            Read-Host "`nPress Enter to exit..."
            Exit
        }
    }
}
else {
    Write-Host "`n[1/2] Committing updates..." -ForegroundColor Yellow
    Safe-Commit -msg $commitMessage
    
    Write-Host "[2/2] Pushing changes to remote 'main'..." -ForegroundColor Yellow
    $proc = Start-Process -FilePath "git" -ArgumentList @("push", "origin", "main") -NoNewWindow -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Host "`n[WARNING] Standard push failed. Retrying with Force Push (git push -f)..." -ForegroundColor Yellow
        $procForce = Start-Process -FilePath "git" -ArgumentList @("push", "-f", "origin", "main") -NoNewWindow -Wait -PassThru
        if ($procForce.ExitCode -ne 0) {
            Write-Host "`n[FATAL ERROR] Force push failed as well. Please verify GitHub permissions." -ForegroundColor Red
            Read-Host "`nPress Enter to exit..."
            Exit
        }
    }
}

Write-Host "`nGit operations completed successfully!" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit..."
