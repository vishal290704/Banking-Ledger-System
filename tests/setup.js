const mongoose = require("mongoose")
const {
    MongoMemoryReplSet
} = require("mongodb-memory-server")

let mongoServer

beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({
        replSet: {
            count: 1,
            storageEngine: "wiredTiger"
        }
    })

    const mongoUri = mongoServer.getUri()

    await mongoose.connect(mongoUri)

    /*
     * Load all application models.
     */
    const userModel =
        require("../src/models/user.model")

    const accountModel =
        require("../src/models/account.model")

    const transactionModel =
        require("../src/models/transaction.model")

    const ledgerModel =
        require("../src/models/ledger.model")

    const blackListModel =
        require("../src/models/blackList.model")

    /*
     * Wait for Mongoose to create the collections and indexes.
     *
     * This is important because MongoDB transactions should not
     * overlap with collection/index catalog changes.
     */
    await Promise.all([
        userModel.init(),
        accountModel.init(),
        transactionModel.init(),
        ledgerModel.init(),
        blackListModel.init()
    ])
}, 30000)

afterEach(async () => {
    const collections =
        mongoose.connection.collections

    for (const collectionName of Object.keys(collections)) {
        await collections[collectionName].deleteMany({})
    }
})

afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()

    if (mongoServer) {
        await mongoServer.stop()
    }
}, 30000)