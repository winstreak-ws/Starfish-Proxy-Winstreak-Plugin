// Urchin Integration Plugin
// Provides automatic tag checking, blacklisting, and client tag display

const https = require('https');

module.exports = (api) => {
    api.metadata({
        name: 'urchin',
        displayName: 'Urchin',
        prefix: '§5UC',
        version: '2.0.0',
        author: 'Starfish',
        description: 'Integration with Urchin API for automatic blacklisting and client tags'
    });

    const urchin = new UrchinPlugin(api);
    
    const configSchema = [
        {
            label: 'API Configuration',
            description: 'Configure Urchin API settings',
            defaults: { 
                api: { 
                    enabled: true,
                    apiKey: '',
                    sources: 'GAME,PARTY'
                }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'api.enabled',
                    text: ['DISABLED', 'ENABLED'],
                    description: 'Enable or disable Urchin tag checking.'
                },
                {
                    type: 'text',
                    key: 'api.apiKey',
                    description: 'Your Urchin API key (required for functionality).',
                    placeholder: 'Enter your Urchin API key'
                },
                {
                    type: 'text',
                    key: 'api.sources',
                    description: 'Tag sources to check (comma separated).',
                    placeholder: 'GAME,PARTY'
                },
                {
                    type: 'button',
                    key: 'api.testConnection',
                    text: 'Test API',
                    description: 'Test your API key connection to Urchin. Use "/urchin setkey <key>" to set your API key first',
                    color: '§a',
                    handler: (ctx) => {
                        const apiKey = ctx.config.get('api.apiKey');
                        
                        if (!apiKey) {
                            ctx.sendError('No API key configured. Use "/urchin setkey <your-api-key>" to set it');
                            return;
                        }
                        
                        ctx.sendSuccess('Testing API connection...');
                        
                        const https = require('https');
                        const options = {
                            hostname: 'urchin.ws',
                            path: `/player?key=${apiKey}&sources=GAME`,
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Content-Length': Buffer.byteLength('{"usernames":[]}')
                            }
                        };

                        const req = https.request(options, (res) => {
                            let data = '';
                            res.on('data', (chunk) => {
                                data += chunk;
                            });
                            res.on('end', () => {
                                if (res.statusCode === 200) {
                                    try {
                                        JSON.parse(data);
                                        ctx.sendSuccess('API key is valid and working!');
                                    } catch (e) {
                                        if (data === "Invalid Key") {
                                            ctx.sendError('Invalid API key - use "/urchin setkey <key>" to update it');
                                        } else {
                                            ctx.sendError('API response parsing failed');
                                        }
                                    }
                                } else {
                                    ctx.sendError(`API test failed with status ${res.statusCode}`);
                                }
                            });
                        });

                        req.on('error', (err) => {
                            ctx.sendError(`API test failed: ${err.message}`);
                        });
                        
                        req.write('{"usernames":[]}');
                        req.end();
                    }
                }
            ]
        },
        {
            label: 'Automatic Features',
            description: 'Configure automatic tag checking and display',
            defaults: { 
                automatic: { 
                    checkOnWho: true,
                    checkOpponents: true,
                    checkTeams: true,
                    showCompletionMessage: true
                }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'automatic.checkOnWho',
                    text: ['OFF', 'ON'],
                    description: 'Automatically check tags when /who command is used.'
                },
                {
                    type: 'toggle',
                    key: 'automatic.checkOpponents',
                    text: ['OFF', 'ON'],
                    description: 'Automatically check tags for opponents in games.'
                },
                {
                    type: 'toggle',
                    key: 'automatic.checkTeams',
                    text: ['OFF', 'ON'],
                    description: 'Automatically check tags for team members.'
                },
                {
                    type: 'toggle',
                    key: 'automatic.showCompletionMessage',
                    text: ['OFF', 'ON'],
                    description: 'Show completion message after batch checks.'
                }
            ]
        },
        {
            label: 'Display Settings',
            description: 'Configure how tags are displayed',
            defaults: { 
                display: { 
                    addTagsToTab: true,
                    tagIcon: '⚠',
                    playSound: true
                }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'display.addTagsToTab',
                    text: ['OFF', 'ON'],
                    description: 'Add tag indicators to player names in tab list.'
                },
                {
                    type: 'text',
                    key: 'display.tagIcon',
                    description: 'Icon to display next to tagged players.',
                    placeholder: '⚠'
                },
                {
                    type: 'toggle',
                    key: 'display.playSound',
                    text: ['OFF', 'ON'],
                    description: 'Play sound when tagged players are found.'
                }
            ]
        },
        {
            label: 'Ignored Users',
            description: 'Users to ignore when checking tags',
            defaults: { 
                ignored: { 
                    users: 'Raccoonism'
                }
            },
            settings: [
                {
                    type: 'text',
                    key: 'ignored.users',
                    description: 'Comma-separated list of usernames to ignore.',
                    placeholder: 'username1,username2'
                }
            ]
        }
    ];

    api.initializeConfig(configSchema);
    api.configSchema(configSchema);

    api.commands((registry) => {
        registry.command('v')
            .description('Check Urchin tags for specific users')
            .argument('<usernames>', 'Usernames to check (space separated)')
            .handler((ctx) => urchin.handleVCommand(ctx.args.usernames));
        
        registry.command('tag')
            .description('Add a tag to a player')
            .argument('<player>', 'Player to tag')
            .argument('<tagtype>', 'Type of tag')
            .argument('[hide_username]', 'Hide username (true/false)', { optional: true })
            .argument('<reason...>', 'Reason for tag (can be multiple words)')
            .handler((ctx) => {
                urchin.handleTagCommand(ctx.args.player, ctx.args.tagtype, ctx.args.reason, ctx.args.hide_username, false);
            });
        
        registry.command('forcetag')
            .description('Force add a tag to a player (overwrite existing)')
            .argument('<player>', 'Player to tag')
            .argument('<tagtype>', 'Type of tag')
            .argument('[hide_username]', 'Hide username (true/false)', { optional: true })
            .argument('<reason...>', 'Reason for tag (can be multiple words)')
            .handler((ctx) => {
                urchin.handleTagCommand(ctx.args.player, ctx.args.tagtype, ctx.args.reason, ctx.args.hide_username, true);
            });
        
        registry.command('setkey')
            .description('Set your Urchin API key')
            .argument('<apikey>', 'Your Urchin API key')
            .handler((ctx) => urchin.handleSetKeyCommand(ctx.args.apikey));
    });
    
    urchin.registerHandlers();
    return urchin;
};

class UrchinPlugin {
    constructor(api) {
        this.api = api;
        this.PLUGIN_PREFIX = this.api.getPrefix();
        this.taggedDisplayNames = new Map();
        
        this.VALID_TAG_TYPES = [
            'info', 'caution', 'closet_cheater', 'confirmed_cheater', 
            'blatant_cheater', 'possible_sniper', 'sniper', 'legit_sniper', 'account'
        ];
    }

    registerHandlers() {
        this.api.on('packet:server:chat', this.onChatPacket.bind(this));
        this.api.on('world.change', this.onWorldChange.bind(this));
        this.api.on('plugin.restored', this.onPluginRestored.bind(this));
    }

    onWorldChange(event) {
        this.taggedDisplayNames.clear();
        this.api.clearAllCustomDisplayNames();
    }

    onPluginRestored(event) {
        if (event.pluginName === 'urchin') {
            this.taggedDisplayNames.clear();
        }
    }

    onChatPacket(event) {
        if (!this.api.config.get('api.enabled')) return;
        if (event.data.position === 2) return; // Ignore action bar messages

        try {
            const text = this.extractTextFromJson(event.data.message);
            const cleanText = this.stripColorCodes(text);
            
            if (cleanText.trim()) {
                if (cleanText.startsWith('ONLINE:') && this.api.config.get('automatic.checkOnWho')) {
                    const usernames = cleanText
                        .replace('ONLINE:', '')
                        .split(',')
                        .map(name => name.trim())
                        .filter(name => name.length > 0);
                    this.processUsernames(usernames, false);
                }
                else if (cleanText.includes('Opponent:') && this.api.config.get('automatic.checkOpponents')) {
                    const username = this.extractUsername(cleanText.split('Opponent:')[1].trim());
                    if (username) {
                        this.processUsernames([username], false);
                    }
                }
                else if (cleanText.startsWith('Team #') && this.api.config.get('automatic.checkTeams')) {
                    const username = this.extractUsername(cleanText.split(':')[1].trim());
                    if (username) {
                        this.processUsernames([username], false);
                    }
                }
            }
        } catch (err) {
            this.api.debugLog(`Error processing chat packet: ${err.message}`);
        }
    }

    handleVCommand(args) {
        if (!this.api.config.get('api.enabled')) {
            this.sendErrorMessage('Urchin tag checking is disabled');
            return;
        }
        
        if (!args || args.trim() === '') {
            this.sendUsageMessage();
            return;
        }
        
        const apiKey = this.api.config.get('api.apiKey');
        if (!apiKey) {
            this.sendErrorMessage('API key not configured. Set it in plugin config.');
            return;
        }
        
        const usernames = args.split(' ').filter(Boolean);
        this.processUsernames(usernames, true);
    }

    handleSetKeyCommand(apiKey) {
        if (!apiKey || apiKey.trim() === '') {
            this.sendErrorMessage('Usage: /urchin setkey <your-api-key>');
            return;
        }
        
        this.api.config.set('api.apiKey', apiKey.trim());
        this.sendSuccessMessage('API key has been set successfully!');
        this.sendInfoMessage('You can now test it with /urchin config and clicking the Test API button');
    }

    handleTagCommand(player, tagType, reason, hideUsername, isForce) {
        if (!this.api.config.get('api.enabled')) {
            this.sendErrorMessage('Urchin tag checking is disabled');
            return;
        }

        if (!player || !tagType || !reason) {
            this.sendErrorMessage(`Usage: /${isForce ? 'forcetag' : 'tag'} <player> <tagtype> <reason> [hide_username]`);
            this.sendErrorMessage(`Valid tag types: ${this.VALID_TAG_TYPES.join(', ')}`);
            return;
        }
        
        const apiKey = this.api.config.get('api.apiKey');
        if (!apiKey) {
            this.sendErrorMessage('API key not configured. Set it in plugin config.');
            return;
        }
        
        const normalizedTagType = tagType.toLowerCase();
        
        if (!this.VALID_TAG_TYPES.includes(normalizedTagType)) {
            this.sendErrorMessage(`Invalid tag type. Valid options: ${this.VALID_TAG_TYPES.join(', ')}`);
            return;
        }
        
        const reasonText = Array.isArray(reason) ? reason.join(' ') : reason;
        const hideUsernameFlag = hideUsername === 'true' || hideUsername === true;
        
        this.sendInfoMessage(`Processing tag for ${player}...`);
        
        this.addTagToPlayer(player, normalizedTagType, reasonText, hideUsernameFlag, isForce);
    }

    async addTagToPlayer(player, tagType, reason, hideUsername, overwrite) {
        try {
            const uuid = await this.usernameToUUID(player);
            const response = await this.addTag(uuid, tagType, reason, hideUsername, overwrite);
            
            if (response.statusCode === 200) {
                this.sendSuccessMessage(`Successfully added ${this.formatTagType(tagType)} tag to ${player}`);
            } else if (response.statusCode === 422) {
                this.sendErrorMessage('Tag already exists. Use /forcetag to overwrite.');
            } else if (response.statusCode === 409) {
                this.handleTagConflict(response.data, player);
            } else {
                this.sendErrorMessage(`Error: ${response.statusCode} - ${response.data || 'Unknown error'}`);
            }
        } catch (error) {
            this.sendErrorMessage(`Error: ${error.message}`);
        }
    }

    handleTagConflict(responseData, player) {
        try {
            const errorData = JSON.parse(responseData);
            if (errorData.detail && errorData.detail.current_tags) {
                const existingTag = errorData.detail.current_tags[0];
                const tagType = existingTag.tag_type;
                const reason = existingTag.reason;
                const addedOn = new Date(existingTag.added_on);
                const dateString = addedOn.toLocaleDateString() + ' ' + addedOn.toLocaleTimeString();
                
                this.sendErrorMessage(`${player} already has a ${this.formatTagType(tagType)} tag:`);
                this.sendInfoMessage(`Reason: ${reason}`);
                this.sendInfoMessage(`Added: ${dateString}`);
                this.sendInfoMessage('Use /forcetag to overwrite.');
            } else {
                this.sendErrorMessage('User already has a tag. Use /forcetag to overwrite.');
            }
        } catch (error) {
            this.sendErrorMessage('User already has a tag. Use /forcetag to overwrite.');
        }
    }

    async checkApiKeyValid() {
        const apiKey = this.api.config.get('api.apiKey');
        if (!apiKey) {
            this.sendErrorMessage('API key not configured. Set it in plugin config.');
            return false;
        }

        try {
            const testResponse = await this.testApiConnection();
            return testResponse.valid;
        } catch (error) {
            if (error.message === "Invalid API Key") {
                this.sendErrorMessage('Invalid API key detected. Plugin has been disabled.');
                this.api.config.set('api.enabled', false);
                return false;
            }
            return false;
        }
    }

    async testApiConnection() {
        const apiKey = this.api.config.get('api.apiKey');
        
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'urchin.ws',
                path: `/player?key=${apiKey}&sources=GAME`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength('{"usernames":[]}')
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            JSON.parse(data);
                            resolve({ valid: true });
                        } catch (e) {
                            if (data === "Invalid Key") {
                                reject(new Error("Invalid API Key"));
                            } else {
                                resolve({ valid: false });
                            }
                        }
                    } else {
                        resolve({ valid: false });
                    }
                });
            });

            req.on('error', (err) => {
                resolve({ valid: false });
            });
            
            req.write('{"usernames":[]}');
            req.end();
        });
    }

    processUsernames(usernames, skipIgnore = false) {
        const ignoredUsers = this.getIgnoredUsers();
        const filteredUsernames = skipIgnore ? usernames : usernames.filter(username => !ignoredUsers.includes(username));
        
        if (filteredUsernames.length === 0) return;
        
        const apiKey = this.api.config.get('api.apiKey');
        if (!apiKey) {
            this.sendErrorMessage('API key not configured. Set it in plugin config.');
            return;
        }
        
        this.batchCheckUrchinTags(filteredUsernames).then(response => {
            let hasAnyTags = false;
            
            for (const username in response.players) {
                const tags = response.players[username];
                
                if (tags && tags.length > 0) {
                    hasAnyTags = true;
                    for (const tag of tags) {
                        this.displayTagMessage(username, tag);
                        this.updatePlayerDisplayName(username, tag);
                    }
                }
            }
            
            if (this.api.config.get('automatic.showCompletionMessage')) {
                this.sendSuccessMessage('All checks completed');
            }
            
            if (hasAnyTags && this.api.config.get('display.playSound')) {
                this.api.sound('note.pling');
            }
            
        }).catch(err => {
            if (err.message === "Invalid API Key") {
                this.sendErrorMessage('Invalid API key detected. Plugin has been disabled.');
                this.api.config.set('api.enabled', false);
            } else {
                this.sendErrorMessage(`Error checking tags: ${err.message}`);
            }
        });
    }

    updatePlayerDisplayName(username, tag) {
        if (!this.api.config.get('display.addTagsToTab')) return;
        
        const player = this.api.getPlayerByName(username);
        if (!player) return;
        
        const tagIcon = this.api.config.get('display.tagIcon') || '⚠';
        const tagColor = this.getTagColor(tag.type);
        const tagSuffix = ` §${tagColor}${tagIcon}`;
        
        this.taggedDisplayNames.set(player.uuid, { username, tag });
        this.api.setCustomDisplayName(player.uuid, username + tagSuffix);
    }

    displayTagMessage(username, tag) {
        const timeAgo = this.getTimeAgo(tag.added_on);
        const tagType = this.formatTagType(tag.type);
        const message = `${this.PLUGIN_PREFIX} §f${username} §cis tagged §ffor §c${tagType}§f: ${tag.reason} §7(Added: ${timeAgo})`;
        this.api.chat(message);
    }

    async batchCheckUrchinTags(usernames) {
        const apiKey = this.api.config.get('api.apiKey');
        const sources = this.api.config.get('api.sources') || 'GAME,PARTY';
        
        return new Promise((resolve, reject) => {
            const requestBody = { usernames: usernames };
            const jsonBody = JSON.stringify(requestBody);
            
            const options = {
                hostname: 'urchin.ws',
                path: `/player?key=${apiKey}&sources=${sources}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(jsonBody)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response === "Invalid Key") {
                            throw new Error("Invalid API Key");
                        }
                        resolve(response);
                    } catch (err) {
                        reject(err);
                    }
                });
            });

            req.on('error', (err) => {
                reject(err);
            });
            
            req.write(jsonBody);
            req.end();
        });
    }

    async usernameToUUID(username) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.mojang.com',
                path: `/users/profiles/minecraft/${encodeURIComponent(username)}`,
                method: 'GET'
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const response = JSON.parse(data);
                            if (response && response.id) {
                                const uuid = response.id.replace(
                                    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
                                    '$1-$2-$3-$4-$5'
                                );
                                resolve(uuid);
                            } else {
                                reject(new Error('Invalid response from Mojang API'));
                            }
                        } catch (error) {
                            reject(new Error(`Failed to parse response: ${error.message}`));
                        }
                    } else if (res.statusCode === 204 || res.statusCode === 404) {
                        reject(new Error(`Player not found: ${username}`));
                    } else {
                        reject(new Error(`Mojang API error: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            req.end();
        });
    }

    async addTag(uuid, tagType, reason, hideUsername, overwrite) {
        const apiKey = this.api.config.get('api.apiKey');
        
        return new Promise((resolve, reject) => {
            const undashedUuid = uuid.replace(/-/g, '');
            
            const requestBody = {
                uuid: undashedUuid,
                tag_type: tagType.toLowerCase(),
                reason: reason,
                hide_username: hideUsername,
                overwrite: overwrite
            };
            
            const jsonBody = JSON.stringify(requestBody);
            
            const options = {
                hostname: 'urchin.ws',
                path: `/admin/add-tag?key=${apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(jsonBody)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        data: data
                    });
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });
            
            req.write(jsonBody);
            req.end();
        });
    }

    getIgnoredUsers() {
        const ignoredString = this.api.config.get('ignored.users') || '';
        return ignoredString.split(',').map(name => name.trim()).filter(name => name.length > 0);
    }

    extractTextFromJson(message) {
        if (typeof message === 'string') {
            try {
                const parsed = JSON.parse(message);
                if (parsed.extra) {
                    return parsed.extra.map(part => part.text || '').join('');
                }
                return parsed.text || '';
            } catch (e) {
                return message;
            }
        }
        return message.text || '';
    }

    stripColorCodes(text) {
        return text.replace(/§[0-9a-fk-or]/g, '');
    }

    extractUsername(text) {
        return this.stripColorCodes(text)
            .replace(/^\[.*?\]\s*/, '')
            .trim();
    }

    getTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'just now';
        
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
        
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
        
        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 30) return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
        
        const diffInMonths = Math.floor(diffInDays / 30);
        if (diffInMonths < 12) return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`;
        
        const diffInYears = Math.floor(diffInMonths / 12);
        return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`;
    }

    formatTagType(type) {
        return type.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    getTagColor(type) {
        switch (type) {
            case 'info':
                return '7'; // light_gray
            case 'closet_cheater':
            case 'blatant_cheater':
            case 'account':
            case 'caution':
                return '6'; // gold
            case 'confirmed_cheater':
                return '5'; // dark_purple
            case 'sniper':
            case 'legit_sniper':
            case 'possible_sniper':
                return 'c'; // red
            default:
                return 'f'; // white
        }
    }

    sendErrorMessage(message) {
        this.api.chat(`${this.PLUGIN_PREFIX} §c${message}`);
    }

    sendSuccessMessage(message) {
        this.api.chat(`${this.PLUGIN_PREFIX} §a${message}`);
    }

    sendInfoMessage(message) {
        this.api.chat(`${this.PLUGIN_PREFIX} §e${message}`);
    }

    sendUsageMessage() {
        this.api.chat(`${this.PLUGIN_PREFIX} §eUsage: /v <username>`);
    }
}