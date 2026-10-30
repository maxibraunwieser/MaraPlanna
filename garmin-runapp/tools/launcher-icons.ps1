# Launcher icon in every size the supported watches expect (compiler.json -> launcherIcon),
# so the build has no "image will be scaled" warnings. Writes
#   resources-launcher/<W>x<H>/drawables/launcher_icon.png + drawables.xml
# and, between the markers in monkey.jungle and demo.jungle, one resource path per watch.
# Run after tools/products.cjs:   powershell -ExecutionPolicy Bypass -File tools/launcher-icons.ps1
Add-Type -AssemblyName System.Drawing
$app = Split-Path $PSScriptRoot -Parent
$devices = Join-Path $env:APPDATA "Garmin\ConnectIQ\Devices"
$source = Join-Path $app "resources\drawables\launcher_icon.png"
$src = [System.Drawing.Image]::FromFile($source)
$base = "$($src.Width)x$($src.Height)"

$ids = [regex]::Matches((Get-Content -Raw (Join-Path $app "manifest.xml")), 'product id="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$lines = @()
$made = @{}
foreach ($id in $ids) {
  $c = Get-Content -Raw (Join-Path $devices "$id\compiler.json") | ConvertFrom-Json
  if (-not $c.launcherIcon) { continue }
  $w = [int]$c.launcherIcon.width; $h = [int]$c.launcherIcon.height
  $size = "${w}x${h}"
  if ($size -eq $base) { continue }
  $dir = Join-Path $app "resources-launcher\$size\drawables"
  if (-not $made[$size]) {
    New-Item -ItemType Directory -Force $dir | Out-Null
    # Seitenverhältnis behalten, mittig auf transparentem Grund.
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $s = [Math]::Min($w / $src.Width, $h / $src.Height)
    $dw = [int][Math]::Round($src.Width * $s); $dh = [int][Math]::Round($src.Height * $s)
    $g.DrawImage($src, [int](($w - $dw) / 2), [int](($h - $dh) / 2), $dw, $dh)
    $g.Dispose()
    $bmp.Save((Join-Path $dir "launcher_icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Set-Content -Encoding ascii (Join-Path $dir "drawables.xml") "<drawables>`r`n    <bitmap id=""LauncherIcon"" filename=""launcher_icon.png"" />`r`n</drawables>"
    $made[$size] = $true
  }
  $lines += "$id.resourcePath = `$($id.resourcePath);resources-launcher/$size"
}
$src.Dispose()

$begin = "# --- launcher icons per watch (tools/launcher-icons.ps1) ---"
$end = "# --- end launcher icons ---"
foreach ($jungle in "monkey.jungle", "demo.jungle") {
  $path = Join-Path $app $jungle
  $text = (Get-Content -Raw $path) -replace "(?s)\r?\n?$([regex]::Escape($begin)).*?$([regex]::Escape($end))\r?\n?", ""
  $text = $text.TrimEnd() + "`n`n$begin`n" + ($lines -join "`n") + "`n$end`n"
  [System.IO.File]::WriteAllText($path, $text)
}
"$($made.Count) icon sizes, $($lines.Count) watches with their own icon"
