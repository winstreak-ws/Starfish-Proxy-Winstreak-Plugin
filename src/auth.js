const mc = require('minecraft-protocol');
const { exec } = require('child_process');
const path = require('path');

class AuthManager {
    constructor(proxyManager, baseDir) {
        this.proxyManager = proxyManager;
        this.BASE_DIR = baseDir;
    }

    /**
     * Handles the entire login and authentication flow for a connecting player.
     * @param {mc.Client} client The client object for the connecting player.
     */
    handleLogin(client) {
        const proxy = this.proxyManager;

        if (proxy.isSwitching) {
            client.end('§cProxy is switching servers, please try again in a moment...');
            return;
        }

        if (proxy.currentPlayer) {
            client.end('§cProxy is already in use.');
            return;
        }

        console.log(`Player ${client.username} connected. Authenticating and connecting to target...`);
        
        let authKeepAliveInterval = null;

        const targetClient = mc.createClient({
            host: proxy.config.targetHost,
            port: proxy.config.targetPort,
            username: client.username,
            version: proxy.config.version,
            auth: 'microsoft',
            hideErrors: false,
            profilesFolder: path.join(this.BASE_DIR, 'auth_cache', client.username),
            forceRefresh: proxy.forceNextAuth,
            onMsaCode: (data) => {
                authKeepAliveInterval = this._createAuthWorld(client, data);
            }
        });

        if (proxy.forceNextAuth) proxy.forceNextAuth = false;

        proxy.currentPlayer = {
            username: client.username,
            client,
            targetClient,
            entityId: null,
            joinTime: Date.now()
        };

        const onAuthHandled = () => {
            if (authKeepAliveInterval) {
                clearInterval(authKeepAliveInterval);
                authKeepAliveInterval = null;
            }
        };

        targetClient.on('session', () => {
            const realUsername = targetClient.session.selectedProfile.name;
            console.log(`Authenticated as ${realUsername}.`);
            if (authKeepAliveInterval) {
                proxy.sendChatMessage(client, `§a✓ Authenticated as ${realUsername}`);
            }
            proxy.authenticatedUsers.add(realUsername);
        });
        
        targetClient.on('error', (err) => {
             onAuthHandled();
             console.error(`Target connection error: ${err.message}`);
             client.end(`§cAuthentication/Connection failed: ${err.message}`);
        });

        targetClient.once('login', (packet) => {
            onAuthHandled();
            proxy.setupPacketForwarding(packet, false);
        });
    }

    /**
     * Places a client in a temporary world to perform Microsoft authentication
     * while holding their connection open.
     * @param {mc.Client} client The player's client.
     * @param {object} msaData The Microsoft auth data from onMsaCode.
     * @returns {NodeJS.Timeout} The keep-alive interval timer.
     */
    _createAuthWorld(client, msaData) {
        client.write('login', {
            entityId: 1,
            gameMode: 3,
            dimension: 0,
            difficulty: 0,
            maxPlayers: 1,
            levelType: 'flat',
            reducedDebugInfo: false
        });

        client.write('position', {
            x: 0.5,
            y: 7,
            z: 0.5,
            yaw: 0,
            pitch: 0,
            flags: 0
        });

        const keepAliveInterval = setInterval(() => {
            if (client.state === mc.states.PLAY) {
                client.write('keep_alive', { keepAliveId: Math.floor(Math.random() * 2147483647) });
            }
        }, 15000);
        
        const url = `${msaData.verification_uri}?otc=${msaData.user_code}`;
        const platform = process.platform;
        const cmd = platform === 'darwin' ? `open "${url}"` : platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
        
        const messages = [
            '§6========================================',
            '       §6S§eta§fr§bfi§3sh §5P§5roxy §e- Authentication',
            '§6========================================',
            '§eMicrosoft Auth Required!',
            '§7A new tab should have opened in your browser.',
            `§7If not, visit: §b${url}`,
            '§6========================================'
        ];
        this.proxyManager.sendChatMessage(client, messages.join('\n'));

        try {
            exec(cmd);
        } catch (e) {
            console.error('Failed to open browser automatically.', e);
        }

        return keepAliveInterval;
    }
}

module.exports = AuthManager;
