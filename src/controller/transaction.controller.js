const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")
const emailService = require("../services/email.service")
const mongoose = require("mongoose")

async function createTransaction(req, res) {
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body

    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "fromAccount, toAccount, amount and idempotencyKey are required"
        })
    }

    const fromUserAccount = await accountModel.findById(fromAccount)
    const toUserAccount = await accountModel.findById(toAccount)

    if (!fromUserAccount || !toUserAccount) {
        return res.status(400).json({
            message: "Invalid fromAccount or toAccount"
        })
    }

    const existingTransaction = await transactionModel.findOne({
        idempotencyKey
    })

    if (existingTransaction) {
        return res.status(200).json({
            message: "Transaction already processed",
            transaction: existingTransaction
        })
    }

    if (
        fromUserAccount.status !== "ACTIVE" ||
        toUserAccount.status !== "ACTIVE"
    ) {
        return res.status(400).json({
            message: "Both accounts must be ACTIVE"
        })
    }

    const balance = await fromUserAccount.getBalance()

    if (balance < amount) {
        return res.status(400).json({
            message: `Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`
        })
    }

    let session
    let transaction

    try {
        session = await mongoose.startSession()
        session.startTransaction()

        transaction = (
            await transactionModel.create(
                [{
                    fromAccount,
                    toAccount,
                    amount,
                    idempotencyKey,
                    status: "PENDING"
                }],
                { session }
            )
        )[0]

        await ledgerModel.create(
            [{
                account: fromAccount,
                amount,
                transaction: transaction._id,
                type: "DEBIT"
            }],
            { session }
        )

        await ledgerModel.create(
            [{
                account: toAccount,
                amount,
                transaction: transaction._id,
                type: "CREDIT"
            }],
            { session }
        )

        transaction.status = "COMPLETED"
        await transaction.save({ session })

        await session.commitTransaction()

        try {
            await emailService.sendTransactionEmail(
                req.user.email,
                req.user.name,
                amount,
                toUserAccount._id
            )
        } catch (emailError) {
            console.error(emailError)
        }

        return res.status(200).json({
            message: "Transaction processed successfully",
            transaction
        })

    } catch (err) {

        if (session) {
            await session.abortTransaction()
        }

        console.error(err)

        return res.status(500).json({
            message: "Transaction failed"
        })

    } finally {

        if (session) {
            session.endSession()
        }
    }
}

async function createInitialFundsTransaction(req, res) {
    return res.status(200).json({
        message: "Initial funds transaction endpoint working"
    })
}

module.exports = {
    createTransaction,
    createInitialFundsTransaction
}