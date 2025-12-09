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

// Inputs de Quantidade
const qtdAdultoInput = document.getElementById('qtdAdultoInput');
const qtdInfantilInput = document.getElementById('qtdInfantilInput');

// Tabelas
const tbodyAdulto = document.querySelector('#tableAdulto tbody');
const tbodyInfantil = document.querySelector('#tableInfantil tbody');

// Painéis de Estoque
const cardPanelAdulto = document.getElementById('cardPanelAdulto');
const cardPanelInfantil = document.getElementById('cardPanelInfantil');

// Elementos de Totais Gerais
const elGlobalAdulto = document.getElementById('globalAdulto');
const elGlobalInfantil = document.getElementById('globalInfantil');
const elGlobalTotal = document.getElementById('globalTotal');

// Botões de Ação
const btnExcel = document.getElementById('btnExcel');
const btnFecharCaixa = document.getElementById('btnFecharCaixa');

// Define datas iniciais como "Hoje"
const hoje = new Date();
document.getElementById('dateInput').valueAsDate = hoje;
dateStart.valueAsDate = hoje;
dateEnd.valueAsDate = hoje;

// --- 3. LÓGICA DE FORMULÁRIO ---
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

// --- 4. FUNÇÃO SALVAR (CRIAR OU EDITAR) ---
salesForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const date = document.getElementById('dateInput').value;
    const qtdA = parseInt(qtdAdultoInput.value) || 0;
    const qtdI = parseInt(qtdInfantilInput.value) || 0;
    const type = paymentType.value;
    const director = directorInput.value;
    const idToEdit = editIdInput.value;

    if(qtdA === 0 && qtdI === 0) {
        alert("Por favor, preencha a quantidade de pelo menos um tipo de pulseira.");
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
            alert("Registro atualizado com sucesso!");
            resetFormMode();
        } else {
            await addDoc(collection(db, "vendas"), dados);
            alert("Registro salvo com sucesso!");
            resetFormMode();
        }
        
        carregarResumo(dateStart.value, dateEnd.value);
        calcularEstoqueGeral();

    } catch (error) {
        console.error("Erro ao salvar: ", error);
        alert("Erro ao processar a solicitação.");
    }
});

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

btnCancelEdit.addEventListener('click', resetFormMode);

// --- 5. CÁLCULO DE ESTOQUE (COM ANTERIOR E ATUAL) ---
async function calcularEstoqueGeral() {
    let saldoA = 0;
    let saldoI = 0;
    
    // Variáveis para guardar o "Estoque Anterior/Inicial" (Base do cálculo)
    let saldoInicialA = 0;
    let saldoInicialI = 0;

    let dataCorte = "2000-01-01"; 

    // 1. Busca se existe um Fechamento (Arquivo) anterior
    try {
        const qFechamento = query(collection(db, "fechamentos"), orderBy("data", "desc"), limit(1));
        const snapshotFechamento = await getDocs(qFechamento);

        if (!snapshotFechamento.empty) {
            const fechamento = snapshotFechamento.docs[0].data();
            
            // Define o saldo inicial baseado no arquivo
            saldoInicialA = fechamento.saldoAdulto;
            saldoInicialI = fechamento.saldoInfantil;
            
            // O saldo corrente começa igual ao inicial
            saldoA = saldoInicialA;
            saldoI = saldoInicialI;
            
            dataCorte = fechamento.data;
        }
    } catch (e) {
        console.log("Nenhum fechamento anterior encontrado, calculando do zero.");
    }

    // 2. Busca apenas as vendas DEPOIS da data de corte
    const qVendas = query(collection(db, "vendas"), where("data", ">", dataCorte));
    const snapshotVendas = await getDocs(qVendas);

    snapshotVendas.forEach((doc) => {
        const item = doc.data();
        const valA = item.qtdAdulto || 0;
        const valI = item.qtdInfantil || 0;

        if (item.tipo === 'estoque') {
            // Se for entrada manual, soma ao ATUAL apenas
            saldoA += valA;
            saldoI += valI;
        } else {
            // Vendas diminuem o atual
            saldoA -= valA;
            saldoI -= valI;
        }
    });

    // 3. Atualiza a tela (ATUAL)
    const elA = document.getElementById('stockAdulto');
    const elI = document.getElementById('stockInfantil');
    elA.innerText = saldoA;
    elI.innerText = saldoI;

    // 4. Atualiza a tela (ANTERIOR / INICIAL)
    document.getElementById('stockAdultoIni').innerText = saldoInicialA;
    document.getElementById('stockInfantilIni').innerText = saldoInicialI;

    // Lógica de Alerta Visual
    if(saldoA <= LIMITE_ALERTA) cardPanelAdulto.classList.add('low-stock-alert');
    else cardPanelAdulto.classList.remove('low-stock-alert');

    if(saldoI <= LIMITE_ALERTA) cardPanelInfantil.classList.add('low-stock-alert');
    else cardPanelInfantil.classList.remove('low-stock-alert');

    // Cores do Texto
    elA.style.color = saldoA < 0 ? '#ef4444' : (saldoA <= LIMITE_ALERTA ? '#ef4444' : '#10b981');
    elI.style.color = saldoI < 0 ? '#ef4444' : (saldoI <= LIMITE_ALERTA ? '#ef4444' : '#3b82f6');
}

// --- 6. FUNÇÃO PARA CONSOLIDAR (ARQUIVAR) ESTOQUE ---
if(btnFecharCaixa) {
    btnFecharCaixa.addEventListener('click', async () => {
        const elA = document.getElementById('stockAdulto').innerText;
        const elI = document.getElementById('stockInfantil').innerText;
        const dataHoje = new Date().toISOString().split('T')[0];

        if(!confirm(`ATENÇÃO: Você deseja consolidar o estoque na data de HOJE (${dataHoje})?\n\nSaldo Atual que será salvo:\nAdulto: ${elA}\nInfantil: ${elI}\n\nIsso atualizará o "Estoque Anterior" para estes valores a partir de agora.`)) {
            return;
        }

        try {
            await addDoc(collection(db, "fechamentos"), {
                data: dataHoje,
                saldoAdulto: parseInt(elA),
                saldoInfantil: parseInt(elI),
                criadoEm: new Date()
            });
            alert("Estoque consolidado com sucesso! Arquivo criado.");
            location.reload(); 
        } catch (e) {
            console.error(e);
            alert("Erro ao consolidar estoque.");
        }
    });
}

// --- 7. EXPORTAR PARA EXCEL (CSV) ---
if(btnExcel) {
    btnExcel.addEventListener('click', async () => {
        const inicio = dateStart.value;
        const fim = dateEnd.value;
        
        const q = query(
            collection(db, "vendas"), 
            where("data", ">=", inicio), 
            where("data", "<=", fim), 
            orderBy("data", "desc")
        );
        const querySnapshot = await getDocs(q);

        let csv = "DATA;TIPO;QTD ADULTO;QTD INFANTIL;DETALHE;DIRETOR/OBS\n";
        
        querySnapshot.forEach((doc) => {
            const item = doc.data();
            const dataF = item.data.split('-').reverse().join('/');
            const tipo = item.tipo.toUpperCase();
            const obs = (item.diretor || '').replace(/;/g, ' ');
            
            csv += `${dataF};${tipo};${item.qtdAdulto||0};${item.qtdInfantil||0};${tipo};${obs}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `relatorio_pulseiras_${inicio}_ate_${fim}.csv`;
        link.click();
    });
}

// --- 8. RELATÓRIO E TABELAS ---
async function carregarResumo(inicio, fim) {
    const dataInicioF = inicio.split('-').reverse().join('/');
    const dataFimF = fim.split('-').reverse().join('/');
    printPeriod.innerText = `Período: ${dataInicioF} até ${dataFimF}`;

    const q = query(
        collection(db, "vendas"), 
        where("data", ">=", inicio), 
        where("data", "<=", fim), 
        orderBy("data", "desc")
    );
    
    const querySnapshot = await getDocs(q);

    let totais = { 
        dinheiro: { a: 0, i: 0 }, 
        cartao:   { a: 0, i: 0 }, 
        pix:      { a: 0, i: 0 }, 
        cortesia: { a: 0, i: 0 },
        defeito:  { a: 0, i: 0 }
    };

    let totalGlobalA = 0; 
    let totalGlobalI = 0;
    let listaVendas = [];

    querySnapshot.forEach((doc) => {
        listaVendas.push({ id: doc.id, ...doc.data() });
    });

    listaVendas.sort((a, b) => {
        if (a.tipo === 'estoque' && b.tipo !== 'estoque') return -1;
        if (b.tipo === 'estoque' && a.tipo !== 'estoque') return 1;
        return 0;
    });

    tbodyAdulto.innerHTML = ''; 
    tbodyInfantil.innerHTML = '';

    listaVendas.forEach((item) => {
        const dataFormatada = item.data.split('-').reverse().slice(0, 2).join('/');
        const qtdA = item.qtdAdulto || 0;
        const qtdI = item.qtdInfantil || 0;
        
        if (item.tipo !== 'estoque') {
            if (totais[item.tipo]) {
                totais[item.tipo].a += qtdA;
                totais[item.tipo].i += qtdI;
            }
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
        } else if (item.tipo === 'cortesia') {
            detalhe = `Lib: ${item.diretor}`;
        } else if (item.tipo === 'defeito') {
            rowColor = 'background-color: #fef2f2; color: #ef4444;';
            tipoLabel = '⚠️ DEFEITO'; 
            detalhe = item.diretor || 'Motivo n/d';
        }

        const createRow = (qtd, isInfantil) => {
            const tr = document.createElement('tr');
            tr.style = rowColor;
            tr.innerHTML = `
                <td>${dataFormatada}</td>
                <td>${tipoLabel}</td>
                <td style="font-weight:bold; ${isInfantil ? 'color:#3b82f6':''}">${qtd}</td>
                <td style="font-size:0.85em; color:#555">${detalhe}</td>
                <td class="no-print action-buttons">
                    <button class="btn-icon edit" data-id="${item.id}"><span class="material-icons-round">edit</span></button>
                    <button class="btn-icon delete" data-id="${item.id}"><span class="material-icons-round">delete</span></button>
                </td>`;
            return tr;
        };

        if (qtdA > 0) tbodyAdulto.appendChild(createRow(qtdA, false));
        if (qtdI > 0) tbodyInfantil.appendChild(createRow(qtdI, true));
    });

    elGlobalAdulto.innerText = totalGlobalA; 
    elGlobalInfantil.innerText = totalGlobalI; 
    elGlobalTotal.innerText = totalGlobalA + totalGlobalI;

    const renderStat = (d) => `
        <div class="stat-values">
            <div class="stat-row">
                <small>Adulto:</small><span class="val-adulto">${d.a}</span>
            </div>
            <div class="stat-row">
                <small style="color:var(--info)">Infantil:</small><span class="val-infantil">${d.i}</span>
            </div>
            <div class="stat-row val-total">
                <small>Total:</small><strong>${d.a + d.i}</strong>
            </div>
        </div>`;
    
    document.getElementById('resDinheiro').innerHTML = renderStat(totais.dinheiro);
    document.getElementById('resCartao').innerHTML = renderStat(totais.cartao);
    document.getElementById('resPix').innerHTML = renderStat(totais.pix);
    document.getElementById('resCortesia').innerHTML = renderStat(totais.cortesia);
    document.getElementById('resDefeito').innerHTML = renderStat(totais.defeito);

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
            const item = listaVendas.find(v => v.id === btn.getAttribute('data-id'));
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

btnFilter.addEventListener('click', () => { 
    carregarResumo(dateStart.value, dateEnd.value); 
});

calcularEstoqueGeral();
carregarResumo(dateStart.value, dateEnd.value);