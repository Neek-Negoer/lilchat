// Forward modal functions
function setupForwardModal() {
  if (!forwardModalCloseBtn || !forwardSearchInput || !forwardRoomList) {
    console.error('Forward modal elements not found');
    return;
  }

  // Close modal when clicking the close button
  forwardModalCloseBtn.addEventListener('click', () => {
    forwardModal.classList.add('hidden');
    messageToForward = null;
  });

  // Filter rooms when typing in search
  forwardSearchInput.addEventListener('input', (e) => {
    renderForwardRoomList(e.target.value.toLowerCase());
  });

  // Handle room selection
  forwardRoomList.addEventListener('click', (e) => {
    const roomItem = e.target.closest('.room-list-item');
    if (roomItem && messageToForward) {
      const targetRoom = roomItem.dataset.room;
      sendForwardedMessage(targetRoom);
      forwardModal.classList.add('hidden');
      messageToForward = null;
    }
  });

  // Close modal if clicking outside
  forwardModal.addEventListener('click', (e) => {
    if (e.target === forwardModal) {
      forwardModal.classList.add('hidden');
      messageToForward = null;
    }
  });
}

function openForwardModal(messageData) {
  if (!forwardModal) {
    console.error('Forward modal not found');
    return;
  }
  console.log('Opening forward modal with message:', messageData);
  messageToForward = messageData;
  renderForwardRoomList();
  forwardModal.classList.remove('hidden');
}

function renderForwardRoomList(filter = '') {
  if (!forwardRoomList) {
    console.error('Forward room list element not found');
    return;
  }

  const roomListHTML = joinedRooms
    .filter(room => room !== currentRoom) // Don't show current room
    .filter(room => !filter || room.toLowerCase().includes(filter))
    .map(room => {
      const unread = unreadCounts[room] || 0;
      const displayName = room.includes('_&_') 
        ? `@${room.split('_&_').find(n => n !== userNickname) || 'DM'}`
        : room;
      
      return `
        <div class="room-list-item" data-room="${room}">
          <span class="room-name">${displayName}</span>
          ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
        </div>
      `;
    })
    .join('');

  forwardRoomList.innerHTML = roomListHTML || '<div class="no-rooms">No rooms available to forward to</div>';
}

function sendForwardedMessage(targetRoomName) {
  if (!messageToForward || !targetRoomName) {
    console.error('Missing message or target room for forwarding');
    return;
  }

  console.log('Forwarding message to:', targetRoomName);

  const forwardedMessage = {
    type: 'forward',
    originalMessage: {
      nickname: messageToForward.nickname,
      text: messageToForward.text,
      timestamp: messageToForward.timestamp,
      rank: messageToForward.rank
    },
    forwardedBy: userNickname,
    timestamp: Date.now()
  };

  chrome.runtime.sendMessage({
    type: 'SEND_MESSAGE',
    roomName: targetRoomName,
    message: forwardedMessage
  }, (response) => {
    if (response && response.success) {
      console.log('Message forwarded successfully');
      // Add a local system message about the forward
      addMessageToLog({
        type: 'event',
        event: 'forward',
        nickname: userNickname,
        targetRoom: targetRoomName,
        timestamp: Date.now()
      });
    } else {
      console.error('Failed to forward message:', response?.error || 'Unknown error');
    }
  });
}