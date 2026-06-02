const workspace = document.getElementById('workspace');
const canvas = document.getElementById('canvas');
const svg = document.getElementById('connections');
const statusEl = document.getElementById('status');
const nameInput = document.getElementById('nameInput');
const colorInput = document.getElementById('colorInput');
const projectTabs = document.getElementById('projectTabs');
const contextMenu = document.getElementById('contextMenu');
const ctxName = document.getElementById('ctxName');
const ctxColor = document.getElementById('ctxColor');

let state = {
  version: 2,
  projects: [],
  activeProjectId: null,
  selectedNodes: new Set(),
  selectedConnection: null,
  portDraft: null
};

const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
const setStatus = msg => statusEl.textContent = msg;
const currentProject = () => state.projects.find(p => p.id === state.activeProjectId) || state.projects[0];

function blankProject(title = `Projet ${state.projects.length + 1}`) {
  return { id: uid('project'), title, nodes: [], connections: [], groups: [], scale: 1, panX: 0, panY: 0 };
}

function seedProject(project) {
  state.activeProjectId = project.id;
  createNode({ x: 120, y: 110, title: 'Source', color: '#ffffff', rightPorts: ['Data'] }, false);
  createNode({ x: 440, y: 190, title: 'Traitement', color: '#fef3c7', leftPorts: ['Input'], rightPorts: ['Result'] }, false);
  createNode({ x: 780, y: 120, title: 'Sortie', color: '#dbeafe', leftPorts: ['Geometry'] }, false);
}

function ensureProject() {
  if (!state.projects.length) {
    const p = blankProject('Projet 1');
    state.projects.push(p);
    seedProject(p);
  }
  if (!state.activeProjectId) state.activeProjectId = state.projects[0].id;
}

function createProject() {
  const p = blankProject();
  state.projects.push(p);
  switchProject(p.id);
  setStatus('Nouveau projet créé.');
}

function switchProject(id) {
  state.activeProjectId = id;
  state.selectedNodes.clear();
  state.selectedConnection = null;
  state.portDraft = null;
  syncInspector();
  render();
}

function renameProject() {
  const p = currentProject();
  const next = prompt('Nom du projet', p.title);
  if (next) { p.title = next; renderProjectTabs(); setStatus('Projet renommé.'); }
}

function deleteProject() {
  if (state.projects.length <= 1) return alert('Il faut garder au moins un projet.');
  const p = currentProject();
  if (!confirm(`Supprimer le projet "${p.title}" ?`)) return;
  state.projects = state.projects.filter(x => x.id !== p.id);
  state.activeProjectId = state.projects[0].id;
  state.selectedNodes.clear();
  render();
}

function createNode(opts = {}, doSelect = true) {
  const p = currentProject();
  const kind = opts.kind || 'box';
  const defaults = {
    box: { title: `Box ${p.nodes.length + 1}`, leftPorts: ['Entrée'], rightPorts: ['Sortie'], color: '#ffffff' },
    panel: { title: 'Panel', leftPorts: [], rightPorts: ['Texte'], color: '#fff7ad', text: 'Écris ton texte ici...' },
    slider: { title: 'Slider', leftPorts: [], rightPorts: ['Valeur'], color: '#e0f2fe', value: 50, min: 0, max: 100 },
    switch: { title: 'Vrai / Faux', leftPorts: ['In'], rightPorts: ['Out'], color: '#dcfce7', value: true }
  }[kind];
  const n = {
    id: uid('node'), kind,
    title: opts.title || defaults.title,
    x: opts.x ?? 160,
    y: opts.y ?? 140,
    color: opts.color || defaults.color,
    groupId: null,
    text: opts.text ?? defaults.text ?? '',
    value: opts.value ?? defaults.value ?? 0,
    min: opts.min ?? defaults.min ?? 0,
    max: opts.max ?? defaults.max ?? 100,
    leftPorts: (opts.leftPorts ?? defaults.leftPorts).map(label => ({ id: uid('port'), label })),
    rightPorts: (opts.rightPorts ?? defaults.rightPorts).map(label => ({ id: uid('port'), label }))
  };
  p.nodes.push(n);
  render();
  if (doSelect) selectNode(n.id, false);
  return n;
}

function selectedNodes() { return currentProject().nodes.filter(n => state.selectedNodes.has(n.id)); }
function getNode(id) { return currentProject().nodes.find(n => n.id === id); }
function getPort(nodeId, portId) {
  const node = getNode(nodeId);
  if (!node) return null;
  const left = node.leftPorts.find(p => p.id === portId);
  const right = node.rightPorts.find(p => p.id === portId);
  return left ? { node, port: left, side: 'left' } : right ? { node, port: right, side: 'right' } : null;
}

function selectNode(id, additive) {
  if (!additive) state.selectedNodes.clear();
  state.selectedConnection = null;
  if (state.selectedNodes.has(id) && additive) state.selectedNodes.delete(id);
  else state.selectedNodes.add(id);
  syncInspector();
  render();
}

function syncInspector() {
  const nodes = selectedNodes();
  if (nodes.length === 1) {
    nameInput.value = nodes[0].title;
    nameInput.disabled = false;
    colorInput.value = rgbToHex(nodes[0].color || '#ffffff');
    colorInput.disabled = false;
  } else {
    nameInput.value = nodes.length ? `${nodes.length} éléments sélectionnés` : '';
    nameInput.disabled = nodes.length !== 1;
    colorInput.disabled = nodes.length === 0;
  }
}
function rgbToHex(v) { return v && v.startsWith('#') ? v : '#ffffff'; }

function render() {
  ensureProject();
  renderProjectTabs();
  applyTransform();
  canvas.innerHTML = '';
  svg.innerHTML = '';
  renderGroups();
  renderConnections();
  const muted = downstreamMutedNodes();
  for (const node of currentProject().nodes) renderNode(node, muted.has(node.id));
}

function renderProjectTabs() {
  projectTabs.innerHTML = '';
  state.projects.forEach(p => {
    const b = document.createElement('button');
    b.className = 'project-tab' + (p.id === state.activeProjectId ? ' active' : '');
    b.textContent = p.title;
    b.onclick = () => switchProject(p.id);
    projectTabs.appendChild(b);
  });
}

function renderNode(node, muted) {
  const tpl = document.getElementById('nodeTemplate');
  const el = tpl.content.firstElementChild.cloneNode(true);
  el.dataset.nodeId = node.id;
  el.classList.add(`kind-${node.kind || 'box'}`);
  if (muted) el.classList.add('muted-downstream');
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.background = node.color;
  el.querySelector('.node-title').textContent = node.title;
  el.querySelector('.node-kind').textContent = kindLabel(node.kind);
  if (state.selectedNodes.has(node.id)) el.classList.add('selected');
  if (node.groupId) el.classList.add('grouped');
  el.querySelector('.node-header').addEventListener('pointerdown', e => startDrag(e, node));
  el.addEventListener('pointerdown', e => {
    if (e.target.classList.contains('port') || e.target.classList.contains('port-remove') || e.target.closest('.node-control')) return;
    selectNode(node.id, e.shiftKey);
  });
  el.addEventListener('dblclick', e => {
    if (e.target.classList.contains('port') || e.target.classList.contains('port-label') || e.target.closest('.node-control')) return;
    const next = prompt('Renommer', node.title);
    if (next) { node.title = next; render(); syncInspector(); }
  });
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    if (!state.selectedNodes.has(node.id)) selectNode(node.id, e.shiftKey);
    showContextMenu(e.clientX, e.clientY, node.id);
  });
  const left = el.querySelector('.ports.left');
  const right = el.querySelector('.ports.right');
  node.leftPorts.forEach(p => left.appendChild(portRow(node, p, 'left')));
  node.rightPorts.forEach(p => right.appendChild(portRow(node, p, 'right')));
  renderNodeContent(node, el.querySelector('.node-content'));
  canvas.appendChild(el);
}

function kindLabel(kind) {
  return ({ box: 'BOX', panel: 'PANEL', slider: 'SLIDER', switch: 'BOOL' })[kind || 'box'] || 'BOX';
}

function renderNodeContent(node, content) {
  content.innerHTML = '';
  if (node.kind === 'panel') {
    const ta = document.createElement('textarea');
    ta.className = 'node-control panel-text';
    ta.value = node.text || '';
    ta.placeholder = 'Texte libre';
    ta.addEventListener('input', () => { node.text = ta.value; });
    content.appendChild(ta);
    return;
  }
  if (node.kind === 'slider') {
    const wrap = document.createElement('div'); wrap.className = 'node-control slider-wrap';
    const value = document.createElement('input'); value.type = 'number'; value.value = node.value; value.min = node.min; value.max = node.max;
    const range = document.createElement('input'); range.type = 'range'; range.value = node.value; range.min = node.min; range.max = node.max;
    const limits = document.createElement('div'); limits.className = 'slider-limits';
    const min = document.createElement('input'); min.type = 'number'; min.value = node.min; min.title = 'Minimum';
    const max = document.createElement('input'); max.type = 'number'; max.value = node.max; max.title = 'Maximum';
    const updateRange = () => { range.min = node.min; range.max = node.max; value.min = node.min; value.max = node.max; range.value = node.value; value.value = node.value; };
    value.oninput = () => { node.value = Number(value.value); range.value = node.value; };
    range.oninput = () => { node.value = Number(range.value); value.value = node.value; };
    min.onchange = () => { node.min = Number(min.value); if (node.value < node.min) node.value = node.min; updateRange(); };
    max.onchange = () => { node.max = Number(max.value); if (node.value > node.max) node.value = node.max; updateRange(); };
    limits.append(min, max); wrap.append(value, range, limits); content.appendChild(wrap); return;
  }
  if (node.kind === 'switch') {
    const label = document.createElement('label'); label.className = 'node-control switch-control';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!node.value;
    const pill = document.createElement('span'); pill.textContent = node.value ? 'Vrai' : 'Faux';
    input.onchange = () => { node.value = input.checked; render(); };
    label.append(input, pill); content.appendChild(label); return;
  }
  content.textContent = 'Double-clique pour renommer · Connecteurs éditables';
}

function portRow(node, p, side) {
  const row = document.createElement('div'); row.className = 'port-row';
  const dot = document.createElement('div'); dot.className = 'port';
  dot.dataset.nodeId = node.id; dot.dataset.portId = p.id; dot.dataset.side = side;
  if (state.portDraft?.portId === p.id) dot.classList.add('active');
  const label = document.createElement('span'); label.className = 'port-label'; label.textContent = p.label; label.title = p.label;
  const remove = document.createElement('span'); remove.className = 'port-remove'; remove.textContent = '×';
  dot.addEventListener('click', e => handlePortClick(e, node, p, side));
  dot.addEventListener('dblclick', e => { e.stopPropagation(); renamePort(p); });
  label.addEventListener('dblclick', e => { e.stopPropagation(); renamePort(p); });
  remove.addEventListener('click', e => { e.stopPropagation(); removePort(node.id, p.id, side); });
  row.append(dot, label, remove); return row;
}

function renamePort(p) { const next = prompt('Nom du connecteur', p.label); if (next) { p.label = next; render(); } }
function removePort(nodeId, portId, side) {
  const node = getNode(nodeId); const arr = side === 'left' ? node.leftPorts : node.rightPorts;
  if (arr.length <= 1) return alert('Impossible : il faut garder au moins un connecteur de ce côté.');
  if (!confirm('Supprimer ce connecteur et ses liens ?')) return;
  node[side === 'left' ? 'leftPorts' : 'rightPorts'] = arr.filter(p => p.id !== portId);
  currentProject().connections = currentProject().connections.filter(c => c.from.portId !== portId && c.to.portId !== portId);
  render();
}

function handlePortClick(e, node, port, side) {
  e.stopPropagation();
  if (!state.portDraft) {
    if (side !== 'right') { setStatus('Commence par cliquer une sortie à droite.'); return; }
    state.portDraft = { nodeId: node.id, portId: port.id };
    setStatus('Choisis une entrée à gauche pour créer la connexion.'); render(); return;
  }
  if (side !== 'left') { state.portDraft = null; setStatus('Connexion annulée.'); render(); return; }
  if (state.portDraft.nodeId === node.id) { state.portDraft = null; setStatus('Connexion annulée : même élément.'); render(); return; }
  const p = currentProject();
  const exists = p.connections.some(c => c.from.portId === state.portDraft.portId && c.to.portId === port.id);
  if (!exists) p.connections.push({ id: uid('conn'), from: state.portDraft, to: { nodeId: node.id, portId: port.id } });
  state.portDraft = null; setStatus('Connexion créée.'); render();
}

function renderConnections() { currentProject().connections.forEach(drawConnection); }
function drawConnection(c) {
  const a = portPosition(c.from.nodeId, c.from.portId), b = portPosition(c.to.nodeId, c.to.portId); if (!a || !b) return;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const dx = Math.max(80, Math.abs(b.x - a.x) * .45);
  path.setAttribute('d', `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`);
  path.setAttribute('class', `connection ${state.selectedConnection === c.id ? 'selected' : ''}`);
  path.style.pointerEvents = 'stroke';
  path.addEventListener('click', e => { e.stopPropagation(); state.selectedConnection = c.id; state.selectedNodes.clear(); syncInspector(); render(); });
  svg.appendChild(path);
}
function portPosition(nodeId, portId) {
  const node = getNode(nodeId), info = getPort(nodeId, portId); if (!node || !info) return null;
  const arr = info.side === 'left' ? node.leftPorts : node.rightPorts;
  const index = arr.findIndex(p => p.id === portId), count = arr.length;
  return { x: node.x + (info.side === 'left' ? 8 : 202), y: node.y + 55 + (index - (count - 1) / 2) * 27 };
}

function downstreamMutedNodes() {
  const p = currentProject(); const muted = new Set();
  const starts = p.nodes.filter(n => n.kind === 'switch' && !n.value).map(n => n.id);
  const walk = id => p.connections.filter(c => c.from.nodeId === id).forEach(c => { if (!muted.has(c.to.nodeId)) { muted.add(c.to.nodeId); walk(c.to.nodeId); } });
  starts.forEach(walk); return muted;
}

function startDrag(e, node) {
  e.stopPropagation(); selectNode(node.id, e.shiftKey);
  const start = screenToCanvas(e.clientX, e.clientY);
  const moving = selectedNodes().map(n => ({ id: n.id, x: n.x, y: n.y }));
  const onMove = ev => { const p = screenToCanvas(ev.clientX, ev.clientY); const dx = p.x - start.x, dy = p.y - start.y; moving.forEach(m => { const n = getNode(m.id); n.x = snap(m.x + dx); n.y = snap(m.y + dy); }); render(); };
  const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
}
function snap(v) { return Math.round(v / 12) * 12; }
function screenToCanvas(x, y) { const r = workspace.getBoundingClientRect(); const p = currentProject(); return { x: (x - r.left - p.panX) / p.scale, y: (y - r.top - p.panY) / p.scale }; }
function applyTransform() { const p = currentProject(); const t = `translate(${p.panX}px, ${p.panY}px) scale(${p.scale})`; canvas.style.transform = t; svg.style.transform = t; }

workspace.addEventListener('pointerdown', e => { if (e.target !== workspace && e.target !== canvas && e.target !== svg) return; state.selectedNodes.clear(); state.selectedConnection = null; state.portDraft = null; syncInspector(); render(); });
let panning = false, spaceDown = false;
window.addEventListener('keydown', e => { if (e.code === 'Space') { spaceDown = true; workspace.style.cursor = 'grab'; } if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection(); if (e.key === 'Escape') { state.portDraft = null; state.selectedConnection = null; render(); } });
window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; workspace.style.cursor = 'default'; } });
workspace.addEventListener('pointerdown', e => { if (!spaceDown) return; const p = currentProject(); panning = { x: e.clientX, y: e.clientY, panX: p.panX, panY: p.panY }; workspace.setPointerCapture(e.pointerId); });
workspace.addEventListener('pointermove', e => { if (!panning) return; const p = currentProject(); p.panX = panning.panX + e.clientX - panning.x; p.panY = panning.panY + e.clientY - panning.y; applyTransform(); });
workspace.addEventListener('pointerup', () => { panning = false; });
workspace.addEventListener('wheel', e => { e.preventDefault(); const p = currentProject(); const before = screenToCanvas(e.clientX, e.clientY); p.scale = Math.min(2.2, Math.max(.35, p.scale * (e.deltaY < 0 ? 1.08 : .92))); const after = screenToCanvas(e.clientX, e.clientY); p.panX += (after.x - before.x) * p.scale; p.panY += (after.y - before.y) * p.scale; applyTransform(); }, { passive: false });

function align(kind) {
  const nodes = selectedNodes(); if (nodes.length < 2) return setStatus('Sélectionne au moins 2 éléments.');
  const minX = Math.min(...nodes.map(n => n.x)), maxX = Math.max(...nodes.map(n => n.x + 210));
  const minY = Math.min(...nodes.map(n => n.y)), maxY = Math.max(...nodes.map(n => n.y + 112));
  for (const n of nodes) { if (kind === 'left') n.x = minX; if (kind === 'center') n.x = minX + (maxX - minX) / 2 - 105; if (kind === 'right') n.x = maxX - 210; if (kind === 'top') n.y = minY; if (kind === 'middle') n.y = minY + (maxY - minY) / 2 - 56; if (kind === 'bottom') n.y = maxY - 112; }
  render();
}
function autoSort() { const nodes = selectedNodes().length ? selectedNodes() : currentProject().nodes; nodes.forEach((n, i) => { n.x = 120 + (i % 4) * 290; n.y = 110 + Math.floor(i / 4) * 190; }); render(); }
function groupSelection() { const nodes = selectedNodes(); if (nodes.length < 2) return setStatus('Sélectionne plusieurs éléments à grouper.'); const id = uid('group'); currentProject().groups.push({ id, title: `Groupe ${currentProject().groups.length + 1}` }); nodes.forEach(n => n.groupId = id); render(); setStatus('Groupe créé.'); }
function ungroupSelection() { const ids = new Set(selectedNodes().map(n => n.groupId).filter(Boolean)); currentProject().nodes.forEach(n => { if (ids.has(n.groupId)) n.groupId = null; }); currentProject().groups = currentProject().groups.filter(g => !ids.has(g.id)); render(); }
function renderGroups() { const p = currentProject(); for (const g of p.groups) { const nodes = p.nodes.filter(n => n.groupId === g.id); if (!nodes.length) continue; const minX = Math.min(...nodes.map(n => n.x)) - 30, minY = Math.min(...nodes.map(n => n.y)) - 30, maxX = Math.max(...nodes.map(n => n.x + 210)) + 30, maxY = Math.max(...nodes.map(n => n.y + 112)) + 30; const box = document.createElement('div'); box.className = 'group-box'; box.style.left = `${minX}px`; box.style.top = `${minY}px`; box.style.width = `${maxX - minX}px`; box.style.height = `${maxY - minY}px`; canvas.appendChild(box); } }
function deleteSelection() { const p = currentProject(); if (state.selectedConnection) { p.connections = p.connections.filter(c => c.id !== state.selectedConnection); state.selectedConnection = null; render(); return; } const ids = new Set(state.selectedNodes); if (!ids.size) return; p.nodes = p.nodes.filter(n => !ids.has(n.id)); p.connections = p.connections.filter(c => !ids.has(c.from.nodeId) && !ids.has(c.to.nodeId)); state.selectedNodes.clear(); syncInspector(); render(); }

function serializableState() { return { version: 3, exportedAt: new Date().toISOString(), activeProjectId: state.activeProjectId, projects: state.projects }; }

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}
function base64ToBytes(str) {
  const binary = atob(str);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}
async function deriveAccessKey(secret, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
async function encryptPayload(payload, secret) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAccessKey(secret, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)));
  return {
    nodeBoardEncrypted: true,
    version: 3,
    exportedAt: new Date().toISOString(),
    crypto: { alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: 250000, salt: bytesToBase64(salt), iv: bytesToBase64(iv) },
    payload: bytesToBase64(new Uint8Array(encrypted))
  };
}
async function decryptPayload(wrapper, secret) {
  if (!window.crypto?.subtle) throw new Error("Le chiffrement Web Crypto n'est pas disponible dans ce navigateur.");
  const dec = new TextDecoder();
  const salt = base64ToBytes(wrapper.crypto?.salt || '');
  const iv = base64ToBytes(wrapper.crypto?.iv || '');
  const data = base64ToBytes(wrapper.payload || '');
  const key = await deriveAccessKey(secret, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(dec.decode(decrypted));
}
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function normalizeProject(p, index = 0) { return { id: p.id || uid('project'), title: p.title || `Projet ${index + 1}`, nodes: Array.isArray(p.nodes) ? p.nodes.map(n => ({ kind: 'box', text: '', value: true, min: 0, max: 100, ...n })) : [], connections: Array.isArray(p.connections) ? p.connections : [], groups: Array.isArray(p.groups) ? p.groups : [], scale: typeof p.scale === 'number' ? p.scale : 1, panX: typeof p.panX === 'number' ? p.panX : 0, panY: typeof p.panY === 'number' ? p.panY : 0 }; }
function normalizeLoadedState(loaded) {
  let projects;
  if (Array.isArray(loaded?.projects)) projects = loaded.projects.map(normalizeProject);
  else {
    const payload = loaded && loaded.nodes ? loaded : loaded?.project;
    if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.connections)) throw new Error('Format de fichier invalide.');
    projects = [normalizeProject({ ...payload, title: 'Projet importé' }, 0)];
  }
  if (!projects.length) projects = [blankProject('Projet 1')];
  return { version: 2, projects, activeProjectId: loaded.activeProjectId && projects.some(p => p.id === loaded.activeProjectId) ? loaded.activeProjectId : projects[0].id, selectedNodes: new Set(), selectedConnection: null, portDraft: null };
}
async function exportFile() {
  const data = serializableState();
  const safeDate = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  let filename = `node-board-projets-${safeDate}.json`;
  const key = prompt("Définis une clé d'accès pour protéger ce fichier. Laisse vide pour exporter sans protection.");
  if (key === null) return setStatus('Export annulé.');
  try {
    if (key.trim()) {
      const confirmKey = prompt("Confirme la clé d'accès.");
      if (confirmKey === null) return setStatus('Export annulé.');
      if (confirmKey !== key) return alert('Les deux clés ne correspondent pas. Export annulé.');
      filename = `node-board-projets-protege-${safeDate}.json`;
      const protectedData = await encryptPayload(data, key);
      downloadJson(protectedData, filename);
      setStatus(`Sauvegarde protégée exportée : ${filename}`);
    } else {
      downloadJson(data, filename);
      setStatus(`Sauvegarde non protégée exportée : ${filename}`);
    }
  } catch (err) {
    alert(err.message || 'Impossible de créer le fichier protégé.');
    setStatus('Export annulé.');
  }
}
async function importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      let loaded = JSON.parse(reader.result);
      if (loaded?.nodeBoardEncrypted) {
        const key = prompt("Ce fichier est protégé. Entre la clé d'accès pour l'ouvrir.");
        if (!key) return setStatus('Import annulé.');
        try {
          loaded = await decryptPayload(loaded, key);
        } catch {
          alert('Clé incorrecte ou fichier protégé invalide.');
          return setStatus('Import annulé.');
        }
      }
      state = normalizeLoadedState(loaded);
      syncInspector();
      render();
      setStatus(`Fichier chargé : ${file.name}`);
    } catch (err) {
      alert(err.message || 'Impossible de charger ce fichier.');
      setStatus('Import annulé.');
    }
  };
  reader.onerror = () => { alert('Impossible de lire ce fichier.'); setStatus('Import annulé.'); };
  reader.readAsText(file);
}
function save() { localStorage.setItem('node-board-v2', JSON.stringify(serializableState())); setStatus('Tous les projets sont sauvegardés dans le navigateur.'); }
function load() { const raw = localStorage.getItem('node-board-v2') || localStorage.getItem('node-board-v1'); if (!raw) return setStatus('Aucune sauvegarde trouvée.'); try { state = normalizeLoadedState(JSON.parse(raw)); syncInspector(); render(); setStatus('Tous les projets sont chargés.'); } catch { setStatus('Sauvegarde navigateur incompatible.'); } }


function hideContextMenu() {
  if (contextMenu) contextMenu.hidden = true;
}

function showContextMenu(clientX, clientY, nodeId) {
  const node = getNode(nodeId);
  if (!node || !contextMenu) return;
  ctxName.value = node.title || '';
  ctxColor.value = rgbToHex(node.color || '#ffffff');
  contextMenu.hidden = false;
  const pad = 10;
  const w = contextMenu.offsetWidth || 260;
  const h = contextMenu.offsetHeight || 320;
  contextMenu.style.left = `${Math.min(clientX, window.innerWidth - w - pad)}px`;
  contextMenu.style.top = `${Math.min(clientY, window.innerHeight - h - pad)}px`;
}

function renameSelectedPorts() {
  const nodes = selectedNodes();
  if (!nodes.length) return;
  const node = nodes[0];
  const all = [
    ...node.leftPorts.map((p, i) => ({ ...p, side: 'left', index: i + 1 })),
    ...node.rightPorts.map((p, i) => ({ ...p, side: 'right', index: i + 1 }))
  ];
  if (!all.length) return alert('Cet outil n’a pas de connecteur.');
  const list = all.map((p, i) => `${i + 1}. ${p.side === 'left' ? 'Entrée' : 'Sortie'} : ${p.label}`).join('\n');
  const choice = prompt(`Quel connecteur renommer ?\n${list}\n\nTape le numéro du connecteur.`);
  if (!choice) return;
  const idx = Number(choice) - 1;
  const picked = all[idx];
  if (!picked) return alert('Numéro invalide.');
  const port = picked.side === 'left' ? node.leftPorts[picked.index - 1] : node.rightPorts[picked.index - 1];
  const next = prompt('Nouveau nom du connecteur', port.label);
  if (next) { port.label = next; render(); showContextMenu(contextMenu.offsetLeft, contextMenu.offsetTop, node.id); }
}

function createToolAt(tool, clientX, clientY) {
  const pos = screenToCanvas(clientX, clientY);
  const n = createNode({ kind: tool, x: snap(pos.x - 105), y: snap(pos.y - 56) });
  setStatus(`${kindLabel(tool).toLowerCase()} ajouté par glisser-déposer.`);
  return n;
}

function setupToolPalette() {
  document.querySelectorAll('.tool-icon').forEach(icon => {
    icon.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', icon.dataset.tool);
      e.dataTransfer.effectAllowed = 'copy';
      icon.classList.add('dragging');
    });
    icon.addEventListener('dragend', () => icon.classList.remove('dragging'));
    icon.addEventListener('click', () => setStatus('Glisse cette icône dans l’espace blanc pour l’ajouter.'));
  });
  workspace.addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      workspace.classList.add('drop-ready');
    }
  });
  workspace.addEventListener('dragleave', e => {
    if (!workspace.contains(e.relatedTarget)) workspace.classList.remove('drop-ready');
  });
  workspace.addEventListener('drop', e => {
    e.preventDefault();
    workspace.classList.remove('drop-ready');
    const tool = e.dataTransfer.getData('text/plain');
    if (!['box', 'panel', 'slider', 'switch'].includes(tool)) return;
    createToolAt(tool, e.clientX, e.clientY);
  });
}

function setupContextMenu() {
  document.addEventListener('click', e => {
    if (contextMenu && !contextMenu.hidden && !contextMenu.contains(e.target)) hideContextMenu();
  });
  document.addEventListener('contextmenu', e => {
    if (!e.target.closest('.node')) hideContextMenu();
  });
  ctxName.addEventListener('input', () => {
    selectedNodes().forEach(n => n.title = ctxName.value);
    render();
  });
  ctxColor.addEventListener('input', () => {
    selectedNodes().forEach(n => n.color = ctxColor.value);
    render();
  });
  document.getElementById('ctxAddLeft').onclick = e => {
    e.preventDefault();
    selectedNodes().forEach(n => n.leftPorts.push({ id: uid('port'), label: `Entrée ${n.leftPorts.length + 1}` }));
    render();
  };
  document.getElementById('ctxAddRight').onclick = e => {
    e.preventDefault();
    selectedNodes().forEach(n => n.rightPorts.push({ id: uid('port'), label: `Sortie ${n.rightPorts.length + 1}` }));
    render();
  };
  document.getElementById('ctxRenamePorts').onclick = e => { e.preventDefault(); renameSelectedPorts(); };
  document.getElementById('ctxGroup').onclick = e => { e.preventDefault(); groupSelection(); hideContextMenu(); };
  document.getElementById('ctxUngroup').onclick = e => { e.preventDefault(); ungroupSelection(); hideContextMenu(); };
  document.getElementById('ctxDelete').onclick = e => { e.preventDefault(); deleteSelection(); hideContextMenu(); };
}

nameInput.addEventListener('input', () => { const nodes = selectedNodes(); if (nodes.length === 1) { nodes[0].title = nameInput.value; render(); } });
colorInput.addEventListener('input', () => { selectedNodes().forEach(n => n.color = colorInput.value); render(); });
document.getElementById('addLeftPortBtn').onclick = () => { selectedNodes().forEach(n => n.leftPorts.push({ id: uid('port'), label: `Entrée ${n.leftPorts.length + 1}` })); render(); };
document.getElementById('addRightPortBtn').onclick = () => { selectedNodes().forEach(n => n.rightPorts.push({ id: uid('port'), label: `Sortie ${n.rightPorts.length + 1}` })); render(); };
document.getElementById('addProjectBtn').onclick = createProject;
document.getElementById('renameProjectBtn').onclick = renameProject;
document.getElementById('deleteProjectBtn').onclick = deleteProject;
document.getElementById('deleteBtn').onclick = deleteSelection;
document.getElementById('sortBtn').onclick = autoSort;
document.getElementById('addGroupBtn').onclick = groupSelection;
document.getElementById('ungroupBtn').onclick = ungroupSelection;
document.getElementById('saveBtn').onclick = save;
document.getElementById('loadBtn').onclick = load;
document.getElementById('exportBtn').onclick = exportFile;
document.getElementById('importBtn').onclick = () => document.getElementById('importFileInput').click();
document.getElementById('importFileInput').addEventListener('change', e => { importFile(e.target.files[0]); e.target.value = ''; });
document.getElementById('clearBtn').onclick = () => { if (confirm('Vider le projet actif ?')) { const p = currentProject(); p.nodes=[]; p.connections=[]; p.groups=[]; state.selectedNodes.clear(); render(); } };
document.querySelectorAll('[data-align]').forEach(b => b.onclick = () => align(b.dataset.align));

setupToolPalette();
setupContextMenu();
ensureProject();
syncInspector();
render();
