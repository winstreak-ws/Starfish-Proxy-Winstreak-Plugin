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

const scriptsSource = path.join(__dirname, 'scripts');
const scriptsDest = path.join(buildDir, 'scripts');

if (fs.existsSync(scriptsSource)) {
    if (fs.existsSync(scriptsDest)) {
        fs.rmSync(scriptsDest, { recursive: true, force: true });
    }
    fs.cpSync(scriptsSource, scriptsDest, { recursive: true });
}

const configSource = path.join(__dirname, 'proxy-config.json');
const configDest = path.join(buildDir, 'proxy-config.json');
if (fs.existsSync(configSource)) {
    fs.copyFileSync(configSource, configDest);
}

try {
    execSync('pkg src/proxy.js --target node18-win-x64 --output build/starfish-proxy.exe', { stdio: 'inherit' });
    console.log('Build completed: build/starfish-proxy.exe');
} catch (err) {
    console.error('Build failed:', err.message);
    process.exit(1);
} 