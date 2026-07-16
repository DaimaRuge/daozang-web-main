# 等待道乐配图全部生成 → 补跑缺失 → git commit & push
# 运行：powershell -File scripts/wait-and-push-music-images.ps1

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$log = Join-Path $root "scripts/push-music-images.log"
function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $log -Value $line
}

$imgDir = Join-Path $root "public/images/music"
$genLog = Join-Path $root "scripts/gen-music-images.log"
$expected = @(
    @("wuxing-jin","wuxing-mu","wuxing-shui","wuxing-huo","wuxing-tu") | ForEach-Object { "$_.jpg" }
) + @(
    @("bagua-qian","bagua-kun","bagua-zhen","bagua-xun","bagua-kan","bagua-li","bagua-gen","bagua-dui") | ForEach-Object { "$_.jpg" }
)
$expected += @("jia","yi","bing","ding","wu","ji","geng","xin","ren","gui") | ForEach-Object { "tiangan-$_.jpg" }
$expected += @("zi","chou","yin","mao","chen","si","wu","wei","shen","you","xu","hai") | ForEach-Object { "shichen-$_.jpg" }
$expected += @(
    "lichun","yushui","jingzhe","chunfen","qingming","guyu","lixia","xiaoman","mangzhong","xiazhi",
    "xiaoshu","dashu","liqiu","chushu","bailu","qiufen","hanlu","shuangjiang","lidong","xiaoxue",
    "daxue","dongzhi","xiaohan","dahan"
) | ForEach-Object { "jieqi-$_.jpg" }

function Get-MissingImages {
    $missing = @()
    foreach ($f in $expected) {
        if (-not (Test-Path (Join-Path $imgDir $f))) { $missing += $f }
    }
    return $missing
}

function Test-GenProcessRunning {
    $p = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'gen-music-images' }
    return [bool]$p
}

Log "=== wait-and-push-music-images started (expect $($expected.Count) images) ==="

# 1. 等待当前 libtv 批量任务结束
$deadline = (Get-Date).AddHours(6)
while ((Get-Date) -lt $deadline) {
    $missing = Get-MissingImages
    $allDoneLog = (Test-Path $genLog) -and (Select-String -Path $genLog -Pattern "\[all-done\]" -Quiet -ErrorAction SilentlyContinue)
    $running = Test-GenProcessRunning

    if ($missing.Count -eq 0 -and $allDoneLog) { break }
    if (-not $running -and (Test-Path $genLog) -and (Select-String -Path $genLog -Pattern "\[summary\]" -Quiet -ErrorAction SilentlyContinue)) {
        Log "gen process finished; $($expected.Count - $missing.Count)/$($expected.Count) images on disk"
        break
    }

    Log "waiting... $($expected.Count - $missing.Count)/$($expected.Count) images; gen-running=$running"
    Start-Sleep -Seconds 120
}

# 2. 补跑缺失（最多 2 轮，跳过已存在）
for ($round = 1; $round -le 2; $round++) {
    $missing = Get-MissingImages
    if ($missing.Count -eq 0) { Log "all $($expected.Count) music images present"; break }
    if (Test-GenProcessRunning) {
        Log "gen still running — skip retry round $round"
        Start-Sleep -Seconds 60
        continue
    }
    Log "retry round $round : $($missing.Count) missing — npx tsx scripts/gen-music-images.ts"
    npx tsx scripts/gen-music-images.ts 2>&1 | Tee-Object -FilePath $genLog -Append
    $missing = Get-MissingImages
    Log "after round $round : $($missing.Count) still missing"
    if ($missing.Count -gt 0 -and $missing.Count -le 15) {
        Log "missing: $($missing -join ', ')"
    }
}

$finalMissing = Get-MissingImages
$have = $expected.Count - $finalMissing.Count
Log "final images: $have / $($expected.Count)"

if ($have -lt $expected.Count) {
    Log "WARN: not all images ready — will still commit what we have"
}

# 3. git commit & push
Log "git add..."
git add app/music/ lib/music-catalog.ts lib/music-image-prompts.ts `
    scripts/gen-music-images.ts scripts/gen-music-images.ps1 `
    scripts/wait-and-push-music-images.ps1 scripts/wait-and-deploy.ps1 `
    public/images/music/*.jpg

$status = git status --porcelain
if (-not $status) {
    Log "nothing to commit — exit"
    exit 0
}

$body = @"
Generate unique libtv ink-wash illustrations for all $have/$($expected.Count) Taoist music tracks.

Each track maps to public/images/music/{theme}-{id}.jpg with theme-specific prompts; no cross-theme image reuse.
"@
if ($finalMissing.Count -gt 0) {
    $body += "`nNote: $($finalMissing.Count) images still pending — re-run scripts/gen-music-images.ps1"
}

git commit -m "Add unique libtv illustrations for Taoist music module." -m $body
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

Log "=== pushed: https://daozang-web.vercel.app/music ==="
if ($finalMissing.Count -gt 0) {
    Log "re-run: powershell -File scripts/gen-music-images.ps1"
}
