"""Portaria contra robôs, na frente das rotas do painel e dos utilitários.

- `appcheck`  confere a prova de que a chamada saiu do site, num navegador de verdade;
- `ratelimit` limite de requisições (puro);
- `policy`    quais rotas pedem a prova e quanto corpo cada uma aceita (puro);
- `web`       a cola com o Flask.

O login (quem é a pessoa) continua em `blog/auth.py`, `planner/auth.py` e `pension/auth.py`.
"""
