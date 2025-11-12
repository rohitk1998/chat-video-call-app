const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const Message = require('./models/message');
const bcrypt = require('bcrypt'); 
const User = require('./models/users');
const Friends = require('./models/frientrequests');
const jwt = require('jsonwebtoken'); 
const authMiddleware = require('./middleware/auth');


const saltRounds = 10;
const JWT_SECRET = 'secret'; 

const app = express();
const server = http.createServer(app);

// --- Configuration ---
const PORT = process.env.PORT || 5000;
const MONGO_URI = 'mongodb+srv://root:root@cluster0.bcnlkbl.mongodb.net/?appName=Cluster0';

// Middleware
app.use(cors());
app.use(express.json());

// --- Database Connection ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Socket.IO Setup ---
const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins for simplicity, tighten in production
        methods: ['GET', 'POST']
    }
});


// POST /api/register
// Registers a new user
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // 1. Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists.' });
        }

        // 2. Hash the password
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // 3. Create and save the new user
        const newUser = new User({
            username,
            email,
            password: hashedPassword
        });
        await newUser.save();

        // Respond with success (do not send the password back)
        res.status(201).json({ 
            message: 'User registered successfully!', 
            userId: newUser._id,
            username: newUser.username 
        });

    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ message: 'Internal server error during registration.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Find the user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // 2. Compare the provided password with the stored hash
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // 3. GENERATE THE JWT TOKEN
        const token = jwt.sign(
            { id: user._id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' } // Token is valid for 7 days
        );

        // 4. Successful login: Send the token back
        res.status(200).json({ 
            message: 'Login successful!', 
            token: token,
            user: {
                userId: user._id, 
                username: user.username 
            }
        });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Internal server error during login.' });
    }
});


// POST /api/friends/request
// Requires: recipientId (The ID of the user to send the request to)
app.post('/api/friends/request', authMiddleware, async (req, res) => {
    try {
        const senderId = req.user.id;
        const { recipientId } = req.body;

        if (senderId === recipientId) {
            return res.status(400).json({ message: 'Cannot send a friend request to yourself.' });
        }

        // Check if an identical request already exists (either direction)
        const existingFriendship = await Friends.findOne({
            $or: [
                { sender: senderId, recipient: recipientId },
                { sender: recipientId, recipient: senderId }
            ]
        });

        if (existingFriendship) {
            return res.status(400).json({ message: `Friendship is already ${existingFriendship.status}.` });
        }

        // Create the new friend request
        const newFriendship = new Friends({
            sender: senderId,
            recipient: recipientId,
            status: 'pending'
        });
        await newFriendship.save();

        // Optional: Use Socket.IO to notify the recipient in real-time
        // io.to(recipientId).emit('newFriendRequest', { senderId: senderId });

        res.status(201).json({ message: 'Friend request sent successfully.', friendship: newFriendship });

    } catch (error) {
        console.error('Error sending friend request:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});



// PUT /api/friends/response/:friendshipId
// Requires: action ('accept' or 'reject') in the body
app.put('/api/friends/response/:friendshipId', authMiddleware, async (req, res) => {
    try {
        const recipientId = req.user.id; // The user logged in must be the recipient
        const { friendshipId } = req.params;
        const { action } = req.body; // 'accept' or 'reject'

        if (action !== 'accept' && action !== 'reject') {
            return res.status(400).json({ message: 'Invalid action. Must be "accept" or "reject".' });
        }

        const friendship = await Friends.findOne({ 
            _id: friendshipId, 
            recipient: recipientId, // Must be the intended recipient
            status: 'pending' 
        });

        if (!friendship) {
            return res.status(404).json({ message: 'Pending friend request not found or you are not the recipient.' });
        }

        friendship.status = action === 'accept' ? 'accepted' : 'rejected';
        friendship.updatedAt = Date.now();
        await friendship.save();

        res.status(200).json({ 
            message: `Friend request ${friendship.status}.`, 
            friendship 
        });

    } catch (error) {
        console.error('Error responding to friend request:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});



// GET /api/friends/pending
// Retrieves all pending friend requests where the logged-in user is the recipient
app.get('/api/friends/pending', authMiddleware, async (req, res) => {
    try {
        const recipientId = req.user.id;

        const pendingRequests = await Friends.find({ 
            recipient: recipientId, 
            status: 'pending' 
        })
        .populate('sender', 'username email'); // Fetch sender details

        res.status(200).json(pendingRequests);
    } catch (error) {
        console.error('Error fetching pending requests:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});


// GET /api/friends/all
// Retrieves all accepted friends for the logged-in user
app.get('/api/friends/all', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        // Find all accepted friendships where the user is EITHER the sender OR the recipient
        const acceptedFriendships = await Friends.find({
            $or: [
                { sender: userId, status: 'accepted' },
                { recipient: userId, status: 'accepted' }
            ]
        })
        .populate('sender', 'username email')
        .populate('recipient', 'username email');

        // Map the results to show *the other user* as the 'friend'
        const friendsList = acceptedFriendships.map(friendship => {
            if (friendship.sender._id.toString() === userId.toString()) {
                // Logged-in user is the sender, the friend is the recipient
                return friendship.recipient;
            } else {
                // Logged-in user is the recipient, the friend is the sender
                return friendship.sender;
            }
        });

        res.status(200).json(friendsList);
    } catch (error) {
        console.error('Error fetching friends list:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});


// GET /api/users/search?q=query
// Search for users by username or email
app.get('/api/users/search', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const searchQuery = req.query.q;

        if (!searchQuery) {
            return res.status(200).json([]); // Return empty if no query is provided
        }

        // Create a case-insensitive search pattern
        const regex = new RegExp(searchQuery, 'i');

        // Find users matching the search query, excluding the logged-in user
        const users = await User.find({
            _id: { $ne: userId }, // Exclude the current user
            $or: [
                { username: { $regex: regex } },
                { email: { $regex: regex } }
            ]
            //new changed
        })
        .select('username email _id') // Only return necessary fields
        .limit(10); // Limit results for performance

        res.status(200).json(users);

    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ message: 'Internal server error during user search.' });
    }
});


// Real-time Chat Logic
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. Join a specific chat room/conversation
    socket.on('joinConversation', (conversationId) => {
        // Leave any previous rooms to handle switching chats
        // NOTE: In a multi-user app, you'd track active rooms per socket
        socket.rooms.forEach(room => {
            if (room !== socket.id) {
                socket.leave(room);
            }
        });
        socket.join(conversationId);
        console.log(`User ${socket.id} joined conversation: ${conversationId}`);
    });

    // 2. Handle sending a new message
    socket.on('sendMessage', async (data) => {
        const { conversationId, sender, content } = data;

        if (!conversationId || !sender || !content) {
            console.error('Invalid message data received:', data);
            return;
        }

        try {
            // Save the message to MongoDB
            const newMessage = new Message({ conversationId, sender, content });
            await newMessage.save();

            // Broadcast the new message to everyone in the conversation room
            io.to(conversationId).emit('newMessage', newMessage);

            // In a full app, you would also update the Conversation's lastMessage field here
            
        } catch (error) {
            console.error('Error saving or broadcasting message:', error);
            socket.emit('error', 'Message failed to send.');
        }
    });

    // 3. Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// --- Express API Routes (for fetching history, etc.) ---

// Route to fetch conversation history (used when a chat is opened)
app.get('/api/messages/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const messages = await Message.find({ conversationId })
            .sort({ timestamp: 1 }) // Retrieve in ascending order
            .limit(50); // Limit to retrieve the latest messages

        res.status(200).json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to retrieve messages' });
    }
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});