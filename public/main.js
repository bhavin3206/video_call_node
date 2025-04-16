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
  let isCameraFlipped = true; // Default to mirrored (flipped) for selfie view
  let isRemoteCameraFlipped = false; // Default to normal view for remote camera
  let availableCameras = []; // Store available camera devices
  let currentCameraIndex = 0; // Track which camera is in use

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
      // Enumerate available cameras before requesting access
      await enumerateCameras();

      // Get user media with first camera (usually front camera on mobile)
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: availableCameras.length > 0 ? { exact: availableCameras[0].deviceId } : undefined },
        audio: true
      });
      
      localVideo.srcObject = localStream;
      
      // Apply initial camera flip setting
      updateCameraFlip();

      // Add camera control buttons
      createCameraControlButtons();

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

  // Enumerate available cameras
  async function enumerateCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      availableCameras = devices.filter(device => device.kind === 'videoinput');
      console.log('Available cameras:', availableCameras);
    } catch (error) {
      console.error('Error enumerating devices:', error);
      availableCameras = [];
    }
  }

  // Switch between available cameras
  async function switchCamera() {
    if (availableCameras.length <= 1) {
      showNotification('Camera Switch', 'No additional cameras available');
      return;
    }

    try {
      // Stop all tracks on current stream
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }

      // Move to next camera in the list
      currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
      const newCameraId = availableCameras[currentCameraIndex].deviceId;
      
      // Get stream from new camera
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: newCameraId } },
        audio: true
      });
      
      // Update local video
      localVideo.srcObject = localStream;
      
      // If in a call, replace the track for the remote peer
      if (currentCall && currentCall.peerConnection) {
        const videoTrack = localStream.getVideoTracks()[0];
        const senders = currentCall.peerConnection.getSenders();
        const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
        
        if (videoSender && videoTrack) {
          videoSender.replaceTrack(videoTrack);
        }
      }

      // Update camera flip - typically back cameras shouldn't be mirrored
      if (availableCameras.length > 1) {
        // Assume front camera is first in list, back camera second
        // This is a common convention but not guaranteed
        isCameraFlipped = currentCameraIndex === 0;
        updateCameraFlip();
      }
    } catch (error) {
      console.error('Error switching camera:', error);
      showNotification('Camera Switch Failed', error.message);
    }
  }

  // Create camera control buttons
  function createCameraControlButtons() {
    const localVideoContainer = localVideo.parentElement;
    localVideoContainer.style.position = 'relative';
    
    // Control panel div for local video
    const localControlPanel = document.createElement('div');
    localControlPanel.className = 'position-absolute top-0 right-0 p-2 d-flex gap-2';
    localControlPanel.style.zIndex = '10';
    
    // Camera flip button
    const flipBtn = document.createElement('button');
    flipBtn.innerHTML = '<i class="bi bi-camera"></i> Flip View';
    flipBtn.className = 'btn btn-sm btn-secondary';
    flipBtn.addEventListener('click', () => {
      isCameraFlipped = !isCameraFlipped;
      updateCameraFlip();
    });
    
    // Camera switch button (only if multiple cameras available)
    const switchBtn = document.createElement('button');
    switchBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Switch Camera';
    switchBtn.className = 'btn btn-sm btn-primary';
    switchBtn.addEventListener('click', switchCamera);
    
    // Add buttons to control panel
    localControlPanel.appendChild(flipBtn);
    localControlPanel.appendChild(switchBtn);
    
    // Add control panel to container
    localVideoContainer.appendChild(localControlPanel);

    // Remote video flip button
    const remoteFlipBtn = document.createElement('button');
    remoteFlipBtn.innerHTML = '<i class="bi bi-camera"></i> Flip Their View';
    remoteFlipBtn.className = 'btn btn-sm btn-secondary position-absolute top-0 right-0 m-2';
    remoteFlipBtn.style.zIndex = '10';
    
    remoteFlipBtn.addEventListener('click', () => {
      isRemoteCameraFlipped = !isRemoteCameraFlipped;
      updateRemoteCameraFlip();
    });
    
    // Add button to the remote video container
    remoteVideoContainer.style.position = 'relative';
    remoteVideoContainer.appendChild(remoteFlipBtn);
  }

  // Update camera flip based on current setting
  function updateCameraFlip() {
    if (isCameraFlipped) {
      localVideo.style.transform = 'scaleX(-1)'; // Mirror the video
    } else {
      localVideo.style.transform = 'scaleX(1)'; // Normal video
    }
  }

  // Update remote camera flip based on current setting
  function updateRemoteCameraFlip() {
    if (isRemoteCameraFlipped) {
      remoteVideo.style.transform = 'scaleX(-1)'; // Mirror the video
    } else {
      remoteVideo.style.transform = 'scaleX(1)'; // Normal video
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
        
        // Apply initial remote camera flip setting
        updateRemoteCameraFlip();
        
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
        
        // Apply initial remote camera flip setting
        updateRemoteCameraFlip();
        
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

  // Listen for device changes (e.g., new camera connected)
  navigator.mediaDevices.addEventListener('devicechange', async () => {
    console.log('Device change detected');
    await enumerateCameras();
  });
});