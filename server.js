const express = require('express')
const { MongoClient } = require('mongodb')
const path = require('path')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const app = express()
const User = require('./class/user')

/**
 * services
 */
const usermanager = require('./class/usermanager')
const tokenmanager = require('./class/tokenmanager.js')
const { ObjectId } = require('bson')

/**
 * statical data
 */
const LOCAL_DATABASE = `mongodb://localhost:36017/`
// const DATABASE_URI = `mongodb+srv://rinelfi:rinelfi@cluster0.8jg3l.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`
const DB_NAME = 'sayna-test-api'
const DB_CONNECT = new MongoClient(LOCAL_DATABASE)
const userService = new usermanager(DB_CONNECT, DB_NAME)
const tokenService = new tokenmanager(DB_CONNECT, DB_NAME)
const PORT = 3001
const MAX_AUTHORIZED_ATTEMPS = 3
const NEXT_TRY = 1 // 1 hour
const WAITING_TIMESTAMP = 3600000 * NEXT_TRY  // 3600000 was added at the begining for optimization
const { publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const REFRESH_KEY = crypto.randomBytes(64).toString('hex')

/**
 * middleware
 */
app.use(express.json())

function checkToken(request, response, next) {
    const { token } = request.params
    if (token === null) {
        response.status(401).json({
            error: true,
            message: `Le token envoyé n'est pas comforme`
        })
    } else {
        jwt.verify(token, PUBLIC_KEY, { algorithms: 'RS256' }, (error, callback) => {
            if (error && error.name === 'JsonWebTokenError') {
                console.log('bla bla')
                response.status(401).json({
                    error: true,
                    message: `Le token envoyé n'est pas comforme`
                })
            } else if (error && error.name === 'TokenExpiredError') {
                response.status(401).json({
                    error: true,
                    message: `Votre token n'est plus valide, veuillez reinitialiser`
                })
            } else {
                tokenService.tokenExists(token).then(exists => {
                    if (!exists) {
                        response.status(401).json({
                            error: true,
                            message: `Le token envoyé n'existe pas`
                        })
                    } else next()
                })
            }
        })
    }
}

/**
 * application
 */
app.get('/', (request, response) => {
    let user = new User()
    response.sendFile(path.join(__dirname, 'html', 'index.html'))
}).post('/login', (request, response) => {
    const { email, password } = request.body

    if (email === '' || password === '') {
        /**
         * one field is empty
         */
        response.status(401).json({
            error: true,
            message: `L'email/password est manquant`
        })
    } else {
        userService.emailExists(email).then(emailExists => {
            if (emailExists) {
                userService.findByEmail(email).then(user => {
                    const id = user._id
                    const selectedUser = new User(user)
                    if (selectedUser.next > 0) {
                        // account is freezed for a while
                        const currentTimestamp = Date.now()
                        const date = new Date(selectedUser.next - currentTimestamp)
                        response.status(409).json({
                            error: true,
                            message: `Trop de tentative sur l'email '${selectedUser.email}' - Veuillez patienter ${date.getUTCHours()}h ${date.getMinutes()}mn ${date.getSeconds()}s`
                        })
                    } else if (password === selectedUser.password) {
                        // initiate attempts and next attributes
                        selectedUser.attempts = 0
                        selectedUser.next = -1
                        userService.update(id, selectedUser).then(() => {
                            // create token
                            const token = jwt.sign({ id, email }, PRIVATE_KEY, { algorithm: 'RS256' })
                            const refreshToken = jwt.sign({ id, email }, REFRESH_KEY)
                            tokenService.persist(id, token, refreshToken)
                            response.status(200).json(content = {
                                error: false,
                                message: `L'utilisateur a été authentifié avec succès`,
                                tokens: {
                                    token,
                                    refreshToken,
                                    createdAt: Date.now()
                                }
                            })
                        })
                    } else {
                        if (selectedUser.attempts >= MAX_AUTHORIZED_ATTEMPS) {
                            selectedUser.next = Date.now() + WAITING_TIMESTAMP
                            userService.update(id, selectedUser)
                            response.status(409).json({
                                error: true,
                                message: `Trop de tentative sur l'email '${selectedUser.email}' - Veuillez patienter ${NEXT_TRY}h`
                            })
                        } else {
                            selectedUser.incrementAttemps()
                            userService.update(id, selectedUser)
                            response.status(401).json({
                                error: true,
                                message: `Votre email ou password est erroné`
                            })
                        }
                    }
                })
            } else {
                /**
                 * both email and password don't exist in the database
                 */
                response.status(401).json({
                    error: true,
                    message: `Votre email ou password est erroné`
                })
            }
        })
    }
}).post('/register', (request, response) => {
    const { firstname, lastname, email, password, birthday, sex } = request.body
    const structure = { firstname, lastname, email, password, birthday, sex }
    let status = 200, content = { error: false, message: '' }
    for (element in structure) {
        if (structure[element] === '') {
            status = 401
            content = {
                error: true,
                message: `L'une ou plusieurs des données  obligatoires sont manquantes`
            }
        }
    }
    if (!content.error) {
        if (!emailValid(email) || !dateValid(birthday)) {
            status = 401
            content = {
                error: true,
                message: `L'un des données ibligatoires ne sont pas conformes`
            }
            response.status(status).send(content)
        } else {
            userService.emailExists(email).then(exists => {
                if (exists) {
                    status = 401
                    content = {
                        error: true,
                        message: `Votre email n'est pas correct`
                    }
                    response.status(status).send(content)
                } else {
                    userService.persist(new User({ firstname, lastname, email, password, birthday, sex, attempts: 0, next: -1 })).then(id => {
                        // create token
                        const token = jwt.sign({ id, email }, PRIVATE_KEY, { algorithm: 'RS256' })
                        const refreshToken = jwt.sign({ id, email }, REFRESH_KEY)
                        tokenService.persist(id, token, refreshToken)
                        status = 201
                        content = {
                            error: false,
                            message: `L'utilisateur a bien été créé avec succès`,
                            tokens: {
                                token: token,
                                refreshToken: refreshToken,
                                createdAt: Date.now()
                            }
                        }
                        response.status(status).send(content)
                    })
                }
            })
        }
    } else response.status(status).send(content)
}).get('/user/:token', checkToken, (request, response) => {
    let { email } = jwt.verify(request.params.token, PUBLIC_KEY, { algorithms: 'RS256' })
    userService.findByEmail(email).then(user => {
        response.status(200).json({
            error: false,
            user: {
                firstname: user.firstname,
                lastname: user.lastname,
                email: user.email,
                birthday: user.birthday,
                sex: user.sex,
                createdAt: Date.now()
            }
        })
    })
}).put('/user/:token', checkToken, (request, response) => {
    const { firstname, lastname, birthday, sex } = request.body
    const user = { firstname, lastname, birthday, sex }
    const update = {}
    let iteration = 0
    for (element in user) {
        if (typeof user[element] === 'undefined') iteration++
        else update[element] = user[element]
    }
    if (iteration === 4) {
        response.status(401).json({
            error: true,
            message: `Aucune données n'a été envoyée`
        })
    } else {
        const { id } = jwt.verify(request.params.token, PUBLIC_KEY, { algorithms: 'RS256' })
        userService.update(ObjectId(id), update).then(() => {
            response.status(200).json({
                error: false,
                message: `L'utilisateur a été modifié avec succès`
            })
        })
    }
}).put('/password/:token', checkToken, (request, response) => {
    const { password } = request.body
    if (typeof password === 'undefined' || password === '') {
        response.status(401).json({
            error: true,
            message: `Aucune données n'a été envoyée`
        })
    } else {
        const { id } = jwt.verify(request.params.token, PUBLIC_KEY, { algorithms: 'RS256' })
        userService.update(ObjectId(id), { password }).then(() => {
            response.status(200).json({
                error: false,
                message: `Le mot de passe a été modifié avec succès`
            })
        })
    }
}).get('/users/:token', (request, response) => {
    const { token } = request.params
    let status = 200, content = { error: false, message: '' }
    response.status(status).send(content)
}).delete('/user/:token', (request, response) => {
    const { token } = request.params

    response.json({
        error: false,
        message: `L'utiliateur a été déconnecté avec succès`
    })
})

/**
 * starting application
 */
app.listen(PORT, () => {
    console.log(`Server is running on port : ${PORT}`)
})

/**
 * helpers
 */
function emailValid(email) {
    return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)
}

function dateValid(date) {
    const yearStart = 1970
    const dateLimits = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    let valide = false
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(date)) {
        let [year, month, day] = date.split('-')
        year = parseInt(year, 10)
        month = parseInt(month, 10)
        day = parseInt(day, 10)
        if (month !== 2) {
            if (day <= dateLimits[month - 1]) valide = true
        } else {
            if (day <= 28) valide = true
            else if (leapYear(year) && day <= 29) valide = true
        }
    }
    return valide
}

function leapYear(year) {
    return year % 400 === 0 || year % 4 == 0 && year % 100 !== 0
}