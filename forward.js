// Forward modal state
let forwardState = {
    messageToForward: null,
    selectedRoom: null,
    rooms: [],
    userNickname: null
};

// DOM Elements
let elements = {
    container: null,
    closeBtn: null,
    preview: null,
    searchInput: null,
    roomList: null,
    commentInput: null
};

// Initialize forward modal
function initializeForward() {
    // Get DOM elements
    elements.container = document.getElementById('forward-container');
    elements.closeBtn = document.getElementById('forward-close');
    elements.preview = document.getElementById('forward-preview');
    elements.searchInput = document.getElementById('forward-search-input');
    elements.roomList = document.getElementById('forward-room-list');
    elements.commentInput = document.getElementById('forward-comment-input');

    // Set up event listeners
    if (elements.closeBtn) {
        elements.closeBtn.addEventListener('click', closeForward);
    }

    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', (e) => {
            filterRooms(e.target.value.toLowerCase());
        });
    }

    // Listen for messages from the parent window
    window.addEventListener('message', handleMessage);
}

// Handle messages from parent window
function handleMessage(event) {
    const { type, data } = event.data;
    
    switch (type) {
        case 'FORWARD_INIT':
            forwardState = {
                ...forwardState,
                messageToForward: data.message,
                rooms: data.rooms,
                userNickname: data.userNickname
            };
            renderPreview();
            renderRoomList();
            break;
    }
}

// Render the message preview
function renderPreview() {
    if (!elements.preview || !forwardState.messageToForward) return;

    const message = forwardState.messageToForward;
    
    // FIX: Always display the direct .text property of the message being forwarded.
    // The logic to handle nested forwards is now on the receiving end (in popup.js).
    const textToDisplay = message.text;

    elements.preview.innerHTML = `
        <div class="message">
            <span class="nick">${message.nickname}:</span>
            <span class="text">${textToDisplay}</span>
        </div>
    `;
}

// Render the room list
function renderRoomList(filter = '') {
    if (!elements.roomList) return;

    const rooms = forwardState.rooms.filter(room => {
        // Don't show login or home rooms
        if (room === 'login' || room === 'home') return false;
        
        // Apply search filter
        if (filter) {
            const displayName = room.includes('_&_')
                ? `@${room.split('_&_').find(name => name !== forwardState.userNickname) || 'DM'}`
                : room;
            return displayName.toLowerCase().includes(filter);
        }
        return true;
    });

    elements.roomList.innerHTML = rooms.map(room => {
        const displayName = room.includes('_&_')
            ? `@${room.split('_&_').find(name => name !== forwardState.userNickname) || 'DM'}`
            : room;
            
        return `
            <div class="room-list-item" data-room-name="${room}">
                <span class="room-name">${displayName}</span>
            </div>
        `;
    }).join('') || '<div class="no-rooms">No rooms available</div>';

    // Add click handlers to room items
    document.querySelectorAll('.room-list-item').forEach(item => {
        item.addEventListener('click', () => selectRoom(item.dataset.roomName));
    });
}

// Filter rooms based on search input
function filterRooms(searchTerm) {
    renderRoomList(searchTerm);
}

// Handle room selection
function selectRoom(roomName) {
    // Remove previous selection
    document.querySelectorAll('.room-list-item').forEach(item => {
        item.classList.remove('selected');
    });

    // Add selection to clicked room
    const roomItem = document.querySelector(`[data-room-name="${roomName}"]`);
    if (roomItem) {
        roomItem.classList.add('selected');
    }

    forwardState.selectedRoom = roomName;

    // Send forward action to parent
    const comment = elements.commentInput ? elements.commentInput.value.trim() : '';
    window.parent.postMessage({
        type: 'FORWARD_MESSAGE',
        data: {
            message: forwardState.messageToForward,
            targetRoom: roomName,
            comment: comment
        }
    }, '*');

    // Close the forward modal
    closeForward();
}

// Close the forward modal
function closeForward() {
    window.parent.postMessage({ type: 'CLOSE_FORWARD' }, '*');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeForward);