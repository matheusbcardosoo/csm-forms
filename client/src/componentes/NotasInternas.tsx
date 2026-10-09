// Lembretes de desenvolvimento dentro das telas. Os códigos de requisito
// (RF-…/RNF-…) e as notas sobre regras do projeto são para quem mantém o
// sistema, não para a equipe da secretaria: só o papel admin os enxerga.
// A tela em si continua aparecendo para todos os papéis que já a viam.
import type { ReactNode } from 'react';
import { useSessao } from '@/hooks/useSessao';
import { Aviso } from '@/componentes/ui';

/** Código de requisito no meio de um texto — some para quem não é admin. */
export function Req({ id }: { id: string }) {
  const { ehAdmin } = useSessao();
  return ehAdmin ? <> <span className="req-codigo" title="Requisito do projeto — visível só para administradores">({id})</span></> : null;
}

/** Aviso inteiro voltado ao desenvolvimento — só admin vê. */
export function NotaInterna({ tipo = 'info', children }: { tipo?: 'info' | 'aviso'; children: ReactNode }) {
  const { ehAdmin } = useSessao();
  if (!ehAdmin) return null;
  return (
    <div className="nota-interna">
      <span className="nota-interna-rotulo">Nota interna · só administradores veem</span>
      <Aviso tipo={tipo}>{children}</Aviso>
    </div>
  );
}

/** Faixa das telas cujo fluxo ainda está em desenvolvimento — todos veem. */
export function AvisoEmDesenvolvimento({ funcao }: { funcao: string }) {
  return (
    <div className="aviso-em-desenvolvimento" role="note">
      <Aviso tipo="aviso">
        <b>{funcao} ainda está em desenvolvimento.</b> Esta função não está pronta para uso:
        por enquanto, <b>evite criar, editar ou emitir documentos aqui</b> — dados lançados agora podem
        atrapalhar os testes e precisar ser refeitos. Avisaremos quando estiver liberada.
      </Aviso>
    </div>
  );
}
