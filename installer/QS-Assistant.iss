; QS Assistant - Inno Setup script
; Requires Inno Setup 6+ — https://jrsoftware.org/isinfo.php
; Build package first: powershell -File scripts\package-windows.ps1

#define AppName "QS Assistant"
#define AppVersion "1.0.0"
#define AppPublisher "Saegis"
#define AppExeName "QS-Assistant.bat"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\QS Assistant
DefaultGroupName={#AppName}
OutputDir=..\dist\installer
OutputBaseFilename=QS-Assistant-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin

[Files]
Source: "..\dist\QS-Assistant\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"
Name: "{group}\Stop {#AppName}"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\launcher\stop.ps1"""; WorkingDir: "{app}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\launcher\stop.ps1"""; Flags: runhidden

[Messages]
WelcomeLabel2=QS Assistant requires Ollama and ChromaDB. The installer will set up the app; run ollama pull phi3:mini and chroma run separately on first use.
