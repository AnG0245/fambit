param(
 [ValidateSet(0,2024,2025,2026,2027)][int]$Year=0,
 [string]$RevitDirectory='',
 [ValidateSet('auto','net48','net8.0-windows','net10.0-windows')][string]$Runtime='auto',
 [string]$InnoCompiler='C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
 [switch]$ServerOnly
)
$ErrorActionPreference='Stop'
if([Environment]::OSVersion.Platform -ne 'Win32NT'){throw 'Ejecuta este asistente en el equipo Windows donde tienes Revit.'}
$root=Split-Path $PSScriptRoot -Parent
Write-Host 'FAMBIT 0.3.0 - Biblioteca para Revit'
if(!(Get-Command node -ErrorAction SilentlyContinue)){throw 'Falta Node.js 24. Descarga oficial: https://nodejs.org/en/download'}
$nodeVersion=& node --version
if($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24\.') {throw 'Esta prueba requiere Node.js 24. Consulta docs/PRUEBA-WINDOWS.md.'}
foreach($required in @('selfhost\dist\index.html','selfhost\service.mjs','selfhost\catalog.mjs')){
 if(!(Test-Path -LiteralPath (Join-Path $root $required))){throw "Falta $required. Usa el ZIP completo o reconstruye el portal como indica README.md."}
}
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,8787)
try{$listener.Start()}catch{throw 'El puerto local 8787 ya esta ocupado. Cierra la otra instancia del servidor antes de continuar.'}finally{$listener.Stop()}
if(!$ServerOnly){
 if(Get-Process -Name Revit -ErrorAction SilentlyContinue){throw 'Cierra Revit antes de compilar e instalar el complemento.'}
 if($Year -eq 0){
  Write-Host 'Versiones previstas: Revit 2024, 2025, 2026 y 2027.'
  $answer=Read-Host 'Que version tienes instalada? Escribe el anio'
  if($answer -notin @('2024','2025','2026','2027')){throw 'Escribe un anio admitido.'}
  $Year=[int]$answer
 }
 if(!$RevitDirectory){
  $RevitDirectory=Join-Path $env:ProgramFiles "Autodesk\Revit $Year"
  if(!(Test-Path -LiteralPath (Join-Path $RevitDirectory 'Revit.exe'))){
   $registration=Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Autodesk\Revit\$Year" -ErrorAction SilentlyContinue
   if($registration.InstallationLocation){$RevitDirectory=$registration.InstallationLocation}
  }
  if(!(Test-Path -LiteralPath (Join-Path $RevitDirectory 'Revit.exe'))){$RevitDirectory=Read-Host "Carpeta que contiene Revit.exe de $Year"}
 }
 if(!(Test-Path -LiteralPath (Join-Path $RevitDirectory 'Revit.exe'))){throw 'No se encontro Revit.exe en la carpeta indicada.'}
 if($Runtime -eq 'auto'){
  $Runtime=if($Year -eq 2024){'net48'}elseif($Year -eq 2027){'net10.0-windows'}else{'net8.0-windows'}
  if($Year -in @(2025,2026)){
   foreach($candidate in @('Revit.runtimeconfig.json','Revit.exe.runtimeconfig.json')){
    $configPath=Join-Path $RevitDirectory $candidate
    if(Test-Path -LiteralPath $configPath){
     $options=(Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).runtimeOptions
     $frameworks=@($options.framework)+@($options.frameworks)
     $versions=@($frameworks | Where-Object {$null -ne $_} | ForEach-Object {[string]$_.version})
     if(@($versions | Where-Object {$_ -match '^10\.'}).Count){$Runtime='net10.0-windows'}
    }
   }
  }
 }
 Write-Host "Perfil seleccionado: Revit $Year / $Runtime. Debe coincidir con tu actualizacion instalada."
 $api=@{};$api[$Year]=$RevitDirectory
 $frameworks=@{};$frameworks[$Year]=$Runtime
 $build=& (Join-Path $PSScriptRoot 'build.ps1') -ApiBaseUrl 'http://127.0.0.1:8787/api/' -Years $Year -ApiDirectories $api -TargetFrameworks $frameworks -InnoCompiler $InnoCompiler -LocalTest -PackageInstaller
 Write-Host "EXE generado: $($build.Installer)"
 Write-Host 'Ejecuta ese instalador y luego abre un proyecto de prueba en Revit.'
 Start-Process -FilePath (Split-Path $build.Installer -Parent)
}
$secret=Read-Host 'Elige la contrasena del administrador local (minimo 20 caracteres)' -AsSecureString
$password=[Net.NetworkCredential]::new('',$secret).Password
if($password.Length -lt 20){throw 'La contrasena debe tener al menos 20 caracteres.'}
$settings=@{
 NUBE_ADMIN_USER='admin';NUBE_ADMIN_PASSWORD=$password;NUBE_ADMIN_OWNER='local-test';
 NUBE_PUBLIC_ORIGIN='http://127.0.0.1:8787';NUBE_LISTEN_HOST='127.0.0.1';PORT='8787';
 NUBE_DATA_DIR=(Join-Path $env:LOCALAPPDATA 'NubeBIM\TestServer')
}
$previous=@{}
try{
 foreach($key in $settings.Keys){$previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process');[Environment]::SetEnvironmentVariable($key,$settings[$key],'Process')}
 Write-Host ''
 Write-Host 'Panel: http://127.0.0.1:8787  |  Usuario: admin'
 Write-Host 'Usa la contrasena que acabas de elegir. Tus cuentas y familias locales anteriores siguen disponibles.'
 Write-Host 'La familia y las cuentas del panel privado de ChatGPT no se sincronizan con esta prueba.'
 Write-Host 'Manten esta ventana abierta durante la prueba. Ctrl+C detiene el servidor.'
 & node (Join-Path $root 'selfhost\server.mjs')
 if($LASTEXITCODE -ne 0){throw 'El servidor termino con un error.'}
}finally{
 foreach($key in $previous.Keys){[Environment]::SetEnvironmentVariable($key,$previous[$key],'Process')}
 $password=$null;$settings.NUBE_ADMIN_PASSWORD=$null;$secret.Dispose()
}
