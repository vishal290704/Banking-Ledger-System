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
}, 30000)

afterEach(async () => {
    const collections = mongoose.connection.collections

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