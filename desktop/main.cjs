"use strict";

const { app, BrowserWindow, net, protocol, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APP_SCHEME = "app";
const APP_ORIGIN = `${APP_SCHEME}://opentrading`;
const distDirectory = path.join(__dirname, "..", "dist");

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  }
]);

function resolveRequest(requestUrl) {
  const { pathname } = new URL(requestUrl);
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  const target = path.resolve(distDirectory, relative === "" ? "index.html" : relative);
  if (target !== distDirectory && !target.startsWith(distDirectory + path.sep)) {
    return null;
  }
  return target;
}

async function handleAppRequest(request) {
  const target = resolveRequest(request.url);
  if (!target) {
    return new Response("Not found", { status: 404 });
  }
  try {
    return await net.fetch(pathToFileURL(target).href);
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function openExternally(url) {
  if (url.startsWith("https://")) {
    shell.openExternal(url);
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 360,
    minHeight: 600,
    backgroundColor: "#07111f",
    title: "OpenTrading",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) {
      event.preventDefault();
      openExternally(url);
    }
  });

  window.loadURL(`${APP_ORIGIN}/index.html`);
  return window;
}

function focusExistingWindow() {
  const [window] = BrowserWindow.getAllWindows();
  if (window) {
    if (window.isMinimized()) {
      window.restore();
    }
    window.focus();
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", focusExistingWindow);

  app.whenReady().then(() => {
    protocol.handle(APP_SCHEME, handleAppRequest);
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
