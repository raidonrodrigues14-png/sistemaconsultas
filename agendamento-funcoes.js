// ================= AGENDAMENTO POR WHATSAPP =================
function agLinkPublico(){return location.origin+location.pathname+'#agendar';}
function agLinkCancelamento(id,token){return location.origin+location.pathname+'#cancelar-agenda/'+id+'/'+token;}
function agWaLink(telefone,msg){let d=(telefone||'').replace(/\D/g,'');if(d.length<=11)d='55'+d;return 'https://api.whatsapp.com/send?phone='+d+'&text='+encodeURIComponent(msg);}
function agFmtData(iso){const p=iso.split('-').map(Number);const dt=new Date(p[0],p[1]-1,p[2]);const dow=['dom','seg','ter','qua','qui','sex','sáb'][dt.getDay()];const meses=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];return{dow,num:p[2],full:p[2]+' de '+meses[p[1]-1],dt};}
function agFmtPrazo(dt){return dt.toLocaleDateString('pt-BR')+' às '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
function agMomentoSessao(data,horario){return new Date(data+'T'+horario+':00');}

// ---- STAFF: liberar horários ----
let agHorariosRows=[''];
function agAdicionarHorarioRow(){agHorariosRows.push('');agRenderHorariosRows();}
function agRenderHorariosRows(){
  document.getElementById('ag-horarios-rows').innerHTML=agHorariosRows.map((h,i)=>
    '<div class="time-row" style="display:flex;gap:.5rem;margin-top:.5rem">'+
    '<input type="time" value="'+h+'" data-agi="'+i+'" style="flex:1;border:1.5px solid var(--border);border-radius:8px;padding:.5rem .8rem">'+
    (agHorariosRows.length>1?'<button class="btn btn-nova" data-agrem="'+i+'">remover</button>':'')+
    '</div>').join('');
  document.querySelectorAll('[data-agi]').forEach(el=>el.onchange=()=>{agHorariosRows[el.dataset.agi]=el.value;});
  document.querySelectorAll('[data-agrem]').forEach(el=>el.onclick=()=>{agHorariosRows.splice(el.dataset.agrem,1);agRenderHorariosRows();});
}
async function agSalvarHorarios(){
  const data=document.getElementById('ag-data').value;
  const tipo=document.getElementById('ag-tipo').value;
  const profissional=document.getElementById('ag-profissional').value.trim();
  const horarios=agHorariosRows.filter(h=>h);
  if(!data||!horarios.length){showToast('Informe a data e ao menos um horário',true);return;}
  const ubsEl=document.getElementById('h-ubs');
  const ubs=ubsEl?ubsEl.value:(document.getElementById('portal-ubs-nome')?document.getElementById('portal-ubs-nome').textContent:'');
  const linhas=horarios.map(horario=>({data,horario,tipo,ubs,profissional:profissional||null,status:'disponivel'}));
  try{
    const{error}=await supabaseClient.from('agenda_horarios').upsert(linhas,{onConflict:'data,horario,profissional'});
    if(error)throw error;
    showToast('✅ Horários liberados!');
    agHorariosRows=[''];agRenderHorariosRows();
    agCarregarSemana();
  }catch(err){showToast('❌ Erro: '+err.message,true);}
}

// ---- STAFF: lista da semana ----
async function agCarregarSemana(){
  const lista=document.getElementById('ag-semana-lista');if(!lista)return;
  lista.innerHTML='<p class="empty">Carregando...</p>';
  const hoje=new Date().toISOString().substring(0,10);
  try{
    const{data,error}=await supabaseClient.from('agenda_horarios').select('*').gte('data',hoje).order('data').order('horario');
    if(error)throw error;
    if(!data||!data.length){lista.innerHTML='<p class="empty">Nenhum horário cadastrado ainda.</p>';return;}
    const porDia={};
    data.forEach(s=>{(porDia[s.data]=porDia[s.data]||[]).push(s);});
    lista.innerHTML=Object.keys(porDia).sort().map(d=>{
      const f=agFmtData(d);
      const chips=porDia[d].map(s=>{
        if(s.status==='reservado'){
          const dl=new Date(agMomentoSessao(s.data,s.horario).getTime()-6*3600*1000);
          const msg='Olá, '+s.paciente_nome+'! Seu atendimento ('+(s.tipo||'consulta')+') está confirmado para '+f.full+', às '+s.horario+'. Você pode cancelar até '+agFmtPrazo(dl)+'.';
          return '<span class="ag-chip reservado">'+s.horario+' — '+s.paciente_nome+' · '+(s.paciente_telefone||'sem telefone')+
            (s.paciente_telefone?' <a href="'+agWaLink(s.paciente_telefone,msg)+'" target="_blank" rel="noopener">✆ notificar</a>':'')+
            ' <button data-agcancelstaff="'+s.id+'" title="cancelar">×</button></span>';
        }
        return '<span class="ag-chip">'+s.horario+' ('+(s.tipo||'—')+') — disponível'+
          ' <button data-agmanual="'+s.id+'" title="reservar manualmente">+</button>'+
          ' <button data-agremove="'+s.id+'" title="remover">×</button></span>';
      }).join('');
      return '<div class="day-block"><div class="head"><strong>'+f.dow+', '+f.full+'</strong></div>'+chips+'</div>';
    }).join('');
    document.querySelectorAll('[data-agremove]').forEach(el=>el.onclick=async()=>{
      if(!confirm('Remover este horário?'))return;
      await supabaseClient.from('agenda_horarios').delete().eq('id',el.dataset.agremove);
      agCarregarSemana();
    });
    document.querySelectorAll('[data-agcancelstaff]').forEach(el=>el.onclick=async()=>{
      if(!confirm('Cancelar este agendamento? O horário voltará a ficar disponível.'))return;
      await supabaseClient.from('agenda_horarios').update({status:'disponivel',paciente_nome:null,paciente_telefone:null,paciente_cns:null,token:null,agendado_em:null}).eq('id',el.dataset.agcancelstaff);
      agCarregarSemana();
    });
    document.querySelectorAll('[data-agmanual]').forEach(el=>el.onclick=async()=>{
      const nome=(prompt('Nome do paciente:')||'').trim();if(!nome)return;
      const tel=(prompt('Telefone/WhatsApp do paciente:')||'').trim();if(!tel)return;
      const{data:res,error}=await supabaseClient.rpc('reservar_horario',{p_id:parseInt(el.dataset.agmanual),p_nome:nome,p_telefone:tel,p_cns:null});
      if(error){showToast('Erro: horário pode já estar ocupado',true);agCarregarSemana();return;}
      const r=res[0];const f=agFmtData(r.data);const dl=new Date(agMomentoSessao(r.data,r.horario).getTime()-6*3600*1000);
      const msg='Olá, '+nome+'! Seu atendimento ('+(r.tipo||'consulta')+') está confirmado para '+f.full+', às '+r.horario+'. Você pode cancelar até '+agFmtPrazo(dl)+'.';
      window.open(agWaLink(tel,msg),'_blank');
      agCarregarSemana();
    });
  }catch(err){lista.innerHTML='<p class="empty">Erro ao carregar horários.</p>';}
}

function agCopiarLink(){
  const inp=document.getElementById('ag-link-publico');inp.select();
  navigator.clipboard?.writeText(inp.value).then(()=>showToast('Link copiado!')).catch(()=>{});
}

function prepararModuloAgendamento(){
  document.getElementById('ag-link-publico').value=agLinkPublico();
  document.getElementById('ag-data').min=new Date().toISOString().substring(0,10);
  agHorariosRows=[''];agRenderHorariosRows();
  agCarregarSemana();
}

// ---- PÚBLICO: página de agendamento (sem login) ----
let agpSelecionado={data:null,slots:{},slotAtual:null};
async function renderAgendaPublica(){
  document.getElementById('tela-login').style.display='none';
  document.getElementById('tela-portal').style.display='none';
  document.getElementById('tela-agendamento-publica').style.display='block';
  const cont=document.getElementById('agp-conteudo');
  cont.innerHTML='<p class="empty">Carregando horários...</p>';
  const hoje=new Date().toISOString().substring(0,10);
  try{
    const{data,error}=await supabaseClient.from('agenda_horarios').select('*').eq('status','disponivel').gte('data',hoje).order('data').order('horario');
    if(error)throw error;
    const porDia={};
    (data||[]).forEach(s=>{(porDia[s.data]=porDia[s.data]||[]).push(s);});
    agpSelecionado.slots=porDia;
    const dias=Object.keys(porDia).sort();
    if(!dias.length){cont.innerHTML='<div class="ag-card" style="text-align:center"><p class="empty">Nenhum horário disponível no momento.<br>Volte em breve.</p></div>';return;}
    if(!agpSelecionado.data||!dias.includes(agpSelecionado.data))agpSelecionado.data=dias[0];
    agpRenderDias(dias);
  }catch(err){cont.innerHTML='<div class="ag-card"><p class="empty">Erro ao carregar horários.</p></div>';}
}
function agpRenderDias(dias){
  const cont=document.getElementById('agp-conteudo');
  const porDia=agpSelecionado.slots;
  cont.innerHTML='<div class="ag-card">'+
    '<div class="ag-dia-tabs">'+dias.map(d=>{const f=agFmtData(d);return '<div class="ag-dia-tab '+(d===agpSelecionado.data?'ativo':'')+'" data-agpdia="'+d+'"><span class="dow">'+f.dow+'</span><span class="num">'+f.num+'</span></div>';}).join('')+'</div>'+
    '<div class="ag-slots">'+porDia[agpSelecionado.data].map(s=>'<button class="ag-slot-btn" data-agpslot="'+s.id+'">'+s.horario+(s.tipo?' · '+s.tipo:'')+'</button>').join('')+'</div>'+
    '</div>';
  cont.querySelectorAll('[data-agpdia]').forEach(el=>el.onclick=()=>{agpSelecionado.data=el.dataset.agpdia;agpRenderDias(dias);});
  cont.querySelectorAll('[data-agpslot]').forEach(el=>el.onclick=()=>{agpAbrirFormulario(parseInt(el.dataset.agpslot));});
}
function agpAbrirFormulario(slotId){
  const slot=agpSelecionado.slots[agpSelecionado.data].find(s=>s.id===slotId);
  if(!slot)return;
  agpSelecionado.slotAtual=slot;
  const f=agFmtData(slot.data);
  const dl=new Date(agMomentoSessao(slot.data,slot.horario).getTime()-6*3600*1000);
  document.getElementById('agp-conteudo').innerHTML=
    '<div class="ag-card"><h3>'+f.full+', às '+slot.horario+(slot.tipo?' · '+slot.tipo:'')+'</h3>'+
    '<label>Nome completo</label><input type="text" id="agp-nome" style="width:100%;padding:.6rem .8rem;border:1.5px solid var(--border);border-radius:9px;margin-top:.3rem">'+
    '<label style="margin-top:.7rem;display:block">Telefone / WhatsApp</label><input type="tel" id="agp-tel" style="width:100%;padding:.6rem .8rem;border:1.5px solid var(--border);border-radius:9px;margin-top:.3rem">'+
    '<div class="policy" style="background:var(--bg);border:1px dashed var(--border);border-radius:10px;padding:.85rem;font-size:.8rem;color:var(--txt-3);margin-top:.9rem">Você pode cancelar gratuitamente até <strong>'+agFmtPrazo(dl)+'</strong> (6 horas antes). Depois disso não será mais possível cancelar pelo link.</div>'+
    '<button class="btn btn-salvar" style="width:100%;margin-top:1rem" id="agp-confirmar">Confirmar agendamento</button>'+
    '<button class="btn btn-nova" style="width:100%;margin-top:.5rem" id="agp-voltar">← escolher outro horário</button></div>';
  document.getElementById('agp-voltar').onclick=()=>{agpSelecionado.slotAtual=null;renderAgendaPublica();};
  document.getElementById('agp-confirmar').onclick=agpConfirmar;
}
async function agpConfirmar(){
  const nome=document.getElementById('agp-nome').value.trim();
  const tel=document.getElementById('agp-tel').value.trim();
  if(!nome||!tel){showToast('Preencha nome e telefone',true);return;}
  const btn=document.getElementById('agp-confirmar');btn.disabled=true;btn.textContent='Agendando...';
  const slot=agpSelecionado.slotAtual;
  try{
    const{data,error}=await supabaseClient.rpc('reservar_horario',{p_id:slot.id,p_nome:nome,p_telefone:tel,p_cns:null});
    if(error)throw error;
    agpMostrarConfirmacao(data[0],nome,tel);
  }catch(err){showToast('Esse horário acabou de ser reservado por outra pessoa. Escolha outro.',true);renderAgendaPublica();}
}
function agpMostrarConfirmacao(r,nome,tel){
  const f=agFmtData(r.data);
  const dl=new Date(agMomentoSessao(r.data,r.horario).getTime()-6*3600*1000);
  const cancelUrl=agLinkCancelamento(r.id,r.token);
  const msg='Olá, '+nome+'! Seu atendimento ('+(r.tipo||'consulta')+') está confirmado para '+f.full+', às '+r.horario+'. Você pode cancelar gratuitamente até '+agFmtPrazo(dl)+'.';
  document.getElementById('agp-conteudo').innerHTML=
    '<div class="ag-card"><span class="badge-pill bp-verde">confirmado</span><h3 style="margin-top:.6rem">Atendimento agendado</h3>'+
    '<div class="row"><span>Data</span><span>'+f.full+'</span></div>'+
    '<div class="row"><span>Horário</span><span>'+r.horario+'</span></div>'+
    (r.tipo?'<div class="row"><span>Tipo</span><span>'+r.tipo+'</span></div>':'')+
    '<div class="policy" style="background:var(--bg);border:1px dashed var(--border);border-radius:10px;padding:.85rem;font-size:.8rem;color:var(--txt-3);margin-top:.9rem">Cancelamento gratuito até <strong>'+agFmtPrazo(dl)+'</strong>.</div>'+
    '<div class="busca-wrap" style="margin-top:.9rem"><input type="text" class="busca-input" readonly value="'+cancelUrl+'" id="agp-cancel-link"><button class="busca-btn" onclick="document.getElementById(\'agp-cancel-link\').select();navigator.clipboard&&navigator.clipboard.writeText(\''+cancelUrl+'\')">copiar</button></div>'+
    '<a style="display:block;text-align:center;text-decoration:none;margin-top:.8rem;padding:.65rem;border-radius:9px;border:1px solid var(--border);color:var(--txt-1)" href="'+agWaLink(tel,msg)+'" target="_blank" rel="noopener">Enviar confirmação por WhatsApp</a>'+
    '<button class="btn btn-salvar" style="width:100%;margin-top:.9rem" onclick="agpSelecionado={data:null,slots:{},slotAtual:null};renderAgendaPublica()">Agendar outro horário</button></div>';
}

// ---- PÚBLICO: página de cancelamento ----
async function renderCancelamentoPublico(hash){
  document.getElementById('tela-login').style.display='none';
  document.getElementById('tela-portal').style.display='none';
  document.getElementById('tela-cancelar-agendamento').style.display='block';
  const partes=hash.slice('#cancelar-agenda/'.length).split('/');
  const id=parseInt(partes[0]),token=partes[1];
  const cont=document.getElementById('agc-conteudo');
  try{
    const{data,error}=await supabaseClient.rpc('obter_agendamento',{p_id:id,p_token:token});
    if(error||!data||!data.length){cont.innerHTML='<p class="empty">Link de cancelamento inválido ou agendamento não encontrado.</p>';return;}
    const r=data[0];
    if(r.status!=='reservado'){cont.innerHTML='<p class="empty">Este agendamento já foi cancelado.</p>';return;}
    const f=agFmtData(r.data);
    const dl=new Date(agMomentoSessao(r.data,r.horario).getTime()-6*3600*1000);
    const podeCancelar=new Date()<dl;
    cont.innerHTML='<h3>'+f.full+', às '+r.horario+'</h3><div class="row"><span>Paciente</span><span>'+r.paciente_nome+'</span></div>'+
      (podeCancelar?
        '<div class="policy" style="background:var(--bg);border:1px dashed var(--border);border-radius:10px;padding:.85rem;font-size:.8rem;color:var(--txt-3);margin-top:.9rem">Ainda dentro do prazo (até <strong>'+agFmtPrazo(dl)+'</strong>).</div>'+
        '<button class="btn" style="width:100%;margin-top:1rem;background:var(--verm);color:#fff" id="agc-cancelar">Cancelar agendamento</button>'
        :
        '<div class="policy" style="background:var(--verm-cl);border:1px dashed #f0b0b0;border-radius:10px;padding:.85rem;font-size:.8rem;color:var(--verm);margin-top:.9rem">O prazo para cancelamento (até '+agFmtPrazo(dl)+') já passou. Entre em contato diretamente com a unidade.</div>');
    if(podeCancelar){
      document.getElementById('agc-cancelar').onclick=async()=>{
        if(!confirm('Confirmar cancelamento?'))return;
        try{
          await supabaseClient.rpc('cancelar_horario',{p_id:id,p_token:token});
          cont.innerHTML='<p class="empty">✅ Agendamento cancelado. O horário ficou disponível novamente.</p>';
        }catch(err){cont.innerHTML='<p class="empty">Não foi possível cancelar — o prazo pode ter expirado.</p>';}
      };
    }
  }catch(err){cont.innerHTML='<p class="empty">Erro ao carregar agendamento.</p>';}
}
