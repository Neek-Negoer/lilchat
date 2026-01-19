// --- IMPORT FIREBASE ---
importScripts("firebase-app-compat.js");
importScripts("firebase-database-compat.js");

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
const ranksRef = database.ref('public_ranks');
const usersRef = database.ref('users');

let activeListeners = {};
let messageCache = {};
let onlineUsersCache = {}; // <--- NEW: Cache for online users
let userInfo = { nickname: "Guest", userId: null, rank: null };
const publicRooms = ['study', 'gaming', 'books', 'movies', 'fps'];
let userInfoLoaded = false;
let initializationPromise = null;
const LEAVE_CLEANUP_DELAY = 150;

// --- KEEP SERVICE WORKER ALIVE ---
chrome.alarms.create("keepAlive", { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener((alarm) => { /* ... */ });

// --- OPEN SIDE PANEL ON ICON CLICK ---
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ windowId: tab.windowId });
  });


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
                      userInfo: userInfo 
                  }); 
              }
              catch (error) { sendResponse({ messages: {}, userInfo: { nickname: "Error", userId: "error" } }); }
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
              // ... (Same as your previous file) ...
              // Copy the JOIN_ROOM logic from the previous file here or keep what you had
              // Just ensure it calls the updated setupJoin()
             try { await initializationPromise; const { roomName, password } = request; const isPublic = publicRooms.includes(roomName); const roomMetaRef = database.ref(`rooms/${roomName}/meta`); const snapshot = await roomMetaRef.once('value');
                if (!snapshot.exists()) { if (isPublic && password === '123') { await roomMetaRef.set({ password: "123", creator: "System" }); await setupJoin(roomName); sendResponse({ success: true, roomName: roomName }); } else { sendResponse({ success: false, error: "Room doesn't exist." }); } } else { const meta = snapshot.val(); if (meta.password === password) { await setupJoin(roomName); sendResponse({ success: true, roomName: roomName }); } else { sendResponse({ success: false, error: "Wrong password." }); } }
              } catch (e) { console.error("Error in JOIN_ROOM:", e); sendResponse({ success: false, error: e.message || "Init failed." }); }
              break;

          case "CREATE_ROOM":
               // ... (Same as previous file) ...
               try { await initializationPromise; const { roomName: newRoomName, password: newPassword } = request; if (publicRooms.includes(newRoomName)) { sendResponse({ success: false, error: `'${newRoomName}' is public.` }); break; } const newRoomMetaRef = database.ref(`rooms/${newRoomName}/meta`); const snapshot = await newRoomMetaRef.once('value');
                if (snapshot.exists()) { sendResponse({ success: false, error: "Room exists." }); } else { await newRoomMetaRef.set({ password: newPassword, creator: userInfo.nickname }); await setupJoin(newRoomName); sendResponse({ success: true, roomName: newRoomName }); }
              } catch (e) { console.error("Error in CREATE_ROOM:", e); sendResponse({ success: false, error: e.message || "Init failed." }); }
              break;

          case "LEAVE_ROOM":
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
                 sendResponse({ success: true, roomName: roomToLeave });
              } else {
                 sendResponse({ success: false });
              }
              break;

          case "SEND_MESSAGE":
              // ... (Same as previous) ...
              const { roomName: msgRoom, message } = request; const roomRef = activeListeners[msgRoom]?.messages ? database.ref(`rooms/${msgRoom}/messages`) : null;
              if (roomRef) { const messageToSend = { ...message, timestamp: firebase.database.ServerValue.TIMESTAMP }; roomRef.push(messageToSend).then(() => { sendResponse({ success: true }); }).catch(e => sendResponse({ success: false, error: e.message })); } else { sendResponse({ success: false, error: "Not in room" }); }
              break;

          case "UPDATE_USER_INFO":
             // ... (Same as previous) ...
              const oldNickname = userInfo.nickname; userInfo = { ...userInfo, ...request.info }; 
              // Update presence in ALL active rooms
              if (userInfo.userId) { 
                  for (const rName in activeListeners) { 
                      database.ref(`rooms/${rName}/presence/${userInfo.userId}`).set({nickname: userInfo.nickname, rank: userInfo.rank || null}); 
                  } 
              } 
              chrome.storage.sync.set({ nickname: userInfo.nickname, rank: userInfo.rank });
              usersRef.child(userInfo.userId).update({ nickname: userInfo.nickname, rank: userInfo.rank || null });
              sendResponse({ success: true, userInfo: userInfo });
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

// --- INITIALIZATION (Same as before) ---
function initialize() {
    initializationPromise = new Promise((resolve, reject) => {
        chrome.storage.sync.get(['userId', 'nickname', 'rank'], (result) => {
            if (!result.userId) {
                 const newUserId = "user-" + Math.random().toString(36).substring(2, 10);
                 userInfo = { userId: newUserId, nickname: "Guest_" + newUserId.substring(0, 4), rank: null };
                 chrome.storage.sync.set(userInfo);
                 usersRef.child(newUserId).set(userInfo);
            } else {
                 userInfo = result;
            }
            resolve();
        });
    });
}
initialize();