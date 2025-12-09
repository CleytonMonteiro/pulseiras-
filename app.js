import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- 1. CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyCzd2fMAI6rGuSitFfgGcbjN8Wq22IJwz4",
    authDomain: "pulseiratrack.firebaseapp.com",
    projectId: "pulseiratrack",
    storageBucket: "pulseiratrack.firebasestorage.app",
    messagingSenderId: "467577314932",
    appId: "1:467577314932:web:bc64142212fb313b3ebb21"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// CONFIGURAÇÃO DE ALERTA
const LIMITE_ALERTA = 20;

// --- 2. SELEÇÃO DE ELEMENTOS DO DOM ---
const salesForm = document.getElementById('salesForm');
const paymentType = document.getElementById('paymentType');
const directorGroup = document.getElementById('directorGroup');
const directorInput = document.getElementById('directorInput');
const btnFilter = document.getElementById('btnFilter');
const dateStart = document.getElementById('dateStart');
const dateEnd = document.getElementById('dateEnd');
const editIdInput = document.getElementById('editId');
const btnSubmit = document.getElementById('btnSubmit');
const btnCancelEdit = document.getElementById('btnCancelEdit');
const formTitle = document.getElementById('formTitle');
const lblDirector = document.querySelector('#directorGroup label');
const printPeriod = document.getElementById('printPeriod'); 

const qtdAdultoInput = document.getElementById('qtdAdultoInput');
const qtdInfantilInput = document.getElementById('qtdInfantilInput');
const tbodyAdulto = document.querySelector('#tableAdulto tbody');
const tbodyInfantil = document.querySelector('#tableInfantil tbody');
const cardPanelAdulto = document.getElementById('cardPanelAdulto');
const cardPanelInfantil = document.getElementById('cardPanelInfantil');
const elGlobalAdulto = document.getElementById('globalAdulto');
const elGlobalInfantil = document.getElementById('globalInfantil');
const elGlobalTotal = document.getElementById('globalTotal');
const btnExcel = document.getElementById('btnExcel');
const btnFecharCaixa = document.getElementById('btnFecharCaixa');

// Define datas iniciais como "Hoje"
const hoje = new Date();
if(document.getElementById('dateInput')) document.getElementById('dateInput').valueAsDate = hoje;
if(dateStart) dateStart.valueAsDate = hoje;
if(dateEnd) dateEnd.valueAsDate = hoje;

// --- 3. LÓGICA DE FORMULÁRIO ---
if(paymentType) {
    paymentType.addEventListener('change', (e) => {
        const tipo = e.target.value;
        if(tipo === 'cortesia' || tipo === 'estoque' || tipo === 'defeito') {
            directorGroup.classList.remove('hidden');
            directorInput.setAttribute('required', 'true');
            if(tipo === 'estoque') {
                lblDirector.innerText = 'Observação (Ex: Saldo Inicial)';
                directorInput.placeholder = 'Descrição da entrada...';
            } else if (tipo === 'defeito') {
                lblDirector.innerText = 'Motivo do Defeito';
                directorInput.placeholder = 'Ex: Rasgou, falha no fecho...';
            } else {
                lblDirector.innerText = 'Nome do Diretor';
                directorInput.placeholder = 'Quem liberou?';
            }
        } else {
            directorGroup.classList.add('hidden');
            directorInput.removeAttribute('required');
            directorInput.value = '';
        }
    });
}

// --- 4. FUNÇÃO SALVAR ---
if(salesForm) {
    salesForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const date = document.getElementById('dateInput').value;
        const qtdA = parseInt(qtdAdultoInput.value) || 0;
        const qtdI = parseInt(qtdInfantilInput.value) || 0;
        const type = paymentType.value;
        const director = directorInput.value;
        const idToEdit = editIdInput.value;

        if(qtdA === 0 && qtdI === 0) {
            alert("Preencha a quantidade.");
            return;
        }

        const dados = {
            data: date,
            qtdAdulto: qtdA,
            qtdInfantil: qtdI,
            tipo: type,
            diretor: (['cortesia', 'estoque', 'defeito'].includes(type)) ? director : null,
            created_at: new Date()
        };

        try {
            if (idToEdit) {
                await updateDoc(doc(db, "vendas", idToEdit), dados);
                alert("Atualizado com sucesso!");
            } else {
                await addDoc(collection(db, "vendas"), dados);
                alert("Registrado com sucesso!");
            }
            resetFormMode();
            carregarResumo(dateStart.value, dateEnd.value);
            calcularEstoqueGeral();
        } catch (error) {
            console.error(error);
            alert("Erro ao salvar.");
        }
    });
}

function resetFormMode() {
    salesForm.reset();
    editIdInput.value = '';
    btnSubmit.innerText = 'Registrar';
    btnSubmit.classList.remove('btn-warning');
    formTitle.innerText = 'Novo Lançamento';
    btnCancelEdit.classList.add('hidden');
    document.getElementById('dateInput').valueAsDate = new Date();
    directorGroup.classList.add('hidden');
    qtdAdultoInput.value = 0;
    qtdInfantilInput.value = 0;
}

if(btnCancelEdit) btnCancelEdit.addEventListener('click', resetFormMode);

// --- 5. CÁLCULO DE ESTOQUE (COM ANTERIOR E ATUAL) ---
async function calcularEstoqueGeral() {
    let saldoA = 0;
    let saldoI = 0;
    
    // Variáveis para guardar o "Estoque Anterior/Inicial"
    let saldoInicialA = 0;
    let saldoInicialI = 0;

    let dataCorte = "2000-01-01"; 

    // 1. Busca último fechamento (que agora será o de 30/11)
    try {
        const qFechamento = query(collection(db, "fechamentos"), orderBy("data", "desc"), limit(1));
        const snapshotFechamento = await getDocs(qFechamento);

        if (!snapshotFechamento.empty) {
            const fechamento = snapshotFechamento.docs[0].data();
            
            saldoInicialA = fechamento.saldoAdulto;
            saldoInicialI = fechamento.saldoInfantil;
            
            // O saldo começa igual ao inicial
            saldoA = saldoInicialA;
            saldoI = saldoInicialI;
            
            dataCorte = fechamento.data;
        }
    } catch (e) {
        console.log("Sem fechamento anterior.");
    }

    // 2. Busca apenas as vendas DEPOIS da data de corte
    const qVendas = query(collection(db, "vendas"), where("data", ">", dataCorte));
    const snapshotVendas = await getDocs(qVendas);

    snapshotVendas.forEach((doc) => {
        const item = doc.data();
        const valA = item.qtdAdulto || 0;
        const valI = item.qtdInfantil || 0;

        if (item.tipo === 'estoque') {
            saldoA += valA;
            saldoI += valI;
        } else {
            saldoA -= valA;
            saldoI -= valI;
        }
    });

    // 3. Atualiza a tela (Elementos precisam existir)
    const elA = document.getElementById('stockAdulto');
    const elI = document.getElementById('stockInfantil');
    
    if(elA && elI) {
        elA.innerText = saldoA;
        elI.innerText = saldoI;

        // Saldo Anterior
        const elIniA = document.getElementById('stockAdultoIni');
        const elIniI = document.getElementById('stockInfantilIni');
        if(elIniA) elIniA.innerText = saldoInicialA;
        if(elIniI) elIniI.innerText = saldoInicialI;

        // Cores e Alertas
        elA.style.color = saldoA < 0 ? '#ef4444' : (saldoA <= LIMITE_ALERTA ? '#ef4444' : '#10b981');
        elI.style.color = saldoI < 0 ? '#ef4444' : (saldoI <= LIMITE_ALERTA ? '#ef4444' : '#3b82f6');
        
        if(saldoA <= LIMITE_ALERTA) cardPanelAdulto.classList.add('low-stock-alert');
        else cardPanelAdulto.classList.remove('low-stock-alert');

        if(saldoI <= LIMITE_ALERTA) cardPanelInfantil.classList.add('low-stock-alert');
        else cardPanelInfantil.classList.remove('low-stock-alert');
    }
}

// --- 6. FUNÇÃO CONSOLIDAR (Volta ao modo normal) ---
if(btnFecharCaixa) {
    btnFecharCaixa.addEventListener('click', async () => {
        const elA = document.getElementById('stockAdulto').innerText;
        const elI = document.getElementById('stockInfantil').innerText;
        const dataHoje = new Date().toISOString().split('T')[0];

        if(!confirm(`Deseja fechar o caixa HOJE (${dataHoje})?\nIsso atualizará o Saldo Anterior para: A:${elA} / I:${elI}`)) {
            return;
        }

        try {
            await addDoc(collection(db, "fechamentos"), {
                data: dataHoje,
                saldoAdulto: parseInt(elA),
                saldoInfantil: parseInt(elI),
                criadoEm: new Date()
            });
            alert("Fechamento realizado com sucesso!");
            location.reload(); 
        } catch (e) {
            console.error(e);
            alert("Erro ao fechar caixa.");
        }
    });
}

// --- 7. EXPORTAR PARA EXCEL ---
if(btnExcel) {
    btnExcel.addEventListener('click', async () => {
        const inicio = dateStart.value;
        const fim = dateEnd.value;
        
        const q = query(collection(db, "vendas"), where("data", ">=", inicio), where("data", "<=", fim), orderBy("data", "desc"));
        const querySnapshot = await getDocs(q);

        let csv = "DATA;TIPO;QTD ADULTO;QTD INFANTIL;DETALHE;DIRETOR\n";
        querySnapshot.forEach((doc) => {
            const item = doc.data();
            const dataF = item.data.split('-').reverse().join('/');
            const obs = (item.diretor || '').replace(/;/g, ' ');
            csv += `${dataF};${item.tipo};${item.qtdAdulto||0};${item.qtdInfantil||0};${item.tipo};${obs}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `relatorio_${inicio}_${fim}.csv`;
        link.click();
    });
}

// --- 8. RELATÓRIO E TABELAS ---
async function carregarResumo(inicio, fim) {
    if(printPeriod) printPeriod.innerText = `Período: ${inicio.split('-').reverse().join('/')} até ${fim.split('-').reverse().join('/')}`;

    const q = query(collection(db, "vendas"), where("data", ">=", inicio), where("data", "<=", fim), orderBy("data", "desc"));
    const querySnapshot = await getDocs(q);

    let totais = { dinheiro: {a:0,i:0}, cartao: {a:0,i:0}, pix: {a:0,i:0}, cortesia: {a:0,i:0}, defeito: {a:0,i:0} };
    let totalGlobalA = 0, totalGlobalI = 0;
    let lista = [];

    querySnapshot.forEach((doc) => lista.push({id: doc.id, ...doc.data()}));
    
    // Ordenação
    lista.sort((a, b) => {
        if (a.tipo === 'estoque' && b.tipo !== 'estoque') return -1;
        if (b.tipo === 'estoque' && a.tipo !== 'estoque') return 1;
        return 0;
    });

    if(tbodyAdulto) tbodyAdulto.innerHTML = ''; 
    if(tbodyInfantil) tbodyInfantil.innerHTML = '';

    lista.forEach((item) => {
        const qtdA = item.qtdAdulto || 0;
        const qtdI = item.qtdInfantil || 0;
        
        if (item.tipo !== 'estoque') {
            if(totais[item.tipo]) { totais[item.tipo].a += qtdA; totais[item.tipo].i += qtdI; }
            totalGlobalA += qtdA; 
            totalGlobalI += qtdI;
        }

        let tipoLabel = item.tipo.toUpperCase();
        let rowColor = ''; 
        let detalhe = '-';

        if(item.tipo === 'estoque') {
            rowColor = 'background-color: #dcfce7; font-weight: bold;';
            tipoLabel = '🟢 ENTRADA'; 
            detalhe = item.diretor || 'Manual';
        } else if (item.tipo === 'cortesia') detalhe = `Lib: ${item.diretor}`;
        else if (item.tipo === 'defeito') {
            rowColor = 'background-color: #fef2f2; color: #ef4444;';
            tipoLabel = '⚠️ DEFEITO'; 
            detalhe = item.diretor || 'Motivo n/d';
        }

        const createRow = (qtd, isInfantil) => {
            const tr = document.createElement('tr');
            tr.style = rowColor;
            tr.innerHTML = `
                <td>${item.data.split('-').reverse().slice(0, 2).join('/')}</td>
                <td>${tipoLabel}</td>
                <td style="font-weight:bold; ${isInfantil ? 'color:#3b82f6':''}">${qtd}</td>
                <td style="font-size:0.85em; color:#555">${detalhe}</td>
                <td class="no-print action-buttons">
                    <button class="btn-icon edit" data-id="${item.id}"><span class="material-icons-round">edit</span></button>
                    <button class="btn-icon delete" data-id="${item.id}"><span class="material-icons-round">delete</span></button>
                </td>`;
            return tr;
        };

        if (tbodyAdulto && qtdA > 0) tbodyAdulto.appendChild(createRow(qtdA, false));
        if (tbodyInfantil && qtdI > 0) tbodyInfantil.appendChild(createRow(qtdI, true));
    });

    if(elGlobalAdulto) elGlobalAdulto.innerText = totalGlobalA; 
    if(elGlobalInfantil) elGlobalInfantil.innerText = totalGlobalI; 
    if(elGlobalTotal) elGlobalTotal.innerText = totalGlobalA + totalGlobalI;

    const renderStat = (d) => `
        <div class="stat-values">
            <div class="stat-row"><small>A:</small><span class="val-adulto">${d.a}</span></div>
            <div class="stat-row"><small style="color:var(--info)">I:</small><span class="val-infantil">${d.i}</span></div>
            <div class="stat-row val-total"><small>Tot:</small><strong>${d.a + d.i}</strong></div>
        </div>`;
    
    const setHtml = (id, content) => { if(document.getElementById(id)) document.getElementById(id).innerHTML = content; };
    setHtml('resDinheiro', renderStat(totais.dinheiro));
    setHtml('resCartao', renderStat(totais.cartao));
    setHtml('resPix', renderStat(totais.pix));
    setHtml('resCortesia', renderStat(totais.cortesia));
    setHtml('resDefeito', renderStat(totais.defeito));

    // Eventos de botões dinâmicos
    document.querySelectorAll('.btn-icon.delete').forEach(btn => {
        btn.addEventListener('click', async () => { 
            if(confirm("Deseja realmente excluir este registro?")) { 
                await deleteDoc(doc(db, "vendas", btn.getAttribute('data-id'))); 
                carregarResumo(dateStart.value, dateEnd.value); 
                calcularEstoqueGeral(); 
            }
        });
    });

    document.querySelectorAll('.btn-icon.edit').forEach(btn => {
        btn.addEventListener('click', () => { 
            const item = lista.find(v => v.id === btn.getAttribute('data-id'));
            if(item) {
                editIdInput.value = item.id; 
                document.getElementById('dateInput').value = item.data;
                qtdAdultoInput.value = item.qtdAdulto || 0; 
                qtdInfantilInput.value = item.qtdInfantil || 0;
                paymentType.value = item.tipo; 
                paymentType.dispatchEvent(new Event('change'));
                if(item.diretor) directorInput.value = item.diretor;
                btnSubmit.innerText = 'Salvar Alteração'; 
                btnSubmit.classList.add('btn-warning');
                formTitle.innerText = 'Editando Registro'; 
                btnCancelEdit.classList.remove('hidden');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });
}

if(btnFilter) btnFilter.addEventListener('click', () => { 
    carregarResumo(dateStart.value, dateEnd.value); 
});

// INICIALIZAÇÃO
calcularEstoqueGeral();
carregarResumo(dateStart.value, dateEnd.value);