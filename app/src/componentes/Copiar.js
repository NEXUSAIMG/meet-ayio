'use client';
import { useState } from 'react';

export function Copiar({ texto, rotulo = 'Copiar link', className = 'btn-secundario' }) {
  const [ok, setOk] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = document.createElement('textarea');
      t.value = texto; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setOk(true);
    setTimeout(() => setOk(false), 2000);
  }
  return <button type="button" onClick={copiar} className={className}>{ok ? 'Copiado!' : rotulo}</button>;
}
