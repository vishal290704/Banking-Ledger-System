module.exports = {
    testEnvironment: "node",

    setupFilesAfterEnv: [
        "<rootDir>/tests/setup.js"
    ],

    clearMocks: true,

    testTimeout: 30000,

    collectCoverageFrom: [
        "src/**/*.js",
        "!src/config/**"
    ]
}