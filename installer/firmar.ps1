param(
 [Parameter(Mandatory=$true)][string]$Installer,
 [Parameter(Mandatory=$true)][string]$CertificateThumbprint,
 [string]$SignTool='signtool.exe',
 [Uri]$TimestampUrl='https://timestamp.digicert.com'
)
$ErrorActionPreference='Stop'
if(!(Test-Path -LiteralPath $Installer -PathType Leaf) -or [IO.Path]::GetExtension($Installer) -ne '.exe'){throw 'Selecciona el EXE final.'}
if($CertificateThumbprint -notmatch '^[a-fA-F0-9]{40}$'){throw 'Huella de certificado no valida.'}
if($TimestampUrl.Scheme -ne 'https' -or $TimestampUrl.UserInfo){throw 'El servicio de sello de tiempo debe usar HTTPS.'}
if(!(Get-Command $SignTool -ErrorAction SilentlyContinue)){throw 'No se encontro SignTool. Instala las herramientas de firma del SDK de Windows o indica -SignTool.'}
& $SignTool sign /sha1 $CertificateThumbprint /s My /fd SHA256 /tr $TimestampUrl.AbsoluteUri /td SHA256 $Installer
if($LASTEXITCODE -ne 0){throw 'No se pudo firmar el instalador.'}
& $SignTool verify /pa /all $Installer
if($LASTEXITCODE -ne 0){throw 'La firma no supero la verificacion.'}
$hash=(Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
($hash+'  '+[IO.Path]::GetFileName($Installer)) | Set-Content ($Installer+'.sha256') -Encoding ASCII
$manifestPath=$Installer+'.release.json'
if(Test-Path -LiteralPath $manifestPath){
 $manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
 $manifest.sha256=$hash
 $manifest | ConvertTo-Json | Set-Content $manifestPath -Encoding UTF8
}
Write-Host 'Instalador firmado y SHA-256 actualizado. Publica este EXE y este hash.'
