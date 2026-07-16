# 十天干 · 十二时辰 · 二十四节气 道乐批量生成（mmx CLI，RPM=3 限流）
# 运行：powershell -File scripts/gen-cycles-music.ps1

$common = @{
    genre = "Chinese traditional Taoist meditation"
    tempo = "slow"
    avoid = "vocals, modern electronic, western pop"
    useCase = "ambient background music for Taoist scripture reading"
}

function Invoke-MmxMusic($file, $prompt, $instruments, $mood) {
    $out = "public/audio/$file"
    if (Test-Path $out) { Write-Host "[skip] $out"; return }
    Write-Host "[gen] $file ..."
    $maxRetries = 3
    for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
        if ($attempt -gt 1) { Write-Host "[retry $attempt/$maxRetries] $file ..."; Start-Sleep -Seconds 35 }
        mmx music generate `
            --prompt $prompt `
            --instrumental `
            --genre $common.genre `
            --mood $mood `
            --instruments $instruments `
            --tempo $common.tempo `
            --use-case $common.useCase `
            --avoid $common.avoid `
            --timeout 280 `
            --out $out --quiet --non-interactive
        if ($LASTEXITCODE -eq 0 -and (Test-Path $out)) {
            Write-Host "[done] $out"
            break
        }
        Write-Host "[fail] $file attempt $attempt exit=$LASTEXITCODE"
        if ($attempt -eq $maxRetries) { Write-Host "[give-up] $file" }
    }
    Start-Sleep -Seconds 25
}

New-Item -ItemType Directory -Force -Path public/audio | Out-Null

Write-Host "=== 十天干 ==="
$tiangan = @(
    @{ file="tiangan-jia.mp3"; prompt="Taoist music for Heavenly Stem Jia (甲), yang Wood, spring dawn. Guqin and xiao, vigorous sprouting energy, jia wood rising like morning sun through pine forest."; instruments="guqin, xiao"; mood="vigorous, fresh" },
    @{ file="tiangan-yi.mp3"; prompt="Taoist music for Heavenly Stem Yi (乙), yin Wood, gentle vine and flower. Soft plucked strings, flexible bending melodies, yi wood nurturing and winding."; instruments="pipa plucks, soft strings"; mood="gentle, flexible" },
    @{ file="tiangan-bing.mp3"; prompt="Taoist music for Heavenly Stem Bing (丙), yang Fire, bright noon sun. Ritual drums and bright gong, radiant ascending flame, bing fire illuminating the altar."; instruments="gong, ritual drums"; mood="bright, radiant" },
    @{ file="tiangan-ding.mp3"; prompt="Taoist music for Heavenly Stem Ding (丁), yin Fire, candle and lamp flame. Hand bells and soft flame textures, ding fire steady and contemplative."; instruments="hand bells, soft percussion"; mood="warm, contemplative" },
    @{ file="tiangan-wu.mp3"; prompt="Taoist music for Heavenly Stem Wu (戊), yang Earth, mountain plateau. Xun ocarina and sheng, vast stable drone, wu earth carrying all things."; instruments="xun, sheng, drone"; mood="vast, stable" },
    @{ file="tiangan-ji.mp3"; prompt="Taoist music for Heavenly Stem Ji (己), yin Earth, fertile field and garden. Warm mellow tones, nurturing soil, ji earth cultivating and nourishing."; instruments="xun, mellow strings"; mood="nurturing, mellow" },
    @{ file="tiangan-geng.mp3"; prompt="Taoist music for Heavenly Stem Geng (庚), yang Metal, autumn harvest blade. Bronze bells and qing stones, sharp clear metallic resonance, geng metal cutting through mist."; instruments="bronze bells, qing stones"; mood="sharp, clear" },
    @{ file="tiangan-xin.mp3"; prompt="Taoist music for Heavenly Stem Xin (辛), yin Metal, refined jewelry and dew. Delicate chime patterns, xin metal subtle and polished like morning frost."; instruments="delicate chimes, singing bowl"; mood="refined, delicate" },
    @{ file="tiangan-ren.mp3"; prompt="Taoist music for Heavenly Stem Ren (壬), yang Water, great river and ocean. Guzheng flowing waves, ren water vast and powerful yet deep."; instruments="guzheng, deep water ambience"; mood="vast, flowing" },
    @{ file="tiangan-gui.mp3"; prompt="Taoist music for Heavenly Stem Gui (癸), yin Water, rain dew and spring. Dongxiao and soft rain texture, gui water quiet seeping and nourishing."; instruments="dongxiao, soft rain texture"; mood="quiet, nourishing" }
)
foreach ($t in $tiangan) { Invoke-MmxMusic $t.file $t.prompt $t.instruments $t.mood }

Write-Host "=== 十二时辰 ==="
$shichen = @(
    @{ file="shichen-zi.mp3"; prompt="Taoist music for Zi hour (子时 23-1), deep midnight, water element. Profound silence, guzheng harmonics in darkness, yin at its peak, meditation before sleep."; instruments="guzheng harmonics, deep silence"; mood="profound, dark" },
    @{ file="shichen-chou.mp3"; prompt="Taoist music for Chou hour (丑时 1-3), ox tending, earth stabilizing. Low xun drone, slow steady pulse like earth breathing in deep night."; instruments="xun, low drone"; mood="steady, deep" },
    @{ file="shichen-yin.mp3"; prompt="Taoist music for Yin hour (寅时 3-5), tiger awakening, wood rising. First light through bamboo, xiao awakening melody, dawn qi gathering."; instruments="xiao, light percussion"; mood="awakening, rising" },
    @{ file="shichen-mao.mp3"; prompt="Taoist music for Mao hour (卯时 5-7), rabbit at sunrise, pure morning. Bright guqin clarity, sun rising over eastern hills, fresh qi of daybreak."; instruments="guqin, morning bells"; mood="fresh, bright" },
    @{ file="shichen-chen.mp3"; prompt="Taoist music for Chen hour (辰时 7-9), dragon cloud gathering, yang expanding. Expansive orchestral Chinese tones, clouds parting, active morning temple life."; instruments="sheng, expansive strings"; mood="expansive, active" },
    @{ file="shichen-si.mp3"; prompt="Taoist music for Si hour (巳时 9-11), snake sun climbing, fire warming. Warm ascending melodies, sun at mid-morning, incense rising steadily."; instruments="warm strings, light gong"; mood="warm, ascending" },
    @{ file="shichen-wu.mp3"; prompt="Taoist music for Wu hour (午时 11-13), horse at solar noon, fire peak. Ceremonial drums at zenith, yang at maximum, noon offering ritual energy."; instruments="ceremonial drums, gong"; mood="peak, ceremonial" },
    @{ file="shichen-wei.mp3"; prompt="Taoist music for Wei hour (未时 13-15), goat afternoon ease, earth digesting. Gentle mellow afternoon, sheng harmonies, yang beginning to soften."; instruments="sheng, mellow plucks"; mood="ease, mellow" },
    @{ file="shichen-shen.mp3"; prompt="Taoist music for Shen hour (申时 15-17), monkey metal hour, qi converging. Clear metallic bianzhong tones, afternoon light slanting, gathering and refining."; instruments="bianzhong, clear tones"; mood="clear, refining" },
    @{ file="shichen-you.mp3"; prompt="Taoist music for You hour (酉时 17-19), rooster sunset, metal contracting. Golden hour resonance, sunset over temple roof, day completing."; instruments="bells, sunset ambience"; mood="golden, completing" },
    @{ file="shichen-xu.mp3"; prompt="Taoist music for Xu hour (戌时 19-21), dog twilight guard, earth closing. Temple gates closing, wooden fish and evening percussion, protective stillness."; instruments="wooden fish, evening drums"; mood="guarding, still" },
    @{ file="shichen-hai.mp3"; prompt="Taoist music for Hai hour (亥时 21-23), pig deep night rest, water returning. Moon over water, dongxiao returning to source, preparing for midnight stillness."; instruments="dongxiao, water moon"; mood="restful, returning" }
)
foreach ($t in $shichen) { Invoke-MmxMusic $t.file $t.prompt $t.instruments $t.mood }

Write-Host "=== 二十四节气 ==="
$jieqi = @(
    @{ file="jieqi-lichun.mp3"; prompt="Taoist music for Lichun (立春), beginning of spring. First thaw, guqin and xiao, tender buds breaking ice, hopeful spring qi awakening."; instruments="guqin, xiao"; mood="hopeful, awakening" },
    @{ file="jieqi-yushui.mp3"; prompt="Taoist music for Yushui (雨水), rain water. Gentle spring rain on temple tiles, soft percussion like raindrops, nourishing and moist."; instruments="soft percussion, rain texture"; mood="moist, gentle" },
    @{ file="jieqi-jingzhe.mp3"; prompt="Taoist music for Jingzhe (惊蛰), insects awaken. Rolling thunder awakening earth, spring thunder distant, life stirring underground."; instruments="distant thunder, drums"; mood="stirring, awakening" },
    @{ file="jieqi-chunfen.mp3"; prompt="Taoist music for Chunfen (春分), spring equinox balance. Equal yin yang, balanced guqin melody, flowers blooming in perfect harmony."; instruments="guqin, balanced strings"; mood="balanced, harmonious" },
    @{ file="jieqi-qingming.mp3"; prompt="Taoist music for Qingming (清明), clear and bright. Pure clear tones like washed sky after rain, xiao over green hills, clarity and remembrance."; instruments="xiao, clear tones"; mood="clear, pure" },
    @{ file="jieqi-guyu.mp3"; prompt="Taoist music for Guyu (谷雨), grain rain. Rain feeding seedlings, gentle guzheng like spring irrigation, abundant growth approaching."; instruments="guzheng, rain"; mood="abundant, nurturing" },
    @{ file="jieqi-lixia.mp3"; prompt="Taoist music for Lixia (立夏), beginning of summer. Warm sun rising, cicada hint, fire qi emerging, sheng bright harmonies."; instruments="sheng, warm tones"; mood="warm, emerging" },
    @{ file="jieqi-xiaoman.mp3"; prompt="Taoist music for Xiaoman (小满), grain filling. Fields ripening, full but not overflowing, mellow summer strings."; instruments="mellow strings"; mood="full, ripening" },
    @{ file="jieqi-mangzhong.mp3"; prompt="Taoist music for Mangzhong (芒种), busy planting. Active rhythmic farming energy, busy yet orderly Taoist work rhythm."; instruments="rhythmic percussion, strings"; mood="active, orderly" },
    @{ file="jieqi-xiazhi.mp3"; prompt="Taoist music for Xiazhi (夏至), summer solstice. Longest day, sun at peak, ceremonial fire energy, drums at solar maximum."; instruments="ceremonial drums, fire gong"; mood="peak, luminous" },
    @{ file="jieqi-xiaoshu.mp3"; prompt="Taoist music for Xiaoshu (小暑), minor heat. Warm breeze through temple courtyard, lazy summer afternoon meditation."; instruments="warm breeze strings"; mood="warm, lazy" },
    @{ file="jieqi-dashu.mp3"; prompt="Taoist music for Dashu (大暑), major heat. Intense summer stillness, cicada drone, deep heat meditation like sitting in shade."; instruments="cicada drone, deep stillness"; mood="intense, still" },
    @{ file="jieqi-liqiu.mp3"; prompt="Taoist music for Liqiu (立秋), beginning of autumn. First cool breeze, metal qi emerging, bianzhong clear autumn tone."; instruments="bianzhong, cool breeze"; mood="cool, emerging" },
    @{ file="jieqi-chushu.mp3"; prompt="Taoist music for Chushu (处暑), heat ending. Relief from summer, gentle transition, evening coolness over lotus pond."; instruments="evening strings, lotus ambience"; mood="relieving, transitional" },
    @{ file="jieqi-bailu.mp3"; prompt="Taoist music for Bailu (白露), white dew. Morning dew on pine needles, crystalline clear tones, autumn purity."; instruments="crystalline chimes"; mood="pure, crystalline" },
    @{ file="jieqi-qiufen.mp3"; prompt="Taoist music for Qiufen (秋分), autumn equinox. Balanced yin yang again, harvest moon, equal day and night meditation."; instruments="balanced guqin"; mood="balanced, harvest" },
    @{ file="jieqi-hanlu.mp3"; prompt="Taoist music for Hanlu (寒露), cold dew. Chilling mornings, deeper autumn, xun low breath in mist."; instruments="xun, mist"; mood="chilling, deep" },
    @{ file="jieqi-shuangjiang.mp3"; prompt="Taoist music for Shuangjiang (霜降), frost descending. First frost on stone steps, sparse bells, autumn nearing winter."; instruments="sparse bells, frost texture"; mood="sparse, descending" },
    @{ file="jieqi-lidong.mp3"; prompt="Taoist music for Lidong (立冬), beginning of winter. First winter stillness, closing energy, warm interior against cold outside."; instruments="warm interior drone"; mood="closing, inward" },
    @{ file="jieqi-xiaoxue.mp3"; prompt="Taoist music for Xiaoxue (小雪), minor snow. Light snow falling on temple roof, quiet white silence beginning."; instruments="quiet snow ambience, xun"; mood="quiet, white" },
    @{ file="jieqi-daxue.mp3"; prompt="Taoist music for Daxue (大雪), major snow. Heavy snow muffling world, profound winter silence, deep meditation."; instruments="muffled deep drone"; mood="profound, muffled" },
    @{ file="jieqi-dongzhi.mp3"; prompt="Taoist music for Dongzhi (冬至), winter solstice. Longest night, yang reborn in depth, midnight temple vigil, returning light."; instruments="midnight bells, deep rebirth"; mood="deep, returning" },
    @{ file="jieqi-xiaohan.mp3"; prompt="Taoist music for Xiaohan (小寒), minor cold. Deep winter austerity, cold clarity, metal and water combined."; instruments="cold clear tones"; mood="austere, clear" },
    @{ file="jieqi-dahan.mp3"; prompt="Taoist music for Dahan (大寒), major cold. Coldest depth before spring, ultimate stillness, ice river under moon."; instruments="ice river, moon silence"; mood="ultimate stillness, deep" }
)
foreach ($t in $jieqi) { Invoke-MmxMusic $t.file $t.prompt $t.instruments $t.mood }

Write-Host "[all-done]"
