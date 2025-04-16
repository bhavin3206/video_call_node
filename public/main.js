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
  const toggleMicBtn = document.getElementById('toggleMicBtn');
  const toggleCameraBtn = document.getElementById('toggleCameraBtn');
  const cameraSelectorBtn = document.getElementById('cameraSelectorBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const usernameDisplay = document.getElementById('usernameDisplay');
  
  // Call modals
  const incomingCallModal = new bootstrap.Modal(document.getElementById('incomingCallModal'));
  const callerNameSpan = document.getElementById('callerName');
  const acceptCallBtn = document.getElementById('acceptCallBtn');
  const declineCallBtn = document.getElementById('declineCallBtn');
  
  // Camera selection modal
  const cameraSelectorModal = new bootstrap.Modal(document.getElementById('cameraSelectorModal'));
  const camerasList = document.getElementById('camerasList');
  
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
  let isMicEnabled = true;
  let isCameraEnabled = true;

  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then((stream) => {
    // Close the stream immediately – just to trigger permission popup
    stream.getTracks().forEach(track => track.stop());
  })
  .catch((err) => {
    console.warn('Permissions not granted yet:', err);
  });


  // Check if user is already logged in
  checkExistingSession();

  // Initialize the application
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    if (username) {
      // Save username to localStorage
      localStorage.setItem('videoChatUsername', username);
      initializeApp(username);
    }
  });

  // Check for existing session
  function checkExistingSession() {
    const savedUsername = localStorage.getItem('videoChatUsername');
    if (savedUsername) {
      usernameInput.value = savedUsername;
      initializeApp(savedUsername);
    }
  }

  // Handle logout
  logoutBtn.addEventListener('click', () => {
    // Clear localStorage
    localStorage.removeItem('videoChatUsername');
    
    // Clean up resources
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
    
    // Show login screen again
    appScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  });

  // Initialize app with username
  async function initializeApp(username) {
    try {
      // Set username display
      usernameDisplay.textContent = username;
      
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

      // Connect to Socket.IO server
      socket = io();
      setupSocketListeners();
      
      // Initialize PeerJS
      peer = new Peer();
      setupPeerListeners();

      // Save username
      myUsername = username;

      // Set initial mic and camera status
      updateMicButtonState();
      updateCameraButtonState();

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
      
      // If we have cameras available, populate the camera selector
      if (availableCameras.length > 0) {
        populateCameraSelector();
      } else {
        cameraSelectorBtn.classList.add('hidden');
      }
    } catch (error) {
      console.error('Error enumerating devices:', error);
      availableCameras = [];
      cameraSelectorBtn.classList.add('hidden');
    }
  }
  
  // Populate camera selector modal with available cameras
  function populateCameraSelector() {
    camerasList.innerHTML = '';
    
    availableCameras.forEach((camera, index) => {
      const li = document.createElement('li');
      li.className = 'list-group-item camera-list-item';
      
      // Try to identify camera type by label
      let cameraLabel = camera.label || `Camera ${index + 1}`;
      
      // Add indicators for front/back cameras
      if (cameraLabel.toLowerCase().includes('front')) {
        cameraLabel += ' (Front)';
      } else if (cameraLabel.toLowerCase().includes('back') || cameraLabel.toLowerCase().includes('rear')) {
        cameraLabel += ' (Back)';
      }
      
      // Add indicators for wide angle, ultrawide, etc.
      if (cameraLabel.toLowerCase().includes('wide')) {
        if (cameraLabel.toLowerCase().includes('ultra')) {
          cameraLabel += ' (Ultra Wide)';
        } else {
          cameraLabel += ' (Wide)';
        }
      }
      
      // Add indicator for telephoto
      if (cameraLabel.toLowerCase().includes('tele')) {
        cameraLabel += ' (Telephoto)';
      }
      
      li.textContent = cameraLabel;
      
      // Highlight the currently selected camera
      if (index === currentCameraIndex) {
        li.classList.add('active');
        li.style.backgroundColor = '#e9ecef';
      }
      
      li.addEventListener('click', () => {
        switchToCamera(index);
        cameraSelectorModal.hide();
      });
      
      camerasList.appendChild(li);
    });
    
    if (availableCameras.length === 0) {
      const li = document.createElement('li');
      li.className = 'list-group-item';
      li.textContent = 'No cameras detected';
      camerasList.appendChild(li);
    }
  }

  // Switch to selected camera by index
  async function switchToCamera(cameraIndex) {
    if (cameraIndex < 0 || cameraIndex >= availableCameras.length) {
      showNotification('Camera Error', 'Selected camera not available');
      return;
    }
    
    try {
      // Save current mic track state
      const audioTrack = localStream ? localStream.getAudioTracks()[0] : null;
      const micEnabled = audioTrack ? audioTrack.enabled : true;
      
      // Stop all tracks on current stream
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }

      // Update camera index
      currentCameraIndex = cameraIndex;
      const newCameraId = availableCameras[cameraIndex].deviceId;
      
      // Get stream from new camera
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: newCameraId } },
        audio: true
      });
      
      // Restore mic state
      if (localStream && !micEnabled) {
        const newAudioTrack = localStream.getAudioTracks()[0];
        if (newAudioTrack) {
          newAudioTrack.enabled = false;
        }
      }
      
      // Apply camera enable/disable state
      if (!isCameraEnabled && localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = false;
        }
      }
      
      // Update local video
      localVideo.srcObject = localStream;
      
      // If in a call, replace the tracks for the remote peer
      if (currentCall && currentCall.peerConnection) {
        const videoTrack = localStream.getVideoTracks()[0];
        const audioTrack = localStream.getAudioTracks()[0];
        
        const senders = currentCall.peerConnection.getSenders();
        
        const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
        if (videoSender && videoTrack) {
          videoSender.replaceTrack(videoTrack);
        }
        
        const audioSender = senders.find(sender => sender.track && sender.track.kind === 'audio');
        if (audioSender && audioTrack) {
          audioSender.replaceTrack(audioTrack);
        }
      }

      // Update camera flip - typically back cameras shouldn't be mirrored
      const cameraLabel = availableCameras[cameraIndex].label.toLowerCase();
      // Most front cameras have "front" in the label, otherwise we assume back camera
      isCameraFlipped = cameraLabel.includes('front');
      updateCameraFlip();
    } catch (error) {
      console.error('Error switching camera:', error);
      showNotification('Camera Switch Failed', error.message);
    }
  }

  // Toggle microphone on/off
  function toggleMicrophone() {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const enabled = !audioTracks[0].enabled;
        audioTracks[0].enabled = enabled;
        isMicEnabled = enabled;
        updateMicButtonState();
      }
    }
  }
  
  // Toggle camera on/off
  function toggleCamera() {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const enabled = !videoTracks[0].enabled;
        videoTracks[0].enabled = enabled;
        isCameraEnabled = enabled;
        updateCameraButtonState();
      }
    }
  }
  
  // Update microphone button state
  function updateMicButtonState() {
    if (isMicEnabled) {
      toggleMicBtn.innerHTML = '<i class="bi bi-mic-fill"></i>';
      toggleMicBtn.classList.remove('btn-danger');
      toggleMicBtn.classList.add('btn-primary');
    } else {
      toggleMicBtn.innerHTML = '<i class="bi bi-mic-mute-fill"></i>';
      toggleMicBtn.classList.remove('btn-primary');
      toggleMicBtn.classList.add('btn-danger');
    }
  }
  
  // Update camera button state
  function updateCameraButtonState() {
    if (isCameraEnabled) {
      toggleCameraBtn.innerHTML = '<i class="bi bi-camera-video-fill"></i>';
      toggleCameraBtn.classList.remove('btn-danger');
      toggleCameraBtn.classList.add('btn-primary');
    } else {
      toggleCameraBtn.innerHTML = '<i class="bi bi-camera-video-off-fill"></i>';
      toggleCameraBtn.classList.remove('btn-primary');
      toggleCameraBtn.classList.add('btn-danger');
    }
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
      remoteVideo.style.transform = 'scaleX(-1)'; // Normal video
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
        const onCallElems = document.getElementsByClassName('oncall');
        for (let elem of onCallElems) {
          elem.classList.remove('hidden');
        }    
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
      socket.emit('join', myUsername); // Re-announce presence after call ends
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
      const onCallElems = document.getElementsByClassName('oncall');
      for (let elem of onCallElems) {
        elem.classList.add('hidden');
      }
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
    const onCallElems = document.getElementsByClassName('oncall');
    for (let elem of onCallElems) {
      elem.classList.remove('hidden');
    }

    resetCallState();
  }

  // Reset call state
  function resetCallState() {
    if (currentCall) {
      currentCall.close();
      currentCall = null;
      updateUsersList();
    }
    
    if (remoteVideo.srcObject) {
      const tracks = remoteVideo.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      remoteVideo.srcObject = null;
    }
    
    remoteVideoContainer.classList.add('hidden');
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

  // Event listeners for control buttons
  endCallBtn.addEventListener('click', endCurrentCall);
  toggleMicBtn.addEventListener('click', toggleMicrophone);
  toggleCameraBtn.addEventListener('click', toggleCamera);
  cameraSelectorBtn.addEventListener('click', () => {
    // Repopulate camera list in case devices have changed
    populateCameraSelector();
    cameraSelectorModal.show();
  });

  // Clean up when window is closed
  window.addEventListener('beforeunload', () => {
    // Don't clear localStorage here - we want to persist login between page refreshes
    
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