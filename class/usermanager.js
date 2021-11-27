module.exports = class usermanager {
    constructor(connection, database) {
        this.connection = connection
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
                dbConnect.db(this.database).collection('users').updateOne({_id: id}, {$set: user}, (error, result) => {
                    if (error) reject(error)
                    dbConnect.close()
                    resolve(result)
                })
            })
        })
    }
}