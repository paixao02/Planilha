import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyD1OsrAZ_DOshpsUNmVAxY7bGab0y8q_5U",
  authDomain: "planilha-d6258.firebaseapp.com",
  projectId: "planilha-d6258",
  storageBucket: "planilha-d6258.appspot.com",
  messagingSenderId: "993391235536",
  appId: "1:993391235536:web:923a9c601cf38b4703a9d5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let user = null;
let transactions = [];
let page = localStorage.getItem('finance_page') || 'dashboard';
let unsub = null;
let editingId = null;

const $ = (s) => document.querySelector(s);
const money = v => (Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today = () => new Date().toISOString().slice(0,10);
const monthKey = d => (d || today()).slice(0,7);
const currentMonth = () => localStorage.getItem('finance_month') || monthKey(today());
const normalize = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

const categoryRules = [
  ['salario|pagamento|pix recebido|recebi|freela|comissao|bonus|reembolso','Salário','💰','income'],
  ['mercado|supermercado|padaria|ifood|lanche|restaurante|pizza|hamburguer|comida|acai|lanche','Alimentação','🍔','expense'],
  ['uber|99|onibus|combustivel|gasolina|alcool|moto|mecanico|estacionamento|metro','Transporte','🚗','expense'],
  ['farmacia|remedio|medico|consulta|hospital|dentista|exame','Saúde','💊','expense'],
  ['netflix|spotify|prime|assinatura|internet|celular|claro|vivo|tim|oi|game pass','Assinaturas','📱','expense'],
  ['shopee|mercado livre|amazon|magalu|compra|roupa|tenis|maquiagem|sandalia','Compras','🛒','expense'],
  ['aluguel|energia|agua|condominio|casa|limpeza|gas|luz','Casa','🏠','expense'],
  ['aposta|bet|cassino|blaze|betfair|pixbet|luva|green','Apostas','🎲','expense'],
  ['presente|namorada|familia|mae|pai|irmao|ajuda','Família','❤️','expense']
];
const catIcon = cat => (categoryRules.find(r => r[1] === cat)||[])[2] || '🏷️';
function autoCategory(text, type='expense'){
  const n = normalize(text);
  for(const [rx,cat,,t] of categoryRules){ if((!t || t===type) && new RegExp(rx).test(n)) return cat; }
  return type === 'income' ? 'Outras receitas' : 'Outros';
}

function filtered(){
  const k = currentMonth();
  const search = normalize(localStorage.getItem('finance_search') || '');
  return transactions.filter(t => monthKey(t.date) === k).filter(t => !search || normalize(`${t.description} ${t.category} ${t.type}`).includes(search));
}
function totals(list = filtered()){
  const inc = list.filter(t => t.type === 'income').reduce((s,t)=>s+Number(t.amount||0),0);
  const exp = list.filter(t => t.type === 'expense').reduce((s,t)=>s+Number(t.amount||0),0);
  return { inc, exp, bal: inc-exp, count: list.length };
}
function previousTotals(){
  const [y,m] = currentMonth().split('-').map(Number);
  const d = new Date(y, m-2, 1);
  const key = d.toISOString().slice(0,7);
  return totals(transactions.filter(t => monthKey(t.date) === key));
}
function byCategory(type){
  const map = {};
  filtered().filter(t => t.type === type).forEach(t => map[t.category] = (map[t.category]||0) + Number(t.amount||0));
  return Object.entries(map).sort((a,b)=>b[1]-a[1]);
}
function monthName(key=currentMonth()){
  const [y,m] = key.split('-');
  return new Date(Number(y), Number(m)-1, 1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
}

function toast(msg){
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2600);
}
function firebaseMsg(e){
  const code = e?.code || e?.message || '';
  if(code.includes('invalid-email')) return 'Digite um e-mail válido.';
  if(code.includes('weak-password')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if(code.includes('email-already-in-use')) return 'Esse e-mail já tem conta. Clique em Entrar.';
  if(code.includes('invalid-credential') || code.includes('wrong-password')) return 'E-mail ou senha incorretos.';
  if(code.includes('user-not-found')) return 'Conta não encontrada. Clique em Criar conta.';
  return 'Erro: ' + (e?.message || code);
}

function renderLogin(){
  document.body.innerHTML = `<div class="login"><div class="login-card"><div class="brand" style="justify-content:center"><span class="brand-badge">💼</span><span>FinanceApp Pro</span></div><p>Entre com e-mail e senha para sincronizar no PC e celular.</p><input id="email" class="input" type="email" autocomplete="email" placeholder="Seu e-mail"><input id="password" class="input" type="password" autocomplete="current-password" placeholder="Sua senha"><div class="login-actions"><button class="btn" id="loginBtn">Entrar</button><button class="btn ghost" id="registerBtn">Criar conta</button></div><p class="hint">Use o mesmo e-mail no PC e no iPhone para ver os mesmos dados.</p></div></div>`;
  $('#loginBtn').onclick = async () => {
    try { await signInWithEmailAndPassword(auth, $('#email').value.trim(), $('#password').value); } catch(e){ alert(firebaseMsg(e)); }
  };
  $('#registerBtn').onclick = async () => {
    try { await createUserWithEmailAndPassword(auth, $('#email').value.trim(), $('#password').value); } catch(e){ alert(firebaseMsg(e)); }
  };
}

function render(){
  if(!user) return renderLogin();
  const t = totals(), p = previousTotals();
  document.body.innerHTML = `<div class="app"><aside class="sidebar"><div class="brand"><span class="brand-badge">💼</span><span>FinanceApp</span></div>${nav()}<div class="sidebar-footer"><div class="user-mini"><div class="avatar">${(user.email||'U')[0].toUpperCase()}</div><div class="email">${user.email}</div></div></div></aside><main class="main"><div class="topbar"><div class="title"><h1>${title()}</h1><p class="subtitle">${monthName()} <span class="email-inline mobile-only">${user.email}</span></p></div><div class="actions"><button class="btn" id="newTx">+ Nova transação</button><button class="btn ghost" id="logout">Sair</button></div></div><div class="month-row"><input class="input" type="month" id="month" value="${currentMonth()}"><input class="input" id="search" placeholder="Buscar descrição ou categoria" value="${localStorage.getItem('finance_search')||''}"></div>${content(t,p)}</main></div>${bottomNav()}`;
  bindGlobal();
}
function nav(){
  const items = [['dashboard','📊','Dashboard'],['transacoes','💳','Transações'],['relatorios','📈','Relatórios'],['config','⚙️','Config']];
  return `<div class="nav">${items.map(([id,ic,label])=>`<button class="${page===id?'active':''}" data-page="${id}">${ic} ${label}</button>`).join('')}</div>`;
}
function bottomNav(){
  const items = [['dashboard','📊<br>Início'],['transacoes','💳<br>Transações'],['relatorios','📈<br>Relatórios'],['config','⚙️<br>Config']];
  return `<div class="bottom-nav">${items.map(([id,label])=>`<button class="${page===id?'active':''}" data-page="${id}">${label}</button>`).join('')}</div>`;
}
function title(){ return page==='dashboard'?'Dashboard':page==='transacoes'?'Transações':page==='relatorios'?'Relatórios':'Configurações'; }
function content(t,p){ return page==='dashboard'?dashboard(t,p):page==='transacoes'?transactionsPage():page==='relatorios'?reports(t,p):config(); }

function dashboard(t,p){
  return `<div class="cards"><div class="card"><small>Saldo atual</small><strong>${money(t.bal)}</strong></div><div class="card"><small>Receitas</small><strong class="income">${money(t.inc)}</strong></div><div class="card"><small>Despesas</small><strong class="expense">${money(t.exp)}</strong></div><div class="card"><small>Transações</small><strong>${t.count}</strong></div></div><div class="grid"><div class="panel"><h2>Despesas por categoria</h2>${catList('expense')}</div><div class="panel"><h2>Receitas por categoria</h2>${catList('income')}</div><div class="panel full"><h2>Últimas transações</h2>${table(filtered().slice(0,8))}</div></div>`;
}
function transactionsPage(){ return `<div class="panel"><h2>Adicionar transação</h2>${form()}</div><div class="panel" style="margin-top:18px"><h2>Transações do mês</h2>${table(filtered())}</div>`; }
function reports(t,p){
  const diff = t.bal - p.bal;
  return `<div class="cards"><div class="card"><small>Saldo deste mês</small><strong>${money(t.bal)}</strong></div><div class="card"><small>Mês anterior</small><strong>${money(p.bal)}</strong></div><div class="card"><small>Diferença</small><strong class="${diff>=0?'income':'expense'}">${money(diff)}</strong></div><div class="card"><small>Maior despesa</small><strong class="expense">${money((byCategory('expense')[0]||['',0])[1])}</strong></div></div><div class="grid"><div class="panel"><h2>Gráfico de despesas</h2>${bar('expense')}</div><div class="panel"><h2>Gráfico de receitas</h2>${bar('income')}</div><div class="panel full"><h2>Exportar dados</h2><button class="btn" id="csv">Baixar CSV/Excel</button> <button class="btn ghost" id="backup">Backup JSON</button></div></div>`;
}
function config(){ return `<div class="panel"><h2>Configurações</h2><p>✅ Firebase conectado</p><p>✅ Sincronização ativa entre PC e celular</p><p>✅ Login e-mail/senha ativo</p><p>📁 Caminho dos dados: <b>users/${user.uid}/transactions</b></p><p>📱 iPhone: Safari → Compartilhar → Adicionar à Tela de Início.</p></div>`; }
function form(tx={}){
  return `<form class="form-grid" id="form"><input class="input wide" name="description" id="desc" placeholder="Descrição" value="${tx.description||''}" required><input class="input" name="amount" type="number" step="0.01" placeholder="Valor" value="${tx.amount||''}" required><select class="select" name="type" id="type"><option value="expense" ${tx.type!=='income'?'selected':''}>Despesa</option><option value="income" ${tx.type==='income'?'selected':''}>Receita</option></select><input class="input" name="category" id="cat" placeholder="Categoria" value="${tx.category||''}"><input class="input" name="date" type="date" value="${tx.date||today()}"><button class="btn">${editingId?'Atualizar':'Salvar'}</button></form>`;
}
function table(list){
  if(!list.length) return '<div class="empty">Sem dados neste mês.</div>';
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Descrição</th><th>Valor</th><th>Tipo</th><th>Categoria</th><th>Data</th><th></th></tr></thead><tbody>${list.map(t=>`<tr><td>${t.description}</td><td class="${t.type==='income'?'income':'expense'}">${money(t.amount)}</td><td>${t.type==='income'?'Receita':'Despesa'}</td><td><span class="tag">${catIcon(t.category)} ${t.category}</span></td><td>${t.date}</td><td><button class="btn small ghost" data-edit="${t.id}">Editar</button> <button class="btn small red" data-del="${t.id}">Excluir</button></td></tr>`).join('')}</tbody></table></div>`;
}
function catList(type){
  const arr = byCategory(type); if(!arr.length) return '<div class="empty">Sem dados.</div>';
  const sum = arr.reduce((s,a)=>s+a[1],0);
  return `<div class="cat-list">${arr.map(([c,v])=>`<div><div class="cat-row"><span>${catIcon(c)} <b>${c}</b></span><strong>${money(v)}</strong></div><div class="progress"><span style="width:${Math.max(4,(v/sum*100)).toFixed(1)}%"></span></div></div>`).join('')}</div>`;
}
function bar(type){
  const arr = byCategory(type); if(!arr.length) return '<div class="empty">Sem dados.</div>';
  const sum = arr.reduce((s,a)=>s+a[1],0);
  return arr.map(([c,v])=>`<p><b>${catIcon(c)} ${c}</b> — ${money(v)} (${(v/sum*100).toFixed(1)}%)</p><div class="progress"><span style="width:${Math.max(4,(v/sum*100)).toFixed(1)}%"></span></div>`).join('');
}
function modal(tx){
  editingId = tx?.id || null;
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="modal-box"><div class="modal-top"><h2>${editingId?'Editar':'Nova'} transação</h2><button class="btn ghost small" id="closeModal">Fechar</button></div>${form(tx||{})}</div>`;
  document.body.appendChild(m);
  $('#closeModal').onclick = () => { editingId=null; m.remove(); };
  bindForm(m);
}
function bindGlobal(){
  document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => { page=b.dataset.page; localStorage.setItem('finance_page',page); render(); });
  $('#logout').onclick = () => signOut(auth);
  $('#newTx').onclick = () => modal();
  $('#month').onchange = e => { localStorage.setItem('finance_month',e.target.value); render(); };
  $('#search').oninput = e => { localStorage.setItem('finance_search',e.target.value); render(); };
  bindForm(document);
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if(confirm('Excluir esta transação?')) await deleteDoc(doc(db,'users',user.uid,'transactions',b.dataset.del)); });
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => modal(transactions.find(t=>t.id===b.dataset.edit)));
  const csv=$('#csv'); if(csv) csv.onclick = () => download('transacoes.csv',['descricao,valor,tipo,categoria,data',...filtered().map(t=>`"${String(t.description).replaceAll('"','""')}",${t.amount},${t.type},"${t.category}",${t.date}`)].join('\n'));
  const backup=$('#backup'); if(backup) backup.onclick = () => download('backup-financeapp.json',JSON.stringify(transactions,null,2));
}
function bindForm(root=document){
  const f = root.querySelector('#form'); if(!f) return;
  const desc = root.querySelector('#desc'), cat = root.querySelector('#cat'), type = root.querySelector('#type');
  desc.oninput = () => { if(!cat.value) cat.value = autoCategory(desc.value, type.value); };
  type.onchange = () => { cat.value = autoCategory(desc.value, type.value); };
  f.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const payload = { description:d.description.trim(), amount:Number(d.amount), type:d.type, category:d.category || autoCategory(d.description,d.type), date:d.date || today(), updatedAt:serverTimestamp() };
    if(editingId){ await updateDoc(doc(db,'users',user.uid,'transactions',editingId), payload); toast('Transação atualizada'); editingId=null; document.querySelector('.modal')?.remove(); }
    else { await addDoc(collection(db,'users',user.uid,'transactions'), {...payload, createdAt:serverTimestamp()}); toast('Transação salva'); f.reset(); }
    render();
  };
}
function download(name,data){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type:'text/plain;charset=utf-8'})); a.download=name; a.click(); }

onAuthStateChanged(auth,u => {
  user = u;
  if(unsub) unsub();
  if(u){
    const q = query(collection(db,'users',u.uid,'transactions'), orderBy('createdAt','desc'));
    unsub = onSnapshot(q, snap => { transactions = snap.docs.map(d=>({id:d.id,...d.data()})); render(); }, err => alert('Erro no Firestore: ' + err.message));
  } else { transactions=[]; render(); }
});
if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
