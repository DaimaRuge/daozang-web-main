# 道乐模块专属配图（libtv，59 张独立水墨图）
# 前置：libtv project use 已绑定画布
# 运行：powershell -File scripts/gen-music-images.ps1

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$log = Join-Path $root "scripts/gen-music-images.log"
Write-Host "[music-images] logging to $log"

npx tsx scripts/gen-music-images.ts 2>&1 | Tee-Object -FilePath $log -Append
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "[all-done] music illustrations"
