param([ValidateSet('Configure','Deploy','Test','Release')][string]$Action='Configure')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
 if(!(Get-Command node -ErrorAction SilentlyContinue)){throw 'Instala Node.js 22 LTS, cierra esta ventana y vuelve a abrir el archivo.'}
 if($Action -eq 'Configure'){
  if(!(Get-Command npm -ErrorAction SilentlyContinue)){throw 'No se encontro npm. Reinstala Node.js 22 LTS.'}
  & npm ci --ignore-scripts --prefix (Join-Path $root 'firebase\functions')
  if($LASTEXITCODE -ne 0){throw 'No se pudieron preparar las dependencias de las funciones.'}
  & npm ci --ignore-scripts --prefix (Join-Path $root 'firebase\tooling')
  if($LASTEXITCODE -ne 0){throw 'No se pudo preparar Firebase CLI.'}
  & npx --yes pnpm@11.19.0 install --frozen-lockfile
  if($LASTEXITCODE -ne 0){throw 'No se pudo preparar el panel. Revisa la conexion a internet.'}
  & node firebase/configure.mjs
  if($LASTEXITCODE -ne 0){throw 'No se completo la configuracion.'}
  & node scripts/build-firebase.mjs
  if($LASTEXITCODE -ne 0){throw 'No se pudo compilar el panel.'}
  $config=Get-Content -LiteralPath (Join-Path $root 'firebase\.local-config.json') -Raw | ConvertFrom-Json
  Start-Process -FilePath $config.authenticatorPage
  Write-Host 'Configura tu autenticador y despues ejecuta Publicar-Firebase.cmd.'
 }elseif($Action -eq 'Deploy'){
  & node firebase/deploy.mjs
  if($LASTEXITCODE -ne 0){throw 'No se completo la publicacion. Revisa el mensaje anterior.'}
 }elseif($Action -eq 'Release'){
  Add-Type -AssemblyName System.Windows.Forms
  $dialog=New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title='Selecciona el instalador FAMBIT final, ya probado en Revit'
  $dialog.Filter='Instalador Windows (*.exe)|*.exe'
  $dialog.InitialDirectory=Join-Path $root 'artifacts\installer'
  if($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK){return}
  $signature=Get-AuthenticodeSignature -LiteralPath $dialog.FileName
  if($signature.Status -eq 'NotSigned'){Write-Host 'Este EXE no esta firmado: Windows puede mostrar editor desconocido. Consulta docs/PUBLICAR-FIREBASE.md antes de vender.'}
  elseif($signature.Status -ne 'Valid'){throw 'La firma del EXE no es valida. Verifica el archivo antes de publicarlo.'}
  & node firebase/release.mjs $dialog.FileName
  if($LASTEXITCODE -ne 0){throw 'No se completo la publicacion del instalador.'}
 }else{
  & node scripts/test-firebase.mjs
  if($LASTEXITCODE -ne 0){throw 'Las pruebas no terminaron correctamente. Revisa Node.js 22 y Java 21.'}
 }
}finally{Pop-Location}
