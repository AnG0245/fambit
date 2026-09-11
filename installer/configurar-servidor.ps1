$ErrorActionPreference='Stop'
if(!(Get-Command node -ErrorAction SilentlyContinue)){throw 'Instala Node.js 24 LTS para preparar la configuracion. Los clientes no lo necesitaran.'}
$root=Split-Path $PSScriptRoot -Parent
$parent=Join-Path $env:LOCALAPPDATA 'FAMBIT\Configuracion-Servidor'
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$destination=Join-Path $parent ([DateTime]::Now.ToString('yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,6))
& node (Join-Path $root 'selfhost\provision.mjs') $destination
if($LASTEXITCODE -ne 0){throw 'No se pudo preparar la configuracion privada.'}
Start-Process -FilePath (Join-Path $destination 'ABRIR-CONFIGURACION.html')
Write-Host 'Se abrio la configuracion privada. Sigue los pasos para anadir FAMBIT a tu autenticador.'
Write-Host 'No envies esa pagina ni el archivo servidor.env al chat o a tus clientes.'
