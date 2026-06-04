; electron-builder NSIS hook — install Ollama, models, Python, ChromaDB during setup
!macro customInstall
  DetailPrint "Installing QS Assistant dependencies (Ollama, models, ChromaDB)..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\app\launcher\install-deps.ps1" -Silent'
  Pop $0
!macroend
