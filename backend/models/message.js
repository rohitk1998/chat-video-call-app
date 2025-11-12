// models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        // Assuming a Conversation model exists for referencing
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        // Assuming a User model exists for referencing
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    // This will automatically add createdAt and updatedAt fields
    timestamps: true
});

// Index for efficient message retrieval by conversation and time
MessageSchema.index({ conversationId: 1, timestamp: -1 });

module.exports = mongoose.model('Message', MessageSchema);