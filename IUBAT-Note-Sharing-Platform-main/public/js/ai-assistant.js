/* ============================================================ */

/* AI Chat Widget "Gemma": a floating chatbot that answers      */
/* platform questions, searches notes/users, detects            */
/* plagiarism, summarizes notes, and gives recommendations.     */
/* All data is read from localStorage (client-side only).       */
/* ============================================================ */

// Wrapped in an IIFE (Immediately Invoked Function Expression)
// to avoid polluting the global scope
(function() {
  'use strict';

  
  var STORAGE_KEY      = 'ishare_ai_chat_history'; // localStorage key for chat history
  var panel            = null;   // Reference to the chat panel DOM element
  var messagesContainer = null;  // Reference to the messages container inside the panel
  var inputEl          = null;   // Reference to the text input element
  var typingEl         = null;   // Reference to the "Gemma is typing..." indicator
  var quickActionsEl   = null;   // Reference to the quick-action buttons container
  var isOpen           = false;  // Tracks whether the chat panel is currently visible

  

  /**
   * Returns the current HTML filename (e.g. "admin-dashboard.html")
   * by reading the last segment of window.location.pathname.
   */
  function getCurrentPage() {
    return (window.location.pathname || '').split('/').pop() || '';
  }

  /**
   * Returns true if the current page is one of the admin pages.
   * Used to customize quick-action buttons and greeting text.
   */
  function isAdminPage() {
    var page = getCurrentPage();
    return page === 'admin-dashboard.html' ||
      page === 'user-management.html' ||
      page === 'department-controls.html' ||
      page === 'announcement-management.html';
  }

  /**
   * Maps HTML filenames to human-readable page names
   * for display in navigation responses.
   */
  function getPageName() {
    var page = getCurrentPage();
    var names = {
      'admin-dashboard.html':       'Platform Overview',
      'user-management.html':       'User Management',
      'department-controls.html':   'Department Controls',
      'announcement-management.html': 'Announcement Management',
      'student-home.html':          'Student Home',
      'student-messaging.html':     'Messaging',
      'student-people.html':        'People'
    };
    return names[page] || page;
  }

  
  // These functions read platform data cached in localStorage.
  // The data is written by other page scripts when users log in.

  /** Returns the list of all registered accounts */
  function getAccounts() {
    try { return JSON.parse(localStorage.getItem('ishare_accounts') || '[]'); }
    catch (e) { return []; }
  }

  /** Returns the list of all shared notes */
  function getNotes() {
    try { return JSON.parse(localStorage.getItem('ishare_notes') || '[]'); }
    catch (e) { return []; }
  }

  /** Returns the list of all announcements */
  function getAnnouncements() {
    try { return JSON.parse(localStorage.getItem('ishare_announcements') || '[]'); }
    catch (e) { return []; }
  }

  /** Returns the list of all departments */
  function getDepartments() {
    try { return JSON.parse(localStorage.getItem('ishare_departments') || '[]'); }
    catch (e) { return []; }
  }

  /** Returns the list of notifications for the current user */
  function getNotifications() {
    try { return JSON.parse(localStorage.getItem('ishare_notifications') || '[]'); }
    catch (e) { return []; }
  }

  

  /**
   * Aggregates platform-wide statistics from localStorage.
   * Returns an object with user, note, download, and like counts.
   */
  function getPlatformStats() {
    var notes         = getNotes();
    var announcements = getAnnouncements();
    var departments   = getDepartments();
    var accounts      = getAccounts();
    var notifications = getNotifications();
    // Sum up total downloads and likes across all notes
    var totalDownloads = notes.reduce(function(sum, n) { return sum + (n.downloads || 0); }, 0);
    var totalLikes     = notes.reduce(function(sum, n) { return sum + (n.likes || 0); }, 0);
    return {
      users:         accounts.length,
      activeUsers:   accounts.filter(function(a) { return a.status === 'active'; }).length,
      notes:         notes.length,
      announcements: announcements.length,
      departments:   departments.length > 0 ? departments.length : 10,
      notifications: notifications.length,
      downloads:     totalDownloads,
      likes:         totalLikes
    };
  }

  

  /**
   * Reads the currently logged-in user's profile from localStorage.
   * Returns an object with userId, name, department, email, accountType.
   */
  function getUserProfile() {
    var userId   = localStorage.getItem('ishare_user_id');
    var userName = localStorage.getItem('ishare_user_name');
    var userDept = localStorage.getItem('ishare_user_department');
    var accounts = getAccounts();
    // Find the full account record to get the email
    var account  = accounts.find(function(a) { return a.studentId === userId; });
    return {
      userId:      userId,
      name:        userName,
      department:  userDept,
      email:       account ? account.email : '',
      accountType: localStorage.getItem('ishare_user_type') || 'Student'
    };
  }

  /**
   * Returns notes authored by the current logged-in user.
   */
  function getCurrentUserNotes() {
    var userId = localStorage.getItem('ishare_user_id');
    var notes  = getNotes();
    return notes.filter(function(n) { return n.authorId === userId; });
  }

  /**
   * Returns list of like keys (userId::noteId) liked by the current user.
   * Used to power personalized recommendations.
   */
  function getUserLikedNotes() {
    try { return JSON.parse(localStorage.getItem('ishare_liked_notes') || '[]'); }
    catch (e) { return []; }
  }

  

  /**
   * Generates up to 3 personalized smart suggestions based on:
   * - Whether the user has posted notes
   * - Whether department has notes
   * - Popular notes and unread notifications
   */
  function getSmartSuggestions() {
    var suggestions = [];
    var stats    = getPlatformStats();
    var user     = getUserProfile();
    var notes    = getNotes();
    var userDept = user.department;
    var userNotes = getCurrentUserNotes();

    // Encourage posting if user hasn't shared any notes yet
    if (userNotes.length === 0 && user.accountType === 'Student') {
      suggestions.push('You haven\'t posted any notes yet. Share your first note to help classmates!');
    }
    // Celebrate early progress and encourage more sharing
    if (userNotes.length > 0 && userNotes.length < 3) {
      suggestions.push('Great start! You\'ve posted ' + userNotes.length + ' notes. Keep sharing to build your profile.');
    }
    // Alert if no notes exist in the user's department
    var deptNotes = userDept ? notes.filter(function(n) { return n.department === userDept; }) : notes;
    if (deptNotes.length === 0) {
      suggestions.push('No notes in your department yet. Be the first to post!');
    }
    // Highlight popular notes (5+ downloads)
    var popularNotes = notes.filter(function(n) { return (n.downloads || 0) > 5; });
    if (popularNotes.length > 0) {
      suggestions.push('There are ' + popularNotes.length + ' popular notes with 5+ downloads. Check them out!');
    }
    // Notify about unread notifications
    var unreadNotifs = getNotifications().filter(function(n) { return !n.read; });
    if (unreadNotifs.length > 0) {
      suggestions.push('You have ' + unreadNotifs.length + ' unread notification(s).');
    }
    // Helpful tip for students
    if (user.accountType === 'Student') {
      suggestions.push('Tip: Use "recommend notes" to get personalized suggestions based on your department.');
    }
    return suggestions.slice(0, 3); // Return at most 3 suggestions
  }

  

  /**
   * Generates a summary of the current conversation history:
   * - Total message count
   * - Topics detected via keyword matching
   * - Last 4 messages preview
   */
  function generateChatSummary() {
    var history = getHistory();
    if (history.length === 0) return 'No conversation history yet. Start chatting with Gemma!';
    var userMessages      = history.filter(function(m) { return m.role === 'user'; });
    var assistantMessages = history.filter(function(m) { return m.role === 'assistant'; });

    // Extract topics mentioned by the user using keyword matching
    var topics = [];
    userMessages.forEach(function(m) {
      var lower = m.text.toLowerCase();
      if (lower.indexOf('note') !== -1)          topics.push('notes');
      if (lower.indexOf('user') !== -1)          topics.push('users');
      if (lower.indexOf('department') !== -1)    topics.push('departments');
      if (lower.indexOf('announcement') !== -1)  topics.push('announcements');
      if (lower.indexOf('dashboard') !== -1 || lower.indexOf('stat') !== -1) topics.push('dashboard stats');
      if (lower.indexOf('health') !== -1)        topics.push('system health');
      if (lower.indexOf('search') !== -1)        topics.push('search');
      if (lower.indexOf('summar') !== -1)        topics.push('summarization');
      if (lower.indexOf('plagiar') !== -1)       topics.push('plagiarism');
      if (lower.indexOf('recommend') !== -1)     topics.push('recommendations');
    });

    // Deduplicate topics list
    var uniqueTopics = [];
    topics.forEach(function(t) { if (uniqueTopics.indexOf(t) === -1) uniqueTopics.push(t); });

    // Build the summary string
    var summary = 'Conversation Summary:\n';
    summary += '- Total messages: ' + history.length + '\n';
    summary += '- Your questions: ' + userMessages.length + '\n';
    summary += '- My replies: ' + assistantMessages.length + '\n';
    if (uniqueTopics.length > 0) {
      summary += '- Topics discussed: ' + uniqueTopics.join(', ') + '\n';
    }
    summary += '\nRecent activity:';
    // Show last 4 messages as a preview
    var recent = history.slice(-4);
    recent.forEach(function(m) {
      summary += '\n' + (m.role === 'user' ? 'You' : 'Gemma') + ': ' + m.text.slice(0, 60) + (m.text.length > 60 ? '...' : '');
    });
    return summary;
  }

  

  /**
   * Searches notes by keyword across title, courseCode, description, and author.
   * Filters by the current user's department if available.
   * Returns up to 5 matching notes.
   */
  function aiSearchNotes(query) {
    var notes = getNotes();
    var currentUserDept = localStorage.getItem('ishare_user_department');
    // Filter to current department if applicable
    var deptFiltered = currentUserDept ? notes.filter(function(n) { return n.department === currentUserDept; }) : notes;
    var lowerQuery = (query || '').toLowerCase();
    var results = deptFiltered.filter(function(n) {
      return (n.title       || '').toLowerCase().indexOf(lowerQuery) !== -1 ||
             (n.courseCode  || '').toLowerCase().indexOf(lowerQuery) !== -1 ||
             (n.description || '').toLowerCase().indexOf(lowerQuery) !== -1 ||
             (n.author      || '').toLowerCase().indexOf(lowerQuery) !== -1;
    });
    return results.slice(0, 5);
  }

  /**
   * Searches registered accounts by name, student ID, or department.
   * Returns up to 5 matching users.
   */
  function aiSearchUsers(query) {
    var accounts   = getAccounts();
    var lowerQuery = (query || '').toLowerCase();
    return accounts.filter(function(a) {
      return (a.fullname   || '').toLowerCase().indexOf(lowerQuery) !== -1 ||
             (a.studentId  || '').toLowerCase().indexOf(lowerQuery) !== -1 ||
             (a.department || '').toLowerCase().indexOf(lowerQuery) !== -1;
    }).slice(0, 5);
  }

  /**
   * Searches announcements by title or body text.
   * Returns up to 5 matching announcements.
   */
  function aiSearchAnnouncements(query) {
    var announcements = getAnnouncements();
    var lowerQuery    = (query || '').toLowerCase();
    return announcements.filter(function(a) {
      return (a.title || '').toLowerCase().indexOf(lowerQuery) !== -1 ||
             (a.body  || '').toLowerCase().indexOf(lowerQuery) !== -1;
    }).slice(0, 5);
  }

  

  /**
   * Produces a simple extractive summary of note text:
   * - If 2 or fewer sentences: truncates to 150 chars.
   * - Otherwise: extracts the first 3 sentences as key points.
   */
  function summarizeNoteText(text) {
    if (!text || text.trim().length === 0) return 'No content to summarize.';
    var words     = text.trim().split(/\s+/);
    var sentences = text.split(/[.!?]+/).filter(function(s) { return s.trim().length > 0; });

    if (sentences.length <= 2) {
      return 'Summary: ' + text.trim().slice(0, 150) + (text.trim().length > 150 ? '...' : '');
    }
    var summary   = 'Key Points:\n';
    var keyPoints = sentences.slice(0, 3).map(function(s) { return '- ' + s.trim(); });
    summary += keyPoints.join('\n');
    if (sentences.length > 3) {
      summary += '\n... and ' + (sentences.length - 3) + ' more point(s).';
    }
    return summary;
  }

  

  /**
   * Checks a note for similarity against all other notes using
   * word-overlap ratio. Notes with > 20% overlap are flagged.
   * Returns a formatted result string with similarity percentages.
   * @param {number|string} noteId - ID of the note to check
   */
  function checkPlagiarism(noteId) {
    var notes      = getNotes();
    var targetNote = notes.find(function(n) { return n.id === noteId; });
    if (!targetNote) return 'Note not found. Provide a valid note ID or title.';

    // Build a word list for the target note (words longer than 3 chars only)
    var targetText  = ((targetNote.title || '') + ' ' + (targetNote.description || '')).toLowerCase();
    var targetWords = targetText.split(/\s+/).filter(function(w) { return w.length > 3; });

    var similarNotes = [];
    notes.forEach(function(n) {
      if (n.id === noteId) return; // Skip self-comparison
      var otherText  = ((n.title || '') + ' ' + (n.description || '')).toLowerCase();
      var otherWords = otherText.split(/\s+/).filter(function(w) { return w.length > 3; });
      // Count words that appear in both notes
      var commonWords = targetWords.filter(function(w) { return otherWords.indexOf(w) !== -1; });
      var similarity  = targetWords.length > 0 ? Math.round((commonWords.length / targetWords.length) * 100) : 0;
      if (similarity > 20) {
        similarNotes.push({ title: n.title || 'Untitled', author: n.author || 'Unknown', similarity: similarity, courseCode: n.courseCode || '' });
      }
    });

    // Sort by similarity (highest first)
    similarNotes.sort(function(a, b) { return b.similarity - a.similarity; });

    if (similarNotes.length === 0) {
      return 'Plagiarism Check Result:\n- No similar notes found.\n- This content appears to be unique.\n- Similarity: 0%';
    }

    var result = 'Plagiarism Check Result:\n';
    result += 'Found ' + similarNotes.length + ' similar note(s):\n\n';
    similarNotes.slice(0, 3).forEach(function(s) {
      result += '- "' + s.title + '" by ' + s.author + ' (' + s.courseCode + ')\n';
      result += '  Similarity: ' + s.similarity + '%\n';
    });

    // Calculate and display the average similarity score
    var avgSimilarity = Math.round(similarNotes.reduce(function(sum, s) { return sum + s.similarity; }, 0) / similarNotes.length);
    result += '\nOverall Similarity: ' + avgSimilarity + '%\n';
    if (avgSimilarity > 50) {
      result += 'Warning: High similarity detected. Please review and ensure original work.';
    } else if (avgSimilarity > 30) {
      result += 'Note: Moderate similarity. Consider adding more original content.';
    } else {
      result += 'Status: Acceptable similarity level.';
    }
    return result;
  }

  

  
  function getRecommendations() {
    var user      = getUserProfile();
    var notes     = getNotes();
    var userDept  = user.department;
    var userId    = user.userId;
    var likedNotes   = getUserLikedNotes();
    var userNoteIds  = getCurrentUserNotes().map(function(n) { return n.id; });
    var recommended  = [];

    if (userDept) {
      // 1. Top department notes (sorted by downloads), excluding user's own
      var deptNotes = notes.filter(function(n) { return n.department === userDept && n.authorId !== userId; });
      deptNotes.sort(function(a, b) { return (b.downloads || 0) - (a.downloads || 0); });
      recommended = recommended.concat(deptNotes.slice(0, 3));
    }

    // 2. Popular notes across the platform (>2 likes), not already in list
    var popularNotes = notes.filter(function(n) { return (n.likes || 0) > 2 && recommended.indexOf(n) === -1; });
    popularNotes.sort(function(a, b) { return (b.likes || 0) - (a.likes || 0); });
    recommended = recommended.concat(popularNotes.slice(0, 2));

    // 3. Notes in same courses as previously liked notes
    if (likedNotes.length > 0) {
      var likedNoteObjects = notes.filter(function(n) { return likedNotes.indexOf(userId + '::' + n.id) !== -1; });
      likedNoteObjects.forEach(function(ln) {
        var similar = notes.filter(function(n) {
          return n.courseCode === ln.courseCode && n.id !== ln.id && recommended.indexOf(n) === -1;
        });
        recommended = recommended.concat(similar.slice(0, 1));
      });
    }

    return recommended.slice(0, 5); // Return at most 5 recommendations
  }

  

  /**
   * Runs a series of client-side health checks:
   * - localStorage availability
   * - Page load state
   * - User data integrity
   * - Notes data integrity
   * Returns a health result object with pass/fail details.
   */
  function checkSystemHealth() {
    var checks = [];
    var passed = 0;

    // Test 1: localStorage read/write
    try {
      localStorage.setItem('ishare_health_check', 'ok');
      localStorage.removeItem('ishare_health_check');
      checks.push({ name: 'LocalStorage', status: 'pass' });
      passed++;
    } catch (e) {
      checks.push({ name: 'LocalStorage', status: 'fail' });
    }

    // Test 2: Page fully loaded
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      checks.push({ name: 'Page Load', status: 'pass' });
      passed++;
    } else {
      checks.push({ name: 'Page Load', status: 'fail' });
    }

    // Test 3: User data is valid JSON array
    try {
      var accounts = JSON.parse(localStorage.getItem('ishare_accounts') || '[]');
      if (Array.isArray(accounts)) { checks.push({ name: 'User Data', status: 'pass' }); passed++; }
      else { checks.push({ name: 'User Data', status: 'fail' }); }
    } catch (e) {
      checks.push({ name: 'User Data', status: 'fail' });
    }

    // Test 4: Notes data is valid JSON array
    try {
      var notes = JSON.parse(localStorage.getItem('ishare_notes') || '[]');
      if (Array.isArray(notes)) { checks.push({ name: 'Notes Data', status: 'pass' }); passed++; }
      else { checks.push({ name: 'Notes Data', status: 'fail' }); }
    } catch (e) {
      checks.push({ name: 'Notes Data', status: 'fail' });
    }

    var percent = Math.round((passed / checks.length) * 100);
    return {
      percent:        percent,
      passed:         passed,
      total:          checks.length,
      allOperational: passed === checks.length,
      checks:         checks
    };
  }

  
  // A map of trigger keywords to formatted response strings.
  // These are evaluated lazily using functions where live data is needed.
  var localResponses = {
    'hello': 'Hello! I am Gemma, your AI assistant. I can answer almost anything — from platform help to general questions. What would you like to ask?',
    'hi':    'Hi! I am Gemma. Ask me anything — platform questions, study tips, admin tasks, or general knowledge.',
    'help':  'I can help you with:\n- Platform navigation & features\n- Notes, downloads, posting\n- Admin dashboard, users, departments\n- Announcements & notifications\n- AI Search (notes, users, announcements)\n- Note Summarization\n- Plagiarism Detection\n- AI Recommendations\n- General questions\n\nTry asking naturally.',

    // Live stats injected at response time
    'dashboard stats': '📊 Platform Overview:\n\n' +
      '👥 Total Users: '     + getPlatformStats().users         + '\n' +
      '✅ Active Users: '    + getPlatformStats().activeUsers   + '\n' +
      '📝 Total Notes: '     + getPlatformStats().notes         + '\n' +
      '📢 Announcements: '   + getPlatformStats().announcements + '\n' +
      '🏛️ Departments: '     + getPlatformStats().departments   + '\n' +
      '📥 Downloads: '       + getPlatformStats().downloads     + '\n' +
      '👍 Likes: '           + getPlatformStats().likes         + '\n' +
      '🔔 Notifications: '   + getPlatformStats().notifications,

    'system health': '🔍 System Health:\n\n' +
      'Overall: ' + (checkSystemHealth().allOperational ? '✅ All Systems Operational' : '⚠️ Partial') + '\n' +
      'Uptime Score: ' + checkSystemHealth().percent + '.9%\n\n' +
      'Checks:\n' + checkSystemHealth().checks.map(function(c) {
        return '- ' + c.name + ': ' + (c.status === 'pass' ? '✅ OK' : '❌ Fail');
      }).join('\n'),

    'users': '👥 User Management:\n\n' +
      '• View all users in User Management page\n' +
      '• Filter by status: Active, Suspended, Flagged\n' +
      '• Export data as JSON\n' +
      '• Take disciplinary actions\n\n' +
      'Current: ' + getPlatformStats().users + ' users (' + getPlatformStats().activeUsers + ' active)',

    'export users': '💾 Export User Data:\n\n' +
      '1. Go to Admin Dashboard or User Management\n' +
      '2. Click "Export Auth Data"\n' +
      '3. JSON file downloads automatically\n\n' +
      'Filename: ishare_auth_data_YYYY-MM-DD.json',

    'departments': '🏛️ Department Controls:\n\n' +
      '• Enable/disable departments\n' +
      '• Edit, duplicate, delete departments\n' +
      '• Add new departments\n\n' +
      'Current: ' + getPlatformStats().departments + ' departments\n\n' +
      'Go to Department Controls to manage.',

    'announcements': '📢 Announcement Management:\n\n' +
      '• Create notices for departments or all students\n' +
      '• Pin important announcements\n' +
      '• Edit/delete notices\n\n' +
      'Current: ' + getPlatformStats().announcements + ' announcements\n\n' +
      'Navigate to Announcement Management.',

    'create notice': '📝 Create Notice:\n\n' +
      '1. Go to Announcement Management\n' +
      '2. Click "New Notice"\n' +
      '3. Fill title, details, audience\n' +
      '4. Check "Pin to Top" if important\n' +
      '5. Click "Publish Notice"',

    'flagged users': '⚠️ Flagged Users:\n\n' +
      '• Filter by "Abusive Language Flagged" tab\n' +
      '• Review and take action\n\n' +
      'Disciplinary Steps:\n' +
      '1. Formal Warning\n' +
      '2. Mute Posting (7 days)\n' +
      '3. 7-Day Suspension\n' +
      '4. Permanent Ban\n' +
      '5. Dismiss Flag',

    'disciplinary actions': '⚖️ Disciplinary Actions:\n\n' +
      '1. Formal Warning - strike count + warning banner\n' +
      '2. Mute Posting - blocks uploads for 7 days\n' +
      '3. 7-Day Suspension - locks account\n' +
      '4. Permanent Ban - requires Dean override\n' +
      '5. Dismiss Flag - clears false positive',

    'navigation': '🧭 Quick Navigation:\n\n' +
      'Current: ' + getPageName() + '\n\n' +
      'Admin Pages:\n' +
      '• "Go to dashboard"\n' +
      '• "Go to users"\n' +
      '• "Go to departments"\n' +
      '• "Go to announcements"',

    'logout': '🚪 To log out:\n\n' +
      '• Click "Log Out" in sidebar\n' +
      '• Redirected to login page\n' +
      '• Session cleared',

    'gemma': 'I am Gemma, your AI assistant for iShare. I can answer questions about the platform, help with admin tasks, and even general questions. How can I help you today?',

    'tips': '💡 Tips:\n\n' +
      '• Use "dashboard stats" for overview\n' +
      '• Use "system health" to check status\n' +
      '• Use "export users" for backup\n' +
      '• Pin important announcements\n' +
      '• Review flagged users weekly',

    // Dynamic responses that call other functions
    'chat history summary': '📋 Chat History Summary:\n\n' + generateChatSummary(),
    'smart suggestions':    '💡 Smart Suggestions:\n\n' + getSmartSuggestions().map(function(s) { return '- ' + s; }).join('\n'),
    'ai search': '🔍 AI Search:\n\nI can search across notes, users, and announcements.\n\nTry asking:\n- "Search notes for CSE321"\n- "Search users named Ahmed"\n- "Search announcements about exam"\n\nWhat would you like to search for?',
    'note summarization': '📝 Note Summarization:\n\nI can summarize note content into key points.\n\nUsage:\n- "Summarize note [title or ID]"\n- "Give me a summary of [topic]"\n\nTry it with a note title or topic!',
    'plagiarism detection': '🔍 Plagiarism Detection:\n\nI can check if a note has similar content to other notes.\n\nUsage:\n- "Check plagiarism for note [title or ID]"\n- "Is this note original?"\n\nNote: This is a basic similarity check based on word overlap.',

    // AI-powered note recommendations list
    'ai recommendations': '🎯 AI Recommendations:\n\nHere are some notes recommended for you based on your department and interests:\n\n' + getRecommendations().map(function(n, i) {
      return (i + 1) + '. "' + (n.title || 'Untitled') + '" by ' + (n.author || 'Unknown') + ' (' + (n.courseCode || 'General') + ') - ' + (n.downloads || 0) + ' downloads';
    }).join('\n') + '\n\nClick on any note in the feed to download it!',

    'default': '' // Fallback (unused, but kept for map completeness)
  };

  

  /**
   * Analyzes a user message and returns the best matching response.
   * Uses keyword detection (not ML) to route messages.
   * Returns null if no match is found (triggers fallback text).
   * @param {string} message - Raw user input
   */
  function getLocalResponse(message) {
    var lower = message.toLowerCase().trim();

    // Check for chat history/conversation summary requests
    if (lower.indexOf('summary') !== -1 && (lower.indexOf('chat') !== -1 || lower.indexOf('history') !== -1 || lower.indexOf('conversation') !== -1)) {
      return localResponses['chat history summary'];
    }
    // Smart suggestions / tips
    if (lower.indexOf('suggestion') !== -1 || lower.indexOf('smart tip') !== -1 || lower.indexOf('recommendation') !== -1 && lower.indexOf('note') === -1) {
      return localResponses['smart suggestions'];
    }
    // Search notes by keyword
    if (lower.indexOf('search note') !== -1 || lower.indexOf('find note') !== -1 || lower.indexOf('look for note') !== -1) {
      var noteQuery   = lower.replace(/search note|find note|look for note|for|notes|note/gi, '').trim();
      var noteResults = aiSearchNotes(noteQuery);
      if (noteResults.length === 0) return 'No notes found matching "' + noteQuery + '". Try a different keyword.';
      var noteReply = '🔍 Found ' + noteResults.length + ' note(s):\n\n';
      noteResults.forEach(function(n, i) {
        noteReply += (i + 1) + '. "' + (n.title || 'Untitled') + '" by ' + (n.author || 'Unknown') + ' (' + (n.courseCode || 'General') + ')\n';
      });
      noteReply += '\nGo to the Home page to view and download these notes.';
      return noteReply;
    }
    // Search users by name/ID/department
    if (lower.indexOf('search user') !== -1 || lower.indexOf('find user') !== -1 || lower.indexOf('look for user') !== -1) {
      var userQuery   = lower.replace(/search user|find user|look for user|for|users|user/gi, '').trim();
      var userResults = aiSearchUsers(userQuery);
      if (userResults.length === 0) return 'No users found matching "' + userQuery + '".';
      var userReply = '👥 Found ' + userResults.length + ' user(s):\n\n';
      userResults.forEach(function(u, i) {
        userReply += (i + 1) + '. ' + (u.fullname || 'Unknown') + ' (' + (u.studentId || 'N/A') + ') - ' + (u.department || 'N/A') + '\n';
      });
      return userReply;
    }
    // Search announcements by keyword
    if (lower.indexOf('search announcement') !== -1 || lower.indexOf('find announcement') !== -1 || lower.indexOf('look for announcement') !== -1) {
      var annQuery   = lower.replace(/search announcement|find announcement|look for announcement|for|announcements|announcement|notice/gi, '').trim();
      var annResults = aiSearchAnnouncements(annQuery);
      if (annResults.length === 0) return 'No announcements found matching "' + annQuery + '".';
      var annReply = '📢 Found ' + annResults.length + ' announcement(s):\n\n';
      annResults.forEach(function(a, i) {
        annReply += (i + 1) + '. ' + (a.title || 'Untitled') + '\n' + (a.body || '').slice(0, 80) + '\n\n';
      });
      return annReply;
    }
    // Note summarization request
    if (lower.indexOf('summarize') !== -1 || lower.indexOf('summary of') !== -1 || lower.indexOf('summarise') !== -1) {
      var summaryQuery = lower.replace(/summarize|summary of|summarise|note|notes|for|about/gi, '').trim();
      var notes = getNotes();
      var targetNote = notes.find(function(n) {
        return (n.title || '').toLowerCase().indexOf(summaryQuery) !== -1 || n.id === summaryQuery;
      });
      if (!targetNote) {
        return 'Note not found. Try "summarize [note title]" or "summarize [note ID]".\n\nAvailable notes:\n' + notes.slice(0, 5).map(function(n, i) {
          return (i + 1) + '. ' + (n.title || 'Untitled') + ' (ID: ' + n.id + ')';
        }).join('\n');
      }
      var summaryText = ((targetNote.description || '') + ' ' + (targetNote.title || '')).trim();
      return '📝 Summary of "' + (targetNote.title || 'Untitled') + '":\n\n' + summarizeNoteText(summaryText) + '\n\nCourse: ' + (targetNote.courseCode || 'N/A') + '\nAuthor: ' + (targetNote.author || 'Unknown');
    }
    // Plagiarism check request
    if (lower.indexOf('plagiarism') !== -1 || lower.indexOf('plagiar') !== -1 || lower.indexOf('check similarity') !== -1 || lower.indexOf('originality') !== -1) {
      var plagQuery = lower.replace(/plagiarism|plagiar|check|for|note|notes|similarity|originality|is this/gi, '').trim();
      var notes = getNotes();
      var targetNote = notes.find(function(n) {
        return (n.title || '').toLowerCase().indexOf(plagQuery) !== -1 || n.id === plagQuery;
      });
      if (!targetNote) {
        return 'Please specify a note. Usage: "check plagiarism for [note title or ID]".\n\nYour notes:\n' + getCurrentUserNotes().slice(0, 5).map(function(n, i) {
          return (i + 1) + '. ' + (n.title || 'Untitled') + ' (ID: ' + n.id + ')';
        }).join('\n');
      }
      return checkPlagiarism(targetNote.id);
    }
    // Note recommendations
    if (lower.indexOf('recommend') !== -1 || lower.indexOf('suggestion') !== -1 && lower.indexOf('smart') === -1) {
      return localResponses['ai recommendations'];
    }
    // Dashboard / stats overview
    if (lower.indexOf('dashboard') !== -1 || lower.indexOf('overview') !== -1 || lower.indexOf('stats') !== -1) {
      return localResponses['dashboard stats'];
    }
    // System health check
    if (lower.indexOf('system health') !== -1 || lower.indexOf('health check') !== -1 || lower.indexOf('system status') !== -1) {
      return localResponses['system health'];
    }
    // User data export
    if (lower.indexOf('export') !== -1 && lower.indexOf('user') !== -1) {
      return localResponses['export users'];
    }
    // User management
    if (lower.indexOf('user') !== -1 && (lower.indexOf('manage') !== -1 || lower.indexOf('export') !== -1 || lower.indexOf('list') !== -1 || lower.indexOf('view') !== -1)) {
      return localResponses['users'];
    }
    // Department info
    if (lower.indexOf('department') !== -1) { return localResponses['departments']; }
    // Announcements
    if (lower.indexOf('announcement') !== -1 || lower.indexOf('notice') !== -1) {
      if (lower.indexOf('create') !== -1 || lower.indexOf('new') !== -1 || lower.indexOf('post') !== -1) {
        return localResponses['create notice'];
      }
      return localResponses['announcements'];
    }
    // Flagged / abusive users
    if (lower.indexOf('flagged') !== -1 || lower.indexOf('abuse') !== -1 || lower.indexOf('flag') !== -1) {
      return localResponses['flagged users'];
    }
    // Disciplinary actions
    if (lower.indexOf('disciplinary') !== -1 || lower.indexOf('warning') !== -1 || lower.indexOf('strike') !== -1 || lower.indexOf('mute') !== -1 || lower.indexOf('suspension') !== -1 || lower.indexOf('ban') !== -1) {
      return localResponses['disciplinary actions'];
    }
    // Navigation help
    if (lower.indexOf('navigate') !== -1 || lower.indexOf('go to') !== -1 || lower.indexOf('page') !== -1) {
      return localResponses['navigation'];
    }
    // Logout instructions
    if (lower.indexOf('logout') !== -1) { return localResponses['logout']; }
    // General help
    if (lower.indexOf('help') !== -1)   { return localResponses['help'];   }
    // Greetings
    if (lower.indexOf('hello') !== -1 || lower === 'hi' || lower.indexOf('hi ') !== -1) {
      return localResponses['hello'];
    }
    // About Gemma
    if (lower.indexOf('gemma') !== -1)  { return localResponses['gemma'];  }
    // Tips
    if (lower.indexOf('tip') !== -1 || lower.indexOf('best practice') !== -1) {
      return localResponses['tips'];
    }

    // Fallback: scan all response keys for any partial match
    for (var key in localResponses) {
      if (lower.indexOf(key) !== -1) {
        return localResponses[key];
      }
    }
    return null; 
  }

  

  /**
   * Reads the chat history array from localStorage.
   * Returns an empty array if parsing fails.
   */
  function getHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }

  /**
   * Appends a new message to the chat history in localStorage.
   * Keeps only the last 100 messages to prevent storage overflow.
   * @param {string} role - 'user' or 'assistant'
   * @param {string} text - The message content
   */
  function saveMessage(role, text) {
    var history = getHistory();
    history.push({ role: role, text: text, time: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-100)));
  }

  

  /**
   * Creates and appends a chat bubble to the messages container.
   * @param {string} role - 'user' or 'assistant' (controls bubble alignment/color)
   * @param {string} text - The message text to display
   */
  function renderMessage(role, text) {
    var bubble = document.createElement('div');
    bubble.className = 'ai-chat-bubble ' + role;
    bubble.textContent = text; // Using textContent to prevent XSS
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight; // Auto-scroll to bottom
  }

  /**
   * Renders the full chat history into the messages container.
   * If there are no messages, shows a welcome screen with smart suggestions.
   */
  function renderHistory() {
    var history = getHistory();
    if (history.length === 0) {
      // Show welcome message (different for admin vs student pages)
      var welcomeText = isAdminPage()
        ? 'Hi! I am Gemma, your admin assistant.\nI can answer almost any question about iShare. Try asking naturally!'
        : 'Hi! I am Gemma, your AI assistant.\nI can answer almost any question. Try asking naturally!';
      messagesContainer.innerHTML = '<div class="ai-chat-empty"><div class="ai-chat-empty-icon">&#128172;</div>' + welcomeText.replace(/\n/g, '<br>') + '</div>';

      // Append smart suggestion cards below welcome text
      var smartDiv = document.createElement('div');
      smartDiv.className = 'ai-chat-smart-suggestions';
      var suggestions = getSmartSuggestions();
      if (suggestions.length > 0) {
        smartDiv.innerHTML = '<div class="ai-chat-suggestions-title">💡 Smart Suggestions</div>' +
          suggestions.map(function(s) { return '<div class="ai-chat-suggestion-item">' + s + '</div>'; }).join('');
        messagesContainer.appendChild(smartDiv);
      }
      return;
    }
    // Render existing message history
    messagesContainer.innerHTML = '';
    history.forEach(function(msg) {
      renderMessage(msg.role, msg.text);
    });
  }

  /**
   * Renders context-sensitive quick-action buttons below the messages.
   * Buttons differ depending on whether the user is on an admin or student page.
   */
  function renderQuickActions() {
    if (!quickActionsEl) return;
    var actions = [];

    if (isAdminPage()) {
      // Admin page-specific quick actions
      var page = getCurrentPage();
      if (page === 'admin-dashboard.html') {
        actions = ['Dashboard stats', 'System health', 'All users', 'Export data', 'Departments', 'Announcements'];
      } else if (page === 'user-management.html') {
        actions = ['All users', 'Flagged users', 'Export users', 'Disciplinary actions', 'Search user'];
      } else if (page === 'department-controls.html') {
        actions = ['All departments', 'Add department', 'Enable/disable', 'Department stats'];
      } else if (page === 'announcement-management.html') {
        actions = ['All notices', 'Create notice', 'Pin notice', 'Search notices'];
      } else {
        actions = ['Dashboard stats', 'System health', 'All users', 'Departments', 'Announcements'];
      }
    } else {
      // Student page quick actions
      actions = ['Find notes', 'How to post', 'How to download', 'Profile help', 'Search notes', 'Summarize note', 'Check plagiarism', 'Recommend notes'];
    }

    // Render quick-action buttons and bind click handlers
    quickActionsEl.innerHTML = actions.map(function(action) {
      return '<button class="ai-chat-quick-btn" type="button">' + action + '</button>';
    }).join('');

    quickActionsEl.querySelectorAll('.ai-chat-quick-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        inputEl.value = btn.textContent.trim(); // Pre-fill input with button text
        sendMessage();                           // Send immediately
      });
    });
  }

  

  /**
   * Reads the input field, renders the user's message, shows a typing
   * indicator for 300ms, then renders the AI's response.
   */
  function sendMessage() {
    var text = inputEl.value.trim();
    if (!text) return; // Do nothing on empty input
    inputEl.value = '';
    renderMessage('user', text);
    saveMessage('user', text);

    // Show "typing" indicator while response is being prepared
    typingEl.classList.add('show');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    setTimeout(function() {
      typingEl.classList.remove('show');
      var reply = getLocalResponse(text);
      if (reply) {
        renderMessage('assistant', reply);
        saveMessage('assistant', reply);
      } else {
        // Default fallback when no matching response is found
        renderMessage('assistant', 'I don\'t have a specific answer for that right now. Try one of the quick actions below, or ask about dashboard, users, departments, announcements, or system health.');
      }
    }, 300); // 300ms simulated "thinking" delay
  }

  

  /**
   * Builds and injects the AI chat panel into the DOM.
   * This is called lazily on first open to avoid unnecessary DOM work.
   * Also creates and appends the floating trigger button.
   */
  function createPanel() {
    // Inject the ai-assistant.css stylesheet if not already present
    if (!document.getElementById('ai-assistant-styles')) {
      var link   = document.createElement('link');
      link.id    = 'ai-assistant-styles';
      link.rel   = 'stylesheet';
      link.href  = 'ai-assistant.css';
      document.head.appendChild(link);
    }

    // Create the floating trigger button (the chat bubble icon in the corner)
    var trigger = document.createElement('button');
    trigger.className = 'ai-chat-trigger';
    trigger.type      = 'button';
    trigger.setAttribute('aria-label', 'Open AI Assistant');
    trigger.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg><span class="pulse-ring"></span>';

    // Build the full chat panel HTML structure
    panel = document.createElement('div');
    panel.className = 'ai-chat-panel';
    panel.innerHTML =
      '<div class="ai-chat-header">' +
        '<div class="ai-chat-header-left">' +
          '<div class="ai-chat-header-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></div>' +
          '<div><div class="ai-chat-header-title">AI Gemma Assistant</div><div class="ai-chat-header-sub">' + (isAdminPage() ? 'Admin Mode' : 'Online') + '</div></div>' +
        '</div>' +
        '<button class="ai-chat-close" type="button" aria-label="Close chat"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
      '</div>' +
      '<div class="ai-chat-messages"></div>' +
      '<div class="ai-chat-typing">Gemma is typing...</div>' +
      '<div class="ai-chat-quick-actions"></div>' +
      '<div class="ai-chat-input-area">' +
        '<input type="text" class="ai-chat-input" placeholder="Ask Gemma anything..." autocomplete="off">' +
        '<button class="ai-chat-send" type="button" aria-label="Send message"><svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>' +
      '</div>';

    document.body.appendChild(trigger);
    document.body.appendChild(panel);

    // Cache references to frequently accessed panel elements
    messagesContainer = panel.querySelector('.ai-chat-messages');
    inputEl           = panel.querySelector('.ai-chat-input');
    typingEl          = panel.querySelector('.ai-chat-typing');
    quickActionsEl    = panel.querySelector('.ai-chat-quick-actions');

    // Trigger button: toggle panel on click
    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      togglePanel();
    });

    // Close button: close the panel
    panel.querySelector('.ai-chat-close').addEventListener('click', function(e) {
      e.stopPropagation();
      closePanel();
    });

    // Send button: send the typed message
    panel.querySelector('.ai-chat-send').addEventListener('click', function(e) {
      e.stopPropagation();
      sendMessage();
    });

    // Pressing Enter in the input field also sends the message
    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });

    // Prevent clicks inside the panel from bubbling to document (which closes it)
    panel.addEventListener('click', function(e) {
      e.stopPropagation();
    });

    
    document.addEventListener('click', function(e) {
      if (isOpen && !panel.contains(e.target) && e.target !== trigger) {
        closePanel();
      }
    });

    
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isOpen) {
        closePanel();
      }
    });

    // Render existing history and quick-action buttons immediately
    renderHistory();
    renderQuickActions();
  }

  

  /** Toggles the panel between open and closed states */
  function togglePanel() {
    if (isOpen) { closePanel(); } else { openPanel(); }
  }

  /**
   * Opens the chat panel (creates it if not yet initialized).
   * Focuses the input field after opening.
   */
  function openPanel() {
    if (!panel) createPanel(); // Lazy initialization
    panel.classList.add('show');
    isOpen = true;
    if (inputEl) inputEl.focus();
    renderHistory();
    renderQuickActions();
  }

  /** Hides the chat panel */
  function closePanel() {
    if (panel) panel.classList.remove('show');
    isOpen = false;
  }

  // Expose panel control functions globally for use by other scripts
  window.openAIPanel   = openPanel;
  window.closeAIPanel  = closePanel;
  window.toggleAIPanel = togglePanel;

  

  /**
   * Scans the page for any buttons with "AI assistant" or "Gemma" in their
   * text and wires them to toggle the chat panel.
   * Also handles sidebar AI elements with the '.sidebar-ai' class.
   */
  function wireExistingButtons() {
    // Wire any button mentioning "ai assistant" or "gemma"
    var buttons = document.querySelectorAll('button');
    buttons.forEach(function(btn) {
      var text = (btn.textContent || '').toLowerCase();
      if (text.indexOf('ai assistant') !== -1 || text.indexOf('gemma') !== -1) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          togglePanel();
        });
        btn.setAttribute('type', 'button');
      }
    });

    // Wire .sidebar-ai elements (clickable sidebar items)
    var sidebarAI = document.querySelectorAll('.sidebar-ai');
    sidebarAI.forEach(function(el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        togglePanel();
      });
    });
  }

  
  // Create the panel and wire buttons once the DOM is ready
  if (document.readyState === 'loading') {
    
    document.addEventListener('DOMContentLoaded', function() {
      createPanel();
      wireExistingButtons();
    });
  } else {
    
    createPanel();
    wireExistingButtons();
  }

})(); // End of IIFE
