/**
 * Preload script: the renderer (status.html) has no direct Node/Electron access
 * (`contextIsolation: true`) — this is the one narrow, explicit bridge.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("snaptritor", {
  getState: () => ipcRenderer.invoke("get-state"),
  setInspectionPaused: (paused: boolean) => ipcRenderer.invoke("set-inspection-paused", paused),
  setWakePaused: (paused: boolean) => ipcRenderer.invoke("set-wake-paused", paused),
  claimPairingCode: (code: string) => ipcRenderer.invoke("claim-pairing-code", code),
});
