/* ============================================================ */

/* Handles the Student People page:                             */
/*  - Renders a paginated grid of student cards                 */
/*  - Filters by name/department/skills in real time            */
/*  - Opens profile modal for any student                       */
/*  - Navigates to messaging when "Message" is clicked          */
/*  - Notification badge and dropdown                           */
/*  - Logout and auth guard                                     */
/* ============================================================ */


const STORAGE_KEY = 'ishare_announcements'; // Announcements data
const NOTES_KEY   = 'ishare_notes';          // Notes data
const DEPT_KEY    = 'ishare_departments';    // Departments data
const NOTIF_KEY   = 'ishare_notifications';  // Notifications data


/**
 * Escapes HTML special characters to prevent XSS when injecting user data into HTML.
 * @param {string} text - Raw user-supplied string
 * @returns {string} Safe HTML-encoded string
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


/**
 * Converts a Unix millisecond timestamp to a human-readable relative time string.
 * Examples: "5m ago", "2h ago", "3d ago", "Jan 5, 2026"
 * @param {number} timestamp
 * @returns {string}
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



/** Returns the announcements array from localStorage */
function getAnnouncements() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

/** Returns the notes array from localStorage */
function getNotes() {
    try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); } catch { return []; }
}

/** Returns the departments array from localStorage */
function getDepartments() {
    try { return JSON.parse(localStorage.getItem(DEPT_KEY) || '[]'); } catch { return []; }
}


/**
 * Displays a brief toast notification that auto-dismisses after 3.5s.
 * @param {string} message
 * @param {string} [type='success'] - 'success' | 'error' | 'info'
 */
function showToast(message, type) {
    type = type || 'success';
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className   = 'toast ' + type;
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() { toast.classList.remove('show'); }, 3500);
}



/** Returns the notifications array from localStorage */
function getNotifications() {
    try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch { return []; }
}

/** Persists the notifications array to localStorage */
function saveNotifications(notifications) {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notifications));
}

/**
 * Returns the number of downloads recorded for the current user.
 * Reads from 'ishare_user_downloads' (an integer stored as string).
 */
function getUserDownloads() {
    try { return parseInt(localStorage.getItem('ishare_user_downloads') || '0', 10); } catch { return 0; }
}

/**
 * Returns the list of notes authored by the current logged-in user.
 */
function getUserNotes() {
    const notes  = getNotes();
    const userId = localStorage.getItem('ishare_user_id');
    return notes.filter(function(n) { return n.authorId === userId; });
}

/**
 * Updates the notification bell badge with the unread count.
 * Hides the badge if there are no unread notifications.
 */
function updateBadge() {
    const notifications = getNotifications();
    const unreadCount   = notifications.filter(n => !n.read).length;
    const badge         = document.getElementById('notificationBadge');
    if (unreadCount > 0) {
        badge.textContent   = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

/**
 * Renders the notification dropdown list.
 * Each item shows icon, title, message body, timestamp, and a delete button.
 * Clicking an unread item marks it as read.
 */
function renderNotifications() {
    const notifications = getNotifications();
    const listEl        = document.getElementById('notificationList');
    if (notifications.length === 0) {
        listEl.innerHTML = '<div class="notification-empty">No notifications yet.</div>';
        return;
    }
    // Icon map for different notification types
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

    // Mark notification as read on click (ignore delete button clicks)
    listEl.querySelectorAll('.notification-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            if (e.target.closest('.notification-delete')) return;
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

    // Delete individual notification on button click
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
 * Rebuilds the notification list from announcements + department notes data.
 * Preserves existing read/unread state using a lookup map by notification ID.
 */
function ensureNotifications() {
    const currentUserId         = localStorage.getItem('ishare_user_id');
    const currentUserDept       = localStorage.getItem('ishare_user_department');
    const notes                 = getNotes();
    const announcements         = getAnnouncements();
    const existingNotifications = getNotifications();
    const notifications         = [];
    const now                   = Date.now();

    // Build lookup map to preserve read state
    const existingMap = {};
    existingNotifications.forEach(function(n) { existingMap[n.id] = n; });

    // Announcement notifications (type: info)
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

    // Sort newest first
    notifications.sort(function(a, b) { return b.time - a.time; });
    saveNotifications(notifications);
    return notifications;
}


let allPeople      = [];  // Full unfiltered list of accounts
let filteredPeople = [];  // Filtered list (by search/department)
let currentPage    = 1;   // Current pagination page
const pageSize     = 6;   // Cards to display per page



/** Returns all registered accounts from localStorage */
function getAccounts() {
    try { return JSON.parse(localStorage.getItem('ishare_accounts') || '[]'); } catch { return []; }
}


function getInitials(name) {
    return (name || 'U').split(' ').map(function(n) { return n[0]; }).join('').toUpperCase().slice(0, 2);
}



/**
 * Renders the current page of people cards into the grid.
 * Each card shows: avatar initials, name, role badge, department,
 * optional bio/skills, a "View Profile" button, and a "Message" button.
 * Hides pagination when there are no results.
 * @param {Array} people - The filtered/sorted people array to paginate
 */
function renderPeople(people) {
    const grid = document.getElementById('peopleGrid');
    if (!grid) return;
    const start     = (currentPage - 1) * pageSize;
    const pageItems = people.slice(start, start + pageSize);

    if (pageItems.length === 0) {
        // Show empty-state placeholder when no results
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4v2a4 4 0 0 0 4 4v2"/><circle cx="12" cy="7" r="4"/></svg><div class="empty-state-title">No people found</div><div class="empty-state-desc">Try adjusting your search or filters.</div></div>';
        document.getElementById('peoplePagination').style.display = 'none';
        return;
    }

    document.getElementById('peoplePagination').style.display = 'flex';
    grid.innerHTML = pageItems.map(function(p, index) {
        const roleClass  = (p.accountType || 'student').toLowerCase();
        const roleLabel  = roleClass.charAt(0).toUpperCase() + roleClass.slice(1);
        const initials   = getInitials(p.fullname);
        const desc       = p.research || p.skills || p.bio || ''; // Show first available bio field
        const cardId     = 'peopleCard_' + (currentPage - 1) * pageSize + '_' + index;

        // Embed all person attributes as data-* attributes for easy retrieval in event handlers
        return '<div class="people-card" data-student-id="' + escapeHtml(p.studentId || '') + '" data-fullname="' + escapeHtml(p.fullname || '') + '" data-department="' + escapeHtml(p.department || '') + '" data-account-type="' + escapeHtml(p.accountType || '') + '" data-email="' + escapeHtml(p.email || '') + '" data-research="' + escapeHtml(p.research || '') + '" data-skills="' + escapeHtml(p.skills || '') + '" data-bio="' + escapeHtml(p.bio || '') + '">' +
            '<div class="people-avatar-placeholder">' + initials + '</div>' +
            '<div class="people-info">' +
                '<div class="people-header">' +
                    '<div class="people-name">' + escapeHtml(p.fullname || 'Unknown') + '</div>' +
                    '<span class="people-role ' + escapeHtml(roleClass) + '">' + escapeHtml(roleLabel) + '</span>' +
                '</div>' +
                '<div class="people-meta">' + escapeHtml(p.department || 'N/A') + (p.accountType ? ' · ' + escapeHtml(p.accountType) : '') + '</div>' +
                (desc ? '<div class="people-desc">' + escapeHtml(desc) + '</div>' : '') +
                '<div class="people-actions">' +
                    '<button class="people-link people-view-profile-btn" type="button" data-student-id="' + escapeHtml(p.studentId || '') + '">View Profile</button>' +
                    '<button class="people-msg" type="button" title="Message">' +
                        '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }).join('');

    // "View Profile" button: open profile modal with this person's card data
    grid.querySelectorAll('.people-view-profile-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const card = this.closest('.people-card');
            if (!card) return;
            openProfileModal({
                studentId:   card.getAttribute('data-student-id')   || '',
                fullname:    card.getAttribute('data-fullname')      || 'Student',
                department:  card.getAttribute('data-department')    || '',
                accountType: card.getAttribute('data-account-type') || 'Student',
                email:       card.getAttribute('data-email')        || '',
                research:    card.getAttribute('data-research')     || '',
                skills:      card.getAttribute('data-skills')       || '',
                bio:         card.getAttribute('data-bio')          || ''
            });
        });
    });

    // "Message" button: store target in localStorage and navigate to messaging page
    grid.querySelectorAll('.people-msg').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const card      = this.closest('.people-card');
            if (!card) return;
            const studentId = card.getAttribute('data-student-id') || '';
            const fullname  = card.getAttribute('data-fullname')   || '';
            if (studentId) {
                // Pass target person info via localStorage for the messaging page to pick up
                localStorage.setItem('ishare_open_chat_with', studentId);
                localStorage.setItem('ishare_open_chat_name', fullname);
                window.location.href = 'student-messaging.html';
            }
        });
    });

    renderPagination(people.length);
}



/**
 * Renders pagination controls (prev, page numbers with ellipsis, next).
 * Smartly abbreviates long page ranges to avoid cluttering the UI.
 * @param {number} total - Total number of people in the filtered list
 */
function renderPagination(total) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const container  = document.getElementById('peoplePagination');
    container.innerHTML = '';

    // Previous button
    const prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.type      = 'button';
    prev.innerHTML = '&lt;';
    prev.disabled  = currentPage === 1;
    prev.addEventListener('click', function() {
        if (currentPage > 1) { currentPage--; applyFilters(); }
    });
    container.appendChild(prev);

    // Page number buttons with ellipsis for long ranges
    for (let i = 1; i <= totalPages; i++) {
        // Show ellipsis for pages far from the current page and boundaries
        if (totalPages > 7 && i > 3 && i < totalPages - 2 && Math.abs(i - currentPage) > 1) {
            if (i === 4 || i === totalPages - 3) {
                const ellipsis = document.createElement('span');
                ellipsis.className   = 'page-ellipsis';
                ellipsis.textContent = '...';
                container.appendChild(ellipsis);
            }
            continue;
        }
        const btn = document.createElement('button');
        btn.className   = 'page-btn' + (i === currentPage ? ' active' : '');
        btn.type        = 'button';
        btn.textContent = i;
        btn.addEventListener('click', function() {
            currentPage = i;
            applyFilters();
        });
        container.appendChild(btn);
    }

    // Next button
    const next = document.createElement('button');
    next.className = 'page-btn';
    next.type      = 'button';
    next.innerHTML = '&gt;';
    next.disabled  = currentPage === totalPages;
    next.addEventListener('click', function() {
        if (currentPage < totalPages) { currentPage++; applyFilters(); }
    });
    container.appendChild(next);
}



/**
 * Applies the current search query and department filter to allPeople.
 * Only shows students from the same department as the current user.
 * Resets to page 1 on each filter change and re-renders the grid.
 */
function applyFilters() {
    const query           = (document.getElementById('peopleSearch').value || '').toLowerCase();
    const currentUserDept = localStorage.getItem('ishare_user_department') || '';

    filteredPeople = allPeople.filter(function(p) {
        const isStudent  = (p.accountType || '').toLowerCase() === 'student';
        // Only show people from the user's department (if user has a department)
        const sameDept   = !currentUserDept || (p.department || '').toLowerCase() === currentUserDept.toLowerCase();
        // Match against name, department, research, or skills fields
        const matchQuery = !query ||
            (p.fullname    || '').toLowerCase().indexOf(query) !== -1 ||
            (p.department  || '').toLowerCase().indexOf(query) !== -1 ||
            (p.research    || '').toLowerCase().indexOf(query) !== -1 ||
            (p.skills      || '').toLowerCase().indexOf(query) !== -1;
        return isStudent && sameDept && matchQuery;
    });

    currentPage = 1; // Always reset to first page on filter change
    renderPeople(filteredPeople);
}



/** Hides the profile modal */
function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('show');
}

/**
 * Opens and populates the profile modal for a specific person.
 * If no person is provided, shows the current user's own profile.
 * Looks up note count and total downloads from the notes array.
 * @param {Object} [person] - Optional person data object
 */
function openProfileModal(person) {
    const modal = document.getElementById('profileModal');
    if (!modal) return;

    // Default to current user's values if no person is provided
    const currentUserName = localStorage.getItem('ishare_user_name')       || 'Student';
    const currentUserDept = localStorage.getItem('ishare_user_department')  || '';
    const currentUserId   = localStorage.getItem('ishare_user_id')          || '';
    const currentUserType = localStorage.getItem('ishare_user_type')        || 'Student';

    const target     = person || {};
    const userName   = target.fullname    || currentUserName;
    const userDept   = target.department  || currentUserDept;
    const userId     = target.studentId   || currentUserId;
    const userType   = target.accountType || currentUserType;
    const userEmail  = target.email       || '';

    // Try to resolve email from the accounts list if not directly available
    const accounts         = JSON.parse(localStorage.getItem('ishare_accounts') || '[]');
    const account          = accounts.find(function(a) { return a.studentId === userId; });
    const emailFromAccount = account ? account.email : '';
    const finalEmail       = userEmail || emailFromAccount;

    const initials = getInitials(userName);

    // Fill in all modal display elements
    const avatarEl    = document.getElementById('profileModalAvatar');
    if (avatarEl)      avatarEl.textContent = initials || 'S';

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

    // Count notes authored by this user
    const notesEl = document.getElementById('profileModalNotes');
    if (notesEl) {
        const allNotes    = getNotes();
        const targetNotes = allNotes.filter(function(n) { return n.authorId === userId; });
        notesEl.textContent = targetNotes.length;
    }

    // Sum downloads across this user's notes
    const downloadsEl = document.getElementById('profileModalDownloads');
    if (downloadsEl) {
        const allNotes       = getNotes();
        const targetNotes    = allNotes.filter(function(n) { return n.authorId === userId; });
        const totalDownloads = targetNotes.reduce(function(sum, n) { return sum + (n.downloads || 0); }, 0);
        downloadsEl.textContent = totalDownloads;
    }

    modal.classList.add('show');
}


/**
 * Main entry point. Runs on DOMContentLoaded.
 * - Guards against non-student/unauthenticated access
 * - Populates sidebar and page header with user info
 * - Sets up notification dropdown controls
 * - Sets up profile modal controls
 * - Wires the search input to the filter system
 * - Loads all accounts and applies initial filter
 * - Initializes the notification badge
 * - Wires the logout button
 */
document.addEventListener('DOMContentLoaded', function() {
    const userId   = localStorage.getItem('ishare_user_id');
    const userName = localStorage.getItem('ishare_user_name');
    const userType = localStorage.getItem('ishare_user_type');
    const userDept = localStorage.getItem('ishare_user_department');

    // Auth guard: only allow logged-in students
    if (!userId || userType !== 'Student') {
        window.location.href = 'index.html';
        return;
    }

    // Populate sidebar and dept header with the user's info
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

        // Update the "People in [Department]" page heading
        const deptNameEl = document.getElementById('deptName');
        if (deptNameEl)  deptNameEl.textContent = userDept || 'Department';
    }

    
    const notificationWrapper  = document.getElementById('notificationWrapper');
    const notificationBtn      = document.getElementById('notificationBtn');
    const notificationDropdown = document.getElementById('notificationDropdown');
    const markAllReadBtn       = document.getElementById('markAllRead');
    const deleteAllBtn         = document.getElementById('deleteAllNotifications');

    // Toggle notification dropdown open/close
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

    // Mark all as read
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

    // Delete all notifications
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

    // Close dropdown when clicking outside it
    document.addEventListener('click', function(e) {
        if (notificationWrapper && !notificationWrapper.contains(e.target)) {
            notificationDropdown.classList.remove('show');
        }
    });

    

    // Close via X button
    const closeProfileModalBtn = document.getElementById('closeProfileModal');
    if (closeProfileModalBtn) {
        closeProfileModalBtn.addEventListener('click', closeProfileModal);
    }

    // Close by clicking the modal backdrop
    const profileModal = document.getElementById('profileModal');
    if (profileModal) {
        profileModal.addEventListener('click', function(e) {
            if (e.target === profileModal) closeProfileModal();
        });
    }

    // Clicking the top-right avatar opens current user's profile
    const studentAvatar = document.getElementById('studentAvatar');
    if (studentAvatar) {
        studentAvatar.addEventListener('click', function(e) {
            e.stopPropagation();
            openProfileModal(); // No argument = current user
        });
    }

    // Escape key closes the modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeProfileModal();
    });

    
    const searchInput = document.getElementById('peopleSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            currentPage = 1; // Reset to first page on every keystroke
            applyFilters();
        });
    }

    
    allPeople = getAccounts(); // Load all accounts as the base list
    applyFilters();            // Apply default filter (student + same dept)

    ensureNotifications(); // Rebuild notification list from notes + announcements
    updateBadge();         // Update bell icon badge

    
    const logoutBtn = document.getElementById('sidebarLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm('Are you sure you want to log out?')) {
                // Clear all session data
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
