// public/main.js
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const loginScreen = document.getElementById('loginScreen');
  const appScreen = document.getElementById('appScreen');
  const joinForm = document.getElementById('joinForm');
  const usernameInput = document.getElementById('username');
  const usersList = document.getElementById('usersList');
  const callStatus = document.getElementById('callStatus');
  const localVideo = document.getElementById('localVideo');
  const remoteVideo = document.getElementById('remoteVideo');
  const remoteVideoContainer = document.getElementById('remoteVideoContainer');
  const remoteVideoLabel = document.getElementById('remoteVideoLabel');
  const callControls = document.getElementById('callControls');
  const endCallBtn = document.getElementById('endCallBtn');
  
  // Call modals
  const incomingCallModal = new bootstrap.Modal(document.getElementById('incomingCallModal'));
  const callerNameSpan = document.getElementById('callerName');
  const acceptCallBtn = document.getElementById('acceptCallBtn');
  const declineCallBtn = document.getElementById('declineCallBtn');
  
  // Notification modal
  const notificationModal = new bootstrap.Modal(document.getElementById('notificationModal'));
  const notificationTitle = document.getElementById('notificationTitle');
  const notificationMessage = document.getElementById('notificationMessage');

  // Global variables
  let socket;
  let peer;
  let localStream;
  let currentCall;
  let mySocketId;
  let myUsername;
  let currentRoomId;
  let remoteSocketId;
  let remotePeerId;

  // Initialize the application
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    if (username) {
      initializeApp(username);
    }
  });

  // Initialize app with username
  async function initializeApp(username) {
    try {
      // Get user media
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localVideo.srcObject = localStream;

      // Connect to Socket.IO server
      socket = io();
      setupSocketListeners();
      
      // Initialize PeerJS
      peer = new Peer();
      setupPeerListeners();

      // Save username
      myUsername = username;

      // Hide login screen, show app screen
      loginScreen.classList.add('hidden');
      appScreen.classList.remove('hidden');
      
      socket.emit('join', username);
    } catch (error) {
      showNotification('Error', `Could not access camera and microphone: ${error.message}`);
    }
  }

  // Set up Socket.IO event listeners
  function setupSocketListeners() {
    // Connect/disconnect events
    socket.on('connect', () => {
      mySocketId = socket.id;
      console.log('Connected to server with socket id:', mySocketId);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      showNotification('Disconnected', 'You have been disconnected from the server');
    });

    // Active users list update
    socket.on('active-users', (activeUsers) => {
      updateUsersList(activeUsers);
    });

    // Call events
    socket.on('incoming-call', ({ caller, roomId }) => {
      if (currentCall) {
        // Already in a call, automatically decline
        socket.emit('decline-call', { callerSocketId: caller.socketId });
        return;
      }
      
      // Show incoming call modal
      callerNameSpan.textContent = caller.username;
      incomingCallModal.show();
      
      // Store caller information
      remoteSocketId = caller.socketId;
      remotePeerId = caller.peerId;
      currentRoomId = roomId;
      
      // Handle call acceptance
      acceptCallBtn.onclick = () => {
        socket.emit('accept-call', { callerSocketId: caller.socketId, roomId });
        startCall(caller.peerId, false);
        incomingCallModal.hide();
      };
      
      // Handle call decline
      declineCallBtn.onclick = () => {
        socket.emit('decline-call', { callerSocketId: caller.socketId });
        incomingCallModal.hide();
        resetCallState();
      };
    });

    socket.on('call-response', (response) => {
      if (!response.success) {
        showNotification('Call Failed', response.message);
      }
    });

    socket.on('call-accepted', ({ acceptor, roomId }) => {
      remoteSocketId = acceptor.socketId;
      remotePeerId = acceptor.peerId;
      currentRoomId = roomId;
      startCall(acceptor.peerId, true);
    });

    socket.on('call-declined', ({ username }) => {
      showNotification('Call Declined', `${username} declined your call`);
      resetCallState();
    });

    socket.on('call-ended', () => {
      endCurrentCall();
      showNotification('Call Ended', 'The other user ended the call');
    });

    socket.on('call-join-failed', ({ message }) => {
      showNotification('Join Failed', message);
      resetCallState();
    });
  }

  // Set up PeerJS event listeners
  function setupPeerListeners() {
    peer.on('open', (id) => {
      console.log('My peer ID is:', id);
      socket.emit('register-peer-id', id);
    });

    peer.on('call', (call) => {
      // Answer incoming calls automatically if we accepted the call
      // (This will be triggered after we accepted the call via socket.io)
      currentCall = call;
      call.answer(localStream);
      
      call.on('stream', (stream) => {
        remoteVideo.srcObject = stream;
        remoteVideoContainer.classList.remove('hidden');
        callControls.classList.remove('hidden');
        
        if (remoteSocketId) {
          callStatus.textContent = `In call with ${remoteVideoLabel.textContent}`;
        }
      });
      
      call.on('close', () => {
        resetCallState();
      });
      
      call.on('error', (err) => {
        console.error('Call error:', err);
        resetCallState();
      });
    });

    peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      showNotification('Connection Error', `PeerJS error: ${err.type}`);
    });
  }

  // Start a call with a remote peer
  function startCall(remotePeerId, isInitiator) {
    if (isInitiator) {
      currentCall = peer.call(remotePeerId, localStream);
    }
    
    callStatus.textContent = 'Connecting...';
    
    if (isInitiator && currentCall) {
      currentCall.on('stream', (stream) => {
        remoteVideo.srcObject = stream;
        remoteVideoContainer.classList.remove('hidden');
        callControls.classList.remove('hidden');
        callStatus.textContent = `In call with ${remoteVideoLabel.textContent}`;
      });
      
      currentCall.on('close', () => {
        resetCallState();
      });
      
      currentCall.on('error', (err) => {
        console.error('Call error:', err);
        resetCallState();
      });
    }
  }

  // End the current call
  function endCurrentCall() {
    if (currentCall) {
      currentCall.close();
    }
    
    if (currentRoomId) {
      socket.emit('end-call', { roomId: currentRoomId });
    }
    
    resetCallState();
  }

  // Reset call state
  function resetCallState() {
    if (currentCall) {
      currentCall.close();
      currentCall = null;
    }
    
    if (remoteVideo.srcObject) {
      const tracks = remoteVideo.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      remoteVideo.srcObject = null;
    }
    
    remoteVideoContainer.classList.add('hidden');
    callControls.classList.add('hidden');
    callStatus.textContent = 'Not in a call';
    
    remoteSocketId = null;
    remotePeerId = null;
    currentRoomId = null;
  }

  // Update the users list
  function updateUsersList(users) {
    usersList.innerHTML = '';
    
    users.forEach(user => {
      if (user.socketId === mySocketId) return; // Skip self
      
      const li = document.createElement('li');
      li.className = `list-group-item user-list-item ${user.available ? '' : 'unavailable'}`;
      li.textContent = `${user.username} ${user.available ? '(available)' : '(in call)'}`;
      
      if (user.available) {
        li.addEventListener('click', () => {
          if (currentCall) {
            showNotification('Already in a call', 'End your current call before starting a new one');
            return;
          }
          
          remoteSocketId = user.socketId;
          remoteVideoLabel.textContent = user.username;
          
          // Emit call-user event
          socket.emit('call-user', {
            targetSocketId: user.socketId,
            peerId: peer.id
          });
          
          callStatus.textContent = `Calling ${user.username}...`;
        });
      }
      
      usersList.appendChild(li);
    });
    
    if (users.length <= 1) {
      const li = document.createElement('li');
      li.className = 'list-group-item';
      li.textContent = 'No other users online';
      usersList.appendChild(li);
    }
  }

  // Show notification modal
  function showNotification(title, message) {
    notificationTitle.textContent = title;
    notificationMessage.textContent = message;
    notificationModal.show();
  }

  // Handle end call button
  endCallBtn.addEventListener('click', endCurrentCall);

  // Clean up when window is closed
  window.addEventListener('beforeunload', () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    if (currentCall) {
      currentCall.close();
    }
    
    if (socket) {
      socket.disconnect();
    }
    
    if (peer) {
      peer.destroy();
    }
  });
});