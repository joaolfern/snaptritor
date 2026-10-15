; Custom install/uninstall steps for T013 (RF11, RF12, RF18).
;
; electron-builder's NSIS target calls these macros if defined. customInstall runs after files
; are extracted to $INSTDIR but before the installer exits; customUnInstall runs before removal.
; Both invoke the bundled portable node.exe (never the dev machine's own system Node, never
; Electron's -- see plan.md's packaging decision) against postinstall.ts, which reuses T011's
; already-proven scheduler.ts directly.
;
; WORKER_URL is a placeholder until T016 deploys a real Worker -- same placeholder used
; throughout the rest of this codebase (cli.ts, main.ts) pending that checkpoint.

; extraResources preserves the repo's own packages/collector/native relative layout (see
; electron-builder.yml) so cli.ts, postinstall.ts, src/state.ts and shared/src/* all resolve their
; existing relative imports with zero rewriting.
!define COLLECTOR_DIR "$INSTDIR\resources\packages\collector\native"

!macro customInstall
  CreateDirectory "$APPDATA\Snaptritor"
  nsExec::ExecToLog '"${COLLECTOR_DIR}\node.exe" "${COLLECTOR_DIR}\scripts\postinstall.ts" --install --node-exe "${COLLECTOR_DIR}\node.exe" --cli "${COLLECTOR_DIR}\cli.ts" --state-path "$APPDATA\Snaptritor\state.json" --worker-url "https://snaptritor-worker.example.workers.dev"'
!macroend

!macro customUnInstall
  nsExec::ExecToLog '"${COLLECTOR_DIR}\node.exe" "${COLLECTOR_DIR}\scripts\postinstall.ts" --uninstall'
!macroend
