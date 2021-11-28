const { MongoClient } = require("mongodb")

module.exports = class TokenManager {
    constructor(uri, database) {
        this.connection = new MongoClient(uri)
        this.database = database
    }

    tokenExists(token) {
        return new Promise((resolve, reject) => {
            this.connection.connect((error, dbConnect) => {
                dbConnect.db(this.database).collection('tokens').findOne({ token }, (error, result) => {
                    if (error) reject(error)
                    dbConnect.close()
                    resolve(result != null)
                })
            })
        })
    }

    delete(token) {
        return new Promise((resolve, reject) => {
            this.connection.connect((error, dbConnect) => {
                dbConnect.db(this.database).collection('tokens').deleteOne({ token }, (error, result) => {
                    if (error) reject(error)
                    dbConnect.close()
                    resolve(result)
                })
            })
        })
    }

    async persist(user, token, refreshToken) {
        await new Promise((resolve, reject) => {
            this.connection.connect((error, dbConnect) => {
                if (error) reject(error)
                dbConnect.db(this.database).collection('tokens').deleteOne({ user }, (error, result) => {
                    if (error) reject(error)
                    dbConnect.close()
                    resolve(result)
                })
            })
        })
        return new Promise((resolve, reject) => {
            this.connection.connect((error, dbConnect) => {
                if (error) reject(error)
                dbConnect.db(this.database).collection('tokens').insertOne({ user, token, refreshToken }, (error, result) => {
                    if (error) reject(error)
                    dbConnect.close()
                    resolve(result)
                })
            })
        })
    }
}