$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot
if (-not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
    throw 'Dependências não encontradas. Execute instalacao\instalar-windows.ps1 primeiro.'
}

$port = if ($env:PORT) { $env:PORT } else { '8001' }
$envPath = Join-Path $projectRoot '.env'
if (-not $env:PORT -and (Test-Path $envPath)) {
    $portLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^PORT=\d+$' } | Select-Object -First 1
    if ($portLine) { $port = $portLine.Substring(5) }
}
$url = "http://localhost:$port"
$serverReady = $false
try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null; $serverReady = $true } catch { }

if (-not $serverReady) {
    Write-Host "Iniciando o servidor em $url ..."
    Start-Process -FilePath $env:ComSpec -ArgumentList '/c', 'npm start' -WorkingDirectory $projectRoot -WindowStyle Hidden
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Seconds 1
        try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null; $serverReady = $true; break } catch { }
    }
}

if (-not $serverReady) { throw "O servidor não respondeu em $url. Verifique a instalação e tente novamente." }
Start-Process $url
Write-Host "SAB aberto no navegador padrão: $url"
