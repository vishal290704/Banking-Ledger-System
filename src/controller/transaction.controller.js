const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")
const emailService = require("../services/email.service")
const mongoose = require("mongoose")


async function createTransaction(req, res){

    /**
     * -Validate request (fromAccount)
     */
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body

    if(!fromAccount || !toAccount || !amount || !idempotencyKey){
        return res.status(400).json({
            message: "fromAccount, toAccount, amount and idempotencyKey are required"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        _id:fromAccount,
    })

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })

    if(!fromUserAccount || !toUserAccount){
        return res.status(400).json({
            message:"Invalid fromAccount or toAccount"
        })
    }

    /**
     * -Validate Idempotency keys
     */

    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey:idempotencyKey
    })

    if(isTransactionAlreadyExists){
        if(isTransactionAlreadyExists=="COMPLETED"){
            return res.status(200).json({
                message:"Transaction already processed",
                transaction: isTransactionAlreadyExists
            })
        }
        if(isTransactionAlreadyExists=="PENDING"){
            return res.status(200).json({
                message:"Transaction is still processing"
            })
        }
        if(isTransactionAlreadyExists=="FAILED"){
           return res.status(500).json({
                message:"Transaction processing failed, please retry"
            })
        }
             if(isTransactionAlreadyExists=="REVERSED"){
           return res.status(500).json({
                message:"Transaction was reversed, please retry"
            })
        }
    }

    /**
     * Check account status
     */

    if(!fromUserAccount.status !== "ACTIVE" || toUserAccount !== "ACTIVE"){
        return res.status(400).json({
            message:"Both fromAccount and toAccount must be ACTIVE to process transaction"
        })
    }

    /**
     * Derive sender balance from ledger
     */
    const balance = await fromUserAccount.getBalance()
    if(balance < amount){
       return res.status(400).json({
            message:`Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`
        })
    }

/**
 * -Create transaction(PENDING)
 */

const session = await mongoose.startSession()
session.startTransaction()
const transaction = await transactionModel.create({
    fromAccount,
    toAccount,
    amount,
    idempotencyKey,
    status:"PENDING"
},{session})

const debitLedgerEntry = await ledgerModel.create({
    account:fromAccount,
    amount:amount,
    transaction:transaction._id,
    type:"DEBIT"
},{session})


const creditLedgerEntry = await ledgerModel.create({
    account:toAccount,
    amount:amount,
    transaction:transaction._id,
    type:"CREDIT"
},{session})

transaction.status = "COMPLETED"
await transaction.save({session})

await session.commitTransaction()
session.endSession()

/**
 * Send Email Notofication
 */

await email.emailService.sendTransactionEmail((req.user.email, req.user.name, amount, toUserAccount._id))
return res.status(200).json({
    message:"Transaction processed successfully",
    transaction:transaction
})




}