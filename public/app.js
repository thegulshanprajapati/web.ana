/* ==========================================================================
   WhatsApp SBTE Bot Dashboard System Script
   Handles WebSockets telemetry, REST API requests, and DOM rendering.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // State variables
  let currentStatus = 'connecting';
  let qrCodeInstance = null;
  let requests = [];
  let autoscroll = true;
  let socket = null;

  // Multi-session State
  let currentSession = 'default';
  let availableSessions = [];
  let logBacklog = [];

  // DOM Elements
  const tabs = document.querySelectorAll('.menu-item');
  const tabContents = document.querySelectorAll('.tab-content');
  const tabTitle = document.getElementById('tab-title');
  const tabSubtitle = document.getElementById('tab-subtitle');
  
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const sessionIdDisplay = document.getElementById('session-id-display');
  
  // Overview Tab elements
  const statPending = document.getElementById('stat-pending');
  const statApproved = document.getElementById('stat-approved');
  const statRejected = document.getElementById('stat-rejected');
  const statTotal = document.getElementById('stat-total');
  
  const quickRequestsList = document.getElementById('quick-requests-list');
  
  // Requests Tab elements
  const requestsList = document.getElementById('requests-list');
  const searchInput = document.getElementById('search-input');
  const filterStatusDropdown = document.getElementById('filter-status-dropdown');
  const badgePendingCount = document.getElementById('badge-pending-count');

  // Groups Tab elements
  const groupsList = document.getElementById('groups-list');
  const btnRefreshGroups = document.getElementById('btn-refresh-groups');

  // Logs Tab elements
  const consoleWindow = document.getElementById('console-window');
  const btnClearLogs = document.getElementById('btn-clear-logs');
  const btnToggleAutoscroll = document.getElementById('btn-toggle-autoscroll');
  const btnLogout = document.getElementById('btn-logout');
  const btnReconnect = document.getElementById('btn-reconnect');

  // Session Management Elements
  const sessionSelectorDropdown = document.getElementById('session-selector-dropdown');
  const sessionDropdownOptions = document.getElementById('session-dropdown-options');
  const btnAddSession = document.getElementById('btn-add-session');

  // Profile Panel elements
  const btnEditDp = document.getElementById('btn-edit-dp');
  const dpFileInput = document.getElementById('dp-file-input');
  const profileDp = document.getElementById('profile-dp');

  // Custom Datetime Picker state & elements
  let selectedDate = null;
  let currentPickerYear = new Date().getFullYear();
  let currentPickerMonth = new Date().getMonth(); // 0-indexed

  const customSchedTimeTrigger = document.getElementById('custom-sched-time-trigger');
  const customDatetimePicker = document.getElementById('custom-datetime-picker');
  const calendarMonthYear = document.getElementById('calendar-month-year');
  const calendarDaysContainer = document.getElementById('calendar-days-container');
  const prevMonthBtn = document.getElementById('prev-month-btn');
  const nextMonthBtn = document.getElementById('next-month-btn');
  const pickerHour = document.getElementById('picker-hour');
  const pickerMinute = document.getElementById('picker-minute');
  const pickerPeriod = document.getElementById('picker-period');
  const pickerClearBtn = document.getElementById('picker-clear-btn');
  const pickerApplyBtn = document.getElementById('picker-apply-btn');
  const schedTimeInput = document.getElementById('sched-time');
  const customSchedTimeLabel = document.getElementById('custom-sched-time-label');

  // Populate custom datetime picker hours and minutes
  for (let h = 1; h <= 12; h++) {
    const opt = document.createElement('option');
    opt.value = h.toString().padStart(2, '0');
    opt.textContent = h.toString().padStart(2, '0');
    pickerHour.appendChild(opt);
  }
  for (let m = 0; m < 60; m++) {
    const opt = document.createElement('option');
    opt.value = m.toString().padStart(2, '0');
    opt.textContent = m.toString().padStart(2, '0');
    pickerMinute.appendChild(opt);
  }

  // Toggle calendar picker display
  customSchedTimeTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    customDatetimePicker.classList.toggle('active');
    if (customDatetimePicker.classList.contains('active')) {
      renderCalendar();
    }
  });

  customDatetimePicker.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  document.addEventListener('click', () => {
    customDatetimePicker.classList.remove('active');
  });

  // Calendar Month Navigation
  prevMonthBtn.addEventListener('click', () => {
    currentPickerMonth--;
    if (currentPickerMonth < 0) {
      currentPickerMonth = 11;
      currentPickerYear--;
    }
    renderCalendar();
  });

  nextMonthBtn.addEventListener('click', () => {
    currentPickerMonth++;
    if (currentPickerMonth > 11) {
      currentPickerMonth = 0;
      currentPickerYear++;
    }
    renderCalendar();
  });

  function renderCalendar() {
    calendarDaysContainer.innerHTML = '';
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    calendarMonthYear.textContent = `${months[currentPickerMonth]} ${currentPickerYear}`;

    const firstDay = new Date(currentPickerYear, currentPickerMonth, 1).getDay();
    const daysInMonth = new Date(currentPickerYear, currentPickerMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-day empty';
      calendarDaysContainer.appendChild(cell);
    }

    const today = new Date();
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-day';
      cell.textContent = d;

      const cellDateStr = `${currentPickerYear}-${(currentPickerMonth + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      
      if (selectedDate === cellDateStr) {
        cell.classList.add('selected');
      }

      if (today.getDate() === d && today.getMonth() === currentPickerMonth && today.getFullYear() === currentPickerYear) {
        cell.classList.add('today');
      }

      cell.addEventListener('click', () => {
        selectedDate = cellDateStr;
        calendarDaysContainer.querySelectorAll('.calendar-day').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
      });

      calendarDaysContainer.appendChild(cell);
    }
  }

  pickerClearBtn.addEventListener('click', () => {
    selectedDate = null;
    schedTimeInput.value = '';
    customSchedTimeLabel.textContent = 'Select date & time...';
    customDatetimePicker.classList.remove('active');
  });

  pickerApplyBtn.addEventListener('click', () => {
    if (!selectedDate) {
      showCustomAlert('Please select a date on the calendar first.', 'Validation Error');
      return;
    }

    const hour = pickerHour.value;
    const minute = pickerMinute.value;
    const period = pickerPeriod.value;

    let hour24 = parseInt(hour, 10);
    if (period === 'PM' && hour24 < 12) hour24 += 12;
    if (period === 'AM' && hour24 === 12) hour24 = 0;

    const timeStr = `${hour24.toString().padStart(2, '0')}:${minute}:00`;
    const dt = new Date(`${selectedDate}T${timeStr}`);
    
    if (isNaN(dt.getTime())) {
      showCustomAlert('Invalid date/time conversion.', 'Error');
      return;
    }

    schedTimeInput.value = dt.toISOString();
    customSchedTimeLabel.textContent = `${selectedDate} ${hour}:${minute} ${period}`;
    customDatetimePicker.classList.remove('active');
  });

  /* ---- Custom Dialogs & Modal Popups ------------------------------------ */

  function showCustomAlert(message, title = 'Notification') {
    return new Promise((resolve) => {
      const modal = document.getElementById('custom-alert-modal');
      const titleEl = document.getElementById('custom-modal-title');
      const msgEl = document.getElementById('custom-modal-message');
      const cancelBtn = document.getElementById('custom-modal-cancel-btn');
      const okBtn = document.getElementById('custom-modal-ok-btn');
      const closeBtn = document.getElementById('custom-modal-close-btn');
      const inputContainer = document.getElementById('custom-modal-input-container');

      titleEl.textContent = title;
      msgEl.textContent = message;
      inputContainer.style.display = 'none';
      cancelBtn.style.display = 'none';

      modal.style.display = 'flex';

      function cleanUp() {
        modal.style.display = 'none';
        okBtn.removeEventListener('click', onOk);
        closeBtn.removeEventListener('click', onClose);
      }

      function onOk() {
        cleanUp();
        resolve(true);
      }
      
      function onClose() {
        cleanUp();
        resolve(false);
      }

      okBtn.addEventListener('click', onOk);
      closeBtn.addEventListener('click', onClose);
    });
  }

  function showCustomConfirm(message, title = 'Confirmation') {
    return new Promise((resolve) => {
      const modal = document.getElementById('custom-alert-modal');
      const titleEl = document.getElementById('custom-modal-title');
      const msgEl = document.getElementById('custom-modal-message');
      const cancelBtn = document.getElementById('custom-modal-cancel-btn');
      const okBtn = document.getElementById('custom-modal-ok-btn');
      const closeBtn = document.getElementById('custom-modal-close-btn');
      const inputContainer = document.getElementById('custom-modal-input-container');

      titleEl.textContent = title;
      msgEl.textContent = message;
      inputContainer.style.display = 'none';
      cancelBtn.style.display = 'inline-block';

      modal.style.display = 'flex';

      function cleanUp() {
        modal.style.display = 'none';
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        closeBtn.removeEventListener('click', onClose);
      }

      function onOk() {
        cleanUp();
        resolve(true);
      }

      function onCancel() {
        cleanUp();
        resolve(false);
      }

      function onClose() {
        cleanUp();
        resolve(false);
      }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn.addEventListener('click', onClose);
    });
  }

  function showCustomPrompt(message, placeholder = '', title = 'Input Required') {
    return new Promise((resolve) => {
      const modal = document.getElementById('custom-alert-modal');
      const titleEl = document.getElementById('custom-modal-title');
      const msgEl = document.getElementById('custom-modal-message');
      const cancelBtn = document.getElementById('custom-modal-cancel-btn');
      const okBtn = document.getElementById('custom-modal-ok-btn');
      const closeBtn = document.getElementById('custom-modal-close-btn');
      const inputContainer = document.getElementById('custom-modal-input-container');
      const inputField = document.getElementById('custom-modal-input-field');

      titleEl.textContent = title;
      msgEl.textContent = message;
      inputContainer.style.display = 'block';
      inputField.placeholder = placeholder;
      inputField.value = '';
      cancelBtn.style.display = 'inline-block';

      modal.style.display = 'flex';
      inputField.focus();

      function cleanUp() {
        modal.style.display = 'none';
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        closeBtn.removeEventListener('click', onClose);
      }

      function onOk() {
        const val = inputField.value;
        cleanUp();
        resolve(val);
      }

      function onCancel() {
        cleanUp();
        resolve(null);
      }

      function onClose() {
        cleanUp();
        resolve(null);
      }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn.addEventListener('click', onClose);
    });
  }

  /* ---- Custom Dropdowns Logic ------------------------------------------ */

  function initCustomDropdown(dropdownEl, onSelect) {
    const trigger = dropdownEl.querySelector('.custom-dropdown-trigger');
    const optionsContainer = dropdownEl.querySelector('.custom-dropdown-options');
    
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.custom-dropdown').forEach(d => {
        if (d !== dropdownEl) d.classList.remove('active');
      });
      dropdownEl.classList.toggle('active');
    });

    optionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.custom-dropdown-option');
      if (!option) return;

      e.stopPropagation();
      
      optionsContainer.querySelectorAll('.custom-dropdown-option').forEach(opt => {
        opt.classList.remove('active');
      });
      option.classList.add('active');

      const triggerSpan = trigger.querySelector('span');
      triggerSpan.innerHTML = option.innerHTML;
      const value = option.getAttribute('data-value');
      triggerSpan.setAttribute('data-value', value);

      dropdownEl.classList.remove('active');

      if (onSelect) {
        onSelect(value, option);
      }
    });
  }

  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
  });

  // Initialize Filter Status Dropdown
  initCustomDropdown(filterStatusDropdown, (value) => {
    renderMainTable();
  });

  // Initialize Session Selector Dropdown
  initCustomDropdown(sessionSelectorDropdown, (value) => {
    switchSession(value);
  });

  /* ---- Tabs Logic -------------------------------------------------------- */
  
  const tabMetadata = {
    overview: { title: 'Overview', subtitle: 'Real-time stats and bot status' },
    requests: { title: 'Join Requests', subtitle: 'Manage student requests to join group' },
    groups: { title: 'Managed Groups', subtitle: 'View WhatsApp groups and student membership details' },
    messenger: { title: 'Direct Messenger', subtitle: 'Send manual text messages and chat replies' },
    scheduler: { title: 'Broadcast Scheduler', subtitle: 'Manage future WhatsApp message delivery queues' },
    logs: { title: 'Live Logs', subtitle: 'Real-time telemetry and process outputs' }
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = tab.getAttribute('data-tab');

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      tabContents.forEach(content => {
        content.classList.remove('active-content');
      });
      document.getElementById(`tab-content-${targetTab}`).classList.add('active-content');

      tabTitle.textContent = tabMetadata[targetTab].title;
      tabSubtitle.textContent = tabMetadata[targetTab].subtitle;

      if (targetTab === 'groups') {
        loadGroups();
      } else if (targetTab === 'messenger') {
        loadMessenger();
      } else if (targetTab === 'scheduler') {
        loadSchedulerQueue();
      }
    });
  });

  document.getElementById('link-view-all').addEventListener('click', (e) => {
    e.preventDefault();
    const requestsMenu = document.querySelector('[data-tab="requests"]');
    if (requestsMenu) requestsMenu.click();
  });

  /* ---- Session Switching Logic ------------------------------------------- */

  function renderSessionSelector() {
    sessionDropdownOptions.innerHTML = '';
    
    availableSessions.forEach(sess => {
      const opt = document.createElement('div');
      opt.className = `custom-dropdown-option ${sess.id === currentSession ? 'active' : ''}`;
      opt.setAttribute('data-value', sess.id);
      
      let statusIcon = '<i class="fa-solid fa-circle-notch fa-spin text-muted"></i>';
      if (sess.status === 'connected') {
        statusIcon = '<i class="fa-solid fa-circle text-success" style="font-size: 8px;"></i>';
      } else if (sess.status === 'disconnected') {
        statusIcon = '<i class="fa-solid fa-circle text-danger" style="font-size: 8px;"></i>';
      } else if (sess.status === 'qr') {
        statusIcon = '<i class="fa-solid fa-qrcode text-warning" style="font-size: 10px;"></i>';
      }
      
      opt.innerHTML = `<span style="display:flex; align-items:center; gap: 8px;">${statusIcon} ${sess.id}</span>`;
      sessionDropdownOptions.appendChild(opt);
    });
  }

  function updateCurrentSessionUI() {
    sessionIdDisplay.textContent = currentSession;
    
    // Update dropdown trigger label
    const triggerSpan = sessionSelectorDropdown.querySelector('.custom-dropdown-trigger span');
    const sess = availableSessions.find(s => s.id === currentSession);
    let statusIcon = '<i class="fa-brands fa-whatsapp"></i>';
    if (sess) {
      if (sess.status === 'connected') {
        statusIcon = '<i class="fa-solid fa-circle text-success" style="font-size: 8px;"></i>';
      } else if (sess.status === 'disconnected') {
        statusIcon = '<i class="fa-solid fa-circle text-danger" style="font-size: 8px;"></i>';
      } else if (sess.status === 'qr') {
        statusIcon = '<i class="fa-solid fa-qrcode text-warning" style="font-size: 10px;"></i>';
      }
      updateStatusUI(sess.status, sess.extra);
    } else {
      updateStatusUI('connecting');
    }
    
    triggerSpan.innerHTML = `<span style="display:flex; align-items:center; gap: 8px;">${statusIcon} ${currentSession}</span>`;
  }

  async function switchSession(sessionId) {
    currentSession = sessionId;
    updateCurrentSessionUI();
    
    consoleWindow.innerHTML = '';
    const filteredLogs = logBacklog.filter(log => log.session === currentSession);
    filteredLogs.forEach(log => appendLog(log.line));

    await loadRequests();
    
    const activeTab = document.querySelector('.menu-item.active').getAttribute('data-tab');
    if (activeTab === 'groups') {
      loadGroups();
    } else if (activeTab === 'messenger') {
      loadMessenger();
    } else if (activeTab === 'scheduler') {
      loadSchedulerQueue();
    }
  }

  // Create new session via button
  btnAddSession.addEventListener('click', async () => {
    const name = await showCustomPrompt('Enter a unique name for the new WhatsApp Session ID:', 'e.g. support_bot');
    if (!name) return;
    
    const sanitized = name.trim();
    if (!sanitized) return;

    if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
      await showCustomAlert('Invalid Session name. Use only letters, numbers, underscores, and dashes.', 'Validation Error');
      return;
    }

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sanitized })
      });
      const data = await res.json();
      if (data.success) {
        await showCustomAlert(data.message, 'Success');
        switchSession(sanitized);
      } else {
        await showCustomAlert(`Failed to create session: ${data.error}`, 'Error');
      }
    } catch (err) {
      console.error(err);
      await showCustomAlert('Error connecting to the dashboard backend.', 'Connection Error');
    }
  });

  /* ---- Profile Picture Upload Logic ------------------------------------- */

  btnEditDp.addEventListener('click', () => {
    dpFileInput.click();
  });

  dpFileInput.addEventListener('change', () => {
    const file = dpFileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Image = e.target.result;
      try {
        const res = await fetch(`/api/sessions/${currentSession}/dp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Image })
        });
        const data = await res.json();
        if (data.success) {
          profileDp.src = base64Image;
          await showCustomAlert(data.message, 'Success');
        } else {
          await showCustomAlert(`Upload failed: ${data.error}`, 'Error');
        }
      } catch (err) {
        console.error(err);
        await showCustomAlert('Error uploading profile picture.', 'Error');
      }
    };
    reader.readAsDataURL(file);
  });

  /* ---- API Service Calls ------------------------------------------------- */

  async function loadRequests() {
    try {
      const res = await fetch(`/api/requests?session=${currentSession}`);
      const data = await res.json();
      if (data.success) {
        requests = data.requests;
        renderAll();
      }
    } catch (err) {
      console.error('Failed to load requests:', err);
    }
  }

  async function handleAction(id, action) {
    const rowEl = document.querySelector(`tr[data-id="${id}"]`);
    const actionBtns = rowEl ? rowEl.querySelectorAll('.action-buttons button') : [];
    
    actionBtns.forEach(btn => btn.disabled = true);

    try {
      const res = await fetch(`/api/requests/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!data.success) {
        await showCustomAlert(`Failed to execute: ${data.error}`, 'Error');
        actionBtns.forEach(btn => btn.disabled = false);
      } else {
        loadRequests();
      }
    } catch (err) {
      console.error('Action error:', err);
      await showCustomAlert('Error connecting to the server.', 'Connection Error');
      actionBtns.forEach(btn => btn.disabled = false);
    }
  }

  btnLogout.addEventListener('click', async () => {
    const confirmed = await showCustomConfirm(`Are you sure you want to log out session "${currentSession}"? This will clear the credentials and require a new QR code scan.`);
    if (!confirmed) return;

    try {
      const res = await fetch('/api/bot/logout', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: currentSession })
      });
      const data = await res.json();
      if (data.success) {
        await showCustomAlert(data.message, 'Logged Out');
      } else {
        await showCustomAlert(`Error: ${data.error}`, 'Error');
      }
    } catch (err) {
      console.error('Logout error:', err);
      await showCustomAlert('Failed to dispatch logout request.', 'Connection Error');
    }
  });

  btnReconnect.addEventListener('click', async () => {
    const confirmed = await showCustomConfirm(`Are you sure you want to force reconnect session "${currentSession}"? This will restart the WhatsApp socket connection.`);
    if (!confirmed) return;

    try {
      btnReconnect.disabled = true;
      btnReconnect.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Reconnecting...`;
      
      const res = await fetch('/api/bot/reconnect', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: currentSession })
      });
      const data = await res.json();
      if (data.success) {
        await showCustomAlert(data.message, 'Reconnection Initiated');
      } else {
        await showCustomAlert(`Error: ${data.error}`, 'Error');
      }
    } catch (err) {
      console.error('Reconnect error:', err);
      await showCustomAlert('Failed to dispatch reconnect request.', 'Connection Error');
    } finally {
      btnReconnect.disabled = false;
      btnReconnect.innerHTML = `<i class="fa-solid fa-rotate"></i> Reconnect`;
    }
  });

  /* ---- Render Logic ----------------------------------------------------- */

  function renderAll() {
    renderStats();
    renderQuickTable();
    renderMainTable();
  }

  function renderStats() {
    const pending = requests.filter(r => r.status === 'Pending').length;
    const approved = requests.filter(r => r.status === 'Approved').length;
    const rejected = requests.filter(r => r.status === 'Rejected').length;
    
    statPending.textContent = pending;
    statApproved.textContent = approved;
    statRejected.textContent = rejected;
    statTotal.textContent = requests.length;

    badgePendingCount.textContent = pending;
    badgePendingCount.style.display = pending > 0 ? 'inline-block' : 'none';
  }

  function renderQuickTable() {
    quickRequestsList.innerHTML = '';
    const list = requests.slice(0, 5);
    
    if (list.length === 0) {
      quickRequestsList.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No join requests found.</td></tr>`;
      return;
    }

    list.forEach(req => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-id', req.id);
      
      tr.innerHTML = `
        <td>
          <div class="student-meta">
            <span class="name">${req.name || 'Anonymous Student'}</span>
            <span class="jid">${req.jid.split('@')[0]}</span>
          </div>
        </td>
        <td>
          <div class="course-meta">
            <span class="college">${req.college || 'Not Filled'}</span>
            <span class="branch">${req.branch || 'Not Filled'} ${req.semester ? `(${req.semester} sem)` : ''}</span>
          </div>
        </td>
        <td>
          <span class="status-pill ${req.status.toLowerCase()}">${req.status}</span>
        </td>
        <td>
          <div class="action-buttons">
            ${req.status === 'Pending' ? `
              <button class="btn btn-success btn-sm btn-approve" data-id="${req.id}" title="Approve"><i class="fa-solid fa-check"></i></button>
              <button class="btn btn-danger btn-sm btn-reject" data-id="${req.id}" title="Reject"><i class="fa-solid fa-xmark"></i></button>
            ` : `<span class="text-muted"><i class="fa-solid fa-lock"></i> Locked</span>`}
          </div>
        </td>
      `;
      quickRequestsList.appendChild(tr);
    });

    attachTableEvents(quickRequestsList);
  }

  function renderMainTable() {
    requestsList.innerHTML = '';
    const query = searchInput.value.toLowerCase().trim();
    const filterStatus = filterStatusDropdown.querySelector('.custom-dropdown-trigger span').getAttribute('data-value') || 'all';

    const filtered = requests.filter(req => {
      if (filterStatus !== 'all' && req.status !== filterStatus) return false;

      if (query) {
        const name = (req.name || '').toLowerCase();
        const jid = (req.jid || '').toLowerCase();
        const college = (req.college || '').toLowerCase();
        const branch = (req.branch || '').toLowerCase();
        const semester = (req.semester || '').toLowerCase();
        return name.includes(query) || jid.includes(query) || college.includes(query) || branch.includes(query) || semester.includes(query);
      }

      return true;
    });

    if (filtered.length === 0) {
      requestsList.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No matching requests.</td></tr>`;
      return;
    }

    filtered.forEach(req => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-id', req.id);

      const requestedDate = new Date(req.request_time || req.created_at).toLocaleString();

      tr.innerHTML = `
        <td>
          <div class="student-meta">
            <span class="name">${req.name || 'Anonymous Student'}</span>
            <span class="jid">${req.jid.split('@')[0]}</span>
          </div>
        </td>
        <td>
          <div class="course-meta">
            <span class="college">${req.college || 'Not Filled'}</span>
            <span class="branch">${req.branch || 'Not Filled'}</span>
          </div>
        </td>
        <td>
          <span class="semester-cell">${req.semester ? `${req.semester} sem` : 'Not Filled'}</span>
        </td>
        <td class="text-muted" style="font-size: 13px;">
          ${requestedDate}
        </td>
        <td>
          <span class="status-pill ${req.status.toLowerCase()}">${req.status}</span>
        </td>
        <td>
          <div class="action-buttons">
            ${req.status === 'Pending' ? `
              <button class="btn btn-success btn-sm btn-approve" data-id="${req.id}"><i class="fa-solid fa-check"></i> Approve</button>
              <button class="btn btn-danger btn-sm btn-reject" data-id="${req.id}"><i class="fa-solid fa-xmark"></i> Reject</button>
            ` : `<span class="text-muted"><i class="fa-solid fa-lock"></i> Locked</span>`}
          </div>
        </td>
      `;
      requestsList.appendChild(tr);
    });

    attachTableEvents(requestsList);
  }

  function attachTableEvents(container) {
    container.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.getAttribute('data-id'), 'approve'));
    });
    container.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.getAttribute('data-id'), 'reject'));
    });
  }

  searchInput.addEventListener('input', renderMainTable);

  /* ---- Connection Status UI updates ------------------------------------- */

  const statusConfigs = {
    connecting: {
      indicatorClass: 'connecting',
      text: 'Connecting...',
      title: 'Connecting to WhatsApp',
      desc: 'Bot is setting up secure sockets. Please wait...',
      icon: '<i class="fa-solid fa-circle-notch fa-spin"></i>',
      showQr: false
    },
    qr: {
      indicatorClass: 'connecting',
      text: 'Scan QR Code',
      title: 'Pairing Device Required',
      desc: 'The bot is not logged in. Scan the generated QR code using Linked Devices on your phone.',
      icon: '<i class="fa-solid fa-qrcode"></i>',
      showQr: true
    },
    connected: {
      indicatorClass: 'connected',
      text: 'Connected',
      title: 'Connected and Active',
      desc: 'The WhatsApp bot is authenticated, listening to group events, and serving requests.',
      icon: '<i class="fa-brands fa-whatsapp"></i>',
      showQr: false
    },
    disconnected: {
      indicatorClass: 'disconnected',
      text: 'Disconnected',
      title: 'Bot Disconnected',
      desc: 'The bot was disconnected. Check network or click Reconnect.',
      icon: '<i class="fa-solid fa-triangle-exclamation"></i>',
      showQr: false
    },
    reconnecting: {
      indicatorClass: 'connecting',
      text: 'Reconnecting...',
      title: 'Reconnecting session',
      desc: 'Lost socket connection to WhatsApp. Re-attempting connection...',
      icon: '<i class="fa-solid fa-rotate fa-spin"></i>',
      showQr: false
    }
  };

  function updateStatusUI(status, extra = {}) {
    currentStatus = status;
    const cfg = statusConfigs[status] || statusConfigs.connecting;

    statusIndicator.className = `status-indicator ${cfg.indicatorClass}`;
    statusText.textContent = cfg.text;

    const loginScreen = document.getElementById('login-screen');
    const dashboardContainer = document.getElementById('dashboard-container');

    if (status === 'connected') {
      loginScreen.style.display = 'none';
      dashboardContainer.style.display = 'flex';

      document.getElementById('profile-session-id').textContent = currentSession;
      document.getElementById('profile-phone-number').textContent = extra.phone || 'Unknown';
      document.getElementById('profile-account-name').textContent = extra.name || 'WhatsApp Account';
      
      profileDp.src = `/dps/${currentSession}.png?t=${Date.now()}`;
      profileDp.onerror = () => {
        profileDp.src = 'default-avatar.png';
        profileDp.onerror = null;
      };
    } else {
      loginScreen.style.display = 'flex';
      dashboardContainer.style.display = 'none';

      document.getElementById('login-status-title').textContent = cfg.title;
      document.getElementById('login-status-desc').textContent = cfg.desc;
      document.getElementById('login-status-visual').innerHTML = cfg.icon;

      const loginQrWrapper = document.getElementById('login-qr-wrapper');
      if (cfg.showQr && extra.qr) {
        loginQrWrapper.style.display = 'flex';
        renderLoginQr(extra.qr);
      } else {
        loginQrWrapper.style.display = 'none';
      }
    }
  }

  function renderLoginQr(qrString) {
    const qrEl = document.getElementById('login-qr-code');
    qrEl.innerHTML = '';
    
    qrCodeInstance = new QRCode(qrEl, {
      text: qrString,
      width: 220,
      height: 220,
      colorDark: "#0b0f19",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  /* ---- Log Telemetry stream ----------------------------------------------- */

  function appendLog(line) {
    const lineEl = document.createElement('div');
    lineEl.className = 'log-line';

    try {
      const data = JSON.parse(line);
      const level = getLevelName(data.level);
      lineEl.classList.add(level);

      const timestamp = data.time ? `[${data.time.split('T')[1].slice(0, 8)}]` : '';
      const module = data.module ? `(${data.module.toUpperCase()})` : '';
      const msg = data.msg || '';
      
      let extra = '';
      const skipKeys = ['level', 'time', 'msg', 'pid', 'hostname', 'module', 'sessionId'];
      const details = {};
      for (const [k, v] of Object.entries(data)) {
        if (!skipKeys.includes(k)) {
          details[k] = v;
        }
      }
      if (Object.keys(details).length > 0) {
        extra = ` ${JSON.stringify(details)}`;
      }

      lineEl.textContent = `${timestamp} ${level.toUpperCase()}${module}: ${msg}${extra}`;
    } catch (e) {
      lineEl.textContent = line;
    }

    consoleWindow.appendChild(lineEl);

    if (consoleWindow.children.length > 500) {
      consoleWindow.removeChild(consoleWindow.firstChild);
    }

    if (autoscroll) {
      consoleWindow.scrollTop = consoleWindow.scrollHeight;
    }
  }

  function getLevelName(val) {
    if (val === 20) return 'debug';
    if (val === 30) return 'info';
    if (val === 40) return 'warn';
    if (val === 50) return 'error';
    if (val === 60) return 'fatal';
    return 'info';
  }

  btnClearLogs.addEventListener('click', () => {
    consoleWindow.innerHTML = '';
  });

  btnToggleAutoscroll.addEventListener('click', () => {
    autoscroll = !autoscroll;
    btnToggleAutoscroll.innerHTML = autoscroll 
      ? `<i class="fa-solid fa-arrows-to-dot"></i> Auto-Scroll: ON`
      : `<i class="fa-solid fa-arrows-to-dot"></i> Auto-Scroll: OFF`;
    btnToggleAutoscroll.classList.toggle('btn-secondary', autoscroll);
  });

  /* ---- WebSockets Integration -------------------------------------------- */

  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('Telemetry socket connected');
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'init':
          availableSessions = data.sessions || [];
          renderSessionSelector();
          
          if (!availableSessions.some(s => s.id === currentSession) && availableSessions.length > 0) {
            currentSession = availableSessions[0].id;
          }
          
          updateCurrentSessionUI();
          
          if (data.backlog) {
            logBacklog = data.backlog;
            consoleWindow.innerHTML = '';
            const filteredLogs = logBacklog.filter(log => log.session === currentSession);
            filteredLogs.forEach(log => appendLog(log.line));
          }
          
          loadRequests();
          break;

        case 'status':
          const idx = availableSessions.findIndex(s => s.id === data.session);
          if (idx !== -1) {
            availableSessions[idx].status = data.status;
            availableSessions[idx].extra = data.extra;
          } else {
            availableSessions.push({ id: data.session, status: data.status, extra: data.extra });
          }
          renderSessionSelector();

          if (data.session === currentSession) {
            updateStatusUI(data.status, data.extra);
          }
          break;

        case 'log':
          logBacklog.push({ session: data.session, line: data.line });
          if (logBacklog.length > 500) {
            logBacklog.shift();
          }
          if (data.session === currentSession) {
            appendLog(data.line);
          }
          break;

        case 'sessions_update':
          availableSessions = data.sessions || [];
          renderSessionSelector();
          break;

        case 'request_update':
          loadRequests();
          break;
      }
    };

    socket.onclose = () => {
      console.warn('Telemetry socket disconnected. Reconnecting...');
      updateStatusUI('disconnected');
      setTimeout(initWebSocket, 2000);
    };

    socket.onerror = (err) => {
      console.error('Socket error:', err);
    };
  }

  // Fetch groups from API and render
  async function loadGroups() {
    try {
      groupsList.innerHTML = `<tr><td colspan="4" class="text-center text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Fetching group metadata...</td></tr>`;
      const res = await fetch(`/api/groups?session=${currentSession}`);
      const data = await res.json();
      if (data.success) {
        renderGroups(data.groups);
      } else {
        groupsList.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error: ${data.error}</td></tr>`;
      }
    } catch (err) {
      console.error('Failed to load groups:', err);
      groupsList.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Failed to fetch groups. Make sure the bot is connected.</td></tr>`;
    }
  }

  function renderGroups(list) {
    groupsList.innerHTML = '';
    if (list.length === 0) {
      groupsList.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No groups found. Make sure the bot is connected.</td></tr>`;
      return;
    }

    list.forEach(g => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="font-size: 15px; color: var(--text-main);">${g.subject}</strong></td>
        <td class="text-muted" style="font-family: var(--font-mono); font-size: 13px;">${g.id}</td>
        <td>
          <span class="status-pill approved" style="font-size: 13px;">
            <i class="fa-solid fa-user-graduate"></i> &nbsp;<b>${g.memberCount}</b> students
          </span>
        </td>
        <td>
          <span class="status-pill ${g.joinApprovalMode ? 'pending' : 'rejected'}" style="font-size: 12px;">
            ${g.joinApprovalMode ? '<i class="fa-solid fa-shield-halved"></i> Admin Approval On' : '<i class="fa-solid fa-unlock"></i> Open / Anyone'}
          </span>
        </td>
      `;
      groupsList.appendChild(tr);
    });
  }

  btnRefreshGroups.addEventListener('click', loadGroups);

  /* ---- Direct Messenger & Chat Logic -------------------------------------- */

  const msgRecipient = document.getElementById('msg-recipient');
  const msgText = document.getElementById('msg-text');
  const messengerForm = document.getElementById('messenger-form');
  const quickMsgTargets = document.getElementById('quick-msg-targets');

  async function loadMessenger() {
    quickMsgTargets.innerHTML = `<tr><td colspan="2" class="text-center text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Building contacts list...</td></tr>`;
    try {
      const groupsRes = await fetch(`/api/groups?session=${currentSession}`);
      const groupsData = await groupsRes.json();
      
      quickMsgTargets.innerHTML = '';
      
      if (groupsData.success && groupsData.groups.length > 0) {
        groupsData.groups.forEach(g => {
          const tr = document.createElement('tr');
          tr.className = 'clickable-row';
          tr.innerHTML = `
            <td><strong style="color: var(--primary-light);"><i class="fa-solid fa-users"></i> ${g.subject}</strong></td>
            <td class="text-muted" style="font-family: var(--font-mono); font-size: 12px;">${g.id}</td>
          `;
          tr.addEventListener('click', () => {
            msgRecipient.value = g.id;
            document.getElementById('sched-recipient').value = g.id;
            msgRecipient.focus();
          });
          quickMsgTargets.appendChild(tr);
        });
      }

      if (requests.length > 0) {
        requests.forEach(r => {
          const tr = document.createElement('tr');
          tr.className = 'clickable-row';
          tr.innerHTML = `
            <td><strong><i class="fa-solid fa-user"></i> ${r.name || 'Anonymous Student'}</strong> (${r.college || 'No College'})</td>
            <td class="text-muted" style="font-family: var(--font-mono); font-size: 12px;">${r.jid}</td>
          `;
          tr.addEventListener('click', () => {
            msgRecipient.value = r.jid;
            document.getElementById('sched-recipient').value = r.jid;
            msgRecipient.focus();
          });
          quickMsgTargets.appendChild(tr);
        });
      }

      if (quickMsgTargets.children.length === 0) {
        quickMsgTargets.innerHTML = `<tr><td colspan="2" class="text-center text-muted">No groups or student contacts available yet.</td></tr>`;
      }
    } catch (err) {
      console.error('Failed to load messenger targets:', err);
      quickMsgTargets.innerHTML = `<tr><td colspan="2" class="text-center text-danger">Error loading targets.</td></tr>`;
    }
  }

  messengerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const recipient = msgRecipient.value.trim();
    const message = msgText.value.trim();

    if (!recipient || !message) return;

    const btn = document.getElementById('btn-send-message');
    const originalText = btn.innerHTML;
    
    try {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Dispatched...`;
      
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient, message, session: currentSession })
      });
      const data = await res.json();
      
      if (data.success) {
        await showCustomAlert('Message dispatched successfully via bot!', 'Success');
        msgText.value = '';
      } else {
        await showCustomAlert(`Failed to send: ${data.error}`, 'Error');
      }
    } catch (err) {
      console.error('Message error:', err);
      await showCustomAlert('Error connecting to the bot to dispatch message.', 'Connection Error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  /* ---- Broadcast Scheduler Logic ------------------------------------------ */

  const schedulerForm = document.getElementById('scheduler-form');
  const schedRecipient = document.getElementById('sched-recipient');
  const schedText = document.getElementById('sched-text');
  const scheduledQueueList = document.getElementById('scheduled-queue-list');

  async function loadSchedulerQueue() {
    scheduledQueueList.innerHTML = `<tr><td colspan="5" class="text-center text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading scheduled queue...</td></tr>`;
    try {
      const res = await fetch(`/api/scheduler?session=${currentSession}`);
      const data = await res.json();
      
      if (!data.success) {
        scheduledQueueList.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error: ${data.error}</td></tr>`;
        return;
      }

      scheduledQueueList.innerHTML = '';
      if (data.messages.length === 0) {
        scheduledQueueList.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No scheduled messages queue found.</td></tr>`;
        return;
      }

      data.messages.forEach(msg => {
        const tr = document.createElement('tr');
        
        let statusBadge = '';
        if (msg.status === 'Pending') statusBadge = '<span class="status-pill pending">Pending</span>';
        else if (msg.status === 'Sent') statusBadge = '<span class="status-pill approved">Sent</span>';
        else statusBadge = '<span class="status-pill rejected">Failed</span>';

        const rawDate = new Date(msg.scheduled_time);
        const formattedDate = rawDate.toLocaleString();

        tr.innerHTML = `
          <td class="text-muted" style="font-family: var(--font-mono); font-size: 12px;">${msg.recipient.split('@')[0]}</td>
          <td><span title="${msg.message}" style="display:inline-block; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size: 13px;">${msg.message}</span></td>
          <td style="font-size: 13px;">${formattedDate}</td>
          <td>${statusBadge}</td>
          <td>
            ${msg.status === 'Pending' ? 
              `<button class="btn btn-danger btn-sm btn-cancel-msg" data-id="${msg.id}">
                <i class="fa-solid fa-xmark"></i> Cancel
               </button>` : 
              `<button class="btn btn-secondary btn-sm" disabled style="opacity: 0.5;">
                <i class="fa-solid fa-check"></i> Done
               </button>`
            }
          </td>
        `;
        scheduledQueueList.appendChild(tr);
      });

      scheduledQueueList.querySelectorAll('.btn-cancel-msg').forEach(btn => {
        btn.addEventListener('click', () => cancelScheduledMessage(btn.getAttribute('data-id')));
      });

    } catch (err) {
      console.error('Failed to load scheduler list:', err);
      scheduledQueueList.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error loading scheduled queue.</td></tr>`;
    }
  }

  schedulerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const recipient = schedRecipient.value.trim();
    const message = schedText.value.trim();
    const dateVal = schedTimeInput.value;

    if (!recipient || !message || !dateVal) return;

    try {
      const res = await fetch('/api/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient, message, scheduledTime: dateVal, session: currentSession })
      });
      const data = await res.json();
      
      if (data.success) {
        await showCustomAlert('Broadcast scheduled successfully!', 'Success');
        schedText.value = '';
        selectedDate = null;
        schedTimeInput.value = '';
        customSchedTimeLabel.textContent = 'Select date & time...';
        loadSchedulerQueue();
      } else {
        await showCustomAlert(`Failed to schedule: ${data.error}`, 'Error');
      }
    } catch (err) {
      console.error('Scheduling error:', err);
      await showCustomAlert('Error scheduling message.', 'Error');
    }
  });

  async function cancelScheduledMessage(id) {
    const confirmed = await showCustomConfirm('Are you sure you want to cancel this scheduled message?');
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/scheduler/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadSchedulerQueue();
      } else {
        await showCustomAlert(`Failed to cancel: ${data.error}`, 'Error');
      }
    } catch (err) {
      console.error('Cancel error:', err);
      await showCustomAlert('Error cancelling scheduled message.', 'Error');
    }
  }

  // Kickstart dashboard systems
  initWebSocket();
});
