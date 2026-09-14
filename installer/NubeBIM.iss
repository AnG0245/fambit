#ifndef AppVersion
 #define AppVersion "0.5.0"
#endif
#ifndef PayloadRoot
 #define PayloadRoot "..\artifacts\payload"
#endif
#ifndef InstallerName
 #define InstallerName "FAMBIT-Setup-" + AppVersion
#endif
#ifndef Revit2024
 #ifndef Revit2025
  #ifndef Revit2026
   #ifndef Revit2027
    #error Usa build.ps1 para seleccionar al menos una version de Revit.
   #endif
  #endif
 #endif
#endif
[Setup]
AppId={{A279722C-28DE-4CBE-ACD2-296694936A53}
AppName=FAMBIT
AppVersion={#AppVersion}
AppPublisher=FAMBIT
DefaultDirName={localappdata}\Programs\NubeBIM
DefaultGroupName=FAMBIT
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\artifacts\installer
OutputBaseFilename={#InstallerName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no
[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
[Files]
#ifdef Revit2024
Source: "{#PayloadRoot}\2024\NubeBIM.dll"; DestDir: "{app}\2024"; Flags: ignoreversion; Check: HasRevit('2024')
Source: "{#PayloadRoot}\2024\nube.config.json"; DestDir: "{app}\2024"; Flags: ignoreversion; Check: HasRevit('2024')
Source: "{#PayloadRoot}\2024\build-info.json"; DestDir: "{app}\2024"; Flags: ignoreversion; Check: HasRevit('2024')
Source: "{#PayloadRoot}\2024\OFL-Inter.txt"; DestDir: "{app}\2024"; Flags: ignoreversion; Check: HasRevit('2024')
#endif
#ifdef Revit2025
Source: "{#PayloadRoot}\2025\NubeBIM.dll"; DestDir: "{app}\2025"; Flags: ignoreversion; Check: HasRevit('2025')
Source: "{#PayloadRoot}\2025\nube.config.json"; DestDir: "{app}\2025"; Flags: ignoreversion; Check: HasRevit('2025')
Source: "{#PayloadRoot}\2025\build-info.json"; DestDir: "{app}\2025"; Flags: ignoreversion; Check: HasRevit('2025')
Source: "{#PayloadRoot}\2025\OFL-Inter.txt"; DestDir: "{app}\2025"; Flags: ignoreversion; Check: HasRevit('2025')
#endif
#ifdef Revit2026
Source: "{#PayloadRoot}\2026\NubeBIM.dll"; DestDir: "{app}\2026"; Flags: ignoreversion; Check: HasRevit('2026')
Source: "{#PayloadRoot}\2026\nube.config.json"; DestDir: "{app}\2026"; Flags: ignoreversion; Check: HasRevit('2026')
Source: "{#PayloadRoot}\2026\build-info.json"; DestDir: "{app}\2026"; Flags: ignoreversion; Check: HasRevit('2026')
Source: "{#PayloadRoot}\2026\OFL-Inter.txt"; DestDir: "{app}\2026"; Flags: ignoreversion; Check: HasRevit('2026')
#endif
#ifdef Revit2027
Source: "{#PayloadRoot}\2027\NubeBIM.dll"; DestDir: "{app}\2027"; Flags: ignoreversion; Check: HasRevit('2027')
Source: "{#PayloadRoot}\2027\nube.config.json"; DestDir: "{app}\2027"; Flags: ignoreversion; Check: HasRevit('2027')
Source: "{#PayloadRoot}\2027\build-info.json"; DestDir: "{app}\2027"; Flags: ignoreversion; Check: HasRevit('2027')
Source: "{#PayloadRoot}\2027\OFL-Inter.txt"; DestDir: "{app}\2027"; Flags: ignoreversion; Check: HasRevit('2027')
#endif
[UninstallDelete]
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2024\NubeBIM.addin"
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2025\NubeBIM.addin"
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2026\NubeBIM.addin"
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2027\NubeBIM.addin"
[Code]
function IncludedYear(Year: String): Boolean;
begin
 Result := False;
#ifdef Revit2024
 Result := Result or (Year = '2024');
#endif
#ifdef Revit2025
 Result := Result or (Year = '2025');
#endif
#ifdef Revit2026
 Result := Result or (Year = '2026');
#endif
#ifdef Revit2027
 Result := Result or (Year = '2027');
#endif
end;
function HasRevit(Year: String): Boolean;
var Location: String;
begin
 Result := False;
 if not IncludedYear(Year) then exit;
 Result := FileExists(ExpandConstant('{pf}\Autodesk\Revit ' + Year + '\Revit.exe'));
 if not Result then
  if RegQueryStringValue(HKLM64,'SOFTWARE\Autodesk\Revit\' + Year,'InstallationLocation',Location) then
   Result := FileExists(AddBackslash(Location) + 'Revit.exe');
end;
function RevitRunning(): Boolean;
var Locator, Services, Processes: Variant;
begin
 Result := True;
 try
  Locator := CreateOleObject('WbemScripting.SWbemLocator');
  Services := Locator.ConnectServer('', 'root\CIMV2');
  Processes := Services.ExecQuery('SELECT ProcessId FROM Win32_Process WHERE Name=''Revit.exe''');
  Result := Processes.Count > 0;
 except
  MsgBox('No se pudo comprobar si Revit está abierto. Cierra Revit y vuelve a ejecutar el instalador.',mbError,MB_OK);
 end;
end;
function InitializeSetup(): Boolean;
begin
 Result := False;
 if RevitRunning() then begin MsgBox('Cierra todas las ventanas de Revit antes de instalar o actualizar FAMBIT.',mbInformation,MB_OK);exit;end;
 if not (HasRevit('2024') or HasRevit('2025') or HasRevit('2026') or HasRevit('2027')) then begin MsgBox('No se detectó una versión de Revit incluida en este instalador.',mbError,MB_OK);exit;end;
 Result := True;
end;
function InitializeUninstall(): Boolean;
begin
 Result := not RevitRunning();
 if not Result then MsgBox('Cierra Revit antes de desinstalar FAMBIT.',mbInformation,MB_OK);
end;
function XmlEscape(S: String): String;
begin
 StringChangeEx(S,'&','&amp;',True);StringChangeEx(S,'<','&lt;',True);StringChangeEx(S,'>','&gt;',True);Result := S;
end;
procedure WriteManifest(Year: String);
var Folder,Xml: String; Lines: TArrayOfString;
begin
 if not HasRevit(Year) then exit;
 if not FileExists(ExpandConstant('{app}\') + Year + '\NubeBIM.dll') then RaiseException('Falta el complemento compilado para Revit ' + Year + '.');
 Folder := ExpandConstant('{userappdata}\Autodesk\Revit\Addins\') + Year;
 if not ForceDirectories(Folder) then RaiseException('No se pudo crear la carpeta de complementos.');
 Xml := '<?xml version="1.0" encoding="utf-8"?>' + #13#10 +
 '<RevitAddIns><AddIn Type="Application"><Name>FAMBIT</Name><Assembly>' + XmlEscape(ExpandConstant('{app}\') + Year + '\NubeBIM.dll') +
 '</Assembly><AddInId>A279722C-28DE-4CBE-ACD2-296694936A53</AddInId><FullClassName>NubeBIM.App</FullClassName><VendorId>NBIM</VendorId><VendorDescription>FAMBIT</VendorDescription></AddIn></RevitAddIns>';
 SetArrayLength(Lines,1); Lines[0] := Xml;
 if not SaveStringsToUTF8File(Folder + '\NubeBIM.addin',Lines,False) then RaiseException('No se pudo registrar FAMBIT.');
end;
procedure CurStepChanged(CurStep: TSetupStep);
begin
 if CurStep=ssPostInstall then begin WriteManifest('2024');WriteManifest('2025');WriteManifest('2026');WriteManifest('2027');end;
end;
