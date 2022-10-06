import c from 'compact-encoding'
import cstruct from 'compact-encoding-struct'
import SlashtagsRPC from '@synonymdev/slashtags-rpc';
import { format } from '@synonymdev/slashtags-url';


// Request Recent Backups message and data
// =======================================
const GetRecentParams = cstruct.compile({
    category: c.string,
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
    success: c.bool,
    error: c.string,
    results: cstruct.opt(RecentBackupsParams, {})
})


// Backup a blob of data
// =======================================

const BackupData = cstruct.compile({
    appName: c.string,
    appVersion: c.string,
    category: c.string,
    content: c.buffer,
})

// Success Response to asking to back up some data
// =======================================

const BackupResponseMsg = cstruct.compile({
    success: c.bool,
    error: c.string,
    results: cstruct.opt(AvailableBackup, {})
})


// Restore data
// =======================================

const RestoreRequest = cstruct.compile({
    category: c.string,
    timestamp: c.uint,
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
    success: c.bool,
    error: c.string,
    results: cstruct.opt(RestoreData, {})
})



/**
 * The Subscription class
 */
export default class BackupProtocol extends SlashtagsRPC {
    constructor(slashtag) {
        super(slashtag)
        this.sharedSecret = ''
        this.connection = null
        this.handlers = []
    }

    setSecret(secret) {
        this.sharedSecret = secret
    }

    /**
     * Server calls this to register handlers to do the actual work
     * @param {*} name 
     * @param {*} callback 
     */
    registerHandler(name, callback) {
        this.handlers = this.handlers.filter((v) => v.name !== name)
        this.handlers.push({
            name,
            callback
        })
    }

    /**
     * Clients call this to get a list of recent backups
     * @param {*} serverSlashtag
     * @param {*} data - { category }
     * @returns - { success: true, result: { category, backups: [{ time: "iso8601", timestamp: c.uint}] }}
     */
    async getRecentBackups(serverSlashtag, data) {
        const name = 'recentBackups'
        const options = this._getOptions(name)

        return this._requestResponse(name, serverSlashtag, data, options)
    }

    /**
     * Backup some data, returning the timestamp of the generated backup
     * @param {*} serverSlashtag
     * @param {*} data - { appName, appVersion, category, content }
     * @returns - { success: true, result: { time: "iso8601", timestamp: c.uint }}
     */
    async backupData(serverSlashtag, data) {
        const name = 'backupData'
        const options = this._getOptions(name)

        return this._requestResponse(name, serverSlashtag, data, options)
    }

    /**
     * Restore some data previously backed up with backupData()
     * @param {*} serverSlashtag
     * @param {*} data - { category: c.string, timestamp: c.uint }
     * @returns - { success: true, result: { appName: c.string, appVersion: c.string, category: c.string, content: c.buffer }}
     */
    async restoreData(serverSlashtag, data) {
        const name = 'restoreData'
        const options = this._getOptions(name)

        return this._requestResponse(name, serverSlashtag, data, options)
    }

    get id() {
        return 'bitkit.backup.2'
    }

    /**
     * Handshake value encoding
     * @type {import ('compact-encoding').Encoding | undefined }
     */
    get handshakeEncoding() { return c.string }

    /**
     * Return a Handshake sent on channel opening.
     * @param {SecretStream} stream
     * @returns {any}
     */
    handshake(stream) {
        return this.sharedSecret
    }

    /**
     * List of messages this protocol supports
     */
    get methods() {
        return [
            {
                name: 'recentBackups',
                handler: (req, socket) => this._handleIncomingRequest('recentBackups', req, socket),
                options: {
                    valueEncoding: GetRecentParams,
                    responseEncoding: RecentBackupsMsg,
                }
            },
            {
                name: 'backupData',
                handler: (req, socket) => this._handleIncomingRequest('backupData', req, socket),
                options: {
                    valueEncoding: BackupData,
                    responseEncoding: BackupResponseMsg,
                }
            },
            {
                name: 'restoreData',
                handler: (req, socket) => this._handleIncomingRequest('restoreData', req, socket),
                options: {
                    valueEncoding: RestoreRequest,
                    responseEncoding: RestoreResponseMsg,
                }
            },
        ];
    }

    /**
     * Get the options for the named message
     * @param {*} name 
     * @returns 
     */
    _getOptions(name) {
        const m = this.methods.find((v) => v.name === name)
        return m.options
    }

    /**
     * Handles an incoming request. Decorates the request data with info about the peer
     * and deal with error handling
     * @param {*} handler 
     * @param {*} request 
     * @returns 
     */
    async _handleIncomingRequest(handler, request, socket) {
        try {
            // Get all the data for the server to handle the request
            const data = {
                ...request,
                peerSlashtag: format(socket.remotePublicKey),
                peerKey: socket.remotePublicKey
            }

            // call the server
            const results = await this._callHandler(handler, data)

            // decorate the response
            return {
                success: true,
                error: '',
                results
            }
        } catch (err) {
            return this._errorResponse(err.message)
        }
    }

    /**
     * Looks up the handler and calls any registered handler for it
     * @param {*} name 
     * @param {*} data 
     * @returns 
     */
    async _callHandler(name, data) {
        const h = this.handlers.find((v) => v.name === name)
        if (!h) {
            throw new Error(`No handler for ${name}`)
        }

        return h.callback(data)
    }

    /**
     * Sends a message to the slashtag given and waits for a response
     * @param {*} msgName
     * @param {*} serverSlashtag
     * @param {*} data
     * @param {*} timeout
     * @returns - depends on message - see above
     */
    async _requestResponse(msgName, serverSlashtag, data, options) {
        // ensure that category is valid
        this._validateCategory(data.category)

        if (this.connection === null) {
            this.connection = await this.rpc(serverSlashtag)
        }

        if (this.connection === null) {
            throw new Error('Unable to establish connection')
        }

        return this.connection.request(msgName, data, options);
    }

    /**
     * Produces an error resposne
     * @param {*} message 
     * @returns 
     */
    _errorResponse(message) {
        return {
            success: false,
            error: message,
        }
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
