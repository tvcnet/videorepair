const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const http = require('http');
const getPort = require('get-port');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            res.resume();
            resolve(res.statusCode || 0);
        });
        req.on('error', reject);
        req.setTimeout(1000, () => req.destroy(new Error('Request timed out')));
    });
}

async function waitForServer(port, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    const url = `http://127.0.0.1:${port}/api/status`;

    while (Date.now() < deadline) {
        if (serverProcess && serverProcess.exitCode != null) {
            throw new Error(`Internal server exited early with code ${serverProcess.exitCode}`);
        }
        try {
            const status = await httpGet(url);
            if (status >= 200 && status < 500) return;
        } catch (_) {
            // Poll until the server is ready or timeout.
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error('Timed out waiting for internal server to start');
}

async function createWindow() {
    try {
        // Find an available port
        const port = await getPort({ port: 8080 });
        console.log(`Starting internal server on port ${port}...`);

        // Start the Express server
        const serverPath = path.join(__dirname, 'server.js');
        serverProcess = spawn(process.execPath, [serverPath], {
            env: { ...process.env, PORT: String(port), ELECTRON_RUN_AS_NODE: '1' },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        serverProcess.stdout?.on('data', (chunk) => {
            process.stdout.write(chunk);
        });
        serverProcess.stderr?.on('data', (chunk) => {
            process.stderr.write(chunk);
        });
        serverProcess.on('error', (err) => {
            console.error('Failed to start internal server:', err);
        });
        serverProcess.on('exit', (code, signal) => {
            console.log(`Internal server exited (code=${code}, signal=${signal || 'none'})`);
        });

        await waitForServer(port);

        mainWindow = new BrowserWindow({
            width: 1100,
            height: 850,
            title: "VideoRepair Pro",
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegration: false, // Security best practice
                contextIsolation: true
            }
        });

        // Disable the default menu bar
        mainWindow.setMenuBarVisibility(false);

        mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
            console.error(`Window failed to load: ${errorCode} ${errorDescription}`);
        });

        // Load the web app
        await mainWindow.loadURL(`http://127.0.0.1:${port}`);

        mainWindow.on('closed', function () {
            mainWindow = null;
        });
    } catch (error) {
        console.error('App startup failed:', error);
        dialog.showErrorBox(
            'VideoRepair Pro Startup Error',
            error && error.message ? error.message : String(error)
        );
        app.quit();
    }
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});

app.on('before-quit', () => {
    // Ensure the background Node process dies when the app closes
    if (serverProcess) {
        serverProcess.kill();
    }
});
