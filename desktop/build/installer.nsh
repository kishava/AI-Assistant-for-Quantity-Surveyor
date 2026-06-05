; electron-builder NSIS hook — install Ollama, models, Python, ChromaDB during setup
!macro customInstall
  DetailPrint "Installing QS Assistant dependencies (Ollama, models, ChromaDB)..."
  DetailPrint "A progress window will open — internet required, may take 10-30 minutes."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\app\launcher\install-deps.ps1" -ShowWindow'
  Pop $0
  DetailPrint "Dependency installer finished (exit code $0)."
!macroend
