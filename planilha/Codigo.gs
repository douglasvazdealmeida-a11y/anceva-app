/**
 * Anceva Serviços — ponte entre o app do celular e esta planilha.
 *
 * Como instalar (uma vez só):
 * 1. Na planilha: Extensões > Apps Script. Apague o que tiver e cole este código. Salve.
 * 2. No menu de cima, escolha a função "configurar" e clique em Executar. Autorize.
 *    Ela cria as abas e mostra o CÓDIGO DE ACESSO no registro de execução.
 * 3. Implantar > Nova implantação > tipo "App da Web".
 *    Executar como: Eu. Quem pode acessar: Qualquer pessoa. Implantar.
 * 4. Copie o endereço que termina em /exec. Ele e o código vão no app.
 */

const TABELAS = {
  Clientes: ['id', 'nome', 'endereco', 'telefone', 'criadoEm', 'atualizadoEm'],
  Servicos: ['id', 'cliente', 'tipo', 'data', 'inicio', 'fim', 'horas', 'viagens', 'valor', 'total', 'reciboId', 'clienteId', 'criadoEm', 'atualizadoEm'],
  Recibos: ['id', 'cliente', 'data', 'total', 'pago', 'pagoEm', 'clienteId', 'endereco', 'servicoIds', 'linhas', 'empresa', 'criadoEm', 'atualizadoEm'],
  Config: ['id', 'empresa', 'cnpj', 'assinatura', 'cpf', 'cidade', 'precoRetro', 'precoCaminhao', 'atualizadoEm']
};
// nome da tabela no app -> aba
const ABA = { clientes: 'Clientes', servicos: 'Servicos', recibos: 'Recibos', config: 'Config' };
const NUMEROS = ['horas', 'viagens', 'valor', 'total', 'precoRetro', 'precoCaminhao'];
const JSONS = ['servicoIds', 'linhas', 'empresa'];
const BOOLS = ['pago'];

function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABELAS).forEach(nome => {
    let sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    const cab = TABELAS[nome];
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#f2b705');
    sh.setFrozenRows(1);
    cab.forEach((c, i) => {
      const col = sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1);
      col.setNumberFormat(NUMEROS.indexOf(c) >= 0 ? '#,##0.00' : '@');
    });
  });
  const props = PropertiesService.getScriptProperties();
  let codigo = props.getProperty('CODIGO');
  if (!codigo) {
    codigo = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    props.setProperty('CODIGO', codigo);
  }
  Logger.log('CÓDIGO DE ACESSO DO APP: ' + codigo);
  return codigo;
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function autorizado(codigo) {
  const certo = PropertiesService.getScriptProperties().getProperty('CODIGO');
  return certo && codigo === certo;
}

function doGet(e) {
  if (!autorizado(e.parameter.codigo)) return responder({ ok: false, erro: 'codigo' });
  return responder({ ok: true, dados: lerTudo() });
}

function doPost(e) {
  let corpo;
  try { corpo = JSON.parse(e.postData.contents); } catch (err) { return responder({ ok: false, erro: 'formato' }); }
  if (!autorizado(corpo.codigo)) return responder({ ok: false, erro: 'codigo' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    (corpo.ops || []).forEach(aplicar);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return responder({ ok: true, dados: lerTudo() });
}

function aba(tabela) {
  const nome = ABA[tabela];
  if (!nome) throw new Error('tabela desconhecida: ' + tabela);
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
}

function linhaDoId(sh, id) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return -1;
  const ids = sh.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function aplicar(op) {
  const sh = aba(op.tabela);
  const cab = TABELAS[ABA[op.tabela]];
  const linha = linhaDoId(sh, op.id);
  if (op.tipo === 'apagar') {
    if (linha > 0) sh.deleteRow(linha);
    return;
  }
  const r = op.registro || {};
  const valores = cab.map(c => {
    const v = c === 'id' ? op.id : r[c];
    if (v === undefined || v === null) return '';
    if (JSONS.indexOf(c) >= 0) return JSON.stringify(v);
    if (BOOLS.indexOf(c) >= 0) return v ? 'sim' : 'não';
    return v;
  });
  if (linha > 0) sh.getRange(linha, 1, 1, cab.length).setValues([valores]);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, cab.length).setValues([valores]);
}

function lerTudo() {
  const out = {};
  Object.keys(ABA).forEach(t => {
    const sh = aba(t), cab = TABELAS[ABA[t]];
    const n = sh.getLastRow() - 1;
    out[t] = {};
    if (n < 1) return;
    const fuso = Session.getScriptTimeZone();
    sh.getRange(2, 1, n, cab.length).getValues().forEach(row => {
      if (!row[0]) return;
      const o = {};
      cab.forEach((c, i) => {
        let v = row[i];
        if (v instanceof Date) v = Utilities.formatDate(v, fuso, (c === 'inicio' || c === 'fim') ? 'HH:mm' : 'yyyy-MM-dd');
        if (NUMEROS.indexOf(c) >= 0) v = typeof v === 'number' ? v : (Number(String(v).replace(',', '.')) || 0);
        else if (JSONS.indexOf(c) >= 0) { try { v = v ? JSON.parse(v) : null; } catch (e) { v = null; } }
        else if (BOOLS.indexOf(c) >= 0) v = v === true || v === 'sim' || v === 'TRUE' || v === 'true';
        else v = String(v);
        o[c] = v;
      });
      out[t][o.id] = o;
    });
  });
  return out;
}
