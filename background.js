// --- IMPORT FIREBASE ---
importScripts("firebase-app-compat.js");
importScripts("firebase-database-compat.js");

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

// CORREÇÃO: Inicializar userInfo com valores padrão ANTES de qualquer uso
let userInfo = { 
  nickname: "Guest", 
  userId: null, 
  rank: { name: 'USER', color: '#FFFFFF', outline: '#000000', outlineWidth: 1, shine: '#000000', animateShine: false } 
};

let activeListeners = {};
let messageCache = {};
const publicRooms = ['study', 'gaming', 'books', 'movies', 'fps'];
let userInfoLoaded = false;
let initializationPromise = null;
const LEAVE_CLEANUP_DELAY = 150;

// --- KEEP SERVICE WORKER ALIVE ---
chrome.alarms.create("keepAlive", { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener((alarm) => { 
  console.log("[BG] Keep-alive alarm triggered"); 
});

// --- FIREBASE PRESENCE ---
function setupPresence(roomName, user) { 
  if (!user || !user.userId) {
    console.warn(`[Presence ${roomName}] User info missing, cannot setup presence`);
    return; 
  }
  const presenceRef = database.ref(`rooms/${roomName}/presence/${user.userId}`);
  presenceRef.set(user.nickname);
  presenceRef.onDisconnect().remove();
}

// --- HELPER: SETUP JOIN ---
async function setupJoin(roomName) {
  if (activeListeners[roomName]?.messages || activeListeners[roomName]?.presence) { 
    console.warn(`[Join ${roomName}] Listeners exist. Forcing detach.`); 
    try { 
      if (activeListeners[roomName].messages) { 
        database.ref(`rooms/${roomName}/messages`).off('child_added', activeListeners[roomName].messages); 
      } 
      if (activeListeners[roomName].presence) { 
        database.ref(`rooms/${roomName}/presence`).off('child_removed', activeListeners[roomName].presence); 
      } 
    } catch(e) { 
      console.error(`[Join ${roomName}] Error force detach:`, e); 
    } 
    delete activeListeners[roomName]; 
  }
  
  const roomChatRef = database.ref(`rooms/${roomName}/messages`); 
  const roomPresenceRef = database.ref(`rooms/${roomName}/presence`);
  activeListeners[roomName] = {};
  
  try { 
    await initializationPromise; 
  } catch (error) { 
    console.error("Init failed before joining:", error); 
    return Promise.reject(error); 
  }
  
  // CORREÇÃO: Verificar se userInfo está definido antes de usar
  const messageListener = roomChatRef.on('child_added', (snapshot) => { 
    const message = snapshot.val(); 
    message.id = snapshot.key;
    
    if (!message.id) {
      console.warn(`[MsgListener ${roomName}] Message without ID:`, message);
      return;
    }
    
    if (!messageCache[roomName]) { 
      messageCache[roomName] = []; 
    } 
    
    if (!messageCache[roomName].some(m => m.id === message.id)) { 
      if (messageCache[roomName].length > 50) { 
        messageCache[roomName].shift(); 
      } 
      messageCache[roomName].push(message); 
      
      try {
        chrome.runtime.sendMessage({ 
          type: "NEW_MESSAGE", 
          roomName: roomName, 
          message: message 
        }).catch(error => { 
          console.warn(`[MsgListener ${roomName}] Error sending message to popup:`, error); 
        }); 
      } catch (error) {
        console.error(`[MsgListener ${roomName}] Error in message processing:`, error);
      }
    } 
  }, error => { 
    console.error(`[MsgListener ${roomName}] Error:`, error); 
  });
  
  activeListeners[roomName].messages = messageListener;
  
  const presenceListener = roomPresenceRef.on('child_removed', (snapshot) => { 
    const disconnectedUserId = snapshot.key; 
    const disconnectedNickname = snapshot.val(); 
    
    // CORREÇÃO: Verificar se userInfo está definido
    if (disconnectedUserId && disconnectedUserId !== (userInfo?.userId) && disconnectedNickname) { 
      roomChatRef.push({ 
        type: 'event', 
        event: 'leave', 
        nickname: disconnectedNickname, 
        timestamp: firebase.database.ServerValue.TIMESTAMP 
      }).catch(error => console.error(`[Presence ${roomName}] Failed disconnect push:`, error)); 
    } 
  }, error => { 
    console.error(`[PresenceListener ${roomName}] Error:`, error); 
  });
  
  activeListeners[roomName].presence = presenceListener;
  
  // CORREÇÃO: Verificação mais robusta do userInfo
  if (userInfo && userInfo.nickname && userInfo.userId) { 
    setupPresence(roomName, userInfo); 
    return roomChatRef.push({ 
      type: 'event', 
      event: 'join', 
      nickname: userInfo.nickname, 
      timestamp: firebase.database.ServerValue.TIMESTAMP 
    }); 
  } else { 
    console.error(`[Join ${roomName}] User info missing or incomplete:`, userInfo); 
    return Promise.reject(new Error("User info missing or incomplete")); 
  }
}

// --- MAIN MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
      try {
          switch (request.type) {
              case "GET_ALL_DATA":
                  try { 
                    await initializationPromise; 
                    sendResponse({ 
                      messages: messageCache, 
                      userInfo: userInfo 
                    }); 
                  } catch (error) { 
                    console.error("[BG] Error in GET_ALL_DATA:", error);
                    sendResponse({ 
                      messages: {}, 
                      userInfo: { 
                        nickname: "Error", 
                        userId: "error", 
                        rank: null 
                      } 
                    }); 
                  }
                  break;
              
              case "JOIN_ROOM":
                  try {
                      await initializationPromise;
                      const { roomName, password } = request; 
                      const isPublic = publicRooms.includes(roomName); 
                      const roomMetaRef = database.ref(`rooms/${roomName}/meta`);
                      const snapshot = await roomMetaRef.once('value');
                      
                      if (!snapshot.exists()) {
                          if (isPublic && password === '123') {
                              await roomMetaRef.set({ password: "123", creator: "System" });
                              await setupJoin(roomName);
                              sendResponse({ success: true, roomName: roomName });
                          } else { 
                            sendResponse({ success: false, error: "Room doesn't exist." }); 
                          }
                      } else {
                          const meta = snapshot.val();
                          if (meta.password === password) {
                              await setupJoin(roomName);
                              sendResponse({ success: true, roomName: roomName });
                          } else { 
                            sendResponse({ success: false, error: "Wrong password." }); 
                          }
                      }
                  } catch (e) { 
                    console.error("[BG] Error in JOIN_ROOM:", e);
                    sendResponse({ success: false, error: e.message || "Init failed." }); 
                  }
                  break;
                  
              case "CREATE_ROOM":
                  try {
                      await initializationPromise;
                      const { roomName: newRoomName, password: newPassword } = request; 
                      if (publicRooms.includes(newRoomName)) { 
                        sendResponse({ success: false, error: `'${newRoomName}' is public.` }); 
                        break; 
                      }
                      
                      const newRoomMetaRef = database.ref(`rooms/${newRoomName}/meta`);
                      const snapshot = await newRoomMetaRef.once('value');
                      
                      if (snapshot.exists()) { 
                        sendResponse({ success: false, error: "Room exists." });
                      } else {
                          await newRoomMetaRef.set({ 
                            password: newPassword, 
                            creator: userInfo?.nickname || "Unknown" 
                          });
                          await setupJoin(newRoomName);
                          sendResponse({ success: true, roomName: newRoomName });
                      }
                  } catch (e) { 
                    console.error("[BG] Error in CREATE_ROOM:", e);
                    sendResponse({ success: false, error: e.message || "Init failed." }); 
                  }
                  break;
                  
              case "LEAVE_ROOM":
                  const { roomName: roomToLeave } = request; 
                  const roomListeners = activeListeners[roomToLeave]; 
                  const chatRef = database.ref(`rooms/${roomToLeave}/messages`); 
                  const presenceRef = database.ref(`rooms/${roomToLeave}/presence`);
                  
                  if (roomListeners && userInfo?.userId) {
                    Promise.allSettled([ 
                      chatRef.push({ 
                        type: 'event', 
                        event: 'leave', 
                        nickname: userInfo.nickname, 
                        timestamp: firebase.database.ServerValue.TIMESTAMP 
                      }), 
                      database.ref(`rooms/${roomToLeave}/presence/${userInfo.userId}`).remove() 
                    ]).then((results) => {
                        results.forEach((result, index) => { 
                          if (result.status === 'rejected') { 
                            console.error(`[BG LEAVE ${roomToLeave}] Step ${index + 1} failed:`, result.reason); 
                          } 
                        });
                        
                        if (roomListeners.messages) { 
                          try { 
                            chatRef.off('child_added', roomListeners.messages); 
                          } catch (e) { 
                            console.error(`[BG LEAVE ${roomToLeave}] Error detach msg:`, e); 
                          } 
                        }
                        
                        if (roomListeners.presence) { 
                          try { 
                            presenceRef.off('child_removed', roomListeners.presence); 
                          } catch (e) { 
                            console.error(`[BG LEAVE ${roomToLeave}] Error detach pres:`, e); 
                          } 
                        }
                        
                        setTimeout(() => { 
                          delete activeListeners[roomToLeave]; 
                          delete messageCache[roomToLeave]; 
                          sendResponse({ success: true, roomName: roomToLeave }); 
                        }, LEAVE_CLEANUP_DELAY);
                    });
                  } else if (!roomListeners) { 
                    sendResponse({ success: false, error: "Not in room" });
                  } else { 
                    sendResponse({ success: false, error: "User ID not loaded." }); 
                  }
                  break;
                  
              case "SEND_MESSAGE":
                  const { roomName: msgRoom, message } = request; 
                  const roomRef = activeListeners[msgRoom]?.messages ? database.ref(`rooms/${msgRoom}/messages`) : null;
                  
                  if (roomRef) { 
                    const messageToSend = { ...message, timestamp: firebase.database.ServerValue.TIMESTAMP }; 
                    roomRef.push(messageToSend).then(() => { 
                      sendResponse({ success: true }); 
                    }).catch(e => {
                      console.error("[BG] Error sending message:", e);
                      sendResponse({ success: false, error: e.message });
                    }); 
                  } else { 
                    sendResponse({ success: false, error: "Not in room" }); 
                  }
                  break;
                  
              case "UPDATE_USER_INFO":
                  const oldNickname = userInfo.nickname; 
                  userInfo = { ...userInfo, ...request.info }; 
                  
                  if (request.info.nickname && request.info.nickname !== oldNickname && userInfo.userId) { 
                    for (const roomName in activeListeners) { 
                      database.ref(`rooms/${roomName}/presence/${userInfo.userId}`).set(userInfo.nickname); 
                    } 
                  } 
                  
                  chrome.storage.sync.set({ nickname: userInfo.nickname, rank: userInfo.rank }, () => { 
                    if (chrome.runtime.lastError) console.error("Error saving updated info:", chrome.runtime.lastError); 
                  }); 
                  
                  if (userInfo.userId) { 
                    usersRef.child(userInfo.userId).update({ 
                      nickname: userInfo.nickname, 
                      rank: userInfo.rank || null 
                    }).catch(error => console.error("Error updating FB profile:", error)); 
                  } 
                  
                  sendResponse({ success: true, userInfo: userInfo });
                  break;
                  
              case "GET_PUBLIC_RANKS":
                  ranksRef.once('value', (snapshot) => { 
                    const ranksData = snapshot.val(); 
                    sendResponse({ 
                      success: true, 
                      ranks: ranksData ? Object.values(ranksData) : [] 
                    }); 
                  }, (error) => { 
                    console.error("[BG] Error getting public ranks:", error);
                    sendResponse({ success: false, error: error.message }); 
                  });
                  break;
                  
              case "SAVE_PUBLIC_RANK":
                  const { rank } = request; 
                  if (rank && rank.name && rank.name !== 'USER' && rank.name !== 'GUEST') { 
                    ranksRef.child(rank.name).set(rank).then(() => { 
                      sendResponse({ success: true }); 
                    }).catch(e => {
                      console.error("[BG] Error saving public rank:", e);
                      sendResponse({ success: false, error: e.message });
                    }); 
                  } else { 
                    sendResponse({ success: false, error: "Invalid rank data." }); 
                  }
                  break;
                  
              case "openSidePanel":
                  console.log("[BG] Recebido pedido para abrir o Side Panel.");
                  try {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tab) {
                        await chrome.sidePanel.open({ tabId: tab.id });
                        sendResponse({ success: true });
                    } else {
                        console.error("[BG] Nenhuma aba ativa encontrada.");
                        sendResponse({ success: false });
                    }
                  } catch (error) {
                    console.error("[BG] Error opening side panel:", error);
                    sendResponse({ success: false, error: error.message });
                  }
                  break;

              case "isSidePanelOpen":
                  try {
                    const options = await chrome.sidePanel.getOptions({ tabId: sender.tab.id });
                    sendResponse({ isOpen: options.enabled });
                  } catch (error) {
                    console.error("[BG] Error checking side panel:", error);
                    sendResponse({ isOpen: false });
                  }
                  break;
                  
              default:
                  console.warn("[BG] Unknown message type:", request.type);
                  sendResponse({ success: false, error: "Unknown message type" });
                  break;
          }
      } catch (error) {
          console.error("[BG] Unhandled error in message listener:", error);
          sendResponse({ success: false, error: "Internal server error" });
      }
  })();
  return true; // Keep message port open
});

// --- ON STARTUP ---
function initialize() {
    console.log("[BG] Initializing...");
    initializationPromise = new Promise((resolve, reject) => {
        chrome.storage.sync.get(['userId', 'nickname', 'rank'], (result) => {
            if (chrome.runtime.lastError) { 
                console.error("[BG] Error getting sync data:", chrome.runtime.lastError); 
                // CORREÇÃO: Garantir que userInfo tenha valores padrão mesmo em caso de erro
                userInfo.userId = "guest-error-" + Date.now(); 
                userInfo.nickname = "Guest";
                userInfoLoaded = true; 
                resolve(); // Não rejeitar para não quebrar a inicialização
                return; 
            }
            
            let needsFirebaseUpdate = false; 
            let initialSaveData = {};
            
            if (result.userId) { 
                console.log("[BG] Found existing userId:", result.userId); 
                userInfo.userId = result.userId; 
                if (result.nickname) userInfo.nickname = result.nickname; 
                if (result.rank) userInfo.rank = result.rank;
            } else {
                console.log("[BG] No userId found. Generating..."); 
                const newUserId = "user-" + Math.random().toString(36).substring(2, 10); 
                userInfo.userId = newUserId; 
                userInfo.nickname = result.nickname || ("Guest_" + newUserId.substring(0, 4)); 
                userInfo.rank = result.rank || { name: 'USER', color: '#FFFFFF', outline: '#000000', outlineWidth: 1, shine: '#000000', animateShine: false };
                initialSaveData.userId = userInfo.userId; 
                initialSaveData.nickname = userInfo.nickname; 
                initialSaveData.rank = userInfo.rank;
                needsFirebaseUpdate = true;
            }
            
            if (Object.keys(initialSaveData).length > 0) {
                chrome.storage.sync.set(initialSaveData, () => {
                    if (chrome.runtime.lastError) { 
                        console.error("[BG] Error saving initial user info:", chrome.runtime.lastError); 
                    } else { 
                        console.log("[BG] Saved initial user info:", initialSaveData); 
                    }
                    userInfoLoaded = true;
                    
                    if (needsFirebaseUpdate && userInfo.userId) {
                        console.log(`[BG] Saving initial profile to Firebase for ${userInfo.userId}`);
                        usersRef.child(userInfo.userId).set({ 
                            userId: userInfo.userId, 
                            nickname: userInfo.nickname, 
                            rank: userInfo.rank 
                        }).then(resolve).catch(error => { 
                            console.error("[BG] Error saving initial FB profile:", error); 
                            resolve(); // Não rejeitar para não quebrar a inicialização
                        });
                    } else { 
                        resolve(); 
                    }
                });
            } else {
                usersRef.child(userInfo.userId).update({ 
                    nickname: userInfo.nickname, 
                    rank: userInfo.rank 
                })
                .then(() => { 
                    userInfoLoaded = true; 
                    resolve(); 
                }).catch(error => { 
                    console.error("[BG] Error updating FB profile on init:", error); 
                    resolve(); // Não rejeitar para não quebrar a inicialização
                });
            }
        });
    });
    
    initializationPromise.then(() => { 
        console.log("[BG] User info loaded/initialized:", userInfo); 
    }).catch(error => { 
        console.error("[BG] Initialization failed:", error); 
    });
}

// Inicializar imediatamente
initialize();