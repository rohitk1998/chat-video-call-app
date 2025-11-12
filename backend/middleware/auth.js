const jwt = require('jsonwebtoken');

// IMPORTANT: Use the same secret key defined in your login route!
const JWT_SECRET = 'secret'; 

const authMiddleware = (req, res, next) => {
    // 1. Get token from header (usually sent as 'Bearer TOKEN')
    const token = req.header('authorization'); 

    // 2. Check if no token
    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied.' });
    }

    try {
        // 3. Verify token
        const decoded = jwt.verify(token.split(' ')[1], JWT_SECRET); // Split 'Bearer' from 'TOKEN'

        // 4. Attach user payload to the request object
        req.user = decoded; 
        next();
    } catch (e) {
        res.status(401).json({ message: 'Token is not valid.' });
    }
};

module.exports = authMiddleware;