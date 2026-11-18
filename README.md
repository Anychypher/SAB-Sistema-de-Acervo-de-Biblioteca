# SAB — Sistema de Acervo de Biblioteca

Aplicação web para gerenciamento do acervo e da circulação de livros da biblioteca do **Colégio Estadual Humberto de A. Castelo Branco EFMT**.

O projeto foi implementado com a stack solicitada: HTML5, CSS3 e JavaScript puro no front-end; Node.js + Express no back-end; SQLite para persistência dos dados.

## Funcionalidades

### Acesso do operador
- Tela de autenticação antes de acessar as telas administrativas.
- Sessão temporária de até 8 horas.
- Senha configurável pela variável de ambiente `OPERATOR_PASSWORD`.

### Acervo
- Cadastro, consulta, edição e exclusão de títulos.
- Pesquisa por código, autor, título ou categoria.
- Campos: código, autor, título, editora/edição, seção, categoria, volumes existentes e volumes disponíveis.
- O campo de volumes disponíveis é calculado pelo sistema e não pode ser editado diretamente.
- Bloqueio de exclusão de título que possua empréstimo ativo.
- Importação de planilhas XLSX/XLS e CSV (primeira aba da planilha).

### Cadastro de alunos
- Cadastro, pesquisa, edição e exclusão.
- Pesquisa por matrícula ou parte do nome.
- Matrícula única, numérica, com até 10 dígitos.
- Dados pessoais, turma, endereço e contatos dos responsáveis.
- Importação de planilhas XLSX/XLS e CSV. A importação inicial aceita matrícula, nome, nascimento e turma; os demais campos podem ser completados na edição.

### Empréstimos
- Um empréstimo ativo por aluno.
- Prazo inicial de 7 dias corridos.
- Bloqueio de empréstimo se houver qualquer pendência ativa, mesmo que ainda esteja no prazo.
- Atualização automática dos volumes disponíveis ao emprestar e devolver.
- Devolução e histórico por aluno.
- Uma única renovação por empréstimo, por mais 7 dias.
- Identificação automática de empréstimos em atraso.

### Relatório de devedores
- Lista os empréstimos ativos cuja data de devolução efetiva (a data renovada, quando houver) já passou.
- Exibe dados do aluno, responsáveis, livro, retirada, vencimento e renovação.
- Layout de impressão preparado para papel A4; a orientação pode ser escolhida no diálogo de impressão do navegador.

## Requisitos

- Node.js 20 ou superior (recomendado).
- npm.
- Windows ou Linux. O SQLite é armazenado localmente em `data/sab.sqlite`.

## Instalação e execução

Também há scripts prontos na pasta `instalacao`. Eles instalam as dependências do projeto com `npm install`, pedem a senha secreta de recuperação do administrador e, ao executar, iniciam o servidor com `npm start` e abrem o endereço no navegador padrão. É necessário ter Node.js 20+ e npm instalados; o npm instala os pacotes dentro da pasta do projeto.

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\instalacao\instalar-windows.ps1
powershell -ExecutionPolicy Bypass -File .\instalacao\executar-windows.ps1
```

Linux:

```bash
bash instalacao/instalar-linux.sh
bash instalacao/executar-linux.sh
```

O instalador salva `ADMIN_RECOVERY_PASSWORD` no arquivo local `.env`, ignorado pelo Git, e cria um atalho para execução na área de trabalho. Guarde essa senha; ela dá acesso à área de Administração. O script de execução pode ser chamado novamente e abre o servidor existente, se ele já estiver rodando.

Para desinstalar e apagar completamente a pasta do projeto, inclusive banco de dados, backups guardados nela, `.env`, dependências e histórico Git, execute o desinstalador correspondente. Ele avisa sobre a perda dos dados e exige digitar `APAGAR SAB`; salve antes o backup fora da pasta do projeto e pare o servidor.

```powershell
powershell -ExecutionPolicy Bypass -File .\instalacao\desinstalar-windows.ps1
```

```bash
bash instalacao/desinstalar-linux.sh
```

```bash
# 1. Entre na pasta do projeto
cd sab-biblioteca

# 2. Instale as dependências
npm install

# 3. (Recomendado) configure uma senha própria para o operador
# Linux/macOS:
OPERATOR_PASSWORD='uma-senha-forte' npm start

# Windows PowerShell:
$env:OPERATOR_PASSWORD='uma-senha-forte'; npm start
```

A aplicação ficará disponível em:

```text
http://localhost:8001
```

Sem definir `OPERATOR_PASSWORD`, a senha inicial é **1234**. Altere-a antes de utilizar o sistema com dados reais.

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

### Recuperação e alteração de senha do operador

Configure `ADMIN_RECOVERY_PASSWORD` com uma senha forte que somente o administrador conheça. Essa senha também pode ser usada na tela de login; ela abre o sistema com acesso ao menu **Administração**, onde é possível escolher e salvar uma nova senha do operador. A senha do operador precisa ter pelo menos 8 caracteres.

PowerShell:

```powershell
$env:ADMIN_RECOVERY_PASSWORD='crie-aqui-uma-senha-secreta-forte'
npm start
```

Linux/macOS:

```bash
ADMIN_RECOVERY_PASSWORD='crie-aqui-uma-senha-secreta-forte' npm start
```

A senha definida pelo operador é armazenada no banco local como hash e continua válida após reiniciar o servidor. `OPERATOR_PASSWORD` serve apenas para inicializar a senha quando o banco ainda não tem uma senha gravada. Mantenha `ADMIN_RECOVERY_PASSWORD` privada e configurada sempre que iniciar o servidor; sem ela, o acesso de recuperação fica desativado.

Na mesma área de Administração, use **Baixar backup** para baixar uma cópia consistente do banco SQLite. Guarde o arquivo em um local seguro e separado do computador do servidor. Para restaurar, pare o servidor normalmente, preserve o banco atual e eventuais arquivos `sab.sqlite-wal` e `sab.sqlite-shm`, e então copie o backup para `data/sab.sqlite`.

## Importação de dados

Na tela **Acervo** ou **Cadastro de aluno**, use o botão de importação. O sistema lê a primeira aba da planilha. O importador de XLSX utiliza SheetJS carregado pelo navegador via CDN; portanto, para esse formato, é necessária conexão com a internet na tela de importação. CSV é processado localmente.

Cabeçalhos recomendados para livros:

| Campo | Cabeçalho aceito |
|---|---|
| Código | `code` ou `CÓDIGO` |
| Autor | `author` ou `AUTOR` |
| Título | `title` ou `TÍTULO` |
| Editora/edição | `publisher` ou `EDITORA/EDIÇÃO` |
| Seção | `section` ou `SEÇÃO` |
| Categoria | `category` ou `CATEGORIA` |
| Volumes existentes | `total` ou `VOLUMES EXISTENTES` |

Cabeçalhos recomendados para alunos: `enrollment` ou `MATRÍCULA`, `name` ou `NOME`, `birth` ou `NASCIMENTO`, `class_name` ou `TURMA`.

Registros com campos obrigatórios ausentes, matrícula/código duplicado ou quantidades inválidas são ignorados e contabilizados no resultado. A importação não substitui registros existentes.

## Estrutura do projeto

```text
sab-biblioteca/
├── data/                  # Banco SQLite criado automaticamente
├── public/
│   ├── css/styles.css     # Estilos e identidade visual
│   ├── js/app.js          # Navegação e chamadas à API
│   └── index.html         # Interface
├── src/
│   ├── db.js              # Conexão e schema SQLite
│   └── server.js          # API REST e servidor Express
├── .gitignore
├── LICENSE.md
├── package.json
└── README.md
```

## API principal

Todas as rotas abaixo de `/api`, exceto `POST /api/login`, exigem o token retornado pelo login no cabeçalho `Authorization: Bearer <token>`.

| Método | Rota | Finalidade |
|---|---|---|
| POST | `/api/login` | Autenticação do operador |
| GET/POST | `/api/books` | Listar/persistir livros |
| GET/PUT/DELETE | `/api/books/:id` | Consultar/editar/excluir livro |
| GET/POST | `/api/students` | Listar/persistir alunos |
| GET/PUT/DELETE | `/api/students/:id` | Consultar/editar/excluir aluno |
| GET | `/api/students/:id/loans` | Histórico e pendências do aluno |
| POST | `/api/loans` | Realizar empréstimo |
| POST | `/api/loans/:id/return` | Registrar devolução |
| POST | `/api/loans/:id/renew` | Renovar uma vez por 7 dias |
| GET | `/api/reports/overdue` | Relatório de atrasos |
| GET | `/api/dashboard` | Indicadores da página inicial |
| POST | `/api/import/books` | Importar livros a partir de linhas JSON |
| POST | `/api/import/students` | Importar alunos a partir de linhas JSON |

## Regras de negócio consideradas

- O código do livro e a matrícula do aluno são identificadores únicos.
- Volumes disponíveis = volumes existentes menos exemplares em empréstimos ativos.
- Cada aluno pode manter somente um empréstimo ativo por vez.
- O empréstimo tem vencimento em sete dias corridos.
- A renovação só pode ocorrer uma vez e acrescenta sete dias à data de vencimento.
- O empréstimo em atraso continua sendo uma pendência até a devolução.
- A devolução encerra o empréstimo e devolve uma unidade ao acervo.
- Não é permitido excluir livro com empréstimo ativo nem aluno com empréstimo pendente.

## Observações de implantação e segurança

Esta entrega é uma base funcional para execução local e avaliação acadêmica. Antes de disponibilizar em rede ou utilizar dados pessoais reais, recomenda-se:

1. Configurar uma senha forte e um mecanismo de autenticação individual por operador.
2. Habilitar HTTPS, limitar tentativas de login e adotar armazenamento de sessão persistente e seguro.
3. Restringir acesso ao computador/servidor e proteger os arquivos de banco de dados e cópias de segurança.
4. Definir política de backup e retenção, especialmente por haver dados pessoais de alunos e responsáveis.
5. Hospedar a biblioteca SheetJS localmente caso a importação XLSX precise funcionar sem internet.
6. Validar os arquivos de importação e revisar os registros antes de importar grandes bases.

A senha padrão `1234` serve apenas para primeiro acesso em ambiente de teste. Não a utilize em produção.

## Licença

O uso do projeto é regido pela licença de uso restrito em [LICENSE.md](LICENSE.md).
