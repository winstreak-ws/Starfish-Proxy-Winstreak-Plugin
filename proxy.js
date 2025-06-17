/**
 * @fileoverview This file implements a single-player Minecraft proxy with Microsoft authentication,
 * a plugin system, and dynamic server switching capabilities.
 */

const mc = require('minecraft-protocol');
const EventEmitter = require('events');
const path = require('path');
const fs =require('fs');
const { exec } = require('child_process');

const PROXY_VERSION = '1.8.9';
const DEFAULT_CONFIG = {
    proxyPort: 25565,
    targetHost: 'mc.hypixel.net',
    targetPort: 25565,
    version: PROXY_VERSION,
    servers: {
        'hypixel': { host: 'mc.hypixel.net', port: 25565 },
        'ac-test': { host: 'anticheat-test.com', port: 25565 }
    }
};


/**
 * Determines the base directory of the application, supporting both packaged executables and node scripts.
 * @returns {string} The base directory path.
 */
function getBaseDirectory() {
    return process.pkg ? path.dirname(process.execPath) : __dirname;
}

const BASE_DIR = getBaseDirectory();
const CONFIG_FILE = path.join(BASE_DIR, 'proxy-config.json');


/**
 * Loads configuration from a JSON file, falling back to defaults.
 * @returns {object} The loaded configuration.
 */
function loadConfig() {
    let config = { ...DEFAULT_CONFIG };
    if (fs.existsSync(CONFIG_FILE)) {
    try {
            const loadedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        Object.assign(config, loadedConfig);
        console.log('Loaded configuration from proxy-config.json');
    } catch (err) {
            console.error('Failed to load config, using defaults:', err.message);
    }
}
    return config;
}


/**
 * Saves the current configuration to its file.
 * @param {object} config The configuration object to save.
 */
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('Failed to save config:', err.message);
    }
}


// plugins api


class ProxyAPI extends EventEmitter {
    constructor(proxyManager) {
        super();
        this.proxyManager = proxyManager;
        this.plugins = new Map();
    }
    
    get currentPlayer() {
        return this.proxyManager.currentPlayer;
    }

    sendToClient(metaName, data) {
        if (!this.currentPlayer?.client) return false;
            this.currentPlayer.client.write(metaName, data);
            return true;
    }

    sendToServer(metaName, data) {
        if (!this.currentPlayer?.targetClient) return false;
            this.currentPlayer.targetClient.write(metaName, data);
            return true;
    }

    sendChatMessage(message) {
        if (!this.currentPlayer?.client) return false;
        return this.proxyManager.sendChatMessage(this.currentPlayer.client, message);
    }

    registerPlugin(pluginInfo) {
        if (pluginInfo && pluginInfo.name) {
            this.plugins.set(pluginInfo.name, pluginInfo);
            console.log(`Registered plugin: ${pluginInfo.name}`);
        }
    }
    
    getLoadedPlugins() {
        return Array.from(this.plugins.values());
    }
    
    kickPlayer(reason) {
        this.proxyManager.kickPlayer(reason);
        }
    }


// core proxy & auth


class ProxyManager {
    constructor() {
        this.config = loadConfig();
        this.proxyAPI = new ProxyAPI(this);
        this.server = null;
        this.currentPlayer = null;
        this.waitingClient = null;
        this.isRestarting = false;
        this.authenticatedUsers = new Set();
        this.forceNextAuth = false;
        
        this.loadPlugins();
    }

    
    /**
     * Loads plugins from the 'scripts' directory.
     */
    loadPlugins() {
        const scriptsFolder = path.join(BASE_DIR, 'scripts');
console.log(`Looking for scripts in: ${scriptsFolder}`);
        if (!fs.existsSync(scriptsFolder)) {
            console.log('Scripts folder not found. Create a "scripts" folder to add plugins.');
            return;
        }

    fs.readdirSync(scriptsFolder).forEach((file) => {
        if (file.endsWith('.js')) {
            try {
                const plugin = require(path.join(scriptsFolder, file));
                if (typeof plugin === 'function') {
                        plugin(this.proxyAPI);
                }
            } catch (err) {
                console.error(`Failed to load plugin ${file}: ${err.message}`);
            }
        }
    });
        console.log(`Loaded ${this.proxyAPI.getLoadedPlugins().length} plugins.`);
    }


    /**
     * Starts the proxy server, initially in offline mode for authentication.
     */
    start() {
        this.createServer(false);
        const target = this.config.targetPort === 25565 ? this.config.targetHost : `${this.config.targetHost}:${this.config.targetPort}`;
        console.log(`Default target: ${target}`);
    }

    
    /**
     * Creates and configures a minecraft-protocol server instance.
     * @param {boolean} onlineMode Whether to start the server in online mode.
     */
    createServer(onlineMode) {
        const motdStatus = onlineMode ? '§aAuthenticated' : '§7Pending Auth';
        const motd = this.generateMOTD(motdStatus);

        const serverConfig = {
            'online-mode': onlineMode,
            version: this.config.version,
            port: this.config.proxyPort,
    keepAlive: false,
            motd,
    maxPlayers: 1
};

        this.server = mc.createServer(serverConfig);
        this.server.on('login', this.handlePlayerLogin.bind(this));
        this.server.on('error', (err) => console.error(`Proxy server error:`, err));
        this.server.on('listening', () => {
             if (this.server) {
                console.log(`Server is now running in ${onlineMode ? 'online' : 'offline'} mode.`);
                this.isRestarting = false;
             }
        });
    }

    
    /**
     * Restarts the proxy server, switching its online mode.
     * Kicks any connected player with a message to reconnect.
     * @param {boolean} newOnlineMode The desired online mode for the new server.
     * @param {mc.Client} [clientToKick] The specific client to kick.
     * @param {string} [kickMessage] The message to send to the client being kicked.
     */
    restartServer(newOnlineMode, clientToKick = null, kickMessage = '§eProxy is restarting. Please reconnect.') {
        if (this.isRestarting) return;
        this.isRestarting = true;
        
        console.log(`Restarting server.`);

        const client = clientToKick || this.currentPlayer?.client || this.waitingClient;

        if (this.currentPlayer) this.currentPlayer = null;
        if (this.waitingClient) this.waitingClient = null;

        if (client && client.state !== mc.states.DISCONNECTED) {
            client.end(kickMessage);
    }
    
        if (this.currentPlayer) this.currentPlayer = null;
        if (this.waitingClient) this.waitingClient = null;
        
        if (!this.server) {
            this.createServer(newOnlineMode);
            return;
        }
        
        this.server.close();
        this.server = null;
        setTimeout(() => this.createServer(newOnlineMode), 250);
    }

    
    /**
     * Generates the MOTD string based on loaded plugins and server status.
     * @param {string} statusText The current status text (e.g., Authenticated).
     * @returns {string} The formatted MOTD.
     */
    generateMOTD(statusText) {
        const pluginCount = this.proxyAPI.getLoadedPlugins().length;
        const pluginText = pluginCount > 0 ? `${pluginCount} Plugin${pluginCount > 1 ? 's' : ''}` : 'No Plugins';
        const targetDisplay = this.config.targetPort === 25565 ? this.config.targetHost : `${this.config.targetHost}:${this.config.targetPort}`;
        return `§6Modular Proxy§r §8| ${pluginText}\n§7Connected to: §e${targetDisplay} §8| ${statusText}`;
    }


    /**
     * Handles the login process for a connecting player.
     * @param {mc.Client} client The client object for the connecting player.
     */
    handlePlayerLogin(client) {
        if (this.isRestarting) {
            client.end('§cProxy is restarting, please reconnect in a moment...');
            return;
        }

        if (this.currentPlayer || this.waitingClient) {
            client.end('§cProxy is already in use.');
            return;
        }

        console.log(`Player ${client.username} connected.`);

        const isAuthenticated = this.authenticatedUsers.has(client.username);
        const isOnlineMode = this.server.options['online-mode'];

        if (isOnlineMode) {
            if (isAuthenticated) {
                this.connectToTarget(client);
            } else {
                console.log(`New user ${client.username} detected. Clearing old sessions and restarting for authentication.`);
                this.authenticatedUsers.clear();
                this.restartServer(false, client, `§ePlease reconnect to authenticate account: ${client.username}`);
            }
        } else {
            this.sendToAuthWorld(client);
        }
    }


    /**
     * Connects an authenticated player to the target server.
     * @param {mc.Client} client The player's client.
     */
    connectToTarget(client) {
        console.log(`Connecting ${client.username} to ${this.config.targetHost}`);

        const authCachePath = path.join(BASE_DIR, 'auth_cache', client.username);

        const targetClient = mc.createClient({
            host: this.config.targetHost,
            port: this.config.targetPort,
            username: client.username,
            version: this.config.version,
            auth: 'microsoft',
            hideErrors: false,
            profilesFolder: authCachePath
        });

        this.currentPlayer = {
            username: client.username,
            client,
            targetClient,
            entityId: null,
            joinTime: Date.now()
        };
        
        this.setupPacketForwarding();
    }


    /**
     * Sets up the two-way forwarding of packets between the client and target server.
     */
    setupPacketForwarding() {
        const { client, targetClient, username } = this.currentPlayer;
        
        let forwardingSetup = false;
    
        const cleanup = (reason) => {
            console.log(`Player ${username} disconnected.`);
            if (this.currentPlayer) {
                this.proxyAPI.emit('playerLeave', { username, player: this.currentPlayer });
                this.currentPlayer = null;
            }
            if (client && client.state !== mc.states.DISCONNECTED) client.end(reason);
            if (targetClient && targetClient.state !== mc.states.DISCONNECTED) targetClient.end(reason);
        };

        client.on('end', (reason) => cleanup(reason));
        targetClient.on('end', (reason) => cleanup(reason));
        client.on('error', (err) => cleanup(`Client error: ${err.message}`));
        targetClient.on('error', (err) => cleanup(`Server error: ${err.message}`));
        
        targetClient.on('login', (packet) => {
            console.log(`Joined ${this.config.targetHost} as ${username}.`);
            
            this.currentPlayer.entityId = packet.entityId;
            client.write('login', packet);
            this.proxyAPI.emit('playerJoin', { username, player: this.currentPlayer });
            
            if (!forwardingSetup) {
                forwardingSetup = true;
                
                client.on('packet', (data, meta) => {
                    if (meta.name === 'chat' && data.message.startsWith('/')) {
                        if (this.handleProxyCommand(data.message)) return;
                    }
                    const event = { username, player: this.currentPlayer, data, meta, cancelled: false };
                    this.proxyAPI.emit('clientPacket', event);
                    if (!event.cancelled) {
                        targetClient.write(meta.name, data);
                    }
                });

                targetClient.on('packet', (data, meta) => {
                    const event = { username, player: this.currentPlayer, data, meta, cancelled: false };
                    this.proxyAPI.emit('serverPacket', event);
                    if (!event.cancelled) {
                        client.write(meta.name, data);
                    }
                });
            }
        });
    }


    /**
     * Places a client in a temporary world to perform Microsoft authentication.
     * @param {mc.Client} client The player's client.
     */
    sendToAuthWorld(client) {
        this.waitingClient = client;

        const keepAliveInterval = setInterval(() => {
            if (client.state === mc.states.PLAY) {
                client.write('keep_alive', { keepAliveId: Math.floor(Math.random() * 2147483647) });
            }
        }, 15000);

        client.on('end', () => {
            clearInterval(keepAliveInterval);
            this.waitingClient = null;
        });

        client.write('login', {
            entityId: 1, gameMode: 2, dimension: 0, difficulty: 0,
            maxPlayers: 1, levelType: 'flat', reducedDebugInfo: false
        });
        client.write('position', { x: 0.5, y: 7, z: 0.5, yaw: 0, pitch: 0, flags: 0 });
        
        client.on('chat', (packet) => {
            if (packet.message.startsWith('/')) {
                this.handleProxyCommand(packet.message, client);
            }
        });

        this.initiateMicrosoftAuth(client);
    }


    /**
     * Initiates the Microsoft auth flow for a client in the waiting world.
     * @param {mc.Client} client The client to authenticate.
     */
    initiateMicrosoftAuth(client) {
        const username = client.username;
        const targetDisplay = this.config.targetPort === 25565 ? this.config.targetHost : `${this.config.targetHost}:${this.config.targetPort}`;

        const authMessages = [
            '§6========================================',
            '       §6§lPROXY §e- Authentication',
            '§6========================================',
            `§7➤ §e§lConnecting with: §f${username}`,
            `§7➤ §7Target Server: §f${targetDisplay}`,
            `§7➤ §b§lCommands: §f/server, /help`,
            '§6========================================'
        ];
        this.sendChatMessage(client, authMessages.join('\n'));

        const authCachePath = path.join(BASE_DIR, 'auth_cache', username);
        if (!fs.existsSync(authCachePath)) {
            fs.mkdirSync(authCachePath, { recursive: true });
        }

        const forceRefresh = this.forceNextAuth;
        if (this.forceNextAuth) this.forceNextAuth = false;

        const authClient = mc.createClient({
            host: this.config.targetHost,
            port: this.config.targetPort,
            username: username,
            version: this.config.version,
            auth: 'microsoft',
            hideErrors: false,
            profilesFolder: authCachePath,
            forceRefresh: forceRefresh,
            onMsaCode: (data) => {
                const url = `${data.verification_uri}?otc=${data.user_code}`;
                this.sendChatMessage(client, `§6Microsoft Auth Required!\n§7Visit ${url} if it does not open automatically.`);
                
                // open auth page in browser
                const platform = process.platform;
                const cmd = platform === 'darwin' ? `open "${url}"` : platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
                exec(cmd);
            }
        });
        
        authClient.on('session', () => {
            const realUsername = authClient.session.selectedProfile.name;
            console.log(`Authenticated as ${realUsername}.`);
            this.sendChatMessage(client, `§a✓ Authenticated as ${realUsername}`);
            this.authenticatedUsers.add(realUsername);
            authClient.end();

            this.restartServer(true, client, `§aAuthenticated as ${realUsername}. Please reconnect.`);
        });
        
        authClient.on('error', (err) => {
             this.sendChatMessage(client, `§cAuthentication failed: ${err.message}`);
             client.end('§cPlease check your connection or credentials and reconnect.');
        });
        
        authClient.on('end', () => {
             if (!this.authenticatedUsers.has(username)) {
                this.sendChatMessage(client, '§cAuthentication process ended unexpectedly.');
            }
        });
    }


    /**
     * Handles proxy-specific commands from chat.
     * @param {string} message The full chat message.
     * @param {mc.Client} [sourceClient] The client who sent the command (used for waiting world).
     * @returns {boolean} True if the command was handled.
     */
    handleProxyCommand(message, sourceClient = null) {
        const args = message.slice(1).split(' ');
        const command = args.shift().toLowerCase();
        const client = sourceClient || this.currentPlayer?.client;
    
        if (!client) return false;

        const commands = {
            'server': 'servers',
            'servers': () => {
                const current = `${this.config.targetHost}:${this.config.targetPort}`;
                if (args.length === 0) {
                let serverList = '§6Available Servers:\n';
                    serverList += `§7Current: §a${current}\n\n`;
                    Object.entries(this.config.servers).forEach(([name, server]) => {
                        serverList += `§e${name} §7- §f${server.host}:${server.port}\n`;
                });
                    this.sendChatMessage(client, serverList + '\n§7Usage: §f/server <name|host:port>');
                } else {
                    const target = args[0];
                    let newHost, newPort;
                    if (this.config.servers[target]) {
                        ({ host: newHost, port: newPort } = this.config.servers[target]);
                    } else {
                        [newHost, newPort] = target.split(':');
                        newPort = parseInt(newPort) || 25565;
                    }

                    this.config.targetHost = newHost;
                    this.config.targetPort = newPort;
                    saveConfig(this.config);

                    this.sendChatMessage(client, `§aServer changed to §f${newHost}:${newPort}.`);
                    
                    if (this.currentPlayer) {
                        this.restartServer(true, this.currentPlayer.client, '§aSwitching servers. Please reconnect.');
                }
            }
            },
            'addserver': () => {
                if (args.length < 2) return this.sendChatMessage(client, '§cUsage: /addserver <name> <host:port>');
                const [name, hostPort] = args;
                const [host, port] = hostPort.split(':');
                this.config.servers[name] = { host, port: parseInt(port) || 25565 };
                saveConfig(this.config);
                this.sendChatMessage(client, `§aAdded server §f${name} (${host}:${port})`);
            },
            'removeserver': () => {
                 if (args.length < 1) return this.sendChatMessage(client, '§cUsage: /removeserver <name>');
                 const name = args[0];
                 if (this.config.servers[name]) {
                     delete this.config.servers[name];
                     saveConfig(this.config);
                     this.sendChatMessage(client, `§aRemoved server §f${name}`);
                } else {
                     this.sendChatMessage(client, `§cServer §f${name} §cnot found.`);
                }
            },
            'reauth': () => {
                const username = client.username;
                this.authenticatedUsers.delete(username);
                this.forceNextAuth = true;
                
                const authCachePath = path.join(BASE_DIR, 'auth_cache', username);
                if (fs.existsSync(authCachePath)) {
                    try {
                        fs.rmSync(authCachePath, { recursive: true, force: true });
                        console.log(`Cleared auth cache for ${username}.`);
                    } catch (e) {
                        console.error(`Failed to clear auth cache for ${username}:`, e.message);
                    }
                }

                this.sendChatMessage(client, '§aAuthentication cache cleared. The proxy will restart.');
                
                this.restartServer(false, client, '§aPlease reconnect to re-authenticate.');
            },
            'help': 'proxy',
            'proxy': () => {
                const pluginHelp = this.proxyAPI.getLoadedPlugins()
                    .map(p => `§e/${p.name.toLowerCase()} help §7- ${p.description}`)
                    .join('\n');
            
            const helpMessage = `§6Proxy Commands:\n` +
                `§e/server §7- List and switch servers\n` +
                `§e/addserver <name> <host:port> §7- Add a server\n` +
                `§e/removeserver <name> §7- Remove a server\n` +
                `§e/reauth §7- Re-authenticate your Microsoft account\n` +
                `§e/help §7- Show this message\n` +
                    (pluginHelp ? `§6Plugin Commands:\n${pluginHelp}` : '');
                this.sendChatMessage(client, helpMessage);
            }
        };
                
        const handler = commands[command];
        if (handler) {
            typeof handler === 'string' ? commands[handler]() : handler();
            return true;
    }
    
    return false;
}


    /**
     * Sends a formatted chat message to a client.
     * @param {mc.Client} client The recipient client.
     * @param {string} message The message to send.
     */
    sendChatMessage(client, message) {
        if (!client || client.state !== mc.states.PLAY) return;
        client.write('chat', {
        message: JSON.stringify({ text: message }),
        position: 0,
            sender: '0'
    });
    }


    /**
     * Kicks the current player or a specified client.
     * @param {string} reason The reason for kicking.
     * @param {mc.Client} [client] The specific client to kick (defaults to current player).
     */
    kickPlayer(reason, client = null) {
        const target = client || this.currentPlayer?.client;
        if (target) {
            target.end(reason);
        }
    }
}


const proxyManager = new ProxyManager();
proxyManager.start();
