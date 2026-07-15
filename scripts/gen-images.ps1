# libtv 批量生成道藏配图（主视觉 + 五行），节点顺序创建并等待生成完成
# 前置：目录已 libtv project use 绑定画布
# 运行：powershell -File scripts/gen-images.ps1

$style = "Traditional Chinese ink wash painting (shuimo) on aged xuan rice paper, elegant negative space, muted pine-green and vermilion accents, Song dynasty literati aesthetic, serene Taoist atmosphere, no text, no watermark"

$images = @(
    @{ name = "hero";  ratio = "21:9"; prompt = "A misty Taoist temple complex nestled among towering mountain peaks and ancient pines, a winding stone path, distant cranes flying through clouds. $style" },
    @{ name = "jin";   ratio = "1:1";  prompt = "Metal element (Jin): a bronze ritual bell and chime stones on a stone altar, autumn mountain in background, crisp white mist, cool metallic grey-white tones with one vermilion seal accent. $style" },
    @{ name = "mu";    ratio = "1:1";  prompt = "Wood element (Mu): young bamboo grove and an ancient pine sprouting new needles beside a Taoist hermitage, spring morning light, fresh green ink gradations. $style" },
    @{ name = "shui";  ratio = "1:1";  prompt = "Water element (Shui): a mountain waterfall flowing into a moonlit river with drifting mist, a lone boat, deep blue-black ink washes, flowing rhythmic brushwork. $style" },
    @{ name = "huo";   ratio = "1:1";  prompt = "Fire element (Huo): a Taoist altar with burning incense and candle flames at dusk, warm vermilion and amber glow rising like dancing flame, reverent ceremonial mood. $style" },
    @{ name = "tu";    ratio = "1:1";  prompt = "Earth element (Tu): terraced loess plateau with a small earthen shrine, warm ochre and umber ink tones, grounded horizontal composition, harvest stillness. $style" }
)

$x = 0
foreach ($img in $images) {
    Write-Host "[gen] $($img.name) ..."
    libtv node --x $x --y 0 create "img-$($img.name)" -t image `
        -s "model=Seedream 5.0 Pro" -s "ratio=$($img.ratio)" -s "quality=2K" `
        --prompt $img.prompt --run | Out-File -FilePath "scripts/out-$($img.name).json" -Encoding utf8
    if ($LASTEXITCODE -ne 0) { Write-Host "[fail] $($img.name) exit=$LASTEXITCODE" }
    else { Write-Host "[done] $($img.name)" }
    $x += 480
}
Write-Host "[all-done]"
