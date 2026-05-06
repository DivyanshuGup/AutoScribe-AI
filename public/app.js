// ─── STATE ───
let generatedData = {};
let chatHistory = [];
let currentTab = 'summary';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ─── INIT ───
window.onload = () => {
  // Ready
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

// ─── HAMBURGER ───
function toggleMenu() {
  document.getElementById('navLinks').classList.toggle('open');
}

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
      if (lines[i] && lines[i+1]) cards.push({ q: lines[i].replace(/^[-•*\d.)]\s*/,''), a: lines[i+1].replace(/^[-•*\d.)]\s*/,'') });
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
async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;

  appendMsg('user', msg);
  input.value = ''; input.style.height = 'auto';
  document.getElementById('sendBtn').disabled = true;
  document.getElementById('chatSuggestions').style.display = 'none';

  chatHistory.push({ role: 'user', content: msg });

  const context = document.getElementById('lectureText').value.trim();
  const lang = document.getElementById('langSelect').value;
  const systemMsg = context
    ? `You are AutoScribe AI, an expert study assistant. The student is working with this lecture content:\n\n${context.substring(0, 3000)}\n\nHelp them understand concepts clearly. Always respond in ${lang} unless asked otherwise. Be friendly, concise, and educational.`
    : `You are AutoScribe AI, a friendly and knowledgeable study assistant. Help students understand academic concepts clearly with examples. Always respond in ${lang} unless asked otherwise. Be warm and encouraging.`;

  const typingId = 'typing_' + Date.now();
  appendMsg('ai', '<span style="opacity:0.5">Thinking...</span>', typingId);

  try {
    const reply = await callGroq(chatHistory.slice(-12), systemMsg, 1200);
    chatHistory.push({ role: 'assistant', content: reply });
    const el = document.getElementById(typingId);
    if (el) {
      const bubble = el.querySelector('.msg-bubble');
      if (bubble) bubble.innerHTML = reply.replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
    }
  } catch(e) {
    const el = document.getElementById(typingId);
    if (el) {
      const bubble = el.querySelector('.msg-bubble');
      if (bubble) bubble.innerHTML = '❌ ' + (e.message || 'Something went wrong. Please try again.');
    }
  }

  document.getElementById('sendBtn').disabled = false;
  document.getElementById('chatMessages').scrollTop = 9999;
}

function appendMsg(role, html, id) {
  const msgs = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  if (id) div.id = id;
  div.innerHTML = `
    <div class="msg-avatar">${role === 'ai' ? '🤖' : '👤'}</div>
    <div class="msg-bubble">${html}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function useSuggestion(el) {
  document.getElementById('chatInput').value = el.textContent;
  sendChat();
}
