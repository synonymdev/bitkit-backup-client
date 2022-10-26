import { SDK } from '@synonymdev/slashtags-sdk'
import BackupProtocol from '../src/backup-protocol.js'

// The backup servers slashtag should be known. This is my test server
// When you run the server, it will log out it's slashtag - replace this with your backup servers address
const serverSlashtag = 'slash:abc....slashtag.address'

// the backup server and client must both know a shared secret to prevent spam. Set this here
const sharedSecret = 'some-shared-secret-between-client-and-server'

async function main() {
    // Setup the SDK
    const options = {
        persist: false,
        storage: './data',
    }

    const sdk = new SDK(options)
    await sdk.ready()

    // Generate a new random slashtag for this client
    const st = sdk.slashtag('Alice');

    // Show it
    console.log("Example client Slashtag:", st.url)

    // Create a new backup protocol
    const backups = new BackupProtocol(st)
    backups.setSecret(sharedSecret)

    try {
        // Pick a category that our backups will be linked to
        // Valid categories are lower case a-z and . only. Must start and end with a lower case a-z
        const category = 'bitkit.lightning.channels'

        // Get a list of available backups
        const query = { category }
        const availableBackupsBefore = await backups.getRecentBackups(serverSlashtag, query)
        console.log('Available Backups Response:', availableBackupsBefore)

        // Prepare some data to back up
        const data = {
            appName: 'Example App',
            appVersion: '1.0.0',
            category,
            content: Buffer.from('Hello World', 'utf8')
        }

        // ask for it to be backed up (throws on error)
        const status = await backups.backupData(serverSlashtag, data)
        console.log('Backup complete', status)

        // another backup of the same data
        await backups.backupData(serverSlashtag, data)

        // Get a list of available backups now (should include our backup above)
        const availableBackupsAfter = await backups.getRecentBackups(serverSlashtag, query)
        console.log('Updated available Backups:', availableBackupsAfter)

        // Prepare the data to restore some data
        // Needs our slashtag, category of the data and the timestamp it was saved at
        const restore = {
            category,
            timestamp: status.results.timestamp
        }

        // ask for the data
        const original = await backups.restoreData(serverSlashtag, restore)

        // show it
        console.log('Restored Data')
        console.log(data, original)
    } catch (err) {
        // something went wrong
        console.log('Error connecting and talking to backpack server')
        console.log(err)
    }
}

main()
