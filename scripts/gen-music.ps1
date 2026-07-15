# 五行道教器乐批量生成（mmx CLI，music-2.6-free RPM=3，顺序执行自然限流）
# 运行：powershell -File scripts/gen-music.ps1

$tracks = @(
    @{
        file = "wuxing-jin.mp3"
        prompt = "Taoist meditation music for the Metal element (金), autumn solemnity. Bronze bells, chime stones (bianqing), singing bowls, sparse and crystalline metallic tones with long decaying resonance, slow and ceremonial, evoking a Taoist temple at dusk in autumn."
        instruments = "bianzhong bronze bells, qing chime stones, singing bowl"
        mood = "solemn, pure, austere"
    },
    @{
        file = "wuxing-mu.mp3"
        prompt = "Taoist meditation music for the Wood element (木), spring vitality. Guqin zither and xiao bamboo flute, gentle sprouting melodies, fresh and breathing, like wind through a bamboo grove at dawn, unhurried Chinese scholarly style."
        instruments = "guqin, xiao bamboo flute"
        mood = "fresh, gentle, growing"
    },
    @{
        file = "wuxing-shui.mp3"
        prompt = "Taoist meditation music for the Water element (水), flowing depth. Guzheng glissandos like mountain streams, dongxiao flute, soft water textures, meandering and meditative, evoking mist over a river in moonlight, deep tranquility."
        instruments = "guzheng, dongxiao flute, soft water ambience"
        mood = "flowing, deep, tranquil"
    },
    @{
        file = "wuxing-huo.mp3"
        prompt = "Taoist ritual music for the Fire element (火), bright ceremonial energy. Taoist ritual drums and gongs, suona accents, rising rhythmic pulses like flame, vigorous yet reverent, an ascending fire offering ceremony in a mountain temple."
        instruments = "Chinese ritual drums, gong, suona"
        mood = "bright, vigorous, ceremonial"
    },
    @{
        file = "wuxing-tu.mp3"
        prompt = "Taoist meditation music for the Earth element (土), grounded stillness. Xun clay ocarina low breathy tones, sheng mouth organ harmonies, slow drone foundation, warm and stable like standing on loess plateau, centered belly-breathing calm."
        instruments = "xun clay ocarina, sheng mouth organ, low drone"
        mood = "grounded, warm, still"
    }
)

New-Item -ItemType Directory -Force -Path public/audio | Out-Null

foreach ($t in $tracks) {
    $out = "public/audio/$($t.file)"
    if (Test-Path $out) { Write-Host "[skip] $out exists"; continue }
    Write-Host "[gen] $($t.file) ..."
    mmx music generate `
        --prompt $t.prompt `
        --instrumental `
        --genre "Chinese traditional Taoist meditation" `
        --mood $t.mood `
        --instruments $t.instruments `
        --tempo slow `
        --use-case "ambient background music for a Taoist scripture reading website" `
        --avoid "vocals, modern electronic sounds, western pop" `
        --out $out --quiet --non-interactive
    if ($LASTEXITCODE -ne 0) { Write-Host "[fail] $($t.file) exit=$LASTEXITCODE" }
    else { Write-Host "[done] $out" }
    # RPM=3 限流：两次请求之间留 25s 余量
    Start-Sleep -Seconds 25
}
Write-Host "[all-done]"
