import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBIacwH9WInAHEeh_60jXeX9wLHk1RfpRQ",
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
let user = null, transactions = [], unsubscribe = null;

const $ = id => document.getElementById(id);
const money = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today = () => new Date().toISOString().slice(0,10);
const monthNow = () => new Date().toISOString().slice(0,7);

const categoryRules = [
  ['salario|salário|pagamento|pix recebido|freela|renda','Salário'],
  ['mercado|supermercado|atacadao|atacadão|carrefour|assai|assaí|comida|ifood|lanche|restaurante','Alimentação'],
  ['uber|99|ônibus|onibus|gasolina|combustivel|combustível|posto|moto|transporte','Transporte'],
  ['farmacia|farmácia|remedio|remédio|consulta|medico|médico|saude|saúde','Saúde'],
  ['netflix|spotify|prime|disney|hbo|assinatura|game pass|xbox','Assinaturas'],
  ['shopee|mercado livre|amazon|roupa|maquiagem|presente|compra','Compras'],
  ['aluguel|energia|luz|agua|água|internet|telefone|casa','Casa'],
  ['aposta|bet|casino|cassino','Apostas'],
  ['academia|curso|faculdade|estudo','Educação']
];
function guessCategory(text){ const s=(text||'').toLowerCase(); for(const [rx,cat] of categoryRules){ if(new RegExp(rx).test(s)) return cat; } return 'Outros'; }
function filtered(){ const term=$('searchInput').value.toLowerCase(); const m=$('monthInput').value; return transactions.filter(t=>(!m||t.date?.startsWith(m)) && (!term||JSON.stringify(t).toLowerCase().includes(term))); }
function groupByCategory(list,type){ const obj={}; list.filter(t=>t.type===type).forEach(t=>obj[t.category]=(obj[t.category]||0)+Number(t.amount)); return obj; }
function renderCat(el,obj){ const rows=Object.entries(obj).sort((a,b)=>b[1]-a[1]); el.innerHTML = rows.length ? rows.map(([k,v])=>`<div class="cat-row"><span>${k}</span><b>${money(v)}</b></div>`).join('') : '<p>Sem dados</p>'; }
function render(){
  const list=filtered();
  const inc=list.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const exp=list.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  $('income').textContent=money(inc); $('expense').textContent=money(exp); $('balance').textContent=money(inc-exp); $('countTx').textContent=list.length;
  renderCat($('expenseCats'), groupByCategory(list,'expense')); renderCat($('incomeCats'), groupByCategory(list,'income'));
  $('txTable').innerHTML = list.map(t=>`<tr><td>${t.date||''}</td><td class="${t.type==='income'?'positive':'negative'}">${t.type==='income'?'Receita':'Despesa'}</td><td>${t.description}</td><td>${t.category}</td><td>${t.account||'-'}</td><td>${money(t.amount)}</td><td><button data-del="${t.id}">Excluir</button></td></tr>`).join('') || '<tr><td colspan="7">Nenhuma transação.</td></tr>';
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteDoc(doc(db,'users',user.uid,'transactions',b.dataset.del)));
  $('installmentsList').innerHTML = list.filter(t=>Number(t.installments)>1).map(t=>`<div class="cat-row"><span>${t.description} (${t.installments}x)</span><b>${money(t.amount)}</b></div>`).join('') || '<p>Sem compras parceladas.</p>';
  $('futureList').innerHTML = list.filter(t=>t.date>today()).map(t=>`<div class="cat-row"><span>${t.date} - ${t.description}</span><b>${money(t.amount)}</b></div>`).join('') || '<p>Sem lançamentos futuros.</p>';
  const months={}; transactions.forEach(t=>{const m=(t.date||'').slice(0,7); if(!m)return; months[m]??={income:0,expense:0}; months[m][t.type]+=Number(t.amount)});
  $('monthlyReport').innerHTML = Object.entries(months).sort().reverse().map(([m,v])=>`<div class="cat-row"><span>${m}</span><b>Receitas ${money(v.income)} | Despesas ${money(v.expense)} | Saldo ${money(v.income-v.expense)}</b></div>`).join('') || '<p>Sem dados.</p>';
}

$('loginBtn').onclick=()=>signInWithPopup(auth,provider);
$('logoutBtn').onclick=()=>signOut(auth);
$('openModalBtn').onclick=()=>{ $('txForm').reset(); $('date').value=today(); $('installments').value=1; $('txModal').showModal(); };
$('closeModalBtn').onclick=()=>$('txModal').close();
$('description').addEventListener('input',()=>{ if(!$('category').dataset.manual) $('category').value=guessCategory($('description').value); });
$('category').addEventListener('input',()=> $('category').dataset.manual='1');
$('searchInput').oninput=render; $('monthInput').oninput=render; $('monthInput').value=monthNow();
document.querySelectorAll('.nav[data-page]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.nav').forEach(n=>n.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.page').forEach(p=>p.classList.remove('active-page'));$(btn.dataset.page).classList.add('active-page');$('pageTitle').textContent=btn.textContent;});
$('themeBtn').onclick=()=>{document.body.classList.toggle('light'); localStorage.setItem('theme',document.body.classList.contains('light')?'light':'dark')}; if(localStorage.theme==='light') document.body.classList.add('light');
$('txForm').onsubmit=async e=>{ e.preventDefault(); const tx={type:$('type').value,description:$('description').value.trim(),category:$('category').value.trim()||guessCategory($('description').value),amount:Number($('amount').value),date:$('date').value,account:$('account').value.trim(),installments:Number($('installments').value||1),recurring:$('recurring').checked,createdAt:serverTimestamp()}; await addDoc(collection(db,'users',user.uid,'transactions'),tx); $('txModal').close(); };
$('exportCsvBtn').onclick=()=>{ const rows=[['data','tipo','descricao','categoria','conta','valor','parcelas'],...filtered().map(t=>[t.date,t.type,t.description,t.category,t.account||'',t.amount,t.installments||1])]; download('transacoes.csv', rows.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(';')).join('\n')); };
$('backupBtn').onclick=()=>download('backup-financeapp.json', JSON.stringify(transactions,null,2));
function download(name,content){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/plain'}));a.download=name;a.click();}

onAuthStateChanged(auth,u=>{ user=u; if(unsubscribe) unsubscribe(); if(!u){$('login').classList.remove('hidden');$('app').classList.add('hidden');return;} $('login').classList.add('hidden');$('app').classList.remove('hidden');$('userInfo').textContent=u.email; const q=query(collection(db,'users',u.uid,'transactions'),orderBy('date','desc')); unsubscribe=onSnapshot(q,snap=>{transactions=snap.docs.map(d=>({id:d.id,...d.data()})); render();}); });

if('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
