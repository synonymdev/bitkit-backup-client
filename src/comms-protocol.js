import sodium from 'sodium-universal'
import { SlashProtocol } from '@synonymdev/slashtags-sdk'
import CommsError from './comms-error.js'

/**
 * Request / Response message protocol
 *
 * Messages should be the following format
 *  {
 *      msgId: <uint unique id for this message>
 *      signature: {    // optional signature
 *          timestamp: uint ms timestamp,
 *          hash: c.string,
 *      },
 *      params: {
 *          <any data you want to include with your message>
 *      }
 *  }
 */
export default class SlashCommsProtocol extends SlashProtocol {
    constructor(opts) {
        super(opts)
        this.nextMessageId = 1
        this.pending = []
    }

    /**
     * Generate a unique id for this run
     * @returns
     */
    nextId() {
        this.nextMessageId += 1
        return this.nextMessageId
    }

    /**
     * Called to handle incoming getRecent requests. Just emits an event, so the local
     * server side code can handle it
     * @param {*} name - name of success response
     * @param {*} message - message
     * @param {*} channel - channel to respond on
     */
    handleRequest(name, message, channel) {
        const id = message.msgId
        const data = message.params
        const eventName = `${name}.request`
        const responseName = `${name}.response`
        const peerSlashtag = channel.peerInfo.slashtag.url.toString()

        // Fire an event and expect the receiver to deal with it and call
        // either success or failed
        this.emit(eventName, {
            peerSlashtag,
            data,
            success: async (params) => this.send(channel, responseName, { msgId: id, params }),
            failed: async (error, code = 500) => this.send(channel, 'error', { msgId: message.msgId, params: { error, code } })
        });
    }

    /**
     * Given a request id, return a promise that resolves when the matching response arrives.
     * @param {*} id
     * @param {*} ms - uint milliseconds
     * @returns
     */
    waitForResponse(id, ms = 30000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new CommsError({ error: `Timed out after ${ms} ms.` })), ms);
            this.pending.push({
                msgId: id,
                expires: Date.now() + ms,
                success: (msg) => {
                    clearTimeout(timer)
                    resolve(msg)
                },
                failed: (msg) => {
                    clearTimeout(timer)
                    reject(new CommsError(msg))
                }
            })
        })
    }

    /**
     * Looks for someone waiting for a response to the given id
     * @param {*} message
     * @param {*} err - object with details of the error. Must include an 'error' string property with a description
     * @returns
     */
    pendingComplete(id, message, err) {
        // see if the id is in the pending list
        const p = this.pending.find((p) => p.msgId === id)
        if (p !== undefined) {
            // call the appropriate handler
            (err) ? p.failed(err) : p.success(message)

            // remove the handler (and any that have timed out)
            const now = Date.now()
            this.pending = this.pending.filter((p) => p.msgId !== id && p.expires >= now)
        }
    }

    /**
     * Sends a named message
     * @param {*} channel
     * @param {*} name
     * @param {*} message
     * @returns
     */
    send(channel, name, message) {
        const i = this.messages.findIndex((m) => m.name === name)
        if (i < 0) {
            return
        }

        channel.messages[i].send(message)
    }

    /**
     * Generates a hash from the noise handshake hash and a shared secret
     * This is used to verify that requests are coming from known users (eg bitkit wallet)
     * and not just some random stanger that know the backup servers slashtag, spamming us
     * @param {*} message
     * @param {*} secret
     * @returns
     */
    _getSignature(handshakeHash, secret) {
        const timestamp = Date.now()
        const toSign = this._generateMessageToHash(handshakeHash, timestamp)

        const hashBuffer = Buffer.alloc(32)
        sodium.crypto_generichash(hashBuffer, toSign, Buffer.from(secret))

        return {
            timestamp,
            hash: hashBuffer.toString('hex')
        }
    }

    /**
     * Verify the hash passed over to us by a peer.
     * To pass this test, the peer must be on the same connection session (as the handshake hash
     * changes on each connection), and knows the shared secret.
     * @param {*} handshakeHash
     * @param {*} secret
     * @param {*} signature
     * @returns
     */
    _verifySignature(handshakeHash, secret, signature) {
        // Generate the hash here from our own data
        const timestamp = signature.timestamp
        const toSign = this._generateMessageToHash(handshakeHash, timestamp)

        const hashBuffer = Buffer.alloc(32)
        sodium.crypto_generichash(hashBuffer, toSign, Buffer.from(secret))
        const hash = hashBuffer.toString('hex')

        // and check it matches the one given to us
        return (hash === signature.hash)
    }

    /**
     * Generates the message to hash
     * @param {*} hash
     * @param {*} timestamp
     * @returns
     */
    _generateMessageToHash(msg, timestamp) {
        return Buffer([...msg, ...Buffer.from(`${timestamp}`)])
    }
}

