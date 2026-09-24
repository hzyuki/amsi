Aqui o README atualizado com o link:

---

# AMSI — Sistema de Contabilidade

Sistema web de contabilidade empresarial com autenticação, lançamentos contábeis, controle financeiro e relatórios gerenciais.

🔗 **[Acessar o sistema](https://amsi-contabilidade.netlify.app/)**

---

## Funcionalidades

- **Dashboard** — visão geral com gráficos de receitas/despesas e próximos vencimentos
- **Lançamentos contábeis** — registro de débitos e créditos com plano de contas integrado
- **Contas a Pagar** — cadastro, controle de vencimentos e baixa de pagamentos
- **Contas a Receber** — cadastro, controle de vencimentos e baixa de recebimentos
- **Plano de Contas** — estrutura contábil com contas sintéticas e analíticas
- **Balancete de Verificação** — saldos devedores e credores de todas as contas
- **Fluxo de Caixa** — entradas e saídas classificadas por natureza
- **DRE** — Demonstração do Resultado do Exercício
- **Balanço Patrimonial** — posição de ativos, passivos e patrimônio líquido
- **Relatórios** — navegação rápida para todos os demonstrativos
- **Empresas** — cadastro e gerenciamento de múltiplas empresas

---

## Tecnologias

- **Frontend:** HTML5, CSS3, JavaScript (ES Modules)
- **Autenticação:** Firebase Authentication
- **Banco de dados:** Cloud Firestore (Firebase)
- **Hospedagem:** compatível com GitHub Pages, Vercel ou Netlify

---

## Estrutura do projeto

```
amsi/
├── index.html   # Interface principal (SPA)
├── style.css    # Estilos e tema escuro
├── app.js       # Lógica da aplicação, Firebase e renders
└── README.md
```

---

## Como rodar localmente

O projeto usa ES Modules com imports via CDN, então precisa ser servido por um servidor HTTP — não abre direto como arquivo.

**Com Node.js:**
```bash
npx serve .
```

**Com Python:**
```bash
python -m http.server 8080
```

Depois acesse `http://localhost:8080`.

---

## Configuração do Firebase

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com)
2. Ative o **Authentication** com o provedor de E-mail/Senha
3. Ative o **Firestore Database**
4. Copie as credenciais do seu projeto e substitua o objeto `firebaseConfig` no `app.js`:

```js
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.firebasestorage.app",
  messagingSenderId: "SEU_ID",
  appId: "SEU_APP_ID"
};
```

---

## Regras de segurança recomendadas (Firestore)

Configure no Firebase Console em **Firestore → Regras** usando o arquivo `firestore.rules`:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Isso garante que apenas usuários autenticados acessem os dados.

---

## Importar dados de demonstração

Após fazer login, abra o console do navegador (F12) e execute:

```js
importarDadosDemo()
```

Isso popula o Firestore com lançamentos, contas, plano de contas e empresas de exemplo.

---

## Segurança

- Toda entrada do usuário é sanitizada antes de ser salva ou renderizada
- Proteção contra XSS em todos os campos exibidos via `innerHTML`
- IDs do Firestore validados antes de uso em atributos HTML
- Navegação restrita a páginas válidas por whitelist
- Validação de formato em datas, valores numéricos, CNPJ e e-mail

---

## Licença

Uso privado.
