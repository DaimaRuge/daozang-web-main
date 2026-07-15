# 八卦主题器乐（mmx CLI，RPM=3 限流）
# 运行：powershell -File scripts/gen-bagua-music.ps1

$tracks = @(
    @{ file = "bagua-qian.mp3"; prompt = "Bagua Qian (Heaven): pure yang, vigorous and ascending. Distant celestial drums, bronze bells, clear high tones rising like the sky at dawn, majestic Taoist meditation instrumental."; instruments = "celestial drums, bronze bells" },
    @{ file = "bagua-kun.mp3"; prompt = "Bagua Kun (Earth): pure yin, receptive and nurturing. Xun ocarina, sheng harmonies, deep warm drone, stable and embracing like fertile earth, slow Taoist temple meditation."; instruments = "xun, sheng, low drone" },
    @{ file = "bagua-zhen.mp3"; prompt = "Bagua Zhen (Thunder): arousing energy, spring thunder awakening. Ritual drums with rolling thunder texture, awakening pulse, vigorous yet sacred Taoist ceremonial instrumental."; instruments = "ritual drums, thunder texture" },
    @{ file = "bagua-xun.mp3"; prompt = "Bagua Xun (Wind): gentle penetration, wind through bamboo. Xiao flute flowing melodies, soft breath, penetrating and subtle like wind entering all things."; instruments = "xiao bamboo flute" },
    @{ file = "bagua-kan.mp3"; prompt = "Bagua Kan (Water): abyss and wisdom, water flowing in darkness. Guzheng harmonics, deep resonant tones, mysterious and profound like water in a ravine."; instruments = "guzheng harmonics" },
    @{ file = "bagua-li.mp3"; prompt = "Bagua Li (Fire): clarity and illumination, fire clinging to brightness. Hand bells, light gong, bright ascending melodies like candle flame illuminating a Taoist altar."; instruments = "hand bells, light gong" },
    @{ file = "bagua-gen.mp3"; prompt = "Bagua Gen (Mountain): stillness and stopping, mountain meditation. Wooden fish (muyu), sparse temple percussion, profound silence between notes, sitting in stillness."; instruments = "wooden fish, sparse percussion" },
    @{ file = "bagua-dui.mp3"; prompt = "Bagua Dui (Lake): joy and openness, lake reflecting sky. Pleasant bianzhong chimes, flowing pipa-like plucked tones, joyful yet serene Taoist instrumental."; instruments = "bianzhong chimes, plucked strings" }
)

New-Item -ItemType Directory -Force -Path public/audio | Out-Null

foreach ($t in $tracks) {
    $out = "public/audio/$($t.file)"
    if (Test-Path $out) { Write-Host "[skip] $out"; continue }
    Write-Host "[gen] $($t.file) ..."
    mmx music generate --prompt $t.prompt --instrumental --genre "Chinese Taoist meditation" --instruments $t.instruments --tempo slow --avoid "vocals, electronic" --timeout 280 --out $out --quiet --non-interactive
    if ($LASTEXITCODE -ne 0) { Write-Host "[fail] $($t.file) exit=$LASTEXITCODE" }
    else { Write-Host "[done] $out" }
    Start-Sleep -Seconds 25
}
Write-Host "[all-done]"
