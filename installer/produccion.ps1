param(
 [Uri]$ServerUrl,
 [ValidateSet(0,2024,2025,2026,2027)][int]$Year=0,
 [string]$RevitDirectory,
 [string]$InnoCompiler='C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
)
$ErrorActionPreference='Stop'
if(Get-Process Revit -ErrorAction SilentlyContinue){throw 'Cierra Revit antes de preparar el instalador.'}
if(!$ServerUrl){$ServerUrl=[Uri](Read-Host 'Direccion HTTPS de tu servidor FAMBIT (sin /api)')}
if(!$ServerUrl.IsAbsoluteUri -or $ServerUrl.Scheme -ne 'https' -or $ServerUrl.IsLoopback -or $ServerUrl.UserInfo -or $ServerUrl.Query -or $ServerUrl.Fragment -or $ServerUrl.AbsolutePath -ne '/'){
 throw 'Introduce el origen HTTPS del servidor, sin /api, usuario ni contrasena.'
}
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
Write-Host 'Comprobando el servidor de internet...'
try{$health=Invoke-RestMethod -Uri ([Uri]::new($ServerUrl,'/healthz')) -Method Get -TimeoutSec 60}catch{throw 'No se pudo conectar al servidor. Revisa que este publicado y que la direccion sea correcta.'}
if($health.service -ne 'FAMBIT' -or $health.status -ne 'ok' -or $health.production -ne $true -or $health.apiVersion -ne 1){throw 'El servidor no confirma una API FAMBIT de produccion compatible.'}
if($Year -eq 0){
 $answer=Read-Host 'Anio de Revit que vas a probar (Enter = 2025)'
 if(!$answer){$answer='2025'}
 if($answer -notin @('2024','2025','2026','2027')){throw 'Anio no admitido.'}
 $Year=[int]$answer
}
if(!$RevitDirectory){$RevitDirectory=Join-Path $env:ProgramFiles "Autodesk\Revit $Year"}
if(!(Test-Path -LiteralPath (Join-Path $RevitDirectory 'Revit.exe'))){$RevitDirectory=Read-Host 'Carpeta que contiene Revit.exe'}
if(!(Test-Path -LiteralPath (Join-Path $RevitDirectory 'Revit.exe'))){throw 'No se encontro Revit en esa carpeta.'}
$runtime=if($Year -eq 2024){'net48'}elseif($Year -eq 2027){'net10.0-windows'}else{'net8.0-windows'}
if($Year -in @(2025,2026)){
 foreach($candidate in @('Revit.runtimeconfig.json','Revit.exe.runtimeconfig.json')){
  $path=Join-Path $RevitDirectory $candidate
  if(Test-Path -LiteralPath $path){
   $options=(Get-Content -LiteralPath $path -Raw | ConvertFrom-Json).runtimeOptions
   $frameworks=@($options.framework)+@($options.frameworks)
   if(@($frameworks | Where-Object {$null -ne $_ -and [string]$_.version -match '^10\.'}).Count){$runtime='net10.0-windows'}
  }
 }
}
$apis=@{};$apis[$Year]=$RevitDirectory
$profiles=@{};$profiles[$Year]=$runtime
$build=& (Join-Path $PSScriptRoot 'build.ps1') -ApiBaseUrl ([Uri]::new($ServerUrl,'/api/')) -Years $Year -ApiDirectories $apis -TargetFrameworks $profiles -InnoCompiler $InnoCompiler -PackageInstaller
if(!$build.Installer -or $build.LocalTest){throw 'No se genero un instalador de produccion.'}
Write-Host ''
Write-Host "EXE para validar: $($build.Installer)"
Write-Host 'Este instalador usa el servidor de internet. No necesita el servidor local en la PC del cliente.'
Write-Host 'Antes de vender: prueba instalacion, activacion y carga en otra PC. La firma digital se prepara por separado.'
Start-Process -FilePath (Split-Path $build.Installer -Parent)
