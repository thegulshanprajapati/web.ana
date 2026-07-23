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

# Ask for Commit Message
$commitMessage = Read-Host "`nEnter commit message (press Enter for default: 'Update WhatsApp Automation Engine')"
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $commitMessage = "Update WhatsApp Automation Engine - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
}

# Helper function to stage and commit safely
function Safe-Commit {
    param($msg)
    Write-Host "Staging files..." -ForegroundColor Yellow
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
    Invoke-GitCommand -Arguments @("push", "-u", "origin", "main") -FailureMessage "Initial push failed. Please verify GitHub permissions."
}
else {
    Write-Host "`n[1/2] Committing updates..." -ForegroundColor Yellow
    Safe-Commit -msg $commitMessage
    
    Write-Host "[2/2] Pushing changes to remote 'main'..." -ForegroundColor Yellow
    Invoke-GitCommand -Arguments @("push", "origin", "main") -FailureMessage "Push failed. Please verify GitHub permissions."
}

Write-Host "`nGit operations completed successfully!" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit..."
