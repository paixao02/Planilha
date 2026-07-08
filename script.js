// Finance App logic
// This script orchestrates all functionality for the finance app. It
// handles storing transactions, updating the UI, importing and exporting
// CSV files, printing reports and filtering by month/year. There are no
// preloaded transactions – everything comes from the user via imports or
// manual entry. All data is persisted in localStorage.

document.addEventListener('DOMContentLoaded', () => {
  // Clear pre-existing transactions from earlier versions once. This
  // prevents old sample data from lingering in the user's browser when
  // upgrading from a prior version of the app. After clearing, a
  // marker key is set so that the removal happens only once. If you
  // wish to reset the app manually, delete the marker key
  // 'transactions_cleared_once' from localStorage.
  if (!localStorage.getItem('transactions_cleared_once')) {
    localStorage.removeItem('transactions');
    localStorage.setItem('transactions_cleared_once', '1');
  }
  // Read stored transactions from localStorage. If none are found or the
  // stored value cannot be parsed, start with an empty array. We do not
  // seed with any default dataset.
  let transactions;
  try {
    const stored = localStorage.getItem('transactions');
    transactions = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(transactions)) transactions = [];
  } catch (e) {
    transactions = [];
  }

  // A simple list of known categories. When a transaction is added or
  // imported, new categories are added to this array. Each element is
  // an object: { name: string, type: 'income'|'expense' }.
  const categories = [];
  // Populate category list from existing transactions
  transactions.forEach((t) => {
    if (t.category && !categories.find((c) => c.name === t.category)) {
      categories.push({ name: t.category, type: t.type });
    }
  });

  // Track the ID of a transaction currently being edited. When null,
  // we are creating a new transaction. IDs are integers assigned
  // sequentially based on the maximum existing ID.
  let editingTransactionId = null;

  /**
   * Mapping of keywords to pre-defined categories. Keys should be
   * lowercase fragments expected to appear in the transaction
   * description. Separate maps exist for income and expense types. If
   * the description contains a keyword, the corresponding category
   * will be auto-selected when entering a new transaction. These
   * mappings can be extended as desired.
   */
  const keywordCategoryMap = {
    income: {
      'brx': 'aposta lucro',
      'brxbet': 'aposta lucro',
      'aposta lucro': 'aposta lucro',
      'rend': 'rendimento banco',
      'rendimento': 'rendimento banco',
      'vicio lucro': 'vicio lucro',
      'recupera': 'recuperação de vicio',
      'manu pg': 'Manu PG',
      'md': 'md',
      'mere': 'mere',
      'manu': 'Manu PG'
    },
    expense: {
      'gas': 'gasolina',
      'gasolina': 'gasolina',
      'comida': 'comida',
      'burger': 'comida',
      'lanche': 'comida',
      'manu': 'manu',
      'mere': 'mere',
      'vício': 'vicio',
      'vicio': 'vicio',
      'aposta': 'apostas percas',
      'apostas perca': 'apostas percas',
      'blackjack': 'apostas percas',
      'malbec': 'aleatório',
      'perfume': 'aleatório',
      'roupa': 'aleatório',
      'club': 'aleatório'
    }
  };

  // Month names in Portuguese. The index corresponds to JavaScript's
  // zero-based month (0 = Janeiro, 11 = Dezembro).
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  // DOM references for report filters and buttons
  const reportMonthSelect = document.getElementById('report-month');
  const reportYearSelect = document.getElementById('report-year');
  const importBtn = document.getElementById('importBtn');
  const importFileInput = document.getElementById('importFileInput');
  const exportBtn = document.getElementById('exportBtn');
  const printBtn = document.getElementById('printBtn');
  const resetBtn = document.getElementById('resetBtn');

  /**
   * Persist the current transactions array to localStorage. Use JSON
   * stringification to store the entire list. This function is
   * referenced throughout the script whenever the transactions array is
   * mutated.
   */
  function saveTransactions() {
    localStorage.setItem('transactions', JSON.stringify(transactions));
  }

  /**
   * Format a number into a Brazilian Real currency string. Chart.js
   * expects raw numbers, but for UI we localise the string. Negative
   * values are automatically prefaced with a minus sign.
   *
   * @param {number} value The numeric value to format.
   * @returns {string} A formatted currency string like “R$ 1.234,56”.
   */
  function formatCurrency(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Update the heading on the dashboard to display the current month
   * and year (e.g., “Julho 2026”). This uses the browser’s current
   * system date rather than any transaction date.
   */
  function updateMonthLabel() {
    const now = new Date();
    const label = monthNames[now.getMonth()] + ' ' + now.getFullYear();
    const labelEl = document.getElementById('current-month');
    if (labelEl) {
      labelEl.textContent = label;
    }
  }

  /**
   * Create or update a Chart.js doughnut chart. To avoid leaking
   * chart instances, pass in the current instance so that we can
   * destroy it before creating a new one. If there is no data for
   * the chart, a dummy segment is drawn so that Chart.js will render
   * a circle with the “Sem dados” label.
   *
   * @param {Chart|null} chartInstance The existing chart instance or null.
   * @param {string} canvasId The ID of the canvas element for the chart.
   * @param {Object} dataObj An object mapping category names to totals.
   * @param {Array<string>} colors An array of colour hex codes for the segments.
   * @returns {Chart} The newly created chart instance.
   */
  function updateChart(chartInstance, canvasId, dataObj, colors) {
    const labels = Object.keys(dataObj);
    const values = Object.values(dataObj);
    const chartData = {
      labels: labels.length > 0 ? labels : ['Sem dados'],
      datasets: [
        {
          data: values.length > 0 ? values : [1],
          backgroundColor: colors.slice(0, labels.length > 0 ? labels.length : 1),
          borderWidth: 0,
        },
      ],
    };
    const config = {
      type: 'doughnut',
      data: chartData,
      options: {
        responsive: true,
        cutout: '60%',
        plugins: {
          // Hide the built‑in legend since we provide a custom one
          legend: {
            display: false,
          },
        },
      },
    };
    // Destroy existing instance
    if (chartInstance) {
      chartInstance.destroy();
    }
    const ctx = document.getElementById(canvasId).getContext('2d');
    return new Chart(ctx, config);
  }

  // Chart instances for dashboard
  let expensesChartInstance = null;
  let incomeChartInstance = null;

  /**
   * Update the centre text element inside a donut chart. This shows the
   * total value represented by the chart, formatted as currency. If
   * there are no transactions (total is zero), it displays “Sem dados”.
   *
   * @param {string} elementId The ID of the centre text element.
   * @param {number} total The total amount represented by the chart.
   */
  function updateCenterText(elementId, total) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (total > 0) {
      el.textContent = formatCurrency(total);
    } else {
      el.textContent = 'Sem dados';
    }
  }

  /**
   * Render a custom legend for the dashboard charts. The legend lists
   * each category with a colour indicator, a progress bar, the
   * formatted value and its percentage contribution. Categories are
   * sorted descending by value.
   *
   * @param {string} containerId The ID of the legend container div.
   * @param {Object} dataObj An object mapping category names to
   *   numeric totals.
   * @param {number} total The sum of all values in dataObj.
   * @param {Array<string>} colors An array of CSS colour codes used
   *   cyclically for the legend entries.
   */
  function updateLegend(containerId, dataObj, total, colors) {
    const container = document.getElementById(containerId);
    if (!container) return;
    // Clear existing entries
    container.innerHTML = '';
    const entries = Object.entries(dataObj);
    // Sort categories by descending total
    entries.sort((a, b) => b[1] - a[1]);
    entries.forEach(([category, value], index) => {
      const percent = total > 0 ? (value / total) * 100 : 0;
      const percentStr = percent.toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      // Create legend item wrapper
      const item = document.createElement('div');
      item.className = 'legend-item';
      // Colour box
      const colorBox = document.createElement('span');
      colorBox.className = 'legend-color';
      colorBox.style.backgroundColor = colors[index % colors.length];
      // Label
      const label = document.createElement('span');
      label.className = 'legend-label';
      label.textContent = category;
      // Progress bar container
      const barContainer = document.createElement('div');
      barContainer.className = 'legend-bar';
      const progress = document.createElement('div');
      progress.className = 'legend-progress';
      progress.style.backgroundColor = colors[index % colors.length];
      progress.style.width = percent + '%';
      barContainer.appendChild(progress);
      // Value
      const valueSpan = document.createElement('span');
      valueSpan.className = 'legend-value';
      valueSpan.textContent = formatCurrency(value);
      // Percent
      const percentSpan = document.createElement('span');
      percentSpan.className = 'legend-percent';
      percentSpan.textContent = percentStr + '%';
      // Assemble item
      item.appendChild(colorBox);
      item.appendChild(label);
      item.appendChild(barContainer);
      item.appendChild(valueSpan);
      item.appendChild(percentSpan);
      container.appendChild(item);
    });
  }

  /**
   * Extract year, month (0-indexed) and day from an ISO date string of
   * the form “YYYY-MM-DD”. This helper avoids timezone issues when
   * parsing dates via the Date constructor, which treats bare ISO
   * strings as UTC and may shift to the previous day depending on
   * the user’s timezone. If the string is not in the expected
   * format, it returns null.
   *
   * @param {string} isoDateStr The ISO date string.
   * @returns {{year:number, month:number, day:number}|null} The parts or null.
   */
  function getDateParts(isoDateStr) {
    if (!isoDateStr || typeof isoDateStr !== 'string') return null;
    const parts = isoDateStr.split('-');
    if (parts.length !== 3) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
    const day = parseInt(parts[2], 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    return { year, month, day };
  }

  /**
   * Filter a list of transactions to those occurring in the current
   * calendar month. This is used by the dashboard to show the
   * current-month totals and charts. Transactions are expected to
   * contain a "date" property formatted as ISO "YYYY-MM-DD". We
   * extract the year and month manually to avoid timezone shifts.
   *
   * @param {Array} transactionsList An array of transaction objects.
   * @returns {Array} Filtered transactions for the current month and year.
   */
  function filterCurrentMonth(transactionsList) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    return transactionsList.filter((t) => {
      const parts = getDateParts(t.date);
      return parts && parts.month === currentMonth && parts.year === currentYear;
    });
  }

  /**
   * Update the dashboard summary values and charts. Only transactions
   * from the current month are considered. Totals for income and
   * expenses are computed, and a net balance (income minus expenses)
   * is derived. Category breakdowns for income and expenses are
   * aggregated into objects passed to Chart.js.
   */
  function updateDashboard() {
    const current = filterCurrentMonth(transactions);
    let incomeTotal = 0;
    let expenseTotal = 0;
    const expensesByCat = {};
    const incomeByCat = {};
    current.forEach((t) => {
      const amount = Number(t.amount);
      if (t.type === 'income') {
        incomeTotal += amount;
        incomeByCat[t.category] = (incomeByCat[t.category] || 0) + amount;
      } else {
        expenseTotal += amount;
        expensesByCat[t.category] = (expensesByCat[t.category] || 0) + amount;
      }
    });
    const balance = incomeTotal - expenseTotal;
    // Update numeric values on cards
    document.getElementById('income-value').textContent = formatCurrency(incomeTotal);
    document.getElementById('expense-value').textContent = formatCurrency(expenseTotal);
    document.getElementById('balance-value').textContent = formatCurrency(balance);
    // Update centre texts inside the donuts
    updateCenterText('incomeCenterText', incomeTotal);
    updateCenterText('expensesCenterText', expenseTotal);
    // Colour palettes for the charts and legends
    const expenseColors = ['#e74c3c', '#c0392b', '#e67e22', '#d35400', '#9b59b6', '#8e44ad'];
    const incomeColors = ['#2ecc71', '#27ae60', '#16a085', '#1abc9c', '#3498db', '#2980b9'];
    // Update charts
    expensesChartInstance = updateChart(
      expensesChartInstance,
      'expensesChart',
      expensesByCat,
      expenseColors
    );
    incomeChartInstance = updateChart(
      incomeChartInstance,
      'incomeChart',
      incomeByCat,
      incomeColors
    );
    // Update custom legends
    updateLegend('expensesLegend', expensesByCat, expenseTotal, expenseColors);
    updateLegend('incomeLegend', incomeByCat, incomeTotal, incomeColors);
  }

  /**
   * Render the transaction list for the current month. Each row of the
   * table includes the date, description, category, type, value and
   * action icons for editing and deleting. Editing fills the modal
   * fields; deleting prompts the user and removes the transaction.
   */
  function renderTransactions() {
    const tbody = document.getElementById('transactions-body');
    tbody.innerHTML = '';
    const current = filterCurrentMonth(transactions);
    current.sort((a, b) => new Date(b.date) - new Date(a.date));
    current.forEach((t) => {
      const tr = document.createElement('tr');
      const dateTd = document.createElement('td');
      const descTd = document.createElement('td');
      const catTd = document.createElement('td');
      const typeTd = document.createElement('td');
      const amountTd = document.createElement('td');
      const actionsTd = document.createElement('td');
      actionsTd.className = 'actions';
      dateTd.textContent = new Date(t.date).toLocaleDateString('pt-BR');
      descTd.textContent = t.description;
      catTd.textContent = t.category;
      typeTd.textContent = t.type === 'income' ? 'Receita' : 'Despesa';
      typeTd.className = t.type;
      amountTd.textContent = formatCurrency(Number(t.amount));
      amountTd.className = t.type;
      // Edit icon
      const editIcon = document.createElement('i');
      editIcon.className = 'fa fa-edit edit-btn';
      editIcon.dataset.id = t.id;
      editIcon.title = 'Editar';
      // Delete icon
      const deleteIcon = document.createElement('i');
      deleteIcon.className = 'fa fa-trash delete-btn';
      deleteIcon.dataset.id = t.id;
      deleteIcon.title = 'Apagar';
      actionsTd.appendChild(editIcon);
      actionsTd.appendChild(deleteIcon);
      tr.appendChild(dateTd);
      tr.appendChild(descTd);
      tr.appendChild(catTd);
      tr.appendChild(typeTd);
      tr.appendChild(amountTd);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
      // Edit event
      editIcon.addEventListener('click', () => {
        const id = parseInt(editIcon.dataset.id);
        const tx = transactions.find((tran) => tran.id === id);
        if (tx) {
          editingTransactionId = id;
          document.getElementById('date').value = new Date(tx.date).toISOString().substr(0, 10);
          document.getElementById('description').value = tx.description;
          document.getElementById('category').value = tx.category;
          document.getElementById('type').value = tx.type;
          document.getElementById('amount').value = tx.amount;
          document.querySelector('.btn-save').textContent = 'Atualizar';
          modal.style.display = 'block';
        }
      });
      // Delete event
      deleteIcon.addEventListener('click', () => {
        const id = parseInt(deleteIcon.dataset.id);
        if (confirm('Deseja realmente apagar esta transação?')) {
          const index = transactions.findIndex((tran) => tran.id === id);
          if (index !== -1) {
            transactions.splice(index, 1);
            saveTransactions();
            updateDashboard();
            renderTransactions();
            updateReport();
            populateYearOptions();
          }
        }
      });
    });
  }

  /**
   * Populate the datalist for categories. Each call resets the list and
   * adds an option for each category name. This allows the user to
   * quickly choose from existing categories when adding or editing a
   * transaction.
   */
  const categoryListElement = document.getElementById('category-list');
  /**
   * Populate the datalist for categories. If a filter type is
   * provided, only categories matching that type are included. This
   * allows the UI to show income categories when the transaction
   * type is “Receita” and expense categories when it is “Despesa”.
   *
   * @param {string|null} filterType Either 'income', 'expense' or
   *   undefined/null to include all categories.
   */
  function refreshCategoryDatalist(filterType = null) {
    categoryListElement.innerHTML = '';
    categories.forEach((cat) => {
      if (!filterType || cat.type === filterType) {
        const option = document.createElement('option');
        option.value = cat.name;
        categoryListElement.appendChild(option);
      }
    });
  }

  /**
   * Populate the month select with the month names. Values correspond
   * to zero-based month indices. This should be called once on
   * initialisation. The default selected value will remain as whatever
   * is currently selected unless explicitly set elsewhere.
   */
  function populateMonthOptions() {
    reportMonthSelect.innerHTML = '';
    monthNames.forEach((name, index) => {
      const opt = document.createElement('option');
      opt.value = index.toString();
      opt.textContent = name;
      reportMonthSelect.appendChild(opt);
    });
  }

  /**
   * Populate the year select with unique years derived from the
   * transactions array. If no years are present, include the current
   * year so the select is not empty. The list is sorted ascending.
   */
  function populateYearOptions() {
    const years = new Set();
    transactions.forEach((t) => {
      if (t.date) {
        const d = new Date(t.date);
        if (!isNaN(d)) {
          years.add(d.getFullYear());
        }
      }
    });
    if (years.size === 0) {
      years.add(new Date().getFullYear());
    }
    const sorted = Array.from(years).sort((a, b) => a - b);
    reportYearSelect.innerHTML = '';
    sorted.forEach((y) => {
      const opt = document.createElement('option');
      opt.value = y.toString();
      opt.textContent = y.toString();
      reportYearSelect.appendChild(opt);
    });
  }

  /**
   * Filter transactions according to the selected month and year in the
   * report controls. Returns an array of transactions that match the
   * selection.
   *
   * @returns {Array<Object>} Filtered transactions.
   */
  function filterReportPeriod() {
    const selectedMonth = parseInt(reportMonthSelect.value);
    const selectedYear = parseInt(reportYearSelect.value);
    return transactions.filter((t) => {
      const parts = getDateParts(t.date);
      return parts && parts.month === selectedMonth && parts.year === selectedYear;
    });
  }

  /**
   * Update the report section based on the filtered transactions.
   * Totals, counts, and category breakdowns are computed only for
   * transactions matching the selected month/year. Top expenses are
   * determined by sorting the expenses and taking the highest values.
   */
  function updateReport() {
    const filtered = filterReportPeriod();
    let incomeTotal = 0;
    let expenseTotal = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    const incomeByCategory = {};
    const expenseByCategory = {};
    filtered.forEach((t) => {
      const amount = Number(t.amount);
      if (t.type === 'income') {
        incomeTotal += amount;
        incomeCount += 1;
        incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + amount;
      } else {
        expenseTotal += amount;
        expenseCount += 1;
        if (!expenseByCategory[t.category]) {
          expenseByCategory[t.category] = { count: 0, total: 0 };
        }
        expenseByCategory[t.category].count += 1;
        expenseByCategory[t.category].total += amount;
      }
    });
    const resultTotal = incomeTotal - expenseTotal;
    // Summary cards
    document.getElementById('report-income-value').textContent = formatCurrency(incomeTotal);
    document.getElementById('report-income-count').textContent = `${incomeCount} transações`;
    document.getElementById('report-expense-value').textContent = formatCurrency(expenseTotal);
    document.getElementById('report-expense-count').textContent = `${expenseCount} transações`;
    document.getElementById('report-result-value').textContent = formatCurrency(resultTotal);
    // Income by category table
    const incomeBody = document.getElementById('report-income-category-body');
    incomeBody.innerHTML = '';
    const incomeEntries = Object.entries(incomeByCategory);
    incomeEntries.sort((a, b) => b[1] - a[1]);
    incomeEntries.forEach(([category, value]) => {
      const tr = document.createElement('tr');
      const catTd = document.createElement('td');
      catTd.textContent = category;
      const valueTd = document.createElement('td');
      valueTd.textContent = formatCurrency(value);
      valueTd.className = 'income';
      // Calculate percentage contribution for income
      const percent = incomeTotal > 0 ? (value / incomeTotal) * 100 : 0;
      const percentTd = document.createElement('td');
      // Format percent with two decimals and build progress bar
      const percentNum = percent.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      percentTd.innerHTML = `<span class="percent-text">${percentNum}%</span>` +
        `<div class="progress-bar"><div class="progress" style="background-color:#2ecc71;width:${percent}%"></div></div>`;
      tr.appendChild(catTd);
      tr.appendChild(valueTd);
      tr.appendChild(percentTd);
      incomeBody.appendChild(tr);
    });

    // Add a total row for incomes if there are any entries
    if (incomeEntries.length > 0) {
      const totalTr = document.createElement('tr');
      totalTr.className = 'total-row';
      const totalLabelTd = document.createElement('td');
      totalLabelTd.textContent = 'Total Receitas';
      totalLabelTd.style.fontWeight = '600';
      const totalValueTd = document.createElement('td');
      totalValueTd.textContent = formatCurrency(incomeTotal);
      totalValueTd.className = 'income';
      const totalPercentTd = document.createElement('td');
      // 100% percent representation with full progress bar
      totalPercentTd.innerHTML = `<span class="percent-text">100,00%</span>` +
        `<div class="progress-bar"><div class="progress" style="background-color:#2ecc71;width:100%"></div></div>`;
      totalTr.appendChild(totalLabelTd);
      totalTr.appendChild(totalValueTd);
      totalTr.appendChild(totalPercentTd);
      incomeBody.appendChild(totalTr);
    }
    // Expense by category table
    const expenseBody = document.getElementById('report-expense-category-body');
    expenseBody.innerHTML = '';
    const expenseEntries = Object.entries(expenseByCategory);
    expenseEntries.sort((a, b) => b[1].total - a[1].total);
    expenseEntries.forEach(([category, data]) => {
      const { count, total } = data;
      const percent = expenseTotal > 0 ? (total / expenseTotal) * 100 : 0;
      const tr = document.createElement('tr');
      const catTd = document.createElement('td');
      catTd.textContent = category;
      const countTd = document.createElement('td');
      countTd.textContent = count;
      const valueTd = document.createElement('td');
      valueTd.textContent = formatCurrency(total);
      valueTd.className = 'expense';
      const percentTd = document.createElement('td');
      const percentFormatted = percent.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      // Build percent cell with progress bar for expenses
      percentTd.innerHTML = `<span class="percent-text">${percentFormatted}%</span>` +
        `<div class="progress-bar"><div class="progress" style="background-color:#e74c3c;width:${percent}%"></div></div>`;
      tr.appendChild(catTd);
      tr.appendChild(countTd);
      tr.appendChild(valueTd);
      tr.appendChild(percentTd);
      expenseBody.appendChild(tr);
    });

    // Add a total row for expenses if there are any entries
    if (expenseEntries.length > 0) {
      const totalTr = document.createElement('tr');
      totalTr.className = 'total-row';
      const totalLabelTd = document.createElement('td');
      totalLabelTd.textContent = 'Total Despesas';
      totalLabelTd.style.fontWeight = '600';
      const totalCountTd = document.createElement('td');
      totalCountTd.textContent = expenseCount.toString();
      const totalValueTd = document.createElement('td');
      totalValueTd.textContent = formatCurrency(expenseTotal);
      totalValueTd.className = 'expense';
      const totalPercentTd = document.createElement('td');
      totalPercentTd.innerHTML = `<span class="percent-text">100,00%</span>` +
        `<div class="progress-bar"><div class="progress" style="background-color:#e74c3c;width:100%"></div></div>`;
      totalTr.appendChild(totalLabelTd);
      totalTr.appendChild(totalCountTd);
      totalTr.appendChild(totalValueTd);
      totalTr.appendChild(totalPercentTd);
      expenseBody.appendChild(totalTr);
    }
    // Top expenses table
    const topBody = document.getElementById('report-top-expenses-body');
    topBody.innerHTML = '';
    const expenseTransactions = filtered.filter((t) => t.type === 'expense');
    expenseTransactions.sort((a, b) => Number(b.amount) - Number(a.amount));
    const topLimit = 5;
    expenseTransactions.slice(0, topLimit).forEach((t, index) => {
      const tr = document.createElement('tr');
      const indexTd = document.createElement('td');
      indexTd.textContent = index + 1;
      const descTd = document.createElement('td');
      descTd.textContent = t.description;
      const catTd = document.createElement('td');
      catTd.textContent = t.category;
      const dateTd = document.createElement('td');
      dateTd.textContent = new Date(t.date).toLocaleDateString('pt-BR');
      const valueTd = document.createElement('td');
      valueTd.textContent = formatCurrency(Number(t.amount));
      valueTd.className = 'expense';
      tr.appendChild(indexTd);
      tr.appendChild(descTd);
      tr.appendChild(catTd);
      tr.appendChild(dateTd);
      tr.appendChild(valueTd);
      topBody.appendChild(tr);
    });
  }

  /**
   * Export all transactions (not just filtered ones) to a CSV file.
   * The header format matches the CSVs provided by the user. All
   * semicolons in descriptions are replaced to avoid splitting fields.
   */
  function exportToCSV() {
    const header = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Método de Pagamento', 'Valor', 'Observações'];
    const lines = transactions.map((t) => {
      const dateStr = new Date(t.date).toLocaleDateString('pt-BR');
      const tipo = t.type === 'income' ? 'Receita' : 'Despesa';
      const desc = (t.description || '').replace(/;/g, ',');
      const categoria = t.category || '';
      const metodo = 'Outro';
      const valor = Number(t.amount).toFixed(2).replace('.', ',');
      const obs = '';
      return [dateStr, tipo, desc, categoria, metodo, valor, obs].join(';');
    });
    const csvContent = [header.join(';'), ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const fileName = `transacoes_exportadas_${now.toISOString().substring(0, 10)}.csv`;
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Parse a CSV file and append the resulting transactions to the
   * existing array. Each line is expected to follow the header
   * format provided by the user: Data;Tipo;Descrição;Categoria;Método de Pagamento;Valor;Observações.
   * If additional columns are present, they are ignored. Dates are
   * converted from dd/mm/yyyy to yyyy-mm-dd. Values are parsed from
   * Brazilian formatting (comma decimal, dot thousand) into floats.
   *
   * @param {string} content The raw text content of the CSV file.
   */
  function importCSVContent(content) {
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) return;
    // Remove a possible BOM character from the first line
    if (lines[0].charCodeAt(0) === 0xfeff) {
      lines[0] = lines[0].substring(1);
    }
    // Determine the delimiter. We expect ';' but handle ',' as fallback.
    // We'll inspect the header row; if it contains semicolons, we use that.
    let delimiter = ';';
    if (lines[0].indexOf(';') === -1 && lines[0].indexOf(',') !== -1) {
      delimiter = ',';
    }
    // Skip the header if it contains “Data” or similar; otherwise treat all lines as data.
    let startIndex = 0;
    const headerTokens = lines[0].split(delimiter).map((s) => s.trim().toLowerCase());
    if (headerTokens[0] === 'data' || headerTokens.includes('data')) {
      startIndex = 1;
    }
    // Determine current max id to continue sequence
    let maxId = transactions.reduce((max, t) => Math.max(max, t.id || 0), 0);
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const tokens = line.split(delimiter);
      // Data;Tipo;Descrição;Categoria;Método de Pagamento;Valor;Observações
      const dateStr = tokens[0] ? tokens[0].replace(/"/g, '').trim() : '';
      // Trim and normalise the "Tipo" field. Remove quotes and whitespace
      const tipo = tokens[1] ? tokens[1].replace(/"/g, '').trim() : '';
      // Trim description and category to avoid trailing spaces causing duplicate entries
      const desc = tokens[2] ? tokens[2].replace(/"/g, '').trim() : '';
      const cat = tokens[3] ? tokens[3].replace(/"/g, '').trim() : '';
      // Some CSVs may omit the payment column; detect value position accordingly
      let valorToken = '';
      if (tokens.length >= 6) {
        valorToken = tokens[5] ? tokens[5].replace(/"/g, '').trim() : '';
      } else if (tokens.length >= 5) {
        valorToken = tokens[4] ? tokens[4].replace(/"/g, '').trim() : '';
      }
      // Parse date from dd/MM/yyyy to yyyy-MM-dd
      let isoDate = '';
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const [day, month, year] = parts;
          isoDate = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      } else {
        // Fallback: treat as ISO already
        isoDate = dateStr;
      }
      // Determine type
      const tipoLower = tipo.toLowerCase();
      // Determine type based on the prefix of the tipo field. Accept
      // both "Receita" and "Despesa" as well as English words for
      // robustness.
      const type = tipoLower.startsWith('receita') || tipoLower.startsWith('income')
        ? 'income'
        : 'expense';
      // Parse value: remove currency symbols and thousands separators
      let valueStr = valorToken;
      valueStr = valueStr.replace(/[Rr]\$/g, '').replace(/\s/g, '');
      valueStr = valueStr.replace(/\./g, '').replace(/,/g, '.');
      let amount = parseFloat(valueStr);
      if (isNaN(amount)) amount = 0;
      // Create transaction object
      maxId += 1;
      const transaction = {
        id: maxId,
        date: isoDate,
        description: desc,
        category: cat || 'Outros',
        type,
        amount,
      };
      transactions.push(transaction);
      // Add category if new
      if (transaction.category && !categories.find((c) => c.name === transaction.category)) {
        categories.push({ name: transaction.category, type: transaction.type });
      }
    }
    saveTransactions();
    refreshCategoryDatalist();
    updateDashboard();
    renderTransactions();
    populateYearOptions();
    updateReport();
  }

  /**
   * Wire up event handlers for importing, exporting and printing.
   */
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      if (importFileInput) {
        importFileInput.value = '';
        importFileInput.click();
      }
    });
  }
  if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        importCSVContent(content);
      };
      reader.readAsText(file);
    });
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportToCSV();
    });
  }
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      // Only print the report section by temporarily showing it and hiding others
      window.print();
    });
  }

  // Reset all transactions and categories. Confirm before clearing. This
  // allows the user to wipe the existing dataset prior to importing new
  // CSV files. After clearing, the UI is refreshed and the month/year
  // selectors are updated accordingly.
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Isto irá remover todas as transações e categorias. Deseja continuar?')) {
        transactions.splice(0, transactions.length);
        categories.splice(0, categories.length);
        localStorage.removeItem('transactions');
        saveTransactions();
        refreshCategoryDatalist();
        updateDashboard();
        renderTransactions();
        populateYearOptions();
        updateReport();
      }
    });
  }

  /**
   * Handle navigation between dashboard, transactions, add and report
   * sections. When the “add” link is clicked, we programmatically
   * open the modal and reset the nav highlight back to dashboard so
   * the user isn’t left with an empty section.
   */
  const navLinks = document.querySelectorAll('.nav-links li');
  const modal = document.getElementById('modal');
  const openModalBtn = document.getElementById('openModalBtn');
  const closeBtn = document.querySelector('.close-btn');
  const transactionForm = document.getElementById('transaction-form');

  // Inputs inside the transaction modal
  const typeSelect = document.getElementById('type');
  const descriptionInput = document.getElementById('description');
  const categoryInputField = document.getElementById('category');

  /**
   * Auto-select a category based on the description keywords. If the
   * description contains a keyword defined in keywordCategoryMap for
   * the current transaction type and the category field is empty, the
   * category field is automatically filled. This function runs when
   * the user types in the description field.
   */
  function autoSelectCategory() {
    const desc = descriptionInput.value.toLowerCase();
    const txType = typeSelect.value;
    if (!desc || !keywordCategoryMap[txType]) return;
    if (categoryInputField.value) return;
    const mappings = keywordCategoryMap[txType];
    for (const key in mappings) {
      if (desc.includes(key)) {
        const suggested = mappings[key];
        categoryInputField.value = suggested;
        // Ensure the suggested category exists in the datalist
        if (!categories.find((c) => c.name === suggested)) {
          categories.push({ name: suggested, type: txType });
        }
        refreshCategoryDatalist(txType);
        break;
      }
    }
  }

  // When the transaction type changes, filter the categories shown
  typeSelect.addEventListener('change', () => {
    // Refresh the category datalist with categories matching the selected type
    refreshCategoryDatalist(typeSelect.value);
    // Clear any previously selected category
    categoryInputField.value = '';
  });

  // When typing a description, try to auto-select a category
  descriptionInput.addEventListener('input', () => {
    autoSelectCategory();
  });
  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      const section = link.dataset.section;
      showSection(section);
      if (section === 'add') {
        openModalBtn.click();
        navLinks.forEach((l) => {
          if (l.dataset.section === 'dashboard') {
            l.classList.add('active');
          } else {
            l.classList.remove('active');
          }
        });
      }
      if (section === 'report') {
        updateReport();
      }
    });
  });

  /**
   * Show the requested section and hide the others. The available
   * sections are identified by their IDs: dashboard-section,
   * transactions-section and report-section. Only one section is
   * visible at a time.
   *
   * @param {string} section The name of the section to display.
   */
  function showSection(section) {
    const dashboardSection = document.getElementById('dashboard-section');
    const transactionsSection = document.getElementById('transactions-section');
    const reportSection = document.getElementById('report-section');
    if (section === 'dashboard') {
      dashboardSection.classList.remove('hidden');
      transactionsSection.classList.add('hidden');
      reportSection.classList.add('hidden');
    } else if (section === 'transactions') {
      dashboardSection.classList.add('hidden');
      transactionsSection.classList.remove('hidden');
      reportSection.classList.add('hidden');
    } else if (section === 'report') {
      dashboardSection.classList.add('hidden');
      transactionsSection.classList.add('hidden');
      reportSection.classList.remove('hidden');
    }
  }

  /**
   * Handle modal open and close actions. When the modal is opened,
   * today’s date is pre-filled. Closing resets the editing state.
   */
  openModalBtn.addEventListener('click', () => {
    // When opening the modal via “Nova transação”, ensure we start
    // fresh. Clear any editing state, reset form fields, set the
    // save button text back to “Salvar” and prefill today’s date.
    editingTransactionId = null;
    const saveBtn = document.querySelector('.btn-save');
    if (saveBtn) saveBtn.textContent = 'Salvar';
    // Reset the form to clear previously entered values. This will
    // also reset the select back to its first option.
    if (transactionForm) transactionForm.reset();
    const today = new Date().toISOString().substr(0, 10);
    const dateInput = document.getElementById('date');
    if (dateInput) dateInput.value = today;
    modal.style.display = 'block';
  });
  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    editingTransactionId = null;
    document.querySelector('.btn-save').textContent = 'Salvar';
  });
  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
      editingTransactionId = null;
      document.querySelector('.btn-save').textContent = 'Salvar';
    }
  });

  /**
   * Process the form submission to add or update a transaction. When
   * editing, the existing object is mutated; otherwise, a new
   * transaction is created with a unique ID. Categories are
   * automatically added to the categories list if they are new.
   */
  transactionForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = document.getElementById('date').value;
    const description = document.getElementById('description').value.trim();
    const categoryInput = document.getElementById('category').value.trim();
    const category = categoryInput || 'Outros';
    const type = document.getElementById('type').value;
    const amount = parseFloat(document.getElementById('amount').value);
    if (!date || !description || !type || isNaN(amount) || amount < 0) {
      return;
    }
    if (editingTransactionId !== null) {
      const idx = transactions.findIndex((t) => t.id === editingTransactionId);
      if (idx !== -1) {
        transactions[idx].date = date;
        transactions[idx].description = description;
        transactions[idx].category = category;
        transactions[idx].type = type;
        transactions[idx].amount = amount;
      }
    } else {
      const newId = transactions.length > 0 ? Math.max(...transactions.map((t) => t.id || 0)) + 1 : 1;
      transactions.push({ id: newId, date, description, category, type, amount });
    }
    // Add new category if necessary
    if (!categories.find((c) => c.name === category)) {
      categories.push({ name: category, type });
    }
    saveTransactions();
    // After saving, refresh the category datalist for the selected type
    refreshCategoryDatalist(type);
    updateDashboard();
    renderTransactions();
    populateYearOptions();
    updateReport();
    editingTransactionId = null;
    document.querySelector('.btn-save').textContent = 'Salvar';
    modal.style.display = 'none';
    transactionForm.reset();
  });

  // Populate selects and category list on initial load
  populateMonthOptions();
  populateYearOptions();
  // Refresh category datalist for the default selected transaction type
  refreshCategoryDatalist(typeSelect.value);
  // Select the current month and year by default
  const currentDate = new Date();
  reportMonthSelect.value = currentDate.getMonth().toString();
  reportYearSelect.value = currentDate.getFullYear().toString();
  // When the report filters change, recalculate the report
  reportMonthSelect.addEventListener('change', updateReport);
  reportYearSelect.addEventListener('change', updateReport);

  // Run initial update functions
  updateMonthLabel();
  updateDashboard();
  renderTransactions();
  updateReport();
});