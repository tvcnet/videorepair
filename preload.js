const { contextBridge, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getPathForFile(file) {
        try {
            return webUtils.getPathForFile(file);
        } catch (_) {
            return '';
        }
    }
});

