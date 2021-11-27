module.exports = class user {
    constructor(user) {
        this.firstname = user && user.firstname
        this.lastname = user && user.lastname
        this.birthday = user && user.birthday
        this.sex = user && user.sex
        this.email = user && user.email
        this.password = user && user.password
        this.attempts = user && user.attempts || 0
        this.next = user && user.next || -1 // timestamp
    }
    
    incrementAttemps() {
        this.attempts++
    }

    serialize() {
        return { firstname: this.firstname, lastname: this.lastname, birthday: this.birthday, sex: this.sex, email: this.email, password: this.password }
    }
}