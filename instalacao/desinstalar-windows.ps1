$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ((Split-Path -Leaf $projectRoot) -ne 'sab-biblioteca' -or -not (Test-Path (Join-Path $projectRoot 'package.json')) -or -not (Test-Path (Join-Path $projectRoot 'src\server.js'))) {
    throw 'Não reconheci a pasta do SAB. Nenhum arquivo foi removido.'
}

Write-Host ''
Write-Host 'ATENÇÃO: a desinstalação apagará permanentemente toda esta pasta do SAB.' -ForegroundColor Yellow
Write-Host 'Isso inclui o banco e os backups guardados em data, o arquivo .env com a senha, dependências, código e histórico Git.' -ForegroundColor Yellow
Write-Host 'Antes de continuar, baixe um backup pelo painel Administração e salve-o fora desta pasta.' -ForegroundColor Yellow
Write-Host 'Feche também o servidor, se estiver em execução.' -ForegroundColor Yellow
$confirmation = Read-Host 'Para confirmar a exclusão completa, digite APAGAR SAB'
if ($confirmation -cne 'APAGAR SAB') {
    Write-Host 'Desinstalação cancelada. Nenhum arquivo foi removido.'
    exit 0
}

$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'SAB Biblioteca.lnk'
if (Test-Path $shortcutPath) { Remove-Item -LiteralPath $shortcutPath -Force }

$targetForHelper = $projectRoot.Replace("'", "''")
$helperPath = Join-Path $env:TEMP ("sab-uninstall-{0}.ps1" -f [guid]::NewGuid().ToString('N'))
$helperContent = @"
Start-Sleep -Seconds 2
`$target = '$targetForHelper'
for (`$attempt = 0; `$attempt -lt 20; `$attempt++) {
    try {
        Remove-Item -LiteralPath `$target -Recurse -Force -ErrorAction Stop
        Remove-Item -LiteralPath `$PSCommandPath -Force -ErrorAction SilentlyContinue
        exit 0
    } catch {
        Start-Sleep -Seconds 1
    }
}
"@
[IO.File]::WriteAllText($helperPath, $helperContent, [Text.UTF8Encoding]::new($false))
$shellExe = (Get-Process -Id $PID).Path
Set-Location $env:TEMP
Start-Process -FilePath $shellExe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$helperPath`"" -WindowStyle Hidden
Write-Host 'Atalho removido. A pasta do SAB será apagada em instantes.'
