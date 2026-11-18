$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) {
    throw 'Node.js 20+ e npm são necessários. Instale o Node.js LTS (https://nodejs.org/) e abra um novo PowerShell.'
}
$nodeVersion = (& node --version) -replace '^v', ''
if ([int]($nodeVersion.Split('.')[0]) -lt 20) {
    throw "É necessário Node.js 20 ou superior. Versão encontrada: $nodeVersion"
}

Write-Host 'Instalando as dependências do SAB...'
& $npm.Source install
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências com npm.' }

function ConvertFrom-SecureInput($secureValue) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$first = Read-Host 'Crie a senha secreta de recuperação do administrador' -AsSecureString
$second = Read-Host 'Confirme a senha de recuperação' -AsSecureString
$adminPassword = ConvertFrom-SecureInput $first
$confirmation = ConvertFrom-SecureInput $second
if ($adminPassword.Length -lt 8 -or $adminPassword.Length -gt 200) {
    throw 'A senha precisa ter entre 8 e 200 caracteres.'
}
if ($adminPassword -cne $confirmation) { throw 'As senhas não coincidem.' }

$envPath = Join-Path $projectRoot '.env'
$lines = @()
if (Test-Path $envPath) {
    $lines = @(Get-Content -LiteralPath $envPath | Where-Object { $_ -notmatch '^ADMIN_RECOVERY_PASSWORD=' })
}
$lines += "ADMIN_RECOVERY_PASSWORD=$adminPassword"
[IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
$adminPassword = $null
$confirmation = $null

$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'SAB Biblioteca.lnk'
$runnerPath = Join-Path $PSScriptRoot 'executar-windows.ps1'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = (Get-Process -Id $PID).Path
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = 'Iniciar o Sistema de Acervo de Biblioteca'
$shortcut.Save()

Write-Host "Instalação concluída. Atalho criado na área de trabalho: $shortcutPath"
