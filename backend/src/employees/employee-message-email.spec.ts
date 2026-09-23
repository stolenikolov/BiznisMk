import { describe, expect, it } from 'vitest';
import { renderEmployeeMessage } from './employee-message-email.js';

const input = {
  companyName: 'DevShop',
  senderName: 'Столе Николов',
  replyTarget: 'Столе Николов',
  subject: 'Собир во петок',
  body: 'Здраво на сите,\n\nВо петок во 16:00 имаме собир.\nДонесете лаптопи.\n\n\nПоздрав',
};

describe('renderEmployeeMessage', () => {
  it('keeps the text as written and signs it with who sent it and where replies go', () => {
    const email = renderEmployeeMessage(input);

    expect(email.subject).toBe('Собир во петок');
    expect(email.text.split('\n')).toEqual([
      'Здраво на сите,',
      '',
      'Во петок во 16:00 имаме собир.',
      'Донесете лаптопи.',
      '',
      'Поздрав',
      '',
      '— Столе Николов, DevShop',
      '',
      'Ако одговориш на овој мејл, одговорот стигнува до Столе Николов.',
    ]);
  });

  it('names the company’s own reply address when replies do not go to the sender', () => {
    const { text } = renderEmployeeMessage({ ...input, replyTarget: 'info@devshop.mk' });

    expect(text).toContain('— Столе Николов, DevShop');
    expect(text).toContain('одговорот стигнува до info@devshop.mk.');
  });

  it('turns blank lines into paragraphs and single line breaks into <br>', () => {
    const { html } = renderEmployeeMessage({ ...input, body: 'Прв ред\r\nвтор ред\r\n\r\nНов пасус' });

    expect(html).toContain('>Прв ред<br>втор ред</p>');
    expect(html).toContain('>Нов пасус</p>');
  });

  it('escapes everything a person typed', () => {
    const { html } = renderEmployeeMessage({
      companyName: 'A & B',
      senderName: '<b>Шеф</b>',
      replyTarget: '<b>Шеф</b>',
      subject: 'Plata <script>',
      body: '<img src=x onerror=alert(1)> "цитат"',
    });

    expect(html).not.toMatch(/<script>|<img|<b>/);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &quot;цитат&quot;');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('<title>Plata &lt;script&gt;</title>');
  });
});
