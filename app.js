import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// CONFIGURAÇÃO
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

// ELEMENTOS
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

// Inputs de Quantidade
const qtdAdultoInput = document.getElementById('qtdAdultoInput');
const qtdInfantilInput = document.getElementById('qtdInfantilInput');

// Tabelas Separadas
const tbodyAdulto = document.querySelector('#tableAdulto tbody');
const tbodyInfantil = document.querySelector('#tableInfantil tbody');

// Data Inicial
const hoje = new Date();
document.getElementById('dateInput').valueAsDate = hoje;
dateStart.valueAsDate = hoje;
dateEnd.valueAsDate = hoje;

// Lógica de Campos
paymentType.addEventListener('change', (e) => {
    const tipo = e.target.value;
    if(tipo === 'cortesia' || tipo === 'estoque') {
        directorGroup.classList.remove('hidden');
        directorInput.setAttribute('required', 'true');
        if(tipo === 'estoque') {
            lblDirector.innerText = 'Observação (Ex: Saldo Inicial)';
            directorInput.placeholder = 'Descrição...';
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

// --- SALVAR ---
salesForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const date = document.getElementById('dateInput').value;
    const qtdA = parseInt(qtdAdultoInput.value) || 0;
    const qtdI = parseInt(qtdInfantilInput.value) || 0;
    const type = paymentType.value;
    const director = directorInput.value;
    const idToEdit = editIdInput.value;

    if(qtdA === 0 && qtdI === 0) {
        alert("Preencha a quantidade de pelo menos um tipo.");
        return;
    }

    const dados = {
        data: date,
        qtdAdulto: qtdA,
        qtdInfantil: qtdI,
        tipo: type,
        diretor: (type === 'cortesia' || type === 'estoque') ? director : null,
        created_at: new Date()
    };

    try {
        if (idToEdit) {
            await updateDoc(doc(db, "vendas", idToEdit), dados);
            alert("Atualizado!");
            resetFormMode();
        } else {
            await addDoc(collection(db, "vendas"), dados);
            alert("Salvo!");
            salesForm.reset();
            document.getElementById('dateInput').valueAsDate = new Date();
            directorGroup.classList.add('hidden');
            qtdAdultoInput.value = 0;
            qtdInfantilInput.value = 0;
        }
        carregarResumo(dateStart.value, dateEnd.value);
        calcularEstoqueGeral();
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar.");
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

// --- ESTOQUE ---
async function calcularEstoqueGeral() {
    const q = query(collection(db, "vendas"));
    const querySnapshot = await getDocs(q);
    
    let entradaA = 0, saidaA = 0;
    let entradaI = 0, saidaI = 0;

    querySnapshot.forEach((doc) => {
        const item = doc.data();
        const valA = item.qtdAdulto || 0;
        const valI = item.qtdInfantil || 0;

        if (item.tipo === 'estoque') {
            entradaA += valA;
            entradaI += valI;
        } else {
            saidaA += valA;
            saidaI += valI;
        }
    });

    const saldoA = entradaA - saidaA;
    const saldoI = entradaI - saidaI;

    const elA = document.getElementById('stockAdulto');
    const elI = document.getElementById('stockInfantil');

    elA.innerText = saldoA;
    elI.innerText = saldoI;
    
    elA.style.color = saldoA < 0 ? '#ef4444' : '#10b981';
    elI.style.color = saldoI < 0 ? '#ef4444' : '#3b82f6';
}

// --- RELATÓRIO SEPARADO ---
async function carregarResumo(inicio, fim) {
    const q = query(
        collection(db, "vendas"), 
        where("data", ">=", inicio),
        where("data", "<=", fim),
        orderBy("data", "desc")
    );
    
    const querySnapshot = await getDocs(q);

    // Totais do Dashboard (Financeiro Geral)
    let totais = { dinheiro: 0, cartao: 0, pix: 0, cortesia: 0 };
    let listaVendas = [];

    querySnapshot.forEach((doc) => {
        listaVendas.push({ id: doc.id, ...doc.data() });
    });

    // Ordena: Estoque no topo
    listaVendas.sort((a, b) => {
        if (a.tipo === 'estoque' && b.tipo !== 'estoque') return -1;
        if (b.tipo === 'estoque' && a.tipo !== 'estoque') return 1;
        return 0;
    });

    // Limpa as DUAS tabelas
    tbodyAdulto.innerHTML = '';
    tbodyInfantil.innerHTML = '';

    listaVendas.forEach((item) => {
        const dataFormatada = item.data.split('-').reverse().slice(0, 2).join('/');
        const qtdA = item.qtdAdulto || 0;
        const qtdI = item.qtdInfantil || 0;
        
        // Soma no dashboard financeiro (pagamentos)
        if (item.tipo !== 'estoque') {
            if (totais[item.tipo] !== undefined) totais[item.tipo] += (qtdA + qtdI);
        }

        // Define estilos comuns
        let tipoLabel = item.tipo.toUpperCase();
        let rowColor = ''; 
        let detalhe = '-';

        if(item.tipo === 'estoque') {
            rowColor = 'background-color: #dcfce7; font-weight: bold;';
            tipoLabel = '🟢 ENTRADA';
            detalhe = item.diretor ? item.diretor : 'Manual';
        } else if (item.tipo === 'cortesia') {
            detalhe = `Lib: ${item.diretor}`;
        }

        // --- LÓGICA DE SEPARAÇÃO ---

        // 1. Se tem movimento de Adulto, adiciona na Tabela Adulto
        if (qtdA > 0) {
            const trA = document.createElement('tr');
            trA.style = rowColor;
            trA.innerHTML = `
                <td>${dataFormatada}</td>
                <td>${tipoLabel}</td>
                <td style="font-weight:bold; font-size:1.1em">${qtdA}</td>
                <td style="font-size:0.85em; color:#555">${detalhe}</td>
                <td class="no-print action-buttons">
                    <button class="btn-icon edit" data-id="${item.id}"><span class="material-icons-round">edit</span></button>
                    <button class="btn-icon delete" data-id="${item.id}"><span class="material-icons-round">delete</span></button>
                </td>
            `;
            tbodyAdulto.appendChild(trA);
        }

        // 2. Se tem movimento Infantil, adiciona na Tabela Infantil
        if (qtdI > 0) {
            const trI = document.createElement('tr');
            trI.style = rowColor;
            trI.innerHTML = `
                <td>${dataFormatada}</td>
                <td>${tipoLabel}</td>
                <td style="font-weight:bold; font-size:1.1em; color:#3b82f6">${qtdI}</td>
                <td style="font-size:0.85em; color:#555">${detalhe}</td>
                <td class="no-print action-buttons">
                    <button class="btn-icon edit" data-id="${item.id}"><span class="material-icons-round">edit</span></button>
                    <button class="btn-icon delete" data-id="${item.id}"><span class="material-icons-round">delete</span></button>
                </td>
            `;
            tbodyInfantil.appendChild(trI);
        }
    });

    // Atualiza Dashboard
    document.getElementById('resDinheiro').innerText = totais.dinheiro;
    document.getElementById('resCartao').innerText = totais.cartao;
    document.getElementById('resPix').innerText = totais.pix;
    document.getElementById('resCortesia').innerText = totais.cortesia;
    
    // RECONECTA BOTÕES (EDITAR/EXCLUIR)
    // Obs: Como o botão pode aparecer em duas tabelas com o mesmo ID,
    // usamos a classe genérica para pegar todos de uma vez.
    
    document.querySelectorAll('.btn-icon.delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            if(confirm("Excluir este registro? (Isso removerá de ambas as listas se for misto)")) {
                await deleteDoc(doc(db, "vendas", btn.getAttribute('data-id')));
                carregarResumo(dateStart.value, dateEnd.value);
                calcularEstoqueGeral();
            }
        });
    });

    document.querySelectorAll('.btn-icon.edit').forEach(btn => {
        btn.addEventListener('click', () => {
            // Precisamos achar o objeto na listaVendas pelo ID (pois o botão não tem o objeto full mais)
            const id = btn.getAttribute('data-id');
            const item = listaVendas.find(v => v.id === id);

            if(item) {
                editIdInput.value = id;
                document.getElementById('dateInput').value = item.data;
                qtdAdultoInput.value = item.qtdAdulto || 0;
                qtdInfantilInput.value = item.qtdInfantil || 0;
                paymentType.value = item.tipo;
                const event = new Event('change');
                paymentType.dispatchEvent(event);
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