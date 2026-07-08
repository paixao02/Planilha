const STORAGE_KEY = 'finance_transactions_v2';
const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const defaultCategories = {
  income: ['Salário','PIX recebido','Rendimento banco','Aposta lucro','Venda','Presente','Outros recebimentos'],
  expense: ['Alimentação','Transporte','Moradia','Saúde','Assinaturas','Compras','Lazer','Apostas perdas','Gasolina','Outras despesas']
};
const rules = {
  income: {
    'salario|salário|pagamento|trabalho': 'Salário',
    'pix|transferencia recebida|transferência recebida': 'PIX recebido',
    'rendimento|juros|banco|rend': 'Rendimento banco',
    'aposta lucro|brx|brxbet|green|lucro': 'Aposta lucro',
    'venda|vendido': 'Venda'
  },
  expense: {
    'mercado|supermercado|ifood|lanche|burger|comida|restaurante|pizza': 'Alimentação',
    'uber|99|onibus|ônibus|metro|metrô|taxi|táxi': 'Transporte',
    'gasolina|combustivel|combustível|posto': 'Gasolina',
    'aluguel|condominio|condomínio|energia|luz|agua|água|internet': 'Moradia',
    'farmacia|farmácia|remedio|remédio|consulta|medico|médico': 'Saúde',
    'netflix|spotify|prime|game pass|assinatura|icloud': 'Assinaturas',
    'shopee|mercado livre|magazine|amazon|roupa|perfume|malbec|maquiagem|sandalia|sandália': 'Compras',
    'cinema|shopping|festa|bar|lazer': 'Lazer',
    'aposta|blackjack|cassino|bet|red': 'Apostas perdas'
  }
};
let txs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let editingId = null;
const $ = id => document.getElementById(id);
const brl = v => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const todayIso = () => new Date().toISOString().slice(0,10);
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(txs)); render(); }
function parts(date){ const [y,m,d] = String(date).split('-').map(Number); return {y,m:m-1,d}; }
function currentMonthTxs(){ const now = new Date(); return txs.filter(t => { const p = parts(t.date); return p.y === now.getFullYear() && p.m === now.getMonth(); }); }
function selectedReportTxs(){ return txs.filter(t => { const p = parts(t.date); return p.y == $('reportYear').value && p.m == $('reportMonth').value; }); }
function detectCategory(description, type){
  const text = description.toLowerCase();
  for(const [keys, cat] of Object.entries(rules[type])) if(new RegExp(keys,'i').test(text)) return cat;
  return type === 'income' ? 'Outros recebimentos' : 'Outras despesas';
}
function categoryTotals(list, type){
  return list.filter(t=>t.type===type).reduce((acc,t)=>{ acc[t.category]=(acc[t.category]||0)+Number(t.amount); return acc; },{});
}
function sum(list, type){ return list.filter(t=>t.type===type).reduce((a,t)=>a+Number(t.amount),0); }
function renderCategoryBox(el, data){
  const entries = Object.entries(data).sort((a,b)=>b[1]-a[1]);
  if(!entries.length){ el.className='category-list empty'; el.textContent='Sem dados'; return; }
  const total = entries.reduce((a,[,v])=>a+v,0);
  el.className='category-list';
  el.innerHTML = entries.map(([cat,val])=>`<div class="cat-row"><div><b>${cat}</b><small>${((val/total)*100).toFixed(1).replace('.',',')}%</small></div><strong>${brl(val)}</strong></div>`).join('') + `<div class="cat-row total"><div><b>Total</b><small>100%</small></div><strong>${brl(total)}</strong></div>`;
}
function renderDashboard(){
  const list = currentMonthTxs(), income = sum(list,'income'), expense = sum(list,'expense');
  const now = new Date(); $('monthTitle').textContent = `${months[now.getMonth()]} ${now.getFullYear()}`;
  $('incomeTotal').textContent = brl(income); $('expenseTotal').textContent = brl(expense); $('balance').textContent = brl(income-expense); $('txCount').textContent = list.length;
  renderCategoryBox($('incomeCategories'), categoryTotals(list,'income'));
  renderCategoryBox($('expenseCategories'), categoryTotals(list,'expense'));
}
function renderTransactions(){
  const q = ($('search').value || '').toLowerCase();
  const list = txs.filter(t => [t.description,t.category,t.type].join(' ').toLowerCase().includes(q)).sort((a,b)=>b.date.localeCompare(a.date));
  $('transactionsBody').innerHTML = list.length ? list.map(t=>`<tr><td>${t.date.split('-').reverse().join('/')}</td><td>${t.description}</td><td>${t.category}</td><td class="${t.type}">${t.type==='income'?'Receita':'Despesa'}</td><td class="${t.type}">${brl(t.amount)}</td><td><button onclick="editTx('${t.id}')">Editar</button><button class="danger" onclick="deleteTx('${t.id}')">Apagar</button></td></tr>`).join('') : '<tr><td colspan="6">Nenhuma transação cadastrada.</td></tr>';
}
function renderReport(){
  const list = selectedReportTxs(), income = sum(list,'income'), expense = sum(list,'expense');
  $('reportIncome').textContent = brl(income); $('reportExpense').textContent = brl(expense); $('reportResult').textContent = brl(income-expense);
  renderCategoryBox($('reportIncomeCats'), categoryTotals(list,'income'));
  renderCategoryBox($('reportExpenseCats'), categoryTotals(list,'expense'));
}
function refreshCategoryList(){
  const type = $('type').value;
  const used = txs.filter(t=>t.type===type).map(t=>t.category);
  const all = [...new Set([...(defaultCategories[type]||[]), ...used])];
  $('categoryList').innerHTML = all.map(c=>`<option value="${c}"></option>`).join('');
}
function render(){ renderDashboard(); renderTransactions(); renderReport(); refreshCategoryList(); }
function openModal(tx=null){
  editingId = tx?.id || null; $('modalTitle').textContent = tx ? 'Editar transação' : 'Nova transação';
  $('date').value = tx?.date || todayIso(); $('description').value = tx?.description || ''; $('type').value = tx?.type || 'expense'; $('category').value = tx?.category || ''; $('amount').value = tx?.amount || ''; refreshCategoryList(); $('modal').showModal();
}
window.editTx = id => openModal(txs.find(t=>t.id===id));
window.deleteTx = id => { if(confirm('Apagar esta transação?')){ txs = txs.filter(t=>t.id!==id); save(); } };
function setup(){
  document.querySelectorAll('.nav[data-page]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.nav,.page').forEach(e=>e.classList.remove('active')); btn.classList.add('active'); $(btn.dataset.page).classList.add('active');});
  document.querySelectorAll('[data-open-modal]').forEach(b=>b.onclick=()=>openModal()); $('closeModal').onclick=()=>$('modal').close();
  months.forEach((m,i)=>$('reportMonth').add(new Option(m,i))); const y = new Date().getFullYear(); for(let i=y-5;i<=y+1;i++) $('reportYear').add(new Option(i,i)); $('reportMonth').value = new Date().getMonth(); $('reportYear').value = y;
  $('description').oninput = () => { if(!$('category').value || $('category').dataset.auto==='1'){ $('category').value = detectCategory($('description').value,$('type').value); $('category').dataset.auto='1'; } };
  $('category').oninput = () => $('category').dataset.auto='0'; $('type').onchange = () => { refreshCategoryList(); $('category').value = detectCategory($('description').value,$('type').value); $('category').dataset.auto='1'; };
  $('txForm').onsubmit = e => { e.preventDefault(); const item = { id: editingId || crypto.randomUUID(), date:$('date').value, description:$('description').value.trim(), category:$('category').value.trim(), type:$('type').value, amount: Number($('amount').value) }; txs = editingId ? txs.map(t=>t.id===editingId?item:t) : [item,...txs]; $('modal').close(); save(); };
  $('search').oninput = renderTransactions; $('reportMonth').onchange = renderReport; $('reportYear').onchange = renderReport;
  $('exportCsv').onclick = () => { const rows = [['data','descricao','categoria','tipo','valor'], ...txs.map(t=>[t.date,t.description,t.category,t.type,t.amount])]; const csv = rows.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(';')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='financas.csv'; a.click(); };
  $('importCsvBtn').onclick=()=>$('importCsv').click(); $('importCsv').onchange = async e => { const text = await e.target.files[0].text(); const lines = text.split(/\r?\n/).slice(1).filter(Boolean); txs.push(...lines.map(line=>{ const [date,description,category,type,amount]=line.split(';').map(x=>x.replace(/^"|"$/g,'')); return {id:crypto.randomUUID(),date,description,category,type,amount:Number(String(amount).replace(',','.'))}; })); save(); };
  $('printBtn').onclick = () => print(); $('resetBtn').onclick=()=>{ if(confirm('Apagar todos os dados?')){ txs=[]; save(); }};
  if('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(()=>{}); render();
}
document.addEventListener('DOMContentLoaded', setup);
