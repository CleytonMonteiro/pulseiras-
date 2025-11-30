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

// CONFIGURAÇÃO DE ALERTA (Mude este número para definir quando pisca vermelho)
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

// Painéis de Estoque (para mudar cor)
const cardPanelAdulto = document.getElementById('cardPanelAdulto');
const cardPanelInfantil = document.getElementById('cardPanelInfantil');

// Elementos de Totais Gerais (Barra Superior)
const elGlobalAdulto = document.getElementById('globalAdulto');
const elGlobalInfantil = document.getElementById('globalInfantil');
const elGlobalTotal = document.getElementById('globalTotal');

// Botões de Ação Lateral
const btnExcel = document.getElementById('btnExcel');
const btnFecharCaixa = document.getElementById('btnFecharCaixa');

// Define datas iniciais como "Hoje"
const hoje = new Date();
document.getElementById('dateInput').valueAsDate = hoje;
dateStart.valueAsDate = hoje;
dateEnd.valueAsDate = hoje;

// --- 3. LÓGICA DE FORMULÁRIO ---

// Monitora mudança no Tipo de Operação para mostrar/esconder campos
paymentType.addEventListener('change', (e) => {
    const tipo = e.target.value;
    
    // Tipos que exigem descrição/nome
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
    const idToEdit = editIdInput.value; // Se tiver ID, é edição

    if(qtdA === 0 && qtdI === 0) {
        alert("Por favor, preencha a quantidade de pelo menos um tipo de pulseira.");
        return;
    }

    const dados = {
        data: date,
        qtdAdulto: qtdA,
        qtdInfantil: qtdI,
        tipo: type,
        // Salva a observação se for um dos tipos que exige texto
        diretor: (['cortesia', 'estoque', 'defeito'].includes(type)) ? director : null,
        created_at: new Date()
    };

    try {
        if (idToEdit) {
            // MODO EDIÇÃO
            await updateDoc(doc(db, "vendas", idToEdit), dados);
            alert("Registro atualizado com sucesso!");
            resetFormMode();
        } else {
            // MODO CRIAÇÃO
            await addDoc(collection(db, "vendas"), dados);
            alert("Registro salvo com sucesso!");
            resetFormMode(); // Limpa o form
        }
        
        // Atualiza a visualização
        carregarResumo(dateStart.value, dateEnd.value);
        calcularEstoqueGeral();

    } catch (error) {
        console.error("Erro ao salvar: ", error);
        alert("Erro ao processar a solicitação.");
    }
});

// Função para Resetar o Formulário
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

// Botão Cancelar Edição
btnCancelEdit.addEventListener('click', resetFormMode);

// --- 5. CÁLCULO DE ESTOQUE (COM LÓGICA DE ARQUIVAMENTO) ---
async function calcularEstoqueGeral() {
    let saldoA = 0;
    let saldoI = 0;
    let dataCorte = "2000-01-01"; // Data padrão caso não haja arquivamento

    // 1. Busca se existe um Fechamento (Arquivo) anterior
    try {
        const qFechamento = query(collection(db, "fechamentos"), orderBy("data", "desc"), limit(1));
        const snapshotFechamento = await getDocs(qFechamento);

        if (!snapshotFechamento.empty) {
            const fechamento = snapshotFechamento.docs[0].data();
            // Começa a conta a partir do saldo salvo no arquivo
            saldoA = fechamento.saldoAdulto;
            saldoI = fechamento.saldoInfantil;
            dataCorte = fechamento.data;
            console.log(`Carregado saldo arquivado de ${dataCorte}: A:${saldoA} / I:${saldoI}`);
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
            saldoA += valA;
            saldoI += valI;
        } else {
            // Dinheiro, Pix, Cortesia e DEFEITO contam como saída do estoque
            saldoA -= valA;
            saldoI -= valI;
        }
    });

    // 3. Atualiza a tela
    const elA = document.getElementById('stockAdulto');
    const elI = document.getElementById('stockInfantil');

    elA.innerText = saldoA;
    elI.innerText = saldoI;

    // Lógica de Alerta Visual (Piscar)
    if(saldoA <= LIMITE_ALERTA) cardPanelAdulto.classList.add('low-stock-alert');
    else cardPanelAdulto.classList.remove('low-stock-alert');

    if(saldoI <= LIMITE_ALERTA) cardPanelInfantil.classList.add('low-stock-alert');
    else cardPanelInfantil.classList.remove('low-stock-alert');

    // Cores do Texto (Verde/Vermelho/Azul)
    elA.style.color = saldoA < 0 ? '#ef4444' : (saldoA <= LIMITE_ALERTA ? '#ef4444' : '#10b981');
    elI.style.color = saldoI < 0 ? '#ef4444' : (saldoI <= LIMITE_ALERTA ? '#ef4444' : '#3b82f6');
}

// --- 6. FUNÇÃO PARA CONSOLIDAR (ARQUIVAR) ESTOQUE ---
if(btnFecharCaixa) {
    btnFecharCaixa.addEventListener('click', async () => {
        const elA = document.getElementById('stockAdulto').innerText;
        const elI = document.getElementById('stockInfantil').innerText;
        const dataHoje = new Date().toISOString().split('T')[0];

        if(!confirm(`ATENÇÃO: Você deseja consolidar o estoque na data de HOJE (${dataHoje})?\n\nSaldo Atual que será salvo:\nAdulto: ${elA}\nInfantil: ${elI}\n\nIsso criará um "Marco Zero". O sistema ficará mais rápido pois não lerá vendas anteriores a esta data.`)) {
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
            location.reload(); // Recarrega a página para aplicar a nova base de cálculo
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
        
        // Busca os dados do período
        const q = query(
            collection(db, "vendas"), 
            where("data", ">=", inicio), 
            where("data", "<=", fim), 
            orderBy("data", "desc")
        );
        const querySnapshot = await getDocs(q);

        // Monta o CSV
        let csv = "DATA;TIPO;QTD ADULTO;QTD INFANTIL;DETALHE;DIRETOR/OBS\n";
        
        querySnapshot.forEach((doc) => {
            const item = doc.data();
            const dataF = item.data.split('-').reverse().join('/');
            const tipo = item.tipo.toUpperCase();
            const obs = (item.diretor || '').replace(/;/g, ' '); // Remove ponto e vírgula para não quebrar o CSV
            
            csv += `${dataF};${tipo};${item.qtdAdulto||0};${item.qtdInfantil||0};${tipo};${obs}\n`;
        });

        // Cria o download
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
    // Atualiza texto para impressão
    const dataInicioF = inicio.split('-').reverse().join('/');
    const dataFimF = fim.split('-').reverse().join('/');
    printPeriod.innerText = `Período: ${dataInicioF} até ${dataFimF}`;

    // Busca dados
    const q = query(
        collection(db, "vendas"), 
        where("data", ">=", inicio), 
        where("data", "<=", fim), 
        orderBy("data", "desc")
    );
    
    const querySnapshot = await getDocs(q);

    // Objeto para os Totais Detalhados (Dashboard)
    let totais = { 
        dinheiro: { a: 0, i: 0 }, 
        cartao:   { a: 0, i: 0 }, 
        pix:      { a: 0, i: 0 }, 
        cortesia: { a: 0, i: 0 },
        defeito:  { a: 0, i: 0 }
    };

    // Variáveis para Barra de Totais Gerais
    let totalGlobalA = 0; 
    let totalGlobalI = 0;
    
    // Lista auxiliar para ordenação
    let listaVendas = [];

    querySnapshot.forEach((doc) => {
        listaVendas.push({ id: doc.id, ...doc.data() });
    });

    // Ordenação Personalizada: Estoque sempre no topo
    listaVendas.sort((a, b) => {
        if (a.tipo === 'estoque' && b.tipo !== 'estoque') return -1;
        if (b.tipo === 'estoque' && a.tipo !== 'estoque') return 1;
        return 0;
    });

    // Limpa tabelas
    tbodyAdulto.innerHTML = ''; 
    tbodyInfantil.innerHTML = '';

    // Itera sobre os dados para preencher tudo
    listaVendas.forEach((item) => {
        const dataFormatada = item.data.split('-').reverse().slice(0, 2).join('/');
        const qtdA = item.qtdAdulto || 0;
        const qtdI = item.qtdInfantil || 0;
        
        // Lógica de Soma (Ignora Estoque para os totais de venda)
        if (item.tipo !== 'estoque') {
            if (totais[item.tipo]) {
                totais[item.tipo].a += qtdA;
                totais[item.tipo].i += qtdI;
            }
            // Soma nos globais do período
            totalGlobalA += qtdA; 
            totalGlobalI += qtdI;
        }

        // Estilos e Labels da Tabela
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

        // Função auxiliar para criar linha HTML
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

        // Adiciona nas tabelas respectivas se houver quantidade
        if (qtdA > 0) tbodyAdulto.appendChild(createRow(qtdA, false));
        if (qtdI > 0) tbodyInfantil.appendChild(createRow(qtdI, true));
    });

    // Atualiza Barra de Totais Gerais
    elGlobalAdulto.innerText = totalGlobalA; 
    elGlobalInfantil.innerText = totalGlobalI; 
    elGlobalTotal.innerText = totalGlobalA + totalGlobalI;

    // Atualiza Dashboard Detalhado (Função Render)
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

    // Reconecta eventos dos botões da tabela (Delete/Edit)
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
            // Encontra o objeto original na lista carregada
            const item = listaVendas.find(v => v.id === btn.getAttribute('data-id'));
            if(item) {
                editIdInput.value = item.id; 
                document.getElementById('dateInput').value = item.data;
                qtdAdultoInput.value = item.qtdAdulto || 0; 
                qtdInfantilInput.value = item.qtdInfantil || 0;
                
                paymentType.value = item.tipo; 
                // Dispara evento para mostrar campos corretos
                paymentType.dispatchEvent(new Event('change'));
                
                if(item.diretor) directorInput.value = item.diretor;
                
                // Ajusta UI para modo edição
                btnSubmit.innerText = 'Salvar Alteração'; 
                btnSubmit.classList.add('btn-warning');
                formTitle.innerText = 'Editando Registro'; 
                btnCancelEdit.classList.remove('hidden');
                
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });
}

// Botão Principal de Filtrar
btnFilter.addEventListener('click', () => { 
    carregarResumo(dateStart.value, dateEnd.value); 
});

// Inicialização
calcularEstoqueGeral();
carregarResumo(dateStart.value, dateEnd.value);