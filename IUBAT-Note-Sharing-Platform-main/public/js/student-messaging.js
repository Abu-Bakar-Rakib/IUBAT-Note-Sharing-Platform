/* ============================================================ */

/* Handles the Student Messaging page:                          */
/*  - Contact list rendering (same-department students)         */
/*  - Opening and sending messages in a chat window             */
/*  - Notification badge and dropdown                           */
/*  - Profile modal display                                     */
/*  - Logout and auth guard                                     */
/* All messages are stored in localStorage (client-side only).  */
/* ============================================================ */


const STORAGE_KEY  = 'ishare_announcements'; // Key for announcement data
const NOTES_KEY    = 'ishare_notes';          // Key for notes data
const DEPT_KEY     = 'ishare_departments';    // Key for department data
const NOTIF_KEY    = 'ishare_notifications';  // Key for notification data
const MESSAGES_KEY = 'ishare_messages';       // Key for all chat messages


/**
 * Escapes HTML special characters in a string to prevent XSS attacks.
 * Uses a temporary <div> element to leverage the browser's built-in escaping.
 * @param {string} text - Raw user-supplied text
 * @returns {string} - HTML-safe escaped string
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


/**
 * Converts a Unix timestamp (milliseconds) into a human-readable
 * relative time string (e.g. "5m ago", "2h ago", "3d ago").
 * Falls back to a short date string for messages older than 7 days.
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} - Formatted relative time string
 */
function formatTime(timestamp) {
    if (!timestamp) return '';
    const diff    = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1)  return 'Just now';
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24)   return hours + 'h ago';
    const days = Math.floor(hours / 24);
    if (days < 7)     return days + 'd ago';
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}



/** Returns the list of announcements from localStorage */
function getAnnouncements() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

/** Returns the list of notes from localStorage */
function getNotes() {
    try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); } catch { return []; }
}

/** Returns the list of departments from localStorage */
function getDepartments() {
    try { return JSON.parse(localStorage.getItem(DEPT_KEY) || '[]'); } catch { return []; }
}


/**
 * Displays a brief toast notification at the bottom of the screen.
 * Automatically hides after 3.5 seconds.
 * @param {string} message - Text to display in the toast
 * @param {string} [type='success'] - Visual type: 'success' | 'error' | 'info'
 */
function showToast(message, type) {
    type = type || 'success';
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className   = 'toast ' + type;
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() { toast.classList.remove('show'); }, 3500);
}



/** Returns the user's notification list from localStorage */
function getNotifications() {
    try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch { return []; }
}

/** Saves the notification array back to localStorage */
function saveNotifications(notifications) {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notifications));
}

/**
 * Updates the red badge count on the notification bell icon.
 * Hides the badge when there are no unread notifications.
 */
function updateBadge() {
    const notifications = getNotifications();
    const unreadCount   = notifications.filter(n => !n.read).length;
    const badge         = document.getElementById('notificationBadge');
    if (unreadCount > 0) {
        badge.textContent    = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display  = 'inline-flex';
    } else {
        badge.style.display  = 'none';
    }
}

/**
 * Renders the full notification dropdown list.
 * Each item shows an icon, title, message, timestamp, and a delete button.
 * Clicking an unread item marks it as read.
 */
function renderNotifications() {
    const notifications = getNotifications();
    const listEl        = document.getElementById('notificationList');
    if (notifications.length === 0) {
        listEl.innerHTML = '<div class="notification-empty">No notifications yet.</div>';
        return;
    }
    // Icon map for each notification type
    const iconMap = { system: '⚙', user: '👤', alert: '⚠', info: 'ℹ' };
    listEl.innerHTML = notifications.slice(0, 20).map(n => {
        return '<div class="notification-item ' + (n.read ? '' : 'unread') + '" data-id="' + n.id + '">' +
            '<div class="notification-icon ' + (n.type || 'system') + '">' + (iconMap[n.type] || '🔔') + '</div>' +
            '<div class="notification-body">' +
                '<div class="notification-title">'   + escapeHtml(n.title)   + '</div>' +
                '<div class="notification-message">' + escapeHtml(n.message) + '</div>' +
                '<div class="notification-time">'    + formatTime(n.time)    + '</div>' +
            '</div>' +
            '<button class="notification-delete" data-id="' + n.id + '" title="Delete notification">' +
                '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4"/></svg>' +
            '</button>' +
        '</div>';
    }).join('');

    // Mark notification as read when clicked
    listEl.querySelectorAll('.notification-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            if (e.target.closest('.notification-delete')) return; // Ignore delete button clicks
            const id     = this.getAttribute('data-id');
            const notifs = getNotifications();
            const target = notifs.find(n => n.id === id);
            if (target && !target.read) {
                target.read = true;
                saveNotifications(notifs);
                updateBadge();
                this.classList.remove('unread');
            }
        });
    });

    // Delete individual notification when delete button is clicked
    listEl.querySelectorAll('.notification-delete').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const id     = this.getAttribute('data-id');
            const notifs = getNotifications().filter(n => n.id !== id);
            saveNotifications(notifs);
            updateBadge();
            renderNotifications();
        });
    });
}

/**
 * Rebuilds the notifications list from announcements and notes data.
 * - Announcements create 'info' type notifications.
 * - Notes from the same department (not by the current user) create 'user' notifications.
 * Preserves existing read/unread state for already-seen notifications.
 */
function ensureNotifications() {
    const currentUserId   = localStorage.getItem('ishare_user_id');
    const currentUserDept = localStorage.getItem('ishare_user_department');
    const notes           = getNotes();
    const announcements   = getAnnouncements();
    const existingNotifications = getNotifications();
    const notifications   = [];
    const now             = Date.now();

    // Build a map of existing notifications to preserve read state
    const existingMap = {};
    existingNotifications.forEach(function(n) { existingMap[n.id] = n; });

    // Create a notification for each announcement
    announcements.forEach(function(a) {
        const id       = 'announcement-' + a.id;
        const existing = existingMap[id];
        notifications.push({
            id:      id,
            title:   a.title || 'New Announcement',
            message: a.body  || '',
            type:    'info',
            time:    a.createdAt || now,
            read:    existing ? existing.read : false
        });
    });

    // Create a notification for each note posted in the user's department by other students
    notes.forEach(function(note) {
        if (note.authorId !== currentUserId && note.department === currentUserDept) {
            const id       = 'note-' + note.id;
            const existing = existingMap[id];
            notifications.push({
                id:      id,
                title:   'New note: ' + (note.title || 'Untitled'),
                message: note.author + ' posted a note in ' + (note.courseCode || 'General'),
                type:    'user',
                time:    note.createdAt || now,
                read:    existing ? existing.read : false
            });
        }
    });

    // Sort notifications by time (newest first)
    notifications.sort(function(a, b) { return b.time - a.time; });
    saveNotifications(notifications);
    return notifications;
}

/* ============================================================ */

/* ============================================================ */

/** Returns the entire messages object (keyed by conversation key) */
function getMessages() {
    try { return JSON.parse(localStorage.getItem(MESSAGES_KEY) || '{}'); } catch { return {}; }
}

/** Saves the messages object back to localStorage */
function saveMessages(messages) {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
}


function getConversationKey(userId1, userId2) {
    const ids = [userId1, userId2].sort();
    return ids[0] + '_' + ids[1];
}

/**
 * Returns the array of messages for the conversation between
 * the current user and the specified other user.
 * @param {string} otherUserId - Student ID of the other participant
 * @returns {Array} Message objects array
 */
function getConversationMessages(otherUserId) {
    const currentUserId = localStorage.getItem('ishare_user_id');
    const key           = getConversationKey(currentUserId, otherUserId);
    const allMessages   = getMessages();
    return allMessages[key] || [];
}

/**
 * Sends a text message to another user by saving it to localStorage.
 * Returns the updated conversation messages array.
 * @param {string} otherUserId - Recipient's student ID
 * @param {string} text        - Message content
 * @returns {Array} Updated conversation messages
 */
function sendMessageTo(otherUserId, text) {
    const currentUserId = localStorage.getItem('ishare_user_id');
    const key           = getConversationKey(currentUserId, otherUserId);
    const allMessages   = getMessages();
    if (!allMessages[key]) allMessages[key] = [];
    allMessages[key].push({
        // Generate a short unique ID using timestamp + random suffix
        id:       Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        senderId: currentUserId,
        text:     text,
        time:     Date.now()
    });
    saveMessages(allMessages);
    return allMessages[key];
}

/**
 * Renders the left-panel contact list with all students in the same department.
 * Shows the last message preview for each conversation.
 * Clicking a contact opens the chat window for that student.
 */
function renderMessagingList() {
    const listEl          = document.getElementById('messagingList');
    if (!listEl) return;
    const currentUserId   = localStorage.getItem('ishare_user_id');
    const currentUserName = localStorage.getItem('ishare_user_name') || '';
    const currentUserDept = localStorage.getItem('ishare_user_department') || '';
    const accounts        = JSON.parse(localStorage.getItem('ishare_accounts') || '[]');
    const allMessages     = getMessages();

    // Filter: show only students from the same department (not the current user)
    const students = accounts.filter(function(a) {
        const isNotCurrentUser = a.studentId !== currentUserId && a.fullname !== currentUserName;
        const isStudent        = (a.accountType || '').toLowerCase() === 'student';
        const sameDept         = !currentUserDept || a.department === currentUserDept;
        return isNotCurrentUser && isStudent && sameDept;
    });

    if (students.length === 0) {
        listEl.innerHTML = '<div class="empty-state" style="padding: 20px;"><div class="empty-state-desc">No students found.</div></div>';
        return;
    }

    listEl.innerHTML = students.map(function(s) {
        const key      = getConversationKey(currentUserId, s.studentId);
        const msgs     = allMessages[key] || [];
        const lastMsg  = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        const preview  = lastMsg ? lastMsg.text : 'No messages yet'; // Show last message or placeholder
        // Generate initials from full name for the avatar
        const initials = (s.fullname || 'U').split(' ').map(function(n) { return n[0]; }).join('').toUpperCase().slice(0, 2);
        return '<div class="messaging-contact" data-student-id="' + escapeHtml(s.studentId || '') + '" data-fullname="' + escapeHtml(s.fullname || '') + '">' +
            '<div class="messaging-contact-avatar">'  + initials + '</div>' +
            '<div class="messaging-contact-info">' +
                '<div class="messaging-contact-name">'    + escapeHtml(s.fullname || 'Unknown') + '</div>' +
                '<div class="messaging-contact-preview">' + escapeHtml(preview)                 + '</div>' +
            '</div>' +
        '</div>';
    }).join('');

    // Bind click handler to open chat for the selected contact
    listEl.querySelectorAll('.messaging-contact').forEach(function(contact) {
        contact.addEventListener('click', function() {
            // Remove active state from all contacts, set on clicked one
            listEl.querySelectorAll('.messaging-contact').forEach(function(c) { c.classList.remove('active'); });
            this.classList.add('active');
            const studentId = this.getAttribute('data-student-id');
            const fullname  = this.getAttribute('data-fullname');
            openChat(studentId, fullname);
        });
    });
}

/**
 * Opens a chat window in the right panel for the selected student.
 * Renders existing conversation history and sets up send functionality.
 * @param {string} studentId - The other student's student ID
 * @param {string} fullname  - The other student's full name
 */
function openChat(studentId, fullname) {
    const main         = document.getElementById('messagingMain');
    if (!main) return;
    const currentUserId = localStorage.getItem('ishare_user_id');
    const initials      = (fullname || 'U').split(' ').map(function(n) { return n[0]; }).join('').toUpperCase().slice(0, 2);
    const messages      = getConversationMessages(studentId);

    // Render the chat header and message area
    main.innerHTML = '<div class="messaging-chat-header">' +
        '<div class="messaging-contact-avatar">' + initials + '</div>' +
        '<div class="messaging-chat-header-info">' +
            '<div class="messaging-chat-header-name">'   + escapeHtml(fullname || 'Student') + '</div>' +
            '<div class="messaging-chat-header-status">Online</div>' +
        '</div>' +
    '</div>' +
    '<div class="messaging-messages" id="messagingMessages"></div>' +
    '<div class="messaging-input-area">' +
        '<input type="text" class="messaging-input" id="messagingInput" placeholder="Type a message...">' +
        '<button class="messaging-send" id="messagingSend">Send</button>' +
    '</div>';

    const messagesContainer = document.getElementById('messagingMessages');
    const sendBtn           = document.getElementById('messagingSend');
    const input             = document.getElementById('messagingInput');

    // Render existing conversation messages as chat bubbles
    messages.forEach(function(msg) {
        const bubble = document.createElement('div');
        // 'sent' = current user's message (right side), 'received' = theirs (left side)
        bubble.className  = 'messaging-bubble ' + (msg.senderId === currentUserId ? 'sent' : 'received');
        bubble.textContent = msg.text;
        messagesContainer.appendChild(bubble);
    });

    // Scroll to the bottom to show the latest message
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    /**
     * Inner function to send a message.
     * Saves to localStorage, appends a bubble to the UI, and refreshes the contact list.
     */
    function sendMessage() {
        const text = input.value.trim();
        if (!text) return;
        sendMessageTo(studentId, text);
        // Append a new sent bubble immediately (no page reload needed)
        const bubble = document.createElement('div');
        bubble.className   = 'messaging-bubble sent';
        bubble.textContent = text;
        messagesContainer.appendChild(bubble);
        input.value = '';
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        renderMessagingList(); // Refresh contact list to update the preview
    }

    // Send button click
    if (sendBtn) {
        sendBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            sendMessage();
        });
    }

    // Enter key to send
    if (input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}



/** Closes the profile modal by removing the 'show' class */
function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('show');
}

/**
 * Opens the profile modal and populates it with the given person's data.
 * If no person is provided, shows the current user's own profile.
 * Also counts notes authored by this user and their total download stats.
 * @param {Object} [person] - Optional person object with profile fields
 */
function openProfileModal(person) {
    const modal = document.getElementById('profileModal');
    if (!modal) return;

    // Read current user info from localStorage as fallback defaults
    const currentUserName = localStorage.getItem('ishare_user_name')       || 'Student';
    const currentUserDept = localStorage.getItem('ishare_user_department')  || '';
    const currentUserId   = localStorage.getItem('ishare_user_id')          || '';
    const currentUserType = localStorage.getItem('ishare_user_type')        || 'Student';

    // Use provided person data or fall back to current user
    const target     = person || {};
    const userName   = target.fullname    || currentUserName;
    const userDept   = target.department  || currentUserDept;
    const userId     = target.studentId   || currentUserId;
    const userType   = target.accountType || currentUserType;
    const userEmail  = target.email       || '';

    // Look up email from account records if not directly available
    const accounts        = JSON.parse(localStorage.getItem('ishare_accounts') || '[]');
    const account         = accounts.find(function(a) { return a.studentId === userId; });
    const emailFromAccount = account ? account.email : '';
    const finalEmail       = userEmail || emailFromAccount;

    // Generate two-letter avatar initials from the full name
    const initials = (userName || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    // Populate each modal field
    const avatarEl    = document.getElementById('profileModalAvatar');
    if (avatarEl)     avatarEl.textContent = initials || 'S';

    const nameEl      = document.getElementById('profileModalName');
    if (nameEl)        nameEl.textContent = userName;

    const deptEl      = document.getElementById('profileModalDept');
    if (deptEl)        deptEl.textContent = (userDept || 'Student').slice(0, 30);

    const studentIdEl = document.getElementById('profileModalStudentId');
    if (studentIdEl)   studentIdEl.textContent = userId || '-';

    const deptDetailEl = document.getElementById('profileModalDeptDetail');
    if (deptDetailEl)  deptDetailEl.textContent = userDept || '-';

    const typeEl      = document.getElementById('profileModalType');
    if (typeEl)        typeEl.textContent = userType || '-';

    const emailEl     = document.getElementById('profileModalEmail');
    if (emailEl)       emailEl.textContent = finalEmail || '-';

    // Count this user's notes
    const notesEl = document.getElementById('profileModalNotes');
    if (notesEl) {
        const allNotes    = getNotes();
        const targetNotes = allNotes.filter(function(n) { return n.authorId === userId; });
        notesEl.textContent = targetNotes.length;
    }

    // Sum up total downloads for this user's notes
    const downloadsEl = document.getElementById('profileModalDownloads');
    if (downloadsEl) {
        const allNotes       = getNotes();
        const targetNotes    = allNotes.filter(function(n) { return n.authorId === userId; });
        const totalDownloads = targetNotes.reduce(function(sum, n) { return sum + (n.downloads || 0); }, 0);
        downloadsEl.textContent = totalDownloads;
    }

    modal.classList.add('show'); // Show the modal
}



document.addEventListener('DOMContentLoaded', function() {
    // Read session info from localStorage
    const userId   = localStorage.getItem('ishare_user_id');
    const userName = localStorage.getItem('ishare_user_name');
    const userType = localStorage.getItem('ishare_user_type');
    const userDept = localStorage.getItem('ishare_user_department');

    // Auth guard: redirect to login if not a logged-in student
    if (!userId || userType !== 'Student') {
        window.location.href = 'index.html';
        return;
    }

    // Populate sidebar user info
    if (userName) {
        const initials      = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const avatar        = document.getElementById('studentAvatar');
        if (avatar)          avatar.textContent        = initials || 'S';
        const sidebarAvatar = document.getElementById('sidebarAvatar');
        if (sidebarAvatar)   sidebarAvatar.textContent = initials || 'S';
        const sidebarName   = document.getElementById('sidebarName');
        if (sidebarName)     sidebarName.textContent   = userName;
        const sidebarDept   = document.getElementById('sidebarDept');
        if (sidebarDept)     sidebarDept.textContent   = (userDept || 'Student').slice(0, 25) + (userDept && userDept.length > 25 ? '..' : '');
    }

    
    const notificationWrapper  = document.getElementById('notificationWrapper');
    const notificationBtn      = document.getElementById('notificationBtn');
    const notificationDropdown = document.getElementById('notificationDropdown');
    const markAllReadBtn       = document.getElementById('markAllRead');
    const deleteAllBtn         = document.getElementById('deleteAllNotifications');

    // Toggle notification dropdown visibility
    if (notificationBtn) {
        notificationBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const isShown = notificationDropdown.classList.contains('show');
            if (isShown) {
                notificationDropdown.classList.remove('show');
            } else {
                renderNotifications();
                notificationDropdown.classList.add('show');
            }
        });
    }

    // Mark all notifications as read
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const notifs  = getNotifications();
            let changed   = false;
            notifs.forEach(n => { if (!n.read) { n.read = true; changed = true; } });
            if (changed) {
                saveNotifications(notifs);
                updateBadge();
                renderNotifications();
            }
        });
    }

    // Delete all notifications (with confirmation)
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm('Delete all notifications? This cannot be undone.')) {
                saveNotifications([]);
                updateBadge();
                renderNotifications();
            }
        });
    }

    // Close notification dropdown when clicking outside it
    document.addEventListener('click', function(e) {
        if (notificationWrapper && !notificationWrapper.contains(e.target)) {
            notificationDropdown.classList.remove('show');
        }
    });

    

    // Close modal via X button
    const closeProfileModalBtn = document.getElementById('closeProfileModal');
    if (closeProfileModalBtn) {
        closeProfileModalBtn.addEventListener('click', closeProfileModal);
    }

    // Close modal by clicking the backdrop (outside the modal card)
    const profileModal = document.getElementById('profileModal');
    if (profileModal) {
        profileModal.addEventListener('click', function(e) {
            if (e.target === profileModal) closeProfileModal();
        });
    }

    // Clicking the student avatar in the header opens the current user's profile
    const studentAvatar = document.getElementById('studentAvatar');
    if (studentAvatar) {
        studentAvatar.addEventListener('click', function(e) {
            e.stopPropagation();
            openProfileModal(); 
        });
    }

    // Escape key closes the profile modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeProfileModal();
    });

    
    // Filter the contact list in real time as the user types
    const messagingSearch = document.getElementById('messagingSearch');
    if (messagingSearch) {
        messagingSearch.addEventListener('input', function() {
            const query    = this.value.toLowerCase();
            const contacts = document.querySelectorAll('.messaging-contact');
            contacts.forEach(function(contact) {
                const name = contact.getAttribute('data-fullname') || '';
                // Show/hide contacts based on name match
                contact.style.display = name.toLowerCase().indexOf(query) !== -1 ? 'flex' : 'none';
            });
        });
    }

    
    renderMessagingList();   // Populate the contact list
    ensureNotifications();   // Sync notifications from notes + announcements
    updateBadge();           // Show unread count on bell icon

    
    // If another page set 'ishare_open_chat_with', automatically open that chat
    const openChatWith = localStorage.getItem('ishare_open_chat_with');
    const openChatName = localStorage.getItem('ishare_open_chat_name');
    if (openChatWith) {
        localStorage.removeItem('ishare_open_chat_with');
        localStorage.removeItem('ishare_open_chat_name');
        setTimeout(function() {
            // Try to click the existing contact element in the list
            const contact = document.querySelector('.messaging-contact[data-student-id="' + openChatWith + '"]');
            if (contact) {
                contact.click();
            } else if (openChatName) {
                // If contact not rendered (e.g. different department), open chat directly
                openChat(openChatWith, openChatName);
            }
        }, 100);
    }

    
    const logoutBtn = document.getElementById('sidebarLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm('Are you sure you want to log out?')) {
                // Clear all session data from localStorage
                localStorage.removeItem('ishare_user_id');
                localStorage.removeItem('ishare_user_password');
                localStorage.removeItem('ishare_user_type');
                localStorage.removeItem('ishare_user_name');
                localStorage.removeItem('ishare_user_department');
                localStorage.removeItem('ishare_user_email');
                localStorage.removeItem('ishare_user_downloads');
                window.location.href = 'index.html';
            }
        });
    }
});
