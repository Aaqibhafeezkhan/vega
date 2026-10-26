import { contextBridge } from 'electron'

// M1: no privileged APIs yet. Library, sources and analytics move behind typed IPC in M2+.
contextBridge.exposeInMainWorld('vega', { platform: process.platform })
