// Full popup.js updated: timestamp parts, Discord-like message layout, reply/forward, rank preview, resize, init.

// --- Helper Functions ---
function safeAddEventListener(element, eventType, handler) {
  if (element && typeof element.addEventListener === "function") {
    element.addEventListener(eventType, handler);
    return true;
  } else {
    console.warn(
      `Failed to attach ${eventType} listener - element not ready`,
      element
    );
    return false;
  }
}

// Retorna {date, time} sem segundos (formato DD/MM/YYYY e HH:MM)
// Exibe "hoje", "ontem" ou nome do dia da semana quando a mensagem for desta semana.
function formatTimestampParts(ts) {
  try {
    const d = ts ? new Date(ts) : new Date();
    const now = new Date();
    // normalize times to local midnight for date comparisons
    function startOfDay(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
    const msgDay = startOfDay(d);
    const today = startOfDay(now);

    // yesterday
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    // start of ISO-week (Monday)
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ...
    const mondayOffset = (dayOfWeek + 6) % 7; // 0 if monday, 6 if sunday
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - mondayOffset);

    // helpers
    const zero = (n) => String(n).padStart(2, "0");
    const time = `${zero(d.getHours())}:${zero(d.getMinutes())}`;

    // weekday names em pt-BR
    const weekdays = [
      "domingo",
      "segunda-feira",
      "terça-feira",
      "quarta-feira",
      "quinta-feira",
      "sexta-feira",
      "sábado",
    ];

    // same day => "hoje"
    if (msgDay.getTime() === today.getTime()) {
      return { date: "hoje", time };
    }

    // yesterday => "ontem"
    if (msgDay.getTime() === yesterday.getTime()) {
      return { date: "ontem", time };
    }

    // same week (from Monday -> Sunday) => weekday name
    if (
      msgDay.getTime() >= startOfWeek.getTime() &&
      msgDay.getTime() < startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000
    ) {
      return { date: weekdays[d.getDay()], time };
    }

    // otherwise numeric date dd/mm/yyyy
    const dd = zero(d.getDate());
    const mm = zero(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    return { date: `${dd}/${mm}/${yyyy}`, time };
  } catch (e) {
    return { date: "", time: "" };
  }
}

// Compatibilidade: string com data + hora (sem segundos)
function formatTimestamp(ts) {
  const p = formatTimestampParts(ts);
  if (!p.date && !p.time) return "";
  return `${p.date} ${p.time}`;
}

// --- GLOBAL STATE ---
let userNickname = null;
let userId = null;
let userRank = null;
let userBio = "";
let userProfilePicture = "";
let currentRoom = "login";
let messageCache = { login: [], home: [] };
let joinedRooms = [];
let unreadCounts = {};
let hasSeenHomeTutorial = false;
let database;
let replyContext = null;
let messageToForward = null;

// --- ELEMENT REFS ---
let terminal,
  chatLog,
  chatInput,
  rankModal,
  membersSidebar,
  membersToggleBtn,
  membersSidebarCloseBtn,
  rankModalCloseBtn,
  menuToggleBtn,
  sidebar,
  mainContent,
  roomListDiv,
  currentRoomTitle,
  resizeHandle,
  undockBtn,
  createTabBtn,
  browseTabBtn,
  createTab,
  browseTab,
  rankNameInput,
  rankColorInput,
  rankOutlineInput,
  rankOutlineWidth,
  rankShineInput,
  rankAnimateShine,
  previewSpan,
  previewNick,
  saveRankButton,
  rankListDivBrowse,
  prevPageBtn,
  nextPageBtn,
  pageIndicator,
  profileEditModal,
  profileEditCloseBtn,
  profilePicInput,
  profileBioInput,
  profileSaveButton,
  profileViewModal,
  profileViewCloseBtn,
  profileViewPic,
  profileViewName,
  profileViewRank,
  profileViewBio,
  profileDmButton,
  replyPreviewBar,
  replyPreviewBarContent,
  onlineMembersCountSpan,
  scrollToBottomBtn,
  mentionSuggestions,
  replyCancelBtn,
  forwardModal,
  forwardModalCloseBtn,
  forwardSearchInput,
  forwardRoomList;

// --- Rank Browser State & Resize ---
let allPublicRanks = [];
let currentPage = 1;
const ranksPerPage = 5;

let isResizing = false;
let startX, startY, startWidth, startHeight;
const MIN_WIDTH = 300,
  MIN_HEIGHT = 200,
  MAX_WIDTH = 800,
  MAX_HEIGHT = 600;

// --- INITIALIZATION ---
function initialize() {
  terminal = document.getElementById("terminal");
  chatLog = document.getElementById("chat-log");
  chatInput = document.getElementById("chat-input");

  membersSidebar = document.getElementById("members-sidebar");
  membersToggleBtn = document.getElementById("members-toggle-btn");
  membersSidebarCloseBtn = document.getElementById("members-sidebar-close-btn");
  forwardModal = document.getElementById("forward-modal");
  forwardModalCloseBtn = document.getElementById("forward-modal-close-btn");
  forwardSearchInput = document.getElementById("forward-search-input");
  forwardRoomList = document.getElementById("forward-room-list");

  rankModal = document.getElementById("rank-modal");
  rankModalCloseBtn = document.querySelector("#rank-modal .modal-close");
  menuToggleBtn = document.getElementById("menu-toggle-btn");
  sidebar = document.getElementById("sidebar");
  mainContent = document.getElementById("main-content");
  roomListDiv = document.getElementById("room-list");
  currentRoomTitle = document.getElementById("current-room-title");
  resizeHandle = document.getElementById("resize-handle");
  undockBtn = document.getElementById("undock-btn");
  createTabBtn = document.getElementById("create-tab-btn");
  browseTabBtn = document.getElementById("browse-tab-btn");
  createTab = document.getElementById("create-tab");
  browseTab = document.getElementById("browse-tab");
  rankNameInput = document.getElementById("rank-name-input");
  rankColorInput = document.getElementById("rank-color-input");
  rankOutlineInput = document.getElementById("rank-outline-input");
  rankOutlineWidth = document.getElementById("rank-outline-width");
  rankShineInput = document.getElementById("rank-shine-input");
  rankAnimateShine = document.getElementById("rank-animate-shine");
  previewSpan = document.querySelector(".rank-preview-span");
  previewNick = document.getElementById("rank-preview-nick");
  saveRankButton = document.getElementById("save-rank-button");
  rankListDivBrowse = document.getElementById("rank-list");
  prevPageBtn = document.getElementById("prev-page-btn");
  nextPageBtn = document.getElementById("next-page-btn");
  pageIndicator = document.getElementById("page-indicator");
  profileEditModal = document.getElementById("profile-edit-modal");
  profileEditCloseBtn = document.getElementById("profile-edit-close-btn");
  profilePicInput = document.getElementById("profile-pic-input");
  profileBioInput = document.getElementById("profile-bio-input");
  profileSaveButton = document.getElementById("profile-save-button");
  profileViewModal = document.getElementById("profile-view-modal");
  profileViewCloseBtn = document.getElementById("profile-view-close-btn");
  profileViewPic = document.getElementById("profile-view-pic");
  profileViewName = document.getElementById("profile-view-name");
  profileViewRank = document.getElementById("profile-view-rank");
  profileViewBio = document.getElementById("profile-view-bio");
  profileDmButton = document.getElementById("profile-dm-button");

  replyPreviewBar = document.getElementById("reply-preview-bar");
  replyPreviewBarContent = document.getElementById("reply-preview-bar-content");
  onlineMembersCountSpan = document.getElementById("online-members-count");
  scrollToBottomBtn = document.getElementById("scroll-to-bottom-btn");
  mentionSuggestions = document.getElementById("mention-suggestions");
  replyCancelBtn = document.getElementById("reply-cancel-btn");

  setupForwardModal();

  try {
    if (!firebase.apps.length) {
      const firebaseConfig = {
        apiKey: "AIzaSyC2VTY92muqSxy8YefrWUUW-gJG6E97hGk",
        authDomain: "lilchat-64af5.firebaseapp.com",
        projectId: "lilchat-64af5",
        storageBucket: "lilchat-64af5.firebasestorage.app",
        messagingSenderId: "615855326129",
        appId: "1:1234567890:web:980e3799b7c8bb1047b390",
        databaseURL: "https://lilchat-64af5-default-rtdb.firebaseio.com/",
      };
      firebase.initializeApp(firebaseConfig);
    }
    database = firebase.database();
  } catch (e) {
    console.error("Firebase não foi carregado corretamente!", e);
    document.body.innerHTML = `<div style="color: red; padding: 10px; font-family: monospace;">CRITICAL ERROR: Failed to load Firebase. Check manifest.json and HTML files.</div>`;
    return;
  }

  chrome.storage.sync.get(["popupWidth", "popupHeight"], (result) => {
    if (document.body.classList.contains("is-popup")) {
      applySize(result.popupWidth || 723, result.popupHeight || 360);
    }
  });

  chrome.runtime.sendMessage({ type: "GET_ALL_DATA" }, (response) => {
    if (chrome.runtime.lastError) {
      chatLog.innerHTML = `<div class="message system-event">Error loading data: ${chrome.runtime.lastError.message}</div>`;
      return;
    }
    if (!response || !response.userInfo) {
      chatLog.innerHTML =
        '<div class="message system-event">Error loading data. Invalid response.</div>';
      return;
    }
    messageCache = { login: [], home: [], ...response.messages };
    unreadCounts = response.unreadCounts || {};
    if (response.userInfo.nickname) {
      showChatScreen(
        response.userInfo,
        response.joinedRooms,
        response.messages,
        unreadCounts
      );
    } else {
      showLoginScreen();
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "NEW_MESSAGE") {
      const { roomName, message } = request;
      if (!messageCache[roomName]) {
        messageCache[roomName] = [];
      }
      if (
        message.id &&
        !messageCache[roomName].some((m) => m.id === message.id)
      ) {
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

// --- UI & Screens ---
function showLoginScreen() {
  currentRoom = "login";
  joinedRooms = [];
  messageCache["login"] = [];
  unreadCounts = {};
  hasSeenHomeTutorial = false;
  if (currentRoomTitle) currentRoomTitle.textContent = "Login";
  if (menuToggleBtn) menuToggleBtn.style.display = "none";
  if (undockBtn) undockBtn.style.display = "none";
  renderRoomList();
  switchRoom("login");
  const ps = document.querySelector(".prompt-symbol");
  if (ps) ps.textContent = "/login >";
}

function showChatScreen(
  userInfo,
  joinedRoomsFromBg = [],
  messagesFromBg = {},
  unreadCountsFromBg = {}
) {
  userNickname = userInfo.nickname;
  userRank = userInfo.rank;
  userId = userInfo.userId;
  userBio = userInfo.bio || "";
  userProfilePicture = userInfo.profilePicture || "";

  messageCache = { login: [], home: [], ...messagesFromBg };
  joinedRooms = ["home", ...joinedRoomsFromBg];
  unreadCounts = unreadCountsFromBg;

  if (menuToggleBtn) menuToggleBtn.style.display = "block";
  if (undockBtn) undockBtn.style.display = "block";

  renderRoomList();

  chrome.storage.local.get(["lastActiveRoom"], (result) => {
    if (
      result.lastActiveRoom &&
      joinedRooms.includes(result.lastActiveRoom) &&
      result.lastActiveRoom !== "login"
    ) {
      switchRoom(result.lastActiveRoom);
    } else {
      switchRoom("home");
    }
  });
  const ps = document.querySelector(".prompt-symbol");
  if (ps) ps.textContent = ">";
}

// --- Tutorials & Help ---
function showLoginTutorial() {
  const tutorialMessages = [
    { delay: 500, text: "Bem-vindo ao LilChat!" },
    { delay: 1000, text: "Para se registrar, digite:" },
    { delay: 1500, text: "`/reg <nick> <senha> <confirmar_senha>`" },
    { delay: 2000, text: "Para logar, digite:" },
    { delay: 2500, text: "`/login <nick> <senha>`" },
    { delay: 3000, text: "Use `/help` para ver isso de novo." },
  ];
  tutorialMessages.forEach((msg) => {
    setTimeout(() => {
      if (currentRoom === "login") {
        const logMsg = {
          type: "event",
          event: "system",
          text: msg.text,
          timestamp: Date.now() + msg.delay,
        };
        if (!messageCache["login"].some((m) => m.text === msg.text)) {
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
    { delay: 1000, text: "Comandos:" },
    { delay: 1500, text: "`/room join <n> <p>` - Entra em uma sala." },
    { delay: 2000, text: "`/room create <n> <p>` - Cria uma sala." },
    { delay: 2500, text: "`/profile` - Edita seu perfil (bio/foto)." },
    { delay: 3000, text: "`/rank` - Abre o customizador de rank." },
    { delay: 3500, text: "`/leave` - Sai da sala atual." },
    { delay: 4000, text: "`/logout` - Desloga da sua conta." },
    { delay: 4500, text: "Use `/help` para ver isso de novo." },
  ];
  tutorialMessages.forEach((msg) => {
    setTimeout(() => {
      if (currentRoom === "home") {
        const logMsg = {
          type: "event",
          event: "system",
          text: msg.text,
          timestamp: Date.now() + msg.delay,
        };
        if (!messageCache["home"]) {
          messageCache["home"] = [];
        }
        if (
          !messageCache["home"].some(
            (m) => m.text === msg.text && m.type === "event"
          )
        ) {
          messageCache["home"].push(logMsg);
          addMessageToLog(logMsg);
        }
      }
    }, msg.delay);
  });
}

function showLoginHelp() {
  const messages = [
    "Para se registrar, digite:",
    "`/reg <nick> <senha> <confirmar_senha>`",
    "Para logar, digite:",
    "`/login <nick> <senha>`",
  ];
  messages.forEach((msg) =>
    addMessageToLog({ type: "event", event: "system", text: msg })
  );
}

function showWelcomeHelp() {
  const messages = [
    `Logado como: ${userNickname}`,
    "Comandos:",
    "`/room join <n> <p>` - Entra em uma sala.",
    "`/room create <n> <p>` - Cria uma sala.",
    "`/profile` - Edita seu perfil (bio/foto).",
    "`/rank` - Abre o customizador de rank.",
    "`/leave` - Sai da sala atual.",
    "`/logout` - Desloga sua conta.",
  ];
  messages.forEach((msg) =>
    addMessageToLog({ type: "event", event: "system", text: msg })
  );
}

// --- UI RENDERING ---
function addMessageToLog(messageData) {
  if (!messageData || !chatLog) {
    console.error("Invalid message data or chatLog not found");
    return;
  }

  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message");
  if (messageData.id) messageDiv.dataset.messageId = messageData.id;

  // System / event messages keep existing behavior
  if (messageData.type === "event") {
    messageDiv.classList.add("system-event");
    let eventText = "";
    switch (messageData.event) {
      case "join":
        eventText = `${messageData.nickname} joined the room`;
        break;
      case "leave":
        eventText = `${messageData.nickname} left the room`;
        break;
      case "system":
        eventText = messageData.text;
        break;
      default:
        eventText = messageData.text || `Unknown event: ${messageData.event}`;
        break;
    }
    messageDiv.innerHTML = eventText;
    chatLog.appendChild(messageDiv);
    chatLog.scrollTop = chatLog.scrollHeight;
    return;
  }

  // --- NOVO: Destaque de Menção ---
  const mentionRegex = new RegExp(`@${userNickname}\\b`, "i");
  if (messageData.text && mentionRegex.test(messageData.text)) {
    messageDiv.classList.add("mention-highlight");
  }
  // --- FIM NOVO ---

  // Create message container with profile pic
  const messageContainer = document.createElement("div");
  messageContainer.classList.add("message-container");

  // Add profile picture (if available and not a reply)
  if (messageData.profilePicture && !messageData.replyTo) {
    const picDiv = document.createElement("div");
    picDiv.classList.add("message-pic-wrapper");

    const pic = document.createElement("img");
    pic.src = messageData.profilePicture;
    pic.alt = messageData.nickname || "User";
    pic.classList.add("message-pic");
    pic.style.cursor = "pointer";
    pic.onclick = () => openUserProfile(messageData.nickname);

    picDiv.appendChild(pic);
    messageContainer.appendChild(picDiv);
  } else if (!messageData.profilePicture && !messageData.replyTo) {
    // Add empty space for alignment when no picture
    const emptyDiv = document.createElement("div");
    emptyDiv.classList.add("message-pic-wrapper");
    messageContainer.appendChild(emptyDiv);
  }

  // HEADER: left = name+rank, right = date + time
  const headerDiv = document.createElement("div");
  headerDiv.classList.add("message-header");

  const headerLeft = document.createElement("div");
  headerLeft.classList.add("message-header-left");

  const nameSpan = document.createElement("span");
  nameSpan.classList.add("nick");
  nameSpan.textContent = messageData.nickname || "Unknown";
  // apply rank styling (will inject rank badge before name)
  if (messageData.rank) applyRankStyles(nameSpan, messageData.rank);

  // Make nickname clickable (profile) - for both other users and yourself
  if (messageData.nickname) {
    nameSpan.title = `View ${messageData.nickname}'s profile`;
    nameSpan.style.cursor = "pointer";
    nameSpan.onclick = () => openUserProfile(messageData.nickname);
  }

  headerLeft.appendChild(nameSpan);
  headerDiv.appendChild(headerLeft);

  const tsParts = formatTimestampParts(messageData.timestamp);
  const headerRight = document.createElement("div");
  headerRight.classList.add("message-header-right");

  const dateSpan = document.createElement("span");
  dateSpan.classList.add("message-date");
  dateSpan.textContent = tsParts.date;

  const timeSpan = document.createElement("span");
  timeSpan.classList.add("message-time");
  timeSpan.textContent = tsParts.time;

  headerRight.appendChild(dateSpan);
  headerRight.appendChild(timeSpan);
  headerDiv.appendChild(headerRight);

  messageDiv.appendChild(headerDiv);

  // BODY: reply preview + text
  const bodyDiv = document.createElement("div");
  bodyDiv.classList.add("message-body");

  if (messageData.replyTo) {
    const reply = messageData.replyTo;
    const replyBlock = document.createElement("div");
    replyBlock.classList.add("reply-preview");

    const replyNick = document.createElement("span");
    replyNick.classList.add("nick");
    replyNick.textContent = `${reply.nickname}:`;
    if (reply.rank) {
      applyRankStyles(replyNick, reply.rank);
    }

    const replyText = document.createElement("span");
    replyText.classList.add("reply-preview-text");
    replyText.textContent = ` ${reply.text}`;

    replyBlock.appendChild(replyNick);
    replyBlock.appendChild(replyText);
    bodyDiv.appendChild(replyBlock);
  }

  if (messageData.text) {
    const textSpan = document.createElement("div");
    textSpan.classList.add("text");
    textSpan.textContent = messageData.text;
    bodyDiv.appendChild(textSpan);
  }

  messageDiv.appendChild(bodyDiv);

  if (messageData.type !== "event") {
    const actionsDiv = document.createElement("div");
    actionsDiv.classList.add("message-actions");

    const replyBtn = document.createElement("button");
    replyBtn.classList.add("message-action-btn", "reply-btn");
    replyBtn.innerHTML = "&#8617;";
    replyBtn.title = "Reply";
    replyBtn.onclick = () => setReplyContext(messageData);

    const forwardBtn = document.createElement("button");
    forwardBtn.classList.add("message-action-btn", "forward-btn");
    forwardBtn.innerHTML = "&#8618;";
    forwardBtn.title = "Forward";
    forwardBtn.onclick = () => openForwardModal(messageData);

    actionsDiv.appendChild(replyBtn);
    actionsDiv.appendChild(forwardBtn);
    messageDiv.appendChild(actionsDiv);
  }

  // Append message with container if it has profile pic or is not a reply
  if (!messageData.replyTo) {
    messageContainer.appendChild(messageDiv);
    chatLog.appendChild(messageContainer);
  } else {
    chatLog.appendChild(messageDiv);
  }

  // --- ADICIONA O EVENTO DE CLIQUE APÓS A MENSAGEM ESTAR NO DOM ---
  // Isso garante que o elemento replyBlock exista e possa ser encontrado.
  if (messageData.replyTo && messageData.id) {
    const thisMessageElement = chatLog.querySelector(
      `[data-message-id="${messageData.id}"]`
    );
    if (thisMessageElement) {
      const replyBlock = thisMessageElement.querySelector(".reply-preview");
      const originalMessageId = messageData.replyTo.id;

      if (replyBlock && originalMessageId) {
        replyBlock.style.cursor = "pointer";
        replyBlock.title = "Clique para ver a mensagem original";
        replyBlock.addEventListener("click", () => {
          scrollToMessage(originalMessageId, messageData.replyTo.rank);
        });
      }
    }
  }

  chatLog.scrollTop = chatLog.scrollHeight;
}

// --- NOVO: Rola para a mensagem com o ID especificado e a destaca ---
function scrollToMessage(messageId, rank) {
  const messageElement = chatLog.querySelector(
    `[data-message-id="${messageId}"]`
  );
  if (messageElement) {
    messageElement.scrollIntoView({ behavior: "smooth", block: "center" });

    let highlightColor = "rgba(85, 135, 255, 0.15)"; // Cor azul padrão de fallback

    // Usa a cor do rank para o destaque, se disponível e válida
    if (rank && rank.color) {
      let hex = rank.color.startsWith("#") ? rank.color.slice(1) : rank.color;

      // Expande o formato de 3 dígitos (ex: #FFF -> #FFFFFF)
      if (hex.length === 3) {
        hex = hex
          .split("")
          .map((char) => char + char)
          .join("");
      }

      let shineHex = rank.shine?.startsWith("#")
        ? rank.shine.slice(1)
        : rank.shine;
      if (shineHex && shineHex.length === 3) {
        shineHex = shineHex
          .split("")
          .map((char) => char + char)
          .join("");
      }

      if (hex.length === 6) {
        // A cor principal (texto) é obrigatória
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        // Aplica a cor apenas se os valores forem números válidos
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          // Se houver cor de brilho, mistura com a cor principal
          if (shineHex && shineHex.length === 6) {
            const shineR = parseInt(shineHex.substring(0, 2), 16);
            const shineG = parseInt(shineHex.substring(2, 4), 16);
            const shineB = parseInt(shineHex.substring(4, 6), 16);
            if (!isNaN(shineR) && !isNaN(shineG) && !isNaN(shineB)) {
              // Cria um gradiente sutil com as duas cores
              highlightColor = `linear-gradient(135deg, rgba(${r},${g},${b},0.2), rgba(${shineR},${shineG},${shineB},0.2))`;
            }
          } else {
            // Se não houver brilho, usa apenas a cor principal
            highlightColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
          }
        }
      }
    }

    messageElement.style.background = highlightColor;
    messageElement.classList.add("highlight"); // Adiciona para a transição
    setTimeout(() => {
      messageElement.classList.remove("highlight");
      messageElement.style.background = ""; // Remove o estilo inline
    }, 1500);
  }
}

// --- PROFILE VIEW ---
function openUserProfile(nickname) {
  chrome.runtime.sendMessage(
    { type: "GET_USER_PROFILE", nickname: nickname },
    (response) => {
      if (response && response.success) {
        profileViewPic.src = response.profilePicture;
        profileViewPic.style.cursor = "pointer";
        profileViewPic.onclick = () =>
          openProfilePicModal(response.profilePicture);
        profileViewName.textContent = response.nickname;
        profileViewRank.innerHTML = `<span class="nickname"></span>`;
        applyRankStyles(
          profileViewRank.querySelector(".nickname"),
          response.rank
        );
        profileViewBio.textContent = response.bio;
        // Hide DM button if viewing own profile
        if (response.nickname === userNickname) {
          profileDmButton.style.display = "none";
        } else {
          profileDmButton.style.display = "block";
          profileDmButton.dataset.nickname = response.nickname;
        }
        profileViewModal.classList.remove("hidden");
      }
    }
  );
}

// --- PROFILE PIC ENLARGEMENT MODAL ---
function openProfilePicModal(imageUrl) {
  const modal = document.getElementById("profile-pic-modal");
  const modalImg = document.getElementById("profile-pic-modal-img");
  if (modal && modalImg) {
    modalImg.src = imageUrl;
    modal.classList.remove("hidden");
  }
}

function closeProfilePicModal() {
  const modal = document.getElementById("profile-pic-modal");
  if (modal) {
    modal.classList.add("hidden");
  }
}

// --- ROOM LIST & SWITCH ---
function renderRoomList() {
  if (!roomListDiv) return;
  roomListDiv.innerHTML = "";
  joinedRooms.forEach((roomName) => {
    const item = document.createElement("div");
    item.classList.add("room-list-item");
    let displayName = roomName;
    if (roomName.includes("_&_")) {
      const names = roomName.split("_&_");
      const otherUser = names.find(
        (name) =>
          userNickname && name.toLowerCase() !== userNickname.toLowerCase()
      );
      displayName = otherUser ? `@${otherUser}` : "@DM";
    }
    const nameSpan = document.createElement("span");
    nameSpan.textContent = displayName;
    item.appendChild(nameSpan);
    item.dataset.roomName = roomName;
    if (unreadCounts[roomName] > 0) {
      const badge = document.createElement("span");
      badge.classList.add("unread-badge");
      badge.textContent =
        unreadCounts[roomName] > 9 ? "9+" : unreadCounts[roomName];
      item.appendChild(badge);
    }
    if (roomName === currentRoom) {
      item.classList.add("active");
    }
    item.onclick = () => switchRoom(roomName);
    roomListDiv.appendChild(item);
  });
}

function switchRoom(roomName) {
  const unreadCount = unreadCounts[roomName] || 0;

  if (unreadCounts[roomName] > 0) {
    delete unreadCounts[roomName];
    chrome.runtime.sendMessage({
      type: "MARK_ROOM_AS_READ",
      roomName: roomName,
    });
    renderRoomList();
  }

  cancelReply();

  currentRoom = roomName;
  let displayName = roomName;
  if (roomName.includes("_&_")) {
    const names = roomName.split("_&_");
    const otherUser = names.find(
      (name) =>
        userNickname && name.toLowerCase() !== userNickname.toLowerCase()
    );
    displayName = otherUser ? `@${otherUser}` : "@DM";
  }
  if (currentRoomTitle) currentRoomTitle.textContent = displayName;

  document.querySelectorAll("#room-list .room-list-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.roomName === roomName);
  });

  // Mostra ou esconde o botão de membros
  const showMembersBtn = roomName !== "login" && roomName !== "home";
  if (membersToggleBtn)
    membersToggleBtn.classList.toggle("hidden", !showMembersBtn);
  if (onlineMembersCountSpan)
    onlineMembersCountSpan.classList.toggle("hidden", !showMembersBtn);
  if (!showMembersBtn && onlineMembersCountSpan)
    onlineMembersCountSpan.textContent = ""; // Limpa o contador

  if (showMembersBtn) updateMemberList(roomName);

  if (chatLog) chatLog.innerHTML = "";

  if (roomName === "home") {
    if (!hasSeenHomeTutorial) {
      showWelcomeTutorial();
      hasSeenHomeTutorial = true;
    } else {
      addMessageToLog({
        type: "event",
        event: "system",
        text: `Logado como: ${userNickname}`,
      });
      addMessageToLog({
        type: "event",
        event: "system",
        text: "*/help para ver os comandos*",
      });
    }
  } else if (roomName === "login") {
    showLoginTutorial();
  } else {
    // --- LÓGICA DE MENSAGENS NÃO LIDAS ---
    const messages = messageCache[currentRoom] || [];
    let firstUnreadMessageId = null;
    let firstUnreadIndex = -1;

    if (unreadCount > 0 && messages.length >= unreadCount) {
      firstUnreadIndex = messages.length - unreadCount;
      firstUnreadMessageId = messages[firstUnreadIndex]?.id;
    }

    messages.forEach((message, index) => {
      // Insere o separador antes da primeira mensagem não lida
      if (index === firstUnreadIndex && firstUnreadMessageId) {
        const separator = document.createElement("div");
        separator.classList.add("unread-separator");
        separator.innerHTML = "<span>Mensagens Novas</span>";
        separator.id = "unread-separator-line";
        chatLog.appendChild(separator);
      }
      addMessageToLog(message);
    });
  }

  document.body.classList.remove("sidebar-open");
  document.body.classList.remove("members-sidebar-open"); // Fecha a lista de membros ao trocar de sala
  setTimeout(() => {
    if (chatLog) {
      const unreadSeparator = document.getElementById("unread-separator-line");
      if (unreadSeparator) {
        // Rola para o separador de não lidas
        unreadSeparator.scrollIntoView({ behavior: "auto", block: "center" });
      } else {
        // Comportamento padrão: rola para o final
        chatLog.scrollTop = chatLog.scrollHeight;
      }
    }
  }, 0);

  if (roomName !== "login") {
    chrome.storage.local.set({ lastActiveRoom: roomName });
  }
}

function getRoomMembers(roomName, callback) {
  chrome.runtime.sendMessage(
    { type: "GET_ROOM_MEMBERS", roomName },
    (response) => {
      callback(response);
    }
  );
}

// --- NOVO: Lógica da Lista de Membros ---
function updateMemberList(roomName) {
  const onlineList = document.getElementById("online-members-list");
  const offlineList = document.getElementById("offline-members-list");

  if (!onlineList || !offlineList) return;

  onlineList.innerHTML = "Carregando...";
  offlineList.innerHTML = "";

  getRoomMembers(roomName, (response) => {
    if (response && response.success) {
      onlineList.innerHTML = "";
      offlineList.innerHTML = "";

      const { online, offline } = response;

      if (onlineMembersCountSpan) {
        onlineMembersCountSpan.textContent = online.length;
      }

      online.forEach((member) => {
        const item = createMemberListItem(member, true);
        onlineList.appendChild(item);
      });

      offline.forEach((member) => {
        const item = createMemberListItem(member, false);
        offlineList.appendChild(item);
      });

      if (online.length === 0)
        onlineList.innerHTML =
          '<div class="member-list-item" style="color: #888;">Ninguém online.</div>';
      if (offline.length === 0)
        offlineList.innerHTML =
          '<div class="member-list-item" style="color: #888;">Nenhum membro offline.</div>';
    } else {
      onlineList.innerHTML = "Erro ao carregar.";
    }
  });
}

function createMemberListItem(member, isOnline) {
  const item = document.createElement("div");
  item.classList.add("member-list-item");

  const picWrapper = document.createElement("div");
  picWrapper.classList.add("member-pic-wrapper");

  const pic = document.createElement("img");
  pic.src = member.profilePicture;
  pic.classList.add("member-list-pic");
  pic.alt = member.nickname;

  picWrapper.appendChild(pic);

  const statusDot = document.createElement("div");
  statusDot.classList.add("status-dot", isOnline ? "online" : "offline");
  picWrapper.appendChild(statusDot);

  const nameSpan = document.createElement("span");
  nameSpan.classList.add("nick");
  nameSpan.textContent = member.nickname;
  applyRankStyles(nameSpan, member.rank);

  // Adiciona o evento de clique para abrir o perfil do usuário
  item.style.cursor = "pointer";
  item.onclick = () => {
    openUserProfile(member.nickname);
  };

  item.appendChild(picWrapper);
  item.appendChild(nameSpan);
  return item;
}
// --- LISTENERS ---
function setupListeners() {
  setupResizeListeners();
  setupRankModalListeners();
  setupProfileModals();

  safeAddEventListener(chatInput, "keydown", (event) => {
    const suggestionsVisible = !mentionSuggestions.classList.contains("hidden");

    if (suggestionsVisible) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        navigateMentionSuggestions(event.key);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const selected = mentionSuggestions.querySelector(
          ".mention-item.selected"
        );
        if (selected) {
          event.preventDefault();
          selectMention(selected.dataset.nickname);
          return;
        }
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      handleChatInput(chatInput.value.trim());
      chatInput.value = "";
      event.preventDefault();
    }

    if (event.key === "Escape") {
      if (suggestionsVisible) {
        hideMentionSuggestions();
      } else if (replyContext) {
        cancelReply();
      }
    }
  });

  safeAddEventListener(chatInput, "input", handleMentionInput);
  safeAddEventListener(chatInput, "blur", () => {
    // Hide suggestions with a small delay to allow click events to register
    setTimeout(hideMentionSuggestions, 200);
  });

  // --- NOVO: Lógica do botão de rolar para baixo ---
  safeAddEventListener(chatLog, "scroll", () => {
    if (!chatLog || !scrollToBottomBtn) return;
    // Mostra o botão se o usuário rolou mais de 300px para cima
    const isScrolledUp =
      chatLog.scrollHeight - chatLog.scrollTop > chatLog.clientHeight + 300;
    scrollToBottomBtn.classList.toggle("hidden", !isScrolledUp);
  });

  safeAddEventListener(scrollToBottomBtn, "click", () => {
    if (chatLog) {
      chatLog.scrollTo({
        top: chatLog.scrollHeight,
        behavior: "smooth",
      });
    }
  });
  function navigateMentionSuggestions(key) {
    const items = Array.from(
      mentionSuggestions.querySelectorAll(".mention-item")
    );
    if (items.length === 0) return;

    let currentIndex = items.findIndex((item) =>
      item.classList.contains("selected")
    );

    if (key === "ArrowDown") {
      currentIndex = (currentIndex + 1) % items.length;
    } else if (key === "ArrowUp") {
      currentIndex = (currentIndex - 1 + items.length) % items.length;
    }

    items.forEach((item, index) => {
      item.classList.toggle("selected", index === currentIndex);
      if (index === currentIndex) {
        item.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function selectMention(nickname) {
    const currentValue = chatInput.value;
    const atIndex = currentValue.lastIndexOf("@");
    const newValue = `${currentValue.substring(0, atIndex)}@${nickname} `;
    chatInput.value = newValue;
    chatInput.focus();
    hideMentionSuggestions();
  }

  function handleMentionInput(event) {
    const text = event.target.value;
    const cursorPos = event.target.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch && currentRoom !== "home" && currentRoom !== "login") {
      const searchTerm = atMatch[1].toLowerCase();
      getRoomMembers(currentRoom, (response) => {
        if (response && response.success) {
          const members = [...response.online, ...response.offline];
          const filtered = members.filter((m) =>
            m.nickname.toLowerCase().startsWith(searchTerm)
          );
          renderMentionSuggestions(filtered);
        }
      });
    } else {
      hideMentionSuggestions();
    }
  }

  function renderMentionSuggestions(members) {
    if (members.length === 0) {
      hideMentionSuggestions();
      return;
    }
    mentionSuggestions.innerHTML = members
      .map(
        (member) => `
      <div class="mention-item" data-nickname="${member.nickname}">
        <img src="${member.profilePicture}" class="mention-item-pic" alt="${member.nickname}">
        <span class="mention-item-name">${member.nickname}</span>
      </div>
    `
      )
      .join("");
    mentionSuggestions.querySelectorAll(".mention-item").forEach((item) => {
      item.addEventListener("click", () =>
        selectMention(item.dataset.nickname)
      );
    });
    mentionSuggestions.classList.remove("hidden");
  }

  safeAddEventListener(menuToggleBtn, "keydown", (event) => {
    if (event.key === "Enter") {
      document.body.classList.toggle("sidebar-open");
    }
  });

  if (menuToggleBtn) {
    menuToggleBtn.onclick = () => {
      // Fecha a lista de membros se estiver aberta
      document.body.classList.remove("members-sidebar-open");
      document.body.classList.toggle("sidebar-open");
    };
  }

  if (membersToggleBtn) {
    membersToggleBtn.onclick = () => {
      document.body.classList.toggle("members-sidebar-open");
    };
  }

  if (membersSidebarCloseBtn) {
    membersSidebarCloseBtn.onclick = () => {
      document.body.classList.remove("members-sidebar-open");
    };
  }

  if (undockBtn) {
    undockBtn.onclick = async () => {
      try {
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tabs || tabs.length === 0) {
          throw new Error("Nenhuma aba ativa encontrada.");
        }
        await chrome.sidePanel.open({ tabId: tabs[0].id });
        window.close();
      } catch (error) {
        console.error("Erro ao destacar:", error.message);
        addMessageToLog({
          type: "event",
          event: "system",
          text: `Erro ao abrir painel: ${error.message}`,
        });
      }
    };
  }

  if (replyCancelBtn) replyCancelBtn.onclick = () => cancelReply();
  if (resizeHandle) setupResizeListeners();
}

// --- COMMAND HANDLER ---
function handleChatInput(text) {
  if (currentRoom === "login") {
    handleLoginCommands(text);
    return;
  }

  if (!text) {
    if (replyContext) cancelReply();
    return;
  }

  if (text === "/help") {
    if (chatLog) chatLog.innerHTML = "";
    if (currentRoom === "home") showWelcomeHelp();
    else if (currentRoom === "login") showLoginHelp();
    else
      addMessageToLog({
        type: "event",
        event: "system",
        text: "Comandos: `/leave`, `/rank`, `/profile`, `/help`",
      });
    return;
  }

  if (text === "/profile") {
    if (profilePicInput) profilePicInput.value = userProfilePicture;
    if (profileBioInput) profileBioInput.value = userBio;
    profileEditModal.classList.remove("hidden");
    return;
  }

  if (text.startsWith("/nick ")) {
    addMessageToLog({
      type: "event",
      event: "system",
      text: `Comando /nick desabilitado por enquanto.`,
    });
    return;
  }
  if (text === "/rank") {
    rankModal.classList.remove("hidden");
    rankNameInput.value = (userRank && userRank.name) || "";
    rankColorInput.value = (userRank && userRank.color) || "#FFFFFF";
    rankOutlineInput.value = (userRank && userRank.outline) || "#000000";
    rankOutlineWidth.value = (userRank && userRank.outlineWidth) || 1;
    rankShineInput.value = (userRank && userRank.shine) || "#000000";
    rankAnimateShine.checked = (userRank && userRank.animateShine) || false;
    previewNick.textContent = ` ${userNickname}:`;
    updatePreview();
    return;
  }
  if (text === "/logout") {
    chrome.runtime.sendMessage({ type: "LOGOUT" }, (response) => {
      if (response && response.success) showLoginScreen();
      else
        addMessageToLog({
          type: "event",
          event: "system",
          text: `Erro ao deslogar.`,
        });
    });
    return;
  }

  if (currentRoom === "home") {
    if (text.startsWith("/")) {
      const parts = text.split(" ");
      const command = parts[0];
      const subCommand = parts[1];
      const roomName = parts[2];
      const password = parts[3];
      if (command === "/room") {
        if (!subCommand) {
          addMessageToLog({
            type: "event",
            event: "system",
            text: "Usage: /room <join|create> <name> <password>",
          });
          return;
        }
        if (!roomName) {
          addMessageToLog({
            type: "event",
            event: "system",
            text: `Usage: /room ${subCommand} <name> <password>`,
          });
          return;
        }
        if (!password) {
          addMessageToLog({
            type: "event",
            event: "system",
            text: "Password required.",
          });
          return;
        }
        if (subCommand === "join") handleJoinRoom(roomName, password);
        else if (subCommand === "create") handleCreateRoom(roomName, password);
        else
          addMessageToLog({
            type: "event",
            event: "system",
            text: "Use /room <join|create> ...",
          });
      } else if (text === "/leave") {
        addMessageToLog({
          type: "event",
          event: "system",
          text: "Você não pode sair do /home.",
        });
      } else {
        addMessageToLog({
          type: "event",
          event: "system",
          text: "Comando desconhecido. Use /help.",
        });
      }
    } else {
      addMessageToLog({
        type: "event",
        event: "system",
        text: "Você está no /home. Use `/room join ...` ou `/help`.",
      });
    }
    return;
  }

  // Sending message in a room (not home/login)
  const messageData = {
    type: "chat",
    userId: userId,
    nickname: userNickname,
    rank: userRank,
    text: text,
    profilePicture: userProfilePicture,
    timestamp: Date.now(),
  };

  if (replyContext) {
    messageData.replyTo = replyContext.data;
    cancelReply();
  }

  chrome.runtime.sendMessage({
    type: "SEND_MESSAGE",
    roomName: currentRoom,
    message: messageData,
  });
}

// --- LOGIN COMMANDS ---
function handleLoginCommands(text) {
  const parts = text.split(" ");
  const command = parts[0];

  if (command === "/help") {
    if (chatLog) chatLog.innerHTML = "";
    showLoginHelp();
    return;
  }

  if (command === "/login") {
    const nick = parts[1];
    const pass = parts[2];
    if (!nick || !pass) {
      addMessageToLog({
        type: "event",
        event: "system",
        text: "Usage: /login <nick> <password>",
      });
      return;
    }
    addMessageToLog({
      type: "event",
      event: "system",
      text: `Logando como ${nick}...`,
    });
    chrome.runtime.sendMessage(
      { type: "LOGIN", nick: nick, pass: pass },
      (response) => {
        if (response && response.success) {
          addMessageToLog({
            type: "event",
            event: "system",
            text: "Sucesso! Carregando chat...",
          });
          showChatScreen(
            response.userInfo,
            response.joinedRooms,
            response.messages,
            response.unreadCounts
          );
        } else {
          addMessageToLog({
            type: "event",
            event: "system",
            text: `Erro: ${response?.error || "Falha no login"}`,
          });
        }
      }
    );
    return;
  } else if (command === "/reg") {
    const nick = parts[1];
    const pass = parts[2];
    const confirm = parts[3];
    if (!nick || !pass || !confirm) {
      addMessageToLog({
        type: "event",
        event: "system",
        text: "Usage: /reg <nick> <password> <confirm_password>",
      });
      return;
    }
    addMessageToLog({
      type: "event",
      event: "system",
      text: `Registrando ${nick}...`,
    });
    chrome.runtime.sendMessage(
      { type: "REGISTER", nick: nick, pass: pass, confirm: confirm },
      (response) => {
        if (response && response.success) {
          addMessageToLog({
            type: "event",
            event: "system",
            text: "Registro completo! Logando...",
          });
          showChatScreen(response.userInfo, response.joinedRooms, {}, {});
        } else {
          addMessageToLog({
            type: "event",
            event: "system",
            text: `Erro: ${response?.error || "Falha no registro"}`,
          });
        }
      }
    );
    return;
  }

  addMessageToLog({
    type: "event",
    event: "system",
    text: "Comando desconhecido. Use /login, /reg, ou /help.",
  });
}

// --- ROOM ACTIONS ---
function handleJoinRoom(roomName, password) {
  addMessageToLog({
    type: "event",
    event: "system",
    text: `Entrando em ${roomName}...`,
  });
  chrome.runtime.sendMessage(
    { type: "JOIN_ROOM", roomName: roomName.toLowerCase(), password: password },
    (response) => {
      if (response && response.success) {
        if (!joinedRooms.includes(response.roomName)) {
          joinedRooms.push(response.roomName);
          renderRoomList();
        }
        messageCache[response.roomName] = response.history || [];
        switchRoom(response.roomName);
      } else {
        addMessageToLog({
          type: "event",
          event: "system",
          text: `Error: ${response?.error || "Unknown"}`,
        });
      }
    }
  );
}

function handleCreateRoom(roomName, password) {
  addMessageToLog({
    type: "event",
    event: "system",
    text: `Criando ${roomName}...`,
  });
  chrome.runtime.sendMessage(
    {
      type: "CREATE_ROOM",
      roomName: roomName.toLowerCase(),
      password: password,
    },
    (response) => {
      if (response && response.success) {
        if (!joinedRooms.includes(response.roomName)) {
          joinedRooms.push(response.roomName);
          renderRoomList();
        }
        messageCache[response.roomName] = response.history || [];
        switchRoom(response.roomName);
      } else {
        addMessageToLog({
          type: "event",
          event: "system",
          text: `Error: ${response?.error || "Unknown"}`,
        });
      }
    }
  );
}

// --- REPLY HANDLERS ---
function setReplyContext(messageData) {
  const previewText =
    (messageData.text || "").length > 40
      ? messageData.text.substring(0, 40) + "..."
      : messageData.text || "";
  replyContext = {
    type: "reply",
    data: {
      id: messageData.id, // Salva o ID da mensagem original
      nickname: messageData.nickname,
      rank: messageData.rank,
      text: previewText,
    },
  };
  if (replyPreviewBarContent) {
    // Clear the content first
    replyPreviewBarContent.innerHTML = "";

    // Create a span for the nickname
    const nicknameSpan = document.createElement("span");
    nicknameSpan.classList.add("nick");
    nicknameSpan.textContent = messageData.nickname;

    // Apply rank styling to the nickname
    if (messageData.rank) {
      applyRankStyles(nicknameSpan, messageData.rank);
    }

    // Create the text content
    const textSpan = document.createElement("span");
    textSpan.textContent = `: ${previewText}`;

    // Append everything
    replyPreviewBarContent.appendChild(
      document.createTextNode("Respondendo a ")
    );
    replyPreviewBarContent.appendChild(nicknameSpan);
    replyPreviewBarContent.appendChild(textSpan);

    replyPreviewBar.style.display = "block";
  }
  if (chatInput) chatInput.focus();
}

function hideMentionSuggestions() {
  if (mentionSuggestions) mentionSuggestions.classList.add("hidden");
}

function cancelReply() {
  replyContext = null;
  if (replyPreviewBar) replyPreviewBar.style.display = "none";
}

// --- FORWARD MODAL ---
let forwardFrame = null;
function setupForwardModal() {
  if (!forwardFrame) {
    forwardFrame = document.createElement("iframe");
    forwardFrame.id = "forward-frame";
    forwardFrame.src = chrome.runtime.getURL("forward.html");
    forwardFrame.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 400px;
      height: 500px;
      max-width: 90vw;
      max-height: 90vh;
      border: none;
      z-index: 1000;
      display: none;
    `;
    document.body.appendChild(forwardFrame);

    window.addEventListener("message", (event) => {
      const payload = event.data || {};
      const type = payload.type;
      const data = payload.data || {};
      if (type === "FORWARD_MESSAGE") {
        const { message, targetRoom, comment } = data;
        sendForwardedMessage(targetRoom, message, comment);
      } else if (type === "CLOSE_FORWARD") {
        closeForwardModal();
      }
    });
  }
}

function openForwardModal(messageData) {
  const fullMessage =
    messageCache[currentRoom]?.find((m) => m.id === messageData.id) ||
    messageData;
  if (!fullMessage) {
    console.error("Could not find the full message to forward in the cache.");
    addMessageToLog({
      type: "event",
      event: "system",
      text: "Error: Could not forward this message.",
    });
    return;
  }
  if (!forwardFrame) setupForwardModal();
  if (forwardFrame) {
    forwardFrame.style.display = "block";
    forwardFrame.contentWindow.postMessage(
      {
        type: "FORWARD_INIT",
        data: {
          message: fullMessage,
          rooms: joinedRooms,
          userNickname: userNickname,
        },
      },
      "*"
    );
  }
}

function closeForwardModal() {
  if (forwardFrame) {
    forwardFrame.style.display = "none";
    messageToForward = null;
  }
}

function sendForwardedMessage(targetRoomName, originalMessage, comment = "") {
  if (!originalMessage) return;
  const forwardContent =
    originalMessage.isForward && originalMessage.forwardedFrom
      ? originalMessage.forwardedFrom
      : { text: originalMessage.text || "" };
  const messageData = {
    type: "chat",
    nickname: userNickname,
    rank: userRank,
    text: comment
      ? `${comment}\n\u21AA [Forwarded] ${forwardContent.text}`
      : `\u21AA [Forwarded] ${forwardContent.text}`,
    isForward: true,
    forwardedFrom: forwardContent,
    timestamp: Date.now(),
  };
  chrome.runtime.sendMessage({
    type: "SEND_MESSAGE",
    roomName: targetRoomName,
    message: messageData,
  });
  closeForwardModal();
  addMessageToLog({
    type: "event",
    event: "system",
    text: `Message forwarded to <strong>${targetRoomName}</strong>!`,
  });
}

// --- RANK STYLES & PREVIEW ---
function applyRankStyles(element, rankData) {
  if (!element) return;
  const defaults = {
    name: "USER",
    color: "#FFFFFF",
    outline: "#000000",
    outlineWidth: 0,
    shine: "",
    animateShine: false,
  };
  const rank = { ...defaults, ...(rankData || {}) };

  // Create wrapper for rank badge + name if element is a simple text node
  // If element contains markup, we replace its innerHTML safely.
  const originalText = (element.textContent || "").replace(/^\s*/, "");
  const outlineWidth = parseInt(rank.outlineWidth) || 0;
  const badge = document.createElement("span");
  badge.className = "rank-span";
  badge.textContent = `[${(rank.name || "USER").toString().substring(0, 10)}]`;
  badge.style.background = "rgba(255,255,255,0.03)";
  badge.style.color = rank.color || "#fff";
  badge.style.border =
    outlineWidth > 0
      ? `${outlineWidth}px solid ${rank.outline || "#000"}`
      : "none";
  badge.style.boxShadow = rank.shine ? `0 0 8px ${rank.shine}` : "none";
  badge.style.marginRight = "6px";
  badge.style.padding = "2px 6px";
  badge.style.borderRadius = "6px";
  badge.style.fontWeight = "700";
  badge.style.fontSize = "12px";

  // build container
  const container = document.createElement("span");
  container.className = "rank-wrapper";
  container.appendChild(badge);

  const nameNode = document.createElement("span");
  nameNode.textContent = ` ${originalText}`;
  nameNode.className = "rank-name-inline";
  nameNode.style.color = "#e6e6e6";
  container.appendChild(nameNode);

  // replace element content
  element.innerHTML = "";
  element.appendChild(container);

  if (rank.animateShine) {
    container.classList.add("animated-shine");
    container.style.setProperty("--shine-color", rank.shine || "#ffffff");
  } else {
    container.classList.remove("animated-shine");
    container.style.removeProperty("--shine-color");
  }
}

function updatePreview() {
  const rankData = {
    name:
      (rankNameInput && rankNameInput.value.toUpperCase().substring(0, 10)) ||
      "RANK",
    color: (rankColorInput && rankColorInput.value) || "#FFFFFF",
    outline: (rankOutlineInput && rankOutlineInput.value) || "#000000",
    outlineWidth: (rankOutlineWidth && parseInt(rankOutlineWidth.value)) || 0,
    shine: (rankShineInput && rankShineInput.value) || "",
    animateShine: (rankAnimateShine && rankAnimateShine.checked) || false,
  };
  if (previewNick) previewNick.textContent = ` ${userNickname}:`;
  if (previewNick) applyRankStyles(previewNick, rankData);
}

// --- PROFILE MODALS ---
function setupProfileModals() {
  if (profileEditCloseBtn)
    profileEditCloseBtn.onclick = () =>
      profileEditModal.classList.add("hidden");
  if (profileViewCloseBtn)
    profileViewCloseBtn.onclick = () =>
      profileViewModal.classList.add("hidden");

  // Profile picture modal listeners
  const profilePicModalCloseBtn = document.getElementById(
    "profile-pic-modal-close-btn"
  );
  const profilePicModal = document.getElementById("profile-pic-modal");
  const profilePicModalOverlay = document.getElementById(
    "profile-pic-modal-overlay"
  );

  if (profilePicModalCloseBtn) {
    profilePicModalCloseBtn.onclick = closeProfilePicModal;
  }

  if (profilePicModalOverlay) {
    profilePicModalOverlay.onclick = (e) => {
      // Only close if clicking on the overlay, not on the image
      if (e.target === profilePicModalOverlay) {
        closeProfilePicModal();
      }
    };
  }

  if (profileSaveButton)
    profileSaveButton.onclick = () => {
      const newBio = profileBioInput.value;
      const newPic = profilePicInput.value;

      userBio = newBio;
      userProfilePicture = newPic;

      chrome.runtime.sendMessage(
        {
          type: "UPDATE_USER_INFO",
          info: { bio: newBio, profilePicture: newPic },
        },
        (response) => {
          if (response && response.success) {
            addMessageToLog({
              type: "event",
              event: "system",
              text: "Perfil salvo!",
            });
            profileEditModal.classList.add("hidden");
          } else {
            addMessageToLog({
              type: "event",
              event: "system",
              text: "Erro ao salvar perfil.",
            });
          }
        }
      );
    };

  if (profileDmButton)
    profileDmButton.onclick = () => {
      const targetNickname = profileDmButton.dataset.nickname;
      if (targetNickname) {
        const dmRoomName = [userNickname, targetNickname].sort().join("_&_");
        addMessageToLog({
          type: "event",
          event: "system",
          text: `Iniciando DM com ${targetNickname}...`,
        });
        handleJoinRoom(dmRoomName, "DM_PASSWORD");
        profileViewModal.classList.add("hidden");
      }
    };
}

// --- RANK MODAL LOGIC ---
function setupRankModalListeners() {
  if (rankModalCloseBtn)
    rankModalCloseBtn.onclick = () => {
      rankModal.classList.add("hidden");
    };
  const elements = [
    rankNameInput,
    rankColorInput,
    rankOutlineInput,
    rankOutlineWidth,
    rankShineInput,
    rankAnimateShine,
  ];
  elements.forEach((el) => {
    if (!el) return;
    const eventType =
      el.type === "checkbox" || el.type === "number" ? "change" : "input";
    el.addEventListener(eventType, updatePreview);
    if (el.hasAttribute && el.hasAttribute("data-coloris")) {
      el.addEventListener("change", updatePreview);
    }
  });

  // Adiciona listener para o slider de largura da borda
  if (rankOutlineWidth) {
    const widthValueSpan = document.getElementById("rank-outline-width-value");
    rankOutlineWidth.addEventListener("input", () => {
      if (widthValueSpan) {
        widthValueSpan.textContent = `${rankOutlineWidth.value}px`;
      }
    });
  }

  if (saveRankButton)
    saveRankButton.onclick = () => {
      const newRank = {
        name:
          (rankNameInput.value || "").toUpperCase().substring(0, 10) || "USER",
        color: rankColorInput.value,
        outline: rankOutlineInput.value,
        outlineWidth: parseInt(rankOutlineWidth.value) || 0,
        shine: rankShineInput.value,
        animateShine: rankAnimateShine.checked,
        creator: userNickname,
      };
      userRank = newRank;
      chrome.runtime.sendMessage({
        type: "UPDATE_USER_INFO",
        info: { rank: newRank },
      });
      if (newRank.name !== "USER" && newRank.name !== "GUEST") {
        chrome.runtime.sendMessage({ type: "SAVE_PUBLIC_RANK", rank: newRank });
      }
      rankModal.classList.add("hidden");
      addMessageToLog({
        type: "event",
        event: "system",
        text: `Rank set to [${newRank.name}]!`,
      });
    };

  if (createTabBtn)
    createTabBtn.onclick = () => {
      createTab.classList.remove("hidden");
      browseTab.classList.add("hidden");
      createTabBtn.classList.add("active");
      browseTabBtn.classList.remove("active");
    };
  if (browseTabBtn)
    browseTabBtn.onclick = () => {
      browseTab.classList.remove("hidden");
      createTab.classList.add("hidden");
      browseTabBtn.classList.add("active");
      createTabBtn.classList.remove("active");
      loadPublicRanks();
    };

  function loadPublicRanks() {
    if (!rankListDivBrowse) return;
    rankListDivBrowse.innerHTML = "Loading...";
    chrome.runtime.sendMessage({ type: "GET_PUBLIC_RANKS" }, (response) => {
      if (response && response.success) {
        allPublicRanks = response.ranks || [];
        displayRankPage(1);
      } else {
        console.error("Error getting ranks:", response?.error);
        rankListDivBrowse.innerHTML = "Error loading ranks.";
      }
    });
  }

  function displayRankPage(page) {
    currentPage = page;
    if (!rankListDivBrowse) return;
    rankListDivBrowse.innerHTML = "";
    const totalPages = Math.ceil(allPublicRanks.length / ranksPerPage);
    if (totalPages === 0) {
      pageIndicator.textContent = "Page 1 / 1";
      prevPageBtn.disabled = true;
      nextPageBtn.disabled = true;
      rankListDivBrowse.innerHTML = "No public ranks found.";
      return;
    }
    const startIndex = (page - 1) * ranksPerPage;
    const endIndex = startIndex + ranksPerPage;
    const ranksToShow = allPublicRanks.slice(startIndex, endIndex);
    ranksToShow.forEach((rank) => {
      const item = document.createElement("div");
      item.classList.add("rank-list-item");
      const preview = document.createElement("span");
      preview.classList.add("rank-preview");
      applyRankStyles(preview, rank);
      item.appendChild(preview);
      item.appendChild(
        document.createTextNode(` (by ${rank.creator || "Unknown"})`)
      );
      item.onclick = () => {
        userRank = rank;
        chrome.runtime.sendMessage({
          type: "UPDATE_USER_INFO",
          info: { rank: rank },
        });
        rankModal.classList.add("hidden");
        addMessageToLog({
          type: "event",
          event: "system",
          text: `Rank set to [${rank.name}]!`,
        });
      };
      rankListDivBrowse.appendChild(item);
    });
    pageIndicator.textContent = `Page ${page} / ${totalPages}`;
    prevPageBtn.disabled = page === 1;
    nextPageBtn.disabled = page === totalPages;
  }

  if (prevPageBtn)
    prevPageBtn.onclick = () => {
      if (currentPage > 1) displayRankPage(currentPage - 1);
    };
  if (nextPageBtn)
    nextPageBtn.onclick = () => {
      const totalPages = Math.ceil(allPublicRanks.length / ranksPerPage);
      if (currentPage < totalPages) displayRankPage(currentPage + 1);
    };
}

// --- RESIZE LOGIC ---
function setupResizeListeners() {
  if (!resizeHandle) return;
  resizeHandle.addEventListener("mousedown", startResize);
}
function startResize(e) {
  isResizing = true;
  startX = e.clientX;
  startY = e.clientY;
  startWidth =
    parseInt(document.body.style.width, 10) || document.body.clientWidth;
  startHeight =
    parseInt(document.body.style.height, 10) || document.body.clientHeight;
  document.addEventListener("mousemove", doResize);
  document.addEventListener("mouseup", stopResize);
  document.body.style.userSelect = "none";
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
  document.removeEventListener("mousemove", doResize);
  document.removeEventListener("mouseup", stopResize);
  document.body.style.userSelect = "auto";
  const finalWidth = parseInt(document.body.style.width, 10);
  const finalHeight = parseInt(document.body.style.height, 10);
  chrome.storage.sync.set({ popupWidth: finalWidth, popupHeight: finalHeight });
}
function applySize(width, height) {
  document.body.style.width = `${width}px`;
  document.body.style.height = `${height}px`;
}

// --- STARTUP ---
window.onload = () => {
  console.log("Window loaded. Initializing popup/sidebar...");
  const isPopup = document.body.classList.contains("is-popup");
  if (isPopup || !isPopup) {
    // always initialize in this build
    initializePopup();
  }
};

function initializePopup() {
  initialize();
  if (typeof Coloris === "function") {
    Coloris({
      themeMode: "dark",
      alpha: false,
      parent: "body",
      swatches: [
        "#FFFFFF",
        "#000000",
        "#FF5555",
        "#55FFFF",
        "#55FF55",
        "#FFFF55",
        "#FF55FF",
        "#007bff",
      ],
    });
  } else {
    console.error("Coloris library not loaded correctly.");
  }
}
