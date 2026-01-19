// --- IMPORT FIREBASE ---
importScripts("firebase-app-compat.js");
importScripts("firebase-database-compat.js");
importScripts("firebase-auth-compat.js");

// --- FIREBASE CONFIG ---
// (Keep your existing config here)
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
const auth = firebase.auth();
const ranksRef = database.ref('public_ranks');
const usersRef = database.ref('users');

let activeListeners = {};
let messageCache = {};
let onlineUsersCache = {}; // <--- NEW: Cache for online users
let userInfo = { nickname: "Guest", userId: null, rank: null };
let joinedRooms = []; // <--- Track which rooms the user is in
const publicRooms = ['study', 'gaming', 'books', 'movies', 'fps'];
let userInfoLoaded = false;
let initializationPromise = null;
const LEAVE_CLEANUP_DELAY = 150;

// --- KEEP SERVICE WORKER ALIVE ---
try {
  chrome.alarms.create("keepAlive", { periodInMinutes: 0.25 });
  chrome.alarms.onAlarm.addListener((alarm) => { /* ... */ });
} catch (e) {
  console.error("Error setting up alarms:", e);
}

// --- OPEN SIDE PANEL ON ICON CLICK ---
try {
  if (chrome && chrome.action && chrome.action.onClicked) {
    chrome.action.onClicked.addListener((tab) => {
      chrome.sidePanel.open({ windowId: tab.windowId });
    });
  }
} catch (e) {
  console.error("Error setting up action listener:", e);
}


// --- FIREBASE PRESENCE ---
function setupPresence(roomName, user) {
  if (!user || !user.userId) return;
  const presenceRef = database.ref(`rooms/${roomName}/presence/${user.userId}`);
  // We save an object now, so we can expand later (e.g., status: 'busy')
  presenceRef.set({ nickname: user.nickname, rank: user.rank || null }).catch(e => console.error(`[Presence] Error:`, e));
  presenceRef.onDisconnect().remove().catch(e => console.error(`[Presence] Error onDisconnect:`, e));
}

// --- HELPER: SETUP JOIN ---
async function setupJoin(roomName) {
  // 1. Clean up old listeners
  if (activeListeners[roomName]?.messages || activeListeners[roomName]?.presence) {
    try {
        if (activeListeners[roomName].messages) database.ref(`rooms/${roomName}/messages`).off('child_added', activeListeners[roomName].messages);
        if (activeListeners[roomName].presence) database.ref(`rooms/${roomName}/presence`).off('value', activeListeners[roomName].presence); // Changed to 'value'
    } catch(e) { console.error(`[Join] Detach error:`, e); }
    delete activeListeners[roomName];
  }

  activeListeners[roomName] = {};

  try { await initializationPromise; } catch (error) { return Promise.reject(error); }

  const roomChatRef = database.ref(`rooms/${roomName}/messages`);
  const roomPresenceRef = database.ref(`rooms/${roomName}/presence`);

  // 2. Message Listener (Same as before)
  const messageListener = roomChatRef.on('child_added', (snapshot) => {
    const message = snapshot.val(); message.id = snapshot.key;
    if (!messageCache[roomName]) messageCache[roomName] = [];
    if (!messageCache[roomName].some(m => m.id === message.id)) {
        if (messageCache[roomName].length > 50) messageCache[roomName].shift();
        messageCache[roomName].push(message);
    }
    chrome.runtime.sendMessage({ type: "NEW_MESSAGE", roomName: roomName, message: message }).catch(() => {});
  });
  activeListeners[roomName].messages = messageListener;

  // 3. NEW: Presence Listener (Listen to ALL changes in user list)
  const presenceListener = roomPresenceRef.on('value', (snapshot) => {
       const usersData = snapshot.val() || {};
       const userList = [];
       
       // Convert object to array
       Object.keys(usersData).forEach(uid => {
           const val = usersData[uid];
           // Handle legacy format (where value was just a string) or new format (object)
           const nick = (typeof val === 'object') ? val.nickname : val; 
           const rank = (typeof val === 'object') ? val.rank : null;
           userList.push({ userId: uid, nickname: nick, rank: rank });
       });

       // Update Cache
       onlineUsersCache[roomName] = userList;

       // Notify Popup
       chrome.runtime.sendMessage({ 
           type: "UPDATE_USER_LIST", 
           roomName: roomName, 
           users: userList 
       }).catch(() => {});
       
   });
   activeListeners[roomName].presence = presenceListener;

   // 4. Join Actions
   if (userInfo.nickname && userInfo.userId) {
       setupPresence(roomName, userInfo);
       return roomChatRef.push({ type: 'event', event: 'join', nickname: userInfo.nickname, timestamp: firebase.database.ServerValue.TIMESTAMP });
   } else {
       return Promise.reject(new Error("User info missing"));
   }
}

// --- MAIN MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
      switch (request.type) {
          case "GET_ALL_DATA":
              try { 
                  await initializationPromise; 
                  // Send messages AND online users
                  sendResponse({ 
                      messages: messageCache, 
                      onlineUsers: onlineUsersCache, // <--- Sending this to popup
                      userInfo: userInfo,
                      joinedRooms: joinedRooms  // <--- Include joined rooms
                  }); 
              }
              catch (error) { sendResponse({ messages: {}, userInfo: { nickname: "Error", userId: "error" }, joinedRooms: [] }); }
              break;

case "REGISTER":
    try {
        const { nick, pass, confirm } = request;
        if (pass !== confirm) {
            sendResponse({ success: false, error: "Passwords don't match." });
            return;
        }
        const userCredential = await auth.createUserWithEmailAndPassword(`${nick}@lilchat.app`, pass);
        const user = userCredential.user;
        userInfo = { userId: user.uid, nickname: nick, rank: null };
        joinedRooms = []; // Reset joined rooms for new user
        activeListeners = {}; // Clear listeners
        messageCache = {}; // Clear cache
        onlineUsersCache = {};
        await usersRef.child(user.uid).set(userInfo);
        chrome.storage.sync.set(userInfo);
        sendResponse({ success: true, userInfo: userInfo, joinedRooms: [], messages: {}, unreadCounts: {} });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
    break;

case "LOGIN":
    try {
        const { nick, pass } = request;
        const userCredential = await auth.signInWithEmailAndPassword(`${nick}@lilchat.app`, pass);
        const user = userCredential.user;
        const userSnapshot = await usersRef.child(user.uid).once('value');
        
        if (!userSnapshot.exists()) {
            sendResponse({ success: false, error: "User data not found in database." });
            return;
        }
        
        userInfo = userSnapshot.val();
        
        // Ensure userInfo has required fields
        if (!userInfo.nickname) {
            userInfo.nickname = nick;
        }
        if (!userInfo.userId) {
            userInfo.userId = user.uid;
        }
        
        joinedRooms = []; // Reset joined rooms for new login session
        activeListeners = {}; // Clear old listeners
        messageCache = {}; // Clear old cache
        onlineUsersCache = {};
        chrome.storage.sync.set(userInfo);
        sendResponse({ success: true, userInfo: userInfo, joinedRooms: [], messages: {}, unreadCounts: {} });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
    break;

case "LOGOUT":
    try {
        await auth.signOut();
        userInfo = { nickname: "Guest", userId: null, rank: null };
        joinedRooms = []; // Clear joined rooms on logout
        activeListeners = {}; // Clear all listeners
        messageCache = {}; // Clear message cache
        onlineUsersCache = {}; // Clear online users cache
        chrome.storage.sync.clear();
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
    break;

          case "GET_ROOM_MEMBERS":
            try {
                const { roomName } = request;
                const presenceRef = database.ref(`rooms/${roomName}/presence`);
                const allUsersWithRoomRef = usersRef.orderByChild(`rooms/${roomName}`).equalTo(true);

                const [presenceSnapshot, allUsersSnapshot] = await Promise.all([
                    presenceRef.once("value"),
                    allUsersWithRoomRef.once("value"),
                ]);

                const onlineUserIds = new Set();
                if (presenceSnapshot.exists()) {
                    Object.keys(presenceSnapshot.val()).forEach(uid => onlineUserIds.add(uid));
                }
                
                const online = [];
                const offline = [];
                const defaultRank = { name: "USER", color: "#FFFFFF" };
                const defaultProfilePicture = "https://i.imgur.com/83Z2n8w.png";

                if (allUsersSnapshot.exists()) {
                    allUsersSnapshot.forEach((userSnapshot) => {
                        const userData = userSnapshot.val();
                        // The user's key is their ID in this version of the schema
                        const userId = userSnapshot.key; 
                        
                        const memberData = {
                            nickname: userData.nickname || "Unknown",
                            rank: userData.rank || defaultRank,
                            profilePicture: userData.profilePicture || defaultProfilePicture,
                        };

                        if (onlineUserIds.has(userId)) {
                            online.push(memberData);
                        } else {
                            offline.push(memberData);
                        }
                    });
                }
                sendResponse({ success: true, online, offline });
            } catch (e) {
                console.error("Error in GET_ROOM_MEMBERS:", e);
                sendResponse({ success: false, error: e.message });
            }
            break;

          // ... (Keep UNDOCK_TO_SIDEBAR, JOIN_ROOM, CREATE_ROOM logic exactly as they were) ...
          case "UNDOCK_TO_SIDEBAR":
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  if (tabs.length === 0) { sendResponse({success: false}); return; }
                  chrome.sidePanel.open({ tabId: tabs[0].id }).then(() => sendResponse({success: true}));
              });
              return true;

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
                          if (!joinedRooms.includes(roomName)) {
                              joinedRooms.push(roomName);
                          }
                          sendResponse({ success: true, roomName: roomName }); 
                      } else { 
                          sendResponse({ success: false, error: "Room doesn't exist." }); 
                      } 
                  } else { 
                      const meta = snapshot.val(); 
                      if (meta.password === password) { 
                          await setupJoin(roomName);
                          if (!joinedRooms.includes(roomName)) {
                              joinedRooms.push(roomName);
                          }
                          sendResponse({ success: true, roomName: roomName }); 
                      } else { 
                          sendResponse({ success: false, error: "Wrong password." }); 
                      } 
                  }
              } catch (e) { 
                  console.error("Error in JOIN_ROOM:", e); 
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
                      await newRoomMetaRef.set({ password: newPassword, creator: userInfo.nickname }); 
                      await setupJoin(newRoomName);
                      if (!joinedRooms.includes(newRoomName)) {
                          joinedRooms.push(newRoomName);
                      }
                      sendResponse({ success: true, roomName: newRoomName }); 
                  }
              } catch (e) { 
                  console.error("Error in CREATE_ROOM:", e); 
                  sendResponse({ success: false, error: e.message || "Init failed." }); 
              }
              break;

          case "LEAVE_ROOM":
              try {
                  const { roomName: roomToLeave } = request;
                  if (activeListeners[roomToLeave]) {
                      // Remove presence manually
                      database.ref(`rooms/${roomToLeave}/presence/${userInfo.userId}`).remove();
                      // Detach listeners
                      if (activeListeners[roomToLeave].messages) database.ref(`rooms/${roomToLeave}/messages`).off('child_added', activeListeners[roomToLeave].messages);
                      if (activeListeners[roomToLeave].presence) database.ref(`rooms/${roomToLeave}/presence`).off('value', activeListeners[roomToLeave].presence);
                      
                      delete activeListeners[roomToLeave];
                      delete messageCache[roomToLeave];
                      delete onlineUsersCache[roomToLeave];
                      
                      // Remove from joinedRooms
                      joinedRooms = joinedRooms.filter(r => r !== roomToLeave);
                      
                      sendResponse({ success: true, roomName: roomToLeave });
                  } else {
                      sendResponse({ success: false });
                  }
              } catch (e) {
                  console.error("Error in LEAVE_ROOM:", e);
                  sendResponse({ success: false, error: e.message });
              }
              break;

          case "SEND_MESSAGE":
              try {
                  const { roomName: msgRoom, message } = request; 
                  const roomRef = activeListeners[msgRoom]?.messages ? database.ref(`rooms/${msgRoom}/messages`) : null;
                  
                  if (roomRef) { 
                      const messageToSend = { 
                          ...message, 
                          timestamp: firebase.database.ServerValue.TIMESTAMP 
                      }; 
                      roomRef.push(messageToSend)
                          .then(() => { sendResponse({ success: true }); })
                          .catch(e => sendResponse({ success: false, error: e.message })); 
                  } else { 
                      sendResponse({ success: false, error: "Not in room" }); 
                  }
              } catch (e) {
                  console.error("Error in SEND_MESSAGE:", e);
                  sendResponse({ success: false, error: e.message });
              }
              break;

          case "UPDATE_USER_INFO":
              try {
                  const oldNickname = userInfo.nickname; 
                  userInfo = { ...userInfo, ...request.info }; 
                  
                  // Update presence in ALL active rooms
                  if (userInfo.userId) { 
                      for (const rName in activeListeners) { 
                          database.ref(`rooms/${rName}/presence/${userInfo.userId}`).set({
                              nickname: userInfo.nickname, 
                              rank: userInfo.rank || null
                          }); 
                      } 
                  } 
                  chrome.storage.sync.set({ nickname: userInfo.nickname, rank: userInfo.rank });
                  usersRef.child(userInfo.userId).update({ 
                      nickname: userInfo.nickname, 
                      rank: userInfo.rank || null 
                  });
                  sendResponse({ success: true, userInfo: userInfo });
              } catch (e) {
                  console.error("Error in UPDATE_USER_INFO:", e);
                  sendResponse({ success: false, error: e.message });
              }
              break;
              
          case "GET_PUBLIC_RANKS":
              ranksRef.once('value', (snapshot) => { const ranksData = snapshot.val(); sendResponse({ success: true, ranks: ranksData ? Object.values(ranksData) : [] }); }, (error) => { sendResponse({ success: false, error: error.message }); });
              break;
          case "SAVE_PUBLIC_RANK":
              const { rank } = request; if (rank && rank.name) { ranksRef.child(rank.name).set(rank).then(() => sendResponse({ success: true })); } else { sendResponse({ success: false }); }
              break;
          default:
              sendResponse({ success: false, error: "Unknown type" });
      }
  })();
  return true;
});

// --- INITIALIZATION ---
function initialize() {
    initializationPromise = new Promise((resolve) => {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                const userSnapshot = await usersRef.child(user.uid).once('value');
                if (userSnapshot.exists()) {
                    userInfo = userSnapshot.val();
                    chrome.storage.sync.set(userInfo);
                } else {
                    // This case should ideally not happen if registration is done correctly
                    userInfo = { userId: user.uid, nickname: "NewUser", rank: null };
                    await usersRef.child(user.uid).set(userInfo);
                }
            } else {
                userInfo = { nickname: "Guest", userId: null, rank: null };
                chrome.storage.sync.clear();
            }
            resolve();
        });
    });
}
initialize();