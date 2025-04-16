// SERVER CODE (index.js)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Users storage: { socketId: { username, peerId, inCall: boolean, roomId: string | null } }
const users = {};

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 1. User joins with a name
  socket.on('join', (username) => {
    users[socket.id] = {
      username,
      peerId: null,
      inCall: false,
      roomId: null
    };
    
    console.log(`${username} joined the chat`);
    broadcastActiveUsers();
  });

  // Update PeerJS ID when created
  socket.on('register-peer-id', (peerId) => {
    if (users[socket.id]) {
      users[socket.id].peerId = peerId;
      console.log(`${users[socket.id].username} registered peer ID: ${peerId}`);
    }
  });

  // 3. Requesting a call
  socket.on('call-user', ({ targetSocketId, peerId }) => {
    const caller = users[socket.id];
    const targetUser = users[targetSocketId];
    
    if (!targetUser) {
      return socket.emit('call-response', { 
        success: false, 
        message: 'User not found' 
      });
    }
    
    if (targetUser.inCall) {
      return socket.emit('call-response', { 
        success: false, 
        message: 'User is busy in another call' 
      });
    }
    
    if (caller.inCall) {
      return socket.emit('call-response', { 
        success: false, 
        message: 'You are already in a call' 
      });
    }

    // Generate a unique room ID
    const roomId = uuidv4();
    
    // Send incoming call notification to target user
    io.to(targetSocketId).emit('incoming-call', {
      caller: {
        username: caller.username,
        socketId: socket.id,
        peerId: caller.peerId
      },
      roomId
    });
    
    socket.emit('call-response', { 
      success: true, 
      message: 'Call request sent' 
    });
  });

  // 4. Accepting a call
  socket.on('accept-call', ({ callerSocketId, roomId }) => {
    const callerUser = users[callerSocketId];
    const acceptingUser = users[socket.id];
    
    if (!callerUser) {
      return socket.emit('call-join-failed', { message: 'Caller not found' });
    }
    
    // Set both users as in a call and assign room ID
    callerUser.inCall = true;
    callerUser.roomId = roomId;
    acceptingUser.inCall = true;
    acceptingUser.roomId = roomId;
    
    // Notify caller that the call was accepted
    io.to(callerSocketId).emit('call-accepted', {
      acceptor: {
        username: acceptingUser.username,
        socketId: socket.id,
        peerId: acceptingUser.peerId
      },
      roomId
    });
    
    broadcastActiveUsers();
  });

  // 4. Declining a call
  socket.on('decline-call', ({ callerSocketId }) => {
    io.to(callerSocketId).emit('call-declined', {
      username: users[socket.id]?.username
    });
  });

  // 7. Ending call
  socket.on('end-call', ({ roomId }) => {
    let participantSocketId = null;
    
    // Find the other participant in the room
    for (const [socketId, user] of Object.entries(users)) {
      if (user.roomId === roomId && socketId !== socket.id) {
        participantSocketId = socketId;
        break;
      }
    }
    
    // Reset call status for current user
    if (users[socket.id]) {
      users[socket.id].inCall = false;
      users[socket.id].roomId = null;
    }
    
    // Reset call status for the other participant and notify them
    if (participantSocketId && users[participantSocketId]) {
      users[participantSocketId].inCall = false;
      users[participantSocketId].roomId = null;
      io.to(participantSocketId).emit('call-ended');
    }
    
    broadcastActiveUsers();
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (users[socket.id]) {
      // If user was in a call, notify the other participant
      if (users[socket.id].inCall && users[socket.id].roomId) {
        for (const [socketId, user] of Object.entries(users)) {
          if (user.roomId === users[socket.id].roomId && socketId !== socket.id) {
            users[socketId].inCall = false;
            users[socketId].roomId = null;
            io.to(socketId).emit('call-ended');
            break;
          }
        }
      }
      
      console.log(`${users[socket.id].username} disconnected`);
      delete users[socket.id];
      broadcastActiveUsers();
    }
  });

  // Helper function to broadcast active users
  function broadcastActiveUsers() {
    const activeUsers = Object.entries(users).map(([socketId, user]) => ({
      socketId,
      username: user.username,
      available: !user.inCall
    }));
    
    io.emit('active-users', activeUsers);
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});