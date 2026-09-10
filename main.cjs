const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disk-cache-dir', path.join(__dirname, '.cache'));
app.commandLine.appendSwitch('disk-cache-size=1');

let mainWindow = null;
let tray = null;
let currentFilePath = null;

function getUserDataPath() {
    return app.getPath('userData');
}

function getLastFile() {
    try {
        const p = path.join(getUserDataPath(), 'last-file.txt');
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    } catch { return null; }
}

function saveLastFile(filePath) {
    try {
        const p = path.join(getUserDataPath(), 'last-file.txt');
        fs.writeFileSync(p, filePath || '', 'utf8');
    } catch {}
}

function createTray() {
    const iconPath = path.join(__dirname, 'icon.ico');
    if (!fs.existsSync(iconPath)) return;
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);
    tray.setToolTip('Pascal → Блок-схема');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Показать', click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Выход', click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        title: 'Pascal → Блок-схема',
        icon: fs.existsSync(path.join(__dirname, 'icon.ico')) ? path.join(__dirname, 'icon.ico') : undefined,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    mainWindow.loadFile('index.html');

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('[RENDERER] Page loaded successfully');
    });

    mainWindow.webContents.on('crashed', () => {
        console.error('[RENDERER] Renderer process crashed!');
    });

    mainWindow.webContents.on('unresponsive', () => {
        console.error('[RENDERER] Renderer process became unresponsive!');
    });

    mainWindow.on('close', (e) => {
        if (!app.isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    buildMenu();
    createTray();
}

function buildMenu() {
    const template = [
        {
            label: 'Файл',
            submenu: [
                {
                    label: 'Открыть...',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => openFileDialog()
                },
                {
                    label: 'Сохранить файл',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => saveFile()
                },
                {
                    label: 'Сохранить как...',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => saveFileAs()
                },
                { type: 'separator' },
                {
                    label: 'Скачать блок-схему PNG',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => mainWindow.webContents.send('export-png')
                },
                { type: 'separator' },
                {
                    role: 'quit', label: 'Выход', click: () => {
                        app.isQuitting = true;
                        app.quit();
                    }
                }
            ]
        },

        {
            label: 'Вид',
            submenu: [
                { role: 'zoomIn', label: 'Приблизить' },
                { role: 'zoomOut', label: 'Отдалить' },

                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Полный экран' }
            ]
        },
        {
            label: 'Справка',
            submenu: [
                {
                    label: 'О программе',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'О программе',
                            message: 'Pascal → Блок-схема',
                            detail: 'Приложение для генерации блок-схем из кода на Pascal.\nВерсия 0.0.1\n\nРазработчики: Усмонов Бежан, Важенин Тимур, Ахроров Дима\nГруппа ИП-301/ВПФ'
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

async function openFileDialog() {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Открыть файл Pascal',
        filters: [
            { name: 'Pascal', extensions: ['pas', 'pp', 'lpr', 'dpr', 'txt'] },
            { name: 'Все файлы', extensions: ['*'] }
        ],
        properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            currentFilePath = filePath;
            saveLastFile(filePath);
            mainWindow.webContents.send('file-opened', { filePath, content });
            updateTitle();
        } catch (err) {
            dialog.showErrorBox('Ошибка', 'Не удалось прочитать файл: ' + err.message);
        }
    }
}

function saveFile() {
    if (currentFilePath) {
        mainWindow.webContents.send('request-save-content');
    } else {
        saveFileAs();
    }
}

async function saveFileAs() {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Сохранить файл',
        defaultPath: currentFilePath || 'program.pas',
        filters: [
            { name: 'Pascal', extensions: ['pas'] },
            { name: 'Все файлы', extensions: ['*'] }
        ]
    });

    if (!result.canceled && result.filePath) {
        currentFilePath = result.filePath;
        saveLastFile(result.filePath);
        mainWindow.webContents.send('request-save-content');
        updateTitle();
    }
}

function updateTitle() {
    const name = currentFilePath ? path.basename(currentFilePath) : 'Новый файл';
    mainWindow.setTitle(`${name} — Pascal → Блок-схема`);
}

ipcMain.handle('get-last-file', () => {
    const lastFile = getLastFile();
    if (lastFile && fs.existsSync(lastFile)) {
        const content = fs.readFileSync(lastFile, 'utf8');
        currentFilePath = lastFile;
        return { filePath: lastFile, content };
    }
    return null;
});

ipcMain.on('save-content', (event, content) => {
    if (currentFilePath) {
        try {
            fs.writeFileSync(currentFilePath, content, 'utf8');
            mainWindow.webContents.send('file-saved');
        } catch (err) {
            dialog.showErrorBox('Ошибка', 'Не удалось сохранить файл: ' + err.message);
        }
    }
});

ipcMain.on('save-png', async (event, dataUrl) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Сохранить блок-схему',
        defaultPath: 'flowchart.png',
        filters: [
            { name: 'PNG', extensions: ['png'] }
        ]
    });

    if (!result.canceled && result.filePath) {
        try {
            const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
            fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
        } catch (err) {
            dialog.showErrorBox('Ошибка', 'Не удалось сохранить PNG: ' + err.message);
        }
    }
});

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (mainWindow) {
            mainWindow.show();
        } else {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
