import c from 'compact-encoding'
import cstruct from 'compact-encoding-struct'
import SlashCommsProtocol from './comms-protocol.js'


// Message Signing Data - used in all requests
// ===========================================
const MessageSignature = cstruct.compile({
    // hash of shared secret and noise handshake hash
    timestamp: c.uint,
    hash: c.string,
})


// Request Recent Backups message and data
// =======================================
const GetRecentParams = cstruct.compile({
    category: c.string,
})

const GetRecentMsg = cstruct.compile({
    msgId: c.uint,
    signature: MessageSignature,
    params: GetRecentParams
})

// Success Response to the GetRecentMsg, containing a list of backups
// =======================================
const AvailableBackup = cstruct.compile({
    timestamp: c.uint,
})

const RecentBackupsParams = cstruct.compile({
    category: c.string,
    backups: c.array(AvailableBackup)
})

const RecentBackupsMsg = cstruct.compile({
    msgId: c.uint,
    params: RecentBackupsParams
})


// Backup a blob of data
// =======================================

const BackupData = cstruct.compile({
    appName: c.string,
    appVersion: c.string,
    category: c.string,
    content: c.buffer,
})

const BackupDataMsg = cstruct.compile({
    msgId: c.uint,
    signature: MessageSignature,
    params: BackupData
})


// Success Response to asking to back up some data
// =======================================

const BackupResponseMsg = cstruct.compile({
    msgId: c.uint,
    params: AvailableBackup
})


// Restore data
// =======================================

const RestoreRequest = cstruct.compile({
    category: c.string,
    timestamp: c.uint,
})

const RestoreMsg = cstruct.compile({
    msgId: c.uint,
    signature: MessageSignature,
    params: RestoreRequest
})



// Restore data response
// =======================================


const RestoreData = cstruct.compile({
    appName: c.string,
    appVersion: c.string,
    category: c.string,
    content: c.buffer,
    timestamp: c.uint,
})

const RestoreResponseMsg = cstruct.compile({
    msgId: c.uint,
    params: RestoreData
})



// Generic Error message with a message and error code in it
// =======================================
const GenericFailParams = cstruct.compile({
    error: c.string,
    code: c.int
})

const GenericFailMsg = cstruct.compile({
    msgId: c.uint,
    params: GenericFailParams
})


/**
 * The Subscription class
 */
export class BackupProtocol extends SlashCommsProtocol {
    constructor(opts) {
        super(opts)
        this.sharedSecret = ''
    }

    /**
     * Protocol name
     */
    static get protocol() {
        return 'bitkit.backup';
    }


    /**
     * List of messages this protocol supports
     */
    get messages() {
        return [
            {
                name: 'recentBackups.request',
                description: 'Request for a list of recent backups on a category',
                encoding: GetRecentMsg,
                onmessage: (message, channel) => this.handleRequest('recentBackups', message, channel),
            },
            {
                name: 'recentBackups.response',
                description: 'The response to getRecent, containing an array of backups',
                encoding: RecentBackupsMsg,
                onmessage: (message, channel) => this.pendingComplete(message.msgId, message, null),
            },

            {
                name: 'backupData.request',
                description: 'Back up some data',
                encoding: BackupDataMsg,
                onmessage: (message, channel) => this.handleRequest('backupData', message, channel),
            },
            {
                name: 'backupData.response',
                description: 'Respond successfully to a backup request',
                encoding: BackupResponseMsg,
                onmessage: (message, channel) => this.pendingComplete(message.msgId, message, null),
            },

            {
                name: 'restoreData.request',
                description: 'Ask to restore some data',
                encoding: RestoreMsg,
                onmessage: (message, channel) => this.handleRequest('restoreData', message, channel),
            },
            {
                name: 'restoreData.response',
                description: 'Respond successfully to a restore request',
                encoding: RestoreResponseMsg,
                onmessage: (message, channel) => this.pendingComplete(message.msgId, message, null),
            },

            {
                name: 'error',
                description: 'A generic error response that will reject the pending promise',
                encoding: GenericFailMsg,
                onmessage: (message, channel) => this.pendingComplete(message.msgId, null, message.params),
            },
        ];
    }

    setSecret(secret) {
        this.sharedSecret = secret
    }

    /**
     *
     * @param {*} serverSlashtag
     * @param {*} data - { category }
     * @param {*} timeout
     * @returns - { category, backups: [{ time: "iso8601", timestamp: c.uint}] }
     */
    async getRecentBackups(serverSlashtag, data, opts = {}) {
        return this._requestResponse('recentBackups.request', serverSlashtag, data, opts)
    }

    /**
     * Backup some data, returning the timestamp of the generated backup
     * @param {*} serverSlashtag
     * @param {*} data - { appName, appVersion, category, content }
     * @param {*} timeout
     * @returns - { time: "iso8601", timestamp: c.uint }
     */
    async backupData(serverSlashtag, data, opts = {}) {
        return this._requestResponse('backupData.request', serverSlashtag, data, opts)
    }

    /**
     * Restore some data previously backed up with backupData()
     * @param {*} serverSlashtag
     * @param {*} data - { category: c.string, timestamp: c.uint }
     * @param {*} timeout
     * @returns - { appName: c.string, appVersion: c.string, category: c.string, content: c.buffer }
     */
    async restoreData(serverSlashtag, data, opts = {}) {
        return this._requestResponse('restoreData.request', serverSlashtag, data, opts)
    }

    /**
     * Sends a message to the slashtag given and waits for a response
     * @param {*} msgName
     * @param {*} serverSlashtag
     * @param {*} data
     * @param {*} timeout
     * @returns - depends on message - see above
     */
    async _requestResponse(msgName, serverSlashtag, data, opts) {
        // ensure that category is valid
        this._validateCategory(data.category)

        const timeout = opts.timeout || 5000
        const sharedSecret = this.sharedSecret

        // Build a request and send it to the remote peer
        const id = this.nextId()
        const remote = await this.connect(serverSlashtag)
        const signature = this._getSignature(remote.connection.handshakeHash, sharedSecret)
        this.send(remote.channel, msgName, { msgId: id, params: data, signature })

        // wait for them to respond
        const response = await this.waitForResponse(id, timeout)
        return response.params
    }

    /**
     * Called to handle incoming getRecent requests. Just emits an event, so the local
     * server side code can handle it
     * @param {*} name - name of success response
     * @param {*} message - message
     * @param {*} channel - channel to respond on
     */
    handleRequest(name, message, channel) {
        // If the message includes a signature, check it
        if (message.signature) {
            if (!this._verifySignature(channel.handshakeHash, this.sharedSecret, message.signature)) {
                console.log('signature not valid on incoming message. discarding...')
                this.send(channel, 'error', { msgId: message.msgId, params: { error: "Bad signature", code: 401 } })
                return
            }
        }

        // all good, so do the normal thing and let the server handle the message
        super.handleRequest(name, message, channel)
    }

    /**
     * Checks the category name is 'valid' and throws an exception if it is not
     * Ignores if category is undefined
     * @param {*} name
     */
    _validateCategory(name) {
        if (name === undefined) {
            return
        }

        // Categories can be in the form 'abc.def.ghi'
        // valid: 'abc', 'abc.defghij', 'a.b.c.d.e.f'
        // Lower case a-z only, plus dot. Must start and end with a letter.
        const regex = /^[a-z]+((\.[a-z]+)*)$/;
        if (regex.exec(name) === null) {
            throw Error('Invalid category name. Must be lower case a-z and . only.')
        }
    }
}
