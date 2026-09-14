(() => {
  'use strict';

  // ---------- Elements ----------
  const authScreen = document.getElementById('auth');
  const landing = document.getElementById('landing');
  const chatapp = document.getElementById('chatapp');

  const landingForm = document.getElementById('landing-form');
  const landingInput = document.getElementById('landing-input');
  const landingSend = document.getElementById('landing-send');

  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');

  const messagesEl = document.getElementById('messages');
  const previewFrame = document.getElementById('preview-frame');
  const emptyPreview = document.getElementById('empty-preview');
  const codePanel = document.getElementById('code-panel');
  const codeFilesEl = document.getElementById('code-files');
  const codeContent = document.getElementById('code-content');
  const tabs = document.querySelectorAll('.tab');
  const refreshBtn = document.getElementById('refresh-preview');
  const openBtn = document.getElementById('open-preview');
  const downloadBtn = document.getElementById('download-btn');
  const suggestionChips = document.querySelectorAll('.chip');


  const newChatBtn = document.getElementById('new-chat-btn');
  const chatsListEl = document.getElementById('chats-panel-list');
  const signOutBtn = document.getElementById('sign-out-btn');
  const userAvatarEl = document.getElementById('user-avatar');
  const userEmailEl = document.getElementById('user-email');

  const sidebar = document.getElementById('sidebar');
  const collapseSidebarBtn = document.getElementById('collapse-sidebar-btn');
  const reopenSidebarBtn = document.getElementById('reopen-sidebar-btn');
  const hidePreviewBtn = document.getElementById('hide-preview-btn');
  const reopenPreviewBtn = document.getElementById('reopen-preview-btn');

  const chatsPanel = document.getElementById('chats-panel');
  const sidebarHistoryBtn = document.getElementById('sidebar-history-btn');
  const landingHistoryBtn = document.getElementById('landing-history-btn');
  const closeChatsPanelBtn = document.getElementById('close-chats-panel-btn');
  const chatResizer = document.getElementById('chat-resizer');

  const modelPillBtn = document.getElementById('model-pill-btn');
  const modelPillLabel = document.getElementById('model-pill-label');
  const modelPopover = document.getElementById('model-popover');

  // ---------- State ----------
  let history = []; // [{role: 'user'|'assistant', content: string}] for the ACTIVE chat
  let lastPreviewHtml = null;
  let lastFiles = []; // [{filename, code}] from the most recent assistant reply with code
  let activeFileIndex = 0;
  let currentChatId = null;
  let currentUser = null;
  let chatsCache = []; // [{id, title, updated_at}]

  // ---------- Minimal ZIP writer (store/no-compression) for downloads ----------
  const CRC_TABLE = (() => {
    const table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0 ^ -1;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  function dosDateTime(date) {
    const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
    const dosYear = date.getFullYear() - 1980;
    const dateVal = ((dosYear & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
    return { time, date: dateVal };
  }

  function buildZip(files) {
    const encoder = new TextEncoder();
    const { time, date } = dosDateTime(new Date());
    const chunks = [];
    const central = [];
    let offset = 0;

    files.forEach((f) => {
      const nameBytes = encoder.encode(f.filename);
      const dataBytes = encoder.encode(f.code);
      const crc = crc32(dataBytes);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0, true);
      local.setUint16(8, 0, true); // store, no compression
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, dataBytes.length, true);
      local.setUint32(22, dataBytes.length, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);

      chunks.push(new Uint8Array(local.buffer), nameBytes, dataBytes);

      const centralHeader = new DataView(new ArrayBuffer(46));
      centralHeader.setUint32(0, 0x02014b50, true);
      centralHeader.setUint16(4, 20, true);
      centralHeader.setUint16(6, 20, true);
      centralHeader.setUint16(8, 0, true);
      centralHeader.setUint16(10, 0, true);
      centralHeader.setUint16(12, time, true);
      centralHeader.setUint16(14, date, true);
      centralHeader.setUint32(16, crc, true);
      centralHeader.setUint32(20, dataBytes.length, true);
      centralHeader.setUint32(24, dataBytes.length, true);
      centralHeader.setUint16(28, nameBytes.length, true);
      centralHeader.setUint16(30, 0, true);
      centralHeader.setUint16(32, 0, true);
      centralHeader.setUint16(34, 0, true);
      centralHeader.setUint16(36, 0, true);
      centralHeader.setUint32(38, 0, true);
      centralHeader.setUint32(42, offset, true);

      central.push(new Uint8Array(centralHeader.buffer), nameBytes);
      offset += 30 + nameBytes.length + dataBytes.length;
    });

    const centralSize = central.reduce((sum, c) => sum + c.length, 0);
    const centralOffset = offset;

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, centralOffset, true);
    end.setUint16(20, 0, true);

    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Model selection (Gemini-style pill + popover, persisted per browser) ----------
  const MODEL_STORAGE_KEY = 'codey-selected-model';
  const MODEL_OPTIONS = [
    { value: 'qwen2.5-coder:1.5b', title: 'qwen2.5-coder:1.5b', subtitle: 'Fastest answers' },
    { value: 'qwen2.5-coder:7b', title: 'qwen2.5-coder:7b', subtitle: 'Balanced (default)' },
    { value: 'qwen2.5-coder:14b', title: 'qwen2.5-coder:14b', subtitle: 'Higher quality, slower' },
    { value: 'codellama:7b', title: 'codellama:7b', subtitle: 'Alt coding model' },
    { value: 'deepseek-coder-v2:16b', title: 'deepseek-coder-v2:16b', subtitle: 'Large, high quality' },
    { value: 'llama3.1:8b', title: 'llama3.1:8b', subtitle: 'General purpose' },
  ];

  let selectedModel = localStorage.getItem(MODEL_STORAGE_KEY) || 'qwen2.5-coder:7b';

  function getSelectedModel() {
    return selectedModel;
  }

  function setSelectedModel(value) {
    selectedModel = value;
    localStorage.setItem(MODEL_STORAGE_KEY, value);
    modelPillLabel.textContent = value;
  }

  function closeModelPopover() {
    modelPopover.classList.add('hidden');
  }

  function renderModelPopover() {
    modelPopover.innerHTML = '';

    MODEL_OPTIONS.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'model-option';
      btn.innerHTML = `
        <span class="model-option-text">
          <span class="model-option-title">${escapeHtml(opt.title)}</span>
          <span class="model-option-subtitle">${escapeHtml(opt.subtitle)}</span>
        </span>
        ${opt.value === selectedModel ? '<span class="model-option-check">✓</span>' : ''}
      `;
      btn.addEventListener('click', () => {
        setSelectedModel(opt.value);
        closeModelPopover();
      });
      modelPopover.appendChild(btn);
    });

    const divider = document.createElement('div');
    divider.className = 'model-popover-divider';
    modelPopover.appendChild(divider);

    const customRow = document.createElement('div');
    customRow.className = 'model-custom-row';
    const isKnown = MODEL_OPTIONS.some((o) => o.value === selectedModel);
    customRow.innerHTML = `<input type="text" placeholder="Custom model tag, e.g. mistral:7b" value="${isKnown ? '' : escapeHtml(selectedModel)}" />`;
    const customInput = customRow.querySelector('input');
    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (customInput.value.trim()) {
          setSelectedModel(customInput.value.trim());
          closeModelPopover();
        }
      }
    });
    customInput.addEventListener('blur', () => {
      if (customInput.value.trim()) setSelectedModel(customInput.value.trim());
    });
    modelPopover.appendChild(customRow);
  }

  modelPillBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = modelPopover.classList.contains('hidden');
    closeModelPopover();
    if (willOpen) {
      renderModelPopover();
      modelPopover.classList.remove('hidden');
    }
  });
  document.addEventListener('click', (e) => {
    if (!modelPopover.classList.contains('hidden') && !modelPopover.contains(e.target) && e.target !== modelPillBtn) {
      closeModelPopover();
    }
  });

  modelPillLabel.textContent = selectedModel;

  // ---------- Helpers ----------
  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  function relativeTime(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  // ---------- Code block extraction (supports ```lang:filename) ----------
  function extractCodeBlocks(text) {
    const regex = /```([\w+-]+)?(?::([^\n`]+))?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      blocks.push({
        lang: (match[1] || '').toLowerCase(),
        filename: match[2] ? match[2].trim() : null,
        code: match[3].replace(/\s+$/, ''),
      });
    }
    const remainder = text.replace(regex, '').trim();
    return { blocks, remainder };
  }

  const DEFAULT_NAME_BY_LANG = {
    html: 'index.html',
    htm: 'index.html',
    css: 'style.css',
    js: 'script.js',
    javascript: 'script.js',
    ts: 'script.ts',
    typescript: 'script.ts',
    py: 'main.py',
    python: 'main.py',
    json: 'data.json',
  };

  function uniqueName(base, used) {
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    const dot = base.lastIndexOf('.');
    const stem = dot > -1 ? base.slice(0, dot) : base;
    const ext = dot > -1 ? base.slice(dot) : '';
    let n = 2;
    let candidate = `${stem}${n}${ext}`;
    while (used.has(candidate)) {
      n += 1;
      candidate = `${stem}${n}${ext}`;
    }
    used.add(candidate);
    return candidate;
  }

  // Turns raw fenced blocks into named files, filling in sensible default
  // filenames for blocks that didn't specify one, and de-duplicating names.
  function namedFilesFromBlocks(blocks) {
    const used = new Set();
    return blocks.map((b, i) => {
      const base = b.filename || DEFAULT_NAME_BY_LANG[b.lang] || `file-${i + 1}.${b.lang || 'txt'}`;
      return { filename: uniqueName(base, used), lang: b.lang, code: b.code };
    });
  }

  function extOf(filename) {
    const m = filename.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : '';
  }

  function buildPreviewDoc(files) {
    if (!files.length) return null;

    const htmlFile = files.find((f) => ['html', 'htm'].includes(extOf(f.filename)));
    const cssFiles = files.filter((f) => extOf(f.filename) === 'css');
    const jsFiles = files.filter((f) => ['js', 'mjs'].includes(extOf(f.filename)));

    if (htmlFile) {
      let html = htmlFile.code;
      if (!/<html[\s>]/i.test(html)) {
        html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${html}</body></html>`;
      }
      const styleTag = cssFiles.length
        ? `<style>${cssFiles.map((f) => f.code).join('\n\n')}</style>`
        : '';
      const scriptTags = jsFiles.map((f) => `<script>${f.code}<\/script>`).join('\n');

      if (styleTag && !/<style[\s>]/i.test(html)) {
        html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${styleTag}</head>`) : styleTag + html;
      }
      if (scriptTags && !/<script[\s>]/i.test(html)) {
        html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${scriptTags}</body>`) : html + scriptTags;
      }
      return html;
    }

    // If there's nothing web-renderable (e.g. the reply was Python/SQL/PHP
    // files), don't fabricate a preview — let the caller show "no preview".
    if (!cssFiles.length && !jsFiles.length) return null;

    // No HTML file, but some CSS/JS: compose a minimal document from those
    // (and any other markup-ish file) so simple style/script-only replies
    // still render.
    const styleTag = cssFiles.length ? `<style>${cssFiles.map((f) => f.code).join('\n\n')}</style>` : '';
    const scriptTags = jsFiles.map((f) => `<script>${f.code}<\/script>`).join('\n');
    const bodyContent = files
      .filter((f) => !['css', 'js', 'mjs'].includes(extOf(f.filename)))
      .map((f) => f.code)
      .join('\n');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${styleTag}</head><body>${bodyContent}${scriptTags}</body></html>`;
  }

  // ---------- Code tab: file switcher ----------
  function renderFileTabs() {
    codeFilesEl.innerHTML = '';
    if (lastFiles.length <= 1) {
      codeFilesEl.classList.add('hidden');
    } else {
      codeFilesEl.classList.remove('hidden');
      lastFiles.forEach((f, i) => {
        const btn = document.createElement('button');
        btn.className = 'file-tab' + (i === activeFileIndex ? ' active' : '');
        btn.textContent = f.filename;
        btn.addEventListener('click', () => {
          activeFileIndex = i;
          renderFileTabs();
          showActiveFileCode();
        });
        codeFilesEl.appendChild(btn);
      });
    }
  }

  function showActiveFileCode() {
    const file = lastFiles[activeFileIndex];
    codeContent.textContent = file ? file.code : '';
  }

  function renderPreview(blocks) {
    const files = namedFilesFromBlocks(blocks);
    lastFiles = files;
    activeFileIndex = Math.max(
      0,
      files.findIndex((f) => ['html', 'htm'].includes(extOf(f.filename)))
    );
    renderFileTabs();
    showActiveFileCode();

    const doc = buildPreviewDoc(files);
    if (!doc) {
      lastPreviewHtml = null;
      const nonWeb = files.every((f) => !['html', 'htm', 'css', 'js', 'mjs'].includes(extOf(f.filename)));
      emptyPreview.querySelector('p').textContent = nonWeb
        ? "This isn't a browser-runnable language, so there's no live preview — check the Code tab."
        : 'Your build will appear here.';
      emptyPreview.classList.remove('hidden');
      if (nonWeb) document.querySelector('.tab[data-tab="code"]').click();
      return;
    }
    lastPreviewHtml = doc;
    previewFrame.srcdoc = doc;
    emptyPreview.classList.add('hidden');
  }

  function resetPreview() {
    lastPreviewHtml = null;
    lastFiles = [];
    activeFileIndex = 0;
    previewFrame.srcdoc = 'about:blank';
    codeContent.textContent = '';
    codeFilesEl.innerHTML = '';
    codeFilesEl.classList.add('hidden');
    emptyPreview.querySelector('p').textContent = 'Your build will appear here.';
    emptyPreview.classList.remove('hidden');
  }

  function addMessage(role, text, isError = false) {
    const bubble = document.createElement('div');
    bubble.className = `msg ${isError ? 'error' : role}`;

    if (role === 'model' && !isError) {
      const { blocks, remainder } = extractCodeBlocks(text);
      const shown = remainder || (blocks.length ? 'Here you go — check the preview on the right.' : text);
      bubble.innerHTML = escapeHtml(shown).replace(/`([^`]+)`/g, '<code class="inline">$1</code>');
      if (blocks.length) {
        const note = document.createElement('span');
        note.className = 'msg-note';
        note.textContent = blocks.length > 1
          ? `Updated ${blocks.length} files in the preview →`
          : 'Updated the file in the preview →';
        bubble.appendChild(note);
        renderPreview(blocks);
      }
    } else {
      bubble.textContent = text;
    }

    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'typing';
    el.id = 'typing-indicator';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function hideTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  // ---------- View switching ----------
  function showAuth() {
    authScreen.classList.remove('hidden');
    landing.classList.add('hidden');
    chatapp.classList.add('hidden');
  }
  function showLanding() {
    authScreen.classList.add('hidden');
    landing.classList.remove('hidden');
    chatapp.classList.add('hidden');
  }
  function showChatApp() {
    authScreen.classList.add('hidden');
    landing.classList.add('hidden');
    chatapp.classList.remove('hidden');
  }

  // ---------- Supabase-backed chat persistence ----------
  async function fetchChats() {
    const { data, error } = await window.db
      .from('chats')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('Failed to load chats:', error.message);
      return [];
    }
    return data || [];
  }

  function renderChatsList() {
    chatsListEl.innerHTML = '';
    if (!chatsCache.length) {
      const empty = document.createElement('p');
      empty.className = 'chats-empty';
      empty.textContent = 'No chats yet — start one!';
      chatsListEl.appendChild(empty);
      return;
    }
    chatsCache.forEach((chat) => {
      const item = document.createElement('button');
      item.className = 'chat-item' + (chat.id === currentChatId ? ' active' : '');
      item.innerHTML = `
        <span class="chat-item-title">${escapeHtml(chat.title || 'New chat')}</span>
        <span class="chat-item-time">${relativeTime(chat.updated_at)}</span>
      `;
      item.addEventListener('click', () => {
        loadChat(chat.id);
        closeChatsPanel();
      });
      chatsListEl.appendChild(item);
    });
  }

  async function createChat(title) {
    const { data, error } = await window.db
      .from('chats')
      .insert({ user_id: currentUser.id, title })
      .select('id, title, updated_at')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function touchChat(chatId) {
    await window.db.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
  }

  async function saveMessage(chatId, role, content) {
    const { error } = await window.db.from('messages').insert({ chat_id: chatId, role, content });
    if (error) console.error('Failed to save message:', error.message);
  }

  async function loadChat(chatId) {
    currentChatId = chatId;
    history = [];
    messagesEl.innerHTML = '';
    resetPreview();

    const { data, error } = await window.db
      .from('messages')
      .select('role, content')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load messages:', error.message);
    } else {
      (data || []).forEach((m) => {
        history.push({ role: m.role, content: m.content });
        addMessage(m.role === 'assistant' ? 'model' : 'user', m.content);
      });
    }
    showChatApp();
    renderChatsList();
  }

  function startNewChatView() {
    currentChatId = null;
    history = [];
    messagesEl.innerHTML = '';
    resetPreview();
    showLanding();
    renderChatsList();
  }

  // ---------- Sending messages ----------
  async function sendMessage(text) {
    if (!currentChatId) {
      try {
        const title = text.length > 40 ? text.slice(0, 40).trim() + '…' : text;
        const chat = await createChat(title);
        currentChatId = chat.id;
        chatsCache.unshift(chat);
        showChatApp();
        renderChatsList();
      } catch (err) {
        addMessage('model', `Couldn't start a new chat: ${err.message}`, true);
        return;
      }
    }

    history.push({ role: 'user', content: text });
    addMessage('user', text);
    saveMessage(currentChatId, 'user', text);
    showTyping();
    chatSend.disabled = true;

    try {
      const { data: sessionData } = await window.db.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: history, model: getSelectedModel() }),
      });
      const data = await res.json();
      hideTyping();

      if (!res.ok) {
        addMessage('model', data.error || 'Something went wrong talking to the model.', true);
        return;
      }

      history.push({ role: 'assistant', content: data.text });
      addMessage('model', data.text);
      saveMessage(currentChatId, 'assistant', data.text);
      touchChat(currentChatId);

      const cached = chatsCache.find((c) => c.id === currentChatId);
      if (cached) {
        cached.updated_at = new Date().toISOString();
        chatsCache.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        renderChatsList();
      }
    } catch (err) {
      hideTyping();
      addMessage('model', 'Network error reaching the server. Is server.py running?', true);
    }
  }

  function enterChatMode(firstMessage) {
    sendMessage(firstMessage);
  }

  // ---------- Landing form ----------
  landingInput.addEventListener('input', () => {
    autoResize(landingInput);
    landingSend.disabled = landingInput.value.trim().length === 0;
  });
  landingInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      landingForm.requestSubmit();
    }
  });
  landingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = landingInput.value.trim();
    if (!text) return;
    landingInput.value = '';
    enterChatMode(text);
  });
  suggestionChips.forEach((chip) => {
    chip.addEventListener('click', () => enterChatMode(chip.dataset.prompt));
  });

  // ---------- Chat form ----------
  chatInput.addEventListener('input', () => {
    autoResize(chatInput);
    chatSend.disabled = chatInput.value.trim().length === 0;
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.requestSubmit();
    }
  });
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    autoResize(chatInput);
    chatSend.disabled = true;
    sendMessage(text);
  });

  // ---------- New chat / sign out ----------
  newChatBtn.addEventListener('click', () => {
    startNewChatView();
    closeChatsPanel();
  });
  signOutBtn.addEventListener('click', () => window.signOut());

  // ---------- Chat history panel (toggle button, works from landing + chat screens) ----------
  function isChatsPanelOpen() {
    return !chatsPanel.classList.contains('hidden');
  }
  function openChatsPanel() {
    chatsPanel.classList.remove('hidden');
  }
  function closeChatsPanel() {
    chatsPanel.classList.add('hidden');
  }
  function toggleChatsPanel() {
    if (isChatsPanelOpen()) closeChatsPanel();
    else openChatsPanel();
  }

  sidebarHistoryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleChatsPanel();
  });
  landingHistoryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleChatsPanel();
  });
  closeChatsPanelBtn.addEventListener('click', () => closeChatsPanel());

  document.addEventListener('click', (e) => {
    if (
      isChatsPanelOpen() &&
      !chatsPanel.contains(e.target) &&
      !sidebarHistoryBtn.contains(e.target) &&
      !landingHistoryBtn.contains(e.target)
    ) {
      closeChatsPanel();
    }
  });

  // ---------- Drag-to-resize the chat column vs. the preview pane ----------
  const SIDEBAR_WIDTH_KEY = 'codey-sidebar-width';

  function applySidebarWidth(px) {
    sidebar.style.width = px + 'px';
  }

  (function restoreSidebarWidth() {
    const saved = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY), 10);
    if (saved) applySidebarWidth(saved);
  })();

  let isResizingChat = false;

  chatResizer.addEventListener('mousedown', (e) => {
    isResizingChat = true;
    chatResizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizingChat) return;
    const rect = chatapp.getBoundingClientRect();
    const minSidebar = 260;
    const minPreview = 320;
    let newWidth = e.clientX - rect.left;
    newWidth = Math.max(minSidebar, Math.min(newWidth, rect.width - minPreview));
    applySidebarWidth(newWidth);
  });

  window.addEventListener('mouseup', () => {
    if (!isResizingChat) return;
    isResizingChat = false;
    chatResizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const current = parseInt(sidebar.style.width, 10);
    if (current) localStorage.setItem(SIDEBAR_WIDTH_KEY, String(current));
  });

  // ---------- Sidebar / preview collapse toggles ----------
  const SIDEBAR_COLLAPSED_KEY = 'codey-sidebar-collapsed';
  const PREVIEW_COLLAPSED_KEY = 'codey-preview-collapsed';

  function setSidebarCollapsed(collapsed) {
    chatapp.classList.toggle('sidebar-collapsed', collapsed);
    reopenSidebarBtn.classList.toggle('hidden', !collapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  }
  function setPreviewCollapsed(collapsed) {
    chatapp.classList.toggle('preview-collapsed', collapsed);
    reopenPreviewBtn.classList.toggle('hidden', !collapsed);
    localStorage.setItem(PREVIEW_COLLAPSED_KEY, collapsed ? '1' : '0');
  }

  collapseSidebarBtn.addEventListener('click', () => setSidebarCollapsed(true));
  reopenSidebarBtn.addEventListener('click', () => setSidebarCollapsed(false));
  hidePreviewBtn.addEventListener('click', () => setPreviewCollapsed(true));
  reopenPreviewBtn.addEventListener('click', () => setPreviewCollapsed(false));

  // Restore collapse state from a previous visit.
  setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
  setPreviewCollapsed(localStorage.getItem(PREVIEW_COLLAPSED_KEY) === '1');

  // ---------- Preview toolbar ----------
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const isCode = tab.dataset.tab === 'code';
      codePanel.classList.toggle('hidden', !isCode);
      previewFrame.classList.toggle('hidden', isCode);
      if (!isCode && !lastPreviewHtml) emptyPreview.classList.remove('hidden');
      if (isCode) emptyPreview.classList.add('hidden');
    });
  });
  refreshBtn.addEventListener('click', () => {
    if (lastPreviewHtml) previewFrame.srcdoc = lastPreviewHtml;
  });
  openBtn.addEventListener('click', () => {
    if (!lastPreviewHtml) return;
    const blob = new Blob([lastPreviewHtml], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  });
  downloadBtn.addEventListener('click', () => {
    if (!lastFiles.length) return;
    if (lastFiles.length === 1) {
      const f = lastFiles[0];
      downloadBlob(new Blob([f.code], { type: 'text/plain' }), f.filename);
    } else {
      downloadBlob(buildZip(lastFiles), 'codey-project.zip');
    }
  });

  // ---------- Auth bootstrap ----------
  window.onAuthSuccess = async (session) => {
    currentUser = session.user;
    userEmailEl.textContent = currentUser.email || 'Account';
    userAvatarEl.textContent = (currentUser.email || 'U').charAt(0).toUpperCase();
    chatsCache = await fetchChats();
    renderChatsList();
    if (chatsCache.length > 0) {
      await loadChat(chatsCache[0].id);
    } else {
      showLanding();
    }
  };

  (async function init() {
    const { data } = await window.db.auth.getSession();
    if (data?.session) {
      window.onAuthSuccess(data.session);
    } else {
      showAuth();
    }
  })();

  window.db.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentChatId = null;
      chatsCache = [];
      window.resetAuthScreen && window.resetAuthScreen();
      showAuth();
    }
  });
})();
