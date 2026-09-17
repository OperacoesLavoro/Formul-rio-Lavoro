import { HttpError } from '../utils/http.mjs';
import { cnpjValido } from './submission-validation.mjs';

const TIMEOUT_MS = 7000;

const somenteDigitos = valor => String(valor || '').replace(/\D/g, '');
const limpar = valor => String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();

function comporLogradouro(tipo, via, numero) {
  let nome = limpar(via);
  const num = limpar(numero);
  const semNumero = /^S\/?N$/i.test(num);

  if (num && !semNumero) {
    const escapado = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    nome = nome.replace(new RegExp('[,\\s]+' + escapado + '$'), '').trim();
  }

  let tipoVia = limpar(tipo);
  if (tipoVia && new RegExp('(^|\\s)' + tipoVia.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'i').test(nome)) {
    tipoVia = '';
  }

  const cabeca = [tipoVia, nome].filter(Boolean).join(' ').trim();
  const cauda = !num ? '' : (semNumero ? 's/n' : num);
  return [cabeca, cauda].filter(Boolean).join(', ');
}

function montarEndereco(dados) {
  const via = comporLogradouro(dados.tipo, dados.logradouro, dados.numero);
  const cep = somenteDigitos(dados.cep);
  return [
    [via, limpar(dados.complemento)].filter(Boolean).join(' — '),
    limpar(dados.bairro),
    [limpar(dados.municipio), limpar(dados.uf)].filter(Boolean).join('/'),
    cep.length === 8 ? 'CEP ' + cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : ''
  ].filter(Boolean).join(' — ');
}

function lerEsquemaPlano(dados) {
  return {
    razao: limpar(dados.razao_social) || limpar(dados.nome_fantasia),
    fantasia: limpar(dados.nome_fantasia),
    situacao: limpar(dados.descricao_situacao_cadastral),
    endereco: montarEndereco({
      tipo: dados.descricao_tipo_de_logradouro,
      logradouro: dados.logradouro,
      numero: dados.numero,
      complemento: dados.complemento,
      bairro: dados.bairro,
      municipio: dados.municipio,
      uf: dados.uf,
      cep: dados.cep
    })
  };
}

function lerCnpjWs(dados) {
  const estabelecimento = dados.estabelecimento || {};
  return {
    razao: limpar(dados.razao_social),
    fantasia: limpar(estabelecimento.nome_fantasia),
    situacao: limpar(estabelecimento.situacao_cadastral),
    endereco: montarEndereco({
      tipo: estabelecimento.tipo_logradouro,
      logradouro: estabelecimento.logradouro,
      numero: estabelecimento.numero,
      complemento: estabelecimento.complemento,
      bairro: estabelecimento.bairro,
      municipio: estabelecimento.cidade?.nome,
      uf: estabelecimento.estado?.sigla,
      cep: estabelecimento.cep
    })
  };
}

const provedores = [
  { url: cnpj => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, ler: lerEsquemaPlano },
  { url: cnpj => `https://minhareceita.org/${cnpj}`, ler: lerEsquemaPlano },
  { url: cnpj => `https://publica.cnpj.ws/cnpj/${cnpj}`, ler: lerCnpjWs }
];

async function consultarProvedor(provedor, cnpj) {
  let response;
  try {
    response = await fetch(provedor.url(cnpj), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (error) {
    return { tipo: error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'indisponivel' };
  }

  if (response.status === 404) return { tipo: 'nao_encontrado' };
  if (!response.ok) return { tipo: response.status === 429 ? 'limite' : 'indisponivel' };

  try {
    const dados = provedor.ler(await response.json());
    if (!dados.razao) return { tipo: 'indisponivel' };
    return { tipo: 'sucesso', dados };
  } catch {
    return { tipo: 'indisponivel' };
  }
}

export async function consultarCnpj(valor) {
  const cnpj = somenteDigitos(valor);
  if (!cnpjValido(cnpj)) {
    throw new HttpError(400, 'Informe um CNPJ válido. Confira os dígitos informados.');
  }

  const resultados = [];
  for (const provedor of provedores) {
    const resultado = await consultarProvedor(provedor, cnpj);
    resultados.push(resultado.tipo);
    if (resultado.tipo === 'sucesso') return resultado.dados;
  }

  if (resultados.every(tipo => tipo === 'nao_encontrado')) {
    throw new HttpError(404, 'CNPJ não encontrado nas bases públicas consultadas.');
  }
  throw new HttpError(503, 'Não foi possível confirmar o CNPJ nas bases públicas agora. Tente novamente em instantes.');
}

export async function confirmarCnpjsDoFormulario(formulario, habilitado = true) {
  if (!habilitado) return;
  const consultas = [];
  if (formulario?.autor?.tipo === 'Pessoa jurídica') {
    consultas.push({ rotulo: 'autor', documento: formulario.autor.documento });
  }
  consultas.push({ rotulo: 'réu', documento: formulario?.reu?.documento });

  await Promise.all(consultas.map(async consulta => {
    try {
      await consultarCnpj(consulta.documento);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        throw new HttpError(400, `O CNPJ do ${consulta.rotulo} não foi localizado nas bases públicas. Confira o número informado.`);
      }
      if (error instanceof HttpError && error.status === 400) throw error;
      // Falha de provedor não bloqueia a operação: o time realiza a conferência manual.
      // Nenhum CNPJ ou dado pessoal é registrado.
      console.warn(JSON.stringify({ evento: 'cnpj_validation_unavailable', parte: consulta.rotulo }));
    }
  }));
}
