const mongoose = require('mongoose');

const friendRequestSchema = new mongoose.Schema({
    // User who sends the request
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // User who receives the request
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },
    createdAt: { type: Date, default: Date.now }
}, {
    timestamps: true // Adds createdAt and updatedAt fields
});

// Enforce unique request (sender to recipient, or recipient to sender)
// This index prevents duplicate requests between the same two people regardless of direction.
friendRequestSchema.index({ sender: 1, recipient: 1 }, { unique: true });

const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);
module.exports = FriendRequest;