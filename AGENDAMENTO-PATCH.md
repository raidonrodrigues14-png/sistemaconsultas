# Agendamento por WhatsApp — patch para o Portal APS

Este pacote adiciona um novo módulo "Agendamento por WhatsApp":
- a equipe libera horários da semana (dentro do portal, com login);
- os pacientes recebem **um link público** (sem login) onde só veem os horários liberados, escolhem, informam nome/telefone e confirmam — o horário fica reservado na hora;
- ao confirmar, aparece um botão para enviar a confirmação **por WhatsApp** e um link de **cancelamento** (funciona até 6h antes do horário — depois disso, não cancela mais);
- a equipe também pode reservar manualmente (paciente que ligou/apareceu) e notificar por WhatsApp com um clique.

Como o link público precisa escrever no banco sem estar logado, a reserva e o cancelamento passam por duas funções do Supabase (RPC) que fazem a operação de forma atômica e segura — evita corrida entre dois pacientes pegando o mesmo horário e limita o que a chave pública pode alterar.

## Passo 1 — Rodar o SQL no Supabase

Abra o **SQL Editor** do seu projeto Supabase e rode o arquivo `agendamento-schema.sql` (anexo) inteiro, uma vez só. Ele cria a tabela `agenda_horarios`, as políticas de RLS e as funções `reservar_horario`, `cancelar_horario` e `obter_agendamento`.

## Passo 2 — CSS

Cole isto **logo antes de `</style>`** (perto do fim do bloco de estilos):

```css
.portal-card.agenda::before{background:linear-gradient(90deg,#006064,#00acc1);opacity:1}
.agenda .card-emoji-wrap{background:linear-gradient(135deg,#e0f7fa,#b2ebf2);border:1px solid #4dd0e1}
.portal-card.agenda:hover{border-color:#4dd0e1}
.ag-dia-tabs{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:14px}
.ag-dia-tab{flex:0 0 auto;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:.5rem .8rem;cursor:pointer;text-align:center;min-width:64px;font-family:var(--font-body)}
.ag-dia-tab .dow{display:block;font-size:.6rem;color:var(--txt-3);text-transform:capitalize}
.ag-dia-tab .num{display:block;font-family:var(--font-display);font-size:1.1rem;margin-top:2px}
.ag-dia-tab.ativo{background:var(--musgo);border-color:var(--musgo)}
.ag-dia-tab.ativo .dow,.ag-dia-tab.ativo .num{color:#fff}
.ag-slots{display:flex;flex-wrap:wrap;gap:.6rem}
.ag-slot-btn{border:1.5px solid var(--border);background:var(--surface);color:var(--txt-1);border-radius:9px;padding:.6rem 1rem;font-size:.9rem;cursor:pointer;font-family:var(--font-body)}
.ag-card{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:1.5rem;box-shadow:var(--shadow-sm)}
.ag-chip{display:inline-flex;align-items:center;gap:.4rem;background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:.35rem .5rem .35rem .7rem;font-size:.78rem;margin:.2rem .35rem .2rem 0}
.ag-chip.reservado{background:#e0f7fa;border-color:#80deea}
.ag-chip button,.ag-chip a{background:none;border:none;color:var(--txt-3);cursor:pointer;font-size:.75rem;text-decoration:none;padding:0}
```

## Passo 3 — Card no portal

Procure este trecho (o card "Estratificação Geral", perto do fim da lista de cards):

```
<div class="card-arrow">Ver gráfico →</div></div></div></div><div class="portal-footer">
```

E cole o novo card **logo antes** do `</div></div><div class="portal-footer">`, assim:

```html
<div class="portal-card agenda" onclick="abrirModulo('agendamento')"><div class="card-emoji-wrap">📅</div><h2>Agendamento por WhatsApp</h2><p>Libere horários da semana e deixe os pacientes marcarem sozinhos pelo link — com confirmação e lembrete via WhatsApp.</p><div class="card-riscos"><span class="risco-pill verde">Link público</span><span class="risco-pill amarelo">Cancela até 6h antes</span></div><div class="card-arrow" style="color:#00838f">Gerenciar agenda →</div></div></div></div></div><div class="portal-footer">
```

(repare que a linha acima já inclui os `</div>` originais no fim — é só trocar o trecho procurado por ela).

## Passo 4 — Módulo da equipe (dentro do portal)

Cole este bloco **antes** do comentário `<!-- MÓDULO SAÚDE BUCAL -->`:

```html
<div id="modulo-agendamento">
  <div class="app-header" style="background:linear-gradient(135deg,#006064,#00838f)">
    <div class="app-header-brand"><div class="app-header-icon">📅</div><div class="app-header-text"><strong>Agendamento por WhatsApp</strong><span>Libere horários e notifique pacientes automaticamente</span></div></div>
    <button class="btn-portal-voltar" onclick="voltarPortal()">← Portal</button>
  </div>
  <div class="cri-content">
    <div class="c-secao">
      <div class="c-secao-titulo" style="background:linear-gradient(90deg,#006064,#00838f);color:#fff">🔗 Link para os pacientes</div>
      <div class="c-secao-corpo">
        <div class="busca-wrap"><input type="text" class="busca-input" id="ag-link-publico" readonly><button class="busca-btn" style="background:#00838f" onclick="agCopiarLink()">Copiar link</button></div>
        <p class="tagline" style="margin-top:.5rem">Compartilhe esse link com os pacientes. Eles só verão os horários que você liberar abaixo.</p>
      </div>
    </div>
    <div class="c-secao">
      <div class="c-secao-titulo" style="background:linear-gradient(90deg,#00838f,#00acc1);color:#fff">➕ Liberar horários</div>
      <div class="c-secao-corpo">
        <div class="c-grid-3">
          <div class="c-campo"><label>Data</label><input type="date" id="ag-data"></div>
          <div class="c-campo"><label>Tipo de Atendimento</label><select id="ag-tipo"><option>Consulta médica</option><option>Consulta de enfermagem</option><option>Odontológico</option><option>Vacina</option><option>Outro</option></select></div>
          <div class="c-campo"><label>Profissional</label><input type="text" id="ag-profissional" placeholder="Nome do profissional"></div>
        </div>
        <label style="margin-top:.75rem;display:block">Horários</label>
        <div id="ag-horarios-rows"></div>
        <button class="btn btn-nova" style="margin-top:.5rem" onclick="agAdicionarHorarioRow()">+ adicionar horário</button>
        <button class="btn btn-salvar" style="margin-top:1rem" onclick="agSalvarHorarios()">💾 Salvar horários</button>
      </div>
    </div>
    <div class="c-secao">
      <div class="c-secao-titulo" style="background:linear-gradient(90deg,#37474f,#546e7a);color:#fff">📋 Horários da semana <button onclick="agCarregarSemana()" style="margin-left:auto;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);color:#fff;padding:.15rem .5rem;border-radius:6px;cursor:pointer;font-size:.68rem">↻</button></div>
      <div class="c-secao-corpo" id="ag-semana-lista"><p class="empty">Carregando...</p></div>
    </div>
  </div>
</div>
```

## Passo 5 — Páginas públicas (sem login)

Cole este bloco **logo depois** do fechamento da `<div id="tela-assinatura-vencida" ...>...</div>` e **antes** de `<div id="tela-portal">`:

```html
<div id="tela-agendamento-publica" style="display:none;min-height:100vh;background:var(--bg)">
  <div class="portal-hero" style="background:linear-gradient(150deg,#004d40 0%,#00695c 45%,#00897b 100%)">
    <div class="portal-logo-box"><div class="portal-logo-icon">📅</div><div class="portal-logo-text"><strong>Agendamento</strong><span>Escolha um horário disponível</span></div></div>
    <h1>Marque sua <em>consulta</em></h1><p>Escolha o dia e horário disponível abaixo</p>
  </div>
  <div class="portal-cards-wrap" style="padding-top:0"><div id="agp-conteudo" style="max-width:520px;width:100%"><p class="empty">Carregando horários...</p></div></div>
  <div class="portal-footer">Secretaria de Saúde de Alto Alegre do Maranhão</div>
</div>
<div id="tela-cancelar-agendamento" style="display:none;min-height:100vh;background:var(--bg)">
  <div class="portal-hero" style="background:linear-gradient(150deg,#004d40 0%,#00695c 45%,#00897b 100%)">
    <div class="portal-logo-box"><div class="portal-logo-icon">📅</div><div class="portal-logo-text"><strong>Cancelar Agendamento</strong><span>Secretaria de Saúde</span></div></div>
    <h1>Cancelar <em>consulta</em></h1>
  </div>
  <div class="portal-cards-wrap" style="padding-top:0"><div class="ag-card" id="agc-conteudo" style="max-width:520px;width:100%"><p class="empty">Carregando...</p></div></div>
</div>
```

## Passo 6 — Três pequenos ajustes no JS existente

**6.1** — Em `abrirModulo(mod)`, adicione o módulo na lista de displays e no `else if`:

Ache:
```js
document.getElementById('modulo-idoso').style.display=mod==='idoso'?'block':'none';if(mod==='gestante')
```
Troque por:
```js
document.getElementById('modulo-idoso').style.display=mod==='idoso'?'block':'none';document.getElementById('modulo-agendamento').style.display=mod==='agendamento'?'block':'none';if(mod==='gestante')
```
E ache o final dessa mesma função, `else if(mod==='idoso'){preencherUbsIdoso();carregarIdosos();}}` — troque por:
```js
else if(mod==='idoso'){preencherUbsIdoso();carregarIdosos();}else if(mod==='agendamento'){prepararModuloAgendamento();}}
```

**6.2** — Em `voltarPortal()`, ache:
```js
['modulo-gestante','modulo-crianca','modulo-bucal','modulo-hasdm','modulo-idoso'].forEach
```
Troque por:
```js
['modulo-gestante','modulo-crianca','modulo-bucal','modulo-hasdm','modulo-idoso','modulo-agendamento'].forEach
```

**6.3** — No `window.addEventListener('load', async()=>{ ... })`, logo na primeira linha da função (antes de `document.getElementById('login-user').value=''`), cole:
```js
if(location.hash.startsWith('#cancelar-agenda/')){renderCancelamentoPublico(location.hash);return;}
if(location.hash==='#agendar'){renderAgendaPublica();return;}
```
Isso faz o link público funcionar **sem passar pela tela de login**.

## Passo 7 — Funções JavaScript

Cole o conteúdo do arquivo `agendamento-funcoes.js` (anexo) em qualquer lugar dentro da tag `<script>` já existente — o mais simples é logo antes do `</script>` final.

## Depois de colar tudo

- O link público para os pacientes é: `https://seu-dominio/#agendar`
- O link de cancelamento é gerado automaticamente para cada agendamento e enviado junto da confirmação.
- Dentro do portal (logado), o card "📅 Agendamento por WhatsApp" leva à tela de liberar horários e ver/notificar a semana.
