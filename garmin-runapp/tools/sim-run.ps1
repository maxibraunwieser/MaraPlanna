# Lauf-Simulation im Connect-IQ-Simulator (Demo-Build mit SimRun.mc):
#   powershell -File tools/sim-run.ps1 intervals        # 3 x 400 m mit 60 s Trabpause
#   powershell -File tools/sim-run.ps1 long             # Long Run: 2 km locker, dann 1 km Marathon-Pace
#   powershell -File tools/sim-run.ps1 intervals fr265  # andere Uhr
# Baut den Demo-Build mit gesetztem Demo.SIM (die Zeile wird danach wieder zurückgesetzt), startet ihn im Simulator und schreibt
# die Konsole zusätzlich nach bin/sim-<Szenario>.log. Der Autopilot startet die Einheit selbst; eine Sekunde Lauf dauert 0,25 s.
param(
    [ValidateSet('intervals', 'long')][string]$Scenario = 'intervals',
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
$line = '    const SIM = "";'
if (-not $original.Contains($line)) { throw "Demo.mc: Zeile '$line' nicht gefunden" }
$prg = "bin/sim-$Scenario-$Device.prg"
try {
    [IO.File]::WriteAllText($demo, $original.Replace($line, "    const SIM = `"$Scenario`";"))
    node tools/demo-manifest.cjs | Out-Null
    & "$bin\monkeyc.bat" -f demo.jungle -d $Device -o $prg -y $Key
    if ($LASTEXITCODE -ne 0) { throw 'Build fehlgeschlagen' }
} finally {
    [IO.File]::WriteAllText($demo, $original)
}

if (-not (Get-Process simulator -ErrorAction SilentlyContinue)) {
    Start-Process (Join-Path $bin 'simulator.exe')
    Start-Sleep 8
}
Write-Host "Simulation '$Scenario' auf $Device startet. Konsole: bin/sim-$Scenario.log (Strg+C beendet)"
& "$bin\monkeydo.bat" $prg $Device 2>&1 | Tee-Object -FilePath "bin/sim-$Scenario.log"
