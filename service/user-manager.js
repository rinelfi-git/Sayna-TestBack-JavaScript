const { MongoClient } = require("mongodb")

module.exports = class UserManager {
    constructor(uri, database) {
        this.connection = new MongoClient(uri)
        this.database = database
    }

    emailExists(email) {
        return new Promise((resolve, reject) => {
            this.connection.connect((error, dbConnect) => {
                if (error) reject(error)
                dbConnect.db(this.database).collection('users').findOne({ email }, (error, result) => {
                    if (error) reject(error)
                    dbConnect.close()
                    resolve(result != null)
                })
            })
        })
    }

    getAll() {
        return new Promise((resolve, reject) => {
            this.connection.connect((error, dbConnect) => {
                if (error) reject(error)
                const client = dbConnect.db(this.database)
                client.collection('users').find({}, { projection: { _id: 0, firstname: 1, lastname: 1, email: 1, sex: 1 } }).toArray((error, result) => {
                    if (error) reject(error)
                    dbConnect.close()
                    resolve(result)
                })
            })
        })
    }

    findByEmail(email) {
        return new Promise((resolve, reject) => {
            this.connection.connect((error, dbConnect) => {
                if (error) reject(error)
                dbConnect.db(this.database).collection('users').findOne({ email }, (error, result) => {
                    if (error) reject(error)
                    dbConnect.close()
                    resolve(result)
                })
            })
        })
    }

    findById(id) {
        return new Promise((resolve, reject) => {
            this.connection.connect((error, dbConnect) => {
                if (error) reject(error)
                dbConnect.db(this.database).collection('users').findOne({ _id: id }, (error, result) => {
                    if (error) reject(error)
                    dbConnect.close()
                    resolve(result)
                })
            })
        })
    }

    persist(user) {
        return new Promise((resolve, reject) => {
            this.connection.connect((error, dbConnect) => {
                if (error) reject(error)
                dbConnect.db(this.database).collection('users').insertOne(user, (error, result) => {
                    if (error) reject(error)
                    dbConnect.close()
                    resolve(result.insertedId)
                })
            })
        })
    }

    update(id, user) {
        return new Promise((resolve, reject) => {
            this.connection.connect((error, dbConnect) => {
                if (error) reject(error)
                dbConnect.db(this.database).collection('users').updateOne({ _id: id }, { $set: user }, (error, result) => {
                    if (error) reject(error)
                    dbConnect.close()
                    resolve(result)
                })
            })
        })
    }
}