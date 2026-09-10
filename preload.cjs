const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getLastFile: () => ipcRenderer.invoke('get-last-file'),
    onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data)),
    requestSaveContent: (callback) => {
        ipcRenderer.on('request-save-content', () => callback());
    },
    saveContent: (content) => ipcRenderer.send('save-content', content),
    onExportPNG: (callback) => ipcRenderer.on('export-png', () => callback()),
    savePNG: (dataUrl) => ipcRenderer.send('save-png', dataUrl),
    onFileSaved: (callback) => ipcRenderer.on('file-saved', () => callback())
});
