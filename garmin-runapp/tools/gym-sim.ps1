# Gym-Simulation im Connect-IQ-Simulator (source/GymSim.mc): das Programm "Push & Pull" (Bankdrücken 3 Sätze, Rudern 3,
# Bizepscurl 2) wie im Studio, in Echtzeit (etwa 9 Minuten).
#   powershell -ExecutionPolicy Bypass -File tools/gym-sim.ps1            # Forerunner 165 Music
#   powershell -ExecutionPolicy Bypass -File tools/gym-sim.ps1 fr265      # andere Uhr
# Baut den Demo-Build mit Demo.PILOT = "gym" (die Zeile wird danach zurückgesetzt), startet den Simulator neu und lädt die App.
# Der Autopilot öffnet das Programm und beginnt; dann läuft das Training von selbst: Gehen,
# Zurechtlegen, acht Sätze, die Karte nach jedem Satz, Pausen, am Ende Speichern. Die Konsole steht in bin/gym.log ("GYM …").
param(
    [string]$Device = 'fr165m',
    [string]$Key = 'C:/Users/User/connectiq/developer_key.der'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$sdk = Get-ChildItem "$env:APPDATA\Garmin\ConnectIQ\Sdks" -Directory | Sort-Object Name -Descending | Select-Object -First 1
$bin = Join-Path $sdk.FullName 'bin'

$demo = Join-Path $root 'source\Demo.mc'
$original = [IO.File]::ReadAllText($demo)
$line = '    const PILOT = "";'
if (-not $original.Contains($line)) { throw "Demo.mc: Zeile '$line' nicht gefunden" }
$prg = "bin/gym-$Device.prg"
try {
    [IO.File]::WriteAllText($demo, $original.Replace($line, '    const PILOT = "gym";'))
    node tools/demo-manifest.cjs | Out-Null
    & "$bin\monkeyc.bat" -f demo.jungle -d $Device -o $prg -y $Key
    if ($LASTEXITCODE -ne 0) { throw 'Build fehlgeschlagen' }
} finally {
    [IO.File]::WriteAllText($demo, $original)
}

Get-Process simulator -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2
Start-Process (Join-Path $bin 'simulator.exe')
Start-Sleep 8
Write-Host "Gym-Simulation auf $Device startet (etwa 9 Minuten). Konsole: bin/gym.log"
& "$bin\monkeydo.bat" $prg $Device 2>&1 | Tee-Object -FilePath "bin/gym.log"
