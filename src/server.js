const express = require('express');
const helmet = require('helmet');
const crypto = require('crypto');
const path = require('path');
const XLSX = require('xlsx');
const db = require('./db');
const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_RECOVERY_PASSWORD = process.env.ADMIN_RECOVERY_PASSWORD || '';
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
const passwordMatches = (password, storedHash) => {
    if (!storedHash) return false;
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const expected = Buffer.from(key, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};
const recoveryPasswordMatches = (password) => {
    const provided = crypto.createHash('sha256').update(password).digest();
    const configured = crypto.createHash('sha256').update(ADMIN_RECOVERY_PASSWORD).digest();
    return Boolean(ADMIN_RECOVERY_PASSWORD) && crypto.timingSafeEqual(provided, configured);
};
if (!db.prepare("SELECT value FROM settings WHERE key='operator_password_hash'").get()) {
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('operator_password_hash', hashPassword(process.env.OPERATOR_PASSWORD || '1234'));
}
const sessions = new Map();
const sessionRoles = new Map();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fail = (res, message, status = 400) => res.status(status).json({ error: message });
const auth = (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const expiry = sessions.get(token);
    if (!expiry || expiry < Date.now()) { sessions.delete(token); return fail(res, 'Sessão expirada. Entre novamente.', 401); }
    req.role = sessionRoles.get(token) || 'operator';
    next();
};
app.post('/api/login', (req, res) => {
    const password = String(req.body?.password || '');
    const operatorHash = db.prepare("SELECT value FROM settings WHERE key='operator_password_hash'").get().value;
    const role = recoveryPasswordMatches(password) ? 'admin' : passwordMatches(password, operatorHash) ? 'operator' : '';
    if (!role) return fail(res, 'Senha incorreta.', 401);
    const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, Date.now() + 8 * 60 * 60 * 1000); sessionRoles.set(token, role);
    res.json({ token, role, expiresIn: 28800 });
});
app.use('/api', (req, res, next) => req.path === '/login' ? next() : auth(req, res, next));
app.put('/api/admin/operator-password', (req, res) => {
    if (req.role !== 'admin') return fail(res, 'Apenas a conta de administração pode alterar a senha do operador.', 403);
    const password = String(req.body?.password || '');
    if (password.length < 8 || password.length > 200) return fail(res, 'A senha deve ter entre 8 e 200 caracteres.');
    db.prepare("UPDATE settings SET value=? WHERE key='operator_password_hash'").run(hashPassword(password));
    res.json({ ok: true });
});

// Acervo
app.get('/api/books', (req, res) => {
    const { code, author, title, category, q } = req.query;
    let sql = 'SELECT * FROM books WHERE 1=1'; const args = [];
    for (const [key, value] of Object.entries({ code, author, title, category })) if (value) { sql += ` AND ${key} LIKE ?`; args.push(`%${value}%`); }
    if (q) { sql += ' AND (code LIKE ? OR author LIKE ? OR title LIKE ? OR category LIKE ?)'; args.push(...Array(4).fill(`%${q}%`)); }
    sql += ' ORDER BY title COLLATE NOCASE'; res.json(db.prepare(sql).all(...args));
});
app.get('/api/books/:id', (req, res) => { const row = db.prepare('SELECT * FROM books WHERE id=?').get(req.params.id); row ? res.json(row) : fail(res, 'Livro não encontrado.', 404); });
app.post('/api/books', (req, res) => {
    const b = req.body || {}; const required = ['code', 'author', 'title', 'total'];
    if (required.some(k => !String(b[k] ?? '').trim())) return fail(res, 'Preencha código, autor, título e volumes existentes.');
    const total = Number(b.total); if (!Number.isInteger(total) || total < 1 || total > 99) return fail(res, 'Volumes existentes deve estar entre 01 e 99.');
    try { const info = db.prepare(`INSERT INTO books(code,author,title,publisher,section,category,total,available) VALUES(?,?,?,?,?,?,?,?)`).run(String(b.code).trim(), String(b.author).trim(), String(b.title).trim(), b.publisher || '', b.section || '', b.category || '', total, total); res.status(201).json(db.prepare('SELECT * FROM books WHERE id=?').get(info.lastInsertRowid)); }
    catch (e) { return fail(res, e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'Já existe um livro com esse código.' : 'Não foi possível salvar o livro.'); }
});
app.put('/api/books/:id', (req, res) => {
    const b = req.body || {}, old = db.prepare('SELECT * FROM books WHERE id=?').get(req.params.id); if (!old) return fail(res, 'Livro não encontrado.', 404);
    const total = Number(b.total); const borrowed = old.total - old.available;
    if (!Number.isInteger(total) || total < 1 || total > 99 || total < borrowed) return fail(res, `Volumes existentes deve ser de 1 a 99 e não pode ser menor que os ${borrowed} emprestados.`);
    try { db.prepare('UPDATE books SET code=?,author=?,title=?,publisher=?,section=?,category=?,total=?,available=? WHERE id=?').run(b.code, b.author, b.title, b.publisher || '', b.section || '', b.category || '', total, total - borrowed, req.params.id); res.json(db.prepare('SELECT * FROM books WHERE id=?').get(req.params.id)); }
    catch (e) { return fail(res, e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'Já existe um livro com esse código.' : 'Não foi possível atualizar.'); }
});
app.delete('/api/books/:id', (req, res) => { const active = db.prepare("SELECT COUNT(*) n FROM loans WHERE book_id=? AND status='active'").get(req.params.id).n; if (active) return fail(res, 'Não é possível excluir: existem empréstimos ativos deste livro.'); const r = db.prepare('DELETE FROM books WHERE id=?').run(req.params.id); r.changes ? res.json({ ok: true }) : fail(res, 'Livro não encontrado.', 404); });

// Alunos
app.get('/api/students', (req, res) => { const { enrollment, name, q } = req.query; let sql = 'SELECT * FROM students WHERE 1=1', a = []; if (enrollment) { sql += ' AND enrollment LIKE ?'; a.push(`%${enrollment}%`); } if (name) { sql += ' AND name LIKE ?'; a.push(`%${name}%`); } if (q) { sql += ' AND (enrollment LIKE ? OR name LIKE ?)'; a.push(`%${q}%`, `%${q}%`); } res.json(db.prepare(sql + ' ORDER BY name COLLATE NOCASE').all(...a)); });
app.get('/api/students/:id', (req, res) => { const s = db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id); s ? res.json(s) : fail(res, 'Aluno não encontrado.', 404); });
app.post('/api/students', (req, res) => { const s = req.body || {}; if (!/^\d{1,10}$/.test(String(s.enrollment || '')) || !s.name?.trim()) return fail(res, 'Matrícula numérica (até 10 dígitos) e nome são obrigatórios.'); const keys = ['enrollment', 'name', 'birth', 'class_name', 'street', 'number', 'complement', 'neighborhood', 'city', 'father', 'father_phone', 'mother', 'mother_phone', 'guardian', 'guardian_phone']; try { const info = db.prepare(`INSERT INTO students(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map(k => s[k] || '')); res.status(201).json(db.prepare('SELECT * FROM students WHERE id=?').get(info.lastInsertRowid)); } catch (e) { return fail(res, e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'Já existe aluno com essa matrícula.' : 'Não foi possível salvar o aluno.'); } });
app.put('/api/students/:id', (req, res) => { const s = req.body || {}; const keys = ['enrollment', 'name', 'birth', 'class_name', 'street', 'number', 'complement', 'neighborhood', 'city', 'father', 'father_phone', 'mother', 'mother_phone', 'guardian', 'guardian_phone']; try { const r = db.prepare(`UPDATE students SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`).run(...keys.map(k => s[k] || ''), req.params.id); if (!r.changes) return fail(res, 'Aluno não encontrado.', 404); res.json(db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id)); } catch (e) { return fail(res, e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'Já existe aluno com essa matrícula.' : 'Não foi possível atualizar.'); } });
app.delete('/api/students/:id', (req, res) => { const active = db.prepare("SELECT COUNT(*) n FROM loans WHERE student_id=? AND status='active'").get(req.params.id).n; if (active) return fail(res, 'O aluno possui empréstimo pendente e não pode ser excluído.'); const r = db.prepare('DELETE FROM students WHERE id=?').run(req.params.id); r.changes ? res.json({ ok: true }) : fail(res, 'Aluno não encontrado.', 404); });

// Empréstimos, devoluções e renovações
app.get('/api/students/:id/loans', (req, res) => { const rows = db.prepare(`SELECT l.*, b.code,b.author,b.title,b.section,b.category,b.publisher,s.enrollment,s.name,s.class_name FROM loans l JOIN books b ON b.id=l.book_id JOIN students s ON s.id=l.student_id WHERE l.student_id=? ORDER BY l.borrowed_at DESC,l.id DESC`).all(req.params.id); res.json(rows.map(l => ({ ...l, late: l.status === 'active' && (l.renewed_due_at || l.due_at) < today() }))); });
app.post('/api/loans', (req, res) => { const { studentId, bookId } = req.body || {}; const s = db.prepare('SELECT * FROM students WHERE id=?').get(studentId), b = db.prepare('SELECT * FROM books WHERE id=?').get(bookId); if (!s || !b) return fail(res, 'Selecione um aluno e um livro válidos.'); if (db.prepare("SELECT COUNT(*) n FROM loans WHERE student_id=? AND status='active'").get(studentId).n) return fail(res, 'Empréstimo não liberado: o aluno já possui um livro pendente.'); if (b.available < 1) return fail(res, 'Não há volumes disponíveis deste título.'); const date = today(); const tx = db.transaction(() => { const info = db.prepare("INSERT INTO loans(student_id,book_id,borrowed_at,due_at,status) VALUES(?,?,?,?, 'active')").run(studentId, bookId, date, addDays(date, 7)); db.prepare('UPDATE books SET available=available-1 WHERE id=?').run(bookId); return info.lastInsertRowid; }); const id = tx(); res.status(201).json(db.prepare('SELECT * FROM loans WHERE id=?').get(id)); });
app.post('/api/loans/:id/return', (req, res) => { const l = db.prepare("SELECT * FROM loans WHERE id=? AND status='active'").get(req.params.id); if (!l) return fail(res, 'Empréstimo ativo não encontrado.'); const tx = db.transaction(() => { db.prepare("UPDATE loans SET status='returned',returned_at=? WHERE id=?").run(today(), l.id); db.prepare('UPDATE books SET available=available+1 WHERE id=?').run(l.book_id); }); tx(); res.json({ ok: true }); });
app.post('/api/loans/:id/renew', (req, res) => { const l = db.prepare("SELECT * FROM loans WHERE id=? AND status='active'").get(req.params.id); if (!l) return fail(res, 'Empréstimo ativo não encontrado.'); if (l.renewed_at) return fail(res, 'Este empréstimo já teve sua única renovação.'); const date = today(); db.prepare('UPDATE loans SET renewed_at=?,renewed_due_at=? WHERE id=?').run(date, addDays(date, 7), l.id); res.json({ ok: true }); });
app.get('/api/reports/overdue', (req, res) => { const rows = db.prepare(`SELECT s.enrollment,s.name,s.class_name,s.father,s.father_phone,s.mother,s.mother_phone,s.guardian,s.guardian_phone,b.code,b.author,b.title,l.borrowed_at,l.due_at,l.renewed_at,l.renewed_due_at FROM loans l JOIN students s ON s.id=l.student_id JOIN books b ON b.id=l.book_id WHERE l.status='active' AND COALESCE(l.renewed_due_at,l.due_at) < ? ORDER BY COALESCE(l.renewed_due_at,l.due_at)`).all(today()); res.json(rows); });
app.get('/api/dashboard', (req, res) => res.json({ books: db.prepare('SELECT COUNT(*) n FROM books').get().n, students: db.prepare('SELECT COUNT(*) n FROM students').get().n, active: db.prepare("SELECT COUNT(*) n FROM loans WHERE status='active'").get().n, overdue: db.prepare("SELECT COUNT(*) n FROM loans WHERE status='active' AND COALESCE(renewed_due_at,due_at) < ?").get(today()).n }));

// Importação de planilhas XLSX/CSV, sem alterar volumes disponíveis manualmente.
app.post('/api/import/:type', (req, res) => { const { type } = req.params; const { rows } = req.body || {}; if (!['books', 'students'].includes(type) || !Array.isArray(rows)) return fail(res, 'Arquivo ou tipo de importação inválido.'); let imported = 0, skipped = 0; const tx = db.transaction(() => { for (const r of rows) { try { if (type === 'books') { const total = Number(r.total ?? r['VOLUMES EXISTENTES'] ?? r.volumes_existentes); const code = r.code ?? r['CÓDIGO'] ?? r.codigo; const author = r.author ?? r['AUTOR']; const title = r.title ?? r['TÍTULO']; if (!code || !author || !title || !Number.isInteger(total) || total < 1 || total > 99) throw Error(); db.prepare('INSERT INTO books(code,author,title,publisher,section,category,total,available) VALUES(?,?,?,?,?,?,?,?)').run(String(code), String(author), String(title), r.publisher ?? r['EDITORA/EDIÇÃO'] ?? '', r.section ?? r['SEÇÃO'] ?? '', r.category ?? r['CATEGORIA'] ?? '', total, total); } else { const enrollment = r.enrollment ?? r['MATRÍCULA'] ?? r.matricula; const name = r.name ?? r['NOME']; if (!/^\d{1,10}$/.test(String(enrollment || '')) || !name) throw Error(); db.prepare('INSERT INTO students(enrollment,name,birth,class_name) VALUES(?,?,?,?)').run(String(enrollment), String(name), r.birth ?? r['NASCIMENTO'] ?? '', r.class_name ?? r['TURMA'] ?? ''); } imported++; } catch { skipped++; } } }); tx(); res.json({ imported, skipped }); });
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.listen(PORT, () => console.log(`SAB disponível em http://localhost:${PORT}`));
