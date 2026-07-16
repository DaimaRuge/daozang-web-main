# 等待道乐生成完毕 → 补跑缺失 → git push → 触发 Vercel 部署
# 运行：powershell -File scripts/wait-and-deploy.ps1

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$log = Join-Path $root "scripts/deploy.log"
function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $log -Value $line
}

# 与 music-catalog 对应的全部音频文件名
$expected = @(
    @("wuxing-jin","wuxing-mu","wuxing-shui","wuxing-huo","wuxing-tu") | ForEach-Object { "$_.mp3" }
) + @(
    "bagua-qian","bagua-kun","bagua-zhen","bagua-xun","bagua-kan","bagua-li","bagua-gen","bagua-dui"
) | ForEach-Object { "$_.mp3" }
$expected += @("jia","yi","bing","ding","wu","ji","geng","xin","ren","gui") | ForEach-Object { "tiangan-$_.mp3" }
$expected += @("zi","chou","yin","mao","chen","si","wu","wei","shen","you","xu","hai") | ForEach-Object { "shichen-$_.mp3" }
$expected += @(
    "lichun","yushui","jingzhe","chunfen","qingming","guyu","lixia","xiaoman","mangzhong","xiazhi",
    "xiaoshu","dashu","liqiu","chushu","bailu","qiufen","hanlu","shuangjiang","lidong","xiaoxue",
    "daxue","dongzhi","xiaohan","dahan"
) | ForEach-Object { "jieqi-$_.mp3" }
$expected += "daodejing-01.mp3"

function Get-Missing {
    $audioDir = Join-Path $root "public/audio"
    $missing = @()
    foreach ($f in $expected) {
        if (-not (Test-Path (Join-Path $audioDir $f))) { $missing += $f }
    }
    return $missing
}

Log "=== wait-and-deploy started ==="

# 1. 等待当前生成任务结束（检测 gen-cycles.log 或相关进程）
$genLog = Join-Path $root "scripts/gen-cycles.log"
$baguaLog = Join-Path $root "scripts/gen-bagua.log"
$deadline = (Get-Date).AddHours(4)

while ((Get-Date) -lt $deadline) {
    $cyclesDone = (Test-Path $genLog) -and (Select-String -Path $genLog -Pattern "\[all-done\]" -Quiet -ErrorAction SilentlyContinue)
    $baguaDone = (Test-Path $baguaLog) -and (Select-String -Path $baguaLog -Pattern "\[all-done\]" -Quiet -ErrorAction SilentlyContinue)
    # bagua 可能已并入同一 shell；若 cycles 未完成则继续等
    if ($cyclesDone) { break }

    $missing = Get-Missing
    Log "waiting... missing $($missing.Count)/$($expected.Count) tracks"
    Start-Sleep -Seconds 90
}

if (-not (Select-String -Path $genLog -Pattern "\[all-done\]" -Quiet -ErrorAction SilentlyContinue)) {
    Log "WARN: gen-cycles did not report all-done within deadline; proceeding with retry pass"
}

# 2. 补跑缺失（最多两轮）
for ($round = 1; $round -le 2; $round++) {
    $missing = Get-Missing
    if ($missing.Count -eq 0) { Log "all $($expected.Count) tracks present"; break }
    Log "retry round $round : $($missing.Count) missing — running gen scripts"
    & powershell -File (Join-Path $root "scripts/gen-bagua-music.ps1") 2>&1 | Out-File -Append $log
    & powershell -File (Join-Path $root "scripts/gen-cycles-music.ps1") 2>&1 | Out-File -Append $log
    $missing = Get-Missing
    Log "after round $round : $($missing.Count) still missing"
    if ($missing.Count -gt 0 -and $missing.Count -le 20) {
        Log "missing: $($missing -join ', ')"
    }
}

$finalMissing = Get-Missing
$have = $expected.Count - $finalMissing.Count
Log "final: $have / $($expected.Count) tracks"

# 3. git commit & push（含首页、道乐页、脚本与已生成音频）
Log "git add & commit..."
git add app/page.tsx app/music/ lib/music-catalog.ts scripts/gen-*.ps1 scripts/wait-and-deploy.ps1 public/audio/*.mp3

$status = git status --porcelain
if (-not $status) {
    Log "nothing to commit — exit"
    exit 0
}

$body = @"
Expand Taoist music themes (tiangan, shichen, jieqi) and improve homepage contrast.

Generated $have/$($expected.Count) ambient tracks via mmx; Vercel will redeploy on push.
"@
if ($finalMissing.Count -gt 0) {
    $body += "`nNote: $($finalMissing.Count) tracks still pending generation."
}

git commit -m "Add expanded道乐 themes and homepage readability fixes." -m $body
if ($LASTEXITCODE -ne 0) {
    Log "commit failed exit=$LASTEXITCODE"
    exit 1
}

Log "git push origin main..."
git push origin main
if ($LASTEXITCODE -ne 0) {
    Log "push failed exit=$LASTEXITCODE"
    exit 1
}

Log "=== deploy triggered: https://daozang-web.vercel.app ==="
if ($finalMissing.Count -gt 0) {
    Log "re-run: powershell -File scripts/gen-cycles-music.ps1  then push again"
}
