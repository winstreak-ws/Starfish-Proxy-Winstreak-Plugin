// Winstreakws Integration Plugin
// Enables automatic checking and displaying winstreak.ws's data of players.


const axios = require('axios');

const axiosInstance = axios.create({
    headers: {
        'User-Agent': 'Starfish-Proxy-Winstreak-Plugin/0.0.1 (WinstreakWS)'
    }
});

const BASE_URL = 'https://api.winstreak.ws/';

module.exports = (api) => {
    api.metadata({
        name: 'winstreak',
        displayName: 'Winstreak.ws Integration',
        prefix: '§9W§fS',
        version: '0.0.1',
        author: 'Qetrox@Winstreak.ws',
        minVersion: '0.1.7',
        description: 'Enables automatic checking and displaying winstreak.ws\'s data of players.',
        dependencies: [
            { name: 'denicker', minVersion: '1.1.0' }
        ]
    });

    const plugin = new WinstreakwsPlugin(api);

    const configSchema = [
        {
            label: 'API Key',
            description: 'Set your Winstreak API key for plugin authentication.',
            defaults: {
                api: {
                    apiKey: ''
                }
            },
            settings: [
                {
                    type: 'text',
                    key: 'ws_pl.api.apikey',
                    description: 'Enter your Winstreak API key.',
                    placeholder: 'API key'
                }
            ]
        },
        {
            label: 'Alerts',
            description: 'Manage chat and audio alerts for players.',
            defaults: {
                alerts: {
                    enabled: true,
                    audioAlerts: { enabled: true },
                    alertDelay: 0
                }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.alerts.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Enable or disable all chat alerts.'
                },
                {
                    type: 'soundToggle',
                    key: 'ws_pl.alerts.audioAlerts.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Enable or disable sounds on chat alert.'
                }
            ]
        },
        {
            label: 'Tab List',
            description: 'Display winstreak.ws data in the tab list.',
            defaults: {
                ws_pl: { tablist: { enabled: true } }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tablist.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Enable or disable winstreak.ws data in the tab list.',
                    onChange: (enabled) => {
                        // Remove all suffixes first
                        if (plugin.taggedPlayers && plugin.taggedPlayers.size > 0) {
                            for (const uuid of plugin.taggedPlayers.keys()) {
                                plugin.api.clearDisplayNameSuffix(uuid);
                            }
                        }
                        if (enabled) {
                            // Add suffixes for all tagged players
                            if (plugin.taggedPlayers && plugin.taggedPlayers.size > 0) {
                                for (const [uuid, tags] of plugin.taggedPlayers.entries()) {
                                    const customColors = plugin.api.config.get('ws_pl.customcolors.enabled');
                                    const suffix = ' §7[' + tags.map(tag => {
                                        let color = getMinecraftColorByNumber(tag.color);
                                        if (!customColors) color = '§9';
                                        return `${color}${tag.name}`;
                                    }).join(' §7| §r') + '§7]';
                                    plugin.api.appendDisplayNameSuffix(uuid, suffix);
                                }
                            }
                        }
                    }
                }
            ]
        },
        {
            label: 'Color Settings',
            description: 'Customize the colors used.',
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.customcolors.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Enable or disable custom colors. If disabled, brand colors will be used.',
                }
            ]
        },
        {
            label: 'Blacklist Tag',
            description: 'Enable or disable Winstreak\'s blacklist tags.',
            defaults: {
                ws_pl: { tags: { blacklist: { enabled: true } } }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.blacklist.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable Winstreak\'s blacklist tags.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        },
        {
            label: 'Gap Tag',
            description: 'Enable or disable the gap tag.',
            defaults: { ws_pl: { tags: { gaps: { enabled: false } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.gaps.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the gap tag.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        },
        {
            label: 'New Account Tag',
            description: 'Enable or disable the new account tag.',
            defaults: { ws_pl: { tags: { nacc: { enabled: true } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.nacc.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the new account tag.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        },
        {
            label: 'Ping Tag',
            description: 'Enable or disable the ping tag.',
            defaults: { ws_pl: { tags: { ping: { enabled: false } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.ping.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the ping tag.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        },
        {
            label: 'Radar Tag',
            description: 'Enable or disable the seen on private server tag.',
            defaults: { ws_pl: { tags: { radar: { enabled: true } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.radar.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the seen on private server tag.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        },
        {
            label: 'Recent Name Change Tag',
            description: 'Enable or disable the recent name change tag.',
            defaults: { ws_pl: { tags: { rnc: { enabled: true } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.rnc.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the recent name change tag.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        },
        {
            label: 'Statistic Account Tag',
            description: 'Enable or disable the likely statistic account tag.',
            defaults: { ws_pl: { tags: { statacc: { enabled: true } } } },
            settings: [
                {
                    type: 'toggle',
                    key: 'ws_pl.tags.statacc.enabled',
                    text: ['Disabled', 'Enabled'],
                    description: 'Enable or disable the likely statistic account tag.',
                    onChange: () => plugin.onConfigChanged()
                }
            ]
        }
    ];

    api.initializeConfig(configSchema);
    api.configSchema(configSchema);

    api.commands((registry) => {
        registry.command('setkey')
            .description('Set your Winstreak API key.')
            .argument('<apikey>', 'Your Winstreak API key')
            .handler((ctx) => plugin.handleSetKeyCommand(ctx.args.apikey));
    });

    plugin.registerHandlers();
    return plugin;

}

class WinstreakwsPlugin {
    constructor(api) {
        this.api = api;
        this.PLUGIN_PREFIX = this.api.getPrefix();
        this.cache = new WinstreakCache(this);
        // Map to store tags and their associated UUIDs
        this.taggedPlayers = new Map(); // uuid -> array of tags
    }

    registerHandlers() {
        this.api.on('respawn', this.onRespawn.bind(this));
        this.api.on('plugin_restored', this.onPluginRestored.bind(this));
        this.api.on('chat', this.onChat.bind(this));
    }


    async handleSetKeyCommand(apiKey) {
        if (!apiKey || apiKey.trim() === '') {
            this.sendMessage('§7Usage: /winstreak-ws setkey <your-api-key>');
            return;
        }

        this.api.config.set('ws_pl.api.apikey', apiKey.trim());
        this.sendMessage('§eTesting API connection...');

        const isConnected = await this.testApiConnection();
        if (isConnected) {
            this.sendMessage('§2Succesfully connected to Winstreak API.')
            this.sendMessage('§aAPI key set successfully.');
        } else {
            this.sendMessage('§cCouldn\'t connect to Winstreak API. Check your key!')
        }
    }

    sendMessage(message) {
        this.api.chat(`${this.PLUGIN_PREFIX}§r ${message}`);
    }

    async onRespawn() { };

    onChat(event) {
        if (event.position === 2) return;

        const cleanText = event.message.replace(/§[0-9a-fk-or]/g, '');

        if (cleanText.startsWith('ONLINE:')) {
            let usernames = cleanText
                .replace('ONLINE:', '')
                .split(',')
                .map(name => name.trim())
                .filter(name => name.length > 0);

            const denickerPlugin = this.api.getPluginInstance('denicker');
            if (denickerPlugin) {
                const resolvedNicks = [];
                const nicks = []
                const nickMappings = new Map();

                for (const username of usernames) {
                    const realName = denickerPlugin.getRealName(username);
                    if (realName) {
                        nicks.push(username);
                        resolvedNicks.push(realName);
                        nickMappings.set(realName, username);
                    }
                }

                if (resolvedNicks.length > 0) {

                    resolvedNicks.forEach(realName => {
                        const player = this.api.getPlayerByName(realName);
                        if (player) {

                            this.fetchPlayerTags(player.uuid).then(tags => {
                                if (tags && tags.length > 0) {


                                    let formattedTags = [];
                                    // Add tags to the map for this uuid
                                    this.taggedPlayers.set(player.uuid, tags);
                                    tags.forEach(tag => {
                                        let color = getMinecraftColorByNumber(tag.color);
                                        if (!this.api.config.get('ws_pl.customcolors.enabled')) color = '§9';
                                        formattedTags.push({
                                            text: `${color}${tag.name}§r`,
                                            hoverEvent: tag.description ? {
                                                action: 'show_text',
                                                value: tag.description
                                            } : undefined
                                        });
                                    });

                                    if (this.api.config.get('ws_pl.tablist.enabled')) {
                                        // Tablist only supports plain text, so keep as before
                                        this.api.appendDisplayNameSuffix(player.uuid, ' §7[' + tags.map(tag => {
                                            let color = getMinecraftColorByNumber(tag.color);
                                            if (!this.api.config.get('ws_pl.customcolors.enabled')) color = '§9';
                                            return `${color}${tag.name}`;
                                        }).join(' §7| §r') + '§7]');
                                    }
                                    if (this.api.config.get('ws_pl.alerts.enabled')) {
                                        // Chat message with hover for each tag
                                        let message = {
                                            text: `${this.PLUGIN_PREFIX}§r ${player.username} has the following tags: `,
                                            extra: []
                                        };
                                        formattedTags.forEach((tagObj, idx) => {
                                            if (idx > 0) message.extra.push({ text: ' §7| §r' });
                                            message.extra.push(tagObj);
                                        });
                                        this.api.chat(message);
                                        if (this.api.config.get('ws_pl.alerts.audioAlerts.enabled')) {
                                            this.api.sound('note.pling');
                                        }
                                    }

                                }
                            }).catch(err => {
                                this.sendMessage(`§cError fetching tags for ${realName}: ${err.message}`);
                            })

                        }
                    });
                }

                // Check unnicked
                const unnickedPlayers = usernames.filter(name => !nicks.includes(name));
                if (unnickedPlayers.length > 0) {
                    unnickedPlayers.forEach(name => {
                        const player = this.api.getPlayerByName(name);
                        if (player) {
                            this.fetchPlayerTags(name).then(tags => {
                                if (tags && tags.length > 0) {


                                    let formattedTags = [];
                                    // Add tags to the map for this uuid (if player object exists)
                                    if (player && player.uuid) {
                                        this.taggedPlayers.set(player.uuid, tags);
                                    }
                                    tags.forEach(tag => {
                                        let color = getMinecraftColorByNumber(tag.color);
                                        if (!this.api.config.get('ws_pl.customcolors.enabled')) color = '§9';
                                        formattedTags.push({
                                            text: `${color}${tag.name}§r`,
                                            hoverEvent: tag.description ? {
                                                action: 'show_text',
                                                value: tag.description
                                            } : undefined
                                        });
                                    });

                                    if (this.api.config.get('ws_pl.tablist.enabled')) {
                                        // Tablist only supports plain text, so keep as before
                                        this.api.appendDisplayNameSuffix(player.uuid, ' §7[' + tags.map(tag => {
                                            let color = getMinecraftColorByNumber(tag.color);
                                            if (!this.api.config.get('ws_pl.customcolors.enabled')) color = '§9';
                                            return `${color}${tag.name}`;
                                        }).join(' §7| §r') + '§7]');
                                    }

                                    if (this.api.config.get('ws_pl.alerts.enabled')) {
                                        // Chat message with hover for each tag
                                        let message = {
                                            text: `${this.PLUGIN_PREFIX}§r ${name} has the following tags: `,
                                            extra: []
                                        };
                                        formattedTags.forEach((tagObj, idx) => {
                                            if (idx > 0) message.extra.push({ text: ' §7| §r' });
                                            message.extra.push(tagObj);
                                        });
                                        this.api.chat(message);
                                        if (this.api.config.get('ws_pl.alerts.audioAlerts.enabled')) {
                                            this.api.sound('note.pling');
                                        }
                                    }

                                }
                            }).catch(err => {
                                this.sendMessage(`§cError fetching tags for ${name}: ${err.message}`);
                            });
                        }
                    });
                }
            }
        }
    }

    async onPluginRestored() {
        const apiKey = this.api.config.get('ws_pl.api.apikey');
        if (!apiKey || apiKey.trim() === '') {
            this.sendMessage('§cNo API key set. Use /winstreak-ws setkey <your-api-key> to set it.');
            return;
        }

        const isConnected = await this.testApiConnection();
        if (!isConnected) {
            this.sendMessage('§cCouldn\'t connect to Winstreak API. Check your key!');
        }
    }

    async testApiConnection() {

        const apiKey = this.api.config.get('ws_pl.api.apikey');
        const url = `${BASE_URL}v1/user?key=${encodeURIComponent(apiKey)}`;

        try {
            const response = await axiosInstance.get(url).catch((error) => { return null });
            return response.data.current_key === apiKey;
        } catch (error) {
            console.error('Error connecting to Winstreak API:', error);
            return false;
        }
    }

    async fetchPlayerTags(player) {
        const cacheKey = `tags:${player}`;
        // Try cache first
        const cached = await this.cache.getKey(cacheKey);
        if (cached) {
            return cached;
        }

        const apiKey = this.api.config.get('ws_pl.api.apikey');
        let url = `${BASE_URL}` + `v1/player/tags?player=${encodeURIComponent(player)}&key=${encodeURIComponent(apiKey)}&color=true`;

        // Add disabling tags
        const blacklistEnabled = this.api.config.get('ws_pl.tags.blacklist.enabled');
        const gapsEnabled = this.api.config.get('ws_pl.tags.gaps.enabled');
        const naccEnabled = this.api.config.get('ws_pl.tags.nacc.enabled');
        const pingEnabled = this.api.config.get('ws_pl.tags.ping.enabled');
        const radarEnabled = this.api.config.get('ws_pl.tags.radar.enabled');
        const rncEnabled = this.api.config.get('ws_pl.tags.rnc.enabled');
        const stataccEnabled = this.api.config.get('ws_pl.tags.statacc.enabled');

        if (!blacklistEnabled) url += '&blacklist=false';
        if (!gapsEnabled) url += '&gaps=false';
        if (!naccEnabled) url += '&nacc=false';
        if (!pingEnabled) url += '&ping=false';
        if (!radarEnabled) url += '&radar=false';
        if (!rncEnabled) url += '&rnc=false';
        if (!stataccEnabled) url += '&statacc=false';

        try {
            const response = await axiosInstance.get(url);
            const tags = response.data.tags;
            // Cache for 30 minutes (1800000 ms)
            await this.cache.addKey(cacheKey, tags, 30 * 60 * 1000);
            return tags;
        } catch (error) {
            console.error(`Error fetching tags for player ${player}:`);
            return null;
        }
    }

    async onConfigChanged() {
        if (this.cache) {
            await this.cache.clear();
        }
        // Re-fetch tags for all currently tagged players with new settings
        if (this.taggedPlayers && this.taggedPlayers.size > 0) {
            for (const [uuid, oldTags] of this.taggedPlayers.entries()) {
                // Try to get player name from API if possible
                let player = this.api.getPlayerByUUID ? this.api.getPlayerByUUID(uuid) : null;
                let playerName = player ? player.username || player.name : uuid;
                // Fetch new tags (by uuid or name)
                let tags = await this.fetchPlayerTags(playerName);
                if (tags && tags.length > 0) {
                    this.taggedPlayers.set(uuid, tags);
                } else {
                    this.taggedPlayers.delete(uuid);
                }
            }
        }
    }

}

class WinstreakCache {

    constructor(WinstreakwsPlugin) {
        this.ws = WinstreakwsPlugin;
        this.cache = new Map();
        this.expireInterval = setInterval(() => this.expireKeys(), 60000);
    }

    async addKey(key, value, ttl) {
        const expiresAt = Date.now() + ttl;
        this.cache.set(key, { value, expiresAt });
    }

    async expireKeys() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (entry.expiresAt <= now) {
                this.cache.delete(key);
            }
        }
    }

    async getKey(key) {
        const entry = this.cache.get(key);
        if (entry && entry.expiresAt > Date.now()) {
            return entry.value;
        }
        return null;
    }

    async clear() {
        this.cache.clear();
    }

    async removeKey(key) {
        this.cache.delete(key);
    }

    async hasKey(key) {
        const entry = this.cache.get(key);
        return !!entry && entry.expiresAt > Date.now();
    }

    async getAllKeys() {
        const now = Date.now();
        return Array.from(this.cache.entries())
            .filter(([key, entry]) => entry.expiresAt > now)
            .map(([key]) => key);
    }

}

function getMinecraftColorByNumber(num) {
    // Map of decimal RGB to Minecraft color codes
    const colorMap = [
        { code: '§0', rgb: [0, 0, 0] },         // black
        { code: '§1', rgb: [0, 0, 170] },       // dark_blue
        { code: '§2', rgb: [0, 170, 0] },       // dark_green
        { code: '§3', rgb: [0, 170, 170] },     // dark_aqua
        { code: '§4', rgb: [170, 0, 0] },       // dark_red
        { code: '§5', rgb: [170, 0, 170] },     // dark_purple
        { code: '§6', rgb: [255, 170, 0] },     // gold
        { code: '§7', rgb: [170, 170, 170] },   // gray
        { code: '§8', rgb: [85, 85, 85] },      // dark_gray
        { code: '§9', rgb: [85, 85, 255] },     // blue
        { code: '§a', rgb: [85, 255, 85] },     // green
        { code: '§b', rgb: [85, 255, 255] },    // aqua
        { code: '§c', rgb: [255, 85, 85] },     // red
        { code: '§d', rgb: [255, 85, 255] },    // pink
        { code: '§e', rgb: [255, 255, 85] },    // yellow
        { code: '§f', rgb: [255, 255, 255] },   // white
    ];

    // If num is a hex color (e.g. 0xFFAA00 or "#FFAA00"), convert to decimal RGB
    let r, g, b;
    if (typeof num === 'string' && num.startsWith('#')) {
        num = parseInt(num.slice(1), 16);
    }
    if (typeof num === 'number') {
        r = (num >> 16) & 0xFF;
        g = (num >> 8) & 0xFF;
        b = num & 0xFF;
    } else {
        return '§f'; // fallback to white
    }

    // Find the closest color by Euclidean distance
    let minDist = Infinity;
    let closestCode = '§f';
    for (const entry of colorMap) {
        const dr = r - entry.rgb[0];
        const dg = g - entry.rgb[1];
        const db = b - entry.rgb[2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) {
            minDist = dist;
            closestCode = entry.code;
        }
    }
    return closestCode;
}