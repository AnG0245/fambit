param(
 [Parameter(Mandatory=$true)][Uri]$ApiBaseUrl,
 [ValidateSet(2024,2025,2026,2027)][int[]]$Years=@(2024),
 [string]$Version='0.5.0',
 [string]$RevitRoot='C:\Program Files\Autodesk',
 [hashtable]$ApiDirectories=@{},
 [hashtable]$TargetFrameworks=@{},
 [string]$InnoCompiler='C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
 [switch]$LocalTest,
 [switch]$PackageInstaller
)
$ErrorActionPreference='Stop'
if([Environment]::OSVersion.Platform -ne 'Win32NT'){throw 'Compila este complemento WPF en Windows.'}
if(!$ApiBaseUrl.IsAbsoluteUri){throw 'La URL de la API debe ser absoluta.'}
$loopback=$ApiBaseUrl.Scheme -eq 'http' -and $ApiBaseUrl.Host -in @('localhost','127.0.0.1','[::1]','::1')
if(($ApiBaseUrl.Scheme -ne 'https' -and !($LocalTest -and $loopback)) -or $ApiBaseUrl.UserInfo -or $ApiBaseUrl.Query -or $ApiBaseUrl.Fragment -or $ApiBaseUrl.AbsolutePath.TrimEnd('/') -ne '/api'){
 throw 'Usa https://tu-servidor/api/. HTTP solo se permite en loopback con -LocalTest.'
}
if($LocalTest -and !$loopback){throw 'La prueba local requiere http://127.0.0.1:8787/api/ o una URL loopback equivalente.'}
if($Version -notmatch '^\d+\.\d+\.\d+$'){throw 'Version invalida: usa tres numeros separados por puntos.'}
$Years=@($Years | Sort-Object -Unique)
if(!$Years.Count){throw 'Selecciona al menos una version de Revit.'}
if(!(Get-Command dotnet -ErrorAction SilentlyContinue)){throw 'Falta el SDK .NET. Consulta docs/PRUEBA-WINDOWS.md.'}
$sdks=@(& dotnet --list-sdks)
if($LASTEXITCODE -ne 0 -or !$sdks.Count){throw 'Instala el SDK .NET; el runtime instalado con Revit no incluye el compilador.'}
if($PackageInstaller -and !(Test-Path -LiteralPath $InnoCompiler -PathType Leaf)){throw 'Falta Inno Setup 6. Instala el compilador o indica -InnoCompiler.'}
$root=Split-Path $PSScriptRoot -Parent
$artifacts=Join-Path $root 'artifacts'
$runRoot=Join-Path $artifacts ('builds\'+[Guid]::NewGuid().ToString('N'))
$payloadRoot=Join-Path $runRoot 'payload'
$profiles=@()
foreach($year in $Years){
 $api=Join-Path $RevitRoot "Revit $year"
 if($ApiDirectories.ContainsKey($year)){$api=$ApiDirectories[$year]}
 foreach($name in @('RevitAPI.dll','RevitAPIUI.dll')){
  if(!(Test-Path -LiteralPath (Join-Path $api $name) -PathType Leaf)){throw "Falta $name oficial de Revit $year en $api."}
 }
 $framework=if($year -eq 2024){'net48'}elseif($year -eq 2027){'net10.0-windows'}else{'net8.0-windows'}
 if($TargetFrameworks.ContainsKey($year)){$framework=$TargetFrameworks[$year]}
 if(($year -eq 2024 -and $framework -ne 'net48') -or ($year -eq 2027 -and $framework -ne 'net10.0-windows') -or ($year -in @(2025,2026) -and $framework -notin @('net8.0-windows','net10.0-windows'))){throw "Perfil .NET no admitido para Revit $year."}
 $minimumSdk=if($framework -eq 'net10.0-windows'){10}else{8}
 $sdkAvailable=@($sdks | Where-Object {$_ -match '^(\d+)\.' -and [int]$Matches[1] -ge $minimumSdk}).Count -gt 0
 if(!$sdkAvailable){throw "Falta un SDK .NET $minimumSdk o posterior para Revit $year."}
 if($framework -eq 'net48'){
  $pack=Join-Path ${env:ProgramFiles(x86)} 'Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8\mscorlib.dll'
  if(!(Test-Path -LiteralPath $pack)){throw 'Para Revit 2024 instala el Developer Pack de .NET Framework 4.8 (no solo el runtime).'}
 }
 $profiles+=@{year=$year;api=$api;framework=$framework}
}
foreach($profile in $profiles){
 $year=$profile.year;$api=$profile.api;$framework=$profile.framework
 $output=Join-Path $payloadRoot "$year"
 New-Item -ItemType Directory -Force $output | Out-Null
 $intermediate=(Join-Path $runRoot "obj\$year").Replace('\','/')+'/'
 Write-Host "Compilando Revit $year / $framework..."
 & dotnet build (Join-Path $root 'revit\NubeBIM\NubeBIM.csproj') -c Release "-p:RevitYear=$year" "-p:RevitApiDir=$api" "-p:TargetFramework=$framework" "-p:Version=$Version" "-p:LocalTest=$($LocalTest.IsPresent.ToString().ToLowerInvariant())" "-p:BaseIntermediateOutputPath=$intermediate" -o $output | Out-Host
 if($LASTEXITCODE -ne 0){throw "Fallo la compilacion para Revit $year. No se creo el instalador."}
 Copy-Item -LiteralPath (Join-Path $root 'revit\NubeBIM\Fonts\OFL-Inter.txt') -Destination $output
 if(!(Test-Path -LiteralPath (Join-Path $output 'NubeBIM.dll'))){throw "No se genero la DLL de Revit $year."}
 @{apiBaseUrl=$ApiBaseUrl.AbsoluteUri.TrimEnd('/')+'/'} | ConvertTo-Json | Set-Content (Join-Path $output 'nube.config.json') -Encoding UTF8
 @{version=$Version;revit=$year;framework=$framework;localTest=$LocalTest.IsPresent;revitApiVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $api 'RevitAPI.dll')).FileVersion} | ConvertTo-Json | Set-Content (Join-Path $output 'build-info.json') -Encoding UTF8
}
$installerFile=$null
if($PackageInstaller){
 $name="FAMBIT-Setup-$Version-Revit"+($Years -join '-')
 if($LocalTest){$name+='-PruebaLocal'}
 $installerDir=Join-Path $artifacts 'installer'
 New-Item -ItemType Directory -Force $installerDir | Out-Null
 $arguments=@("/DAppVersion=$Version","/DPayloadRoot=$payloadRoot","/DInstallerName=$name","/O$installerDir")
 foreach($year in $Years){$arguments+="/DRevit$year"}
 $arguments+=(Join-Path $PSScriptRoot 'NubeBIM.iss')
 & $InnoCompiler @arguments | Out-Host
 if($LASTEXITCODE -ne 0){throw 'Fallo la creacion del instalador.'}
 $installerFile=Join-Path $installerDir ($name+'.exe')
 if(!(Test-Path -LiteralPath $installerFile)){throw 'El compilador no produjo el EXE esperado.'}
 $hash=(Get-FileHash -LiteralPath $installerFile -Algorithm SHA256).Hash.ToLowerInvariant()
 ($hash+'  '+[IO.Path]::GetFileName($installerFile)) | Set-Content ($installerFile+'.sha256') -Encoding ASCII
 @{service='FAMBIT';version=$Version;years=@($Years);localTest=$LocalTest.IsPresent;apiBaseUrl=$ApiBaseUrl.AbsoluteUri.TrimEnd('/')+'/';sha256=$hash} | ConvertTo-Json | Set-Content ($installerFile+'.release.json') -Encoding UTF8
 Write-Host "Instalador generado: $installerFile"
}
[pscustomobject]@{Installer=$installerFile;Payload=$payloadRoot;Years=$Years;LocalTest=$LocalTest.IsPresent}
