import { SDK } from '@synonymdev/slashtags-sdk'
import { BackupProtocol } from '../common/backup-protocol.js'

// The backup servers slashtag should be known. This is my test server
// When you run the server, it will log out it's slashtag - replace this with your backup servers address
const serverSlashtag = 'slash://oec3lwxl6j3kyiawchkzaj2lpspg4ztolmoik7kmer6vslxfo2gq/'

// the backup server and client must both know a shared secret to prevent spam. Set this here
const sharedSecret = 'exampleSecretThing'

async function main() {
    // Setup the SDK
    const options = {
        persist: false,
        protocols: [
            BackupProtocol,
        ]
    }
    const sdk = await SDK.init(options)

    // Generate a new random slashtag for this client
    const st = sdk.slashtag({ name: 'Alice' });
    await st.ready();

    // Show it
    console.log("Example client Slashtag:", st.url.toString())

    // Create a new backup protocol
    const backups = st.protocol(BackupProtocol)

    // Give the protocol the shared secret
    backups.setSecret(sharedSecret)

    try {
        // Pick a category that our backups will be linked to
        // Valid categories are lower case a-z and . only. Must start and end with a lower case a-z
        const category = 'bitkit.lightning.channels'

        // Some options - setting a timeout to 3000ms. (should be higher for production)
        // Requests will fail if a response has not been received within this time
        const opts = { timeout: 3000 }

        // Get a list of available backups
        const query = { category }
        const availableBackupsBefore = await backups.getRecentBackups(serverSlashtag, query, opts)

        // Prepare some data to back up
        const data = {
            appName: 'Example App',
            appVersion: '1.0.0',
            category,
            content: Buffer.from('Hello World', 'utf8')
        }

        // ask for it to be backed up (throws on error)
        const status = await backups.backupData(serverSlashtag, data, opts)
        console.log('Backup complete', status)

        // another backup of the same data
        await backups.backupData(serverSlashtag, data, opts)

        // Get a list of available backups now (should include our backup above)
        const availableBackupsAfter = await backups.getRecentBackups(serverSlashtag, query, opts)
        console.log('Backups:', availableBackupsAfter)

        // Prepare the data to restore some data
        // Needs our slashtag, category of the data and the timestamp it was saved at
        const restore = {
            category,
            timestamp: status.timestamp
        }

        // ask for the data
        const original = await backups.restoreData(serverSlashtag, restore, opts)

        // show it
        console.log('Restored Data')
        console.log(original, original.content.toString())
    } catch (err) {
        // something went wrong
        console.log("ERROR", err)
    }
}

main()
