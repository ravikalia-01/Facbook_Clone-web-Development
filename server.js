const express = require("express")
const app = express()
const mongoose = require("mongoose")
const bcrypt = require("bcrypt")
const session = require("express-session")

const HTTP_PORT = process.env.PORT || 8080
// Try MongoDB Atlas first, fallback to local MongoDB
const DB = `mongodb+srv://rkalia95:Q4PueojPZkKQ5j5C@facebookclone.npi4xpm.mongodb.net/?retryWrites=true&w=majority&appName=FacebookClone`

app.set("view engine", "ejs")

// Middleware
app.use(express.static("public"))
app.use(express.urlencoded({ extended: true }))
app.use(session({
    secret: 'facebook-clone-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}))

// Database Schemas
let Schema = mongoose.Schema

// User Schema
const userSchema = new Schema({
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    profilePicture: { type: String, default: '/images/default-profile.png' },
    bio: { type: String, maxlength: 500, default: '' },
    friends: [{ type: Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true })

// Post Schema
const postSchema = new Schema({
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 1000 },
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    comments: [{
        author: { type: Schema.Types.ObjectId, ref: 'User' },
        content: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true })

// Message Schema
const messageSchema = new Schema({
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 1000 },
    isRead: { type: Boolean, default: false }
}, { timestamps: true })

// Friend Request Schema
const friendRequestSchema = new Schema({
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' }
}, { timestamps: true })

// Models
let User = mongoose.model('User', userSchema)
let Post = mongoose.model('Post', postSchema)
let Message = mongoose.model('Message', messageSchema)
let FriendRequest = mongoose.model('FriendRequest', friendRequestSchema)

// Authentication Middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next()
    } else {
        res.redirect('/login')
    }
}

const redirectIfAuth = (req, res, next) => {
    if (req.session.userId) {
        res.redirect('/dashboard')
    } else {
        next()
    }
}

// Routes

// Home route - redirect to login
app.get("/", (req, res) => {
    if (req.session.userId) {
        res.redirect('/dashboard')
    } else {
        res.redirect('/login')
    }
})

// Login routes
app.get("/login", redirectIfAuth, (req, res) => {
    res.render("login")
})

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body
        const user = await User.findOne({ email })
        
        if (!user) {
            return res.render("login", { error: "Invalid email or password" })
        }
        
        const isValidPassword = await bcrypt.compare(password, user.password)
        if (!isValidPassword) {
            return res.render("login", { error: "Invalid email or password" })
        }
        
        req.session.userId = user._id
        res.redirect('/dashboard')
    } catch (error) {
        console.error(error)
        res.render("login", { error: "An error occurred. Please try again." })
    }
})

// Signup routes
app.get("/signup", redirectIfAuth, (req, res) => {
    res.render("signup")
})

app.post("/signup", async (req, res) => {
    try {
        const { firstName, lastName, email, password, confirmPassword } = req.body
        
        if (password !== confirmPassword) {
            return res.render("signup", { error: "Passwords do not match" })
        }
        
        const existingUser = await User.findOne({ email })
        if (existingUser) {
            return res.render("signup", { error: "Email already registered" })
        }
        
        const hashedPassword = await bcrypt.hash(password, 10)
        const newUser = new User({
            firstName,
            lastName,
            email,
            password: hashedPassword
        })
        
        await newUser.save()
        req.session.userId = newUser._id
        res.redirect('/dashboard')
    } catch (error) {
        console.error(error)
        res.render("signup", { error: "An error occurred. Please try again." })
    }
})

// Dashboard
app.get("/dashboard", requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).populate('friends')
        const posts = await Post.find()
            .populate('author', 'firstName lastName')
            .sort({ createdAt: -1 })
            .limit(20)
        
        res.render("dashboard", { user, posts, friends: user.friends })
    } catch (error) {
        console.error(error)
        res.redirect('/login')
    }
})

// Create Post
app.post("/create-post", requireAuth, async (req, res) => {
    try {
        const { content } = req.body
        if (!content.trim()) {
            return res.redirect('/dashboard')
        }
        
        const newPost = new Post({
            author: req.session.userId,
            content: content.trim()
        })
        
        await newPost.save()
        res.redirect('/dashboard')
    } catch (error) {
        console.error(error)
        res.redirect('/dashboard')
    }
})

// Delete Post
app.post("/delete-post", requireAuth, async (req, res) => {
    try {
        const { postId } = req.body
        
        // Find the post and check if the current user is the author
        const post = await Post.findById(postId)
        
        if (!post) {
            return res.redirect('/dashboard')
        }
        
        // Check if the current user is the author of the post
        if (post.author.toString() !== req.session.userId) {
            return res.redirect('/dashboard')
        }
        
        // Delete the post
        await Post.findByIdAndDelete(postId)
        res.redirect('/dashboard')
    } catch (error) {
        console.error(error)
        res.redirect('/dashboard')
    }
})

// Friends page
app.get("/friends", requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).populate('friends')
        const friendRequests = await FriendRequest.find({ 
            recipient: req.session.userId, 
            status: 'pending' 
        }).populate('requester', 'firstName lastName')
        
        const suggestedFriends = await User.find({
            _id: { $ne: req.session.userId },
            _id: { $nin: user.friends }
        }).limit(10)
        
        res.render("friends", { 
            user, 
            friends: user.friends, 
            friendRequests, 
            suggestedFriends 
        })
    } catch (error) {
        console.error(error)
        res.redirect('/dashboard')
    }
})

// Send Friend Request
app.post("/send-friend-request", requireAuth, async (req, res) => {
    try {
        const { recipientId } = req.body
        
        const existingRequest = await FriendRequest.findOne({
            $or: [
                { requester: req.session.userId, recipient: recipientId },
                { requester: recipientId, recipient: req.session.userId }
            ]
        })
        
        if (existingRequest) {
            return res.redirect('/friends')
        }
        
        const newRequest = new FriendRequest({
            requester: req.session.userId,
            recipient: recipientId
        })
        
        await newRequest.save()
        res.redirect('/friends')
    } catch (error) {
        console.error(error)
        res.redirect('/friends')
    }
})

// Accept Friend Request
app.post("/accept-friend", requireAuth, async (req, res) => {
    try {
        const { requestId } = req.body
        const request = await FriendRequest.findById(requestId)
        
        if (!request || request.recipient.toString() !== req.session.userId) {
            return res.redirect('/friends')
        }
        
        // Add each user to the other's friends list
        await User.findByIdAndUpdate(request.requester, {
            $addToSet: { friends: request.recipient }
        })
        await User.findByIdAndUpdate(request.recipient, {
            $addToSet: { friends: request.requester }
        })
        
        // Update request status
        request.status = 'accepted'
        await request.save()
        
        res.redirect('/friends')
    } catch (error) {
        console.error(error)
        res.redirect('/friends')
    }
})

// Decline Friend Request
app.post("/decline-friend", requireAuth, async (req, res) => {
    try {
        const { requestId } = req.body
        await FriendRequest.findByIdAndUpdate(requestId, { status: 'declined' })
        res.redirect('/friends')
    } catch (error) {
        console.error(error)
        res.redirect('/friends')
    }
})

// Remove Friend
app.post("/remove-friend", requireAuth, async (req, res) => {
    try {
        const { friendId } = req.body
        const userId = req.session.userId
        
        // Remove friend from current user's friends list
        await User.findByIdAndUpdate(userId, {
            $pull: { friends: friendId }
        })
        
        // Remove current user from friend's friends list
        await User.findByIdAndUpdate(friendId, {
            $pull: { friends: userId }
        })
        
        res.redirect('/friends')
    } catch (error) {
        console.error(error)
        res.redirect('/friends')
    }
})

// Messages page
app.get("/messages", requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId)
        const { user: selectedUserId } = req.query
        
        // Get conversations
        const conversations = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { sender: new mongoose.Types.ObjectId(req.session.userId) },
                        { recipient: new mongoose.Types.ObjectId(req.session.userId) }
                    ]
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$sender", new mongoose.Types.ObjectId(req.session.userId)] },
                            "$recipient",
                            "$sender"
                        ]
                    },
                    lastMessage: { $first: "$$ROOT" }
                }
            }
        ])
        
        const populatedConversations = await User.populate(conversations, {
            path: "_id",
            select: "firstName lastName"
        })
        
        const formattedConversations = populatedConversations.map(conv => ({
            otherUser: conv._id,
            lastMessage: conv.lastMessage
        }))
        
        let selectedConversation = null
        let messages = []
        
        // If a specific user is selected, get or create conversation
        if (selectedUserId) {
            const otherUser = await User.findById(selectedUserId).select('firstName lastName')
            if (otherUser) {
                selectedConversation = { otherUser }
                
                // Get messages between current user and selected user
                messages = await Message.find({
                    $or: [
                        { sender: req.session.userId, recipient: selectedUserId },
                        { sender: selectedUserId, recipient: req.session.userId }
                    ]
                }).populate('sender', 'firstName lastName').sort({ createdAt: 1 })
                
                // Mark messages as read
                await Message.updateMany({
                    sender: selectedUserId,
                    recipient: req.session.userId,
                    isRead: false
                }, { isRead: true })
            }
        }
        
        res.render("messages", { 
            user, 
            conversations: formattedConversations,
            selectedConversation,
            messages
        })
    } catch (error) {
        console.error(error)
        res.redirect('/dashboard')
    }
})

// Send Message
app.post("/send-message", requireAuth, async (req, res) => {
    try {
        const { recipientId, content } = req.body
        
        if (!content.trim()) {
            return res.redirect('/messages')
        }
        
        const newMessage = new Message({
            sender: req.session.userId,
            recipient: recipientId,
            content: content.trim()
        })
        
        await newMessage.save()
        res.redirect(`/messages?user=${recipientId}`)
    } catch (error) {
        console.error(error)
        res.redirect('/messages')
    }
})

// Profile page
app.get("/profile", requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).populate('friends')
        const posts = await Post.find({ author: req.session.userId })
            .populate('author', 'firstName lastName')
            .sort({ createdAt: -1 })
        
        res.render("profile", { 
            user, 
            profileUser: user, 
            friends: user.friends, 
            posts 
        })
    } catch (error) {
        console.error(error)
        res.redirect('/dashboard')
    }
})

// Update Profile
app.post("/update-profile", requireAuth, async (req, res) => {
    try {
        const { firstName, lastName, bio } = req.body
        
        await User.findByIdAndUpdate(req.session.userId, {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            bio: bio.trim()
        })
        
        res.redirect('/profile')
    } catch (error) {
        console.error(error)
        res.redirect('/profile')
    }
})

// Logout
app.get("/logout", (req, res) => {
    req.session.destroy()
    res.redirect('/login')
})

// Start server
mongoose.connect(DB).then(() => {
    app.listen(HTTP_PORT, () => {
        console.log(`Facebook Clone server listening on: ${HTTP_PORT}`)
    })
}).catch(err => {
    console.log(err)
})
