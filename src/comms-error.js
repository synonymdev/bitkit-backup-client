

export default class CommsError extends Error {
    constructor(msgObj) {
        super(msgObj.error)
        this.details = msgObj
    }
}
