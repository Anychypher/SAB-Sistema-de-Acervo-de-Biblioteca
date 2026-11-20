/*
 * SAB — Sistema de Acervo de Biblioteca
 * Front-end: JavaScript puro
 *
 * Organização:
 * 1. Estado, API e utilitários
 * 2. Autenticação e navegação
 * 3. Painel inicial
 * 4. Livros e alunos
 * 5. Empréstimos e histórico
 * 6. Relatórios
 * 7. Importação de dados
 */

// ============================================================
// 1. ESTADO, API E UTILITÁRIOS
// ============================================================

const $ = (selector) => document.querySelector(selector);

let token = sessionStorage.getItem('sab-token') || '';
let role = sessionStorage.getItem('sab-role') || '';

let editing = null;
let recordType = null;

let cachedStudents = [];
let cachedBooks = [];

// Comunicação com a API
const api = async (url, options = {}) => {
    const response = await fetch('/api' + url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw Error(data.error || 'Erro na operação.');
    }

    return data;
};

// Escapa caracteres HTML para evitar inserção indevida de marcação.
const esc = (value) => {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
};

// Exibe notificações
const toast = (message) => {
    const element = $('#toast');

    element.textContent = message;
    element.classList.add('show');

    setTimeout(() => {
        element.classList.remove('show');
    }, 3000);
};

// Exibe mensagens de erro
const showError = (element, message) => {
    element.textContent = message;
};


// ============================================================
// 2. AUTENTICAÇÃO E NAVEGAÇÃO
// ============================================================

// Mostra a tela de login
function login() {
    $('#login').classList.remove('hidden');
    $('#app').classList.add('hidden');
}

// Entra no sistema
function enter() {
    $('#admin-nav').classList.toggle('hidden', role !== 'admin');
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');

    navigate('home');
    loadDashboard();
}

// Evento de login
$('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                password: $('#password').value
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw Error(data.error);
        }

        token = data.token;
        role = data.role;

        sessionStorage.setItem('sab-token', token);
        sessionStorage.setItem('sab-role', role);

        $('#login-error').textContent = '';

        enter();

    } catch (error) {
        showError($('#login-error'), error.message);
    }
});

// Verifica se existe uma sessão ativa
if (token) {
    api('/dashboard')
        .then(enter)
        .catch(() => {
            sessionStorage.removeItem('sab-token');
            sessionStorage.removeItem('sab-role');
            token = '';
            role = '';
            login();
        });
} else {
    login();
}

// Logout
$('#logout').onclick = () => {
    token = '';

    sessionStorage.removeItem('sab-token');
    sessionStorage.removeItem('sab-role');
    role = '';
    $('#admin-nav').classList.add('hidden');

    login();
};

// Navegação entre páginas
function navigate(page) {
    document.querySelectorAll('.page').forEach((element) => {
        element.classList.toggle(
            'active',
            element.id === `page-${page}`
        );
    });

    document.querySelectorAll('.nav [data-page]').forEach((button) => {
        button.classList.toggle(
            'active',
            button.dataset.page === page
        );
    });

    if (page === 'books') loadBooks();
    if (page === 'students') loadStudents();
    if (page === 'loans') loadLoanOptions();
    if (page === 'reports') loadReport();
    if (page === 'admin' && role !== 'admin') navigate('home');
}

$('#operator-password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('#new-operator-password').value;
    const confirmation = $('#confirm-operator-password').value;
    const message = $('#admin-message');
    message.textContent = '';
    if (password !== confirmation) {
        message.textContent = 'As senhas não coincidem.';
        return;
    }
    try {
        await api('/admin/operator-password', {
            method: 'PUT',
            body: JSON.stringify({ password })
        });
        event.target.reset();
        message.textContent = 'Senha do operador atualizada.';
    } catch (error) {
        message.textContent = error.message;
    }
});

$('#download-backup').addEventListener('click', async () => {
    const message = $('#backup-message');
    message.textContent = 'Preparando backup...';
    try {
        const response = await fetch('/api/admin/backup', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw Error(data.error || 'Não foi possível baixar o backup.');
        }
        const file = await response.blob();
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sab-backup-${new Date().toISOString().slice(0, 10)}.sqlite`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        message.textContent = 'Backup baixado. Guarde o arquivo em local seguro, separado deste computador.';
    } catch (error) {
        message.textContent = error.message;
    }
});

// Eventos dos botões de navegação
document.querySelectorAll('[data-page]').forEach((button) => {
    button.onclick = () => navigate(button.dataset.page);
});

document.querySelectorAll('[data-go]').forEach((button) => {
    button.onclick = () => navigate(button.dataset.go);
});
// ============================================================
// 3. PAINEL INICIAL
// ============================================================

// Carrega os indicadores do painel
async function loadDashboard() {
    try {
        const data = await api('/dashboard');

        const stats = [
            ['Títulos cadastrados', data.books],
            ['Alunos cadastrados', data.students],
            ['Empréstimos ativos', data.active],
            ['Em atraso', data.overdue]
        ];

        $('#stats').innerHTML = stats.map(([label, number]) => `
            <div class="stat">
                <span>${label}</span>
                <strong>${number}</strong>
            </div>
        `).join('');

    } catch (error) {
        toast(error.message);
    }
}

// Exibe uma mensagem quando uma tabela não possui registros
function renderEmpty(tbody, columns, message) {
    tbody.innerHTML = `
        <tr>
            <td colspan="${columns}" class="empty">
                ${message}
            </td>
        </tr>
    `;
}


// ============================================================
// 4. LIVROS E ALUNOS
// ============================================================

// ------------------------------------------------------------
// LIVROS
// ------------------------------------------------------------

// Carrega os livros cadastrados
async function loadBooks(query = '') {
    try {
        const endpoint = '/books' +
            (query ? '?q=' + encodeURIComponent(query) : '');

        cachedBooks = await api(endpoint);

        const body = $('#books-body');

        if (!cachedBooks.length) {
            return renderEmpty(body, 9, 'Nenhum título encontrado.');
        }

        body.innerHTML = cachedBooks.map((book) => `
            <tr>
                <td><strong>${esc(book.code)}</strong></td>
                <td>${esc(book.title)}</td>
                <td>${esc(book.author)}</td>
                <td>${esc(book.section)}</td>
                <td>${esc(book.category)}</td>
                <td>${esc(book.publisher)}</td>
                <td>${String(book.total).padStart(2, '0')}</td>
                <td>
                    <strong>
                        ${String(book.available).padStart(2, '0')}
                    </strong>
                </td>
                <td>
                    <button class="btn" data-edit-book="${book.id}">
                        Editar
                    </button>
                </td>
            </tr>
        `).join('');

        body.querySelectorAll('[data-edit-book]').forEach((button) => {
            button.onclick = () => {
                openBook(Number(button.dataset.editBook));
            };
        });

    } catch (error) {
        toast(error.message);
    }
}

// Pesquisa de livros
$('#book-search-btn').onclick = () => {
    loadBooks($('#book-search').value.trim());
};

$('#book-search').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        loadBooks(event.target.value.trim());
    }
});

// Novo livro
$('#new-book').onclick = () => openBook();

// Campos do formulário de livros
const bookFields = [
    ['code', 'Código', 'text', true],
    ['author', 'Autor', 'text', true],
    ['title', 'Título', 'text', true],
    ['publisher', 'Editora/edição', 'text'],
    ['section', 'Seção', 'text'],
    ['category', 'Categoria', 'text'],
    ['total', 'Volumes existentes', 'number', true]
];

// ------------------------------------------------------------
// ALUNOS
// ------------------------------------------------------------

// Campos do formulário de alunos
const studentFields = [
    ['enrollment', 'Matrícula (até 10 dígitos)', 'text', true],
    ['name', 'Nome completo', 'text', true],
    ['birth', 'Nascimento', 'date'],
    ['class_name', 'Turma', 'text'],
    ['street', 'Rua', 'text'],
    ['number', 'Número', 'text'],
    ['complement', 'Complemento', 'text'],
    ['neighborhood', 'Bairro', 'text'],
    ['city', 'Município', 'text'],
    ['father', 'Nome do pai', 'text'],
    ['father_phone', 'Telefone do pai', 'tel'],
    ['mother', 'Nome da mãe', 'text'],
    ['mother_phone', 'Telefone da mãe', 'tel'],
    ['guardian', 'Outro responsável', 'text'],
    ['guardian_phone', 'Telefone do responsável', 'tel']
];

// Gera os campos HTML dos formulários
function fieldHtml([key, label, type = 'text', required = false]) {
    const wide = [
        'title',
        'publisher',
        'street',
        'father',
        'mother',
        'guardian'
    ].includes(key);

    return `
        <label class="field ${wide ? 'wide' : ''}">
            ${label}

            <input
                name="${key}"
                type="${type}"
                ${required ? 'required' : ''}
                ${key === 'total' ? 'min="1" max="99"' : ''}
                ${key === 'enrollment'
                    ? 'maxlength="10" inputmode="numeric"'
                    : ''}
            >
        </label>
    `;
}

// Abre o formulário de livros
async function openBook(id = null) {
    editing = id;
    recordType = 'books';

    $('#dialog-title').textContent = id
        ? 'Editar título'
        : 'Inserir título';

    $('#dialog-eyebrow').textContent = 'ACERVO';

    $('#dialog-fields').innerHTML = bookFields
        .map(fieldHtml)
        .join('');

    $('#delete-record').classList.toggle('hidden', !id);
    $('#form-error').textContent = '';

    if (id) {
        const book = await api('/books/' + id);

        Object.entries(book).forEach(([key, value]) => {
            const field = $(`[name="${key}"]`);

            if (field) {
                field.value = value;
            }
        });
    }

    $('#record-dialog').showModal();
}

// Abre o formulário de alunos
async function openStudent(id = null) {
    editing = id;
    recordType = 'students';

    $('#dialog-title').textContent = id
        ? 'Editar cadastro de aluno'
        : 'Inserir aluno';

    $('#dialog-eyebrow').textContent = 'CADASTRO DE ALUNO';

    $('#dialog-fields').innerHTML = studentFields
        .map(fieldHtml)
        .join('');

    $('#delete-record').classList.toggle('hidden', !id);
    $('#form-error').textContent = '';

    if (id) {
        const student = await api('/students/' + id);

        Object.entries(student).forEach(([key, value]) => {
            const field = $(`[name="${key}"]`);

            if (field) {
                field.value = value;
            }
        });
    }

    $('#record-dialog').showModal();
}

// Novo aluno
$('#new-student').onclick = () => openStudent();

// Fechar formulário
$('#dialog-close').onclick = $('#cancel-dialog').onclick = () => {
    $('#record-dialog').close();
};

// Salvar livro ou aluno
$('#record-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = Object.fromEntries(
        new FormData(event.target).entries()
    );

    try {
        await api(
            '/' + recordType + (editing ? '/' + editing : ''),
            {
                method: editing ? 'PUT' : 'POST',
                body: JSON.stringify(data)
            }
        );

        $('#record-dialog').close();

        toast('Registro salvo com sucesso.');

        if (recordType === 'books') {
            loadBooks($('#book-search').value);
        } else {
            loadStudents($('#student-search').value);
        }

        loadDashboard();

    } catch (error) {
        showError($('#form-error'), error.message);
    }
});

// Excluir livro ou aluno
$('#delete-record').onclick = async () => {
    if (!editing || !confirm('Confirma a exclusão deste registro?')) {
        return;
    }

    try {
        await api('/' + recordType + '/' + editing, {
            method: 'DELETE'
        });

        $('#record-dialog').close();

        toast('Registro excluído.');

        if (recordType === 'books') {
            loadBooks();
        } else {
            loadStudents();
        }

        loadDashboard();

    } catch (error) {
        showError($('#form-error'), error.message);
    }
};

// Carrega os alunos cadastrados
async function loadStudents(query = '') {
    try {
        const endpoint = '/students' +
            (query ? '?q=' + encodeURIComponent(query) : '');

        cachedStudents = await api(endpoint);

        const body = $('#students-body');

        if (!cachedStudents.length) {
            return renderEmpty(body, 6, 'Nenhum aluno encontrado.');
        }

        body.innerHTML = cachedStudents.map((student) => `
            <tr>
                <td>${esc(student.enrollment)}</td>
                <td><strong>${esc(student.name)}</strong></td>
                <td>${esc(student.birth)}</td>
                <td>${esc(student.class_name)}</td>
                <td>${esc(student.city)}</td>
                <td>
                    <button
                        class="btn"
                        data-edit-student="${student.id}"
                    >
                        Editar
                    </button>

                    <button
                        class="btn"
                        data-history-student="${student.id}"
                    >
                        Histórico
                    </button>
                </td>
            </tr>
        `).join('');

        body.querySelectorAll('[data-edit-student]').forEach((button) => {
            button.onclick = () => {
                openStudent(Number(button.dataset.editStudent));
            };
        });

        body.querySelectorAll('[data-history-student]').forEach((button) => {
            button.onclick = () => {
                navigate('loans');

                $('#loan-student-search').value =
                    button.closest('tr').children[0].textContent;

                loadStudentHistory();
            };
        });

    } catch (error) {
        toast(error.message);
    }
}

// Pesquisa de alunos
$('#student-search-btn').onclick = () => {
    loadStudents($('#student-search').value.trim());
};

$('#student-search').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        loadStudents(event.target.value.trim());
    }
});
// ============================================================
// 5. EMPRÉSTIMOS, DEVOLUÇÕES E HISTÓRICO
// ============================================================

// Carrega as opções de alunos e livros disponíveis
async function loadLoanOptions() {
    try {
        [cachedStudents, cachedBooks] = await Promise.all([
            api('/students'),
            api('/books')
        ]);

        $('#loan-student').innerHTML = `
            <option value="">Selecione o aluno</option>
        ` + cachedStudents.map((student) => `
            <option value="${student.id}">
                ${esc(student.enrollment)} — ${esc(student.name)}
            </option>
        `).join('');

        $('#loan-book').innerHTML = `
            <option value="">Selecione um livro disponível</option>
        ` + cachedBooks
            .filter((book) => book.available > 0)
            .map((book) => `
                <option value="${book.id}">
                    ${esc(book.title)} — ${esc(book.author)}
                    (${book.available} disponível(is))
                </option>
            `).join('');

    } catch (error) {
        toast(error.message);
    }
}

// Registrar empréstimo
$('#loan-form').onsubmit = async (event) => {
    event.preventDefault();

    try {
        await api('/loans', {
            method: 'POST',
            body: JSON.stringify({
                studentId: Number($('#loan-student').value),
                bookId: Number($('#loan-book').value)
            })
        });

        toast('Empréstimo realizado. Prazo de devolução: 7 dias.');

        event.target.reset();

        loadLoanOptions();
        loadDashboard();

    } catch (error) {
        toast(error.message);
    }
};

// Eventos da pesquisa de histórico
$('#load-student-loans').onclick = loadStudentHistory;

$('#loan-student-search').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        loadStudentHistory();
    }
});

// Pesquisa o aluno para consultar seu histórico
async function loadStudentHistory() {
    const query = $('#loan-student-search').value.trim();

    if (!query) {
        return toast('Informe a matrícula ou o nome do aluno.');
    }

    try {
        const students = await api(
            '/students?q=' + encodeURIComponent(query)
        );

        if (!students.length) {
            $('#loan-student-info').innerHTML = `
                <p class="empty">Aluno não encontrado.</p>
            `;

            $('#loan-pending').innerHTML = '';
            $('#loan-history').innerHTML = '';

            return;
        }

        // Quando há mais de um resultado, permite escolher o aluno
        if (students.length > 1) {
            $('#loan-student-info').innerHTML = `
                <p>
                    Foram encontrados vários alunos.
                    Refine a pesquisa:
                </p>
            ` + students.map((student) => `
                <button
                    class="btn choose-student"
                    data-id="${student.id}"
                >
                    ${esc(student.enrollment)} — ${esc(student.name)}
                </button>
            `).join('');

            document.querySelectorAll('.choose-student').forEach((button) => {
                button.onclick = () => {
                    showHistory(Number(button.dataset.id));
                };
            });

            return;
        }

        await showHistory(students[0].id);

    } catch (error) {
        toast(error.message);
    }
}

// Exibe os empréstimos ativos e o histórico do aluno
async function showHistory(id) {
    try {
        const [student, loans] = await Promise.all([
            api('/students/' + id),
            api('/students/' + id + '/loans')
        ]);

        $('#loan-student-info').innerHTML = `
            <div class="panel">
                <strong>${esc(student.name)}</strong>
                · Matrícula ${esc(student.enrollment)}
                · Turma ${esc(student.class_name)}
            </div>
        `;

        const active = loans.filter((loan) => {
            return loan.status === 'active';
        });

        const history = loans.filter((loan) => {
            return loan.status !== 'active';
        });

        // Empréstimos pendentes
        $('#loan-pending').innerHTML = `
            <h3 class="subheading">Pendências</h3>
        ` + (
            active.length
                ? `
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Título</th>
                                    <th>Retirada</th>
                                    <th>Devolução prevista</th>
                                    <th>Renovação</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>

                            <tbody>
                                ${active.map((loan) => `
                                    <tr>
                                        <td>${esc(loan.code)}</td>
                                        <td>${esc(loan.title)}</td>
                                        <td>${esc(loan.borrowed_at)}</td>
                                        <td>
                                            ${esc(
                                                loan.renewed_due_at || loan.due_at
                                            )}
                                        </td>
                                        <td>${esc(loan.renewed_at || '—')}</td>
                                        <td>
                                            <span class="pill ${loan.late ? 'late' : ''}">
                                                ${loan.late ? 'Em atraso' : 'No prazo'}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                class="btn"
                                                data-return="${loan.id}"
                                            >
                                                Devolver
                                            </button>

                                            <button
                                                class="btn"
                                                data-renew="${loan.id}"
                                                ${loan.renewed_at ? 'disabled' : ''}
                                            >
                                                Renovar
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `
                : `
                    <p class="muted">
                        Nenhuma pendência.
                        O aluno está liberado para empréstimo.
                    </p>
                `
        );

        // Histórico de empréstimos finalizados
        $('#loan-history').innerHTML = `
            <h3 class="subheading">Histórico de empréstimos</h3>
        ` + (
            history.length
                ? `
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Título</th>
                                    <th>Retirada</th>
                                    <th>Prevista</th>
                                    <th>Devolvido em</th>
                                </tr>
                            </thead>

                            <tbody>
                                ${history.map((loan) => `
                                    <tr>
                                        <td>${esc(loan.code)}</td>
                                        <td>${esc(loan.title)}</td>
                                        <td>${esc(loan.borrowed_at)}</td>
                                        <td>
                                            ${esc(
                                                loan.renewed_due_at || loan.due_at
                                            )}
                                        </td>
                                        <td>${esc(loan.returned_at)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `
                : `
                    <p class="muted">
                        Ainda não há empréstimos finalizados.
                    </p>
                `
        );

        // Evento de devolução
        document.querySelectorAll('[data-return]').forEach((button) => {
            button.onclick = async () => {
                if (!confirm('Confirmar a devolução deste exemplar?')) {
                    return;
                }

                try {
                    await api(
                        '/loans/' + button.dataset.return + '/return',
                        { method: 'POST' }
                    );

                    toast('Devolução registrada.');

                    showHistory(id);
                    loadLoanOptions();
                    loadDashboard();

                } catch (error) {
                    toast(error.message);
                }
            };
        });

        // Evento de renovação
        document.querySelectorAll('[data-renew]').forEach((button) => {
            button.onclick = async () => {
                if (!confirm(
                    'Confirmar a única renovação por mais sete dias?'
                )) {
                    return;
                }

                try {
                    await api(
                        '/loans/' + button.dataset.renew + '/renew',
                        { method: 'POST' }
                    );

                    toast('Empréstimo renovado por mais sete dias.');

                    showHistory(id);

                } catch (error) {
                    toast(error.message);
                }
            };
        });

    } catch (error) {
        toast(error.message);
    }
}
// ============================================================
// 6. RELATÓRIOS
// ============================================================

// Carrega o relatório de empréstimos em atraso
async function loadReport() {
    try {
        const rows = await api('/reports/overdue');

        $('#report-content').innerHTML = rows.length
            ? `
                <table>
                    <thead>
                        <tr>
                            <th>Matrícula / aluno</th>
                            <th>Turma</th>
                            <th>Responsáveis / contato</th>
                            <th>Código / título</th>
                            <th>Retirada</th>
                            <th>Devolução prevista</th>
                            <th>Renovação</th>
                            <th>Nova previsão</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${rows.map((row) => `
                            <tr>
                                <td>
                                    <strong>${esc(row.enrollment)}</strong>
                                    <br>
                                    ${esc(row.name)}
                                </td>

                                <td>${esc(row.class_name)}</td>

                                <td>
                                    ${esc(row.father)}
                                    ${esc(row.father_phone)}
                                    <br>

                                    ${esc(row.mother)}
                                    ${esc(row.mother_phone)}
                                    <br>

                                    ${esc(row.guardian)}
                                    ${esc(row.guardian_phone)}
                                </td>

                                <td>
                                    ${esc(row.code)}
                                    <br>
                                    ${esc(row.title)}
                                    <br>
                                    ${esc(row.author)}
                                </td>

                                <td>${esc(row.borrowed_at)}</td>
                                <td>${esc(row.due_at)}</td>
                                <td>${esc(row.renewed_at || '—')}</td>
                                <td>${esc(row.renewed_due_at || '—')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `
            : `
                <div class="empty">
                    Não há empréstimos em atraso no momento.
                </div>
            `;

    } catch (error) {
        toast(error.message);
    }
}

// Imprimir relatório
$('#print-report').onclick = () => {
    window.print();
};


// ============================================================
// 7. IMPORTAÇÃO DE DADOS
// ============================================================

// Importa arquivos CSV ou XLSX
async function importFile(file, type) {
    if (!file) return;

    try {
        let rows;

        // Importação CSV
        if (file.name.toLowerCase().endsWith('.csv')) {
            const content = await file.text();

            const lines = content
                .replace(/^\uFEFF/, '')
                .split(/\r?\n/)
                .filter(Boolean);

            const separator = lines[0].includes(';') ? ';' : ',';

            const headers = lines.shift()
                .split(separator)
                .map((value) => {
                    return value.trim().replace(/^"|"$/g, '');
                });

            rows = lines.map((line) => {
                const values = line
                    .split(separator)
                    .map((value) => {
                        return value.trim().replace(/^"|"$/g, '');
                    });

                return Object.fromEntries(
                    headers.map((header, index) => [
                        header,
                        values[index] || ''
                    ])
                );
            });

        } else {
            // Importação XLSX
            if (!window.XLSX) {
                throw Error(
                    'Para importar XLSX, a biblioteca SheetJS não está carregada. Exporte a planilha para CSV.'
                );
            }

            const workbook = XLSX.read(
                await file.arrayBuffer(),
                { type: 'array' }
            );

            rows = XLSX.utils.sheet_to_json(
                workbook.Sheets[workbook.SheetNames[0]],
                { defval: '' }
            );
        }

        // Envia os registros para a API
        const result = await api('/import/' + type, {
            method: 'POST',
            body: JSON.stringify({ rows })
        });

        toast(
            `Importação concluída: ${result.imported} incluído(s), ` +
            `${result.skipped} ignorado(s).`
        );

        if (type === 'books') {
            loadBooks();
        } else {
            loadStudents();
        }

        loadDashboard();

    } catch (error) {
        toast(error.message);
    }
}

// Eventos de importação
$('#book-import').onchange = (event) => {
    importFile(event.target.files[0], 'books');
};

$('#student-import').onchange = (event) => {
    importFile(event.target.files[0], 'students');
};
