import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

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

// --- 2. ELEMENTOS DO DOM ---
const salesForm = document.getElementById('salesForm');
const paymentType = document.getElementById('paymentType');
const directorGroup = document.getElementById('directorGroup');
const directorInput = document.getElementById('directorInput');
const btnFilter = document.getElementById('btnFilter');
const dateStart = document.getElementById('dateStart');
const dateEnd = document.getElementById('dateEnd');
const tableBody = document.querySelector('#reportTable tbody');
const editIdInput = document.getElementById('editId');
const btnSubmit = document.getElementById('btnSubmit');
const btnCancelEdit = document.getElementById('btnCancelEdit');
const formTitle = document.getElementById('formTitle');
const lblDirector = document.querySelector('#directorGroup label');

// Define datas iniciais como "Hoje"
const hoje = new Date();
document.getElementById('dateInput').valueAsDate = hoje;
dateStart.valueAsDate = hoje;
dateEnd.valueAsDate = hoje;

// --- 3. LÓGICA VISUAL (FORMULÁRIO) ---

// Mostrar/Ocultar Campo de Descrição (Diretor ou Obs de Estoque)
paymentType.addEventListener('change', (e) => {
    const tipo = e.target.value;
    
    // Mostra o campo se for Cortesia OU Estoque
    if(tipo === 'cortesia' || tipo === 'estoque') {
        directorGroup.classList.remove('hidden');
        directorInput.setAttribute('required', 'true');
        
        // Customiza o texto para fazer sentido
        if(tipo === 'estoque') {
            lblDirector.innerText = 'Observação (Ex: Saldo Inicial)';
            directorInput.placeholder = 'Descrição da entrada...';
        } else {
            lblDirector.innerText = 'Nome do Diretor (Autorização)';
            directorInput.placeholder = 'Quem liberou?';
        }
    } else {
        directorGroup.classList.add('hidden');
        directorInput.removeAttribute('required');
        directorInput.value = '';
    }
});

// --- 4. SALVAR OU EDITAR (CRUD) ---
salesForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const date = document.getElementById('dateInput').value;
    const quantity = parseInt(document.getElementById('quantityInput').value);
    const type = paymentType.value;
    const director = directorInput.value;
    const idToEdit = editIdInput.value; // Se tiver ID, é edição

    // Prepara o objeto para salvar
    const dados = {
        data: date,
        qtd: quantity,
        tipo: type,
        // Salva a descrição se for cortesia OU estoque
        diretor: (type === 'cortesia' || type === 'estoque') ? director : null,
        created_at: new Date() // Atualiza data de modificação
    };

    try {
        if (idToEdit) {
            // MODO EDIÇÃO (UPDATE)
            await updateDoc(doc(db, "vendas", idToEdit), dados);
            alert("Registro atualizado com sucesso!");
            resetFormMode(); // Sai do modo edição
        } else {
            // MODO CRIAÇÃO (CREATE)
            await addDoc(collection(db, "vendas"), dados);
            alert("Registro salvo!");
            salesForm.reset();
            // Reseta padrões
            document.getElementById('dateInput').valueAsDate = new Date();
            directorGroup.classList.add('hidden');
        }

        // Atualiza a tela
        carregarResumo(dateStart.value, dateEnd.value);
        calcularEstoqueGeral();

    } catch (error) {
        console.error("Erro ao salvar: ", error);
        alert("Erro ao processar a solicitação.");
    }
});

// --- 5. FUNÇÕES AUXILIARES ---

// Resetar o formulário para o estado inicial
function resetFormMode() {
    salesForm.reset();
    editIdInput.value = '';
    btnSubmit.innerText = 'Registrar';
    btnSubmit.classList.remove('btn-warning'); // Remove cor amarela
    formTitle.innerText = 'Novo Lançamento';
    btnCancelEdit.classList.add('hidden');
    document.getElementById('dateInput').valueAsDate = new Date();
    directorGroup.classList.add('hidden');
}

// Botão Cancelar Edição
btnCancelEdit.addEventListener('click', resetFormMode);

// --- 6. CÁLCULO DE ESTOQUE (SALDO GERAL) ---
async function calcularEstoqueGeral() {
    // Busca TODAS as movimentações do banco (sem filtro de data)
    const q = query(collection(db, "vendas"));
    const querySnapshot = await getDocs(q);
    
    let entrada = 0;
    let saida = 0;

    querySnapshot.forEach((doc) => {
        const item = doc.data();
        if (item.tipo === 'estoque') {
            entrada += item.qtd;
        } else {
            // Qualquer outro tipo (Dinheiro, Pix, Cortesia) conta como saída
            saida += item.qtd;
        }
    });

    const saldo = entrada - saida;
    const elSaldo = document.getElementById('stockBalance');
    elSaldo.innerText = saldo;
    
    // Formatação visual (Verde se positivo, Vermelho se negativo)
    if(saldo < 0) {
        elSaldo.style.color = '#ef4444';
    } else {
        elSaldo.style.color = '#10b981';
    }
}

// --- 7. RELATÓRIO E TABELA (COM ORDENAÇÃO DE ESTOQUE) ---
async function carregarResumo(inicio, fim) {
    // Busca dados dentro do período selecionado
    const q = query(
        collection(db, "vendas"), 
        where("data", ">=", inicio),
        where("data", "<=", fim),
        orderBy("data", "desc") // Primeiro ordena por data
    );
    
    const querySnapshot = await getDocs(q);

    // Variáveis para o Dashboard
    let totais = { dinheiro: 0, cartao: 0, pix: 0, cortesia: 0 };
    let totalGeralSaida = 0;
    
    // 1. Transforma o snapshot em uma lista (array) para poder reordenar via JS
    let listaVendas = [];
    querySnapshot.forEach((doc) => {
        listaVendas.push({ id: doc.id, ...doc.data() });
    });

    // 2. ORDENAÇÃO ESPECIAL: Estoque sempre no topo
    listaVendas.sort((a, b) => {
        // Se 'a' é estoque e 'b' não é, 'a' vem primeiro
        if (a.tipo === 'estoque' && b.tipo !== 'estoque') return -1;
        // Se 'b' é estoque e 'a' não é, 'b' vem primeiro
        if (b.tipo === 'estoque' && a.tipo !== 'estoque') return 1;
        // Caso contrário, mantém a ordem original (que já é data desc)
        return 0;
    });

    // Limpa a tabela antes de preencher
    tableBody.innerHTML = '';

    // 3. Renderiza a tabela
    listaVendas.forEach((item) => {
        const id = item.id;
        
        // Formata data de "2025-11-24" para "24/11"
        const dataFormatada = item.data.split('-').reverse().slice(0, 2).join('/');

        // Se NÃO for estoque, soma nos totais de saída (Dashboard)
        if (item.tipo !== 'estoque') {
            if (totais[item.tipo] !== undefined) totais[item.tipo] += item.qtd;
            totalGeralSaida += item.qtd;
        }

        // --- Montagem da Linha da Tabela ---
        const tr = document.createElement('tr');
        
        // Define o rótulo e estilo da linha
        let tipoLabel = item.tipo.toUpperCase();
        let rowColor = ''; 
        let detalhe = '-';

        if(item.tipo === 'estoque') {
            rowColor = 'background-color: #dcfce7; font-weight: bold;'; // Destaque Verde
            tipoLabel = '🟢 ENTRADA ESTOQUE';
            detalhe = item.diretor ? item.diretor : 'Entrada Manual';
        } else if (item.tipo === 'cortesia') {
            detalhe = `Liberado por: ${item.diretor}`;
        }

        tr.style = rowColor;
        tr.innerHTML = `
            <td>${dataFormatada}</td>
            <td>${tipoLabel}</td>
            <td style="font-size:1.1em">${item.qtd}</td>
            <td style="font-size:0.85em; color:#555">${detalhe}</td>
            <td class="no-print action-buttons">
                <button class="btn-icon edit" data-id="${id}" data-obj='${JSON.stringify(item)}' title="Editar">
                    <span class="material-icons-round">edit</span>
                </button>
                <button class="btn-icon delete" data-id="${id}" title="Excluir">
                    <span class="material-icons-round">delete</span>
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    // Atualiza os boxes do Dashboard
    document.getElementById('resDinheiro').innerText = totais.dinheiro;
    document.getElementById('resCartao').innerText = totais.cartao;
    document.getElementById('resPix').innerText = totais.pix;
    document.getElementById('resCortesia').innerText = totais.cortesia;
    document.getElementById('totalGeral').innerText = totalGeralSaida;

    // --- RE-ADICIONAR EVENTOS AOS BOTÕES DA TABELA ---
    
    // Botão Excluir
    document.querySelectorAll('.btn-icon.delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            if(confirm("Tem certeza que deseja excluir este registro? Essa ação ajustará o estoque.")) {
                const id = btn.getAttribute('data-id');
                await deleteDoc(doc(db, "vendas", id));
                // Recarrega tudo
                carregarResumo(dateStart.value, dateEnd.value);
                calcularEstoqueGeral();
            }
        });
    });

    // Botão Editar
    document.querySelectorAll('.btn-icon.edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const dataObj = JSON.parse(btn.getAttribute('data-obj'));
            const id = btn.getAttribute('data-id');

            // Preenche o formulário com os dados existentes
            editIdInput.value = id;
            document.getElementById('dateInput').value = dataObj.data;
            document.getElementById('quantityInput').value = dataObj.qtd;
            paymentType.value = dataObj.tipo;
            
            // Aciona o evento 'change' manualmente para mostrar os campos corretos
            const event = new Event('change');
            paymentType.dispatchEvent(event);

            // Preenche o campo de texto se necessário
            if(dataObj.tipo === 'cortesia' || dataObj.tipo === 'estoque') {
                directorInput.value = dataObj.diretor;
            }

            // Muda visual do botão para "Modo Edição"
            btnSubmit.innerText = 'Salvar Alteração';
            btnSubmit.classList.add('btn-warning');
            formTitle.innerText = 'Editando Registro';
            btnCancelEdit.classList.remove('hidden');

            // Rola a tela para o topo
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

// Botão Filtrar
btnFilter.addEventListener('click', () => {
    carregarResumo(dateStart.value, dateEnd.value);
});

// Inicialização ao abrir a página
calcularEstoqueGeral();
carregarResumo(dateStart.value, dateEnd.value);