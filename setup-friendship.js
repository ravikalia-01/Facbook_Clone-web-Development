const mongoose = require("mongoose")

// Database connection
const DB = `mongodb+srv://rkalia95:Q4PueojPZkKQ5j5C@facebookclone.npi4xpm.mongodb.net/?retryWrites=true&w=majority&appName=FacebookClone`

// User Schema
const Schema = mongoose.Schema
const userSchema = new Schema({
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    profilePicture: { type: String, default: '/images/default-profile.png' },
    bio: { type: String, maxlength: 500, default: '' },
    friends: [{ type: Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true })

const User = mongoose.model('User', userSchema)

async function setupFriendship() {
    try {
        await mongoose.connect(DB)
        console.log('Connected to database')
        
        // Find John and Jane
        const john = await User.findOne({ email: 'john.doe@test.com' })
        const jane = await User.findOne({ email: 'jane.smith@test.com' })
        
        if (!john) {
            console.log('John not found')
            return
        }
        
        if (!jane) {
            console.log('Jane not found')
            return
        }
        
        console.log('Found John:', john.firstName, john.lastName)
        console.log('Found Jane:', jane.firstName, jane.lastName)
        
        // Add each other as friends
        if (!john.friends.includes(jane._id)) {
            john.friends.push(jane._id)
            await john.save()
            console.log('Added Jane to John\'s friends')
        }
        
        if (!jane.friends.includes(john._id)) {
            jane.friends.push(john._id)
            await jane.save()
            console.log('Added John to Jane\'s friends')
        }
        
        console.log('Friendship established successfully!')
        
    } catch (error) {
        console.error('Error:', error)
    } finally {
        await mongoose.disconnect()
        console.log('Disconnected from database')
    }
}

setupFriendship()
