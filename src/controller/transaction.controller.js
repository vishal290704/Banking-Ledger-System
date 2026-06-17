
async function createTransaction(req, res){
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body

    id(!fromAccount || !toAccount || !amount || !idempotencyKey){
        res.status(400).json({
            message: "fromAccount, toAccount, amount and idempotencyKey are required"
        })
    }
}