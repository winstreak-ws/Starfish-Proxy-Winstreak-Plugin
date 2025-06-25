const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building executable...');

try {
    execSync('pkg --version', { stdio: 'ignore' });
} catch (err) {
    console.log('Installing pkg...');
    try {
        execSync('npm install -g pkg', { stdio: 'inherit' });
    } catch (installErr) {
        console.error('Failed to install pkg. Please run: npm install -g pkg');
        process.exit(1);
    }
}

const buildDir = path.join(__dirname, 'build');
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir);
}

const pluginsSource = path.join(__dirname, 'plugins');
const pluginsDest = path.join(buildDir, 'plugins');

if (fs.existsSync(pluginsSource)) {
    if (fs.existsSync(pluginsDest)) {
        fs.rmSync(pluginsDest, { recursive: true, force: true });
    }
    fs.cpSync(pluginsSource, pluginsDest, { recursive: true });
}

const configSource = path.join(__dirname, 'config');
const configDest = path.join(buildDir, 'config');

if (fs.existsSync(configSource)) {
    if (fs.existsSync(configDest)) {
        fs.rmSync(configDest, { recursive: true, force: true });
    }
    fs.cpSync(configSource, configDest, { recursive: true });
}

const dataSource = path.join(__dirname, 'data');
const dataDest = path.join(buildDir, 'data');

if (fs.existsSync(dataSource)) {
    if (fs.existsSync(dataDest)) {
        fs.rmSync(dataDest, { recursive: true, force: true });
    }
    fs.cpSync(dataSource, dataDest, { recursive: true });
}

const authCacheSource = path.join(__dirname, 'auth_cache');
const authCacheDest = path.join(buildDir, 'auth_cache');

if (fs.existsSync(authCacheSource)) {
    if (fs.existsSync(authCacheDest)) {
        fs.rmSync(authCacheDest, { recursive: true, force: true });
    }
    fs.cpSync(authCacheSource, authCacheDest, { recursive: true });
}

try {
    execSync('pkg src/proxy.js --target node18-win-x64 --output build/starfish-proxy.exe', { stdio: 'inherit' });
    console.log('Build completed: build/starfish-proxy.exe');
} catch (err) {
    console.error('Build failed:', err.message);
    process.exit(1);
} 