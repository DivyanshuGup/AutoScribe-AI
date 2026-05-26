// ─── STATE ───
let generatedData = {};
let chatHistory = [];
let currentTab = 'summary';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
let chatSidebarOpen = true;
let chatSessionCount = 1;

// ─── THEME ───
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('themeIcon').textContent = isDark ? '🌙' : '☀️';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

// ─── INIT ───
window.onload = () => {
  // Restore saved theme
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('themeIcon').textContent = saved === 'dark' ? '☀️' : '🌙';
};

// ─── GROQ API CALL (via Vercel backend) ───
async function callGroq(messages, systemPrompt, maxTokens = 4000) {
  const res = await fetch('/api/groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemPrompt, maxTokens, model: GROQ_MODEL })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'API request failed — please try again');
  }
  const data = await res.json();
  return data.content || '';
}

// ─── HAMBURGER (compact dropdown) ───
function toggleMenu() {
  const drawer = document.getElementById('mobileDrawer');
  drawer.classList.toggle('open');
}
function closeMenu() {
  document.getElementById('mobileDrawer').classList.remove('open');
}
// Close drawer on outside click
document.addEventListener('click', (e) => {
  const drawer = document.getElementById('mobileDrawer');
  const hamburger = document.getElementById('hamburger');
  if (!drawer.contains(e.target) && !hamburger.contains(e.target)) {
    drawer.classList.remove('open');
  }
});

// ─── TOAST ───
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast', 3500);
}

// ─── FILE UPLOAD ───
async function extractTextFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) {
    return await extractPDFText(file);
  } else {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
}

async function extractPDFText(file) {
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF library not loaded. Please refresh and try again.');
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  showToast(`📄 Extracting text from ${pdf.numPages} page(s)...`);
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  if (!fullText.trim()) throw new Error('No text found in PDF. Make sure it is not a scanned/image PDF.');
  return fullText.trim();
}

function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  processFile(file);
}

async function processFile(file) {
  showToast('⏳ Loading file: ' + file.name);
  try {
    const text = await extractTextFromFile(file);
    document.getElementById('lectureText').value = text;
    showToast('📂 File imported successfully: ' + file.name + ' (' + text.length + ' characters)', 'success');
  } catch(e) {
    showToast('❌ ' + e.message, 'error');
  }
}

// Drag-drop
const ua = document.getElementById('uploadArea');
ua.addEventListener('dragover', e => { e.preventDefault(); ua.classList.add('drag-over'); });
ua.addEventListener('dragleave', () => ua.classList.remove('drag-over'));
ua.addEventListener('drop', e => {
  e.preventDefault(); ua.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  processFile(file);
});

// ─── TAB SWITCH ───
function switchTab(btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentTab = btn.dataset.tab;
  renderTab(currentTab);
}

function renderTab(tab) {
  const oc = document.getElementById('outputContent');
  const data = generatedData[tab];
  if (!data) {
    oc.innerHTML = `<p style="color:var(--text3);font-size:0.88rem;">Generate content first, or make sure this option is selected in the left panel.</p>`;
    return;
  }
  if (tab === 'summary' || tab === 'notes') {
    oc.innerHTML = `
      <div class="output-section">
        <div class="output-section-title">${tab === 'summary' ? '📄 Summary' : '📝 Clean Notes'}</div>
        <div class="output-text">${escHtml(data)}</div>
      </div>
      <button class="copy-btn" onclick="copyText('${tab}')">📋 Copy</button>`;
  } else if (tab === 'highlights') {
    const items = data.split('\n').filter(l => l.trim());
    oc.innerHTML = `
      <div class="output-section">
        <div class="output-section-title">✨ Key Concepts</div>
        ${items.map(i => `<div class="highlight-item"><div class="hi-dot"></div><div class="hi-text">${escHtml(i.replace(/^[-•*]\s*/,''))}</div></div>`).join('')}
      </div>
      <button class="copy-btn" onclick="copyText('highlights')">📋 Copy</button>`;
  } else if (tab === 'flashcards') {
    const cards = parseFlashcards(data);
    oc.innerHTML = `
      <div class="output-section">
        <div class="output-section-title">🃏 Flashcards (tap/hover to reveal answer)</div>
        <div class="flashcard-grid">
          ${cards.map(c => `
            <div class="flashcard">
              <div class="fc-q">Q: ${escHtml(c.q)}</div>
              <div class="fc-a fc-hidden">Tap to reveal answer</div>
              <div class="fc-ans" style="display:none">${escHtml(c.a)}</div>
            </div>`).join('')}
        </div>
      </div>`;
    document.querySelectorAll('.flashcard').forEach(fc => {
      const toggle = () => {
        const fa = fc.querySelector('.fc-a');
        const ans = fc.querySelector('.fc-ans').textContent;
        if (fa.classList.contains('fc-hidden')) {
          fa.textContent = 'A: ' + ans;
          fa.style.color = 'var(--green)';
          fa.classList.remove('fc-hidden');
        } else {
          fa.textContent = 'Tap to reveal answer';
          fa.style.color = '';
          fa.classList.add('fc-hidden');
        }
      };
      fc.addEventListener('click', toggle);
      fc.addEventListener('mouseenter', () => {
        const fa = fc.querySelector('.fc-a');
        fa.textContent = 'A: ' + fc.querySelector('.fc-ans').textContent;
        fa.style.color = 'var(--green)';
        fa.classList.remove('fc-hidden');
      });
      fc.addEventListener('mouseleave', () => {
        const fa = fc.querySelector('.fc-a');
        fa.textContent = 'Tap to reveal answer';
        fa.style.color = ''; fa.classList.add('fc-hidden');
      });
    });
  } else if (tab === 'mindmap') {
    const lines = data.split('\n').filter(l => l.trim());
    const center = lines[0] ? lines[0].replace(/^[#\-•*]\s*/,'') : 'Main Topic';
    const branches = lines.slice(1).filter(l=>l.trim()).map(l => l.replace(/^[-•*#]\s*/,''));
    oc.innerHTML = `
      <div class="output-section">
        <div class="output-section-title">🗺️ Mind Map</div>
        <div class="mindmap-wrap">
          <div class="mindmap-center">${escHtml(center)}</div>
          <div>${branches.map(b => `<span class="mindmap-node">${escHtml(b)}</span>`).join('')}</div>
        </div>
      </div>`;
  } else if (tab === 'quiz') {
    const questions = parseQuiz(data);
    oc.innerHTML = `
      <div class="output-section">
        <div class="output-section-title">❓ Practice Quiz</div>
        ${questions.map((q,i) => `
          <div style="margin-bottom:1.5rem;padding:1rem;background:var(--bg3);border:1px solid var(--border);border-radius:10px;">
            <p style="font-size:0.9rem;font-weight:500;margin-bottom:0.75rem;">Q${i+1}. ${escHtml(q.q)}</p>
            ${q.opts.map((o,oi) => `
              <label style="display:flex;align-items:center;gap:8px;padding:0.4rem 0;cursor:pointer;font-size:0.85rem;color:var(--text2)">
                <input type="radio" name="q${i}" value="${oi}" style="accent-color:var(--accent)">
                ${escHtml(o)}
              </label>`).join('')}
            <div id="qa${i}" style="display:none;margin-top:0.5rem;font-size:0.82rem;color:var(--green)">✅ ${escHtml(q.ans)}</div>
            <button onclick="showAns(${i})" style="margin-top:0.5rem;" class="copy-btn">Show Answer</button>
          </div>`).join('')}
      </div>`;
  }
}

function showAns(i) { document.getElementById('qa'+i).style.display = 'block'; }

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function parseFlashcards(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const cards = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const l = lines[i];
    const next = lines[i+1];
    if (/^Q[:\d.\-\s]/i.test(l) && /^A[:\d.\-\s]/i.test(next)) {
      cards.push({ q: l.replace(/^Q[:\d.\-\s]*/i,'').trim(), a: next.replace(/^A[:\d.\-\s]*/i,'').trim() });
      i++;
    }
  }
  if (!cards.length) {
    for (let i = 0; i < lines.length - 1; i += 2) {
      if (lines[i] && lines[i+1]) cards.push({ q: lines[i].replace(/^[-•*\d.)\s]*/,''), a: lines[i+1].replace(/^[-•*\d.)\s]*/,'') });
    }
  }
  return cards.slice(0, 12);
}

function parseQuiz(text) {
  const blocks = text.split(/\n(?=Q?\d+[.)\s])/m).filter(b => b.trim());
  const questions = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim());
    if (!lines.length) continue;
    const qLine = lines[0].replace(/^Q?\d+[.)\s]+/i,'').trim();
    const opts = lines.slice(1).filter(l => /^[A-Da-d][.)]/i.test(l.trim())).map(l => l.replace(/^[A-Da-d][.)\s]*/i,'').trim());
    const ansLine = lines.find(l => /^(answer|ans|correct)/i.test(l.trim()));
    const ans = ansLine ? ansLine.replace(/^[^:]+:\s*/,'').trim() : '';
    if (qLine && opts.length >= 2) questions.push({q: qLine, opts, ans});
  }
  return questions.slice(0, 8);
}

async function copyText(tab) {
  await navigator.clipboard.writeText(generatedData[tab] || '').catch(()=>{});
  showToast('📋 Copied to clipboard!', 'success');
}

// ─── GENERATE ───
async function generateContent() {
  const text = document.getElementById('lectureText').value.trim();
  if (!text) { showToast('⚠️ Please paste or upload some lecture content first!', 'error'); return; }

  const selected = [...document.querySelectorAll('input[name=output]:checked')].map(c => c.value);
  if (!selected.length) { showToast('⚠️ Please select at least one output type!', 'error'); return; }

  const lang = document.getElementById('langSelect').value;
  const btn = document.getElementById('generateBtn');
  btn.disabled = true; btn.innerHTML = '⏳ Generating...';

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('outputContent').classList.remove('show');
  document.getElementById('loadingState').classList.add('show');

  const steps = ['ls1','ls2','ls3','ls4'];
  steps.forEach((id,i) => {
    setTimeout(() => {
      document.querySelectorAll('.load-step').forEach(s => s.classList.remove('active','done'));
      for (let j = 0; j < i; j++) document.getElementById(steps[j])?.classList.add('done');
      document.getElementById(id)?.classList.add('active');
    }, i * 900);
  });

  const prompt = buildPrompt(text, selected, lang);

  try {
    const raw = await callGroq([{ role: 'user', content: prompt }],
      `You are AutoScribe AI, an expert academic study assistant. Always respond in ${lang} language unless the user specifies otherwise. Be thorough, clear, and educational.`,
      4000
    );

    if (!raw) throw new Error('No response received — please try again');
    parseAndStore(raw, selected);

    document.getElementById('loadingState').classList.remove('show');
    document.getElementById('outputContent').classList.add('show');

    const firstTab = selected[0];
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === firstTab));
    currentTab = firstTab;
    renderTab(currentTab);
    showToast('✅ Content generated successfully!', 'success');

  } catch(e) {
    document.getElementById('loadingState').classList.remove('show');
    document.getElementById('emptyState').style.display = 'flex';
    showToast('❌ ' + (e.message || 'Something went wrong. Please try again.'), 'error');
  }

  btn.disabled = false; btn.innerHTML = '⚡ Generate Now';
}

function buildPrompt(text, selected, lang) {
  const sections = {
    summary:    `## SUMMARY\nWrite a comprehensive, well-structured summary of the lecture in ${lang}. Use clear paragraphs.`,
    highlights: `## HIGHLIGHTS\nList the 10 most important key concepts, terms, and ideas from the lecture in ${lang}. Each on a new line starting with •`,
    flashcards: `## FLASHCARDS\nCreate exactly 8 flashcard pairs in ${lang}.\nUse this exact format for each:\nQ: [question]\nA: [answer]\n`,
    mindmap:    `## MINDMAP\nCreate a mind map outline in ${lang}.\nLine 1: the single central topic (no bullet)\nLines 2+: each subtopic starting with •`,
    quiz:       `## QUIZ\nCreate 5 multiple choice questions in ${lang}.\nFormat each as:\nQ1. [question]\na) [option]\nb) [option]\nc) [option]\nd) [option]\nAnswer: [correct letter and text]\n`,
    notes:      `## NOTES\nCreate clean, well-organized study notes in ${lang}. Use headings (##) and bullet points (•). Be comprehensive.`
  };
  const parts = selected.map(s => sections[s]).filter(Boolean).join('\n\n');
  return `You are an expert study assistant. Analyze the lecture content below and generate the requested sections.\n\nIMPORTANT RULES:\n- Respond entirely in ${lang}\n- Use the exact ## section headers shown\n- Be thorough and educational\n\nLECTURE CONTENT:\n${text.substring(0, 6000)}\n\n${parts}`;
}

function parseAndStore(raw, selected) {
  generatedData = {};
  const sectionMap = {
    summary: 'SUMMARY', highlights: 'HIGHLIGHTS',
    flashcards: 'FLASHCARDS', mindmap: 'MINDMAP',
    quiz: 'QUIZ', notes: 'NOTES'
  };
  const allHeaders = Object.values(sectionMap).map(h => `## ${h}`);

  for (const key of selected) {
    const header = `## ${sectionMap[key]}`;
    const idx = raw.indexOf(header);
    if (idx === -1) { generatedData[key] = raw.trim(); continue; }
    const start = idx + header.length;
    let end = raw.length;
    for (const other of allHeaders) {
      if (other === header) continue;
      const oi = raw.indexOf(other, start);
      if (oi !== -1 && oi < end) end = oi;
    }
    generatedData[key] = raw.slice(start, end).trim();
  }
}

// ─── CHATBOT ───
function toggleChatSidebar() {
  const sidebar = document.getElementById('chatSidebar');
  chatSidebarOpen = !chatSidebarOpen;
  sidebar.classList.toggle('collapsed', !chatSidebarOpen);
}

function newChat() {
  chatHistory = [];
  chatSessionCount++;
  const area = document.getElementById('chatMessages');
  area.innerHTML = `
    <div class="chat-welcome">
      <div class="chat-welcome-icon">⚡</div>
      <h2>AutoScribe AI Assistant</h2>
      <p>Your intelligent study companion. Ask me to explain concepts, generate quizzes, or break down any topic from your lecture.</p>
      <div class="chat-welcome-chips">
        <span class="sug-chip" onclick="useSuggestion(this)">Explain this in simple terms</span>
        <span class="sug-chip" onclick="useSuggestion(this)">Give me a real-world example</span>
        <span class="sug-chip" onclick="useSuggestion(this)">What are the key takeaways?</span>
        <span class="sug-chip" onclick="useSuggestion(this)">Generate a practice quiz</span>
      </div>
    </div>`;
  
  // Add to history sidebar
  const list = document.getElementById('chatHistoryList');
  const prev = document.querySelector('.chat-history-item.active');
  if (prev) prev.classList.remove('active');
  const item = document.createElement('div');
  item.className = 'chat-history-item active';
  item.textContent = 'New conversation';
  item.id = 'currentChatItem';
  list.insertBefore(item, list.firstChild);
}

// Parse markdown to HTML with code blocks that have copy buttons
function markdownToHtml(text) {
  // Process code blocks first (```lang\ncode\n```)
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    const langLabel = lang || 'code';
    const id = 'cb_' + Math.random().toString(36).substr(2,8);
    const escaped = code.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<div class="code-block-wrapper">
      <div class="code-block-header">
        <span class="code-lang-label">${langLabel}</span>
        <button class="code-copy-btn" id="${id}" onclick="copyCode('${id}', this)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy code
        </button>
      </div>
      <pre><code id="${id}_code">${escaped}</code></pre>
    </div>`;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code style="background:rgba(108,99,255,0.15);padding:0.15em 0.4em;border-radius:4px;font-family:monospace;font-size:0.85em;">$1</code>');

  // Bold
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Headings
  text = text.replace(/^### (.+)$/gm, '<h4 style="font-family:Syne,sans-serif;font-size:0.9rem;margin:0.75rem 0 0.25rem;color:var(--accent2)">$1</h4>');
  text = text.replace(/^## (.+)$/gm, '<h3 style="font-family:Syne,sans-serif;font-size:1rem;margin:0.75rem 0 0.25rem;color:var(--accent2)">$1</h3>');
  text = text.replace(/^# (.+)$/gm, '<h2 style="font-family:Syne,sans-serif;font-size:1.1rem;margin:0.75rem 0 0.25rem">$1</h2>');
  // Bullets
  text = text.replace(/^[\-\*] (.+)$/gm, '<div style="display:flex;gap:8px;margin:2px 0"><span style="color:var(--accent2);margin-top:2px">•</span><span>$1</span></div>');
  // Numbered list
  text = text.replace(/^(\d+)\. (.+)$/gm, '<div style="display:flex;gap:8px;margin:2px 0"><span style="color:var(--accent2);min-width:18px;margin-top:2px">$1.</span><span>$2</span></div>');
  // Newlines
  text = text.replace(/\n\n/g, '<br><br>');
  text = text.replace(/\n/g, '<br>');

  return text;
}

function copyCode(id, btn) {
  const codeEl = document.getElementById(id + '_code');
  if (!codeEl) return;
  navigator.clipboard.writeText(codeEl.textContent).then(() => {
    btn.classList.add('copied');
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy code`;
    }, 2000);
  }).catch(() => {});
}

// Streaming text effect — char by char like ChatGPT
function streamText(container, fullText, onDone) {
  container.innerHTML = '';
  const html = markdownToHtml(fullText);
  // Use a temp div to parse, then stream the final html
  // For simplicity: animate the text, then set final html
  let i = 0;
  const plain = fullText;
  const cursor = document.createElement('span');
  cursor.className = 'stream-cursor';
  container.appendChild(cursor);

  const total = plain.length;
  const speed = total > 800 ? 6 : total > 400 ? 8 : 12; // ms per chunk
  const chunkSize = total > 1000 ? 4 : 2;

  function tick() {
    if (i >= total) {
      // Replace with fully formatted HTML
      container.innerHTML = markdownToHtml(fullText);
      if (onDone) onDone();
      return;
    }
    const next = Math.min(i + chunkSize, total);
    i = next;
    container.innerHTML = escHtml(plain.substring(0, i));
    container.appendChild(cursor.cloneNode());
    setTimeout(tick, speed);
  }
  setTimeout(tick, 50);
}

async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;

  // Hide welcome screen if visible
  const welcome = document.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  // Update sidebar title
  if (chatHistory.length === 0) {
    const item = document.getElementById('currentChatItem');
    if (item) item.textContent = msg.substring(0, 30) + (msg.length > 30 ? '...' : '');
  }

  appendChatMsg('user', msg);
  input.value = ''; input.style.height = 'auto';
  document.getElementById('sendBtn').disabled = true;

  chatHistory.push({ role: 'user', content: msg });

  const context = document.getElementById('lectureText').value.trim();
  const lang = document.getElementById('langSelect').value;
  const systemMsg = context
    ? `You are AutoScribe AI, an expert study assistant. The student is working with this lecture content:\n\n${context.substring(0, 3000)}\n\nHelp them understand concepts clearly. Always respond in ${lang} unless asked otherwise. Be friendly, concise, and educational.`
    : `You are AutoScribe AI, a friendly and knowledgeable study assistant. Help students understand academic concepts clearly with examples. Always respond in ${lang} unless asked otherwise. Be warm and encouraging.`;

  // Thinking bubble
  const thinkingId = appendThinkingBubble();

  try {
    const reply = await callGroq(chatHistory.slice(-12), systemMsg, 1200);
    chatHistory.push({ role: 'assistant', content: reply });

    // Remove thinking bubble, add real message with streaming
    const thinkingEl = document.getElementById(thinkingId);
    if (thinkingEl) thinkingEl.remove();

    appendChatMsg('ai', reply, true);

  } catch(e) {
    const thinkingEl = document.getElementById(thinkingId);
    if (thinkingEl) thinkingEl.remove();
    appendChatMsg('ai', '❌ ' + (e.message || 'Something went wrong. Please try again.'));
  }

  document.getElementById('sendBtn').disabled = false;
}

function appendThinkingBubble() {
  const msgs = document.getElementById('chatMessages');
  const id = 'thinking_' + Date.now();
  const div = document.createElement('div');
  div.className = 'chat-msg-row ai-row';
  div.id = id;
  div.innerHTML = `
    <div class="chat-msg-avatar">⚡</div>
    <div class="chat-msg-content">
      <div class="chat-msg-bubble">
        <div class="thinking-bubble">
          <div class="thinking-dot"></div>
          <div class="thinking-dot"></div>
          <div class="thinking-dot"></div>
        </div>
      </div>
    </div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return id;
}

function appendChatMsg(role, text, stream = false) {
  const msgs = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `chat-msg-row ${role === 'ai' ? 'ai-row' : 'user-row'}`;

  const avatar = role === 'ai' ? '⚡' : '👤';
  const bubbleContent = role === 'user' ? escHtml(text) : '';

  div.innerHTML = `
    <div class="chat-msg-avatar">${avatar}</div>
    <div class="chat-msg-content">
      <div class="chat-msg-bubble" id="bubble_${Date.now()}">${bubbleContent}</div>
    </div>`;

  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;

  // Stream AI responses
  if (role === 'ai' && stream) {
    const bubble = div.querySelector('.chat-msg-bubble');
    streamText(bubble, text, () => { msgs.scrollTop = msgs.scrollHeight; });
  }
}

function useSuggestion(el) {
  document.getElementById('chatInput').value = el.textContent;
  sendChat();
}
