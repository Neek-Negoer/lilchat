// --- IMPORT FIREBASE ---
importScripts("firebase-app-compat.js");
importScripts("firebase-database-compat.js");
importScripts("firebase-auth-compat.js");

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyC2VTY92muqSxy8YefrWUUW-gJG6E97hGk",
  authDomain: "lilchat-64af5.firebaseapp.com",
  projectId: "lilchat-64af5",
  storageBucket: "lilchat-64af5.firebasestorage.app",
  messagingSenderId: "615855326129",
  appId: "1:1234567890:web:980e3799b7c8bb1047b390",
  databaseURL: "https://lilchat-64af5-default-rtdb.firebaseio.com/"
};

// --- GLOBAL STATE ---
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const ranksRef = database.ref('public_ranks');
const usersRef = database.ref('users');

let userInfo = { 
  nickname: null, 
  userId: null, 
  rank: null,
  bio: "", // NOVO
  profilePicture: "" // NOVO
};
let activeListeners = {};
let messageCache = {};
let unreadCounts = {};
const publicRooms = ['study', 'gaming', 'books', 'movies', 'fps'];
let initializationPromise = null;
const LEAVE_CLEANUP_DELAY = 150;
const defaultRank = { name: 'USER', color: '#FFFFFF', outline: '#000000', outlineWidth: 1, shine: '#000000', animateShine: false };
const defaultProfilePicture = "https://i.imgur.com/83Z2n8w.png"; // NOVO: Foto padrão

// --- KEEP SERVICE WORKER ALIVE ---
chrome.alarms.create("keepAlive", { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener((alarm) => { /* ... */ });

// --- NOVO HELPER: ATUALIZA O BADGE DO ÍCONE ---
function updateTotalBadgeCount() {
  const total = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  if (total > 0) {
    chrome.action.setBadgeText({ text: total.toString() });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// --- ATUALIZADO HELPER: BUSCAR HISTÓRICO ---
async function fetchRoomHistory(roomName) {
  if (messageCache[roomName] && messageCache[roomName].length > 0) {
    return messageCache[roomName];
  }
  const roomChatRef = database.ref(`rooms/${roomName}/messages`);
  const snapshot = await roomChatRef.limitToLast(100).once('value');
  const messages = [];
  if (snapshot.exists()) {
    snapshot.forEach(childSnapshot => {
      const message = childSnapshot.val();
      message.id = childSnapshot.key;
      messages.push(message);
    });
  }
  messageCache[roomName] = messages;
  return messages;
}

// --- FIREBASE PRESENCE (ATUALIZADO) ---
function setupPresence(roomName, user) {
  if (!user || !user.userId) return;
  const presenceRef = database.ref(`rooms/${roomName}/presence/${user.userId}`);
  presenceRef.set(user.nickname).catch(e => console.error(`[Presence ${roomName}] Error set presence:`, e));
  // presenceRef.onDisconnect().remove().catch(e => console.error(`[Presence ${roomName}] Error onDisconnect:`, e)); // Desativado
}

// --- HELPER: SETUP JOIN (ATUALIZADO) ---
async function setupJoin(roomName, announce = false) {
  if (!userInfo.userId) return Promise.reject("Não está logado");
  const roomChatRef = database.ref(`rooms/${roomName}/messages`);
  const roomPresenceRef = database.ref(`rooms/${roomName}/presence`);
  
  if (activeListeners[roomName]?.messages) {
    return Promise.resolve();
  }
  activeListeners[roomName] = {};
  
  const messageListener = roomChatRef.limitToLast(100).on('child_added', (snapshot) => {
    const message = snapshot.val(); message.id = snapshot.key;
    if (!messageCache[roomName]) { messageCache[roomName] = []; }
    
    if (!messageCache[roomName].some(m => m.id === message.id)) { 
        if (messageCache[roomName].length > 100) { messageCache[roomName].shift(); }
        messageCache[roomName].push(message);
        
        if (message.nickname !== userInfo.nickname) {
            unreadCounts[roomName] = (unreadCounts[roomName] || 0) + 1;
            updateTotalBadgeCount();
        }
        
        chrome.runtime.sendMessage({ type: "NEW_MESSAGE", roomName: roomName, message: message }).catch(error => { /* Ignore */ });
    }
  }, error => { console.error(`[MsgListener ${roomName}] Error:`, error); });
  activeListeners[roomName].messages = messageListener;

  const presenceListener = roomPresenceRef.on('child_removed', (snapshot) => {
       // const disconnectedUserId = snapshot.key; const disconnectedNickname = snapshot.val();
       // Anúncios de "leave" por desconexão desativados
   }, error => { console.error(`[PresenceListener ${roomName}] Error:`, error); });
   activeListeners[roomName].presence = presenceListener;
   
   setupPresence(roomName, userInfo);
   
   if (announce) {
     return roomChatRef.push({ type: 'event', event: 'join', nickname: userInfo.nickname, timestamp: firebase.database.ServerValue.TIMESTAMP });
   } else {
     return Promise.resolve();
   }
}

// --- HELPER: LOGOUT (ATUALIZADO) ---
async function performLogout() {
  console.log(`[BG] Deslogando ${userInfo.nickname}...`);
  for (const roomName in activeListeners) {
    if (userInfo.userId) {
      database.ref(`rooms/${roomName}/presence/${userInfo.userId}`).remove();
    }
    const roomListeners = activeListeners[roomName];
    if (roomListeners.messages) { database.ref(`rooms/${roomName}/messages`).off('child_added', roomListeners.messages); }
    if (roomListeners.presence) { database.ref(`rooms/${roomName}/presence`).off('child_removed', roomListeners.presence); }
  }
  activeListeners = {};
  messageCache = {};
  userInfo = { nickname: null, userId: null, rank: null, bio: "", profilePicture: "" }; // Reseta o perfil
  unreadCounts = {};
  updateTotalBadgeCount();
  await chrome.storage.sync.remove('loggedInUser');
  console.log("[BG] Logout completo.");
  return true;
}

// --- MAIN MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
      // Comandos que podem ser executados ANTES de logar
      switch (request.type) {
          case "GET_ALL_DATA":
              try {
                  await initializationPromise;
                  sendResponse({ 
                      messages: messageCache, 
                      userInfo: userInfo, 
                      joinedRooms: Object.keys(activeListeners),
                      unreadCounts: unreadCounts
                  });
              }
              catch (error) { sendResponse({ messages: {}, userInfo: userInfo, joinedRooms: [], unreadCounts: {} }); }
              return true;
          
          case "REGISTER":
              try {
                  const { nick, pass, confirm } = request;
                  if (pass !== confirm) { sendResponse({ success: false, error: "As senhas não coincidem." }); return; }
                  if (pass.length < 4) { sendResponse({ success: false, error: "A senha deve ter pelo menos 4 caracteres." }); return; }
                  if (nick.length < 3 || nick.length > 12) { sendResponse({ success: false, error: "O nick deve ter entre 3 e 12 caracteres." }); return; }
                  
                  const userNode = usersRef.child(nick.toLowerCase());
                  const snapshot = await userNode.once('value');
                  
                  if (snapshot.exists()) {
                      sendResponse({ success: false, error: "Este nick já está em uso." });
                  } else {
                      const newUserId = "user-" + Math.random().toString(36).substring(2, 10);
                      
                      // --- MUDANÇA AQUI: Adiciona bio e pic ---
                      await userNode.set({ 
                          userId: newUserId, 
                          password: pass,
                          rank: defaultRank,
                          rooms: {},
                          bio: "", // Bio padrão
                          profilePicture: defaultProfilePicture // Pic padrão
                      });
                      
                      userInfo = { nickname: nick, userId: newUserId, rank: defaultRank, bio: "", profilePicture: defaultProfilePicture };
                      await chrome.storage.sync.set({ loggedInUser: nick });
                      sendResponse({ success: true, userInfo: userInfo, joinedRooms: [], unreadCounts: {} });
                  }
              } catch (e) { sendResponse({ success: false, error: e.message }); }
              return true;
              
          case "LOGIN":
              try {
                  const { nick, pass } = request;
                  const userNode = usersRef.child(nick.toLowerCase());
                  const snapshot = await userNode.once('value');
                  if (!snapshot.exists()) { sendResponse({ success: false, error: "Nick ou senha inválidos." }); return; }
                  
                  const userData = snapshot.val();
                  if (userData.password === pass) {
                      // --- MUDANÇA AQUI: Carrega bio e pic ---
                      userInfo = { 
                          nickname: nick, 
                          userId: userData.userId, 
                          rank: userData.rank || defaultRank,
                          bio: userData.bio || "",
                          profilePicture: userData.profilePicture || defaultProfilePicture
                      };
                      await chrome.storage.sync.set({ loggedInUser: nick });
                      
                      const roomsSnapshot = await userNode.child('rooms').once('value');
                      let joinedRooms = [];
                      if (roomsSnapshot.exists()) {
                          const roomsToJoin = roomsSnapshot.val();
                          joinedRooms = Object.keys(roomsToJoin);
                          await Promise.all(joinedRooms.map(async (roomName) => {
                              await fetchRoomHistory(roomName);
                              await setupJoin(roomName, false); // Entra silenciosamente
                          }));
                      }
                      
                      unreadCounts = {};
                      updateTotalBadgeCount();
                      
                      sendResponse({ 
                          success: true, 
                          userInfo: userInfo, 
                          joinedRooms: joinedRooms, 
                          messages: messageCache,
                          unreadCounts: unreadCounts
                      });
                  } else {
                      sendResponse({ success: false, error: "Nick ou senha inválidos." });
                  }
              } catch (e) { sendResponse({ success: false, error: e.message }); }
              return true;
      }
      
      // --- CHECAGEM DE LOGIN ---
      if (!userInfo.nickname || !userInfo.userId) {
          sendResponse({ success: false, error: "Você precisa estar logado. Use /login" });
          return true;
      }

      switch (request.type) {
          case "MARK_ROOM_AS_READ":
              if (unreadCounts[request.roomName]) {
                  delete unreadCounts[request.roomName];
                  updateTotalBadgeCount();
              }
              sendResponse({ success: true });
              break;

          // --- NOVO CASE: BUSCAR MEMBROS DA SALA (ONLINE/OFFLINE) ---
          case "GET_ROOM_MEMBERS":
              try {
                  const { roomName } = request;
                  const presenceRef = database.ref(`rooms/${roomName}/presence`);
                  const allUsersWithRoomRef = usersRef.orderByChild(`rooms/${roomName}`).equalTo(true);

                  const [presenceSnapshot, allUsersSnapshot] = await Promise.all([
                      presenceRef.once('value'),
                      allUsersWithRoomRef.once('value')
                  ]);

                  const onlineNicks = presenceSnapshot.exists() ? Object.values(presenceSnapshot.val()) : [];
                  const onlineNickSet = new Set(onlineNicks.map(n => n.toLowerCase()));
                  
                  const online = [];
                  const offline = [];

                  if (allUsersSnapshot.exists()) {
                      allUsersSnapshot.forEach(userSnapshot => {
                          const userData = userSnapshot.val();
                          const userNick = userSnapshot.key; // O nick é a chave
                          const memberData = { nickname: userNick, rank: userData.rank || defaultRank };
                          if (onlineNickSet.has(userNick.toLowerCase())) online.push(memberData);
                          else offline.push(memberData);
                      });
                  }
                  sendResponse({ success: true, online, offline });
              } catch (e) { sendResponse({ success: false, error: e.message }); }
              break;

          // --- NOVO CASE: BUSCAR PERFIL DE OUTRO USUÁRIO ---
          case "GET_USER_PROFILE":
              try {
                  const nick = request.nickname.toLowerCase();
                  const userNode = usersRef.child(nick);
                  const snapshot = await userNode.once('value');
                  if(snapshot.exists()) {
                      const data = snapshot.val();
                      sendResponse({
                          success: true,
                          nickname: request.nickname, // Retorna o nick com casing original (do request)
                          rank: data.rank || defaultRank,
                          bio: data.bio || "Este usuário ainda não escreveu uma bio.",
                          profilePicture: data.profilePicture || defaultProfilePicture
                      });
                  } else {
                      sendResponse({ success: false, error: "Usuário não encontrado."});
                  }
              } catch (e) { sendResponse({ success: false, error: e.message }); }
              break;

          case "JOIN_ROOM":
              try {
                  const { roomName, password } = request;
                  
                  if (password === "DM_PASSWORD" && roomName.includes('_&_')) {
                      const history = await fetchRoomHistory(roomName); 
                      await setupJoin(roomName, true); // Entra anunciando
                      const names = roomName.split('_&_');
                      const user1 = names[0].toLowerCase();
                      const user2 = names[1].toLowerCase();
                      await usersRef.child(user1).child('rooms').child(roomName).set(true);
                      await usersRef.child(user2).child('rooms').child(roomName).set(true);
                      sendResponse({ success: true, roomName: roomName, history: history });
                      return;
                  }
                  
                  const isPublic = publicRooms.includes(roomName); const roomMetaRef = database.ref(`rooms/${roomName}/meta`);
                  const snapshot = await roomMetaRef.once('value');
                  
                  if (!snapshot.exists()) {
                      if (isPublic && password === '123') {
                          await roomMetaRef.set({ password: "123", creator: "System" });
                          const history = await fetchRoomHistory(roomName); 
                          await setupJoin(roomName, true); 
                          await usersRef.child(userInfo.nickname.toLowerCase()).child('rooms').child(roomName).set(true);
                          sendResponse({ success: true, roomName: roomName, history: history });
                      } else { sendResponse({ success: false, error: "Room doesn't exist." }); }
                  } else {
                      const meta = snapshot.val();
                      if (meta.password === password) {
                          const history = await fetchRoomHistory(roomName);
                          await setupJoin(roomName, true); 
                          await usersRef.child(userInfo.nickname.toLowerCase()).child('rooms').child(roomName).set(true);
                          sendResponse({ success: true, roomName: roomName, history: history });
                      } else { sendResponse({ success: false, error: "Wrong password." }); }
                  }
              } catch (e) { console.error("Error in JOIN_ROOM:", e); sendResponse({ success: false, error: e.message }); }
              break;

          case "CREATE_ROOM":
              try {
                  const { roomName: newRoomName, password: newPassword } = request; if (publicRooms.includes(newRoomName)) { sendResponse({ success: false, error: `'${newRoomName}' is public.` }); break; }
                  const newRoomMetaRef = database.ref(`rooms/${newRoomName}/meta`);
                  const snapshot = await newRoomMetaRef.once('value');
                  if (snapshot.exists()) {
                      sendResponse({ success: false, error: "Room exists." });
                  } else {
                      await newRoomMetaRef.set({ password: newPassword, creator: userInfo.nickname });
                      const history = []; 
                      messageCache[newRoomName] = history;
                      await setupJoin(newRoomName, true);
                      await usersRef.child(userInfo.nickname.toLowerCase()).child('rooms').child(newRoomName).set(true);
                      sendResponse({ success: true, roomName: newRoomName, history: history });
                   }
              } catch (e) { console.error("Error in CREATE_ROOM:", e); sendResponse({ success: false, error: e.message }); }
              break;
              
          case "LEAVE_ROOM":
              const { roomName: roomToLeave } = request; const roomListeners = activeListeners[roomToLeave]; const chatRef = database.ref(`rooms/${roomToLeave}/messages`); const presenceRef = database.ref(`rooms/${roomToLeave}/presence`);
              if (roomListeners && userInfo.userId) {
                await usersRef.child(userInfo.nickname.toLowerCase()).child('rooms').child(roomToLeave).remove();
                if (roomToLeave.includes('_&_')) {
                    const names = roomToLeave.split('_&_');
                    const otherNick = names[0].toLowerCase() === userInfo.nickname.toLowerCase() ? names[1] : names[0];
                    await usersRef.child(otherNick.toLowerCase()).child('rooms').child(roomToLeave).remove();
                }
                await chatRef.push({ type: 'event', event: 'leave', nickname: userInfo.nickname, timestamp: firebase.database.ServerValue.TIMESTAMP });
                await database.ref(`rooms/${roomToLeave}/presence/${userInfo.userId}`).remove();
                if (roomListeners.messages) { try { chatRef.off('child_added', roomListeners.messages); } catch (e) { /*...*/ } }
                if (roomListeners.presence) { try { presenceRef.off('child_removed', roomListeners.presence); } catch (e) { /*...*/ } }
                setTimeout(() => { delete activeListeners[roomToLeave]; delete messageCache[roomToLeave]; sendResponse({ success: true, roomName: roomToLeave }); }, LEAVE_CLEANUP_DELAY);
              } else if (!roomListeners) { sendResponse({ success: false, error: "Not in room" });
              } else { sendResponse({ success: false, error: "User ID not loaded." }); }
              break;
          
          case "LOGOUT":
              await performLogout();
              sendResponse({ success: true });
              break;
          case "SEND_MESSAGE":
              const { roomName: msgRoom, message } = request; const roomRef = activeListeners[msgRoom]?.messages ? database.ref(`rooms/${msgRoom}/messages`) : null;
              if (roomRef) { const messageToSend = { ...message, timestamp: firebase.database.ServerValue.TIMESTAMP }; roomRef.push(messageToSend).then(() => { sendResponse({ success: true }); }).catch(e => sendResponse({ success: false, error: e.message })); } else { sendResponse({ success: false, error: "Not in room" }); }
              break;
              
          case "UPDATE_USER_INFO":
              // --- MUDANÇA AQUI: Salva rank, bio, E pic ---
              const updates = {};
              if (request.info.rank) {
                  userInfo.rank = request.info.rank;
                  updates.rank = userInfo.rank;
              }
              if (request.info.bio || request.info.bio === "") {
                  userInfo.bio = request.info.bio;
                  updates.bio = userInfo.bio;
              }
              if (request.info.profilePicture || request.info.profilePicture === "") {
                  userInfo.profilePicture = request.info.profilePicture;
                  updates.profilePicture = userInfo.profilePicture;
              }
              
              if (userInfo.nickname) { 
                  usersRef.child(userInfo.nickname.toLowerCase()).update(updates).catch(error => console.error("Error updating FB profile:", error));
              }
              sendResponse({ success: true, userInfo: userInfo });
              break;
              
          case "GET_PUBLIC_RANKS":
              ranksRef.once('value', (snapshot) => { const ranksData = snapshot.val(); sendResponse({ success: true, ranks: ranksData ? Object.values(ranksData) : [] }); }, (error) => { sendResponse({ success: false, error: error.message }); });
              break;
          case "SAVE_PUBLIC_RANK":
              const { rank } = request; if (rank && rank.name && rank.name !== 'USER' && rank.name !== 'GUEST') { ranksRef.child(rank.name).set(rank).then(() => { sendResponse({ success: true }); }).catch(e => sendResponse({ success: false, error: e.message })); } else { sendResponse({ success: false, error: "Invalid rank data." }); }
              break;
          default:
              sendResponse({ success: false, error: "Unknown message type" });
              break;
      }
  })();
  return true; // Keep message port open
});

// --- ON STARTUP (ATUALIZADO) ---
function initialize() {
    console.log("[BG] Initializing...");
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
    
    initializationPromise = new Promise((resolve, reject) => {
        chrome.storage.sync.get(['loggedInUser'], async (result) => {
            if (chrome.runtime.lastError) { console.error("[BG] Error getting sync data:", chrome.runtime.lastError); reject(chrome.runtime.lastError); return; }
            if (result.loggedInUser) {
                const loggedInNick = result.loggedInUser;
                const userNode = usersRef.child(loggedInNick.toLowerCase());
                const snapshot = await userNode.once('value');
                if (snapshot.exists()) {
                    const userData = snapshot.val();
                    // --- MUDANÇA AQUI: Carrega bio e pic ---
                    userInfo = { 
                        nickname: loggedInNick, 
                        userId: userData.userId, 
                        rank: userData.rank || defaultRank,
                        bio: userData.bio || "",
                        profilePicture: userData.profilePicture || defaultProfilePicture
                    };
                    console.log("[BG] User info loaded from Firebase:", userInfo);
                    
                    const roomsSnapshot = await userNode.child('rooms').once('value');
                    if (roomsSnapshot.exists()) {
                        const roomsToJoin = roomsSnapshot.val();
                        const roomNames = Object.keys(roomsToJoin);
                        console.log(`[BG] Re-joining ${roomNames.length} rooms...`);
                        await Promise.all(roomNames.map(async (roomName) => {
                            try {
                                await fetchRoomHistory(roomName); 
                                await setupJoin(roomName, false); // Entra silenciosamente
                                console.log(`[BG] Re-joined ${roomName}.`);
                            } catch (e) {
                                console.warn(`[BG] Error re-joining room ${roomName}:`, e.message);
                                await userNode.child('rooms').child(roomName).remove();
                            }
                        }));
                    }
                    resolve();
                } else {
                    console.warn(`[BG] User ${loggedInNick} in storage but not Firebase. Logging out.`);
                    await performLogout();
                    resolve();
                }
            } else {
                console.log("[BG] No user logged in.");
                resolve();
            }
        });
    });
    initializationPromise
        .then(() => { console.log("[BG] Initialization check complete. Current user:", userInfo.nickname); })
        .catch(error => { console.error("[BG] Initialization failed:", error); });
}

initialize();

chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  // Enable the side panel on all existing tabs
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      await chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: 'sidepanel.html',
        enabled: true
      });
    }
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});