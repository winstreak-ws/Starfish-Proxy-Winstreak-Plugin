/**
 * @fileoverview This file implements a single-player Minecraft proxy with Microsoft authentication,
 * a plugin system, and dynamic server switching capabilities.
 */

const mc = require('minecraft-protocol');
const EventEmitter = require('events');
const path = require('path');
const fs =require('fs');

const AuthManager = require('./auth');
const CommandHandler = require('./command-handler');
const PluginManager = require('./plugin-manager');

const PROXY_VERSION = '1.8.9';
const PROXY_NAME = '§6S§eta§fr§bfi§3sh §5Proxy§r';
const PROXY_PREFIX = '§6S§eta§fr§bfi§3sh';

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
    return process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
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
 * Plugin API for the Minecraft proxy
 * 
 * Event System:
 * - 'clientPacketMonitor' / 'serverPacketMonitor': Passive monitoring (zero latency impact)
 * - 'clientPacketIntercept' / 'serverPacketIntercept': Can cancel packets (slight latency impact)
 * - 'clientPacket' / 'serverPacket': Legacy events (same as intercept, for backward compatibility)
 * 
 * For maximum performance, use Monitor events unless you need to cancel/modify packets.
 */
class ProxyAPI extends EventEmitter {
    constructor(proxyManager) {
        super();
        this.proxyManager = proxyManager;
    }
    
    get currentPlayer() {
        return this.proxyManager.currentPlayer;
    }

    get proxyName() {
        return PROXY_NAME;
    }

    get proxyPrefix() {
        return PROXY_PREFIX;
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
        return this.proxyManager.pluginManager.registerPlugin(pluginInfo);
    }
    
    setPluginEnabled(pluginName, enabled) {
        return this.proxyManager.pluginManager.setPluginEnabled(pluginName, enabled);
    }
    
    isPluginEnabled(pluginName) {
        return this.proxyManager.pluginManager.isPluginEnabled(pluginName);
    }
    
    getAllPluginStates() {
        return this.proxyManager.pluginManager.getAllPluginStates();
    }
    
    getLoadedPlugins() {
        return this.proxyManager.pluginManager.getLoadedPlugins();
    }


    /**
     * Override emit to filter events for disabled plugins
     */
    emit(eventName, ...args) {
        const listeners = this.listeners(eventName);
        
        const enabledListeners = this.proxyManager.pluginManager.filterEnabledListeners(listeners);
        
        enabledListeners.forEach(listener => {
            try {
                listener(...args);
            } catch (error) {
                console.error(`Error in event listener:`, error);
            }
        });
        
        return this.listenerCount(eventName) > 0;
    }


    /**
     * Register commands for a plugin/module
     * @param {string} moduleName - The module name  
     * @param {object} commands - Commands object
     */
    registerCommands(moduleName, commands) {
        this.proxyManager.commandHandler.register(moduleName, commands);
    }

    kickPlayer(reason) {
        this.proxyManager.kickPlayer(reason);
    }
}


class ProxyManager {
    constructor() {
        this.config = loadConfig();
        this.proxyAPI = new ProxyAPI(this);
        this.authManager = new AuthManager(this, BASE_DIR);
        this.commandHandler = new CommandHandler(this);
        this.pluginManager = new PluginManager(this, this.proxyAPI, BASE_DIR);

        this.server = null;
        this.currentPlayer = null;
        this.isSwitching = false;
        this.authenticatedUsers = new Set();
        this.forceNextAuth = false;
        
        this.registerProxyCommands();
        this.pluginManager.loadPlugins();
    }

    
    /**
     * Saves the current configuration to its file.
     * @param {object} config The configuration object to save.
     */
    saveConfig(config) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    }


    /**
     * Registers built-in proxy commands
     */
    registerProxyCommands() {
        this.commandHandler.register('proxy', {
            server: {
                description: 'List and switch servers',
                usage: '[name|host:port]',
                handler: (client, args) => {
                    if (args.length === 0) {
                        this.showServerList(client);
                    } else {
                        this.switchServer(args[0]);
                    }
                }
            },

            addserver: {
                description: 'Add a server to the list',
                usage: '<name> <host:port>',
                validate: [
                    /^[a-zA-Z0-9_-]+$/,
                    /^[a-zA-Z0-9.-]+:\d+$/
                ],
                handler: (client, args) => {
                    this.addServer(client, args[0], args[1]);
                }
            },

            removeserver: {
                description: 'Remove a server from the list',
                usage: '<name>',
                validate: /^[a-zA-Z0-9_-]+$/,
                handler: (client, args) => {
                    this.removeServer(client, args[0]);
                }
            },

            reauth: {
                description: 'Force re-authentication with Microsoft on next login.',
                handler: (client) => {
                    if (!this.currentPlayer) {
                        this.sendChatMessage(client, '§cYou are not connected to a server.');
                        return;
                    }
                    this.forceNextAuth = true;
                    this.clearAuthCache(this.currentPlayer.username);
                    this.sendChatMessage(client, '§aAuthentication cache cleared. Please disconnect and reconnect to re-authenticate.');
                }
            },

            plugins: {
                description: 'List all plugins and their status',
                handler: (client, args) => {
                    const pluginStates = this.proxyAPI.getAllPluginStates();
                    
                    if (pluginStates.length === 0) {
                        this.sendChatMessage(client, '§7No plugins loaded.');
                        return;
                    }
                    
                    let message = '§6========= Plugins ========\n';
                    for (const plugin of pluginStates) {
                        const status = plugin.enabled ? '§aEnabled' : '§cDisabled';
                        message += `§e${plugin.displayName}: ${status}\n`;
                    }
                    message += '§6========================';
                    
                    this.sendChatMessage(client, message);
                }
            }
        });
    }


    showServerList(client) {
        const current = `${this.config.targetHost}:${this.config.targetPort}`;
        let serverList = '§6Available Servers:\n';
        serverList += `§7Current: §a${current}\n\n`;
        
        Object.entries(this.config.servers).forEach(([name, server]) => {
            serverList += `§e${name} §7- §f${server.host}:${server.port}\n`;
        });
        
        this.sendChatMessage(client, serverList + '\n§7Usage: §f/proxy server <name|host:port>');
    }

    switchServer(target) {
        if (!this.currentPlayer || this.isSwitching) {
            this.sendChatMessage(this.currentPlayer?.client, '§cCannot switch server right now.');
            return;
        }

        const serverInfo = this.parseServerTarget(target);
        if (!serverInfo) {
            this.sendChatMessage(this.currentPlayer.client, `§cInvalid server target: ${target}`);
            return;
        }

        this.isSwitching = true;
        this.sendChatMessage(this.currentPlayer.client, `§7Connecting to ${serverInfo.host}:${serverInfo.port}...`);

        this.currentPlayer.targetClient.removeAllListeners();
        this.currentPlayer.client.removeAllListeners('packet');
        this.currentPlayer.targetClient.end('Switching servers');

        this.config.targetHost = serverInfo.host;
        this.config.targetPort = serverInfo.port;
        this.saveConfig(this.config);
        
        const newTargetClient = mc.createClient({
            host: this.config.targetHost,
            port: this.config.targetPort,
            username: this.currentPlayer.username,
            version: this.config.version,
            auth: 'microsoft',
            hideErrors: false,
            profilesFolder: path.join(BASE_DIR, 'auth_cache', this.currentPlayer.username)
        });

        this.currentPlayer.targetClient = newTargetClient;

        newTargetClient.once('login', (packet) => {
            this.isSwitching = false;
            this.sendChatMessage(this.currentPlayer.client, `§aConnected to ${target}!`);
            this.setupPacketForwarding(packet, true);
        });
        
        newTargetClient.on('error', (err) => {
            this.isSwitching = false;
            this.kickPlayer(`§cFailed to connect to ${target}: ${err.message}`);
        });
    }

    parseServerTarget(target) {
        if (this.config.servers[target]) {
            return this.config.servers[target];
        }
        
        const [host, port] = target.split(':');
        return { host, port: parseInt(port) || 25565 };
    }

    addServer(client, name, hostPort) {
        const [host, port] = hostPort.split(':');
        this.config.servers[name] = { host, port: parseInt(port) || 25565 };
        this.saveConfig(this.config);
        this.sendChatMessage(client, `§aAdded server §f${name} (${host}:${port || 25565})`);
    }

    removeServer(client, name) {
        if (!this.config.servers[name]) {
            this.sendChatMessage(client, `§cServer §f${name} §cnot found.`);
            return;
        }
        
        delete this.config.servers[name];
        this.saveConfig(this.config);
        this.sendChatMessage(client, `§aRemoved server §f${name}`);
    }

    clearAuthCache(username) {
        const authCachePath = path.join(BASE_DIR, 'auth_cache', username);
        if (!fs.existsSync(authCachePath)) return;
        fs.rmSync(authCachePath, { recursive: true, force: true });
        console.log(`Cleared auth cache for ${username}.`);
    }

    
    /**
     * Starts the proxy server.
     */
    start() {
        this.createServer();
        const target = this.config.targetPort === 25565 ? this.config.targetHost : `${this.config.targetHost}:${this.config.targetPort}`;
        console.log(`Default target: ${target}`);
    }

    
    /**
     * Creates and configures the minecraft-protocol server instance.
     */
    createServer() {
        const motd = this.generateMOTD();

        const serverConfig = {
            'online-mode': true,
            version: this.config.version,
            port: this.config.proxyPort,
            keepAlive: false,
            motd,
            maxPlayers: 1,
            beforeLogin: (client) => {
                if (client.protocolVersion !== 47) {
                    console.log(`[LOGIN][REJECT] ${client.socket.remoteAddress}:${client.socket.remotePort} tried ${client.protocolVersion}`);
                    client.end('§cPlease connect using 1.8.9');
                }
            }
        };

        this.server = mc.createServer(serverConfig);
        this.server.on('login', this.handlePlayerLogin.bind(this));
        this.server.on('error', (err) => console.error(`Proxy server error:`, err));
        this.server.on('listening', () => {
            console.log(`Server is running in online mode.`);
            this.isSwitching = false;
        });
    }

    /**
     * Generates the MOTD string based on loaded plugins and server status.
     * @returns {string} The formatted MOTD.
     */
    generateMOTD() {
        const pluginCount = this.proxyAPI.getLoadedPlugins().length;
        const pluginText = pluginCount > 0 ? `${pluginCount} Plugin${pluginCount > 1 ? 's' : ''}` : 'No Plugins';
        const targetDisplay = this.config.targetPort === 25565 ? this.config.targetHost : `${this.config.targetHost}:${this.config.targetPort}`;
        return `§6S§eta§fr§bfi§3sh §5Proxy§r §8| ${pluginText}\n§7Connected to: §e${targetDisplay}`;
    }


    /**
     * Handles the login process for a connecting player.
     * @param {mc.Client} client The client object for the connecting player.
     */
    handlePlayerLogin(client) {
        this.authManager.handleLogin(client);
    }

    /**
     * Respawns the client to safely switch them to a new world/server
     * without visual glitches or getting stuck.
     * @param {object} loginPacket The login packet from the new target server.
     */
    respawnPlayer(loginPacket) {
        if (!this.currentPlayer?.client) return;
        this.currentPlayer.client.write('respawn', {
            dimension: loginPacket.dimension,
            difficulty: loginPacket.difficulty,
            gamemode: loginPacket.gameMode,
            levelType: loginPacket.levelType
        });
    }


    /**
     * Sets up the two-way forwarding of packets between the client and target server.
     * @param {object} loginPacket The login packet from the target server.
     * @param {boolean} isRespawnNeeded True if the player should be respawned instead of logged in.
     */
    setupPacketForwarding(loginPacket, isRespawnNeeded) {
        const { client, targetClient, username } = this.currentPlayer;
        
        let forwardingSetup = false;
        let cleanupDone = false;
    
        const doFinalCleanup = () => {
            if (cleanupDone) return;
            cleanupDone = true;
            
            if (this.currentPlayer) {
                this.proxyAPI.emit('playerLeave', { username, player: this.currentPlayer });
                this.currentPlayer = null;
            }
        };

        client.on('end', (reason) => {
            console.log(`Player ${username} disconnected.`);
            if (targetClient && targetClient.state !== mc.states.DISCONNECTED) {
                targetClient.end('Client disconnected');
            }
            doFinalCleanup();
        });
        
        client.on('error', (err) => {
            console.log(`Player ${username} disconnected.`);
            if (targetClient && targetClient.state !== mc.states.DISCONNECTED) {
                targetClient.end('Client error');
            }
            doFinalCleanup();
        });

        targetClient.on('end', (reason) => {
            if (client && client.state !== mc.states.DISCONNECTED) {
                client.end('Server disconnected');
            }
            doFinalCleanup();
        });
        
        targetClient.on('error', (err) => {
            if (client && client.state !== mc.states.DISCONNECTED) {
                client.end('Server error');
            }
            doFinalCleanup();
        });
        
        console.log(`Joined ${this.config.targetHost} as ${username}.`);
        this.currentPlayer.entityId = loginPacket.entityId;
        
        if (isRespawnNeeded) {
            this.respawnPlayer(loginPacket);
        } else {
            client.write('login', loginPacket);
        }
        
        this.proxyAPI.emit('playerJoin', { username, player: this.currentPlayer });
        
        client.on('packet', (data, meta) => {
            if (meta.name === 'chat' && this.commandHandler.handleCommand(data.message, client)) {
                return;
            }
            
            const passiveEvent = { username, player: this.currentPlayer, data, meta };
            this.proxyAPI.emit('clientPacketMonitor', passiveEvent);
            
            const interceptEvent = { username, player: this.currentPlayer, data, meta, cancelled: false };
            this.proxyAPI.emit('clientPacketIntercept', interceptEvent);
            
            if (!interceptEvent.cancelled && targetClient.state === mc.states.PLAY) {
                targetClient.write(meta.name, data);
            }
        });

        targetClient.on('packet', (data, meta) => {
            const passiveEvent = { username, player: this.currentPlayer, data, meta };
            this.proxyAPI.emit('serverPacketMonitor', passiveEvent);
            
            const interceptEvent = { username, player: this.currentPlayer, data, meta, cancelled: false };
            this.proxyAPI.emit('serverPacketIntercept', interceptEvent);
            
            if (!interceptEvent.cancelled && client.state === mc.states.PLAY) {
                client.write(meta.name, data);
            }
        });
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
     */
    kickPlayer(reason) {
        if (!this.currentPlayer || !this.currentPlayer.client) return;
        this.currentPlayer.client.end(reason);
    }
}


const proxyManager = new ProxyManager();
proxyManager.start();
