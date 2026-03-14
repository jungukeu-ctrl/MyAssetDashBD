// ═══════════════════════════════════════════
//  ★ 할 일 (Todo)
// ═══════════════════════════════════════════
let editingTodo = -1;
let dragSrcIdx  = -1;

function renderTodos() {
  const list = document.getElementById('todo-list');
  if (!todos.length) {
    list.innerHTML = '<li style="font-size:12px;color:var(--text3);padding:8px 12px">할 일을 추가해 보세요</li>';
    return;
  }
  list.innerHTML = todos.map((t, i) => {
    if (i === editingTodo) {
      return `<li class="todo-item" style="cursor:default">
        <div class="todo-check" style="visibility:hidden"></div>
        <input class="todo-edit-input" id="todo-edit-${i}" value="${t.text.replace(/"/g,'&quot;')}"
          onkeydown="if(event.key==='Enter')saveTodoEdit(${i});if(event.key==='Escape')cancelTodoEdit();">
        <div class="todo-actions" style="opacity:1">
          <button class="todo-btn edit" onclick="saveTodoEdit(${i})">✓</button>
          <button class="todo-btn del"  onclick="cancelTodoEdit()">✕</button>
        </div>
      </li>`;
    }
    return `<li class="todo-item ${t.done?'done':''}" draggable="true" data-idx="${i}"
        onclick="toggleTodo(${i})"
        ondragstart="todoDragStart(event,${i})" ondragover="todoDragOver(event)"
        ondragleave="todoDragLeave(event)" ondrop="todoDrop(event,${i})" ondragend="todoDragEnd(event)">
      <span class="todo-drag-handle" onclick="event.stopPropagation()">⋮⋮</span>
      <div class="todo-check">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" stroke-width="2">
          <polyline points="1 5 4 8 9 2"/>
        </svg>
      </div>
      <div class="todo-text">${t.text}</div>
      <div class="todo-actions">
        <button class="todo-btn edit" onclick="event.stopPropagation();startTodoEdit(${i})">✏</button>
        <button class="todo-btn del"  onclick="event.stopPropagation();deleteTodo(${i})">🗑</button>
      </div>
    </li>`;
  }).join('');
  if (editingTodo >= 0) {
    const inp = document.getElementById('todo-edit-' + editingTodo);
    if (inp) { inp.focus(); inp.select(); }
  }
}

function addTodo() {
  const inp  = document.getElementById('todo-input');
  const text = inp.value.trim();
  if (!text) return;
  todos.push({ text, done: false });
  inp.value = '';
  localStorage.setItem('asset-todos', JSON.stringify(todos));
  scheduleGasSync_();
  renderTodos();
}

function toggleTodo(i) {
  if (editingTodo >= 0) return;
  todos[i].done = !todos[i].done;
  localStorage.setItem('asset-todos', JSON.stringify(todos));
  scheduleGasSync_();
  renderTodos();
}

function startTodoEdit(i) { editingTodo = i; renderTodos(); }

function saveTodoEdit(i) {
  const inp = document.getElementById('todo-edit-' + i);
  if (!inp) return;
  const text = inp.value.trim();
  if (text) todos[i].text = text;
  editingTodo = -1;
  localStorage.setItem('asset-todos', JSON.stringify(todos));
  scheduleGasSync_();
  renderTodos();
}

function cancelTodoEdit() { editingTodo = -1; renderTodos(); }

function todoDragStart(e, i) {
  dragSrcIdx = i;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => { const el = e.currentTarget; if (el) el.classList.add('dragging'); }, 0);
}
function todoDragOver(e)  { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('drag-over'); }
function todoDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

function todoDrop(e, targetIdx) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (dragSrcIdx === -1 || dragSrcIdx === targetIdx) return;
  const moved = todos.splice(dragSrcIdx, 1)[0];
  todos.splice(targetIdx, 0, moved);
  dragSrcIdx = -1;
  localStorage.setItem('asset-todos', JSON.stringify(todos));
  scheduleGasSync_();
  renderTodos();
}

function todoDragEnd(e) {
  dragSrcIdx = -1;
  document.querySelectorAll('.todo-item').forEach(el => el.classList.remove('dragging','drag-over'));
}

function deleteTodo(i) {
  todos.splice(i, 1);
  if (editingTodo === i) editingTodo = -1;
  localStorage.setItem('asset-todos', JSON.stringify(todos));
  scheduleGasSync_();
  renderTodos();
}

function addDefaultTodos() {
  if (todos.length === 0) {
    todos = [
      { text:'Gemini Gem → 토스 스크린샷 업로드 → JSON 추출 → 토스 붙여넣기', done:false },
      { text:'Gemini Gem → 키움 MY페이지 캡처 → JSON 추출 → 키움 스냅샷',     done:false },
      { text:'부동산 시세 확인 및 업데이트',                                      done:false },
      { text:'국민연금 예상 수령액 조회',                                          done:false },
    ];
    localStorage.setItem('asset-todos', JSON.stringify(todos));
  }
}
