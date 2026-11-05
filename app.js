(function(){
"use strict";
const DEFAULTS = {
  empresa:"ANCEVA TERRAPLANAGEM LTDA", cnpj:"17.919.899/0001-43",
  assinatura:"Carlos Eduardo Vaz de Almeida", cpf:"032.816.997-82", cidade:"Valença - RJ",
  precoRetro:230, precoCaminhao:200
};
const TIPOS = {
  retro:{nome:"Retroescavadeira", desc:"Serviço Retroescavadeira"},
  caminhao:{nome:"Caminhão", desc:"Serviço Caminhão"}
};
const ICON = {
  retro:'<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"><rect x="6" y="30" width="30" height="14" rx="2" fill="var(--accent)"/><path d="M14 30V18h14l4 12"/><circle cx="14" cy="49" r="6"/><circle cx="31" cy="49" r="6"/><path d="M36 34l12-14 10 6-4 12"/><path d="M54 38l-6 6h8z" fill="currentColor"/></svg>',
  caminhao:'<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"><path d="M4 18l30 4v20H4z" fill="var(--accent)"/><path d="M34 26h14l10 10v8H34z"/><circle cx="15" cy="48" r="6"/><circle cx="47" cy="48" r="6"/></svg>'
};

/* ---------- local-first store, synced with the Google Sheet ---------- */
const LS = { dados:"anceva-dados", fila:"anceva-fila", conexao:"anceva-conexao" };
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(_) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(_) {} };
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const agora = () => new Date().toISOString();

const Store = {
  dados: lsGet(LS.dados, {clientes:{}, servicos:{}, recibos:{}, config:{}}),
  fila: lsGet(LS.fila, []),
  conexao: lsGet(LS.conexao, null),
  status: "ok", // ok | pendente | erro | sincronizando
  sincronizando: false,
  persist(){ lsSet(LS.dados, this.dados); lsSet(LS.fila, this.fila); },
  aplicarLocal(op){
    const t = this.dados[op.tabela] || (this.dados[op.tabela] = {});
    if(op.tipo === "apagar") delete t[op.id]; else t[op.id] = {...op.registro, id:op.id};
  },
  registro(tabela, id){
    const r = {...(this.dados[tabela][id] || {})};
    if(tabela === "servicos" && r.clienteId) r.cliente = (this.dados.clientes[r.clienteId] || {}).nome || "";
    if(tabela === "recibos") r.cliente = r.clienteNome || (this.dados.clientes[r.clienteId] || {}).nome || "";
    return r;
  },
  /* changes: [{tabela, id, dados}] (dados null = apagar; partial = merge) */
  gravar(changes){
    for(const c of changes){
      let op;
      if(c.dados === null) op = {tipo:"apagar", tabela:c.tabela, id:c.id};
      else {
        const atual = this.dados[c.tabela][c.id] || {};
        op = {tipo:"salvar", tabela:c.tabela, id:c.id, registro:{...atual, ...c.dados, id:c.id, atualizadoEm:agora()}};
      }
      this.aplicarLocal(op);
      if(op.tipo === "salvar") op.registro = this.registro(c.tabela, c.id);
      this.fila = this.fila.filter(o => !(o.tabela === op.tabela && o.id === op.id));
      this.fila.push(op);
    }
    this.persist();
    this.status = "pendente";
    this.sincronizar();
  },
  async sincronizar(){
    if(!this.conexao || this.sincronizando) return;
    if(!navigator.onLine){ this.status = this.fila.length ? "pendente" : "ok"; render(); return; }
    this.sincronizando = true; this.status = "sincronizando"; mostrarStatus();
    try {
      const enviando = this.fila.slice();
      let res;
      if(enviando.length){
        res = await fetch(this.conexao.url, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"},
          body:JSON.stringify({codigo:this.conexao.codigo, ops:enviando})});
      } else {
        res = await fetch(this.conexao.url + "?codigo=" + encodeURIComponent(this.conexao.codigo));
      }
      const j = await res.json();
      if(!j.ok) throw new Error(j.erro || "falha");
      // drop only what was sent; keep anything added meanwhile
      this.fila = this.fila.filter(o => !enviando.includes(o));
      const d = j.dados || {};
      this.dados = {clientes:d.clientes||{}, servicos:d.servicos||{}, recibos:d.recibos||{}, config:d.config||{}};
      for(const r of Object.values(this.dados.recibos)) if(!r.clienteNome) r.clienteNome = r.cliente;
      for(const op of this.fila) this.aplicarLocal(op);
      this.persist();
      this.status = this.fila.length ? "pendente" : "ok";
      this.ultimaSync = new Date();
      this.erro = null;
    } catch(e) {
      this.status = "erro"; this.erro = String(e && e.message || e);
    } finally {
      this.sincronizando = false;
    }
    if(this.status === "pendente") setTimeout(()=>this.sincronizar(), 1500);
    if(!document.querySelector("form")) render(); else mostrarStatus();
  }
};
window.addEventListener("online", ()=>Store.sincronizar());
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState === "visible") Store.sincronizar(); });
setInterval(()=>{ if(document.visibilityState === "visible") Store.sincronizar(); }, 60000);

const cfg = () => ({...DEFAULTS, ...(Store.dados.config.geral || {})});
const S = {stack:[{v:"home"}], draft:null, confirm:null};
const app = document.getElementById("app");

/* ---------- helpers ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brl = n => (Number(n)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const num = n => (Number(n)||0).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:2});
const parseNum = s => { if(typeof s === "number") return s; s = String(s ?? "").trim().replace(/\s/g,""); if(!s) return 0; if(s.includes(",")) s = s.replace(/\./g,"").replace(",","."); const n = parseFloat(s); return isFinite(n) ? n : 0; };
const hoje = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const dataBR = iso => { if(!iso) return "-"; const [y,m,d] = String(iso).split("-"); return d && m ? d+"/"+m+"/"+y : iso; };
const round2 = n => Math.round(n*100)/100;
const precoTxt = n => num(n).replace(/,0$/,"");
function diffHoras(ini, fim){
  if(!ini || !fim) return null;
  const [h1,m1] = ini.split(":").map(Number), [h2,m2] = fim.split(":").map(Number);
  const min = (h2*60+m2) - (h1*60+m1); if(min <= 0) return null;
  return Math.round(min/30)/2;
}
function toast(msg){ document.querySelectorAll(".toast").forEach(t=>t.remove()); const t = document.createElement("div"); t.className="toast"; t.setAttribute("role","status"); t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), 2600); }
const go = (v, p={}) => { S.confirm=null; S.stack.push({v, ...p}); render(); window.scrollTo(0,0); };
const back = () => { S.confirm=null; if(S.stack.length>1) S.stack.pop(); render(); window.scrollTo(0,0); };
const cur = () => S.stack[S.stack.length-1];
const backBtn = (label="Voltar") => `<div><button class="back" data-act="back">‹ ${label}</button></div>`;

const D = () => Store.dados;
function abertos(cid){ return Object.values(D().servicos).filter(s => s.clienteId===cid && !s.reciboId).sort((a,b)=> String(a.data||"").localeCompare(String(b.data||"")) || String(a.criadoEm||"").localeCompare(String(b.criadoEm||""))); }
function recibosDe(cid){ return Object.values(D().recibos).filter(r => r.clienteId===cid).sort((a,b)=> String(b.criadoEm||"").localeCompare(String(a.criadoEm||""))); }
function aReceber(cid){
  const a = abertos(cid).reduce((t,s)=>t+(Number(s.total)||0),0);
  const r = recibosDe(cid).filter(r=>!r.pago).reduce((t,r)=>t+(Number(r.total)||0),0);
  return {abertos:a, recibos:r, total:a+r};
}
function precoPadrao(cid, tipo){
  const prev = Object.values(D().servicos).filter(s=>s.clienteId===cid && s.tipo===tipo).sort((a,b)=>String(b.criadoEm||"").localeCompare(String(a.criadoEm||"")))[0];
  if(prev && prev.valor) return prev.valor;
  return tipo==="retro" ? cfg().precoRetro : cfg().precoCaminhao;
}

/* ---------- sync status pill ---------- */
function statusHTML(){
  if(!Store.conexao) return `<button class="sync erro" data-act="conexao">Planilha não conectada · toque aqui</button>`;
  const n = Store.fila.length;
  if(Store.status === "sincronizando") return `<div class="sync">Salvando na planilha…</div>`;
  if(Store.status === "erro") return `<button class="sync erro" data-act="sync">${n ? `${n} anotaç${n>1?"ões":"ão"} guardada${n>1?"s":""} no celular. ` : ""}Sem conexão com a planilha · tentar de novo</button>`;
  if(n) return `<div class="sync pend">${n} anotaç${n>1?"ões":"ão"} esperando internet. Estão guardadas no celular.</div>`;
  return `<div class="sync ok">✓ Tudo salvo na planilha</div>`;
}
function mostrarStatus(){ const el = document.getElementById("syncSlot"); if(el) el.innerHTML = statusHTML(); }

/* ---------- views ---------- */
function vHome(){
  const clientes = Object.values(D().clientes).map(c=>({...c, rec:aReceber(c.id)}));
  const devendo = clientes.filter(c=>c.rec.total>0).sort((a,b)=>b.rec.total-a.rec.total);
  const totalGeral = devendo.reduce((t,c)=>t+c.rec.total,0);
  return `
  <div class="brand"><div class="mark">${ICON.retro}</div>
    <div><h1>Anceva</h1><small>Serviços e recibos</small></div></div>
  <div id="syncSlot">${statusHTML()}</div>
  <button class="primary" data-act="novo">＋ Lançar serviço</button>
  <button class="dark" data-act="clientes">Clientes e recibos</button>
  ${devendo.length ? `
    <div class="section-title">Falta receber</div>
    <div class="total"><span>Total</span><span>${brl(totalGeral)}</span></div>
    <div class="list">${devendo.map(c=>`
      <button class="row" data-act="cliente" data-id="${esc(c.id)}">
        <div class="main"><div class="name">${esc(c.nome)}</div>
          <div class="sub">${c.rec.abertos>0?`<span class="pill warn">Sem recibo ${brl(c.rec.abertos)}</span> `:""}${c.rec.recibos>0?`<span class="pill warn">Recibo não pago</span>`:""}</div></div>
        <div class="amt">${brl(c.rec.total)}</div></button>`).join("")}</div>`
  : `<div class="empty">Nenhum valor pendente.<br>Toque em <b>Lançar serviço</b> para anotar o primeiro.</div>`}
  <button class="ghost small" data-act="ajustes">Preços e dados do recibo</button>`;
}

function vClientes(p){
  const escolher = p.escolher;
  const lista = Object.values(D().clientes).sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
  return `${backBtn()}
  <h2>${escolher ? "Para qual cliente?" : "Clientes"}</h2>
  <button class="primary" data-act="novoCliente" data-escolher="${escolher?1:""}">＋ Novo cliente</button>
  ${lista.length ? `<div class="list">${lista.map(c=>{const r=aReceber(c.id);return `
    <button class="row" data-act="${escolher?"escolheCliente":"cliente"}" data-id="${esc(c.id)}">
      <div class="main"><div class="name">${esc(c.nome)}</div><div class="sub">${esc(c.endereco||"")}</div></div>
      ${r.total>0?`<div class="amt">${brl(r.total)}</div>`:""}</button>`}).join("")}</div>`
  : `<div class="empty">Ainda não tem cliente. Toque em <b>Novo cliente</b>.</div>`}`;
}

function vClienteForm(p){
  const c = p.id ? D().clientes[p.id] : {};
  return `${backBtn()}
  <h2>${p.id ? "Editar cliente" : "Novo cliente"}</h2>
  <form id="fCliente" class="list">
    <label>Nome<input id="cNome" required value="${esc(c.nome||"")}" autocomplete="off"></label>
    <label>Endereço / local da obra<input id="cEnd" value="${esc(c.endereco||"")}" autocomplete="off"></label>
    <label>WhatsApp <span class="hint">Opcional, com DDD. Ex.: 24 99999-0000</span><input id="cTel" inputmode="tel" value="${esc(c.telefone||"")}" autocomplete="off"></label>
    <button class="primary" type="submit">Salvar cliente</button>
  </form>`;
}

function vTipo(p){
  const c = D().clientes[p.clienteId];
  return `${backBtn()}
  <h2>${esc(c?.nome||"")}</h2><p class="muted" style="margin:-10px 0 0">Qual serviço?</p>
  <div class="big2">
    <button class="tile" data-act="tipo" data-tipo="retro">${ICON.retro}Retroescavadeira</button>
    <button class="tile" data-act="tipo" data-tipo="caminhao">${ICON.caminhao}Caminhão</button>
  </div>`;
}

function vServicoForm(){
  const d = S.draft; if(!d) return vHome();
  const c = D().clientes[d.clienteId];
  const retro = d.tipo==="retro";
  const total = round2(parseNum(retro ? d.horas : d.viagens) * parseNum(d.valor));
  return `${backBtn()}
  <h2>${TIPOS[d.tipo].nome}</h2><p class="muted" style="margin:-10px 0 0">${esc(c?.nome||"")}</p>
  <form id="fServico" class="list">
    <label>Dia<input id="sData" type="date" value="${esc(d.data)}" required></label>
    ${retro ? `
      <div class="grid2">
        <label>Começou<input id="sIni" type="time" value="${esc(d.inicio)}"></label>
        <label>Terminou<input id="sFim" type="time" value="${esc(d.fim)}"></label>
      </div>
      <label>Total de horas <span class="hint">Pode mudar se precisar. Ex.: 6,5</span><input id="sHoras" inputmode="decimal" value="${esc(d.horas)}" required></label>
      <label>Valor da hora (R$)<input id="sValor" inputmode="decimal" value="${esc(d.valor)}" required></label>`
    : `
      <label>Quantas viagens?<input id="sViagens" inputmode="numeric" value="${esc(d.viagens)}" required></label>
      <label>Valor da viagem (R$)<input id="sValor" inputmode="decimal" value="${esc(d.valor)}" required></label>`}
    <div class="total" id="sTotal"><span>Total</span><span>${brl(total)}</span></div>
    <button class="primary" type="submit">${d.id ? "Salvar alterações" : "Salvar serviço"}</button>
  </form>
  ${d.id ? delBlock("delServico", "Apagar este serviço") : ""}`;
}

function delBlock(act, label){
  if(S.confirm===act) return `<div class="confirm"><b>Tem certeza? Não dá para desfazer.</b>
    <div class="grid2"><button class="ghost" data-act="cancelConfirm">Não</button><button class="danger" data-act="${act}">Sim</button></div></div>`;
  return `<button class="danger" data-act="askConfirm" data-what="${act}">${label}</button>`;
}

function linhaServico(s){
  const qtd = s.tipo==="retro" ? `${num(s.horas)} h${s.inicio&&s.fim?` · ${esc(s.inicio)}–${esc(s.fim)}`:""}` : `${Number(s.viagens)} viage${Number(s.viagens)==1?"m":"ns"}`;
  return `<div class="main"><div class="name">${dataBR(s.data).slice(0,5)} · ${TIPOS[s.tipo]?.nome||esc(s.tipo)}</div><div class="sub">${qtd} · ${brl(s.valor)}</div></div><div class="amt">${brl(s.total)}</div>`;
}

function vCliente(p){
  const c = D().clientes[p.id]; if(!c) return `${backBtn()}<div class="empty">Cliente não encontrado.</div>`;
  const ab = abertos(c.id), recs = recibosDe(c.id);
  const totAb = ab.reduce((t,s)=>t+(Number(s.total)||0),0);
  return `${backBtn()}
  <div><h2>${esc(c.nome)}</h2><div class="muted">${esc(c.endereco||"")}${c.telefone?` · ${esc(c.telefone)}`:""}</div></div>
  <button class="primary" data-act="novoPara" data-id="${esc(c.id)}">＋ Lançar serviço</button>
  <div class="section-title">Serviços sem recibo</div>
  ${ab.length ? `<div class="list">${ab.map(s=>`<button class="row" data-act="editServico" data-id="${esc(s.id)}">${linhaServico(s)}</button>`).join("")}</div>
    <div class="total"><span>Total</span><span>${brl(totAb)}</span></div>
    <button class="dark" data-act="gerarRecibo" data-id="${esc(c.id)}">Fazer recibo destes serviços</button>`
  : `<div class="empty">Nenhum serviço esperando recibo.</div>`}
  ${recs.length ? `<div class="section-title">Recibos</div><div class="list">${recs.map(r=>`
    <button class="row" data-act="recibo" data-id="${esc(r.id)}"><div class="main"><div class="name">Recibo de ${dataBR(r.data)}</div>
      <div class="sub">${r.pago?'<span class="pill ok">Pago</span>':'<span class="pill warn">Aguardando pagamento</span>'}</div></div>
      <div class="amt">${brl(r.total)}</div></button>`).join("")}</div>` : ""}
  <button class="ghost small" data-act="editCliente" data-id="${esc(c.id)}">Editar dados do cliente</button>`;
}

function empresaDe(r){ return {...DEFAULTS, ...(r.empresa || cfg())}; }
function reciboHTML(r){
  const e = empresaDe(r), linhas = r.linhas || [];
  const horas = linhas.reduce((t,l)=>t+(l.tipo==="retro"?Number(l.horas)||0:0),0);
  return `<div class="paper-wrap"><div class="paper">
    <div class="hd"><b>${esc(e.empresa)}</b>CNPJ: ${esc(e.cnpj)}<br><br>Data: ${dataBR(r.data)}<br>Cliente: ${esc(r.clienteNome)}<br>Endereço: ${esc(r.endereco||"-")}</div>
    <table><thead><tr><th>Descrição</th><th>Data</th><th>Viagens</th><th>Valor</th><th>Início</th><th>Término</th><th>Total Horas</th><th>Total</th></tr></thead>
    <tbody>${linhas.map(l=>`<tr><td>${TIPOS[l.tipo].desc}</td><td>${dataBR(l.data)}</td><td>${l.tipo==="caminhao"?Number(l.viagens):"-"}</td><td>${brl(l.valor)}</td>
      <td>${l.tipo==="retro"&&l.inicio?esc(l.inicio):"-"}</td><td>${l.tipo==="retro"&&l.fim?esc(l.fim):"-"}</td><td>${l.tipo==="retro"?num(l.horas):"-"}</td><td>${brl(l.total)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td>TOTAL</td><td>-</td><td></td><td>-</td><td>-</td><td>-</td><td>${num(horas)}</td><td>${brl(r.total)}</td></tr></tfoot></table>
    <div class="fim">Serviços Finalizados.<br><br><b>Valor total a receber: ${brl(r.total)}</b></div>
    <div class="sig">${esc(e.assinatura)}<br>${esc(e.cpf)}<br>${esc(e.cidade)}</div>
  </div></div>`;
}

function waLink(r){
  const c = D().clientes[r.clienteId] || {};
  const linhas = (r.linhas||[]).map(l => `• ${dataBR(l.data).slice(0,5)} ${TIPOS[l.tipo].nome}: ${l.tipo==="retro"?num(l.horas)+" h":Number(l.viagens)+" viagem(ns)"} = ${brl(l.total)}`).join("\n");
  const txt = `Olá, ${r.clienteNome}! Segue o fechamento dos serviços:\n\n${linhas}\n\n*Total a receber: ${brl(r.total)}*\n\n${empresaDe(r).empresa}`;
  const tel = String(c.telefone||"").replace(/\D/g,"");
  const para = tel ? (tel.length<=11 ? "55"+tel : tel) : "";
  return `https://wa.me/${para}?text=${encodeURIComponent(txt)}`;
}

function vRecibo(p){
  const r = D().recibos[p.id]; if(!r) return `${backBtn()}<div class="empty">Recibo não encontrado.</div>`;
  return `${backBtn()}
  <div><h2>Recibo · ${esc(r.clienteNome)}</h2>
    <div style="margin-top:6px">${r.pago?'<span class="pill ok">Pago</span>':'<span class="pill warn">Aguardando pagamento</span>'}</div></div>
  ${reciboHTML(r)}
  <button class="primary" data-act="pdf" data-id="${esc(r.id)}">Enviar PDF do recibo</button>
  <a class="btn dark" href="${esc(waLink(r))}" target="_blank" rel="noopener">Mandar resumo no WhatsApp</a>
  ${r.pago ? `<button class="ghost" data-act="pago" data-id="${esc(r.id)}" data-v="">Desmarcar pagamento</button>`
           : `<button class="ghost okb" data-act="pago" data-id="${esc(r.id)}" data-v="1">✓ Cliente pagou</button>`}
  ${delBlock("delRecibo", "Desfazer recibo (serviços voltam para a lista)")}`;
}

function vAjustes(){
  const c = cfg();
  return `${backBtn()}
  <h2>Preços e dados do recibo</h2>
  <form id="fAjustes" class="list">
    <div class="section-title">Preço padrão</div>
    <p class="muted" style="margin:0;font-size:16px">Para cada cliente, o app sugere o último preço usado com ele. Se for cliente novo, usa estes.</p>
    <div class="grid2">
      <label>Hora retro (R$)<input id="aRetro" inputmode="decimal" value="${esc(precoTxt(c.precoRetro))}"></label>
      <label>Viagem caminhão (R$)<input id="aCam" inputmode="decimal" value="${esc(precoTxt(c.precoCaminhao))}"></label>
    </div>
    <div class="section-title">Cabeçalho e assinatura</div>
    <label>Empresa<input id="aEmp" value="${esc(c.empresa)}"></label>
    <label>CNPJ<input id="aCnpj" value="${esc(c.cnpj)}"></label>
    <label>Nome na assinatura<input id="aAss" value="${esc(c.assinatura)}"></label>
    <label>CPF<input id="aCpf" value="${esc(c.cpf)}"></label>
    <label>Cidade<input id="aCid" value="${esc(c.cidade)}"></label>
    <button class="primary" type="submit">Salvar</button>
  </form>
  <button class="ghost small" data-act="conexao">Conexão com a planilha</button>`;
}

function vConexao(){
  const c = Store.conexao || {};
  return `${S.stack.length>1?backBtn():""}
  <h2>Conectar à planilha</h2>
  <p class="muted" style="margin:0">Faça isso uma vez só. O Douglas tem o endereço e o código.</p>
  <form id="fConexao" class="list">
    <label>Endereço da planilha <span class="hint">Termina em /exec</span><input id="kUrl" inputmode="url" value="${esc(c.url||"")}" autocomplete="off" required></label>
    <label>Código de acesso<input id="kCod" value="${esc(c.codigo||"")}" autocomplete="off" required></label>
    <button class="primary" type="submit">Conectar</button>
  </form>
  ${Store.erro && Store.conexao ? `<p class="muted">Último erro: ${esc(Store.erro)}</p>` : ""}`;
}

const VIEWS = {home:vHome, clientes:vClientes, clienteForm:vClienteForm, tipo:vTipo, servico:vServicoForm, cliente:vCliente, recibo:vRecibo, ajustes:vAjustes, conexao:vConexao};

function render(){
  const v = cur();
  const active = document.activeElement && document.activeElement.id;
  app.innerHTML = (VIEWS[v.v]||vHome)(v);
  if(active){ const el = document.getElementById(active); if(el && el.tagName==="INPUT") el.focus(); }
  fitPaper();
}
function fitPaper(){
  const w = document.querySelector(".paper-wrap"), p = w && w.querySelector(".paper"); if(!p) return;
  p.style.zoom = Math.min(1, w.clientWidth / 560);
}
window.addEventListener("resize", fitPaper);

/* ---------- live total on service form ---------- */
app.addEventListener("input", e => {
  if(!S.draft || !document.getElementById("fServico")) return;
  const d = S.draft, id = e.target.id;
  if(id==="sData") d.data = e.target.value;
  if(id==="sIni" || id==="sFim"){
    d[id==="sIni"?"inicio":"fim"] = e.target.value;
    const h = diffHoras(d.inicio, d.fim);
    if(h!==null && !d.horasManual){ d.horas = num(h); const hi = document.getElementById("sHoras"); if(hi) hi.value = d.horas; }
  }
  if(id==="sHoras"){ d.horas = e.target.value; d.horasManual = true; }
  if(id==="sViagens") d.viagens = e.target.value;
  if(id==="sValor") d.valor = e.target.value;
  const t = document.querySelector("#sTotal span:last-child");
  if(t) t.textContent = brl(round2(parseNum(d.tipo==="retro" ? d.horas : d.viagens)*parseNum(d.valor)));
});

/* ---------- forms ---------- */
app.addEventListener("submit", e => {
  e.preventDefault();
  const f = e.target, v = cur();
  const g = id => document.getElementById(id).value.trim();
  if(f.id==="fCliente"){
    const nome = g("cNome"); if(!nome){ toast("Escreva o nome do cliente."); return; }
    const dados = {nome, endereco:g("cEnd"), telefone:g("cTel")};
    if(v.id){ Store.gravar([{tabela:"clientes", id:v.id, dados}]); toast("Cliente salvo"); back(); }
    else {
      const id = novoId();
      Store.gravar([{tabela:"clientes", id, dados:{...dados, criadoEm:agora()}}]);
      toast("Cliente salvo");
      S.stack.pop();
      if(v.escolher){ S.stack.pop(); go("tipo",{clienteId:id}); } else go("cliente",{id});
    }
  }
  if(f.id==="fServico"){
    const d = S.draft, retro = d.tipo==="retro";
    const horas = retro ? parseNum(d.horas) : 0, viagens = retro ? 0 : Math.round(parseNum(d.viagens));
    const valor = parseNum(d.valor);
    if(retro && horas<=0){ toast("Coloque o total de horas."); return; }
    if(!retro && viagens<=0){ toast("Coloque quantas viagens."); return; }
    if(valor<=0){ toast("Coloque o valor."); return; }
    const dados = {clienteId:d.clienteId, tipo:d.tipo, data:d.data||hoje(), inicio:retro?(d.inicio||""):"", fim:retro?(d.fim||""):"",
      horas, viagens, valor, total:round2((retro?horas:viagens)*valor)};
    const id = d.id || novoId();
    if(!d.id) dados.criadoEm = agora();
    Store.gravar([{tabela:"servicos", id, dados}]);
    toast("Serviço salvo");
    S.draft=null; S.stack=[{v:"home"},{v:"cliente",id:d.clienteId}]; render(); window.scrollTo(0,0);
  }
  if(f.id==="fAjustes"){
    const dados = {precoRetro:parseNum(g("aRetro"))||DEFAULTS.precoRetro, precoCaminhao:parseNum(g("aCam"))||DEFAULTS.precoCaminhao,
      empresa:g("aEmp"), cnpj:g("aCnpj"), assinatura:g("aAss"), cpf:g("aCpf"), cidade:g("aCid")};
    Store.gravar([{tabela:"config", id:"geral", dados}]);
    toast("Salvo"); back();
  }
  if(f.id==="fConexao"){
    const url = g("kUrl"), codigo = g("kCod");
    if(!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)){ toast("Esse endereço não parece ser o da planilha."); return; }
    Store.conexao = {url, codigo}; lsSet(LS.conexao, Store.conexao);
    toast("Conectando…");
    S.stack=[{v:"home"}]; render();
    Store.sincronizar();
  }
});

/* ---------- buttons ---------- */
app.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if(!b) return;
  const a = b.dataset.act, id = b.dataset.id;
  if(a==="back") return back();
  if(a==="novo") return go("clientes",{escolher:true});
  if(a==="clientes") return go("clientes");
  if(a==="ajustes") return go("ajustes");
  if(a==="conexao") return go("conexao");
  if(a==="sync") return Store.sincronizar();
  if(a==="novoCliente") return go("clienteForm",{escolher:!!b.dataset.escolher});
  if(a==="editCliente") return go("clienteForm",{id});
  if(a==="escolheCliente" || a==="novoPara") return go("tipo",{clienteId:id});
  if(a==="cliente") return go("cliente",{id});
  if(a==="recibo") return go("recibo",{id});
  if(a==="tipo"){
    const cid = cur().clienteId, tipo = b.dataset.tipo;
    S.draft = {clienteId:cid, tipo, data:hoje(), inicio:"", fim:"", horas:"", viagens:"1", valor:precoTxt(precoPadrao(cid,tipo))};
    return go("servico");
  }
  if(a==="editServico"){ const s = D().servicos[id]; S.draft = {...s, horas:num(s.horas), viagens:String(s.viagens||1), valor:precoTxt(s.valor), horasManual:true}; return go("servico"); }
  if(a==="askConfirm"){ S.confirm = b.dataset.what; return render(); }
  if(a==="cancelConfirm"){ S.confirm = null; return render(); }
  if(a==="delServico"){
    const cid = S.draft.clienteId;
    Store.gravar([{tabela:"servicos", id:S.draft.id, dados:null}]);
    toast("Serviço apagado");
    S.draft=null; S.confirm=null; S.stack=[{v:"home"},{v:"cliente",id:cid}]; return render();
  }
  if(a==="gerarRecibo"){
    const c = D().clientes[id], ab = abertos(id); if(!ab.length) return;
    const rid = novoId();
    const {precoRetro, precoCaminhao, id:_i, atualizadoEm:_u, ...empresa} = cfg();
    const rec = {clienteId:id, clienteNome:c.nome, endereco:c.endereco||"", data:hoje(), criadoEm:agora(), pago:false, pagoEm:"", empresa,
      servicoIds:ab.map(s=>s.id), linhas:ab.map(s=>({tipo:s.tipo,data:s.data,inicio:s.inicio,fim:s.fim,horas:Number(s.horas),viagens:Number(s.viagens),valor:Number(s.valor),total:Number(s.total)})),
      total:round2(ab.reduce((t,s)=>t+(Number(s.total)||0),0))};
    Store.gravar([{tabela:"recibos", id:rid, dados:rec}, ...ab.map(s=>({tabela:"servicos", id:s.id, dados:{reciboId:rid}}))]);
    toast("Recibo pronto");
    return go("recibo",{id:rid});
  }
  if(a==="pago"){
    Store.gravar([{tabela:"recibos", id, dados:{pago:!!b.dataset.v, pagoEm:b.dataset.v?agora():""}}]);
    toast(b.dataset.v ? "Marcado como pago" : "Pagamento desmarcado");
    return render();
  }
  if(a==="delRecibo"){
    const r = D().recibos[cur().id]; if(!r) return;
    const ids = (r.servicoIds||[]).filter(sid => D().servicos[sid]);
    Store.gravar([...ids.map(sid=>({tabela:"servicos", id:sid, dados:{reciboId:""}})), {tabela:"recibos", id:r.id, dados:null}]);
    toast("Recibo desfeito");
    S.confirm=null; S.stack=[{v:"home"},{v:"cliente",id:r.clienteId}]; return render();
  }
  if(a==="pdf") return enviarPDF(D().recibos[id]);
});

/* ---------- PDF in the same layout as the Word receipt ---------- */
function montarPDF(r){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:"mm", format:"a4"});
  const e = empresaDe(r), cx = 105, linhas = r.linhas || [];
  const money = n => brl(n).replace(/ /g," ");
  doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.text(e.empresa, cx, 25, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(11);
  doc.text("CNPJ: "+e.cnpj, cx, 31, {align:"center"});
  doc.text("Data: "+dataBR(r.data), cx, 42, {align:"center"});
  doc.text("Cliente: "+r.clienteNome, cx, 48, {align:"center"});
  doc.text("Endereço: "+(r.endereco||"-"), cx, 54, {align:"center"});
  const horas = linhas.reduce((t,l)=>t+(l.tipo==="retro"?Number(l.horas)||0:0),0);
  doc.autoTable({
    startY:68, theme:"grid", margin:{left:12,right:12},
    styles:{font:"helvetica", fontSize:8.5, halign:"center", valign:"middle", lineColor:[60,60,60], lineWidth:.2, textColor:[17,17,17], cellPadding:1.8},
    headStyles:{fillColor:[232,232,232], textColor:[17,17,17], fontStyle:"bold"},
    footStyles:{fillColor:[255,255,255], textColor:[17,17,17], fontStyle:"bold"},
    head:[["Descrição","Data","Viagens","Valor Hora","Início","Término","Total Horas","Total"]],
    body:linhas.map(l=>[TIPOS[l.tipo].desc, dataBR(l.data), l.tipo==="caminhao"?String(Number(l.viagens)):"-", money(l.valor),
      l.tipo==="retro"&&l.inicio?l.inicio:"-", l.tipo==="retro"&&l.fim?l.fim:"-", l.tipo==="retro"?num(l.horas):"-", money(l.total)]),
    foot:[["TOTAL","-","","-","-","-",num(horas),money(r.total)]],
    showFoot:"lastPage"
  });
  let y = doc.lastAutoTable.finalY + 16;
  doc.setFontSize(11); doc.text("Serviços Finalizados.", 20, y);
  doc.setFont("helvetica","bold"); doc.text("Valor total a receber: "+money(r.total), 20, y+10);
  doc.setFont("helvetica","normal");
  y = Math.max(y+40, 230);
  doc.text(e.assinatura, cx, y, {align:"center"});
  doc.text(e.cpf, cx, y+6, {align:"center"});
  doc.text(e.cidade, cx, y+12, {align:"center"});
  return doc;
}
async function enviarPDF(r){
  if(!r) return;
  const nome = `Recibo ${r.clienteNome} ${dataBR(r.data).replace(/\//g,"-")}.pdf`.replace(/[\\/:*?"<>|]/g,"");
  const blob = montarPDF(r).output("blob");
  const file = new File([blob], nome, {type:"application/pdf"});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try { await navigator.share({files:[file], title:nome}); return; }
    catch(e){ if(e && e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 10000);
  toast("PDF salvo em Downloads");
}

/* ---------- start ---------- */
// One-time setup link: ...#conectar=<url>|<codigo>
const m = location.hash.match(/^#conectar=(.+)$/);
if(m){
  const [url, codigo] = decodeURIComponent(m[1]).split("|");
  if(url && codigo){ Store.conexao = {url, codigo}; lsSet(LS.conexao, Store.conexao); }
  history.replaceState(null, "", location.pathname);
}
if(!Store.conexao) S.stack = [{v:"home"},{v:"conexao"}];
render();
Store.sincronizar();
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
