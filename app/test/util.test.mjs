import test from 'node:test';
import assert from 'node:assert';
import {
  gerarCodigo, codigoValido, salaDoCodigo, caminhoSeguro, lerEmails, gerarIcs, lerDataLocal, formatarDataHora, escaparHtml, sha256,
} from '../src/lib/util.mjs';

test('código da reunião: formato abc-defg-hij, sem letras ambíguas, sala com prefixo m-', () => {
  for (let i = 0; i < 200; i++) {
    const c = gerarCodigo();
    assert.ok(codigoValido(c), c);
    assert.doesNotMatch(c, /[ilo]/);
  }
  assert.strictEqual(salaDoCodigo('abc-defg-hij'), 'm-abc-defg-hij');
  assert.match(salaDoCodigo('abc-defg-hij'), /^[a-z0-9][a-z0-9-]{3,63}$/, 'aceito pela API');
  for (const ruim of ['ABC-DEFG-HIJ', 'abc-defg-hi', 'abcdefghij', '../x', '', null]) assert.ok(!codigoValido(ruim));
});

test('caminhoSeguro só aceita caminho interno', () => {
  assert.strictEqual(caminhoSeguro('/r/abc-defg-hij'), '/r/abc-defg-hij');
  for (const ruim of ['https://mal.com', '//mal.com', '/\\mal.com', 'javascript:alert(1)', undefined, 'x'.repeat(10)]) {
    assert.strictEqual(caminhoSeguro(ruim), '/reunioes', String(ruim));
  }
});

test('lerEmails separa válidos, inválidos e repetidos', () => {
  const r = lerEmails('Ana@Ex.com; bia@ex.com.br\nana@ex.com, ruim@, ok@dominio.org');
  assert.deepStrictEqual(r.validos, ['ana@ex.com', 'bia@ex.com.br', 'ok@dominio.org']);
  assert.deepStrictEqual(r.invalidos, ['ruim@']);
  assert.strictEqual(lerEmails(Array.from({ length: 60 }, (_, i) => `p${i}@x.com`).join(',')).excedeu, true);
});

test('lerDataLocal usa o fuso do navegador (getTimezoneOffset)', () => {
  // 20/10/2026 15:00 em Brasília (UTC-3, offset 180) = 18:00 UTC
  assert.strictEqual(lerDataLocal('2026-10-20T15:00', 180).toISOString(), '2026-10-20T18:00:00.000Z');
  assert.strictEqual(lerDataLocal('2026-10-20T15:00', -60).toISOString(), '2026-10-20T14:00:00.000Z');
  assert.strictEqual(lerDataLocal('20/10/2026', 180), null);
  assert.strictEqual(lerDataLocal('2026-10-20T15:00', NaN), null);
  assert.strictEqual(formatarDataHora('2026-10-20T18:00:00Z'), '20/10/2026, 15:00');
});

test('convite .ics: campos, escape e linhas de no máximo 75 octetos', () => {
  const ics = gerarIcs({
    uid: 'r1@meet-ayio', inicio: '2026-10-20T18:00:00Z', duracaoMin: 90,
    titulo: 'Alinhamento; contrato, versão final com título bem comprido para forçar a dobra da linha do arquivo',
    descricao: 'Linha 1\nLinha 2', url: 'https://app/r/abc-defg-hij',
    organizador: { nome: 'Márcio Góes', email: 'm@ex.com' }, convidados: ['a@ex.com', 'b@ex.com'], agora: new Date('2026-10-16T12:00:00Z'),
  });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /METHOD:REQUEST/);
  assert.match(ics, /DTSTART:20261020T180000Z/);
  assert.match(ics, /DTEND:20261020T193000Z/);
  assert.match(ics, /DESCRIPTION:Linha 1\\nLinha 2/);
  assert.match(ics, /SUMMARY:Alinhamento\\; contrato\\,/);
  assert.match(ics.replace(/\r\n /g, ''), /ATTENDEE;.*mailto:b@ex\.com/);
  for (const linha of ics.split('\r\n')) assert.ok(Buffer.byteLength(linha) <= 75, `linha longa: ${linha}`);
  const cancel = gerarIcs({ uid: 'r1', inicio: new Date(), titulo: 't', url: 'u', organizador: { email: 'm@ex.com' }, cancelado: true, sequencia: 1 });
  assert.match(cancel, /METHOD:CANCEL/);
  assert.match(cancel, /STATUS:CANCELLED/);
  assert.match(cancel, /SEQUENCE:1/);
});

test('escaparHtml e sha256', () => {
  assert.strictEqual(escaparHtml('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  assert.strictEqual(sha256('abc').length, 64);
});
