# Controle de Tablets (ACS / Manutenção)

Sistema web simples para controlar tablets por **tombamento**, incluindo.
- Cadastro de tablets (tombamento, nº série, modelo, data)
- Cadastro de profissionais (Nome, CPF, Município)
- Vínculo tablet ↔ profissional (status **Em uso**)
- Entrada/saída de manutenção (status **Em manutenção**)
- Exibição automática do **tempo em manutenção** (dias desde a data de entrada)
- Histórico de manutenções

## Requisitos
- Node.js 18+ (recomendado)
- NPM

## Como rodar
1. Abra o terminal na pasta do projeto
2. Instale dependências:
   ```bash
   npm install
   ```
3. Inicie o servidor:
   ```bash
   npm start
   ```
4. Acesse:
   - http://localhost:3000

## Banco de dados
- SQLite (arquivo `data.sqlite` na raiz do projeto)
- Para “zerar” o banco: pare o servidor e apague o arquivo `data.sqlite`.

## Regras implementadas (resumo)
- Ao dar **entrada na manutenção**:
  - Tablet vira **Em manutenção**
  - Se houver vínculo ativo com profissional, ele é encerrado automaticamente
- Ao dar **saída da manutenção**:
  - Tablet vira **Disponível**
- Ao **vincular** a um profissional:
  - Tablet vira **Em uso**
  - Não permite vincular se estiver **Em manutenção**
