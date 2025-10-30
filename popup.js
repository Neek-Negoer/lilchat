// --- GLOBAL STATE ---
let userNickname = "Guest"; let userId = ""; let userRank = { name: 'USER', color: '#FFFFFF', outline: '#000000', outlineWidth: 1, shine: '#000000', animateShine: false }; let currentRoom = "home"; let messageCache = { "home": [] }; let joinedRooms = ["home"];

// --- Get ALL Elements (DECLARAÇÕES) ---
let terminal, chatLog, chatInput, rankModal, rankModalCloseBtn, menuToggleBtn, 
    sidebar, mainContent, roomListDiv, currentRoomTitle, resizeHandle, undockBtn,
    createTabBtn, browseTabBtn, createTab, browseTab, rankNameInput, rankColorInput,
    rankOutlineInput, rankOutlineWidth, rankShineInput, rankAnimateShine, 
    previewSpan, previewNick, saveRankButton, rankListDivBrowse, prevPageBtn, 
    nextPageBtn, pageIndicator;

// --- Rank Browser State ---
let allPublicRanks = []; let currentPage = 1; const ranksPerPage = 5;
// --- Resize State ---
let isResizing = false; let startX, startY, startWidth, startHeight; const MIN_WIDTH = 300; const MIN_HEIGHT = 200; const MAX_WIDTH = 800; const MAX_HEIGHT = 600;

// --- INITIALIZATION ---
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

  // 1. Busca os dados principais do chat (para popup E sidepanel)
  chrome.runtime.sendMessage({ type: "GET_ALL_DATA" }, (response) => {
    if (!document.body) return; // Proteção contra popup fechado
    if (chrome.runtime.lastError || !response || !response.userInfo) { 
      console.error(chrome.runtime.lastError || "Invalid response."); 
      if (chatLog) chatLog.innerHTML = '<div class="message system-event">Error loading data.</div>'; 
      return; 
    }
    userNickname = response.userInfo.nickname || "Guest"; 
    userRank = { ...userRank, ...response.userInfo.rank }; 
    userId = response.userInfo.userId;
    messageCache = { "home": [], ...response.messages }; 
    joinedRooms = ["home", ...Object.keys(messageCache).filter(r => r !== "home")];
    renderRoomList(); 
    switchRoom("home"); 
    if (!messageCache["home"] || messageCache["home"].length === 0) { 
      showWelcomeTutorial(); 
    }
  });

  // 2. Ouve por novas mensagens (para popup E sidepanel)
  chrome.runtime.onMessage.addListener((request) => {
    if (!document.body) return; // Proteção contra popup fechado
    if (request.type === "NEW_MESSAGE") {
      const { roomName, message } = request; 
      if (!messageCache[roomName]) { messageCache[roomName] = []; }
      if (!messageCache[roomName].some(m => m.id === message.id)) { 
        messageCache[roomName].push(message); 
        if (roomName === currentRoom) { addMessageToLog(message); } 
      }
    }
  });

  // 3. Configura todos os botões, etc. (para popup E sidepanel)
  setupListeners();

  // 4. Configura features SÓ DO POPUP
  if (document.body.classList.contains('is-popup')) {
    chrome.storage.sync.get(['popupWidth', 'popupHeight'], (result) => {
      if (!document.body) return; // Proteção contra popup fechado
      applySize(result.popupWidth || 400, result.popupHeight || 300);
    });
  }
}

function showWelcomeTutorial() { 
  const tutorialMessages = [ 
    { delay: 500, text: 'Welcome! /home lobby.' }, 
    { delay: 1000, text: 'Commands:' }, 
    { delay: 1500, text: '`/room join <n> <p>`' }, 
    { delay: 2000, text: '`/room create <n> <p>`' }, 
    { delay: 2500, text: '`/nick <name>`' }, 
    { delay: 3000, text: '`/rank`' }, 
    { delay: 3500, text: '`/leave`' }, 
    { delay: 4000, text: "Click ☰ to switch rooms." } 
  ]; 
  tutorialMessages.forEach(msg => { 
    setTimeout(() => { 
      if(currentRoom === 'home') { 
        const logMsg = { type: 'event', event: 'system', text: msg.text }; 
        if (!messageCache["home"]) messageCache["home"] = []; 
        if (!messageCache["home"].some(m => m.text === msg.text && m.type === 'event')) { 
          messageCache["home"].push(logMsg); 
          addMessageToLog(logMsg); 
        } 
      } 
    }, msg.delay); 
  }); 
}

function addMessageToLog(messageData) { 
  const messageDiv = document.createElement('div'); 
  messageDiv.classList.add('message'); 
  if (messageData.type === 'event') { 
    messageDiv.classList.add('system-event'); 
    let eventText = "Unknown event"; 
    if (messageData.event === 'join') { 
      eventText = `${messageData.nickname} joined.`; 
    } else if (messageData.event === 'leave') { 
      eventText = `${messageData.nickname} left.`; 
    } else if (messageData.event === 'system') { 
      eventText = messageData.text; 
    } 
    messageDiv.textContent = eventText; 
  } else { 
    const rankSpan = document.createElement('span'); 
    rankSpan.classList.add('nickname'); 
    applyRankStyles(rankSpan, messageData.rank); 
    const nickSpan = document.createElement('span'); 
    nickSpan.classList.add('nick'); 
    nickSpan.textContent = ` ${messageData.nickname}:`; 
    nickSpan.title = `DM ${messageData.nickname}`; 
    nickSpan.dataset.userId = messageData.userId; 
    nickSpan.onclick = () => { 
      addMessageToLog({ type: 'event', event: 'system', text: `DMing ${messageData.nickname} (soon!)` }); 
    }; 
    const textSpan = document.createElement('span'); 
    textSpan.classList.add('text'); 
    textSpan.textContent = ` ${messageData.text}`; 
    messageDiv.appendChild(rankSpan); 
    messageDiv.appendChild(nickSpan); 
    messageDiv.appendChild(textSpan); 
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
    item.textContent = roomName; 
    item.dataset.roomName = roomName; 
    if (roomName === currentRoom) { 
      item.classList.add('active'); 
    } 
    item.onclick = () => switchRoom(roomName); 
    roomListDiv.appendChild(item); 
  }); 
}

function switchRoom(roomName) { 
  currentRoom = roomName; 
  currentRoomTitle.textContent = roomName; 
  document.querySelectorAll('#room-list .room-list-item').forEach(item => { 
    item.classList.toggle('active', item.dataset.roomName === roomName); 
  }); 
  chatLog.innerHTML = ''; 
  const messages = messageCache[currentRoom] || []; 
  messages.forEach(addMessageToLog); 
  document.body.classList.remove('sidebar-open'); 
  setTimeout(() => { 
    chatLog.scrollTop = chatLog.scrollHeight; 
  }, 0); 
}

// --- EVENT LISTENERS (CORRIGIDO) ---
function setupListeners() {
  // Agora 'chatInput' foi atribuído com segurança dentro de initialize()
  chatInput.addEventListener('keydown', (event) => { 
    if (event.key === 'Enter' && chatInput.value.trim() !== '') { 
      handleChatInput(chatInput.value.trim()); 
      chatInput.value = ''; 
    } 
  });
  
  menuToggleBtn.onclick = () => { 
    document.body.classList.toggle('sidebar-open'); 
  };
  
  // --- Lógica do Botão Destacar ---
  if (undockBtn) { // Só existe no popup.html
    undockBtn.addEventListener('click', () => {
      console.log("Undocking to side panel...");
      chrome.runtime.sendMessage({ type: "openSidePanel" });
      window.close(); 
    });
  }

  setupRankModalListeners();
  
  // Só adiciona resize se o handle existir (só existe no popup.html)
  if (resizeHandle) {
    setupResizeListeners();
  }
}

function handleChatInput(text) { 
  if (text.startsWith('/nick ')) { 
    const newNick = text.substring(6).trim(); 
    if (newNick) { 
      userNickname = newNick; 
      chrome.storage.sync.set({ nickname: newNick }); 
      chrome.runtime.sendMessage({ type: "UPDATE_USER_INFO", info: { nickname: newNick } }); 
      addMessageToLog({ type: 'event', event: 'system', text: `Nickname set to: ${userNickname}` }); 
    } 
    return; 
  } 
  
  if (text === '/rank') { 
    rankModal.classList.remove('hidden'); 
    rankNameInput.value = userRank.name; 
    rankColorInput.value = userRank.color || '#FFFFFF'; 
    rankOutlineInput.value = userRank.outline || '#000000'; 
    rankOutlineWidth.value = userRank.outlineWidth || 1; 
    rankShineInput.value = userRank.shine || '#000000'; 
    rankAnimateShine.checked = userRank.animateShine || false; 
    previewNick.textContent = ` ${userNickname}:`; 
    updatePreview(); 
    return; 
  } 
  
  if (currentRoom === "home") { 
    const parts = text.split(' '); 
    const command = parts[0]; 
    const subCommand = parts[1]; 
    const roomName = parts[2]; 
    const password = parts[3]; 
    
    if (command === '/room') { 
      if (!subCommand) { 
        addMessageToLog({ type: 'event', event: 'system', text: "Usage: /room <join|create> <name> <password>" }); 
        return; 
      } 
      if (!roomName) { 
        addMessageToLog({ type: 'event', event: 'system', text: `Usage: /room ${subCommand} <name> <password>` }); 
        return; 
      } 
      if (!password) { 
        addMessageToLog({ type: 'event', event: 'system', text: `Usage: /room ${subCommand} ${roomName} <password>` }); 
        addMessageToLog({ type: 'event', event: 'system', text: "Password required." }); 
        return; 
      } 
      if (subCommand === 'join') { 
        handleJoinRoom(roomName, password); 
      } else if (subCommand === 'create') { 
        handleCreateRoom(roomName, password); 
      } else { 
        addMessageToLog({ type: 'event', event: 'system', text: "Use /room <join|create> ..." }); 
      } 
    } else if (text === '/leave') { 
      addMessageToLog({ type: 'event', event: 'system', text: 'You are already in /home.' }); 
    } else if (text.startsWith('/')) { 
      addMessageToLog({ type: 'event', event: 'system', text: 'Unknown command.' }); 
    } else { 
      addMessageToLog({ type: 'event', event: 'system', text: "In /home. Use `/room join <name> <pass>`." }); 
    } 
  } else { 
    if (text === '/leave') { 
      chrome.runtime.sendMessage({ type: "LEAVE_ROOM", roomName: currentRoom }, (response) => { 
        if (response && response.success) { 
          joinedRooms = joinedRooms.filter(r => r !== currentRoom); 
          delete messageCache[currentRoom]; 
          renderRoomList(); 
          switchRoom("home"); 
          addMessageToLog({ type: 'event', event: 'system', text: `Left ${response.roomName}.` }); 
        } else { 
          addMessageToLog({ type: 'event', event: 'system', text: `Error leaving: ${response?.error || chrome.runtime.lastError?.message || 'Unknown'}` }); 
        } 
      }); 
      return; 
    } 
    const messageData = { type: 'chat', userId: userId, nickname: userNickname, rank: userRank, text: text }; 
    chrome.runtime.sendMessage({ type: "SEND_MESSAGE", roomName: currentRoom, message: messageData }); 
  } 
}

function handleJoinRoom(roomName, password) { 
  addMessageToLog({ type: 'event', event: 'system', text: `Joining ${roomName}...` }); 
  chrome.runtime.sendMessage({ type: "JOIN_ROOM", roomName: roomName.toLowerCase(), password: password }, (response) => { 
    if (response && response.success) { 
      if (!joinedRooms.includes(response.roomName)) { 
        joinedRooms.push(response.roomName); 
        messageCache[response.roomName] = []; 
        renderRoomList(); 
      } 
      switchRoom(response.roomName); 
    } else { 
      addMessageToLog({ type: 'event', event: 'system', text: `Error: ${response?.error || chrome.runtime.lastError?.message || 'Unknown'}` }); 
    } 
  }); 
}

function handleCreateRoom(roomName, password) { 
  addMessageToLog({ type: 'event', event: 'system', text: `Creating ${roomName}...` }); 
  chrome.runtime.sendMessage({ type: "CREATE_ROOM", roomName: roomName.toLowerCase(), password: password }, (response) => { 
    if (response && response.success) { 
      if (!joinedRooms.includes(response.roomName)) { 
        joinedRooms.push(response.roomName); 
        messageCache[response.roomName] = []; 
        renderRoomList(); 
      } 
      switchRoom(response.roomName); 
    } else { 
      addMessageToLog({ type: 'event', event: 'system', text: `Error: ${response?.error || chrome.runtime.lastError?.message || 'Unknown'}` }); 
    } 
  }); 
}

function applyRankStyles(element, rankData) { 
  const defaults = { name: 'USER', color: '#FFFFFF', outline: '#000000', outlineWidth: 1, shine: '#000000', animateShine: false }; 
  const rank = { ...defaults, ...rankData }; 
  element.textContent = `[${rank.name}]`; 
  element.style.color = rank.color; 
  const width = parseInt(rank.outlineWidth); 
  const hasOutline = rank.outline && rank.outline !== '#000000' && width > 0; 
  if (hasOutline) { 
    element.style.webkitTextStrokeWidth = `${width}px`; 
    element.style.webkitTextStrokeColor = rank.outline; 
  } else { 
    element.style.webkitTextStrokeWidth = '0px'; 
  } 
  const hasShine = rank.shine && rank.shine !== '#000000'; 
  if (rank.animateShine && hasShine) { 
    element.classList.add('animated-shine'); 
    element.style.setProperty('--shine-color', rank.shine); 
    element.style.textShadow = 'none'; 
  } else { 
    element.classList.remove('animated-shine'); 
    element.style.animation = 'none'; 
    element.style.removeProperty('--shine-color'); 
    element.style.textShadow = hasShine ? `0 0 8px ${rank.shine}` : 'none'; 
  } 
}

function updatePreview() { 
  const rankData = { 
    name: rankNameInput.value.toUpperCase().substring(0, 4) || 'RANK', 
    color: rankColorInput.value, 
    outline: rankOutlineInput.value, 
    outlineWidth: rankOutlineWidth.value, 
    shine: rankShineInput.value, 
    animateShine: rankAnimateShine.checked 
  }; 
  applyRankStyles(previewSpan, rankData); 
}

// --- Rank Modal Logic ---
function setupRankModalListeners() {
  rankModalCloseBtn.onclick = () => { 
    rankModal.classList.add('hidden'); 
  };
  
  [rankNameInput, rankColorInput, rankOutlineInput, rankOutlineWidth, rankShineInput, rankAnimateShine].forEach(el => { 
    if(el) {
      const eventType = (el.type === 'checkbox' || el.type === 'number') ? 'change' : 'input'; 
      el.addEventListener(eventType, updatePreview); 
      if (el.hasAttribute('data-coloris')) { 
        el.addEventListener('change', updatePreview); 
      }
    }
  });
  
  saveRankButton.onclick = () => { 
    const newRank = { 
      name: rankNameInput.value.toUpperCase().substring(0, 4) || 'USER', 
      color: rankColorInput.value, 
      outline: rankOutlineInput.value, 
      outlineWidth: parseInt(rankOutlineWidth.value) || 1, 
      shine: rankShineInput.value, 
      animateShine: rankAnimateShine.checked, 
      creator: userNickname 
    }; 
    chrome.storage.sync.set({ rank: newRank }); 
    userRank = newRank; 
    chrome.runtime.sendMessage({ type: "UPDATE_USER_INFO", info: { rank: newRank } }); 
    if(newRank.name !== 'USER' && newRank.name !== 'GUEST') { 
      chrome.runtime.sendMessage({ type: "SAVE_PUBLIC_RANK", rank: newRank }); 
    } 
    rankModal.classList.add('hidden'); 
    addMessageToLog({ type: 'event', event: 'system', text: `Rank set to [${newRank.name}]!` }); 
  };
  
  createTabBtn.onclick = () => { 
    createTab.classList.remove('hidden'); 
    browseTab.classList.add('hidden'); 
    createTabBtn.classList.add('active'); 
    browseTabBtn.classList.remove('active'); 
  };
  
  browseTabBtn.onclick = () => { 
    browseTab.classList.remove('hidden'); 
    createTab.classList.add('hidden'); 
    browseTabBtn.classList.add('active'); 
    createTabBtn.classList.remove('active'); 
    loadPublicRanks(); 
  };
  
  function loadPublicRanks() {
    rankListDivBrowse.innerHTML = 'Loading...';
    chrome.runtime.sendMessage({ type: "GET_PUBLIC_RANKS" }, (response) => {
      if (response && response.success) { 
        allPublicRanks = response.ranks || []; 
        displayRankPage(1); 
      } else { 
        console.error("Error getting ranks:", response?.error); 
        rankListDivBrowse.innerHTML = 'Error loading ranks.'; 
      }
    });
  }
  
  function displayRankPage(page) { 
    currentPage = page; 
    rankListDivBrowse.innerHTML = ''; 
    const totalPages = Math.ceil(allPublicRanks.length / ranksPerPage); 
    if (totalPages === 0) { 
      pageIndicator.textContent = 'Page 1 / 1'; 
      prevPageBtn.disabled = true; 
      nextPageBtn.disabled = true; 
      rankListDivBrowse.innerHTML = 'No public ranks found.'; 
      return; 
    } 
    const startIndex = (page - 1) * ranksPerPage; 
    const endIndex = startIndex + ranksPerPage; 
    const ranksToShow = allPublicRanks.slice(startIndex, endIndex); 
    ranksToShow.forEach(rank => { 
      const item = document.createElement('div'); 
      item.classList.add('rank-list-item'); 
      const preview = document.createElement('span'); 
      preview.classList.add('rank-preview'); 
      applyRankStyles(preview, rank); 
      item.appendChild(preview); 
      item.appendChild(document.createTextNode(` (by ${rank.creator || 'Unknown'})`)); 
      item.onclick = () => { 
        chrome.storage.sync.set({ rank: rank }); 
        userRank = rank; 
        chrome.runtime.sendMessage({ type: "UPDATE_USER_INFO", info: { rank: rank } }); 
        rankModal.classList.add('hidden'); 
        addMessageToLog({ type: 'event', event: 'system', text: `Rank set to [${rank.name}]!` }); 
      }; 
      rankListDivBrowse.appendChild(item); 
    }); 
    pageIndicator.textContent = `Page ${page} / ${totalPages}`; 
    prevPageBtn.disabled = (page === 1); 
    nextPageBtn.disabled = (page === totalPages); 
  }
  
  prevPageBtn.onclick = () => { 
    if (currentPage > 1) displayRankPage(currentPage - 1); 
  };
  
  nextPageBtn.onclick = () => { 
    const totalPages = Math.ceil(allPublicRanks.length / ranksPerPage); 
    if (currentPage < totalPages) displayRankPage(currentPage + 1); 
  };
}

// --- RESIZE LOGIC ---
function setupResizeListeners() { 
  resizeHandle.addEventListener('mousedown', startResize); 
}

function startResize(e) { 
  isResizing = true; 
  startX = e.clientX; 
  startY = e.clientY; 
  startWidth = parseInt(document.body.style.width, 10); 
  startHeight = parseInt(document.body.style.height, 10); 
  document.addEventListener('mousemove', doResize); 
  document.addEventListener('mouseup', stopResize); 
  document.body.style.userSelect = 'none'; 
}

function doResize(e) { 
  if (!isResizing) return; 
  let newWidth = startWidth + e.clientX - startX; 
  let newHeight = startHeight + e.clientY - startY; 
  newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH)); 
  newHeight = Math.max(MIN_HEIGHT, Math.min(newHeight, MAX_HEIGHT)); 
  applySize(newWidth, newHeight); 
}

function stopResize() { 
  if (!isResizing) return; 
  isResizing = false; 
  document.removeEventListener('mousemove', doResize); 
  document.removeEventListener('mouseup', stopResize); 
  document.body.style.userSelect = 'auto'; 
  const finalWidth = parseInt(document.body.style.width, 10); 
  const finalHeight = parseInt(document.body.style.height, 10); 
  chrome.storage.sync.set({ popupWidth: finalWidth, popupHeight: finalHeight }); 
}

function applySize(width, height) { 
  document.body.style.width = `${width}px`; 
  document.body.style.height = `${height}px`; 
}

// --- RUN ON STARTUP ---
document.addEventListener('DOMContentLoaded', () => {
  // VERIFICA PRIMEIRO SE O SIDE PANEL JÁ ESTÁ ABERTO
  chrome.runtime.sendMessage({ type: "isSidePanelOpen" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("Error checking side panel, opening popup anyway.", chrome.runtime.lastError.message);
      initializePopup(); // Continua e abre o popup
      return;
    }

    if (response && response.isOpen) {
      // Se estiver aberto, apenas feche este popup.
      console.log("Side panel is already open. Closing popup.");
      window.close();
    } else {
      // Se não estiver aberto, inicialize o popup normalmente.
      console.log("Side panel is not open. Initializing popup.");
      initializePopup();
    }
  });
});

// Criamos uma nova função para organizar o código de inicialização
function initializePopup() {
  initialize(); // Sua função de inicialização principal
  
  // Seu código original do Coloris
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