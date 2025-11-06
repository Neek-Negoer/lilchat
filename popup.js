// --- GLOBAL STATE ---
let userNickname = null; let userId = null; let userRank = null;
let userBio = ""; let userProfilePicture = "";
let currentRoom = "login"; let messageCache = { "login": [], "home": [] };
let joinedRooms = [];
let unreadCounts = {};
let hasSeenHomeTutorial = false;
let database; 
let replyContext = null; // Revertido para apenas Reply
let messageToForward = null; // NOVO: Para guardar a msg a encaminhar

// --- Get ALL Elements (DECLARAÇÕES ATUALIZADAS) ---
let terminal, chatLog, chatInput, rankModal, rankModalCloseBtn, menuToggleBtn, 
    sidebar, mainContent, roomListDiv, currentRoomTitle, resizeHandle, undockBtn,
    createTabBtn, browseTabBtn, createTab, browseTab, rankNameInput, rankColorInput,
    rankOutlineInput, rankOutlineWidth, rankShineInput, rankAnimateShine, 
    previewSpan, previewNick, saveRankButton, rankListDivBrowse, prevPageBtn, 
    nextPageBtn, pageIndicator,
    profileEditModal, profileEditCloseBtn, profilePicInput, profileBioInput, profileSaveButton,
    profileViewModal, profileViewCloseBtn, profileViewPic, profileViewName, 
    profileViewRank, profileViewBio, profileDmButton,
    // REVERTIDO: Elementos de Reply
    replyPreviewBar, replyPreviewBarContent, replyCancelBtn,
    // NOVO: Elementos de Forward
    forwardModal, forwardModalCloseBtn, forwardSearchInput, forwardRoomList;


// --- Rank Browser State ---
let allPublicRanks = []; let currentPage = 1; const ranksPerPage = 5;
// --- Resize State ---
let isResizing = false; let startX, startY, startWidth, startHeight; const MIN_WIDTH = 300; const MIN_HEIGHT = 200; const MAX_WIDTH = 800; const MAX_HEIGHT = 600;

// --- INITIALIZATION (ATUALIZADO) ---
function initialize() {
  
  // --- ATRIBUIÇÕES DOS ELEMENTOS ---
  terminal = document.getElementById('terminal'); 
  chatLog = document.getElementById('chat-log'); 
  chatInput = document.getElementById('chat-input'); 
  rankModal = document.getElementById('rank-modal'); 
  rankModalCloseBtn = document.querySelector('#rank-modal .modal-close'); 
  menuToggleBtn = document.getElementById('menu-toggle-btn'); 
  sidebar = document.getElementById('sidebar'); 
  mainContent = document.getElementById('main-content'); 
  roomListDiv = document.getElementById('room-list'); 
  currentRoomTitle = document.getElementById('current-room-title'); 
  resizeHandle = document.getElementById('resize-handle'); 
  undockBtn = document.getElementById('undock-btn');
  createTabBtn = document.getElementById('create-tab-btn'); 
  browseTabBtn = document.getElementById('browse-tab-btn'); 
  createTab = document.getElementById('create-tab'); 
  browseTab = document.getElementById('browse-tab'); 
  rankNameInput = document.getElementById('rank-name-input'); 
  rankColorInput = document.getElementById('rank-color-input'); 
  rankOutlineInput = document.getElementById('rank-outline-input'); 
  rankOutlineWidth = document.getElementById('rank-outline-width'); 
  rankShineInput = document.getElementById('rank-shine-input'); 
  rankAnimateShine = document.getElementById('rank-animate-shine'); 
  previewSpan = document.querySelector('.rank-preview-span'); 
  previewNick = document.getElementById('rank-preview-nick'); 
  saveRankButton = document.getElementById('save-rank-button'); 
  rankListDivBrowse = document.getElementById('rank-list'); 
  prevPageBtn = document.getElementById('prev-page-btn'); 
  nextPageBtn = document.getElementById('next-page-btn'); 
  pageIndicator = document.getElementById('page-indicator');
  profileEditModal = document.getElementById('profile-edit-modal');
  profileEditCloseBtn = document.getElementById('profile-edit-close-btn');
  profilePicInput = document.getElementById('profile-pic-input');
  profileBioInput = document.getElementById('profile-bio-input');
  profileSaveButton = document.getElementById('profile-save-button');
  profileViewModal = document.getElementById('profile-view-modal');
  profileViewCloseBtn = document.getElementById('profile-view-close-btn');
  profileViewPic = document.getElementById('profile-view-pic');
  profileViewName = document.getElementById('profile-view-name');
  profileViewRank = document.getElementById('profile-view-rank');
  profileViewBio = document.getElementById('profile-view-bio');
  profileDmButton = document.getElementById('profile-dm-button');
  
  // Forward Modal Elements
  forwardModal = document.getElementById('forward-modal');
  forwardModalCloseBtn = document.getElementById('forward-modal-close-btn');
  forwardSearchInput = document.getElementById('forward-search-input');
  forwardRoomList = document.getElementById('forward-room-list');
  
  // REVERTIDO: Atribuições de Reply
  replyPreviewBar = document.getElementById('reply-preview-bar');
  replyPreviewBarContent = document.getElementById('reply-preview-bar-content');
  replyCancelBtn = document.getElementById('reply-cancel-btn');
  
  // NOVO: Atribuições de Forward
  forwardModal = document.getElementById('forward-modal');
  forwardModalCloseBtn = document.getElementById('forward-modal-close-btn');
  forwardSearchInput = document.getElementById('forward-search-input');
  forwardRoomList = document.getElementById('forward-room-list');
  
  // --- FIM DAS ATRIBUIÇÕES ---

  try {
    if (!firebase.apps.length) {
      const firebaseConfig = {
        apiKey: "AIzaSyC2VTY92muqSxy8YefrWUUW-gJG6E97hGk",
        authDomain: "lilchat-64af5.firebaseapp.com",
        projectId: "lilchat-64af5",
        storageBucket: "lilchat-64af5.firebasestorage.app",
        messagingSenderId: "615855326129",
        appId: "1:1234567890:web:980e3799b7c8bb1047b390",
        databaseURL: "https://lilchat-64af5-default-rtdb.firebaseio.com/"
      };
      firebase.initializeApp(firebaseConfig);
    }
    database = firebase.database();
  } catch (e) {
    console.error("Firebase não foi carregado corretamente!", e);
    document.body.innerHTML = `<div style="color: red; padding: 10px; font-family: monospace;">CRITICAL ERROR: Failed to load Firebase. Check manifest.json and HTML files.</div>`;
    return;
  }

  chrome.storage.sync.get(['popupWidth', 'popupHeight'], (result) => {
      if (document.body.classList.contains('is-popup')) {
          applySize(result.popupWidth || 723, result.popupHeight || 360);
      }
  });
  
  chrome.runtime.sendMessage({ type: "GET_ALL_DATA" }, (response) => {
    if (chrome.runtime.lastError) { chatLog.innerHTML = `<div class="message system-event">Error loading data: ${chrome.runtime.lastError.message}</div>`; return; }
    if (!response || !response.userInfo) { chatLog.innerHTML = '<div class="message system-event">Error loading data. Invalid response.</div>'; return; }
    messageCache = { "login": [], "home": [], ...response.messages };
    unreadCounts = response.unreadCounts || {};
    if (response.userInfo.nickname) {
      showChatScreen(response.userInfo, response.joinedRooms, response.messages, unreadCounts);
    } else {
      showLoginScreen();
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "NEW_MESSAGE") {
      const { roomName, message } = request;
      if (!messageCache[roomName]) { messageCache[roomName] = []; }
      if (message.id && !messageCache[roomName].some(m => m.id === message.id)) {
          messageCache[roomName].push(message);
          if (roomName === currentRoom) {
            addMessageToLog(message);
          } else {
            if (message.nickname !== userNickname) {
              unreadCounts[roomName] = (unreadCounts[roomName] || 0) + 1;
              renderRoomList();
            }
          }
      }
    }
  });
  
  setupListeners();
}

// --- Funções de Tela ---
function showLoginScreen() {
  currentRoom = "login";
  joinedRooms = [];
  messageCache["login"] = [];
  unreadCounts = {};
  hasSeenHomeTutorial = false;
  currentRoomTitle.textContent = "Login";
  if (menuToggleBtn) menuToggleBtn.style.display = 'none';
  if (undockBtn) undockBtn.style.display = 'none';
  renderRoomList();
  switchRoom("login");
  document.querySelector('.prompt-symbol').textContent = "/login >";
}

function showChatScreen(userInfo, joinedRoomsFromBg = [], messagesFromBg = {}, unreadCountsFromBg = {}) {
  userNickname = userInfo.nickname;
  userRank = userInfo.rank;
  userId = userInfo.userId;
  userBio = userInfo.bio || "";
  userProfilePicture = userInfo.profilePicture || "";
  
  messageCache = { "login": [], "home": [], ...messagesFromBg };
  joinedRooms = ["home", ...joinedRoomsFromBg];
  unreadCounts = unreadCountsFromBg;
  
  if (menuToggleBtn) menuToggleBtn.style.display = 'block';
  if (undockBtn) undockBtn.style.display = 'block';

  renderRoomList();
  
  chrome.storage.local.get(['lastActiveRoom'], (result) => {
      if (result.lastActiveRoom && joinedRooms.includes(result.lastActiveRoom) && result.lastActiveRoom !== 'login') {
          switchRoom(result.lastActiveRoom);
      } else {
          switchRoom("home");
      }
  });
  document.querySelector('.prompt-symbol').textContent = ">";
}

// --- Tutoriais ---
function showLoginTutorial() {
  const tutorialMessages = [
    { delay: 500, text: 'Bem-vindo ao LilChat!' },
    { delay: 1000, text: 'Para se registrar, digite:' },
    { delay: 1500, text: '`/reg <nick> <senha> <confirmar_senha>`' },
    { delay: 2000, text: 'Para logar, digite:' },
    { delay: 2500, text: '`/login <nick> <senha>`' },
    { delay: 3000, text: 'Use `/help` para ver isso de novo.' }
  ];
  tutorialMessages.forEach(msg => {
    setTimeout(() => {
      if (currentRoom === 'login') {
        const logMsg = { type: 'event', event: 'system', text: msg.text, timestamp: Date.now() + msg.delay };
        if (!messageCache["login"].some(m => m.text === msg.text)) {
            messageCache["login"].push(logMsg);
            addMessageToLog(logMsg);
        }
      }
    }, msg.delay);
  });
}
function showWelcomeTutorial() {
   const tutorialMessages = [
    { delay: 500, text: `Logado como: ${userNickname}` },
    { delay: 1000, text: 'Comandos:' },
    { delay: 1500, text: '`/room join <n> <p>` - Entra em uma sala.' },
    { delay: 2000, text: '`/room create <n> <p>` - Cria uma sala.' },
    { delay: 2500, text: '`/profile` - Edita seu perfil (bio/foto).' },
    { delay: 3000, text: '`/rank` - Abre o customizador de rank.' },
    { delay: 3500, text: '`/leave` - Sai da sala atual.' },
    { delay: 4000, text: '`/logout` - Desloga da sua conta.' },
    { delay: 4500, text: 'Use `/help` para ver isso de novo.' }
  ];
  tutorialMessages.forEach(msg => {
    setTimeout(() => {
      if(currentRoom === 'home') {
        const logMsg = { type: 'event', event: 'system', text: msg.text, timestamp: Date.now() + msg.delay };
        if (!messageCache["home"]) { messageCache["home"] = []; }
        if (!messageCache["home"].some(m => m.text === msg.text && m.type === 'event')) {
            messageCache["home"].push(logMsg);
            addMessageToLog(logMsg);
        }
      }
    }, msg.delay);
  });
}

function showLoginHelp() {
  const messages = [
    'Para se registrar, digite:',
    '`/reg <nick> <senha> <confirmar_senha>`',
    'Para logar, digite:',
    '`/login <nick> <senha>`'
  ];
  messages.forEach(msg => addMessageToLog({ type: 'event', event: 'system', text: msg }));
}
function showWelcomeHelp() {
  const messages = [
    `Logado como: ${userNickname}`,
    'Comandos:',
    '`/room join <n> <p>` - Entra em uma sala.',
    '`/room create <n> <p>` - Cria uma sala.',
    '`/profile` - Edita seu perfil (bio/foto).',
    '`/rank` - Abre o customizador de rank.',
    '`/leave` - Sai da sala atual.',
    '`/logout` - Desloga da sua conta.'
  ];
  messages.forEach(msg => addMessageToLog({ type: 'event', event: 'system', text: msg }));
}


// --- UI RENDERING (ATUALIZADO) ---
function addMessageToLog(messageData) {
  if (!messageData) return;

  const messageElement = document.createElement('div');
  messageElement.className = 'message';
  if (messageData.id) messageElement.dataset.messageId = messageData.id;

  if (messageData.type === 'event') {
    messageElement.classList.add('system-event');
    switch (messageData.event) {
      case 'join':
        messageElement.textContent = `${messageData.nickname} joined the room`;
        break;
      case 'leave':
        messageElement.textContent = `${messageData.nickname} left the room`;
        break;
      case 'forward':
        messageElement.textContent = `${messageData.nickname} forwarded a message to ${messageData.targetRoom}`;
        break;
      default:
        messageElement.textContent = `Unknown event: ${messageData.event}`;
    }
  } else if (messageData.type === 'forward') {
    // Forward message structure
    const originalMsg = messageData.originalMessage;
    messageElement.innerHTML = `
      <div class="forward-preview">
        <div class="forward-preview-header">
          Forwarded by ${messageData.forwardedBy}
        </div>
        <div class="message">
          <span class="nick">${originalMsg.nickname}:</span>
          <span class="text">${originalMsg.text}</span>
        </div>
      </div>
      <div class="message-actions">
        <button class="message-action-btn reply-btn" title="Reply">↩️</button>
        <button class="message-action-btn forward-btn" title="Forward">↪️</button>
      </div>
    `;
    
    // Apply rank styles if present
    if (originalMsg.rank) {
      const nickElement = messageElement.querySelector('.nick');
      applyRankStyles(nickElement, originalMsg.rank);
    }
  } else {
    // Regular message
    messageElement.innerHTML = `
      <span class="nick">${messageData.nickname}:</span>
      <span class="text">${messageData.text}</span>
      <div class="message-actions">
        <button class="message-action-btn reply-btn" title="Reply">↩️</button>
        <button class="message-action-btn forward-btn" title="Forward">↪️</button>
      </div>
    `;
    
    // Apply rank styles if present
    if (messageData.rank) {
      const nickElement = messageElement.querySelector('.nick');
      applyRankStyles(nickElement, messageData.rank);
    }
  }

  chatLog.appendChild(messageElement);
  chatLog.scrollTop = chatLog.scrollHeight;
}
  if (!chatLog) return;
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message');
  
  if (messageData.type === 'event') {
    messageDiv.classList.add('system-event');
    let eventText = "Unknown event";
    if (messageData.event === 'join') { eventText = `${messageData.nickname} joined.`; }
    else if (messageData.event === 'leave') { eventText = `${messageData.nickname} left.`; }
    else if (messageData.event === 'system') { eventText = messageData.text; }
    messageDiv.textContent = eventText;
  } else {
    // Renderiza o preview de Encaminhamento
    if (messageData.forwardedMessage) {
      const originalMsg = messageData.forwardedMessage;
      const forwardPreviewDiv = document.createElement('div');
      forwardPreviewDiv.classList.add('forward-preview');
      
      const forwardHeader = document.createElement('div');
      forwardHeader.classList.add('forward-preview-header');
      forwardHeader.innerHTML = '&rarr; Encaminhado';
      forwardPreviewDiv.appendChild(forwardHeader);
      
      const innerMessageDiv = document.createElement('div');
      innerMessageDiv.classList.add('message');
      
      const innerRankSpan = document.createElement('span');
      innerRankSpan.classList.add('nickname');
      applyRankStyles(innerRankSpan, originalMsg.rank);
      
      const innerNickSpan = document.createElement('span');
      innerNickSpan.classList.add('nick');
      innerNickSpan.textContent = ` ${originalMsg.nickname}:`;
      
      const innerTextSpan = document.createElement('span');
      innerTextSpan.classList.add('text');
      innerTextSpan.textContent = ` ${originalMsg.text}`;
      
      innerMessageDiv.appendChild(innerRankSpan);
      innerMessageDiv.appendChild(innerNickSpan);
      innerMessageDiv.appendChild(innerTextSpan);
      forwardPreviewDiv.appendChild(innerMessageDiv);
      
      messageDiv.appendChild(forwardPreviewDiv);
    }

    // Renderiza o preview da Resposta
    if (messageData.replyTo) {
      const reply = messageData.replyTo;
      const replyPreviewDiv = document.createElement('div');
      replyPreviewDiv.classList.add('reply-preview');
      
      const replyRankSpan = document.createElement('span');
      replyRankSpan.classList.add('nickname');
      applyRankStyles(replyRankSpan, reply.rank);
      
      const replyNickSpan = document.createElement('span');
      replyNickSpan.classList.add('nick');
      replyNickSpan.textContent = ` ${reply.nickname}:`;
      
      const replyTextSpan = document.createElement('span');
      replyTextSpan.classList.add('reply-preview-text');
      replyTextSpan.textContent = ` ${reply.text}`;
      
      replyPreviewDiv.appendChild(replyRankSpan);
      replyPreviewDiv.appendChild(replyNickSpan);
      replyPreviewDiv.appendChild(replyTextSpan);
      messageDiv.appendChild(replyPreviewDiv);
    }

    const rankSpan = document.createElement('span');
    rankSpan.classList.add('nickname');
    applyRankStyles(rankSpan, messageData.rank);
    
    const nickSpan = document.createElement('span');
    nickSpan.classList.add('nick');
    nickSpan.textContent = ` ${messageData.nickname}:`;
    
    nickSpan.title = `Ver perfil de ${messageData.nickname}`;
    nickSpan.dataset.userId = messageData.userId;
    
    if (messageData.nickname !== userNickname) {
      nickSpan.onclick = () => {
        const targetNickname = messageData.nickname;
        addMessageToLog({ type: 'event', event: 'system', text: `Carregando perfil de ${targetNickname}...` });
        chrome.runtime.sendMessage({ type: "GET_USER_PROFILE", nickname: targetNickname }, (response) => {
          if (response && response.success) {
            profileViewPic.src = response.profilePicture;
            profileViewName.textContent = response.nickname;
            applyRankStyles(profileViewRank.querySelector('.nickname'), response.rank);
            profileViewBio.textContent = response.bio;
            profileDmButton.dataset.nickname = response.nickname;
            profileViewModal.classList.remove('hidden');
          } else {
            addMessageToLog({ type: 'event', event: 'system', text: `Erro ao carregar perfil: ${response.error}` });
          }
        });
      };
    }
    
    const textSpan = document.createElement('span');
    textSpan.classList.add('text');
    // Se a msg tiver um 'forward', o texto do usuário fica embaixo
    if (!messageData.forwardedMessage || messageData.text) {
        textSpan.textContent = ` ${messageData.text}`;
    } else {
        textSpan.style.display = 'none'; // Esconde se for só um forward sem comentário
    }
    
    messageDiv.appendChild(rankSpan);
    messageDiv.appendChild(nickSpan);
    messageDiv.appendChild(textSpan);
    
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('message-actions');
    
    const replyBtn = document.createElement('button');
    replyBtn.classList.add('message-action-btn');
    replyBtn.innerHTML = '&larr;';
    replyBtn.title = 'Reply';
    replyBtn.onclick = () => {
      setReplyContext(messageData); // Continua usando a função de Reply
    };
    
    // --- ATUALIZADO: Botão Forward ---
    const forwardBtn = document.createElement('button');
    forwardBtn.classList.add('message-action-btn');
    forwardBtn.innerHTML = '&rarr;';
    forwardBtn.title = 'Forward';
    forwardBtn.onclick = () => {
      openForwardModal(messageData); // <-- CHAMA A NOVA FUNÇÃO
    };
    // --- FIM DA ATUALIZAÇÃO ---
    
    actionsDiv.appendChild(replyBtn);
    actionsDiv.appendChild(forwardBtn);
    messageDiv.appendChild(actionsDiv);
  }
  
  chatLog.appendChild(messageDiv);
  const isScrolledToBottom = chatLog.scrollHeight - chatLog.clientHeight <= chatLog.scrollTop + 1;
  if (isScrolledToBottom || messageData.type === 'event') {
    chatLog.scrollTop = chatLog.scrollHeight;
  }
}
function renderRoomList() {
  roomListDiv.innerHTML = '';
  joinedRooms.forEach(roomName => {
    const item = document.createElement('div');
    item.classList.add('room-list-item');
    let displayName = roomName;
    if (roomName.includes('_&_')) {
      const names = roomName.split('_&_');
      const otherUser = names.find(name => userNickname && name.toLowerCase() !== userNickname.toLowerCase());
      displayName = otherUser ? `@${otherUser}` : "@DM";
    }
    const nameSpan = document.createElement('span');
    nameSpan.textContent = displayName;
    item.appendChild(nameSpan);
    item.dataset.roomName = roomName;
    if (unreadCounts[roomName] > 0) {
      const badge = document.createElement('span');
      badge.classList.add('unread-badge');
      badge.textContent = unreadCounts[roomName] > 9 ? '9+' : unreadCounts[roomName];
      item.appendChild(badge);
    }
    if (roomName === currentRoom) {
      item.classList.add('active');
    }
    item.onclick = () => switchRoom(roomName);
    roomListDiv.appendChild(item);
  });
}
function switchRoom(roomName) {
  
  if (unreadCounts[roomName] > 0) {
    delete unreadCounts[roomName];
    chrome.runtime.sendMessage({ type: "MARK_ROOM_AS_READ", roomName: roomName });
    renderRoomList();
  }
  
  cancelReply();
  
  currentRoom = roomName;
  let displayName = roomName;
  if (roomName.includes('_&_')) {
    const names = roomName.split('_&_');
    const otherUser = names.find(name => userNickname && name.toLowerCase() !== userNickname.toLowerCase());
    displayName = otherUser ? `@${otherUser}` : "@DM";
  }
  currentRoomTitle.textContent = displayName;
  
  document.querySelectorAll('#room-list .room-list-item').forEach(item => {
    item.classList.toggle('active', item.dataset.roomName === roomName);
  });
  
  chatLog.innerHTML = '';
  
  if (roomName === 'home') {
    if (!hasSeenHomeTutorial) {
      showWelcomeTutorial(); 
      hasSeenHomeTutorial = true;
    } else {
      addMessageToLog({ type: 'event', event: 'system', text: `Logado como: ${userNickname}` });
      addMessageToLog({ type: 'event', event: 'system', text: '*/help para ver os comandos*' });
    }
  } else if (roomName === 'login') {
     showLoginTutorial();
  } else {
     const messages = messageCache[currentRoom] || [];
     messages.forEach(addMessageToLog);
  }
  
  document.body.classList.remove('sidebar-open');
  setTimeout(() => { chatLog.scrollTop = chatLog.scrollHeight; }, 0);
  
  if (roomName !== 'login') {
    chrome.storage.local.set({ lastActiveRoom: roomName });
  }
}

// --- EVENT LISTENERS (ATUALIZADO) ---
function setupListeners() {
  setupResizeListeners();
  setupRankModalListeners();
  setupProfileModals();
  
  // Setup Forward Modal
  forwardModalCloseBtn.addEventListener('click', () => {
    forwardModal.classList.add('hidden');
    messageToForward = null;
  });

  forwardSearchInput.addEventListener('input', (e) => {
    renderForwardRoomList(e.target.value.toLowerCase());
  });

  // Event delegation for forward room list clicks
  forwardRoomList.addEventListener('click', (e) => {
    const roomItem = e.target.closest('.room-list-item');
    if (roomItem && messageToForward) {
      const targetRoom = roomItem.dataset.room;
      sendForwardedMessage(targetRoom);
      forwardModal.classList.add('hidden');
      messageToForward = null;
    }
  });
}
  chatInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { handleChatInput(chatInput.value.trim()); chatInput.value = ''; event.preventDefault(); } });
  menuToggleBtn.addEventListener('keydown', (event) => { if (event.key === 'Enter') { document.body.classList.toggle('sidebar-open'); }});
  menuToggleBtn.onclick = () => { document.body.classList.toggle('sidebar-open'); };
  
  if (undockBtn) {
    undockBtn.onclick = async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) { throw new Error("Nenhuma aba ativa encontrada."); }
        await chrome.sidePanel.open({ tabId: tabs[0].id });
        window.close();
      } catch (error) { console.error("Erro ao destacar:", error.message); addMessageToLog({ type: 'event', event: 'system', text: `Erro ao abrir painel: ${error.message}` }); }
    };
  }
  
  setupRankModalListeners();
  setupProfileModals();
  setupForwardModal(); // <-- NOVO
  
  replyCancelBtn.onclick = () => cancelReply();
  
  if (resizeHandle) {
    setupResizeListeners();
  }
}

// --- COMMAND HANDLER (ATUALIZADO) ---
function handleChatInput(text) {
  // --- CORREÇÃO: Bloco `if (messageToForward)` REMOVIDO DAQUI ---
  // A lógica de envio de forward agora está no `sendForwardedMessage`
  
  if (currentRoom === 'login') {
    handleLoginCommands(text);
    return;
  }
  
  if (text === '/help') {
      chatLog.innerHTML = ''; 
      if (currentRoom === 'home') {
          showWelcomeHelp(); 
      } else if (currentRoom === 'login') {
          showLoginHelp(); 
      } else {
          addMessageToLog({ type: 'event', event: 'system', text: "Comandos: `/leave`, `/rank`, `/profile`, `/help`" });
      }
      return;
  }
  
  if (text === '/profile') {
      profilePicInput.value = userProfilePicture;
      profileBioInput.value = userBio;
      profileEditModal.classList.remove('hidden');
      return;
  }
  
  if (text.startsWith('/nick ')) { addMessageToLog({ type: 'event', event: 'system', text: `Comando /nick desabilitado por enquanto.` }); return; } 
  if (text === '/rank') { rankModal.classList.remove('hidden'); rankNameInput.value = userRank.name; rankColorInput.value = userRank.color || '#FFFFFF'; rankOutlineInput.value = userRank.outline || '#000000'; rankOutlineWidth.value = userRank.outlineWidth || 1; rankShineInput.value = userRank.shine || '#000000'; rankAnimateShine.checked = userRank.animateShine || false; previewNick.textContent = ` ${userNickname}:`; updatePreview(); return; }
  if (text === '/logout') { chrome.runtime.sendMessage({ type: "LOGOUT" }, (response) => { if (response && response.success) { showLoginScreen(); } else { addMessageToLog({ type: 'event', event: 'system', text: `Erro ao deslogar.` }); } }); return; }
  
  if (currentRoom === "home") {
    if (text.startsWith('/')) {
        const parts = text.split(' '); const command = parts[0]; const subCommand = parts[1]; const roomName = parts[2]; const password = parts[3];
        if (command === '/room') {
          if (!subCommand) { addMessageToLog({ type: 'event', event: 'system', text: "Usage: /room <join|create> <name> <password>" }); return; }
          if (!roomName) { addMessageToLog({ type: 'event', event: 'system', text: `Usage: /room ${subCommand} <name> <password>` }); return; }
          if (!password) { addMessageToLog({ type: 'event', event: 'system', text: "Password required." }); return; }
          if (subCommand === 'join') { handleJoinRoom(roomName, password); } 
          else if (subCommand === 'create') { handleCreateRoom(roomName, password); } 
          else { addMessageToLog({ type: 'event', event: 'system', text: "Use /room <join|create> ..." }); }
        } else if (text === '/leave') { addMessageToLog({ type: 'event', event: 'system', text: 'Você não pode sair do /home.' });
        } else { addMessageToLog({ type: 'event', event: 'system', text: 'Comando desconhecido. Use /help.' }); }
    } else {
        addMessageToLog({ type: 'event', event: 'system', text: "Você está no /home. Use `/room join ...` ou `/help`." }); 
    }
  } else { 
    if (text === '/leave') { 
      chrome.runtime.sendMessage({ type: "LEAVE_ROOM", roomName: currentRoom }, (response) => { 
        if (response && response.success) { 
          joinedRooms = joinedRooms.filter(r => r !== currentRoom); 
          delete messageCache[currentRoom]; 
          renderRoomList(); 
          switchRoom("home"); 
          addMessageToLog({ type: 'event', event: 'system', text: `Você saiu de ${response.roomName}.` }); 
        } else { addMessageToLog({ type: 'event', event: 'system', text: `Error leaving: ${response?.error || 'Unknown'}` }); } 
      }); 
      return; 
    }
    
    // Se o texto não estiver vazio, envia a mensagem
    if (text) {
        const messageData = { 
            type: 'chat', 
            userId: userId, 
            nickname: userNickname, 
            rank: userRank, 
            text: text 
        };
        
        if (replyContext) {
          messageData.replyTo = replyContext.data;
          cancelReply();
        }
        
        chrome.runtime.sendMessage({ type: "SEND_MESSAGE", roomName: currentRoom, message: messageData });
    } else if (replyContext) {
        // Se o texto estiver vazio MAS for um reply, cancela o reply
        cancelReply();
    }
  }
}

// --- ATUALIZADO: Handler para Comandos de Login ---
function handleLoginCommands(text) {
  const parts = text.split(' ');
  const command = parts[0];
  
  if (command === '/help') {
      chatLog.innerHTML = '';
      showLoginHelp();
      return;
  }
  
  if (command === '/login') {
    const nick = parts[1];
    const pass = parts[2];
    if (!nick || !pass) { addMessageToLog({ type: 'event', event: 'system', text: "Usage: /login <nick> <password>" }); return; }
    addMessageToLog({ type: 'event', event: 'system', text: `Logando como ${nick}...` });
    chrome.runtime.sendMessage({ type: "LOGIN", nick: nick, pass: pass }, (response) => {
      if (response && response.success) {
        addMessageToLog({ type: 'event', event: 'system', text: "Sucesso! Carregando chat..." });
        showChatScreen(response.userInfo, response.joinedRooms, response.messages, response.unreadCounts);
      } else { addMessageToLog({ type: 'event', event: 'system', text: `Erro: ${response?.error || 'Falha no login'}` }); }
    });
  } else if (command === '/reg') {
    const nick = parts[1];
    const pass = parts[2];
    const confirm = parts[3];
    if (!nick || !pass || !confirm) { addMessageToLog({ type: 'event', event: 'system', text: "Usage: /reg <nick> <password> <confirm_password>" }); return; }
    addMessageToLog({ type: 'event', event: 'system', text: `Registrando ${nick}...` });
    chrome.runtime.sendMessage({ type: "REGISTER", nick: nick, pass: pass, confirm: confirm }, (response) => {
      if (response && response.success) {
        addMessageToLog({ type: 'event', event: 'system', text: "Registro completo! Logando..." });
        showChatScreen(response.userInfo, response.joinedRooms, {}, {});
      } else { addMessageToLog({ type: 'event', event: 'system', text: `Erro: ${response?.error || 'Falha no registro'}` }); }
    });
  } else {
    addMessageToLog({ type: 'event', event: 'system', text: "Comando desconhecido. Use /login, /reg, ou /help." });
  }
}

// --- ROOM LOGIC (ATUALIZADA) ---
function handleJoinRoom(roomName, password) {
  addMessageToLog({ type: 'event', event: 'system', text: `Entrando em ${roomName}...` });
  chrome.runtime.sendMessage({ type: "JOIN_ROOM", roomName: roomName.toLowerCase(), password: password }, (response) => {
    if (response && response.success) {
      if (!joinedRooms.includes(response.roomName)) {
        joinedRooms.push(response.roomName);
        renderRoomList();
      }
      messageCache[response.roomName] = response.history || []; 
      switchRoom(response.roomName); 
    } else {
      addMessageToLog({ type: 'event', event: 'system', text: `Error: ${response?.error || 'Unknown'}` });
    }
  });
}
function handleCreateRoom(roomName, password) {
  addMessageToLog({ type: 'event', event: 'system', text: `Criando ${roomName}...` });
  chrome.runtime.sendMessage({ type: "CREATE_ROOM", roomName: roomName.toLowerCase(), password: password }, (response) => {
    if (response && response.success) {
      if (!joinedRooms.includes(response.roomName)) {
        joinedRooms.push(response.roomName);
        renderRoomList();
      }
      messageCache[response.roomName] = response.history || []; 
      switchRoom(response.roomName); 
    } else {
      addMessageToLog({ type: 'event', event: 'system', text: `Error: ${response?.error || 'Unknown'}` });
    }
  });
}

// --- Funções de Reply ---
function setReplyContext(messageData) {
  const previewText = messageData.text.length > 40 ? messageData.text.substring(0, 40) + '...' : messageData.text;
  
  replyContext = {
    type: 'reply',
    data: { 
      nickname: messageData.nickname,
      rank: messageData.rank,
      text: previewText
    }
  };
  
  replyPreviewBarContent.innerHTML = `Respondendo a <strong>${messageData.nickname}</strong>: <span>${previewText}</span>`;
  replyPreviewBar.style.display = 'block';
  chatInput.focus();
}
function cancelReply() {
  replyContext = null;
  replyPreviewBar.style.display = 'none';
}

// --- NOVAS FUNÇÕES: Lógica de Forward ---
function setupForwardModal() {
  forwardModalCloseBtn.onclick = () => {
    forwardModal.classList.add('hidden');
    messageToForward = null; // Limpa a msg
  }
  
  forwardSearchInput.oninput = (e) => {
    renderForwardRoomList(e.target.value.toLowerCase());
  }
}

function openForwardModal(messageData) {
  messageToForward = messageData; // Armazena a msg inteira
  renderForwardRoomList(); // Renderiza a lista inicial
  forwardSearchInput.value = ''; // Limpa a busca
  forwardModal.classList.remove('hidden');
  forwardSearchInput.focus(); // Foca na busca
}

function renderForwardRoomList(filter = '') {
  forwardRoomList.innerHTML = '';
  const roomsToDisplay = joinedRooms.filter(roomName => {
    if (roomName === 'home' || roomName === 'login') return false;
    
    let displayName = roomName;
    if (roomName.includes('_&_')) {
      const names = roomName.split('_&_');
      const otherUser = names.find(name => userNickname && name.toLowerCase() !== userNickname.toLowerCase());
      displayName = otherUser ? `@${otherUser}` : "@DM";
    }
    
    return displayName.toLowerCase().includes(filter);
  });
  
  if (roomsToDisplay.length === 0) {
      forwardRoomList.innerHTML = '<div class="room-list-item">Nenhum chat encontrado.</div>';
      return;
  }
  
  roomsToDisplay.forEach(roomName => {
    const item = document.createElement('div');
    item.classList.add('room-list-item');
    
    let displayName = roomName;
    if (roomName.includes('_&_')) {
      const names = roomName.split('_&_');
      const otherUser = names.find(name => userNickname && name.toLowerCase() !== userNickname.toLowerCase());
      displayName = otherUser ? `@${otherUser}` : "@DM";
    }
    
    item.textContent = displayName;
    item.dataset.roomName = roomName;
    
    item.onclick = () => {
      sendForwardedMessage(roomName);
    }
    
    forwardRoomList.appendChild(item);
  });
}

function sendForwardedMessage(targetRoomName) {
  if (!messageToForward) return;
  
  const originalMessage = {
      nickname: messageToForward.nickname,
      rank: messageToForward.rank,
      text: messageToForward.text,
      userId: messageToForward.userId
  };

  // --- CORREÇÃO: Pega o texto do input e limpa ---
  const commentText = chatInput.value.trim();
  chatInput.value = ""; // Limpa o input principal
  // --- FIM DA CORREÇÃO ---

  const messageData = { 
      type: 'chat', 
      userId: userId, 
      nickname: userNickname, 
      rank: userRank, 
      text: commentText, // Envia o comentário
      forwardedMessage: originalMessage 
  };
  
  chrome.runtime.sendMessage({ type: "SEND_MESSAGE", roomName: targetRoomName, message: messageData });
  
  forwardModal.classList.add('hidden');
  messageToForward = null;
  
  addMessageToLog({ type: 'event', event: 'system', text: `Mensagem encaminhada para ${targetRoomName}!` });
}
// --- FIM DAS NOVAS FUNÇÕES ---


// --- Rank Style Helper Function ---
function applyRankStyles(element, rankData) { const defaults = { name: 'USER', color: '#FFFFFF', outline: '#000000', outlineWidth: 1, shine: '#000000', animateShine: false }; const rank = { ...defaults, ...rankData }; element.textContent = `[${rank.name}]`; element.style.color = rank.color; const width = parseInt(rank.outlineWidth); const hasOutline = rank.outline && rank.outline !== '#000000' && width > 0; if (hasOutline) { element.style.webkitTextStrokeWidth = `${width}px`; element.style.webkitTextStrokeColor = rank.outline; } else { element.style.webkitTextStrokeWidth = '0px'; } const hasShine = rank.shine && rank.shine !== '#000000'; if (rank.animateShine && hasShine) { element.classList.add('animated-shine'); element.style.setProperty('--shine-color', rank.shine); element.style.textShadow = 'none'; } else { element.classList.remove('animated-shine'); element.style.animation = 'none'; element.style.removeProperty('--shine-color'); element.style.textShadow = hasShine ? `0 0 8px ${rank.shine}` : 'none'; } }
// --- updatePreview function ---
function updatePreview() { const rankData = { name: rankNameInput.value.toUpperCase().substring(0, 4) || 'RANK', color: rankColorInput.value, outline: rankOutlineInput.value, outlineWidth: rankOutlineWidth.value, shine: rankShineInput.value, animateShine: rankAnimateShine.checked }; applyRankStyles(previewSpan, rankData); }

// --- Listeners dos Modais de Perfil ---
function setupProfileModals() {
  profileEditCloseBtn.onclick = () => {
    profileEditModal.classList.add('hidden');
  }
  profileViewCloseBtn.onclick = () => {
    profileViewModal.classList.add('hidden');
  }
  
  profileSaveButton.onclick = () => {
    const newBio = profileBioInput.value;
    const newPic = profilePicInput.value;
    
    userBio = newBio;
    userProfilePicture = newPic;
    
    chrome.runtime.sendMessage({ 
      type: "UPDATE_USER_INFO", 
      info: { 
        bio: newBio, 
        profilePicture: newPic 
      } 
    }, (response) => {
        if(response && response.success) {
            addMessageToLog({ type: 'event', event: 'system', text: 'Perfil salvo!' });
            profileEditModal.classList.add('hidden');
        } else {
            addMessageToLog({ type: 'event', event: 'system', text: 'Erro ao salvar perfil.' });
        }
    });
  }
  
  profileDmButton.onclick = () => {
    const targetNickname = profileDmButton.dataset.nickname;
    if (targetNickname) {
        const dmRoomName = [userNickname, targetNickname].sort().join('_&_');
        addMessageToLog({ type: 'event', event: 'system', text: `Iniciando DM com ${targetNickname}...` });
        handleJoinRoom(dmRoomName, "DM_PASSWORD");
        profileViewModal.classList.add('hidden');
    }
  }
}

// --- Rank Modal Logic ---
function setupRankModalListeners() {
  rankModalCloseBtn.onclick = () => { rankModal.classList.add('hidden'); };
  [rankNameInput, rankColorInput, rankOutlineInput, rankOutlineWidth, rankShineInput, rankAnimateShine].forEach(el => { const eventType = (el.type === 'checkbox' || el.type === 'number') ? 'change' : 'input'; el.addEventListener(eventType, updatePreview); if (el.hasAttribute('data-coloris')) { el.addEventListener('change', updatePreview); } });
  saveRankButton.onclick = () => { const newRank = { name: rankNameInput.value.toUpperCase().substring(0, 4) || 'USER', color: rankColorInput.value, outline: rankOutlineInput.value, outlineWidth: parseInt(rankOutlineWidth.value) || 1, shine: rankShineInput.value, animateShine: rankAnimateShine.checked, creator: userNickname }; userRank = newRank; chrome.runtime.sendMessage({ type: "UPDATE_USER_INFO", info: { rank: newRank } }); if(newRank.name !== 'USER' && newRank.name !== 'GUEST') { chrome.runtime.sendMessage({ type: "SAVE_PUBLIC_RANK", rank: newRank }); } rankModal.classList.add('hidden'); addMessageToLog({ type: 'event', event: 'system', text: `Rank set to [${newRank.name}]!` }); }
  createTabBtn.onclick = () => { createTab.classList.remove('hidden'); browseTab.classList.add('hidden'); createTabBtn.classList.add('active'); browseTabBtn.classList.remove('active'); }
  browseTabBtn.onclick = () => { browseTab.classList.remove('hidden'); createTab.classList.add('hidden'); browseTabBtn.classList.add('active'); createTabBtn.classList.remove('active'); loadPublicRanks(); }
  function loadPublicRanks() {
      rankListDivBrowse.innerHTML = 'Loading...';
      chrome.runtime.sendMessage({ type: "GET_PUBLIC_RANKS" }, (response) => {
          if (response && response.success) { allPublicRanks = response.ranks || []; displayRankPage(1); }
          else { console.error("Error getting ranks:", response?.error); rankListDivBrowse.innerHTML = 'Error loading ranks.'; }
      });
  }
  function displayRankPage(page) { currentPage = page; rankListDivBrowse.innerHTML = ''; const totalPages = Math.ceil(allPublicRanks.length / ranksPerPage); if (totalPages === 0) { pageIndicator.textContent = 'Page 1 / 1'; prevPageBtn.disabled = true; nextPageBtn.disabled = true; rankListDivBrowse.innerHTML = 'No public ranks found.'; return; } const startIndex = (page - 1) * ranksPerPage; const endIndex = startIndex + ranksPerPage; const ranksToShow = allPublicRanks.slice(startIndex, endIndex); ranksToShow.forEach(rank => { const item = document.createElement('div'); item.classList.add('rank-list-item'); const preview = document.createElement('span'); preview.classList.add('rank-preview'); applyRankStyles(preview, rank); item.appendChild(preview); item.appendChild(document.createTextNode(` (by ${rank.creator || 'Unknown'})`)); item.onclick = () => { userRank = rank; chrome.runtime.sendMessage({ type: "UPDATE_USER_INFO", info: { rank: rank } }); rankModal.classList.add('hidden'); addMessageToLog({ type: 'event', event: 'system', text: `Rank set to [${rank.name}]!` }); }; rankListDivBrowse.appendChild(item); }); pageIndicator.textContent = `Page ${page} / ${totalPages}`; prevPageBtn.disabled = (page === 1); nextPageBtn.disabled = (page === totalPages); }
  prevPageBtn.onclick = () => { if (currentPage > 1) displayRankPage(currentPage - 1); }
  nextPageBtn.onclick = () => { const totalPages = Math.ceil(allPublicRanks.length / ranksPerPage); if (currentPage < totalPages) displayRankPage(currentPage + 1); }
}
// --- RESIZE LOGIC ---
function setupResizeListeners() { resizeHandle.addEventListener('mousedown', startResize); } function startResize(e) { isResizing = true; startX = e.clientX; startY = e.clientY; startWidth = parseInt(document.body.style.width, 10); startHeight = parseInt(document.body.style.height, 10); document.addEventListener('mousemove', doResize); document.addEventListener('mouseup', stopResize); document.body.style.userSelect = 'none'; } function doResize(e) { if (!isResizing) return; let newWidth = startWidth + e.clientX - startX; let newHeight = startHeight + e.clientY - startY; newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH)); newHeight = Math.max(MIN_HEIGHT, Math.min(newHeight, MAX_HEIGHT)); applySize(newWidth, newHeight); } function stopResize() { if (!isResizing) return; isResizing = false; document.removeEventListener('mousemove', doResize); document.removeEventListener('mouseup', stopResize); document.body.style.userSelect = 'auto'; const finalWidth = parseInt(document.body.style.width, 10); const finalHeight = parseInt(document.body.style.height, 10); chrome.storage.sync.set({ popupWidth: finalWidth, popupHeight: finalHeight }); } function applySize(width, height) { document.body.style.width = `${width}px`; document.body.style.height = `${height}px`; }

// --- RUN ON STARTUP ---
window.onload = () => {
    console.log("Window loaded. Initializing popup/sidebar...");
    initializePopup();
};

function initializePopup() {
  initialize(); // Sua função de inicialização principal
  
  if (typeof Coloris === 'function') { 
    Coloris({ 
      themeMode: 'dark', 
      alpha: false, 
      parent: 'body', 
      swatches: ['#FFFFFF', '#000000', '#FF5555', '#55FFFF', '#55FF55', '#FFFF55', '#FF55FF', '#007bff']
    });
  } else {
    console.error("Coloris library not loaded correctly.");
  }
}