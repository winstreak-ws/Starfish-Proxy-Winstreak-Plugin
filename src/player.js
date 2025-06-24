class Player {
    constructor(data) {
        // store raw data for cloning
        this._data = { ...data };
        
        // basic info
        this.uuid = data.uuid;
        this.name = data.name;
        this.displayName = data.displayName || data.name;
        this.entityId = data.entityId;
        
        // position and movement
        this.position = { ...data.position };
        this.lastPosition = { ...data.lastPosition };
        this.rotation = { ...data.rotation };
        this.onGround = data.onGround;
        
        // calculate velocity from position change
        const dx = this.position.x - this.lastPosition.x;
        const dy = this.position.y - this.lastPosition.y;
        const dz = this.position.z - this.lastPosition.z;
        this.velocity = { x: dx, y: dy, z: dz };
        
        // states
        this.isCrouching = data.isCrouching || false;
        this.isSprinting = data.isSprinting || false;
        this.isUsingItem = data.isUsingItem || false;
        this.isBlocking = data.isBlocking || data.isUsingItem || false;
        
        // game data
        this.health = data.health || 20;
        this.team = data.team ? { ...data.team } : null;
        this.equipment = { ...data.equipment };
        this.heldItem = data.heldItem;
        this.effects = new Map(data.effects || []);
        
        // timing data
        this.ticksExisted = data.ticksExisted || 0;
        this.lastSeen = data.lastSeen || Date.now();
        this.lastMoved = data.lastMoved || Date.now();
        this.ping = data.ping || 0;
        
        // make this object immutable from plugin perspective
        Object.freeze(this.position);
        Object.freeze(this.lastPosition);
        Object.freeze(this.rotation);
        Object.freeze(this.velocity);
        Object.freeze(this.equipment);
        if (this.team) Object.freeze(this.team);
        
        // prevent modification of core properties
        this._preventModification();
    }

    // utility: calculate distance to another player
    distanceTo(otherPlayer) {
        if (!otherPlayer || !otherPlayer.position) return Infinity;
        
        const dx = this.position.x - otherPlayer.position.x;
        const dy = this.position.y - otherPlayer.position.y;
        const dz = this.position.z - otherPlayer.position.z;
        
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // utility: calculate horizontal distance to another player
    horizontalDistanceTo(otherPlayer) {
        if (!otherPlayer || !otherPlayer.position) return Infinity;
        
        const dx = this.position.x - otherPlayer.position.x;
        const dz = this.position.z - otherPlayer.position.z;
        
        return Math.sqrt(dx * dx + dz * dz);
    }

    // utility: check if player is in specified team
    isInTeam(teamName) {
        return this.team && this.team.name === teamName;
    }

    // utility: check if player has effect
    hasEffect(effectId) {
        return this.effects.has(effectId);
    }

    // utility: get effect details
    getEffect(effectId) {
        return this.effects.get(effectId);
    }

    // utility: get movement speed (horizontal)
    getMovementSpeed() {
        return Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    }

    // utility: get total speed
    getTotalSpeed() {
        return Math.sqrt(
            this.velocity.x * this.velocity.x + 
            this.velocity.y * this.velocity.y + 
            this.velocity.z * this.velocity.z
        );
    }

    // utility: check if player is moving
    isMoving() {
        return this.velocity.x !== 0 || this.velocity.y !== 0 || this.velocity.z !== 0;
    }

    // utility: get time since last movement (ms)
    getTimeSinceLastMove() {
        return Date.now() - this.lastMoved;
    }

    // utility: get time since last seen (ms)
    getTimeSinceLastSeen() {
        return Date.now() - this.lastSeen;
    }

    // utility: check if holding specific item type
    isHoldingItem(itemId) {
        return this.heldItem && this.heldItem.blockId === itemId;
    }

    // utility: get equipped item in slot (0-5: armor + held item)
    getEquipment(slot) {
        return this.equipment[slot];
    }

    // utility: check if wearing armor
    hasArmor() {
        return !!(this.equipment[1] || this.equipment[2] || this.equipment[3] || this.equipment[4]);
    }

    // prevent modifications after construction
    _preventModification() {
        Object.defineProperty(this, 'position', { writable: false });
        Object.defineProperty(this, 'velocity', { writable: false });
        Object.defineProperty(this, 'health', { writable: false });
        Object.defineProperty(this, 'uuid', { writable: false });
        Object.defineProperty(this, 'name', { writable: false });
    }
}

module.exports = Player; 