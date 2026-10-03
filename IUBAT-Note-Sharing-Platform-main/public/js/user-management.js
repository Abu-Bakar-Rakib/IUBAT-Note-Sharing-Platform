/* ============================================================ */

/* Handles the User Management admin page:                      */
/*  - Displays paginated, filterable user table                 */
/*  - Status/conduct badges for each user                       */
/*  - Suspend, reactivate, delete user actions                  */
/*  - Add new user via prompt dialogs                           */
/*  - Discipline modal: formal warning, mute, suspension, ban   */
/*  - Student detail modal                                      */
/*  - Notification dropdown                                      */
/*  - CSV export of users                                        */
/*  - Mobile sidebar toggle                                      */
/* ============================================================ */


const ITEMS_PER_PAGE = 10;   // Number of users shown per table page


let currentFilter = 'all'; // Active tab filter: 'all' | 'flagged' | 'active' | 'suspended'
let currentPage   = 1;     // Current page number in the table



/**
 * Reads all user accounts from localStorage ('ishare_accounts') and
 * normalizes them into a consistent user object format.
 * @returns {Array} Array of normalized user objects
 */
function getUsers() {
    const accounts = JSON.parse(localStorage.getItem('ishare_accounts') || '[]');
    return accounts.map(acc => ({
        id:          acc.studentId || acc.id || Math.random().toString(36).slice(2, 9), // Unique user identifier
        name:        acc.fullname   || 'Unknown User',
        email:       acc.email      || '',
        department:  acc.department || 'N/A',
        status:      acc.status     || 'active',      // 'active' | 'suspended'
        accountType: acc.accountType || 'student',    // 'student' | 'admin'
        conduct:     acc.conduct    || 'clean',        // 'clean' | 'flagged' | 'suspended'
        conductNote: acc.conductNote || '',            // Reason for discipline action
        warnings:    acc.warnings   || 0,             // Number of disciplinary strikes
        isSystem:    acc.isSystem   || false          // True for the built-in admin account
    }));
}

/**
 * Applies search, department filter, and tab filter to the user list.
 * Search matches against: name, ID, department, email, accountType, conductNote.
 * @returns {Array} Filtered array of user objects
 */
function getFilteredUsers() {
    const searchInput = document.getElementById('searchInput');
    const deptFilter  = document.getElementById('deptFilter');
    const search = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const dept   = deptFilter  ? deptFilter.value : '';
    let users    = getUsers();

    // Apply tab filter
    if (currentFilter === 'flagged') {
        users = users.filter(u => u.conduct === 'flagged' || u.conduct === 'suspended');
    } else if (currentFilter === 'active') {
        users = users.filter(u => u.status === 'active' && u.conduct !== 'flagged' && u.conduct !== 'suspended');
    } else if (currentFilter === 'suspended') {
        users = users.filter(u => u.status === 'suspended' || u.conduct === 'suspended');
    }

    // Apply text search
    if (search) {
        users = users.filter(u =>
            u.name.toLowerCase().includes(search) ||
            u.id.toLowerCase().includes(search) ||
            u.department.toLowerCase().includes(search) ||
            (u.email       && u.email.toLowerCase().includes(search)) ||
            (u.accountType && u.accountType.toLowerCase().includes(search)) ||
            (u.conductNote && u.conductNote.toLowerCase().includes(search))
        );
    }

    // Apply department dropdown filter
    if (dept) {
        users = users.filter(u => u.department === dept);
    }

    return users;
}



/**
 * Escapes HTML special characters to prevent XSS attacks
 * when injecting user data into HTML strings.
 * @param {string} text
 * @returns {string} Safe HTML-escaped string
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Generates up to 2 uppercase initials from a user's full name.
 * Used for the avatar placeholder in the user table.
 * @param {string} name
 * @returns {string} e.g. "JD" for "John Doe"
 */
function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}



/**
 * Renders a colored conduct badge based on the user's disciplinary state.
 * Possible states: clean, flagged, suspended, warning (has strikes).
 * @param {Object} user
 * @returns {string} HTML string for the conduct badge
 */
function renderConductBadge(user) {
    if (user.conduct === 'clean') {
        return '<span class="conduct-badge clean"><span class="conduct-dot"></span>Clean Record</span>';
    } else if (user.conduct === 'flagged') {
        return '<span class="conduct-badge flagged"><span class="conduct-dot"></span>Flagged</span>';
    } else if (user.conduct === 'suspended') {
        return '<span class="conduct-badge suspended"><span class="conduct-dot"></span>Suspended</span>';
    } else if (user.warnings > 0) {
        return `<span class="conduct-badge warning"><span class="conduct-dot"></span>${user.warnings} Warning${user.warnings > 1 ? 's' : ''}</span>`;
    }
    return '<span class="conduct-badge clean"><span class="conduct-dot"></span>Clean Record</span>';
}

/**
 * Renders the account status badge (SYSTEM, SUSPENDED, ONLINE, OFFLINE).
 * Uses the isUserOnline() check to determine live online state.
 * @param {Object} user
 * @returns {string} HTML string for the status badge
 */
function renderStatusBadge(user) {
    const status = user.status || 'active';
    // System user gets a special badge
    if (user.isSystem) {
        return '<span class="status-badge system"><span class="status-dot"></span>SYSTEM</span>';
    }
    if (status === 'suspended') {
        return '<span class="status-badge suspended"><span class="status-dot"></span>SUSPENDED</span>';
    }
    // Show ONLINE if the user is currently active (last seen < 60 seconds ago)
    const onlineStatus = isUserOnline(user.id);
    if (onlineStatus) {
        return '<span class="status-badge online"><span class="status-dot"></span>ONLINE</span>';
    }
    return '<span class="status-badge offline"><span class="status-dot"></span>OFFLINE</span>';
}

/**
 * Checks whether a user is currently online by comparing their student ID
 * against the current session and checking the last-seen timestamp.
 * A user is considered online if their last activity was < 60 seconds ago.
 * @param {string} userId - The student ID to check
 * @returns {boolean}
 */
function isUserOnline(userId) {
    const onlineUserId = localStorage.getItem('ishare_user_id');
    const onlineStatus = localStorage.getItem('ishare_user_online');
    const lastSeen     = localStorage.getItem('ishare_user_last_seen');
    if (!onlineUserId || onlineUserId !== userId) {
        return false;
    }
    if (onlineStatus === 'true' && lastSeen) {
        const diff = Date.now() - parseInt(lastSeen, 10);
        return diff < 60000; // Online within the last 60 seconds
    }
    return false;
}

/**
 * Renders the action buttons for a user row:
 * - Discipline (always shown)
 * - Suspend OR Reactivate (based on current status)
 * - Delete (disabled for system users)
 * @param {Object} user
 * @returns {string} HTML string with action buttons
 */
function renderActions(user) {
    const isSuspended = user.status === 'suspended' || user.conduct === 'suspended';
    const isSystem    = user.isSystem;
    const escapedId   = escapeHtml(user.id);

    // Discipline is always available
    let buttons = `<button class="action-btn-sm discipline" onclick="openDisciplineModal('${escapedId}')">Discipline</button>`;

    if (isSystem) {
        // System account cannot be suspended or deleted
        buttons += '<button class="action-btn-sm suspend" disabled>Suspend</button>';
        buttons += `<button class="action-btn-sm danger" disabled title="System user cannot be deleted">Delete</button>`;
    } else if (isSuspended) {
        // Suspended user can be reactivated or deleted
        buttons += `<button class="action-btn-sm success" onclick="reactivateUser('${escapedId}')">Reactivate</button>`;
        buttons += `<button class="action-btn-sm danger" onclick="deleteUser('${escapedId}')">Delete</button>`;
    } else {
        // Active user can be suspended or deleted
        buttons += `<button class="action-btn-sm suspend" onclick="suspendUser('${escapedId}')">Suspend</button>`;
        buttons += `<button class="action-btn-sm danger" onclick="deleteUser('${escapedId}')">Delete</button>`;
    }

    return buttons;
}



/**
 * Renders the paginated user table with all applied filters.
 * Also updates counter badges on the filter tabs and the total user count.
 * Shows an empty state if no users match the current filters.
 */
function renderTable() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    const filtered   = getFilteredUsers();
    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));

    // Clamp currentPage to valid range
    if (currentPage > totalPages) currentPage = totalPages;
    const start     = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

    // Update "Showing X-Y of Z" info text
    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        paginationInfo.textContent = filtered.length === 0
            ? 'Showing 0 of 0 enrolled users'
            : `Showing ${start + 1}-${Math.min(start + ITEMS_PER_PAGE, filtered.length)} of ${filtered.length} enrolled users`;
    }

    // Update total user count in header
    const totalUsersEl = document.getElementById('totalUsers');
    if (totalUsersEl) totalUsersEl.textContent = getUsers().length;

    // Update flagged user count and tab badges
    const flaggedCount = getUsers().filter(u => u.conduct === 'flagged' || u.conduct === 'suspended').length;
    const flaggedBadge = document.getElementById('flaggedBadge');
    if (flaggedBadge) flaggedBadge.innerHTML = `<span class="flagged-badge-dot"></span>${flaggedCount} Flagged`;
    const countAll       = document.getElementById('countAll');
    if (countAll)      countAll.textContent = getUsers().length;
    const countFlagged   = document.getElementById('countFlagged');
    if (countFlagged)  countFlagged.textContent = flaggedCount;
    const countActive    = document.getElementById('countActive');
    if (countActive)   countActive.textContent = getUsers().filter(u => u.status === 'active' && u.conduct !== 'flagged' && u.conduct !== 'suspended').length;
    const countSuspended = document.getElementById('countSuspended');
    if (countSuspended) countSuspended.textContent = getUsers().filter(u => u.status === 'suspended' || u.conduct === 'suspended').length;

    if (pageItems.length === 0) {
        // Empty state when no users match filters
        tbody.innerHTML = `<tr><td colspan="7">
            <div class="empty-state">
                <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4v2a4 4 0 0 0 4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <div class="empty-state-title">No users found</div>
                <div class="empty-state-desc">Try adjusting your search or filter criteria.</div>
            </div>
        </td></tr>`;
    } else {
        // Render one table row per user
        tbody.innerHTML = pageItems.map(user => {
            const isFlagged      = user.conduct === 'flagged' || user.conduct === 'suspended';
            const rowClass       = isFlagged ? 'flagged-row' : ''; // Highlight flagged rows
            // Show conduct note as an alert box under the user name if present
            const conductNoteHtml = user.conductNote ? `<div class="conduct-details alert">${escapeHtml(user.conductNote)}</div>` : '';
            return `<tr class="${rowClass}">
                <td>
                    <div class="user-cell">
                        <div class="user-avatar">${getInitials(user.name)}</div>
                        <div class="user-info">
                            <!-- Clicking the user's name opens the detail modal -->
                            <span class="user-name" style="cursor:pointer;text-decoration:underline;text-underline-offset:2px;" onclick="openStudentDetailModal('${escapeHtml(user.id)}')">${escapeHtml(user.name)}</span>
                            <span class="user-id">ID: ${escapeHtml(user.id)}</span>
                            ${conductNoteHtml}
                        </div>
                    </div>
                </td>
                <td><span style="font-weight:500;">${escapeHtml(user.department)}</span></td>
                <td style="font-size:0.8rem;color:#475569;">${escapeHtml(user.email || '-')}</td>
                <td><span style="font-weight:600;text-transform:capitalize;">${escapeHtml(user.accountType || 'student')}</span></td>
                <td>${renderConductBadge(user)} ${user.warnings > 0 ? `<span style="font-size:0.72rem;color:#94a3b8;margin-left:4px;">(${user.warnings} strike${user.warnings > 1 ? 's' : ''})</span>` : ''}</td>
                <td>${renderStatusBadge(user)}</td>
                <td><div class="actions-cell">${renderActions(user)}</div></td>
            </tr>`;
        }).join('');
    }

    renderPagination(totalPages);
}



/**
 * Exports the currently filtered user list as a CSV file.
 * Includes: Name, ID, Department, Status, Account Type, Conduct, Warnings, Conduct Note.
 * Uses Blob + URL.createObjectURL to trigger a browser download.
 */
function exportUsers() {
    const users = getFilteredUsers();
    if (users.length === 0) {
        alert('No users to export.');
        return;
    }

    const headers = ['Name', 'ID', 'Department', 'Status', 'Account Type', 'Conduct', 'Warnings', 'Conduct Note'];
    const rows    = users.map(u => [
        u.name, u.id, u.department, u.status, u.accountType, u.conduct, u.warnings, u.conductNote || ''
    ]);

    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        // Escape double-quotes inside cell values per CSV spec
        const escaped = row.map(cell => `"${String(cell).replace(/"/g, '""')}"`);
        csv += escaped.join(',') + '\n';
    });

    // Create a temporary link element to trigger the file download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `user-management-export-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url); // Release the object URL after triggering download
}



/**
 * Renders prev/next and numbered page buttons for the user table.
 * For large page counts (> 7 pages), shows ellipsis between boundary pages.
 * @param {number} totalPages
 */
function renderPagination(totalPages) {
    const controls = document.getElementById('paginationControls');
    if (!controls) return;
    if (totalPages <= 1) { controls.innerHTML = ''; return; }

    let html = `<button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&lt;</button>`;

    const pages = [];
    if (totalPages <= 7) {
        // Show all pages if total is small
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        // Smart abbreviation: show first, last, and pages around current
        pages.push(1);
        if (currentPage > 3) pages.push('...');
        const start = Math.max(2, currentPage - 1);
        const end   = Math.min(totalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i++) pages.push(i);
        if (currentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    pages.forEach(p => {
        if (p === '...') {
            html += '<span class="page-ellipsis">...</span>';
        } else {
            html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
        }
    });

    html += `<button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>&gt;</button>`;
    controls.innerHTML = html;
}

/**
 * Navigates to a specific table page, clamping to valid range.
 * @param {number} page - Target page number
 */
function goToPage(page) {
    const filtered   = getFilteredUsers();
    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderTable();
}

/**
 * Activates a filter tab and re-renders the table.
 * Updates active class on tab buttons.
 * @param {HTMLElement} btn    - The clicked tab button element
 * @param {string}      filter - The filter to apply ('all' | 'flagged' | 'active' | 'suspended')
 */
function setFilter(btn, filter) {
    currentFilter = filter;
    currentPage   = 1;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTable();
}



/**
 * Suspends a user (sets status to 'suspended') after confirmation.
 * Writes the change to localStorage and refreshes the table.
 * @param {string} id - User's student ID
 */
function suspendUser(id) {
    if (!confirm('Are you sure you want to suspend this user?')) return;
    let accounts = JSON.parse(localStorage.getItem('ishare_accounts') || '[]');
    const idx    = accounts.findIndex(a => (a.studentId || a.id) === id);
    if (idx >= 0) {
        accounts[idx].status = 'suspended';
        localStorage.setItem('ishare_accounts', JSON.stringify(accounts));
        renderTable();
        alert('User has been suspended.');
    } else {
        alert('User not found in system records.');
    }
}

/**
 * Reactivates a suspended user (sets status back to 'active').
 * @param {string} id - User's student ID
 */
function reactivateUser(id) {
    if (!confirm('Are you sure you want to reactivate this user?')) return;
    let accounts = JSON.parse(localStorage.getItem('ishare_accounts') || '[]');
    const idx    = accounts.findIndex(a => (a.studentId || a.id) === id);
    if (idx >= 0) {
        accounts[idx].status = 'active';
        localStorage.setItem('ishare_accounts', JSON.stringify(accounts));
        renderTable();
        alert('User has been reactivated.');
    } else {
        alert('User not found in system records.');
    }
}

/**
 * Permanently deletes a user from localStorage after confirmation.
 * This action is irreversible.
 * @param {string} id - User's student ID
 */
function deleteUser(id) {
    if (!confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) return;
    let accounts = JSON.parse(localStorage.getItem('ishare_accounts') || '[]');
    const idx    = accounts.findIndex(a => (a.studentId || a.id) === id);
    if (idx >= 0) {
        const deletedName = accounts[idx].fullname || accounts[idx].name;
        accounts.splice(idx, 1); // Remove user from array
        localStorage.setItem('ishare_accounts', JSON.stringify(accounts));
        renderTable();
        alert('User "' + deletedName + '" has been permanently deleted.');
    } else {
        alert('User not found in system records.');
    }
}

/**
 * Opens a prompt-based dialog to manually add a new user.
 * Collects: full name, university ID, and department.
 * Adds the user with default 'student' account type and 'active' status.
 */
function openAddUserModal() {
    const name = prompt('Enter full name:');
    if (name === null || !name.trim()) { if (name !== null) alert('Name is required'); return; }
    const id   = prompt('Enter University ID:');
    if (id === null || !id.trim()) { if (id !== null) alert('ID is required'); return; }
    const dept = prompt('Enter department:');
    if (dept === null || !dept.trim()) { if (dept !== null) alert('Department is required'); return; }

    let accounts = JSON.parse(localStorage.getItem('ishare_accounts') || '[]');
    // Check for duplicate student ID
    if (accounts.find(a => (a.studentId || a.id) === id)) {
        alert('A user with this ID already exists.');
        return;
    }
    accounts.push({
        fullname:    name.trim(),
        studentId:   id.trim(),
        department:  dept.trim(),
        accountType: 'student',
        status:      'active',
        conduct:     'clean',
        conductNote: '',
        warnings:    0,
        createdAt:   new Date().toISOString()
    });
    localStorage.setItem('ishare_accounts', JSON.stringify(accounts));
    renderTable();
    alert('User added successfully.');
}



/**
 * DOMContentLoaded handler: validates admin session, sets up sidebar,
 * renders the user table, initializes notifications, and handles URL params.
 */
document.addEventListener('DOMContentLoaded', function() {
    const userId = localStorage.getItem('ishare_user_id');

    // Auth guard: redirect to login if no active session
    if (!userId) {
        window.location.href = 'index.html';
        return;
    }

    // One-time cleanup: clear stale accounts and notifications on first admin load
    if (!localStorage.getItem('ishare_cleaned')) {
        localStorage.removeItem('ishare_accounts');
        localStorage.removeItem('ishare_notifications');
        localStorage.setItem('ishare_cleaned', 'true');
    }

    // Highlight the active nav item in the sidebar based on current page
    const page    = window.location.pathname.split('/').pop() || 'user-management.html';
    const pageMap = {
        'admin-dashboard.html':         'Platform Overview',
        'user-management.html':         'User Management',
        'department-controls.html':     'Department Controls',
        'announcement-management.html': 'Announcement Management',
        'student-view.html':            'Student View'
    };
    const activeText = pageMap[page] || 'User Management';
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.textContent.trim().includes(activeText)) {
            item.classList.add('active');
        }
    });

    // Show admin initials in the topbar avatar
    const userName = localStorage.getItem('ishare_user_name');
    if (userName) {
        const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const avatar   = document.querySelector('.topbar-avatar');
        if (avatar) avatar.textContent = initials || 'U';
    }

    renderTable();       // Initial table render
    initNotifications(); // Set up notification bell

    // If navigated from admin dashboard with ?user=<id>, open that user's detail modal
    const params      = new URLSearchParams(window.location.search);
    const focusUserId = params.get('user');
    if (focusUserId) {
        setTimeout(() => openStudentDetailModal(decodeURIComponent(focusUserId)), 300);
    }
});



/**
 * Initializes the notification bell dropdown system.
 * - Loads notifications (or generates sample ones if empty)
 * - Renders the badge count
 * - Wires click handlers for: toggle, mark-all-read, delete-all, outside-click
 */
function initNotifications() {
    const STORAGE_KEY          = 'ishare_notifications';
    const notificationBtn      = document.getElementById('notificationBtn');
    const notificationBadge    = document.getElementById('notificationBadge');
    const notificationDropdown = document.getElementById('notificationDropdown');
    const notificationList     = document.getElementById('notificationList');
    const markAllReadBtn       = document.getElementById('markAllRead');
    const deleteAllBtn         = document.getElementById('deleteAllNotifications');
    const notificationWrapper  = document.getElementById('notificationWrapper');

    /** Reads notifications from localStorage */
    function getNotifications() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
    /** Saves notification array to localStorage */
    function saveNotifications(notifications) { localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications)); }
    /** Returns the count of unread notifications */
    function getUnreadCount(notifications) { return notifications.filter(n => !n.read).length; }

    /** Updates the bell icon badge with the unread count */
    function updateBadge() {
        const notifications = getNotifications();
        const unreadCount   = getUnreadCount(notifications);
        if (unreadCount > 0) { notificationBadge.textContent = unreadCount > 99 ? '99+' : unreadCount; notificationBadge.style.display = 'inline-flex'; }
        else { notificationBadge.style.display = 'none'; }
    }

    /** Converts a ms timestamp to a relative time string */
    function formatTime(timestamp) {
        const diff    = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1)  return 'Just now';
        if (minutes < 60) return minutes + 'm ago';
        const hours = Math.floor(minutes / 60);
        if (hours < 24)   return hours + 'h ago';
        const days = Math.floor(hours / 24);
        return days + 'd ago';
    }

    /** Renders all notifications into the dropdown list */
    function renderNotifications() {
        const notifications = getNotifications();
        if (notifications.length === 0) { notificationList.innerHTML = '<div class="notification-empty">No notifications yet.</div>'; return; }
        notificationList.innerHTML = notifications.slice(0, 20).map(n => {
            const iconMap = { system: '⚙', user: '👤', alert: '⚠', info: 'ℹ' };
            const icon    = iconMap[n.type] || '🔔';
            return `<div class="notification-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
                <div class="notification-icon ${n.type}">${icon}</div>
                <div class="notification-body">
                    <div class="notification-title">${n.title}</div>
                    <div class="notification-message">${n.message}</div>
                    <div class="notification-time">${formatTime(n.time)}</div>
                </div>
                <button class="notification-delete" data-id="${n.id}" title="Delete notification">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4"/></svg>
                </button>
            </div>`;
        }).join('');

        // Mark notification as read on click
        notificationList.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', function(e) {
                if (e.target.closest('.notification-delete')) return;
                const id            = this.getAttribute('data-id');
                const notifications = getNotifications();
                const target        = notifications.find(n => n.id === id);
                if (target && !target.read) { target.read = true; saveNotifications(notifications); updateBadge(); this.classList.remove('unread'); }
            });
        });

        // Delete single notification
        notificationList.querySelectorAll('.notification-delete').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.getAttribute('data-id');
                let notifications = getNotifications();
                notifications = notifications.filter(n => n.id !== id);
                saveNotifications(notifications);
                updateBadge();
                renderNotifications();
            });
        });
    }

    /** Clears all notifications */
    function deleteAllNotifications() { saveNotifications([]); updateBadge(); renderNotifications(); }

    /** Toggles the notification dropdown open/closed */
    function toggleDropdown(e) {
        e.stopPropagation();
        const isShown = notificationDropdown.classList.contains('show');
        if (isShown) { notificationDropdown.classList.remove('show'); }
        else         { renderNotifications(); notificationDropdown.classList.add('show'); }
    }

    /** Closes the notification dropdown */
    function closeDropdown() { notificationDropdown.classList.remove('show'); }

    /** Marks all notifications as read */
    function markAllAsRead() {
        const notifications = getNotifications(); let changed = false;
        notifications.forEach(n => { if (!n.read) { n.read = true; changed = true; } });
        if (changed) { saveNotifications(notifications); updateBadge(); renderNotifications(); }
    }

    // Wire event handlers
    if (notificationBtn)  notificationBtn.addEventListener('click', toggleDropdown);
    if (markAllReadBtn)   markAllReadBtn.addEventListener('click', function(e) { e.stopPropagation(); markAllAsRead(); });
    if (deleteAllBtn)     deleteAllBtn.addEventListener('click', function(e) { e.stopPropagation(); if (confirm('Delete all notifications? This cannot be undone.')) { deleteAllNotifications(); } });
    document.addEventListener('click', function(e) { if (!notificationWrapper.contains(e.target)) { closeDropdown(); } });

    // Seed sample notifications from existing accounts if the list is empty
    let notifications = getNotifications();
    if (notifications.length === 0) {
        const accounts = JSON.parse(localStorage.getItem('ishare_accounts') || '[]');
        const now      = Date.now();
        accounts.slice(0, 3).forEach((acc, index) => {
            notifications.push({ id: 'user-' + (acc.studentId || acc.id) + '-' + index, title: 'New user registered', message: `${acc.fullname} (${acc.email || 'no email'}) joined as ${acc.accountType || 'Student'}.`, type: 'user', time: now - 1000 * 60 * (10 + index * 5), read: false });
        });
        // Fallback: add a system notification if no accounts exist
        if (notifications.length === 0) {
            notifications.push({ id: 'system-1', title: 'No new registrations yet', message: 'When a new user registers, their details will appear here automatically.', type: 'system', time: now - 1000 * 60 * 30, read: false });
        }
        saveNotifications(notifications);
    }
    updateBadge();
}



/**
 * Opens the student detail modal and populates all fields
 * with information from the user record (found by ID).
 * @param {string} id - The user's student ID
 */
function openStudentDetailModal(id) {
    const modal = document.getElementById('studentDetailModal');
    if (!modal) return;
    const user = getUsers().find(u => u.id === id);
    if (!user) { alert('User not found.'); return; }

    // Get references to all modal field elements
    const studentDetailName        = document.getElementById('studentDetailName');
    const studentDetailNameDisplay = document.getElementById('studentDetailNameDisplay');
    const studentDetailEmail       = document.getElementById('studentDetailEmail');
    const studentDetailId          = document.getElementById('studentDetailId');
    const studentDetailDept        = document.getElementById('studentDetailDept');
    const studentDetailEmailFull   = document.getElementById('studentDetailEmailFull');
    const studentDetailStatus      = document.getElementById('studentDetailStatus');
    const studentDetailAccountType = document.getElementById('studentDetailAccountType');
    const studentDetailAccType     = document.getElementById('studentDetailAccType');
    const studentDetailAccStatus   = document.getElementById('studentDetailAccStatus');
    const studentDetailConduct     = document.getElementById('studentDetailConduct');
    const studentDetailWarnings    = document.getElementById('studentDetailWarnings');
    const studentDetailConductNote = document.getElementById('studentDetailConductNote');
    const studentDetailAvatar      = document.getElementById('studentDetailAvatar');

    // Populate text content for each field
    if (studentDetailName)        studentDetailName.textContent        = user.name;
    if (studentDetailNameDisplay) studentDetailNameDisplay.textContent = user.name;
    if (studentDetailEmail)       studentDetailEmail.textContent       = user.email || 'no-email@example.com';
    if (studentDetailId)          studentDetailId.textContent          = 'ID: ' + user.id;
    if (studentDetailDept)        studentDetailDept.textContent        = user.department;
    if (studentDetailEmailFull)   studentDetailEmailFull.textContent   = user.email || 'no-email@example.com';

    // Status indicator with colored dot
    if (studentDetailStatus) {
        studentDetailStatus.className = 'student-detail-status ' + (user.status || 'active').toLowerCase();
        studentDetailStatus.innerHTML = '<span class="status-dot"></span>' + (user.status || 'ACTIVE').toUpperCase();
    }

    if (studentDetailAccountType) studentDetailAccountType.textContent = (user.accountType || 'student').toLowerCase();
    if (studentDetailAccType)     studentDetailAccType.textContent     = (user.accountType || 'student').toLowerCase();
    if (studentDetailAccStatus)   studentDetailAccStatus.textContent   = (user.status || 'active').toUpperCase();

    // Conduct label with CSS class for coloring
    if (studentDetailConduct) {
        studentDetailConduct.className = 'student-detail-value conduct-' + user.conduct;
        const conductLabels            = { clean: 'Clean Record', flagged: 'Flagged', suspended: 'Suspended' };
        studentDetailConduct.textContent = conductLabels[user.conduct] || 'Clean Record';
    }

    if (studentDetailWarnings) studentDetailWarnings.textContent = user.warnings || 0;

    // Conduct note (red if present, grey if not)
    if (studentDetailConductNote) {
        studentDetailConductNote.textContent  = user.conductNote || 'No issues reported.';
        studentDetailConductNote.style.color  = user.conductNote ? '#dc2626' : '#64748b';
        studentDetailConductNote.style.fontWeight = user.conductNote ? '600' : '400';
    }

    // Avatar initials
    if (studentDetailAvatar) studentDetailAvatar.textContent = getInitials(user.name);

    modal.classList.add('show'); // Show the modal
}

/** Closes the student detail modal */
function closeStudentDetailModal() {
    document.getElementById('studentDetailModal').classList.remove('show');
}

// Close student detail modal when clicking the backdrop
document.getElementById('studentDetailModal').addEventListener('click', function(e) {
    if (e.target === this) closeStudentDetailModal();
});



/**
 * Opens the discipline modal for the specified user.
 * Pre-fills all user details and resets action selection to "Formal Warning".
 * @param {string} id - User's student ID
 */
function openDisciplineModal(id) {
    const modal = document.getElementById('disciplineModal');
    if (!modal) return;
    const user = getUsers().find(u => u.id === id);
    if (!user) { alert('User not found.'); return; }

    // Get all modal field references
    const disciplineUserId       = document.getElementById('disciplineUserId');
    const disciplineUserName     = document.getElementById('disciplineUserName');
    const disciplineUserEmail    = document.getElementById('disciplineUserEmail');
    const disciplineUserIdDisplay = document.getElementById('disciplineUserIdDisplay');
    const disciplineUserDept     = document.getElementById('disciplineUserDept');
    const disciplinePriorWarnings = document.getElementById('disciplinePriorWarnings');
    const disciplineEmailSpan    = document.getElementById('disciplineEmailSpan');
    const disciplineCaseId       = document.getElementById('disciplineCaseId');
    const disciplineUserStatus   = document.getElementById('disciplineUserStatus');
    const disciplineUserAvatar   = document.getElementById('disciplineUserAvatar');
    const disciplineReason       = document.getElementById('disciplineReason');
    const disciplineRemarks      = document.getElementById('disciplineRemarks');
    const disciplineEmailNotify  = document.getElementById('disciplineEmailNotify');

    // Populate user info fields
    if (disciplineUserId)        disciplineUserId.value         = id;
    if (disciplineUserName)      disciplineUserName.textContent = user.name;
    if (disciplineUserEmail)     disciplineUserEmail.textContent = user.email || 'no-email@example.com';
    if (disciplineUserIdDisplay) disciplineUserIdDisplay.textContent = 'ID: ' + user.id;
    if (disciplineUserDept)      disciplineUserDept.textContent = user.department;
    if (disciplinePriorWarnings) disciplinePriorWarnings.textContent = 'Prior Warnings: ' + (user.warnings || 0);
    if (disciplineEmailSpan)     disciplineEmailSpan.textContent = user.email || 'no-email@example.com';
    // Generate a unique-looking case ID from the current timestamp
    if (disciplineCaseId)        disciplineCaseId.textContent = Date.now().toString().slice(-8);

    // Status indicator
    if (disciplineUserStatus) {
        disciplineUserStatus.className = 'discipline-user-status ' + (user.status || 'active').toLowerCase();
        disciplineUserStatus.innerHTML = '<span class="status-dot"></span>' + (user.status || 'ACTIVE').toUpperCase();
    }

    if (disciplineUserAvatar) disciplineUserAvatar.textContent = getInitials(user.name);

    // Reset form fields to defaults
    if (disciplineReason)      disciplineReason.value      = '';
    if (disciplineRemarks)     disciplineRemarks.value     = '';
    if (disciplineEmailNotify) disciplineEmailNotify.checked = true;
    document.querySelectorAll('.discipline-option').forEach(o => o.classList.remove('selected'));

    // Pre-select "Formal Warning" as the default action
    const formalWarning       = document.querySelector('.discipline-option input[value="formal-warning"]');
    const formalWarningOption = document.querySelector('.discipline-option[data-value="formal-warning"]');
    if (formalWarning)       formalWarning.checked = true;
    if (formalWarningOption) formalWarningOption.classList.add('selected');

    modal.classList.add('show');
}

/** Closes the discipline modal */
function closeDisciplineModal() {
    document.getElementById('disciplineModal').classList.remove('show');
}


function submitDisciplineAction() {
    const idEl          = document.getElementById('disciplineUserId');
    const reasonEl      = document.getElementById('disciplineReason');
    const remarksEl     = document.getElementById('disciplineRemarks');
    const emailNotifyEl = document.getElementById('disciplineEmailNotify');

    if (!idEl || !reasonEl) return;

    const id             = idEl.value;
    const selectedAction = document.querySelector('.discipline-option input:checked');
    const reason         = reasonEl.value.trim();
    const remarks        = remarksEl ? remarksEl.value.trim() : '';
    const emailNotify    = emailNotifyEl ? emailNotifyEl.checked : true;

    // Validate required fields
    if (!selectedAction) { alert('Please select a disciplinary action.'); return; }
    if (!reason)         { alert('Please provide an official disciplinary reason.'); return; }

    const actionValue = selectedAction.value;
    const actionLabel = selectedAction.closest('.discipline-option').querySelector('.discipline-option-title').textContent.trim();

    let accounts = JSON.parse(localStorage.getItem('ishare_accounts') || '[]');
    const idx    = accounts.findIndex(a => (a.studentId || a.id) === id);
    if (idx < 0) { alert('User not found in system records.'); return; }

    // Generate a case ID and timestamp for this discipline record
    const caseId    = 'DISC-' + Date.now().toString().slice(-8);
    const timestamp = new Date().toISOString();

    // Append to the user's discipline history log
    if (!accounts[idx].disciplineHistory) accounts[idx].disciplineHistory = [];
    accounts[idx].disciplineHistory.push({
        caseId,
        action:      actionValue,
        actionLabel,
        reason,
        remarks,
        emailNotify,
        timestamp,
        admin: localStorage.getItem('ishare_user_name') || 'Admin'
    });

    // Update the user's conduct fields
    accounts[idx].conductNote    = reason;
    accounts[idx].warnings       = (accounts[idx].warnings || 0) + 1;
    accounts[idx].lastDiscipline = timestamp;

    // Apply action-specific effects
    if (actionValue === '7-day-suspension') {
        // Set suspended status with an expiry date 7 days from now
        const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        accounts[idx].status       = 'suspended';
        accounts[idx].suspendedUntil = until;
        accounts[idx].conduct      = 'suspended';
    } else if (actionValue === 'permanent-ban') {
        accounts[idx].status      = 'suspended';
        accounts[idx].conduct     = 'suspended';
        accounts[idx].permanentBan = true;
    } else if (actionValue === 'dismiss-flag') {
        // Clear the flag and remove one warning strike
        accounts[idx].conduct     = 'clean';
        accounts[idx].conductNote = '';
        accounts[idx].warnings    = Math.max(0, (accounts[idx].warnings || 0) - 1);
    } else {
        
        accounts[idx].conduct = 'flagged';
    }

    localStorage.setItem('ishare_accounts', JSON.stringify(accounts));

    // Add a notification entry for the discipline action taken
    const notifications = JSON.parse(localStorage.getItem('ishare_notifications') || '[]');
    notifications.push({
        id:      'discipline-' + Date.now(),
        title:   'Disciplinary action applied',
        message: `${actionLabel} applied to ${accounts[idx].fullname || accounts[idx].name}. Case: ${caseId}`,
        type:    'alert',
        time:    Date.now(),
        read:    false
    });
    localStorage.setItem('ishare_notifications', JSON.stringify(notifications));

    closeDisciplineModal();
    renderTable();
    alert('Disciplinary action recorded successfully. Case ID: ' + caseId);
}



// Allow clicking anywhere on a .discipline-option card to select its radio input
document.querySelectorAll('.discipline-option').forEach(option => {
    option.addEventListener('click', function(e) {
        if (e.target.tagName === 'INPUT') return; // Let native radio behavior handle direct input clicks
        const input = this.querySelector('input');
        input.checked = true;
        // Update visual 'selected' state on all options
        document.querySelectorAll('.discipline-option').forEach(o => o.classList.remove('selected'));
        this.classList.add('selected');
    });
    // Also respond to radio input change events (e.g. keyboard navigation)
    const input = option.querySelector('input');
    if (input) {
        input.addEventListener('change', function() {
            document.querySelectorAll('.discipline-option').forEach(o => o.classList.remove('selected'));
            if (this.checked) option.classList.add('selected');
        });
    }
});

// Close discipline modal by clicking the backdrop
document.getElementById('disciplineModal').addEventListener('click', function(e) {
    if (e.target === this) closeDisciplineModal();
});



// IIFE: handles the mobile hamburger menu toggle and overlay behavior
(function() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar       = document.querySelector('.sidebar');
    const overlay       = document.getElementById('mobileSidebarOverlay');

    /** Closes the mobile sidebar and restores page scroll */
    function closeMobileSidebar() {
        if (sidebar)  sidebar.classList.remove('open');
        if (overlay)  overlay.classList.remove('show');
        document.body.style.overflow = '';
    }

    // Toggle sidebar open/closed on hamburger button click
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function() {
            if (sidebar && sidebar.classList.contains('open')) {
                closeMobileSidebar();
            } else {
                if (sidebar)  sidebar.classList.add('open');
                if (overlay)  overlay.classList.add('show');
                document.body.style.overflow = 'hidden'; // Prevent background scroll
            }
        });
    }

    // Close sidebar when clicking the overlay
    if (overlay) {
        overlay.addEventListener('click', closeMobileSidebar);
    }

    // Close sidebar when a nav item is clicked on mobile (auto-navigate)
    document.querySelectorAll('.sidebar-nav .nav-item, .sidebar-bottom-item').forEach(function(item) {
        item.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                closeMobileSidebar();
            }
        });
    });
})();
