import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, collection, addDoc, setDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

// COLE AQUI A API KEY NOVA QUE FUNCIONOU NO SEU FIREBASE.
// Não use a chave antiga que dava api-key-not-valid.
const firebaseConfig = {
  apiKey: "AIzaSyD1OsrAZ_DOshpsUNmVAxY7bGab0y8q_5U",
  authDomain: "planilha-d6258.firebaseapp.com",
  projectId: "planilha-d6258",
  storageBucket: "planilha-d6258.appspot.com",
  messagingSenderId: "993391235536",
  appId: "1:993391235536:web:923a9c601cf38b4703a9d5"
};

let app, auth, db;
try { app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); } catch(e) { console.error(e); }

const $ = s => document.querySelector(s);
const money = v => (Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today = () => new Date().toISOString().slice(0,10);
const monthKey = d => (d||today()).slice(0,7);
const uidPath = (name) => collection(db,'users',state.user.uid,name);

let state = {
  user:null, page:'dashboard', month:localStorage.getItem('fa_month')||monthKey(today()),
  transactions:[], budgets:[], goals:[], accounts:[], cards:[], recurrent:[], unsub:[]
};

const iconMap = {
  'Alimentação':'🍔','Transporte':'🚗','Saúde':'💊','Assinaturas':'📱','Compras':'🛍️','Casa':'🏠','Salário':'💼','Rendimento':'📈','Apostas':'🎯','Dívidas':'🤝','Lazer':'🎮','Educação':'📚','Outros':'🏷️','Sem categoria':'🏷️',
  'aposta futebol':'⚽','aposta lucro':'🎯','Manu PG':'👤','md':'💵','recuperação de vicio':'🛡️','rendimento banco':'🏦','vicio lucro':'📈','aleatório':'🔀','apostas percas':'📉','comida':'🍔','gasolina':'⛽','manu':'👤','mere':'👤','vicio':'🎲'
};
const defaultIncomeCategories = ['aposta futebol','aposta lucro','Manu PG','md','recuperação de vicio','rendimento banco','vicio lucro','Salário','Rendimento','Outros'];
const defaultExpenseCategories = ['aleatório','apostas percas','comida','gasolina','manu','mere','vicio','Sem categoria','Alimentação','Transporte','Saúde','Assinaturas','Compras','Casa','Dívidas','Lazer','Educação','Outros'];
const defaultCategories = [...defaultIncomeCategories, ...defaultExpenseCategories];
const autoRules = [
  ['sal[aá]rio|pagamento|pix recebido|recebi|rendimento|banco|lucro','Salário'],
  ['brxbet|betdasorte|verabet|sorte|aposta|casino|blaze|luva|h2bet','Apostas'],
  ['mercado|supermercado|padaria|ifood|lanche|restaurante|burger|pizza|comida|coca|frango','Alimentação'],
  ['uber|99|ônibus|onibus|combustível|combustivel|gasolina|carro|moto','Transporte'],
  ['farm[aá]cia|rem[eé]dio|m[eé]dico|consulta|hospital','Saúde'],
  ['netflix|spotify|prime|assinatura|internet|celular','Assinaturas'],
  ['shopee|mercado livre|amazon|magalu|malbec|gloss|maquiagem|sand[aá]lia','Compras'],
  ['aluguel|energia|[aá]gua|condom[ií]nio|casa','Casa'],
  ['emprestado|pediu|d[ií]vida|manu','Dívidas']
];
function autoCategory(text,type='expense'){
  text=(text||'').toLowerCase();
  for(const [rx,cat] of autoRules){ if(new RegExp(rx).test(text)) return type==='income'&&cat==='Salário'?'Rendimento':cat; }
  return 'Sem categoria';
}
function txMonth(){return state.transactions.filter(t=>monthKey(t.date)===state.month)}
function byType(type,list=txMonth()){return list.filter(t=>t.type===type)}
function sum(list){return list.reduce((s,t)=>s+(Number(t.amount)||0),0)}
function totals(list=txMonth()){const inc=sum(byType('income',list)), exp=sum(byType('expense',list)); return {inc,exp,bal:inc-exp,count:list.length}}
function group(list,key='category'){const m={};list.forEach(t=>{const k=t[key]||'Sem categoria'; m[k]=(m[k]||0)+(Number(t.amount)||0)}); return Object.entries(m).sort((a,b)=>b[1]-a[1])}
function pct(v,total){return total?((v/total)*100).toFixed(1):'0.0'}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function boot(){
  if(!auth || firebaseConfig.apiKey.includes('COLE_AQUI')) return renderSetupKey();
  onAuthStateChanged(auth,u=>{state.user=u; clearUnsubs(); if(u) listenAll(); else renderLogin();});
}
function clearUnsubs(){state.unsub.forEach(fn=>fn&&fn()); state.unsub=[]}
function listenAll(){
  const maps=['transactions','budgets','goals','accounts','cards','recurrent'];
  maps.forEach(name=>{
    const q=query(uidPath(name), orderBy('createdAt','desc'));
    state.unsub.push(onSnapshot(q,s=>{state[name]=s.docs.map(d=>({id:d.id,...d.data()})); render();},err=>showToast(err.message)));
  });
}

function renderSetupKey(){
  document.body.innerHTML=`<div class="login-bg"><div class="login-card"><div class="logo">💼</div><h1>Configurar Firebase</h1><p>Este pacote veio sem sua API Key nova. Cole a chave nova que funcionou no PC.</p><input id="api" placeholder="Cole a API Key nova"><button class="primary" id="saveKey">Salvar chave</button><p class="muted">Depois disso o app recarrega sozinho.</p></div></div>`;
  $('#saveKey').onclick=()=>{const k=$('#api').value.trim(); if(!k)return alert('Cole a chave.'); alert('Cole essa chave no app.js antes de subir para o GitHub:\n\napiKey: "'+k+'",');};
}
function renderLogin(){
  document.body.innerHTML=`<div class="login-bg"><div class="login-card"><div class="logo">💼</div><h1>FinanceApp Pro</h1><p>Entre com e-mail e senha para sincronizar no PC e celular.</p><input id="email" type="email" placeholder="Seu e-mail"><input id="password" type="password" placeholder="Sua senha"><button class="primary" id="login">Entrar</button><button class="secondary" id="register">Criar conta</button><p class="muted">Use o mesmo e-mail no PC e no iPhone para ver os mesmos dados.</p></div></div>`;
  $('#login').onclick=()=>signInWithEmailAndPassword(auth,$('#email').value,$('#password').value).catch(e=>showToast(e.message));
  $('#register').onclick=()=>createUserWithEmailAndPassword(auth,$('#email').value,$('#password').value).catch(e=>showToast(e.message));
}
function render(){
  if(!state.user) return renderLogin();
  const page = pages[state.page] || dashboardPage;
  document.body.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><span>💼</span><b>FinanceApp</b></div><button class="quick" id="quickAdd">+</button>${navHtml()}<div class="profile"><div class="avatar">${(state.user.email||'U')[0].toUpperCase()}</div><div><b>${state.user.email?.split('@')[0]||'Usuário'}</b><small>${state.user.email||''}</small></div></div></aside><main><header><div><h1>${page.title}</h1><p>${page.sub}</p></div><div class="header-actions"><label class="month-box"><span>Mês</span><input type="month" id="month" value="${state.month}"></label><button id="logout" class="ghost">Sair</button></div></header>${page.html()}</main><nav class="bottom">${bottomNavHtml()}</nav></div><div id="modal"></div><div id="toast"></div>`;
  bindCommon(); page.bind?.();
}
const nav = [
 ['dashboard','Visão Geral','⌂'], ['transactions','Transações','↕'], ['import','Importar CSV','⇪'], ['reports','Relatórios','▥'], ['budgets','Orçamentos','◎'], ['recurrent','Recorrências','↻'], ['goals','Metas','☆'], ['accounts','Contas','▣'], ['cards','Cartões','▤'], ['categories','Categorias','◇'], ['settings','Config','⚙']
];
function navHtml(){return `<div class="nav">${nav.map(n=>`<button class="${state.page===n[0]?'active':''}" data-page="${n[0]}"><span>${n[2]}</span>${n[1]}</button>`).join('')}</div>`}
function bottomNavHtml(){return [['dashboard','⌂','Início'],['transactions','↕','Transações'],['reports','▥','Relatórios'],['settings','⚙','Config']].map(n=>`<button class="${state.page===n[0]?'active':''}" data-page="${n[0]}"><span>${n[1]}</span><small>${n[2]}</small></button>`).join('')}
function bindCommon(){
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;render()});
  $('#logout').onclick=()=>signOut(auth); $('#month').onchange=e=>{state.month=e.target.value;localStorage.setItem('fa_month',state.month);render()};
  $('#quickAdd').onclick=()=>openTxModal();
}
function showToast(msg){const el=$('#toast')||document.createElement('div'); el.id='toast'; el.textContent='Erro: '+msg; document.body.appendChild(el); el.className='show'; setTimeout(()=>el.className='',4500)}

function dashboardPage(){return {title:'Visão Geral',sub:'Resumo das suas finanças',html(){const t=totals(); const exp=byType('expense'), inc=byType('income'); return `<section class="cards">${card('Saldo',money(t.bal),'💰','blue')}${card('Receitas',money(t.inc),'↗','green')}${card('Despesas',money(t.exp),'↘','red')}${card('Transações',t.count,'↕','purple')}</section><section class="wide-card recurrence"><div><h3>Próximas Recorrências</h3><p>${state.recurrent.length?'Você possui '+state.recurrent.length+' recorrência(s).':'Nenhuma recorrência cadastrada.'}</p></div><button data-page="recurrent">Ver todas ›</button></section><section class="grid2"><div class="panel"><h3>Despesas por categoria</h3>${donut(exp,'expense')}</div><div class="panel"><h3>Receitas por categoria</h3>${donut(inc,'income')}</div></section><section class="grid2"><div class="panel"><h3>Comparativo mensal</h3>${comparison()}</div><div class="panel"><h3>Top 10 maiores despesas</h3>${topExpenses()}</div></section>`},bind(){document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;render()})}}}
function card(title,value,ico,cls){return `<div class="card ${cls}"><span>${ico}</span><small>${title}</small><strong>${value}</strong></div>`}
function donut(list,type){const arr=group(list), total=sum(list); if(!arr.length)return '<div class="empty">Sem dados</div>'; let start=0; const colors=['#00c2ff','#8b5cf6','#22c55e','#ff4d4d','#f59e0b','#14b8a6','#3b82f6','#ef4444']; const grad=arr.map(([c,v],i)=>{const a=(v/total)*360; const part=`${colors[i%colors.length]} ${start}deg ${start+a}deg`; start+=a; return part}).join(','); return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${grad})"><div><b>${money(total)}</b><small>Total</small></div></div><div class="legend">${arr.slice(0,8).map(([c,v],i)=>`<p><i style="background:${colors[i%colors.length]}"></i><span>${iconMap[c]||'•'} ${esc(c)}</span><b>${money(v)}</b></p>`).join('')}</div></div>`}
function comparison(){const t=totals();return `<div class="bars"><p><span>Receitas</span><b>${money(t.inc)}</b></p><div><i style="width:${Math.min(100,t.inc/(t.inc+t.exp||1)*100)}%" class="greenbar"></i></div><p><span>Despesas</span><b>${money(t.exp)}</b></p><div><i style="width:${Math.min(100,t.exp/(t.inc+t.exp||1)*100)}%" class="redbar"></i></div><p><span>Saldo</span><b>${money(t.bal)}</b></p></div>`}
function topExpenses(){const arr=byType('expense').sort((a,b)=>b.amount-a.amount).slice(0,10); if(!arr.length)return '<div class="empty">Sem despesas</div>';return `<table>${arr.map((t,i)=>`<tr><td>${i+1}</td><td>${esc(t.description)}</td><td>${esc(t.category)}</td><td class="redtxt">${money(t.amount)}</td></tr>`).join('')}</table>`}

function transactionsPage(){return {title:'Transações',sub:'Gerencie suas receitas e despesas',html(){return `<div class="toolbar"><input id="search" placeholder="Buscar transações..."><select id="filterType"><option value="all">Todos</option><option value="income">Receitas</option><option value="expense">Despesas</option></select><select id="filterCat"><option value="all">Todas categorias</option>${cats().map(c=>`<option>${esc(c)}</option>`).join('')}</select><button class="primary" id="newTx">+ Nova Transação</button><button id="goImport">Importar CSV</button><button id="exportCsv">Exportar</button></div><div class="panel table-panel"><div class="scroll-table">${txTable(txMonth())}</div></div>`},bind(){ $('#newTx').onclick=()=>openTxModal(); $('#goImport').onclick=()=>{state.page='import';render()}; $('#exportCsv').onclick=exportCSV; ['search','filterType','filterCat'].forEach(id=>$('#'+id).oninput=filterTx)}}}
function txTable(list){if(!list.length)return '<div class="empty">Sem transações</div>'; return `<table class="tx"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Pagamento</th><th>Valor</th><th>Ações</th></tr></thead><tbody>${list.map(t=>`<tr data-row="${t.id}"><td>${brDate(t.date)}</td><td>${t.type==='income'?'↗':'↘'} ${esc(t.description)}</td><td>${iconMap[t.category]||'🏷️'} ${esc(t.category)}</td><td>${esc(t.payment||'Outro')}</td><td class="${t.type==='income'?'greentxt':'redtxt'}">${t.type==='income'?'+':'-'}${money(t.amount)}</td><td><button data-edit="${t.id}">✎</button><button data-del="${t.id}">🗑</button></td></tr>`).join('')}</tbody></table>`}
function filterTx(){const q=($('#search')?.value||'').toLowerCase(), type=$('#filterType').value, cat=$('#filterCat').value;let list=txMonth().filter(t=>(type==='all'||t.type===type)&&(cat==='all'||t.category===cat)&&((t.description||'').toLowerCase().includes(q)||(t.category||'').toLowerCase().includes(q))); $('.scroll-table').innerHTML=txTable(list); bindTxBtns()}
function bindTxBtns(){document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteDoc(doc(db,'users',state.user.uid,'transactions',b.dataset.del)));document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openTxModal(state.transactions.find(t=>t.id===b.dataset.edit)))}
function cats(){return [...new Set([...defaultCategories, ...state.transactions.map(t=>t.category||'Sem categoria')])].sort((a,b)=>a.localeCompare(b,'pt-BR'))}
function brDate(d){return (d||'').split('-').reverse().join('/')}

function openTxModal(tx={type:'expense',date:today(),payment:'Outro'}){const category=tx.category||autoCategory(tx.description,tx.type); $('#modal').innerHTML=`<div class="overlay"><form class="modal-card" id="txForm"><button type="button" class="close" id="closeModal">×</button><h2>${tx.id?'Editar':'Nova'} Transação</h2><div class="form-grid"><label>Tipo<select name="type" id="txType"><option value="expense" ${tx.type==='expense'?'selected':''}>Despesa</option><option value="income" ${tx.type==='income'?'selected':''}>Receita</option></select></label><label>Valor (R$)<input name="amount" type="number" step="0.01" value="${tx.amount||''}" required></label></div><label>Descrição<input name="description" id="desc" value="${esc(tx.description||'')}" placeholder="Ex: Supermercado, Salário..." required></label><div class="form-grid"><label>Data<input name="date" type="date" value="${tx.date||today()}"></label><label>Método<select name="payment"><option ${tx.payment==='Outro'?'selected':''}>Outro</option><option>Pix</option><option>Dinheiro</option><option>Débito</option><option>Crédito</option><option>Boleto</option></select></label></div><label>Categoria<select name="category" id="cat">${cats().filter((v,i,a)=>a.indexOf(v)===i).map(c=>`<option ${c===category?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label>Tags<input name="tags" value="${esc(tx.tags||'')}" placeholder="ex: importante, mensal"></label><label>Observações<textarea name="notes" placeholder="Notas adicionais...">${esc(tx.notes||'')}</textarea></label><div class="modal-actions"><button type="button" id="cancel">Cancelar</button><button class="primary">${tx.id?'Salvar':'Criar'}</button></div></form></div>`;
 $('#closeModal').onclick=$('#cancel').onclick=()=>$('#modal').innerHTML=''; $('#desc').oninput=e=>{if(!tx.id) $('#cat').value=autoCategory(e.target.value,$('#txType').value)};
 $('#txForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const data={type:d.type,amount:Number(d.amount),description:d.description,date:d.date,category:d.category||autoCategory(d.description,d.type),payment:d.payment,tags:d.tags||'',notes:d.notes||'',updatedAt:serverTimestamp()}; if(tx.id) await setDoc(doc(db,'users',state.user.uid,'transactions',tx.id),data,{merge:true}); else await addDoc(uidPath('transactions'),{...data,createdAt:serverTimestamp()}); $('#modal').innerHTML='';};}

function reportsPage(){return {title:'Relatórios',sub:'DRE mensal detalhado com exportação para PDF',html(){const t=totals(), inc=byType('income'), exp=byType('expense');return `<div class="report-actions"><button onclick="window.print()" class="primary">Imprimir / PDF</button><button id="backup">Backup JSON</button></div><section class="cards">${card('Receitas',money(t.inc),'↗','green')}${card('Despesas',money(t.exp),'↘','red')}${card('Resultado',money(t.bal),'⚖','blue')}</section><div class="panel report"><h2>Demonstrativo de Resultado — DRE</h2><h3>${state.month}</h3>${dreTable('Receitas por Categoria',inc,'income')}${dreTable('Despesas por Categoria',exp,'expense')}${paymentTable()}${topExpenses()}</div>`},bind(){ $('#backup').onclick=()=>download('backup-financeapp.json',JSON.stringify({transactions:state.transactions,budgets:state.budgets,goals:state.goals,accounts:state.accounts,cards:state.cards,recurrent:state.recurrent},null,2))}}}
function dreTable(title,list,type){const arr=group(list), total=sum(list); return `<h3 class="section-title ${type}">${title}</h3><table><thead><tr><th>Categoria</th><th>Qtd</th><th>Valor</th><th>%</th></tr></thead><tbody>${arr.map(([c,v])=>`<tr><td>${iconMap[c]||'🏷️'} ${esc(c)}</td><td>${list.filter(t=>(t.category||'Sem categoria')===c).length}</td><td class="${type==='income'?'greentxt':'redtxt'}">${money(v)}</td><td>${pct(v,total)}%</td></tr>`).join('')}<tr><th>Total</th><th>${list.length}</th><th>${money(total)}</th><th>100%</th></tr></tbody></table>`}
function paymentTable(){const exp=byType('expense'), arr=group(exp,'payment'), total=sum(exp); return `<h3 class="section-title blue">Despesas por Método de Pagamento</h3><table>${arr.map(([m,v])=>`<tr><td>${esc(m)}</td><td>${money(v)}</td><td>${pct(v,total)}%</td></tr>`).join('')}</table>`}
function exportCSV(){download('transacoes.csv',['data,descricao,tipo,categoria,pagamento,valor,tags',...state.transactions.map(t=>`${t.date},"${t.description}",${t.type},"${t.category}","${t.payment||'Outro'}",${t.amount},"${t.tags||''}"`)].join('\n'))}
function download(name,data){const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type:'text/plain'})); a.download=name; a.click()}

function simplePage(name,collectionName,fields){return {title:name,sub:'Cadastro e controle',html(){return `<div class="toolbar"><button class="primary" id="newItem">+ Novo</button></div><div class="panel">${state[collectionName].length?`<table>${state[collectionName].map(i=>`<tr><td><b>${esc(i.name||i.title||i.description)}</b><br><small>${esc(i.notes||'')}</small></td><td>${i.amount?money(i.amount):''}</td><td><button data-del-item="${i.id}">🗑</button></td></tr>`).join('')}</table>`:'<div class="empty">Nada cadastrado ainda.</div>'}</div>`},bind(){ $('#newItem').onclick=()=>openGenericModal(name,collectionName,fields); document.querySelectorAll('[data-del-item]').forEach(b=>b.onclick=()=>deleteDoc(doc(db,'users',state.user.uid,collectionName,b.dataset.delItem)))}}}
function openGenericModal(title,collectionName,fields){$('#modal').innerHTML=`<div class="overlay"><form class="modal-card" id="generic"><button type="button" class="close" id="closeModal">×</button><h2>${title}</h2>${fields.map(f=>`<label>${f.label}<input name="${f.name}" type="${f.type||'text'}" placeholder="${f.ph||''}"></label>`).join('')}<label>Observações<textarea name="notes"></textarea></label><div class="modal-actions"><button type="button" id="cancel">Cancelar</button><button class="primary">Salvar</button></div></form></div>`; $('#closeModal').onclick=$('#cancel').onclick=()=>$('#modal').innerHTML=''; $('#generic').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target)); if(d.amount)d.amount=Number(d.amount); await addDoc(uidPath(collectionName),{...d,createdAt:serverTimestamp()}); $('#modal').innerHTML='';};}
function categoriesPage(){return {title:'Categorias',sub:'Categorias cadastradas para receitas e despesas',html(){const inc=group(byType('income')), exp=group(byType('expense')); const val=c=>money(group(txMonth()).find(x=>x[0]===c)?.[1]||0); return `<div class="toolbar"><button class="primary" id="newCat">+ Nova Categoria</button></div><section class="grid2"><div class="panel categories-list"><h3 class="greentxt">↗ Receitas <small>${defaultIncomeCategories.length}</small></h3>${defaultIncomeCategories.map(c=>`<div><span>${iconMap[c]||'🏷️'}</span><b>${esc(c)}</b><small>${val(c)}</small></div>`).join('')}</div><div class="panel categories-list"><h3 class="redtxt">↘ Despesas <small>${defaultExpenseCategories.length}</small></h3>${defaultExpenseCategories.map(c=>`<div><span>${iconMap[c]||'🏷️'}</span><b>${esc(c)}</b><small>${val(c)}</small></div>`).join('')}</div></section>`},bind(){ $('#newCat').onclick=()=>showToast('Para cadastrar uma categoria fixa, adicione uma transação com essa categoria. Ela passa a aparecer automaticamente.')}}}

function importPage(){return {title:'Importar CSV',sub:'Importe dados de aplicativos antigos como Mobills, GranAzul, Organizze ou planilhas',html(){return `<div class="panel import-panel"><h2>Importar transações</h2><p class="muted">Aceita CSV com colunas: data, descrição, valor, tipo, categoria e pagamento. Também tenta reconhecer exportações de apps antigos automaticamente.</p><input type="file" id="csvFile" accept=".csv,.txt,.json"><div class="form-grid"><label>Formato<select id="importFormat"><option value="auto">Detectar automaticamente</option><option value="mobills">Mobills</option><option value="granazul">GranAzul</option><option value="generic">CSV genérico</option></select></label><label>Separador<select id="sep"><option value="auto">Detectar</option><option value=",">Vírgula (,)</option><option value=";">Ponto e vírgula (;)</option></select></label></div><div class="import-actions"><button class="primary" id="runImport">Importar agora</button><button id="downloadModel">Baixar modelo CSV</button></div><div id="importResult" class="empty">Nenhum arquivo selecionado.</div><h3>Modelo aceito</h3><pre class="csv-example">data,descricao,tipo,categoria,pagamento,valor,tags\n2026-07-08,mercado,expense,comida,Pix,50.00,\n2026-07-08,salario,income,Salário,Pix,1500.00,</pre></div>`},bind(){ $('#runImport').onclick=handleCSVImport; $('#downloadModel').onclick=()=>download('modelo-importacao.csv','data,descricao,tipo,categoria,pagamento,valor,tags\n2026-07-08,mercado,expense,comida,Pix,50.00,\n2026-07-08,salario,income,Salário,Pix,1500.00,')}}}
function parseCSVLine(line,sep){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){q=!q;continue}if(ch===sep&&!q){out.push(cur.trim());cur='';continue}cur+=ch}out.push(cur.trim());return out}
function detectSep(text){const first=text.split(/\r?\n/).find(Boolean)||'';return (first.split(';').length>first.split(',').length)?';':','}
function normalizeDate(v){v=String(v||'').trim(); if(!v)return today(); const m=v.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/); if(m){let y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`} if(/^\d{4}-\d{2}-\d{2}/.test(v))return v.slice(0,10); return today()}
function normalizeMoney(v){v=String(v||'0').replace(/R\$/gi,'').replace(/\s/g,'').trim(); if(v.includes(',')&&v.includes('.')) v=v.replace(/\./g,'').replace(',','.'); else if(v.includes(',')) v=v.replace(',','.'); return Math.abs(Number(v)||0)}
function detectType(row,headers){const all=Object.values(row).join(' ').toLowerCase(); const valor=String(row.valor||row.amount||row['valor (r$)']||row['valor r$']||''); if((row.tipo||row.type||'').toLowerCase().includes('rece'))return 'income'; if((row.tipo||row.type||'').toLowerCase().includes('desp'))return 'expense'; if(valor.trim().startsWith('-'))return 'expense'; if(all.includes('receita')||all.includes('entrada'))return 'income'; return 'expense'}
async function handleCSVImport(){const f=$('#csvFile').files[0]; if(!f)return showToast('Escolha um arquivo CSV.'); const text=await f.text(); if(f.name.endsWith('.json')){try{const data=JSON.parse(text); const arr=data.transactions||data.transacoes||data; await importRows(Array.isArray(arr)?arr:[]); return}catch(e){showToast('JSON inválido.');return}} const sep=$('#sep').value==='auto'?detectSep(text):$('#sep').value; const lines=text.split(/\r?\n/).filter(l=>l.trim()); if(lines.length<2)return showToast('CSV vazio.'); const headers=parseCSVLine(lines[0],sep).map(h=>h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()); const rows=lines.slice(1).map(line=>{const vals=parseCSVLine(line,sep); const obj={}; headers.forEach((h,i)=>obj[h]=vals[i]||''); return obj}); const normalized=rows.map(r=>{const desc=r.descricao||r.description||r.nome||r.titulo||r.histórico||r.historico||r.observacao||r.observacoes||'Importado'; const type=detectType(r,headers); const amount=normalizeMoney(r.valor||r.amount||r['valor (r$)']||r['valor r$']||r.total); return {date:normalizeDate(r.data||r.date||r.vencimento||r['data da transacao']),description:desc,type,amount,category:r.categoria||r.category||autoCategory(desc,type),payment:r.pagamento||r.payment||r.conta||r.carteira||'Outro',tags:r.tags||'',notes:'Importado via CSV',createdAt:serverTimestamp(),updatedAt:serverTimestamp()}}).filter(x=>x.amount>0); await importRows(normalized)}
async function importRows(rows){if(!rows.length)return showToast('Nenhuma transação válida encontrada.'); $('#importResult').innerHTML=`Importando ${rows.length} transações...`; for(const r of rows){await addDoc(uidPath('transactions'),r)} $('#importResult').innerHTML=`✅ ${rows.length} transações importadas com sucesso.`; state.page='transactions'; setTimeout(render,800)}

function settingsPage(){return {title:'Configurações',sub:'Firebase, backup e instalação',html(){return `<div class="panel"><h2>Conta</h2><p>${state.user.email}</p><p>Dados salvos em <b>users/${state.user.uid}</b></p><button id="backup2">Baixar backup</button><button id="logout2">Sair</button><h2>iPhone</h2><p>Safari → Compartilhar → Adicionar à Tela de Início.</p></div>`},bind(){ $('#backup2').onclick=()=>download('backup-financeapp.json',JSON.stringify(state,null,2)); $('#logout2').onclick=()=>signOut(auth)}}}
const pages={
  dashboard:dashboardPage(), transactions:transactionsPage(), import:importPage(), reports:reportsPage(),
  budgets:simplePage('Orçamentos','budgets',[{name:'name',label:'Nome'},{name:'amount',label:'Valor',type:'number'}]),
  recurrent:simplePage('Recorrências','recurrent',[{name:'name',label:'Nome'},{name:'amount',label:'Valor',type:'number'},{name:'day',label:'Dia de vencimento',type:'number'}]),
  goals:simplePage('Metas','goals',[{name:'name',label:'Meta'},{name:'amount',label:'Valor alvo',type:'number'}]),
  accounts:simplePage('Contas','accounts',[{name:'name',label:'Conta'},{name:'amount',label:'Saldo inicial',type:'number'}]),
  cards:simplePage('Cartões','cards',[{name:'name',label:'Cartão'},{name:'limit',label:'Limite',type:'number'},{name:'due',label:'Vencimento',type:'number'}]),
  categories:categoriesPage(), settings:settingsPage()
};
boot();
if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
