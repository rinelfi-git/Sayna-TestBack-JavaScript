const express = require('express')
const path = require('path')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const { ObjectId } = require('bson')
const app = express()

/**
 * services
 */
const usermanager = require('./service/user-manager')
const tokenmanager = require('./service/token-manager.js')

/**
 * constants
 */
const URI = `mongodb://09df1712e49909d01854ac32cf98e48b:09df1712e49909d01854ac32cf98e48b@11a.mongo.evennode.com:27018/?authSource=09df1712e49909d01854ac32cf98e48b&replicaSet=eu-11`
// const URI = `mongodb+srv://rinelfi:rinelfi@cluster0.8jg3l.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`
const DB_NAME = '09df1712e49909d01854ac32cf98e48b'
const userService = new usermanager(URI, DB_NAME)
const tokenService = new tokenmanager(URI, DB_NAME)
const PORT = 5000 // application listening port
const MAX_AUTHORIZED_ATTEMPS = 3
const NEXT_TRY = 1 // 1 hour
const WAITING_TIMESTAMP = 3600000 * NEXT_TRY  // 3600000 ms is 1 hour
// token encryption using RSA256
const { publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
// hash for obtaining new token
const REFRESH_KEY = crypto.randomBytes(64).toString('hex')

/**
 * middleware
 */
app.use(express.json())

function checkToken(request, response, next) {
    /**
     * 
     */
    const { token } = request.params
    if (token === null) {
        response.status(401).json({
            error: true,
            message: `Le token envoyé n'est pas comforme`
        })
    } else {
        jwt.verify(token, PUBLIC_KEY, { algorithms: 'RS256' }, (error, callback) => {
            if (error && error.name === 'JsonWebTokenError') {
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
    response.sendFile(path.join(__dirname, 'html', 'index.html'))
}).post('/login', (request, response) => {
    /**
     * check first if fields are filled
     * then try to match email with database record
     * if it exists then match password too
     * user have to give right credential unless account will be freezed after a certain number of attempts
     * if everithing is OK so create a token for authentication with a refresh token 
     */
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
                    if (user.next > 0) {
                        // account is freezed for a while
                        const date = new Date(user.next - Date.now())
                        response.status(409).json({
                            error: true,
                            message: `Trop de tentative sur l'email '${user.email}' - Veuillez patienter ${date.getUTCHours()}h ${date.getMinutes()}mn ${date.getSeconds()}s`
                        })
                    } else if (password === user.password) {
                        // initiate attempts and next attributes
                        user.attempts = 0
                        user.next = -1
                        userService.update(id, user).then(() => {
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
                        if (user.attempts >= MAX_AUTHORIZED_ATTEMPS) {
                            user.next = Date.now() + WAITING_TIMESTAMP
                            user.attempts = 0
                            userService.update(id, user)
                            response.status(409).json({
                                error: true,
                                message: `Trop de tentative sur l'email '${user.email}' - Veuillez patienter ${NEXT_TRY}h`
                            })
                        } else {
                            user.attempts++
                            userService.update(id, user)
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
    /**
     * register a new user
     * check first if required fields are not empty otherwise throw an error
     * then check if data format are corrects otherwise throw an error
     * match given email address to the database record ensuring that no one is using it yet otherwise throw an error
     * if everything is OK create token and send it to user
     */
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
                message: `L'une des données ibligatoires ne sont pas conformes`
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
    /**
     * get user information from given token
     */
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
    /**
     * update user information
     * check first if all required data are presents otherwise throw error
     * then select fields whose data are provided and change it
     */
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
    /**
     * update user password
     * check first if data is provided otherwise throw error
     */
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
}).get('/users/:token', checkToken, (request, response) => {
    // return all users list
    userService.getAll().then(users => {
        response.status(200).json({
            error: false,
            users
        })
    })
}).delete('/user/:token', (request, response) => {
    // delete token then user will be disconnected
    const { token } = request.params
    tokenService.delete(token)
    response.status(200).json({
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
    const dateLimits = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    let valid = false
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(date)) {
        let [year, month, day] = date.split('-')
        year = parseInt(year, 10)
        month = parseInt(month, 10)
        day = parseInt(day, 10)
        if (month !== 2) {
            if (day <= dateLimits[month - 1]) valid = true
        } else {
            if (day <= 28) valid = true
            else if (leapYear(year) && day <= 29) valid = true
        }
    }
    return valid
}

function leapYear(year) {
    return year % 400 === 0 || year % 4 == 0 && year % 100 !== 0
}