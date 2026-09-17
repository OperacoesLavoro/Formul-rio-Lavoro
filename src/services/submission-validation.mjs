import { HttpError } from '../utils/http.mjs';

const somenteDigitos = valor => String(valor || '').replace(/\D/g, '');

function digitoCnpj(base, pesos) {
  const soma = pesos.reduce((total, peso, indice) => total + Number(base[indice]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor) {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const primeiro = digitoCnpj(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoCnpj(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(cnpj[12]) === primeiro && Number(cnpj[13]) === segundo;
}

export function cpfValido(valor) {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calcular = tamanho => {
    let soma = 0;
    for (let indice = 0; indice < tamanho; indice += 1) soma += Number(cpf[indice]) * (tamanho + 1 - indice);
    const digito = 11 - (soma % 11);
    return digito >= 10 ? 0 : digito;
  };
  return Number(cpf[9]) === calcular(9) && Number(cpf[10]) === calcular(10);
}

export function validarDocumentosFormulario(envelope) {
  const formulario = envelope?.formulario;
  const autor = formulario?.autor;
  const reu = formulario?.reu;
  if (!autor || !reu) throw new HttpError(400, 'Informe os dados do autor e do réu.');

  if (autor.tipo !== 'Pessoa jurídica' && autor.tipo !== 'Pessoa física') {
    throw new HttpError(400, 'Informe se o autor é pessoa física ou jurídica.');
  }
  const autorPessoaJuridica = autor.tipo === 'Pessoa jurídica';
  if (autorPessoaJuridica && !cnpjValido(autor.documento)) {
    throw new HttpError(400, 'Informe um CNPJ válido para o autor.');
  }
  if (!autorPessoaJuridica && !cpfValido(autor.documento)) {
    throw new HttpError(400, 'Informe um CPF válido para o autor.');
  }
  if (!cnpjValido(reu.documento)) {
    throw new HttpError(400, 'Informe um CNPJ válido para o réu.');
  }
  if (autorPessoaJuridica && somenteDigitos(autor.documento) === somenteDigitos(reu.documento)) {
    throw new HttpError(400, 'O CNPJ do réu deve ser diferente do CNPJ do autor.');
  }
}
