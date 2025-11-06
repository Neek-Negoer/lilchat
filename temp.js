// Forward modal functions
function setupForwardModal() {
  // Forward Button Click Handler (using event delegation)
  chatLog.addEventListener('click', (e) => {
    const forwardBtn = e.target.closest('.forward-btn');
    if (forwardBtn) {
      const messageId = forwardBtn.closest('.message').dataset.messageId;
      const message = messageCache[currentRoom].find(m => m.id === messageId);
      if (message) {
        openForwardModal(message);
      }
    }
  });
}

function openForwardModal(messageData) {
  messageToForward = messageData;
  renderForwardRoomList();
  forwardModal.classList.remove('hidden');
}

function renderForwardRoomList(filter = '') {
  const roomListHTML = joinedRooms
    .filter(room => room !== currentRoom) // Don't show current room
    .filter(room => !filter || room.toLowerCase().includes(filter))
    .map(room => {
      const unread = unreadCounts[room] || 0;
      return `
        <div class="room-list-item" data-room="${room}">
          <span class="room-name">${room}</span>
          ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
        </div>
      `;
    })
    .join('');

  forwardRoomList.innerHTML = roomListHTML || '<div class="no-rooms">No rooms available to forward to</div>';
}

function sendForwardedMessage(targetRoomName) {
  if (!messageToForward || !targetRoomName) return;

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
      // Add a local system message about the forward
      addMessageToLog({
        type: 'event',
        event: 'forward',
        nickname: userNickname,
        targetRoom: targetRoomName,
        timestamp: Date.now()
      });
    }
  });
}