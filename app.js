import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBIacWH9WInAHEeh_60jXeX9wLHk1RfpRQ",
  authDomain: "planilha-d6258.firebaseapp.com",
  projectId: "planilha-d6258",
  storageBucket: "planilha-d6258.firebasestorage.app",
  messagingSenderId: "993391235536",
  appId: "1:993391235536:web:923a9c601cf38b4703a9d5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
let user=null, transactions=[], page='dashboard', unsub=null;

const money = v => (Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const monthKey = d => (d||new Date().toISOString().slice(0,10)).slice(0,7);
const today = () => new Date().toISOString().slice(0,10);
const rules = [
 ['salário|salario|pagamento|pix recebido|recebi','Salário'],['mercado|supermercado|padaria|ifood|lanche|restaurante','Alimentação'],['uber|99|ônibus|onibus|combustível|combustivel|gasolina','Transporte'],['farmácia|farmacia|remédio|remedio|médico|medico','Saúde'],['netflix|spotify|prime|assinatura|internet|celular','Assinaturas'],['shopee|mercado livre|amazon|magalu|compra','Compras'],['aluguel|energia|água|agua|condomínio|condominio','Casa']
];
function autoCategory(text){text=(text||'').toLowerCase();for(const [rx,cat] of rules){if(new RegExp(rx).test(text))return cat}return 'Outros'}
function filtered(){const k=localStorage.getItem('finance_month')||monthKey(today());return transactions.filter(t=>monthKey(t.date)===k)}
function totals(list=filtered()){const inc=list.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);const exp=list.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);return {inc,exp,bal:inc-exp,count:list.length}}
function byCategory(type){const map={};filtered().filter(t=>t.type===type).forEach(t=>map[t.category]=(map[t.category]||0)+t.amount);return Object.entries(map).sort((a,b)=>b[1]-a[1]);}

function render(){
 if(!user){document.body.innerHTML=`<div class="login"><div class="panel"><h1>FinanceApp Pro</h1><p>Entre com Google para sincronizar seus dados no PC e celular.</p><button class="btn" id="login">Entrar com Google</button></div></div>`;document.getElementById('login').onclick=()=>signInWithPopup(auth,provider);return}
 const k=localStorage.getItem('finance_month')||monthKey(today()); const t=totals();
 document.body.innerHTML=`<div class="layout"><aside class="side"><div class="brand">💼 FinanceApp</div><div class="nav">${['dashboard','transacoes','relatorios','config'].map(p=>`<button class="${page===p?'active':''}" data-page="${p}">${p==='dashboard'?'Dashboard':p==='transacoes'?'Transações':p==='relatorios'?'Relatórios':'Configurações'}</button>`).join('')}</div></aside><main class="main"><div class="top"><div><h1>${pageTitle()}</h1><input class="search" id="month" type="month" value="${k}"></div><div class="user"><img src="${user.photoURL||''}"><span>${user.displayName||user.email}</span><button class="btn ghost" id="logout">Sair</button></div></div>${content(t)}</main></div>`;
 document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;render()});
 document.getElementById('logout').onclick=()=>signOut(auth);document.getElementById('month').onchange=e=>{localStorage.setItem('finance_month',e.target.value);render()};bind();
}
function pageTitle(){return page==='dashboard'?'Dashboard':page==='transacoes'?'Transações':page==='relatorios'?'Relatórios':'Configurações'}
function content(t){if(page==='dashboard')return dashboard(t);if(page==='transacoes')return txPage();if(page==='relatorios')return reports();return config()}
function dashboard(t){return `<div class="cards"><div class="card"><small>Saldo atual</small><strong>${money(t.bal)}</strong></div><div class="card"><small>Receitas</small><strong class="income">${money(t.inc)}</strong></div><div class="card"><small>Despesas</small><strong class="expense">${money(t.exp)}</strong></div><div class="card"><small>Transações</small><strong>${t.count}</strong></div></div><div class="grid"><div class="panel"><h2>Nova transação</h2>${form()}</div><div class="panel"><h2>Resumo rápido</h2>${catList('expense')}<h3>Receitas</h3>${catList('income')}</div><div class="panel full"><h2>Últimas transações</h2>${table(filtered().slice(0,8))}</div></div>`}
function txPage(){return `<div class="panel"><h2>Adicionar</h2>${form()}</div><div class="panel" style="margin-top:20px"><h2>Todas do mês</h2>${table(filtered())}</div>`}
function reports(){return `<div class="grid"><div class="panel"><h2>Despesas por categoria</h2>${bar('expense')}</div><div class="panel"><h2>Receitas por categoria</h2>${bar('income')}</div><div class="panel full"><h2>Exportar</h2><button class="btn" id="csv">Baixar CSV/Excel</button> <button class="btn ghost" id="backup">Backup JSON</button></div></div>`}
function config(){return `<div class="panel"><h2>Configurações</h2><p>✅ Firebase conectado</p><p>✅ Login Google ativo</p><p>✅ Dados salvos em: <b>users/${user.uid}/transactions</b></p><p>Para instalar no iPhone: Safari → Compartilhar → Adicionar à Tela de Início.</p></div>`}
function form(){return `<form class="form" id="form"><input name="description" id="desc" placeholder="Descrição" required><input name="amount" type="number" step="0.01" placeholder="Valor" required><select name="type"><option value="expense">Despesa</option><option value="income">Receita</option></select><input name="category" id="cat" placeholder="Categoria"><input name="date" type="date" value="${today()}"><button class="btn">Salvar</button></form>`}
function table(list){if(!list.length)return '<p>Sem dados.</p>';return `<table class="table"><thead><tr><th>Descrição</th><th>Valor</th><th>Tipo</th><th>Categoria</th><th>Data</th><th></th></tr></thead><tbody>${list.map(t=>`<tr><td>${t.description}</td><td class="${t.type}">${money(t.amount)}</td><td>${t.type==='income'?'Receita':'Despesa'}</td><td><span class="tag">${t.category}</span></td><td>${t.date}</td><td><button class="btn red" data-del="${t.id}">Excluir</button></td></tr>`).join('')}</tbody></table>`}
function catList(type){const arr=byCategory(type);return arr.length?arr.map(([c,v])=>`<p><b>${c}</b>: ${money(v)}</p>`).join(''):'<p>Sem dados.</p>'}
function bar(type){const arr=byCategory(type), sum=arr.reduce((s,a)=>s+a[1],0);if(!arr.length)return '<p>Sem dados.</p>';return arr.map(([c,v],i)=>`<p>${c} — ${money(v)}</p><div class="chartbar"><div class="seg" style="width:${(v/sum*100).toFixed(1)}%;background:hsl(${i*55%360} 75% 55%)"></div></div>`).join('')}
function bind(){const f=document.getElementById('form'); if(f){document.getElementById('desc').oninput=e=>{const c=document.getElementById('cat');if(!c.value)c.value=autoCategory(e.target.value)}; f.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));await addDoc(collection(db,'users',user.uid,'transactions'),{description:d.description,amount:Number(d.amount),type:d.type,category:d.category||autoCategory(d.description),date:d.date,createdAt:serverTimestamp()});f.reset();render()}}
 document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteDoc(doc(db,'users',user.uid,'transactions',b.dataset.del)));
 const csv=document.getElementById('csv'); if(csv)csv.onclick=()=>download('transacoes.csv',['descricao,valor,tipo,categoria,data',...filtered().map(t=>`"${t.description}",${t.amount},${t.type},"${t.category}",${t.date}`)].join('\n'));
 const backup=document.getElementById('backup'); if(backup)backup.onclick=()=>download('backup-financeapp.json',JSON.stringify(transactions,null,2));
}
function download(name,data){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'text/plain'}));a.download=name;a.click()}

onAuthStateChanged(auth,u=>{user=u;if(unsub)unsub(); if(u){const q=query(collection(db,'users',u.uid,'transactions'),orderBy('createdAt','desc'));unsub=onSnapshot(q,s=>{transactions=s.docs.map(d=>({id:d.id,...d.data()}));render()})}else{transactions=[];render()}});
if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
