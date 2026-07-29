/**
 * PIX Engine — Gerador de Payload EMV BR Code
 * ============================================
 * Padrão Banco Central do Brasil
 * Suporta: Email, CPF, CNPJ, Telefone, Chave Aleatória (EVP)
 *
 * Uso:
 *   import { gerarPayload, validarChave, T, tiposChave } from './pix-engine.js'
 *   const { payload, chave } = gerarPayload('email', 'user@bank.com', 10.50, 'Loja', 'SP', '***')
 */

/* ─── CONSTANTES ─────────────────────────────────────────── */

/** Mapeamento de campo EMV → nome legível */
const EMV_MAP = {
  '00': 'FormatIndicator',
  '26': 'MerchantAccount',
  '52': 'MCC',
  '53': 'Currency',
  '54': 'Amount',
  '58': 'Country',
  '59': 'MerchantName',
  '60': 'City',
  '62': 'AdditionalData',
  '63': 'CRC16',
}

/** Rótulos dos tipos de chave */
const TLBL = {
  email: 'E-mail',
  cpf: 'CPF',
  cnpj: 'CNPJ',
  telefone: 'Telefone',
  aleatoria: 'Chave aleatória (EVP)',
}

/** Lista de tipos disponíveis */
const tiposChave = Object.keys(TLBL)

/* ─── VALIDAÇÃO E NORMALIZAÇÃO POR TIPO ──────────────────── */

const T = {
  email: {
    lbl: 'E-mail',
    ph: 'seuemail@banco.com',
    hint: 'E-mail cadastrado no banco como chave PIX.',
    im: 'email',
    mask: null,
    val(v) {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
      return ok ? { ok: 1, m: 'E-mail válido' } : { ok: 0, m: 'E-mail inválido' }
    },
    norm(v) { return v.trim().toLowerCase() },
  },

  cpf: {
    lbl: 'CPF',
    ph: '000.000.000-00',
    hint: 'Somente números — 11 dígitos. Pontue ou não.',
    im: 'numeric',
    mask: mCPF,
    val(v) {
      const d = v.replace(/\D/g, '')
      if (d.length !== 11) return { ok: 0, m: `${d.length}/11 dígitos` }
      if (/^(\d)\1+$/.test(d)) return { ok: 0, m: 'CPF inválido (sequência)' }
      let s = 0; for (let i = 0; i < 9; i++) s += +d[i] * (10 - i)
      let r = (s * 10) % 11; if (r >= 10) r = 0; if (r !== +d[9]) return { ok: 0, m: 'CPF inválido (dígito)' }
      s = 0; for (let i = 0; i < 10; i++) s += +d[i] * (11 - i)
      r = (s * 10) % 11; if (r >= 10) r = 0; if (r !== +d[10]) return { ok: 0, m: 'CPF inválido (dígito)' }
      return { ok: 1, m: 'CPF válido' }
    },
    norm(v) { return v.replace(/\D/g, '') },
  },

  cnpj: {
    lbl: 'CNPJ',
    ph: '00.000.000/0001-00',
    hint: 'Somente números — 14 dígitos. Pontue ou não.',
    im: 'numeric',
    mask: mCNPJ,
    val(v) {
      const d = v.replace(/\D/g, '')
      if (d.length !== 14) return { ok: 0, m: `${d.length}/14 dígitos` }
      if (/^(\d)\1+$/.test(d)) return { ok: 0, m: 'CNPJ inválido (sequência)' }
      const calc = (s, l) => {
        let x = 0, p = l - 7
        for (let i = l; i >= 1; i--) { x += +s.charAt(l - i) * p--; if (p < 2) p = 9 }
        return x % 11 < 2 ? 0 : 11 - (x % 11)
      }
      if (calc(d, 12) !== +d[12] || calc(d, 13) !== +d[13]) return { ok: 0, m: 'CNPJ inválido (dígito)' }
      return { ok: 1, m: 'CNPJ válido' }
    },
    norm(v) { return v.replace(/\D/g, '') },
  },

  telefone: {
    lbl: 'Telefone',
    ph: '+55 (11) 99999-9999',
    hint: 'Código do país obrigatório: +55 + DDD + número.',
    im: 'tel',
    mask: mTel,
    val(v) {
      const d = v.replace(/\D/g, '')
      if (!d.startsWith('55')) return { ok: 0, m: 'Deve iniciar com +55' }
      if (d.length < 12 || d.length > 13) return { ok: 0, m: `${d.length} dígitos — esperado 12 ou 13` }
      return { ok: 1, m: 'Telefone válido' }
    },
    norm(v) { return '+' + v.replace(/\D/g, '') },
  },

  aleatoria: {
    lbl: 'Chave aleatória (EVP)',
    ph: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    hint: 'Chave UUID gerada pelo banco. Cole exatamente como fornecida.',
    im: 'text',
    mask: null,
    val(v) {
      const t = v.trim()
      if (!t) return { ok: 0, m: 'Obrigatório' }
      const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)
      return ok ? { ok: 1, m: 'Chave UUID válida' } : { ok: 0, m: 'Formato inválido (esperado UUID)' }
    },
    norm(v) { return v.trim().toLowerCase() },
  },
}

/* ─── MÁSCARAS DE FORMATAÇÃO ─────────────────────────────── */

function mCPF(v) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return d.slice(0, 3) + '.' + d.slice(3)
  if (d.length <= 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6)
  return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9)
}

function mCNPJ(v) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return d.slice(0, 2) + '.' + d.slice(2)
  if (d.length <= 8) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5)
  if (d.length <= 12) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8)
  return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12)
}

function mTel(v) {
  let d = v.replace(/[^\d+]/g, '')
  if (!d.startsWith('+')) d = '+' + d.replace(/\+/g, '')
  const n = d.slice(1).replace(/\D/g, '').slice(0, 13)
  if (n.length <= 2) return '+' + n
  if (n.length <= 4) return '+' + n.slice(0, 2) + ' (' + n.slice(2)
  if (n.length <= 9) return '+' + n.slice(0, 2) + ' (' + n.slice(2, 4) + ') ' + n.slice(4)
  const cel = n.length > 12
  const meio = cel ? n.slice(4, 9) : n.slice(4, 8)
  const fim = cel ? n.slice(9) : n.slice(8)
  return '+' + n.slice(0, 2) + ' (' + n.slice(2, 4) + ') ' + meio + (fim ? '-' + fim : '')
}

/* ─── NORMALIZAÇÃO ────────────────────────────────────────── */

/**
 * Normaliza string para o formato exigido pelo payload EMV:
 * uppercase, sem acentos, apenas A-Z 0-9 e espaços
 */
function norm(str, max) {
  let s = (str || '').toUpperCase().trim()
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '')
  s = s.replace(/[^A-Z0-9 ]/g, '')
  return s.slice(0, max)
}

/* ─── EMV PAYLOAD BUILDER ────────────────────────────────── */

/** Cria um campo EMV: ID (2) + tamanho (2) + valor */
function fld(id, val) {
  return id + String(val.length).padStart(2, '0') + val
}

/**
 * CRC16-CCITT customizado para payload EMV
 * Polinômio: 0x1021, valor inicial: 0xFFFF
 */
function crc16(str) {
  const b = new TextEncoder().encode(str)
  let c = 0xFFFF
  for (const x of b) {
    c ^= (x << 8)
    for (let i = 0; i < 8; i++) {
      c = (c & 0x8000) ? ((c << 1) ^ 0x1021) : (c << 1)
      c &= 0xFFFF
    }
  }
  return c.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Gera payload EMV BR Code completo
 * @param {string} tipo - Tipo de chave ('email'|'cpf'|'cnpj'|'telefone'|'aleatoria')
 * @param {string} chaveRaw - Valor da chave PIX
 * @param {number} valor - Valor da cobrança
 * @param {string} nome - Nome do recebedor
 * @param {string} cidade - Cidade do recebedor
 * @param {string} [txid='***'] - TxID (opcional)
 * @returns {{ payload: string, chave: string, nomeN: string, cidN: string }}
 */
function gerarPayload(tipo, chaveRaw, valor, nome, cidade, txid) {
  const t = T[tipo]
  if (!t) throw new Error(`Tipo de chave inválido: ${tipo}`)

  const chave = t.norm(chaveRaw)
  const nomeN = norm(nome || 'LOJA', 25)
  const cidN = norm(cidade || 'BRASIL', 15)
  const valS = parseFloat(valor).toFixed(2)
  const txS = (txid || '***').trim()

  const mi = fld('26', fld('00', 'br.gov.bcb.pix') + fld('01', chave))
  const ad = fld('62', fld('05', txS))

  const base = [
    fld('00', '01'),
    mi,
    fld('52', '5411'),
    fld('53', '986'),
    fld('54', valS),
    fld('58', 'BR'),
    fld('59', nomeN),
    fld('60', cidN),
    ad,
    '6304',
  ].join('')

  return { payload: base + crc16(base), chave, nomeN, cidN }
}

/**
 * Valida uma chave PIX sem gerar payload
 * @param {string} tipo - Tipo de chave
 * @param {string} valor - Valor da chave
 * @returns {{ ok: number, m: string }}
 */
function validarChave(tipo, valor) {
  const t = T[tipo]
  if (!t) return { ok: 0, m: 'Tipo inválido' }
  return t.val(valor)
}

/**
 * Decodifica payload EMV para formato legível (debug)
 * @param {string} p - Payload EMV completo
 * @returns {string} Texto formatado
 */
function debugEMV(p) {
  let out = '', i = 0
  while (i < p.length - 4) {
    const id = p.slice(i, i + 2)
    const ln = parseInt(p.slice(i + 2, i + 4), 10)
    const val = p.slice(i + 4, i + 4 + ln)
    out += `[${id}] ${(EMV_MAP[id] || id).padEnd(18)} len=${String(ln).padStart(2, '0')}  "${val}"\n`
    i += 4 + ln
  }
  out += `[63] CRC16               len=04  "${p.slice(-4)}"`
  return out
}

/**
 * Formata valor monetário para real (BRL)
 */
function fmt(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Gera QR Code a partir do payload (retorna Data URL)
 * @param {string} payload - Payload EMV
 * @returns {Promise<string>} Data URL da imagem PNG
 */
function gerarQRCode(payload) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof QRCode === 'undefined') {
        reject(new Error('QRCode.js não carregado'))
        return
      }
      const container = document.createElement('div')
      container.style.cssText = 'position:absolute;left:-9999px;top:0'
      document.body.appendChild(container)

      new QRCode(container, {
        text: payload,
        width: 320,
        height: 320,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L,
      })

      setTimeout(() => {
        try {
          const canvas = container.querySelector('canvas')
          if (canvas) {
            resolve(canvas.toDataURL('image/png'))
          } else {
            reject(new Error('Canvas não encontrado no QR Code'))
          }
        } catch (e) {
          reject(e)
        } finally {
          document.body.removeChild(container)
        }
      }, 150)
    } catch (e) {
      reject(e)
    }
  })
}

/* ─── EXPORTS ────────────────────────────────────────────── */

export {
  T,
  TLBL,
  tiposChave,
  EMV_MAP,
  mCPF,
  mCNPJ,
  mTel,
  norm,
  fld,
  crc16,
  gerarPayload,
  validarChave,
  debugEMV,
  fmt,
  gerarQRCode,
}
